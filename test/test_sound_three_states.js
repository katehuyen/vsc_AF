// U-211 — EVERY SOUND SURFACE SPEAKS THE THREE SESSION CHOICES (Like all · Always · Silent).
//
// (b) The old wording said a session's ♪ and the fleet switch "ADD UP" and that Silent "subtracts"
//     — the model before the three choices. It now says what the user picks: Like all, Always, Silent.
// (c) The Sound page's Sessions table drew its Also column as three bare glyphs (◎ ▣ ▭); each is a
//     labelled chip now, its hover opening on what it is set to (MIRROR).
//
//   node test/test_sound_three_states.js
'use strict';
const fs = require('fs');
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const ROOT = path.resolve(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const fx = require(path.join(__dirname, 'fixtures', 'sound.js'));

// --- (b) the words ---
{
    const card = src('media/afSoundCard.js'), strips = src('media/afSoundStrips.js');
    ok('no surface says the session switch and the fleet switch "ADD" any more',
        !/the two ADD|ADD UP to|subtract from what/.test(card + strips));
    ok('the ring cell names the three choices and where they are made',
        /A session set to Always still rings on this event, and one set to Silent never does; each session chooses Like all, Always or Silent in its sound panel/.test(card));
    ok('the "Silent on their own" hover says Silent wins over every fleet switch',
        /each session chooses Like all, Always or Silent, and Silent wins over every fleet switch/.test(strips));
    const g = fx.gated();
    const html = (runPage('sound.js', g).sandbox.document.getElementById('app') || {}).innerHTML || '';
    ok('…and it is what the gated page draws', /Silent wins over every fleet switch/.test(html));
}

// --- (c) the Also column ---
{
    const d = fx.inUse();
    const r = runPage('sound.js', d);
    const html = (r.sandbox.document.getElementById('app') || {}).innerHTML || '';
    const first = d.sessions[0];
    const cell = html.slice(html.indexOf('class="ssalso"'), html.indexOf('</td>', html.indexOf('class="ssalso"')));
    ok('each branch is a labelled chip: ◎ Focus · ▣ Pop-up · ▭ Notification',
        />◎ Focus<\/button>/.test(cell) && />▣ Pop-up<\/button>/.test(cell) && />▭ Notification<\/button>/.test(cell));
    ok('‼️ MIRROR — each chip\'s hover opens on what it is set to',
        ['focus', 'modal', 'toast'].every(k => {
            const label = { focus: 'Focus', modal: 'Pop-up', toast: 'Notification' }[k];
            return new RegExp(`${label}: ${first.also[k] ? 'on' : 'off'}`).test(cell);
        }));
    ok('…then says what the branch does', /Bring this session to the front when its turn ends\./.test(cell));
    ok('the state is on the chip too, not in the hover alone', /ssalsob on"[^>]*aria-pressed="true"/.test(html) && /aria-pressed="false"/.test(cell + html));
    const chip = r.query('[data-ssalso]')[0];
    chip.click();
    const last = r.last();
    ok('a press still sets that branch through the session\'s own apply',
        last && last.type === 'alertSessionApply' && last.sessionId === first.sessionId && typeof last.patch.focus === 'boolean');
    const tr = (runPage('sound.js', fx.inUse(), { __AFUI__: { lang: 'tr', locale: 'tr' } }).sandbox.document.getElementById('app') || {}).innerHTML || '';
    ok('in Turkish the chips speak Turkish', />◎ Öne getir<\/button>/.test(tr) && />▣ Açılır pencere<\/button>/.test(tr) && />▭ Bildirim<\/button>/.test(tr));
}

// --- (a) the Timeline: the note draws the choice and opens the panel; a row read aloud gets a stop ---
{
    const tfx = require(path.join(__dirname, 'fixtures', 'timeline.js'));
    const READ = '407c78cb-2f1a-4d55-9e10-1b2c3d4e5f60', SILENT = '019ff43f-ff3d-7790-9431-63799a45b1b2';
    const scene = (id, extra) => Object.assign(tfx.variants().find(v => v.id === id).data, extra || {});
    const note = (h, sid) => { const i = h.indexOf(`data-sound="`, h.indexOf(`data-session="${sid}" data-action="sound"`) - 400); return h.slice(h.lastIndexOf('<g class="af-toggle"', h.indexOf(`data-session="${sid}" data-action="sound"`)), h.indexOf('</g>', i) + 4); };
    const plain = runPage('timeline.js', scene('timeline'));
    const reading = runPage('timeline.js', scene('timeline-reading'));
    const ph = plain.html(), rh = reading.html();
    ok('each note names its state: Always, Silent, Like all',
        /data-sound="always"/.test(note(ph, READ)) && /data-sound="silent"/.test(note(ph, SILENT)) && /data-sound="like-all"/.test(ph));
    ok('Silent is struck through, and only the Silent row is', /class="snd-silent"/.test(note(ph, SILENT)) && (ph.match(/class="snd-silent"/g) || []).length === 1);
    ok('Always is filled and ticked', /fill="var\(--vscode-charts-blue/.test(note(ph, READ)) && /stroke="var\(--vscode-charts-green/.test(note(ph, READ)));
    const kept = runPage('timeline.js', scene('timeline', { sessionAlerts: Object.assign({}, scene('timeline').sessionAlerts, { [SILENT]: ['sound', 'focus'] }) })).html();
    ok('‼️ Silent over a ring switch left on underneath is drawn Silent, not filled and ticked',
        /data-sound="silent"/.test(note(kept, SILENT)) && !/stroke="var\(--vscode-charts-green/.test(note(kept, SILENT)) && /fill="transparent"/.test(note(kept, SILENT)));
    ok('no stop on a page where nothing is read aloud', plain.query('.af-readstop').length === 0 && !/class="af-readstop"/.test(ph));
    const stops = reading.query('.af-readstop');
    const g = rh.indexOf('<g class="af-readstop"');
    ok('one stop, on the row being read', stops.length === 1 && g > 0 && rh.slice(rh.lastIndexOf('<g class="lanelabel">', g), g).includes(`(${READ.slice(0, 8)})`));
    ok('a reader on no row of this page draws no stop', runPage('timeline.js', scene('timeline', { sessionReading: 'gone-session' })).query('.af-readstop').length === 0);
    ok('the stop is a named button', /class="lane-hot mark af-readstop"[^>]*role="button" aria-label="Stop reading aloud"/.test(rh));
    const box = h => (/<svg viewBox="([^"]*)"/.exec(h) || [])[1];
    ok('the drawing keeps its size with the stop in it', box(ph) && box(ph) === box(rh));
    stops[0].click();
    ok('a press asks the host to stop reading', reading.last() && reading.last().type === 'alertReadStop');
    // ♪ opens THAT row's panel beside its box, kept inside the window (afSoundPop place())
    const alerts = fx.inUse().alerts;
    const answer = r => r.send({ type: 'soundPopData', profile: { sessionId: READ, label: 'x', sound: 'always', tones: [], also: {} }, alerts });
    const pop = r => (r.sandbox.document.getElementById('sp-root') || { querySelector: () => null }).querySelector('.sp-pop');
    const btn = reading.query('.af-toggle').find(e => e.dataset.session === READ && e.dataset.action === 'sound');
    btn.getBoundingClientRect = () => ({ right: 90, top: 100 });
    if (!reading.sandbox.document.head) { reading.sandbox.document.head = reading.sandbox.document.body; }
    reading.posted.length = 0;
    btn.click();
    ok('♪ asks for its own session\'s panel and writes no switch', reading.posted.length === 1 && reading.last().type === 'alertSessionOpen' && reading.last().sessionId === READ);
    answer(reading);
    const p = pop(reading);
    ok('…which opens beside the note', p && p.style.left === '98px' && p.style.top === '100px' && p.style.right === 'auto');
    reading.sandbox.window.AFSoundPop.open(READ, { right: 790, top: 900 });
    answer(reading);
    const q = pop(reading);
    ok('…and never past the window\'s edge', q && q.style.left === '344px' && q.style.top === '240px');
    reading.sandbox.window.AFSoundPop.open(READ);
    answer(reading);
    ok('the right-click path keeps the panel\'s own corner', !(pop(reading).style || {}).left);
    ok('the lanes\' own legend says what ♪ is now', /♪ is the session(&#039;|')s sound, Like all, Always or Silent: a click opens its panel/.test(ph));
    const trh = runPage('timeline.js', scene('timeline-reading'), { __AFUI__: { lang: 'tr', locale: 'tr' } }).html();
    ok('…in Turkish too, with the stop', /♪ oturumun sesidir/.test(trh) && /aria-label="Sesli okumayı durdur"/.test(trh));
}

console.log(`test_sound_three_states: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
