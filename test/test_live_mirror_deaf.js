// X-265 — THE CONSOLE MIRROR STOPS BEING BLIND TO CLAUDE, EXACTLY WHEN IT MUST.
//
// The Live Timeline is drawn from the hook stream, and the mirror existed for the
// engines that have no hooks at all (Codex, Antigravity). Claude was excluded by
// name — "its CLI fires the real hooks, a mirror beside them would draw every
// session twice" — which was true for as long as a Claude session could be relied
// on to fire them. `CLAUDE_CONFIG_DIR` ended that: a session started on a captured
// account reads ITS OWN settings.json and posts nothing, so the exclusion turned
// the busiest sessions on the machine into sessions nobody could see (measured
// 2026-09-07, a whole day of Console work with no lane).
//
// ‼️ WHAT IS PINNED HERE IS THE DEDUP, because that is the thing that could go
// wrong in the other direction: a mirror running beside working hooks would draw
// every turn twice, which is worse than a gap because it looks like data.
const Module = require('module');
const path = require('path');

class Emitter {
    constructor() { this.handlers = []; }
    get event() { return (fn) => { this.handlers.push(fn); return { dispose() { } }; }; }
    fire(v) { for (const h of this.handlers) h(v); }
    dispose() { }
}
const fakeVscode = {
    EventEmitter: Emitter,
    window: {
        showInformationMessage: () => Promise.resolve(undefined),
        showWarningMessage: () => Promise.resolve(undefined)
    },
    commands: { executeCommand: () => Promise.resolve(undefined) }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return fakeVscode; }
    return origLoad.apply(this, arguments);
};

const { LiveMonitor, statedSource } = require(path.resolve(__dirname, '../out/core/live.js'));
const { hookCommand, HOOK_MARKER } = require(path.resolve(__dirname, '../out/core/hooksInstaller.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const rig = () => {
    const cfg = {
        enabled: true, port: 0, stuckThresholdMs: 999999,
        notifyPermission: false, notifyStuck: false, notifyTurnEnd: false
    };
    const live = new LiveMonitor(() => cfg, () => ({ agentId: 'a1', agentName: 'dev' }));
    return live;
};

// ---------- has this session ever spoken for itself ----------
{
    const live = rig();
    ok('a session nobody has heard of has no hooks of its own',
        live.hasRealHooks('never-seen') === false);

    // A MIRRORED event names its engine. A real CLI hook never does.
    live.handle({ session_id: 'M1', cwd: '/x', hook_event_name: 'SessionStart', engine: 'claude' });
    ok('‼️ a mirrored event does NOT make a session look hooked — otherwise the '
        + 'mirror would switch itself off after its own first card',
        live.hasRealHooks('M1') === false);

    live.handle({ session_id: 'R1', cwd: '/x', hook_event_name: 'SessionStart', source: 'startup' });
    ok('‼️ a real hook does, on the first event, whatever kind it is',
        live.hasRealHooks('R1') === true);

    // …and the switch is one-way for the session: hooks that start working
    // mid-session must silence the mirror from then on.
    live.handle({ session_id: 'M1', cwd: '/x', hook_event_name: 'PreToolUse', tool_name: 'Bash' });
    ok('a real hook arriving later flips a mirrored session over',
        live.hasRealHooks('M1') === true);
    live.handle({ session_id: 'M1', cwd: '/x', hook_event_name: 'Stop', engine: 'claude' });
    ok('…and it never flips back — one working hook stream is proof for good',
        live.hasRealHooks('M1') === true);
}

// ---------- claude is not an EXTERNAL cli, whoever states it ----------
{
    ok('‼️ a mirrored Claude event must not badge the lane as a foreign engine — '
        + '`source` means EXTERNAL cli, and the mirror has to name its engine on '
        + 'every payload for the dedup above to work at all',
        statedSource('claude') === undefined && statedSource('Claude') === undefined);
    ok('…while a real external engine still names itself',
        statedSource('codex') === 'codex' && statedSource(' agy ') === 'agy');
    ok('nothing stated is nothing claimed',
        statedSource(undefined) === undefined && statedSource('  ') === undefined);

    const live = rig();
    live.handle({ session_id: 'C1', cwd: '/x', hook_event_name: 'SessionStart', engine: 'claude' });
    const s = live.sessions().find(x => x.sessionId === 'C1');
    ok('so a mirrored Claude session carries no external badge',
        !!s && !s.source);
    const live2 = rig();
    live2.handle({ session_id: 'X1', cwd: '/x', hook_event_name: 'SessionStart', engine: 'codex' });
    ok('…and a mirrored Codex one still does',
        live2.sessions().find(x => x.sessionId === 'X1').source === 'codex');
}

// ---------- the hook line itself ----------
{
    for (const shell of ['posix', 'powershell']) {
        const cmd = hookCommand(8377, shell);
        ok(`the ${shell} hook no longer gives up on a busy host after three seconds`,
            !/-m 3(\s|$)/.test(cmd));
        ok(`…it bounds the CONNECT instead, which is the only hang a dead listener `
            + `can cause on localhost (${shell})`,
            cmd.includes('--connect-timeout 2') && cmd.includes('-m 15'));
        ok(`…and still carries the marker every install is found by (${shell})`,
            cmd.includes(HOOK_MARKER));
    }
    ok('‼️ the two spellings stay different where they have to be — `||` is a parse '
        + 'error in PowerShell and `; exit 0` posts nothing under cmd (X-208)',
        hookCommand(8377, 'posix').includes('|| cd .')
        && hookCommand(8377, 'powershell').includes('curl.exe')
        && hookCommand(8377, 'powershell').includes('; exit 0'));
}

Module._load = origLoad;
console.log(`test_live_mirror_deaf: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
