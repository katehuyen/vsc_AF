// X-418 — a run's files, filed and recorded from the moment they exist to the run's end
// (src/core/runLibrary.ts · runLibrarySpec.ts, wired in src/core/tasks.ts).
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
const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));
const { MediaRecorder } = require(path.join(ROOT, 'out/core/mediaRecorder.js'));
const RL = require(path.join(ROOT, 'out/core/runLibrary.js'));
const S = require(path.join(ROOT, 'out/core/runLibrarySpec.js'));
const engine = require('./lib_fake_engine');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); ok(n, s); if (!s) { console.log('    got', JSON.stringify(a), 'want', JSON.stringify(b)); } };

/* ---------- the spec: refused by name, saved without blanks, one resolver ---------- */
eq('a clean library is accepted at both levels', [S.libraryRefusal({ base: 'stem', record: 'passed', autoStart: 'ask' }, 'workflow'), S.libraryRefusal({ stage: 'final' }, 'step'), S.libraryRefusal(undefined, 'step')], ['', '', '']);
ok('‼️ all_in as a step stage is refused, saying whose area it is', /waiting area/.test(S.libraryRefusal({ stage: 'all_in' }, 'step')));
ok('a stage at the workflow level is refused — it is a step\'s', /no stage at the workflow level/.test(S.libraryRefusal({ stage: 'raw' }, 'workflow')));
ok('an unknown record / autoStart / a path as a base: refused', /record is all \| passed \| none/.test(S.libraryRefusal({ record: 'some' }, 'workflow'))
    && /ask \| auto \| never/.test(S.libraryRefusal({ autoStart: 'yes' }, 'workflow')) && /not a plain name/.test(S.libraryRefusal({ base: 'a\\b' }, 'step')));
eq('saved without its blanks; nothing = no object', [S.cleanLibrary({ base: 'stem', lang: '' }), S.cleanLibrary({ base: ' ' })], [{ base: 'stem' }, undefined]);
eq('the form round-trips', S.libraryFromDraft(S.librarySeed({ base: 'TEST', stage: 'semi' }, 'step'), 'step'), { base: 'TEST', stage: 'semi' });
eq('…the workflow keys', Object.keys(S.librarySeed(undefined, 'workflow')), ['libBase', 'libLang', 'libStart', 'libRecord', 'libTemplate', 'libMapInput', 'libMapIntermediate', 'libMapFailed', 'libMapRejected', 'libMapFinal', 'libEnWhen', 'libEnScope', 'libEnModel', 'libEnVideo', 'libEnEffort', 'libEnSections', 'libEnCap']);
const MOD = { defaultInstance: 'stem', defaultLang: 'TR', mediaRoots: ['D:/zome/media'] };
const r1 = S.resolveLibrary(undefined, undefined, MOD);
eq('nothing stated: the Airtable page\'s database, every file, start it', [r1.on, r1.base, r1.lang, r1.record, r1.autoStart], [true, 'stem', 'TR', 'all', 'auto']);
ok('…and each value says where it came from', /base: stem — from Farm Settings/.test(r1.why.join('\n')));
const r2 = S.resolveLibrary({ base: 'stem-draft', record: 'passed' }, { base: 'TEST', stage: 'asset' }, MOD);
eq('‼️ step over workflow over the page', [r2.base, r2.record, r2.stage], ['TEST', 'passed', 'asset']);
ok('record none switches it off, said', !S.resolveLibrary({ record: 'none' }, undefined, MOD).on && /off: record is none/.test(S.resolveLibrary({ record: 'none' }, undefined, MOD).why[0]));
/* X-417 — a production's own role → stage mapping */
eq('stages: a role is refused by name', S.libraryRefusal({ stages: { draft: 'raw' } }, 'workflow'), 'library.stages has no role "draft" — input, intermediate, failed, rejected, final');
ok('stages: the waiting area is refused with its reason', /all_in is the user's waiting area/.test(S.libraryRefusal({ stages: { final: 'all_in' } }, 'workflow')));
ok('stages: a step has no mapping of its own', /no stages at the step level/.test(S.libraryRefusal({ stages: { final: 'raw' } }, 'step')));
eq('stages: blanks dropped, an empty map dropped whole', [S.cleanLibrary({ stages: { input: '', final: 'asset' } }), S.cleanLibrary({ stages: { input: '' } })], [{ stages: { final: 'asset' } }, undefined]);
const seedM = S.librarySeed({ base: 'b', stages: { failed: 'semi' } }, 'workflow');
eq('stages: seed → form boxes → back', [seedM.libMapFailed, seedM.libMapFinal, S.libraryFromDraft(seedM, 'workflow')], ['semi', '', { base: 'b', stages: { failed: 'semi' } }]);
const rM = S.resolveLibrary({ stages: { final: 'asset' } }, undefined, MOD);
ok('stages: resolved with its origin, only what is stated', JSON.stringify(rM.stages) === '{"final":"asset"}' && rM.why.some(l => /^stages\.final: asset/.test(l)) && S.resolveLibrary(undefined, undefined, MOD).stages === undefined);
ok('no database anywhere, or no media root: off, said', !S.resolveLibrary(undefined, undefined, { mediaRoots: ['x'] }).on && /no media root/.test(S.resolveLibrary(undefined, undefined, { defaultInstance: 's' }).why[0]));

/* ---------- the wiring in the task manager ---------- */
const tasksSrc = fs.readFileSync(path.join(ROOT, 'src/core/tasks.ts'), 'utf8');
const fnBody = name => { const i = tasksSrc.indexOf(name); return i < 0 ? '' : tasksSrc.slice(i, tasksSrc.indexOf('\n    }\n', i)); };
ok('‼️ a media step files its downloads before the gallery meta is written', /this\.lib!\.produced\(lc, assets/.test(fnBody('private async completeMediaTask(')) && fnBody('private async completeMediaTask(').indexOf('lib!.produced') < fnBody('private async completeMediaTask(').indexOf('.media.json'));
ok('‼️ a vision FAIL sends the file to raw', /this\.lib!\.failed\(failLedger, assetFile, reason\)/.test(fnBody('private async verifyMediaThenAdvance(')));
ok('‼️ what a selection left out goes to raw', /this\.lib\.rejected\(selLedger/.test(tasksSrc));
ok('‼️ the run\'s end promotes and files its inputs', /this\.lib\.ended\(rec\.library, status\)/.test(fnBody('private endWorkflowRun(')));

/* ---------- a real chain: split → concat, and a failing tool ---------- */
(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-runlib-'));
    const media = path.join(tmp, 'media');
    const work = path.join(tmp, 'work');
    fs.mkdirSync(work, { recursive: true });
    const clip = path.join(work, 'clip.mp4');
    fs.writeFileSync(clip, 'SOURCE-CLIP');
    const E = engine();
    const recorder = new MediaRecorder({
        storageDir: path.join(tmp, 'store'),
        store: () => ({ databaseRoots: [], mediaRoots: [media], defaultInstance: 'TEST', defaultLang: 'TR', requestTimeoutMs: 1000 }),
        connect: async () => E, probe: async () => undefined
    });
    const lib = { recorder, module: () => ({ defaultInstance: 'TEST', defaultLang: 'TR', mediaRoots: [media] }) };
    const calls = [];
    const mgr = new TaskManager(path.join(tmp, 'c.json'), () => [], () => false, () => '', {
        quotaCheck: () => 'hold', toolSettings: () => ({ outDir: path.join(tmp, 'o'), overwrite: 'suffix' }), mediaLibrary: lib,
        runTool: async c => {
            calls.push(c);
            fs.mkdirSync(c.outDir, { recursive: true });
            const mk = (n, body) => { const p = path.join(c.outDir, n); fs.writeFileSync(p, body); return p; };
            if (c.recipe === 'split') { return { ok: true, recipe: 'split', outputs: [mk('p1.mp4', 'PART-1'), mk('p2.mp4', 'PART-2')], runs: 2, ms: 5 }; }
            if (c.recipe === 'concat') { return { ok: true, recipe: 'concat', outputs: [mk('merged.mp4', 'MERGED')], runs: 1, ms: 5 }; }
            return { ok: false, recipe: c.recipe, outputs: [mk('half.mp4', 'HALF')], runs: 1, ms: 5, error: 'ffmpeg exited 1' };
        }
    });
    const tick = async (n = 60) => { for (let i = 0; i < n; i++) { await new Promise(r => setImmediate(r)); } };
    const settle = async () => { for (let i = 0; i < 20; i++) { await tick(); await new Promise(r => setTimeout(r, 5)); } };
    const V = st => path.join(media, 'media_TEST', 'video', st);
    try {
        const w = mgr.addWorkflow('Kes ve birleştir', [
            { id: 's1', agentId: '', agentName: 'tool', title: 'Böl', prompt: '', mode: 'headless', tool: { recipe: 'split', input: '{input.clip}', params: { segmentSec: 10 } } },
            { id: 's2', agentId: '', agentName: 'tool', title: 'Birleştir', prompt: '', mode: 'headless', tool: { recipe: 'concat', params: { files: '{prev_json.outputs}' } } }
        ]);
        w.inputs = [{ name: 'clip', type: 'file' }];
        const runId = mgr.runWorkflow(w, { inputs: { clip } });
        await settle();
        ok('‼️ the next step was handed the parts where they are NOW — the library', calls.length === 2 && JSON.stringify(calls[1].params.files) === JSON.stringify([path.join(V('semi'), 'p1.mp4'), path.join(V('semi'), 'p2.mp4')]));
        ok('‼️ the parts are semi, the run\'s last output is final, nothing left where the tool wrote', fs.existsSync(path.join(V('semi'), 'p1.mp4')) && fs.existsSync(path.join(V('final'), 'merged.mp4'))
            && !fs.existsSync(path.join(tmp, 'o', 'merged.mp4')) && !fs.existsSync(path.join(tmp, 'o', 'p1.mp4')));
        ok('‼️ the run input went to source when the run ended', fs.existsSync(path.join(V('source'), 'clip.mp4')) && !fs.existsSync(clip));
        eq('every file has one record: input, two parts, the merge', E.items.size, 4);
        const rc = E.byName('clip.mp4'), p1 = E.byName('p1.mp4'), m = E.byName('merged.mp4');
        eq('…each with its stage in workflow.stage', [rc.workflow.stage, p1.workflow.stage, m.workflow.stage], ['source', 'semi', 'final']);
        ok('‼️ a part names the clip it was cut from, and the clip names its parts', p1.relations.causal.causes[0] === rc.id && rc.relations.causal.effects.length === 2);
        ok('provenance: a tool part is an extraction, the merge a creation, the input a submission', p1.provenance.origin === 'manual_extraction' && m.provenance.origin === 'manual_creation' && rc.provenance.origin === 'user_submission');
        eq('the batch is the run', [p1.batch.batch_id, p1.batch.batch_name, p1.batch.sort_a], [runId, 'Kes ve birleştir', 1]);
        ok('the step archive says where each file went', /Library: p1\.mp4 → TEST\/video\/semi · record media_mp4_/.test(fs.readFileSync(mgr.tasks.find(t => t.workflowRunId === runId && t.stepIndex === 0).outputFile, 'utf8')));
        const rec = mgr.workflowRunState(runId);
        ok('the run ended done', rec && rec.status === 'done');

        const w2 = mgr.addWorkflow('Bozuk', [{ id: 's1', agentId: '', agentName: 'tool', title: 'X', prompt: '', mode: 'headless', tool: { recipe: 'loudnorm', input: path.join(V('source'), 'clip.mp4') } }]);
        const r2 = mgr.runWorkflow(w2);
        await settle();
        const half = E.byName('half.mp4');
        ok('‼️ a failed step\'s file is kept in raw with its Başarı Statüsü', fs.existsSync(path.join(V('raw'), 'half.mp4')) && half && half.failure.is_failed && /ffmpeg exited 1/.test(half.failure.reason) && half.workflow.stage === 'raw');
        ok('…an input already in the library keeps its place', fs.existsSync(path.join(V('source'), 'clip.mp4')) && mgr.workflowRunState(r2).status !== 'running');

        const w3 = mgr.addWorkflow('Kapalı', [{ id: 's1', agentId: '', agentName: 'tool', title: 'Böl', prompt: '', mode: 'headless', tool: { recipe: 'split', input: path.join(V('source'), 'clip.mp4') } }]);
        w3.library = { record: 'none' };
        const before = E.items.size;
        mgr.runWorkflow(w3);
        await settle();
        ok('record: none — the library is off, the files stay where the tool wrote them', fs.existsSync(path.join(tmp, 'o', 'p1.mp4')) && E.items.size === before);

        /* ---------- judge FAIL and a left-out, on the ledger ---------- */
        const run = new RL.RunLibrary(recorder, lib.module, () => undefined);
        const cand = path.join(work, 'cand.png');
        fs.writeFileSync(cand, 'CAND');
        const ctx = { w: { title: 'G', steps: [{ title: 'Üret' }] }, runId: 'r9', stepIndex: 0, taskId: 't1', ledger: [] };
        const made = await run.produced(ctx, [cand], { role: 'candidate', origin: 'AI_generated', productionType: 'fal', model: 'fal-ai/flux', prompt: 'kedi', costUsd: 0.04 });
        const I = st => path.join(media, 'media_TEST', 'image', st);
        eq('a candidate image → semi', made.files, [path.join(I('semi'), 'cand.png')]);
        const failed = await run.failed(ctx.ledger, made.files[0], 'eller eridi');
        const rf = E.byName('cand.png');
        eq('‼️ judge FAIL → raw, the reason kept, the ledger follows', [failed, rf.workflow.stage, rf.failure.reason, ctx.ledger[0].stage], [path.join(I('raw'), 'cand.png'), 'raw', 'eller eridi', 'raw']);
        const left = path.join(work, 'left.png');
        fs.writeFileSync(left, 'LEFT');
        const m2 = await run.produced(ctx, [left], { role: 'candidate', origin: 'AI_generated', productionType: 'fal' });
        await run.rejected(ctx.ledger, m2.files);
        ok('a left-out → raw, said "not selected"', /not selected/.test(E.byName('left.png').failure.reason) && fs.existsSync(path.join(I('raw'), 'left.png')));
        const pinned = await run.produced({ ...ctx, w: { title: 'G', steps: [{ title: 'Anahtar kare', library: { stage: 'asset' } }] } }, [(() => { const p = path.join(work, 'key.png'); fs.writeFileSync(p, 'KEY'); return p; })()], { role: 'intermediate', origin: 'AI_generated', productionType: 'fal' });
        ok('a step that names its stage files there', pinned.files[0] === path.join(I('asset'), 'key.png'));
        await run.ended(ctx.ledger, 'done');
        ok('‼️ …and the run\'s end does not promote it, nor what failed', fs.existsSync(path.join(I('asset'), 'key.png')) && fs.existsSync(path.join(I('raw'), 'cand.png')));

        /* ---------- X-417: the workflow's own stage folders ---------- */
        const mw = { title: 'M', library: { stages: { intermediate: 'raw', failed: 'semi', final: 'asset' } }, steps: [{ title: 'Üret' }] };
        const mctx = { w: mw, runId: 'r10', stepIndex: 0, taskId: 't2', ledger: [] };
        const mk = n => { const p = path.join(work, n); fs.writeFileSync(p, n); return p; };
        const ma = await run.produced(mctx, [mk('m1.png'), mk('m2.png')], { role: 'candidate', origin: 'AI_generated', productionType: 'fal' });
        eq('‼️ a mapped candidate goes to the workflow\'s stage, not semi', ma.files, [path.join(I('raw'), 'm1.png'), path.join(I('raw'), 'm2.png')]);
        eq('…and its entry carries the mapping', mctx.ledger[0].map, { intermediate: 'raw', failed: 'semi', final: 'asset' });
        await run.failed(mctx.ledger, ma.files[1], 'bulanık');
        ok('‼️ a mapped judge FAIL goes to the mapped stage, its role changed', fs.existsSync(path.join(I('semi'), 'm2.png')) && mctx.ledger[1].role === 'failed');
        const mEnd = await run.ended(mctx.ledger, 'done');
        ok('‼️ the run\'s end promotes the passed one to the mapped final, never the failed one', fs.existsSync(path.join(I('asset'), 'm1.png')) && fs.existsSync(path.join(I('semi'), 'm2.png')) && mEnd.some(l => /m1\.png → asset/.test(l)));

        /* ---------- an input the base already has a record of, lying outside its folders ---------- */
        const old = path.join(work, 'old.mp4');
        fs.writeFileSync(old, 'OLD-CLIP');
        const pre = await recorder.record({ file: old, base: 'TEST', lang: 'TR', autoStart: 'auto', inPlace: true, stage: 'raw', produced: { role: 'input', origin: 'user_submission', productionType: 'input' } });
        const octx = { w: { title: 'O', steps: [{ title: 'Oku' }] }, runId: 'r11', stepIndex: 0, taskId: 't3', ledger: [] };
        await run.consumed(octx, [old]);
        const oEnd = await run.ended(octx.ledger, 'done');
        ok('‼️ a recorded input outside the base folders stays where it is — linked, never moved to source', fs.existsSync(old) && !fs.existsSync(path.join(V('source'), 'old.mp4')) && octx.ledger[0].kept === true && octx.ledger[0].id === pre.id && !oEnd.some(l => /old\.mp4/.test(l)));
        eq('…and its record keeps its own stage', E.items.get(pre.id).item.workflow.stage, 'raw');

        /* ---------- a run start checks its engines (X-416) ---------- */
        const seen = [];
        new RL.RunLibrary({ ready: async (b, a) => { seen.push(b + ':' + a); return { down: 'x' }; } }, () => ({ defaultInstance: 'stem', defaultLang: 'TR', mediaRoots: ['x'] }), () => undefined)
            .prepare({ title: 'P', library: { autoStart: 'ask' }, steps: [{ title: 'a' }, { title: 'm', media: {} }, { title: 't', tool: {}, library: { base: 'TEST' } }, { title: 'm2', media: {} }] });
        eq('‼️ a run start checks the engine of every database its media and tool steps file into, once each, with its policy', seen, ['stem:ask', 'TEST:ask']);
        ok('…and the task manager calls it when a run starts', /this\.lib\?\.prepare\(w\);\n        return runId;/.test(tasksSrc));

        /* ---------- a moved file takes the gallery with it ---------- */
        const outDir = path.join(tmp, 'outputs');
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, 't1.media.json'), JSON.stringify({ taskId: 't1', assetFiles: ['D:\\a\\x.png', 'D:\\a\\y.png'] }));
        RL.retargetSidecars(outDir, 'd:/a/y.png', 'D:\\lib\\raw\\y.png');
        eq('the sidecar names the new path', JSON.parse(fs.readFileSync(path.join(outDir, 't1.media.json'), 'utf8')).assetFiles, ['D:\\a\\x.png', 'D:\\lib\\raw\\y.png']);
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw', e && e.stack); process.exit(1); });
