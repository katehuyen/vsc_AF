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
    id: 'kimi', label: 'Kimi', engines: ['claude'], providerId: 'kimi',
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
        ['authKind', 'baseUrl', 'engines', 'id', 'label', 'providerId', 'revision', 'tiers']);
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
     * ‼️ X-516 — A ROUTE AGENT FARM HOLDS IS AGENT FARM'S ON EVERY ENGINE IT IS
     * LENT TO, so one marked for OpenCode is kept. What stays refused is the
     * two-vault failure itself: writing OpenCode's OWN credentials or config.
     */
    const lent = P.addProfile(list, { ...claude, id: 'oc', engines: ['opencode'] }, ['claude', 'opencode']);
    eq('a route marked for OpenCode is Agent Farm\'s to keep', lent.refusal, []);
    const theirs = O.ownershipRefusal('opencode', 'credential', 'write');
    ok('‼️ …but storing OpenCode\'s own credential is still refused',
        theirs.length > 0 && /opencode auth login/.test(theirs.join(' ')));
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

// ---------- ‼️ S-131 — A ROUTE'S LABEL IS ITS BADGE: at most PROFILE_LABEL_MAX characters ----------
{
    const M = P.PROFILE_LABEL_MAX;
    const at = n => 'x'.repeat(n);
    const long = P.addProfile([], { ...claude, label: at(M + 1) });
    ok(`a new route's label of ${M + 1} characters is refused, and the refusal says the limit`,
        long.refusal.length === 1 && new RegExp(`at most ${M}`).test(long.refusal[0]) && !long.list.length);
    ok(`…one of exactly ${M} is taken`, !P.addProfile([], { ...claude, label: at(M) }).refusal.length);
    ok('…counted in characters, as the badge cuts: emoji are one each',
        !P.addProfile([], { ...claude, label: '🧠'.repeat(M) }).refusal.length);
    ok('an empty label shows the id, so a long id with no label is held to it too',
        P.addProfile([], { ...claude, id: 'a-very-long-route-id', label: '' }).refusal.some(r => /at most/.test(r)));
    // a label stored before the limit is read and kept — only a new or changed one is held to it
    const old = P.readProfiles([{ ...claude, label: at(M + 5) }]);
    ok('‼️ a label stored longer before the limit is still read', old.length === 1 && old[0].label === at(M + 5));
    ok('‼️ …and the route stays editable while its label is left alone',
        !P.setProfile(old, 'kimi', { baseUrl: 'https://api.moonshot.ai/v2' }).refusal.length);
    ok('…but a changed label is held to the limit', P.setProfile(old, 'kimi', { label: at(M + 2) }).refusal.length === 1);
    ok('…and shortening it is taken', !P.setProfile(old, 'kimi', { label: 'Kimi' }).refusal.length);
    const copied = P.duplicateProfile(P.addProfile([], { ...claude, label: 'MiniMax M2.5' }).list, 'kimi');
    ok(`a copy's label makes room for "(copy)" and fits (${copied.profile && copied.profile.label})`,
        !copied.refusal.length && /\(copy\)$/.test(copied.profile.label) && Array.from(copied.profile.label).length <= M);
    const prov = fs.readFileSync(path.join(ROOT, 'media', 'afProvider.js'), 'utf8');
    ok('‼️ the badge cuts at the same number the store holds a label to (afProvider CARD_MAX)',
        new RegExp(`CARD_MAX: ${M}\\b`).test(prov));
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
        && /const publicRoute = \(p: StoredProviderProfile\) => \{\s*const k = routeKeyOf\(p\);\s*return publicProfile\(p as unknown as Record<string, unknown>, \{\s*hasSecret: !!k\.value, keyHint: keyHint\(k\.value\), secretRef: k\.secretRef, keyHeldFor: k\.heldFor\s*\}\);/.test(extTs));
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
    const allowed = Object.keys(O.publicProfile({ ...claude, description: 'n', opencodeUrl: 'https://o/v1', context: 8, output: 4 },
        { hasSecret: true, keyHint: 'sk-…0000', secretRef: 'S', keyHeldFor: 'https://old' })).sort();
    eq('‼️ the row renderer reads nothing that is not on the public shape',
        touched.filter(f => !allowed.includes(f)), []);
    /**
     * ‼️ AND THE COUNT IS PINNED ON PURPOSE. The gate above is only as strong as
     * the list it compares against, so a `publicProfile` that quietly grew a
     * tenth field would widen the page's licence without anyone looking. This is
     * the boundary between a keychain and a webview: a field added to the public
     * shape is a decision, and it should cost one failing test.
     */
    // X-488 (the user's own request) and X-492 are the decision that added four: the owner's note,
    // the Farm Secret's NAME, a masked hint and the endpoint a key was given for — none of them a value.
    // X-516 (the user's approved design) made engine a list and added the OpenCode endpoint and two model limits.
    eq('the public shape is sixteen fields — a seventeenth is a decision, not a detail',
        allowed, ['authKind', 'baseUrl', 'context', 'description', 'engines', 'hasSecret', 'id', 'keyHeldFor', 'keyHint',
            'label', 'opencodeUrl', 'output', 'providerId', 'revision', 'secretRef', 'tiers']);
    ok('…and the row really reads most of them, so the gate has something to hold',
        touched.length >= 7);

    // ‼️ AND REPLACING THE KEY BUMPS THE REVISION. The credential is not a
    // field, so `setProfile` cannot see this one — the writer has to, or the
    // same endpoint under a different key would go on claiming to be what
    // served a past session.
    ok('replacing a credential is a new route',
        /await providerKeys\.set\(id, value, route\);\s*await bumpRouteRevision\(id\);/.test(extTs)
        && /next\[at\] = bumpRevision\(list\[at\]\);/.test(extTs));
    ok('…and so is naming a Farm Secret, or confirming a key at a new endpoint',
        (extTs.match(/await bumpRouteRevision\(id\);/g) || []).length === 3);
}

// ---------- X-488 — the owner's note; which key it is never lives in the route ----------
{
    const s = P.storedProfile({ ...claude, description: '  ahmet   hesabı \n anahtarı ', secretRef: 'OpenRouter-ahmet' });
    eq('the note is kept on one line', s.description, 'ahmet hesabı anahtarı');
    ok('‼️ a secretRef handed to the store (settings, providers.add/set, a hand edit) is not kept — the bind lives beside the keychain',
        s.secretRef === undefined && !('keyHeldFor' in s) && !('keyHint' in s));
    const list = P.addProfile([], claude).list;
    const relabel = P.setProfile(list, 'kimi', { label: 'Kimi 2', description: 'x' });
    ok('a new note or label keeps the revision', relabel.profile.revision === 1 && relabel.profile.description === 'x');
    ok('the public shape takes the key facts from the keychain side, never the record',
        O.publicProfile({ ...claude, secretRef: 'FROM-SETTINGS', keyHeldFor: 'x' }, { hasSecret: false }).secretRef === undefined
        && O.publicProfile(claude, { hasSecret: true, secretRef: 'S' }).secretRef === 'S');
    ok('a hint is only drawn for a route that has a key',
        O.publicProfile(claude, { hasSecret: false, keyHint: 'x…1234' }).keyHint === undefined);
    ok('a copy names no key', O.copyProfile({ ...claude, description: 'n' }, 'k2').secretRef === undefined);
}

// ---------- X-516 — one route, the engines it serves, read from the old shape without a rewrite ----------
{
    const M = require(path.join(ROOT, 'out', 'core', 'routeModels.js'));
    const R = require(path.join(ROOT, 'out', 'core', 'providerRuntime.js'));
    // the live or-nemotron as it is stored: a single engine and a key kind this build has no header for
    const nemotron = { id: 'or-nemotron', label: 'Nemotron', engine: 'claude', providerId: 'openrouter',
        baseUrl: 'https://openrouter.ai/api', authKind: 'bearer', tiers: { opus: 'nvidia/nemotron:free' }, revision: 4 };
    const r = P.readProfilesReport([nemotron, { id: 'first', engine: 'claude', providerId: 'anthropic', tiers: {} }]);
    const [n, f] = r.list;
    eq('‼️ an old route with an endpoint and a model is read as serving both engines', n.engines, ['claude', 'opencode']);
    eq('…an old route with neither serves Claude Code alone', f.engines, ['claude']);
    ok('‼️ the stored "bearer" is read as api-key, which is how it was always sent', n.authKind === 'api-key');
    eq('…and the revision does not move on a read', n.revision, 4);
    ok('the migration is said, in one sentence per route',
        r.upgraded.length === 2 && /engines claude \+ opencode/.test(r.upgraded[0]) && /key kind api-key \(stored as "bearer"\)/.test(r.upgraded[0]));
    ok('…and the old field is never written again', !('engine' in n) && !('engine' in P.storedProfile(nemotron)));
    eq('a Claude route\'s environment is unchanged by the read', Object.keys(R.claudeRouteRuntime(n, 'k', {}, '').spawnEnv).sort(),
        Object.keys(R.claudeRouteRuntime({ ...nemotron, engines: ['claude'] }, 'k', {}, '').spawnEnv).sort());
    // engines: a list once each, in one order; empty and unknown refused
    eq('engines are stored once each, claude first, from a list or a comma text',
        [P.storedProfile({ ...claude, engines: ['opencode', 'claude', 'opencode'] }).engines,
            P.storedProfile({ ...claude, engines: ' OpenCode , claude' }).engines], [['claude', 'opencode'], ['claude', 'opencode']]);
    ok('‼️ an empty list is refused', P.addProfile([], { ...claude, engines: [] }).refusal.some(x => /at least one engine/.test(x)));
    ok('‼️ an unknown engine is refused by name', P.addProfile([], { ...claude, engines: 'claude,codex' }).refusal.some(x => /"codex"/.test(x)));
    eq('a new route that could be lent serves both; one that could not serves Claude Code',
        [P.addProfile([], { ...claude, engines: undefined }).profile.engines,
            P.addProfile([], { id: 'anth', providerId: 'anthropic' }).profile.engines], [['claude', 'opencode'], ['claude']]);
    ok('‼️ a route marked for OpenCode with no address is refused, naming it',
        P.addProfile([], { id: 'x1', providerId: 'p', engines: ['opencode'], tiers: { opus: 'a/b' } }).refusal.some(x => /needs an address/.test(x)));
    ok('‼️ …and with no model, naming that', P.addProfile([], { ...claude, tiers: {}, engines: ['claude', 'opencode'] })
        .refusal.some(x => /at least one model/.test(x)));
    // the key kind, the /v1 endpoint, the OpenCode-only endpoint, the limits
    ok('a key kind outside the known ones is refused on a write', P.addProfile([], { ...claude, authKind: 'bearer' }).refusal.some(x => /"bearer"/.test(x)));
    const v1 = P.addProfile([], { ...claude, baseUrl: 'https://openrouter.ai/api/v1/' }).refusal.join(' ');
    ok('‼️ an endpoint ending in /v1 is refused, saying the address to write',
        /\/v1\/v1\/messages/.test(v1) && /write "https:\/\/openrouter\.ai\/api"/.test(v1));
    const ocOnly = { id: 'oc-only', providerId: 'openrouter', opencodeUrl: 'https://openrouter.ai/api/v1', tiers: { opus: 'a/b' } };
    eq('a route with only an OpenCode endpoint serves OpenCode alone', P.addProfile([], ocOnly).profile.engines, ['opencode']);
    ok('‼️ …and marking it for Claude Code is refused', P.addProfile([], { ...ocOnly, engines: ['claude', 'opencode'] })
        .refusal.some(x => /OpenCode alone/.test(x)));
    ok('the OpenCode endpoint is held to the same clear-text rule', P.addProfile([], { ...ocOnly, opencodeUrl: 'http://x.example/v1' })
        .refusal.some(x => /OpenCode endpoint: base URL must be https/.test(x)));
    const lim = P.addProfile([], { ...claude, context: '200000', output: 8192 }).profile;
    ok('context and output are kept as whole numbers of tokens', lim.context === 200000 && lim.output === 8192);
    ok('…and a limit that is not one is refused', P.addProfile([], { ...claude, context: -1 }).refusal.some(x => /context is a positive whole number/.test(x))
        && P.addProfile([], { ...claude, output: 'lots' }).refusal.some(x => /output is a positive whole number/.test(x)));
    // the revision moves with the engines and the OpenCode endpoint, not with the limits
    const one = P.addProfile([], { ...claude, engines: ['claude', 'opencode'] }).list;
    ok('changing engines or the OpenCode endpoint is a new revision',
        P.setProfile(one, 'kimi', { engines: ['claude'] }).profile.revision === 2
        && P.setProfile(one, 'kimi', { opencodeUrl: 'https://api.moonshot.ai/v1' }).profile.revision === 2);
    ok('…a limit is not', P.setProfile(one, 'kimi', { context: 128000, output: 4096 }).profile.revision === 1);
    ok('an edit that does not name engines keeps them', P.setProfile(one, 'kimi', { label: 'K' }).profile.engines.join() === 'claude,opencode');
    // the models of a route, read off its tiers — different models per tier stay different
    const two = P.addProfile([], { ...claude, tiers: { haiku: 'm-b', opus: 'm-a', sonnet: 'm-a', odd: 'm-c' } });
    eq('‼️ a route with different models on its tiers is saved', two.refusal, []);
    eq('…and its models come once each, in tier order, each with its tiers; the first is the default',
        M.routeModelList(two.profile.tiers), [{ model: 'm-a', tiers: ['opus', 'sonnet'] }, { model: 'm-b', tiers: ['haiku'] },
            { model: 'm-c', tiers: ['odd'] }]);
    eq('the item\'s own example', M.routeModelList({ haiku: 'B', sonnet: 'A', opus: 'A' }).map(m => m.model), ['A', 'B']);
    ok('lent to OpenCode only when marked, reachable and serving a model',
        M.lendableToOpenCode(n) && !M.lendableToOpenCode({ ...n, engines: ['claude'] })
        && !M.lendableToOpenCode({ ...n, baseUrl: '' }) && M.lendableToOpenCode({ ...n, baseUrl: '', opencodeUrl: 'https://o/v1' })
        && !M.lendableToOpenCode({ ...n, tiers: {} }));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
