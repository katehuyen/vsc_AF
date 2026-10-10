'use strict';
// X-525 (3) — a route leaves (removed, or unmarked for an engine) only once the records naming it are
// settled: refused with the list until then = repoint (to a route serving the same models) | clear | delete.
const { routeGoingVerdict, settleRouteRecords, describeDependent: describe } = require('../out/core/routeGoing.js');
const { collectRouteRecords, routeDependents } = (() => {
    const r = require('../out/core/routeRecords.js');
    return { collectRouteRecords: r.collectRouteRecords, routeDependents: require('../out/core/savedRoutes.js').routeDependents };
})();

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const TIERS = { opus: 'qwen/qwen3.8', sonnet: 'qwen/qwen3.8', haiku: 'qwen/qwen3.8-mini' };
const routes = () => [
    { id: 'or-qwen38', engines: ['claude', 'opencode'], tiers: { ...TIERS }, hasKey: true },
    { id: 'qwen-b', engines: ['claude', 'opencode'], tiers: { ...TIERS, extra: 'x' }, hasKey: true },
    { id: 'qwen-claude-only', engines: ['claude'], tiers: { ...TIERS }, hasKey: true },
    { id: 'qwen-nokey', engines: ['claude', 'opencode'], tiers: { ...TIERS }, hasKey: false },
    { id: 'qwen-short', engines: ['claude', 'opencode'], tiers: { opus: 'qwen/qwen3.8' }, hasKey: true },
    { id: 'same-vendor', engines: ['claude', 'opencode'], tiers: { opus: 'qwen/qwen3.9', sonnet: 'qwen/qwen3.8', haiku: 'qwen/qwen3.8-mini' }, hasKey: true }
];
// The acceptance scene: three launch profiles and one agent default use the route; history ran on it.
const snap = () => ({
    agentNames: { 'd:/a/dev': 'developer', 'dev-id': 'developer' },
    agentDefaults: { 'd:/a/dev': { claude: { providerId: 'or-qwen38', tier: 'opus' } } },
    launchProfiles: [
        { name: 'Genel Qwen3.8', providerId: 'or-qwen38', tier: 'sonnet' },
        { name: 'Qwen hızlı', providerId: 'or-qwen38', tier: 'haiku' },
        { name: 'OC Qwen', engine: 'opencode', model: 'af-or-qwen38/qwen/qwen3.8', tier: 'opus' },
        { name: 'Başka', providerId: 'or-nemotron' }
    ],
    lastLaunch: {}, tasks: [{ title: 'ran last night', status: 'done', providerId: 'or-qwen38', tier: 'opus' }],
    schedules: [], templates: [], workflows: [], triggers: [], missions: [],
    batons: [{ chainId: 'c', hop: 0, state: 'done', from: { engine: 'claude' }, inherit: { providerId: 'or-qwen38' } }]
});
const recs = s => collectRouteRecords(s);

/* ---------- the verdict */
{
    const v = routeGoingVerdict({ id: 'or-qwen38' }, recs(snap()), routes());
    ok('‼️ with no then, removal is refused naming all four records', !!v.refusal && v.needsChoice === true
        && v.dependents.length === 4 && /4 saved records name route "or-qwen38"/.test(v.refusal)
        && ['Genel Qwen3.8 (launch profile)', 'Qwen hızlı (launch profile)', 'OC Qwen (launch profile, opencode)', 'developer (agent default)']
            .every(n => v.refusal.includes(n)));
    ok('…and names the routes that may take its place', /routes serving the same models: qwen-b/.test(v.refusal));
    ok('only a route marked for every dependent engine, with a key, holding every tier the same is a stand-in',
        v.standIns.join(',') === 'qwen-b');
    ok('‼️ the same vendor with one different model is not a stand-in', !v.standIns.includes('same-vendor'));
    ok('a route nothing names goes without a question', !routeGoingVerdict({ id: 'or-nemotron-x' }, recs(snap()), routes()).refusal);
    const clr = routeGoingVerdict({ id: 'or-qwen38', then: 'clear' }, recs(snap()), routes());
    ok('then=clear is an answer', !clr.refusal && clr.then.kind === 'clear');
    ok('then=delete is an answer', routeGoingVerdict({ id: 'or-qwen38', then: 'Delete' }, recs(snap()), routes()).then.kind === 'delete');
    ok('another then is refused by name', /not "move"/.test(routeGoingVerdict({ id: 'or-qwen38', then: 'move' }, recs(snap()), routes()).refusal));
    ok('repoint without to is refused', /needs to=<route>/.test(routeGoingVerdict({ id: 'or-qwen38', then: 'repoint' }, recs(snap()), routes()).refusal));
    for (const bad of ['same-vendor', 'qwen-claude-only', 'qwen-nokey', 'qwen-short', 'or-qwen38', 'nothing']) {
        ok(`repoint to ${bad} is refused`, /can take "or-qwen38"'s place only when/.test(
            routeGoingVerdict({ id: 'or-qwen38', then: 'repoint', to: bad }, recs(snap()), routes()).refusal || ''));
    }
    const rp = routeGoingVerdict({ id: 'or-qwen38', then: 'repoint', to: 'QWEN-B' }, recs(snap()), routes());
    ok('repoint to a stand-in is an answer', !rp.refusal && rp.then.kind === 'repoint' && rp.then.to === 'qwen-b');
    const claudeOnly = routeGoingVerdict({ id: 'or-qwen38', leaving: ['claude'] }, recs(snap()), routes());
    ok('unmarking Claude asks only about the records running it on Claude', claudeOnly.dependents.length === 3
        && !claudeOnly.dependents.some(r => r.engine === 'opencode') && claudeOnly.standIns.includes('qwen-claude-only'));
    ok('unmarking an engine nothing runs it on goes without a question',
        !routeGoingVerdict({ id: 'or-qwen38', leaving: ['codex'] }, recs(snap()), routes()).refusal);
}

/* ---------- the host: one removal, settled before anything is written */
{
    const fs = require('fs');
    const path = require('path');
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    const between = (a, b) => { const i = ext.indexOf(a); return i < 0 ? '' : ext.slice(i, ext.indexOf(b, i)); };
    const io = between('const routeGoingIo: RouteGoingIo = {', 'const settleLeavingRoute = async (');
    ok('‼️ settling writes the six stores and nothing else — never a manifest, transcript, turn, cost or the retired list',
        /cfg\(\)\.update\('agentEngineDefaults', snap\.agentDefaults/.test(io) && /cfg\(\)\.update\('launchProfiles', snap\.launchProfiles/.test(io)
        && /context\.globalState\.update\(LAST_LAUNCH_KEY, snap\.lastLaunch\)/.test(io) && /taskManager\.persist\(\)/.test(io)
        && /missionStore\.save\(\)/.test(io) && /batonStore\.put\(/.test(io)
        && !/\b(manifests?|transcripts?|retire\w*|turns?|costs?|routeNames?)\b/i.test(io.replace(/RouteGoingIo|routeGoingIo/g, '')));
    const settle = between('const settleLeavingRoute = async (', 'const removeRoute = async (');
    ok('the page asks one modal question: keep (a tier still filled) first, a move per stand-in, clear, delete when a profile is among them',
        /\{ modal: true, detail: v\.dependents\.map\(describeDependent\)\.join\('\\n'\) \}/.test(settle)
        && /\.\.\.keep, \.\.\.moves, 'Clear the route', \.\.\.del\)/.test(settle)
        && /const keep = v\.keepable \? \[`Keep them on \$\{id\}`\] : \[\];/.test(settle)
        && /v\.dependents\.some\(r => r\.kind === 'launch profile'\) \? \['Delete the saved setups'\] : \[\]/.test(settle)
        && /if \(!pick\) \{ return 'Nothing was changed\.'; \}/.test(settle));
    const rm = between('const removeRoute = async (', 'const settleEdit = async (');
    ok('‼️ the records are settled before the route, its key or its verdicts are touched',
        rm.indexOf('settleLeavingRoute(') > 0 && rm.indexOf('settleLeavingRoute(') < rm.indexOf('writeProviderProfiles(')
        && rm.indexOf('if (unsettled) { return { refusal: [unsettled] }; }') < rm.indexOf('clearProviderSecret('));
    const edit = between('const settleEdit = async (', 'const providerHealthInput = async');
    ok('an edit settles the engines it unticks, then the tiers whose model it changes or empties',
        /const leaving = before\.engines\.filter\(e => !next\.engines\.includes\(e\)\);/.test(edit)
        && /\.filter\(\(\[t, m\]\) => String\(m \?\? ''\)\.trim\(\) && after\[t\] !== m\)/.test(edit)
        && edit.indexOf('{ leaving }') < edit.indexOf('{ retiring: { tiers, after } }'));
    const set = between("op: 'providers.set'", "op: 'providers.copy'");
    ok('providers.set settles the edit\'s records before writing, with then/to',
        /const unsettled = await settleEdit\(id, w\.profile, \{ then: optStr\(args, 'then'\), to: optStr\(args, 'to'\) \}, false\);/.test(set)
        && set.indexOf('need(!unsettled') < set.indexOf('writeProviderProfiles(w.list)'));
    const page = between('saveProfile: async (input: Record<string, unknown>, edit: boolean)', 'routeSecretNames:');
    ok('…and so does the page\'s edit, by a person\'s pick', page.indexOf('await settleEdit(id, w.profile, {}, true)') > 0
        && page.indexOf('if (unsettled) { return [unsettled]; }') < page.indexOf('writeProviderProfiles(w.list)'));
}

/* ---------- a tier changes or loses its model */
{
    const after = (o) => ({ ...TIERS, ...o });
    const changed = routeGoingVerdict({ id: 'or-qwen38', retiring: { tiers: { opus: TIERS.opus }, after: after({ opus: 'qwen/qwen3.9' }) } },
        recs(snap()), routes());
    ok('a tier changing its model asks about the records naming THAT tier only',
        changed.dependents.map(describe).join('|') === 'developer (agent default)');
    ok('‼️ …and the OpenCode record whose model another tier still serves is not one of them',
        !changed.dependents.some(r => r.engine === 'opencode'));
    ok('…keep is an answer while the tier is still filled, and named in the refusal', changed.keepable === true
        && /then=keep \(they run on the tier's new model\)/.test(changed.refusal));
    ok('…a stand-in only needs the old model in the changing tier', changed.standIns.includes('qwen-claude-only')
        && !changed.standIns.includes('same-vendor'));
    const keep = routeGoingVerdict({ id: 'or-qwen38', then: 'keep', retiring: { tiers: { opus: TIERS.opus }, after: after({ opus: 'qwen/qwen3.9' }) } },
        recs(snap()), routes());
    ok('then=keep is accepted there', !keep.refusal && keep.then.kind === 'keep');
    const emptied = { tiers: { haiku: TIERS.haiku }, after: { opus: TIERS.opus, sonnet: TIERS.sonnet } };
    const em = routeGoingVerdict({ id: 'or-qwen38', retiring: emptied }, recs(snap()), routes());
    ok('an emptied tier cannot be kept', em.dependents.map(describe).join('|') === 'Qwen hızlı (launch profile)' && !em.keepable
        && !/then=keep/.test(em.refusal)
        && /not "keep"/.test(routeGoingVerdict({ id: 'or-qwen38', then: 'keep', retiring: emptied }, recs(snap()), routes()).refusal));
    ok('‼️ …and a route holding the same model in that tier may stand in, whatever else it serves', em.standIns.includes('same-vendor'));
    const both = { tiers: { opus: TIERS.opus, sonnet: TIERS.sonnet }, after: after({ opus: 'x', sonnet: 'y' }) };
    const oc = routeGoingVerdict({ id: 'or-qwen38', retiring: both }, recs(snap()), routes());
    ok('an OpenCode record naming a model the route no longer serves at all is a dependent, and cannot be kept',
        oc.dependents.some(r => r.label === 'OC Qwen') && !oc.keepable);
}

/* ---------- settling writes the stores it touched, and only after an answer */
const io = (s) => {
    const writes = [];
    return { writes, io: { snapshot: () => s, routes, write: async (store) => { writes.push(store); } } };
};
(async () => {
    {
        const s = snap();
        const { writes, io: x } = io(s);
        const before = JSON.stringify(s);
        const v = await settleRouteRecords({ id: 'or-qwen38' }, x);
        ok('‼️ a refusal writes nothing', v.refusal && writes.length === 0 && JSON.stringify(s) === before);
        await settleRouteRecords({ id: 'or-qwen38', then: 'repoint', to: 'nothing' }, x);
        ok('…nor does a refused repoint', writes.length === 0 && JSON.stringify(s) === before);
    }
    {
        const s = snap();
        const { writes, io: x } = io(s);
        const history = JSON.stringify([s.tasks, s.batons]);
        const v = await settleRouteRecords({ id: 'or-qwen38', then: 'repoint', to: 'qwen-b' }, x);
        ok('‼️ repoint: all four records now name the new route', !v.refusal
            && routeDependents('qwen-b', collectRouteRecords(s)).length === 4
            && routeDependents('or-qwen38', collectRouteRecords(s)).length === 0
            && s.launchProfiles[2].model === 'af-qwen-b/qwen/qwen3.8' && s.agentDefaults['d:/a/dev'].claude.tier === 'opus');
        ok('…written to exactly the stores it touched', writes.slice().sort().join(',') === 'agentDefaults,launchProfiles');
        ok('‼️ …and what already ran on the old route keeps it', JSON.stringify([s.tasks, s.batons]) === history);
    }
    {
        const s = snap();
        const { io: x } = io(s);
        await settleRouteRecords({ id: 'or-qwen38', then: 'delete' }, x);
        ok('delete: the launch profiles naming it are gone, the agent default cleared',
            s.launchProfiles.map(p => p.name).join(',') === 'Başka' && !('providerId' in s.agentDefaults['d:/a/dev'].claude));
    }
    {
        const s = snap();
        const { io: x } = io(s);
        await settleRouteRecords({ id: 'or-qwen38', then: 'clear', leaving: ['opencode'] }, x);
        ok('unmarking one engine settles only that engine\'s records', !('model' in s.launchProfiles[2])
            && s.launchProfiles[0].providerId === 'or-qwen38' && s.agentDefaults['d:/a/dev'].claude.providerId === 'or-qwen38');
    }
    {
        const s = snap();
        const { writes, io: x } = io(s);
        const before = JSON.stringify(s);
        const opus = { tiers: { opus: TIERS.opus }, after: { ...TIERS, opus: 'qwen/qwen3.9' } };
        await settleRouteRecords({ id: 'or-qwen38', then: 'keep', retiring: opus }, x);
        ok('then=keep writes nothing — the tier keeps its name, the route its records', writes.length === 0 && JSON.stringify(s) === before);
        await settleRouteRecords({ id: 'or-qwen38', then: 'repoint', to: 'qwen-claude-only', retiring: opus }, x);
        ok('a tier\'s repoint moves only the records naming that tier', s.agentDefaults['d:/a/dev'].claude.providerId === 'qwen-claude-only'
            && s.launchProfiles[0].providerId === 'or-qwen38' && s.launchProfiles[1].providerId === 'or-qwen38'
            && writes.join(',') === 'agentDefaults');
    }
    console.log(`test_x525_going: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
