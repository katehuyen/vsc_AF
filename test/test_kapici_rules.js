// X-410 — Kapici core 1: the rule schema refuses by name, call-time options fold
// into the questions, three layers resolve later-wins with the winner recorded,
// a changed file is re-read, and the core imports nothing outside its folder.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const S = require(path.join(ROOT, 'out/core/kapici/schema.js'));
const R = require(path.join(ROOT, 'out/core/kapici/rules.js'));
const B = require(path.join(ROOT, 'out/core/kapici/builtinRules.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const clone = o => JSON.parse(JSON.stringify(o));
const base = () => clone(B.RETRY_NEXT_ACTION);
const refuse = (mut, re) => { const r = base(); mut(r); return re.test(S.ruleRefusal(r)); };

// --- the shipped rules hold
for (const r of B.BUILTIN_RULES) { ok(`builtin ${r.id} passes its own schema`, S.ruleRefusal(r) === ''); }
ok('builtin rules ship dispatch, retry and the trigger precondition', B.BUILTIN_RULES.map(r => r.id).join() === 'dispatch.route,retry.next-action,trigger.has-work');

// --- refusals, each naming the fault
ok('not an object', /is a JSON object/.test(S.ruleRefusal([])));
ok('bad id', refuse(r => { r.id = 'Retry Next'; }, /id is lower-case/));
ok('version from 1', refuse(r => { r.version = 0; }, /version is a whole number/));
ok('description needed', refuse(r => { r.description = ' '; }, /needs a description/));
ok('unknown provider', refuse(r => { r.providers = ['gpt']; }, /providers is a non-empty list of jev \| heuristic \| llm/));
ok('sensitive never goes to jev', refuse(r => { r.sensitive = true; }, /sensitive rule never leaves the machine/));
ok('no questions', refuse(r => { r.questions = {}; }, /at least one/));
ok('bad question type', refuse(r => { r.questions.action.type = 'yesno'; }, /question "action": type is noul \| choice \| score, not "yesno"/));
ok('instructions needed', refuse(r => { r.questions.action.instructions = ''; }, /needs instructions/));
ok('choice needs criteria', refuse(r => { delete r.questions.action.criteria; }, /needs criteria/));
ok('choice with no options', refuse(r => { r.questions.action.criteria = {}; }, /takes 1–255 options, not 0/));
ok('256 options refused', refuse(r => { r.questions.action.criteria = Object.fromEntries(Array.from({ length: 256 }, (_, i) => ['o' + i, 'x'])); }, /not 256/));
ok('option without text', refuse(r => { r.questions.action.criteria.resume = 3; }, /option "resume" needs a name and a text description/));
ok('score needs 2–10 levels', refuse(r => { r.questions.q = { type: 'score', instructions: 'How good?', criteria: { a: 'x' } }; }, /takes 2–10 levels, not 1/));
ok('noul criteria is text', refuse(r => { r.questions.q = { type: 'noul', instructions: 'Is it?', criteria: { a: 'x' } }; }, /noul's criteria is optional text/));
ok('check only on a noul', refuse(r => { r.questions.action.check = { op: 'empty' }; }, /heuristic check answers a noul only/));
ok('check op named', refuse(r => { r.questions.q = { type: 'noul', instructions: 'Is it?', check: { op: 'fuzzy' } }; }, /check.op is empty \| regex/));
ok('regex must compile', refuse(r => { r.questions.q = { type: 'noul', instructions: 'Is it?', check: { op: 'regex', pattern: '(' } }; }, /does not compile/));
ok('num check needs a bound', refuse(r => { r.questions.q = { type: 'noul', instructions: 'Is it?', check: { op: 'num' } }; }, /needs lt or gt/));
ok('date check needs a date', refuse(r => { r.questions.q = { type: 'noul', instructions: 'Is it?', check: { op: 'date', before: 'yarın' } }; }, /check.before is not a date/));
ok('decide needed', refuse(r => { r.decide = {}; }, /decide says how answers become a decision/));
ok('actionFrom names a choice', refuse(r => { r.questions.q = { type: 'noul', instructions: 'Is it?' }; r.decide = { actionFrom: 'q' }; }, /"q" is not one/));
ok('passIf names a question', refuse(r => { r.decide = { passIf: { q: 'nope', noulGt: 0.5 } }; }, /names no question — the rule asks action/));
ok('passIf probability 0–1', refuse(r => { r.questions.q = { type: 'noul', instructions: 'Is it?' }; r.decide = { passIf: { q: 'q', noulGt: 7 } }; }, /probability between 0 and 1/));
ok('choiceIs is an option', refuse(r => { r.decide = { passIf: { q: 'action', choiceIs: 'fly' } }; }, /"fly" is not one of "action"'s options/));
ok('one test per condition', refuse(r => { r.questions.q = { type: 'noul', instructions: 'Is it?' }; r.decide = { rejectIf: { q: 'q', noulGt: 0.5, noulLt: 0.2 } }; }, /exactly one of/));
ok('minConfidence 0–1', refuse(r => { r.minConfidence = 1.5; }, /minConfidence is between 0 and 1/));
ok('onLowConfidence named', refuse(r => { r.onLowConfidence = 'retry'; }, /escalate \| mechanical \| ask/));
ok('onFailure named', refuse(r => { r.onFailure = 'ignore'; }, /open \| closed \| fallback/));
ok('timeoutMs positive', refuse(r => { r.timeoutMs = -1; }, /timeoutMs is a positive whole number/));
ok('golden required', refuse(r => { r.golden = []; }, /golden is required/));
ok('golden expect names a question', refuse(r => { r.golden[0].expect = { mood: 'x' }; }, /"mood", which is not a question/));
ok('golden expect fits the type', refuse(r => { r.golden[0].expect = { action: true }; }, /expect.action is a string for a choice/));
ok('golden option narrowing checked', refuse(r => { r.golden[0].options = { action: ['fly'] }; }, /golden\[0\] — "action" can only be narrowed/));
const dispatchNoOpts = clone(B.DISPATCH_ROUTE); delete dispatchNoOpts.golden[0].options;
ok('golden of a $call question needs its options', /golden\[0\] — "agent" takes its options at call time/.test(S.ruleRefusal(dispatchNoOpts)));
ok('parseRule: bad JSON named', /not valid JSON/.test(S.parseRule('{').error));
ok('parseRule: good rule', S.parseRule(JSON.stringify(base())).rule.id === 'retry.next-action');

// --- call-time options
const D = B.DISPATCH_ROUTE;
const q1 = S.resolveQuestions(D, { agent: { a: 'writes code', b: 'counts money' } });
ok('$call takes the call\'s set', q1.questions && JSON.stringify(q1.questions.agent.criteria) === '{"a":"writes code","b":"counts money"}');
ok('$call accepts a bare name list', S.resolveQuestions(D, { agent: ['x', 'y'] }).questions.agent.criteria.y === 'y');
ok('$call without options refused', /takes its options at call time/.test(S.resolveQuestions(D).error));
ok('$call over 255 refused', /not 300/.test(S.resolveQuestions(D, { agent: Array.from({ length: 300 }, (_, i) => 'a' + i) }).error));
ok('rule is not changed by a call', D.questions.agent.criteria === '$call');
const narrowed = S.resolveQuestions(base(), { action: ['resume', 'stop'] });
ok('a fixed choice narrows to a subset, texts from the rule', Object.keys(narrowed.questions.action.criteria).join() === 'resume,stop' && /on track/.test(narrowed.questions.action.criteria.resume));
ok('narrowing to a foreign option refused', /"fly" is not one \(resume, retryOriginal/.test(S.resolveQuestions(base(), { action: ['fly'] }).error));
ok('options for an unknown question refused', /"mood", which is not a question of retry.next-action/.test(S.resolveQuestions(base(), { mood: ['x'] }).error));
ok('no call options = the rule as written', S.resolveQuestions(base()).questions.action.criteria.wait !== undefined);

// --- system dirs
ok('rulesDir setting wins', JSON.stringify(R.systemRuleDirs(' D:/r ', ['a'])) === '["D:/r"]');
ok('empty setting = _KAPICI in every agent root, once', JSON.stringify(R.systemRuleDirs('', ['a', 'a', ' ', 'b'])) === JSON.stringify([path.join('a', '_KAPICI'), path.join('b', '_KAPICI')]));

// --- layers
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-kapici-'));
try {
    const sys = path.join(tmp, 'agents', '_KAPICI'); fs.mkdirSync(sys, { recursive: true });
    const proj = path.join(tmp, 'repo'); fs.mkdirSync(path.join(proj, '.kapici'), { recursive: true });
    const write = (dir, name, rule) => fs.writeFileSync(path.join(dir, name), typeof rule === 'string' ? rule : JSON.stringify(rule), 'utf8');
    const v = n => Object.assign(base(), { version: n });
    write(sys, 'retry.next-action.json', v(2));
    write(sys, 'broken.json', '{"id":"broken","version":1}');
    write(path.join(proj, '.kapici'), 'retry.next-action.json', '\uFEFF' + JSON.stringify(v(3)));
    const reg = new R.RuleRegistry(B.BUILTIN_RULES, () => [sys, path.join(tmp, 'missing')]);

    const noProj = reg.get('retry.next-action');
    ok('system beats builtin, the record says so', noProj.layer === 'system' && noProj.rule.version === 2 && JSON.stringify(noProj.overrides) === '["builtin"]' && noProj.file.endsWith('retry.next-action.json'));
    const inProj = reg.get('retry.next-action', proj);
    ok('project beats system (BOM tolerated)', inProj.layer === 'project' && inProj.rule.version === 3 && JSON.stringify(inProj.overrides) === '["builtin","system"]');
    ok('builtin untouched stays builtin', reg.get('dispatch.route', proj).layer === 'builtin' && reg.get('dispatch.route').file === undefined);
    const loaded = reg.load(proj);
    ok('a broken file is a named problem', loaded.problems.length === 1 && loaded.problems[0].layer === 'system' && /broken: description|needs a description|version/.test(loaded.problems[0].error) && loaded.rules.length === 3);
    ok('find: a refused rule says why', /in .*broken\.json is refused/.test(reg.find('broken').error));
    ok('find: a missing rule lists what there is', /no Kapici rule "nope" — kapici.rules lists dispatch.route, retry.next-action/.test(reg.find('nope').error));

    write(sys, 'zz-dup.json', v(5));
    ok('two files, one id, one layer: flagged', reg.load().problems.some(p => /also defined in .*retry.next-action.json/.test(p.error)) && reg.get('retry.next-action').rule.version === 5);
    fs.rmSync(path.join(sys, 'zz-dup.json'));

    const f = path.join(sys, 'retry.next-action.json');
    write(sys, 'retry.next-action.json', v(4));
    const later = new Date(Date.now() + 5000); fs.utimesSync(f, later, later);
    ok('a changed file is re-read', reg.get('retry.next-action').rule.version === 4);
    fs.rmSync(f);
    ok('a removed file falls back to the layer below', reg.get('retry.next-action').layer === 'builtin');
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}

// --- the boundary and the size
const dir = path.join(ROOT, 'src/core/kapici');
const files = [];
(function walk(d) { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) { walk(p); } else if (n.endsWith('.ts')) { files.push(p); } } })(dir);
const foreign = [];
for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:from|require\()\s*['"]([^'"]+)['"]/g)) {
        const spec = m[1];
        const inside = spec.startsWith('.') && path.resolve(path.dirname(f), spec).startsWith(dir);
        if (!inside && !['fs', 'path', 'crypto'].includes(spec)) { foreign.push(`${path.basename(f)} -> ${spec}`); }
    }
    ok(`${path.basename(f)} is under 300 lines`, src.split('\n').length < 300);
}
ok('the core imports nothing outside its folder (no vscode): ' + foreign.join(', '), foreign.length === 0);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
