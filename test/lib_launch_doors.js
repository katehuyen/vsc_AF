// X-150 — THE 13 LAUNCH DOORS, AS DATA, AND WHERE EACH ONE CAN BE ADDRESSED.
//
// ‼️ THE OTHER HALF OF "EVERY DIMENSION, EVERY DOOR".
//
// `media/afDimensions.js` made the 16 dimensions countable. This makes the 13
// doors countable, and the two together are what turn a sentence that lived in a
// 1.690-line document into 208 obligations a build can fail on.
//
// ‼️ AND IT RECORDS THE PROBLEM RATHER THAN HIDING IT. The measurement behind
// X-148 says the doors "live inside quickpick loops and message handlers in
// extension.ts, which nothing can call" — so most of them cannot be CALLED with
// a fixture and asked what they collected. Some can at least be POINTED AT: they
// are named bindings with a body, and a dimension either appears in that body or
// does not. Those are anchored here. The rest carry `anchor: null`, which is not
// a shrug — it is the count X-151 exists to drive to zero, and the matrix reads
// it as a gap against a budget that may only shrink.
//
// ‼️ AN ANCHOR IS EVIDENCE, NOT PROOF, AND THE FILE SAYS SO. A dimension named
// inside a door's body is being handled there; a dimension absent from it is
// not necessarily missing, because the door may pass a whole `LaunchOptions`
// through. That is exactly why the verdicts live in `launch.matrix.json` where a
// person can overrule the seed with `carried` or `exempt` and say why — and why
// the numbers only ever get better, never quietly worse.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/**
 * The 13. `surface` is what the door produces; `files` is where it lives;
 * `anchor` is the named binding whose body IS the door today, or null where the
 * door is not addressable at all yet (X-151 gives every one of them a file).
 */
const LAUNCH_DOORS = [
    {
        id: 'treeRow', label: 'Agents tree, inline play', surface: 'terminal',
        files: ['src/extension.ts'], anchor: 'startClaudeSession',
        why: 'the play button on an agent row - the shortest path to a session and the one most likely to be forgotten when a dimension arrives.'
    },
    {
        id: 'treeMenu', label: 'Agents tree, right-click', surface: 'terminal',
        files: ['src/extension.ts'], anchor: null,
        why: 'startSessionWith / launchSession / consoleForAgent live inside the command registrations and cannot be pointed at yet.'
    },
    {
        id: 'launcher', label: 'Multi-dimension launcher', surface: 'either',
        files: ['src/extension.ts'], anchor: 'runLauncher',
        why: 'the quickpick that asks every dimension in turn - the one door that has always had to know the whole list.'
    },
    {
        id: 'profile', label: 'Saved launch profiles', surface: 'either',
        files: ['src/core/launchProfiles.ts'], anchor: null, wholeFile: true,
        why: 'a saved setup reproduces a launch, so a dimension it does not store is a dimension the profile silently changes.'
    },
    {
        id: 'composer', label: 'Console composer', surface: 'console',
        files: ['media/console.js', 'src/panels/consolePanel.ts'], anchor: null,
        why: 'the pre-spawn strip. X-103 put providerId and tier on the type and this is the door that never got a box for them - the failure the whole item is named after.'
    },
    {
        id: 'surfacePick', label: 'Terminal or Console picker', surface: 'either',
        files: ['src/extension.ts'], anchor: 'pickRunSurface',
        why: 'it decides WHERE a launch lands, and a dimension dropped while crossing it arrives on one surface and not the other.'
    },
    {
        id: 'projects', label: 'Projects tree and page', surface: 'either',
        files: ['src/extension.ts', 'media/projectsPage.js'], anchor: null,
        why: 'start a session under a project - the door that added projectContextFile and therefore the one that proves a dimension can be born at a door.'
    },
    {
        id: 'webviews', label: 'Agent detail, dashboard, missions, portfolio', surface: 'console',
        files: ['media/agentDetail.js', 'media/dashboard.js'], anchor: null,
        why: 'four pages with a Talk-to-agent button each; a dimension added to one of them and not the others is invisible until somebody uses the other one.'
    },
    {
        id: 'palette', label: 'Command palette and status bar', surface: 'either',
        files: ['src/extension.ts'], anchor: null,
        why: 'the keyboard path. It has no picker at all, so it takes defaults - and a dimension with no default is a dimension this door cannot express.'
    },
    {
        id: 'bridge', label: 'Bridge session.start', surface: 'either',
        files: ['src/core/bridge.ts', 'src/extension.ts'], anchor: null,
        why: 'what an agent drives. ‼️ The one deliberate asymmetry in the launch layer: it RECORDS and does not inherit (_REF/agentfarm-dev.md).'
    },
    {
        id: 'task', label: 'Tasks (headless and interactive)', surface: 'task',
        files: ['src/core/tasks.ts'], anchor: null, wholeFile: true,
        why: 'RunDimensions. A task is written now and runs later, so a dimension it drops cannot be supplied by anybody watching.'
    },
    {
        id: 'automation', label: 'Schedule, trigger, template, workflow step', surface: 'headless',
        files: ['src/core/tasks.ts', 'src/core/triggers.ts'], anchor: null,
        why: 'X-106 - an automation fires with nobody at a window, so everything about the run has to be stated when it is WRITTEN or it is never stated.'
    },
    {
        id: 'mission', label: 'Missions and delegation', surface: 'task',
        files: ['src/core/missions.ts'], anchor: null, wholeFile: true,
        why: 'a mission member overrides the mission default; a dimension missing here silently returns a delegated run to the fleet default.'
    }
];

/**
 * The source a door is judged against: the body of its named binding, or the
 * whole of its files where the door is a module of its own. `null` when the
 * door is not addressable at all — which is a fact the matrix records, not one
 * it papers over.
 */
function sourceOf(door) {
    const read = f => {
        try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; }
    };
    if (door.wholeFile) { return door.files.map(read).join('\n'); }
    if (!door.anchor) { return null; }
    const src = read(door.files[0]);
    const at = src.indexOf(`const ${door.anchor} = `);
    if (at < 0) { return null; }
    // These are arrow-function consts declared at one indent inside activate();
    // the next sibling declaration ends the body. A door that stops matching
    // this shape reads as unanchored, which is the safe direction: it becomes a
    // counted gap rather than a cell that silently passes on nothing.
    const rest = src.slice(at + 10);
    const end = rest.search(/\n {4}const \w+ = /);
    return end < 0 ? rest : rest.slice(0, end);
}

/** Is this door addressable at all today? */
function addressable(door) {
    return sourceOf(door) !== null;
}

module.exports = { LAUNCH_DOORS, sourceOf, addressable };
