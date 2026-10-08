import { CatalogSection } from './types';

export const monitor: CatalogSection = {
    id: 'monitor',
    label: 'Monitoring & Health',
    about: 'How live sessions are watched and how the farm\'s health is checked.',
    groups: [
        {
            // S-52 — sessionBreakMin sits with the settings that say how a session's figures are READ: it decides when a pause stops being thinking and becomes away
            id: 'live', label: 'Live sessions',
            about: 'How live sessions are found and read: when one counts as active, when a pause is a break, and how much of it is kept.'
        },
        {
            // U-158 — the stuck warning is one question (after how long, and whether you are told), so its two keys are one group
            id: 'stuck', label: 'Stuck warning',
            about: 'Two different things. The **number** says WHEN: a working session silent for that many seconds is marked stalled and its card says so. 0 turns the warning off — nothing is ever marked stalled, so the box has nothing to announce. The **box** says whether you are told: ticked, the stalled session gets a Needs You row and a pop-up notification; unticked, only its card shows the mark.'
        },
        {
            // U-154 — the three quota figures' looks are one question, shown on a sample line
            id: 'quotaFigures', label: 'Quota figures',
            about: 'Percent used, time left and reset time are drawn in their own look on every page — accounts, engines, dashboard, console. Each box takes CSS declarations (colour, weight, font…); empty is the default. At 75% and 90% a percent takes the page\'s warning colour instead. A change repaints open pages at once.'
        },
        { id: 'health', label: 'Health checks', about: 'The checks that keep the agents\' memory, context and permissions in shape.' },
        { id: 'insights', label: 'Insights', about: 'The pulse, the quality samples and the suggestions drawn from past sessions.' }
    ],
    rows: {
        liveMonitor: { group: 'live', tier: 'basic' },
        livePort: { group: 'live' },
        activeThresholdSeconds: { group: 'live', unit: 's' },
        sessionBreakMin: { group: 'live', unit: 'min', zeroMeans: 'off' },
        contextWindowTokens: { group: 'live', unit: 'tokens' },
        maxTranscriptMessages: { group: 'live' },
        stuckThresholdSeconds: { group: 'stuck', tier: 'basic', unit: 's', zeroMeans: 'off' },
        notifyStuck: { group: 'stuck', tier: 'basic' },
        'quotaStyle.percent': { group: 'quotaFigures' },
        'quotaStyle.left': { group: 'quotaFigures' },
        'quotaStyle.reset': { group: 'quotaFigures' },
        livingChecks: { group: 'health', tier: 'basic' },
        staleMemoryDays: { group: 'health', unit: 'days' },
        contextBudgetTokens: { group: 'health', unit: 'tokens' },
        permissionLint: { group: 'health' },
        pulse: { group: 'insights', tier: 'basic' },
        insightAutoDelegate: { group: 'insights' },
        qualitySample: { group: 'insights' },
        qualitySamplesPerAgent: { group: 'insights' },
        suggestScan: { group: 'insights' },
        packGalleryRepos: { group: 'insights' }
    }
};
