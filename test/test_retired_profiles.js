// S-135 — a route id is given once. A removed profile's id is never handed out
// again, because past sessions name their route by it (src/core/retiredProfiles.ts).
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const P = require(path.join(ROOT, 'out', 'core', 'providerProfiles.js'));
const R = require(path.join(ROOT, 'out', 'core', 'retiredProfiles.js'));

const kimi = {
    id: 'kimi', label: 'Kimi', engines: ['claude'], providerId: 'kimi',
    baseUrl: 'https://api.moonshot.ai/anthropic', authKind: 'api-key',
    tiers: { opus: 'kimi-k2-thinking', sonnet: 'kimi-k2' }
};
const manifest = (pid) => ({ launchId: 'l-' + pid, at: 1, engine: 'claude', identity: { engine: 'claude', providerProfileId: pid } });

// ---------- which ids are retired ----------
{
    const current = [{ id: 'kimi' }];
    const ids = R.retiredProfileIds(current, [manifest('qwen'), manifest('kimi'), manifest('QWEN'), {}], ['old-route', ' Gone ', 7, '']);
    ok('a removed id and an id only a launch record still names are retired, lower-cased, once each, sorted',
        JSON.stringify(ids) === JSON.stringify(['gone', 'old-route', 'qwen']));
    ok('…and an id a current profile carries is never retired, whatever history says', !ids.includes('kimi'));
    ok('nothing stored and no history: nothing retired', R.retiredProfileIds([], undefined, undefined).length === 0);
    ok('retire adds an id once, lower-cased, and keeps what was there',
        JSON.stringify(R.retire(['a'], 'B')) === JSON.stringify(['a', 'b'])
        && JSON.stringify(R.retire(['a', 'b'], 'b')) === JSON.stringify(['a', 'b'])
        && JSON.stringify(R.retire(undefined, 'x')) === JSON.stringify(['x']));
    ok('the store is the extension\'s own, under one key', R.RETIRED_PROFILES_KEY === 'agentfarm.retiredProviderProfiles');
}

// ---------- add, copy and the free id ----------
{
    const w = P.addProfile([], kimi, ['claude'], ['kimi']);
    ok('‼️ a new route on a retired id is refused, and the refusal says why and which id to use',
        w.list.length === 0 && w.refusal.length === 1
        && /belonged to a route that was removed/.test(w.refusal[0]) && /use "kimi-2"/.test(w.refusal[0]));
    const w2 = P.addProfile([], kimi, ['claude'], ['kimi', 'kimi-2']);
    ok('…the suggestion skips retired ids too', /use "kimi-3"/.test(w2.refusal[0]));
    const w3 = P.addProfile([], { ...kimi, id: 'kimi-2' }, ['claude'], ['kimi']);
    ok('a route on a fresh id is added as before', w3.refusal.length === 0 && w3.list.length === 1);
    ok('a caller that passes no retired list is unchanged', P.addProfile([], kimi, ['claude']).refusal.length === 0);
    const one = P.addProfile([], kimi, ['claude']).list;
    const live = P.addProfile(one, kimi, ['claude'], ['kimi']);
    ok('an id that is live is "already exists", never also "was removed"',
        live.refusal.length === 1 && /already exists/.test(live.refusal[0]));
    const copy = P.duplicateProfile(one, 'kimi', undefined, ['kimi-2']);
    ok('‼️ a copy never lands on a retired id: kimi-2 was removed, so the copy is kimi-3',
        copy.refusal.length === 0 && copy.profile.id === 'kimi-3');
    const named = P.duplicateProfile(one, 'kimi', 'kimi-2', ['kimi-2']);
    ok('…and a copy asked for by a retired name is refused', named.refusal.length === 1 && /was removed/.test(named.refusal[0]));
    ok('freeProfileId counts past retired ids', P.freeProfileId(one, 'kimi', ['kimi-2', 'kimi-3']) === 'kimi-4');
}

// ---------- every door asks, every removal retires ----------
{
    const src = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const count = (re) => (src.match(re) || []).length;
    ok('‼️ the page\'s add and the bridge\'s add both pass the retired ids',
        /: addProfile\(list, input, engines, retiredProviderIds\(\)\)/.test(src)
        && /addProfile\(providerProfiles\(\), args as Record<string, unknown>,\s*Object\.keys\(ENGINES\), retiredProviderIds\(\)\)/.test(src)
        && count(/addProfile\(/g) === 2);
    ok('…both copies do', count(/duplicateProfile\([^;]*retiredProviderIds\(\)\)/g) === 2 && count(/duplicateProfile\(/g) === 2);
    // X-525 — one removal (removeRoute), which the page and the bridge both call.
    ok('‼️ …and the one removal both doors call retires the id it removed',
        count(/removeProfile\(providerProfiles\(\), id\)/g) === 1 && count(/await retireProviderId\(w\.profile!\.id\)/g) === 1
        && /removeProfile: async \(id: string\): Promise<string\[\]> => \(await removeRoute\(id, \{\}, true\)\)\.refusal/.test(src)
        && /await removeRoute\(id, \{ then: optStr\(args, 'then'\), to: optStr\(args, 'to'\) \}, false\)/.test(src));
    ok('the retired ids are read from the store and from the launch records',
        /retiredProfileIds\(providerProfiles\(\), launchManifests\(\),\s*context\.globalState\.get<unknown\[\]>\(RETIRED_PROFILES_KEY, \[\]\)\)/.test(src));
    ok('providers.list says which ids are retired', /count: all\.length, retired: retiredProviderIds\(\)/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
