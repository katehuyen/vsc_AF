import { CatalogSection } from './types';

export const notify: CatalogSection = {
    id: 'notify',
    label: 'Notifications & Sound',
    about: 'What tells you something happened: notifications, sounds, reminders and webhooks.',
    groups: [
        { id: 'notifications', label: 'Notifications', about: 'Which events open a VS Code notification.' },
        {
            // A-18 — in the same section as the notification switches ON PURPOSE: the two are constantly confused, and
            // filed apart "I turned the sound off and a notification still arrives" reads as a bug. A-22: the mute
            // and quiet-hours gate sits with them, so a search for "mute" lands on the card rather than beneath it.
            id: 'sound', label: 'Sound',
            about: 'Which events ring, in whose voice, how loud, and when the farm stays quiet.',
            terms: 'sound sounds ses tone tones ring beep chime voice speak announce say who read aloud quiet hours mute' // i18n-exempt
        },
        { id: 'reminders', label: 'Reminders', about: 'When an idle session or an unread notice is brought back to you.' },
        { id: 'webhook', label: 'Webhook', about: 'Events posted to an address of your own.' }
    ],
    rows: {
        notifyPermission: { group: 'notifications', tier: 'basic' },
        notifyTurnEnd: { group: 'notifications', tier: 'basic' },
        notifyConsoleTurnEnd: { group: 'notifications', tier: 'basic' },
        'alerts.on': { group: 'sound' },
        'alerts.muted': { group: 'sound', tier: 'basic' },
        'alerts.toneVolume': { group: 'sound', tier: 'basic' },
        'alerts.quietHours': { group: 'sound' },
        'alerts.voices': { group: 'sound' },
        'alerts.agentVoices': { group: 'sound' },
        'alerts.nudge': { group: 'sound' },
        'alerts.speak': { group: 'sound' },
        'alerts.reading': { group: 'sound' },
        idleSessionNoticeMinutes: { group: 'reminders', unit: 'min', zeroMeans: 'off' },
        noticeStaleHours: { group: 'reminders', unit: 'h' },
        notifyWebhookUrl: { group: 'webhook' },
        notifyWebhookEvents: { group: 'webhook' }
    }
};
