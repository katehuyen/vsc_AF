// X-117 — RESUMING A CONVERSATION, END TO END: the gate's verdict on the wire.
//
// X-109 built a gate that answers "which route does this resume spawn on", and
// every test of it so far has read the ANSWER. The answer is not the risk: the
// risk is the spawn not obeying it, which is the defect the gate was written
// for — a resumed session quietly falling through to the agent's standing route
// and continuing a conversation on an endpoint it never ran on.
//
// So this file asserts one relation rather than a list of outcomes: WHATEVER
// the real gate says, that is the endpoint the real CLI talks to.
//
//   1. A conversation opened on a route is resumed with nothing asked — the
//      gate pins what it ran on, and the resumed turn reaches that endpoint.
//   2. A resume that asks for a DIFFERENT route — the gate's verdict decides,
//      and the wire matches the verdict whichever way it fell.
//   3. A gate that refuses is a run that never happens: failed before it
//      started, nothing spawned, no endpoint touched.
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

const { TaskManager } = require(path.join(ROOT, 'out', 'core', 'tasks.js'));
const R = require(path.join(ROOT, 'out', 'core', 'providerRegistry.js'));
const RT = require(path.join(ROOT, 'out', 'core', 'providerRuntime.js'));
const G = require(path.join(ROOT, 'out', 'core', 'resumeGate.js'));
const { cliPresent, anthropicMock: mock } = require('./e2e_mocks');

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
    const miniM = await mock();
    const wrongM = await mock();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-e2e-resume-'));
    const agentDir = path.join(tmp, 'agent');
    fs.mkdirSync(agentDir, { recursive: true });

    const saved = {};
    const inherited = { ANTHROPIC_BASE_URL: wrongM.url, ANTHROPIC_API_KEY: 'sk-inherited-CANARY',
        ANTHROPIC_AUTH_TOKEN: 'sk-inherited-bearer-CANARY' };
    for (const k of Object.keys(process.env)) {
        if (RT.isRouteEnvName(k) || k === 'CLAUDE_CONFIG_DIR') { saved[k] = process.env[k]; delete process.env[k]; }
    }
    Object.assign(process.env, inherited);

    let mgr;
    try {
        const profiles = [
            { id: 'kimi', label: 'Kimi', engine: 'claude', providerId: 'kimi', baseUrl: kimiM.url,
                authKind: 'api-key', tiers: { opus: 'kimi-k2' }, revision: 7 },
            { id: 'minimax', label: 'MiniMax', engine: 'claude', providerId: 'minimax', baseUrl: miniM.url,
                authKind: 'api-key', tiers: { opus: 'MiniMax-M2' }, revision: 1 }
        ];
        const adapter = R.adapterFor('claude', { profiles, secretFor: id => `sk-${id}-CANARY`, inheritedEnv: inherited });
        const mockOf = { kimi: kimiM, minimax: miniM, '': wrongM };

        // What the record says the FIRST run was served by — the shape a launch
        // manifest hands the gate. Filled in after that run, from its own seal.
        let prior = {};
        const verdicts = [];
        const gateFor = (asked) => G.resumeRoute(adapter, 'declared', prior, asked || {}, {}, 'cli');

        const agent = { id: 'a1', name: 'e2e', dir: agentDir };
        const storage = path.join(tmp, 'farm-tasks.json');
        mgr = new TaskManager(storage, () => [agent], () => false, () => '', {
            engineRuntime: (_a, engine, route) => {
                if (!route || !route.providerId) { return undefined; }
                const rt = adapter.resolveRuntime({ engine, providerId: route.providerId, tier: route.tier });
                return { spawnEnv: rt.spawnEnv, clearEnv: rt.clearEnv };
            },
            getEnv: () => ({ CLAUDE_CONFIG_DIR: tmp, DISABLE_TELEMETRY: '1',
                CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }),
            resumeRoute: (_a, _e, _sid, route) => {
                const v = gateFor(route);
                verdicts.push(v);
                return v;
            }
        });

        // ---- the conversation this test resumes ----
        const first = mgr.addTask(agent, 'open', 'say ping', 'headless',
            { engine: 'claude', providerId: 'kimi', tier: 'opus', workDir: tmp });
        mgr.startTask(first);
        const st0 = await settle(first);
        ok(`the conversation was opened on its route (${st0})`, st0 === 'done');
        const sid = String(first.spawnSessionId || '');
        ok('…and the run declared the id the resume will name', /^[\w.-]+$/.test(sid));
        ok('‼️ the opening turn reached the route it named', kimiM.posts().length >= 1);
        // The seal the manifest would hold, stated from the run that really ran.
        const rt0 = adapter.resolveRuntime({ engine: 'claude', providerId: 'kimi', tier: 'opus' });
        prior = { identity: rt0.identity, tier: 'opus' };

        // ---- 1. resumed with nothing asked ----
        const afterFirst = { kimi: kimiM.hits.length, minimax: miniM.hits.length };
        const cont = mgr.addTask(agent, 'continue', 'say ping', 'headless',
            { engine: 'claude', workDir: tmp, resumeSessionId: sid });
        mgr.startTask(cont);
        const st1 = await settle(cont);
        ok(`the resumed turn finished (${st1})`, st1 === 'done');
        const v1 = verdicts[verdicts.length - 1];
        ok('‼️ the gate PINNED the route the conversation ran on, rather than falling through',
            !!v1 && v1.pinned === true && v1.providerId === 'kimi');
        ok('‼️ …and the resumed process talked to exactly that endpoint',
            mockOf[v1.providerId].hits.length > afterFirst[v1.providerId || 'kimi']);
        ok('‼️ …and never to the route sitting in the machine\'s own shell', wrongM.posts().length === 0);

        // ---- 2. a resume that asks for a different route ----
        // Whatever the gate decides is what the wire must show. Asserting a
        // FIXED outcome here would make this a second copy of the gate's own
        // unit tests; asserting the RELATION is the thing only a live run can
        // say, and it holds whichever way the policy is written.
        const before2 = { kimi: kimiM.hits.length, minimax: miniM.hits.length };
        const switched = mgr.addTask(agent, 'switch', 'say ping', 'headless',
            { engine: 'claude', providerId: 'minimax', tier: 'opus', workDir: tmp, resumeSessionId: sid });
        const allowed = mgr.startTask(switched);
        const v2 = verdicts[verdicts.length - 1];
        if (v2.act === 'refuse') {
            ok('‼️ the refused switch never started', allowed === false && switched.status === 'failed');
            await sleep(1500);
            ok('‼️ …and touched no endpoint at all',
                kimiM.hits.length === before2.kimi && miniM.hits.length === before2.minimax);
        } else {
            const st2 = await settle(switched);
            ok(`the switched turn finished (${st2})`, st2 === 'done');
            const served = mockOf[v2.providerId || ''];
            ok(`‼️ the wire matches the gate's verdict (${v2.act} -> ${v2.providerId || 'no route'})`,
                served.hits.length > (before2[v2.providerId] ?? 0));
            const other = v2.providerId === 'kimi' ? miniM : kimiM;
            const otherBefore = v2.providerId === 'kimi' ? before2.minimax : before2.kimi;
            ok('‼️ …and the route the verdict did NOT name was never reached',
                other.hits.length === otherBefore);
        }

        // ---- 3. a refusal is a run that never happens ----
        const before3 = { kimi: kimiM.hits.length, minimax: miniM.hits.length, wrong: wrongM.hits.length };
        mgr.opts.resumeRoute = () => ({ act: 'refuse', binding: 'declared', providerId: '', tier: '',
            pinned: false, previous: { providerId: 'kimi', profileId: 'kimi', revision: 7 },
            why: 'the profile it ran on is not kept any more.', remedy: 'fork' });
        const refused = mgr.addTask(agent, 'refused', 'say ping', 'headless',
            { engine: 'claude', workDir: tmp, resumeSessionId: sid });
        const went = mgr.startTask(refused);
        ok('‼️ a refused resume is not started', went === false && refused.status === 'failed');
        ok('…and it says why, in the gate\'s own words',
            /not kept any more/.test(refused.deferredReason || '')
            && warnings.some(w => /not resumed/.test(w)));
        await sleep(1500);
        ok('‼️ …and nothing at all went on any wire',
            kimiM.hits.length === before3.kimi && miniM.hits.length === before3.minimax
            && wrongM.hits.length === before3.wrong);
    } finally {
        try { mgr && mgr.dispose && mgr.dispose(); } catch { /* nothing held */ }
        for (const k of Object.keys(inherited)) { delete process.env[k]; }
        Object.assign(process.env, saved);
        await Promise.all([kimiM.close(), miniM.close(), wrongM.close()]);
        await sleep(600);
        fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
