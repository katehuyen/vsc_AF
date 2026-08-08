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
    const body = cmd => {
        // the handler runs from the command registration to the next one
        const i = ext.indexOf(`registerCommand('agentfarm.${cmd}'`);
        return i < 0 ? '' : ext.slice(i, i + 2200);
    };
    ok('agentfarm.startSession asks where it should run',
        /\? \{ surface: arg\.surface, projectId: '' \}\s*\n\s*: await pickRunSurface\(/.test(body('startSession')));
    ok('agentfarm.continueSession asks where it should run',
        /arg\?\.surface\s*\n?\s*\?\? \(await pickRunSurface\(/.test(body('continueSession')));
    // the launcher asks inside itself instead: WHERE is one of its rows
    ok('the launcher carries Where as a dimension of the launch',
        /act: 'where'/.test(ext) && /label: '\$\(window\) Where'/.test(ext));
    ok('…and honours it when you press Start',
        /if \(where === 'console'\) \{\s*\n\s*const errors = validateLaunch/.test(ext));
    ok('…and passes a caller-supplied surface straight in',
        /runLauncher\(agent, \{ \.\.\.\(lastLaunch\(\)\[agent\.id\] \?\? \{\}\) \}, arg\?\.surface\)/.test(ext));
}

// ---------- ‼️ …AND UNDER WHICH PROJECT — the same offer on every path ----------
// The Console's composer grew a project box in 3.54.0 and no other start path
// did. So ▶ on an agent in the sidebar filed the session under whatever the
// status bar happened to say, without ever showing it: the same "new session",
// two different offers, decided by which button you pressed. WHERE it runs and
// WHAT it belongs to are dimensions of the same launch and travel together.
{
    ok('the surface picker can carry the project too',
        /const pickRunSurface = async \(\s*\n?\s*what: string, opts: \{ project\?: boolean \} = \{\}/.test(ext));
    ok('…drawn by one shared row, so it says what the Console\'s chip says',
        /const launchProjectRow = \(projectId: string\)/.test(ext)
        && /'◧ No project'/.test(ext)
        && /the session is told about it before you type, and is filed under it/.test(ext));
    // ‼️ THE NAMES ARE THE SECOND STEP, NEVER THE FIRST. One row saying
    // "Project" keeps "where should this run?" and "what is this about?" from
    // competing for the same twelve rows.
    ok('…and the project NAMES live one step in, behind that row',
        /const pickLaunchProject = async \(current: string, what: string\)/.test(ext)
        && /if \(pick\.act === 'project'\) \{\s*\n\s*const chosen = await pickLaunchProject\(projectId, what\);/.test(ext));
    ok('…asked FIRST, before where it runs',
        /label: 'Filed under', kind: vscode\.QuickPickItemKind\.Separator \},\s*\n\s*launchProjectRow\(projectId\),\s*\n\s*\{ label: 'Where it runs'/.test(ext));
    // ‼️ …AND IT STARTS AT NOTHING. Inheriting the window's active project filed
    // and briefed a session under a decision taken hours ago for other work.
    ok('‼️ a new session is under NO project until somebody says so',
        /let projectId = '';/.test(ext)
        && /it starts at NO PROJECT every single time/i.test(ext));
    ok('…and the picker never writes the window\'s active project',
        /this picker never writes it \(see chooseActiveProject/.test(ext));
    ok('…while the command that owns that list still does',
        /registerCommand\('agentfarm\.setActiveProject', async \(arg\?: \{ id\?: string \}\) => \{[\s\S]{0,400}await chooseActiveProject\(\);/.test(ext));

    const startBody = ext.slice(ext.indexOf("registerCommand('agentfarm.startSession'"),
        ext.indexOf("registerCommand('agentfarm.startSession'") + 2600);
    ok('‼️ one-click Start asks for the project as well as the place',
        /pickRunSurface\(`New session for \$\{agent\.name\}`, \{ project: true \}\)/.test(startBody));
    ok('…and the answer really reaches the launch',
        /startClaudeSession\(agent, \{\}, undefined, undefined, chosen\.projectId\)/.test(startBody));
    // ▶ → In the Console opens the COMPOSER: the project can only be chosen
    // before the first prompt, and spawning on the spot skipped that moment.
    ok('…and the Console path opens the composer with the agent pinned',
        /ConsolePanel\.show\(consoleDeps, \{\s*\n\s*agentId: agent\.id, pinAgent: true, projectId: chosen\.projectId\s*\n\s*\}\);/.test(startBody));
    ok('the launcher shows it as one of its rows', /launchProjectRow\(project\),/.test(ext));
    ok('…and its Where sub-picker does NOT repeat the question',
        /const v = await pickRunSurface\(`Session for \$\{agent\.name\}`\);/.test(ext));

    // A RESUME must not be asked: its project was decided when it started and
    // stampSession refuses to overwrite that, so the answer would be discarded.
    const contBody = ext.slice(ext.indexOf("registerCommand('agentfarm.continueSession'"),
        ext.indexOf("registerCommand('agentfarm.continueSession'") + 1200);
    ok('…and a resume is not asked a question whose answer is thrown away',
        !/project: true/.test(contBody));
}

// ---------- the Console path is honest, not approximate ----------
{
    ok('a hosted start exists', /const startConsoleSession = \(\s*\n?\s*agent: AgentInfo/.test(ext));
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
    ok('…and really starts a hosted session for console', /startConsoleSession\(agent, o[,)]/.test(op));
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
