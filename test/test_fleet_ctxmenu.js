// The fleet surfaces' right-click contract.
//
// ‼️ THE CLAIM THIS FILE EXISTS FOR: an agent is listed on six pages, and every
// one of them gets the SAME menu because the whole thing is host commands
// keyed on one context key. If a page ever stops publishing an agent row, or
// the family ever stops covering a section, the menu silently drops back to
// Cut/Copy/Paste on that surface only — which is exactly the kind of rot
// nobody notices until they need the menu.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const NOW = Date.now();

/** Does a when-clause draw on this section? */
function draws(when, section) {
    const m = /^webviewSection =~ \/(.+)\/$/.exec(String(when || ''));
    if (m) { return new RegExp(m[1]).test(section); }
    return when === `webviewSection == '${section}'`;
}

// ---------- the agent menu, read off the catalogue ----------
{
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
    const web = pkg.contributes.menus['webview/context'];
    const onAgent = web.filter(e => draws(e.when, 'afAgentRow')).map(e => e.command);
    const MUST = [
        'agentfarm.openAgentDetail', 'agentfarm.openAgentInNewWindow', 'agentfarm.launchSession',
        'agentfarm.consoleForAgent', 'agentfarm.continueSession', 'agentfarm.revealAgent',
        'agentfarm.openDuties', 'agentfarm.addDuty', 'agentfarm.addMemory',
        'agentfarm.openMemoryGraph', 'agentfarm.assignProject', 'agentfarm.distillMemory',
        'agentfarm.exportAgentPack', 'agentfarm.syncAntigravity',
        'agentfarm.copyAgentName', 'agentfarm.copyAgentFolder'
    ];
    ok('an agent row carries the whole agent vocabulary', MUST.every(c => onAgent.indexOf(c) >= 0));
    ok('‼️ every one of them is a HOST COMMAND — no page writes a handler',
        !onAgent.some(c => c.indexOf('agentfarm.ctx.') === 0));
    ok('a Timeline lane label is in the agent family',
        MUST.every(c => web.some(e => e.command === c && draws(e.when, 'afTimelineAgent'))));
    ok('‼️ …and still in the session family, so one right-click gives both',
        web.some(e => e.command === 'agentfarm.endSession' && draws(e.when, 'afTimelineAgent')));

    // ‼️ The three that would act on the wrong finding are deliberately absent.
    const onInsight = web.filter(e => draws(e.when, 'afInsightRow')).map(e => e.command);
    ok('‼️ an insight row does NOT offer Fix / Delegate / Dismiss — those need the real Insight object',
        !['agentfarm.fixInsight', 'agentfarm.delegateInsight', 'agentfarm.dismissInsight']
            .some(c => onInsight.indexOf(c) >= 0));
    ok('…but it does offer the two that read nothing', onInsight.length >= 2);
}

// ============================================================ DASHBOARD
{
    const agent = (id, name) => ({
        id, name, dir: 'D:/a/' + name, active: false, lastActivity: NOW - 1000,
        sessions: 2, contextLoad: 1000, duties: 0, pendingDuties: 0, budget: 0,
        daily: {}, usage: { input: 1, output: 1, cacheRead: 1, cacheWrite: 1 },
        totalCost: 1, totalTokens: 10, totalWTokens: 10, toolCalls: 2, errors: 0,
        insightCounts: { error: 0, warning: 0 }, quality: null, qualityCount: 0
    });
    const p = runPage('dashboard.js', {
        generatedAt: NOW, today: '2026-08-06',
        agents: [agent('a1', 'dev'), agent('a2', 'ops')],
        modelTotals: {}, tokenTypes: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
        heat: new Array(168).fill(0), sessionRows: [], sessionTableN: 20,
        window: { tokens: 0, msgs: 0, cost: 0, limit: 0 },
        fleetBudget: 0, mediaCost: { today: 0, month: 0 },
        insightTotals: { error: 1, warning: 2, info: 3 },
        unknownModels: [], externalSessions: {}, farmStatus: [],
        planUsage: { state: 'ok', plan: 'pro', fetchedAt: NOW, bars: [{ id: 'five_hour', title: 'Current session', percent: 40, resetsAt: NOW + 3600e3 }] },
        planUsageBeat: { ms: 300000, active: false }
    });

    const ctxs = p.contexts();
    const cards = ctxs.filter(c => c.webviewSection === 'afAgentRow' && c.agentId === 'a1');
    ok('the Dashboard publishes an agent row', cards.length > 0);
    ok('…carrying the one key resolveAgent needs, plus what a copy wants',
        cards[0].agentId === 'a1' && cards[0].agentName === 'dev' && cards[0].agentDir === 'D:/a/dev');
    ok('‼️ the card AND the comparison row publish the same agent — one menu, two places',
        cards.length >= 2 && JSON.stringify(cards[0]) === JSON.stringify(cards[1]));

    const tile = ctxs.find(c => c.webviewSection === 'afStatTile' && c.tileLabel === 'Insights');
    ok('a stat tile publishes what it reads and which page answers it',
        !!tile && tile.tileNav === 'portfolio' && tile.tileValue.indexOf('1 errors') === 0);
    p.posted.length = 0;
    p.send({ type: 'afctx', act: 'tileOpen', ctx: tile });
    ok('"open the page behind this number" navigates there',
        p.last().type === 'afnav' && p.last().to === 'portfolio');
    const flat = ctxs.find(c => c.webviewSection === 'afStatTile' && c.tileLabel === 'Cost today');
    ok('‼️ a tile with no page behind it says so, so the item is not drawn',
        !!flat && flat.tileNav === '');

    const pu = ctxs.find(c => c.webviewSection === 'afPlanUsage');
    ok('the plan-usage card publishes its figures', !!pu && pu.puText.indexOf('Current session: 40%') >= 0);
}

// ============================================================ PORTFOLIO
{
    const p = runPage('portfolio.js', {
        generatedAt: NOW,
        rows: [{
            id: 'a1', name: 'dev', dir: 'D:/a/dev', dormant: false, sessions: 3,
            cost: 1, tokens: 10, wTokens: 10, errors: 0, warnings: 1, lastTs: NOW - 1000,
            quietDays: 0, duties: 0, memory: 0, skills: 0, mcp: 0, quality: null
        }]
    });
    const a = p.contexts().find(c => c.webviewSection === 'afAgentRow');
    ok('Portfolio publishes an agent row too', !!a && a.agentId === 'a1' && a.agentName === 'dev');
}

// ============================================================ LIVING
{
    const p = runPage('livingPage.js', {
        generatedAt: NOW, score: 80, verdict: 'alive',
        counts: { ok: 2, warn: 1, dead: 0, idle: 0 }, hasChecks: true,
        signals: [
            { state: 'warn', label: 'Daily diary', detail: 'not written today', hint: 'write it', weight: 3, goto: 'notices', ageMs: 3600e3 },
            { state: 'ok', label: 'Backups', detail: 'ran 2h ago', weight: 1, ageMs: 7200e3 }
        ],
        recent: []
    });
    const sig = p.contexts().find(c => c.webviewSection === 'afLivingSignal' && c.sigGoto === 'notices');
    ok('a Living signal publishes where it goes and what it says',
        !!sig && sig.sigText.indexOf('Daily diary') === 0);
    const noGoto = p.contexts().find(c => c.webviewSection === 'afLivingSignal' && c.sigGoto === '');
    ok('‼️ a signal with nowhere to go says so, so "go to it" is not drawn', !!noGoto);
    p.posted.length = 0;
    p.send({ type: 'afctx', act: 'lvGo', ctx: sig });
    ok('going to a signal is the row click\'s own message',
        p.last().type === 'goto' && p.last().to === 'notices');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
