// WHERE a session runs: a terminal, or the Console.
//
// A session has had two places to live since the Console arrived, and every
// button that starts one — Start session, Start session…, Continue latest —
// still went straight to a terminal without a word. So the newer half of the
// product was invisible from the one page you start sessions from, and there was
// no way at all to start a Console session for an agent from a keyboard.
//
// The choice has to exist on EVERY path, not just the pretty one: a webview
// dropdown for the buttons, a QuickPick for the palette / a tree row / a
// keybinding, an explicit `surface` arg on the bridge for an agent. This walks
// all four, plus the two things that make the Console path honest rather than
// approximate (a hosted session has no `-n`, and `--continue` is a terminal
// affordance that has to be resolved to a session id here).
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const read = p => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const ext = read('src/extension.ts');
const agentJs = read('media/agentDetail.js');
const header = read('media/pageHeader.js');
const panel = read('src/panels/agentDetail.ts');
const base = read('src/panels/base.ts');

// ---------- the picker exists, and both places are offered ----------
{
    ok('there is one shared surface picker', /const pickRunSurface = async/.test(ext));
    ok('…offering a terminal', /In a terminal/.test(ext));
    ok('…and the Console', /In the Console/.test(ext));
    ok('…and it remembers what you picked last',
        /SURFACE_KEY/.test(ext) && /last used/.test(ext));
    ok('a cancelled picker starts nothing',
        /if \(!pick\) \{ return undefined; \}/.test(ext));
}

// ---------- every start command asks (or is told) ----------
{
    const asks = cmd => {
        // the handler runs from the command registration to the next one
        const i = ext.indexOf(`registerCommand('agentfarm.${cmd}'`);
        if (i < 0) { return false; }
        const body = ext.slice(i, i + 2200);
        return /arg\?\.surface \?\? await pickRunSurface\(/.test(body);
    };
    ['startSession', 'continueSession'].forEach(c =>
        ok(`agentfarm.${c} asks where it should run`, asks(c)));
    // the launcher asks inside itself instead: WHERE is one of its rows
    ok('the launcher carries Where as a dimension of the launch',
        /act: 'where'/.test(ext) && /label: '\$\(window\) Where'/.test(ext));
    ok('…and honours it when you press Start',
        /if \(where === 'console'\) \{\s*\n\s*const errors = validateLaunch/.test(ext));
    ok('…and passes a caller-supplied surface straight in',
        /runLauncher\(agent, \{ \.\.\.\(lastLaunch\(\)\[agent\.id\] \?\? \{\}\) \}, arg\?\.surface\)/.test(ext));
}

// ---------- the Console path is honest, not approximate ----------
{
    ok('a hosted start exists', /const startConsoleSession = \(agent: AgentInfo/.test(ext));
    ok('…and passes the launch options the CLI accepts there',
        /model: merged\.model, effort: merged\.effort, permissionMode: merged\.permissionMode/.test(ext)
        && /firstPrompt: o\.prompt\?\.trim\(\)/.test(ext));
    // a hosted session has no -n: the name is Agent Farm's own title store, so
    // it is applied when the CLI reports the id instead of being dropped
    ok('a session name is not silently dropped in the Console',
        /const wanted = o\.name\?\.trim\(\)/.test(ext)
        && /applySessionTitle\(sid, wanted\)/.test(ext));
    ok('…and the watcher lets go once it has done its job', /sub\.dispose\(\);/.test(ext));
    // `claude --continue` picks the latest session itself; a hosted session
    // resumes by id, so "latest" is resolved here
    const i = ext.indexOf("registerCommand('agentfarm.continueSession'");
    const cont = ext.slice(i, i + 2200);
    ok('Continue latest resolves "latest" for the Console',
        /sort\(\(a, b\) => \(b\.lastTs \|\| b\.mtime\) - \(a\.lastTs \|\| a\.mtime\)\)\[0\]/.test(cont));
    ok('…scoped to that agent\'s own folder',
        /normPath\(s\.cwd \?\? ''\) === normPath\(agent\.dir\)/.test(cont));
    ok('…and says so rather than opening an empty conversation that looks emptied',
        /has no earlier session in/.test(cont));
    ok('…while the terminal path still uses the CLI\'s own --continue',
        /startClaudeSession\(agent, \{ continueLast: true \}\)/.test(cont));
}

// ---------- the buttons: one button, the choice under it ----------
{
    ok('the header offers a reusable two-item menu',
        /function menu\(o\)/.test(header) && /function wireMenu\(root, id, onPick\)/.test(header)
        && /menu, wireMenu/.test(header));
    ok('…built from the same markup as a claimed nav button, so it looks identical',
        /data-afclaim="\$\{o\.id\}"/.test(header) && /af-claim-menu/.test(header));
    ok('all three start buttons are menus now',
        (agentJs.match(/window\.AFHeader\.menu\(\{/g) || []).length === 3);
    ok('…offering the same two places, in the host\'s own words',
        /id: 'terminal', label: 'In a terminal'/.test(agentJs)
        && /id: 'console', label: 'In the Console'/.test(agentJs));
    ok('…and the pick rides along to the host',
        (agentJs.match(/wireMenu\(document, '\w+',\s*\n?\s*surface => vscode\.postMessage/g) || []).length === 3);
    // the old plain buttons must be gone, or a click would do the terminal
    // thing again without asking
    ok('no start button posts without a surface any more',
        !/getElementById\('start'\)/.test(agentJs)
        && !/getElementById\('launch'\)/.test(agentJs)
        && !/getElementById\('continue'\)/.test(agentJs));
}

// ---------- the host trusts nothing it is handed ----------
{
    ok('a webview surface is sanitised, not believed',
        /export function runSurface\(v: unknown\)/.test(base)
        && /v === 'terminal' \|\| v === 'console' \? v : undefined/.test(base));
    ok('…and an unknown value falls back to ASKING, never to a silent default',
        /never to silently[\s*]+running somewhere the user did not choose/.test(base));
    ok('the agent page routes the three messages through it',
        (panel.match(/surface: runSurface\(msg\.surface\)/g) || []).length === 3);
}

// ---------- an agent can do it too (bridge) ----------
{
    const i = ext.indexOf("op: 'sessions.start'");
    const op = ext.slice(i, i + 3000);
    ok('sessions.start documents the surface argument', /surface\? \(terminal/.test(op));
    ok('…validates it instead of guessing', /surface must be "terminal" or "console"/.test(op));
    ok('…defaults to the terminal, as it always did', /optStr\(args, 'surface'\) \|\| 'terminal'/.test(op));
    ok('…and really starts a hosted session for console', /startConsoleSession\(agent, o\)/.test(op));
    ok('…reporting back where it went', /surface \};/.test(op));
}

// ---------- and it is written down where users look ----------
{
    const en = read('docs/BLUEPRINT.en.md');
    const tr = read('docs/BLUEPRINT.tr.md');
    ok('the English guide explains the choice', /terminal or (in )?the Console/i.test(en));
    ok('the Turkish guide explains the choice', /terminalde mi|Console'da mı/i.test(tr));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
