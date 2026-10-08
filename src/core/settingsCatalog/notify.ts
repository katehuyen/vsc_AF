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
        notifyPermission: {
            group: 'notifications', tier: 'basic',
            label: 'Notify on permission requests',
            summary: 'Shows a notification when an agent waits for a permission.'
        },
        notifyTurnEnd: {
            group: 'notifications', tier: 'basic',
            label: 'Notify when a turn ends',
            summary: 'Shows a notification every time an agent finishes a turn.'
        },
        notifyConsoleTurnEnd: {
            group: 'notifications', tier: 'basic',
            label: 'Notify on Console turn end',
            summary: 'The corner box when a Console turn ends out of your sight.'
        },
        'alerts.on': {
            group: 'sound',
            label: 'Sound on these events',
            summary: 'Which events play their alert sound, for every session.'
        },
        'alerts.muted': {
            group: 'sound', tier: 'basic',
            label: 'Mute all sounds',
            summary: 'Mutes every alert sound across the farm.'
        },
        // Players that cannot lower their level: Windows SoundPlayer on a machine without WPF, Linux aplay.
        'alerts.toneVolume': {
            group: 'sound', tier: 'basic', unit: '%',
            label: 'Tone volume',
            summary: 'How loud the alert tones play.'
        },
        'alerts.quietHours': {
            group: 'sound',
            label: 'Do not disturb',
            summary: 'The hours the farm makes no sound in.'
        },
        // Built-ins: af_crystal_turn, af_intercom_knock, af_zen_chime, af_deep_sonar, af_lullaby_sleep,
        // af_marimba_success, af_pop_advance, af_subtle_alert, af_bell_urgent, af_pulse_start; earlier: chime-soft,
        // chime-bright, ask-double, ask-rise, low-pulse, tick-dry, bell-far, close-fall, error-buzz, alarm-urgent.
        'alerts.voices': {
            group: 'sound',
            label: 'Event sounds',
            summary: 'Which sound each event plays.'
        },
        'alerts.agentVoices': {
            group: 'sound',
            label: 'Sounds per agent',
            summary: 'Which sound each event plays for one agent\'s sessions.'
        },
        'alerts.nudge': {
            group: 'sound',
            label: 'Unanswered question reminder',
            summary: 'A light tone when a question is still unanswered minutes later.'
        },
        // A tone says what kind of news, not which of eight lanes; the speech rides behind the tone in the same queue
        // slot so nothing plays between. Windows keeps two voice sets, SAPI 5 (usually David and Zira) and
        // Speech_OneCore, where language packs go; this engine cannot reach the second.
        'alerts.speak': {
            group: 'sound',
            label: 'Say who',
            summary: 'Says which agent an alert is about, out loud.'
        },
        'alerts.reading': {
            group: 'sound',
            label: 'Reading voice',
            summary: 'How an answer sounds when it is read aloud.'
        },
        // An idle session never blocks the farm, so it is not a Needs You row, but one left waiting all afternoon is
        // a loop that never closed.
        idleSessionNoticeMinutes: {
            group: 'reminders', unit: 'min', zeroMeans: 'off',
            label: 'Idle session reminder',
            summary: 'How long a session waits for you before Notices reminds you.'
        },
        noticeStaleHours: {
            group: 'reminders', unit: 'h',
            label: 'Unread notice escalates after',
            summary: 'How long an unread important notice waits before it escalates.'
        },
        notifyWebhookUrl: {
            group: 'webhook',
            label: 'Webhook address',
            summary: 'The address farm notifications are posted to as JSON.'
        },
        notifyWebhookEvents: {
            group: 'webhook',
            label: 'Webhook events',
            summary: 'Which notification types are posted to the webhook.'
        }
    }
};
