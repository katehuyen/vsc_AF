// DOM-stub test for the WORK tab of media/projects.js — the real page code,
// driven through the shared page shim.
//
// The tab's job is a join five stores can make and no single page could: what
// this project has in flight, across tasks, missions, notices, the work queue
// and the automations that fire for it. What is asserted here is everything a
// regex over the source cannot see —
//
//   * ‼️ a group with nothing in it is NOT DRAWN. Five cards each saying
//     "nothing here" is five paragraphs above the one group that has something,
//     and it is what an empty project would have shown on its first day;
//   * ‼️ …but a tab with nothing AT ALL says why, and what to do about it. An
//     empty page and a paragraph about stamping reads as a failed load;
//   * a row's whole surface opens the thing it is about, and the row states
//     WHICH store it came from — one handler cannot route six kinds otherwise;
//   * an action button stops the click before the row's own handler sees it,
//     or cancelling a task would also open it;
//   * ‼️ a queued task carries the gate's own reason for not moving. A row that
//     says "queued" and nothing else sends the reader to another page to learn
//     the fleet is simply busy;
//   * ‼️ a mission says HOW it got here. One started in this project and one
//     whose delegations merely landed here are different facts, and the row is
//     the only place that can tell them apart;
//   * ‼️ an age is never negative. A timestamp a few seconds ahead of this
//     clock is normal, and "-27304s ago" is the page calling itself broken;
//   * starting a session is one message with the surface on it, not two
//     commands that could drift apart.
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const fixture = require(path.join(__dirname, 'fixtures', 'work.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const run = (over) => runPage('projects.js', fixture.data(over));
const els = (r, attr) => r.query(`[data-${attr}]`);
const el = (r, attr, value) => els(r, attr)
    .find(e => e.dataset[attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] === value);
/** The last message the page posted — what the host would actually receive. */
const last = (r) => r.posted[r.posted.length - 1];
/** Is this group's CARD on the page?
 *
 *  ‼️ The heading's markup, not the words. The toolbar's buttons name the cards
 *  in their own hovers ("…it appears under 'Fires by itself'"), so a plain
 *  substring finds the card that is deliberately absent and the assertion
 *  passes for the wrong reason — which is how a test starts guarding nothing. */
const card = (h, title) => h.includes(`class="pj-card-h">${title} `);
/** How many rows carry a mark. `class="…"` and not the bare name, or the page's
 *  own stylesheet counts as one of them. */
const marks = (h, cls) => (h.match(new RegExp(`class="${cls}"`, 'g')) || []).length;

// ---------------------------------------------------------------------------
// it draws, and it draws the join
// ---------------------------------------------------------------------------
{
    const r = run();
    const h = r.html();
    ok('the tab is on the bar and it is the open one',
        /class="pj-tab tb-work on" data-tab="work"/.test(h));
    ok('every group with something in it is drawn',
        ['RUNNING NOW', 'NEEDS YOU', 'QUEUED', 'ON THE BOOKS', 'FIRES BY ITSELF', 'SETTLED']
            .every(t => h.toUpperCase().includes(t)));
    ok('all five stores reach the page', ['task', 'mission', 'notice', 'queue', 'schedule', 'trigger']
        .every(k => h.includes(`data-work-open="${k}"`)));

    // A running mission belongs with the running tasks: "what is happening now"
    // is one question, and splitting it per store makes the reader ask it twice.
    const runningCard = h.slice(h.indexOf('Running now'), h.indexOf('Needs you'));
    ok('‼️ a running mission sits with the running tasks — "what is happening now" is ONE question',
        runningCard.includes('data-work-open="mission"'));
    ok('…and an open question sits with the unread warnings and the blocked item',
        h.slice(h.indexOf('Needs you'), h.indexOf('Queued'))
            .includes('data-work-open="queue"'));
}

// ---------------------------------------------------------------------------
// empty groups, and the empty tab
// ---------------------------------------------------------------------------
{
    const w = fixture.work();
    const r = run({
        tabData: { work: Object.assign({}, w, { schedules: [], triggers: [] }) }
    });
    ok('‼️ a group with nothing in it is not drawn at all',
        !card(r.html(), 'Fires by itself'));
    ok('…and the groups that still have something are untouched',
        card(r.html(), 'Running now') && card(r.html(), 'Settled'));
}
{
    const r = run({
        tabData: {
            work: {
                tasks: [], missions: [], notices: [], queue: [],
                schedules: [], triggers: [], agents: ['developer']
            }
        }
    });
    const h = r.html();
    ok('‼️ a tab with nothing at all says WHY and what to do — an empty page reads as a failed load',
        h.includes('Nothing has been filed under this project yet'));
    ok('…and the way to start is still on screen', h.includes('data-work="session-console"'));
    ok('no group headings are invented for empty stores',
        !card(h, 'Running now') && !card(h, 'Settled'));
}
{
    // The host builds only the OPEN tab's data, so a payload can arrive for the
    // tab the reader just left. That must read as "reading…", never as empty.
    const r = run({ tabData: {} });
    ok('a payload for another tab says it is reading, not that there is nothing',
        r.html().includes('Reading the project…'));
}

// ---------------------------------------------------------------------------
// what a row says, beyond its title
// ---------------------------------------------------------------------------
{
    const h = run().html();
    ok('‼️ a queued task carries the gate\'s own reason for not moving',
        h.includes('held: concurrency: 2 running') && h.includes('held: agent busy (developer)'));
    ok('a running task carries no hold — there is nothing holding it',
        marks(h, 'pj-held') === 2);
    ok('‼️ a mission whose delegations merely landed here says so',
        h.includes('via its tasks'));
    ok('…and one started IN the project does not', marks(h, 'pj-via') === 1);
    ok('an unread notice is marked as unread', h.includes('pj-udot'));
    ok('a tone is carried by the row, not by the glyph',
        /class="pj-wrow tone-warn"/.test(h) && /class="pj-wrow tone-ok"/.test(h)
        && /class="pj-wrow tone-bad"/.test(h));

    // ‼️ The clock. The fixture's stamps sit a few seconds AHEAD of the test's
    // own clock, which is exactly the real case (another machine's transcript,
    // a session stamped mid-second) — and the page must not print a negative.
    ok('‼️ no age is ever negative', !/-\d+s ago/.test(h));
}

// ---------------------------------------------------------------------------
// pressing things
// ---------------------------------------------------------------------------
{
    const r = run();
    el(r, 'work', 'session-console').click();
    ok('‼️ starting a session is ONE message carrying the surface — two commands would drift',
        last(r).type === 'startSession' && last(r).how === 'console' && last(r).id === 'p1');
    el(r, 'work', 'session-terminal').click();
    ok('…and the terminal is the same message with the other surface',
        last(r).type === 'startSession' && last(r).how === 'terminal');
    el(r, 'work', 'task').click();
    ok('New task opens the form for THIS project', last(r).type === 'newTask' && last(r).id === 'p1');
    el(r, 'work', 'schedule').click();
    ok('New schedule too', last(r).type === 'newSchedule' && last(r).id === 'p1');
    el(r, 'work', 'trigger').click();
    ok('New trigger too', last(r).type === 'newTrigger' && last(r).id === 'p1');
}
{
    const r = run();
    const rows = els(r, 'work-open');
    const notice = rows.find(e => e.dataset.workOpen === 'notice');
    notice.click();
    ok('‼️ the whole row opens the thing — a 4px target in a row the pointer is already on is one to aim for',
        last(r).type === 'openWorkRow' && last(r).what === 'notice' && !!last(r).rowId);

    const before = r.posted.length;
    const cancel = els(r, 'task-act').find(e => e.dataset.taskAct === 'cancel');
    cancel.click();
    ok('a task action is its own message', last(r).type === 'taskAction' && last(r).action === 'cancel');
    ok('‼️ …and it stops the click, or cancelling would also OPEN the task',
        r.posted.length === before + 1);

    const retry = els(r, 'task-act').find(e => e.dataset.taskAct === 'retry');
    retry.click();
    ok('a finished task offers retry instead of cancel',
        last(r).type === 'taskAction' && last(r).action === 'retry');
    ok('‼️ a running task is never offered a retry — it has not finished running once',
        !els(r, 'task-act').some(e =>
            e.dataset.taskAct === 'retry' && e.dataset.task === fixture.work().tasks[0].id));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
