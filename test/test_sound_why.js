// U-184 — "WHY DIDN'T I HEAR IT?" The engine's own decision, line by line, in
// the order fireAttention takes it: does the event ring for this session at all
// (the fleet switch ADDS to the session's own ♪), is the gate open (Mute all,
// Silent, quiet hours), which tone answers and can it be played; the verdict on
// top names the first ✗. ▶ Test now rehearses the REAL plan (fleet included)
// and writes every branch under the answer.
'use strict';
const path = require('path');
const fs = require('fs');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const ROOT = path.resolve(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');

// ---- the core ----
const { soundWhy } = require(path.join(ROOT, 'out', 'core', 'soundWhy.js'));
const base = {
    eventName: 'Turn finished', sessionEvent: true, fleetOn: true, sessionRings: false, reasons: [], quietLine: '23:00 – 08:00',
    tone: 'Crystal', origin: 'default', playable: true, skipped: [], sayWho: { on: false, spoken: false, voice: '' }, also: []
};
const a = soundWhy(base);
ok('everything open: heard, and the verdict names the tone', a.heard && a.lines[0].text === 'You would hear Crystal' && a.lines[0].ok === true);
ok('…and says which step chose it', a.lines.some(l => l.text === 'Tone: Crystal — the built-in default (step 4 of 4)'));
const silent = soundWhy({ ...base, reasons: ['session'] });
ok('‼️ a Silent session: not heard, and the verdict says why', !silent.heard && silent.lines[0].text === 'Silent — this session is Silent'
    && silent.lines.some(l => l.ok === false && l.text === 'This session is Silent'));
const two = soundWhy({ ...base, reasons: ['fleet', 'quiet-hours'] });
ok('‼️ two gates shut: BOTH are ✗, the verdict names the first', two.lines[0].text === 'Silent — Mute all is on'
    && two.lines.filter(l => l.ok === false).length === 3);
const off = soundWhy({ ...base, fleetOn: false });
ok('‼️ the fleet switch off and Like all: nothing rings — said as such', !off.heard
    && off.lines.some(l => l.text === 'Nothing rings on Turn finished: its fleet switch is off and this session is not set to Always'));
ok('…and Always rings it even with the fleet switch off', soundWhy({ ...base, fleetOn: false, sessionRings: true }).heard);
ok('an event a session cannot arm says only the fleet switch', soundWhy({ ...base, sessionEvent: false, fleetOn: false, eventName: 'Error' })
    .lines.some(l => l.text === 'Nothing rings on Error: its fleet switch is off'));
const bad = soundWhy({ ...base, playable: false, skipped: [{ origin: 'session', voice: 'Kapı zili', why: 'its file is gone' }] });
ok('‼️ an unplayable tone is the answer when it is the only ✗', !bad.heard && bad.lines[0].text === 'Silent — its tone cannot be played here');
ok('…and a passed-over step is said, not skipped silently', bad.lines.some(l => l.ok === null && /Passed over: Kapı zili \(this session's own choice\) — its file is gone/.test(l.text)));
ok('Say who said, in its voice', soundWhy({ ...base, sayWho: { on: true, spoken: true, voice: 'Tolga' } }).lines.some(l => l.text === 'Say who: said, in Tolga'));

// ---- the page ----
const fx = require(path.join(__dirname, 'fixtures', 'sound.js'));
const d = fx.inUse();
const r = runPage('sound.js', d);
const doc = r.sandbox.document;
const html = () => (doc.getElementById('app') || {}).innerHTML || '';
ok('‼️ the section is the last before the Library', html().indexOf('>Sessions<') < html().indexOf('>Why didn') && html().indexOf('>Why didn') < html().indexOf('>Library'));
ok('it asks for a session and an event', !!doc.getElementById('wysession') && !!doc.getElementById('wyevent'));
const fire = (el, type) => (el && el._listeners && el._listeners[type] || []).forEach(fn => fn({ stopPropagation() { }, preventDefault() { } }));
const ws = doc.getElementById('wysession');
const silentRow = d.sessions.find(x => x.sound === 'silent');
ws.value = silentRow.sessionId;
fire(ws, 'change');
const body = () => (doc.getElementById('wybody') || {}).innerHTML || '';
ok('‼️ picking the Silent session answers "This session is Silent"', /Silent — this session is Silent/.test(body()) && /✗<\/span> This session is Silent/.test(body()));
r.posted.length = 0;
fire(doc.getElementById('wytest'), 'click');
ok('‼️ Test now rehearses the REAL plan for that session and event',
    r.posted.some(m => m.type === 'alertSessionTest' && m.sessionId === silentRow.sessionId && m.event === 'turn-ready' && m.real === true));
ok('…and says it is coming', /Test in 3 s/.test(body()));
r.send({ type: 'soundTestResult', sessionId: silentRow.sessionId, event: 'turn-ready',
    result: { branches: [{ action: 'sound', status: 'skipped', detail: 'this session is Silent' }, { action: 'toast', status: 'ok' }] } });
ok('‼️ every branch is written under the answer', /– Ring — this session is Silent/.test(body()) && /✓ Notification/.test(body()));
r.posted.length = 0;
fire(doc.getElementById('wytest'), 'click');
r.send({ type: 'soundPopError', sessionId: silentRow.sessionId, error: 'nothing rings or shows on this event' });
ok('a refused test is shown in the section, not as a page error', /✗ Test: nothing rings or shows on this event/.test(body()));

// ---- the host half ----
const ext = src('src/extension.ts');
ok('each session row carries its answer per event', /why: Object\.fromEntries\(ALERT_EVENTS\.map\(event => \[event, soundWhy\(/.test(ext));
ok('‼️ the answer is built from the engine\'s own pieces: alertPlan, alertSilence, resolveAlertVoice',
    /const soundWhyFor = [\s\S]{0,1200}alertSilence\(id\)[\s\S]{0,600}resolveAlertVoice\(event, s\)/.test(ext));
ok('‼️ the real rehearsal adds the fleet switch the way fireAttention does',
    /real \? alertPlan\(event, turnAlerts\.actionsFor\(sessionId\), alertsOn\(\)\)\.actions : turnAlerts\.actionsFor\(sessionId\)/.test(ext));
ok('the bridge carries it too (live.alerts.test real)', /real\?: true rehearses/.test(ext));
const msgs = src('src/panels/alertMessages.ts');
ok('the test answer goes back to the page with its branches', /type: 'soundTestResult'/.test(msgs));

console.log(`\ntest_sound_why: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
