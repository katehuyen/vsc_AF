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

// ---- ‼️ the passive cards: "where you left off" and the Resume list wear the same square ----
const back = list();
const backRow = back.slice(back.lastIndexOf('class="srow', back.indexOf('data-cdot="back|019fe4aa-1c2d-70f1"')), back.indexOf('data-cdot="back|019fe4aa-1c2d-70f1"'));
ok('‼️ a "where you left off" row under a coloured project wears the square, just before its dot',
    /class="cproj on" data-cproj="prj_9ujsbtzr"[^>]*style="background:#3fa34d/.test(backRow)
    && /af-tipw[^"]*cprojw[\s\S]*<\/span>\s*<span class="cdotw">/.test(backRow));
ok('…and its hover says the conversation is FILED there, not that it was started there',
    /filed under this project/.test(backRow) && !/Started under this project/.test(backRow));

const rv = fixture.variants().find(v => v.id === 'console-resume');
const rr = runPage('console.js', rv.data, undefined, rv.state);
const rlist = (rr.sandbox.document.getElementById('c-rlist') || {}).innerHTML || '';
const rowOf = (sid) => {
    const at = rlist.indexOf(`data-cdot="resume|${sid}"`);
    return at < 0 ? '' : rlist.slice(rlist.lastIndexOf('class="srow', at), at);
};
ok('‼️ a Resume row under a coloured project wears the project colour in a square',
    /class="cproj on" data-cproj="prj_9ujsbtzr"[^>]*style="background:#3fa34d/.test(rowOf('019fe511-aa01-70f1-9c02-1a2b3c4d5e6f')));
ok('…a project with no colour is a hollow square there too',
    /class="cproj" data-cproj="prj_nocolor1"/.test(rowOf('019fe512-bb02-70f1-9c02-1a2b3c4d5e6f')));
ok('…and a row under no project has none', rowOf('019fe513-cc03-70f1-9c02-1a2b3c4d5e6f') !== ''
    && !/data-cproj=/.test(rowOf('019fe513-cc03-70f1-9c02-1a2b3c4d5e6f')));
rr.posted.length = 0;
const rsq = rr.sandbox.document.querySelectorAll('[data-cproj]').find(e => e.dataset.cproj === 'prj_9ujsbtzr');
if (rsq) { (rsq._listeners.click || []).forEach(fn => fn({ stopPropagation() { }, preventDefault() { } })); }
ok('‼️ a press on a Resume row\'s square opens the project, and does not resume the conversation',
    !!rsq && rr.posted.some(m => m.type === 'openProject' && m.project === 'prj_9ujsbtzr')
    && !rr.posted.some(m => m.type === 'resume'));

// ---- the host half ----
const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'consolePanel.ts'), 'utf8').replace(/\r\n/g, '\n');
ok('‼️ the panel SENDS the project colour with each card',
    /projectColor: s\.projectId\s*\n?\s*\? \(this\.deps\.projects\(\)\.find\(p => p\.id === s\.projectId\)\?\.color \?\? ''\)/.test(panel));
ok('‼️ the Resume rows and the "where you left off" rows are SENT their project, resolved the way the Projects page files them',
    /private resumeRow\(s: SessionInfo, projects = this\.deps\.projects\(\)\)[^{]*\{\s*return \{\s*\.\.\.this\.projectMark\(s, projects\)/.test(panel)
    && /lastWindow: this\.deps\.lastWindow\(\)\.map\(r => \(\{[\s\S]{0,160}\.\.\.this\.projectMark\(r, projectList\)/.test(panel)
    && /const projectId = this\.deps\.sessionProject\(\{ sessionId: s\.sessionId, agentName: s\.agentName, cwd: s\.cwd \}\)/.test(panel));
ok('…and answers openProject with the command the sidebar uses',
    /case 'openProject':[\s\S]{0,200}agentfarm\.openProject/.test(panel));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
