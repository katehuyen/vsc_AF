// X-468 — INCIDENT GUARDS ARE PINNED. An assertion written for a real incident is listed in
// test/pinned.json (file · title · fingerprint of its whole statement · the incident · why), and this
// gate fails when one disappears, is renamed, is commented out, or its statement changes. Measured
// reason: 232aec69 deleted the very assertion that guarded the stay-on-account loop while cleaning
// up a duplicate setting, nothing noticed, and the loop came back the same day (chn_muqifjzc001n2b).
// Removing or loosening a pin needs the user's yes, asked in chat; a refactor that keeps a guard
// exactly as strict updates its hash and names it under "Pins changed:" in the commit body.
'use strict';
const fs = require('fs');
const path = require('path');
const { assertionsOf } = require('./pinlex');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

/** What is wrong with the pins against the sources `read(file)` returns ('' = no such file). */
function checkPins(doc, read) {
    const problems = [];
    const pins = Array.isArray(doc && doc.pins) ? doc.pins : [];
    if (!pins.length) { problems.push('pinned.json lists no pins'); }
    const seen = new Set();
    for (const p of pins) {
        const where = `${p.file} :: ${String(p.title).slice(0, 90)}`;
        for (const k of ['file', 'title', 'hash', 'incident', 'why']) {
            if (!String(p[k] ?? '').trim()) { problems.push(`${where} — the pin has no ${k}`); }
        }
        const key = `${p.file}\n${p.title}`;
        if (seen.has(key)) { problems.push(`${where} — pinned twice`); }
        seen.add(key);
        if (!/^test_[\w.-]*\.js$/.test(String(p.file))) {
            problems.push(`${where} — not a file the suite runs (run-all runs test/test_*.js)`);
            continue;
        }
        const src = read(p.file);
        if (!src) { problems.push(`${where} — the file is gone`); continue; }
        const hits = assertionsOf(src).filter(a => a.title === p.title);
        if (!hits.length) {
            problems.push(`${where} — the pinned assertion is GONE (deleted, renamed or commented out). It guards: ${p.incident}. Restore it; removing a pin needs the user's yes.`);
        } else if (hits.length > 1) {
            problems.push(`${where} — the title is used ${hits.length} times; a pinned title must be unique in its file`);
        } else if (hits[0].hash !== p.hash) {
            problems.push(`${where} (line ${hits[0].line}) — the pinned statement CHANGED (hash ${hits[0].hash}, pinned ${p.hash}). A loosened guard needs the user's yes; a refactor that keeps it as strict updates the hash and says so under "Pins changed:" in the commit body.`);
        }
    }
    return problems;
}

console.log('\n== the pins hold ==');
{
    const doc = JSON.parse(fs.readFileSync(path.join(__dirname, 'pinned.json'), 'utf8'));
    const read = f => { try { return fs.readFileSync(path.join(__dirname, f), 'utf8'); } catch { return ''; } };
    const problems = checkPins(doc, read);
    for (const p of problems) { console.log('    ' + p); }
    ok(`‼️ every pinned incident guard is still in its file, unchanged (${(doc.pins || []).length} pins)`, problems.length === 0);
    ok('the pin file says what it is and how a pin changes', /user's yes/.test(doc.about || '') && /Pins changed:/.test(doc.about || ''));
    const hook = fs.readFileSync(path.join(__dirname, '..', '.githooks', 'pre-commit'), 'utf8').replace(/\r\n/g, '\n');
    const at = hook.indexOf('node test/test_pinned.js'), end = hook.lastIndexOf('exit 0');
    ok('‼️ the commit hook runs this gate itself, so a pin cannot leave without a full suite run either', at > 0 && at < end);
}

console.log('\n== the gate bites (fixtures, mutated) ==');
{
    const base = [
        "const ok = (n, c) => c;",
        "ok('‼️ the loop cannot happen', at70.id === '' && /70%/.test(r.refusal || '') && f('(') === ')');",
        "ok(\"a second one, with a 'quote' and a regex /\\\\(x\\\\)/\", /\\(b\\.fault === 'limit' && was\\)/.test(ext));",
        "function g() { return /a\\/b(/.test(s) ? ok('inside a function after a return regex', x === 1) : 0; }",
        "ok(`a plain template title`, [1, 2].map(n => (n)).length === 2);"
    ].join('\n');
    const titles = assertionsOf(base).map(a => a.title);
    ok('the lexer finds every plain title, through regexes, quotes, parentheses and a return regex',
        titles.length === 4 && titles[0] === '‼️ the loop cannot happen' && titles[1] === "a second one, with a 'quote' and a regex /\\(x\\)/"
        && titles[2] === 'inside a function after a return regex' && titles[3] === 'a plain template title');
    const pinOf = (src, title) => ({ file: 'test_fixture.js', title, hash: assertionsOf(src).find(a => a.title === title).hash, incident: 'fixture', why: 'fixture' });
    const pins = { pins: [pinOf(base, '‼️ the loop cannot happen'), pinOf(base, 'inside a function after a return regex')] };
    const run = src => checkPins(pins, f => (f === 'test_fixture.js' ? src : ''));
    ok('the untouched fixture passes', run(base).length === 0);
    ok('‼️ the assertion DELETED: caught, naming the incident', run(base.split('\n').filter(l => !l.includes('loop cannot')).join('\n')).some(p => /GONE/.test(p) && /fixture/.test(p)));
    ok('‼️ the assertion COMMENTED OUT: caught', run(base.replace("ok('‼️ the loop", "// ok('‼️ the loop")).some(p => /GONE/.test(p)));
    ok('…and inside a block comment too', run(base.replace("ok('‼️ the loop", "/* ok('‼️ the loop").replace("=== ')');", "=== ')'); */")).some(p => /GONE/.test(p)));
    ok('‼️ the title RENAMED: caught', run(base.replace('the loop cannot happen', 'the loop rarely happens')).some(p => /GONE/.test(p)));
    ok('‼️ the condition LOOSENED: caught as a change', run(base.replace("at70.id === '' && ", '')).some(p => /CHANGED/.test(p)));
    ok('…a weakened operator too', run(base.replace('x === 1', 'x >= 1')).some(p => /CHANGED/.test(p)));
    ok('a whitespace-only reflow is not a change', run(base.replace("at70.id === '' && /70%/", "at70.id === ''\n        && /70%/")).length === 0);
    ok('the title copied twice: refused as ambiguous', run(base + "\nok('‼️ the loop cannot happen', true);").some(p => /2 times/.test(p)));
    ok('the file removed: caught', checkPins(pins, () => '').some(p => /file is gone/.test(p)));
    ok('a pin outside the suite (not test_*.js) is refused', checkPins({ pins: [{ ...pins.pins[0], file: 'helper.js' }] }, () => base).some(p => /not a file the suite runs/.test(p)));
    ok('a pin with no incident or why is refused', checkPins({ pins: [{ ...pins.pins[0], incident: '', why: ' ' }] }, () => base).filter(p => /has no (incident|why)/.test(p)).length === 2);
    ok('an empty pin list is refused', checkPins({ pins: [] }, () => base).length === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
