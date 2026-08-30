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
    for (const cmd of ['launchSession', 'continueSession', 'startSessionWith', 'consoleForAgent']) {
        const i = ext.indexOf(`registerCommand('agentfarm.${cmd}'`);
        ok(`${cmd} still resolves from its own argument alone`,
            i > 0 && /const agent = await resolveAgent\(arg\);/.test(ext.slice(i, i + 900)));
    }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
