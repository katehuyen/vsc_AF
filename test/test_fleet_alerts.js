// U-213 — THE FARM-WIDE EVENTS RING ON THE PC TOO. A new notice, a question
// card, a workflow asking you, an account's quota running out and a mission
// ending are rows of the Sound page's table: one dictionary with the session
// events, the same gate (Mute all, quiet hours) and queue, their own switch
// alone arming them, the question card and the workflow on out of the box.
'use strict';
const path = require('path');
const fs = require('fs');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const ROOT = path.resolve(__dirname, '..');
const core = m => require(path.join(ROOT, 'out', 'core', m));
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');

// ---- one dictionary ----
const V = core('alertVoices.js');
const G = core('alertGate.js');
const SP = core('speechPhrases.js');
const W = core('soundWhy.js');
const H = core('soundHeader.js');
const S = core('speech.js');
const R = core('remoteEvents.js');
ok('every event has a label, a built-in default tone, a rank in the queue, a Why name and a header name',
    V.ALERT_EVENTS.every(e => V.EVENT_LABEL[e] && V.BUILTIN_IDS.indexOf(V.DEFAULT_VOICE[e]) >= 0
        && typeof G.EVENT_PRIORITY[e] === 'number' && W.WHY_EVENT_NAME[e] && H.SOUND_EVENT_LABEL[e]));
ok('…and words in every language the announcement speaks',
    Object.values(SP.SPEECH_PHRASES).every(p => V.ALERT_EVENTS.every(e => typeof p.events[e] === 'string' && p.events[e].length > 0)));
ok('a card or a workflow waiting on a person ranks with a question; a plain notice ranks last',
    G.EVENT_PRIORITY['notice-question'] === G.EVENT_PRIORITY.question && G.EVENT_PRIORITY.gate === G.EVENT_PRIORITY.question
    && Math.max(...Object.values(G.EVENT_PRIORITY)) === G.EVENT_PRIORITY.notice);
const remote = src('src/core/remoteEvents.ts');
ok('the phone names in the dictionary are types the remote host really emits',
    Object.values(V.ALERT_REMOTE).every(t => remote.indexOf(`type: '${t}'`) >= 0));
ok('the announcement says a farm-wide event in the voice\'s language, named by what it is about',
    S.announcement({ template: '{agent}, {event}' }, { event: 'gate', agent: 'Weekly cut' }, SP.SPEECH_PHRASES.tr) === 'Weekly cut, bir iş akışı sana soruyor'
    && S.announcement({ template: '{agent}, {event}' }, { event: 'mission', agent: 'Ship v2' }, SP.SPEECH_PHRASES.en) === 'Ship v2, mission ended');

// ---- "why didn't I hear it?" with no session ----
const base = {
    eventName: 'Question card', fleet: true, sessionEvent: false, fleetOn: true, sessionRings: false, reasons: [], quietLine: '',
    tone: 'Pulse', origin: 'default', playable: true, skipped: [], sayWho: { on: false, spoken: false, voice: '' }, also: []
};
const heard = W.soundWhy(base);
ok('a farm-wide event is heard with its switch on, and no line speaks of a session',
    heard.heard && !heard.lines.some(l => /session/i.test(l.text)));
ok('…its switch off: nothing rings, and only the switch is named',
    W.soundWhy({ ...base, fleetOn: false }).lines.some(l => l.text === 'Nothing rings on Question card: its fleet switch is off'));
ok('…Mute all holds it', W.soundWhy({ ...base, reasons: ['fleet'] }).lines[0].text === 'Silent — Mute all is on');
ok('…and quiet hours do', W.soundWhy({ ...base, reasons: ['quiet-hours'] }).lines[0].text === 'Silent — it is quiet hours');

// ---- the header names them ----
const h = H.soundHeader({ muted: false, quietInside: false, quietConfigured: false, quietLine: '', armed: ['gate', 'question', 'notice-question'], silentSessions: [] });
ok('the header names farm-wide events after the session ones, in the table\'s order', h.state === 'on' && h.lines[0] === 'Rings: Asking you · Question card · Workflow asks you');

// ---- the quota line: once per climb, the first reading a baseline ----
{
    let memo;
    const rang = [];
    const read = pct => {
        const r = R.quotaEvents(memo || R.EMPTY_QUOTA_MEMO, { slotId: 'a', engine: 'claude', percent: pct, window: '5h' }, R.QUOTA_WARN_PCT);
        if (memo && r.events.length) { rang.push(pct); }
        memo = r.memo;
    };
    [R.QUOTA_WARN_PCT + 5, R.QUOTA_WARN_PCT + 6, R.QUOTA_WARN_PCT - 40, R.QUOTA_WARN_PCT + 2, R.QUOTA_WARN_PCT + 3].forEach(read);
    ok('a reload already over the line stays quiet; falling under re-arms it; the next climb rings once',
        rang.join(',') === String(R.QUOTA_WARN_PCT + 2));
}

// ---- the host wiring ----
const ext = src('src/extension.ts');
ok('every new notice reaches the ring, after the phone',
    /noticesStore\.onAdd = n => \{ if \(remoteLive\) \{ remoteEmit\(\[noticeEvent\(n\)\]\); \} noticeRing\(n\); \};/.test(ext));
ok('a question card rings as notice-question, any other notice as notice, named by its agent',
    /fleetAlert\(n\.type === 'question' \? 'notice-question' : 'notice', n\.agentName, `notice:\$\{n\.id\}`\)/.test(ext));
ok('a workflow asking rings as gate, named by its title',
    /ring: q => fleetAlert\('gate', q\.workflowTitle, `gate:\$\{q\.id\}`\)/.test(ext) && /this\.deps\.ring\?\.\(q\)/.test(src('src/workflowAskDoors.ts')));
const fa = ext.slice(ext.indexOf('const fleetAlert = '), ext.indexOf('const noticeRing'));
ok('‼️ its own switch alone arms it, through the one gate and queue (alertSound with no session)',
    /if \(alertsOn\(\)\[event\] !== true\) \{ return; \}/.test(fa) && /alertSound\(event, undefined, key, who\)/.test(fa));
ok('the shipped defaults lie under the stored switches, and a write stores only what was stored',
    /\(\{ \.\.\.ALERT_ON_DEFAULT, \.\.\.\(cfg\(\)\.get/.test(ext)
    && /const alertsSetOn = async[\s\S]{0,200}update\('alerts\.on', \{ \.\.\.\(cfg\(\)\.get/.test(ext));
ok('an account crossing the line rings on the PC, the first reading only a baseline',
    /let pcQuotaMemo: QuotaMemo \| undefined;[\s\S]{0,600}if \(pcQuotaMemo && r\.events\.length\) \{ fleetAlert\('quota', u\.slotId/.test(ext));
ok('‼️ a mission that ran to its end rings once; a cancel and a mission another one started do not',
    /\(run\.status === 'done' \|\| run\.status === 'failed'\) && !run\.parentRunId\) \{\s*fleetAlert\('mission', spec\.title/.test(ext));
ok('a session test, an agent\'s tone and a session\'s panel refuse a farm-wide event',
    /wantLaneEvent\(args\)/.test(ext) && /parseSessionPatch\(args, LANE_EVENTS\)/.test(ext)
    && /if \(!\(LANE_EVENTS as readonly string\[\]\)\.includes\(event\)\) \{\s*throw new Error\(`"\$\{event\}" is not an event in an agent's sessions/.test(ext)
    && /\(LANE_EVENTS as readonly string\[\]\)\.includes\(event\)/.test(src('src/core/turnAlerts.ts')));
ok('the page model carries the farm-wide events and the answer for each',
    /fleetEvents: \[\.\.\.FLEET_EVENTS\],\s*fleetWhy: Object\.fromEntries\(FLEET_EVENTS\.map\(event => \[event, soundWhy\(soundWhyFor\(undefined, event\)\)\]\)\)/.test(ext));

// ---- the page ----
const fx = require(path.join(__dirname, 'fixtures', 'sound.js'));
const d = fx.inUse();
d.alerts.speak.events = [...(d.alerts.speak.events || []), 'gate'];
const r = runPage('sound.js', d);
const doc = r.sandbox.document;
const html = (doc.getElementById('app') || {}).innerHTML || '';
const at = s => html.indexOf(s);
ok('the table: the session events, an Across the farm row, then the five farm-wide ones',
    at('data-alerton="error"') < at('class="alertgrp"') && at('class="alertgrp"') < at('data-alerton="notice"')
    && V.FLEET_EVENTS.every(e => at(`data-alerton="${e}"`) > at('class="alertgrp"')) && /Across the farm/.test(html));
ok('the question card and the workflow are on, the other three off',
    V.FLEET_EVENTS.every(e => (d.alerts.events.find(x => x.event === e).on) === (e === 'notice-question' || e === 'gate')));
ok('an off farm-wide row says its switch is the only way to hear it',
    /It happens across the farm, not in a session, so this switch is the only way to hear it\./.test(html));
ok('…an on one says Mute all and quiet hours hold it and a session\'s Silent does not', /Mute all and quiet hours still hold it; a session.{1,6}s Silent does not\./.test(html));
ok('the event\'s hover carries its why', /✓ Rings on Question card: its fleet switch is on/.test(html));
ok('Say who on a farm-wide event names whose name is said', /Say who: the workflow, spoken after the tone/.test(html));
ok('a farm-wide event has no VS Code notification column of its own (a dash)',
    (html.match(/class="alertnone"/g) || []).length === 2 + V.FLEET_EVENTS.length);
const fire = (el, type) => (el && el._listeners && el._listeners[type] || []).forEach(fn => fn({ stopPropagation() { }, preventDefault() { } }));
const we = doc.getElementById('wyevent');
ok('Why didn\'t I hear it? offers the farm-wide events under their own group', /optgroup label="Across the farm"/.test(html) && /value="mission"/.test(html));
we.value = 'gate';
fire(we, 'change');
const body = () => (doc.getElementById('wybody') || {}).innerHTML || '';
ok('…picking one answers from the farm, with no session line', /Rings on Workflow asks you: its fleet switch is on/.test(body()) && !/This session/.test(body()));
ok('…and Test now, which rehearses a session, stands aside', doc.getElementById('wytest').disabled === true);
we.value = 'turn-ready';
fire(we, 'change');
ok('…back on a session event it answers for the session and Test now returns', /This session/.test(body()) && doc.getElementById('wytest').disabled === false);

// ---- the first opening: the offer never says "off" above a line saying what rings ----
{
    const first = (runPage('sound.js', fx.empty()).sandbox.document.getElementById('app') || {}).innerHTML || '';
    ok('‼️ the first opening offers the session two without calling the sound off while the farm-wide two ring',
        /Rings on 2 of 10 events/.test(first) && /No session event rings yet\./.test(first) && !/Sound is off\./.test(first));
    const quiet = fx.empty();
    quiet.alerts.events.forEach(e => { e.on = false; });
    const none = (runPage('sound.js', quiet).sandbox.document.getElementById('app') || {}).innerHTML || '';
    ok('…and with every switch off it says the sound is off', /<b>Sound is off\.<\/b>/.test(none));
}

console.log(`test_fleet_alerts: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
