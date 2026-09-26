// X-422 — the all_in waiting area processed (src/core/allInIntake.ts, media.allin)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const A = require(path.join(ROOT, 'out/core/allInIntake.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-allin-'));
const inbox = path.join(tmp, 'media_TEST', 'all_in');
const put = (rel, s) => { const f = path.join(tmp, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s || 'x'); return f; };
const cat = put('media_TEST/all_in/cat.png'), clip = put('media_TEST/all_in/clip.mp4'), dog = put('media_TEST/all_in/sub/dog.jpg');
const song = put('media_TEST/all_in/song.mp3'), notes = put('media_TEST/all_in/notes.txt');
put('media_TEST/all_in/_LOG_.md'); put('media_TEST/image/raw/old.png'); put('media_OTHER/all_in/x.png');
const listDir = dir => fs.readdirSync(dir, { withFileTypes: true }).map(e => ({ name: e.name, dir: e.isDirectory() }));
const plan = { model: 'haiku', videoModel: 'gemini-flash', effort: 'low' };

const answers = { 'cat.png': { stage: 'final', sure: true, why: 'a finished poster' }, 'dog.jpg': { stage: 'source', sure: false, why: 'could be a reference' } };
const claude = o => JSON.stringify({ type: 'result', result: JSON.stringify(o), total_cost_usd: 0.004, is_error: false });
let calls, notices, down;
const deps = () => ({
    roots: [tmp], listDir,
    up: async b => (down && down[b]) || '',
    exec: async w => { calls.exec.push(w); const n = path.basename((w.prompt.match(/(\S+\.(?:png|jpe?g|mp4))/) || [])[1] || ''); return w.engine === 'claude' ? { out: claude(answers[n]), stderr: '' } : { out: 'I think {"stage":"semi","sure":true,"why":"a rough cut"}', stderr: '' }; },
    record: async r => { calls.record.push(r); return { file: path.join(tmp, 'media_TEST', 'x', r.stage, path.basename(r.file)), stage: r.stage, base: r.base, id: 'id_' + path.basename(r.file) }; },
    enrich: async (b, id) => { calls.enrich.push(id); return { filled: ['name', 'topic'] }; },
    ask: (t, body) => { notices.push({ t, body }); return 'n1'; }
});
const fresh = () => { calls = { exec: [], record: [], enrich: [] }; notices = []; down = null; };
const by = (r, f) => r.items.find(i => i.file === f);

(async () => {
    console.log('== the scan ==');
    const all = A.scanAllIn([tmp], undefined, { listDir }).map(x => x.file).sort();
    ok('every base, subfolders too, never _LOG_ or a stage folder', JSON.stringify(all) === JSON.stringify([cat, clip, notes, song, dog, path.join(tmp, 'media_OTHER', 'all_in', 'x.png')].sort()));
    ok('one base, named in any case', A.scanAllIn([tmp], 'test', { listDir }).length === 5);
    ok('a root that is not there scans nothing', A.scanAllIn([path.join(tmp, 'nope')], undefined, { listDir }).length === 0);

    console.log('== the judge ==');
    ok('an answer is read out of prose around it', JSON.stringify(A.parseJudge('ok {"stage":"Semi","sure":true,"why":"w"}')) === JSON.stringify({ stage: 'semi', sure: true, why: 'w' }));
    ok('‼️ asset is never a model\'s to give', /not a stage/.test(A.parseJudge('{"stage":"asset","sure":true}').error));
    ok('an answer in single quotes (what a sanitized prompt shows) is read too', A.parseJudge("{'stage':'raw','sure':true,'why':'w'}").stage === 'raw');
    ok('no JSON is an error; a missing sure is not sure', !!A.parseJudge('final').error && A.parseJudge('{"stage":"raw"}').sure === false);
    ok('the prompt names the file and forbids asset', /cat\.png/.test(A.judgePrompt(cat, 'claude')) && /asset is never yours/.test(A.judgePrompt(cat, 'claude')) && /Read tool/.test(A.judgePrompt(cat, 'claude')));

    console.log('== the dry run ==');
    fresh();
    let r = await A.intakeAllIn({ base: 'TEST', apply: false, unsure: 'ask', plan, lang: 'TR' }, deps());
    ok('‼️ nothing looked at, moved, written or asked', calls.exec.length === 0 && calls.record.length === 0 && notices.length === 0 && r.dryRun && /^Dry run/.test(r.lines[0]));
    ok('images and videos wait for their model; audio cannot be seen; a text file is not media',
        r.counts.waiting === 3 && by(r, clip).engine === 'agy' && by(r, cat).engine === 'claude' && by(r, song).action === 'unsure' && by(r, notes).action === 'unknown');

    console.log('== apply ==');
    fresh();
    r = await A.intakeAllIn({ base: 'TEST', apply: true, unsure: 'ask', plan, lang: 'TR' }, deps());
    ok('the sure image and the sure video are filed at the stage they were given', by(r, cat).action === 'filed' && by(r, cat).stage === 'final' && by(r, clip).stage === 'semi' && by(r, cat).id === 'id_cat.png');
    ok('recorded as submitted material with the role of its stage, never starting an engine', calls.record.length === 2
        && calls.record.every(c => c.autoStart === 'never' && c.produced.origin === 'user_submission' && c.produced.productionType === 'all_in')
        && calls.record.find(c => c.file === cat).produced.role === 'final');
    ok('and their form filled', JSON.stringify(calls.enrich) === JSON.stringify(['id_cat.png', 'id_clip.mp4']) && by(r, cat).filled === 2);
    ok('the model and effort come from the plan; claude answers as JSON, agy read-only', calls.exec.find(w => w.engine === 'claude').model === 'haiku'
        && calls.exec.find(w => w.engine === 'claude').json === true && calls.exec.find(w => w.engine === 'agy').readOnly === true && by(r, cat).costUsd === 0.004);
    ok('‼️ a file the model is not sure of stays where it is', by(r, dog).action === 'unsure' && fs.existsSync(dog) && !calls.record.some(c => c.file === dog));
    ok('ask: one question lists what stayed — unsure, unseeable, not media', notices.length === 1 && r.asked === 'n1'
        && [dog, song, notes].every(f => notices[0].body.includes(f)) && !notices[0].body.includes(cat) && /3 file/.test(notices[0].t));
    fresh();
    r = await A.intakeAllIn({ base: 'TEST', apply: true, unsure: 'wait', plan, lang: 'TR' }, deps());
    ok('wait: nobody is asked', notices.length === 0 && !r.asked && r.counts.unsure === 2);

    console.log('== what goes wrong ==');
    fresh();
    down = { TEST: 'not running' };
    r = await A.intakeAllIn({ apply: true, unsure: 'ask', plan, lang: 'TR' }, deps());
    ok('a base whose engine is down is left alone, said; another base is still done', r.down.TEST === 'not running' && r.items.every(i => i.base === 'OTHER')
        && r.lines.some(l => /TEST not answering/.test(l)));
    fresh();
    const bad = deps();
    bad.exec = async () => ({ out: '', stderr: 'boom', error: 'exit 1' });
    r = await A.intakeAllIn({ base: 'TEST', apply: true, unsure: 'wait', plan, lang: 'TR' }, bad);
    ok('a failed model turn files nothing and says why', r.counts.failed === 3 && calls.record.length === 0 && /turn failed/.test(by(r, cat).why));
    const { turnFailure } = require(path.join(ROOT, 'out/core/mediaEnricher.js'));
    const cmd = 'Command failed: agy --model m -p "' + 'x'.repeat(300) + '"';
    ok('‼️ a failed turn says the engine\'s own words, never the echo of its command line',
        turnFailure({ error: cmd, stderr: 'RESOURCE_EXHAUSTED: quota' }) === 'RESOURCE_EXHAUSTED: quota'
        && turnFailure({ error: cmd + '\nboom: model not found' }) === 'boom: model not found'
        && /^Command failed/.test(turnFailure({ error: cmd })) && turnFailure({}, 'error_during_execution') === 'error_during_execution');

    console.log('== the bridge door ==');
    const { BridgeRegistry } = require(path.join(ROOT, 'out/core/bridge.js'));
    const { registerAllInOps } = require(path.join(ROOT, 'out/core/allInOps.js'));
    const reg = new BridgeRegistry();
    const seen = [];
    let setting = '', when = '';
    registerAllInOps(reg, { setting: () => setting, when: () => when, run: async a => { seen.push(a); return { lines: [] }; } });
    when = 'manual';
    const dm = await reg.dispatch('media.allin', { scheduled: true, apply: true });
    ok('‼️ manual: the timed pass is skipped, nothing scanned', dm.ok && dm.result.skipped === true && seen.length === 0 && /Farm Settings/.test(dm.result.whenWhy));
    when = '';
    const dd = await reg.dispatch('media.allin', { scheduled: true });
    ok('daily (the default): the timed pass runs', dd.ok && seen.length === 1);
    seen.length = 0;
    const d0 = await reg.dispatch('media.allin', {});
    ok('‼️ a dry run unless apply is said; unsure defaults to ask', d0.ok && seen[0].apply === false && seen[0].unsure === 'ask' && /built-in/.test(d0.result.unsureWhy));
    setting = 'wait';
    await reg.dispatch('media.allin', {});
    await reg.dispatch('media.allin', { unsure: 'ask', apply: true, base: 'TEST', model: 'sonnet', autoStart: true });
    ok('the setting, then this pass', seen[1].unsure === 'wait' && seen[2].unsure === 'ask' && seen[2].apply === true && seen[2].start === true && seen[2].spec.model === 'sonnet');
    const d3 = await reg.dispatch('media.allin', { unsure: 'guess' });
    const d4 = await reg.dispatch('media.allin', { base: '../x' });
    ok('an unknown unsure and a base that is not a name are refused before it', !d3.ok && !d4.ok && seen.length === 3);
    ok('the op is in the catalog', reg.catalog().some(x => x.op === 'media.allin'));

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\ntest_allin_intake: ${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
})();
