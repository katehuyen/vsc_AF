// DOM-stub test for the project page's TABS (media/projects.js).
//
// Source-shape checks live in test_projects_page.js. These run the page: the
// things asserted here are the ones a regex cannot see and a reader would only
// find by clicking.
//
//   * a feed row must open the event it is ON — the row carries its index in
//     the UNFILTERED list, so a chip being off cannot make a click open the
//     wrong session;
//   * the page must tell the host which project and tab it is showing, ONCE —
//     the host builds only the open tab's data, and a page that keeps asking
//     would ping-pong a refresh forever;
//   * the timeline must NAME what it cannot show rather than silently omitting
//     the chip, which reads as a bug;
//   * the model breakdown must print what it cannot claim.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.resolve(__dirname, '../media/projects.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------------------------------------------------------------------------
// the smallest DOM that lets the page run
// ---------------------------------------------------------------------------
function makeEl() {
    const el = { value: '', checked: false, dataset: {}, _handlers: {} };
    el.addEventListener = (ev, fn) => { el._handlers[ev] = fn; };
    el.click = () => el._handlers.click && el._handlers.click();
    el.querySelectorAll = () => [];
    el.focus = () => { };
    el.setSelectionRange = () => { };
    return el;
}

function run(data) {
    const posted = [];
    let html = '';
    const app = makeEl();
    Object.defineProperty(app, 'innerHTML', { get: () => html, set: v => { html = v; } });

    // Elements are minted from the rendered HTML by attribute, the same way
    // the real querySelectorAll would find them.
    const found = {};
    const byAttr = (attr) => {
        const re = new RegExp(`data-${attr}="([^"]*)"`, 'g');
        const out = [];
        let m;
        while ((m = re.exec(html))) {
            const el = makeEl();
            el.dataset[attr] = m[1];
            out.push(el);
        }
        found[attr] = out;
        return out;
    };

    const messageHandlers = [];
    const sandbox = {
        acquireVsCodeApi: () => ({
            postMessage: m => posted.push(m),
            getState: () => ({}),
            setState: () => { }
        }),
        window: {
            __DATA__: data,
            addEventListener: (ev, fn) => { if (ev === 'message') { messageHandlers.push(fn); } },
            AFCharts: {
                esc: s => String(s === undefined || s === null ? '' : s).replace(/</g, '&lt;').replace(/"/g, '&quot;'),
                fmtUSD: v => '$' + Number(v || 0).toFixed(2),
                fmtTok: v => String(v),
                stackedBars: () => '<svg id="bars"></svg>',
                hbars: () => '<svg id="hbars"></svg>',
                donut: () => '', sparkline: () => '', PALETTE: ['#000']
            },
            AFHeader: { html: () => '<header></header>', wire: () => { } },
            AFSessionsTable: {
                create: () => ({
                    setRows: (rows, n) => { sandbox.__tableRows = { rows: rows, n: n }; },
                    onMessage: () => false,
                    setProjectFilter: () => { }
                })
            }
        },
        document: {
            getElementById: id => (id === 'app' ? app : makeEl()),
            querySelectorAll: sel => {
                const m = /^\[data-([a-zA-Z]+)\]$/.exec(sel);
                return m ? byAttr(m[1]) : [];
            }
        },
        console
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return {
        posted,
        html: () => html,
        els: attr => found[attr] || [],
        send: msg => { for (const h of messageHandlers) { h({ data: msg }); } },
        tableRows: () => sandbox.__tableRows
    };
}

const T = Date.now();
const project = {
    id: 'p1', name: 'Agent Farm', status: 'active', kind: 'product', summary: 'the command centre',
    folder: 'D:\\v\\p', folderState: 'ok', repos: ['D:\\c\\app'], parentId: null,
    tags: [], people: [], agentRules: [], budgetUSD: 5, budgetTotalUSD: 100,
    sessions: 3, cost: 12.5, todayCost: 2, tokens: 900, lastTs: T, warnings: []
};
const baseData = () => ({
    generatedAt: T, projects: [project], agents: ['developer'], activeId: 'p1',
    activeName: 'Agent Farm', projectsRoot: 'D:\\v', unassigned: { sessions: 0, cost: 0 },
    unfiledKinds: ['notice', 'queue', 'decision', 'deliverable', 'plan'],
    focusId: null, newForm: null, tab: 'overview', tabProject: 'p1', tabData: {}
});

// ---------- the tab bar ----------
{
    const r = run({ ...baseData(), tabData: { activity: { running: [], next: [] }, recent: [], cost: { total: 0, today: 0, burn: {} } } });
    for (const t of ['overview', 'timeline', 'sessions', 'cost', 'settings']) {
        ok(`the ${t} tab is on the bar`, r.html().includes(`data-tab="${t}"`));
    }
    ok('overview opens first — "what is it doing now" before "what did it do"',
        /class="pj-tab on" data-tab="overview"/.test(r.html()));
    ok('the identity strip is above the tabs, so no tab can lose it',
        r.html().indexOf('<h2>') < r.html().indexOf('class="pj-tabs"'));
    ok('…and it carries the summary and the totals',
        r.html().includes('the command centre') && r.html().includes('$12.50'));

    // switching tabs tells the host, because the host builds only that tab
    const before = r.posted.length;
    r.els('tab').find(e => e.dataset.tab === 'cost').click();
    const view = r.posted.slice(before).filter(m => m.type === 'view').pop();
    ok('‼️ picking a tab tells the host which one to build', view && view.tab === 'cost' && view.project === 'p1');
}

// ---------- it must not ask forever ----------
{
    const r = run({ ...baseData(), tabData: { activity: { running: [], next: [] }, recent: [], cost: {} } });
    ok('‼️ a page already showing what the host thinks it shows asks for nothing',
        !r.posted.some(m => m.type === 'view'));

    const stale = { ...baseData(), tabProject: 'somebody-else', tabData: {} };
    const r2 = run(stale);
    ok('…but a page showing something else says so exactly once',
        r2.posted.filter(m => m.type === 'view').length === 1);
}

// ---------- the timeline ----------
const feedData = () => ({
    ...baseData(), tab: 'timeline',
    tabData: {
        feed: {
            counts: { session: 2, turn: 3, commit: 1 },
            truncated: false,
            kinds: ['session', 'turn', 'commit'],
            events: [
                { ts: T, kind: 'turn', title: 'a turn', link: { to: 'session', sessionId: 'sid-A', file: 'A' } },
                { ts: T - 10, kind: 'session', title: 'THE SESSION', cost: 3, agent: 'developer', tone: 'ok', link: { to: 'session', sessionId: 'sid-B', file: 'B' } },
                { ts: T - 20, kind: 'commit', title: 'a commit', link: { to: 'commit', repo: 'r', hash: 'deadbeef' } },
                { ts: T - 30, kind: 'session', title: 'older', link: { to: 'session', sessionId: 'sid-C', file: 'C' } }
            ]
        }
    }
});
{
    const r = run(feedData());
    // turns start off: the noisiest source must not be what the timeline IS
    ok('turns start switched off, and the chip says so',
        /data-kind="turn"/.test(r.html()) && !/class="pj-chip on" data-kind="turn"/.test(r.html()));
    ok('…but its count is still shown, so you know what turning it on adds',
        /data-kind="turn"[^>]*>[\s\S]{0,80}>3</.test(r.html()));
    ok('the rows that ARE shown exclude it', !r.html().includes('a turn'));
    ok('…and include the rest', r.html().includes('THE SESSION') && r.html().includes('a commit'));

    // ‼️ the bug this test exists for
    const rows = r.els('ev');
    ok('every visible row is clickable', rows.length === 3);
    rows[0].click();
    const opened = r.posted.filter(m => m.type === 'openLink').pop();
    ok('‼️ clicking the FIRST visible row opens THAT row, not the one at index 0 of the unfiltered feed',
        opened && opened.link.sessionId === 'sid-B');
    rows[1].click();
    ok('‼️ …and the second opens the commit it is on',
        r.posted.filter(m => m.type === 'openLink').pop().link.hash === 'deadbeef');

    // the chips
    r.els('kind').find(e => e.dataset.kind === '__none').click();
    ok('None switches everything off and says so rather than going blank',
        r.html().includes('Every kind is switched off'));
    r.els('kind').find(e => e.dataset.kind === '__all').click();
    ok('All brings everything back, turns included', r.html().includes('a turn'));
}

// ---------- ‼️ the kind filter is the HOST's, not a client-side afterthought ----------
// Measured on a real project: 3000 of 3690 events are turns. A feed capped at
// 300 rows and filtered afterwards is 81% rows the reader switched off — the
// timeline showed ~50 sessions and called the rest "older". So the page asks
// for what it wants and the host cuts after filtering.
{
    const fresh = { ...baseData(), tab: 'timeline', feedKinds: [], tabData: {} };
    const r = run(fresh);
    const ask = r.posted.filter(m => m.type === 'view').pop();
    ok('‼️ the opening request already excludes turns, before any feed has arrived',
        ask && ask.kinds.length > 0 && ask.kinds.indexOf('turn') < 0);
    ok('…and asks for the rest', ask.kinds.indexOf('session') >= 0 && ask.kinds.indexOf('commit') >= 0);

    // the host echoes what it built; an agreeing page must go quiet
    const settled = feedData();
    settled.feedKinds = ['session', 'commit'];
    const r2 = run(settled);
    ok('‼️ a page whose request the host already answered asks for nothing more',
        !r2.posted.some(m => m.type === 'view'));

    // …and turning a chip on is a new request, not a client-side re-slice
    r2.els('kind').find(e => e.dataset.kind === 'turn').click();
    const again = r2.posted.filter(m => m.type === 'view').pop();
    ok('turning a kind on asks the host to rebuild with it',
        again && again.kinds.indexOf('turn') >= 0);
}

// ---------- it names what it cannot show ----------
{
    const r = run(feedData());
    const h = r.html();
    ok('‼️ the timeline names the sources it cannot file yet',
        /Not here yet:/.test(h) && /Notices/.test(h) && /Queue/.test(h)
        && /Decisions/.test(h) && /Deliverables/.test(h));
    ok('…and says WHY, so it reads as a limit rather than a missing feature',
        /carry no project of their own/.test(h));

    const empty = { ...feedData() };
    empty.tabData = { feed: { counts: {}, events: [], truncated: false, kinds: [] } };
    const r2 = run(empty);
    ok('an empty project says nothing has happened, and still names the gap',
        /Nothing has happened on this project yet/.test(r2.html()) && /Not here yet:/.test(r2.html()));
}

// ---------- cost ----------
{
    const r = run({
        ...baseData(), tab: 'cost',
        tabData: {
            cost: {
                total: 10, today: 2,
                days: [{ day: '2026-08-01', cost: 8 }, { day: '2026-08-02', cost: 2 }],
                byAgent: [{ agent: 'developer', cost: 10, sessions: 3 }],
                byModel: [{ model: 'opus', cost: 6, turns: 4 }],
                mixedTurnCost: 3, unattributed: 1,
                burn: { perDay7: 1.5, perDay30: 0.4, projectedAtDue: 25, daysToBudget: 60, budgetUsedPct: 10, todayPct: 40 }
            }
        }
    });
    const h = r.html();
    ok('cost shows the totals and both burn rates',
        h.includes('$10.00') && h.includes('$1.50') && h.includes('$0.40'));
    ok('…the budget lines are spelled out', /40% of it/.test(h) && /10% used/.test(h));
    ok('…and the day chart is drawn', h.includes('id="bars"'));
    ok('‼️ the model breakdown prints what it cannot claim',
        /cannot be split/.test(h) && /\$3\.00/.test(h) && /no per-turn detail/.test(h));

    const clean = { ...baseData(), tab: 'cost' };
    clean.tabData = { cost: { total: 4, today: 0, days: [{ day: '2026-08-02', cost: 4 }], byAgent: [], byModel: [{ model: 'opus', cost: 4, turns: 2 }], mixedTurnCost: 0, unattributed: 0, burn: {} } };
    const r2 = run(clean);
    ok('…and stays quiet when there is nothing to caveat',
        !/cannot be split/.test(r2.html()) && !/no per-turn detail/.test(r2.html()));
}

// ---------- overview ----------
{
    const r = run({
        ...baseData(),
        tabData: {
            activity: {
                running: [{ what: 'session', title: 'live one', agent: 'developer', since: T - 60000, id: 's', file: 'f' }],
                next: [{ title: 'queued one', agent: 'basit', status: 'queued', held: 'quiet hours', createdAt: T - 120000, id: 't' }]
            },
            recent: [{ ts: T, kind: 'session', title: 'recent one', link: { to: 'session', sessionId: 'sid-Z', file: 'Z' } }],
            counts: { session: 1 },
            cost: { total: 12.5, today: 2, burn: { perDay7: 1, todayPct: 40 } }
        }
    });
    const h = r.html();
    ok('overview shows what is running', h.includes('live one'));
    ok('…what is queued, and why it is being held', h.includes('queued one') && h.includes('quiet hours'));
    ok('…the money headline', h.includes('$12.50') && h.includes('40% of budget'));
    ok('…and the newest events', h.includes('recent one'));
    r.els('ev')[0].click();
    ok('an overview row opens the same way a timeline row does',
        r.posted.filter(m => m.type === 'openLink').pop().link.sessionId === 'sid-Z');
}

// ---------- sessions tab reuses the shared table ----------
{
    const rows = [{ file: 'A', title: 'one', ts: T, cost: 1 }];
    const r = run({ ...baseData(), tab: 'sessions', tabData: { rows: rows, tableN: 25 } });
    ok('the sessions tab hands its rows to the SHARED table, not a copy of one',
        r.html().includes('id="pj-sessions"') && r.tableRows() && r.tableRows().rows.length === 1);
    ok('…and passes the host-chosen row count through', r.tableRows().n === 25);
}

// ---------- a tab whose data has not landed yet ----------
{
    const r = run({ ...baseData(), tab: 'timeline', tabData: {} });
    ok('a tab waiting for its payload says so instead of drawing an empty page',
        /Reading the project…/.test(r.html()));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
