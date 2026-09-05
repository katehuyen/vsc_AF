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
    ok('one card per stored account', cards === DATA.accounts.length && cards === 4);
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
        bars === 2);
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
    ok('the standing account is marked', /class="acnow"/.test(h));
    const use = r.query('[data-acuse]');
    ok('‼️ every account that is NOT standing offers one click to stand it up',
        use.length === 3 && !use.some(b => b.dataset.acuse === 'work-1'));
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

    // ---- X-205: it is a SWITCH, and its state is drawn rather than spelled ----
    //
    // ‼️ "Use next" read as *hand the next one to whoever is next* — the
    // opposite of what it does. The state is binary and exclusive per engine,
    // so the control is one switch with two positions and the words move into
    // the AFTip, where the whole consequence fits.
    ok('‼️ both directions are the SAME control, in its two positions',
        /class="actog on"[^>]*data-acmain/.test(h)
        && (h.match(/class="actog"[^>]*data-acuse/g) || []).length === 3);
    ok('…exactly one switch is ON, and it is the standing account\'s',
        (h.match(/class="actog on"/g) || []).length === 1);
    ok('…and it announces itself as a switch to anything not looking at pixels',
        (h.match(/role="switch"/g) || []).length === 4
        && /aria-checked="true"/.test(h) && /aria-checked="false"/.test(h));
    ok('‼️ …while the misleading words are gone from the section entirely',
        !/Use next|Main account<\/button>/.test(h));

    // MIRROR — a control with no words at all opens its tooltip with the state
    // it is IN, before it says what pressing it would do.
    ok('…and the hover names the position first, then the whole consequence',
        /ON — the standing/.test(h) && /hands the engine back to the main sign-in/.test(h)
        && /OFF — switch to this account/.test(h) && /goes off in the same act/.test(h));
}

// ---- dropping one ----------------------------------------------------------
{
    const drop = r.query('[data-acforget]');
    ok('every account can be dropped', drop.length === 4);
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
        && /Codex<\/span><span class="acgrpc[^>]*>1 account</.test(h));
    ok('…and only a group with something to compare gets a group-wide read',
        (h.match(/data-acrefreshall/g) || []).length === 1
        && /data-acrefreshall="claude"/.test(h));

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
        /captured 6d ago · read 40s ago/.test(h) && /captured 3h ago · never read/.test(h));

    const one = r.query('[data-acrefresh]').find(b => b.dataset.acrefresh === 'personal');
    one.click();
    ok('pressing a card asks for that one slot, as a toggle',
        JSON.stringify(r.last()) === JSON.stringify({
            type: 'accountRefresh', ids: ['personal'], gesture: 'toggle' }));
    r.query('[data-acrefreshall]')[0].click();
    ok('‼️ …and a group press names every READABLE slot of that engine, and no other engine\'s',
        JSON.stringify(r.last()) === JSON.stringify({
            type: 'accountRefresh', gesture: 'all', ids: ['work-1', 'personal', 'spare'] }));
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
    ok('‼️ …and an account with NO figure says which of the two silences it is',
        h.includes('The stored credential no longer refreshes')
        && h.includes('Nothing has asked for it yet'));
}

console.log(`test_engines_page_accounts: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
