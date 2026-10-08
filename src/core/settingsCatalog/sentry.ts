import { CatalogSection } from './types';

/**
 * X-193 — the sentry is a section of its own: a reader tuning an overnight campaign had to find the words it
 * starts on, the folders it reads, the leader's leash and three thresholds scattered down a page about task
 * concurrency. Grouped, the page answers the questions somebody arrives with — where does it look, what does it
 * say, what may the leader spend, when does it give up. `answerDir` stays with the work queue (it is where an
 * answer is WRITTEN) and `automation.*` is the gate over every unattended thing, not over this one.
 */
export const sentry: CatalogSection = {
    id: 'sentry',
    label: 'Sentry',
    about: 'Unattended campaigns: where they look, what they say, and what the leader may spend.',
    groups: [
        {
            id: 'sources', label: 'Handover note sources',
            about: 'The note the last session left is what the next one is started on. The sources are tried IN ORDER and the first that answers wins, so the order is the setting — drag a row to change it.'
        },
        {
            id: 'words', label: 'Opening words',
            about: 'One pool, read twice: a block whose heading names a verdict is a template the mechanical round fills, and every block is material the leader blends. Empty is normal — the built-in templates answer every verdict with no file of yours anywhere.'
        },
        {
            id: 'leader', label: 'Leader',
            about: 'The leader is woken only when one of the campaign\'s own conditions fires, so a routine night costs nothing. These are what it may spend when it is: a cheap model by default, a ceiling per turn, a budget per day, and a number of failures after which it stops being asked.'
        },
        {
            id: 'stall', label: 'Stall rules',
            about: 'A session that has produced nothing for N minutes is probably waiting for a permission nobody is there to give. These decide how long the campaign waits before it ends that round and opens the next.'
        }
    ],
    rows: {
        handoverSources: { group: 'sources' },
        handoverFolders: { group: 'sources' },
        sentryTemplatesFile: { group: 'words' },
        sentryInstructionFiles: { group: 'words' },
        sentryLeaderEngine: { group: 'leader' },
        sentryLeaderModel: { group: 'leader', tier: 'basic' },
        sentryLeaderBudgetUsd: { group: 'leader', tier: 'basic', unit: '$' },
        sentryLeaderMaxUsd: { group: 'leader', unit: '$' },
        sentryLeaderMaxSeconds: { group: 'leader', unit: 's' },
        sentryLeaderFailLimit: { group: 'leader', zeroMeans: 'off' },
        sentryFailureLimit: { group: 'stall', zeroMeans: 'off' },
        sentryIdlePollMin: { group: 'stall', unit: 'min' },
        sentryStallMin: { group: 'stall', tier: 'basic', unit: 'min', zeroMeans: 'off' }
    }
};
