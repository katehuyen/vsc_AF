// A-21 — SETTINGS ▸ ALERT SOUNDS, DRIVEN.
//
// ‼️ THE BUG THIS FILE IS ABOUT IS AN INVISIBLE ONE, and it is the third time
// the same one: `agentFarm.alerts.on` and `agentFarm.alerts.voices` are both
// EMPTY objects out of the box, so two JSON boxes showed `{}` twice for a
// feature that already plays five different tones. "Which sound will I hear,
// and why that one" — the only question anybody opens this page with — had no
// answer anywhere on it. Only the resolution chain can answer it, so the host
// hands the RESOLVED rows over and the boxes are gone rather than decorated.
//
// What is defended here:
//   - the card REPLACES both boxes, in their own place, and only once.
//   - every row says what would ACTUALLY play and which step chose it — a row
//     showing only what the user typed is a row that lies the moment a file
//     goes missing.
//   - an armed event whose sound cannot be played is VISIBLE, on the card, at a
//     glance: silence is indistinguishable from the switch being off, which is
//     the whole failure A-18 was opened for.
//   - every gesture goes to the HOST, which runs the same function the matching
//     `alerts.*` bridge op runs. The page holds no rule of its own about
//     reserved ids, the limit of ten, or which formats play.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
// ‼️ THE DEFAULTS ARE READ, NOT TYPED OUT. A-20 moved all five of them and
// these assertions went on naming the old ones — a test that hardcodes what it
// is checking stops checking anything the day the answer changes.
const VOICES = require(path.join(ROOT, 'out', 'core', 'alertVoices.js'));
const LABEL = id => (VOICES.builtinVoices('x').find(v => v.id === id) || {}).label;
const fx = require(path.join(__dirname, 'fixtures', 'alertsettings.js'));

const open = (data) => runPage(fx.script, data);
const sent = (p) => p.posted;
const last = (p) => p.last();
const byId = (p, id) => p.sandbox.document.getElementById(id);
const byAttr = (p, attr, key) =>
    p.query(`[data-${attr}]`).find(b => b.dataset[attr] === key);

// ---------------------------------------------------------------------------
// 0. U-158 — the stuck warning is its own group, and says that 0 turns it off
// ---------------------------------------------------------------------------
{
    const html = open(fx.inUse()).html();
    const g = html.indexOf('id="stuck-warning"');
    ok('‼️ a "Stuck warning" group holds the threshold and its alert', g >= 0 && /Stuck warning/.test(html)
        && html.indexOf('data-item="agentFarm.stuckThresholdSeconds"') > g && html.indexOf('data-item="agentFarm.notifyStuck"') > g);
    ok('…drawn once each, and it says 0 turns the warning off', (html.match(/data-item="agentFarm\.stuckThresholdSeconds"/g) || []).length === 1
        && /0 turns the warning off/.test(html));
    // U-161 — the user read the number and the box as one switch twice over; N-13 — the box is whether you are told at all
    ok('U-161/N-13: the number decides when, the box whether Needs You and the pop-up tell you',
        /The <b>number<\/b> says WHEN/.test(html) && /The <b>box<\/b> says whether you are told/.test(html)
        && /unticked, only its card shows the mark/.test(html) && !/whatever the box says/.test(html) && !/the alert plays if it is on/.test(html));
    ok('…after the alert sounds card, as the threshold always was', html.indexOf('🔔 Alert sounds') < g);
    const plain = open(Object.assign(fx.inUse(), { alerts: undefined })).html();
    ok('…also on a build that sends no alerts card', /id="stuck-warning"/.test(plain) && (plain.match(/data-item="agentFarm\.notifyStuck"/g) || []).length === 1);
}

// ---------------------------------------------------------------------------
// 1. U-178 — the card left for the Sound page; ONE line stands in its place
// ---------------------------------------------------------------------------
{
    const p = open(fx.inUse());
    const html = p.html();
    ok('the summary line is drawn: state, what rings, and the door to the page',
        /🔊 Sound<\/span>/.test(html) && /— on · rings on 4 events/.test(html)
        && /data-afnav="sound"/.test(html) && />Open Sound</.test(html));
    ok('‼️ …and the card is gone: no event table, no gate, no strip on Settings',
        !/class="settbl alerttbl"/.test(html) && !/class="alertgate"/.test(html)
        && !/id="alertmute"/.test(html) && !/🔔 Alert sounds/.test(html));
    ok('‼️ every box the card absorbed stays absorbed — no raw JSON box comes back',
        ['on', 'voices', 'muted', 'quietHours', 'speak', 'nudge']
            .every(k => html.indexOf(`id="c-agentFarm.alerts.${k}"`) < 0));
    ok('…exactly once', (html.match(/🔊 Sound<\/span>/g) || []).length === 1);
    ok('the OTHER settings in the category are untouched',
        /agentFarm\.notifyTurnEnd/.test(html) && /agentFarm\.stuckThresholdSeconds/.test(html));
    ok('‼️ …and it sits where the card sat: after notifyTurnEnd, before the rest',
        html.indexOf('notifyTurnEnd') < html.indexOf('🔊 Sound</span>')
        && html.indexOf('🔊 Sound</span>') < html.indexOf('stuckThresholdSeconds'));
    ok('a focus on the old key still lands on it', /data-item="agentFarm\.alerts\.voices"/.test(html));
}
{
    const html = open(fx.gated()).html();
    ok('the line says WHY nothing is heard: muted, the quiet window, the silent sessions',
        /— muted · /.test(html) && /quiet 23:00–08:00/.test(html) && /2 silent sessions/.test(html));
    // U-213 — every switch off, the two shipped on as well
    const fresh = open((d => { d.alerts.events.forEach(e => { e.on = false; }); return d; })(fx.fresh())).html();
    ok('…and a farm that rings on nothing says off, not a count of zero',
        /— off · no event rings/.test(fresh));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
