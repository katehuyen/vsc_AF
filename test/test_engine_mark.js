// The engine mark and the palette behind it (media/afEngine.js + common.css),
// and the project mark that shares the same stylesheet.
//
// ‼️ WHY A TEST FILE FOR FOUR COLOURS. Both of the failures this pins were
// invisible to every other test in the repo and obvious to a person in one
// second — which is exactly the class docs/CONVENTIONS.md → "Looking at it" is
// about, and the half of it a picture cannot pin. A palette is a set of
// CONSTRAINTS ("Antigravity is not the colour the extension signals OK with",
// "no two engines share a hue"), and a constraint is a test, not a screenshot.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const media = f => fs.readFileSync(path.resolve(__dirname, '..', 'media', f), 'utf8');
const CSS = media('common.css');

// A stray comment terminator can make the browser discard the rule that
// follows it even though a source-text regex still finds that rule. U-39 did
// exactly that: the assertion below saw max-width, Chromium did not.
ok('CSS comments are balanced before any rule is trusted',
    (CSS.match(/\/\*/g) || []).length === (CSS.match(/\*\//g) || []).length);

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(media('afEngine.js'), sandbox);
const E = sandbox.window.AFEngine;

// ---------- the component ----------
{
    ok('an id resolves to what a person calls it',
        E.label('agy') === 'Antigravity' && E.label('codex') === 'Codex');
    // ‼️ A Claude transcript carries NO engine field: the answer is an absence,
    // which is the whole reason the table could not say "Claude" out loud.
    ok('‼️ nothing means Claude, not "unknown"', E.id('') === 'claude' && E.id(undefined) === 'claude');
    ok('an id this build never heard of is still drawn, as itself',
        /class="af-eng af-engc other"/.test(E.badge('llamalab')) && /llamalab/.test(E.badge('llamalab')));
    // U-40: the colour is now a variable so a tab can wear it too, and the class
    // that carries it is the component's answer — never a page's own string.
    ok('‼️ the colour class is the component\'s to give, for badges and non-badges alike',
        E.cls('agy') === 'af-engc agy' && E.cls('nope') === 'af-engc other');
    ok('the badge carries both classes, so it keeps resolving --af-engc',
        /class="af-eng af-engc claude"/.test(E.badge('claude')));
    ok('a title is escaped, and absent when not passed',
        !/title=/.test(E.badge('codex'))
        && /title="Turns: 3 &quot;x&quot;"/.test(E.badge('codex', 'Turns: 3 "x"')));
}

// ---------- the palette ----------
{
    const hue = id => {
        const m = new RegExp(`\\.af-engc\\.${id}\\s*\\{\\s*--af-engc:\\s*([^;]+);`).exec(CSS);
        return m ? m[1].trim() : '';
    };
    const ids = ['claude', 'codex', 'gemini', 'agy', 'other'];
    ok('every engine this build knows has a declared hue',
        E.known.every(id => hue(id).length > 0) && hue('other').length > 0);
    ok('‼️ no two engines share one — the badge answers WHICH, not "not the default"',
        new Set(ids.map(hue)).size === ids.length);
    // ‼️ U-49 — THE ONE THE USER CAUGHT. Green is this extension's own signal
    // colour (the live dot, an OK engine card, an assistant message), so an
    // Antigravity badge in green read as "this row is fine" on every surface.
    // Blue is the worse alternative, not the safe one: Gemini already wears it
    // and both are Google, which blurs exactly the two engines a session list
    // most needs to tell apart.
    ok('‼️ Antigravity is not the colour this extension signals OK with',
        !/charts-green/.test(hue('agy')));
    ok('‼️ …and not Gemini\'s blue either — they are the two Google rows',
        hue('agy') !== hue('gemini') && !/charts-blue/.test(hue('agy')));
    ok('the palette is VS Code\'s own, so it survives a theme change',
        E.known.every(id => /var\(--vscode-/.test(hue(id))));
    // The badge must READ the variable, or the whole indirection is decoration.
    ok('the badge resolves the variable rather than declaring a colour of its own',
        /\.af-eng\s*\{[^}]*color:\s*var\(--af-engc/.test(CSS));
}

// ---------- U-39: a mark inside a column it does not own ----------
{
    // ‼️ The sessions table is `table-layout: fixed` with `overflow: visible`
    // cells, and the project mark is an inline-flex box — which is sized by its
    // CONTENT. So a project whose name did not fit its declared column did not
    // ellipsis, it drew straight over the Title beside it and the two texts sat
    // on top of each other. Capping the MARK is what hands the shrink to the
    // name, whose `overflow: hidden` already gives it a zero automatic minimum.
    const proj = /\.af-proj\s*\{([^}]*)\}/.exec(CSS);
    ok('‼️ the project mark cannot grow past the cell it is drawn in',
        !!proj && /max-width:\s*100%/.test(proj[1]));
    ok('…and the NAME is the part that shrinks, not the dot or the icon',
        /\.af-pname\s*\{[^}]*overflow:\s*hidden/.test(CSS)
        && /\.af-pname\s*\{[^}]*text-overflow:\s*ellipsis/.test(CSS)
        && /\.af-pdot\s*\{[^}]*flex:\s*none/.test(CSS)
        && /\.af-picon\s*\{[^}]*flex:\s*none/.test(CSS));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
