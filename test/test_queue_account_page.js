// X-254 (2/n) — THE QUEUE PAGE'S FOURTH ROUTE BOX AND ITS FILTER, driven
// through the real page code.
//
// The core half shipped the axis in 3.430.0 and the page could not draw it,
// because the page was never handed the sign-ins at all. What is asserted here
// is everything a regex over the source cannot see:
//
//   · ‼️ THE BOX LIES IF THE ITEM'S SIGN-IN IS NOT IN THE LIST. A <select> whose
//     value matches no <option> falls back to the FIRST one, which here reads
//     "— account —", i.e. UNCLAIMED. So an item pinned to a slot the user has
//     since deleted would show, on the one surface where somebody decides what
//     to hand out, as work anybody can take. This was found by rendering the
//     page and reading the markup — every string test passed over it.
//   · An account belongs to ONE engine, so moving the engine box DROPS a
//     sign-in of the old one — a narrowing `AFEngine.narrow` cannot do, because
//     it knows nothing about accounts.
//   · The box is not drawn where there is nothing to choose, and the FILTER is
//     not drawn on a machine that has captured no sign-ins at all: a picker
//     whose only row is "unclaimed" is a filter that cannot filter.
//   · The row states the sign-in without being opened, and marks a dead one.
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const fixture = require(path.join(__dirname, 'fixtures', 'queue.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const run = (over) => runPage('queue.js', fixture.data(over));
/** One item's account box, as the reader would find it. */
const accountBox = (r, id) => r.query('[data-route]')
    .find(e => e.dataset.route === 'account' && e.dataset.item === id);
/**
 * The box's own markup out of the page. The DOM shim's elements carry their
 * OPEN TAG and not their children, so the options are read from the html the
 * page actually produced — which is the thing being asserted about anyway.
 */
const boxHtml = (r, id) => {
    const m = new RegExp('<select id="q-rt-' + id + '-account"[^]*?</select>').exec(r.html());
    return m ? m[0] : '';
};
const selected = (h) => {
    const m = /<option value="([^"]*)"[^>]*\sselected/.exec(h);
    return m ? m[1] : '';
};
const optionValues = (h) => (String(h).match(/<option value="([^"]*)"/g) || [])
    .map(x => /value="([^"]*)"/.exec(x)[1]);

// ---------- the box exists, and only where it can be answered ----------
{
    const r = run();
    ok('‼️ the queue row can finally say whose plan should pay', !!accountBox(r, 'q1'));
    ok('…and it is offered on the other engine that HAS sign-ins', !!accountBox(r, 'q5'));
    // agy holds none in this fixture: a box there would be a question with no
    // answers, and one pretending otherwise would be worse than absent.
    ok('‼️ …and NOT on an engine with none captured', !accountBox(r, 'q4'));

    const box = boxHtml(r, 'q1');
    const vals = optionValues(box);
    ok('the two fixed rows are the SITE\'s own sentence, above the accounts',
        vals[0] === '' && vals[1] === '@machine');
    ok('…then that engine\'s sign-ins, and only that engine\'s',
        vals.indexOf('codex-is') > 1 && vals.indexOf('claude-aicozums') < 0);
    ok('the item\'s own sign-in is the selected one', selected(box) === 'codex-is');
    // From the component (X-263), which is where the five-hour figure lives —
    // the fact the choice actually turns on.
    ok('‼️ a row carries the FIGURE, not just the name',
        /8%/.test(box) && /window/i.test(box));
}

// ---------- ‼️ a sign-in this machine no longer holds ----------
{
    const r = run();
    const box = boxHtml(r, 'q5');
    ok('‼️ an item asking for a sign-in that is GONE still shows it as selected — '
        + 'without this row the box falls back to "— account —" and reads as unclaimed',
        selected(box) === 'claude-silinmis');
    ok('…and it is marked rather than offered as though it were fine',
        /⚠ claude-silinmis/.test(box));
    ok('…and it belongs to the item that asks for it, never to the vocabulary',
        !/claude-silinmis/.test(boxHtml(r, 'q1')));
}

// ---------- the row says it without being opened ----------
{
    const r = run();
    ok('‼️ DENSITY — the sign-in is on the row, not only behind a click',
        /is hesabi/.test(r.html()));
    ok('‼️ …and a dead one is marked THERE too, because that is broken work and '
        + 'somebody scanning for something to hand out must see it',
        /⚠ claude-silinmis/.test(r.html()));
    ok('MIRROR — the hover carries the long form beside the other three axes',
        /Account: is hesabi/.test(r.html()));
    ok('…and a dead one is named IN FULL there, so the hover says what is wrong',
        /Account: claude-silinmis \(not on this machine\)/.test(r.html()));
    // A cell hover is `Label: value` figures, never an explanation — so the
    // axis nobody claimed answers "any" rather than going missing, exactly as
    // the three beside it do.
    const bare = run({
        items: [{
            id: 'z1', ts: Date.now(), author: 'user', status: 'captured', urgency: 'normal',
            text: 'motoru var, hesabı yok', engine: 'claude', model: 'opus-5', tags: []
        }]
    });
    ok('‼️ an item nobody claimed a plan for says "any", not nothing — a figure '
        + 'that goes missing reads as a hover that failed to load',
        /Account: any/.test(bare.html()));
}

// ---------- moving the engine cuts the account ----------
{
    // The item is on codex with a codex sign-in. Moving it to claude must not
    // leave it asking for a sign-in claude cannot read.
    const r = run();
    const engine = r.query('[data-route]')
        .find(e => e.dataset.route === 'engine' && e.dataset.item === 'q1');
    engine.value = 'claude';
    engine.fire('change');
    const sent = r.posted[r.posted.length - 1];
    ok('‼️ switching the engine DROPS a sign-in of the old one — a setup that '
        + 'looks answered and cannot be served is worse than an empty box',
        sent.type === 'setRoute' && sent.engine === 'claude' && sent.account === '');

    const r2 = run();
    const acc = accountBox(r2, 'q1');
    acc.value = 'codex-is';
    acc.fire('change');
    const s2 = r2.posted[r2.posted.length - 1];
    ok('the account axis moves on its own, carrying the others unchanged',
        s2.type === 'setRoute' && s2.account === 'codex-is'
        && s2.engine === 'codex' && s2.model === 'GPT-5.6-Terra');

    const r3 = run();
    const b3 = accountBox(r3, 'q1');
    b3.value = '';
    b3.fire('change');
    ok('and a box the reader clears sends "" — which is "unclaim it"',
        r3.posted[r3.posted.length - 1].account === '');

    // ‼️ The axes are read off the ITEM, not off the boxes — the host owns the
    // value and the page redraws from what comes back — so this is an item
    // already recorded on @machine rather than a box set a moment ago, which
    // would be testing the shim.
    const r4 = run({
        items: [{
            id: 'z2', ts: Date.now(), author: 'user', status: 'captured', urgency: 'normal',
            text: 'makine girişinde koşsun', engine: 'claude', account: '@machine', tags: []
        }]
    });
    const e4 = r4.query('[data-route]')
        .find(x => x.dataset.route === 'engine' && x.dataset.item === 'z2');
    e4.value = 'codex';
    e4.fire('change');
    ok('‼️ @machine SURVIVES an engine change — it is not any engine\'s account, '
        + 'it is the absence of one stated outright',
        r4.posted[r4.posted.length - 1].account === '@machine');
}

// ---------- the filter ----------
{
    const r = run();
    ok('‼️ the queue can be read by PLAN, which is the question the engine '
        + 'filter stopped answering once one engine held five sign-ins',
        /Accounts:/.test(r.html()));

    // ‼️ …and not on a machine with none. One row saying "unclaimed" is a filter
    // that cannot filter, and it would sit there on every fresh install.
    const bare = run({ launch: { engines: [], efforts: [], engineModels: null, accounts: null } });
    ok('‼️ …and it is absent where nothing has been captured', !/Accounts:/.test(bare.html()));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
