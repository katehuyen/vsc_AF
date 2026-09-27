// The two A2A pages (N-6) — what agents leave for each other and the work
// they hand over — run through the real page scripts on the tests' DOM shim.
//
// ‼️ WHAT THIS PINS. (1) The four-tab strip: both new pages draw it, both old
// pages draw it, and the A2A counts are GREY badges that never touch the 🔔
// and 📥 ones. (2) The card grammar on real content: five coordinate chips,
// a broadcast drawn as words and never a bare asterisk, the lease bar on a
// claimed row and not on a queued one, the supervisor directive block, the
// markdown body. (3) The hand a person has: resolve / reopen, convert to task
// (and the refusal once a task exists), cancel — each a message the panel's
// handler answers with the SAME store the bridge op uses. (4) The filters and
// the query box answer, and a reset clears them.
const path = require('path');
const { runPage } = require('./lib_page_dom');
const notesFx = require('./fixtures/a2anotes');
const tasksFx = require('./fixtures/a2atasks');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const ui = { notices: { unread: 2 }, queue: { blocked: 1 }, a2a: { notes: 4, tasks: 3 } };
const notes = (over, state) => runPage('a2aNotes.js', notesFx.data(over), { __AFUI__: ui }, state);
const tasks = (over, state) => runPage('a2aTasks.js', tasksFx.data(over), { __AFUI__: ui }, state);
const count = (s, re) => (s.match(re) || []).length;

// ---------- the four-tab strip ----------
{
    const r = notes();
    const h = r.html();
    ok('the notes page draws the strip with four tabs', count(h, /class="af-tab /g) === 4);
    ok('…in the order Notices · Queue | A2A Notes · A2A Tasks, with a separator between the pairs',
        /data-afnav="notices"[^]*data-afnav="queue"[^]*af-tab-sep[^]*data-afnav="a2anotes"[^]*data-afnav="a2atasks"/.test(h));
    ok('…and its own tab is the active one', /class="af-tab on" data-afnav="a2anotes"/.test(h));
    ok('the A2A counts are GREY badges', /class="af-tab-n af-tab-grey" data-afcount="a2anotes"> \(4\)</.test(h)
        && /class="af-tab-n af-tab-grey" data-afcount="a2atasks"> \(3\)</.test(h));
    ok('…and the 🔔 / 📥 badges keep their own class and their own numbers',
        /class="af-tab-n" data-afcount="notices"> \(2\)</.test(h) && /class="af-tab-n" data-afcount="queue"> \(1\)</.test(h));
    ok('the tasks page draws the same strip, its own tab active', /class="af-tab on" data-afnav="a2atasks"/.test(tasks().html()));
    // The two OLD pages carry the four tabs too — one strip, drawn by one function.
    const q = runPage('queue.js', require('./fixtures/queue').data(), { __AFUI__: ui });
    ok('the Work Queue page now shows the A2A tabs beside its own', count(q.html(), /class="af-tab /g) === 4 && /data-afnav="a2atasks"/.test(q.html()));
    const n = runPage('notices.js', require('./fixtures/notices').data(), { __AFUI__: ui });
    ok('…and so does the Notices page', count(n.html(), /class="af-tab /g) === 4 && /data-afnav="a2anotes"/.test(n.html()));
    // (the push that repaints these badges in place is pinned in test_header_counts.js)
    // An inactive tab is a door.
    r.query('[data-afnav]').find(e => e.dataset.afnav === 'a2atasks').click();
    ok('clicking the A2A Tasks tab posts afnav', r.posted.some(m => m.type === 'afnav' && m.to === 'a2atasks'));
}

// ---------- notes: the board on real content ----------
{
    const r = notes({ focusId: 'n-mu9p3' });
    const h = r.html();
    ok('the live notes are listed by default (resolved and expired are history)',
        count(h, /class="a2a-card/g) === 4 && !/n-mu9p4/.test(h) && !/n-mu9p5/.test(h));
    ok('the subtitle counts the whole board and what is shown', /6 total · 4 live · showing 4/.test(h));
    ok('a broadcast is drawn as WORDS on every axis, never a bare asterisk',
        /◧ any<\/span>/.test(h) && /📁 any<\/span>/.test(h) && /→ anyone<\/span>/.test(h) && !/>\*</.test(h));
    ok('a project coordinate is the project\'s NAME, from the open projects', /◧ PRS\.MuratVural_DEV_VSC\.AgentFarm/.test(h));
    ok('strictness is a chip of its own, with the rule in its hover',
        /a2a-c-strict a2a-s-hard">hard</.test(h) && /every stated coordinate must match/.test(h));
    ok('a promoted note wears its task\'s state on the line', /⚡ claimed<\/span>/.test(h));
    ok('a directed note is flagged on the line', /class="a2a-dflag a2a-df-constraint">👤 constraint</.test(h));
    ok('the reader count is on the line and the readers in its hover', /👁 3</.test(h) && /Read by: developer, explorer, basit/.test(h));
    ok('the focused card is marked and open', /a2a-card a2a-focus" data-id="n-mu9p3"/.test(h) && /a2a-body/.test(h));
    ok('…its supervisor directive is drawn as the block the bridge prints',
        /a2a-directive a2a-d-constraint/.test(h) && /HUMAN SUPERVISOR DIRECTIVE — constraint: stay WITHIN these limits/.test(h)
        && /docs\/CONVENTIONS\.md dışına taşınmayacak/.test(h));
    ok('…and its markdown body is rendered: code spans and inline emphasis', /<code>test_console_page\.js<\/code>/.test(h));
    ok('nothing is left unescaped', !/<script/i.test(h.replace(/<style>[^]*?<\/style>/g, '')));

    // Open the discovery: files, facts, actions.
    r.query('[data-open]').find(e => e.dataset.open === 'n-mu9p1').click();
    const o = r.html();
    ok('opening a card shows its files as links carrying the note id',
        /data-file="D:\\zone\\agent\\.gitignore" data-note="n-mu9p1"/.test(o));
    ok('…a list and a link in the body come out as markup', /<ul><li>Konuşmalar zaten düz metin/.test(o) && /class="a2a-link" data-href="https:\/\/git-scm\.com\/docs\/git-filter-repo"/.test(o));
    ok('…and the facts name the readers and "never" for a note that does not expire', /<dt>Read by<\/dt><dd>manager<\/dd>/.test(o) && /<dt>Expires<\/dt><dd>never<\/dd>/.test(o));
    r.query('[data-file]')[0].click();
    ok('a file link asks the host to open THAT file of THAT note', r.posted.some(m => m.type === 'openFile' && m.id === 'n-mu9p1' && m.file === 'D:\\zone\\agent\\.gitignore'));
    r.query('[data-act]').find(e => e.dataset.act === 'toTask' && e.dataset.id === 'n-mu9p1').click();
    ok('⚡ Convert to task posts toTask with the note id', r.posted.some(m => m.type === 'toTask' && m.id === 'n-mu9p1'));
    r.query('[data-act]').find(e => e.dataset.act === 'resolve' && e.dataset.id === 'n-mu9p1').click();
    ok('✓ Resolve posts resolve', r.posted.some(m => m.type === 'resolve' && m.id === 'n-mu9p1'));
    // The promoted one offers the task instead of a second promotion.
    r.query('[data-open]').find(e => e.dataset.open === 'n-mu9p6').click();
    const p = r.html();
    ok('a note that already has a task offers "Open task", not a second conversion',
        /data-act="openTask" data-id="n-mu9p6" data-task="t-mu9q1"/.test(p) && !/data-act="toTask" data-id="n-mu9p6"/.test(p));
    r.query('[data-act]').find(e => e.dataset.act === 'openTask').click();
    ok('…and it opens the TASK by its id', r.posted.some(m => m.type === 'openTask' && m.id === 't-mu9q1'));
}

// ---------- notes: filters, query, history, reset ----------
{
    const r = notes(undefined, { fState: null });
    const h = r.html();
    ok('with the state filter cleared the history shows too, dimmed and flagged',
        count(h, /class="a2a-card/g) === 6 && /a2a-closed" data-id="n-mu9p4"/.test(h) && /✓ resolved</.test(h) && /⌛ expired</.test(h));
    r.query('[data-open]').find(e => e.dataset.open === 'n-mu9p4').click();
    const o = r.html();
    ok('a resolved note offers Reopen and cannot be converted', /data-act="unresolve" data-id="n-mu9p4"/.test(o) && /data-act="toTask" data-id="n-mu9p4" disabled/.test(o));
    r.query('[data-act]').find(e => e.dataset.act === 'unresolve').click();
    ok('↺ Reopen posts unresolve', r.posted.some(m => m.type === 'unresolve' && m.id === 'n-mu9p4'));

    const s = notes();
    s.els['an-search'].value = 'sqlite';
    s.els['an-search'].fire('input');
    ok('the query box narrows the board (title, body, topic…)', count(s.html(), /class="a2a-card/g) === 1 && /n-mu9p1/.test(s.html()));
    ok('…and the query survives in the page state', s.state().query === 'sqlite');
    s.els['an-search'].value = '';
    s.els['an-search'].fire('input');
    s.ms.clickName('an-from', 'manager');
    ok('the From picker narrows to one author', count(s.html(), /class="a2a-card/g) === 1 && /n-mu9p2/.test(s.html()));
    s.ms.clickName('an-project', '*');
    ok('the Projects picker offers "any project" for the broadcasts', count(s.html(), /class="a2a-card/g) === 1);
    s.els['an-reset'].click();
    ok('↺ resets every filter and the query', count(s.html(), /class="a2a-card/g) === 4 && s.state().fFrom === null && s.state().query === '');

    const e = notes({ notes: [], tasksByNote: {} });
    ok('an empty board says how notes get here', /No notes match/.test(e.html()) && /Agents leave notes for each other here/.test(e.html())
        && !/a2a\.notes\./.test(e.html()));
}

// ---------- S-84: the relay on the board, the pin, and the hand that deletes ----------
{
    const fx = notesFx.variants().find(v => v.id === 'relay').data;
    const board = (state) => notes(fx, state);

    const r = board();
    ok('a relay card wears its own category icon and its chain as a CHIP, not a topic',
        /class="a2a-cat">⑂</.test(r.html()) && /data-chain="chn_mucn4k2x91"/.test(r.html())
        && /⑂ chn_mucn4k2x91/.test(r.html()));
    ok('the switch says what it IS now, and its panel opens on a title (not a wall of text)',
        /id="an-baton"[^]*?⑂ Batons: all/.test(r.html())
        && /Relay cards on the board/.test(r.html()) && /One click → ⑂ Batons: hidden/.test(r.html()));

    // the tri-state switch: all → hidden → only → all, and it survives a reload
    r.els['an-baton'].click();
    ok('one click hides the races — the fleet\'s own notes are what is left',
        count(r.html(), /class="a2a-card/g) === 2 && !/class="a2a-cat">⑂</.test(r.html())
        && r.state().batonMode === 'hide');
    r.els['an-baton'].click();
    ok('…the next click is the opposite: the races and nothing else',
        count(r.html(), /class="a2a-card/g) === 1 && /class="a2a-cat">⑂</.test(r.html())
        && r.state().batonMode === 'only');
    r.els['an-baton'].click();
    ok('…and the third is back to all three', r.state().batonMode === 'all'
        && count(r.html(), /class="a2a-card/g) === 3);

    // the chain lock: the whole race, oldest first, every other filter off
    const c = board();
    c.query('[data-chain]')[0].click();
    const ch = c.html();
    // ‼️ the class name is in the stylesheet too — an assertion on the bare
    // word passes on a page that never draws it (docs/CONVENTIONS.md)
    ok('‼️ a chain chip locks the page to that race — resolved legs and all, whatever the state filter says',
        count(ch, /class="a2a-card/g) === 3 && /class="a2a-chainbar"/.test(ch) && c.state().chainLock === 'chn_mucn4k2x91');
    ok('…leg by leg, OLDEST first (the order the race happened in)',
        /data-id="n-leg1"[^]*data-id="n-leg2"[^]*data-id="n-leg3"/.test(ch));
    ok('…and the bar says what is locked and how many legs handed on',
        /⑂ chn_mucn4k2x91/.test(ch) && /3 leg\(s\), oldest first · 2 handed on/.test(ch));
    c.els['an-unchain'].click();
    ok('✕ Unlock puts the board back', !/class="a2a-chainbar"/.test(c.html()) && c.state().chainLock === null);

    // the pin — the exemption, drawn as one
    const p = board();
    ok('a pinned card says so on the row and on the card', /class="a2a-pin on" data-pinrow="n-leg3"/.test(p.html())
        && /a2a-card[^"]*pinned" data-id="n-leg3"/.test(p.html()));
    p.query('[data-pinrow]').find(e => e.dataset.pinrow === 'n-leg3').click();
    ok('…and clicking it asks to UNpin exactly that note',
        p.posted.some(m => m.type === 'pin' && m.id === 'n-leg3' && m.pinned === false));
    p.query('[data-pinrow]').find(e => e.dataset.pinrow === 'n-mu9p1').click();
    ok('an unpinned one asks the other way', p.posted.some(m => m.type === 'pin' && m.id === 'n-mu9p1' && m.pinned === true));

    // deletion: one row, the selected ones, and the resolved half
    const d = board();
    d.query('[data-open]').find(e => e.dataset.open === 'n-leg3').click();
    d.query('[data-act]').find(e => e.dataset.act === 'delete' && e.dataset.id === 'n-leg3').click();
    ok('✕ Delete posts delete for that note, and its panel says it is not history',
        d.posted.some(m => m.type === 'delete' && m.id === 'n-leg3')
        && /Delete this note for good/.test(d.html()));

    const b = board();
    // the shim does not toggle a checkbox for you; a browser does it before the
    // click reaches the page
    const check = (id) => { const cb = b.query('[data-cb]').find(e => e.dataset.cb === id); cb.checked = true; cb.click(); };
    check('n-leg3');
    ok('a row can be selected, and the header counts it',
        /1 selected/.test(b.html()) && /a2a-card[^"]*sel" data-id="n-leg3"/.test(b.html()));
    b.query('[data-hact]').find(e => e.dataset.hact === 'bulkDelete').click();
    ok('🗑 Delete takes the SELECTED rows',
        b.posted.some(m => m.type === 'deleteMany' && m.ids.length === 1 && m.ids[0] === 'n-leg3'));
    b.query('[data-hact]').find(e => e.dataset.hact === 'bulkDelete').click();
    ok('‼️ …and with nothing selected it takes every row SHOWN — never the whole board behind the filter',
        b.posted.filter(m => m.type === 'deleteMany').length === 2
        && b.posted[b.posted.length - 1].ids.length === 3);
    b.query('[data-hact]').find(e => e.dataset.hact === 'clearResolved').click();
    ok('● Clear resolved asks for the closed half only', b.posted.some(m => m.type === 'clear' && m.resolvedOnly === true));

    const only = board({ batonMode: 'only', fState: null });
    ok('a board with no races of its own says how one gets here',
        /No relay cards/.test(notes({ notes: [], tasksByNote: {} }, { batonMode: 'only' }).html())
        && count(only.html(), /class="a2a-card/g) === 3);
}

// ---------- tasks: two lanes, the lease bar, the hand ----------
{
    const r = tasks({ focusId: 't-mu9q1' });
    const h = r.html();
    ok('the board has an open lane and a closed lane, counted', /a2a-lane">Open · 4</.test(h) && /a2a-lane">Closed · 4</.test(h));
    ok('every state wears its badge', ['queued', 'claimed', 'running', 'blocked', 'done', 'failed', 'cancelled']
        .every(s => new RegExp('a2a-st-' + s + '">').test(h)));
    ok('a claimed row carries a lease bar with the minutes left and the claimant\'s progress',
        /a2a-lease a2a-l-ok" role="progressbar" aria-valuenow="87"/.test(h) && /26m left · ölçüm senaryosu yazıldı/.test(h));
    ok('a lease about to die is drawn as dying', /a2a-lease a2a-l-dying" role="progressbar" aria-valuenow="13"/.test(h) && /4m left · 3\/4 hesap okundu/.test(h));
    ok('a queued row has NO lease bar', !new RegExp('data-open="t-mu9q0"[^]*?role="progressbar"[^]*?data-open="t-mu9q1"').test(h));
    ok('the from → claimant pair is on the line', /🤖 developer → developer</.test(h) && /🤖 manager → basit</.test(h));
    ok('a handed-on task counts its hops', /a2a-hop">↪2</.test(h) && /a2a-hop">↪3</.test(h));
    ok('requirements are a count on the line and the list in the hover', /🔧 2</.test(h) && /Requires: write_tools, git/.test(h));
    ok('the closed lane is dimmed', /a2a-card a2a-closed" data-id="t-mu9q4"/.test(h));
    ok('a closed task draws NO lease bar — its lease is history', count(h, /role="progressbar"/g) === 2);
    ok('an absolute workdir chip carries the path\'s last segment and the hover the whole path',
        /📁 vsc_AgentFarm<\/span>/.test(h) && /Workdir: D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm/.test(h) && !/📁 D:\\zone/.test(h));
    ok('…and a relative subsystem stays whole', /📁 src\/core<\/span>/.test(notes().html()) && /📁 agent<\/span>/.test(notes().html()));
    ok('the focused task is open with its claim facts', /a2a-focus" data-id="t-mu9q1"/.test(h)
        && /<dt>Claimed by<\/dt><dd>developer · session a65a340e/.test(h) && /<dt>Progress<\/dt><dd>ölçüm senaryosu/.test(h));
    ok('…and the note it grew from is a cross-link by title', /a2a-xref" data-note="n-mu9p6">Profildeki 97 milyon/.test(h));
    r.query('.a2a-xref').find(e => e.dataset.note).click();
    ok('clicking it asks for the NOTE', r.posted.some(m => m.type === 'openNote' && m.id === 'n-mu9p6'));
    r.query('[data-act]').find(e => e.dataset.act === 'cancel' && e.dataset.id === 't-mu9q1').click();
    ok('⊘ Cancel posts cancel', r.posted.some(m => m.type === 'cancel' && m.id === 't-mu9q1'));

    r.query('[data-open]').find(e => e.dataset.open === 't-mu9q3').click();
    const b = r.html();
    ok('a blocked, vetoed task shows the veto block and its result line',
        /a2a-directive a2a-d-veto/.test(b) && /NOT this — do something else/.test(b) && /<div class="a2a-sech">Result<\/div>/.test(b));
    r.query('[data-open]').find(e => e.dataset.open === 't-mu9q4').click();
    const d = r.html();
    ok('a done task offers no Cancel and links its queue item', !/data-act="cancel" data-id="t-mu9q4"/.test(d) && /a2a-xref" data-queue="q-mu9k7"/.test(d));
    r.query('.a2a-xref').find(e => e.dataset.queue).click();
    ok('…which opens the Work Queue on that item', r.posted.some(m => m.type === 'openQueueItem' && m.id === 'q-mu9k7'));
    ok('ceilings are read as words when unset', /no cost ceiling · no turn ceiling/.test(d));
}

// ---------- tasks: filters, query, reset, empty, one ----------
{
    const r = tasks();
    r.ms.clickName('at-state', 'blocked');
    ok('the State picker narrows to one state', count(r.html(), /class="a2a-card/g) === 1 && /t-mu9q3/.test(r.html()));
    r.els['at-reset'].click();
    r.ms.clickName('at-role', '*');
    ok('the For picker offers "anyone" for the broadcasts', count(r.html(), /class="a2a-card/g) === 1 && /t-mu9q2/.test(r.html()));
    r.els['at-reset'].click();
    r.els['at-search'].value = 'basit';
    r.els['at-search'].fire('input');
    ok('the query box reaches the claimant and the target role', count(r.html(), /class="a2a-card/g) === 2);
    r.els['at-reset'].click();
    ok('↺ clears the query and the pickers', count(r.html(), /class="a2a-card/g) === 8 && r.state().query === '');

    const e = tasks({ tasks: [], notesById: {} });
    ok('an empty board says how work gets here', /No tasks match/.test(e.html()) && /one posts a task, another takes it/.test(e.html())
        // A-28 — in words the user reads, never the op an agent calls.
        && !/a2a\.tasks\./.test(e.html()));
    const o = tasks({ tasks: [tasksFx.data().tasks[0]], notesById: {}, focusId: 't-mu9q0' });
    const oh = o.html();
    ok('one queued task: open lane only, no closed lane, no lease bar, Cancel offered',
        /Open · 1</.test(oh) && !/Closed ·/.test(oh) && !/role="progressbar"/.test(oh) && /data-act="cancel" data-id="t-mu9q0"/.test(oh));
    ok('…with its ceilings and expected output', /\$4 · 40 turns/.test(oh) && /<div class="a2a-sech">Expected output<\/div>/.test(oh));
}

// ---------- N-7: the supervisor cockpit, on a note ----------
{
    const r = notes();
    const h = r.html();
    ok('a directed card wears a 👤 badge coloured by the KIND of word it is, not a generic flag',
        /class="a2a-dflag a2a-df-constraint">👤 constraint</.test(h) && !/⚠️ directive/.test(h));
    ok('…and its hover carries the directive itself, so the list is readable without opening anything',
        /docs\/CONVENTIONS\.md dışına taşınmayacak/.test(h));
    // The + is the opposite of the badge: on every row, costing nothing until
    // the pointer is on the card. A static DOM cannot be hovered, so the rule
    // that keeps it out of the way is read off the stylesheet it ships in.
    ok('every card carries a +', count(h, /class="a2a-plus" data-plus=/g) === 4);
    ok('…and it takes no space until the card is under the pointer or it has focus',
        /\.a2a-plus \{[^}]*opacity:0;/.test(h) && /\.a2a-card:hover \.a2a-plus, \.a2a-plus:focus, \.a2a-plus\.on \{ opacity:1; \}/.test(h));

    r.query('[data-plus]').find(e => e.dataset.plus === 'n-mu9p1').click();
    const c = r.html();
    ok('pressing + opens ONE cockpit, and it is on that card', count(c, /class="a2a-cockpit"/g) === 1
        && /data-id="n-mu9p1">[^]*?class="a2a-cockpit"/.test(c));
    ok('…drawn by the page\'s own form component, not a second hand-rolled card',
        /data-afcard="1"/.test(c) && /data-af="kind" data-aft="s"/.test(c) && /data-af="text" data-aft="s"/.test(c));
    ok('…offering the three kinds of word, each saying what it DOES, steer chosen on an undirected card',
        /<option value="steer" selected[^>]*>steer — do it this way</.test(c)
        && /<option value="veto"[^>]*>veto — not this, do something else</.test(c)
        && /<option value="constraint"[^>]*>constraint — stay within these limits</.test(c));
    ok('…with no Remove on it, because there is nothing yet to take off', !/data-afact="dremove"/.test(c));
    ok('…and a NOTE gets no re-route and no Run Now — nothing is assigned on a passive board',
        !/data-afact="reroute"/.test(c) && !/data-afact="runnow"/.test(c));
    ok('…and the + on that row is now the way back out', /class="a2a-plus on" data-plus="n-mu9p1"/.test(c));

    // An empty directive is refused IN the card, and nothing is written.
    // (‼️ the shim's selector is not scoped the way a browser's is, so the
    // header's own [data-afact] wiring answers this press too — what is
    // measured is that NO DIRECTIVE went out, not that nothing at all did.)
    r.query('[data-afact="submit"]')[0].click();
    ok('submitting with no words is refused in the card, and no directive is set',
        /outranks every rule it has/.test(r.html()) && !r.posted.some(m => m.type === 'directiveSet')
        && count(r.html(), /class="a2a-cockpit"/g) === 1);

    const ta = r.query('textarea')[0];
    ta.value = 'Bu notu okuyan ajan önce src/core/a2aStore.ts kilidini doğrulasın.';
    r.query('[data-afact="submit"]')[0].click();
    ok('a directive typed and submitted posts directiveSet with the kind and the words',
        r.posted.some(m => m.type === 'directiveSet' && m.id === 'n-mu9p1' && m.kind === 'steer'
            && /a2aStore\.ts kilidini/.test(m.text)));
    ok('…and the cockpit closes behind it', !/class="a2a-cockpit"/.test(r.els.app.innerHTML));

    // On a card that already carries one, the cockpit is an EDITOR.
    const d = notes({ focusId: 'n-mu9p3' });
    d.query('[data-plus]').find(e => e.dataset.plus === 'n-mu9p3').click();
    const dh = d.html();
    ok('a directed card opens its cockpit pre-filled with the word already on it',
        /<option value="constraint" selected/.test(dh) && /docs\/CONVENTIONS\.md dışına taşınmayacak/.test(dh)
        && /data-afact="submit">Update directive</.test(dh));
    ok('…and offers Remove beside it', /data-afact="dremove"/.test(dh));
    ok('…and says how long the word has been standing, which is half of how it is read',
        /<span>Standing since<\/span><span class="affstat">20 Eyl 2026, 20:50 \(13:50 UTC\)<\/span>/.test(dh));
    d.query('[data-afact="dremove"]')[0].click();
    ok('✕ Remove directive posts directiveRemove for that card',
        d.posted.some(m => m.type === 'directiveRemove' && m.id === 'n-mu9p3'));
}

// ---------- N-7: the cockpit on a task — re-route and Run Now ----------
{
    const r = tasks();
    r.query('[data-plus]').find(e => e.dataset.plus === 't-mu9q3').click();
    const h = r.html();
    ok('a task\'s cockpit carries the re-route section and Run Now as well as the word',
        /data-afact="reroute"/.test(h) && /data-afact="runnow"/.test(h) && /data-af="targetRole"/.test(h));
    ok('…the To picker is the real fleet, plus "anyone" for putting it back on the open board',
        /<option value="\*"[^>]*>✱ anyone</.test(h) && /<option value="developer" selected[^>]*>→ developer</.test(h)
        && /<option value="manager"[^>]*>→ manager</.test(h) && /<option value="psikolog"[^>]*>→ psikolog</.test(h));
    ok('…the Project picker is seeded with the project the task is ALREADY filed under',
        /<option value="prj_talk" selected[^>]*>🎙 PRS\.MuratVural_DEV_TalkScribe\.ZEN</.test(h));
    ok('…and the workdir it is already about', /data-af="workdir" data-aft="s" value="ZEP"/.test(h));

    // Re-routing to the same place would close a task and open its twin.
    r.query('[data-afact="reroute"]')[0].click();
    ok('re-routing to where it already is is refused in the card, and moves nothing',
        /Re-routing to the same place/.test(r.html()) && !r.posted.some(m => m.type === 'reroute'));

    const sel = r.query('select').find(e => e.dataset.af === 'targetRole');
    sel.value = 'basit';
    r.query('[data-afact="reroute"]')[0].click();
    ok('a real re-route posts it with the role and the coordinates it keeps',
        r.posted.some(m => m.type === 'reroute' && m.id === 't-mu9q3' && m.targetRole === 'basit'
            && m.project === 'prj_talk' && m.workdir === 'ZEP'));

    const q = tasks();
    q.query('[data-plus]').find(e => e.dataset.plus === 't-mu9q0').click();
    q.query('[data-afact="runnow"]')[0].click();
    ok('⚡ Run Now posts runNow for that task', q.posted.some(m => m.type === 'runNow' && m.id === 't-mu9q0'));

    // A closed task can still be marked, but there is nothing left to move.
    const c = tasks();
    c.query('[data-plus]').find(e => e.dataset.plus === 't-mu9q4').click();
    const ch = c.html();
    ok('a CLOSED task gets the word and nothing else — no re-route, no Run Now',
        /class="a2a-cockpit"/.test(ch) && /data-af="text"/.test(ch)
        && !/data-afact="reroute"/.test(ch) && !/data-afact="runnow"/.test(ch));
    ok('…and the cockpit says why', /nothing left to move or to start/.test(ch));

    // A task filed under a project this window has not opened keeps its own
    // coordinate in the picker; dropping it would move the work silently.
    const u = tasks({ tasks: [tasksFx.data().tasks[0]], notesById: {}, projects: [] });
    u.query('[data-plus]')[0].click();
    ok('a project the window does not have open is still in the picker, and still chosen',
        /<option value="prj_9ujsbtzr" selected[^>]*>prj_9ujsbtzr</.test(u.html()));
}

// ---------- the shell and the shared component ----------
{
    const fs = require('fs');
    const base = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'panels', 'base.ts'), 'utf8');
    ok('the shell ships afA2A.js to every page', /'media', 'afA2A\.js'/.test(base) && /src="\$\{a2a\}"/.test(base));
    ok('the counts the shell seeds carry the A2A pair', /a2a: currentA2A\(\)/.test(base));
    ok('afnav knows both doors', /a2anotes: 'agentfarm\.openA2ANotes'/.test(base) && /a2atasks: 'agentfarm\.openA2ATasks'/.test(base));
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
    const cmds = pkg.contributes.commands.map(c => c.command);
    ok('both commands are contributed', cmds.includes('agentfarm.openA2ANotes') && cmds.includes('agentfarm.openA2ATasks'));
    const ext = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('a bridge write repaints both pages and their counts', /onChange: \(\) => \{ A2ANotesPanel\.refreshIfOpen\(\); A2ATasksPanel\.refreshIfOpen\(\); pushHeaderCounts\(\); \}/.test(ext));
    ok('the A2A counts never reach the status-bar bell', !/a2aNotes[^\n]*noticesBar|noticesBar[^\n]*a2a/.test(ext));
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exit(1); }
