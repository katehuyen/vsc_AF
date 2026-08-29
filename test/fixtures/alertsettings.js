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
    // A-22 — the two boxes the gate strip replaces. Here so the fixture proves
    // they are ABSORBED: a raw JSON box beside the card that already draws them
    // would be two controls for one setting.
    {
        key: 'agentFarm.alerts.muted', type: 'boolean', default: false,
        value: false, modified: false,
        description: 'Mute every alert SOUND, across the whole farm.'
    },
    {
        key: 'agentFarm.alerts.quietHours', type: 'object',
        default: { on: false, from: '23:00', to: '08:00' },
        value: { on: false, from: '23:00', to: '08:00' }, modified: false,
        description: 'The hours the farm makes no noise in.'
    },
    {
        key: 'agentFarm.stuckThresholdSeconds', type: 'number', default: 180,
        value: 180, modified: false,
        description: 'Seconds of silence before a working session is called stalled.'
    }
]);

/** A-22 — nothing is holding the gate shut: the state every install starts in
 *  and the one the three variants above are drawn in. */
const NUDGE_DEFAULTS = { minutes: 3, repeat: 2, voice: 'af_subtle_alert' };
const NUDGE_OFF = { minutes: 0, repeat: 0, voice: 'af_subtle_alert', on: false, armed: 0, defaults: NUDGE_DEFAULTS };
const NUDGE_ON = { minutes: 4, repeat: 3, voice: 'af_subtle_alert', on: true, armed: 2, defaults: NUDGE_DEFAULTS };

const GATE_OPEN = {
    muted: false,
    quiet: {
        configured: false, inside: false, from: '23:00', to: '08:00',
        nextChangeAt: 0, inMinutes: 0, line: 'Quiet hours off (23:00–08:00)'
    },
    silence: { silent: false, reasons: [] },
    mutedSessions: [],
    nudge: NUDGE_OFF
};

/**
 * U-123 - the second tap on the shoulder, in the two states worth a picture:
 * off (the shipped default, and what a fresh install looks like) and armed with
 * questions actually waiting, which is the only state the "n waiting" chip and
 * the head badge exist in.
 */

const SOUNDS = 'c:\\Users\\rotam\\.vscode\\extensions\\muvusoft.agent-farm\\media\\sounds';
const MINE = 'D:\\zone\\media\\sounds';

/**
 * ‼️ A-20 — THE VOICES AND THE DEFAULTS ARE READ FROM THE CORE, NOT RESTATED.
 *
 * This list used to be typed out here, and A-20 is exactly the change that
 * proves why that is wrong: the ten modern voices arrived, all five defaults
 * moved, and the fixture went on drawing the old ones. A picture that is the
 * only check on how the page LOOKS cannot be allowed to show a page that no
 * longer exists — every string test passed while the screenshot lied.
 */
const V = require('../../out/core/alertVoices.js');
const T = require('../../out/core/turnAlerts.js');
const S = require('../../out/core/speech.js');

const BUILTIN = V.builtinVoices(SOUNDS.replace(/\\/g, '/')).map(v => ({
    ...v, file: v.file.replace(/\//g, '\\'),
    exists: true, playable: true, backend: 'powershell'
}));

const FALLBACK = V.DEFAULT_VOICE;

/** What this platform's players declare, from the one table they are built
 *  from — so the card's "any file this machine can play" line is the truth. */
const FORMATS = [...new Set(
    T.soundCandidates('win32', '').flatMap(c => [...c.formats])
)].sort();

/** The library the user built. One of them is a `.mid` — a real file, and
 *  nothing on Windows opens it, which the row has to say rather than offer.
 *  (It used to be an `.aiff`; A-20 gave Windows an ffmpeg route that opens
 *  those, so the example had to move to something still genuinely refused.) */
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
        id: 'u-studio-take', label: 'Studio take', file: MINE + '\\studio-take.mid',
        builtin: false, exists: true, playable: false, backend: null
    }
];

/**
 * ‼️ A-25 — THE VOICES THIS MACHINE HAS, AS WINDOWS REALLY REPORTS THEM.
 *
 * Both registries, because that IS the trap the strip exists to make visible:
 * `System.Speech` enumerates the two `sapi5` rows and nothing else, so a reader
 * looking at the classic list concludes their language pack never installed.
 * These four are the ones measured on the machine A-20 was written on —
 * `Microsoft Tolga` among them, already there and previously unreachable.
 */
const SPEECH_VOICES = S.parseVoiceList([
    'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Speech_OneCore\\Voices\\Tokens\\MSTTS_V110_trTR_TolgaM\tMicrosoft Tolga - Turkish (Turkey)\ttr-TR\tonecore',
    'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Speech_OneCore\\Voices\\Tokens\\TTS_MS_EN-US_DAVID_11.0\tMicrosoft David - English (United States)\ten-US\tonecore',
    'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Speech_OneCore\\Voices\\Tokens\\TTS_MS_EN-US_MARK_11.0\tMicrosoft Mark - English (United States)\ten-US\tonecore',
    'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Speech_OneCore\\Voices\\Tokens\\TTS_MS_EN-US_ZIRA_11.0\tMicrosoft Zira - English (United States)\ten-US\tonecore',
    'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Speech\\Voices\\Tokens\\TTS_MS_EN-US_DAVID_11.0\tMicrosoft David Desktop\ten-US\tsapi5',
    'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Speech\\Voices\\Tokens\\TTS_MS_EN-US_ZIRA_11.0\tMicrosoft Zira Desktop\ten-US\tsapi5'
].join('\n'));

/**
 * The announcement strip's data, resolved the way `alertsPage` resolves it —
 * so the fixture cannot draw a state the real host would never produce. The
 * sentence, the ceiling and the match are all the CORE's, never restated:
 * A-20 is the proof of why (the ten voices moved and the hand-written fixture
 * went on drawing the old ones while every string test passed).
 */
const speakOf = (over, voices, sessions) => {
    const cfg = S.speakConfig({ ...S.SPEAK_DEFAULT, ...(over || {}) });
    // `undefined` is "this machine's list"; `null` is the state before the
    // answer has arrived, which is NOT the same as having no voices.
    const known = voices === undefined ? SPEECH_VOICES : (voices || []);
    const hit = S.matchVoice(known, cfg.voice);
    return {
        ...cfg,
        defaults: S.SPEAK_DEFAULT,
        max: S.SPEAK_MAX,
        preview: S.announcement(cfg, {
            event: cfg.events[0] || 'question', agent: 'developer', session: 'sess-1'
        }),
        voices: known.map(v => ({ ...v, label: S.voiceLabel(v) })),
        voicesLoaded: voices !== null,
        voicesError: '',
        voicesNote: S.SPEECH_ONECORE_NOTE,
        resolved: hit ? S.voiceLabel(hit) : '',
        resolvedName: hit ? hit.name : '',
        sessions: sessions || []
    };
};

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

const page = (on, chosen, voices, skips, gate, speak) => ({
    gate: gate || GATE_OPEN,
    speak: speak || speakOf(),
    folder: 'c:\\Users\\rotam\\AppData\\Roaming\\Code\\User\\globalStorage\\muvusoft.agent-farm\\sounds',
    limit: 10,
    formats: FORMATS,
    sessionEvents: ['turn-ready', 'question'],
    voices,
    events: ['turn-ready', 'question', 'stalled', 'ended', 'error']
        .map(e => rowOf(voices, on, chosen, e, (skips || {})[e]))
});

const base = (on, chosen, voices, skips, gate, speak) => ({
    focus: '', profiles: [], prompts: null, docOpen: null, folders: null,
    claude: null, engines: null, engineModels: null, wiki: null, superpowers: null,
    modelAliases: ['haiku', 'sonnet', 'opus', 'fable'],
    categories: [{
        id: 'live', label: 'Live Monitoring & Alerts', items: ITEMS(on, chosen)
    }],
    alerts: page(on, chosen, voices, skips, gate, speak)
});

/**
 * ‼️ A-25 — AND THE ANNOUNCEMENT STRIP BEFORE THE VOICE LIST HAS ARRIVED. This
 * is the first second of every page open: the list costs a PowerShell process,
 * so the box says it is READING rather than drawing an empty picker — which is
 * the state a reader would take for "this machine cannot speak", the opposite
 * of the truth.
 */
const fresh = () => base({}, {}, BUILTIN, null, null, speakOf({}, null));

/**
 * ‼️ A-25 — SET UP AND WORKING, which for the announcement means the strip can
 * say WHO is speaking. `Tolga` is a fragment, and the resolved line is the only
 * place a reader can see that it reaches `Microsoft Tolga - Turkish (Turkey)`
 * rather than nothing at all. One conversation carries a voice of its own —
 * the state no settings box could ever have shown.
 */
const inUse = () => base(
    { 'turn-ready': true, question: true },
    { question: 'u-kapi-zili', ended: 'u-uzak-gong' },
    BUILTIN.concat(CUSTOM), null,
    // U-123 - a farm that is set up has the nudge on, and the head says so.
    { ...GATE_OPEN, nudge: NUDGE_ON },
    speakOf(
        { on: true, voice: 'Tolga', events: ['question', 'stalled'], rate: 1 },
        undefined,
        [{
            sessionId: 'c3d4e5f6-1111-2222-3333-444455556666',
            label: 'yazar · sürüm notları', voice: 'Microsoft Zira Desktop'
        }]));

/**
 * ‼️ Three different breakages at once, because they are three different
 * answers and a card that draws them the same way is no use:
 *
 *   - `question` points at a file the user deleted in Explorer. The chain
 *     reports the step it passed over and falls to the built-in `ask-double`,
 *     so THE ALERT STILL RINGS — a wrong sound is fixable, silence is not.
 *   - `turn-ready` points at a format nothing on Windows opens. Same
 *     fall-through, different sentence.
 *   - `error` is armed and the built-in it falls back to IS ITSELF GONE — a partial
 *     update, the one case where the chain runs out of steps and the event
 *     really would be silent. This is the state the badge has to shout about.
 */
const broken = () => base(
    { 'turn-ready': true, question: true, stalled: true, error: true },
    { question: 'u-kapi-zili', 'turn-ready': 'u-studio-take' },
    BUILTIN.map(v => v.id === V.DEFAULT_VOICE.error
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
    },
    null,
    // ‼️ A-25 — A FOURTH BREAKAGE, and the one with no symptom until it is too
    // late: the announcement is ON and names a voice NOTHING ON THIS MACHINE
    // ANSWERS TO. The engine's reply is `exit 5` — the sentence FAILS rather
    // than being read out in English — so the only place the reader can find
    // out before the alert does is this strip.
    speakOf({ on: true, voice: 'Ayşe', events: ['question', 'error'] }));

/**
 * ‼️ A-22 — THE STATE THE CARD USED TO HAVE NO WAY OF SHOWING. Everything is
 * armed and correctly configured, and not one of it makes a sound: the farm is
 * muted AND it is 03:12, inside the quiet window, AND two conversations are
 * muted on their own. All three are reported, because unmuting here would still
 * leave the farm silent and a card that named only the first would have sent
 * the reader looking in the wrong place.
 */
const gated = () => base(
    { 'turn-ready': true, question: true, stalled: true },
    { question: 'u-kapi-zili' },
    BUILTIN.concat(CUSTOM),
    null,
    {
        muted: true,
        quiet: {
            configured: true, inside: true, from: '23:00', to: '08:00',
            nextChangeAt: Date.now() + 4.8 * 3600_000, inMinutes: 288,
            line: 'Quiet hours 23:00–08:00 — silent until 08:00'
        },
        silence: {
            silent: true, reason: 'fleet', reasons: ['fleet', 'quiet-hours'],
            detail: 'the farm is muted (the 🔇 in the status bar) · quiet hours 23:00–08:00, silent until 08:00'
        },
        mutedSessions: [
            { sessionId: 'a1b2c3d4-1111-2222-3333-444455556666', label: 'developer · TalkScribe' },
            { sessionId: 'b2c3d4e5-1111-2222-3333-444455556666', label: 'yazar · release notes' }
        ],
        nudge: NUDGE_ON
    },
    // The announcement goes through the SAME gate: armed, configured, correct —
    // and held shut with everything else. The strip says what it would say; the
    // strip above it says why nobody will hear it.
    speakOf({ on: true, voice: 'Mark', events: ['question'] }));

const data = () => inUse();

const variants = () => ([
    { id: 'alertsettings', label: 'Settings ▸ Alert sounds — in use, with the user\'s own library', data: inUse() },
    { id: 'alertsettings-fresh', label: 'Settings ▸ Alert sounds — nothing armed, nothing chosen', data: fresh() },
    {
        id: 'alertsettings-broken',
        label: 'Settings ▸ Alert sounds — ‼️ armed events whose sound cannot be played',
        data: broken()
    },
    {
        id: 'alertsettings-gated',
        label: 'Settings ▸ Alert sounds — ‼️ armed, configured, and silent: muted · quiet hours · two sessions',
        data: gated()
    }
]);

module.exports = { script: 'settings.js', data, variants, fresh, inUse, broken, gated };
