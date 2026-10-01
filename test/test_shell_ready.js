// K-33 — A COMMAND IS GIVEN TO A SHELL THAT IS READY, NOT TO A PTY.
//
// ‼️ THE REPORTED FAILURE. Right-click a live Console card → "Resume in
// Terminal", and the terminal that opened showed Claude's LOGIN screen instead
// of the conversation. Every terminal in this extension was driven the same
// way: `createTerminal` … `show()` … `sendText(command, true)` on the very next
// statement — before the shell inside the pty had finished running the user's
// own startup (a PowerShell profile, oh-my-posh, conda init). On a slow profile
// the written line is swallowed by or interleaved with that startup's output,
// and a `claude --resume <id>` that loses its tail runs as a bare `claude`:
// a fresh process, no conversation, onboarding screen. The session looks gone.
//
// ‼️ WHY THE FIX IS THE SIGNAL AND NOT THE DELIVERY. `shellIntegration
// .executeCommand` is the API that looks made for this and is deliberately NOT
// used: it sends ^C first to interrupt whatever is running, and what these
// terminals run is a full-screen TUI. `Terminal.shellIntegration` becoming
// defined is the only part that was missing — VS Code can only install it once
// the shell has started — so the gate waits for that and then sends exactly the
// `sendText` it always did.
//
// ‼️ AND WHY "ONCE" IS THE PROPERTY THAT MATTERS MOST. Three things can end the
// wait (the signal, the ceiling, the terminal closing). If two of them fired,
// `claude --resume <id>` would be sent twice — two processes on one transcript,
// which is the failure this codebase refuses by name everywhere else.
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return {
            window: { onDidChangeTerminalShellIntegration: () => ({ dispose() { } }), onDidCloseTerminal: () => ({ dispose() { } }) },
            workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }
        };
    }
    return origLoad.apply(this, arguments);
};
const { sendWhenShellReady, SHELL_READY_CEILING_MS } =
    require(path.join(ROOT, 'out', 'core', 'shellReady.js'));
Module._load = origLoad;

/** A terminal that reports whatever the test says, and records what it took. */
function host(o = {}) {
    const h = {
        sent: [], readyCbs: [], closedCbs: [], timers: [], disposed: 0,
        ready: () => !!o.ready,
        possible: () => o.possible !== false,
        onReady: (cb) => { h.readyCbs.push(cb); return { dispose: () => { h.disposed++; } }; },
        onClosed: (cb) => { h.closedCbs.push(cb); return { dispose: () => { h.disposed++; } }; },
        send: (line) => h.sent.push(line),
        timer: (ms, cb) => { h.timers.push({ ms, cb }); return { dispose: () => { h.disposed++; } }; }
    };
    // the three signals, fired by hand
    h.shellStarted = () => h.readyCbs.slice().forEach(cb => cb());
    h.closed = () => h.closedCbs.slice().forEach(cb => cb());
    h.ceilingPasses = () => h.timers.slice().forEach(t => t.cb());
    return h;
}

// ---------------------------------------- 1. the wait, and what ends it
{
    const h = host();
    sendWhenShellReady(h, ['claude --resume abc']);
    eq('nothing is written while the shell is still starting', h.sent, []);
    h.shellStarted();
    eq('…and the whole line lands the moment it reports in', h.sent, ['claude --resume abc']);
    ok('…with every listener and the timer torn down', h.disposed === 3);
}
{
    // The ceiling is the OLD behaviour, deliberately: send blind rather than
    // silently never start the session the user asked for.
    const h = host();
    sendWhenShellReady(h, ['claude --resume abc']);
    eq('the ceiling is the one this codebase chose', h.timers.map(t => t.ms), [SHELL_READY_CEILING_MS]);
    h.ceilingPasses();
    eq('a shell that never reports in still gets the command', h.sent, ['claude --resume abc']);
}
{
    // Writing to a dead pty is at best a no-op and at worst a line typed into
    // whatever reused its slot.
    const h = host();
    sendWhenShellReady(h, ['claude --resume abc']);
    h.closed();
    eq('a terminal closed before its shell reported takes nothing', h.sent, []);
}

// ---------------------------------------- 2. ‼️ ONCE, whatever races
{
    const h = host();
    sendWhenShellReady(h, ['claude --resume abc']);
    h.shellStarted();
    h.ceilingPasses();
    h.shellStarted();
    eq('the signal then the ceiling still sends ONE command', h.sent, ['claude --resume abc']);
}
{
    const h = host();
    sendWhenShellReady(h, ['claude --resume abc']);
    h.ceilingPasses();
    h.shellStarted();
    eq('…and so does the ceiling then the signal', h.sent, ['claude --resume abc']);
}
{
    const h = host();
    sendWhenShellReady(h, ['claude --resume abc']);
    h.closed();
    h.shellStarted();
    h.ceilingPasses();
    eq('a close wins and keeps winning', h.sent, []);
}

// ---------------------------------------- 3. no wait where waiting cannot pay
{
    // A shell that has ALREADY reported in: waiting for an event that has been
    // and gone would cost the full ceiling on every launch.
    const h = host({ ready: true });
    sendWhenShellReady(h, ['claude']);
    eq('an already-started shell is written to at once', h.sent, ['claude']);
    ok('…and nothing is subscribed or timed', !h.readyCbs.length && !h.timers.length);
}
{
    // ‼️ The SETTING is read rather than assumed. With integration switched off
    // the event cannot arrive, and every launch would pay the ceiling for a
    // promise nobody made — a three-second stall on a feature meant to be
    // invisible.
    const h = host({ possible: false });
    sendWhenShellReady(h, ['claude']);
    eq('integration switched off means send now, exactly as before', h.sent, ['claude']);
    ok('…and again nothing is subscribed or timed', !h.readyCbs.length && !h.timers.length);
}

// ---------------------------------------- 4. order, for the task terminal
{
    // `exit` is a SECOND LINE by design (the three shells do not agree on
    // chaining), so it must follow the command it is supposed to outlive —
    // racing ahead of it would close the terminal on a task that never ran.
    const h = host();
    sendWhenShellReady(h, ['claude -p "do the thing"', 'exit']);
    h.shellStarted();
    eq('both lines land, in the order they were given',
        h.sent, ['claude -p "do the thing"', 'exit']);
}

// ---------------------------------------- 5. every door that opens a terminal
//
// ‼️ Three sites built a terminal and wrote to it on the next statement, and
// the report only named one. A gate one of them skips is the same bug with a
// different reproduction.
{
    const ext = read('src', 'extension.ts');
    const tasks = read('src', 'core', 'tasks.ts');
    const viewer = read('src', 'panels', 'sessionViewer.ts');

    ok('launchClaudeTerminal — every terminal session in the extension',
        /sendToTerminalWhenReady\(terminal, command\);/.test(ext));
    ok('the task terminal, with its exit line kept in order',
        /sendToTerminalWhenReady\(terminal,\s*\n\s*\.\.\.\(close === 'auto-close' \? \[command, 'exit'\] : \[command\]\)\)/.test(tasks));
    // S-109 — the viewer no longer opens a terminal of its own: its Resume is
    // the terminal Resume door's, which resolves what the session closed with.
    ok('the session viewer hands Resume to the terminal Resume door and opens no terminal itself',
        /executeCommand\('agentfarm\.resumeSession'/.test(viewer) && !/createTerminal\(/.test(viewer));

    const blind = (src) => (src.match(/terminal\.sendText\([^,]+, true\)/g) || [])
        .concat(src.match(/term\.sendText\([^,]+, true\)/g) || []);
    eq('no site writes a LINE to a fresh terminal blind any more',
        blind(ext).concat(blind(tasks)).concat(blind(viewer)), []);

    // ‼️ …and the second race the item named: the handoff. The wait for the
    // Console's process to release the transcript had no answer for its own
    // ceiling — it fell through and launched anyway, which is the second
    // process on one transcript the wait exists to prevent.
    ok('the handoff ceiling is checked rather than merely waited out',
        /let released = false;/.test(ext)
        && /released = true; break;/.test(ext)
        && /if \(!released\) \{/.test(ext));
    ok('…and refusing is safe there because the card is already closed',
        /the process is still finishing — nothing was opened/.test(ext));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
