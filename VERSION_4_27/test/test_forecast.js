// Ad-hoc tests for Dalga 4 — task forecast + digest task outcomes (2.21.0).
'use strict';
const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const fc = require(path.join(ROOT, 'out/core/forecast.js'));
const report = require(path.join(ROOT, 'out/core/report.js'));

let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const DAY = 24 * 3600 * 1000;
// Fixed local anchor: 2026-07-11 08:00 local.
const FROM = new Date(2026, 6, 11, 8, 0, 0, 0).getTime();
const sched = (over) => Object.assign({
    id: 'x', agentId: 'a1', agentName: 'yazar', title: 'Rapor', prompt: 'p', mode: 'headless',
    kind: 'daily', hour: 9, minute: 0, enabled: true
}, over);

// ---- 1. nextOccurrences ----
const daily9 = fc.nextOccurrences(sched({ hour: 9 }), FROM, 7);
check('daily: first occurrence is today at 09:00', daily9.length > 0 &&
    new Date(daily9[0]).getHours() === 9 && new Date(daily9[0]).getDate() === 11);
check('daily: all at the scheduled minute', daily9.every(t => new Date(t).getHours() === 9 && new Date(t).getMinutes() === 0));
check('daily: ~one per day across the window', daily9.length >= 7 && daily9.length <= 8);

const daily6 = fc.nextOccurrences(sched({ hour: 6 }), FROM, 7);
check('daily: time already passed today → first is tomorrow', new Date(daily6[0]).getDate() === 12);

const dow = (new Date(FROM).getDay() + 2) % 7; // two days ahead
const weekly = fc.nextOccurrences(sched({ kind: 'weekly', dow, hour: 10 }), FROM, 7);
check('weekly: one occurrence in a 7-day window on the right weekday',
    weekly.length === 1 && new Date(weekly[0]).getDay() === dow && new Date(weekly[0]).getHours() === 10);

check('once: in-window future fires', fc.nextOccurrences(sched({ kind: 'once', onceAt: FROM + 2 * DAY }), FROM, 7).length === 1);
check('once: past does not fire', fc.nextOccurrences(sched({ kind: 'once', onceAt: FROM - 3600_000 }), FROM, 7).length === 0);
check('once: already-run (lastRunKey) does not fire', fc.nextOccurrences(sched({ kind: 'once', onceAt: FROM + DAY, lastRunKey: 'once' }), FROM, 7).length === 0);
check('once: beyond window does not fire', fc.nextOccurrences(sched({ kind: 'once', onceAt: FROM + 30 * DAY }), FROM, 7).length === 0);
check('disabled: no occurrences', fc.nextOccurrences(sched({ enabled: false }), FROM, 7).length === 0);

// ---- 2. familyDurations ----
const rec = (over) => Object.assign({ id: Math.random() + '', agentId: 'a1', agentName: 'yazar', title: 'Rapor', status: 'done', createdAt: FROM - DAY, startedAt: FROM - DAY, endedAt: FROM - DAY + 60000 }, over);
// Scheduled tasks all carry the schedule's title verbatim → same family 'rapor'.
const records = [
    rec({ startedAt: FROM - DAY, endedAt: FROM - DAY + 60000 }),                 // 60s done
    rec({ startedAt: FROM - DAY, endedAt: FROM - DAY + 120000 }),                // 120s done
    rec({ status: 'failed', startedAt: FROM - DAY, endedAt: FROM - DAY + 30000 })// failed
];
const fams = fc.familyDurations(records, FROM);
const rf = fams.get(fc.titleFamily ? fc.titleFamily('Rapor') : 'rapor') || [...fams.values()][0];
check('familyDurations: median of durations', rf.medianMs === 90000);
check('familyDurations: success excludes failed from numerator', Math.abs(rf.successRate - 2 / 3) < 0.01);
check('familyDurations: run count', rf.runs === 3);

// ---- 3. buildForecast ----
const forecast = fc.buildForecast(
    [sched({ hour: 9 })],
    [
        { title: 'Elde iş', agentName: 'yazar', status: 'queued', deferredReason: 'agent busy' },
        { title: 'Koşan', agentName: 'editor', status: 'running', startedAt: FROM - 1000 }
    ],
    records, FROM, 7
);
check('forecast: upcoming sorted + enriched with family stats',
    forecast.upcoming.length >= 7 && forecast.upcoming[0].medianMs === 90000 && Math.abs(forecast.upcoming[0].successRate - 2 / 3) < 0.01);
check('forecast: queue split', forecast.queued.length === 1 && forecast.queued[0].deferredReason === 'agent busy');
check('forecast: running split', forecast.running.length === 1 && forecast.running[0].agentName === 'editor');
check('forecast: estBusyMs sums known medians', forecast.estBusyMs === forecast.upcoming.length * 90000);

// ---- 4. renderForecastMarkdown ----
const md = fc.renderForecastMarkdown(forecast);
check('markdown: has title + sections', /# Görev Öngörüsü/.test(md) && /## Zamanlanmış koşular/.test(md) && /## Kuyrukta bekleyen/.test(md));
check('markdown: shows schedule title + duration', /Rapor/.test(md) && /min/.test(md));
const emptyMd = fc.renderForecastMarkdown(fc.buildForecast([], [], [], FROM, 7));
check('markdown: empty state', /zamanlanmış koşu yok/.test(emptyMd));

// ---- 5. digest task outcomes line ----
const digest = report.buildDailyDigest({
    date: '2026-07-11', todayCost: 1, activeAgents: 1, totalAgents: 2,
    agents: [], warnings: [], pendingDuties: 0, runningTasks: 0, queuedTasks: 0, mediaCostToday: 0,
    taskOutcomesToday: { done: 3, failed: 1, topFailures: ['Bozuk iş'] }
});
check('digest: task-outcome line present', /Bugün biten: 3✓ 1✗/.test(digest) && /Bozuk iş/.test(digest));
const digest2 = report.buildDailyDigest({
    date: '2026-07-11', todayCost: 0, activeAgents: 0, totalAgents: 1,
    agents: [], warnings: [], pendingDuties: 0, runningTasks: 0, queuedTasks: 0, mediaCostToday: 0,
    taskOutcomesToday: { done: 0, failed: 0, topFailures: [] }
});
check('digest: no outcome line when nothing finished', !/Bugün biten/.test(digest2));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
