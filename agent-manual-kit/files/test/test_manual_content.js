// X-536 — THE AGENT MANUAL STAYS TRUE TO THE BUILD.
//
// The manual is only worth reading if it cannot drift from what the bridge
// really offers. This gate reads the registrations out of the source (the same
// way the parity gate does), the manual's files, and the compiled renderers,
// and fails the build when:
//   - a registered op has no entry in manual/ops.meta.json, or an entry names an op that does not exist
//   - an entry is malformed (area without a guide, unknown effect, a summary too long, ticket ids, Turkish)
//   - a guide, playbook, the map or the card names an op that does not exist, or an argument the op's
//     contract never mentions (inline `op key=value` and ```json {"op","args"} blocks alike)
//   - a playbook or area reference points at nothing
//   - a page outgrows its token budget (everything here is read by a model, every token is paid for)
//
//   node tools/manual_meta.js   prints a starter ops.meta.json entry for every op that lacks one
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const MANUAL = path.join(ROOT, 'manual');
const P = require(path.join(ROOT, 'out', 'core', 'parity.js'));
const B = require(path.join(ROOT, 'out', 'core', 'bridge.js'));
const S = require(path.join(ROOT, 'out', 'core', 'manualSource.js'));
const C = require(path.join(ROOT, 'out', 'core', 'manualBuild.js'));
const Q = require(path.join(ROOT, 'out', 'service', 'manualQuery.js'));

// ---------------------------------------------------------------- the registry, from the source
const sources = [{ file: 'extension.ts', src: fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8') }];
for (const f of fs.readdirSync(path.join(ROOT, 'src', 'core')).filter(f => f.endsWith('.ts'))) {
    sources.push({ file: 'core/' + f, src: fs.readFileSync(path.join(ROOT, 'src', 'core', f), 'utf8') });
}
/** op → the source text of its registration (describe and handler included) */
const contract = new Map();
for (const d of P.discoverOps(sources)) { contract.set(d.op, (contract.get(d.op) || '') + d.body); }
// A registration the parity scanner's brace heuristic misses is still a registration:
// `op: '<name>'` immediately followed by `describe:` is the registry's own shape.
for (const { src } of sources) {
    const re = /op:\s*'([a-zA-Z0-9_.]+)'\s*,\s*describe:([\s\S]{0,6000}?)handler:/g;
    let m;
    while ((m = re.exec(src))) { if (!contract.has(m[1])) { contract.set(m[1], m[2]); } }
}
contract.set('farm.ops', (contract.get('farm.ops') || '') + ' op area q full format');
// The shared run-dimension sentences are spliced into many contracts by constant name.
const NOTES = Object.entries(B).filter(([k, v]) => /_NOTE$/.test(k) && typeof v === 'string');
const contractText = (op) => {
    let t = contract.get(op) || '';
    for (const [k, v] of NOTES) { if (t.includes(k)) { t += ' ' + v; } }
    return t;
};
const ALIAS = { 'missions.preview': 'missions.start' };
const mentions = (op, key) => new RegExp(`(^|[^A-Za-z0-9_])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9_]|$)`)
    .test(contractText(ALIAS[op] || op));

ok('the source registers several hundred ops', contract.size > 500);

// ---------------------------------------------------------------- ops.meta.json
const src = S.readManualSource(MANUAL);
ok('the manual folder reads without problems', src.problems.length === 0
    || (console.log('  ↳ ' + src.problems.join('\n  ↳ ')), false));
const areaIds = new Set(src.docs.filter(d => d.kind === 'area').map(d => d.id));
const missing = [...contract.keys()].filter(op => !src.meta[op]).sort();
ok(`every registered op has an ops.meta.json entry (missing ${missing.length})`, missing.length === 0
    || (console.log('  ↳ ' + missing.join(', ') + '\n  ↳ node tools/manual_meta.js prints starter entries'), false));
const stale = Object.keys(src.meta).filter(op => !contract.has(op)).sort();
ok(`no ops.meta.json entry describes an op that is not registered (${stale.join(', ')})`, stale.length === 0);
const TURKISH = /[çğıöşüÇĞİÖŞÜ]/;
const TICKET = /\b[A-Z]{1,3}-\d{1,4}\b/;
for (const [op, m] of Object.entries(src.meta)) {
    const where = `ops.meta.json ${op}`;
    if (!areaIds.has(m.area)) { ok(`${where}: area "${m.area}" has a guide`, false); }
    if (m.summary.length > 160 || m.summary.length < 15) { ok(`${where}: summary is 15-160 characters`, false); }
    if (TICKET.test(m.summary) || /‼/.test(m.summary)) { ok(`${where}: summary carries no ticket id or emphasis marks`, false); }
    if (TURKISH.test(m.summary)) { ok(`${where}: summary is English`, false); }
    if (m.plan && !/^[a-zA-Z]+=(true|false)$/.test(m.plan)) { ok(`${where}: plan names one flag=value`, false); }
}
ok('ops.meta.json entries are well-formed (any failure is listed above)', true);

// ---------------------------------------------------------------- the compiled manual
const catalog = [...contract.keys()].map(op => ({ op, describe: contractText(op) }));
const build = C.compileManual(src, catalog, 'test');
const m = build.manual;
ok('the manual compiles against the registry with no problem', build.problems.length === 0
    || (console.log('  ↳ ' + build.problems.slice(0, 20).join('\n  ↳ ')), false));
ok('no op is described automatically', m.ops.every(o => !o.derived));

// ---------------------------------------------------------------- every text an agent reads
const files = [['card.md', src.card], ['map.md', src.map],
    ...src.docs.map(d => [`${d.kind === 'area' ? 'areas' : 'playbooks'}/${d.id}.md`, d.body + '\n' + d.title + '\n' + d.summary])];
const docIds = new Set(src.docs.map(d => d.id));
const playbookIds = new Set(src.docs.filter(d => d.kind === 'playbook').map(d => d.id));
const namespaces = new Set([...contract.keys()].map(o => o.split('.')[0]));
const opProblems = [];
for (const [name, text] of files) {
    if (TURKISH.test(text)) { opProblems.push(`${name}: Turkish characters (the manual is English)`); }
    if (TICKET.test(text.replace(/`[^`]*`/g, '').replace(/\b(UTF-8|K-\d+|S-\d+|P-\d+)\b/g, ''))) {
        opProblems.push(`${name}: a ticket id outside code (${TICKET.exec(text)[0]})`);
    }
    // inline code: `op` or `op key=value ...`
    for (const span of text.match(/`[^`\n]+`/g) || []) {
        const inner = span.slice(1, -1);
        const mm = /^([a-z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)+)((?:\s+[A-Za-z_][A-Za-z0-9_]*=\S+)*)\s*$/.exec(inner);
        if (!mm || !namespaces.has(mm[1].split('.')[0]) || /\.(md|json|js|ts|jsonl)$/.test(mm[1])) { continue; }
        if (!contract.has(mm[1])) { opProblems.push(`${name}: unknown op ${mm[1]}`); continue; }
        for (const k of (mm[2].match(/[A-Za-z_][A-Za-z0-9_]*(?==)/g) || [])) {
            if (!mentions(mm[1], k)) { opProblems.push(`${name}: ${mm[1]} has no argument "${k}" in its contract`); }
        }
    }
    // JSON blocks
    for (const blk of text.match(/```json\n[\s\S]*?```/g) || []) {
        let j;
        try { j = JSON.parse(blk.slice(8, -3)); } catch (e) { opProblems.push(`${name}: a json block does not parse (${e.message})`); continue; }
        for (const it of Array.isArray(j) ? j : [j]) {
            if (!it || typeof it !== 'object' || !it.op) { continue; }
            if (!contract.has(it.op)) { opProblems.push(`${name}: unknown op ${it.op}`); continue; }
            for (const k of Object.keys(it.args || {})) {
                if (!mentions(it.op, k)) { opProblems.push(`${name}: ${it.op} has no argument "${k}" in its contract`); }
            }
        }
    }
    // references to guides
    for (const ref of text.match(/farm\.guide id=([a-z0-9-]+)/g) || []) {
        const id = ref.split('=')[1];
        if (!docIds.has(id) && !contract.has(id) && !/^(area|playbook|op)$/.test(id)) { opProblems.push(`${name}: farm.guide id=${id} is no guide`); }
    }
    for (const ref of text.match(/[Pp]laybook ([a-z]+(?:-[a-z0-9]+)+)/g) || []) {
        const id = ref.split(' ')[1];
        if (!playbookIds.has(id)) { opProblems.push(`${name}: playbook ${id} does not exist`); }
    }
}
for (const d of src.docs) {
    for (const r of d.related) { if (!areaIds.has(r)) { opProblems.push(`${d.id}: related area ${r} does not exist`); } }
    for (const op of d.ops) { if (!contract.has(op)) { opProblems.push(`${d.id}: lists op ${op}, which is not registered`); } }
    if (d.kind === 'playbook' && !areaIds.has(d.area || '')) { opProblems.push(`${d.id}: area ${d.area} does not exist`); }
    if (d.kind === 'playbook' && d.intents.length < 2) { opProblems.push(`${d.id}: a playbook needs at least two example requests (intents)`); }
}
ok(`every op, argument and reference in the manual is real (${opProblems.length} problems)`, opProblems.length === 0
    || (console.log('  ↳ ' + opProblems.join('\n  ↳ ')), false));

// ---------------------------------------------------------------- budgets (characters; about 4 per token in English)
const BUDGET = { card: 1600, map: 13000, area: 11000, playbook: 6500 };
const card = Q.renderCard(src.card, { af: 'node "/home/u/.agentfarm/af.js"', version: '9.999.0' });
ok(`the start card stays short (${card.length} / ${BUDGET.card} chars)`, card.length <= BUDGET.card);
ok('the start card names farm.guide, farm.find and farm.ops', /farm\.guide/.test(card) && /farm\.find/.test(card) && /farm\.ops/.test(card));
const map = Q.renderMap(m);
ok(`the map stays within budget (${map.length} / ${BUDGET.map} chars)`, map.length <= BUDGET.map);
ok('the map lists every area and every playbook', [...docIds].every(id => map.includes(`**${id}**`)));
for (const d of src.docs) {
    const text = Q.renderDoc(m, d);
    const cap = d.kind === 'area' ? BUDGET.area : BUDGET.playbook;
    if (text.length > cap) { ok(`${d.kind} ${d.id} stays within budget (${text.length} / ${cap} chars)`, false); }
}
ok('every guide and playbook stays within its budget (any failure is listed above)', true);
const index = Q.renderOpsIndex(m);
ok(`the ops index is a fraction of the full dump (${index.length} vs ${catalog.reduce((s, c) => s + c.describe.length, 0)} chars)`,
    index.length < 16000);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
