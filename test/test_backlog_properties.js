// Backlog writers — invariants under generated documents (property-based).
//
// Hand-written cases only cover the files their author imagined. These rules
// are checked against thousands of generated backlogs: mixed line endings, BOM,
// Turkish text, fences, comments, archive headings, odd checkboxes.
'use strict';
const path = require('path');
const fc = require('fast-check');

let pass = 0, fail = 0;
const ROOT = process.env.AF_ROOT || path.join(__dirname, '..');
const P = require(path.join(ROOT, 'out', 'core', 'projectBacklog.js'));
const Pl = require(path.join(ROOT, 'out', 'core', 'projectPlan.js'));
const Md = require(path.join(ROOT, 'out', 'core', 'mdTable.js'));
const RUNS = Number(process.env.PROP_RUNS || 400);

function prop(name, arb, pred) {
    const r = fc.check(fc.property(arb, pred), { numRuns: RUNS, seed: process.env.PROP_SEED ? Number(process.env.PROP_SEED) : undefined });
    if (!r.failed) { pass++; return; }
    fail++;
    console.log('  FAIL ' + name);
    console.log('    seed=' + r.seed + ' path=' + r.counterexamplePath);
    console.log('    counterexample: ' + JSON.stringify(r.counterexample).slice(0, 1500));
    if (r.errorInstance) { console.log('    error: ' + String(r.errorInstance && r.errorInstance.stack || r.errorInstance).split('\n').slice(0, 4).join(' | ')); }
}

// ---------------------------------------------------------------- generators
const AREAS = ['P', 'K', 'X', 'U', 'M', 'S'];
const WORDS = ['Fix', 'sort', 'şema', 'ığdır', 'İSTANBUL', 'çöp', 'görev', 'kuyruk', 'a', '[link]', '`code`',
    '[[Not]]', 'x=1', '#bug', '#byAI', '#ux', '⏫', '🔺', '🔽', '[effort:: S]', '[effort:: XL]', '(due:: 2026-10-01)',
    '⛔ P-1', '⛔', '🆔 ab12', '📅 2026-10-01', '✅ 2026-09-01', '→', '—', '🗄', 'Archive', 'arşiv', '::', '|'];
const word = fc.constantFrom(...WORDS);
const words = fc.array(word, { minLength: 1, maxLength: 6 }).map(a => a.join(' '));
const area = fc.constantFrom(...AREAS);
const code = fc.tuple(area, fc.integer({ min: 1, max: 40 }), fc.option(fc.integer({ min: 1, max: 5 }), { nil: undefined }))
    .map(([a, n, s]) => `${a}-${n}${s ? '.' + s : ''}`);
const itemLine = fc.record({
    indent: fc.constantFrom('', '', '  ', '    ', '\t'),
    bullet: fc.constantFrom('-', '-', '*', '+', '1.', '2)'),
    box: fc.constantFrom(' ', ' ', 'x', '/', '-', 'X', '>'),
    code: fc.option(code, { nil: undefined }),
    body: words,
    trail: fc.constantFrom('', '', ' ', '  ')
}).map(i => `${i.indent}${i.bullet} [${i.box}] ${i.code ? i.code + ' ' : ''}${i.body}${i.trail}`);
const heading = fc.oneof(
    area.map(a => `## ${a} — Alan ${a}`),
    area.map(a => `### 🧩 ${a}: Başka`),
    fc.constantFrom('## 🗄 Archive', '## Arşiv', '## 📥 Inbox', '## Notes', '# Backlog')
);
const noise = fc.oneof(
    fc.constant(''), fc.constant(''), words,
    fc.constant('<!-- - [ ] P-99 example inside a comment -->'),
    fc.constant('| a | b |'),
    fc.constant('> - [ ] quoted, not an item')
);
const fence = itemLine.map(l => ['```', l, '```']);
const block = fc.oneof(
    { weight: 5, arbitrary: itemLine.map(l => [l]) },
    { weight: 2, arbitrary: heading.map(h => [h]) },
    { weight: 2, arbitrary: noise.map(n => [n]) },
    { weight: 1, arbitrary: fence }
);
const doc = fc.record({
    bom: fc.boolean(),
    eol: fc.constantFrom('\n', '\r\n', 'mixed'),
    blocks: fc.array(block, { minLength: 1, maxLength: 30 }),
    finalEol: fc.boolean(),
    seed: fc.array(fc.boolean(), { minLength: 64, maxLength: 64 })
}).map(d => {
    const lines = d.blocks.flat();
    let out = d.bom ? '\uFEFF' : '';
    lines.forEach((l, i) => {
        out += l;
        if (i < lines.length - 1 || d.finalEol) {
            out += d.eol === 'mixed' ? (d.seed[i % 64] ? '\r\n' : '\n') : d.eol;
        }
    });
    return out;
});
const docWithPick = fc.tuple(doc, fc.nat());

// ---------------------------------------------------------------- helpers
const items = t => P.parseBacklog(t).items;
const diffCount = (a, b) => {
    if (a.length !== b.length) { return Infinity; }
    let n = 0; for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) { n++; } } return n;
};
const lines = t => t.split(/\r?\n/);
const sortedNonBlank = t => lines(t).map(l => l.replace(/\s+$/, '')).filter(l => l.trim()).sort();
const eolKinds = t => ({ crlf: (t.match(/\r\n/g) || []).length, lf: (t.match(/(^|[^\r])\n/g) || []).length });
const isSubsequence = (small, big) => { let j = 0; for (const x of big) { if (j < small.length && x === small[j]) { j++; } } return j === small.length; };

// ---------------------------------------------------------------- properties
console.log('\n== parsing never throws ==');
prop('parseBacklog: generated documents', doc, t => { P.parseBacklog(t); return true; });
prop('parseBacklog: arbitrary unicode strings', fc.string({ unit: 'binary', maxLength: 400 }), t => { P.parseBacklog(t); return true; });

console.log('\n== state change edits exactly one character ==');
const STATES = ['open', 'doing', 'done', 'cancelled'];
prop('setBacklogState outside the archive: one char differs, nothing else',
    fc.tuple(docWithPick, fc.constantFrom(...STATES)), ([[t, k], s]) => {
        const its = items(t).filter(i => !i.archived);
        if (!its.length) { return true; }
        const it = its[k % its.length];
        const r = P.setBacklogState(t, { line: it.line }, s);
        if (!r.ok) { return false; }
        const d = diffCount(t, r.text);
        return it.state === s ? d === 0 : d === 1;
    });
// Only canonical boxes: a custom glyph (`[X]`, `[>]`) reads as done and cannot
// be recalled once reopened, so its round trip ends at `[x]` by design.
prop('setBacklogState round trip returns the original bytes',
    fc.tuple(docWithPick, fc.constantFrom(...STATES)), ([[t, k], s]) => {
        const its = items(t).filter(i => !i.archived && /\[[ x/-]\]/.test(i.raw));
        if (!its.length) { return true; }
        const it = its[k % its.length];
        const back = { open: 'open', doing: 'doing', done: 'done', cancelled: 'cancelled' }[it.state];
        const a = P.setBacklogState(t, { line: it.line }, s);
        if (!a.ok) { return false; }
        const line = a.item ? a.item.line : it.line;
        const b = P.setBacklogState(a.text, { line }, back);
        return b.ok && b.text === t;
    });
prop('setBacklogState reopening an archived item moves lines, never rewrites them',
    docWithPick, ([t, k]) => {
        const its = items(t).filter(i => i.archived && !P.isLive(i.state));
        if (!its.length) { return true; }
        const it = its[k % its.length];
        const r = P.setBacklogState(t, { line: it.line }, 'open');
        if (!r.ok) { return false; }
        const orig = lines(t).map(l => l.replace(/\s+$/, '')).filter(l => l.trim());
        const raw = it.raw.replace(/\s+$/, '');
        const at = orig.indexOf(raw);
        if (at < 0) { return false; }
        orig[at] = raw.replace(/\[.\]/, '[ ]');
        return JSON.stringify(orig.sort()) === JSON.stringify(sortedNonBlank(r.text));
    });

console.log('\n== single-item editors touch only their own line ==');
const segs = t => t.match(/[^\n]*\n|[^\n]+$/g) || [];
const endOf = s => (s.endsWith('\r\n') ? '\r\n' : s.endsWith('\n') ? '\n' : '');
const onlyLineChanged = (t, out, line) => {
    const a = segs(t), b = segs(out);
    if (a.length !== b.length) { return false; }
    for (let i = 0; i < a.length; i++) {
        if (i === line) {
            const indent = s => /^[ \t\uFEFF]*/.exec(s)[0];
            if (endOf(a[i]) !== endOf(b[i]) || indent(a[i]) !== indent(b[i])
                || /[\r\n]/.test(b[i].replace(/\r?\n$/, ''))) { return false; }
        }
        else if (a[i] !== b[i]) { return false; }
    }
    return true;
};
const pickLive = (t, k) => {
    const its = items(t).filter(i => !i.archived);
    return its.length ? its[k % its.length] : undefined;
};
const fieldsArb = fc.record({
    priority: fc.constantFrom('highest', 'high', 'medium', 'normal', 'low', 'lowest'),
    effort: fc.constantFrom('XS', 'S', 'M', 'L', 'XL', null),
    kinds: fc.subarray(['bug', 'feat', 'ux', 'debt']),
    due: fc.constantFrom('2026-10-01', null),
    hold: fc.boolean(),
    text: fc.oneof(words, fc.tuple(words, fc.constantFrom('\r', '\u2028', '\n'), words).map(([a, c, b]) => a + c + b))
}, { requiredKeys: [] });
const editors = [
    ['setBacklogHold', fc.boolean(), (t, at, on) => P.setBacklogHold(t, at, on)],
    ['setBacklogFields', fieldsArb, (t, at, f) => P.setBacklogFields(t, at, f)],
    ['stampBacklogClosed', fc.constantFrom('ab12cd34#3', 'e7f00a1b-2c#12', null), (t, at, s) => P.stampBacklogClosed(t, at, s)],
];
for (const [name, argArb, call] of editors) {
    prop(`${name}: every other line keeps its bytes and its line ending`, fc.tuple(docWithPick, argArb), ([[t, k], arg]) => {
        const it = pickLive(t, k);
        if (!it) { return true; }
        const r = call(t, { line: it.line }, arg);
        if (!r.ok) { return typeof r.error === 'string' && r.error.length > 0; }
        return onlyLineChanged(t, r.text, it.line);
    });
}
prop('setBacklogFields: what was asked for is what reads back', fc.tuple(docWithPick, fieldsArb), ([[t, k], f]) => {
    const it = pickLive(t, k);
    if (!it) { return true; }
    // Words that carry their own metadata (`[effort:: XL]`, ⛔, 📅…) set those fields themselves.
    if (f.text !== undefined && /::|⛔|⏫|🔺|🔽|📅|✅|🆔|#/u.test(f.text)) { return true; }
    const r = P.setBacklogFields(t, { line: it.line }, f);
    if (!r.ok) { return true; }
    const back = items(r.text).find(i => i.line === it.line);
    if (!back) { return false; }
    return ('priority' in f ? back.priority === f.priority : back.priority === it.priority)
        && ('effort' in f ? (back.effort ?? null) === f.effort : back.effort === it.effort)
        && ('due' in f ? (back.due ?? null) === f.due : back.due === it.due)
        && ('hold' in f ? !!back.onHold === f.hold : !!back.onHold === !!it.onHold)
        && (f.kinds || []).every(x => back.kinds.includes(x));
});
// Trailing blanks on the toggled line are not kept: meaningless on a list item.
prop('setBacklogHold on then off restores an unheld line', docWithPick, ([t, k]) => {
    const it = pickLive(t, k);
    if (!it || it.onHold) { return true; }
    const a = P.setBacklogHold(t, { line: it.line }, true);
    if (!a.ok) { return false; }
    const b = P.setBacklogHold(a.text, { line: it.line }, false);
    const trimLine = (s, n) => segs(s).map((l, i) => (i === n ? l.replace(/[ \t]+(\r?\n)?$/, '$1') : l)).join('');
    return b.ok && trimLine(b.text, it.line) === trimLine(t, it.line);
});

console.log('\n== adding an item ==');
const addText = fc.oneof(words, fc.string({ unit: 'grapheme', minLength: 1, maxLength: 40 }),
    fc.tuple(words, fc.constantFrom('\r', '\u2028', '\u2029', '\u0085', '\t', '\v', '\f'), words).map(([a, c, b]) => a + c + b));
prop('addBacklogItem keeps every original line, in order',
    fc.tuple(doc, fc.option(area, { nil: undefined }), addText), ([t, a, txt]) => {
        const r = P.addBacklogItem(t, { text: txt, area: a });
        if (!r.ok) { return true; }
        return isSubsequence(lines(t).filter(l => l !== ''), lines(r.text).filter(l => l !== ''));
    });
prop('addBacklogItem: the new item parses back as exactly one open item, outside the archive',
    fc.tuple(doc, fc.option(area, { nil: undefined }), addText), ([t, a, txt]) => {
        const r = P.addBacklogItem(t, { text: txt, area: a });
        if (!r.ok) { return true; }
        const before = items(t).length;
        const after = items(r.text);
        if (after.length !== before + 1) { return false; }
        if (r.item && r.item.code) {
            const hit = after.filter(i => i.code === r.item.code);
            if (hit.length < 1 || hit.some(i => i.archived && i.line === r.item.line)) { return false; }
        }
        return true;
    });
prop('addBacklogItem never introduces a foreign line ending',
    fc.tuple(doc, fc.option(area, { nil: undefined }), words), ([t, a, txt]) => {
        const r = P.addBacklogItem(t, { text: txt, area: a });
        if (!r.ok) { return true; }
        const k0 = eolKinds(t), k1 = eolKinds(r.text);
        if (k0.crlf && !k0.lf) { return k1.lf === 0; }
        if (k0.lf && !k0.crlf) { return k1.crlf === 0; }
        return true;
    });

console.log('\n== one physical line per written line ==');
const BREAK = /\r\n|\r|\n|\u2028|\u2029/;
const breakText = fc.tuple(words, fc.constantFrom('\r', '\n', '\r\n', '\u2028', '\u2029'), words).map(([a, c, b]) => a + c + b);
prop('addPlanItem: the added item parses back, one more item than before', fc.tuple(doc, breakText), ([t, txt]) => {
    const r = Pl.addPlanItem(t, txt);
    if (!r.ok) { return true; }
    return Pl.parsePlanItems(r.text).length === Pl.parsePlanItems(t).length + 1;
});
prop('markdownTable: every row is one physical line',
    fc.array(fc.array(fc.oneof(words, breakText), { minLength: 2, maxLength: 2 }), { minLength: 1, maxLength: 5 }), rows => {
        const md = Md.markdownTable({ title: 'T', cols: ['a', 'b'], rows, at: 0 });
        return md.split(BREAK).filter(l => l.startsWith('|')).length === rows.length + 2;
    });

console.log('\n== tidy and archive ==');
prop('tidyBacklogFile is idempotent', doc, t => {
    const a = P.tidyBacklogFile(t);
    if (!a.ok) { return true; }
    const b = P.tidyBacklogFile(a.text);
    return b.ok && b.text === a.text;
});
prop('tidyBacklogFile keeps every non-blank line (moves, never rewrites or drops)', doc, t => {
    const a = P.tidyBacklogFile(t);
    if (!a.ok) { return true; }
    return JSON.stringify(sortedNonBlank(t)) === JSON.stringify(sortedNonBlank(a.text));
});
prop('archiveBacklogDone keeps every non-blank line (plus at most its own heading)', doc, t => {
    const a = P.archiveBacklogDone(t, { cancelled: true });
    if (!a.ok) { return true; }
    const before = sortedNonBlank(t);
    const after = sortedNonBlank(a.text).filter((l, i, arr) => !(l === P.ARCHIVE_TITLE && !before.includes(l)));
    return JSON.stringify(before) === JSON.stringify(after);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
