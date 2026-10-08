import { CatalogSection } from './types';

export const projects: CatalogSection = {
    id: 'projects',
    label: 'Projects',
    about: 'Where projects live, how a new one is laid out and when their digests go out.',
    groups: [
        { id: 'folders', label: 'Folders', about: 'The folder projects are kept in, and the one they are archived to.' },
        { id: 'newProject', label: 'New projects', about: 'What a new project folder starts with.' },
        { id: 'digest', label: 'Digest and staleness', about: 'When a quiet project counts as stale, and when its weekly digest is posted.' },
        { id: 'context', label: 'Session context', about: 'What every session started inside a project is told on top.' }
    ],
    rows: {
        projectsRoot: { group: 'folders', tier: 'basic' },
        projectsArchiveRoot: { group: 'folders' },
        projectSkeleton: { group: 'newProject' },
        projectTemplates: { group: 'newProject' },
        projectStaleDays: { group: 'digest', tier: 'basic', unit: 'days', zeroMeans: 'off' },
        projectDigestDay: { group: 'digest', tier: 'basic', control: 'weekday' },
        projectDigestHour: { group: 'digest', tier: 'basic', control: 'hour' },
        projectContextExtra: { group: 'context' }
    }
};
