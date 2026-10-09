// X-100 — WHO OWNS WHICH FACT, AND WHERE THE VAULT BOUNDARY RUNS.
//
// ‼️ THE FAILURE THIS PREVENTS IS TWO VAULTS.
//
// It is tempting to give every engine the same provider-profile manager: one
// CRUD surface, one SecretStorage entry per route, one revision counter. For
// Claude Code that is exactly right — a "provider" there is a route Agent Farm
// assembles and nothing else knows about it, so if Agent Farm does not hold it,
// nobody does.
//
// For OpenCode it is exactly wrong. That engine already has `/connect`,
// `opencode auth login`, `auth.json` and `opencode.json`. Agent Farm keeping a
// second copy produces two vaults, two revisions and two contradicting truths —
// and the one that loses is always the one the user did not edit last.
//
// So ownership is a FACT PER ENGINE PER KIND OF DATA, stated once and readable,
// which is this item's first acceptance line: it must be visible which engine
// is the authority for which data.
'use strict';
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));

const O = require(path.join(ROOT, 'out', 'core', 'providerOwnership.js'));

/* =========================================================================
 * 1 — THE TABLE, WHICH IS THE ACCEPTANCE LINE ITSELF
 * ========================================================================= */
{
    eq('Agent Farm owns the Claude route it assembles',
        O.ownerOf('claude', 'credential'), 'agent-farm');
    eq('…and the catalog of routes it offers', O.ownerOf('claude', 'catalog'), 'agent-farm');

    eq('OpenCode owns its own credentials', O.ownerOf('opencode', 'credential'), 'engine');
    eq('…and its own config file', O.ownerOf('opencode', 'config'), 'engine');
    eq('…and its own provider catalog', O.ownerOf('opencode', 'catalog'), 'engine');

    // ‼️ ONE KIND IS ALWAYS AGENT FARM'S, ON EVERY ENGINE: which provider a RUN
    // was started with is history, not configuration. The engine does not keep
    // it (Claude's transcript demonstrably cannot), and it is the whole point of
    // X-102's manifest.
    eq('but the record of what a run chose is always Agent Farm\'s',
        O.ownerOf('opencode', 'selection'), 'agent-farm');
    eq('…on every engine', O.ownerOf('claude', 'selection'), 'agent-farm');

    // An engine with no provider axis owns nothing here, and saying "agent-farm"
    // would imply there is something to manage.
    eq('an engine with no provider axis is not made to own one',
        O.ownerOf('gemini', 'credential'), 'engine');

    const table = O.ownershipTable();
    ok('the table can be shown, rather than the rule living in somebody\'s head',
        table.length > 0);
    ok('…and every row says WHY, in words a person can check',
        table.every(r => typeof r.why === 'string' && r.why.length > 30));
    ok('…covering both engines that have the axis',
        table.some(r => r.engine === 'claude') && table.some(r => r.engine === 'opencode'));
}

/* =========================================================================
 * 2 — ‼️ THE VAULT BOUNDARY: THE SECRET IS KEYED BY PROFILE ID AND LIVES ALONE
 * ========================================================================= */
{
    eq('a profile\'s secret has one key, derived from its id',
        O.secretKeyFor('route-7'), 'agentFarm.providerProfile.route-7');
    // ‼️ A key built out of a name would move when the name is edited, orphaning
    // the credential in the keychain — where nothing ever collects it.
    ok('…and the key does not move when the label does',
        O.secretKeyFor('route-7') === O.secretKeyFor('route-7'));
    eq('an empty id has no key at all, rather than a shared one', O.secretKeyFor(''), '');
    eq('…and neither does whitespace', O.secretKeyFor('   '), '');
}

/* =========================================================================
 * 3 — ‼️ THE PUBLIC HALF IS BUILT BY NAMING, NEVER BY DELETING
 *
 * The second acceptance line: settings, the bridge, the CLI, a notice and an
 * export contain NO secret. All five of those read the same object, so the
 * question is settled once, here, by an allow-list — a deny-list grows a hole
 * the first time somebody adds a field to a profile.
 * ========================================================================= */
{
    const stored = {
        id: 'route-7', label: 'Kimi', engines: ['claude'], providerId: 'kimi',
        baseUrl: 'https://api.moonshot.ai/anthropic', authKind: 'api-key',
        tiers: { opus: 'kimi-k2-thinking' }, revision: 3,
        apiKey: 'sk-PLANTED-1', token: 'PLANTED-2',
        headers: { 'x-api-key': 'sk-PLANTED-3' },
        nested: { deeper: { password: 'PLANTED-4' } }
    };
    const pub = O.publicProfile(stored);
    eq('the public fields survive',
        [pub.id, pub.label, pub.providerId, pub.baseUrl, pub.authKind, pub.revision],
        ['route-7', 'Kimi', 'kimi', 'https://api.moonshot.ai/anthropic', 'api-key', 3]);
    eq('…including the tier mapping, which is not a secret', pub.tiers.opus, 'kimi-k2-thinking');
    const wire = JSON.stringify(pub);
    ok('and no planted credential value survives, at any depth',
        !/PLANTED-[1234]/.test(wire));
    // ‼️ A CREDENTIAL-SHAPED NAME IS ONLY A PROBLEM IF IT COULD HOLD ONE. A
    // secret is a string, or an object of strings; a BOOLEAN cannot be one. So
    // `hasSecret: false` — the presence flag the line below requires to be
    // public — is not a finding, and excluding it by type rather than by name
    // keeps the check from being weakened into "except the ones we added".
    const carriers = [];
    const collect = v => {
        if (Array.isArray(v)) { v.forEach(collect); } else if (v && typeof v === 'object') {
            Object.entries(v).forEach(([k, val]) => {
                if (typeof val !== 'boolean' && typeof val !== 'number'
                    && /apikey|secret|token|password|credential|header/.test(k.toLowerCase())) {
                    carriers.push(k);
                }
                collect(val);
            });
        }
    };
    collect(pub);
    ok('…nor any field that could CARRY a credential (a boolean cannot) '
        + (carriers.length ? '— found ' + carriers.join() : ''), carriers.length === 0);
    // ‼️ WHETHER A SECRET EXISTS IS PUBLIC; THE SECRET IS NOT. A surface has to
    // be able to draw "this route has no key yet" without reading the key.
    eq('the presence of a credential is a public fact',
        O.publicProfile(stored, { hasSecret: true }).hasSecret, true);
    eq('…and its absence is the honest default', pub.hasSecret, false);
}

/* =========================================================================
 * 4 — ‼️ AGENT FARM REFUSES TO MANAGE WHAT IT DOES NOT OWN
 * ========================================================================= */
{
    eq('storing a Claude route credential is Agent Farm\'s job',
        O.ownershipRefusal('claude', 'credential', 'write'), []);
    const r = O.ownershipRefusal('opencode', 'credential', 'write');
    ok('…and storing an OpenCode one is refused', r.length > 0);
    ok('…naming the engine\'s own way of doing it, so the refusal is useful',
        r.join(' ').includes('opencode auth login'));
    ok('rewriting the engine\'s config file is refused too',
        O.ownershipRefusal('opencode', 'config', 'write').length > 0);
    // Reading the PUBLIC half is always allowed — that is how a surface draws
    // "this engine has three connected providers" without owning anything.
    eq('reading the public half is never refused',
        O.ownershipRefusal('opencode', 'catalog', 'read'), []);
    eq('…and neither is recording what a run chose',
        O.ownershipRefusal('opencode', 'selection', 'write'), []);
}

/* =========================================================================
 * 5 — REVISION: A PROFILE THAT CHANGED IS A DIFFERENT PROFILE TO A RUN
 * ========================================================================= */
{
    // A launch manifest records the revision it ran on (X-102). Without one, a
    // route edited after the fact silently rewrites history: the record names a
    // profile whose base URL is no longer the one that served the session.
    const a = { id: 'r1', label: 'A', revision: 1 };
    eq('editing a profile advances its revision', O.bumpRevision(a).revision, 2);
    eq('…and a profile that never had one starts at 1',
        O.bumpRevision({ id: 'r1', label: 'A' }).revision, 1);
    const copy = O.copyProfile({ id: 'r1', label: 'A', revision: 5 }, 'r2');
    eq('a copy is a new profile, not a second name for the old one', copy.id, 'r2');
    eq('…and its revision starts over, because its history has not happened yet',
        copy.revision, 1);
    ok('…and the copy carries no credential — a key is not duplicated by copying',
        copy.hasSecret === false);
}

/* =========================================================================
 * 6 — X-516: TWO GROUPS ON OPENCODE — ITS OWN PROVIDERS, AND THE ROUTES IT IS LENT
 * ========================================================================= */
{
    const table = O.ownershipTable();
    const oc = table.filter(r => r.engine === 'opencode');
    eq('OpenCode has two groups, its own first', [...new Set(oc.map(r => r.source))], ['engine-native', 'agent-farm-route']);
    eq('…each with every kind', ['engine-native', 'agent-farm-route'].map(s => oc.filter(r => r.source === s).map(r => r.kind)),
        [['catalog', 'credential', 'config', 'selection'], ['catalog', 'credential', 'config', 'selection']]);
    ok('its own providers stay the engine\'s', oc.filter(r => r.source === 'engine-native' && r.kind !== 'selection').every(r => r.owner === 'engine'));
    ok('‼️ a route it is lent is Agent Farm\'s, and the reason says it is lent at launch and no OpenCode file is written',
        oc.filter(r => r.source === 'agent-farm-route').every(r => r.owner === 'agent-farm')
        && /OPENCODE_CONFIG_CONTENT/.test(oc.find(r => r.source === 'agent-farm-route' && r.kind === 'catalog').why)
        && /\{env:NAME\}/.test(oc.find(r => r.source === 'agent-farm-route' && r.kind === 'credential').why));
    eq('Claude Code\'s rows are all routes', [...new Set(table.filter(r => r.engine === 'claude').map(r => r.source))], ['agent-farm-route']);
    ok('‼️ writing OpenCode\'s own credential is still refused (the default source is the engine\'s own)',
        O.ownershipRefusal('opencode', 'credential', 'write').length > 0
        && O.ownershipRefusal('opencode', 'config', 'write', 'engine-native').length > 0);
    eq('‼️ …a route\'s credential lent to OpenCode is not', O.ownershipRefusal('opencode', 'credential', 'write', 'agent-farm-route'), []);
    eq('an engine with no group of the source asked answers from the one it has',
        [O.ownerOf('claude', 'credential', 'engine-native'), O.ownerOf('gemini', 'credential', 'agent-farm-route')], ['agent-farm', 'engine']);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exit(1); }
