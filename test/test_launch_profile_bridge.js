// B-32 — every dimension a launch profile stores reaches it from the bridge (src/core/launchProfileArgs.ts).
// The dimensions are not listed here: they are the ones profileFrom READS, found by handing it a Proxy, so a
// dimension added to a profile fails this test until launch.profile.set carries it.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const { profileFrom, saveProfile } = require('../out/core/launchProfiles.js');
const { setupFromArgs, profileArg } = require('../out/core/launchProfileArgs.js');
const { BridgeRegistry, need } = require('../out/core/bridge.js');

const read = [];
profileFrom(new Proxy({}, { get: (t, k) => { if (typeof k === 'string' && !read.includes(k)) { read.push(k); } return undefined; } }), 'x');
const argOf = k => (k === 'superpowers' ? 'superpowers' : profileArg(k));
const valueOf = k => (k === 'superpowers' ? false : k === 'engine' ? 'codex' : 'v-' + k);
ok(`profileFrom reads the dimensions a profile stores (${read.join(', ')})`,
    read.length >= 10 && ['engine', 'providerId', 'account', 'model', 'superpowers'].every(k => read.includes(k)));

// The registry runs the handler's own pieces, in the handler's order.
let stored = [];
const reg = new BridgeRegistry();
reg.register([
    { op: 'launch.profiles', describe: 'the saved launch setups', handler: () => stored },
    {
        op: 'launch.profile.set', describe: 'create or replace one',
        handler: async (a) => {
            const asked = setupFromArgs(a);
            need(!asked.refused, asked.refused || '');
            stored = saveProfile(stored, profileFrom(asked.setup, String(a.name)));
            return { name: a.name };
        }
    }
]);

(async () => {
    const args = { name: 'every' };
    for (const k of read) { args[argOf(k)] = valueOf(k); }
    const set = await reg.dispatch('launch.profile.set', args);
    const back = ((await reg.dispatch('launch.profiles', {})).result || []).find(p => p.name === 'every') || {};
    const lost = read.filter(k => back[k] !== valueOf(k));
    ok(`‼️ every dimension written through launch.profile.set comes back from launch.profiles (lost: ${lost.join(', ') || 'none'})`,
        set.ok && !lost.length);
    ok('‼️ superpowers:false is an answer that is kept, not a falsy value that is dropped', back.superpowers === false);
    await reg.dispatch('launch.profile.set', { name: 'quiet', model: 'opus' });
    ok('…and a profile that says nothing about it stores nothing',
        !('superpowers' in (stored.find(p => p.name === 'quiet') || { superpowers: 1 })));
    const str = await reg.dispatch('launch.profile.set', { name: 'str', superpowers: 'false' });
    ok('a superpowers that is not a boolean is refused rather than read as truthy',
        !str.ok && /true or false/.test(str.error || ''));
    ok('the route is `provider` on the wire and providerId in the profile', profileArg('providerId') === 'provider'
        && back.providerId === 'v-providerId');

    const src = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const block = (from, to) => { const a = src.indexOf(from); return a < 0 ? '' : src.slice(a, src.indexOf(to, a)); };
    const setOp = block("op: 'launch.profile.set'", "op: 'launch.profile.rename'");
    ok('‼️ the real handler builds its setup with setupFromArgs, and keeps no field list of its own',
        /setupFromArgs\(args\)/.test(setOp) && !/optStr\(args, '(model|effort|tier)'\)/.test(setOp));
    const unnamed = read.filter(k => !new RegExp('\\b' + argOf(k) + '\\?').test(setOp));
    ok(`its describe names every dimension as an argument (missing: ${unnamed.join(', ') || 'none'})`, !unnamed.length);
    const listOp = block("op: 'launch.profiles'", "op: 'launch.manifests'");
    const unlisted = read.concat(['surface', 'agentId']).filter(k => !new RegExp('\\b' + k + '\\??[,}]').test(listOp));
    ok(`launch.profiles says it returns every field a profile holds (missing: ${unlisted.join(', ') || 'none'})`, !unlisted.length);

    const schema = ((require('../package.json').contributes.configuration.properties['agentFarm.launchProfiles'] || {}).items || {}).properties || {};
    const unschemed = read.concat(['name', 'surface', 'agentId']).filter(k => !schema[k]);
    ok(`agentFarm.launchProfiles describes every field a profile holds (missing: ${unschemed.join(', ') || 'none'})`, !unschemed.length);
    ok('…superpowers there as a boolean', (schema.superpowers || {}).type === 'boolean');

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
