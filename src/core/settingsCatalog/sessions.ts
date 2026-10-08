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
        launchDefaults: { group: 'launch', tier: 'basic' },
        launchProfiles: { group: 'launch' },
        flexPresets: { group: 'flex' },
        flexOverrides: { group: 'flex' },
        'console.autoAnswer.enabled': { group: 'autoAnswer', tier: 'basic' },
        'console.autoAnswer.timeoutSeconds': { group: 'autoAnswer', tier: 'basic', unit: 's' },
        'console.autoAnswer.remindSeconds': { group: 'autoAnswer', unit: 's' },
        'console.autoAnswer.filter': { group: 'autoAnswer' },
        'console.autoAnswer.words': { group: 'autoAnswer' },
        permissionAnswerKeys: { group: 'guards' },
        bridgeGuard: { group: 'guards', tier: 'basic' },
        shellGuard: { group: 'guards', tier: 'basic' }
    }
};
