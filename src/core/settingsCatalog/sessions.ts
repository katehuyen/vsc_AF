import { CatalogSection } from './types';

export const sessions: CatalogSection = {
    id: 'sessions',
    label: 'Sessions',
    about: 'What a new session starts as, and what answers for you when you are away.',
    groups: [
        { id: 'launch', label: 'Launch', about: 'What a new session starts as, and the setups you saved to start one with.' },
        { id: 'flex', label: 'Preferences', about: 'Your saved preference presets, and the levels you set over the built-in ones.' },
        {
            // K-43 — what happens to a question nobody is there to answer
            id: 'autoAnswer', label: 'Unanswered questions',
            about: 'What happens to a question a session asks while nobody is there to answer it.',
            terms: 'soru sorular question questions ask askuserquestion timeout zaman aşımı ' // i18n-exempt
                + 'otomatik cevap yanıt answer unanswered default pick choose wait' // i18n-exempt
        },
        {
            // U-119 — what Allow/Reject type into a blocked terminal sits beside the two guards over what a session may run
            id: 'guards', label: 'Permissions and guards',
            about: 'What Allow and Reject type into a blocked session, and the guards over what a session may run.'
        }
    ],
    rows: {
        launchDefaults: {
            group: 'launch', tier: 'basic',
            label: 'Launch defaults',
            summary: 'How every interactive session starts unless you choose otherwise.',
            fieldOptions: {
                engine: { claude: 'Claude Code', codex: 'Codex', gemini: 'Gemini', agy: 'Antigravity' },
                effort: { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max' },
                permissionMode: { plan: 'Plan', acceptEdits: 'Accept edits', auto: 'Auto', manual: 'Manual', dontAsk: 'Don\'t ask', bypassPermissions: 'Bypass permissions' }
            }
        },
        launchProfiles: {
            group: 'launch',
            label: 'Launch profiles',
            summary: 'Saved launch setups the Start Session launcher offers.',
            fields: {
                name: 'Name', agentId: 'Agent', engine: 'Engine', providerId: 'Route', tier: 'Tier',
                account: 'Sign-in', model: 'Model', variant: 'Variant', effort: 'Effort',
                permissionMode: 'Permissions', prompt: 'First prompt', superpowers: 'Superpowers', surface: 'Opens in'
            },
            fieldOptions: {
                surface: { console: 'Console', terminal: 'Terminal' }
            }
        },
        flexPresets: {
            group: 'flex',
            label: 'Preference presets',
            summary: 'Your own named sets of preference values.',
            fieldOptions: {
                scope: { global: 'Everywhere', project: 'One project' }
            }
        },
        flexOverrides: {
            group: 'flex',
            label: 'Agent and project preferences',
            summary: 'Preference values set for one agent or one project.'
        },
        // The agent is told the choice was made for it, not by the user. Destructive means a hold-back word
        // (Hold-back words), Turkish ones included.
        'console.autoAnswer.enabled': {
            group: 'autoAnswer', tier: 'basic',
            label: 'Answer questions on a timer',
            summary: 'Picks the recommended option when a question waits too long.'
        },
        'console.autoAnswer.timeoutSeconds': {
            group: 'autoAnswer', tier: 'basic', unit: 's',
            label: 'Answer after',
            summary: 'How long a Console question waits before the timer answers it.'
        },
        'console.autoAnswer.remindSeconds': {
            group: 'autoAnswer', unit: 's', zeroMeans: 'off',
            label: 'Remind before',
            summary: 'How long before the timer answers a question its reminder rings.'
        },
        'console.autoAnswer.filter': {
            group: 'autoAnswer',
            label: 'What holds a question back',
            summary: 'How much of a question is checked for the hold-back words.',
            options: { off: 'No filter', recommended: 'Chosen option', all: 'Every option', strict: 'Strict' }
        },
        'console.autoAnswer.words': {
            group: 'autoAnswer',
            label: 'Hold-back words',
            summary: 'Words that make a Console question wait for you.'
        },
        // A setting rather than a constant because the prompt belongs to the CLI and has changed shape. Nothing reads
        // the prompt back, so the message says which keys were sent, never that the tool was allowed.
        permissionAnswerKeys: {
            group: 'guards',
            label: 'Permission answer keys',
            summary: 'What Allow and Reject type into a session\'s terminal.'
        },
        bridgeGuard: {
            group: 'guards', tier: 'basic',
            label: 'Bridge guard',
            summary: 'Has an agent ask Agent Farm for a session instead of searching the disk.'
        },
        shellGuard: {
            group: 'guards', tier: 'basic',
            label: 'Shell guard',
            summary: 'Stops shell commands carrying text the shell would damage.'
        }
    }
};
