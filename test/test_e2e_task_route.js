// X-117 — THE HEADLESS DOOR, END TO END: a real task, through the real runner.
//
// The Console and terminal doors are driven by somebody at a window. A TASK is
// the door with nobody in front of it, and that is what makes it the one worth
// running for real: every other file on this axis stubs `launch` away and
// measures the DECISION, so what the unattended spawn actually put on the wire
// has never been watched. It is also the door X-116's refusal gate lives on —
// and a gate is only a gate if something was going to go through it.
//
//   1. A queued task naming a route reaches THAT route's endpoint, with its key
//      and its tier model, while the route the machine's own shell carries is
//      never touched.
//   2. A task naming a route that has since been removed is refused at the
//      spawn: failed before it started, nothing spawned, no wire touched.
//   3. A task composed the way every automation door composes one — by the
//      SHAPE (`runExtras`), which a retry, a workflow step, a schedule and a
//      trigger all build from — reaches the route it was composed from.
//   4. A task naming NO route runs on the inherited endpoint untouched, which
//      is the rule ("nothing chosen means nothing touched", X-101).
//
// Skipped (not failed) when the CLI is not on PATH.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

class FakeEmitter {
    constructor() { this._cbs = []; }
    get event() { return cb => { this._cbs.push(cb); return { dispose() { } }; }; }
    fire(v) { for (const cb of this._cbs) { cb(v); } }
    dispose() { }
}
const warnings = [];
const fakeVscode = {
    Uri: {}, ViewColumn: {}, ConfigurationTarget: { Global: 1 }, env: {},
    EventEmitter: FakeEmitter,
    Disposable: { from: () => ({ dispose() { } }) },
    QuickPickItemKind: { Separator: -1 },
    commands: { executeCommand: () => { } },
    workspace: { getConfiguration: () => ({ get: (_k, d) => d, update: async () => { } }) },
    window: {
        showInformationMessage: () => Promise.resolve(undefined),
        showWarningMessage: m => { warnings.push(String(m)); return Promise.resolve(undefined); },
        showErrorMessage: () => Promise.resolve(undefined),
        createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }),
        onDidCloseTerminal: () => ({ dispose() { } }),
        onDidOpenTerminal: () => ({ dispose() { } })
    }
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') { return fakeVscode; }
    return origLoad.call(this, request, parent, isMain);
};

const T = require(path.join(ROOT, 'out', 'core', 'tasks.js'));
const { TaskManager } = T;
const R = require(path.join(ROOT, 'out', 'core', 'providerRegistry.js'));
const RT = require(path.join(ROOT, 'out', 'core', 'providerRuntime.js'));
const { cliPresent, anthropicMock: mock } = require('./e2e_mocks');

/** A task is finished when the runner says so — polled, never assumed. */
async function settle(task, ms = 120000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
        if (task.status !== 'queued' && task.status !== 'running') { return task.status; }
        await sleep(300);
    }
    return task.status;
}

async function main() {
    if (!cliPresent('claude')) {
        console.log('  skipped: the claude CLI is not on PATH');
        console.log(`\n${pass} passed, ${fail} failed`);
        return;
    }
    const kimiM = await mock();
    const wrongM = await mock();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-e2e-task-'));
    const agentDir = path.join(tmp, 'agent');
    fs.mkdirSync(agentDir, { recursive: true });

    // ‼️ THE INHERITED ROUTE GOES IN `process.env` — the runner spawns with it
    // as the base layer, so that is literally where a user's shell route sits.
    const saved = {};
    const inherited = { ANTHROPIC_BASE_URL: wrongM.url, ANTHROPIC_API_KEY: 'sk-inherited-CANARY',
        ANTHROPIC_AUTH_TOKEN: 'sk-inherited-bearer-CANARY' };
    for (const k of Object.keys(process.env)) {
        if (RT.isRouteEnvName(k) || k === 'CLAUDE_CONFIG_DIR') { saved[k] = process.env[k]; delete process.env[k]; }
    }
    Object.assign(process.env, inherited);

    let mgr;
    try {
        const profiles = [{ id: 'kimi', label: 'Kimi', engine: 'claude', providerId: 'kimi', baseUrl: kimiM.url,
            authKind: 'api-key', tiers: { opus: 'kimi-k2' }, revision: 5 }];
        const adapter = R.adapterFor('claude', { profiles, secretFor: id => `sk-${id}-CANARY`, inheritedEnv: inherited });
        // Removed everywhere but on the task that still names it — which is the
        // state X-116 exists for, reproduced rather than described.
        const refusal = (engine, providerId) => providerId === 'ghost'
            ? 'no profile named "ghost" is kept any more.' : undefined;

        const agent = { id: 'a1', name: 'e2e', dir: agentDir };
        const agents = () => [agent];
        const storage = path.join(tmp, 'farm-tasks.json');
        mgr = new TaskManager(storage, agents, () => false, () => '', {
            engineRuntime: (_agentId, engine, route) => {
                if (!route || !route.providerId) { return undefined; }
                const rt = adapter.resolveRuntime({ engine, providerId: route.providerId, tier: route.tier });
                return { spawnEnv: rt.spawnEnv, clearEnv: rt.clearEnv };
            },
            // The agent's own layer is where the config home rides, exactly as
            // the account layer does on a real window.
            getEnv: () => ({ CLAUDE_CONFIG_DIR: tmp, DISABLE_TELEMETRY: '1',
                CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }),
            routeRefusal: refusal
        });

        // ---- 1. a routed task ----
        const routed = mgr.addTask(agent, 'routed', 'say ping', 'headless',
            { engine: 'claude', providerId: 'kimi', tier: 'opus', workDir: tmp });
        const started = mgr.startTask(routed);
        ok('the routed task was allowed to start', started === true);
        const st1 = await settle(routed);
        ok(`the routed task finished (${st1})`, st1 === 'done');
        ok('‼️ the unattended run reached ITS route, with its key and tier model',
            kimiM.posts().length >= 1 && kimiM.posts().every(h => h.key === 'sk-kimi-CANARY' && h.model === 'kimi-k2'));
        ok('‼️ …and the route the machine\'s own shell carries was never reached', wrongM.posts().length === 0);
        ok('‼️ …and no inherited bearer rode along on the routed wire',
            kimiM.hits.every(h => !/inherited/.test(h.auth)));

        // ---- 2. the refusal, at the spawn ----
        const afterRouted = kimiM.hits.length;
        const routedPosts = kimiM.posts().length;
        const ghost = mgr.addTask(agent, 'ghost', 'say ping', 'headless',
            { engine: 'claude', providerId: 'ghost', tier: 'opus', workDir: tmp });
        const ghostStarted = mgr.startTask(ghost);
        ok('‼️ a task naming a route that is gone is refused rather than started', ghostStarted === false);
        ok('‼️ …and it ends FAILED, not queued or parked — a run that will never come',
            ghost.status === 'failed' && /cannot be run on now/.test(ghost.deferredReason || ''));
        ok('…and the person is told why', warnings.some(w => /did not start/.test(w)));
        await sleep(1500);
        ok('‼️ …and nothing at all went on any wire', kimiM.hits.length === afterRouted && wrongM.hits.length === 0);

        // ---- 3. the composition every automation door shares ----
        /**
         * ‼️ ONE SHAPE CARRIES THE ROUTE INTO EVERY UNATTENDED RUN, so this is
         * where it is worth watching rather than once per door.
         *
         * A retry, a workflow step, a schedule and a trigger all build their
         * task by spreading `runExtras(<the thing that was stored>)` — that is
         * the rule the repo states as "a run's dimensions travel by the SHAPE,
         * never a hand-written field list", and it exists because the automatic
         * retry once hand-copied eight fields and silently dropped seven, the
         * route among them, on the path where nobody is at a window to notice.
         *
         * A unit test can only say the shape carries the field. Whether the
         * composed task then reaches that endpoint is a different claim, and it
         * is this one: built exactly the way the auto-retry builds it, from a
         * run that really happened.
         */
        const retried = mgr.addTask(agent, 'retry of routed', 'say ping', 'headless',
            { ...T.runExtras(routed), workDir: tmp, retryOf: routed.id, retryAttempt: 1 });
        ok('the shape carried the route onto the composed task',
            retried.providerId === 'kimi' && retried.tier === 'opus');
        mgr.startTask(retried);
        const stR = await settle(retried);
        ok(`the composed run finished (${stR})`, stR === 'done');
        ok('‼️ …and reached the endpoint of the run it was composed from',
            kimiM.posts().length > routedPosts
            && kimiM.posts().slice(routedPosts).every(h => h.key === 'sk-kimi-CANARY' && h.model === 'kimi-k2'));
        ok('‼️ …and not the inherited one', wrongM.hits.length === 0);
        const afterRetry = kimiM.hits.length;

        // ---- 4. nothing chosen means nothing touched ----
        const plain = mgr.addTask(agent, 'plain', 'say ping', 'headless', { engine: 'claude', workDir: tmp });
        mgr.startTask(plain);
        const st3 = await settle(plain);
        ok(`the unrouted task finished (${st3})`, st3 === 'done');
        ok('‼️ a task naming NO route runs on the inherited endpoint, untouched',
            wrongM.posts().length >= 1 && wrongM.posts().every(h => h.key === 'sk-inherited-CANARY'));
        ok('‼️ …and it did not stray onto the route nobody asked for',
            kimiM.hits.length === afterRetry);
    } finally {
        try { mgr && mgr.dispose && mgr.dispose(); } catch { /* nothing held */ }
        for (const k of Object.keys(inherited)) { delete process.env[k]; }
        Object.assign(process.env, saved);
        await Promise.all([kimiM.close(), wrongM.close()]);
        await sleep(600);
        fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
