import { CatalogSection } from './types';

export const media: CatalogSection = {
    id: 'media',
    label: 'Media & Studio',
    about: 'Media services, outputs, the library, the studio wall, publishing and the browser.',
    groups: [
        { id: 'services', label: 'Services and keys', about: 'The media services the tools call, and the names of their keys.' },
        { id: 'outputs', label: 'Outputs and uploads', about: 'Where the tools write, how much is kept, and what is uploaded.' },
        { id: 'library', label: 'Library', about: 'How files arriving in a media library are looked at and described.' },
        { id: 'studio', label: 'Studio wall', about: 'Which library, stages and kinds the studio wall shows, and what counts as a success.' },
        { id: 'airtable', label: 'Airtable inputs', about: 'Which Airtable records are offered as inputs, how many and in what order.' },
        { id: 'publishing', label: 'Publishing', about: 'Where content is published, who approves it, and how its performance is read.' },
        { id: 'browser', label: 'Browser', about: 'Which sites the browser may open, and whether you approve each visit.' }
    ],
    rows: {
        mediaAuthSecret: {
            group: 'services', tier: 'basic', control: 'secret',
            label: 'fal.ai key',
            summary: 'The Secrets name of your fal.ai key.'
        },
        replicateAuthSecret: {
            group: 'services', control: 'secret',
            label: 'Replicate key',
            summary: 'The Secrets name of your Replicate token.'
        },
        mediaBaseUrl: {
            group: 'services',
            label: 'fal.ai address',
            summary: 'A different fal.ai queue address, for testing or a proxy.'
        },
        replicateBaseUrl: {
            group: 'services',
            label: 'Replicate address',
            summary: 'A different Replicate API address, for testing or a proxy.'
        },
        outputsMaxMB: {
            group: 'outputs', tier: 'basic', unit: 'MB',
            label: 'Outputs folder limit',
            summary: 'How large the archived task outputs folder may grow.'
        },
        ingestFolders: {
            group: 'outputs',
            label: 'Watched media folders',
            summary: 'Folders whose new media files join the Media Gallery where they are.'
        },
        mediaUploadAuto: {
            group: 'outputs',
            label: 'Upload local files',
            summary: 'Whether a local file a media step names is uploaded to the provider.',
            options: { ask: 'Ask me', auto: 'Upload', never: 'Never' }
        },
        mediaUploadProvider: {
            group: 'outputs',
            label: 'Upload to',
            summary: 'Where a local file in a media input is uploaded.',
            options: { auto: 'Step\'s provider', fal: 'fal.ai', replicate: 'Replicate' }
        },
        mediaUploadRetentionDays: {
            group: 'outputs', unit: 'days',
            label: 'fal.ai keeps uploads for',
            summary: 'How long fal.ai keeps an uploaded file before it is uploaded again.'
        },
        toolOutDir: {
            group: 'outputs',
            label: 'Tool output folder',
            summary: 'Where a tool step writes what an ffmpeg recipe makes.'
        },
        toolOverwrite: {
            group: 'outputs',
            label: 'When a tool output exists',
            summary: 'What a tool step does when a file it would write is already there.',
            options: { never: 'Refuse', suffix: 'New name', always: 'Replace' }
        },
        libraryEnrich: {
            group: 'library',
            label: 'Describe run files',
            summary: 'When a model looks at a run\'s recorded files and fills in their records.',
            options: { end: 'At run end', record: 'As filed', never: 'Never' }
        },
        libraryEnrichScope: {
            group: 'library',
            label: 'Files to describe',
            summary: 'Which of a run\'s recorded files get described.',
            options: { 'final-failed': 'Final and failed', final: 'Final only', all: 'Every file' }
        },
        libraryEnrichModel: {
            group: 'library', control: 'model', engine: 'claude',
            label: 'Image model',
            summary: 'The Claude model that looks at an image to fill its record.'
        },
        libraryEnrichVideoModel: {
            group: 'library', control: 'model', engine: 'agy',
            label: 'Video model',
            summary: 'The Antigravity model that looks at a video to fill its record.'
        },
        libraryEnrichEffort: {
            group: 'library', control: 'effort', engine: 'claude',
            label: 'Describing effort',
            summary: 'The Claude effort for filling a record.'
        },
        libraryEnrichSections: {
            group: 'library', control: 'chips', from: 'enrichSection',
            label: 'Record sections',
            summary: 'Which record sections a model fills.'
        },
        libraryEnrichCap: {
            group: 'library', unit: '$', zeroMeans: 'off',
            label: 'Cost cap per record',
            summary: 'What one Claude turn may spend filling one record.'
        },
        allInWhen: {
            group: 'library',
            label: 'Waiting area processing',
            summary: 'When a media library\'s waiting area is processed by a model.',
            options: { daily: 'Daily', manual: 'By hand' }
        },
        // The bridge op media.allin can override it per pass.
        allInUnsure: {
            group: 'library',
            label: 'Unsure waiting files',
            summary: 'What happens to a waiting file the model is not sure of.',
            options: { ask: 'Ask on Notices', wait: 'Wait quietly' }
        },
        studioLibraryBase: {
            group: 'studio', control: 'airtableBase',
            label: 'Studio database',
            summary: 'Which local Airtable database the Studio wall reads.'
        },
        studioLibraryStages: {
            group: 'studio', control: 'chips', from: 'stage',
            label: 'Studio stages',
            summary: 'Which stage folders the Studio wall shows.'
        },
        studioLibraryKind: {
            group: 'studio',
            label: 'Studio media kind',
            summary: 'Which kind of media the Studio wall shows.',
            options: { image: 'Images', video: 'Videos', audio: 'Audio' }
        },
        studioLibrarySuccess: {
            group: 'studio',
            label: 'Studio outcome',
            summary: 'Whether the Studio wall shows passed files, failed ones, or both.',
            options: { passed: 'Passed', failed: 'Failed' }
        },
        studioLibraryPromote: {
            group: 'studio',
            label: 'Studio promotion',
            summary: 'Whether a promotion on the Studio wall asks first.',
            options: { ask: 'Ask first', auto: 'At once' }
        },
        airtableInputLimit: {
            group: 'airtable',
            label: 'Airtable input limit',
            summary: 'The most records an Airtable workflow input hands a run.'
        },
        airtableInputSort: {
            group: 'airtable',
            label: 'Airtable input order',
            summary: 'The order an Airtable workflow input hands its records in.',
            options: { newest: 'Newest first', oldest: 'Oldest first', name: 'By name' }
        },
        airtableInputStages: {
            group: 'airtable', control: 'chips', from: 'stage',
            label: 'Airtable input stages',
            summary: 'Which stage folders an Airtable input searches when it names none.'
        },
        publishApproval: {
            group: 'publishing', tier: 'basic',
            label: 'Publish approval',
            summary: 'Whether a publish step waits for your yes before it sends.',
            options: { ask: 'Ask me', auto: 'Publish', never: 'Rehearse only' }
        },
        publishPlatforms: {
            group: 'publishing',
            label: 'Publish platforms',
            summary: 'The platforms a publish step offers, in order of priority.'
        },
        // Frontmatter: title, date, startTime, completed; status is planned, producing, ready, published or
        // cancelled.
        contentCalendarDir: {
            group: 'publishing',
            label: 'Content calendar',
            summary: 'The vault folder holding one note per publish.'
        },
        metricsFields: {
            group: 'publishing',
            label: 'Metrics fields',
            summary: 'Which numbers a metrics step asks your n8n flow for.'
        },
        performanceBrief: {
            group: 'publishing',
            label: 'Performance in briefs',
            summary: 'Puts how similar published content performed into the briefs.'
        },
        browserAllowHosts: {
            group: 'browser',
            label: 'Allowed sites',
            summary: 'The sites browser steps may open, subdomains included.'
        },
        browserApproval: {
            group: 'browser', tier: 'basic',
            label: 'Browser approval',
            summary: 'Whether every browser step asks you before it runs.',
            options: { ask: 'Ask every time', auto: 'Run allowed sites' }
        }
    }
};
