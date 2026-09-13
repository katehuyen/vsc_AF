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

const { LiveMonitor, statedSource, mirrorOwns } = require(path.resolve(__dirname, '../out/core/live.js'));
const {
    hookCommand, HOOK_MARKER, ALL_HOOK_EVENTS
} = require(path.resolve(__dirname, '../out/core/hooksInstaller.js'));
const { ENGINE_AUTH_ADAPTERS } = require(path.resolve(__dirname, '../out/core/engineAccounts.js'));

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

// ---------- X-297: the mirror says only what the wire will not ----------
//
// Standing the whole mirror down was right about doubling and wrong about
// everything the wire does not carry: measured 2026-09-13, one Codex session
// logged `start` and `prompt` twice (mirror 11:56:28/30, hook 11:56:36), while
// on the other side the agent's own reply reached no lane whose hooks worked,
// because no hook carries one. So the question is per EVENT.
{
    const CLAUDE = ALL_HOOK_EVENTS;
    ok('‼️ X-297 — an event the wire has been HEARD to report is not the mirror\'s',
        mirrorOwns('SessionStart', CLAUDE) === false
        && mirrorOwns('Stop', CLAUDE) === false
        && mirrorOwns('UserPromptSubmit', CLAUDE) === false);
    ok('…and the same event IS the mirror\'s while nothing has been heard — that is '
        + 'the whole reason the mirror exists (X-265)',
        mirrorOwns('SessionStart', []) === true && mirrorOwns('Stop', []) === true);
    ok('‼️ X-297 — A DECLARED HOOK THAT HAS NEVER ARRIVED IS NOT A WIRE. Measured '
        + '2026-09-13: Codex declares `Stop`, config.toml trusts it, two turns in a '
        + 'row produced no `stop` — so the mirror is still the turn-end there',
        mirrorOwns('Stop', ['SessionStart', 'UserPromptSubmit']) === true
        && mirrorOwns('SessionStart', ['SessionStart', 'UserPromptSubmit']) === false);
    ok('‼️ X-297 — what NO wire carries stays the mirror\'s: the agent\'s own reply '
        + '(U-78) is the Console\'s knowledge, not a hook\'s',
        CLAUDE.indexOf('AssistantMessage') < 0
        && mirrorOwns('AssistantMessage', CLAUDE) === true);
    ok('a payload with no event name is never suppressed by a list it cannot be on',
        mirrorOwns(undefined, CLAUDE) === true);

    // …and the monitor is where the hearing is recorded: a mirrored payload
    // names its engine and teaches nothing; a real hook teaches its own name.
    const live = rig();
    live.handle({ session_id: 'H1', cwd: '/x', hook_event_name: 'SessionStart', engine: 'codex' });
    ok('‼️ a mirrored event teaches the wire nothing — otherwise the mirror would '
        + 'suppress itself with its own evidence',
        live.realHookKinds('H1').length === 0);
    live.handle({ session_id: 'H1', cwd: '/x', hook_event_name: 'SessionStart' });
    live.handle({ session_id: 'H1', cwd: '/x', hook_event_name: 'UserPromptSubmit', prompt: 'x' });
    live.handle({ session_id: 'H1', cwd: '/x', hook_event_name: 'UserPromptSubmit', prompt: 'y' });
    ok('a real hook does, once per NAME however often it fires',
        live.realHookKinds('H1').join() === 'SessionStart,UserPromptSubmit');
    ok('…and the turn-end nobody sent is not on the list',
        mirrorOwns('Stop', live.realHookKinds('H1')) === true);
    ok('a session nobody has heard of has heard nothing',
        live.realHookKinds('never-seen').length === 0);
}

// ---------- …and the list is the WIRE'S own, read where it lives ----------
{
    const adapter = (e) => ENGINE_AUTH_ADAPTERS.find(a => a.engine === e);
    const ctxFor = (files) => ({
        fs: {
            existsSync: (p) => Object.prototype.hasOwnProperty.call(files, p),
            readFileSync: (p) => files[p],
            writeFileSync: () => { },
            mkdirSync: () => { }
        },
        home: '/home', dir: '/home/.codex', realDir: '/home/.codex', hooksPort: 8377
    });
    const claude = adapter('claude');
    ok('Claude\'s wire is the installer\'s own list — declared in one place, not two',
        !!claude.liveWire.events
        && claude.liveWire.events(ctxFor({})).join() === ALL_HOOK_EVENTS.join());

    const codex = adapter('codex');
    // Keyed the way the adapter will ask for it — `path.join` on this platform.
    const HOOKS = path.join('/home/.codex', 'hooks.json');
    const wired = {
        [HOOKS]: JSON.stringify({
            hooks: {
                PreToolUse: [], PostToolUse: [], PreCompact: [], SessionStart: [],
                UserPromptSubmit: [], SubagentStop: [], Stop: []
            }
        })
    };
    const events = codex.liveWire.events(ctxFor(wired));
    ok('Codex\'s wire is READ, because the file is the user\'s and may name any subset',
        events.length === 7 && events.indexOf('UserPromptSubmit') >= 0);
    ok('‼️ X-297 — and the seven measured on this machine carry NO SessionEnd, so '
        + 'that one could not be suppressed even if it were heard',
        events.indexOf('SessionEnd') < 0 && mirrorOwns('SessionEnd', events) === true);
    ok('no hooks.json is no wire — nothing suppressed, everything mirrored',
        codex.liveWire.events(ctxFor({})).length === 0);
    ok('a malformed hooks.json is no wire either, and never throws at a lane',
        codex.liveWire.events(ctxFor({ [HOOKS]: '{ not json' })).length === 0);
}

Module._load = origLoad;
console.log(`test_live_mirror_deaf: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
