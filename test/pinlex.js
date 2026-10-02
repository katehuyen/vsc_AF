// X-468 — reads every `ok(<title>, <condition>)` call out of a test file's SOURCE, so a pinned
// incident guard can be found, and its whole statement fingerprinted, without running it.
// A small lexer: strings, template literals (with ${} nesting), regex literals and comments are
// skipped while the parentheses are counted, because an assertion's regex is full of them.
'use strict';
const crypto = require('crypto');

const KEYWORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'void', 'delete', 'instanceof', 'new', 'throw', 'else', 'do', 'yield', 'await']);

/** A `/` at `i` opens a regex unless what precedes it ends an operand. */
function regexAllowed(s, i) {
    let j = i - 1;
    while (j >= 0 && /\s/.test(s[j])) { j--; }
    if (j < 0) { return true; }
    const ch = s[j];
    if (/[\w$]/.test(ch)) {
        let k = j;
        while (k >= 0 && /[\w$]/.test(s[k])) { k--; }
        return KEYWORDS.has(s.slice(k + 1, j + 1));
    }
    return !(ch === ')' || ch === ']' || ch === '\'' || ch === '"' || ch === '`');
}

/** Index just past the comment/string/template/regex opening at `i`, or -1 when `i` opens none. */
function skipToken(s, i) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '/') { const e = s.indexOf('\n', i); return e < 0 ? s.length : e; }
    if (c === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i + 2); return e < 0 ? s.length : e + 2; }
    if (c === '\'' || c === '"') {
        let j = i + 1;
        while (j < s.length && s[j] !== c && s[j] !== '\n') { j += s[j] === '\\' ? 2 : 1; }
        return j + 1;
    }
    if (c === '`') {
        let j = i + 1;
        while (j < s.length && s[j] !== '`') {
            if (s[j] === '\\') { j += 2; continue; }
            if (s[j] === '$' && s[j + 1] === '{') { j = closeOf(s, j + 1, '{', '}'); continue; }
            j++;
        }
        return j + 1;
    }
    if (c === '/' && regexAllowed(s, i)) {
        let j = i + 1, cls = false;
        while (j < s.length && s[j] !== '\n') {
            if (s[j] === '\\') { j += 2; continue; }
            if (s[j] === '[') { cls = true; } else if (s[j] === ']') { cls = false; } else if (s[j] === '/' && !cls) { break; }
            j++;
        }
        j++;
        while (j < s.length && /[a-z]/i.test(s[j])) { j++; }
        return j;
    }
    return -1;
}

/** Index just past the bracket that closes the one opening at `open` (s[open] === o). */
function closeOf(s, open, o, c) {
    let depth = 0;
    for (let i = open; i < s.length;) {
        const t = skipToken(s, i);
        if (t >= 0) { i = t; continue; }
        if (s[i] === o) { depth++; } else if (s[i] === c) { depth--; if (depth === 0) { return i + 1; } }
        i++;
    }
    return s.length;
}

/** The decoded value of the plain string literal at `i`, or undefined when there is none. */
function literalAt(s, i) {
    const q = s[i];
    if (q !== '\'' && q !== '"' && q !== '`') { return undefined; }
    const body = s.slice(i + 1, skipToken(s, i) - 1);
    if (q === '`' && body.includes('${')) { return undefined; }
    return body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (m, e) => {
        if (e[0] === 'u' && e.length > 1) { return String.fromCodePoint(parseInt(e.replace(/[u{}]/g, ''), 16)); }
        if (e[0] === 'x' && e.length > 1) { return String.fromCharCode(parseInt(e.slice(1), 16)); }
        return ({ n: '\n', t: '\t', r: '\r' })[e] ?? e;
    });
}

function fingerprint(statement) {
    return crypto.createHash('sha1').update(statement, 'utf8').digest('hex').slice(0, 12);
}

/** Every `ok(...)` call outside comments: { title, statement, hash, line }; statement whitespace is normalised. */
function assertionsOf(src) {
    const s = String(src).replace(/\r\n/g, '\n');
    const out = [];
    for (let i = 0; i < s.length;) {
        const t = skipToken(s, i);
        if (t >= 0) { i = t; continue; }
        if (s.startsWith('ok(', i) && !/[\w$.]/.test(s[i - 1] || '')) {
            const open = i + 2;
            let a = open + 1;
            while (/\s/.test(s[a])) { a++; }
            const title = literalAt(s, a);
            if (title !== undefined) {
                const statement = s.slice(i, closeOf(s, open, '(', ')')).replace(/\s+/g, ' ');
                out.push({ title, statement, hash: fingerprint(statement), line: s.slice(0, i).split('\n').length });
            }
            i = open + 1;
            continue;
        }
        i++;
    }
    return out;
}

/** The top-level arguments of the call whose `(` is at `open`, as source text (trimmed). */
function argsOf(s, open) {
    const end = closeOf(s, open, '(', ')') - 1;
    const args = [];
    let depth = 0, from = open + 1;
    for (let i = open + 1; i < end;) {
        const t = skipToken(s, i);
        if (t >= 0) { i = t; continue; }
        const c = s[i];
        if (c === '(' || c === '[' || c === '{') { depth++; } else if (c === ')' || c === ']' || c === '}') { depth--; } else if (c === ',' && depth === 0) { args.push(s.slice(from, i).trim()); from = i + 1; }
        i++;
    }
    const last = s.slice(from, end).trim();
    if (last) { args.push(last); }
    return { args, end: end + 1 };
}

/** Every call `name(` of the given names in code (not comments or strings, not `.name(`, not a declaration). */
function callsOf(src, names) {
    const s = String(src).replace(/\r\n/g, '\n');
    const re = new RegExp('^(' + names.join('|') + ')\\(');
    const out = [];
    for (let i = 0; i < s.length;) {
        const t = skipToken(s, i);
        if (t >= 0) { i = t; continue; }
        if (/[A-Za-z_$]/.test(s[i]) && !/[\w$.]/.test(s[i - 1] || '')) {
            const m = re.exec(s.slice(i, i + 40));
            if (m && !/\bfunction\s+$/.test(s.slice(Math.max(0, i - 12), i))) {
                const open = i + m[1].length;
                const { args, end } = argsOf(s, open);
                // a method declaration `name(a: T) {` is not a call: typed parameters, or a body straight after
                const declared = /^[\w$]+\??\s*:\s*[\w${[(]/.test(args[0] || '') || /^\s*\{/.test(s.slice(end, end + 20));
                if (!declared) { out.push({ name: m[1], args, text: s.slice(i, end).replace(/\s+/g, ' '), line: s.slice(0, i).split('\n').length }); }
                i = open + 1;
                continue;
            }
            while (/[\w$]/.test(s[i] || '')) { i++; }
            continue;
        }
        i++;
    }
    return out;
}

/** The source with comments (and, unless `keepStrings`, string contents) blanked, line structure kept. */
function codeOnly(src, keepStrings = false) {
    const s = String(src).replace(/\r\n/g, '\n');
    let out = '';
    for (let i = 0; i < s.length;) {
        const t = skipToken(s, i);
        if (t >= 0) {
            const piece = s.slice(i, t);
            const comment = piece.startsWith('//') || piece.startsWith('/*');
            out += comment ? piece.replace(/[^\n]/g, ' ') : keepStrings ? piece : piece[0] + piece.slice(1, -1).replace(/[^\n]/g, ' ') + piece.slice(-1);
            i = t;
            continue;
        }
        out += s[i++];
    }
    return out;
}

module.exports = { assertionsOf, fingerprint, callsOf, argsOf, codeOnly };
