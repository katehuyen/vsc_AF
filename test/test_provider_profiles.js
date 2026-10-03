// X-100 — THE PROFILE STORE AND THE VAULT BOUNDARY.
//
// ‼️ WHAT THIS SUITE IS ACTUALLY WATCHING, in the item's own words: "settings,
// bridge, CLI, notice and export contain no secret" and "which engine is the
// authority for which data is visible".
//
// The first is not a thing you check by reading five surfaces once. It is
// checked by making the leak IMPOSSIBLE and then measuring that the surfaces go
// through the thing that makes it impossible: the stored record IS the public
// record, built by naming its fields, so a profile has no private half to spill.
// A `delete p.apiKey` at five call sites is five chances to forget one; a record
// that never held the key cannot leak it anywhere.
//
// The second is the ownership table, and the sharp edge is that the table is not
// decoration — creating a profile for an engine that owns its own credentials is
// the two-vault failure arriving through a form, and it is REFUSED here rather
// than warned about at the surface.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const P = require(path.join(ROOT, 'out', 'core', 'providerProfiles.js'));
const O = require(path.join(ROOT, 'out', 'core', 'providerOwnership.js'));

const claude = {
    id: 'kimi', label: 'Kimi', engine: 'claude', providerId: 'kimi',
    baseUrl: 'https://api.moonshot.ai/anthropic', authKind: 'api-key',
    tiers: { opus: 'kimi-k2-thinking', sonnet: 'kimi-k2' }
};

// ---------- ‼️ THE STORED RECORD HAS NO PRIVATE HALF ----------
{
    /**
     * ‼️ THE ONE THAT MATTERS. A caller hands over an object; anything not named
     * in `storedProfile` must not survive the trip — not today's field names and
     * not the one somebody invents next year. This is the layer that protects
     * what is WRITTEN, which is a stronger promise than protecting what is shown.
     */
    const dirty = {
        ...claude,
        apiKey: 'sk-ant-REAL-KEY', key: 'sk-2', token: 'tok',
        headers: { Authorization: 'Bearer sk-3' },
        env: { ANTHROPIC_AUTH_TOKEN: 'sk-4' }
    };
    const stored = P.storedProfile(dirty);
    const text = JSON.stringify(stored);
    ok('‼️ a key planted on the way in does not reach the stored record',
        !/sk-ant-REAL-KEY|sk-2|sk-3|sk-4|Bearer/.test(text));
    eq('…and the record holds exactly the named fields, nothing else',
        Object.keys(stored).sort(),
        ['authKind', 'baseUrl', 'engine', 'id', 'label', 'providerId', 'revision', 'tiers']);
    // ‼️ AND THE PUBLIC VIEW IS THE SAME SHAPE PLUS ONE DERIVED FIELD. If these
    // two ever diverge, "the stored record is the public record" has stopped
    // being true and the whole argument above collapses to a filter again.
    const pub = O.publicProfile(stored, { hasSecret: true });
    eq('the public view adds exactly one field: whether a credential exists',
        Object.keys(pub).sort().filter(k => !Object.keys(stored).includes(k)), ['hasSecret']);
    eq('…and drops none of them',
        Object.keys(stored).filter(k => !(k in pub)), []);
    eq('the existence of a credential is public', pub.hasSecret, true);
    // Every consumer downstream may assume the shape, so a settings array full
    // of rubbish has to be read into it rather than trusted.
    eq('a stored list is read back into shape',
        P.readProfiles([claude, null, 'x', { id: 'no spaces allowed' }, { engine: 'claude' }])
            .map(p => p.id), ['kimi']);
    ok('…and an unusable id is DROPPED, never repaired into a different one',
        P.readProfiles([{ id: 'Kİ Mİ', engine: 'claude', providerId: 'kimi' }]).length === 0);
}

// ---------- ‼️ THE OWNERSHIP TABLE IS ENFORCED, NOT DRAWN ----------
{
    const list = [];
    const mine = P.addProfile(list, claude, ['claude', 'opencode']);
    eq('a Claude route is Agent Farm\'s to keep', mine.refusal, []);
    eq('…and starts at revision 1', mine.profile.revision, 1);

    /**
     * ‼️ THE TWO-VAULT FAILURE, REFUSED AT THE DOOR. OpenCode already owns
     * `/connect`, `opencode auth login` and `auth.json`. A profile here IS a
     * stored credential, so letting a form create one would produce two vaults
     * and two revisions — and the copy that loses is always the one the user did
     * not edit last, which is the worst possible way for a credential to fail.
     */
    const theirs = P.addProfile(list, { ...claude, id: 'oc', engine: 'opencode' },
        ['claude', 'opencode']);
    ok('‼️ a credential profile for an engine that owns its own is refused',
        theirs.refusal.length > 0 && theirs.list.length === 0);
    ok('…and the refusal names the engine\'s OWN way of doing it',
        /opencode auth login/.test(theirs.refusal.join(' ')));
    // A refusal that does not say what to do instead is just a wall.
    eq('reading is never refused', O.ownershipRefusal('opencode', 'credential', 'read'), []);
    eq('…and recording what a run CHOSE is Agent Farm\'s on every engine',
        O.ownershipRefusal('opencode', 'selection', 'write'), []);
}

// ---------- the id is a keychain key, so its charset is a security question ----------
{
    const bad = (id) => P.profileRefusal(P.storedProfile({ ...claude, id }), {}).join(' ');
    ok('a dot is refused — it is the separator in the key', /profile id is/.test(bad('a.b')));
    ok('a slash is refused', /profile id is/.test(bad('a/b')));
    ok('a space is refused', /profile id is/.test(bad('a b')));
    ok('one character is refused', /profile id is/.test(bad('a')));
    eq('…and a plain one passes', P.profileRefusal(P.storedProfile(claude), {}), []);
    // ‼️ The key is built from the id and never from the label, or editing the
    // label strands the old entry in the keychain with nothing to collect it.
    eq('the keychain key is derived from the id', O.secretKeyFor('kimi'),
        'agentFarm.providerProfile.kimi');
    eq('…and an empty id has no key at all, rather than a shared one',
        O.secretKeyFor(''), '');
    // Ids are permanent BECAUSE a credential is filed under one.
    ok('a second profile cannot take an id that is in use',
        P.addProfile([P.storedProfile(claude)], claude).refusal.some(r => /already exists/.test(r)));
}

// ---------- ‼️ A BASE URL CARRIES THE KEY TO IT ----------
{
    eq('https is fine', P.baseUrlRefusal('https://api.moonshot.ai/anthropic'), '');
    ok('‼️ plain http to another host is refused — the key would travel in clear',
        /in clear/.test(P.baseUrlRefusal('http://api.example.com/v1')));
    // Refusing a local gateway would push people to turn the check off rather
    // than obey it, and a loopback request never reaches a wire.
    eq('…but http on this machine is allowed by name',
        P.baseUrlRefusal('http://localhost:4000/v1'), '');
    eq('…including the numeric form', P.baseUrlRefusal('http://127.0.0.1:8787'), '');
    eq('an unstated base URL is not a fault', P.baseUrlRefusal(''), '');
    ok('a tier pointing at something that is not a model id is refused',
        P.profileRefusal(P.storedProfile({ ...claude, tiers: { opus: 'a; rm -rf /' } }), {})
            .some(r => /is not a model id/.test(r)));
}

// ---------- ‼️ THE REVISION IS A STATEMENT ABOUT THE ROUTE ----------
{
    const one = P.addProfile([], claude).list;
    /**
     * X-102 records the revision a run happened on so a route edited afterwards
     * cannot silently rewrite history. That only works while the number MEANS
     * something: bumping it on a label change would make it a counter of edits,
     * and a reader could no longer ask "is this still what served that session?".
     */
    const renamed = P.setProfile(one, 'kimi', { label: 'Kimi (work)' });
    eq('renaming does not bump the revision', renamed.profile.revision, 1);
    eq('…and the new label is kept', renamed.profile.label, 'Kimi (work)');
    const moved = P.setProfile(one, 'kimi', { baseUrl: 'https://api.moonshot.cn/anthropic' });
    eq('‼️ changing the endpoint DOES bump it', moved.profile.revision, 2);
    eq('…and so does changing what a tier resolves to',
        P.setProfile(one, 'kimi', { tiers: { opus: 'kimi-k3' } }).profile.revision, 2);
    eq('…and adding a tier', P.setProfile(one, 'kimi',
        { tiers: { ...claude.tiers, haiku: 'kimi-k2-turbo' } }).profile.revision, 2);
    ok('the route-change question is answered in one place',
        P.routeChanged(P.storedProfile(claude), P.storedProfile({ ...claude, authKind: 'oauth' })));
    ok('…and says no when only the label moved',
        !P.routeChanged(P.storedProfile(claude), P.storedProfile({ ...claude, label: 'x' })));

    // ‼️ THE ID IS NOT PATCHABLE. Moving it would leave the credential filed
    // under the old one, in the OS keychain, with nothing to collect it.
    eq('an edit cannot move the id the credential is filed under',
        P.setProfile(one, 'kimi', { id: 'kimi-new' }).profile.id, 'kimi');
    // A write either happens or is refused — never half.
    const bad = P.setProfile(one, 'kimi', { baseUrl: 'http://evil.example.com' });
    ok('a refused edit changes nothing at all',
        bad.refusal.length > 0 && JSON.stringify(bad.list) === JSON.stringify(one));
    eq('editing something that is not there is refused by name',
        P.setProfile(one, 'nope', { label: 'x' }).refusal.length, 1);
}

// ---------- ‼️ A COPY IS A NEW PROFILE WITH NO CREDENTIAL ----------
{
    const one = P.addProfile([], claude).list;
    const copied = P.duplicateProfile(one, 'kimi');
    eq('a copy gets its own id', copied.profile.id, 'kimi-2');
    eq('…its own history, starting again', copied.profile.revision, 1);
    eq('…and the route it was copied from', copied.profile.baseUrl, claude.baseUrl);
    /**
     * ‼️ AND NO KEY. Duplicating a credential by pressing "copy" would put one
     * secret behind two names — and revoking one of them would leave the other
     * working with nothing anywhere to say why.
     */
    eq('‼️ a copy has no credential', O.copyProfile(claude, 'kimi-2').hasSecret, false);
    eq('…and the public list only claims a key for the id that has one',
        P.publicProfiles(copied.list, ['kimi']).map(p => [p.id, p.hasSecret]),
        [['kimi', true], ['kimi-2', false]]);
    eq('the next free id counts up and never reuses',
        P.freeProfileId(copied.list, 'kimi'), 'kimi-3');
    // Removing hands the profile back so the caller can collect its key: a list
    // that dropped the row while the entry stayed is the orphan case.
    const gone = P.removeProfile(copied.list, 'kimi-2');
    eq('removing returns the profile so its key can be collected too',
        gone.profile.id, 'kimi-2');
    eq('…and the list is one shorter', gone.list.length, 1);
    eq('every profile\'s keychain key can be listed, so an orphan is findable',
        P.profileSecretKeys(copied.list),
        ['agentFarm.providerProfile.kimi', 'agentFarm.providerProfile.kimi-2']);
}

// ---------- ‼️ THE ACCEPTANCE LINE, MEASURED AT ALL FIVE SURFACES ----------
//
// "settings, bridge, CLI, notice and export contain no secret."
//
// The previous session SATISFIED this and did not MEASURE it, and said so. The
// difficulty is that it is a claim about five places, and checking five places
// by reading them once is exactly the audit that rots. So it is measured in two
// halves that together leave nothing to remember:
//
//   1. THE CHOKEPOINT CANNOT LEAK. A hostile stored list goes in; nothing that
//      looks like a credential comes out of either builder, whatever fields it
//      carried.
//   2. EVERY SURFACE REALLY GOES THROUGH IT. Measured against the source,
//      because a page and a bridge handler cannot be called from here.
{
    const extTs = read('src', 'extension.ts');
    const panelTs = read('src', 'panels', 'enginesPanel.ts');
    const pageJs = read('media', 'engines.js');

    // ---- 1 · the chokepoint
    const hostile = [{
        ...claude,
        apiKey: 'sk-LEAK-1', key: 'sk-LEAK-2', secret: 'sk-LEAK-3',
        authorization: 'Bearer sk-LEAK-4', password: 'sk-LEAK-5',
        headers: { 'x-api-key': 'sk-LEAK-6' },
        env: { ANTHROPIC_AUTH_TOKEN: 'sk-LEAK-7' },
        nested: { deep: { token: 'sk-LEAK-8' } }
    }];
    const throughStore = JSON.stringify(P.readProfiles(hostile));
    const throughPublic = JSON.stringify(P.publicProfiles(P.readProfiles(hostile), ['kimi']));
    ok('‼️ nothing credential-shaped survives into the stored record',
        !/sk-LEAK-\d/.test(throughStore));
    ok('‼️ …nor into the public view every surface is handed',
        !/sk-LEAK-\d/.test(throughPublic));
    ok('…and not by field name either — the fields themselves are gone',
        !/apiKey|authorization|password|x-api-key|ANTHROPIC_AUTH_TOKEN/i.test(throughStore + throughPublic));

    // ---- 2 · every surface goes through it
    //
    // ‼️ THE PAGE IS THE ONE THAT MATTERS MOST, because a webview is a wall you
    // can only defend from one side. It is never HANDED a stored profile: the
    // panel's data is `deps.profiles()`, and that dep's only implementation
    // returns `publicProviderProfiles()`.
    ok('the page is handed the public list and nothing else',
        /profiles: deps\.profiles\(\)/.test(panelTs)
        && /profiles: \(\) => publicProviderProfiles\(\)/.test(extTs)
        && /const publicProviderProfiles = \(\) => providerProfiles\(\)\.map\(publicRoute\);/.test(extTs)
        // X-488 — one builder: the public shape plus whether there is a key and a masked hint of it.
        && /const publicRoute = \(p: StoredProviderProfile\) => \{\s*const k = routeKeyOf\(p\)\.value;\s*return publicProfile\(p as unknown as Record<string, unknown>, \{ hasSecret: !!k, keyHint: keyHint\(k\) \}\);/.test(extTs));
    ok('…and the panel has no way to reach the store or the keychain at all',
        !/providerProfiles\(|context\.secrets|secretKeyFor/.test(panelTs));
    // The bridge: every read answers with the public shape, and there is no op
    // that takes or returns a value.
    const provOps = extTs.split(/\n\s*\{\s*\n\s*op: '/).filter(s => /^providers\./.test(s));
    // ‼️ PINNED ON PURPOSE. A NEW op here is a DECISION and it should cost a
    // failing test: this family is the one that stands between a stored
    // credential and five surfaces, and an op added without anybody rereading
    // that boundary is exactly how the boundary stops holding.
    eq('the bridge exposes the nine provider ops', provOps.length, 9);
    // ‼️ THREE OF THEM DO NOT CARRY A PROFILE ROW AT ALL, and each is named here
    // rather than folded into the pattern below: adding their shapes to that
    // list would loosen the gate for the six that really do carry rows.
    //
    // X-101's runtime answer — what a launch would run on.
    const runtimeOp = provOps.filter(s => /^providers\.runtime'/.test(s));
    eq('…and exactly one of them is the runtime answer', runtimeOp.length, 1);
    ok('‼️ it returns the NAMES of what a launch would inject, never the values',
        /injects: Object\.keys\(rt\.spawnEnv/.test(runtimeOp[0] || '')
        && !/spawnEnv: rt\.spawnEnv/.test(runtimeOp[0] || ''));
    // X-114's two health answers — the free verdict, and the one real turn.
    const healthOps = provOps.filter(s => /^providers\.(status|test)'/.test(s));
    eq('…and two of them are the health answers', healthOps.length, 2);
    ok('‼️ neither reads a credential: the free one asks the shared health function',
        /providerHealth\(await providerHealthInput\(engine\)\)/
            .test(provOps.find(s => /^providers\.status'/.test(s)) || ''));
    ok('‼️ …and the costly one delegates to the shared runner rather than resolving its own',
        /await runProviderTest\(engine, providerId, optStr\(args, 'model'\)\)/
            .test(provOps.find(s => /^providers\.test'/.test(s)) || ''));
    ok('…and NAMES, NEVER VALUES holds in that runner too',
        /injected: Object\.keys\(rt\.spawnEnv/.test(extTs));
    ok('‼️ every provider op that carries a profile answers with the PUBLIC shape',
        provOps.filter(s => !/^providers\.(runtime|status|test)'/.test(s))
            .every(s => /publicRoute\(|publicProviderProfiles\(|ownershipTable\(|removed: id/.test(s)));
    ok('…and none of them touches the keychain for a value',
        !provOps.some(s => /context\.secrets\.get|setProviderSecret|askProviderSecret/.test(s)));
    // ‼️ THE ONE DELIBERATE ASYMMETRY, STATED RATHER THAN LEFT TO BE NOTICED:
    // removing a route DOES collect its key, because the alternative is an
    // orphan credential nobody can see.
    ok('…except remove, which collects the key rather than stranding it',
        /await clearProviderSecret\(id\);/.test(extTs));
    // The CLI / notice / export surfaces are the bridge's own output: `af.js`
    // prints what an op returned, and a notice or an export quoting a route
    // quotes the same rows. So the gate that holds for the bridge holds for all
    // three — which is only true while nothing else serialises a stored profile.
    /**
     * ‼️ THE STORED LIST IS NEVER AN ANSWER. It goes into the pure ops and into
     * the settings write, and it comes back out only through `publicProfiles`.
     * A `return` that carried it would put the raw record into a bridge
     * response — and from there into the CLI's printout, a notice quoting it and
     * an export, which is four of the five surfaces in one line.
     */
    ok('‼️ the raw store is never returned by anything',
        !/return[^;\n]*providerProfiles\(\)/.test(extTs));
    ok('…and the setting is written in exactly one place',
        (extTs.match(/cfg\(\)\.update\('providerProfiles'/g) || []).length === 1
        && /const writeProviderProfiles = async \(list: StoredProviderProfile\[\]\)/.test(extTs));
    // Typing a key is human-only and the value never enters the webview.
    ok('the credential is typed into the HOST\'s password box',
        /showInputBox\(\{[\s\S]{0,400}password: true/.test(extTs));
    ok('…and the page only ever posts an id for it',
        /post\(\{\s*\n?\s*type: 'providerKey', id: b\.dataset\.pokey/.test(pageJs));
    /**
     * ‼️ AND THE PAGE ONLY READS FIELDS THAT EXIST ON THE PUBLIC SHAPE.
     *
     * A blunt "does the word `apiKey` appear" gate fails on the prose that
     * explains why there is no apiKey, which is a detector that cries wolf and
     * therefore gets loosened rather than fixed. This is the sharp form: every
     * `p.<field>` the row renderer touches has to be one of the eight the public
     * shape has. Add `p.apiKey` to this page tomorrow and it fails by name.
     */
    const rowFn = pageJs.slice(pageJs.indexOf('function profileHtml(p) {'));
    const rowBody = rowFn.slice(0, rowFn.indexOf('\n    }\n'));
    const touched = [...new Set([...rowBody.matchAll(/\bp\.(\w+)/g)].map(m => m[1]))].sort();
    // ‼️ Derived from a FULLY POPULATED profile, not from an empty one: the two
    // optional fields are omitted when empty, so `publicProfile({})` would name
    // six and the gate would then reject the page for drawing a base URL.
    const allowed = Object.keys(O.publicProfile({ ...claude, description: 'n', secretRef: 'S' },
        { hasSecret: true, keyHint: 'sk-…0000' })).sort();
    eq('‼️ the row renderer reads nothing that is not on the public shape',
        touched.filter(f => !allowed.includes(f)), []);
    /**
     * ‼️ AND THE COUNT IS PINNED ON PURPOSE. The gate above is only as strong as
     * the list it compares against, so a `publicProfile` that quietly grew a
     * tenth field would widen the page's licence without anyone looking. This is
     * the boundary between a keychain and a webview: a field added to the public
     * shape is a decision, and it should cost one failing test.
     */
    // X-488 (the user's own request) is the decision that added three: the owner's note, the Farm
    // Secret's NAME and a masked hint — none of them a value.
    eq('the public shape is twelve fields — a thirteenth is a decision, not a detail',
        allowed, ['authKind', 'baseUrl', 'description', 'engine', 'hasSecret', 'id', 'keyHint', 'label',
            'providerId', 'revision', 'secretRef', 'tiers']);
    ok('…and the row really reads most of them, so the gate has something to hold',
        touched.length >= 7);

    // ‼️ AND REPLACING THE KEY BUMPS THE REVISION. The credential is not a
    // field, so `setProfile` cannot see this one — the writer has to, or the
    // same endpoint under a different key would go on claiming to be what
    // served a past session.
    ok('replacing a credential is a new route',
        /await providerKeys\.set\(id, value\);[\s\S]{0,900}bumpRevision\(own\)/.test(extTs));
}

// ---------- X-488 — the owner's note and a Farm Secret named by the route ----------
{
    const s = P.storedProfile({ ...claude, description: '  ahmet   hesabı \n anahtarı ', secretRef: 'OpenRouter-ahmet' });
    eq('the note is kept on one line', s.description, 'ahmet hesabı anahtarı');
    eq('a Farm Secret is kept by NAME', s.secretRef, 'OpenRouter-ahmet');
    ok('a name the Secrets page could not have made is not kept',
        P.storedProfile({ ...claude, secretRef: 'a b/c' }).secretRef === undefined);
    const list = P.addProfile([], { ...claude, secretRef: 'OpenRouter-ahmet' }).list;
    const relabel = P.setProfile(list, 'kimi', { label: 'Kimi 2', description: 'x' });
    ok('a new note or label keeps the revision and the secret',
        relabel.profile.revision === 1 && relabel.profile.secretRef === 'OpenRouter-ahmet');
    const other = P.setProfile(list, 'kimi', { secretRef: 'Other' });
    ok('‼️ another secret is another key, so another route', other.profile.revision === 2);
    const moved = P.setProfile(list, 'kimi', { baseUrl: 'https://elsewhere.example/anthropic' });
    ok('‼️ a new endpoint lets the named secret go — it is not sent to a host nobody chose it for',
        moved.profile.secretRef === undefined && moved.profile.revision === 2);
    ok('…unless the same write names it again',
        P.setProfile(list, 'kimi', { baseUrl: 'https://elsewhere.example/anthropic', secretRef: 'OpenRouter-ahmet' })
            .profile.secretRef === 'OpenRouter-ahmet');
    const copied = P.duplicateProfile(list, 'kimi');
    ok('‼️ a copy starts with no key, a named one included', copied.profile.secretRef === undefined);
    ok('…and the public copy too', O.copyProfile({ ...claude, secretRef: 'S' }, 'k2').secretRef === undefined);
    ok('a hint is only drawn for a route that has a key',
        O.publicProfile(claude, { hasSecret: false, keyHint: 'x…1234' }).keyHint === undefined);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
