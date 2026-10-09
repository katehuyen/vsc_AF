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
        // The note the last session left is what the next one is started on, and the first source that answers wins.
        {
            id: 'sources', label: 'Handover note sources',
            about: 'Where the last session\'s handover note is looked for: the sources are tried in order and the first that answers wins, so drag a row to change it.'
        },
        // One pool, read twice: a block whose heading names a verdict is a template the mechanical round fills, and
        // every block is material the leader blends.
        {
            id: 'words', label: 'Opening words',
            about: 'Your own words a campaign starts the next session with; left empty, the built-in ones answer.'
        },
        // The leader is woken only when one of the campaign's own conditions fires, so a routine night costs nothing:
        // a cheap model by default, a ceiling per turn, a budget per day, and a number of failures after which it
        // stops being asked.
        {
            id: 'leader', label: 'Leader',
            about: 'What the leader may spend; it is woken only when one of the campaign\'s own conditions fires, so a routine night costs nothing.'
        },
        // A session that has produced nothing for a while is probably waiting for a permission nobody is there to
        // give; these decide how long the campaign waits before it ends that round and opens the next.
        {
            id: 'stall', label: 'Stall rules',
            about: 'When a campaign gives up on a silent round or on a run of barren ones.'
        }
    ],
    rows: {
        // transcript is the most truthful source: where the agent actually wrote beats where a setting says it should
        // have. A folder that cannot be read is reported as unknown, never as empty. A file scores on the session id
        // in its name, the session having written it, the word devir or handover, a near date and the canonical
        // YYYY-MM-DD_devir_##_<id8>_<topic>.md pattern.
        handoverSources: {
            group: 'sources',
            label: 'Where to look',
            summary: 'Where a campaign looks for the last session\'s handover note, in order.'
        },
        handoverFolders: {
            group: 'sources',
            label: 'Handover folders',
            summary: 'The folders the configured source looks in, in order.'
        },
        // Placeholders {nextCode}, {handoverPath}, {evidence} and {assist} are filled; one nothing answers is left
        // visible. A path not on disk is reported, never cleared. sentry.templates shows what was read and refused; a
        // heading that names no verdict becomes material the leader blends (sentry.instructions).
        sentryTemplatesFile: {
            group: 'words',
            label: 'Opening words file',
            summary: 'A file of your own opening words for the next session, by verdict.'
        },
        // Read after the opening words file; the two are assembled, not chosen between, and a file named in both is
        // read once. A path whose variables cannot be filled is skipped with its reason; a missing one is reported
        // and the rest still reads. sentry.instructions shows what a leader woken on a verdict would be given.
        sentryInstructionFiles: {
            group: 'words',
            label: 'Instruction files',
            summary: 'Your own saved instructions a campaign draws on, as an ordered list of files.'
        },
        // The command line and the reply envelope are both the engine's own adapter; refusing by name beats quietly
        // spawning claude and reporting a turn nobody asked for.
        sentryLeaderEngine: {
            group: 'leader', control: 'engine',
            label: 'Leader engine',
            summary: 'The engine a sentry leader turn runs on.'
        },
        // An unattended loop is not where an expensive model belongs: this family was rewritten after a $70.90 bill
        // from asking a model something that could have been counted.
        sentryLeaderModel: {
            group: 'leader', tier: 'basic', control: 'model', engineFrom: 'sentryLeaderEngine',
            label: 'Leader model',
            summary: 'The model a sentry leader turn runs on.'
        },
        sentryLeaderBudgetUsd: {
            group: 'leader', tier: 'basic', unit: '$',
            label: 'Leader daily budget',
            summary: 'What one campaign\'s leader turns may spend per day.'
        },
        sentryLeaderMaxUsd: {
            group: 'leader', unit: '$',
            label: 'Leader turn ceiling',
            summary: 'What one leader turn may cost.'
        },
        sentryLeaderMaxSeconds: {
            group: 'leader', unit: 's',
            label: 'Leader turn time limit',
            summary: 'How long one leader turn may take before it is cut.'
        },
        // A leader that cannot produce readable JSON is a leader nobody should keep paying for.
        sentryLeaderFailLimit: {
            group: 'leader', zeroMeans: 'off',
            label: 'Leader failures allowed',
            summary: 'Failed leader turns in a row after which the leader is no longer asked.'
        },
        // Such sessions fail instantly and spend nothing, so no quota catches them. A campaign may carry its own
        // limit (sentry.start failLimit).
        sentryFailureLimit: {
            group: 'stall', zeroMeans: 'off',
            label: 'Barren rounds allowed',
            summary: 'Barren rounds in a row that switch a campaign off.'
        },
        // An empty backlog is a wait, not a finish. The beat is the one the farm already keeps, not a timer of the
        // sentry's own.
        sentryIdlePollMin: {
            group: 'stall', unit: 'min',
            label: 'Idle check every',
            summary: 'How often an idling campaign looks at the backlog again.'
        },
        // The loop is driven by rounds ending, and a parked session spends nothing, so the quota never breaks the
        // deadlock. Failed counts against the failure brake; cancelled is your own hand and would stop the campaign.
        sentryStallMin: {
            group: 'stall', tier: 'basic', unit: 'min', zeroMeans: 'off',
            label: 'Stalled round after',
            summary: 'How long a round may stay silent before the watchdog ends it.'
        }
    }
};
