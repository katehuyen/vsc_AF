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
            about: 'The **number** says WHEN a working session silent that long is marked stalled; 0 turns the warning off. The **box** says whether you are told: ticked, a Needs You row and a pop-up; unticked, only its card shows the mark.'
        },
        {
            // U-154 — the three quota figures' looks are one question, shown on a sample line
            id: 'quotaFigures', label: 'Quota figures',
            about: 'How a quota\'s percent, time left and reset time look on every page, as CSS.'
        },
        { id: 'health', label: 'Health checks', about: 'The checks that keep the agents\' memory, context and permissions in shape.' },
        { id: 'insights', label: 'Insights', about: 'The pulse, the quality samples and the suggestions drawn from past sessions.' }
    ],
    rows: {
        liveMonitor: {
            group: 'live', tier: 'basic',
            label: 'Live event listener',
            summary: 'Receives Claude Code\'s live events on this machine.'
        },
        livePort: {
            group: 'live',
            label: 'Listener port',
            summary: 'The port the live event listener listens on.'
        },
        activeThresholdSeconds: {
            group: 'live', unit: 's',
            label: 'Active within',
            summary: 'How recently a transcript must change for its session to count as active.'
        },
        // Without it cost per hour was divided by the user's sleep. The wall clock stays on the cell, next to what
        // was actually run.
        sessionBreakMin: {
            group: 'live', unit: 'min', zeroMeans: 'off',
            label: 'Break after',
            summary: 'How long a pause between turns lasts before it counts as a break.'
        },
        contextWindowTokens: {
            group: 'live', unit: 'tokens',
            label: 'Context window',
            summary: 'The ceiling every Context now figure is measured against.'
        },
        maxTranscriptMessages: {
            group: 'live',
            label: 'Messages shown',
            summary: 'How many messages the session viewer draws at most.'
        },
        stuckThresholdSeconds: {
            group: 'stuck', tier: 'basic', unit: 's', zeroMeans: 'off',
            label: 'Stuck after',
            summary: 'How long a working session can stay silent before it is marked stalled.'
        },
        notifyStuck: {
            group: 'stuck', tier: 'basic',
            label: 'Notify when a session stalls',
            summary: 'Adds a Needs You row and a notification when a session stalls.'
        },
        'quotaStyle.percent': {
            group: 'quotaFigures',
            label: 'Quota usage look',
            summary: 'CSS for how a quota\'s percent is drawn on every page.'
        },
        'quotaStyle.left': {
            group: 'quotaFigures',
            label: 'Quota time-left look',
            summary: 'CSS for how a quota\'s time left is drawn on every page.'
        },
        'quotaStyle.reset': {
            group: 'quotaFigures',
            label: 'Quota reset-time look',
            summary: 'CSS for how a quota\'s reset time is drawn on every page.'
        },
        livingChecks: {
            group: 'health', tier: 'basic',
            label: 'Living page checks',
            summary: 'Conditions the Living page watches, each read as needing attention when true.'
        },
        staleMemoryDays: {
            group: 'health', unit: 'days',
            label: 'Memory stale after',
            summary: 'How long a memory file can go untouched before it is flagged.'
        },
        contextBudgetTokens: {
            group: 'health', unit: 'tokens',
            label: 'Context budget',
            summary: 'The fixed context load above which an agent is warned.'
        },
        permissionLint: {
            group: 'health',
            label: 'Audit permission rules',
            summary: 'Checks each agent\'s permission rules and reports findings in Insights.'
        },
        pulse: {
            group: 'insights', tier: 'basic',
            label: 'Pulse checks',
            summary: 'A cheap scheduled prompt that checks each agent still answers as itself.',
            options: { off: 'Off', nightly: 'Nightly', weekly: 'Weekly' }
        },
        insightAutoDelegate: {
            group: 'insights',
            label: 'Delegate insights automatically',
            summary: 'Insight categories handed to their agent as a task when they appear.'
        },
        qualitySample: {
            group: 'insights',
            label: 'Quality sampling',
            summary: 'Scores recent session outputs with a cheap judge on a schedule.',
            options: { off: 'Off', daily: 'Daily', weekly: 'Weekly' }
        },
        qualitySamplesPerAgent: {
            group: 'insights',
            label: 'Samples per agent',
            summary: 'How many unscored recent sessions per agent each sampling run scores.'
        },
        suggestScan: {
            group: 'insights',
            label: 'Suggest instruction rules',
            summary: 'A weekly scan of your corrections that proposes CLAUDE.md rules.',
            options: { off: 'Off', weekly: 'Weekly' }
        },
        packGalleryRepos: {
            group: 'insights',
            label: 'Pack gallery sources',
            summary: 'Where agent packs are offered from: git addresses or local folders.'
        }
    }
};
