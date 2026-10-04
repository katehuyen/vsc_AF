// U-180 — ONE SESSION'S SOUND: three answers over two switches, one op, one panel.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const S = require(path.join(ROOT, 'out', 'core', 'soundSession.js'));
const EVENTS = ['turn-ready', 'question', 'stalled', 'ended', 'error'];

// 1. the three answers, both ways
ok('no ♪ and not muted reads Like all', S.soundOf([], false) === 'like-all' && S.soundOf(['focus'], false) === 'like-all');
ok('the ♪ reads Always', S.soundOf(['sound', 'toast'], false) === 'always');
ok('‼️ muted reads Silent whatever else is set', S.soundOf(['sound'], true) === 'silent');
ok('Always arms the ♪ and unmutes', JSON.stringify(S.soundPlan('always', [])) === '{"muted":false,"ring":true}');
ok('Like all clears the ♪ and unmutes', JSON.stringify(S.soundPlan('like-all', ['sound'])) === '{"muted":false,"ring":false}');
ok('‼️ Silent mutes and leaves the ♪ as it was — un-silencing restores the setup',
    JSON.stringify(S.soundPlan('silent', ['sound'])) === '{"muted":true,"ring":true}'
    && JSON.stringify(S.soundPlan('silent', [])) === '{"muted":true,"ring":false}');
for (const want of S.SESSION_SOUNDS) {
    for (const start of [[], ['sound'], ['focus', 'sound']]) {
        const p = S.soundPlan(want, start);
        const after = p.ring ? [...new Set([...start, 'sound'])] : start.filter(a => a !== 'sound');
        ok(`round trip: ${want} from [${start}] reads back as ${want}`, S.soundOf(after, p.muted) === want);
    }
}

// 2. the form is an allow-list, refusals by name
const good = S.parseSessionPatch({ sessionId: 'x', sound: 'always', voices: { question: ' bell ' }, read: true, toast: false, junk: 1 }, EVENTS);
ok('a form keeps only its own fields, trimmed', good.ok && JSON.stringify(good.patch) === '{"sound":"always","voices":{"question":"bell"},"read":true,"toast":false}');
ok('an unknown Sound is refused by name', !S.parseSessionPatch({ sound: 'loud' }, EVENTS).ok);
ok('an unknown event is refused by name', /unknown event "nope"/.test(S.parseSessionPatch({ voices: { nope: 'a' } }, EVENTS).error));
ok('a switch that is not true/false is refused', !S.parseSessionPatch({ focus: 'yes' }, EVENTS).ok);

// 3. the host: one apply function for the op and the panel, through the existing setters
const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
const apply = ext.slice(ext.indexOf('const alertsSessionApply = async'), ext.indexOf('/** Toggle one action on one session'));
ok('Sound goes through the session mute and the ♪ setter the Timeline uses',
    /alertsSetSessionMuted\(id, plan\.muted\)/.test(apply) && /setSessionAlertAction\(id, 'sound', plan\.ring\)/.test(apply));
ok('tones, voice and reader go through their own functions',
    /alertsSetSessionVoice\(id/.test(apply) && /alertsSetSessionSpeechVoice\(id/.test(apply) && /alertsSetSessionReadAloud\(id/.test(apply));
ok('alerts.session reads with only a sessionId and writes through the same apply',
    /op: 'alerts\.session'[\s\S]{0,2200}parseSessionPatch\(args, LANE_EVENTS\)[\s\S]{0,200}alertsSessionApply\(s\.sessionId, p\.patch\) : alertsSessionView\(s\)/.test(ext));
ok('‼️ the right-click opens the panel in a Console, Timeline or Sound page and keeps the list everywhere else',
    /\/\^\(console\|timeline\|sound\)#\/\.test\(from\)[\s\S]{0,120}postCtx\(from, 'soundPop', \{ sessionId: s\.sessionId \}\)/.test(ext));
const msgs = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'alertMessages.ts'), 'utf8');
ok('the panel is answered with the profile itself', /case 'alertSessionApply':[\s\S]{0,300}deps\.alertsSessionApply/.test(msgs)
    && /type: 'soundPopData', profile: await read\(\)/.test(msgs));
for (const [f, re] of [['consolePanel.ts', /handleAlertMessage\(msg, sound, soundSurface/], ['timeline.ts', /handleAlertMessage\(msg, sound, soundSurface/]]) {
    ok(`${f} answers the panel through the shared handler`, re.test(fs.readFileSync(path.join(ROOT, 'src', 'panels', f), 'utf8')));
}

// 4. the panel draws what it is given
const vm = require('vm');
const sandbox = { window: {}, document: { getElementById: () => null } };
sandbox.window.AFCharts = { esc: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'), option: (v, l, o) => `<option value="${v}"${o && o.selected ? ' selected' : ''}>${l}</option>` };
sandbox.window.AFSoundCard = { EVENT_TEXT: { question: ['Asking you'], 'turn-ready': ['Turn finished'] }, voiceName: (al, id) => id, toneGroups: () => '<option value="bell">bell</option>' };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'media', 'afSoundPop.js'), 'utf8'), sandbox);
const html = sandbox.window.AFSoundPop.html({
    sessionId: 's1', label: 'developer #2', sound: 'silent', read: true, speechVoice: 'Tolga', fleetSpeechVoice: '',
    tones: [{ event: 'turn-ready', chosen: '', voice: 'crystal', origin: 'default' }, { event: 'question', chosen: 'bell', voice: 'bell', origin: 'session' }],
    also: { focus: true, modal: false, toast: false }
}, { speak: { voices: [] } });
ok('MIRROR — the state it is in is the checked one', /data-spsound="silent" checked/.test(html) && !/data-spsound="always" checked/.test(html));
ok('one tone row per event the session can ring on, Like-all offering the chain below', (html.match(/data-sptone=/g) || []).length === 2 && /all's — crystal/.test(html));
ok('a voice this machine does not list is still shown as set', /Tolga — not on this machine/.test(html));
ok('reader and the other three branches as switches', /data-spread checked/.test(html) && /data-spalso="focus" checked/.test(html) && /Pop-up/.test(html));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
