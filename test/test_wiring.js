// X-267 — A CALLBACK THAT DEFAULTS TO A NO-OP IS A WIRE THAT CAN BE LEFT OFF.
//
// ‼️ THE DEFECT THIS FILE EXISTS FOR, MEASURED. `ConsoleHost` was given a ninth
// constructor parameter, `pinProjectContext`, defaulted — as every one of its
// siblings is — to `() => {}`. `extension.ts` was never changed to pass it. The
// build compiled, `test_context_pin.js` stayed green across twenty-nine
// assertions (it constructs the host itself, with all nine), and the Console
// silently never pinned a single conversation: the `pinned/` folder was not
// even created, and every revive re-composed the brief it was supposed to
// reuse — the exact 304k-token cache miss the pin was written to stop.
//
// A missing ARGUMENT cannot be caught by the type checker (that is what the
// default is for) and cannot be caught by a suite that builds its own object
// (that is what a mock is for). It can only be caught by reading the call site.
// So that is what this does, and it is derived rather than declared: the
// parameter list comes out of the class, the argument list comes out of the
// `new`, and neither is written down here to drift.
//
// THE RULE: a constructor parameter whose default is a no-op-shaped callback
// MUST be passed at every `new` site in `src/`. A parameter marked optional
// (`?`) is exempt — absent is a meaning there. A parameter with a default that
// is a real value (`= 'claude'`, `= 200`) is exempt too: leaving it off asks
// for that value, which is a decision, not a silent nothing.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

/**
 * Strip comments and string/template bodies, keeping every other character in
 * place. Positions are preserved so an offset found in the blanked text points
 * at the same character in the original — which is how a call site is located
 * without a parser and without matching a brace inside a comment.
 */
function blank(src) {
    const out = src.split('');
    let i = 0;
    const n = src.length;
    const wipe = (a, b) => { for (let k = a; k < b && k < n; k++) { if (out[k] !== '\n') { out[k] = ' '; } } };
    while (i < n) {
        const c = src[i], d = src[i + 1];
        if (c === '/' && d === '/') { let j = src.indexOf('\n', i); if (j < 0) { j = n; } wipe(i, j); i = j; continue; }
        if (c === '/' && d === '*') { let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2; wipe(i, j); i = j; continue; }
        if (c === '"' || c === "'" || c === '`') {
            let j = i + 1;
            while (j < n) {
                if (src[j] === '\\') { j += 2; continue; }
                if (src[j] === c) { break; }
                j++;
            }
            wipe(i + 1, j); i = Math.min(j + 1, n); continue;
        }
        i++;
    }
    return out.join('');
}

/** The text between the parenthesis at `open` and the one that closes it. */
function balanced(src, open) {
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        const c = src[i];
        if (c === '(' || c === '[' || c === '{') { depth++; }
        else if (c === ')' || c === ']' || c === '}') {
            depth--;
            if (depth === 0) { return { body: src.slice(open + 1, i), end: i }; }
        }
    }
    return undefined;
}

/** Split an argument or parameter list on its TOP-LEVEL commas. */
function topLevel(body) {
    const parts = [];
    let depth = 0, start = 0;
    for (let i = 0; i < body.length; i++) {
        const c = body[i];
        // ‼️ `<` and `>` count too — `Map<string, number>` holds a comma that is
        // not a parameter break — but `=>` is NOT a closing angle, and reading
        // it as one is what made an arrow-bodied parameter swallow the rest of
        // the list. Same for `<=` and `>=` in a default expression.
        if (c === '(' || c === '[' || c === '{') { depth++; }
        else if (c === ')' || c === ']' || c === '}') { depth--; }
        else if (c === '<' && body[i + 1] !== '=') { depth++; }
        else if (c === '>' && body[i - 1] !== '=' && body[i + 1] !== '=' && depth > 0) { depth--; }
        else if (c === ',' && depth === 0) { parts.push(body.slice(start, i)); start = i + 1; }
    }
    parts.push(body.slice(start));
    return parts.map(p => p.trim()).filter(p => p !== '');
}

// A default that is a callback doing nothing: `() => {}`, `() => undefined`,
// `() => ''`, `sid => undefined`. That is the shape whose absence is invisible.
const NOOP_DEFAULT = /=\s*(\(\s*[^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*(\{\s*\}|undefined|''|""|\[\]|false)\s*$/;

/** Every `export class` in a file, with its constructor parameters. */
function classesIn(file) {
    const raw = fs.readFileSync(file, 'utf8');
    const src = blank(raw);
    const found = [];
    const re = /export\s+class\s+([A-Za-z_$][\w$]*)/g;
    let m;
    while ((m = re.exec(src))) {
        const ctor = src.indexOf('constructor(', m.index);
        if (ctor < 0) { continue; }
        // a `constructor` belonging to the NEXT class is not this one's
        const nextClass = src.slice(m.index + 1).search(/export\s+class\s+/);
        if (nextClass >= 0 && ctor > m.index + 1 + nextClass) { continue; }
        const b = balanced(src, ctor + 'constructor'.length);
        if (!b) { continue; }
        found.push({ name: m[1], file, params: topLevel(b.body) });
    }
    return found;
}

const coreDir = path.join(ROOT, 'src', 'core');
const sources = [];
const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        const st = fs.statSync(p);
        if (st.isDirectory()) { walk(p); }
        else if (/\.ts$/.test(name)) { sources.push(p); }
    }
};
walk(path.join(ROOT, 'src'));

// ------------------------------------------------- 1. the scanner is honest
{
    const probe = blank('const a = 1; // new Foo(\nconst s = "new Foo(";\n/* new Foo( */ new Foo(x, y);');
    ok('comments and strings are blanked before a call site is looked for',
        (probe.match(/new Foo\(/g) || []).length === 1);
    ok('…and the text keeps its length, so offsets still point at the original',
        blank('// x\n"y"').length === '// x\n"y"'.length);
    ok('top-level commas ignore nested calls and arrow bodies',
        topLevel('a, f(b, c), (d, e) => ({ g: 1, h: 2 }), i').length === 4);
    ok('a no-op default is recognised, a real one is not',
        NOOP_DEFAULT.test('private p: () => void = () => {}')
        && NOOP_DEFAULT.test('private q: (s: string) => number | undefined = () => undefined')
        && !NOOP_DEFAULT.test("private exe: () => string = () => 'claude'"));
}

// ------------------------------------ 2. every no-op wire is really passed
{
    const classes = [];
    for (const f of sources.filter(f => f.startsWith(coreDir))) { classes.push(...classesIn(f)); }
    ok('the core classes were found at all', classes.length > 3);

    const host = classes.find(c => c.name === 'ConsoleHost');
    ok('ConsoleHost is one of them, with its parameters read out of the source',
        !!host && host.params.length >= 9);

    // the gate, over every class that has one of these wires
    const gaps = [];
    let checked = 0;
    for (const c of classes) {
        const required = c.params
            .map((p, i) => ({ i, p }))
            .filter(x => NOOP_DEFAULT.test(x.p) && !/^\s*(private|public|protected|readonly)?\s*[\w$]+\s*\?/.test(x.p));
        if (!required.length) { continue; }
        const need = Math.max(...required.map(x => x.i)) + 1;
        for (const f of sources) {
            const src = blank(fs.readFileSync(f, 'utf8'));
            const re = new RegExp('new\\s+' + c.name + '\\s*\\(', 'g');
            let m;
            while ((m = re.exec(src))) {
                const b = balanced(src, m.index + m[0].length - 1);
                if (!b) { continue; }
                checked++;
                const args = topLevel(b.body).length;
                if (args < need) {
                    const missing = required.filter(x => x.i >= args)
                        .map(x => (x.p.split(':')[0] || x.p).trim().replace(/^(private|public|protected|readonly)\s+/, ''));
                    gaps.push(`${path.relative(ROOT, f)}: new ${c.name}(…${args} args) drops ${missing.join(', ')}`);
                }
            }
        }
    }
    ok('at least one such call site exists to measure', checked > 0);
    if (gaps.length) { for (const g of gaps) { console.log('    ' + g); } }
    ok('‼️ no constructor callback that defaults to a no-op is left unpassed', gaps.length === 0);
}

// --------------------------------- 3. and the one that started it, by name
{
    const ext = blank(fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8'));
    const at = ext.indexOf('new ConsoleHost(');
    ok('the Console host is constructed in extension.ts', at >= 0);
    const b = balanced(ext, at + 'new ConsoleHost'.length);
    const args = b ? topLevel(b.body) : [];
    const host = classesIn(path.join(ROOT, 'src', 'core', 'consolehost.ts'))
        .find(c => c.name === 'ConsoleHost');
    ok('‼️ it is handed every parameter the class declares',
        !!host && args.length === host.params.length);
    const pin = args.findIndex(a => /^\s*pinProjectContext\s*$/.test(a));
    ok('‼️ …including the pin, which is what was missing (X-267)', pin >= 0);
    ok('‼️ …and the rule resolver after it, or a rule picked in a Console box is refused (X-305 R2)',
        /launchAccountPick\(/.test(args[pin + 1] || ''));
    ok('‼️ …and the auto-answer settings last, or the host treats the feature as OFF (K-43)',
        /autoAnswerSettings\(/.test(args[pin + 2] || '') && pin + 2 === args.length - 1);
}

// ------------- 4. …and the same mistake one slot over, on every page there is
/**
 * ‼️ X-252 — AN ARGUMENT IN THE WRONG SLOT IS THE SAME WIRE, LEFT OFF.
 *
 * `AFHeader.wire(vscode, hooks)` takes the API first and the hooks second, and
 * `media/engines.js` handed it ONLY the hooks — so the hooks object sat in the
 * `vscode` slot and every header button on that page called `postMessage` on
 * something that has none. Measured on the page harness: all 16 nav buttons
 * threw `vscode.postMessage is not a function` and posted nothing, and the
 * header's own ⟳ fell through to the same dead call. Navigating away from the
 * Engines page was impossible from its own header.
 *
 * Nothing could see it. Both arguments are optional to the type checker, the
 * page renders perfectly, every string test passes, and a photograph shows a
 * row of buttons that look exactly like buttons. A press that silently does
 * nothing is indistinguishable from one that is thinking.
 *
 * So the call site is read, on EVERY page, and what is judged is the shape of
 * the first argument: an object literal there is the defect by definition.
 */
{
    const dir = path.join(ROOT, 'media');
    const bad = [], seen = [];
    for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.js'))) {
        const src = fs.readFileSync(path.join(dir, f), 'utf8');
        const re = /AFHeader\.wire\(\s*([^,)]*)/g;
        let m;
        while ((m = re.exec(src))) {
            seen.push(f);
            const first = m[1].trim();
            if (!first || first.startsWith('{')) { bad.push(f + ' → wire(' + first.slice(0, 24) + '…)'); }
        }
    }
    ok(`every page's header wiring was read (${seen.length} call sites)`, seen.length > 20);
    ok('‼️ NO PAGE HANDS AFHeader.wire ITS HOOKS IN THE API\'S SLOT'
        + (bad.length ? ' — ' + bad.join(', ') : ''),
        bad.length === 0);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
