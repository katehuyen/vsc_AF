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

const ROUTED = /class="af-route"[^>]*>([^<]*)</g;
const marks = () => {
    const out = [];
    const h = html();
    for (let m = ROUTED.exec(h); m; m = ROUTED.exec(h)) { out.push(m[1]); }
    ROUTED.lastIndex = 0;
    return out;
};

// The fixture is the real page's own data: four cards, exactly one of them
// started on a route.
const routed = fixture.data().sessions.filter(s => s.route);
ok('the fixture carries the case this exists for', routed.length === 1);
ok('…and the cards that have no route, which is the ordinary card',
    fixture.data().sessions.length > routed.length);

const drawn = marks();
ok('‼️ X-105 — the routed card wears its route, and it is the route\'s own name',
    drawn.length === 1 && drawn[0] === 'Kimi');
ok('‼️ …and a card with no route wears nothing at all',
    drawn.length === routed.length);

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
        /data-aftip/.test(around) && !/<span class="af-route"[^>]*title=/.test(h));
    ok('…opening with the long form', around.indexOf('the route this session is served by') >= 0);
    ok('…and carrying the endpoint, which is what makes it checkable',
        around.indexOf('api.moonshot.ai') >= 0);
    ok('…the tier it was started on', /Tier: sonnet/.test(around));
    ok('…and the engine\'s OWN words for how long the pick lasts',
        around.indexOf('a different route is a different program') >= 0);
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
