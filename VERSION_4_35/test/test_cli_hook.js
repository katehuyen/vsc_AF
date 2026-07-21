// E2b: cliHook.js bridge — spawns the real compiled script against a real
// LiveMonitor HTTP listener; env-var routing, arg/stdin payloads, fail-soft.
const Module = require('module');
const cp = require('child_process');

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
const { LiveMonitor } = require(require('path').resolve(__dirname, '../out/core/live.js'));

const HOOK = require('path').resolve(__dirname, '../out/service/cliHook.js');
const PORT = 18742;

let pass = 0, fail = 0;
const eq = (n, got, want) => {
    if (JSON.stringify(got) === JSON.stringify(want)) { pass++; }
    else { fail++; console.log(`  FAIL ${n}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

const cfg = {
    enabled: true, port: PORT, stuckThresholdMs: 240 * 1000,
    notifyPermission: false, notifyStuck: false, notifyTurnEnd: false
};
const resolveAgent = (cwd) => (cwd || '').replace(/\\/g, '/').endsWith('agents/dev')
    ? { agentId: 'dev', agentName: 'developer' } : {};
const live = new LiveMonitor(() => cfg, resolveAgent, undefined, undefined);

const ENV = {
    ...process.env,
    AGENT_FARM_SESSION: 'cli:gemini:dev:9',
    AGENT_FARM_CWD: 'D:/agents/dev',
    AGENT_FARM_EVENT_PORT: String(PORT)
};

function runHook(args, opts = {}) {
    return new Promise(resolve => {
        const child = cp.spawn(process.execPath, [HOOK, ...args], { env: opts.env ?? ENV, stdio: ['pipe', 'pipe', 'pipe'] });
        let err = '';
        child.stderr.on('data', d => { err += d; });
        if (opts.stdin !== undefined) { child.stdin.write(opts.stdin); }
        child.stdin.end();
        child.on('close', code => resolve({ code, err }));
    });
}

const settle = (ms = 400) => new Promise(r => setTimeout(r, ms));

async function main() {
    await new Promise(resolve => {
        live.start();
        const t = setInterval(() => {
            if (live.listenerState === 'listening') { clearInterval(t); resolve(); }
        }, 50);
    });

    // 1. prompt event via args + env routing
    let r = await runHook(['--event', 'UserPromptSubmit', '--prompt', 'merhaba dünya']);
    await settle();
    eq('hook exits 0', r.code, 0);
    let s = live.sessions().find(x => x.sessionId === 'cli:gemini:dev:9');
    eq('session created from env', !!s, true);
    eq('status working after prompt', s.status, 'working');
    eq('prompt captured', s.lastPrompt, 'merhaba dünya');
    eq('agent resolved via env cwd', s.agentName, 'developer');
    eq('source from namespace', s.source, 'gemini');

    // 2. tool event
    await runHook(['--event', 'PreToolUse', '--tool', 'Bash']);
    await settle();
    s = live.sessions().find(x => x.sessionId === 'cli:gemini:dev:9');
    eq('status tool', s.status, 'tool');
    eq('tool name captured', s.currentTool, 'Bash');

    // 3. stdin JSON with known notify type → inferred Stop
    r = await runHook(['--json'], { stdin: '{"type":"agent-turn-complete","last-assistant-message":"done"}' });
    await settle();
    s = live.sessions().find(x => x.sessionId === 'cli:gemini:dev:9');
    eq('json stdin exits 0', r.code, 0);
    eq('agent-turn-complete → waiting-input', s.status, 'waiting-input');

    // 3b. B1: codex notify style — payload as the LAST ARGV, no --json, no stdin
    await runHook(['--event', 'UserPromptSubmit', '--prompt', 'tur arası']); // put lane back to working
    await settle();
    r = await runHook(['{"type":"agent-turn-complete","last-assistant-message":"bitti"}']);
    await settle();
    s = live.sessions().find(x => x.sessionId === 'cli:gemini:dev:9');
    eq('argv json exits 0', r.code, 0);
    eq('codex argv payload → waiting-input', s.status, 'waiting-input');

    // 3c. B1 guard: a JSON-looking VALUE of a flag is not mistaken for the payload
    await runHook(['--event', 'UserPromptSubmit', '--prompt', '{"not":"payload"}']);
    await settle();
    s = live.sessions().find(x => x.sessionId === 'cli:gemini:dev:9');
    eq('flag value kept literal', s.lastPrompt, '{"not":"payload"}');
    eq('flag value did not hijack event', s.status, 'working');

    // 4. unknown payload type, no --event → nothing sent, still exit 0
    const before = live.sessions().length;
    r = await runHook(['--json'], { stdin: '{"type":"mystery"}' });
    await settle();
    eq('unknown type exits 0', r.code, 0);
    eq('unknown type sends nothing', live.sessions().length, before);
    eq('unknown type says so on stderr', /nothing sent/.test(r.err), true);

    // 5. no session env → stable fallback lane per folder
    const bare = { ...process.env, AGENT_FARM_EVENT_PORT: String(PORT), AGENT_FARM_CWD: 'D:/agents/dev' };
    delete bare.AGENT_FARM_SESSION;
    await runHook(['--event', 'UserPromptSubmit', '--prompt', 'x'], { env: bare });
    await settle();
    eq('fallback lane cli:external:<folder>', !!live.sessions().find(x => x.sessionId === 'cli:external:dev'), true);

    // 6. listener down → fail-soft exit 0
    live.stop();
    await settle(200);
    r = await runHook(['--event', 'Stop']);
    eq('listener down still exits 0', r.code, 0);
    eq('listener down noted on stderr', /unreachable/.test(r.err), true);

    live.dispose();
    console.log(`\n${pass} passed, ${fail} failed`);
    Module._load = origLoad;
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
