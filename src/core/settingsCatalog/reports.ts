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
        dailyDigest: { group: 'digests', tier: 'basic' },
        weeklySummary: { group: 'digests', tier: 'basic' },
        digestTtsModel: { group: 'spoken' },
        digestTtsFolder: { group: 'spoken' },
        autoReport: { group: 'autoReport', tier: 'basic' },
        autoReportFolder: { group: 'autoReport' },
        autoReportDays: { group: 'autoReport', unit: 'days' },
        autoReportIncludeOutputs: { group: 'autoReport' }
    }
};
