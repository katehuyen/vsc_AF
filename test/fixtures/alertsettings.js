/**
 * A-21 — Settings ▸ Live Monitoring & Alerts ▸ the Alert sounds card, in the
 * states the two JSON boxes it replaces could not tell apart:
 *
 *   1. FRESH   — nothing armed, nothing chosen. Every row still names the
 *                sound it WOULD play and where that answer came from, which is
 *                the whole reason the boxes went: `{}` said nothing about a
 *                feature that already has five different tones.
 *   2. IN USE  — two events armed, sounds picked, three of the user's own in
 *                the library, one of them a format nothing here opens.
 *   3. BROKEN  — an armed event pointing at a sound whose FILE HAS GONE. The
 *                chain falls through to the step below rather than going
 *                silent, and the row has to say so: the loudest of the three,
 *                because a wrong sound is fixable and silence is
 *                indistinguishable from the switch being off.
 */
const ITEMS = (on, voices) => ([
    {
        key: 'agentFarm.notifyTurnEnd', type: 'boolean', default: false,
        value: true, modified: true,
        description: 'Show a VS Code notification when a session\'s turn ends.'
    },
    {
        key: 'agentFarm.alerts.on', type: 'object', default: {}, value: on,
        modified: Object.keys(on).length > 0,
        description: 'Play the alert SOUND on these events, for every session.'
    },
    {
        key: 'agentFarm.alerts.voices', type: 'object', default: {}, value: voices,
        modified: Object.keys(voices).length > 0,
        description: 'Which sound each event plays.'
    },
    {
        key: 'agentFarm.stuckThresholdSeconds', type: 'number', default: 180,
        value: 180, modified: false,
        description: 'Seconds of silence before a working session is called stalled.'
    }
]);

const SOUNDS = 'c:\\Users\\rotam\\.vscode\\extensions\\muvusoft.agent-farm\\media\\sounds';
const MINE = 'D:\\zone\\media\\sounds';

const BUILTIN = [
    ['chime-soft', 'Chime, soft', 'turn-ready.wav'],
    ['chime-bright', 'Chime, bright', 'chime-bright.wav'],
    ['ask-double', 'Ask — two knocks', 'ask-double.wav'],
    ['ask-rise', 'Ask — rising', 'ask-rise.wav'],
    ['low-pulse', 'Low pulse', 'low-pulse.wav'],
    ['tick-dry', 'Tick, dry', 'tick-dry.wav'],
    ['bell-far', 'Bell, distant', 'bell-far.wav'],
    ['close-fall', 'Close — falling', 'close-fall.wav'],
    ['error-buzz', 'Error buzz', 'error-buzz.wav'],
    ['alarm-urgent', 'Alarm, urgent', 'alarm-urgent.wav']
].map(([id, label, asset]) => ({
    id, label, file: SOUNDS + '\\' + asset, builtin: true,
    exists: true, playable: true, backend: 'powershell'
}));

const FALLBACK = {
    'turn-ready': 'chime-soft', question: 'ask-double', stalled: 'low-pulse',
    ended: 'close-fall', error: 'error-buzz'
};

/** The library the user built. One of them is an `.aiff` — a real file, and
 *  nothing on Windows opens it, which the row has to say rather than offer. */
const CUSTOM = [
    {
        id: 'u-kapi-zili', label: 'Kapı zili', file: MINE + '\\kapi-zili.mp3',
        builtin: false, exists: true, playable: true, backend: 'powershell'
    },
    {
        id: 'u-uzak-gong', label: 'Uzak gong', file: MINE + '\\uzak-gong.ogg',
        builtin: false, exists: true, playable: true, backend: 'powershell'
    },
    {
        id: 'u-studio-take', label: 'Studio take', file: MINE + '\\studio-take.aiff',
        builtin: false, exists: true, playable: false, backend: null
    }
];

const voiceOf = (voices, id) => voices.find(v => v.id === id);

/** The resolution, done the way `alertVoices.resolveVoice` does it, so the
 *  fixture cannot draw a row the real chain would never produce. */
const rowOf = (voices, on, chosen, event, skipped) => {
    const want = chosen[event] ? voiceOf(voices, chosen[event]) : null;
    const good = want && want.exists && want.playable;
    const landed = good ? want : voiceOf(voices, FALLBACK[event]);
    return {
        event, on: on[event] === true, chosen: chosen[event] || '',
        fallback: FALLBACK[event],
        voice: landed.id, origin: good ? 'settings' : 'default',
        file: landed.file, playable: landed.playable,
        skipped: good ? [] : (skipped || [])
    };
};

const page = (on, chosen, voices, skips) => ({
    folder: 'c:\\Users\\rotam\\AppData\\Roaming\\Code\\User\\globalStorage\\muvusoft.agent-farm\\sounds',
    limit: 10,
    formats: ['m4a', 'mp3', 'ogg', 'wav', 'wma'],
    sessionEvents: ['turn-ready', 'question'],
    voices,
    events: ['turn-ready', 'question', 'stalled', 'ended', 'error']
        .map(e => rowOf(voices, on, chosen, e, (skips || {})[e]))
});

const base = (on, chosen, voices, skips) => ({
    focus: '', profiles: [], prompts: null, docOpen: null, folders: null,
    claude: null, engines: null, engineModels: null, wiki: null, superpowers: null,
    modelAliases: ['haiku', 'sonnet', 'opus', 'fable'],
    categories: [{
        id: 'live', label: 'Live Monitoring & Alerts', items: ITEMS(on, chosen)
    }],
    alerts: page(on, chosen, voices, skips)
});

const fresh = () => base({}, {}, BUILTIN);

const inUse = () => base(
    { 'turn-ready': true, question: true },
    { question: 'u-kapi-zili', ended: 'u-uzak-gong' },
    BUILTIN.concat(CUSTOM));

/**
 * ‼️ Three different breakages at once, because they are three different
 * answers and a card that draws them the same way is no use:
 *
 *   - `question` points at a file the user deleted in Explorer. The chain
 *     reports the step it passed over and falls to the built-in `ask-double`,
 *     so THE ALERT STILL RINGS — a wrong sound is fixable, silence is not.
 *   - `turn-ready` points at a format nothing on Windows opens. Same
 *     fall-through, different sentence.
 *   - `error` is armed and its built-in `error-buzz` IS ITSELF GONE — a partial
 *     update, the one case where the chain runs out of steps and the event
 *     really would be silent. This is the state the badge has to shout about.
 */
const broken = () => base(
    { 'turn-ready': true, question: true, stalled: true, error: true },
    { question: 'u-kapi-zili', 'turn-ready': 'u-studio-take' },
    BUILTIN.map(v => v.id === 'error-buzz'
        ? { ...v, exists: false, playable: false, backend: null } : v).concat([
        { ...CUSTOM[0], exists: false, playable: false, backend: null },
        CUSTOM[1], CUSTOM[2]
    ]),
    {
        question: [{
            origin: 'settings', voice: 'u-kapi-zili',
            why: 'the file is gone: ' + MINE + '\\kapi-zili.mp3'
        }],
        'turn-ready': [{
            origin: 'settings', voice: 'u-studio-take',
            why: 'nothing on this machine plays .aiff'
        }]
    });

const data = () => inUse();

const variants = () => ([
    { id: 'alertsettings', label: 'Settings ▸ Alert sounds — in use, with the user\'s own library', data: inUse() },
    { id: 'alertsettings-fresh', label: 'Settings ▸ Alert sounds — nothing armed, nothing chosen', data: fresh() },
    {
        id: 'alertsettings-broken',
        label: 'Settings ▸ Alert sounds — ‼️ armed events whose sound cannot be played',
        data: broken()
    }
]);

module.exports = { script: 'settings.js', data, variants, fresh, inUse, broken };
