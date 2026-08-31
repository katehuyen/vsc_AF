// X-105 — THE CARD SAYS WHAT IT IS SERVED BY.
//
// The correctness half (the process really runs on the route) is
// test_console_route_env.js's subject. This is the half a person can see: the
// engine badge has always said which PROGRAM is running and never what that
// program is talking to — and two cards on the same engine can be served by two
// different companies' models at the same moment. Carried on the state since
// X-103, said out loud nowhere.
//
// What is pinned here is the shape of that claim, not its prettiness:
//   · a card with no route draws NOTHING (most cards — four of five engines
//     have no provider axis and most Claude launches pick none), because a pill
//     reading "none" on every row costs every reader something to learn nothing;
//   · a card with one draws the route's own name, and the panel behind it opens
//     with the long form and carries the endpoint — the line that makes the mark
//     checkable instead of decorative;
//   · and no credential is anywhere near it.
'use strict';
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const fixture = require(path.join(__dirname, 'fixtures', 'console.js'));
const r = runPage('console.js', fixture.data());
// The page repaints by SLOT, so its parts are not children of one element:
// the card list is its own container and the composer's control strip is
// another. Both are read, because the mark is drawn on both.
const part = (id) => {
    const el = r.sandbox.document.getElementById(id);
    return (el && el.innerHTML) || '';
};
const html = () => part('c-list') + part('c-controls');

// ‼️ THE CLASS LIST IS MATCHED, NOT THE CLASS ATTRIBUTE. A card whose provider
// moved wears a second class on the SAME mark (`af-route af-route-moved`), and
// an anchored `class="af-route"` would silently stop counting it — which would
// read as "the mark is not drawn" when the truth is the opposite.
const ROUTED = /class="af-route([^"]*)"[^>]*>([^<]*)</g;
const marks = () => {
    const out = [];
    const h = html();
    for (let m = ROUTED.exec(h); m; m = ROUTED.exec(h)) {
        out.push({ label: m[2], moved: /af-route-moved/.test(m[1]) });
    }
    ROUTED.lastIndex = 0;
    return out;
};

// The fixture is the real page's own data: five cards, and two of them started
// on a route — one still on it, one whose provider moved at a turn boundary.
const routed = fixture.data().sessions.filter(s => s.route);
ok('the fixture carries the case this exists for', routed.length === 2);
ok('…and the cards that have no route, which is the ordinary card',
    fixture.data().sessions.length > routed.length);

const drawn = marks();
ok('‼️ X-105 — the routed card wears its route, and it is the route\'s own name',
    drawn.length === 2 && drawn[0].label === 'Kimi' && drawn[0].moved === false);
ok('‼️ …and a card with no route wears nothing at all',
    drawn.length === routed.length);
/**
 * ‼️ X-105 — AND THE CARD THAT MOVED SAYS WHO IS SERVING IT NOW, NOT WHO IT
 * STARTED WITH.
 *
 * On the engine that qualifies a model (`provider/model`), a mid-session model
 * change moves the provider. A pill that went on naming the launch value would
 * be pointing at an endpoint the session stopped talking to — the exact
 * disagreement between what a surface SAYS and what the process RUNS ON that
 * this whole family of items exists to close. Both facts are kept: the current
 * one is the pill, the launch one is the first line of its panel.
 */
ok('‼️ the moved card wears the provider serving it NOW',
    drawn[1].label === 'anthropic' && drawn[1].moved === true);

// ---- the panel behind it ---------------------------------------------------
//
// AFTip, not a native title: this is TEXT and it grows (endpoint, tier, the
// engine's own scope note). The long form opens it, so a reader never has to
// already know what the short pill meant (SHORTHAND).
{
    const h = html();
    // The panel FOLLOWS its trigger in the markup, so the window looks forward:
    // head, then body, then the engine's own scope note at the end of it.
    const at = h.indexOf('af-route');
    const around = h.slice(Math.max(0, at - 200), at + 1400);
    ok('the mark is an AFTip trigger, not a native tooltip',
        /data-aftip/.test(around) && !/<span class="af-route[^"]*"[^>]*title=/.test(h));
    ok('…opening with the long form', around.indexOf('the route this session is served by') >= 0);
    ok('…and carrying the endpoint, which is what makes it checkable',
        around.indexOf('api.moonshot.ai') >= 0);
    ok('…the tier it was started on', /Tier: sonnet/.test(around));
    ok('…and the engine\'s OWN words for how long the pick lasts',
        around.indexOf('a different route is a different program') >= 0);
}

// ---- ‼️ X-105 — the panel of a card that MOVED carries both facts -----------
{
    const h = html();
    const at = h.indexOf('af-route-moved');
    const around = h.slice(Math.max(0, at - 200), at + 1400);
    ok('‼️ the moved card names what it STARTED on, which is what the turns already '
        + 'in the transcript really ran on',
        /Started on: opencode/.test(around));
    ok('…and says those turns keep it, so the line is a fact and not a warning',
        /the turns before the change ran on that one/.test(around));
    ok('…and it is the SAME mark, so there is no second pill for one subject',
        /class="af-route af-route-moved"/.test(h));
    // MIRROR: a control narrow enough to cut its own text opens its panel with
    // the value it is showing — so the first line is the CURRENT provider.
    ok('…and the panel opens with the value the pill is showing',
        around.indexOf('Provider: anthropic') >= 0
        && around.indexOf('Provider: anthropic') < around.indexOf('Started on:'));
    // ‼️ AND THE UNMOVED CARD IS NOT GIVEN THE LINE. A panel that restated the
    // pill on every ordinary card is how a reader learns to stop reading it.
    const kimiAt = h.indexOf('Route: Kimi');
    ok('‼️ …and a card that never moved is not told where it started',
        kimiAt >= 0 && !/Started on:/.test(h.slice(kimiAt, kimiAt + 400)));
}

// ---- ‼️ and nothing secret is anywhere on the page -------------------------
//
// The route object has no credential field and this is where that stops being
// a claim about a type and becomes a claim about the rendered page.
{
    const h = html();
    ok('‼️ no credential reaches the page — there is no field for one and none is drawn',
        !/sk-[A-Za-z0-9]/.test(h) && !/ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN/.test(h));
}

// ---- the engine badge is untouched -----------------------------------------
//
// ONE SUBJECT: the route is its own mark. A route line folded into the engine's
// panel would be the fifth place that can disagree with the other four, and it
// would also make the engine badge answer two questions.
{
    const h = html();
    ok('the engine badge still says only which engine', /class="af-eng af-engc claude"/.test(h));
    ok('…and does not carry the route in its own tip',
        h.indexOf('Engine: Claude Code') >= 0 && !/Engine: Claude Code[^"]*Kimi/.test(h));
}

console.log(`test_console_route_badge: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
