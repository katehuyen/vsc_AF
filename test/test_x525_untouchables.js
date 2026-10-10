'use strict';
// X-525 (6) — HISTORY IS NEVER TOUCHED. The untouchables, by name:
//   launch manifests (globalState MANIFEST_KEY) · the S-136 route summary they carry · the S-135 retired ids
//   (globalState RETIRED_PROFILES_KEY — a removal adds its own id, as S-135 says, and nothing else writes it) ·
//   the S-137 route names (derived from the manifests and profiles) · transcripts · turn ids · cost records ·
//   and the rows of what already ran (finished tasks, started baton legs).
// Proven twice: the host's X-525 code names none of their writers, and every action leaves their bytes identical.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { applyRouteChange } = require('../out/core/routeRecords.js');
const { settleRouteRecords } = require('../out/core/routeGoing.js');
const { fixRouteRefs } = require('../out/core/routeRefs.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

/* ---------- 1. the host's X-525 block writes the six stores and nothing that is history */
{
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    const a = ext.indexOf('const routeSnapshot = (): RouteSnapshot => {');
    const z = ext.indexOf('const providerHealthInput = async');
    const block = a > 0 && z > a ? ext.slice(a, z) : '';
    ok('the X-525 host block is found', block.length > 2000);
    const writers = ['MANIFEST_KEY', 'recordLaunch(', 'launchManifests(', 'routeNamesNow(', 'appendFileSync', 'writeFileSync',
        'turnIndex', 'costLedger', 'transcript', 'RETIRED_PROFILES_KEY'];
    for (const w of writers) { ok(`‼️ it never names ${w}`, !block.includes(w)); }
    const updates = [...block.matchAll(/globalState\.update\((\w+)/g)].map(m => m[1]);
    ok('its only globalState write is the last used setup', updates.length === 1 && updates[0] === 'LAST_LAUNCH_KEY');
    const retire = [...block.matchAll(/retireProviderId\(/g)].length;
    ok('the retired list is written by the removal alone, with the removed id (S-135\'s own rule)', retire === 1
        && /await retireProviderId\(w\.profile!\.id\);/.test(block));
}

/* ---------- 2. every action leaves the untouchables' bytes as they were */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-x525-untouch-'));
const file = n => path.join(dir, n);
const write = (n, v) => fs.writeFileSync(file(n), typeof v === 'string' ? v : JSON.stringify(v, null, 2), 'utf8');
const UNTOUCHABLE = {
    'launch-manifests.json': [{ launchId: 'L1', identity: { providerId: 'or-qwen38', profileRevision: 3, routeSummary: 'or-qwen38 · opus → qwen/qwen3.8' } }],
    'retired-route-ids.json': ['or-old'],
    'route-names.json': { 'or-qwen38': 'Genel Qwen3.8', 'kimi-gone': 'Kimi' },
    'transcript-abc.jsonl': '{"type":"user","message":"hi"}\n{"type":"assistant","model":"qwen/qwen3.8"}\n',
    'turns.json': [{ turnId: 't-1', sessionId: 'abc', providerId: 'or-qwen38' }],
    'costs.json': [{ sessionId: 'abc', usd: 0.0123, route: 'or-qwen38' }]
};
for (const [n, v] of Object.entries(UNTOUCHABLE)) { write(n, v); }
const sha = n => crypto.createHash('sha256').update(fs.readFileSync(file(n))).digest('hex');
const before = Object.fromEntries(Object.keys(UNTOUCHABLE).map(n => [n, sha(n)]));

const TIERS = { opus: 'qwen/qwen3.8', sonnet: 'qwen/qwen3.8', haiku: 'qwen/qwen3.8-mini' };
const routes = () => [
    { id: 'or-qwen38', engines: ['claude', 'opencode'], tiers: { ...TIERS }, hasKey: true },
    { id: 'qwen-b', engines: ['claude', 'opencode'], tiers: { ...TIERS }, hasKey: true },
    { id: 'kimi-a', engines: ['claude'], tiers: { opus: 'kimi-k2' }, hasKey: true }
];
const stores = () => ({
    agentNames: { 'd:/a/dev': 'developer', 'dev-id': 'developer' },
    agentDefaults: { 'd:/a/dev': { claude: { providerId: 'or-qwen38', tier: 'opus' } } },
    launchProfiles: [{ name: 'P1', providerId: 'or-qwen38', tier: 'sonnet' }, { name: 'P2', providerId: 'kimi-gone', model: 'kimi-k2' },
        { name: 'P3', engine: 'opencode', model: 'af-or-qwen38/qwen/qwen3.8' }],
    lastLaunch: { 'dev-id': { engine: 'claude', providerId: 'or-qwen38', byEngine: { claude: { providerId: 'or-qwen38' } } } },
    tasks: [{ title: 'ran', status: 'done', providerId: 'or-qwen38', tier: 'opus' }, { title: 'waits', status: 'queued', providerId: 'or-qwen38' }],
    schedules: [{ title: 'S', providerId: 'or-qwen38' }], templates: [], workflows: [],
    triggers: [], missions: [{ title: 'M', providerId: 'or-qwen38', team: [] }],
    batons: [{ chainId: 'c', hop: 1, state: 'started', from: { engine: 'claude' }, inherit: { providerId: 'or-qwen38' } },
        { chainId: 'c', hop: 2, state: 'parked', from: { engine: 'claude' }, inherit: { providerId: 'or-qwen38' } }]
});
const history = s => JSON.stringify([s.tasks[0], s.batons[0]]);
const io = s => ({
    snapshot: () => s, routes,
    write: async (store, snap) => { write(`store-${store}.json`, store === 'tasks' ? [snap.tasks, snap.schedules] : snap[store] ?? null); }
});
const actions = [
    ['remove, repoint', s => settleRouteRecords({ id: 'or-qwen38', then: 'repoint', to: 'qwen-b' }, io(s))],
    ['remove, clear', s => settleRouteRecords({ id: 'or-qwen38', then: 'clear' }, io(s))],
    ['remove, delete', s => settleRouteRecords({ id: 'or-qwen38', then: 'delete' }, io(s))],
    ['untick OpenCode, clear', s => settleRouteRecords({ id: 'or-qwen38', then: 'clear', leaving: ['opencode'] }, io(s))],
    ['tier changed, keep', s => settleRouteRecords({ id: 'or-qwen38', then: 'keep', retiring: { tiers: { opus: TIERS.opus }, after: { ...TIERS, opus: 'q9' } } }, io(s))],
    ['tier emptied, repoint', s => settleRouteRecords({ id: 'or-qwen38', then: 'repoint', to: 'qwen-b', retiring: { tiers: { haiku: TIERS.haiku }, after: { opus: TIERS.opus } } }, io(s))],
    ['cleanup: unique move', async s => fixRouteRefs(s, routes())],
    ['cleanup: clear', async s => fixRouteRefs(s, routes(), undefined, 'clear')],
    ['cleanup: delete', async s => fixRouteRefs(s, routes(), undefined, 'delete')],
    ['the bare edit', async s => applyRouteChange(s, 'or-qwen38', { kind: 'repoint', to: 'qwen-b' })]
];
(async () => {
    for (const [name, act] of actions) {
        const s = stores();
        const was = history(s);
        await act(s);
        const same = Object.keys(UNTOUCHABLE).filter(n => sha(n) === before[n]);
        ok(`‼️ ${name}: every untouchable is byte-identical (${same.length}/${Object.keys(UNTOUCHABLE).length})`,
            same.length === Object.keys(UNTOUCHABLE).length);
        ok(`‼️ ${name}: what already ran keeps its route`, history(s) === was);
    }
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    console.log(`test_x525_untouchables: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
