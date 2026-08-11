// The second fold — core/projectAnalysis.ts and core/projectReport.ts.
//
// What is asserted is the three rules an analysis page breaks when nobody is
// looking, plus the two the Code side exists for:
//
//   * ‼️ a figure with no denominator worth dividing by is NOT PRINTED — every
//     block comes back undefined below its minimum, so the page can say "not
//     enough yet" instead of drawing a shape read off six points;
//   * ‼️ a trend is stated against a control — "$4.10 a session" is nothing
//     without the project's own average beside it;
//   * ‼️ LOCAL days and Monday weeks — a session at 23:40 belongs to that
//     evening, and `toISOString` moves it to tomorrow east of UTC;
//   * ‼️ a quiet week is a ZERO ROW, not a gap: a series with holes draws a lie;
//   * ‼️ commits and session writes are never summed — two sources, two
//     questions, and a total over both is a third number that means nothing.
const path = require('path');
const A = require(path.join(__dirname, '..', 'out', 'core', 'projectAnalysis.js'));
const R = require(path.join(__dirname, '..', 'out', 'core', 'projectReport.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const DAY = 86400000;
/** A fixed LOCAL moment — built from parts, never parsed from a Z string, or
 *  the test would assert about a different day than the code buckets into. */
const T = new Date(2026, 7, 11, 14, 0, 0).getTime();   // Tue 11 Aug 2026, 14:00 local

const sess = (over) => Object.assign({
    sessionId: 's' + Math.random().toString(36).slice(2, 7),
    agentName: 'developer', firstTs: T, lastTs: T, cost: 1, turns: 5, filesEdited: {}
}, over || {});

// ---------------------------------------------------------------------------
// local days and Monday weeks
// ---------------------------------------------------------------------------
{
    const lateTuesday = new Date(2026, 7, 11, 23, 40).getTime();
    ok('‼️ a session at 23:40 belongs to THAT day, not to tomorrow',
        A.localDay(lateTuesday) === '2026-08-11');
    ok('a Tuesday belongs to its Monday', A.localWeek(lateTuesday) === '2026-08-10');
    ok('‼️ a SUNDAY belongs to the week that is ending, not the one starting — a Sunday-based '
        + 'week splits every weekend',
        A.localWeek(new Date(2026, 7, 16, 12, 0).getTime()) === '2026-08-10');
    ok('a Monday is its own week', A.localWeek(new Date(2026, 7, 10, 1, 0).getTime()) === '2026-08-10');
}

// ---------------------------------------------------------------------------
// the weekly series
// ---------------------------------------------------------------------------
{
    const a = A.buildProjectAnalysis({
        now: T,
        sessions: [
            sess({ firstTs: T }),
            sess({ firstTs: T - 2 * DAY }),
            // …then a gap of two whole weeks…
            sess({ firstTs: T - 21 * DAY, cost: 3, turns: 9 })
        ],
        commits: [{ ts: T - DAY, repo: 'r' }, { ts: T - 21 * DAY, repo: 'r' }]
    });
    ok('‼️ a quiet week is a ZERO row, not a gap — a series with holes in it draws a lie',
        a.weeks.length === 4 && a.weeks.every(w => typeof w.sessions === 'number'));
    ok('the weeks are oldest first — a series is read left to right',
        a.weeks[0].week < a.weeks[a.weeks.length - 1].week);
    ok('the middle weeks really are empty',
        a.weeks[1].sessions === 0 && a.weeks[1].commits === 0);
    // ‼️ T − 2 days is SUNDAY 9 Aug, which belongs to the week starting Monday
    // 3 Aug — the exact case a Sunday-based week would put in the wrong bucket,
    // and the reason this assertion names the date rather than counting two.
    ok('the newest week carries only what really falls in it', a.weeks[3].sessions === 1);
    ok('…and the Sunday two days back lands in the PREVIOUS week', a.weeks[2].sessions === 1);
    ok('commits land in their own week', a.weeks[0].commits === 1 && a.weeks[3].commits === 1);
    ok('the totals are over everything', a.totals.sessions === 3 && a.totals.turns === 19);
}

// ---------------------------------------------------------------------------
// rule 1 — minimums
// ---------------------------------------------------------------------------
{
    const thin = A.buildProjectAnalysis({ now: T, sessions: [sess({ turns: 3 })] });
    ok('‼️ a rhythm is not returned below 40 turns — four dots are not a shape', !thin.rhythm);
    ok('a cycle time is not returned with no closed items', !thin.cycle);

    const many = [];
    for (let i = 0; i < 12; i++) {
        many.push(sess({ firstTs: T - i * DAY, turns: 5 }));
    }
    const fat = A.buildProjectAnalysis({ now: T, sessions: many });
    ok('…and it IS returned once there are enough', !!fat.rhythm && fat.rhythm.total === 60);
    ok('the rhythm names its busiest cell', fat.rhythm.peak.turns > 0);
    ok('out-of-hours is a share of the same total',
        fat.rhythm.outOfHours >= 0 && fat.rhythm.outOfHours <= 1);
}
{
    const items = [];
    for (let i = 0; i < 4; i++) {
        items.push({ state: 'closed', firstTs: T - 10 * DAY, closedTs: T - 5 * DAY });
    }
    ok('‼️ a median over four items is not returned — it would be one of those four',
        !A.buildProjectAnalysis({ now: T, sessions: [], items }).cycle);
    items.push({ state: 'closed', firstTs: T - 20 * DAY, closedTs: T - 2 * DAY });
    const a = A.buildProjectAnalysis({ now: T, sessions: [], items });
    ok('…and five is enough', !!a.cycle && a.cycle.n === 5);
    ok('the median is the middle of them', a.cycle.medianDays === 5);
    ok('the spread is stated too, not just the middle',
        a.cycle.fastestDays === 5 && a.cycle.slowestDays === 18);
}
{
    // An item that never closed has no cycle time, and one whose close is
    // recorded before its start is not counted backwards.
    const a = A.buildProjectAnalysis({
        now: T, sessions: [],
        items: [
            { state: 'open', firstTs: T - 5 * DAY },
            { state: 'closed', firstTs: T, closedTs: T - DAY },
            ...Array.from({ length: 5 }, () => ({ state: 'closed', firstTs: T - 3 * DAY, closedTs: T - DAY }))
        ]
    });
    ok('an unfinished item is not in the cycle time', a.cycle.n === 5);
    ok('and a backwards one is dropped rather than counted as negative', a.cycle.fastestDays === 2);
}

// ---------------------------------------------------------------------------
// rule 2 — a trend against a control
// ---------------------------------------------------------------------------
{
    const sessions = [];
    for (let w = 0; w < 8; w++) {
        // Two a week for the older weeks, five a week for the last four.
        const n = w < 4 ? 5 : 2;
        for (let i = 0; i < n; i++) {
            sessions.push(sess({ firstTs: T - w * 7 * DAY - i * 3600000, cost: 2 }));
        }
    }
    const a = A.buildProjectAnalysis({ now: T, sessions });
    ok('‼️ a recent pace is returned WITH the project\'s own average beside it',
        a.pace && a.pace.recentPerWeek > 0 && a.pace.allPerWeek > 0);
    ok('the recent figure is the busier one here', a.pace.recentPerWeek > a.pace.allPerWeek);
    ok('cost per session is stated both ways too',
        a.pace.recentCostPerSession === 2 && a.pace.allCostPerSession === 2);
    ok('and it says how many weeks the control covers', a.pace.weeksCovered >= 8);
}

// ---------------------------------------------------------------------------
// effort
// ---------------------------------------------------------------------------
{
    const a = A.buildProjectAnalysis({
        now: T,
        sessions: [
            sess({ agentName: 'developer', turns: 30, filesEdited: { 'D:\\r\\a.ts': 6, 'D:\\r\\b.ts': 2 } }),
            sess({ agentName: 'manager', turns: 10, filesEdited: { 'D:\\r\\a.ts': 4 } })
        ]
    });
    ok('the most-written file is first', a.files[0].key === 'D:\\r\\a.ts' && a.files[0].n === 10);
    ok('every row carries its share of the whole', Math.abs(a.files[0].share - 10 / 12) < 0.001);
    ok('agents are counted in TURNS, which is what effort is here',
        a.agents[0].key === 'developer' && a.agents[0].n === 30);
    ok('the totals name what the fold was built from',
        a.totals.files === 2 && a.totals.turns === 40);
}
{
    const empty = A.buildProjectAnalysis({ now: T, sessions: [] });
    ok('an empty project folds to an empty analysis, not a crash',
        empty.weeks.length === 0 && empty.files.length === 0 && !empty.pace);
}

// ---------------------------------------------------------------------------
// the Code side — two sources, never summed
// ---------------------------------------------------------------------------
{
    const c = A.buildProjectCode({
        now: T,
        roots: [
            {
                root: 'D:\\dev\\a', exists: true,
                commits: [
                    { ts: T - DAY, author: 'murat' },
                    { ts: T - 2 * DAY, author: 'murat' },
                    { ts: T - 9 * DAY, author: 'other' }
                ]
            },
            { root: 'D:\\dev\\gone', exists: false, commits: [] }
        ],
        sessions: [sess({ filesEdited: { 'D:\\dev\\a\\x.ts': 3, 'D:\\tmp\\note.md': 1 } })]
    });
    ok('‼️ a root that is not on this machine is MISSING, not a repo with no commits',
        c.roots[1].missing === true);
    ok('a present root is not marked missing', !c.roots[0].missing);
    ok('authors are counted per root', c.roots[0].authors[0].key === 'murat'
        && c.roots[0].authors[0].n === 2);
    // Three commits, three different weeks: Mon 10 Aug, Sun 9 Aug (which is the
    // week of Mon 3 Aug) and Sun 2 Aug (the week of Mon 27 Jul).
    ok('commits are bucketed per week for the sparkline', c.roots[0].perWeek.length === 3);
    ok('…oldest first, so a sparkline reads left to right',
        c.roots[0].perWeek[0].week < c.roots[0].perWeek[2].week);
    ok('the last commit is the newest one', c.roots[0].lastCommitTs === T - DAY);
    ok('‼️ session writes include files OUTSIDE any root — they are what the sessions did, '
        + 'not what git recorded', c.sessionWrites.some(w => w.key === 'D:\\tmp\\note.md'));
    ok('‼️ the two are reported separately and never added',
        c.totals.commits === 3 && c.totals.writes === 4 && c.totals.writtenFiles === 2);
    ok('missing roots are counted so the page can say so', c.totals.missing === 1);
}

// ---------------------------------------------------------------------------
// the report
// ---------------------------------------------------------------------------
{
    const md = R.buildProjectReport({
        now: T, sinceTs: T - 7 * DAY,
        project: {
            name: 'Agent Farm', status: 'active', kind: 'product',
            summary: 'the command centre', folder: 'D:\\v\\p',
            repos: ['D:\\dev\\git\\vsc_AgentFarm'],
            warnings: ['over today\'s budget ($14.10 of $10.00)']
        },
        cost: { total: 128.4, today: 12.2, period: 30.1 },
        sessions: { n: 6, turns: 90, agents: ['developer', 'manager'] },
        work: {
            runningTasks: 1, queuedTasks: 2, doneTasks: 4, failedTasks: 1,
            liveMissions: 1, openNotices: 3, openQuestions: 1, liveQueue: 5, blockedQueue: 2
        },
        closed: [{ code: 'P-4', text: 'proje sistemi fazları tamamlansın' }],
        plan: [{ text: 'Faz 7 — ötesi' }],
        backlog: [{ code: 'S-19', text: 'oturuma resume yaparak prompt vermek' }],
        events: [{ ts: T - 2 * DAY, kind: 'decision', title: 'stamps, never derivations' }],
        worklog: ['- 2026-08-11 — 3.107.0: faz 5 kapandı']
    });
    ok('the report covers a stated period', /covering the last 7 days/.test(md));
    ok('‼️ a warning is a section of its own, at the top', /## ‼️ Needs attention/.test(md)
        && md.indexOf('Needs attention') < md.indexOf('What happened'));
    ok('what is waiting on the user is called that', /\*\*Waiting on you:\*\*/.test(md));
    ok('the user\'s own words are reproduced, code and all',
        md.includes('**P-4** proje sistemi fazları tamamlansın'));
    ok('the worklog lines are verbatim', md.includes('- 2026-08-11 — 3.107.0: faz 5 kapandı'));
    ok('a decision is dated by the day it states', md.includes('`2026-08-09` **decision**'));
    ok('and the whole thing ends by saying what it is built from',
        /Nothing here is inferred/.test(md));
}
{
    // ‼️ The gaps. "No plan document" and "nothing open" are different answers,
    // and a blank heading cannot tell them apart.
    const md = R.buildProjectReport({
        now: T, sinceTs: T - 7 * DAY,
        project: { name: 'Fresh', status: 'active' },
        gaps: { noFolder: true, noPlan: true, noBacklog: true, noRepos: true }
    });
    ok('‼️ no folder is SAID, not left as an empty section', /no folder chosen/.test(md));
    ok('no plan document is said', /No plan document/.test(md));
    ok('no backlog is said, and it is a different sentence from "nothing closed"',
        /no backlog document/i.test(md) && !/No backlog item closed/.test(md));
    ok('no code roots is said', /no roots declared/.test(md));
}
{
    const body = R.buildDigestBody({
        now: T, sinceTs: T - 7 * DAY,
        project: { name: 'Agent Farm', status: 'active', warnings: [] },
        sessions: { n: 4, turns: 60, agents: ['developer'] },
        cost: { total: 100, today: 2, period: 22.5 },
        work: {
            runningTasks: 0, queuedTasks: 0, doneTasks: 3, failedTasks: 0, liveMissions: 0,
            openNotices: 0, openQuestions: 2, liveQueue: 0, blockedQueue: 1
        },
        closed: [{ code: 'P-4', text: 'faz 5' }],
        backlog: [{ code: 'S-19', text: 'resume ile prompt' }]
    });
    ok('‼️ the digest BODY is a genuine summary — a body that says "see the report" is a notification',
        /4 session\(s\)/.test(body) && /\$22\.50/.test(body) && /1 backlog item\(s\) closed/.test(body));
    ok('it names what is waiting on the user', /Waiting on you.*2 unanswered/.test(body));
    ok('it lists what closed and what is next', body.includes('**P-4**') && body.includes('**S-19**'));

    const quiet = R.buildDigestBody({
        now: T, sinceTs: T - 7 * DAY,
        project: { name: 'Idle', status: 'active', warnings: [] },
        sessions: { n: 0, turns: 0, agents: [] },
        work: {
            runningTasks: 0, queuedTasks: 0, doneTasks: 0, failedTasks: 0, liveMissions: 0,
            openNotices: 0, openQuestions: 0, liveQueue: 0, blockedQueue: 0
        }
    });
    ok('a quiet week says so in one line rather than printing empty headings',
        /Quiet week/.test(quiet));
}
{
    ok('the digest file name is English and carries the project and the week',
        R.digestName('Agent Farm', T) === 'Agent Farm weekly digest 2026-08-10');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
