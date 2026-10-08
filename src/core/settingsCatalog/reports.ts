import { CatalogSection } from './types';

export const reports: CatalogSection = {
    id: 'reports',
    label: 'Reports',
    about: 'The daily and weekly digests and the automatic reports.',
    groups: [
        { id: 'digests', label: 'Digests', about: 'Whether a daily digest and a weekly summary are written.' },
        { id: 'spoken', label: 'Spoken digest', about: 'The voice model a digest is read aloud with, and where the recording goes.' },
        { id: 'autoReport', label: 'Automatic reports', about: 'Whether reports are written by themselves, how often, where to, and what they include.' }
    ],
    rows: {
        dailyDigest: {
            group: 'digests', tier: 'basic', control: 'time',
            label: 'Daily digest',
            summary: 'Posts a compact fleet scorecard to the webhook after a time of day.'
        },
        weeklySummary: {
            group: 'digests', tier: 'basic',
            label: 'Weekly summary',
            summary: 'Writes a three-sentence fleet summary once a week.'
        },
        digestTtsModel: {
            group: 'spoken',
            label: 'Briefing voice model',
            summary: 'The fal.ai voice model the spoken briefing is recorded with.'
        },
        digestTtsFolder: {
            group: 'spoken',
            label: 'Briefing audio folder',
            summary: 'Where the spoken briefing\'s audio file is saved.'
        },
        autoReport: {
            group: 'autoReport', tier: 'basic',
            label: 'Automatic reports',
            summary: 'Writes a fleet report into the reports folder on a schedule.',
            options: { off: 'Off', daily: 'Daily', weekly: 'Weekly' }
        },
        autoReportFolder: {
            group: 'autoReport',
            label: 'Automatic reports folder',
            summary: 'Where automatic fleet reports are written.'
        },
        autoReportDays: {
            group: 'autoReport', unit: 'days',
            label: 'Report period',
            summary: 'How many days an automatic report covers.'
        },
        autoReportIncludeOutputs: {
            group: 'autoReport',
            label: 'Include task outputs',
            summary: 'Appends the archived task-outputs digest to automatic reports.'
        }
    }
};
