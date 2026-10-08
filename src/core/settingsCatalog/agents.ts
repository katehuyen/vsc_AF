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
        agentRoots: {
            group: 'folders', tier: 'basic',
            label: 'Agent folders',
            summary: 'The folders scanned for your agents.'
        },
        excludeAgentDirs: {
            group: 'folders', tier: 'basic',
            label: 'Skipped folders',
            summary: 'Folders never treated as agents, even when they look like one.'
        },
        claudeDir: {
            group: 'folders',
            label: 'Claude Code data folder',
            summary: 'Where Claude Code keeps its sessions on this machine.'
        },
        extraClaudeDirs: {
            group: 'folders',
            label: 'Synced Claude folders',
            summary: 'Claude data folders synced from other machines, read only.'
        },
        includeUnmatchedProjects: {
            group: 'folders',
            label: 'Show sessions outside agents',
            summary: 'Also lists sessions started outside your agent folders.'
        },
        newAgentModel: {
            group: 'defaults', tier: 'basic', control: 'model', engine: 'claude',
            label: 'New agent model',
            summary: 'The model written into a new agent\'s own settings.'
        },
        // A Claude row's providerId + tier is an environment isolation, not a flag: the route's base url, key and
        // tier model are injected after every inherited ANTHROPIC_* and route-bearing CLAUDE_* variable is cleared,
        // so a base url left in the shell cannot answer twice. Without providerId nothing is cleared or injected.
        // providers.runtime on the bridge shows what a launch would run on.
        agentEngineDefaults: {
            group: 'defaults',
            label: 'Per-agent engine defaults',
            summary: 'Each agent\'s default model and effort on engines other than Claude.'
        },
        // Skills sleep on disk at zero tokens. What is typed is kept as typed and expanded when the folder is opened;
        // empty searches _SKILLS/superpowers under each agent root (or beside a one-agent root), the first that holds
        // the hook.
        superpowersPath: {
            group: 'superpowers',
            label: 'Superpowers folder',
            summary: 'The folder holding the Superpowers engineering skills.'
        },
        // Switched on, the appended system prompt carries the root hook plus an index of where the skills are; the
        // skills stay on disk and are read one at a time. A session started outside the panel (a task, a terminal, a
        // resume) has only this to go on.
        superpowersDefaults: {
            group: 'superpowers',
            label: 'Superpowers by default',
            summary: 'Which agents start a session with Superpowers switched on.'
        }
    }
};
