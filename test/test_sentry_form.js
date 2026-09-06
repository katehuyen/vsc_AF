// ‼️ X-194 — THE SENTRY FORM'S MODE SELECTOR AND CONDITION EDITOR.
//
// The host has taken `preset` and `conditions` since v11.244 and the round has
// read the policy since X-191 — but nothing could SET one, so every campaign
// anybody actually started fell to the mechanical default and the leader built
// in X-191 never woke once. This is the half that was missing.
//
// Measured against the real page through the real fixture (`lib_page_dom`), not
// a string match on the source: what is at stake is whether pressing a mode
// really fills the conditions and whether Start really carries them.
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const fixture = require(path.join(__dirname, 'fixtures', 'missions.js'));
const P = require(path.join(__dirname, '..', 'out', 'core', 'sentryPolicy.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const byId = (r, id) => r.sandbox.document.getElementById(id);
// ‼️ THE PAGE'S OWN DOCUMENT, not the harness's outer helper: the shim hands
// back the element the wiring attached its listener to only through this path,
// and a fresh stub is an element nothing is listening on.
const qsa = (r, sel) => r.sandbox.document.querySelectorAll(sel);
const press = (r, elOrId) => {
    const el = typeof elOrId === 'string' ? byId(r, elOrId) : elOrId;
    if (!el) { throw new Error('nothing to press: ' + elOrId); }
    el.fire('click');
};
const typeIn = (r, id, value) => { const el = byId(r, id); if (el) { el.value = value; } };

/** The form, open, on a page with no campaign — the state it is filled in from. */
function openForm() {
    const r = runPage(fixture.script, fixture.data(), fixture.window || {});
    press(r, 's-new');
    return r;
}
const html = r => String(r.els.app.innerHTML || '');
const presetBtn = (r, id) => qsa(r, '[data-spreset]').filter(e => e.dataset.spreset === id)[0];
// ‼️ `[data-scond]`, not `.scond` — the shim matches a class by substring, so
// `.scond` also counts every `.scond-f` and `.scond-o` inside the row and a
// five-condition set measures as twenty-two.
const rows = r => qsa(r, '[data-scond]');

// ---------------------------------------------------------------- the strip
{
    const r = openForm();
    ok('the form carries a mode strip', /class="spolicy"/.test(html(r)));
    ok('…offering every preset the DICTIONARY declares, not a list typed here',
        P.PRESETS.every(p => !!presetBtn(r, p.id)));
    // ‼️ "NOT SET" IS NOT "MECHANICAL". The host writes no policy at all for it
    // and the round's own default decides — which is what every campaign
    // started before this control existed did. Mechanical is a decision.
    ok('‼️ …and a "not set" that is a fourth position, not the absence of one',
        !!presetBtn(r, ''));
    ok('nothing is asked for until something is pressed',
        /data-spreset=""[^>]*class="chip on"|class="chip on" data-spreset=""/.test(html(r))
        || /<button type="button" class="chip on" data-spreset="">Not set/.test(html(r)));
    ok('…and with no condition the block still says what that MEANS',
        /every round stays mechanical/.test(html(r)));
}

// -------------------------------------------- pressing a mode fills the set
{
    const r = openForm();
    press(r, presetBtn(r, 'hybrid'));
    const want = P.presetConditions('hybrid');
    ok('‼️ pressing a preset FILLS the conditions from the dictionary',
        rows(r).length === want.length && want.length > 0);
    ok('…and every one of its fields is drawn on its own row',
        want.every(c => html(r).indexOf('value="' + c.field + '" selected') >= 0));
    ok('…and the strip says which mode that is',
        /class="chip on" data-spreset="hybrid"/.test(html(r)));

    // ‼️ THE MODE IS DERIVED FROM THE CONDITIONS ON EVERY PAINT, never
    // remembered: "hybrid" printed over five edited conditions is a label that
    // lies about what will run tonight.
    press(r, qsa(r, '[data-sdel]')[0]);
    ok('‼️ editing a condition makes the mode custom…',
        rows(r).length === want.length - 1 && /custom · from hybrid/.test(html(r))
        && !/class="chip on" data-spreset="hybrid"/.test(html(r)));

    press(r, presetBtn(r, 'hybrid'));
    ok('…and pressing the preset again puts it back, by value',
        rows(r).length === want.length && /class="chip on" data-spreset="hybrid"/.test(html(r)));

    press(r, presetBtn(r, 'mechanical'));
    ok('mechanical is an EMPTY set, and says so rather than showing nothing',
        rows(r).length === 0 && /Zero tokens, zero thinking|template/.test(html(r)));
}

// ------------------------------------------------ a row offers what fits
{
    const r = openForm();
    press(r, presetBtn(r, 'hybrid'));
    const h = html(r);
    // `handover.found` is a boolean, so the row must not be offered "is more
    // than": an operator the field's type cannot take is a condition that can
    // never hold, and the host refuses it by name.
    const firstRow = (/<div class="scond" data-scond="0"[^>]*>[\s\S]*?<\/div>/.exec(h) || [''])[0];
    ok('‼️ a row offers only the operators its FIELD TYPE admits',
        firstRow.indexOf('value="isFalse"') >= 0 && firstRow.indexOf('value="gt"') < 0);
    ok('…and an operator that takes no value draws no value box at all',
        firstRow.indexOf('scond-nov') >= 0 && firstRow.indexOf('class="scond-v"') < 0);

    const numRow = (/<div class="scond" data-scond="1"[^>]*>[\s\S]*?<\/div>/.exec(h) || [''])[0];
    ok('…while a number field gets a number box and the operators for one',
        numRow.indexOf('type="number"') >= 0 && numRow.indexOf('value="gt"') >= 0);

    ok('every row can be dropped and reordered', qsa(r, '[data-sdel]').length === rows(r).length
        && qsa(r, '[data-sup]').length === rows(r).length
        && qsa(r, '[data-sdn]').length === rows(r).length);
    // The order is not cosmetic: conditions are ORed and the verdict names the
    // ones that fired in the order they were written.
    ok('…and the first row cannot move up, nor the last down',
        /data-sup="0" disabled/.test(h)
        && new RegExp('data-sdn="' + (rows(r).length - 1) + '" disabled').test(h));
}

// -------------------------------------------------- adding one by hand
{
    const r = openForm();
    press(r, presetBtn(r, 'mechanical'));
    press(r, 's-condadd');
    ok('a condition can be added to an empty set', rows(r).length === 1);
    ok('…and the row arrives usable rather than half-filled',
        /class="scond-f"[\s\S]*?selected/.test(html(r)) && /class="scond-o"/.test(html(r)));
    // ‼️ AND THE LABEL IS DERIVED, WHICH IS VISIBLE HERE MORE THAN ANYWHERE.
    // The first field in the dictionary is `always`, so the row that arrives is
    // `always is true` — which IS the intelligent preset, by value. The strip
    // says "Intelligent" rather than "custom · from mechanical", because what
    // will run tonight is the condition set and not the button last pressed.
    ok('‼️ …and the mode is read off the CONDITIONS, not off the button pressed',
        /class="chip on" data-spreset="intelligent"/.test(html(r))
        && !/custom · from/.test(html(r)));

    // Edit that row into something no preset declares and it becomes custom.
    const f = qsa(r, '.scond-f')[0];
    f.value = 'repo.dirty';
    f.fire('change');
    ok('…and a set no preset declares is custom, still naming where it grew from',
        /custom · from mechanical/.test(html(r)) && rows(r).length === 1);
}

// ------------------------------------------------ what Start actually sends
{
    const r = openForm();
    press(r, presetBtn(r, 'hybrid'));
    typeIn(r, 's-project', 'p1');
    typeIn(r, 's-agent', 'a1');
    typeIn(r, 's-prompt', 'go');
    r.posted.length = 0;
    press(r, 's-start');
    const m = r.posted.find(x => x.type === 'sentryStart');
    ok('‼️ Start carries the mode and the conditions the form is showing',
        !!m && m.input.preset === 'hybrid'
        && Array.isArray(m.input.conditions)
        && m.input.conditions.length === P.presetConditions('hybrid').length);
    ok('…and each condition carries the three things the host reads',
        !!m && m.input.conditions.every(c => typeof c.id === 'string' && !!c.field && !!c.operator));
}
{
    // ‼️ ASKING FOR NO MODE SENDS NEITHER KEY. `sentry.start` writes no policy
    // for that on purpose (v11.244); a form that helpfully sent `mechanical`
    // would be deciding something nobody asked it to.
    const r = openForm();
    typeIn(r, 's-project', 'p1');
    typeIn(r, 's-agent', 'a1');
    typeIn(r, 's-prompt', 'go');
    r.posted.length = 0;
    press(r, 's-start');
    const m = r.posted.find(x => x.type === 'sentryStart');
    ok('‼️ asking for no mode sends neither preset nor conditions',
        !!m && m.input.preset === undefined && m.input.conditions === undefined);
}

// ------------------------------------------- what every row reads TODAY
//
// ‼️ The item's own words: "her satırda o alanın ŞU ANKİ değeri gösterilir ki
// kullanıcı koşulun bugün ateşleyip ateşlemeyeceğini görsün". A rule written
// against a number nobody can see is a rule written blind, and the click that
// would show it is the click DENSITY forbids.
{
    const r = openForm();
    press(r, presetBtn(r, 'hybrid'));
    const H = html(r);
    ok('every condition row carries a reading',
        rows(r).length > 0 && qsa(r, '[data-snow]').length === rows(r).length);
    // The hybrid set's second row asks about `repo.dirty`, and the fixture's
    // last round measured 3 — the row must say 3, not a placeholder.
    ok('‼️ …and the reading is the LAST ROUND\'s measured value',
        /data-snow="1" data-snowv="3"/.test(H));
    ok('…a boolean reads as the word the picker uses, not as 0/1',
        /data-snow="0" data-snowv="false"/.test(H));
    ok('…and the reading says WHEN it was measured, once, where the set is summed up',
        /spolicy-asof/.test(H));

    // A form opened before any round has ever run has nothing to read, and says
    // so — a blank next to every row would read as "zero", which is a lie.
    const bare = fixture.data();
    // copied, never stripped in place: `data()` hands back the shared defaults
    // and a delete on them would blind every test that runs after this one.
    bare.sentry = Object.assign({}, bare.sentry);
    delete bare.sentry.policyFacts;
    const r2 = runPage(fixture.script, bare, fixture.window || {});
    press(r2, 's-new');
    press(r2, presetBtn(r2, 'hybrid'));
    ok('with nothing measured yet the rows say so rather than showing a zero',
        /not measured yet/.test(html(r2)) && !/data-snowv=/.test(html(r2)));
}

// ------------------------------------- and whether it would fire TONIGHT
//
// The mark is not worked out on this page. Operator semantics live in
// `core/sentryPolicy.ts` and a second copy here would be the copy that goes out
// of date — so the page ASKS, debounced, exactly the way the mission draft asks
// what it would launch with (U-103), and paints what the real evaluator said.
{
    // A window whose timer fires at once, so the debounced ask really goes out
    // and the test can read the token it was sent with.
    const now = { setTimeout: (fn) => { fn(); return 1; }, clearTimeout: () => { } };
    const r = runPage(fixture.script, fixture.data(), now);
    press(r, 's-new');
    press(r, presetBtn(r, 'hybrid'));
    const asked = r.posted.filter(m => m && m.type === 'sentryProbe');
    ok('‼️ the page ASKS the host whether this draft would fire tonight',
        asked.length > 0 && Array.isArray(asked[asked.length - 1].conditions));
    const last = asked[asked.length - 1];
    ok('…carrying the draft it is asking about, and a token to answer it with',
        last.conditions.length === P.presetConditions('hybrid').length
        && typeof last.seq === 'number');

    r.send({
        type: 'sentryProbe', seq: last.seq, verdict: 'leader',
        hits: [true, true, false, false, false],
        fired: ['no-handover', 'dirty-repo'], problems: [], why: 'two conditions hold'
    });
    const H = html(r);
    ok('a condition that holds right now is marked on its row',
        /class="scond-now scond-hit" data-snow="0" data-snowv="false" data-sholds="1"/.test(H));
    ok('…and one that does not is left unmarked',
        /class="scond-now" data-snow="2"/.test(H) && !/data-snow="2"[^>]*data-sholds/.test(H));
    ok('‼️ …and the set says, in one sentence, what tonight would do',
        /would wake the leader/i.test(H));

    // A stale answer is dropped rather than painted over a newer draft.
    r.send({
        type: 'sentryProbe', seq: last.seq - 1, verdict: 'mechanical',
        hits: [false, false, false, false, false], fired: [], problems: [], why: 'nothing'
    });
    ok('an answer about a draft the user has since edited is dropped',
        /would wake the leader/i.test(html(r)));
}

// --------------------------------------------- a new row gets a free name
{
    const r = openForm();
    press(r, presetBtn(r, 'hybrid'));
    press(r, 's-condadd');
    press(r, qsa(r, '[data-sdel]')[0]);
    press(r, 's-condadd');
    // ‼️ The verdict NAMES the conditions that fired, so two rows sharing a
    // handle answer for each other. Deleting one and adding another must not
    // hand out a name that is already on the board.
    const ids = (html(r).match(/data-scondid="([^"]*)"/g) || [])
        .map(m => m.slice(14, -1));
    ok('‼️ adding a row after a delete never reuses a name already on the board',
        ids.length === rows(r).length && new Set(ids).size === ids.length);
}

// ------------------------------------------------- the leader's own leash
//
// `leaderCaps` has been on the record since X-191 and nothing could write one,
// so every campaign spent the machine-wide settings. These three boxes are the
// writer — and each of them cuts its own text, so MIRROR applies: the value IN
// FORCE goes on the first line of its own panel.
{
    const r = openForm();
    const H = html(r);
    ok('the form carries the leader\'s model, its daily purse and its per-turn ceiling',
        !!byId(r, 's-lmodel') && !!byId(r, 's-lday') && !!byId(r, 's-lmax'));
    // ‼️ MIRROR — an empty box is not an empty setting: it is the settings'
    // own figure, and the reader must be able to see WHICH without leaving.
    ok('‼️ …and each one says, on the first line of its panel, what is in force now',
        /Now: haiku/.test(H) && /Now: \$2 a day/.test(H) && /Now: \$0\.25 a turn/.test(H));
    ok('…and the empty box shows that same figure as its placeholder',
        /id="s-lday"[^>]*placeholder="2"/.test(H) && /id="s-lmax"[^>]*placeholder="0.25"/.test(H));
    // ‼️ X-250 — THE MODEL BOX IS A SELECT, NOT FREE TEXT OVER A DATALIST.
    //
    // U-97 measured this popup on the DELEGATE rows and wrote the reason down:
    // Chromium anchors a datalist on the flex PARENT rather than the box, so
    // the second press draws the list at the far left of the row and a repaint
    // while it is open collapses it to a single line. The fix landed there and
    // these two boxes — the campaign's own model and the leader's — were left
    // behind, which is the form the user was actually pressing. This assertion
    // used to REQUIRE the datalist, so the defect was pinned in place by a
    // green test.
    ok('‼️ the leader\'s model box is a <select>, not free text over a datalist',
        /<select id="s-lmodel"/.test(H) && !/id="s-lmodel"[^>]*list=/.test(H));
    ok('‼️ …and the sentry form ships no <datalist> at all',
        !H.includes('<datalist'));
    // MIRROR survives the change of control: the figure in force is still
    // readable without opening the box, now as the empty option's own words.
    ok('…and the empty option still names the figure the setting holds',
        /<option value=""[^>]*>— setting: haiku —</.test(H));

    typeIn(r, 's-project', 'p1');
    typeIn(r, 's-agent', 'a1');
    typeIn(r, 's-prompt', 'go');
    typeIn(r, 's-lmodel', 'sonnet');
    typeIn(r, 's-lday', '5');
    r.posted.length = 0;
    press(r, 's-start');
    const m = r.posted.find(x => x.type === 'sentryStart');
    ok('Start carries what was typed…',
        !!m && m.input.leaderModel === 'sonnet' && m.input.leaderDailyUsd === '5');
    // ‼️ AN UNTOUCHED BOX SENDS NOTHING. Sending the placeholder back would
    // FREEZE today's setting onto the campaign: change the setting tomorrow and
    // this campaign would go on spending yesterday's figure, silently.
    ok('‼️ …and an untouched one sends nothing, so the setting still decides',
        !!m && m.input.leaderMaxUsd === undefined);
}

// ------------------------------------------------------- AND groups
//
// The core has read `Condition.all` since X-190 — every part must hold — and the
// editor drew a flat OR list, so the only policy anybody could actually build
// was "any one of these". The item asks for groups by name ("VE/VEYA grupları"),
// and the reason is not symmetry: "the repo is dirty AND the item did not close"
// is a real night, while either half alone is an ordinary one.
{
    const r = openForm();
    press(r, presetBtn(r, 'hybrid'));
    const was = rows(r).length;
    press(r, qsa(r, '[data-sand]')[1]);
    ok('‼️ a condition can be given an AND part, and becomes a group',
        rows(r).length === was + 1 && /data-scond="1\.0"/.test(html(r))
        && /data-scond="1\.1"/.test(html(r)));
    ok('…and the group says AND on the part, because ORed rows are the default',
        /scond-amp/.test(html(r)));
    ok('…the part it grew from is kept, not replaced',
        /data-scond="1\.0"[\s\S]*?value="repo.dirty" selected/.test(html(r)));
    // ‼️ A GROUP IS NOT A PRESET'S SET. The strip is derived from the conditions
    // on every paint, so grouping one of them has to show up there.
    ok('‼️ …and grouping a condition makes the mode custom',
        /custom · from hybrid/.test(html(r)));

    // Only the row that OWNS the group carries the group's ↑ ↓ ✕; a part
    // carries its own ✕ and nothing else, because moving a part above the row
    // it is ANDed with is not a thing that means anything.
    ok('a part carries its own drop button and not the group\'s controls',
        qsa(r, '[data-sdelp]').length === 1
        && qsa(r, '[data-sup]').length === rows(r).length - 1);

    press(r, qsa(r, '[data-sdelp]')[0]);
    ok('‼️ dropping the last part collapses the group back to a plain condition',
        rows(r).length === was && !/data-scond="1\.0"/.test(html(r))
        && /class="chip on" data-spreset="hybrid"/.test(html(r)));
}

// ------------------------------------------- what Start sends for a group
{
    const r = openForm();
    press(r, presetBtn(r, 'hybrid'));
    press(r, qsa(r, '[data-sand]')[1]);
    typeIn(r, 's-project', 'p1');
    typeIn(r, 's-agent', 'a1');
    typeIn(r, 's-prompt', 'go');
    r.posted.length = 0;
    press(r, 's-start');
    const m = r.posted.find(x => x.type === 'sentryStart');
    const g = m && m.input.conditions[1];
    ok('‼️ Start carries the group in the shape the CORE reads, not a shape of its own',
        !!g && Array.isArray(g.all) && g.all.length === 2
        && g.all.every(p => !!p.field && !!p.operator) && g.field === undefined);
    // The whole point of the round trip: the real evaluator has to accept it.
    const P2 = require(path.join(__dirname, '..', 'out', 'core', 'sentryPolicy.js'));
    const probe = P2.probePolicy(m.input.conditions, {
        diagnosis: { outcome: 'hit-the-wall', unknown: [], limit: false },
        handover: { found: true, source: 'transcript', score: 5 },
        repo: { dirty: 4, untracked: 0 },
        round: { index: 2, failed: false, barren: false, consecutiveBarren: 0 },
        quota: { percent: 10 }, accounts: { usable: 2 }, output: '', code: { closed: true }
    });
    ok('…and the evaluator judges it without a single problem',
        probe.measured === true && probe.problems.length === 0
        && probe.hits.length === m.input.conditions.length);
}

// ---------- ‼️ X-207 — WHICH ACCOUNTS THIS CAMPAIGN IS ALLOWED TO SPEND ------
//
// The user's own complaint: "aynı motorun içinde bile kullanıcının izin verdiği
// hesaplar arasında rotasyon yapmalı … izinsiz hesaba dokunmamalı". Until this
// there was no such thing as permission — the pool was every account of the
// engine, and no surface expressed the idea at all.
const poolBtn = (r, id) => qsa(r, '[data-spool]').filter(e => e.dataset.spool === id)[0];
const rotBtn = (r, id) => qsa(r, '[data-srot]').filter(e => e.dataset.srot === id)[0];

{
    const r = openForm();
    const h = html(r);
    ok('every captured account is offered, both engines, not just the campaign\'s',
        qsa(r, '[data-spool]').length === 5);
    // ‼️ DENSITY — the figure is already measured, so making the reader open the
    // Engines page to find out which account has room, in order to come back
    // and tick it, is a click this page has no right to charge.
    ok('‼️ each account draws the room it has right now, so the choice is informed',
        h.includes('23%') && h.includes('4%') && h.includes('97%'));
    // An unread account is USABLE (`slotIsUsable`), so drawing it as 0% would
    // invert the one distinction the ceiling turns on.
    ok('‼️ an account nobody has read says so rather than drawing a zero',
        /not read|unread|—%/i.test(h));
    ok('the accounts are grouped by the engine they belong to',
        h.toLowerCase().includes('claude') && h.toLowerCase().includes('codex'));
}

{
    // ‼️ X-250 — AND THE LIST BELONGS TO THE ENGINE THE CAMPAIGN NAMED.
    //
    // The box offered the flat alias vocabulary (`DATA.modelAliases`) whatever
    // `s-engine` held, so a Codex campaign was offered Claude's words — while
    // `modelListOf(engine)`, four hundred lines above in the same file, had
    // been doing it right for the delegate rows since U-64.
    const r = openForm();
    typeIn(r, 's-model', 'opus');
    typeIn(r, 's-engine', 'codex');
    byId(r, 's-engine').fire('change');
    const box = /<select id="s-model"[\s\S]*?<\/select>/.exec(html(r));
    ok('the round\'s model box is a <select>', !!box);
    ok('‼️ …offering what the named engine publishes', !!box && box[0].includes('gpt-5-codex'));
    ok('‼️ …and not the other engine\'s aliases', !!box && !/>sonnet</.test(box[0]));
    // ‼️ U-101 — AND A VALUE SOMEBODY TYPED IS NOT TAKEN AWAY WHILE THEY ARE
    // LOOKING AT ANOTHER CONTROL. The off-catalog word is KEPT as its own
    // option, marked, so the page tells rather than deletes.
    ok('‼️ …and the word already in the box survives the change, marked',
        !!box && /⚠ opus/.test(box[0]));
}

{
    // ‼️ MIRROR — the field is empty BY DESIGN and empty means something
    // specific. A reader who cannot tell "no pool" from "a pool I picked"
    // cannot tell whether the campaign will touch the account they are keeping.
    const r = openForm();
    typeIn(r, 's-engine', 'claude');
    press(r, poolBtn(r, 'slot-1'));   // any press re-reads and re-renders
    press(r, poolBtn(r, 'slot-1'));   // …and off again: back to no pool
    ok('‼️ with nothing ticked the form says what will happen instead',
        /every account of|all .*accounts|the engine's accounts/i.test(html(r)));
}

{
    const r = openForm();
    press(r, poolBtn(r, 'slot-2'));
    press(r, poolBtn(r, 'slot-x2'));
    press(r, poolBtn(r, 'slot-1'));
    typeIn(r, 's-project', 'p1');
    typeIn(r, 's-agent', 'a1');
    typeIn(r, 's-prompt', 'go');
    r.posted.length = 0;
    press(r, 's-start');
    const m = r.posted.find(x => x.type === 'sentryStart');
    // ‼️ THE ORDER IS THE PRIORITY, so it must survive the trip. `tiered` walks
    // engines in the pool's own order; a form that sorted the ids would be
    // silently reordering the tiers.
    ok('‼️ Start carries the pool in the order the user ticked it',
        !!m && JSON.stringify(m.input.pool) === '["slot-2","slot-x2","slot-1"]');
    ok('…a pool that crosses engines is one pool, not two campaigns',
        !!m && m.input.pool.length === 3);
}

{
    const r = openForm();
    press(r, poolBtn(r, 'slot-1'));
    press(r, rotBtn(r, 'tiered'));
    typeIn(r, 's-project', 'p1');
    typeIn(r, 's-agent', 'a1');
    typeIn(r, 's-prompt', 'go');
    r.posted.length = 0;
    press(r, 's-start');
    const m = r.posted.find(x => x.type === 'sentryStart');
    ok('the rotation strategy travels with the pool', !!m && m.input.rotation === 'tiered');
}

{
    // ‼️ NOT ASKING IS NOT ASKING FOR THE DEFAULT. `free` is what the record
    // does with no field at all, so sending it would freeze today's default
    // onto a campaign — the same rule the mode chips already follow.
    const r = openForm();
    typeIn(r, 's-project', 'p1');
    typeIn(r, 's-agent', 'a1');
    typeIn(r, 's-prompt', 'go');
    r.posted.length = 0;
    press(r, 's-start');
    const m = r.posted.find(x => x.type === 'sentryStart');
    ok('‼️ a form nobody touched sends neither a pool nor a rotation',
        !!m && m.input.pool === undefined && m.input.rotation === undefined);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
