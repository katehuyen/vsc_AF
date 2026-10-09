import { CatalogSection } from './types';

export const cost: CatalogSection = {
    id: 'cost',
    label: 'Quota & Cost',
    about: 'How plan usage is read and shown, what things cost and where spending stops.',
    groups: [
        { id: 'planUsage', label: 'Plan usage', about: 'How often each account\'s plan usage is read, and when its figure turns to a warning.' },
        { id: 'budgets', label: 'Budgets', about: 'The spending limits per agent and for media each month.' },
        { id: 'prices', label: 'Prices and weights', about: 'What a token costs on each model, and how a window\'s use is weighed.' },
        { id: 'brakes', label: 'Brakes', about: 'When an unattended start waits, or drops to a cheaper model, because the quota is running out.' },
        { id: 'forecast', label: 'Alerts and forecast', about: 'When a rising cost is flagged, and how far ahead spending is forecast.' },
        { id: 'display', label: 'Display', about: 'How cost is shown on an agent\'s row.' }
    ],
    rows: {
        planUsageStatusBar: {
            group: 'planUsage', tier: 'basic',
            label: 'Status bar plan usage',
            summary: 'Shows your plan\'s session time left and usage in the status bar.'
        },
        planUsageWarnPercent: {
            group: 'planUsage', tier: 'basic', unit: '%',
            label: 'Warn at',
            summary: 'The usage at which the status bar figure turns yellow.'
        },
        planUsageDangerPercent: {
            group: 'planUsage', tier: 'basic', unit: '%',
            label: 'Alarm at',
            summary: 'The usage at which the status bar figure turns red.'
        },
        // Only the OAuth session Claude Code stores locally is read; it is never written to.
        planUsageRefreshMinutes: {
            group: 'planUsage', unit: 'min',
            label: 'Refresh while idle',
            summary: 'How often plan limits are re-read while no agent is working.'
        },
        // The endpoint is undocumented. The backoff runs 3, 6, 12, 15 minutes; the refresh button asks anyway. A
        // session open but waiting for a prompt counts as idle.
        planUsageActiveRefreshSeconds: {
            group: 'planUsage', unit: 's',
            label: 'Refresh while working',
            summary: 'How often plan limits are re-read while an agent is mid-turn.'
        },
        // Anthropic limits this endpoint per account token. With a clock per reader the standing account was asked
        // twice within a second and alone kept hitting the limit.
        planUsageMinIntervalSeconds: {
            group: 'planUsage', unit: 's',
            label: 'Gap between reads',
            summary: 'The shortest gap between two usage reads for one sign-in.'
        },
        planUsageEngine: {
            group: 'planUsage',
            label: 'Status bar engine',
            summary: 'Which engine\'s remaining limit the status bar shows.',
            options: { claude: 'Claude Code', codex: 'Codex', gemini: 'Gemini', agy: 'Antigravity', opencode: 'OpenCode' }
        },
        agyUsageRefreshMinutes: {
            group: 'planUsage', unit: 'min', zeroMeans: 'off',
            label: 'Antigravity refresh while idle',
            summary: 'How often Antigravity\'s quota is re-read while it is not running.'
        },
        agyUsageActiveRefreshSeconds: {
            group: 'planUsage', unit: 's',
            label: 'Antigravity refresh while working',
            summary: 'How often Antigravity\'s quota is re-read while one of its turns runs.'
        },
        // One request per five seconds across the machine; a 429 pauses the whole fleet. The accounts.autoRefresh
        // bridge op flips the same setting.
        accountsAutoRefresh: {
            group: 'planUsage',
            label: 'Refresh accounts in background',
            summary: 'Re-reads every signed-in account\'s window figures in the background.'
        },
        budgets: {
            group: 'budgets', tier: 'basic',
            label: 'Daily budgets',
            summary: 'A daily spending limit per agent, or for the whole fleet.'
        },
        budgetsUnlimited: {
            group: 'budgets',
            label: 'Ignore all budgets',
            summary: 'Suspends every daily budget without losing the figures.'
        },
        mediaBudgetMonthUSD: {
            group: 'budgets', unit: '$', zeroMeans: 'off',
            label: 'Monthly media budget',
            summary: 'Warns once a month when media spending passes this amount.'
        },
        pricing: {
            group: 'prices',
            label: 'Model prices',
            summary: 'What a million tokens costs on each model.',
            fields: { match: 'Model pattern', input: 'Input', output: 'Output', cacheWrite: 'Cache write', cacheRead: 'Cache read' }
        },
        mediaPricing: {
            group: 'prices',
            label: 'Media prices',
            summary: 'What a media request, image or second of output is estimated to cost.',
            fields: { match: 'Model pattern', usd: 'Price', per: 'Unit' }
        },
        // Built in: opus and fable {5, 25, 6.25, 10, 0.5}, sonnet {1, 5, 1.25, 2, 0.1}, haiku {0.333, 1.667, 0.417,
        // 0.667, 0.033}. Cache writes are priced by TTL and the 1-hour rate applies here: measured on this machine,
        // all 17,923,938 cache-creation tokens were 1-hour, so a usage block with no split is charged at that rate.
        // Separate from pricing so correcting a billing rate never silently moves the limit gauge.
        quotaWeights: {
            group: 'prices',
            label: 'Quota weights',
            summary: 'How much each kind of token counts against the plan\'s rolling limit.',
            fields: {
                match: 'Model pattern', input: 'Input', output: 'Output',
                cacheWrite: 'Cache write 5m', cacheWrite1h: 'Cache write 1h', cacheRead: 'Cache read'
            }
        },
        // Calibrated against the real endpoint on 2026-08-04 by sampling utilization twice inside one window: 29 ->
        // 82 percent over 28 minutes and 96 API calls cost 38.13M raw / 24.86M model-aware / 4.97M model-flat, i.e. a
        // full five-hour limit of about 72M raw, 47M model-aware or 9.4M model-flat for that workload. Almost all of
        // it ran on Opus, so that sample cannot tell model-aware and model-flat apart.
        quotaWeightMode: {
            group: 'prices',
            label: 'Weighing',
            summary: 'How the weighted figure counts what work costs the plan\'s limit.',
            options: { 'model-aware': 'Kind and model', 'model-flat': 'Token kind only', raw: 'Raw total' }
        },
        windowTokenLimit: {
            group: 'prices', unit: 'tokens',
            label: 'Window limit',
            summary: 'Your plan\'s token limit for the rolling five-hour window.'
        },
        // A cache-read token is a tenth of a fresh input token and an output token is five, while 94-99 percent of a
        // raw total is cache reads: raw totals of full windows ranged 111M-175M across days that hit the same wall,
        // weighted ones 18-21M.
        windowWeightedTokenLimit: {
            group: 'prices', unit: 'tokens', zeroMeans: 'off',
            label: 'Weighted window limit',
            summary: 'The rolling five-hour limit in weighted tokens, which the brakes can read.'
        },
        quotaBrakeBasis: {
            group: 'brakes',
            label: 'Brake on',
            summary: 'Which window figure the quota brakes read to judge how full it is.',
            options: { whichever: 'Whichever is fuller', weighted: 'Weighted figure', raw: 'Raw total' }
        },
        quotaGuardPercent: {
            group: 'brakes', tier: 'basic', unit: '%', zeroMeans: 'off',
            label: 'Hold starts at',
            summary: 'Holds automatic task starts once the five-hour window is this full.'
        },
        quotaDowngradePercent: {
            group: 'brakes', unit: '%', zeroMeans: 'off',
            label: 'Downgrade at',
            summary: 'Moves farm-launched tasks to a cheaper model once the window is this full.'
        },
        quotaDowngradeModel: {
            group: 'brakes', control: 'model', engine: 'claude',
            label: 'Downgrade model',
            summary: 'The model tasks are moved to when the downgrade starts.'
        },
        trendAlertFactor: {
            group: 'forecast', zeroMeans: 'off',
            label: 'Trend alert at',
            summary: 'Warns when an agent\'s weekly cost reaches this multiple of the week before.'
        },
        // The check is a median + MAD test over the last 14 days.
        costAnomalyMinUsd: {
            group: 'forecast', unit: '$',
            label: 'Anomaly floor',
            summary: 'Days spending less than this are left out of the cost anomaly check.'
        },
        forecastDays: {
            group: 'forecast', unit: 'days',
            label: 'Forecast ahead',
            summary: 'How far ahead the task forecast projects scheduled runs.'
        },
        agentRowCostUnit: {
            group: 'display',
            label: 'Agent row usage',
            summary: 'Whether an agent\'s row shows today\'s tokens or today\'s cost.',
            options: { tokens: 'Tokens', cost: 'Cost' }
        }
    }
};
