import { CatalogSection } from './types';

export const knowledge: CatalogSection = {
    id: 'knowledge',
    label: 'Knowledge',
    about: 'The wiki the agents compile and the search over past sessions.',
    groups: [
        {
            // X-57 — a group of its own: the folder is read and the page says whether it is a wiki at all, which a path in a box cannot
            id: 'wiki', label: 'Wiki',
            about: 'The folder the wiki lives in, and the agent and model that compile it.',
            terms: 'wiki knowledge base kb 00_WIKI vault obsidian anayasa constitution rules ' // i18n-exempt
                + 'index log compile candidate category categories portable path root'
        },
        { id: 'search', label: 'Search', about: 'How past sessions are searched by meaning, and how long their tool trails stay searchable.' }
    ],
    rows: {
        wikiRoot: { group: 'wiki', tier: 'basic' },
        wikiAgent: { group: 'wiki', tier: 'basic' },
        wikiEngine: { group: 'wiki' },
        wikiModel: { group: 'wiki' },
        wikiEffort: { group: 'wiki' },
        embeddingsProvider: { group: 'search', tier: 'basic' },
        embeddingsModel: { group: 'search' },
        embeddingsBaseUrl: { group: 'search' },
        embeddingsSecret: { group: 'search' },
        semanticMaxSessions: { group: 'search' },
        searchToolTrailDays: { group: 'search', unit: 'days' }
    }
};
