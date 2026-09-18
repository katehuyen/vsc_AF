/**
 * The Task Analytics page, with the shapes its sections really get.
 *
 * ‼️ WRITTEN FOR X-252, AND THE PAGE HAD NONE UNTIL THEN — which is why a
 * section could be added to it and never looked at. The spend rows carry the
 * ARITIES that read differently rather than one comfortable example: a heavy
 * priced sign-in, a light one, a row where every run was on an engine that
 * states no price, a row with runs left out of the window, and the
 * unattributed total, which is the row a reader adding the column up needs in
 * order to see why it falls short.
 */
'use strict';

const NOW = new Date('2026-09-14T12:00:00+07:00').getTime();
const DAY = 86400000;

const dayKey = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const agent = (name, total, done, failed, med, retries) => ({
    agentId: name, agentName: name, total, done, failed, cancelled: 0, retries,
    successRate: done + failed ? done / (done + failed) : undefined,
    medianDurationMs: med
});

const spendRow = (o) => Object.assign({
    account: '', label: '', engines: [], cost: 0, wTokens: 0,
    sessions: 0, unpriced: 0, unsplit: 0, lastTs: NOW
}, o);

function data() {
    const daily = [];
    for (let i = 29; i >= 0; i--) {
        daily.push({ day: dayKey(NOW - i * DAY), done: (i % 5) + 1, failed: i % 7 === 0 ? 1 : 0 });
    }
    return {
        generatedAt: NOW,
        spendDays: 30,
        kpis: {
            runs30d: 128, done: 114, failed: 11, retries: 6,
            successRate: 114 / 125, medianMs: 4 * 60 * 1000
        },
        agents: [
            agent('developer', 61, 57, 3, 6 * 60000, 4),
            agent('manager', 38, 35, 2, 3 * 60000, 1),
            agent('basit', 29, 22, 6, 90000, 1)
        ],
        families: [
            { title: 'daily backup', source: 'schedule', runs: 30, failed: 0, alwaysFails: false, agents: 'basit' },
            { title: 'quota report', source: 'trigger', runs: 14, failed: 14, alwaysFails: true, agents: 'manager' }
        ],
        alerts: [
            { severity: 'warning', who: 'basit', message: 'six of its last twenty-nine runs failed' }
        ],
        daily,
        forecast: {
            days: 7, totalScheduledRuns: 19, estBusyMs: 96 * 60000,
            upcoming: [
                { ts: NOW + 3 * 3600000, title: 'daily backup', agentName: 'basit', medianMs: 60000, successRate: 1 },
                { ts: NOW + DAY, title: 'quota report', agentName: 'manager', medianMs: 120000, successRate: 0 }
            ]
        },
        queue: { count: 3, etaMs: 11 * 60000, known: 2 },
        accountSpend: {
            from: dayKey(NOW - 29 * DAY), to: dayKey(NOW),
            rows: [
                // The heavy one, fully priced — the row every other one is read against.
                // X-112 — four of its runs went through Kimi: still its runs,
                // off its window and its bill, and the Notes column says so.
                spendRow({
                    account: 'work-1', label: 'work@studio', engines: ['claude'],
                    cost: 41.882, wTokens: 18_400_000, sessions: 63, offPlan: 4
                }),
                // Light, and one of its runs was on an engine with no price: the
                // money figure is real AND short, which the Notes column says.
                spendRow({
                    account: 'personal', label: 'personal@gmail', engines: ['claude'],
                    cost: 3.114, wTokens: 990_000, sessions: 9, unpriced: 1
                }),
                // ‼️ EVERY run unpriced — the cell must not print $0.00 here.
                spendRow({
                    account: 'codex-work', label: 'work@studio', engines: ['codex'],
                    cost: 0, wTokens: 420_000, sessions: 7, unpriced: 7, unsplit: 2
                })
            ],
            // ‼️ The part of the month that belongs to nobody. Sessions started
            // outside Agent Farm carry no manifest, and naming an owner for them
            // would be inventing one.
            unattributed: spendRow({
                account: '', label: 'not attributed', engines: ['claude', 'codex'],
                cost: 6.402, wTokens: 2_100_000, sessions: 18
            })
        }
    };
}

/** The arity that matters most: a machine that has attributed nothing yet. */
function emptySpend() {
    const d = data();
    d.accountSpend = {
        from: d.accountSpend.from, to: d.accountSpend.to,
        rows: [], unattributed: spendRow({ account: '', label: 'not attributed' })
    };
    return d;
}

/** …and a host that cannot answer at all — the section is not drawn. */
function noSpend() {
    const d = data();
    delete d.accountSpend;
    return d;
}

module.exports = {
    script: 'taskAnalytics.js',
    data,
    variants: () => [
        { id: 'taskanalytics', label: 'Task Analytics', data: data() },
        {
            id: 'taskanalyticsempty',
            label: 'Task Analytics — nothing attributed to a sign-in yet',
            data: emptySpend()
        },
        {
            id: 'taskanalyticsnospend',
            label: 'Task Analytics — a host that cannot answer for spend at all',
            data: noSpend()
        }
    ]
};
