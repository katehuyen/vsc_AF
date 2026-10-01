/**
 * U-178 — the 🔊 Sound page, in the states the Settings card used to be shot in.
 * The rows are the Alert-sounds fixture's own (one resolver, one set of voices);
 * the page adds the Notification column, read from the notify* settings.
 *
 *   sound         — two events ring, tones picked, your own library
 *   sound-empty   — the first opening: nothing rings, the two-switch start
 *   sound-gated   — armed and configured, and silent: muted, quiet hours, two sessions
 *   sound-broken  — an armed tone whose file is gone, one nothing here can play
 */
const A = require('./alertsettings.js');

const NOTIFY = { 'turn-ready': false, 'console:turn-ready': true, question: true, stalled: true };
const of = (d, notify) => ({ alerts: d.alerts, notify: notify || NOTIFY });

const empty = () => of(A.fresh());
// U-182 — one conversation is being read aloud now, another reads its answers
const READERS = [
    { sessionId: 'aaaa1111-0000-0000-0000-000000000000', label: 'developer #3', reading: true },
    { sessionId: 'bbbb2222-0000-0000-0000-000000000000', label: 'psikolog', reading: false }
];
// U-183 — the live sessions as soundSessionRows builds them: one read now and
// Always, one reading in a voice of its own, one Silent, one like all the rest
const tone = (event, voice, chosen, origin, rings) => ({ event, chosen, voice, origin, rings });
const SESSIONS = [
    { sessionId: 'aaaa1111-0000-0000-0000-000000000000', label: 'developer #3', engine: 'Claude Code', sound: 'always',
        tones: [tone('turn-ready', 'af_crystal_turn', '', 'default', true), tone('question', 'u-kapi-zili', 'u-kapi-zili', 'session', true)],
        speechVoice: 'Microsoft Tolga - Turkish (Turkey)', read: true, reading: true, also: { focus: false, modal: false, toast: true } },
    { sessionId: 'bbbb2222-0000-0000-0000-000000000000', label: 'psikolog', engine: 'gemini', sound: 'like-all',
        tones: [tone('turn-ready', 'af_crystal_turn', '', 'default', true), tone('question', 'af_intercom_knock', '', 'default', true)],
        speechVoice: '', read: true, reading: false, also: { focus: false, modal: false, toast: false } },
    { sessionId: 'cccc3333-0000-0000-0000-000000000000', label: 'developer #2', engine: 'Codex', sound: 'silent',
        tones: [tone('turn-ready', 'af_crystal_turn', '', 'default', false), tone('question', 'af_intercom_knock', '', 'default', false)],
        speechVoice: '', read: false, reading: false, also: { focus: false, modal: false, toast: false } },
    { sessionId: 'dddd4444-0000-0000-0000-000000000000', label: 'developer #1', engine: 'Claude Code', sound: 'like-all',
        tones: [tone('turn-ready', 'af_crystal_turn', '', 'default', true), tone('question', 'af_intercom_knock', '', 'default', true)],
        speechVoice: '', read: false, reading: false, also: { focus: false, modal: false, toast: false } }
];
// U-184 — each row's "why" is the engine's own answer (core/soundWhy.ts), built
// from the row and the page's fleet switches the way soundWhyFor builds it
const W = require('../../out/core/soundWhy.js');
const withWhy = (d) => d.sessions.map(r => Object.assign(r, {
    why: Object.fromEntries((d.alerts.events || []).map(e => [e.event, W.soundWhy({
        eventName: W.WHY_EVENT_NAME[e.event] || e.event,
        sessionEvent: e.event === 'turn-ready' || e.event === 'question',
        fleetOn: e.on, sessionRings: r.sound === 'always', reasons: r.sound === 'silent' ? ['session'] : [],
        quietLine: '', tone: ((d.alerts.voices || []).find(v => v.id === e.voice) || {}).label || e.voice, origin: e.origin, playable: e.playable, skipped: [],
        sayWho: { on: false, spoken: false, voice: '' }, also: r.also.toast ? ['Notification'] : []
    })]))
}));
const inUse = () => {
    const d = of(A.inUse(), { 'turn-ready': true, 'console:turn-ready': false, question: true, stalled: false });
    d.alerts.speak = { ...d.alerts.speak, readers: READERS };
    d.sessions = JSON.parse(JSON.stringify(SESSIONS));
    withWhy(d);
    d.agents = agentsOf(d);
    return d;
};
// U-187 — every agent's tones as soundAgentRows builds them: one with two of its own
function agentsOf(d) {
    const id = label => ((d.alerts.voices || []).find(v => v.label === label) || {}).id || '';
    const own = { developer: { question: id('Zen bowl'), stalled: id('Marimba') }, 'sürüm-notları-yazarı': { 'turn-ready': id('Pop') } };
    return ['asistan', 'developer', 'psikolog', 'sürüm-notları-yazarı'].map(name => ({
        name,
        tones: (d.alerts.events || []).map(e => {
            const chosen = (own[name] || {})[e.event] || '';
            return { event: e.event, chosen, voice: chosen || e.voice, origin: chosen ? 'agent' : e.origin };
        })
    }));
}
const gated = () => of(A.gated());
const broken = () => of(A.broken());

const variants = () => ([
    { id: 'sound', label: 'Sound — in use: two events ring, your own library', data: inUse() },
    { id: 'sound-agents', label: 'Sound — Sessions › Agents pressed: two agents with tones of their own', data: inUse(),
        act: r => r.query('#sstab-agents')[0].click() },
    { id: 'sound-empty', label: 'Sound — the first opening: nothing rings yet', data: empty() },
    { id: 'sound-gated', label: 'Sound — ‼️ armed, configured and silent: muted · quiet hours · two sessions', data: gated() },
    { id: 'sound-broken', label: 'Sound — ‼️ armed tones whose sound cannot be played', data: broken() }
]);

module.exports = { script: 'sound.js', data: inUse, variants, empty, inUse, gated, broken };
