// X-420 — a run takes its material from a search of the local Airtable
// (src/core/airtableInput.ts · workflowInputs.ts · tasks.ts airtableFirst · extension.ts media.find).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const ROOT = path.resolve(__dirname, '..');
const fakeVscode = {
    EventEmitter: class { constructor() { this.c = []; } get event() { return cb => { this.c.push(cb); return { dispose() { } }; }; } fire(v) { this.c.forEach(cb => cb(v)); } dispose() { } },
    window: {
        showInformationMessage: () => Promise.resolve(), showWarningMessage: () => Promise.resolve(),
        createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }), onDidCloseTerminal: () => ({ dispose() { } })
    }
};
const origLoad = Module._load;
Module._load = function (r, p, m) { return r === 'vscode' ? fakeVscode : origLoad.call(this, r, p, m); };
const A = require(path.join(ROOT, 'out/core/airtableInput.js'));
const WI = require(path.join(ROOT, 'out/core/workflowInputs.js'));
const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); ok(n, s); if (!s) { console.log('    got', JSON.stringify(a), 'want', JSON.stringify(b)); } };

const LIB = path.resolve(os.tmpdir(), 'x420lib');
const at = (...p) => path.join(LIB, ...p);
const rec = (id, name, file, over) => Object.assign({ id, name, topic: '', tags: [], status: 'ready', created_at: '2026-09-20T10:00:00Z',
    media: { type: 'image', file_path: file }, failure: { is_failed: false } }, over || {});
const ITEMS = [
    rec('a1', 'Kedi portresi', at('image', 'final', 'KEDI.png'), { tags: ['kedi', 'portre'] }),
    rec('b1', 'Köpek', at('video', 'asset', 'kopek.mp4'), { media: { type: 'video', file_path: at('video', 'asset', 'kopek.mp4') }, tags: ['köpek'], created_at: '2026-09-22T10:00:00Z' }),
    rec('c1', 'Bozuk kedi', at('image', 'raw', 'bozuk.png'), { failure: { is_failed: true }, status: 'draft', created_at: '2026-09-25T10:00:00Z' }),
    rec('d1', 'Aslan', at('elsewhere', 'aslan.png'), { workflow: { stage: 'final' }, topic: 'büyük KEDİ', created_at: '2026-09-24T10:00:00Z' })
];
const ids = rs => rs.map(r => r.id);

(async () => {
    /* ---------- the search, as saved on the input ---------- */
    ok('no search is a valid search (all defaults)', A.queryRefusal(undefined) === '' && A.queryRefusal({}) === '');
    ok('a list is not a search', /is an object/.test(A.queryRefusal([])));
    ok('an unknown key is named', /has no colour/.test(A.queryRefusal({ colour: 'red' })));
    ok('a stage that is no library folder is refused, naming the ones there are', /has no draft — source, raw, semi, final, asset/.test(A.queryRefusal({ stages: 'final, draft' })));
    ok('kind, success and sort are closed lists', /image \| video \| audio/.test(A.queryRefusal({ kind: 'pdf' })) && /passed \| failed/.test(A.queryRefusal({ success: 'maybe' })) && /newest \| oldest \| name/.test(A.queryRefusal({ sort: 'random' })));
    ok('limit is 1 to 200, whole', [0, 201, 1.5, 'x'].every(l => /1 to 200/.test(A.queryRefusal({ limit: l }))) && A.queryRefusal({ limit: '200' }) === '');
    ok('a base is a plain name, never a path', /plain name/.test(A.queryRefusal({ base: '..\\x' })) && A.queryRefusal({ base: 'TEST' }) === '');
    eq('saved without its blanks', A.cleanQuery({ base: 'TEST', query: ' ', stages: '', limit: undefined, sort: 'name' }), { base: 'TEST', sort: 'name' });
    ok('an all-blank search is no search', A.cleanQuery({ query: '' }) === undefined);

    /* ---------- the flex chain: input over the Farm setting over the built-in ---------- */
    const d0 = A.resolveQuery(undefined);
    eq('built-in: asset + final, 20, newest', [d0.stages, d0.limit, d0.sort], [['asset', 'final'], 20, 'newest']);
    const d1 = A.resolveQuery({}, { stages: 'final', limit: 5, sort: 'oldest' });
    eq('the Farm setting beats the built-in', [d1.stages, d1.limit, d1.sort], [['final'], 5, 'oldest']);
    const d2 = A.resolveQuery({ stages: 'raw', limit: 3, sort: 'name', query: 'kedi' }, { stages: 'final', limit: 5, sort: 'oldest' });
    eq('the input\'s own search beats the setting', [d2.stages, d2.limit, d2.sort, d2.query], [['raw'], 3, 'name', 'kedi']);
    const d3 = A.resolveQuery({ query: 'kedi' }, {}, 'köpek');
    ok('‼️ a run\'s text replaces the saved query, and the why says so', d3.query === 'köpek' && d3.why.includes('query: given by the run'));
    ok('every default explains itself', d0.why.length === 3 && d0.why.every(w => /^(stages|limit|sort): /.test(w)));

    /* ---------- finding ---------- */
    eq('the default search: asset + final, newest first (a stage from the record or from its folder)', ids(A.findRecords(ITEMS, d0)), ['d1', 'b1', 'a1']);
    eq('‼️ every word, Turkish case (KEDİ is kedi), in name, topic, tags', ids(A.findRecords(ITEMS, A.resolveQuery({ query: 'KEDİ' }))), ['d1', 'a1']);
    eq('kind', ids(A.findRecords(ITEMS, A.resolveQuery({ kind: 'video' }))), ['b1']);
    eq('success failed looks in the stage asked', ids(A.findRecords(ITEMS, A.resolveQuery({ stages: 'raw', success: 'failed' }))), ['c1']);
    eq('status', ids(A.findRecords(ITEMS, A.resolveQuery({ stages: 'raw,final,asset', status: 'draft' }))), ['c1']);
    eq('tags: all of them', ids(A.findRecords(ITEMS, A.resolveQuery({ tags: 'kedi, portre' }))), ['a1']);
    eq('the file name is searched too', ids(A.findRecords(ITEMS, A.resolveQuery({ query: 'kopek.mp4' }))), ['b1']);
    eq('sort by name, Turkish order', ids(A.findRecords(ITEMS, A.resolveQuery({ sort: 'name' }))), ['d1', 'a1', 'b1']);
    eq('oldest first', ids(A.findRecords(ITEMS, A.resolveQuery({ sort: 'oldest' }))), ['a1', 'b1', 'd1']);
    eq('limit', ids(A.findRecords(ITEMS, A.resolveQuery({ limit: 1 }))), ['d1']);
    const one = A.findRecords(ITEMS, d0, at('image', 'final', 'kedi.png'));
    eq('‼️ a file is that file\'s record, whatever the search — its case folded the Windows way (KEDI.png is kedi.png)', ids(one), ['a1']);
    eq('what a step is handed', Object.keys(one[0]), ['id', 'file', 'name', 'stage', 'type', 'topic', 'tags', 'status', 'failed']);
    ok('…the stage read off the folder, the path in this machine\'s form', one[0].stage === 'final' && one[0].file === at('image', 'final', 'KEDI.png'));
    ok('a path that is not there is search text', !A.isFileValue(at('none.png'), () => false) && A.isFileValue(at('x.png'), () => true) && !A.isFileValue('kedi', () => true));

    /* ---------- looking up a run's inputs ---------- */
    const listed = [];
    const deps = (over) => Object.assign({
        list: async (base, lang) => { listed.push(base + '/' + lang); return base === 'OFF' ? { down: 'the engine is closed' } : ITEMS; },
        settings: () => ({}), defaultBase: () => 'TEST', lang: () => 'TR', exists: p => p === at('image', 'final', 'kedi.png')
    }, over || {});
    const r1 = await A.lookupInputs([{ name: 'refs', airtable: { query: 'kedi' } }], {}, deps());
    ok('‼️ the value is the JSON list of the records found', ids(JSON.parse(r1.values.refs)).join() === 'd1,a1' && r1.base === 'TEST' && listed[0] === 'TEST/TR');
    ok('one line says what was found, where and why', /^input refs: 2 record\(s\) from TEST — "kedi" · asset\+final · newest · max 20$/.test(r1.lines[0]));
    const r2 = await A.lookupInputs([{ name: 'refs', airtable: { query: 'kedi' } }], { refs: 'köpek' }, deps());
    eq('a run\'s text searches instead', ids(JSON.parse(r2.values.refs)), ['b1']);
    const r3 = await A.lookupInputs([{ name: 'refs' }], { refs: at('image', 'final', 'kedi.png') }, deps());
    ok('‼️ a trigger\'s {file} is that file\'s record', ids(JSON.parse(r3.values.refs)).join() === 'a1' && /the record of kedi\.png$/.test(r3.lines[0]));
    const r4 = await A.lookupInputs([{ name: 'refs' }], {}, deps({ defaultBase: () => '' }));
    ok('no database anywhere: refused, saying where to set one', /input "refs": no database/.test(r4.error));
    const r5 = await A.lookupInputs([{ name: 'refs', airtable: { base: 'OFF' } }], {}, deps());
    ok('an engine that does not answer: refused with its reason', /the OFF engine is not answering — the engine is closed/.test(r5.error));
    const r6 = await A.lookupInputs([{ name: 'a', airtable: { kind: 'video' } }, { name: 'b', airtable: { base: 'TEST2', stages: 'raw' } }], {}, deps({ list: async () => ITEMS }));
    ok('two inputs, each its own search; the first database is the run\'s', r6.lines.length === 2 && r6.base === 'TEST' && ids(JSON.parse(r6.values.b)).join() === 'c1');
    ok('the agent hint names the database and the MCP tools', /"TEST"/.test(A.libraryHint('TEST')) && /airtable_search/.test(A.libraryHint('TEST')));

    /* ---------- the workflow input ---------- */
    const n1 = WI.normalizeInputs([{ name: 'refs', type: 'airtable', airtable: { query: 'kedi', stages: '', sort: 'name' } }]);
    eq('an airtable input is saved with its search, blanks dropped', n1.inputs, [{ name: 'refs', type: 'airtable', airtable: { query: 'kedi', sort: 'name' } }]);
    ok('a bad search is refused at save, by the input\'s name', /refs.*airtable\.stages has no draft/.test(WI.normalizeInputs([{ name: 'refs', type: 'airtable', airtable: { stages: 'draft' } }]).errors.join()));
    const rv = WI.resolveInputs([{ name: 'refs', type: 'airtable', required: true }], {});
    ok('‼️ required does not refuse an airtable input: its search is its value', !(rv.problems || []).length);

    /* ---------- a run: looked up before step 1, walked by a for-each tool step ---------- */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-x420-'));
    const agentDir = path.join(tmp, 'agent'); fs.mkdirSync(agentDir, { recursive: true });
    const calls = [];
    let down = false;
    const mgr = new TaskManager(path.join(tmp, 'c.json'), () => [{ id: 'a1', name: 'yazar', dir: agentDir }], () => false, () => '', {
        quotaCheck: () => 'hold', toolSettings: () => ({ outDir: path.join(tmp, 'o'), overwrite: 'suffix' }),
        runTool: async c => { calls.push(c.input); return { ok: true, recipe: c.recipe, outputs: [path.join(c.outDir, path.basename(c.input))], runs: 1, ms: 1 }; },
        airtableInputs: (ins, given) => A.lookupInputs(ins, given, deps(down ? { defaultBase: () => 'OFF' } : {}))
    });
    const tick = async () => { for (let i = 0; i < 60; i++) { await new Promise(r => setImmediate(r)); } };
    const w = mgr.addWorkflow('Kediler', [
        { id: 's1', agentId: '', agentName: 'tool', title: 'Böl', prompt: '', mode: 'headless', forEach: { list: '{input.refs}', concurrency: 1 }, tool: { recipe: 'split', input: '{item.file}', params: { segmentSec: 10 } } },
        { id: 's2', agentId: 'a1', agentName: 'yazar', title: 'Anlat', prompt: 'bitti: {prev_json.items}', mode: 'headless' }
    ]);
    w.inputs = [{ name: 'refs', type: 'airtable', airtable: { query: 'kedi' } }];
    const runId = mgr.runWorkflow(w);
    await tick();
    eq('‼️ the for-each walked the records found, one tool call per file', calls, [at('elsewhere', 'aslan.png'), at('image', 'final', 'KEDI.png')]);
    const st = mgr.workflowRunState(runId);
    ok('workflows.status says what the input found', st && Array.isArray(st.airtable) && /2 record\(s\) from TEST/.test(st.airtable[0]));
    const next = mgr.tasks.find(t => t.workflowRunId === runId && t.stepIndex === 1);
    ok('‼️ an agent step of such a run is told to look in that database first', next && /Material: this run reads the local Airtable database "TEST"/.test(next.prompt));
    const fresh = new TaskManager(path.join(tmp, 'c.json'), () => [{ id: 'a1', name: 'yazar', dir: agentDir }], () => false, () => '', { quotaCheck: () => 'hold' });
    const kept = fresh.workflowRunState(runId);
    ok('the lookup is persisted with the run: a reload does not search again', kept && /2 record\(s\) from TEST/.test((kept.airtable || []).join()));
    down = true;
    const r7 = mgr.runWorkflow(w);
    await tick();
    const st7 = mgr.workflowRunState(r7);
    ok('‼️ a lookup that fails ends the run before step 1, saying why', st7 && st7.status === 'failed' && /Airtable input: input "refs": the OFF engine is not answering/.test(st7.reason || '') && !mgr.tasks.some(t => t.workflowRunId === r7));

    /* ---------- the host: the op, the settings, the flex points ---------- */
    const ext = fs.readFileSync(path.join(ROOT, 'src/extension.ts'), 'utf8');
    ok('media.find is on the bridge and uses the same search as a run', /op: 'media\.find'/.test(ext) && /findRecords\(items as Record<string, unknown>\[\], r, optStr\(args, 'file'\)\)/.test(ext));
    ok('the run is wired to the same lookup', /airtableInputs: \(ins, given\) => lookupInputs\(ins, given, airtableLookup\)/.test(ext));
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).contributes.configuration;
    const props = Object.assign({}, ...(Array.isArray(pkg) ? pkg : [pkg]).map(c => c.properties));
    ok('three Farm settings', ['airtableInputStages', 'airtableInputLimit', 'airtableInputSort'].every(k => props['agentFarm.' + k]));
    const flex = fs.readFileSync(path.join(ROOT, 'media/afFlex.js'), 'utf8');
    ok('three flex points, each with its setting and the input\'s own box', ['stages', 'limit', 'sort'].every(k => flex.includes(`aqPoint('${k}'`)));

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw', e && e.stack); process.exit(1); });
