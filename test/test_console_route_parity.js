'use strict';
// X-506 / X-507 — A SESSION'S ROUTE IS THE SAME WHICHEVER DOOR OPENS IT.
//
// Measured on the user's machine: a session started from the Console composer
// with a provider ran and wore its badge; the same agent started from a saved
// profile, or resumed with the Console list's Resume, ran on no route and its
// first message failed. Four holes, one test each:
//   1. a door hand-built the composer's setup and left the route out
//   2. the composer seeded the remembered MODEL and never the route beside it
//   3. the Console's spawn never asked the X-109 gate, only some of its doors did
//   4. the session -> launch join lived only as long as the card and the window
const fs = require('fs');
const path = require('path');
const Module = require('module');
const cp = require('child_process');
const { EventEmitter } = require('events');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const ROOT = path.resolve(__dirname, '..');
const OUT = (p) => path.join(ROOT, 'out', p);

/* ---------------- a child that is a shape, not a process ---------------- */
let spawned = 0;
const spawnArgv = [];
cp.spawn = (_exe, args) => {
    spawned++;
    spawnArgv.push(Array.isArray(args) ? args.slice() : []);
    const child = new EventEmitter();
    const pipe = () => { const s = new EventEmitter(); s.setEncoding = () => { }; s.destroy = () => { }; return s; };
    child.stdout = pipe(); child.stderr = pipe();
    child.stdin = { write: () => true, end: () => { } };
    child.pid = 9000 + spawned; child.kill = () => { };
    return child;
};
cp.exec = (_c, cb) => { if (typeof cb === 'function') { cb(null, '', ''); } };
cp.execSync = () => '';
cp.execFile = (_c, _a, _o, cb) => { const d = typeof _o === 'function' ? _o : cb; if (typeof d === 'function') { d(null, '', ''); } return new EventEmitter(); };

/* ---------------- a vscode that is a shape too ---------------- */
const panels = [];
const makePanel = () => {
    const p = {
        webview: {
            html: '', onMsgs: [], cspSource: 'vscode-webview:',
            asWebviewUri: (u) => ({ toString: () => 'vscode-webview://' + String(u.path || u) }),
            onDidReceiveMessage(fn) { this.onMsgs.push(fn); return { dispose() { } }; },
            postMessage() { return Promise.resolve(true); }
        },
        title: 'Console', visible: true, reveal() { }, onDidDispose() { return { dispose() { } }; },
        onDidChangeViewState: () => ({ dispose() { } }), dispose() { }
    };
    panels.push(p);
    return p;
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return {
            Uri: { joinPath: (base, ...rest) => ({ path: [base.path, ...rest].join('/') }) },
            ViewColumn: { Active: -1 }, ConfigurationTarget: { Global: 1 }, env: {},
            EventEmitter: class { constructor() { this.event = () => ({ dispose() { } }); } fire() { } },
            window: {
                createWebviewPanel: () => makePanel(),
                showErrorMessage: () => Promise.resolve(undefined),
                showInformationMessage: () => Promise.resolve(undefined),
                showWarningMessage: () => Promise.resolve(undefined)
            },
            commands: { executeCommand: () => Promise.resolve(undefined) },
            workspace: { getConfiguration: () => ({ get: (_k, d) => d, update: async () => { } }), workspaceFolders: [] }
        };
    }
    return origLoad.apply(this, arguments);
};

const { composerSetup, setupRoute, COMPOSER_SETUP_KEYS } = require(OUT('launch/doors/composer.js'));
const { gateResumeRoute } = require(OUT('core/consoleResumeRoute.js'));
const { keepSpawnPairs } = require(OUT('core/spawnIds.js'));
const { ConsoleHost } = require(OUT('core/consolehost.js'));
const { ConsolePanel } = require(OUT('panels/consolePanel.js'));
const { LAUNCH_DOORS, doorExemptions, carries } = require(path.join(__dirname, 'lib_launch_doors.js'));

const ROUTED = { engine: 'claude', model: 'kimi-k2', effort: 'high', permissionMode: 'default', providerId: 'kimi-work', tier: 'big' };

async function main() {
    /* ---------------- 1. the composer's setup is ONE list, the route on it ---------------- */
    {
        const s = composerSetup({ ...ROUTED, account: 'work-1', superpowers: true, prompt: 'go', resume: 'x', variant: 'v', cli: 'c' });
        ok('the composer setup carries the route', s.providerId === 'kimi-work' && s.tier === 'big');
        ok('…and the rest of what the composer has a box for',
            s.model === 'kimi-k2' && s.effort === 'high' && s.account === 'work-1' && s.superpowers === true && s.prompt === 'go');
        ok('…and nothing the composer has no box for', !('engine' in s) && !('resume' in s) && !('variant' in s) && !('cli' in s));
        ok('an unset field stays absent, not undefined-on-the-object', !('account' in composerSetup({ model: 'm' })));
        ok('the route of a record keeps its tier', JSON.stringify(setupRoute(ROUTED)) === '{"providerId":"kimi-work","tier":"big"}');
        ok('…and a tier with no route is no route', setupRoute({ tier: 'big' }) === undefined);
        ok('the list names the route', COMPOSER_SETUP_KEYS.includes('providerId') && COMPOSER_SETUP_KEYS.includes('tier'));
    }

    /* ---------------- 1b. every launch: handed to the Console is that list ---------------- */
    {
        const files = [];
        const walk = (d) => {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                const p = path.join(d, e.name);
                if (e.isDirectory()) { walk(p); } else if (e.name.endsWith('.ts')) { files.push(p); }
            }
        };
        walk(path.join(ROOT, 'src'));
        const bad = [];
        let calls = 0;
        const blank = (s) => s.replace(/[^\n]/g, ' ');
        for (const f of files) {
            // comments blanked, lines kept: a sentence about `launch:` is not a door
            const src = fs.readFileSync(f, 'utf8')
                .replace(/\/\*[\s\S]*?\*\//g, blank)
                .replace(/(^|[^:'"`])(\/\/[^\n]*)/gm, (_m, a, c) => a + blank(c));
            let at = src.indexOf('ConsolePanel.show(');
            while (at >= 0) {
                let depth = 0, end = at + 'ConsolePanel.show'.length;
                for (; end < src.length; end++) {
                    if (src[end] === '(') { depth++; } else if (src[end] === ')') { depth--; if (depth === 0) { break; } }
                }
                const call = src.slice(at, end);
                const m = /\blaunch\b\s*([:,}\n])/.exec(call);
                if (m) {
                    calls++;
                    const line = src.slice(0, at).split('\n').length;
                    const where = path.relative(ROOT, f) + ':' + line;
                    if (m[1] === ':') {
                        const rest = call.slice(m.index + m[0].length).trimStart();
                        if (!/^(composerSetup\(|\{\s*\.\.\.composerSetup\()/.test(rest)) { bad.push(where + ' builds launch by hand'); }
                    } else {
                        const before = src.slice(Math.max(0, at - 600), at);
                        if (!/\.\.\.launch\s*\}\s*=\s*\w+Door\.collect\(/.test(before)) { bad.push(where + ' passes a launch no door collected'); }
                    }
                }
                at = src.indexOf('ConsolePanel.show(', end);
            }
        }
        for (const b of bad) { console.log('    ' + b); }
        ok('‼️ every door that hands the Console a setup hands composerSetup() or a door\'s whole answer', bad.length === 0);
        ok('…and the scan really found the doors (' + calls + ')', calls >= 6);
    }

    /* ---------------- 1c. a door that opens the composer carries the route ---------------- */
    {
        const dropped = [];
        for (const d of LAUNCH_DOORS) {
            if (d.surface !== 'console' && d.surface !== 'either') { continue; }
            const has = carries(d);
            for (const dim of ['providerId', 'tier']) {
                if (!has.includes(dim) && !doorExemptions(d)[dim]) { dropped.push(d.id + '.' + dim); }
            }
        }
        for (const x of dropped) { console.log('    ' + x); }
        ok('‼️ no door that opens the Console drops the route', dropped.length === 0);
    }

    /* ---------------- 2. the composer seeds the route with the model ---------------- */
    {
        const started = [];
        let remembered;
        const deps = {
            extensionUri: { path: 'D:/repo' },
            host: { list: () => [], onChange: () => ({ dispose() { } }), start: (i) => { started.push(i); return 'seat-' + started.length; } },
            getAgents: () => ([{ id: 'a-dev', name: 'developer', dir: 'D:/ajan/developer' }]),
            index: { all: () => [], external: () => [], allWithExternal: () => [] },
            colorFor: () => '', modelAliases: () => [], engineModels: () => ({}),
            engines: () => ([{ id: 'claude', label: 'Claude Code', ready: true, auth: 'subscription' },
                { id: 'codex', label: 'Codex', ready: true, auth: 'subscription' }]),
            launchDefaults: () => ({ engine: 'claude', model: '', effort: '', permissionMode: 'default' }),
            agentEngineDefaults: () => ({ model: '', effort: '' }),
            agentSeedDefaults: () => ({ model: '', effort: '' }),
            lastLaunch: () => remembered,
            rememberLaunch: () => { }, liveOwners: () => [], history: () => [],
            olderHistory: () => ({ messages: [], more: false }), lastWindow: () => [], forgetLastWindow: () => { },
            leftoverOwner: () => undefined, endLeftover: async () => false, estimateCost: () => 0,
            projects: () => [], projectContextText: () => '', superpowersText: () => '',
            superpowersHealth: () => ({ usable: true, why: '', skills: 3 }), superpowersDefault: () => false,
            sessionProject: () => '', promptSnippets: () => ({ items: [], scopes: [] })
        };
        const send = async (msg) => {
            for (const fn of panels[panels.length - 1].webview.onMsgs) { fn(msg); }
            await new Promise(r => setImmediate(r));
        };
        remembered = { ...ROUTED, byEngine: { claude: { model: 'kimi-k2', effort: 'high', permissionMode: 'default', providerId: 'kimi-work', tier: 'big' } } };
        ConsolePanel.show(deps, { agentId: 'a-dev', pinAgent: true });
        await send({ type: 'start', text: 'hello' });
        const a = started[started.length - 1] || {};
        ok('‼️ a composer opened on a remembered routed setup starts ON that route (got ' + a.providerId + ')',
            a.providerId === 'kimi-work' && a.tier === 'big' && a.model === 'kimi-k2');

        remembered = undefined;
        ConsolePanel.show(deps, { agentId: 'a-dev', pinAgent: true });
        await send({ type: 'start', text: 'hello' });
        const b = started[started.length - 1] || {};
        ok('…and a composer for an agent with no memory does not keep the previous one\'s route',
            !b.providerId && !b.tier);

        ConsolePanel.show(deps, { agentId: 'a-dev', pinAgent: true, engine: 'claude', launch: composerSetup(ROUTED) });
        await send({ type: 'start', text: 'hello' });
        const c = started[started.length - 1] || {};
        ok('a door\'s setup handed through composerSetup starts on its route', c.providerId === 'kimi-work' && c.tier === 'big');

        remembered = { engine: 'codex', model: 'gpt-x', byEngine: { claude: { model: 'kimi-k2', providerId: 'kimi-work', tier: 'big' } } };
        ConsolePanel.show(deps, { agentId: 'a-dev', pinAgent: true, engine: 'codex' });
        await send({ type: 'setIntent', field: 'engine', value: 'claude' });
        await send({ type: 'start', text: 'hello' });
        const d = started[started.length - 1] || {};
        ok('‼️ moving the engine reads the route from the same row as the model (got ' + d.providerId + '/' + d.model + ')',
            d.providerId === 'kimi-work' && d.model === 'kimi-k2');
    }

    /* ---------------- 3. the Console's spawn asks the gate ---------------- */
    {
        const asked = [];
        const answer = { v: { providerId: 'kimi-work', tier: 'big', pinned: true } };
        const ask = (agentId, engine, sid) => { asked.push(sid); return answer.v; };
        const g = gateResumeRoute({ agentId: 'a', engine: 'claude', resume: 's1' }, ask);
        ok('a resume that named no route takes the gate\'s pinned one',
            g.init.providerId === 'kimi-work' && g.init.tier === 'big' && g.init.routePinned === true);
        answer.v = { providerId: '', pinned: true };
        const none = gateResumeRoute({ agentId: 'a', resume: 's1' }, ask).init;
        ok('…a pinned "no route" is pinned, so the standing route cannot fill it', none.routePinned === true && !none.providerId);
        answer.v = { providerId: 'standing', pinned: false };
        ok('…an unpinned answer changes nothing (the spawn falls back to the same standing route)',
            gateResumeRoute({ agentId: 'a', resume: 's1' }, ask).init.providerId === undefined);
        answer.v = { refuse: 'gone' };
        ok('…a refusal is handed back', gateResumeRoute({ agentId: 'a', resume: 's1' }, ask).refuse === 'gone');
        asked.length = 0;
        gateResumeRoute({ agentId: 'a', resume: 's1', providerId: 'x' }, ask);
        gateResumeRoute({ agentId: 'a', resume: 's1', routePinned: true }, ask);
        gateResumeRoute({ agentId: 'a' }, ask);
        ok('a door that stated a route, a pinned one and a fresh start are not asked', asked.length === 0);

        const routes = [];
        answer.v = { providerId: 'kimi-work', tier: 'big', pinned: true };
        const host = new ConsoleHost(() => 'claude', () => undefined, () => undefined, () => undefined, () => undefined,
            undefined, (_a, _e, route) => { routes.push(route); return undefined; },
            undefined, undefined, undefined, undefined, ask);
        const before = spawned;
        const id = host.start({ agentId: 'a-dev', agentName: 'developer', cwd: process.cwd(), engine: 'claude', resume: 'sess-routed' });
        const st = host.get(id) || {};
        ok('‼️ a Console resume from ANY door runs on its own route (got ' + st.providerId + ')',
            spawned === before + 1 && st.providerId === 'kimi-work' && st.tier === 'big' && st.routePinned === true);
        ok('…and the spawn was handed that route, pinned',
            routes.length > 0 && routes[routes.length - 1].providerId === 'kimi-work' && routes[routes.length - 1].pinned === true);
        answer.v = { refuse: 'this session ran on the "gone" route' };
        const before2 = spawned;
        const rid = host.start({ agentId: 'a-dev', agentName: 'developer', cwd: process.cwd(), engine: 'claude', resume: 'sess-gone' });
        const rs = host.get(rid) || {};
        ok('‼️ a refused resume spawns nothing and says why on its card',
            spawned === before2 && rs.status === 'error' && (rs.messages || []).some(m => /gone/.test(m.text || '')));
        const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
        const ctor = ext.slice(ext.indexOf('const consoleHost = new ConsoleHost('), ext.indexOf('consoleHostRef = consoleHost;'));
        ok('the extension hands its ConsoleHost the gate', /resumeRouteFor\(sessionId, engine, agentId, \{\}, 'acp'\)/.test(ctor));
    }

    /* ---------------- 4. the session -> launch join outlives the card ---------------- */
    {
        const a = keepSpawnPairs([{ sessionId: 's1', launchId: 'L1' }], [{ sessionId: 's1', launchId: 'L9' }, { sessionId: 's2', launchId: 'L2' }]);
        ok('a kept pair is never rewritten by a later one', a.pairs.find(p => p.sessionId === 's1').launchId === 'L1');
        ok('…a new pair is kept and says so', a.changed && a.pairs.some(p => p.sessionId === 's2'));
        ok('…nothing new is no write', !keepSpawnPairs(a.pairs, [{ sessionId: 's2', launchId: 'L2' }]).changed);
        ok('…a pair missing either half is not a pair', keepSpawnPairs([], [{ sessionId: 's3', launchId: '' }, { sessionId: '', launchId: 'L' }]).pairs.length === 0);
        const capped = keepSpawnPairs([{ sessionId: 'o1', launchId: 'A' }, { sessionId: 'o2', launchId: 'B' }], [{ sessionId: 'n1', launchId: 'C' }], 2);
        ok('…and the oldest goes first at the cap', capped.pairs.length === 2 && capped.pairs[0].sessionId === 'o2');
        const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
        const pub = ext.slice(ext.indexOf('const publishSpawnIds = ('), ext.indexOf('const publishSpawnIds = (') + 1300);
        ok('the extension publishes the KEPT pairs and stores the new ones',
            /keepSpawnPairs\(spawnPairs, pairs, undefined, id =>/.test(pub) && /index\.setSpawnIds\(kept\.pairs\)/.test(pub) && /globalState\.update\(SPAWN_PAIRS_KEY/.test(pub));
        ok('…and publishes them at activation, not at the first live tick',
            /consoleHostRef = consoleHost;[\s\S]{0,200}publishSpawnIds\(\);/.test(ext));
    }
}

const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), 30000).unref());
Promise.race([main(), timeout]).then(() => {
    console.log(`test_console_route_parity: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}, (e) => { console.log('  FAIL ' + (e && e.stack || e)); process.exit(1); });
