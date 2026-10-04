// U-183 — 🔊 SOUND › SESSIONS. Which conversation sounds different from the
// rest, in one live table: Session · Engine · Sound (ONE box: Like all · Always ·
// Silent) · Tone · Say who · Read aloud · Also (◎ ▣ ▭). Every change is an
// alertSessionApply — the function `alerts.session` runs; ⋯ opens the session
// panel ON THIS PAGE; a row's right-click is the shared session menu; a row's
// hover is the resolution (which tone each event plays, from which step, and
// whether it rings). The table filters by text and by "only those that differ",
// and a table write never pops the panel open by itself.
'use strict';
const path = require('path');
const fs = require('fs');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const ROOT = path.resolve(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const fx = require(path.join(__dirname, 'fixtures', 'sound.js'));
const fire = (el, type) => (el && el._listeners && el._listeners[type] || []).forEach(fn => fn({ stopPropagation() { }, preventDefault() { } }));

const d = fx.inUse();
ok('the fixture carries live sessions, one plain and some that differ', (d.sessions || []).length >= 3
    && d.sessions.some(r => r.sound === 'like-all' && !r.read && !r.speechVoice && !r.tones.some(t => t.chosen)));
const r = runPage('sound.js', d);
const doc = r.sandbox.document;
const html = () => (doc.getElementById('app') || {}).innerHTML || '';
const at = s => html().indexOf(s);
ok('‼️ Sessions comes after Voice and before the Library', at('>Read aloud<') < at('>Sessions<') && at('>Sessions<') < at('>Library'));
ok('the table is Session · Engine · Sound · Tone · Say who · Read aloud · Also',
    /<table class="settbl sstbl">/.test(html()) && ['>Session<', '>Engine<', '>Sound<', '>Tone<', '>Say who<', '>Read aloud<', '>Also<'].every(h => html().includes(h)));
const silent = d.sessions.find(x => x.sound === 'silent');
const sel = doc.querySelectorAll('[data-sssound]').find(e => e.dataset.sssound === silent.sessionId);
ok('‼️ Sound is ONE box of three, drawn as it stands (MIRROR)', !!sel && sel.value === 'silent'
    && /<option value="like-all"[^>]*>Like all<\/option><option value="always"[^>]*>Always<\/option><option value="silent"/.test(html()));
ok('a row carries the shared session right-click', /<tr [^>]*data-vscode-context=[^>]*afSessionRow/.test(html()));
ok('…and its hover is the resolution, Label: value, with whether it rings', /Turn finished: [^<]*— [^<]*· (rings|does not ring)/.test(html()));
const own = d.sessions.find(x => x.tones.some(t => t.chosen));
ok('a tone of its own is named in the Tone column; the rest say all\'s', !!own && /all&#39;s|all's/.test(html()));

r.posted.length = 0;
sel.value = 'always';
fire(sel, 'change');
ok('‼️ changing Sound writes through alertSessionApply', r.posted.some(m => m.type === 'alertSessionApply' && m.sessionId === silent.sessionId && m.patch.sound === 'always'));
r.posted.length = 0;
const rd = doc.querySelectorAll('[data-ssread]')[0];
rd.checked = !rd.checked;
fire(rd, 'change');
ok('Read aloud is a switch on the row', r.posted.some(m => m.type === 'alertSessionApply' && typeof m.patch.read === 'boolean'));
r.posted.length = 0;
const also = doc.querySelectorAll('[data-ssalso]').find(e => e.dataset.ssalso.endsWith('|focus'));
fire(also, 'click');
ok('◎ Focus flips its own branch', r.posted.some(m => m.type === 'alertSessionApply' && m.patch.focus === (also.getAttribute('aria-pressed') !== 'true')));
r.posted.length = 0;
fire(doc.querySelectorAll('[data-sspop]')[0], 'click');
ok('‼️ ⋯ opens the session panel on this page', r.posted.some(m => m.type === 'alertSessionOpen'));

// a table write is answered with the profile; the panel must NOT open for it
r.posted.length = 0;
const deliver = m => r.send(m);
deliver({ type: 'soundPopData', profile: { sessionId: 'not-asked', label: 'x', sound: 'always', tones: [], also: {} }, alerts: d.alerts });
ok('‼️ a profile nobody asked for does not pop the panel open', !/sp-pop/.test((doc.getElementById('sp-root') || {}).innerHTML || ''));
deliver({ type: 'soundPopError', sessionId: silent.sessionId, error: 'refused by the host' });
ok('…and a refused table write is shown on the page, not swallowed', /refused by the host/.test(html()));

// the filter
const f = doc.getElementById('ssfilter');
f.value = silent.label;
fire(f, 'input');
const tbl = (doc.getElementById('sstable') || {}).innerHTML || '';
ok('the filter narrows the table by name', tbl.includes(silent.label) && d.sessions.filter(x => x.label !== silent.label).every(x => !tbl.includes(`data-sssound="${x.sessionId}"`)));

{
    const r2 = runPage('sound.js', d);
    const sh = r2.sandbox.document.getElementById('ssshow');
    sh.value = 'differs';
    fire(sh, 'change');
    const t2 = (r2.sandbox.document.getElementById('sstable') || {}).innerHTML || '';
    const plain = d.sessions.find(x => x.sound === 'like-all' && !x.read && !x.speechVoice && !x.tones.some(t => t.chosen) && !Object.values(x.also).some(Boolean));
    ok('‼️ "Only those that differ" hides a session that sounds like all', !t2.includes(`data-sssound="${plain.sessionId}"`) && t2.includes(`data-sssound="${silent.sessionId}"`));
}
{
    const e = fx.inUse();
    e.sessions = [];
    const r3 = runPage('sound.js', e);
    ok('with no live session the section says so', /No live session is being watched/.test(r3.sandbox.document.getElementById('app').innerHTML));
}

// ---- the host half ----
const ext = src('src/extension.ts');
const panel = src('src/panels/soundPanel.ts');
ok('the Sound page model carries the sessions', /sessions: this\.deps\.sessions\?\.\(\) \?\? \[\]/.test(panel));
ok('‼️ …and the page surface answers the session panel (post), so ⋯ opens it here', /post: m => void this\.host\.webview\.postMessage\(m\)/.test(panel));
ok('each row is alertsSessionView plus engine, reading and whether each event rings',
    /const soundSessionRows = \(\) => live\.sessions\(\)\.map\(s => \{/.test(ext) && /rings: !muted && alertPlan\(t\.event as AlertEvent, actions, on\)\.actions\.includes\('sound'\)/.test(ext));
ok('‼️ alerts.status answers the whole page, sessions included', /handler: \(\) => \(\{ alerts: alertsPage\(\), notify: soundNotify\(\), sessions: soundSessionRows\(\), agents: soundAgentRows\(\), channels: soundChannels\(\) \}\)/.test(ext));
ok('the right-click "Sound for This Session…" opens the panel on the Sound page too', /\/\^\(console\|timeline\|sound\)#\/\.test\(from\)/.test(ext));
ok('the table follows sessions coming and going', /soundLiveKey/.test(ext));

console.log(`\ntest_sound_sessions: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
