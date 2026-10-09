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
        projectsRoot: {
            group: 'folders', tier: 'basic',
            label: 'Projects folder',
            summary: 'The folder that holds your project folders.'
        },
        projectsArchiveRoot: {
            group: 'folders',
            label: 'Archive folder',
            summary: 'Where an archived project\'s folder is moved.'
        },
        // Documents are found by role and folders by holds, never by file name: decisions are one file each and the
        // backlog track ledger is not a note.
        projectSkeleton: {
            group: 'newProject',
            label: 'New project layout',
            summary: 'The folders and documents a new project folder starts with.',
            fieldOptions: {
                role: { charter: 'Charter', plan: 'Plan', people: 'People', log: 'Worklog', deliverables: 'Deliverables', backlog: 'Backlog', backloglog: 'Backlog log', brief: 'Brief' },
                holds: { decisions: 'Decisions', tracks: 'Tracks' }
            }
        },
        // Starts empty on purpose: a template is a claim about how you work. Id, folder and parent are identity, not
        // shape.
        projectTemplates: {
            group: 'newProject',
            label: 'Project templates',
            summary: 'Saved project shapes a new project can start from.'
        },
        projectStaleDays: {
            group: 'digest', tier: 'basic', unit: 'days', zeroMeans: 'off',
            label: 'Quiet after',
            summary: 'Days without activity before an active project is flagged quiet.'
        },
        // Off by default: a digest nobody asked for is one more unread notice. The board itself guards once-a-week,
        // so two open windows cannot double-post.
        projectDigestDay: {
            group: 'digest', tier: 'basic', control: 'weekday',
            label: 'Weekly digest weekday',
            summary: 'The weekday each open project\'s weekly digest is posted on.'
        },
        projectDigestHour: {
            group: 'digest', tier: 'basic', control: 'hour',
            label: 'Weekly digest time',
            summary: 'The local hour after which the weekly digest may be posted.'
        },
        // Empty because Agent Farm ships general: what an agent should do with a project is the user's to say.
        projectContextExtra: {
            group: 'context',
            label: 'Extra project context',
            summary: 'One line of your own added to every project session\'s context.'
        }
    }
};
