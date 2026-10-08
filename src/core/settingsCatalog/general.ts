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
        language: {
            group: 'language', tier: 'basic',
            label: 'Interface language',
            summary: 'The language Agent Farm\'s pages are drawn in.',
            options: { auto: 'Follow VS Code', en: 'English', tr: 'Türkçe' }
        },
        guideLanguage: {
            group: 'language',
            label: 'Guide language',
            summary: 'The language of the Guide, Quick Start and Examples.',
            options: { en: 'English', tr: 'Türkçe' }
        },
        consoleDropZone: {
            group: 'display', tier: 'basic',
            label: 'Drop files onto the Console',
            summary: 'Lets a file dropped anywhere on the Console page be attached.'
        },
        // Built per message from its model id, so a Gemini or Codex turn labels itself; it replaced a fixed ASSISTANT
        // / claude label.
        speakerLabelTemplate: {
            group: 'display',
            label: 'AI speaker label',
            summary: 'How the AI\'s turns are labelled in transcripts and their exports.'
        },
        speakerLabelCase: {
            group: 'display',
            label: 'Speaker label case',
            summary: 'The letter case of the AI speaker label.',
            options: { page: 'Match the page', upper: 'Upper case', lower: 'Lower case', asis: 'As written' }
        },
        speakerLabelFallback: {
            group: 'display',
            label: 'Unknown model label',
            summary: 'The AI speaker label when the model cannot be told.'
        },
        vaultDir: {
            group: 'folders', tier: 'basic',
            label: 'Notes vault',
            summary: 'Your notes vault, which other folder settings can build on.'
        },
        reportDir: {
            group: 'folders', tier: 'basic',
            label: 'Reports folder',
            summary: 'Where agents\' full reports are written.'
        },
        // Every process and terminal Agent Farm starts carries it as AGENT_FARM_WORKAREA; retired folders are listed
        // by farm.workArea, and refusing writes there stops agents writing to the old place out of habit.
        workArea: {
            group: 'folders',
            label: 'Scratch folder',
            summary: 'The agents\' folder for drafts, fixtures, logs and temporary scripts.'
        },
        promptSnippetsFile: {
            group: 'prompts', tier: 'basic',
            label: 'Saved prompts file',
            summary: 'The markdown file your saved prompts are read from.'
        }
    }
};
