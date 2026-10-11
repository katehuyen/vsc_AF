// X-536 — WHAT THE AGENT MANUAL DOES NOT YET KNOW, AND A STARTING POINT FOR IT.
//
// Every registered bridge op needs an entry in manual/ops.meta.json (area, effect,
// one-line summary; asks / plan when they apply) — test/test_manual_content.js fails
// the build otherwise. This prints, for each op without one, a starter entry derived
// from its registration: the area its namespace mostly belongs to, an effect guessed
// from its verb, and the first sentence of its contract with ticket ids removed.
// It is a DRAFT: read the contract, fix the effect and rewrite the summary in plain
// words before pasting it in. With --write it inserts the drafts for you (sorted).
//
//   node tools/manual_meta.js            list the missing entries as JSON
//   node tools/manual_meta.js --write    add them to manual/ops.meta.json, then review the diff
//   node tools/manual_meta.js --stale    also list entries whose op no longer exists
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const P = require(path.join(ROOT, 'out', 'core', 'parity.js'));
const C = require(path.join(ROOT, 'out', 'core', 'manualBuild.js'));
const META = path.join(ROOT, 'manual', 'ops.meta.json');

const sources = [{ file: 'extension.ts', src: fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8') }];
for (const f of fs.readdirSync(path.join(ROOT, 'src', 'core')).filter(f => f.endsWith('.ts'))) {
    sources.push({ file: 'core/' + f, src: fs.readFileSync(path.join(ROOT, 'src', 'core', f), 'utf8') });
}
const body = new Map();
for (const d of P.discoverOps(sources)) { body.set(d.op, d.body); }
for (const { src } of sources) {
    const re = /op:\s*'([a-zA-Z0-9_.]+)'\s*,\s*describe:([\s\S]{0,6000}?)handler:/g;
    let m;
    while ((m = re.exec(src))) { if (!body.has(m[1])) { body.set(m[1], m[2]); } }
}

const doc = JSON.parse(fs.readFileSync(META, 'utf8'));
const meta = doc.ops;
/** The describe text as written in the source: string literals joined, code dropped. */
const describeOf = (b) => {
    const at = b.indexOf('describe:');
    const tail = at >= 0 ? b.slice(at + 9, b.indexOf('handler:', at) > 0 ? b.indexOf('handler:', at) : undefined) : b;
    return (tail.match(/'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g) || []).map(s => s.slice(1, -1).replace(/\\'/g, "'")).join('');
};
const areaOf = (op) => {
    const ns = op.split('.')[0];
    const counts = {};
    for (const [n, m] of Object.entries(meta)) { if (n.split('.')[0] === ns) { counts[m.area] = (counts[m.area] || 0) + 1; } }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'basics';
};
const effectOf = (op) => {
    const verb = op.split('.').pop();
    if (/^(list|get|status|find|read|recent|live|health|history|preview|trace|export|forecast)$/i.test(verb)) { return 'read'; }
    if (/^(delete|remove|clear|cancel|stop|end|forget|revoke|sweep|reset)/i.test(verb)) { return 'destructive'; }
    if (/^(run|start|rerun|resume|now|fire|test)$/i.test(verb)) { return 'run'; }
    return 'write';
};

const missing = [...body.keys()].filter(op => !meta[op]).sort();
const drafts = {};
for (const op of missing) {
    const text = describeOf(body.get(op));
    const d = { area: areaOf(op), effect: effectOf(op), summary: C.derivedSummary(text).slice(0, 160) };
    if (/asks the user to confirm|confirmation dialog/i.test(text)) { d.asks = true; }
    const plan = /(confirm:\s*true|dryRun:\s*false|apply[=:]\s*true)/i.exec(text);
    if (plan) { d.plan = plan[1].replace(/\s+/g, '').replace(':', '='); }
    drafts[op] = d;
}
const stale = Object.keys(meta).filter(op => !body.has(op));

if (process.argv.includes('--write') && missing.length) {
    doc.ops = Object.fromEntries(Object.entries({ ...meta, ...drafts }).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(META, JSON.stringify(doc, null, 2) + '\n', 'utf8');
    console.log(`added ${missing.length} draft entr${missing.length === 1 ? 'y' : 'ies'} to manual/ops.meta.json: ${missing.join(', ')}`);
    console.log('Review each one: the effect is guessed from the verb and the summary is the contract\'s first sentence.');
} else {
    console.log(JSON.stringify({ missing: drafts, ...(process.argv.includes('--stale') ? { stale } : {}) }, null, 2));
    if (!missing.length) { console.error('Every registered op has an entry.'); }
}
