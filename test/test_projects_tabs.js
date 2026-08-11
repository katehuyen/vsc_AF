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
// The capture box asks a SHARED component for its four text tools, and the
// backlog tab asks another for its filter dropdowns; the real ones run here
// rather than stubs, so the page and the components cannot drift.
const shared = fs.readFileSync(path.resolve(__dirname, '../media/afTextTools.js'), 'utf8')
    + '\n' + fs.readFileSync(path.resolve(__dirname, '../media/afFilters.js'), 'utf8')
    // …and the right-click contract, because every row publishes itself through
    // it. A stub here would let the rows and their menus drift apart in silence.
    + '\n' + fs.readFileSync(path.resolve(__dirname, '../media/afCtx.js'), 'utf8')
    + '\n' + fs.readFileSync(path.resolve(__dirname, '../media/afSessionCtx.js'), 'utf8')
    // …and the one clock, which the timeline rows hover with (media/afTime.js)
    + '\n' + fs.readFileSync(path.resolve(__dirname, '../media/afTime.js'), 'utf8');
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
    //
    // ‼️ The whole TAG is read, not just the attribute that matched. A row that
    // carries two of them — `data-plan` next to `data-planid`, `data-open` next
    // to `data-path` — is one element in a browser, and a stub that hands back
    // only the queried attribute makes a handler reading the second one look
    // broken when it is the stub that is.
    const found = {};
    const byAttr = (attr) => {
        const re = new RegExp(`data-${attr}="([^"]*)"`, 'g');
        const out = [];
        let m;
        while ((m = re.exec(html))) {
            const open = html.lastIndexOf('<', m.index);
            const close = html.indexOf('>', m.index);
            const tag = open >= 0 && close > open ? html.slice(open, close) : m[0];
            const el = makeEl();
            let a;
            const attrs = /data-([a-zA-Z0-9]+)="([^"]*)"/g;
            while ((a = attrs.exec(tag))) { el.dataset[a[1]] = a[2]; }
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
            fmtTokW(n, w) { return this.fmtTok(n || 0) + (w > 0 ? ' [w' + this.fmtTok(Math.round(w)) + ']' : ''); },
            fmtTokWText(n, w) { return this.fmtTok(n || 0) + (w > 0 ? ' (w' + this.fmtTok(Math.round(w)) + ')' : ''); },
            WEIGHTED_TIP: 'weighted',
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
            },
            // The people editor updates its own Save button as you type, rather
            // than repainting the caret out from under you.
            querySelector: sel => {
                const m = /^\[data-([a-zA-Z]+)="([^"]+)"\]$/.exec(sel);
                if (!m) { return null; }
                return byAttr(m[1]).find(e => e.dataset[m[1]] === m[2]) || null;
            },
            // The page attaches ONE document listener at module scope — the row
            // menus' dismissal. Nothing in this file exercises it; it just has to
            // exist, or loading the script throws.
            addEventListener: () => { }
        },
        setTimeout: () => 0,
        clearTimeout: () => { },
        console
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(shared, sandbox);
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
    // Faz 4 filed decisions, deliverables and plan items out of this list —
    // they come from the project's own documents now. Notices and queue items
    // still carry no project link.
    unfiledKinds: ['notice', 'queue'],
    docOpen: { mode: 'vscode', modes: ['vscode', 'preview', 'obsidian'], labels: {} },
    docPath: '',
    focusId: null, newForm: null, tab: 'overview', tabProject: 'p1', tabData: {}
});

// ---------- the tab bar ----------
{
    const r = run({ ...baseData(), tabData: { activity: { running: [], next: [] }, recent: [], cost: { total: 0, today: 0, burn: {} } } });
    for (const t of ['overview', 'timeline', 'sessions', 'cost', 'settings']) {
        ok(`the ${t} tab is on the bar`, r.html().includes(`data-tab="${t}"`));
    }
    ok('overview opens first — "what is it doing now" before "what did it do"',
        /class="pj-tab tb-overview on" data-tab="overview"/.test(r.html()));
    ok('U-46: the first tab reads Home while keeping its stable overview id',
        /data-tab="overview"[\s\S]{0,180}>Home<\/button>/.test(r.html())
        && !/>Overview<\/button>/.test(r.html()));
    ok('U-46: Settings is the compact gear-only tab, still named for accessibility',
        /tb-settings[^>]*data-tab="settings"[\s\S]{0,120}aria-label="Settings"[^>]*>⚙<\/button>/.test(r.html())
        && !/>⚙ Settings<\/button>/.test(r.html()));
    // U-25: every tab carries its own colour class, so the row that opens nine
    // pages reads as a control rather than as one more line of grey metadata.
    ok('…and each tab is marked with its own hue',
        ['overview', 'timeline', 'sessions', 'plan', 'backlog', 'track', 'docs', 'people', 'cost', 'settings']
            .every(t => r.html().includes(`class="pj-tab tb-${t}`)));
    ok('…and the selected gear keeps icon-width padding instead of inheriting a text tab',
        /\.pj-tab\.tb-settings\.on\s*\{[^}]*padding-left:11px[^}]*padding-right:11px/.test(r.html()));
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
                // A title nothing else on the page could contain — a plain word
                // matched the copy in a tab tooltip and this test failed for a
                // reason that had nothing to do with the timeline.
                { ts: T, kind: 'turn', title: 'ZZTURNROWZZ', link: { to: 'session', sessionId: 'sid-A', file: 'A' } },
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
    ok('the rows that ARE shown exclude it', !r.html().includes('ZZTURNROWZZ'));
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
        /Not here:/.test(h) && /Notices/.test(h) && /Queue/.test(h));
    ok('…and says WHY, so it reads as a limit rather than a missing feature',
        /carry no project of their own/.test(h));
    ok('…and it no longer claims decisions and deliverables are unfilable',
        !/Decisions · Deliverables/.test(h) && !/nothing writes to yet/.test(h));
    // ‼️ Faz 4 files document events — but only the ones the DOCUMENT dates.
    // The page has to say that, or a plan item the user ticked in Agent Farm
    // (which writes no ✅) looks like a row the timeline lost.
    ok('‼️ …and it says a document event needs a date the document states',
        /af-date/.test(h) && /undated is left out/.test(h));

    const empty = { ...feedData() };
    empty.tabData = { feed: { counts: {}, events: [], truncated: false, kinds: [] } };
    const r2 = run(empty);
    ok('an empty project says nothing has happened, and still names the gap',
        /Nothing has happened on this project yet/.test(r2.html()) && /Not here:/.test(r2.html()));
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

    // ‼️ …and the Sessions tab is the one where drawing it anyway produces an
    // ANSWER rather than a blank: the shared table's own empty state reads "No
    // sessions yet.", which under a project with two hundred of them is not a
    // missing payload, it is a lie the reader has no reason to doubt.
    const s = run({ ...baseData(), tab: 'sessions', tabData: {} });
    ok('‼️ the sessions tab waits too — an empty shared table would claim "No sessions yet."',
        /Reading the project…/.test(s.html())
        && !s.html().includes('id="pj-sessions"'));
}

// ===========================================================================
// Faz 4 — the tabs that write into the user's own documents.
// ===========================================================================

const planData = (over) => ({
    ...baseData(), tab: 'plan',
    tabData: {
        plan: {
            state: 'ok', role: 'plan', folder: 'D:\\v\\p', path: 'Plan.md',
            open: 2, done: 1,
            sections: [
                {
                    title: 'Milestones', items: [
                        { line: 4, text: 'Faz 4 — belgeler', done: false, depth: 0, id: 'afprj-04', due: '2026-08-16', completed: null },
                        { line: 5, text: 'Faz 3 — sayfa', done: true, depth: 0, id: null, due: null, completed: '2026-08-02' }
                    ]
                },
                {
                    title: 'Next up', items: [
                        { line: 8, text: 'Faz 1.7', done: false, depth: 2, id: null, due: null, completed: null }
                    ]
                }
            ],
            ...(over || {})
        }
    }
});

// ---------- the plan tab ----------
{
    const r = run(planData());
    const h = r.html();
    ok('the plan tab is on the bar', h.includes('data-tab="plan"'));
    ok('items are drawn as the checkboxes they are in the file',
        (h.match(/data-plan="/g) || []).length === 3);
    ok('what is done is shown as done', /class="pj-plan-item done"/.test(h));
    ok('the counts say what is left', /<b>2<\/b> open/.test(h) && /<b>1<\/b> done/.test(h));
    ok('the document\'s own metadata is shown, not hidden',
        h.includes('📅 2026-08-16') && h.includes('✅ 2026-08-02'));
    ok('nesting survives into the page', /padding-left:32px/.test(h));

    // ‼️ the promise the page has to keep saying out loud
    ok('‼️ the tab states that ticking changes ONE character and adds no ✅',
        /exactly one character/i.test(h) && /does not write metadata it does not own/.test(h));

    const box = r.els('plan').find(e => e.dataset.plan === '4');
    box.checked = true;
    box.click();
    const msg = r.posted.filter(m => m.type === 'planCheck').pop();
    ok('ticking a box asks the host to tick that item', msg && msg.line === 4 && msg.done === true);
    ok('‼️ …and it carries the Obsidian Tasks id, which survives the line moving',
        msg.itemId === 'afprj-04');
    // ‼️ The page holds a line number for as long as it stays open, and the
    // same file is open in Obsidian. One paragraph inserted there and the
    // number points one item down. Sending the text lets the host refuse
    // instead of quietly ticking the wrong box — which nobody notices.
    ok('‼️ …and the text it BELIEVES is on that line, so a stale page is refused',
        msg.text === 'Faz 4 — belgeler');
    ok('…and the message says the state it WANTS, not "toggle" — the box already flipped',
        Object.prototype.hasOwnProperty.call(msg, 'done'));

    const off = r.els('plan').find(e => e.dataset.plan === '5');
    off.checked = false;
    off.click();
    ok('unticking asks for exactly that', r.posted.filter(m => m.type === 'planCheck').pop().done === false);
}

// ---------- the plan tab when there is nothing to show, and WHY ----------
{
    const noDoc = run({ ...baseData(), tab: 'plan', tabData: { plan: { state: 'no-doc', role: 'plan', folder: 'D:\\v\\p' } } });
    ok('‼️ "no plan document" says what MAKES a file the plan, rather than looking broken',
        /af-role: plan/.test(noDoc.html()));
    const noFolder = run({ ...baseData(), tab: 'plan', tabData: { plan: { state: 'no-folder', role: 'plan' } } });
    ok('…and "no folder yet" points at where to choose one', /Settings/.test(noFolder.html()));
    const missing = run({ ...baseData(), tab: 'plan', tabData: { plan: { state: 'folder-missing', role: 'plan', folder: 'D:\\gone' } } });
    ok('…and a folder that moved names the path and points at Relink',
        /D:\\gone/.test(missing.html()) && /Relink/.test(missing.html()));
    const waiting = run({ ...baseData(), tab: 'plan', tabData: {} });
    ok('…and a payload that has not landed says "reading", not "empty"',
        /Reading the project…/.test(waiting.html()));
}

// ---------- the docs tab ----------
const docsData = (selected) => ({
    ...baseData(), tab: 'docs',
    tabData: {
        docs: {
            state: 'ok', folder: 'D:\\v\\p',
            entries: [
                { path: '10_Notes', name: '10_Notes', dir: true, size: 0, mtimeMs: T, role: null, managed: false },
                { path: '10_Notes/note.md', name: 'note.md', dir: false, size: 120, mtimeMs: T, role: null, managed: false },
                { path: '_AF', name: '_AF', dir: true, size: 0, mtimeMs: T, role: null, managed: true },
                { path: '_AF/BRIEF.md', name: 'BRIEF.md', dir: false, size: 900, mtimeMs: T, role: 'brief', managed: true },
                { path: 'Plan.md', name: 'Plan.md', dir: false, size: 400, mtimeMs: T, role: 'plan', managed: false }
            ],
            selected: selected === undefined
                ? { path: 'Plan.md', text: '# Plan\n\n- [ ] a', size: 400, mtimeMs: T, truncated: false, role: 'plan' }
                : selected
        }
    }
});
{
    const r = run(docsData());
    const h = r.html();
    ok('the folder is drawn as a tree, folders and files alike',
        h.includes('data-doc="Plan.md"') && h.includes('data-doc="10_Notes/note.md"'));
    ok('a folder is not a clickable document', !/data-doc="10_Notes"/.test(h));
    ok('a document says which role it carries', /pj-doc-r">plan</.test(h));
    ok('‼️ a machine-generated file is marked, so nobody edits what will be overwritten',
        /auto</.test(h) && /_AF\/BRIEF\.md/.test(h));
    ok('the selected document\'s text is shown as it is on disk',
        /pj-doc-text/.test(h) && h.includes('# Plan'));

    r.els('doc').find(e => e.dataset.doc === '10_Notes/note.md').click();
    const pick = r.posted.filter(m => m.type === 'selectDoc').pop();
    ok('‼️ picking a document sends its path RELATIVE to the project — the host resolves it',
        pick && pick.path === '10_Notes/note.md');

    const open = r.els('open')[0];
    open.click();
    const opened = r.posted.filter(m => m.type === 'openDoc').pop();
    ok('opening a document goes through the shared doc-open modes, not a viewer of our own',
        opened && opened.mode === 'vscode' && opened.path === 'Plan.md');
    ok('…and the other modes are offered too', /data-open="obsidian"/.test(h));

    const none = run(docsData(null));
    ok('with nothing selected the pane asks rather than showing a blank',
        /Pick a document on the left/.test(none.html()));
    const big = run(docsData({ path: 'x.md', text: 'head', size: 999999, mtimeMs: T, truncated: true, role: null }));
    ok('a truncated document SAYS it is truncated', /Only the first part is shown/.test(big.html()));
    const unread = run(docsData({ path: 'x.md', error: 'EACCES' }));
    ok('a document that could not be read says why', /EACCES/.test(unread.html()));

    // ‼️ `_AF/` is rewritten on every session start, so a note filed there is
    // gone by the next spawn. Offering it as a destination is offering to lose
    // the user's writing.
    ok('a folder the user owns is offered as somewhere to put a new note',
        /<option value="10_Notes">/.test(h));
    ok('‼️ …and the machine folder is NOT, because a note in it does not survive',
        !/<option value="_AF">/.test(h));
}

// ---------- the people tab ----------
{
    const withPeople = {
        ...project,
        people: [{ name: 'Murat Vural', role: 'owner', kind: 'self', contact: '', link: '' }]
    };
    const r = run({
        ...baseData(), projects: [withPeople], tab: 'people',
        tabData: { peopleDoc: { state: 'ok', role: 'people', folder: 'D:\\v\\p', path: 'People.md' } }
    });
    const h = r.html();
    ok('the people tab edits the registry rows', /data-p="name"/.test(h) && h.includes('Murat Vural'));
    ok('the roles are spelled out as the questions they answer',
        /who decides/i.test(h) && /who pays/i.test(h));
    ok('‼️ it points at the project\'s OWN people document instead of pretending to sync it',
        h.includes('People.md') && /data-open=/.test(h));
    ok('…and says this list is what a session is told', /what every session started under the project is told/.test(h));

    r.els('act').find(e => e.dataset.act === 'savePeople').click();
    const saved = r.posted.filter(m => m.type === 'savePeople').pop();
    ok('saving people is its own message, not part of the settings patch',
        saved && saved.people.length === 1 && saved.people[0].name === 'Murat Vural');
    ok('with nothing changed there is nothing to save, and the button says so',
        /data-act="savePeople" disabled/.test(h) && />saved</.test(h));
}

// ---------- ‼️ the people table is UNSAVED WORK and a repaint must not eat it ----------
{
    const withPeople = {
        ...project,
        people: [{ name: 'Murat Vural', role: 'owner', kind: 'self', contact: '', link: '' }]
    };
    const data = {
        ...baseData(), projects: [withPeople], tab: 'people',
        tabData: { peopleDoc: { state: 'ok', role: 'people', folder: 'D:\\v\\p', path: 'People.md' } }
    };
    const r = run(data);

    // somebody types a second person's name — no repaint happens while typing
    r.els('act').find(e => e.dataset.act === 'addPerson').click();
    const nameBox = r.els('p').filter(e => e.dataset.p === 'name').pop();
    nameBox.value = 'Yeni Kişi';
    nameBox._handlers.input();
    ok('typing marks the table unsaved without repainting the caret away',
        r.els('act').find(e => e.dataset.act === 'savePeople').disabled === false);

    // a refresh arrives — a commit picked up in the background is enough
    r.send({ type: 'data', data: { ...data } });
    ok('‼️ a refresh does NOT put the old rows back and take the typing with them',
        r.html().includes('Yeni Kişi'));
    ok('…and the row that was already saved is still there too',
        r.html().includes('Murat Vural'));

    // switching to another project DOES invalidate them — they are not its people
    r.send({
        type: 'data',
        data: { ...data, projects: [{ ...withPeople, id: 'p2', name: 'Other' }] }
    });
    ok('changing project clears the editor — those rows belong to somebody else',
        !r.html().includes('Yeni Kişi'));
}

// ---------- ‼️ Settings must not silently delete the people ----------
{
    const withPeople = {
        ...project,
        people: [{ name: 'Murat Vural', role: 'owner', kind: 'self' }]
    };
    const r = run({ ...baseData(), projects: [withPeople], tab: 'settings', tabData: {} });
    ok('the settings tab no longer holds the people editor', !/data-p="name"/.test(r.html()));
    ok('…and it says where they went', /People<\/b> tab/.test(r.html()));
    r.els('act').find(e => e.dataset.act === 'save').click();
    const patch = r.posted.filter(m => m.type === 'save').pop();
    ok('‼️ …so a Save pressed to change a budget CANNOT post an empty people list and wipe them',
        patch && !Object.prototype.hasOwnProperty.call(patch.patch, 'people'));
}

// ---------- every object on the page can be right-clicked ----------
//
// ‼️ A menu item is only half a feature until the row publishes itself. These
// check the other half: the section name the catalogue in src/core/ctxmenu.ts
// gates on, and the one or two keys its `when` clauses read. Get either wrong
// and the menu is simply absent — which is exactly the failure this whole piece
// of work exists to stop happening quietly.
const ctxOf = (html, section) => {
    const m = new RegExp('data-vscode-context="([^"]*' + section + '[^"]*)"').exec(html);
    return m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>').replace(/&amp;/g, '&')) : null;
};

{
    const r = run(planData());
    const c = ctxOf(r.html(), 'afPlanItem');
    ok('a plan item publishes itself, with the line its tick will change',
        !!c && typeof c.line === 'number');
    ok('…and whether it is done, which is what picks Tick from Untick',
        !!c && typeof c.afDone === 'boolean');
    r.send({ type: 'afctx', act: 'planCheck:1', ctx: { line: c.line, text: c.text, planId: c.planId } });
    const tick = r.posted.filter(m => m.type === 'planCheck').pop();
    ok('ticking from the menu is the message the checkbox sends',
        tick && tick.line === c.line && tick.done === true);
}

{
    const r = run(docsData());
    const c = ctxOf(r.html(), 'afDocRow');
    ok('a document row publishes its path', !!c && !!c.path);
    r.send({ type: 'afctx', act: 'docOpen:obsidian', ctx: c });
    const open = r.posted.filter(m => m.type === 'openDoc').pop();
    ok('…and the menu opens it through the shared doc-open modes',
        open && open.path === c.path && open.mode === 'obsidian');
}

{
    const r = run({ ...baseData(), tab: 'plan', tabData: {} });
    const c = ctxOf(r.html(), 'afProjectRow');
    ok('a project in the list publishes itself', !!c && c.project === 'p1');
    ok('…and says whether it is already the active one', !!c && 'afActive' in c);
    r.send({ type: 'afctx', act: 'projReveal', ctx: c });
    const reveal = r.posted.filter(m => m.type === 'revealFolder').pop();
    ok('revealing from the menu names the project that was clicked, not the open one',
        reveal && reveal.id === 'p1');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
