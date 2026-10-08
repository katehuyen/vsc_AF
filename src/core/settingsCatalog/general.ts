import { CatalogSection } from './types';

export const general: CatalogSection = {
    id: 'general',
    label: 'General',
    about: 'Language, display and the folders the farm writes to.',
    groups: [
        { id: 'language', label: 'Language', about: 'The language the interface and the guides speak.' },
        { id: 'display', label: 'Display', about: 'How the Console looks and how speakers are named in a transcript.' },
        {
            // X-188 — vaultDir sits with the folders that USE it: "where does what the agents write end up" is one question.
            id: 'folders', label: 'Folders',
            about: 'Where the vault, the reports and the agents\' scratch files are on this machine.'
        },
        {
            // a group of its own: the setting is one path, and what the reader needs to see is what came OUT of it
            id: 'prompts', label: 'Saved prompts',
            about: 'The file your saved prompts are read from, and every prompt that was found in it.',
            terms: 'saved prompts snippet snippets template templates kalıp kalip prompt file ' // i18n-exempt
                + 'console send right-click paste markdown fence block phrases reuse boilerplate'
        }
    ],
    rows: {
        language: { group: 'language', tier: 'basic' },
        guideLanguage: { group: 'language' },
        consoleDropZone: { group: 'display', tier: 'basic' },
        speakerLabelTemplate: { group: 'display' },
        speakerLabelCase: { group: 'display' },
        speakerLabelFallback: { group: 'display' },
        vaultDir: { group: 'folders', tier: 'basic' },
        reportDir: { group: 'folders', tier: 'basic' },
        workArea: { group: 'folders' },
        promptSnippetsFile: { group: 'prompts', tier: 'basic' }
    }
};
