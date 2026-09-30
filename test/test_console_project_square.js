// P-18 — WHICH PROJECT A CARD BELONGS TO, AT A GLANCE. A square beside the
// session's colour dot carries the project's own colour; a project with no
// colour draws a hollow one (the card is still filed); a session with no
// project draws none. The host must SEND the colour, and a press must open the
// project page — a square that is drawn but never fed is the failure pinned here.
'use strict';
const path = require('path');
const fs = require('fs');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const fixture = require(path.join(__dirname, 'fixtures', 'console.js'));
const data = fixture.data();
const r = runPage('console.js', data);
const list = () => { const el = r.sandbox.document.getElementById('c-list'); return (el && el.innerHTML) || ''; };
const cardOf = (sid) => {
    const html = list();
    const at = html.indexOf(`data-cdot="live|${sid}"`);
    const start = html.lastIndexOf('class="srow', at);
    return at < 0 ? '' : html.slice(start, at);
};

const coloured = data.sessions.find(s => s.projectId && s.projectColor);
const hollow = data.sessions.find(s => s.projectId && !s.projectColor);
const none = data.sessions.find(s => !s.projectId && s.sessionId);
ok('the fixture carries all three cases', !!(coloured && hollow && none));

ok('‼️ a card under a coloured project wears the project colour in a square',
    new RegExp(`class="cproj on" data-cproj="${coloured.projectId}"[^>]*style="background:${coloured.projectColor}`)
        .test(cardOf(coloured.sessionId)));
ok('…a project with no colour is a hollow square, still there',
    /class="cproj" data-cproj="prj_nocolor1"/.test(cardOf(hollow.sessionId)) && !/cproj on/.test(cardOf(hollow.sessionId)));
ok('…and a session under no project has no square at all', !/data-cproj=/.test(cardOf(none.sessionId)));
ok('the square sits just before the colour dot, in its own AFTip wrapper',
    /af-tipw[^"]*cprojw[\s\S]*<\/span>\s*<span class="cdotw">/.test(cardOf(coloured.sessionId)));
ok('its hover names the project and its colour, Label: value',
    /Project: Agent Farm/.test(cardOf(coloured.sessionId)) && /Colour: #3fa34d/.test(cardOf(coloured.sessionId)));

r.posted.length = 0;
const sq = r.sandbox.document.querySelectorAll('[data-cproj]').find(e => e.dataset.cproj === coloured.projectId);
if (sq) { (sq._listeners.click || []).forEach(fn => fn({ stopPropagation() { }, preventDefault() { } })); }
ok('‼️ a press opens that project page (and does not select the card)',
    !!sq && r.posted.some(m => m.type === 'openProject' && m.project === coloured.projectId)
    && !r.posted.some(m => m.type === 'select'));

// ---- the host half ----
const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'consolePanel.ts'), 'utf8').replace(/\r\n/g, '\n');
ok('‼️ the panel SENDS the project colour with each card',
    /projectColor: s\.projectId\s*\n?\s*\? \(this\.deps\.projects\(\)\.find\(p => p\.id === s\.projectId\)\?\.color \?\? ''\)/.test(panel));
ok('…and answers openProject with the command the sidebar uses',
    /case 'openProject':[\s\S]{0,200}agentfarm\.openProject/.test(panel));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
