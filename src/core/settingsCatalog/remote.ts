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
        'web.enabled': { group: 'web', tier: 'basic' },
        'web.port': { group: 'web' },
        'web.bind': { group: 'web' },
        'web.token': { group: 'web' },
        'remote.listen': { group: 'bridge' },
        'remote.port': { group: 'bridge' },
        'telegram.enabled': { group: 'telegram', tier: 'basic' },
        'telegram.allowedChats': { group: 'telegram' },
        'telegram.defaultAgent': { group: 'telegram', tier: 'basic' },
        'telegram.maxDailyUSD': { group: 'telegram', unit: '$' },
        'telegram.digest': { group: 'telegram' },
        'telegram.whenBusy': { group: 'telegram' }
    }
};
