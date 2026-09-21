// A session's OWN page — the first fixture it has ever had.
//
// ‼️ WHY IT IS BEING DRAWN NOW. S-64 puts a second fact under the "Context now"
// gauge: whether the run was TOLD its window had crossed the line. The gauge is
// a KPI card with a click-pop already on it, so a line added under it is exactly
// the kind of change that ships blind — it passes every string test and lands
// on top of the ⛁ glyph, or under the pop, or in a colour nobody can read on a
// light theme. Three scenes, one per signal state, because the whole point of
// the states is that they must not look like each other.
//
//   node test/render_page.js sessionviewer [--light]
//   node test/shoot_page.js sessionviewer --scene 1
'use strict';

const NOW = Date.UTC(2026, 8, 17, 14, 30, 0);
const LAW = 'Lines: converge 35% · hand over 40% (agentFarm.contextConvergePct / contextHandoverPct).';

// ‼️ X-112 — THE FIXTURE ASKS THE PRODUCT, IT DOES NOT RETELL IT. A hand-written
// billing block is a second wording of the one rule, and the scene then
// photographs a page nobody ships — this one was already a copy going stale.
const { billingOf } = require(require('path').join(__dirname, '..', '..', 'out', 'core', 'billing.js'));
const KIMI_ROUTE = { baseUrl: 'https://api.moonshot.ai/anthropic', authKind: 'api-key' };
const billing = v => billingOf(Object.assign({ engine: 'claude', binding: 'declared' }, v));

const msgs = () => [
    { role: 'user', ts: NOW - 900000, text: 'S-64 icin kartin baglam gostergesini ac.', turn: 1, turnStart: true },
    {
        role: 'assistant', ts: NOW - 880000, turn: 1, model: 'claude-opus-5',
        tokens: 18400, wTokens: 15200, cost: 0.21, kind: 'think',
        text: 'Reading the guard and the two surfaces that draw its record.'
    },
    {
        role: 'tool', ts: NOW - 870000, turn: 1, tool: 'Read', kind: 'read',
        input: 'src/core/contextGuard.ts'
    },
    { role: 'toolResult', ts: NOW - 869000, turn: 1, text: '330 lines' },
    {
        role: 'assistant', ts: NOW - 500000, turn: 1, model: 'claude-opus-5',
        tokens: 22100, wTokens: 18900, cost: 0.26, kind: 'edit',
        text: 'The view is derived once in the core and rendered by both pages.'
    }
];

/**
 * The three states of the discipline signal, shaped exactly as
 * `contextSignalView` returns them — the host's words, never re-derived here.
 */
function viewFor(state) {
    if (state === 'converge') {
        return {
            state: 'delivered', level: 'converge', chip: 'CONVERGE', handedOver: false,
            lines: [
                'Discipline signal: CONTEXT CONVERGE 36% delivered — 4m ago, through the Claude live hook (PostToolUse).',
                'CONTEXT HANDOVER 40%: not reached — the run may still work, but starts nothing new.',
                'Handed over: not yet — the note that closes this run names it here.',
                LAW
            ]
        };
    }
    if (state === 'handover') {
        return {
            state: 'delivered', level: 'handover', chip: 'HANDOVER', handedOver: true,
            lines: [
                'Discipline signal: CONTEXT HANDOVER 41% delivered — 1m ago, through the Claude live hook (UserPromptSubmit).',
                'CONTEXT CONVERGE 36% had gone out earlier — 9m ago.',
                'Handed over: yes — 30s ago — 2026-09-17_devir_05_116f35f0_s64.md',
                LAW
            ]
        };
    }
    return {
        state: 'undelivered', level: 'handover', chip: 'HANDOVER ✕', handedOver: false,
        lines: [
            'Discipline signal: CONTEXT HANDOVER 44% — ‼️ NEVER REACHED THIS RUN — 2m ago.',
            'codex hooks carry no additionalContext — the signal has no way into that session',
            'The reading is here and the sentence is not: this run was not told, so its '
                + 'silence is not obedience. Watch it yourself, or hand it over by hand.',
            LAW
        ]
    };
}

const data = (o) => {
    const state = (o && o.signal) || null;
    const codex = state === 'undelivered';
    const tokens = codex ? 113600 : (state === 'handover' ? 410000 : 360000);
    const limit = codex ? 258400 : 1000000;
    return Object.assign({
        file: 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm\\.sessions\\019fe7bc.jsonl',
        sessionId: '019fe7bc-545c-70d2-9a11-0b1c2d3e4f50',
        account: 'aicozums',
        accountId: 'claude-aicozums',
        // X-110 - which provider served the run. A fixture with none would
        // photograph the header exactly as it was before the chip existed.
        identity: {
            engine: codex ? 'codex' : 'claude',
            providerId: 'kimi', providerLabel: 'Kimi (work)',
            origin: 'agent-farm-profile', scope: 'session',
            providerProfileId: 'kimi-work', providerProfileRevision: 3,
            requestedModelRef: 'kimi-k2-thinking',
            reportedProviderIds: ['kimi'], reportedModels: ['kimi-k2-thinking'],
            proof: 'matched', multiProvider: false, turnScope: false,
            agreement: 'matched', binding: 'declared',
            // X-112 — and who is billed, as the host words it (src/core/billing.ts):
            // the panel prints this line and never derives it.
            billing: billing({
                engine: codex ? 'codex' : 'claude',
                providerId: 'kimi', providerLabel: 'Kimi (work)', route: KIMI_ROUTE
            })
        },
        title: 'S-64 — baglam disiplini sinyali',
        pinned: false,
        tags: [],
        cwd: 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm',
        permissionMode: 'bypassPermissions',
        origin: 'human',
        headless: false,
        launchedBy: null,
        lane: false,
        engine: codex ? 'codex' : 'claude',
        agentName: 'developer',
        firstTs: NOW - 900000,
        lastTs: NOW - 60000,
        models: [codex ? 'gpt-5-codex' : 'claude-opus-5'],
        usage: { input: 41200, output: 9800, cacheRead: 812000, cacheWrite: 43100 },
        totalTokens: 906100,
        totalWTokens: 720400,
        cost: 1.42,
        errors: 0,
        toolCalls: 14,
        context: { tokens, ts: NOW - 60000, limit, model: codex ? 'gpt-5-codex' : 'claude-opus-5' },
        contextSignal: state ? viewFor(state) : null,
        contextReport: null,
        turnCount: 1,
        turnTotals: {},
        turns: [{
            n: 1, label: 'baglam gostergesi', prompt: 'S-64 icin kartin baglam gostergesini ac.',
            ts: NOW - 900000, tokens: 40500, wTokens: 34100, cost: 0.47,
            apiCalls: 4, steps: 6, thinking: 1, ms: 400000, endCtx: tokens,
            tools: 14, errors: 0, topTools: [{ name: 'Read', n: 8 }, { name: 'Edit', n: 6 }],
            models: [codex ? 'gpt-5-codex' : 'claude-opus-5'], attrs: {}
        }],
        wikiMarks: [],
        files: [],
        messageCount: 5,
        truncatedCount: 0,
        messages: msgs(),
        scanLimit: 1500,
        focusRoles: null,
        focusTs: 0,
        resetView: false
    }, o && o.over);
};

module.exports = {
    script: 'sessionViewer.js',
    data,
    variants: () => [
        {
            id: 'sessionviewer',
            label: 'Session viewer — no line crossed: the gauge alone, and nothing invented under it',
            data: data()
        },
        {
            id: 'sessionviewer-converge',
            label: 'Session viewer — CONVERGE was delivered: the run was told to start nothing new',
            data: data({ signal: 'converge' })
        },
        {
            id: 'sessionviewer-handover',
            label: 'Session viewer — HANDOVER delivered AND the note written: the loop closed',
            data: data({ signal: 'handover' })
        },
        {
            id: 'sessionviewer-undelivered',
            // ‼️ The scene this page needed most: a Codex session sitting past
            // the line. Without the ✕ the card reads as a run that was told and
            // carried on, which is a charge against an agent nobody ever spoke to.
            label: 'Session viewer — a Codex run past the line the sentence cannot reach: ✕, never silence',
            data: data({ signal: 'undelivered' })
        },
        {
            id: 'sessionviewer-quota',
            // S-75 — the account's window crossed while the conversation's is
            // quiet: the quota line alone under the gauge, the host's own words.
            label: 'Session viewer — QUOTA HANDOVER delivered, the window quiet: 5h 91% HANDOVER under the gauge',
            data: data({ over: { contextSignal: quotaView() } })
        }
    ]
};

function quotaView() {
    const G = require('../../out/core/contextGuard.js');
    const del = (pct, ago) => ({ ts: NOW - ago, pct, tokens: 0, window: 0, channel: 'claude-hook', via: 'PostToolUse', account: 'aicozums' });
    return G.contextSignalView({
        sessionId: 's', lastPct: 18,
        quota: { account: 'aicozums', lastPct: 91, lastTs: NOW - 20000, resetsAt: NOW + 5400000, converge: del(86, 1500000), handover: del(91, 60000) }
    }, G.DEFAULT_CONTEXT_THRESHOLDS, ts => Math.round((NOW - ts) / 60000) + 'm ago');
}
