import { CatalogSection } from './types';

export const remote: CatalogSection = {
    id: 'remote',
    label: 'Remote Access',
    about: 'Reaching the farm from outside this window: the web view, the bridge port and Telegram.',
    groups: [
        { id: 'web', label: 'Web view', about: 'The farm\'s pages served to a browser on this machine or your network.' },
        { id: 'bridge', label: 'Remote bridge', about: 'Whether another machine may call this farm\'s bridge, and on which port.' },
        {
            id: 'telegram', label: 'Telegram',
            about: 'The bot that lets you reach the farm from your phone, who may talk to it and what it may spend.',
            terms: 'telegram bot phone mobile chat bridge remote token botfather ' // i18n-exempt
                + 'allowlist chat id budget ceiling daily usd getMe poller polling'
        }
    ],
    rows: {
        'web.enabled': {
            group: 'web', tier: 'basic',
            label: 'Web view',
            summary: 'Serves a read-only view of the farm to a browser, sized for a phone.'
        },
        'web.port': {
            group: 'web',
            label: 'Web view port',
            summary: 'The port the web view listens on.'
        },
        'web.bind': {
            group: 'web',
            label: 'Reachable from',
            summary: 'Whether the web view answers this machine only or your network too.',
            options: { local: 'This machine', lan: 'Your network' }
        },
        'web.token': {
            group: 'web', control: 'token',
            label: 'Web view access key',
            summary: 'The access token the web view asks for.'
        },
        'remote.listen': {
            group: 'bridge',
            label: 'Phone app access',
            summary: 'Where the Agent Farm phone app can reach this farm from.',
            options: { off: 'Off', local: 'This machine', lan: 'Your network', tailscale: 'Tailscale' }
        },
        'remote.port': {
            group: 'bridge',
            label: 'Phone app port',
            summary: 'The port the phone app connects to.'
        },
        // A chat run is headless; /new <agent> [prompt] opens a real Console session focused on the chat.
        'telegram.enabled': {
            group: 'telegram', tier: 'basic',
            label: 'Telegram chats',
            summary: 'Lets a Telegram chat talk to your agents.'
        },
        'telegram.allowedChats': {
            group: 'telegram',
            label: 'Allowed chats',
            summary: 'The Telegram chat ids that may drive the farm.'
        },
        'telegram.defaultAgent': {
            group: 'telegram', tier: 'basic',
            label: 'Default agent',
            summary: 'The agent a new chat talks to until it picks one.'
        },
        'telegram.maxDailyUSD': {
            group: 'telegram', unit: '$',
            label: 'Daily remote budget',
            summary: 'What remote work from Telegram and the phone app may cost per day.'
        },
        'telegram.digest': {
            group: 'telegram',
            label: 'Turn cards',
            summary: 'Which conversations send the chat a card when a turn ends.',
            options: { focused: 'Focused one', all: 'All live', off: 'Off' }
        },
        // The queue is part of the saved chat state, so a message parked before a window reload is still there after
        // it.
        'telegram.whenBusy': {
            group: 'telegram',
            label: 'When the agent is busy',
            summary: 'What a chat message meets when the agent is already working.',
            options: { queue: 'Wait', steer: 'Steer' }
        }
    }
};
