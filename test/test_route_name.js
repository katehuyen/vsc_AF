// S-137 — ONE NAME PER ROUTE PROFILE, on every surface (src/core/routeName.ts).
//
// A profile's id is given once (S-135), so it keys the profile's name: while it
// exists its current label names every session that ran on it, once removed the
// last label a launch recorded names them, and the label a session started under
// travels beside it when it differs. Every identity producer passes the host's
// names; a surface with a rule of its own is how one session came to read one
// name on the Console card and another in the Sessions table.
//
//   node test/test_route_name.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const { routeNames, routeName } = require(path.join(ROOT, 'out', 'core', 'routeName.js'));
const { runIdentity, sessionIdentity } = require(path.join(ROOT, 'out', 'core', 'turnRuntime.js'));

const manifest = (profileId, providerId, providerLabel, at) => ({
    launchId: 'L-' + profileId + '-' + at, at,
    identity: {
        engine: 'claude', providerId, providerLabel, providerProfileId: profileId, providerProfileRevision: 1,
        origin: 'agent-farm-profile', scope: 'session', requestedModelRef: 'opus', proof: 'launch-declared'
    },
    requested: { model: '', tier: 'opus' }
});

{
    const ms = [
        manifest('qwen-work', 'qwen', 'Qwen (old)', 10),
        manifest('qwen-work', 'qwen', 'Qwen Coder', 30),
        manifest('qwen-work', 'qwen', 'Qwen (middle)', 20),
        manifest('kimi-a', 'kimi', 'Kimi A', 5)
    ];
    const names = routeNames([{ id: 'Qwen-Work', label: 'Qwen Work Key', providerId: 'qwen' }], ms);
    ok('the current profiles are keyed by id, case-insensitively', names.current['qwen-work'].label === 'Qwen Work Key');
    ok('the last name per profile is the NEWEST launch, not the last array entry',
        names.last['qwen-work'].label === 'Qwen Coder' && names.last['kimi-a'].label === 'Kimi A');

    const renamed = routeName('qwen-work', 'Qwen (old)', names);
    ok('‼️ a profile that exists names every session by its CURRENT label, and the launch name travels beside it',
        renamed.label === 'Qwen Work Key' && renamed.launchedAs === 'Qwen (old)' && renamed.removed === false
        && renamed.providerId === 'qwen');
    ok('…and no launch name is carried when it is the same',
        routeName('qwen-work', 'Qwen Work Key', names).launchedAs === '');
    const gone = routeName('kimi-a', 'Kimi (first)', names);
    ok('‼️ a removed profile is named by the last label a launch recorded, says it is removed, keeps its company',
        gone.label === 'Kimi A' && gone.removed === true && gone.providerId === 'kimi' && gone.launchedAs === 'Kimi (first)');
    const never = routeName('lost-one', 'Lost', names);
    ok('…and with no record of it at all, its own recorded label, then its id',
        never.label === 'Lost' && never.removed === true && routeName('lost-one', '', names).label === 'lost-one');
    ok('no profile id, or no names given: nothing to decide',
        routeName('', 'Kimi', names) === undefined && routeName('qwen-work', 'x', undefined) === undefined);

    const I = runIdentity(manifest('qwen-work', 'qwen', 'Qwen (old)', 10), 'claude', [], { names });
    ok('‼️ runIdentity carries the one name, the launch name and the billing line in that name',
        I.providerLabel === 'Qwen Work Key' && I.providerLabelAtLaunch === 'Qwen (old)'
        && !I.providerProfileRemoved && /^Qwen Work Key — /.test(I.billing.why));
    const R = runIdentity(manifest('kimi-a', 'kimi', 'Kimi A', 5), 'claude', [], { names });
    ok('…a removed profile is marked on the identity', R.providerProfileRemoved === true && R.providerLabel === 'Kimi A');
    const S = sessionIdentity({ launchId: 'L-qwen-work-10', source: 'claude', turns: [] }, ms, names);
    ok('‼️ sessionIdentity — what every table, the session page and the bridge ask — answers with the one name',
        S.binding === 'declared' && S.providerLabel === 'Qwen Work Key' && S.providerLabelAtLaunch === 'Qwen (old)');
    const plain = runIdentity(manifest('qwen-work', 'qwen', 'Qwen (old)', 10), 'claude', []);
    ok('…and without names it is the record as written (the totals and old callers)',
        plain.providerLabel === 'Qwen (old)' && plain.providerLabelAtLaunch === undefined);
}

// ‼️ EVERY PRODUCER PASSES THE HOST'S NAMES. sessionIdentity's `names` is a
// required parameter, so tsc holds those; the two optional doors are held here.
{
    const argsOf = (src, call) => {
        const out = [];
        const re = new RegExp(call.replace(/[.()]/g, m => '\\' + m) + '\\(', 'g');
        let m;
        while ((m = re.exec(src))) {
            const open = m.index + m[0].length - 1;
            let depth = 0, end = open;
            for (; end < src.length; end++) {
                if (src[end] === '(') { depth++; } else if (src[end] === ')' && --depth === 0) { break; }
            }
            out.push(src.slice(open + 1, end));
        }
        return out;
    };
    const files = ['src/extension.ts', 'src/panels/dashboard.ts', 'src/panels/sessionsPanel.ts', 'src/panels/agentDetail.ts'];
    const pools = files.flatMap(f => argsOf(read(f), 'sessionRowPool').filter(a => !/^\s*sessions: SessionInfo/.test(a)).map(a => [f, a]));
    ok('‼️ every Sessions table (Dashboard, Sessions page, agent page, Projects page) is given the route names — '
        + pools.length + ' calls', pools.length === 4 && pools.every(([, a]) => /routeNames/.test(a)));
    const ids = files.flatMap(f => argsOf(read(f), 'runIdentity').filter(a => !/^\s*undefined\b/.test(a)).map(a => [f, a]));
    ok('…and every runIdentity call over a manifest passes them', ids.length >= 1 && ids.every(([, a]) => /names: routeNamesNow\(\)/.test(a)));
    const ext = read('src/extension.ts');
    ok('…and the Console card asks the same rule for a profile, removed or not',
        /routeName\(id, '', names\)/.test(ext) && /\.\.\.\(named\?\.removed \? \{ removed: true \} : \{\}\)/.test(ext)
        && /shape: profile\?\.providerId \|\| named\?\.providerId \|\| id/.test(ext));
    ok('…and the Turns page and its export are given them',
        /identityOf\(deps\.launchManifests\?\.\(\), deps\.routeNames\?\.\(\)\)/.test(read('src/panels/turnsPanel.ts'))
        && /identityOf\(deps\.launchManifests\?\.\(\), deps\.routeNames\?\.\(\)\)/.test(read('src/panels/turnsExport.ts'))
        && /routeNames: \(\) => routeNamesNow\(\),\s*\n\s*projectOf: sessionProjectName/.test(ext));
}

// The words, once: every hover that names a route draws them from AFProvider.
{
    const win = {};
    vm.runInNewContext(read('media/afProvider.js'), { window: win });
    const P = win.AFProvider;
    const lines = P.tipLines({ providerId: 'qwen', providerLabel: 'Qwen Work Key', binding: 'declared',
        providerLabelAtLaunch: 'Qwen (old)', providerProfileRemoved: true });
    ok('‼️ the provider hover says the launch name and that the profile was removed, under the Route line',
        lines[0] === 'Route: Qwen Work Key' && lines[1] === 'Name at launch: Qwen (old)'
        && /^Profile removed/.test(lines[2]));
    ok('…and says nothing on an ordinary run', P.nameLines({ providerId: 'kimi', providerLabel: 'Kimi' }).every(l => l === ''));
    ok('the Sessions table and the Console card use the same lines',
        /\.\.\.window\.AFProvider\.nameLines\(I\)/.test(read('media/sessionsTable.js'))
        && /window\.AFProvider\.nameLines\(\{\s*providerLabelAtLaunch: \(s\.identity \|\| \{\}\)\.providerLabelAtLaunch, providerProfileRemoved: !!r\.removed \}\)/.test(read('media/console.js')));
    ok('the Sessions table route line reads the named identity, not the raw record',
        /route: identity\.providerLabel \|\| m\.identity\.providerId/.test(read('src/panels/dashboard.ts')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
