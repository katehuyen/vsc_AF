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

const NOTIFY = { 'turn-ready': false, question: true, stalled: true };
const of = (d, notify) => ({ alerts: d.alerts, notify: notify || NOTIFY });

const empty = () => of(A.fresh());
// U-182 — one conversation is being read aloud now, another reads its answers
const READERS = [
    { sessionId: 'aaaa1111-0000-0000-0000-000000000000', label: 'developer #3', reading: true },
    { sessionId: 'bbbb2222-0000-0000-0000-000000000000', label: 'psikolog', reading: false }
];
const inUse = () => {
    const d = of(A.inUse(), { 'turn-ready': true, question: true, stalled: false });
    d.alerts.speak = { ...d.alerts.speak, readers: READERS };
    return d;
};
const gated = () => of(A.gated());
const broken = () => of(A.broken());

const variants = () => ([
    { id: 'sound', label: 'Sound — in use: two events ring, your own library', data: inUse() },
    { id: 'sound-empty', label: 'Sound — the first opening: nothing rings yet', data: empty() },
    { id: 'sound-gated', label: 'Sound — ‼️ armed, configured and silent: muted · quiet hours · two sessions', data: gated() },
    { id: 'sound-broken', label: 'Sound — ‼️ armed tones whose sound cannot be played', data: broken() }
]);

module.exports = { script: 'sound.js', data: inUse, variants, empty, inUse, gated, broken };
