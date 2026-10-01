// U-179 — THE 🔊 IN EVERY PAGE HEADER.
//
// One icon that is also the state (🔊 rings · 🔇 muted · 🌙 quiet hours · 🔈
// nothing on yet), a MIRROR hover that opens with that state, and a click that
// opens the Sound page. The state is the host's, pushed from the same moment
// the status-bar 🔇 repaints — so the header and the bar cannot disagree — and
// repainted IN PLACE, because a re-render would cost scroll, menus and drafts.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const H = require(path.join(ROOT, 'out', 'core', 'soundHeader.js'));
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const needs = require(path.join(__dirname, 'fixtures', 'needs.js'));

const base = { muted: false, quietInside: false, quietConfigured: false, quietLine: '', armed: [], silentSessions: [] };

// ---------------------------------------------------------------------------
// 1. the state, worked out once
// ---------------------------------------------------------------------------
{
    const off = H.soundHeader(base);
    ok('nothing armed → 🔈 "nothing rings yet"', off.state === 'off' && off.icon === '🔈'
        && off.head === 'Sound — nothing rings yet' && off.lines[0] === 'Rings: nothing yet');
    const on = H.soundHeader({ ...base, armed: ['turn-ready', 'question'] });
    ok('armed → 🔊, and the events are named in the product\'s words, Asking you first',
        on.state === 'on' && on.icon === '🔊' && on.lines[0] === 'Rings: Asking you · Turn finished');
    const quiet = H.soundHeader({ ...base, armed: ['question'], quietConfigured: true, quietInside: true,
        quietLine: 'Quiet hours 23:00–08:00 — ends in 6h' });
    ok('inside quiet hours → 🌙, and the window\'s own sentence is on the hover',
        quiet.state === 'quiet' && quiet.icon === '🌙' && quiet.lines.includes('Quiet hours 23:00–08:00 — ends in 6h'));
    const muted = H.soundHeader({ ...base, muted: true, armed: ['question'], quietConfigured: true, quietInside: true, quietLine: 'q' });
    ok('‼️ muted outranks quiet hours and armed events → 🔇', muted.state === 'muted' && muted.icon === '🔇');
    const silent = H.soundHeader({ ...base, armed: ['question'], silentSessions: ['developer #2', 'psikolog'] });
    ok('sessions silent on their own are NAMED, not counted',
        silent.lines.includes('Silent sessions: developer #2, psikolog'));
    ok('a window that is not configured is not mentioned',
        !H.soundHeader({ ...base, quietLine: 'Quiet hours off (23:00–08:00)' }).lines.some(l => /Quiet/.test(l)));
}

// ---------------------------------------------------------------------------
// 2. the header draws it, and repaints it in place
// ---------------------------------------------------------------------------
{
    const sound = H.soundHeader({ ...base, armed: ['question'] });
    const p = runPage(needs.script, needs.data(), { __AFUI__: { sound } });
    const btn = () => p.query('[data-afsound]')[0];
    ok('every page header carries the 🔊, linked to the Sound page',
        !!btn() && btn().dataset.afnav === 'sound' && btn().dataset.afsound === 'on');
    ok('MIRROR — its name and hover open with the state', /aria-label="Sound — on"/.test(p.html())
        && /Rings: Asking you/.test(p.html()) && /Click opens the Sound page\./.test(p.html()));
    btn().dispatchEvent(new p.sandbox.Event('click'));
    ok('a click goes to the Sound page', p.last().type === 'afnav' && p.last().to === 'sound');

    p.send({ type: 'afui', afui: { sound: H.soundHeader({ ...base, muted: true, armed: ['question'] }) } });
    ok('a push repaints the icon and its state in place, without a re-render',
        btn().textContent === '🔇' && btn().getAttribute('data-afsound') === 'muted');

    const bare = runPage(needs.script, needs.data());
    ok('a window whose host sent no state still draws the 🔊 rather than a gap',
        !!bare.query('[data-afsound]')[0] && /aria-label="Sound"/.test(bare.html()));
    const page = runPage(require(path.join(__dirname, 'fixtures', 'sound.js')).script,
        require(path.join(__dirname, 'fixtures', 'sound.js')).data(), { __AFUI__: { sound } });
    ok('…and the Sound page itself does not link to itself', !page.query('[data-afsound]').length);
}

// ---------------------------------------------------------------------------
// 3. the host: one provider, pushed when the bar repaints, only on a change
// ---------------------------------------------------------------------------
{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const base_ = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'base.ts'), 'utf8');
    const bar = fs.readFileSync(path.join(ROOT, 'src', 'views', 'muteBar.ts'), 'utf8');
    ok('the provider reads the same gate the bar reads', /setSoundHeaderProvider\(\(\) => \{[\s\S]{0,500}soundHeader\(\{[\s\S]{0,400}alertsMuted\(\)/.test(ext));
    ok('‼️ it is pushed from the bar\'s own repaint, so the two cannot disagree',
        /changed: \(\) => pushSoundHeader\(\)/.test(ext) && /update\(\): void \{\s*\n\s*this\.deps\.changed\?\.\(\);/.test(bar));
    ok('…only when it changed — that repaint comes on every live event',
        /if \(!sound \|\| key === soundHeaderSent\) \{ return; \}/.test(base_));
    ok('a page built later starts from the current state', /sound: currentSoundHeader\(\),/.test(base_));
}

// ---------------------------------------------------------------------------
// 4. ‼️ MEASURED — the icon costs 24px and must not push the strip to a second row
//    where it fitted on one. Measured before the icon: 1000px already wrapped
//    (1098px of buttons in 952px), ~1150px fitted; with it ~1175px fits.
// ---------------------------------------------------------------------------
{
    const { execFileSync } = require('child_process');
    const run = args => execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
    const expr = "(function(){var nav=document.querySelector('.af-head-nav');var tops={};"
        + "[].forEach.call(nav.children,function(k){tops[Math.round(k.getBoundingClientRect().top)]=1;});"
        + "var s=document.querySelector('[data-afsound]');"
        + "return {rows:Object.keys(tops).length,sound:s?Math.round(s.getBoundingClientRect().width):0};})()";
    let m = { rows: 0, sound: 0 };
    try {
        run([path.join('test', 'render_page.js'), 'needs']);
        const raw = run([path.join('test', 'measure_page.js'), 'needs', expr, '--width', '1200']);
        m = JSON.parse(raw.slice(raw.indexOf('{')));
    } catch (e) { console.log('  (measure failed: ' + String(e.message).slice(0, 160) + ')'); }
    ok(`at 1200px the header is still ONE row with the 🔊 in it (${m.rows} row, icon ${m.sound}px)`,
        m.rows === 1 && m.sound > 0 && m.sound <= 32);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
