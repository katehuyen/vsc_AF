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
        // wiki.compile and wiki.lint read it; the rules file is _KURALLAR_/-WIKI-ANAYASA-.md. What you type is kept
        // exactly as typed.
        wikiRoot: {
            group: 'wiki', tier: 'basic',
            label: 'Wiki folder',
            summary: 'The folder that holds the wiki the agents compile.'
        },
        // wiki.compile.run starts a headless run; the synthesis belongs to an agent, so a compile needs somebody to
        // be one.
        wikiAgent: {
            group: 'wiki', tier: 'basic',
            label: 'Wiki agent',
            summary: 'The agent that writes the wiki.'
        },
        wikiEngine: {
            group: 'wiki',
            label: 'Wiki engine',
            summary: 'The engine a wiki compile runs on.',
            options: { claude: 'Claude Code', codex: 'Codex', gemini: 'Gemini', agy: 'Antigravity', opencode: 'OpenCode' }
        },
        wikiModel: {
            group: 'wiki', control: 'model', engineFrom: 'wikiEngine',
            label: 'Wiki model',
            summary: 'The model a wiki compile runs on.'
        },
        wikiEffort: {
            group: 'wiki',
            label: 'Wiki effort',
            summary: 'The effort a wiki compile runs at.',
            options: { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max' }
        },
        embeddingsProvider: {
            group: 'search', tier: 'basic',
            label: 'Search by meaning',
            summary: 'Which service turns sessions into embeddings for search by meaning.',
            options: { off: 'Off', gemini: 'Gemini', openai: 'OpenAI-compatible' }
        },
        embeddingsModel: {
            group: 'search',
            label: 'Embedding model',
            summary: 'The model that makes the embeddings.'
        },
        embeddingsBaseUrl: {
            group: 'search',
            label: 'Embeddings address',
            summary: 'The embeddings endpoint, when it is not the provider\'s own.'
        },
        embeddingsSecret: {
            group: 'search', control: 'secret',
            label: 'Embeddings key',
            summary: 'The Secrets name of the embeddings key.'
        },
        semanticMaxSessions: {
            group: 'search',
            label: 'Sessions indexed',
            summary: 'How many recent sessions search by meaning covers.'
        },
        // The trail is 92 percent of the index by measurement: 254 MB after 977 sessions, 2.6 GB projected at 10,000,
        // about 300 MB with this. Applied on the first search of each window.
        searchToolTrailDays: {
            group: 'search', unit: 'days',
            label: 'Keep tool trails for',
            summary: 'How long a session\'s tool calls stay in the text search index.'
        }
    }
};
