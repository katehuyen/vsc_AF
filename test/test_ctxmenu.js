// Guard: the right-click catalogue and package.json say the same thing.
//
// A menu item lives in three places — a `commands` title, a `menus` entry, and
// a handler — and when they drift the item does not warn, it simply stops
// appearing (or appears and does nothing). src/core/ctxmenu.ts is the single
// source of truth; this test is what makes that true instead of aspirational.
//
//   node test/test_ctxmenu.js          check, exit 1 on drift
//   node test/test_ctxmenu.js --fix    rewrite package.json from the catalogue
//
// ‼️ THE FIXER NEVER REFORMATS THE FILE. package.json has twice been mangled by
// an encoding round trip, and a full JSON.stringify rewrite would also
// normalise ~200 hand-written \uXXXX escapes into raw UTF-8 — a 3,000-line diff
// with no meaning. So it splices whole ARRAY ELEMENTS in place, writes new text
// as pure ASCII, and refuses to write at all unless the result parses back to
// exactly the object it intended (and leaves everything else identical).
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const CAT = require(path.join(__dirname, '..', 'out', 'core', 'ctxmenu.js'));
const PKG = path.join(__dirname, '..', 'package.json');
const FIX = process.argv.includes('--fix');

// ---------------------------------------------------------------- the catalogue

{
    const problems = CAT.ctxProblems();
    ok('catalogue is well formed', problems.length === 0);
    for (const p of problems) { console.log('    · ' + p); }
}

// ------------------------------------------------------------- what it should say

const raw = fs.readFileSync(PKG, 'utf8');
const pkg = JSON.parse(raw);
const contributes = pkg.contributes || {};
const mine = s => String(s || '').startsWith(CAT.CTX_PREFIX);

/** The three lists the catalogue owns, as they should read. */
function desired() {
    const menus = CAT.ctxMenuContributions();
    const commands = (contributes.commands || []).filter(c => !mine(c.command))
        .concat(CAT.ctxCommandContributions());
    const submenus = (contributes.submenus || []).filter(s => !mine(s.id))
        .concat(CAT.ctxSubmenuContributions());
    const palette = (contributes.menus.commandPalette || []).filter(e => !mine(e.command))
        .concat(CAT.ctxPaletteHiding());
    const out = { commands, submenus, menus: {} };
    // Every menu list the catalogue owns. A submenu that was deleted from the
    // catalogue leaves its list behind, so the empty ones are listed too and
    // the splice drops them.
    for (const key of Object.keys(contributes.menus)) {
        if (mine(key)) { out.menus[key] = []; }
    }
    for (const key of Object.keys(menus)) { out.menus[key] = menus[key]; }
    if (palette.length) { out.menus.commandPalette = palette; }
    return out;
}

const want = desired();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ------------------------------------------------------------------ the check

const drift = [];
if (!same(contributes.commands || [], want.commands)) { drift.push('contributes.commands'); }
if (!same(contributes.submenus || [], want.submenus)) { drift.push('contributes.submenus'); }
for (const key of Object.keys(want.menus)) {
    if (!same(contributes.menus[key] || [], want.menus[key])) { drift.push(`menus["${key}"]`); }
}

if (!FIX) {
    ok('package.json matches the catalogue', drift.length === 0);
    for (const d of drift) { console.log('    · out of sync: ' + d); }
    if (drift.length) { console.log('    run: node test/test_ctxmenu.js --fix'); }
}

// --------------------------------------------------- every relay has a handler
// A page action is only half a feature until the page it names answers it. The
// media file is the other half, so the sections a page's rows publish and the
// acts the catalogue relays to it are checked against the source.
{
    const dir = path.join(__dirname, '..', 'media');
    const sources = fs.readdirSync(dir).filter(f => f.endsWith('.js'))
        .map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    // An act may carry its value (`blPrio:high`); the page switches on the verb,
    // so that is what has to appear in a page's source.
    const verbs = [...new Set(CAT.ctxRelays().map(r => r.act.split(':')[0]))];
    const missing = verbs.filter(verb => !sources.includes(`'${verb}'`));
    ok('every relayed act is named by a page', missing.length === 0);
    for (const m of missing) { console.log('    · no page handles act: ' + m); }
}

// ------------------------------------------------------------------ the fixer

/** Walk past the JSON value that starts at `i`; return the index after it. */
function endOfValue(text, i) {
    const c = text[i];
    if (c === '"') {
        for (let j = i + 1; j < text.length; j++) {
            if (text[j] === '\\') { j++; continue; }
            if (text[j] === '"') { return j + 1; }
        }
        throw new Error('unterminated string at ' + i);
    }
    if (c === '{' || c === '[') {
        const close = c === '{' ? '}' : ']';
        let depth = 0;
        for (let j = i; j < text.length; j++) {
            const ch = text[j];
            if (ch === '"') { j = endOfValue(text, j) - 1; continue; }
            if (ch === c) { depth++; } else if (ch === close) { depth--; if (!depth) { return j + 1; } }
        }
        throw new Error('unterminated ' + c + ' at ' + i);
    }
    let j = i;
    while (j < text.length && !',}]\r\n \t'.includes(text[j])) { j++; }
    return j;
}

/** Where the value of `key` starts inside the object beginning at `objStart`. */
function memberStart(text, objStart, key) {
    if (text[objStart] !== '{') { throw new Error('not an object at ' + objStart); }
    let j = objStart + 1;
    while (j < text.length) {
        while (j < text.length && ' \t\r\n,'.includes(text[j])) { j++; }
        if (text[j] === '}') { return -1; }
        if (text[j] !== '"') { throw new Error('expected a key at ' + j); }
        const nameEnd = endOfValue(text, j);
        const name = JSON.parse(text.slice(j, nameEnd));
        let v = nameEnd;
        while (v < text.length && ' \t\r\n:'.includes(text[v])) { v++; }
        if (name === key) { return v; }
        j = endOfValue(text, v);
    }
    return -1;
}

/** Where the value at `path` starts, or -1. */
function locate(text, keys) {
    let at = text.indexOf('{');
    for (const key of keys) {
        at = memberStart(text, at, key);
        if (at < 0) { return -1; }
    }
    return at;
}

/** The text spans of an array's elements, in order. */
function elementSpans(text, arrStart) {
    const end = endOfValue(text, arrStart) - 1;
    const spans = [];
    let j = arrStart + 1;
    while (j < end) {
        while (j < end && ' \t\r\n,'.includes(text[j])) { j++; }
        if (j >= end) { break; }
        const stop = endOfValue(text, j);
        spans.push([j, stop]);
        j = stop;
    }
    return { spans, open: arrStart, close: end };
}

/** Anything above ASCII, written the way package.json already writes it. */
const NON_ASCII = new RegExp('[^\\x00-\\x7F]', 'g');

/** ASCII only, and indented to sit where the neighbours sit. */
function render(value, indent, eol) {
    const body = JSON.stringify(value, null, 2).replace(NON_ASCII,
        ch => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
    return body.split('\n').map((l, n) => (n ? indent + l : l)).join(eol);
}

/**
 * Replace one array's elements, keeping the ones the catalogue does not own
 * exactly as they are written.
 *
 * `keep(el)` decides which existing elements survive; they are spliced back
 * VERBATIM, so a hand-written entry keeps its escapes, its key order and its
 * spacing. Only what the catalogue owns is re-rendered.
 */
function spliceArray(text, keys, wanted, keep) {
    const at = locate(text, keys);
    if (at < 0) { return null; }
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const { spans, open, close } = elementSpans(text, at);
    // The indent of an element, read off the file rather than assumed.
    const lineStart = text.lastIndexOf('\n', spans.length ? spans[0][0] : open) + 1;
    const indent = spans.length ? text.slice(lineStart, spans[0][0]).replace(/[^ \t]/g, '') : '  ';
    const closeIndent = indent.slice(0, Math.max(0, indent.length - 2));
    const kept = [];
    for (const [s, e] of spans) {
        const el = JSON.parse(text.slice(s, e));
        if (keep(el)) { kept.push(text.slice(s, e)); }
    }
    const added = wanted.map(el => render(el, indent, eol));
    const all = kept.concat(added);
    const body = all.length
        ? eol + indent + all.join(',' + eol + indent) + eol + closeIndent
        : '';
    return text.slice(0, open) + '[' + body + ']' + text.slice(close + 1);
}

/** Add a key with an array value next to a sibling that already exists. */
function insertKey(text, parentKeys, key, value, afterSibling) {
    const parent = locate(text, parentKeys);
    if (parent < 0) { return null; }
    const sib = memberStart(text, parent, afterSibling);
    if (sib < 0) { return null; }
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const end = endOfValue(text, sib);
    const lineStart = text.lastIndexOf('\n', sib) + 1;
    const indent = text.slice(lineStart).match(/^[ \t]*/)[0];
    const block = `,${eol}${indent}${JSON.stringify(key)}: ` + render(value, indent, eol);
    return text.slice(0, end) + block + text.slice(end);
}

if (FIX) {
    let text = raw;
    const step = (what, fn) => {
        const next = fn(text);
        if (next === null) { console.log('  could not place ' + what); fail++; return; }
        text = next;
    };
    step('contributes.commands', t => spliceArray(t, ['contributes', 'commands'],
        CAT.ctxCommandContributions(), el => !mine(el.command)));
    if (want.submenus.length) {
        if (locate(text, ['contributes', 'submenus']) < 0) {
            step('contributes.submenus', t => insertKey(t, ['contributes'], 'submenus', [], 'commands'));
        }
        step('contributes.submenus', t => spliceArray(t, ['contributes', 'submenus'],
            CAT.ctxSubmenuContributions(), el => !mine(el.id)));
    }
    for (const key of Object.keys(want.menus)) {
        const list = want.menus[key];
        if (locate(text, ['contributes', 'menus', key]) < 0) {
            if (!list.length) { continue; }
            step(`menus["${key}"]`, t => insertKey(t, ['contributes', 'menus'], key, [], 'webview/context'));
        }
        // The catalogue owns the webview menu and its submenus outright; in the
        // command palette it owns only its own hidings and leaves the rest.
        // The palette's kept entries are already in `list` — splice only the hidings, or they land twice.
        const keep = key === 'commandPalette' ? el => !mine(el.command) : () => false;
        const add = key === 'commandPalette' ? CAT.ctxPaletteHiding() : list;
        step(`menus["${key}"]`, t => spliceArray(t, ['contributes', 'menus', key], add, keep));
    }

    // ‼️ Nothing is written until the result is proved. A splice that landed in
    // the wrong place, or an element the scanner mis-measured, is caught here
    // instead of in the user's package.json.
    // Key ORDER is not part of what is being proved — a key the splice inserted
    // next to its siblings and one this comparison appends at the end are the
    // same package.json. Arrays keep their order, because there it is meaning.
    const stable = v => (Array.isArray(v) ? v.map(stable)
        : v && typeof v === 'object'
            ? Object.keys(v).sort().reduce((o, k) => { o[k] = stable(v[k]); return o; }, {})
            : v);
    let proved = false;
    try {
        const after = JSON.parse(text);
        const before = JSON.parse(raw);
        for (const key of Object.keys(want.menus)) { before.contributes.menus[key] = want.menus[key]; }
        before.contributes.commands = want.commands;
        if (want.submenus.length) { before.contributes.submenus = want.submenus; }
        proved = JSON.stringify(stable(after)) === JSON.stringify(stable(before));
        if (!proved) { console.log('  the rewrite did not match what was intended — nothing written'); }
    } catch (e) {
        console.log('  the rewrite did not parse — nothing written: ' + e.message);
    }
    ok('rewrite verified before writing', proved);
    if (proved) {
        if (text !== raw) {
            fs.writeFileSync(PKG, text, 'utf8');
            console.log('  package.json updated from the catalogue');
        } else {
            console.log('  package.json was already in sync');
        }
    }
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
