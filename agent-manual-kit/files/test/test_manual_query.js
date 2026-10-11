// X-536 — THE MANUAL'S READER: renderers, search, did-you-mean, and the intents an agent really brings.
//
// manual/intents.eval.json holds requests the way an agent phrases them for
// farm.find, each with the guide or op that must come up. The bar: the right
// answer in the top three for (nearly) all of them, first for most — and an
// off-topic request called weak rather than answered with confidence.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const Q = require(path.join(ROOT, 'out', 'service', 'manualQuery.js'));
const S = require(path.join(ROOT, 'out', 'core', 'manualSource.js'));
const C = require(path.join(ROOT, 'out', 'core', 'manualBuild.js'));

// ---------------------------------------------------------------- the small parts
ok('stem: schedule, schedules, scheduled, scheduling meet',
    new Set(['schedule', 'schedules', 'scheduled', 'scheduling'].map(Q.stem)).size === 1);
ok('stem: running and run meet; stopped and stop meet', Q.stem('running') === Q.stem('run') && Q.stem('stopped') === Q.stem('stop'));
ok('tokens drop stop words and split op names', Q.tokens('Run the tasks.add op').join(' ') === 'run task add');
ok('suggestOps: a near miss in the same namespace is offered first',
    Q.suggestOps(['tasks.add', 'tasks.list', 'tasks.cancel', 'notices.post'], 'tasks.ad')[0] === 'tasks.add');
ok('suggestOps: a wrong namespace with the right verb still finds it',
    Q.suggestOps(['tasks.cancel', 'missions.cancel', 'notices.post'], 'task.cancel').includes('tasks.cancel'));
ok('suggestOps: nothing alike offers nothing', Q.suggestOps(['tasks.add'], 'zebra.paint').length === 0);
ok('renderCard fills the command and version',
    Q.renderCard('A {{VERSION}} B {{AF}} farm.guide', { af: 'node "x"', version: '1.2.3' }) === 'A 1.2.3 B node "x" farm.guide');
ok('isMarkdownAnswer recognises the text form only',
    Q.isMarkdownAnswer({ format: 'markdown', text: 'x' }) && !Q.isMarkdownAnswer({ text: 'x' }) && !Q.isMarkdownAnswer(null));

// ---------------------------------------------------------------- a small manual, by hand
const tiny = {
    schema: 1, version: 't', builtAt: 0, card: 'card {{AF}}', map: '# Map\n<!-- af:areas -->\n<!-- af:playbooks -->',
    docs: [
        { kind: 'area', id: 'tasks', title: 'Tasks', summary: 'one-off runs', keywords: ['job'], intents: [], ops: [], related: [], body: '# Tasks\nRuns.' },
        { kind: 'playbook', id: 'run-task', title: 'Run a task', summary: 'do a job now', area: 'tasks', keywords: ['job'], intents: ['have an agent do a job now'], ops: ['tasks.add'], related: [], body: '## Steps\n1. tasks.add' }
    ],
    ops: [
        { op: 'tasks.add', area: 'tasks', effect: 'run', summary: 'Queue and start one agent run.', describe: 'Queue a task. args: agent, title, prompt' },
        { op: 'tasks.cancel', area: 'tasks', effect: 'destructive', summary: 'Cancel a task.', describe: 'Cancel. args: id' },
        { op: 'farm.ops', area: 'tasks', effect: 'read', summary: 'The catalog.', describe: 'catalog' }
    ]
};
{
    const map = Q.answerManualOp(tiny, 'farm.guide', {});
    ok('farm.guide with no args answers the map as text', map.ok && map.result.format === 'markdown'
        && /\*\*tasks\*\* — one-off runs \(3 ops\)/.test(map.result.text) && /\*\*run-task\*\*/.test(map.result.text));
    const pb = Q.answerManualOp(tiny, 'farm.guide', { id: 'run-task' });
    ok('farm.guide id=<playbook> renders it with the ops it uses and their effects',
        pb.ok && /# Playbook: Run a task/.test(pb.result.text) && /`tasks.add` \[run\]/.test(pb.result.text));
    const area = Q.answerManualOp(tiny, 'farm.guide', { id: 'tasks' });
    ok('farm.guide id=<area> appends every op of the area and its playbooks',
        area.ok && /All ops in this area \(3\)/.test(area.result.text) && /farm.guide id=run-task/.test(area.result.text));
    const asOp = Q.answerManualOp(tiny, 'farm.guide', { id: 'tasks.cancel' });
    ok('farm.guide id=<op> falls through to the op contract', asOp.ok && /# tasks.cancel \[destructive\]/.test(asOp.result.text));
    const none = Q.answerManualOp(tiny, 'farm.guide', { id: 'nope' });
    ok('an unknown guide is refused with the way back to the map', !none.ok && /farm.guide/.test(none.error));
    const idx = Q.answerManualOp(tiny, 'farm.ops', {});
    ok('farm.ops with no args is the compact index, not the dump', idx.ok && /\*\*tasks\*\* \(3\): farm.ops, tasks.add, tasks.cancel/.test(idx.result.text));
    const full = Q.answerManualOp(tiny, 'farm.ops', { full: true });
    ok('farm.ops full=true is the legacy shape: [{op, describe}]', full.ok && Array.isArray(full.result)
        && full.result.length === 3 && full.result.every(r => r.op && typeof r.describe === 'string'));
    const one = Q.answerManualOp(tiny, 'farm.ops', { op: 'tasks.add' });
    ok('farm.ops op=<name> is the full contract with the playbooks that use it',
        one.ok && /Queue a task\. args: agent, title, prompt/.test(one.result.text) && /run-task/.test(one.result.text));
    const typo = Q.answerManualOp(tiny, 'farm.ops', { op: 'tasks.ad' });
    ok('farm.ops op=<typo> is refused with did-you-mean', !typo.ok && /Did you mean tasks.add/.test(typo.error));
    const json = Q.answerManualOp(tiny, 'farm.ops', { area: 'tasks', format: 'json' });
    ok('format=json answers data without the long contract', json.ok && Array.isArray(json.result) && json.result.every(r => !('describe' in r)));
    const f = Q.answerManualOp(tiny, 'farm.find', { q: 'have an agent do a job now' });
    ok('farm.find ranks the playbook first for its own intent', f.ok && /1\. \[playbook\] run-task/.test(f.result.text));
    const exact = Q.findInManual(tiny, 'tasks.cancel');
    ok('an op name typed in full is the first hit', exact.hits[0].id === 'tasks.cancel');
    ok('farm.find without q is refused', !Q.answerManualOp(tiny, 'farm.find', {}).ok);
    ok('any other op is not the reader\'s', Q.answerManualOp(tiny, 'tasks.add', {}) === undefined);
    ok('looksLikeManual accepts a manual and refuses junk', Q.looksLikeManual(tiny) && !Q.looksLikeManual({ schema: 2 }));
}

// ---------------------------------------------------------------- the real manual, against the intents
const src = S.readManualSource(path.join(ROOT, 'manual'));
const metaOps = Object.keys(src.meta).map(op => ({ op, describe: src.meta[op].summary }));
const m = C.compileManual(src, metaOps, 'test').manual;
const cases = JSON.parse(fs.readFileSync(path.join(ROOT, 'manual', 'intents.eval.json'), 'utf8')).cases;
let top1 = 0, top3 = 0;
const misses = [];
for (const c of cases) {
    const ids = Q.findInManual(m, c.q, { limit: 3 }).hits.map(h => h.id);
    if (ids[0] === c.expect) { top1++; }
    if (ids.includes(c.expect)) { top3++; } else { misses.push(`"${c.q}" → wanted ${c.expect}, got ${ids.join(', ')}`); }
}
const r3 = top3 / cases.length, r1 = top1 / cases.length;
ok(`intents: the expected guide or op is in the top 3 for ≥ 95% (${top3}/${cases.length})`, r3 >= 0.95
    || (console.log('  ↳ ' + misses.join('\n  ↳ ')), false));
ok(`intents: …and first for ≥ 80% (${top1}/${cases.length})`, r1 >= 0.8);
ok('an off-topic request is called weak', Q.findInManual(m, 'banana smoothie recipe').weak
    && Q.findInManual(m, 'quantum entanglement of photons').weak);
ok('a real request is not', !Q.findInManual(m, 'every day at 9 run the morning briefing').weak);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
