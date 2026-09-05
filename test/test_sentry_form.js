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
    const firstRow = (/<div class="scond" data-scond="0">[\s\S]*?<\/div>/.exec(h) || [''])[0];
    ok('‼️ a row offers only the operators its FIELD TYPE admits',
        firstRow.indexOf('value="isFalse"') >= 0 && firstRow.indexOf('value="gt"') < 0);
    ok('…and an operator that takes no value draws no value box at all',
        firstRow.indexOf('scond-nov') >= 0 && firstRow.indexOf('class="scond-v"') < 0);

    const numRow = (/<div class="scond" data-scond="1">[\s\S]*?<\/div>/.exec(h) || [''])[0];
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
