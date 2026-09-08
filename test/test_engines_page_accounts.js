// X-172 — THE ACCOUNTS SECTION OF THE ENGINES PAGE, driven through the real
// media/engines.js.
//
// The chip slice (X-172 1/n) made the page SAY which sign-in each engine is
// plugged into and left every gesture on the bridge: capturing one, standing
// one up, dropping one. A page that shows a state it cannot change is the same
// dead end the Engines page was built to remove ("not configured" with nothing
// attached to it), so this is the half a hand can use.
//
// What is pinned here is the shape of the claim, not its prettiness:
//   * one card per captured sign-in, carrying the address, the plan and how
//     much of the five-hour window is gone — the figures, not an explanation;
//   * a bar ONLY where a percentage was really read. -1 is not 0%: an unread
//     account and an exhausted one draw the same empty bar, and one of them is
//     ready to work;
//   * the standing account is marked and does not offer to be stood up again,
//     and the way BACK to the main sign-in exists wherever one is standing —
//     a page that can enter a state it cannot leave is a trap;
//   * capture is offered only for an engine that has a verified way to keep two
//     identities apart, and the ones that do not say WHY rather than vanishing;
//   * forgetting is bookkeeping: the page says the directory stays on disk,
//     because deleting somebody's sign-in from a list tidy is not recoverable;
//   * and no credential is anywhere near any of it.
'use strict';
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const fixture = require(path.join(__dirname, 'fixtures', 'enginespanel.js'));
const DATA = fixture.data();
const r = runPage('engines.js', DATA);
const html = () => r.html();
/** Just the Accounts section. The chip's own AFTip carries addresses and
 *  percentages too, so a page-wide match would go green on the build that has
 *  no section at all — which is exactly what this file exists to catch. */
const sec = () => {
    const h = html();
    const from = h.indexOf('>Accounts<');
    if (from < 0) { return ''; }
    const next = h.indexOf('class=\"posec\"', from);
    return h.slice(from, next < 0 ? h.length : next);
};

// ---- the section is there, and it is a section like the other one ----------
{
    const h = html();
    ok('the Accounts section is drawn', /class="potitle">Accounts</.test(h));
    ok('…in the page\'s own section shell, not a new CSS family',
        h.indexOf('<div class="posec">') >= 0 && (h.match(/class="posec"/g) || []).length === 2);
}

// ---- one card per captured sign-in -----------------------------------------
{
    const h = sec();
    const cards = (h.match(/class="accard/g) || []).length;
    ok('one card per stored account', cards === DATA.accounts.length && cards === 5);
    ok('…each carrying the address', h.indexOf('personal@gmail.com') >= 0
        && h.indexOf('work@studio.example') >= 0);
    ok('…and the plan that is being paid for', h.indexOf('max20x') >= 0 && h.indexOf('pro') >= 0);
    ok('an account of another engine is on the same list, said by its engine',
        h.indexOf('codex') >= 0);
}

// ---- the five-hour window: a bar only where a figure was read --------------
{
    const h = sec();
    const bars = (h.match(/class="progress"/g) || []).length;
    ok('‼️ a bar per account whose percentage was really read, and only those',
        bars === 3);
    ok('…drawn at the figure it read', /width:91%/.test(h) && /width:12%/.test(h));
    ok('‼️ the 91% one is marked hot rather than merely wide — a bar the reader '
        + 'has to measure with their eye is a figure they have to compute',
        /class="hot" style="width:91%|style="width:91%[^>]*"[^>]*hot/.test(h)
        || /hot[^>]*91%|91%[^>]*hot/.test(h));
    ok('‼️ an unread account does NOT draw an empty bar — it says it was not read',
        /not read yet/i.test(h));
    ok('…and one whose sign-in died says THAT instead, which is a different fact',
        /sign(ing)? in again|signed out|needs signing in/i.test(h));
}

// ---- which one the next session opens with ---------------------------------
{
    const h = sec();
    ok('the standing account is marked', /class="acsel on"/.test(h));
    const use = r.query('[data-acuse]');
    ok('‼️ every account that is NOT standing offers one click to stand it up',
        use.length === 4 && !use.some(b => b.dataset.acuse === 'work-1'));
    use.find(b => b.dataset.acuse === 'personal').click();
    ok('…and that press asks the host to activate exactly that account',
        JSON.stringify(r.last()) === JSON.stringify({ type: 'accountActivate', id: 'personal', engine: 'claude' }));

    // The way back. The main sign-in is the ABSENCE of a slot, so there is no
    // row to press — without this the page can put an engine on an account and
    // never take it off again.
    const back = r.query('[data-acmain]');
    ok('‼️ the way back to the main sign-in is offered where one is standing, and only there',
        back.length === 1 && back[0].dataset.acmain === 'claude');
    back[0].click();
    ok('…and it clears the engine rather than naming an account',
        JSON.stringify(r.last()) === JSON.stringify({ type: 'accountActivate', id: '', engine: 'claude' }));

    // ---- X-217: THE SHAPE OF A CONTROL STATES THE ARITHMETIC OF THE CHOICE ---
    //
    // ‼️ A SWITCH SAYS "THESE GO ON AND OFF INDEPENDENTLY". These do not: one
    // engine has exactly one standing account, and `normalizeActive` has always
    // enforced it — so a row of switches drew a promise the code refuses to keep
    // (turn a second one on and the first goes off by itself, which is not what
    // a switch means anywhere else in this product). A single-selection choice
    // is drawn the way one is: the chosen one wears a STATE badge, the others
    // carry an ACTION chip. A switch stays the right shape for a pool whose
    // members really do go on and off independently — which is precisely what
    // one-standing-account-per-engine is not.
    ok('‼️ the switch is gone from the section entirely',
        !/actog/.test(h) && !/role="switch"/.test(h));
    ok('‼️ the standing account wears a STATE badge, and it is the way back',
        /class="acsel on"[^>]*data-acmain="claude"/.test(h) && /🟢/.test(h));
    ok('‼️ every other account carries an ACTION chip, not a state',
        (h.match(/class="acsel"[^>]*data-acuse/g) || []).length === 4 && /⚡/.test(h));
    ok('…exactly one of them is the chosen one', (h.match(/class="acsel on"/g) || []).length === 1);
    ok('‼️ …and it announces a single-selection group, not five independent switches',
        (h.match(/role="radio"/g) || []).length === 5
        && (h.match(/aria-checked="true"/g) || []).length === 1
        && (h.match(/aria-checked="false"/g) || []).length === 4);
    ok('‼️ …while the misleading words are gone from the section entirely',
        !/Use next|Main account<\/button>/.test(h));

    // ONE SUBJECT — "which one is standing" is now said by the control, so the
    // separate head pill that also said it is gone: a fact drawn twice is a fact
    // that can disagree with itself.
    ok('‼️ the fact is in ONE place, not two', !/class="acnow"/.test(h));

    // MIRROR — the badge opens its tooltip with the state it is IN, and the chip
    // with what pressing it would do; neither makes the reader guess.
    ok('…and the hover names the state first, then the whole consequence',
        /standing .*account|the standing/i.test(h) && /hands the engine back to the main sign-in/.test(h)
        && /goes off in the same act/.test(h));
}

// ---- dropping one ----------------------------------------------------------
{
    const drop = r.query('[data-acforget]');
    ok('every account can be dropped', drop.length === 5);
    drop.find(b => b.dataset.acforget === 'spare').click();
    ok('…and dropping asks for exactly that id', JSON.stringify(r.last())
        === JSON.stringify({ type: 'accountForget', id: 'spare' }));
    ok('‼️ and the page says the directory stays on disk — a list tidy is not a deletion',
        /still on disk|left on disk|directory is kept|stays on disk/i.test(sec()));
}

// ---- capturing the sign-in that is on this disk ----------------------------
{
    const h = sec();
    ok('the capture control is there', !!r.query('#ac-add').length);
    const sel = r.query('#ac-engine');
    ok('‼️ the engine is chosen, and only the engines that CAN isolate a sign-in are offered',
        sel.length === 1
        && /<option value="claude"/.test(h) && /<option value="codex"/.test(h)
        && !/<option value="(gemini|opencode|agy)"/.test(h));
    ok('‼️ …and the ones that cannot say WHY rather than vanishing',
        h.indexOf('Antigravity is paid for by an app sign-in') >= 0
        || /cannot hold a second sign-in|no verified way/i.test(h));
    r.sandbox.document.getElementById('ac-label').value = 'second@studio';
    r.query('#ac-add')[0].click();
    ok('capturing hands over the engine and the label the reader typed',
        JSON.stringify(r.last())
        === JSON.stringify({ type: 'accountCapture', engine: 'claude', label: 'second@studio' }));
    ok('‼️ …and the page says capturing does not redirect the next session, '
        + 'because the op it calls does not either',
        /does not (become|make it) |not stood up|standing choice is unchanged|is not made the standing one/i.test(h));
}

// ---- X-219: the yellow badge now has an answer beside it -------------------
//
// ‼️ THE BADGE AND THE BUTTON ARE ONE FACT. The card stated a sign-in was dead
// and offered nothing to do about it — a diagnosis with no treatment, and the
// reason one account's debt stood for seven sessions. The press signs nobody
// in: it opens the engine's own command in the slot's own directory, which is
// the whole of the extension's honest part in a browser flow.
{
    const h = sec();
    const keys = (h.match(/data-acreauth="[^"]*"/g) || []);
    ok('‼️ X-219: a dead sign-in card carries the way to renew it',
        keys.length === 1 && keys[0] === 'data-acreauth="spare"');
    ok('‼️ …and a healthy one does not, because it has nothing to renew',
        !/data-acreauth="work-1"/.test(h) && !/data-acreauth="personal"/.test(h));
    ok('‼️ …the page no longer claims nothing here can renew it, because now something can',
        h.indexOf('Nothing here can renew it') < 0);
    ok('…and the badge points at the key rather than at a terminal the reader must find',
        /The 🔑 beside this is where that starts/.test(h));
    ok('‼️ …the press promises no outcome — the row is read again from disk instead',
        /cannot tell you it worked/.test(h) && /READ AGAIN from disk/.test(h));
    r.query('[data-acreauth]')[0].click();
    ok('‼️ …and the page names a ROW and nothing else: no command, no directory, no variable',
        JSON.stringify(r.last()) === JSON.stringify({ type: 'accountReauth', id: 'spare' }));
}

// ---- X-220: the verdict is always drawn, and three states are three states --
//
// The badge appeared only when something was wrong, so a healthy row said
// NOTHING — and nothing is also what a row nobody has looked at says. Worse,
// `needs signing in` and `unreadable` wore the same yellow and the same
// sentence, while one is a credential that cannot refresh and the other a file
// that cannot say whose account it is.
{
    const h = sec();
    const badges = (h.match(/class="acbad ([a-z]+)"/g) || []).map(s => s.split(' ')[1].replace(/"/, ''));
    ok('‼️ X-220: every card carries its verdict, not only the ones in trouble',
        badges.length === DATA.accounts.length && badges.length === 5);
    ok('…and the ordinary case is drawn QUIETLY, so the ones that need the eye keep their advantage',
        badges.filter(v => v === 'ok').length === 4 && /class="acbad ok">🟢 ready</.test(h));
    ok('‼️ …an expired sign-in is YOUR MOVE, in the yellow this page already uses for that',
        /class="acbad warn">🟠 needs signing in</.test(h));

    // ‼️ THE TWO BAD STATES ARE NOT ONE STATE. Drawn identically, they told the
    // reader the same thing about two different problems.
    const broken = fixture.data();
    broken.accounts = broken.accounts.map(a =>
        a.id === 'spare' ? { ...a, health: 'unreadable' } : a);
    const hb = runPage('engines.js', broken).html();
    ok('‼️ …and a file nothing could be made of is a FAULT, in red, not the same yellow',
        /class="acbad bad">🔴 unreadable</.test(hb) && !/🟠 needs signing in/.test(hb));
    ok('‼️ …with its own sentence: one knows whose account it is and cannot refresh it, '
        + 'the other cannot tell you even that',
        /cannot tell you even that/.test(hb) && !/cannot tell you even that/.test(h));
    ok('…and both offer the key, because signing in again is what fixes either',
        /data-acreauth="spare"/.test(hb) && /data-acreauth="spare"/.test(h));

    // ‼️ ONE COMPONENT FOR ONE FACT. The Console, the agent page and the slash
    // picker all draw AFEngine.badge for the engine; this card wrote the raw id
    // in lowercase grey, which is the same fact in a second spelling.
    ok('‼️ X-220: the engine is drawn in the product\'s own badge, not as raw grey text',
        (h.match(/class="af-eng /g) || []).length === 5
        && !/class="pobody muted small">claude/.test(h));
}

// ---- a refusal is shown where it happened ----------------------------------
{
    r.send({ type: 'acc-msg', text: 'Nothing is signed in to claude on this disk.' });
    ok('a refusal from the host lands in the section, not in a toast',
        sec().indexOf('Nothing is signed in to claude on this disk.') >= 0);
    r.send({ type: 'acc-msg', text: '' });
    ok('...and clears', sec().indexOf('Nothing is signed in to claude on this disk.') < 0);
}

// ---- X-206: one engine one group, and a line the reader can see -------------
{
    const h = sec();
    // ‼️ ONE SUBJECT. A Claude account and a Codex account are never
    // alternatives to each other, so a column that alternates between them
    // makes the reader filter by eye before they can compare anything.
    ok('‼️ accounts are grouped by the engine they belong to',
        /class="acgrpn">Claude Code</.test(h) && /class="acgrpn">Codex</.test(h));
    ok('…each group counting its own', /Claude Code<\/span><span class="acgrpc[^>]*>3 accounts/.test(h)
        && /Codex<\/span><span class="acgrpc[^>]*>2 accounts</.test(h));
    ok('…and only a group with something to compare gets a group-wide read',
        (h.match(/data-acrefreshall="(claude|codex)"/g) || []).length === 2
        && /data-acrefreshall="claude"/.test(h) && /data-acrefreshall="codex"/.test(h));

    // ‼️ A press that acts in twenty seconds with no sign it was heard is
    // indistinguishable from a button that does nothing.
    ok('‼️ a waiting card shows its PLACE in the line, not a spinner that says "soon"',
        /class="acref queued"[^>]*data-acrefresh="personal">1</.test(h)
        && /class="acref queued"[^>]*data-acrefresh="spare">2</.test(h));
    ok('…and the one in flight says so, in its own state',
        /class="acref reading"[^>]*data-acrefresh="work-1"/.test(h));
    ok('…while a card nobody asked for offers the plain gesture',
        /class="acref idle"[^>]*data-acrefresh="codex-work">⟳</.test(h));
    ok('‼️ …and the one being read is told it cannot be taken back',
        /already in flight, so it cannot be taken back/.test(h));

    // X-206 — the age of the FIGURE, beside the age of the account. They answer
    // different questions and only one of them decides a switch.
    ok('‼️ every card says when its own figure was read, not only when it was filed',
        /captured 6d ago · read 40s ago/.test(h) && /captured 20m ago · never read/.test(h));

    const one = r.query('[data-acrefresh]').find(b => b.dataset.acrefresh === 'personal');
    one.click();
    ok('pressing a card asks for that one slot, as a toggle',
        JSON.stringify(r.last()) === JSON.stringify({
            type: 'accountRefresh', ids: ['personal'], gesture: 'toggle' }));
    r.query('[data-acrefreshall]').find(b => b.dataset.acrefreshall === 'claude').click();
    ok('‼️ …and a group press names every READABLE slot of that engine, and no other engine\'s',
        JSON.stringify(r.last()) === JSON.stringify({
            type: 'accountRefresh', gesture: 'all', ids: ['work-1', 'personal', 'spare'] }));
}

// ---------- ‼️ X-218 — ONE PRESS FOR EVERY ACCOUNT, AND THE COST IT WILL NOT HIDE ----------
//
// Each engine already had its own group-wide read (X-206, X-215); the press
// the user asked for is the one ABOVE them — all of them, whichever engine.
// The trap is that the two halves do not cost the same thing: a Claude figure
// is a REQUEST against a budget the whole fleet shares, a Codex figure is a
// file under the account's own folder. A single button that paced the file
// reads behind the requests would make the free half wait for nothing; one
// that paced nothing would spend the budget the line exists to protect.
// `queueAccountRefresh` already splits them (X-215) — what is pinned here is
// that the BUTTON SAYS SO, and that a line which is moving can be seen moving.
{
    const h = sec();
    const all = h.match(/data-acrefreshall="[^"]*"/g) || [];
    ok('‼️ X-218: the section itself offers one press for every account, naming no engine',
        all.length === 3 && all.filter(a => a === 'data-acrefreshall=""').length === 1);
    ok('…above the engine groups, which is where a section-wide gesture belongs',
        h.indexOf('data-acrefreshall=""') >= 0
        && h.indexOf('data-acrefreshall=""') < h.indexOf('class="acgrp"'));
    ok('…and it replaces neither group button',
        /data-acrefreshall="claude"/.test(h) && /data-acrefreshall="codex"/.test(h));

    // ‼️ The item's whole warning, in one sentence the reader can check.
    ok('‼️ …it names the half that lands at once, so no card is left waiting for nothing',
        h.indexOf('2 of them are files under their own account\'s folder and land at once') >= 0);
    ok('‼️ …and the half that really is requests, spaced, on a budget it shares',
        h.indexOf('the other 3 go into one line, one every five seconds') >= 0);

    // A queue nobody can see is indistinguishable from a frozen button (X-206,
    // said again one level up: the card knows its own place, the section knows
    // how much of the line is left).
    ok('‼️ …and a line that is moving says so ON the button, not in a log',
        /data-acrefreshall=""[^>]*>◍ 3 in the line</.test(h));
    ok('…splitting the one in flight from the ones still waiting',
        h.indexOf('1 being read, 2 still waiting') >= 0);

    const btn = r.query('[data-acrefreshall]').find(b => b.dataset.acrefreshall === '');
    btn.click();
    ok('‼️ …and the press hands over every readable slot of BOTH engines, in one gesture',
        JSON.stringify(r.last()) === JSON.stringify({
            type: 'accountRefresh', gesture: 'all',
            ids: ['work-1', 'personal', 'spare', 'codex-work', 'codex-spare'] }));
}

// ‼️ …AND IT IS NOT DRAWN WHERE IT WOULD BE THE BUTTON BELOW IT, TWICE. With
// one engine on the machine, "all engines" and "all Claude Code accounts" are
// the same press, and a control whose only distinction is its position is
// furniture — the group button already reads every account there is.
{
    const one = fixture.data();
    one.accounts = one.accounts.filter(a => a.engine === 'claude');
    const h = runPage('engines.js', one).html();
    ok('‼️ X-218: with a single engine the section-wide press is not drawn twice',
        (h.match(/data-acrefreshall="[^"]*"/g) || []).length === 1
        && /data-acrefreshall="claude"/.test(h));
}

// ---- nothing secret --------------------------------------------------------
{
    // ‼️ Asked of the SECTION, not the page: the engine cards above name
    // ANTHROPIC_API_KEY out loud, because the key route is this page's own
    // subject and a variable NAME is not a credential. An account never
    // reaches even that far — it is an address, a plan and a percentage.
    const h = sec();
    ok('no credential reaches the section - there is no field for one and none is drawn',
        !/sk-[A-Za-z0-9]{6}/.test(h)
        && !/ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|refreshToken|accessToken|credentials.json/.test(h));
}

// ---------- ‼️ X-196 — THE BLOCK THE WHOLE CARD IS FOR ----------
//
// A bar, a percentage and a reset line, and no panel at all: HOW MUCH IS LEFT —
// the figure the reader is actually after — was nowhere, and 38% used and 62%
// left are the same fact with only one of them answering the question.
{
    const h = sec();
    ok('‼️ X-196: the five-hour block answers with what is LEFT, not only what is used',
        h.includes('used: 91%') && h.includes('left: 9%'));
    ok('…and how old the figure is, beside the figure rather than on the footer',
        h.includes('this figure was read 40s ago'));
    ok('…and whose plan it is, so the percentage has an owner',
        h.includes('plan: max20x'));
    ok('‼️ …and an account with NO figure says which of the silences it is',
        h.includes('The stored credential no longer refreshes')
        && h.includes('Nothing has asked for it yet'));
}

// ---------- ‼️ AUDIT A-06.7 — THREE VERDICTS, THREE SENTENCES ----------
//
// X-220 split the badge into 🟢 / 🟠 / 🔴 on the ground that the two bad states
// are DIFFERENT FACTS, and no fixture ever drew the third — so the line under
// the badge went on testing `health !== 'ready'` and captioned a 🔴 row with
// 🟠's words. The badge said "this is NOT an expired sign-in" and the sentence
// two lines below said the credential no longer refreshes. Both cannot be true,
// and the reader believes the one with the detail in it.
//
// So the 🔴 row is now IN the fixture, and what is pinned is that its caption
// is its own.
{
    // The variant that really carries all three at once — and it is a VARIANT,
    // so `node test/render_page.js enginespanel --only enginesbroken` draws it.
    // The scene is the point: this state was string-checked and never seen.
    const h = runPage('engines.js', fixture.brokenData()).html();
    ok('‼️ the third verdict is on screen at all — 🔴 unreadable is drawn',
        h.includes('🔴 unreadable'));
    ok('…beside the other two, so the scene photographs the distinction X-220 made',
        h.includes('🟢 ready') && h.includes('🟠 needs signing in'));

    // ‼️ The unreadable CARD, on its own, taken by splitting on the card
    // wrapper — not by searching the page for its address. The chip's own panel
    // at the top of the page lists every account by name, so a slice starting
    // at the first "broken@gmail" would run through every OTHER card on the way
    // down and inherit the expired wording it is supposed to prove is absent.
    const row = ('<div class="accard' + h.split('<div class="accard').slice(1)
        .find(c => c.indexOf('data-acforget="broken"') >= 0)) || '';
    ok('the unreadable row is findable — this test is worthless if the fixture lost it',
        row.length > 0);
    ok('‼️ …and it does NOT tell the reader to sign in again, which is the one thing '
        + 'nobody can know it needs',
        !row.includes('needs signing in again'));
    ok('…it says what actually happened instead — the sign-in could not be read',
        row.includes('the sign-in could not be read, so nothing was read'));
    ok('…and its panel names the difference rather than repeating the expired sentence',
        row.includes('this is not an expired sign-in')
        && !row.includes('The stored credential no longer refreshes'));
    ok('‼️ …and the 🔑 is drawn on BOTH bad states, not on the expired one alone',
        row.includes('data-acreauth="broken"'));
}

console.log(`test_engines_page_accounts: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
