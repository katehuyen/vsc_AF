import { CatalogSection } from './types';

export const agents: CatalogSection = {
    id: 'agents',
    label: 'Agents',
    about: 'Which folders hold your agents and what a new agent starts with.',
    groups: [
        { id: 'folders', label: 'Agent folders', about: 'Where agents are found, which folders are skipped, and where the CLI keeps its own records.' },
        { id: 'defaults', label: 'New agents', about: 'The model and engine a new agent starts with.' },
        {
            // X-136 — a group of its own: the folder is read and the agents are listed by name, which a JSON box cannot do
            id: 'superpowers', label: 'Superpowers',
            about: 'The engineering discipline every session can be given, and which agents get it by default.',
            terms: 'superpowers skills discipline tdd debugging brainstorming plan hook ' // i18n-exempt
                + 'SKILL.md using-superpowers engineering agent default portable path root'
        }
    ],
    rows: {
        agentRoots: { group: 'folders', tier: 'basic' },
        excludeAgentDirs: { group: 'folders', tier: 'basic' },
        claudeDir: { group: 'folders' },
        extraClaudeDirs: { group: 'folders' },
        includeUnmatchedProjects: { group: 'folders' },
        newAgentModel: { group: 'defaults', tier: 'basic', control: 'model', engine: 'claude' },
        agentEngineDefaults: { group: 'defaults' },
        superpowersPath: { group: 'superpowers' },
        superpowersDefaults: { group: 'superpowers' }
    }
};
