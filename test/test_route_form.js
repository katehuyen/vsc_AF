'use strict';
// X-494 — the route form: one form for "+ Add route" and a route's Edit.
//
// The defect it closes: the form posted every box and the host turned a known
// id into an overwrite, so "Add route" with an existing id wiped the endpoint,
// the tiers and the note it never showed. Now the page says which door it came
// through and the host never upgrades a NEW route into an edit.
const fs = require('fs');
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const ROOT = path.join(__dirname, '..');

const fixture = require(path.join(__dirname, 'fixtures', 'enginespanel.js'));
const DATA = fixture.data();
const setBox = (r, key, value) => {
    const el = r.query('[data-af="' + key + '"]')[0];
    el.value = value;
    el.fire(el.tagName === 'SELECT' ? 'change' : 'input');
};
const formOf = (h) => {
    const at = h.indexOf('id="poform"');
    return at < 0 ? '' : h.slice(at, h.indexOf('data-afact="submit"', at) + 200);
};

{
    const r = runPage('engines.js', DATA);
    const h = r.html();
    ok('closed by default: no form, "+ Add route" on the section head', !/id="poform"/.test(h) && /data-ponew="1"/.test(h));
    ok('every route card has its Edit', (h.match(/data-poedit="/g) || []).length === DATA.profiles.length);
    ok('the card reads oauth as the header it becomes', /openrouter\.ai\/api · Bearer token/.test(h) && !/ · oauth/.test(h));
    ok('…and api-key as API key', /api\.moonshot\.ai\/anthropic · API key/.test(h));
}

{
    const r = runPage('engines.js', DATA);
    r.query('[data-poedit="openrouter-r1"]')[0].click();
    const h = r.html();
    const f = formOf(h);
    ok('Edit opens the form', /Edit OpenRouter R1/.test(f));
    ok('…under that route\'s card, not at the top', h.indexOf('data-pokey="openrouter-r1"') < h.indexOf('id="poform"')
        && h.indexOf('id="poform"') < h.indexOf('data-pokey="groq"'));
    ok('…its own Edit button is gone while it is open', !/data-poedit="openrouter-r1"/.test(h));
    ok('the id is shown, not offered for typing', !/data-af="id"/.test(f) && /affstat">openrouter-r1</.test(f));
    ok('every box is filled with what is stored', /data-af="label"[^>]*value="OpenRouter R1"/.test(f)
        && /data-af="providerId"[^>]*value="openrouter"/.test(f)
        && /data-af="baseUrl"[^>]*value="https:\/\/openrouter\.ai\/api"/.test(f)
        && /data-af="description"[^>]*value="Ahmet&#39;s OpenRouter account/.test(f));
    ok('one box per CLI tier, the mapped one filled', /data-af="tier_opus"[^>]*value="deepseek\/deepseek-r1"/.test(f)
        && /data-af="tier_sonnet"[^>]*value=""/.test(f) && /data-af="tier_haiku"/.test(f) && /data-af="tier_fable"/.test(f));
    ok('a tier outside the four rides in Other tiers', /data-af="more"[^>]*value="reasoner=deepseek\/deepseek-r1-0528"/.test(f));
    ok('the key kind is a picker on the stored value, with words for both kinds',
        /<option value="oauth"[^>]*selected[^>]*>Bearer token</.test(f) && /<option value="api-key"[^>]*>API key</.test(f));
    ok('…and every option says what it means', /title="[^"]*Authorization: Bearer/.test(f) && /title="[^"]*x-api-key/.test(f));

    setBox(r, 'tier_sonnet', 'deepseek/deepseek-chat');
    setBox(r, 'tier_opus', '');
    setBox(r, 'authKind', 'api-key');
    r.query('[data-afact="submit"]')[0].click();
    const m = r.last();
    ok('Save posts an EDIT of that id', m.type === 'providerSave' && m.mode === 'edit' && m.profile.id === 'openrouter-r1');
    ok('…every field the form showed, so an emptied box is a deliberate clear',
        m.profile.baseUrl === 'https://openrouter.ai/api' && m.profile.description.startsWith('Ahmet')
        && JSON.stringify(m.profile.tiers) === JSON.stringify({ reasoner: 'deepseek/deepseek-r1-0528', sonnet: 'deepseek/deepseek-chat' })
        && m.profile.authKind === 'api-key');

    r.send({ type: 'prov-msg', text: 'base URL must be https' });
    const refused = r.html();
    ok('a refusal is shown in the form, which stays open with the draft', /id="poform"/.test(refused)
        && /affmsg warn">base URL must be https</.test(refused) && /data-af="tier_sonnet"[^>]*value="deepseek\/deepseek-chat"/.test(refused));
    ok('…and not in the section\'s own line', /id="po-msg"><\/div>/.test(refused));

    r.query('[data-afact="submit"]')[0].click();
    r.send({ type: 'prov-msg', text: '', saved: true });
    ok('a saved edit closes the form', !/id="poform"/.test(r.html()));

    r.send({ type: 'prov-msg', text: 'no profile with the id "x"' });
    ok('an answer the form did not ask for (a copy, a remove) lands in the section line', /id="po-msg">no profile/.test(r.html()));
}

{
    const r = runPage('engines.js', DATA);
    r.query('[data-ponew]')[0].click();
    const h = r.html();
    ok('+ Add route opens the empty form at the top', /New route/.test(h) && h.indexOf('id="poform"') < h.indexOf('class="pocard"'));
    ok('…with the id to type and API key as the kind', /data-af="id"/.test(h) && /<option value="api-key"[^>]*selected/.test(h));
    ok('…and the head button hides while it is open', !/data-ponew="1"/.test(h));
    setBox(r, 'id', 'kimi');
    setBox(r, 'providerId', 'kimi');
    r.query('[data-afact="submit"]')[0].click();
    ok('a NEW route is posted as new — the host refuses an id that exists instead of overwriting it',
        r.last().mode === 'new' && r.last().profile.id === 'kimi');
    r.query('[data-afact="cancel"]')[0].click();
    ok('Cancel closes it', !/id="poform"/.test(r.html()));
}

{
    // A route written by hand with no kind — or one this build has no words for — keeps it on Save.
    const d = fixture.data();
    d.profiles = [Object.assign({}, d.profiles[1], { authKind: undefined }), Object.assign({}, d.profiles[0], { id: 'k2', authKind: 'subscription' })];
    const r = runPage('engines.js', d);
    r.query('[data-poedit="minimax"]')[0].click();
    ok('an unstated kind is drawn as itself, not as the first row', /<option value=""[^>]*selected[^>]*>not stated</.test(r.html()));
    r.query('[data-afact="submit"]')[0].click();
    ok('…and saved unchanged', r.last().profile.authKind === '');
    r.query('[data-poedit="k2"]')[0].click();
    ok('a kind with no words here is offered as written', /<option value="subscription"[^>]*selected/.test(r.html()));
}

{
    const r = runPage('engines.js', DATA);
    r.query('[data-poedit="groq"]')[0].click();
    const d = fixture.data();
    d.profiles = d.profiles.filter(p => p.id !== 'groq');
    r.send({ type: 'data', data: d });
    ok('a push that no longer carries the route being edited closes its form', !/id="poform"/.test(r.html()));
}

{
    // The host half: a new route never becomes an edit, whatever id it names.
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'enginesPanel.ts'), 'utf8');
    ok('the host picks add or set by the door, not by whether the id exists',
        /const w = edit\s*\? setProfile\(list, id, input, engines\)\s*: addProfile\(list, input, engines, retiredProviderIds\(\)\);/.test(ext)
        && !/list\.some\(p => p\.id === id\)\s*\? setProfile/.test(ext));
    ok('…and the panel hands it the door', /msg\.mode === 'edit'\), true\);/.test(panel));
    // X-493 — the launcher (QuickPick) folds the same way the Console composer does
    ok('the launcher: on a route that maps tiers the tier row IS the Model row, and the model row is not drawn',
        /label: '\$\(star-full\) Model',\s*description: show\(merged\.tier\)/.test(ext)
        && /\.\.\.\(form\.sub\.kind === 'tier' \|\| form\.modelByRoute \? \[\] : \[\{\s*label: '\$\(star-full\) Model', description: show\(merged\.model\)/.test(ext));
    ok('…a route that decides the model with no tiers draws no Model row either, and its Route row says why',
        /detail: form\.empty \|\| \[routeSaid\.note, form\.sub\.kind === 'tier' \? '' : form\.modelByRoute\]\.filter\(Boolean\)\.join\(' — '\)/.test(ext));
    ok('…and its Account row says the route\'s key pays', /spec\.id === 'claude' && merged\.providerId\s*\? 'a route is picked, so its key pays/.test(ext));
    const P = require(path.join(ROOT, 'out', 'core', 'providerProfiles.js'));
    const list = [P.storedProfile({ id: 'kimi', providerId: 'kimi', baseUrl: 'https://api.moonshot.ai/anthropic', tiers: { opus: 'k2' } })];
    const again = P.addProfile(list, { id: 'kimi', providerId: 'kimi' }, ['claude']);
    ok('addProfile refuses an id that exists and points at Edit', again.refusal.some(x => /already exists/.test(x) && /Edit on its card/.test(x))
        && again.list === list);
}

{
    // The note and the readable kind reach the launch pickers.
    const { profilesAsRoutes } = require(path.join(ROOT, 'out', 'core', 'providerRegistry.js'));
    const { readClaudeRouteCatalog } = require(path.join(ROOT, 'out', 'core', 'providerCatalog.js'));
    const { authKindLabel } = require(path.join(ROOT, 'out', 'core', 'routeAuth.js'));
    const cat = readClaudeRouteCatalog(profilesAsRoutes([{
        id: 'or', label: 'OpenRouter', engine: 'claude', providerId: 'openrouter', baseUrl: 'https://openrouter.ai/api',
        authKind: 'oauth', tiers: { opus: 'x/y' }, revision: 1, description: 'night experiments'
    }]));
    const row = cat.providers.find(p => p.providerId === 'or');
    ok('a profile\'s note travels into the catalog row', row && row.note === 'night experiments');
    ok('authKindLabel: oauth → Bearer token, api-key → API key, an unknown kind as written',
        authKindLabel('oauth') === 'Bearer token' && authKindLabel('api-key') === 'API key' && authKindLabel('subscription') === 'subscription');
    const G = require(path.join(ROOT, 'out', 'core', 'providerRegistry.js'));
    const F = require(path.join(ROOT, 'out', 'core', 'launchProvider.js'));
    const adapter = G.adapterFor('claude', {
        profiles: [{ id: 'or', label: 'OpenRouter', engine: 'claude', providerId: 'openrouter', baseUrl: 'https://openrouter.ai/api',
            authKind: 'oauth', tiers: { opus: 'x/y' }, revision: 1, description: 'night experiments' }],
        secretFor: () => 'sk-test', inheritedEnv: {}
    });
    const choice = F.launchProviderForm(adapter).providers.find(c => c.id === 'or');
    ok('the launch picker row leads with the note and reads the kind (got ' + (choice && choice.detail) + ')',
        !!choice && choice.detail === 'night experiments · https://openrouter.ai/api · Bearer token · 1 model');
}

{
    // X-493 — the Console composer on a route: the tier takes the Model box's place, and the
    // Account box says the route's key pays (it still picks the Claude home, so it stays).
    const cf = require(path.join(__dirname, 'fixtures', 'console.js'));
    const v = cf.variants().find(x => /composer picks the route/.test(x.label));
    const h = runPage('console.js', v.data).html();
    ok('the routed composer draws the tier box and no Model box', /id="c-tier"/.test(h) && !/id="c-model"/.test(h));
    ok('…and its Account box says the route\'s key pays, the box choosing only the Claude home',
        /its key pays for this session — not this sign-in/.test(h) && !/Which sign-in of this engine pays/.test(h));
    // the same composer with no route picked: the host publishes no sub-axis then
    const plain = Object.assign({}, v.data, {
        composerIntent: Object.assign({}, v.data.composerIntent, { providerId: '', tier: '' }),
        composerForm: Object.assign({}, v.data.composerForm, { sub: { kind: 'none', label: '', note: '', choices: [] } })
    });
    const p = runPage('console.js', plain).html();
    ok('…while an unrouted composer keeps its Model box and the sign-in sentence',
        /id="c-model"/.test(p) && /id="c-account"/.test(p) && /Which sign-in of this engine pays/.test(p));
}

{
    // X-493 — the Tasks form folds the same way, and the hidden model is not lost
    const tf = require(path.join(__dirname, 'fixtures', 'tasks.js'));
    const v = tf.variants().find(x => x.id === 'tasks-route');
    const r = runPage('tasksPage.js', v.data);
    r.query('#nt-open')[0].click();
    const before = r.html();
    ok('the Tasks form draws its Model box while no route is picked', /id="nt-model"/.test(before));
    v.act(r);
    const h = r.html();
    ok('…and on a route that maps tiers the tier box takes its place, labelled Model',
        !/id="nt-model"/.test(h) && /<span>Model<\/span>\s*<select id="nt-tier">/.test(h));
}

{
    // X-493 — a route with its own base URL and no tiers: nothing to choose, and every surface says why
    const NOTE = 'MiniMax maps no tiers, so there is no model to choose here.';
    const G = require(path.join(ROOT, 'out', 'core', 'providerRegistry.js'));
    const F = require(path.join(ROOT, 'out', 'core', 'launchProvider.js'));
    const adapter = G.adapterFor('claude', {
        profiles: [
            { id: 'mm', label: 'MiniMax', engine: 'claude', providerId: 'minimax', baseUrl: 'https://api.minimax.io/anthropic', tiers: {}, revision: 1 },
            { id: 'key2', label: 'Second key', engine: 'claude', providerId: 'anthropic-api', authKind: 'api-key', tiers: {}, revision: 1 }
        ],
        secretFor: () => 'sk-test', inheritedEnv: {}
    });
    ok('the form names a route with its own base URL as deciding the model',
        /^MiniMax maps no tiers/.test(F.launchProviderForm(adapter, { providerId: 'mm' }).modelByRoute || ''));
    ok('…and not a route on Anthropic\'s own endpoint, nor no route at all (the Model box means something there)',
        F.launchProviderForm(adapter, { providerId: 'key2' }).modelByRoute === undefined
        && F.launchProviderForm(adapter).modelByRoute === undefined);

    const cf = require(path.join(__dirname, 'fixtures', 'console.js'));
    const v = cf.variants().find(x => /composer picks the route/.test(x.label));
    const routed = (form) => Object.assign({}, v.data, {
        composerIntent: Object.assign({}, v.data.composerIntent, { tier: '' }),
        composerForm: Object.assign({}, v.data.composerForm, { sub: { kind: 'none', label: '', note: '', choices: [] } }, form)
    });
    const h = runPage('console.js', routed({ modelByRoute: NOTE })).html();
    ok('the composer on such a route draws neither a Model nor a tier box', !/id="c-model"/.test(h) && !/id="c-tier"/.test(h));
    ok('…and the route box\'s hover says why', h.includes(NOTE));
    const k = runPage('console.js', routed({})).html();
    ok('…while a route on Anthropic\'s own endpoint keeps its Model box', /id="c-model"/.test(k) && !k.includes(NOTE));

    const tf = require(path.join(__dirname, 'fixtures', 'tasks.js'));
    const d = tf.data();
    d.launch.routes.claude.providers = [{ id: 'mm', label: 'MiniMax', detail: '', tiers: [], modelByRoute: NOTE }];
    const r = runPage('tasksPage.js', d);
    r.query('#nt-open')[0].click();
    const sel = r.query('#nt-route')[0];
    sel.value = 'mm';
    sel.fire('change');
    const th = r.html();
    ok('the Tasks form on such a route draws no Model box and no tier box', !/id="nt-model"/.test(th) && !/id="nt-tier"/.test(th));
    ok('…and its Route box\'s hover says why', th.includes(NOTE));

    // X-496 — the "no tier" row says what it really serves, in the host's own words
    const SAYS = 'no tier named: a model this launch sends picks its own family\'s tier, otherwise sonnet — x/sonnet';
    const d2 = tf.data();
    d2.launch.routes.claude.providers = [{ id: 'or', label: 'OR', detail: '', tierDefault: SAYS,
        tiers: [{ id: 'sonnet', label: 'sonnet', detail: 'x/sonnet' }] }];
    const r2 = runPage('tasksPage.js', d2);
    r2.query('#nt-open')[0].click();
    const s2 = r2.query('#nt-route')[0];
    s2.value = 'or';
    s2.fire('change');
    ok('X-496 — the Tasks form\'s "no tier" option carries the route\'s own default', r2.html().includes(SAYS));
}

console.log(`test_route_form: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
