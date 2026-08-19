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
        /\? \{ surface: arg\.surface, projectId: '', engine: [^}]+\}\s*\n\s*: await pickRunSurface\(/.test(body('startSession')));
    ok('agentfarm.continueSession asks where it should run',
        /arg\?\.surface\s*\n?\s*\?\? \(await pickRunSurface\(/.test(body('continueSession')));
    // the launcher asks inside itself instead: WHERE is one of its rows
    ok('the launcher carries Where as a dimension of the launch',
        /act: 'where'/.test(ext) && /label: '\$\(window\) Where'/.test(ext));
    ok('…and honours it when you press Start',
        /if \(where === 'console'\) \{\s*\n\s*const errors = validateLaunch/.test(ext));
    ok('…and passes a caller-supplied surface straight in',
        /await runLauncher\(agent, seed,\s*\n\s*arg\?\.surface \?\? lastWhere/.test(ext));
    // ‼️ S-34 — THE LAUNCHER REOPENS ON THE SURFACE THIS AGENT LAST RAN ON.
    // It remembered the engine, the model, the effort and the permissions and
    // then opened on a terminal whatever the last session had been, so a setup
    // that was right in four dimensions out of five read as "it does not
    // remember" — the window is the part you see before you have read a row.
    ok('…the surface is stored with the rest of the setup',
        /surface: where\s*\n\s*\}\s*\n\s*\};\s*\n\s*await context\.globalState\.update\(LAST_LAUNCH_KEY/.test(ext));
    ok('…and read back before the window\'s last answer, then a terminal',
        /const \{ surface: lastWhere, \.\.\.seed \} = lastLaunch\(\)\[agent\.id\] \?\? \{\}/.test(ext)
        && /\?\? context\.globalState\.get<RunSurface>\(SURFACE_KEY\) \?\? 'terminal'/.test(ext));
    // …and the Start row SAYS which saved profile it is showing, or the
    // remembering is invisible and indistinguishable from not remembering.
    ok('…and the Start row names the profile the setup matches',
        /const isProfile = matchProfile\(launchProfiles\(\), o, where\)/.test(ext)
        && /isProfile \? `profile/.test(ext));
}

// ---------- ‼️ …AND UNDER WHICH PROJECT — the same offer on every path ----------
// The Console's composer grew a project box in 3.54.0 and no other start path
// did. So ▶ on an agent in the sidebar filed the session under whatever the
// status bar happened to say, without ever showing it: the same "new session",
// two different offers, decided by which button you pressed. WHERE it runs and
// WHAT it belongs to are dimensions of the same launch and travel together.
{
    ok('the surface picker can carry the project too',
        /const pickRunSurface = async \(\s*\n?\s*what: string, opts: \{ project\?: boolean; engine\?: boolean \} = \{\}/.test(ext));
    ok('…drawn by one shared row, so it says what the Console\'s chip says',
        /const launchProjectRow = \(\s*\n?\s*projectId: string, fromStatusBar = false\s*\n?\s*\)/.test(ext)
        && /'◧ No project'/.test(ext)
        && /the session is told about it before you type, and is filed under it/.test(ext));
    // ‼️ THE NAMES ARE THE SECOND STEP, NEVER THE FIRST. One row saying
    // "Project" keeps "where should this run?" and "what is this about?" from
    // competing for the same twelve rows.
    ok('…and the project NAMES live one step in, behind that row',
        /const pickLaunchProject = async \(current: string, what: string\)/.test(ext)
        && /if \(pick\.act === 'project'\) \{\s*\n\s*const chosen = await pickLaunchProject\(projectId, what\);/.test(ext));
    ok('…asked FIRST, before where it runs',
        /label: 'Filed under', kind: vscode\.QuickPickItemKind\.Separator \},\s*\n\s*launchProjectRow\(projectId, seeded\),/.test(ext));

    // ---- U-16: it OPENS ON THE ACTIVE PROJECT, and says where that came from
    //
    // ‼️ THE DANGER WAS SILENCE, NOT INHERITANCE. Starting at nothing was the
    // answer to a session filed and briefed under a decision taken hours ago
    // for other work — but a window whose status bar names an active project,
    // that then offers "No project" for the session you start from the tree, is
    // asking the same thing to be said twice. So it inherits AND states it: the
    // row credits the status bar, and the row under it drops or changes it in
    // one press. Nothing is active → No project, exactly as before.
    ok('‼️ a new session opens on the window\'s active project when there is one',
        /let projectId = opts\.project \? seedLaunchProject\(\) : '';/.test(ext)
        && /it OPENS ON THE WINDOW'S ACTIVE PROJECT when there is one/.test(ext));
    ok('…and a closed or archived project is never the one it opens on',
        /const seedLaunchProject = \(\): string => \{[\s\S]{0,320}CLOSED_PROJECT_STATUSES\.includes\(p\.status\) \? '' : ''/.test(ext)
        || /return p && !CLOSED_PROJECT_STATUSES\.includes\(p\.status\) \? id : '';/.test(ext));
    ok('…the row says the project came from the status bar rather than from you',
        /fromStatusBar \? ' • the window\\'s active project' : ''/.test(ext));
    ok('‼️ …and the way out is a ROW, not a habit — one press to change or drop it',
        /\.\.\.\(projectId \? \[\{\s*\n\s*label: '\$\(list-selection\) Choose a different project…',/.test(ext)
        && /description: 'or no project at all',/.test(ext));
    ok('…once you have chosen here, the row stops crediting the status bar',
        /if \(chosen !== undefined\) \{ projectId = chosen; seeded = false; \}/.test(ext));
    ok('…and the picker never writes the window\'s active project',
        /This picker never WRITES the active project/.test(ext));
    ok('…while the command that owns that list still does',
        /registerCommand\('agentfarm\.setActiveProject', async \(arg\?: \{ id\?: string \}\) => \{[\s\S]{0,400}await chooseActiveProject\(\);/.test(ext));

    const startBody = ext.slice(ext.indexOf("registerCommand('agentfarm.startSession'"),
        ext.indexOf("registerCommand('agentfarm.startSession'") + 2600);
    ok('‼️ one-click Start asks for the project as well as the place',
        /pickRunSurface\(`New session for \$\{agent\.name\}`, \{ project: true \}\)/.test(startBody));
    ok('…and the answer really reaches the launch',
        /startClaudeSession\(agent, \{ engine: chosen\.engine as EngineId \},\s*\n\s*undefined, undefined, chosen\.projectId\)/.test(startBody));
    // ▶ → In the Console opens the COMPOSER: the project can only be chosen
    // before the first prompt, and spawning on the spot skipped that moment.
    ok('…and the Console path opens the composer with the agent pinned',
        /ConsolePanel\.show\(consoleDeps, \{\s*\n\s*agentId: agent\.id, pinAgent: true, projectId: chosen\.projectId,/.test(startBody));
    ok('the launcher shows it as one of its rows', /launchProjectRow\(project, projectSeeded\),/.test(ext));
    // In the launcher every line is a control, so the project row does not have
    // to argue that it is one — no escape row there, but the same seeding.
    ok('…seeded the same way, so the two start paths cannot disagree',
        /let project = seedLaunchProject\(\);/.test(ext));
    ok('…and its Where sub-picker does NOT repeat the question',
        /const v = await pickRunSurface\(`Session for \$\{agent\.name\}`, \{ engine: false \}\);/.test(ext));

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
    const cont = ext.slice(i, i + 5200);
    ok('Continue latest resolves "latest" for the Console',
        /sort\(\(a, b\) => \(b\.lastTs \|\| b\.mtime\) - \(a\.lastTs \|\| a\.mtime\)\)\[0\]/.test(cont));
    ok('…scoped to that agent\'s own folder',
        /normPath\(s\.cwd \?\? ''\) === normPath\(agent\.dir\)/.test(cont));
    ok('…and says so rather than opening an empty conversation that looks emptied',
        /has no earlier session in/.test(cont));
    // ‼️ …AND "LATEST" MEANS LATEST ON ANY ENGINE (X-35). The terminal arm used
    // to run `claude --continue` unconditionally and the Console arm to pick out
    // of the Claude-only pool, so on a machine whose newest work was a Codex
    // conversation the command reopened an older Claude one. The row is now
    // chosen from the whole record and what happens next follows the engine that
    // row names — including the case where that engine cannot resume in a
    // terminal at all (Codex), which is offered the Console instead of being
    // silently started fresh.
    ok('…and "latest" is the latest on ANY engine, not the latest Claude one',
        /index\.allWithExternal\(\)/.test(cont));
    ok('…while the terminal path still uses the CLI\'s own --continue where it has one',
        /continueLast: true/.test(cont));
    ok('‼️ …and an engine that cannot resume in a terminal says so instead of starting fresh',
        /resumeInTerminal/.test(cont) && /Continue it in the Console/.test(cont));
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
    // the slice has to reach past the `describe`, which grew when the engine
    // axis arrived — a window that stops inside the prose tests nothing
    const op = ext.slice(i, ext.indexOf("op: 'sessions.rename'", i));
    ok('sessions.start documents the surface argument', /surface\? \(terminal/.test(op));
    ok('…validates it instead of guessing', /surface must be "terminal" or "console"/.test(op));
    ok('…defaults to the terminal, as it always did', /optStr\(args, 'surface'\) \|\| 'terminal'/.test(op));
    ok('…and really starts a hosted session for console', /startConsoleSession\(agent, o[,)]/.test(op));
    ok('…reporting back where it went', /surface, \.\.\.shape \}/.test(op));
}

// ---------- X-18: WHICH ENGINE is a dimension of the same launch ----------
//
// ‼️ THE SAME MISTAKE THE SURFACE MADE, ONE LAYER DOWN. A second engine existed
// and could only be reached from the bridge: every button that starts a session
// went to `claude` without a word, exactly as every button used to go to a
// terminal without a word. So the engine is offered on the SAME pickers, in the
// same shape — one row naming the current answer, the list one step in — and an
// engine this machine cannot run is refused with the one thing to do about it
// rather than started and left to die on its first turn.
{
    ok('there is one shared engine picker', /const pickEngine = async/.test(ext));
    ok('…listing what this machine can run, from the one matrix',
        /engineOptions\(engineMatrix\(\)\)\.map/.test(ext));
    ok('‼️ …and an engine that cannot run STAYS in the list rather than vanishing',
        /if \(pick\.ready\) \{ return pick\.id; \}/.test(ext)
        && /hiding it makes "this build has no|stays IN the list/i.test(ext));
    ok('…offering the page that fixes it, then coming back',
        /'Open Engines'/.test(ext) && /EnginesPanel\.show\(enginesPanelDeps\)/.test(ext));

    ok('the surface picker carries the engine as its first question',
        /label: 'Runs on', kind: vscode\.QuickPickItemKind\.Separator \}, engineRow\]/.test(ext)
        || /\{ label: 'Runs on', kind: vscode\.QuickPickItemKind\.Separator \},\s*\n\s*engineRow,/.test(ext));
    ok('…and returns it with the rest of the answer',
        /interface RunChoice \{ surface: RunSurface; projectId: string; engine: string \}/.test(ext)
        && /return \{ surface: pick\.surface, projectId, engine \};/.test(ext));
    ok('…opening on the DEFAULT rather than on the last one-off',
        /let engine = \(launchDefaults\(\)\.engine \|\| 'claude'\);/.test(ext));
    ok('the full launcher has an Engine row of its own',
        /label: '\$\(server-process\) Engine'/.test(ext) && /act: 'engine'/.test(ext));
    // ‼️ …WITH THE FOLDER ON IT. Antigravity works in its own scratch workspace
    // unless it is handed one (`--add-dir`), so the preview the launcher prints
    // has to be the line that will actually run — otherwise it shows a command
    // that reads this repo and starts one that reads somewhere else.
    ok('…and builds the command line for THAT engine, not always claude\'s',
        /const command = buildLaunchCommand\(spec\.exe, \{ \.\.\.merged, cwd: merged\.cwd \?\? agent\.dir \}\);/.test(ext));
    ok('…and can save it as the default for every session',
        /engine: spec\.id === 'claude' \? '' : spec\.id,/.test(ext));

    // ‼️ The refusal is not the picker's job alone — a webview, a keybinding and
    // the bridge all reach the same two functions, so it lives THERE.
    ok('a terminal launch refuses an engine this machine cannot run',
        /const refused = engineRefusal\(engineMatrix\(\), spec\.id\);/.test(ext));
    ok('…and so does a hosted one',
        /const refused = engineRefusal\(engineMatrix\(\), merged\.engine\);/.test(ext));
    ok('‼️ …and a terminal on an engine with no system-prompt channel SAYS the project was not sent',
        /has no system-prompt channel, so this terminal session was NOT told about the project/.test(ext));
    ok('‼️ a RESUME is pinned to the engine its transcript belongs to',
        /const engine = \(s\.source && s\.source in ENGINES \? s\.source : 'claude'\) as EngineId/.test(ext)
        && /\n\s*engine,\s*\n\s*model: s\.models/.test(ext)
        && /projectId: sessionOwnProject\(s\)/.test(ext));

    const startOp = ext.slice(ext.indexOf("op: 'sessions.start'"),
        ext.indexOf("op: 'sessions.rename'"));
    // ‼️ Derived from `ENGINES`, not typed out — the same fix as tasks.add. A
    // hand-written "claude or codex" is how this contract came to omit Gemini
    // for weeks while Gemini was a first-class engine (X-35).
    ok('sessions.start takes the engine too, named from the registry',
        /engine\? \('/.test(startOp)
        && /Object\.values\(ENGINES\)\.map\(e => `\$\{e\.id\} = \$\{e\.label\}`\)/.test(startOp));
    // ‼️ B-12 — THE FACT IS NOW READ OFF THE REGISTRY, not typed. The sentence
    // named three engines that resume in a terminal and one that does not; a
    // fifth arrived that DOES (`opencode -s <ses_...>`) and was in neither half,
    // so a caller reading the contract concluded it could not be continued.
    ok('‼️ …and states resume-in-terminal as a per-engine FACT read off the registry',
        /filter\(e => e\.resumeInTerminal\)/.test(startOp)
        && /filter\(e => !e\.resumeInTerminal\)/.test(startOp)
        && /--resume <id>/.test(startOp));
    ok('…refusing one that cannot run, in the RESPONSE',
        /const engineRefused = engineRefusal\(engineMatrix\(\), merged\.engine\);/.test(startOp));
    ok('…and stating what that engine changes about a turn',
        /turnShape: spec\.shape,/.test(startOp) && /reportsCost: spec\.reportsCost/.test(startOp));
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
