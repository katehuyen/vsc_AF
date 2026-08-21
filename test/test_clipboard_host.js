// U-82 — every "Copy ▸" in the extension, measured end to end.
//
// ‼️ WHY THIS FILE EXISTS. `AFCtx.copy` is on nearly every object's menu and it
// wrote through `navigator.clipboard`, which requires the document to be
// FOCUSED. Every one of those calls arrives from a menu pick, and the menu is
// VS Code's own — focus is elsewhere at exactly the moment the page writes. So
// the whole family failed together, on every page, and looked like dead menu
// items. Nothing said so, because a copy changes nothing you can see.
//
// What is proved here, so the fix cannot rot back:
//
//   * the page ASKS THE HOST (`afClipboard`) instead of writing itself;
//   * it says nothing until the host answers — a "Copied:" line drawn before
//     the write is the silent lie this replaced;
//   * a refusal is reported, not swallowed;
//   * the host side really uses `vscode.env.clipboard` and is wired from the
//     mint-once path every page goes through, so no panel has to opt in;
//   * no page in media/ has its own `navigator.clipboard` write any more.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

/** afCtx.js on its own, with a host door that records what it was asked. */
function load() {
    const posted = [];
    const onMessage = [];
    const api = { postMessage: m => posted.push(m), getState: () => ({}), setState: () => { } };
    let acquired = 0;
    const sandbox = {
        // The real thing throws on a second call, so a shim that hands out a
        // fresh object each time would hide the bug this file cares about.
        acquireVsCodeApi: () => {
            if (acquired++) { throw new Error('An instance of the VS Code API has already been acquired'); }
            return api;
        },
        window: {
            __AFUI__: { ctxPanel: 'projects#1' },
            addEventListener: (ev, fn) => { if (ev === 'message') { onMessage.push(fn); } }
        },
        document: { getElementById: () => null, createElement: () => ({ style: {} }), body: null },
        navigator: {
            clipboard: {
                writeText: () => { throw new Error('the page must not write the clipboard itself'); }
            }
        },
        setTimeout: () => 0, clearTimeout: () => { },
        console, Date, Math, JSON, String, Number, Object, Array, RegExp, Set, Map, Error
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'media', 'afCtx.js'), 'utf8'), sandbox);
    return {
        AFCtx: sandbox.window.AFCtx,
        posted,
        sandbox,
        send: data => onMessage.forEach(fn => fn({ data }))
    };
}

// ---- the page asks, and waits ------------------------------------------
{
    const p = load();
    const said = [];
    p.AFCtx.copy('U-82', (msg, bad) => said.push([msg, bad]));

    const asked = p.posted[p.posted.length - 1];
    ok('the copy goes to the host', asked && asked.type === 'afClipboard');
    ok('with the text', asked && asked.text === 'U-82');
    ok('and a token to answer', asked && typeof asked.token === 'number' && asked.token > 0);
    ok('nothing is claimed before the host answers', said.length === 0);

    p.send({ type: 'afClipboardDone', token: asked.token, ok: true });
    ok('the copy is reported once it happened', said.length === 1 && !said[0][1]);
    ok('and says what landed there', said.length === 1 && said[0][0] === 'Copied: U-82');

    p.send({ type: 'afClipboardDone', token: asked.token, ok: true });
    ok('a repeated answer is not reported twice', said.length === 1);
}

// ---- a refusal is not swallowed ----------------------------------------
{
    const p = load();
    const said = [];
    p.AFCtx.copy('x', (msg, bad) => said.push([msg, bad]));
    p.send({ type: 'afClipboardDone', token: p.posted[0].token, ok: false, error: 'The clipboard refused that.' });
    ok('a refusal is reported as an error', said.length === 1 && said[0][1] === true);
    ok('in the host\'s own words', said[0][0] === 'The clipboard refused that.');
}

// ---- a row that carries nothing never reaches the host ------------------
{
    const p = load();
    const said = [];
    p.AFCtx.copy('', (msg, bad) => said.push([msg, bad]));
    ok('an empty copy is refused in the page', p.posted.length === 0);
    ok('and says why', said.length === 1 && said[0][1] === true && /Nothing to copy/.test(said[0][0]));
}

// ---- the api is acquired once and handed on -----------------------------
{
    const p = load();
    ok('afCtx took the host door', typeof p.sandbox.window.acquireVsCodeApi === 'function');
    // The page script loads after this file and calls the same name; without the
    // hand-on it gets the "already acquired" throw and no page works at all.
    let handedOn = null;
    try { handedOn = p.sandbox.window.acquireVsCodeApi(); } catch { handedOn = null; }
    ok('and hands the SAME instance to the page after it', handedOn && typeof handedOn.postMessage === 'function');
    ok('the page shares the one state store', handedOn && typeof handedOn.getState === 'function');
}

// ---- the host end ------------------------------------------------------
{
    const base = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'base.ts'), 'utf8');
    ok('the host answers afClipboard', /msg\.type !== 'afClipboard'/.test(base));
    ok('and writes with vscode.env.clipboard', /vscode\.env\.clipboard\.writeText/.test(base));
    ok('and answers back', /afClipboardDone/.test(base));
    // ‼️ Wired from ctxKeyFor, which htmlShell calls for every page exactly
    // once. A panel-by-panel wiring is a panel that forgets.
    ok('every page is wired without opting in', /function ctxKeyFor[\s\S]{0,400}wireClipboard\(webview\)/.test(base));
}

// ---- nobody writes the clipboard from a page any more --------------------
{
    const dir = path.join(ROOT, 'media');
    // Comments are stripped first: two files EXPLAIN why the host holds the
    // clipboard, and a guard that fires on the explanation is a guard nobody
    // can keep.
    const code = f => fs.readFileSync(path.join(dir, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
    const offenders = fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'afCtx.js')
        .filter(f => /navigator\s*\.\s*clipboard/.test(code(f)));
    ok('no page writes the clipboard itself — afCtx is the one door: ' + (offenders.join(', ') || 'none'),
        offenders.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
