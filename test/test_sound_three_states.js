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

console.log(`test_sound_three_states: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
