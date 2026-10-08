import { CatalogSection } from './types';

export const engines: CatalogSection = {
    id: 'engines',
    label: 'Engines & Accounts',
    about: 'The sign-ins, providers and engine folders this machine can start sessions with.',
    groups: [
        {
            // X-171 — no token is in these: the credentials stay in each account's own directory
            id: 'accounts', label: 'Accounts',
            about: 'The captured sign-ins, which of them are in use, and the rules each one runs under.'
        },
        {
            // X-100 — "which providers can this machine reach"; a route's key is in the OS keychain, never here
            id: 'providers', label: 'Providers and models',
            about: 'The routes and CLI profiles a session can start on, and the model names every picker offers.'
        },
        {
            // opencodeHistory is not a path: OpenCode writes no transcript, so it switches whether its CLI is RUN to read history
            id: 'homes', label: 'Engine folders',
            about: 'Where each engine keeps its sessions on this machine, and live feeds from other machines.'
        }
    ],
    rows: {
        // The identity of the running session is never touched; the credentials stay in the account's own directory.
        accounts: {
            group: 'accounts',
            label: 'Captured accounts',
            summary: 'The engine sign-ins captured on this machine.'
        },
        // Not remembered per agent: how much of a plan is left is a state that changes hourly, not a preference, so
        // one place holds it and one gesture moves it.
        activeAccounts: {
            group: 'accounts', tier: 'basic',
            label: 'Next account per engine',
            summary: 'Which account the next session on each engine uses.'
        },
        // Refusing rather than falling through to the main sign-in protects the plan the rule was written for.
        accountPolicies: {
            group: 'accounts', tier: 'basic',
            label: 'Account rules',
            summary: 'Named rules for which sign-in a launch runs on.'
        },
        // The id is permanent because the key is filed under it, and a copy starts with no key. A profile naming
        // another engine is refused so there are never two vaults where the stale one wins. revision counts up when
        // the route (provider, endpoint, auth kind, tier mapping) or its key changes, never on a rename; a launch
        // records the revision it ran on.
        providerProfiles: {
            group: 'providers',
            label: 'Provider routes',
            summary: 'The Anthropic-compatible routes Claude Code can start on.'
        },
        // A different axis from a task's engine. Live hooks remain Claude Code's alone.
        cliProfiles: {
            group: 'providers',
            label: 'CLI profiles',
            summary: 'Command lines a task can run when no engine fits.'
        },
        modelAliases: {
            group: 'providers',
            label: 'Model names',
            summary: 'The model names every model picker offers.'
        },
        codexHome: {
            group: 'homes',
            label: 'Codex home',
            summary: 'Where Codex keeps the transcripts read into the history.'
        },
        geminiDir: {
            group: 'homes',
            label: 'Gemini folder',
            summary: 'Where Gemini keeps the chats read into the history.'
        },
        agyHome: {
            group: 'homes',
            label: 'Antigravity home',
            summary: 'Where Antigravity keeps the index read into the history.'
        },
        // The one history source that runs its CLI (session list, then export for what moved), on a slow beat and
        // never while a panel draws.
        opencodeHistory: {
            group: 'homes',
            label: 'Read opencode history',
            summary: 'Lists OpenCode conversations in the sessions tables.'
        },
        relayFeeds: {
            group: 'homes',
            label: 'Relay feeds',
            summary: 'Live session feeds synced from other machines.'
        }
    }
};
