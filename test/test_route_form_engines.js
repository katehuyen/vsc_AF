'use strict';
// U-243 — ONE ROUTE FORM FOR TWO ENGINES, and a card that says what each engine proved.
//
// The form's boxes are providers.add / providers.set's arguments: engines, the
// OpenCode address, the two model limits and a Farm Secret by name ride along with
// what the form already had. A box says what is wrong beside it before a save
// (an endpoint ending in /v1 with its fix, a model id that cannot go on a command
// line, an engine that cannot run the route yet); the host still refuses on save.
const path = require('path');
const fs = require('fs');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const { CLAUDE_ROUTE_TEMPLATES } = require('../out/core/providerCatalog.js');
const { routeFormVocab } = require('../out/core/routeFormVocab.js');
const { modelIdOk } = require('../out/core/launch.js');
const { v1Refusal } = require('../out/core/routeEngines.js');
const { addProfile } = require('../out/core/providerProfiles.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const ROOT = path.join(__dirname, '..');
const fixture = require(path.join(__dirname, 'fixtures', 'enginespanel.js'));

const box = (r, key) => r.query('[data-af="' + key + '"]')[0];
const type = (r, key, value) => { const el = box(r, key); el.value = value; el.fire('input'); el.fire('change'); };
const tick = (r, key, on) => { const el = box(r, key); el.checked = on; el.fire('change'); };
const form = (h) => { const at = h.indexOf('id="poform"'); return at < 0 ? '' : h.slice(at, h.indexOf('data-afact="submit"', at)); };

/* ---------- the shapes the form is handed */
{
    const or = CLAUDE_ROUTE_TEMPLATES.find(t => t.providerId === 'openrouter');
    ok('OpenRouter ships as a route shape: the measured address and an x-api-key, no OpenCode address',
        or && or.route.baseUrl === 'https://openrouter.ai/api' && or.route.authKind === 'api-key' && !or.opencodeUrl);
    const v = routeFormVocab(['kimi', 'kimi'], ['B', 'A']);
    ok('the form is offered every shape a key can be sent to, never the first-party subscription one',
        v.templates.map(t => t.id).join(',') === 'anthropic-api,kimi,minimax,openrouter');
    ok('…the Farm Secrets by name, sorted, and the ids taken once', v.secrets.join(',') === 'A,B' && v.taken.join(',') === 'kimi');
    ok('…and the engines and the id each engine wears a route under', v.engines.join(',') === 'claude,opencode'
        && v.onEngine.claude === '' && v.onEngine.opencode === 'af-');
    const re = new RegExp(v.checks.modelId), v1 = new RegExp(v.checks.v1, 'i');
    ok('the page checks a model id by the host\'s own rule', ['deepseek/deepseek-r1', 'a b', 'x;y', 'nvidia/n-3:free']
        .every(m => re.test(m) === modelIdOk(m)));
    ok('…and an endpoint\'s /v1 by the rule the host refuses with', ['https://x/api/v1', 'https://x/api/v1/', 'https://x/api']
        .every(u => v1.test(u) === !!v1Refusal(u)));
}

/* ---------- a new route: OpenRouter, a model id and a Farm Secret, from one form */
{
    const r = runPage('engines.js', fixture.data());
    r.query('[data-ponew]')[0].click();
    let f = form(r.html());
    ok('a new route serves both engines until a box is cleared', /data-af="eng_claude"[^>]*checked/.test(f) && /data-af="eng_opencode"[^>]*checked/.test(f));
    ok('…and OpenCode says why it cannot run it yet, beside its box', /affmsg warn">OpenCode needs an address/.test(f));
    ok('the shipped shapes are offered to start from', /<option value="openrouter"[^>]*>OpenRouter</.test(f));
    type(r, 'template', 'openrouter');
    f = form(r.html());
    ok('picking OpenRouter fills its address, key kind, provider and a free id',
        /data-af="baseUrl"[^>]*value="https:\/\/openrouter\.ai\/api"/.test(f) && /data-af="providerId"[^>]*value="openrouter"/.test(f)
        && /data-af="id"[^>]*value="openrouter"/.test(f) && /<option value="api-key"[^>]*selected/.test(f));
    ok('…and OpenCode now asks only for a model', /OpenCode needs at least one model/.test(f) && !/OpenCode needs an address/.test(f));
    type(r, 'tier_opus', 'nvidia/nemotron-3-ultra-550b-a55b:free');
    type(r, 'secretRef', 'OpenRouter-free');
    f = form(r.html());
    ok('with a model in a tier nothing is left to say about the engines', !/needs at least one model/.test(f));
    r.query('[data-afact="submit"]')[0].click();
    const m = r.last();
    ok('Add route posts both engines, the model and the Farm Secret by name',
        m.type === 'providerSave' && m.mode === 'new' && m.profile.engines.join(',') === 'claude,opencode'
        && m.profile.tiers.opus === 'nvidia/nemotron-3-ultra-550b-a55b:free' && m.profile.secretRef === 'OpenRouter-free'
        && m.profile.id === 'openrouter' && m.profile.opencodeUrl === '' && m.profile.context === '' && m.profile.output === '');
    const w = addProfile([], m.profile, ['claude', 'opencode'], []);
    ok('…which the host stores as one route serving both engines', !w.refusal.length && w.profile.engines.join(',') === 'claude,opencode'
        && w.profile.baseUrl === 'https://openrouter.ai/api' && w.profile.authKind === 'api-key');
}

/* ---------- the notes beside the boxes, and the fix one press away */
{
    const d = fixture.data();
    d.routeForm = routeFormVocab([...d.routeForm.taken, 'openrouter'], d.routeForm.secrets);
    const r = runPage('engines.js', d);
    r.query('[data-ponew]')[0].click();
    type(r, 'template', 'openrouter');
    ok('a shape whose id is taken gets the next free one', /data-af="id"[^>]*value="openrouter-2"/.test(form(r.html())));
    type(r, 'baseUrl', 'https://openrouter.ai/api/v1');
    let f = form(r.html());
    ok('an endpoint ending in /v1 is said beside it, with the address to use', /Ends in \/v1/.test(f) && /data-afact="fix-v1"[^>]*>Use https:\/\/openrouter\.ai\/api</.test(f));
    r.query('[data-afact="fix-v1"]')[0].click();
    f = form(r.html());
    ok('…and one press writes it', /data-af="baseUrl"[^>]*value="https:\/\/openrouter\.ai\/api"/.test(f) && !/Ends in \/v1/.test(f));
    type(r, 'tier_haiku', 'bad model!');
    ok('a model id that cannot go on a command line is named by its tier', /Not a model id \(haiku\)/.test(form(r.html())));
    type(r, 'tier_haiku', '');
    type(r, 'baseUrl', '');
    type(r, 'opencodeUrl', 'https://openrouter.ai/api/v1');
    f = form(r.html());
    ok('with only an OpenCode address, Claude Code says it cannot serve it', /affmsg warn">Claude Code needs the Anthropic-style Endpoint/.test(f));
    tick(r, 'eng_claude', false);
    ok('…and clearing its box clears the note', !/affmsg warn">Claude Code needs the Anthropic-style Endpoint/.test(form(r.html())));
    r.query('[data-afact="submit"]')[0].click();
    ok('the engines posted are the boxes ticked', r.last().profile.engines.join(',') === 'opencode'
        && r.last().profile.opencodeUrl === 'https://openrouter.ai/api/v1');
}

/* ---------- an edit keeps what the route serves, and its key unless another is picked */
{
    const d = fixture.data();
    d.profiles = d.profiles.map(p => p.id === 'openrouter-r1' ? Object.assign({}, p, { context: 128000, output: 16000 }) : p);
    const r = runPage('engines.js', d);
    r.query('[data-poedit="openrouter-r1"]')[0].click();
    const f = form(r.html());
    ok('Edit draws the engines, the limits and the Farm Secret it signs in with',
        /data-af="eng_opencode"[^>]*checked/.test(f) && /data-af="context"[^>]*value="128000"/.test(f)
        && /data-af="output"[^>]*value="16000"/.test(f) && /<option value="OpenRouter-ahmetseymen4444"[^>]*selected/.test(f));
    r.query('[data-afact="submit"]')[0].click();
    let m = r.last().profile;
    ok('saved unchanged: the engines travel back and the key is not bound again',
        m.engines.join(',') === 'claude,opencode' && !('secretRef' in m) && m.context === '128000');
    type(r, 'secretRef', 'OpenRouter-free');
    type(r, 'context', '');
    r.query('[data-afact="submit"]')[0].click();
    m = r.last().profile;
    ok('another Farm Secret is sent by name, and an emptied limit is a deliberate clear', m.secretRef === 'OpenRouter-free' && m.context === '');
}

/* ---------- the card: what each engine proved, and a Test per engine */
{
    const r = runPage('engines.js', fixture.data());
    const h = r.html();
    const card = h.slice(h.indexOf('data-pokey="openrouter-r1"'), h.indexOf('data-pokey="groq"'));
    ok('a route serving both engines names both on its card', /poserves/.test(card) && /Claude Code/.test(card) && /OpenCode/.test(card));
    ok('…with a Test for each, aimed at the id the route wears on that engine',
        /data-potest="openrouter-r1" data-poteng="claude"/.test(card) && /data-potest="af-openrouter-r1" data-poteng="opencode"/.test(card));
    ok('…and says OpenCode opened by hand does not see it', /OpenCode opened by hand outside Agent Farm does not see this route/.test(card));
    const kimi = h.slice(h.indexOf('data-pokey="kimi"'), h.indexOf('data-pokey="minimax"'));
    ok('a Claude-only route has one Test and no OpenCode sentence', (kimi.match(/data-potest="/g) || []).length === 1 && !/opened by hand/.test(kimi));
}

/* ---------- the two groups: on the report and in the ownership table */
{
    const s = runPage('engines.js', fixture.variants().find(v => v.id === 'engineshealth').data).html();
    const oc = s.slice(s.lastIndexOf('pohrep'));
    ok('OpenCode\'s report lists its own providers and the lent routes under two headings, own first',
        oc.indexOf('OpenCode\'s own providers') >= 0 && oc.indexOf('OpenCode\'s own providers') < oc.indexOf('Agent Farm routes — lent')
        && oc.indexOf('Agent Farm routes — lent') < oc.indexOf('data-potest="af-openrouter-r1"'));
    ok('…while Claude Code, whose rows are all routes, gets no heading', (s.match(/class="pohgrp/g) || []).length === 2);
    ok('the card reads the lent row\'s verdict for OpenCode', /poserve">OpenCode <span[^>]*><span class="pohchip h-ok">tested · 9m ago/.test(s));
    ok('the ownership table draws OpenCode\'s two groups as two rows, Claude Code\'s one as one',
        /poeng">opencode · its own providers</.test(s) && /poeng">opencode · Agent Farm routes</.test(s) && /poeng">claude</.test(s));
    const at = s.indexOf('<table class="potab"'), table = s.slice(at, s.indexOf('</table>', at));
    ok('…and the row naming no group (selection) is drawn in each of its engine\'s groups, never as a third',
        (table.match(/poeng">opencode/g) || []).length === 2
        && table.split('<tr>').filter(r => /poeng">opencode/.test(r)).every(r => (r.match(/<td>/g) || []).length === 4));
}

/* ---------- the host: a Farm Secret named in the form is bound the way the card binds one */
{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the form\'s secretRef is refused unless the vault holds it, then bound by the card\'s own function',
        /if \(ref && !vault\.names\(\)\.includes\(ref\)\) \{ return \[secretMissing\(ref\)\]; \}/.test(ext)
        && /if \(ref\) \{ await useFarmSecretForRoute\(w\.profile!\.id, ref\); \}/.test(ext));
}

console.log(`test_route_form_engines: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
