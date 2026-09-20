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
    ok('a directed note is flagged on the line', /⚠️ directive<\/span>/.test(h));
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
    ok('an empty board says how notes get here', /No notes match/.test(e.html()) && /a2a\.notes\.post/.test(e.html()));
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
    ok('an empty board says how work gets here', /No tasks match/.test(e.html()) && /a2a\.tasks\.next/.test(e.html()));
    const o = tasks({ tasks: [tasksFx.data().tasks[0]], notesById: {}, focusId: 't-mu9q0' });
    const oh = o.html();
    ok('one queued task: open lane only, no closed lane, no lease bar, Cancel offered',
        /Open · 1</.test(oh) && !/Closed ·/.test(oh) && !/role="progressbar"/.test(oh) && /data-act="cancel" data-id="t-mu9q0"/.test(oh));
    ok('…with its ceilings and expected output', /\$4 · 40 turns/.test(oh) && /<div class="a2a-sech">Expected output<\/div>/.test(oh));
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
