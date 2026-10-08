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
        accounts: { group: 'accounts' },
        activeAccounts: { group: 'accounts', tier: 'basic' },
        accountPolicies: { group: 'accounts', tier: 'basic' },
        providerProfiles: { group: 'providers' },
        cliProfiles: { group: 'providers' },
        modelAliases: { group: 'providers' },
        codexHome: { group: 'homes' },
        geminiDir: { group: 'homes' },
        agyHome: { group: 'homes' },
        opencodeHistory: { group: 'homes' },
        relayFeeds: { group: 'homes' }
    }
};
