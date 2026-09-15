// S-48 — THE ROW YOU PRESSED IS THE AGENT YOU GET.
//
// ‼️ THE DEFECT THIS SUITE EXISTS FOR, IN THE USER'S OWN WORDS: "I go to that
// agent's row on purpose and press its triangle, and it asks me to pick an
// agent again — I picked a different one and it really started that one, so
// pressing the row meant nothing." It was INTERMITTENT, and it began when the
// engine work multiplied the live events.
//
// Two things are held here, because the defect has two halves:
//
//   1. THE ARGUMENT, when there is one. It NAMES an agent; the fleet answers.
//      A tree row hands over its own `AgentInfo`, which is a snapshot of the
//      fleet as of the last redraw — believed on sight, it starts a session in
//      a folder that may not be there any more. And an argument naming somebody
//      the fleet does not have is REFUSED BY NAME, never turned into a menu:
//      a stale row must not become a keystroke away from a different agent.
//
//   2. THE ARGUMENT GOING MISSING, which is what the user actually hit. An
//      inline tree action cannot carry arguments of its own — the element IS
//      the argument — so a redraw landing under the press takes it away. The
//      cure is that the Agents tree stops being rebuilt once per hook event
//      (`refreshAgentsTree`); the belt is that ▶ asks the view which row it is
//      standing on before it asks the person (`withAgentsRow`).
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const A = require(path.join(ROOT, 'out', 'core', 'agentArg.js'));

const dev = { id: 'a-dev', name: 'developer', dir: 'D:/a/dev' };
const mgr = { id: 'a-mgr', name: 'manager', dir: 'D:/a/mgr' };
const FLEET = [dev, mgr];

// ---------------------------------------------------------------- the shapes
{
    // The sidebar row, exactly as `AgentsTreeProvider.getChildren` builds it.
    const node = { kind: 'agent', agent: dev };
    const r = A.resolveAgentArg(node, FLEET);
    ok('‼️ a tree node resolves to that row\'s agent, with no question asked',
        r.agent === dev && !r.stale);

    // ‼️ …and it is the FLEET's row, not the node's copy. A row drawn before a
    // rename carries the old folder; believing it starts the session there.
    const renamed = { id: 'a-dev', name: 'developer', dir: 'D:/a/dev-MOVED' };
    const fresh = A.resolveAgentArg({ kind: 'agent', agent: dev }, [renamed, mgr]);
    ok('‼️ …answered by the fleet as it is now, not by the row\'s own snapshot',
        fresh.agent === renamed && fresh.agent.dir === 'D:/a/dev-MOVED');

    ok('a plain agentId is unchanged — the webviews and the bridge publish that',
        A.resolveAgentArg({ agentId: 'a-mgr' }, FLEET).agent === mgr);
    ok('…and so is a plain agentName, for the surfaces that only have one',
        A.resolveAgentArg({ agentName: 'developer' }, FLEET).agent === dev);
    ok('an id wins over a name that disagrees with it',
        A.resolveAgentArg({ agentId: 'a-dev', agentName: 'manager' }, FLEET).agent === dev);
}

// ------------------------------------------------- nobody named, and that is
// a real answer: the Command Palette and a view-title button have no row.
{
    ok('an empty argument names nobody, and says so rather than guessing',
        !A.resolveAgentArg(undefined, FLEET).agent
        && !A.resolveAgentArg(undefined, FLEET).stale);
    ok('…and so does an object with none of the three keys',
        !A.resolveAgentArg({ surface: 'terminal' }, FLEET).agent
        && !A.resolveAgentArg({ surface: 'terminal' }, FLEET).stale);
    ok('…and a blank key is not a name', !A.resolveAgentArg({ agentId: '   ' }, FLEET).stale);
}

// ------------------------------------------------------- the stale row, named
{
    const gone = A.resolveAgentArg({ kind: 'agent', agent: { id: 'a-old', name: 'archivist' } }, FLEET);
    ok('‼️ a row naming an agent the fleet no longer has is refused',
        !gone.agent && gone.stale === 'archivist');
    ok('…by the name it published, so the refusal can say WHICH', gone.stale === 'archivist');
    ok('…and by its id when that is all it published',
        A.resolveAgentArg({ agentId: 'a-old' }, FLEET).stale === 'a-old');

    // ‼️ NEVER A SILENT NEIGHBOUR. Two agents answering to one name is not an
    // answer — it is the moment the wrong session gets started.
    const twins = [dev, { id: 'a-dev2', name: 'developer', dir: 'D:/a/dev2' }];
    const amb = A.resolveAgentArg({ agentName: 'developer' }, twins);
    ok('‼️ an ambiguous name refuses instead of taking the first row',
        !amb.agent && amb.stale === 'developer');
    ok('an empty fleet refuses rather than resolving to nothing quietly',
        A.resolveAgentArg({ agentId: 'a-dev' }, []).stale === 'a-dev');
}

// ---------------------------------------------------------------- the wiring
// Source-scanned, because the two halves live in the host and the guarantee is
// about WHERE they are applied, not about a value a pure function returns.
{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');

    ok('the one reader goes through the core, for every agent command',
        /const named = resolveAgentArg\(arg, agents\);/.test(ext)
        && /import \{ resolveAgentArg \} from '\.\/core\/agentArg';/.test(ext));
    ok('‼️ …and a named-but-missing agent is refused, not offered a menu',
        /if \(named\.stale\) \{/.test(ext)
        && /is not in the fleet any more/.test(ext));
    ok('the picker is still there for the callers that truly named nobody',
        /placeHolder: 'Select an agent'/.test(ext));

    // ‼️ THE CURE. One redraw per burst instead of one per hook event.
    ok('‼️ the Agents tree is redrawn on a timer, not once per live event',
        /const refreshAgentsTree = \(\) => \{/.test(ext)
        && /if \(agentsTreePulse\) \{ return; \}/.test(ext));
    ok('…and the two high-frequency sources go through it',
        (ext.match(/refreshAgentsTree\(\);/g) || []).length >= 2
        && !/live\.onDidUpdate\(\(\) => \{\s*\n\s*agentsTree\.refresh\(\);/.test(ext));

    // ‼️ THE BELT. The view is asked before the person is.
    ok('‼️ the Agents view is a TreeView, so it can say which row it is on',
        /vscode\.window\.createTreeView\('agentfarm\.agents', \{/.test(ext));
    ok('…and only ONE agent row counts as an answer',
        /const rows = agentsView\.selection\.filter\(n => n\.kind === 'agent'\);/.test(ext)
        && /rows\.length === 1/.test(ext));
    ok('…and a hidden view answers nothing', /if \(!agentsView\.visible\) \{ return undefined; \}/.test(ext));
    ok('‼️ …and it is ▶ that asks, because that is the inline action',
        /const agent = await resolveAgent\(withAgentsRow\(arg\)\);/.test(ext));
    ok('…never overriding an argument that DID arrive',
        /if \(arg\?\.agent \|\| arg\?\.agentId \|\| arg\?\.agentName\) \{ return arg; \}/.test(ext));

    // The doors that were NOT touched, so a regression there is visible here:
    // they take what the caller published and ask when there is nothing.
    // The window is a character count, not a parse, so it is wide enough for
    // the reason a door carries above the line measured (X-180 wrote one on
    // launchSession); the claim is the line AND that the belt is not worn.
    for (const cmd of ['launchSession', 'continueSession', 'startSessionWith', 'consoleForAgent']) {
        const i = ext.indexOf(`registerCommand('agentfarm.${cmd}'`);
        const body = ext.slice(i, i + 6000);
        ok(`${cmd} still resolves from its own argument alone`,
            i > 0 && /const agent = await resolveAgent\(arg\);/.test(body)
            && !/withAgentsRow\(/.test(body.slice(0, body.indexOf('const agent = await resolveAgent(arg);'))));
    }
}

// ===========================================================================
// S-48 REOPENED — the user said it a second time, so the cure was not one.
//
// The throttle bounded how OFTEN the action bar under the pointer could be
// replaced; it never asked whether it had to be replaced at all. `live` fires
// on every hook event of every session, so on a busy fleet the view was rebuilt
// four times a second for ever, and almost every one of those rebuilds drew the
// same rows. Two things are held below:
//
//   1. THE REDRAW IS GATED ON THE DRAWING. Not on a hand-written list of the
//      fields that matter — that list would drift the first time a row learns
//      to show something new — but on what the rows actually render.
//   2. THE ROW'S ▶ CANNOT ASK. It is its own command id, kept out of the
//      palette, and when it cannot name an agent it says so instead of opening
//      the picker. One id could not mean both "the palette: ask" and "a lost
//      row: never ask", and it had been resolving that clash the wrong way.
//   3. AND THE ROW THAT DID CHANGE IS REFRESHED BY NAME. The extension host
//      clears every handle in the view for an argument-less event and only the
//      element's children for one that carries elements, so a token count
//      ticking on one row must not invalidate the other seven. It is looked up
//      by OBJECT IDENTITY, which is why the rows are the same objects each
//      draw — and why the ▶ no longer falls back to the SELECTED row, which is
//      not the row that was pressed.
// ===========================================================================
{
    const Module = require('module');
    class EventEmitter {
        constructor() { this.fired = 0; this.last = 'never'; this.event = () => ({ dispose() { } }); }
        fire(data) { this.fired++; this.last = data; }
    }
    class TreeItem {
        constructor(label, state) { this.label = label; this.collapsibleState = state; }
    }
    class ThemeIcon { constructor(id, color) { this.id = id; this.color = color; } }
    class ThemeColor { constructor(id) { this.id = id; } }
    class MarkdownString { constructor(v) { this.value = v; } }
    const fakeVscode = {
        EventEmitter, TreeItem, ThemeIcon, ThemeColor, MarkdownString,
        TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
        Uri: { file: (p) => ({ fsPath: p }) },
        // Answered here on purpose: `cfgValueRaw` falls back to reading the
        // real user's settings.json when the registry says undefined, and a
        // test must never depend on this machine (X-265).
        workspace: { getConfiguration: () => ({ get: (k, d) => (k === 'agentFarm.agentRowCostUnit' ? 'tokens' : d) }) }
    };
    const origLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'vscode') { return fakeVscode; }
        return origLoad.call(this, request, parent, isMain);
    };

    let treesOk = true;
    let Trees;
    try { Trees = require(path.join(ROOT, 'out/views/trees.js')); }
    catch (e) { treesOk = false; console.log('  (trees.js not loadable: ' + e.message + ')'); }
    ok('the Agents tree provider loads with no window', treesOk && !!Trees.AgentsTreeProvider);

    if (treesOk) {
        const agent = (id, name) => ({
            id, name, dir: 'D:/a/' + name,
            contextLoad: { total: 0, claudeMd: 0 },
            memoryFiles: [], toolFiles: [], permissionSummary: ''
        });
        const world = {
            agents: [agent('a-dev', 'developer'), agent('a-mgr', 'manager')],
            active: new Set(),
            tokens: 0
        };
        const state = {
            getAgents: () => world.agents,
            getInsights: () => [],
            index: {
                isAgentActive: (id) => world.active.has(id),
                latestSessionForAgent: () => undefined,
                forAgent: () => (world.tokens
                    ? [{ daily: { [require(path.join(ROOT, 'out/core/util.js')).dayKey(Date.now())]:
                        { cost: 0, usage: { input: world.tokens, output: 0, cacheRead: 0, cacheWrite: 0 } } } }]
                    : [])
            }
        };
        const tree = new Trees.AgentsTreeProvider(state);
        const em = tree.emitter;

        const before = em.fired;
        ok('‼️ the first gated redraw fires — there was no previous drawing',
            tree.refreshIfChanged() === true && em.fired === before + 1);
        ok('…and it is the WHOLE view, because no row had been drawn to compare',
            em.last === undefined);
        ok('‼️ …and an identical drawing does NOT fire, so the row under the pointer survives',
            tree.refreshIfChanged() === false && em.fired === before + 1);
        ok('…twice over: a quiet fleet costs the view nothing at all',
            tree.refreshIfChanged() === false && em.fired === before + 1);

        // ‼️ THE ROWS ARE THE SAME OBJECTS FROM DRAW TO DRAW. The host finds a
        // refreshed element by object identity (`this.m.get(t)`); a node built
        // fresh every time is not found and the row is refreshed NOWHERE.
        const draw1 = tree.getChildren();
        const draw2 = tree.getChildren();
        ok('‼️ the top-level rows are the same objects from one draw to the next',
            draw1.length === 2 && draw1[0] === draw2[0] && draw1[1] === draw2[1]);

        world.active.add('a-dev');
        ok('‼️ a row whose text really changed redraws AT ONCE — nothing is delayed',
            tree.refreshIfChanged() === true && em.fired === before + 2);
        ok('‼️ …and ONLY that row is refreshed — the other seven keep their handles',
            Array.isArray(em.last) && em.last.length === 1
            && em.last[0].agent.id === 'a-dev' && em.last[0] === draw1[0]);
        ok('…and settles again straight afterwards',
            tree.refreshIfChanged() === false && em.fired === before + 2);

        // ‼️ THE GATE IS DERIVED, NOT DECLARED. This figure reaches the row only
        // through its `description`; a signature built from a hand-written list
        // of "the fields that matter" would miss it, and the row would go stale.
        world.tokens = 12345;
        ok('‼️ …and a change that only shows in the description is caught too',
            tree.refreshIfChanged() === true && em.fired === before + 3);
        ok('…as a per-row event, still not a rebuild of the view',
            Array.isArray(em.last) && em.last.length === 2);

        world.agents.push(agent('a-new', 'youtuber'));
        ok('a new agent in the fleet is a new drawing',
            tree.refreshIfChanged() === true && em.fired === before + 4);
        ok('‼️ …and THAT one clears the view, because no per-row event can say it',
            em.last === undefined);

        world.agents.pop();
        tree.refreshIfChanged();
        ok('…a row that left the fleet clears the view too, and its node is dropped',
            em.last === undefined && tree.getChildren().length === 2);

        const n = em.fired;
        tree.refresh();
        ok('an unconditional refresh still fires — commands are not gated',
            em.fired === n + 1 && em.last === undefined);
        ok('‼️ …and it invalidates the baseline, so nothing is swallowed after it',
            tree.refreshIfChanged() === true && em.fired === n + 2);

        // A provider that cannot draw is not allowed to freeze the view.
        const broken = new Trees.AgentsTreeProvider({
            getAgents: () => { throw new Error('fleet gone'); },
            getInsights: () => [], index: {}
        });
        const bf = broken.emitter.fired;
        ok('‼️ a signature that cannot be taken falls back to redrawing, not to silence',
            broken.refreshIfChanged() === true && broken.emitter.fired === bf + 1);
    }

    Module._load = origLoad;
}

// ------------------------------------------------- the wiring, in the sources
{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

    ok('‼️ the pulse asks whether the rows changed before it rebuilds them',
        /agentsTree\.refreshIfChanged\(\);/.test(ext));
    ok('…and the unconditional rebuild is gone from the pulse',
        !/agentsTreePulse = undefined;\s*\n\s*agentsTree\.refresh\(\);/.test(ext));

    const rowCmd = 'agentfarm.startSessionRow';
    const menus = pkg.contributes.menus['view/item/context'] || [];
    const onAgentRow = (group) => menus.find(m =>
        m.group === group && /view == agentfarm\.agents && viewItem == agent/.test(m.when || ''));
    ok('‼️ the inline ▶ on an agent row is the ROW\'s own command',
        onAgentRow('inline@1')?.command === rowCmd);
    ok('…and so is the same action in that row\'s right-click menu',
        onAgentRow('1_actions@1')?.command === rowCmd);
    ok('the row command is contributed and carries the play icon',
        pkg.contributes.commands.some(c => c.command === rowCmd && c.icon === '$(play)'));
    ok('‼️ …and it is NOT in the Command Palette — the palette has nobody to name',
        (pkg.contributes.menus.commandPalette || [])
            .some(m => m.command === rowCmd && m.when === 'false'));
    ok('the palette door is untouched and still exists',
        pkg.contributes.commands.some(c => c.command === 'agentfarm.startSession'));

    // The door ends where the NEXT registration begins — a fixed byte count
    // read the neighbour's `resolveAgent(` and failed the assertion below on
    // code that is not this command's.
    const i = ext.indexOf(`registerCommand('${rowCmd}'`);
    const next = i > 0 ? ext.indexOf('vscode.commands.registerCommand(', i + 20) : -1;
    const door = i > 0 ? ext.slice(i, next > 0 ? next : i + 1400) : '';
    ok('‼️ the row door never reaches the agent PICKER — it resolves, it does not ask',
        i > 0 && !/resolveAgent\(/.test(door)
        && /resolveAgentArg\(arg, agents\)/.test(door));
    ok('‼️ …and it does not fall back to the SELECTED row either — pressing an inline',
        !/withAgentsRow/.test(door));
    ok('…while the palette door, which has nothing else to go on, keeps that belt',
        /resolveAgent\(withAgentsRow\(arg\)\)/.test(ext));
    ok('‼️ …and when it cannot name an agent it SAYS so and stops',
        /arrived without its row, so there is no agent to start/.test(door)
        && /showWarningMessage/.test(door));
    ok('…a stale row is refused by name there too',
        /is not in the fleet any more/.test(door));
    ok('‼️ …and the start itself is not reimplemented — the same door, agent named',
        /executeCommand\('agentfarm\.startSession', \{\s*\n\s*agentId: named\.agent\.id/.test(door));
    ok('…carrying a surface the caller had already settled, when there was one',
        /\.\.\.\(arg\?\.surface \? \{ surface: arg\.surface \} : \{\}\)/.test(door));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
