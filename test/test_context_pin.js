// X-267 — A RESUME IS HANDED THE SAME BYTES, OR IT PAYS FOR THE WHOLE THREAD.
//
// ‼️ THE DEFECT, MEASURED ON A REAL SESSION. Console session `4b0c8af8` was
// resumed after a 29-second extension-host restart. Anthropic's own answer on
// the first turn back:
//
//     "diagnostics": { "cache_miss_reason": {
//         "type": "system_changed", "cache_missed_input_tokens": 219488 } },
//     "usage": { "cache_creation_input_tokens": 303987,
//                "cache_read_input_tokens": 14811 }
//
// 303,987 tokens re-billed as cache CREATION on a conversation that had not
// changed by one character — the 5-hour window went from 72% to 96% in a
// second. `type: "system_changed"` names the culprit exactly: the appended
// system prompt. Agent Farm re-GENERATED the project context on every spawn,
// and the generated text carries a `generated HH:MM` stamp and the project's
// latest worklog lines — lines the resumed session had itself just written. A
// prefix cache matches from byte zero, so one changed minute in the system
// prompt throws away every token behind it.
//
// The fix is not to drop the file on a resume — the context genuinely does NOT
// survive `--resume` (smoke_project_context.mjs measured that too), and a
// session that loses its project is the feature deleted. It is to hand a resume
// the PINNED copy: the same bytes that opened the conversation.
//
// What is pinned down here, so no refactor can quietly undo it:
//   1. the rule itself (`resolveContextTarget`) — serve the pin, or write into
//      the pinned slot, or use the shared file, and never the wrong one;
//   2. the Console really asks for it — a resumed spawn passes its session id,
//      and a fresh spawn pins what it actually sent, once, when the id lands;
//   3. headless rounds really ask for it — a round is a `--resume`, and it was
//      the loudest case (a whole conversation re-billed once per round).
'use strict';
const path = require('path');
const cp = require('child_process');
const { EventEmitter } = require('events');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    contextFileName, pinnedContextFileName, isPinnableSessionId, resolveContextTarget
} = require(path.join(ROOT, 'out', 'core', 'projectContext.js'));

const SID = '4b0c8af8-95d2-4533-8a6c-ab3db27398aa';
const DIR = '/ctx';
const PIN = '/ctx/pinned';
const join = (a, b) => a + '/' + b;

// ---------------------------------------------------------- 1. the name
{
    const base = contextFileName('prj_9ujsbtzr', 'session', false);
    ok('the pinned name carries the conversation AND the ordinary file name',
        pinnedContextFileName(SID, base) === `${SID}--${base}`);
    // project · audience · the Superpowers switch all live in `base`, so any of
    // them changing is a DIFFERENT pin rather than a stale one served silently.
    ok('…so a session resumed with Superpowers turned on looks elsewhere',
        pinnedContextFileName(SID, contextFileName('prj_9ujsbtzr', 'session', true))
        !== pinnedContextFileName(SID, base));
    ok('…and a mission and a session on one project never share a pin',
        pinnedContextFileName(SID, contextFileName('prj_9ujsbtzr', 'mission', false))
        !== pinnedContextFileName(SID, base));
    ok('…and two conversations on one project never share one either',
        pinnedContextFileName('abcdef123456', base) !== pinnedContextFileName(SID, base));

    ok('a real CLI session id is pinnable', isPinnableSessionId(SID));
    // Junk must be REFUSED, not folded into a shared slot: two conversations
    // taking turns overwriting one pin is the bug wearing the fix's name.
    ok('…and junk is refused rather than collapsed into a shared slot',
        !isPinnableSessionId('') && !isPinnableSessionId(undefined)
        && !isPinnableSessionId('   ') && !isPinnableSessionId('short')
        && !isPinnableSessionId('../../etc/passwd') && !isPinnableSessionId('a b'));
}

// ------------------------------------------------------- 2. the decision
{
    const base = contextFileName('prj_9ujsbtzr', 'session', false);
    const pinPath = join(PIN, pinnedContextFileName(SID, base));

    // a fresh spawn: the shared per-project file, exactly as before any of this
    const fresh = resolveContextTarget({
        contextDir: DIR, pinnedDir: PIN, base, join, exists: () => false
    });
    ok('a fresh spawn still writes the shared per-project file',
        !fresh.serve && fresh.write === join(DIR, base));

    // a resume WITH a pin: hand it over untouched, compose nothing
    const warm = resolveContextTarget({
        contextDir: DIR, pinnedDir: PIN, base, resume: SID, join,
        exists: f => f === pinPath
    });
    ok('‼️ a resume with a pin is SERVED it — nothing is composed, nothing written',
        warm.serve === pinPath && !warm.write);

    // a resume with NO pin yet (every conversation that predates this fix):
    // compose, but write into the pinned slot — never the shared file, which a
    // second window spawning under the same project may overwrite in between.
    const cold = resolveContextTarget({
        contextDir: DIR, pinnedDir: PIN, base, resume: SID, join, exists: () => false
    });
    ok('a resume with no pin takes one NOW, in the pinned slot',
        cold.write === pinPath && !cold.serve);
    ok('…and never in the shared file two windows would race over',
        cold.write !== join(DIR, base));

    // an id we cannot key by is a fresh spawn, not a `nosession` free-for-all
    const junk = resolveContextTarget({
        contextDir: DIR, pinnedDir: PIN, base, resume: 'a b', join, exists: () => true
    });
    ok('an unpinnable id falls back to the shared file rather than a shared pin',
        junk.write === join(DIR, base) && !junk.serve);

    ok('exactly one of serve/write is ever set',
        [fresh, warm, cold, junk].every(t => !!t.serve !== !!t.write));
}

// ------------------------------------------------ 3. the Console really asks
{
    const spawns = [];
    const children = [];
    function fakeChild() {
        const child = new EventEmitter();
        const pipe = () => {
            const s = new EventEmitter();
            s.setEncoding = () => { };
            s.destroy = () => { };
            return s;
        };
        child.stdout = pipe();
        child.stderr = pipe();
        child.stdin = { write: () => true, end: () => { } };
        child.pid = 5000 + spawns.length;
        child.kill = () => { };
        children.push(child);
        return child;
    }
    const realSpawn = cp.spawn;
    cp.spawn = (exe, args, opts) => { spawns.push({ exe, args, opts }); return fakeChild(); };
    const { ConsoleHost } = require(path.join(ROOT, 'out', 'core', 'consolehost.js'));

    const asked = [];
    const pinned = [];
    const host = () => new ConsoleHost(
        () => 'claude', () => undefined, () => 'prj_9ujsbtzr',
        (projectId, superpowers, resume) => {
            asked.push({ projectId, superpowers, resume });
            return resume ? 'D:/ctx/pinned/' + resume + '--prj_9ujsbtzr.txt'
                : 'D:/ctx/prj_9ujsbtzr.txt';
        },
        () => undefined, undefined, undefined, undefined,
        (sessionId, file) => pinned.push({ sessionId, file }));

    // ---- a FRESH session
    spawns.length = 0; asked.length = 0; pinned.length = 0; children.length = 0;
    const h1 = host();
    h1.start({ agentId: 'a-dev', agentName: 'developer', cwd: 'D:\\repo', engine: 'claude' });
    ok('a fresh Console spawn asks with no conversation to continue',
        asked.length === 1 && asked[0].resume === undefined);
    const line = spawns[0].args.join(' ');
    ok('…and the file it was given is on the command line',
        line.includes('--append-system-prompt-file "D:/ctx/prj_9ujsbtzr.txt"'));
    ok('…and nothing is pinned yet — the conversation has no id', pinned.length === 0);

    // the CLI finally says which conversation these bytes opened
    children[0].stdout.emit('data',
        JSON.stringify({ type: 'system', subtype: 'init', session_id: SID }) + '\n');
    ok('‼️ the pin is taken when the id lands, from the bytes that really went out',
        pinned.length === 1 && pinned[0].sessionId === SID
        && pinned[0].file === 'D:/ctx/prj_9ujsbtzr.txt');
    // Once. A retry per stdout line would be a filesystem call per event for a
    // fact that cannot change — and a later overwrite is the defect returning.
    children[0].stdout.emit('data',
        JSON.stringify({ type: 'system', subtype: 'init', session_id: SID }) + '\n');
    ok('…exactly once, however many lines follow', pinned.length === 1);

    // ---- a RESUMED session
    spawns.length = 0; asked.length = 0; pinned.length = 0; children.length = 0;
    const h2 = host();
    h2.start({
        agentId: 'a-dev', agentName: 'developer', cwd: 'D:\\repo', engine: 'claude',
        resume: SID
    });
    ok('‼️ a resumed Console spawn names the conversation it is continuing',
        asked.length === 1 && asked[0].resume === SID);
    const line2 = spawns[0].args.join(' ');
    ok('…so the PINNED copy is what reaches the command line',
        line2.includes(`--append-system-prompt-file "D:/ctx/pinned/${SID}--prj_9ujsbtzr.txt"`));
    // and the flag is still THERE — the context does not survive `--resume`, so
    // dropping it would delete the feature to save the cache.
    ok('…and the flag is still passed at all (the context is lost on --resume)',
        line2.includes('--append-system-prompt-file') && line2.includes('--resume'));
    children[0].stdout.emit('data',
        JSON.stringify({ type: 'system', subtype: 'init', session_id: SID }) + '\n');
    ok('…and a resume never re-pins over the copy it was just handed',
        pinned.length === 0);

    cp.spawn = realSpawn;
}

// -------------------------------------------- 4. headless rounds really ask
{
    // `tasks.js` reaches for the editor API on load; nothing under test here
    // touches it, so the smallest stand-in that lets it load is the right one.
    const Module = require('module');
    class FakeEmitter {
        constructor() { this._cbs = []; }
        get event() { return (cb) => { this._cbs.push(cb); return { dispose() { } }; }; }
        fire(v) { for (const cb of this._cbs) { cb(v); } }
        dispose() { }
    }
    const origLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'vscode') {
            return {
                EventEmitter: FakeEmitter,
                window: {
                    showInformationMessage: () => Promise.resolve(undefined),
                    showWarningMessage: () => Promise.resolve(undefined),
                    createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }),
                    onDidCloseTerminal: () => ({ dispose() { } })
                }
            };
        }
        return origLoad.call(this, request, parent, isMain);
    };
    const { TaskManager } = require(path.join(ROOT, 'out', 'core', 'tasks.js'));
    Module._load = origLoad;
    const asked = [];
    // Only what this question needs: the manager is asked which context file a
    // task gets, and told which conversation a run turned out to open.
    const mgr = Object.create(TaskManager.prototype);
    mgr.tasks = [];
    mgr.pinSource = new Map();
    mgr.save = () => { };   // the board's persistence is somebody else's subject
    mgr.opts = {
        projectContextFile: (task) => { asked.push(task.resumeSessionId); return 'D:/ctx/x.txt'; },
        pinProjectContext: (sessionId, file) => { mgr._pinned = { sessionId, file }; }
    };

    // ‼️ this is the wire the fix depends on: `setRunProgress` is where a run's
    // conversation is finally named (it is re-derived on every pump, S-31), so
    // it is where the bytes that opened it can be filed.
    mgr.tasks.push({ id: 't1', title: 'round 1', status: 'running' });
    mgr.pinSource.set('t1', 'D:/ctx/x.txt');
    mgr.setRunProgress('t1', { sessionId: SID });
    ok('a headless run pins what it sent, under the conversation it opened',
        mgr._pinned && mgr._pinned.sessionId === SID && mgr._pinned.file === 'D:/ctx/x.txt');
    mgr._pinned = undefined;
    mgr.setRunProgress('t1', { sessionId: SID, assistantSteps: 4 });
    ok('…once — a later pump must not overwrite the conversation\'s own bytes',
        mgr._pinned === undefined);
}

// ------------------------------- 5. the call sites, so none is left behind
{
    const fs = require('fs');
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    // A round is a resume. This was the loudest case of the defect: the whole
    // conversation re-billed as cache creation once per round.
    ok('‼️ the headless task wire passes the round\'s conversation',
        /projectContextFile: \(task\) => systemPromptFileFor\([^;]{0,400}task\.resumeSessionId\)/s.test(ext));
    ok('the Console wire passes the resume through',
        /\(projectId, superpowers, resume\) =>\s*systemPromptFileFor\(projectId, 'session', !!superpowers, resume\)/.test(ext));
    // The OS terminal can resume a session too, and it is a spawn like any other.
    ok('the terminal resume passes the session it is resuming',
        /systemPromptFileFor\(own \|\| undefined, 'session',\s*superpowersOnFor\(s\.agentName\), s\.sessionId\)/.test(ext));

    // ‼️ THE MISSION PLANNER HAD THE SAME DEFECT RUNNING THE OTHER WAY. It used
    // to DROP the file on a round (`resumeSessionId ? undefined : …`) on the
    // belief that the brief was already in the conversation. It is not — an
    // appended system prompt is not a message — so every round after the first
    // ran with no project. And removing a block from a system prompt changes it
    // exactly as much as rewriting one, so it re-billed the thread anyway.
    ok('‼️ the mission planner no longer drops the brief on a round',
        !/resumeSessionId \? undefined : systemPromptFileFor/.test(ext)
        && /systemPromptFileFor\(\s*spec\.projectId, 'mission', false, resumeSessionId\)/.test(ext));
    ok('…and it pins the first call\'s bytes for the rounds that follow',
        /if \(!resumeSessionId && ctxFile && r\.sessionId\) \{\s*pinProjectContext\(r\.sessionId, ctxFile\);/.test(ext));

    const host = fs.readFileSync(path.join(ROOT, 'src', 'core', 'consolehost.ts'), 'utf8');
    ok('the Console spawn asks for the resume\'s own context',
        /this\.projectContextFile\(projectId, superpowers, init\.resume\)/.test(host));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
