// U-219 — WHAT WAS TYPED AND NOT SENT SURVIVES A REDRAW, PAGE BY PAGE.
//
// AFRepaint.keeping carries a box the user changed into the new DOM by its id. A page takes it
// only once its own send-and-clear path is known, or the push after a send brings the sent words
// back. Measured per candidate: Notices, Chains, Now, Queue and Tasks already draw their boxes from
// page state (or hold the push while composing). Open here: Missions (a live run's steer and answer
// boxes), Projects (a project's settings, the plan's new item) and Settings (the raw settings.json box).
// `scope` keeps one project's words out of another project's form, which uses the same ids.
//
//   node test/test_keeping_pages.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const box = { window: {}, document: undefined, setTimeout: fn => fn() };
box.globalThis = box;
vm.createContext(box);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'media', 'afRepaint.js'), 'utf8'), box);
const R = box.window.AFRepaint;

// ---------- scope: whose boxes are on screen ----------
{
    const listeners = {};
    let els = [];
    let shown = 'prj_a';
    const doc = {
        addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
        querySelectorAll: () => els.slice(),
        getElementById: id => els.find(e => e.id === id) || null,
        type(id, value) { const e = doc.getElementById(id); e.value = value; for (const fn of listeners.input || []) { fn({ target: e }); } }
    };
    const page = summary => [{ id: 'f-summary', tagName: 'INPUT', type: 'text', value: summary, defaultValue: summary }];
    let next = 'prj_a';
    const render = () => { shown = next; els = page(next === 'prj_a' ? 'A says' : 'B says'); };
    render();
    const draw = R.keeping(render, { document: doc, scope: () => shown });
    doc.type('f-summary', 'typed for A');
    draw();
    ok('‼️ the same project redrawn keeps what was typed for it', doc.getElementById('f-summary').value === 'typed for A');
    next = 'prj_b';
    draw();
    ok('‼️ a redraw that shows ANOTHER project never carries A\'s words into B\'s box', doc.getElementById('f-summary').value === 'B says');
    next = 'prj_a';
    draw();
    ok('…and coming back draws A as the page has it', doc.getElementById('f-summary').value === 'A says');
    const plain = R.keeping(render, { document: doc });
    doc.type('f-summary', 'again');
    plain();
    ok('without scope it carries as before', doc.getElementById('f-summary').value === 'again');
}

const src = f => fs.readFileSync(path.join(ROOT, 'media', f), 'utf8');

// ---------- Missions ----------
{
    const s = src('missions.js');
    ok('Missions: the push draws through keeping under the guard',
        /const draw = window\.AFRepaint\.keeping\(render\);\s*const repaint = window\.AFRepaint\.guard\(draw\);/.test(s));
    ok('…a queued steer empties its box, a refused one keeps it, and the answer redraws through keeping',
        /if \(!m\.error\) \{ const box = document\.getElementById\('gd-text-' \+ m\.runId\); if \(box\) \{ box\.value = ''; \} \}\s*draw\(\);/.test(s));
    ok('…a sent answer empties its box (the host never refuses one)',
        /vscode\.postMessage\(\{ type: 'answer', runId: id, text: inp \? inp\.value : '' \}\);[\s\S]{0,140}if \(inp\) \{ inp\.value = ''; \}/.test(s));
    const host = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'missionsPanel.ts'), 'utf8');
    ok('…which is what the host does: answer records, guide answers guided with its error',
        /case 'answer':[\s\S]{0,160}this\.deps\.answer\(msg\.runId, msg\.text\);/.test(host)
        && /type: 'guided', runId: msg\.runId, note: out\.note \?\? '', error: out\.error \?\? ''/.test(host));
}

// ---------- Projects ----------
{
    const s = src('projects.js');
    ok('Projects: keeping with the shown project as its scope, under the guard',
        /const draw = window\.AFRepaint\.keeping\(render, \{ scope: \(\) => shownProject \}\);\s*const repaint = window\.AFRepaint\.guard\(draw\);/.test(s));
    ok('…render says whose boxes it drew', /function render\(\) \{\s*const p = sel\(\);[\s\S]{0,200}shownProject = p \? p\.id : '';/.test(s));
    ok('…a plan item is remembered as sent, and only its own clean answer empties the box',
        /planSent = item;\s*vscode\.postMessage\(\{\s*type: 'planAdd'/.test(s)
        && /if \(!ev\.data\.error && box && box\.value\.trim\(\) === planSent\) \{ box\.value = ''; \}\s*planSent = null;/.test(s));
    const host = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'projectsPanel.ts'), 'utf8');
    ok('…the host answers before it pushes, so the box is empty before the redraw',
        /postMessage\(\{ type: 'result', error: error \?\? null, ok: ok \?\? null \}\);\s*this\.refresh\(\);/.test(host)
        && /this\.deps\.planAdd\(id, item, String\(msg\.section \?\? ''\)\);\s*this\.done\(res\.error/.test(host));
}

// ---------- Settings ----------
{
    const s = src('settings.js');
    ok('Settings: the push draws through keeping under the guard',
        /const draw = window\.AFRepaint\.keeping\(render\);\s*const repaint = window\.AFRepaint\.guard\(draw\);/.test(s));
    ok('‼️ …so does the redraw when focus leaves with a held push, and a refused raw Apply',
        /if \(pendingData\) \{ DATA = pendingData; pendingData = null; ccRawLanded\(\); draw\(\); \}/.test(s)
        && /errors\['cc:' \+ ev\.data\.id\] = ev\.data\.error;\s*if \(ev\.data\.id === '__raw__'\) \{ ccRawSent = null; \}\s*draw\(\);/.test(s));
    ok('…an Apply remembers the file it was written over; a push that changed the file hands the box back to it',
        /ccRawSent = \{ was: DATA\.claude \? String\(DATA\.claude\.raw\) : '' \};\s*vscode\.postMessage\(\{ type: 'ccRaw'/.test(s)
        && /if \(ta && now !== ccRawSent\.was\) \{ ta\.value = ta\.defaultValue; \}/.test(s)
        && /DATA = \{ \.\.\.DATA, \.\.\.ev\.data\.data \};\s*ccRawLanded\(\);/.test(s));
    const host = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'settingsPanel.ts'), 'utf8');
    ok('…which is what the host does: a refusal is ccError with no push, a write is a push',
        /if \(!v\.ok\) \{\s*void this\.host\.webview\.postMessage\(\{ type: 'ccError', id: '__raw__', error: v\.error \}\);\s*break;/.test(host));
}

// ---------- the pages that need nothing: their boxes are page state ----------
{
    ok('Notices: answer, queue and edit boxes are drafts', /\$\{esc\(draft\)\}<\/textarea>/.test(src('notices.js'))
        && /drafts\[t\.dataset\.id\] = t\.value/.test(src('notices.js')));
    ok('Chains, Now, Queue: drawn from the form, the draft, the add draft', /\$\{esc\(form\.prompt\)\}<\/textarea>/.test(src('chains.js'))
        && /id="nw-text"[^\n]*\$\{esc\(draft\)\}/.test(src('now.js')) && /\$\{esc\(addDraft\.text\)\}<\/textarea>/.test(src('queue.js')));
    ok('Tasks: a push waits while the composer is open', /AFRepaint\.guard\(render, \{\s*busy: \(\) => !!composer/.test(src('tasksPage.js')));
}

console.log(`\ntest_keeping_pages: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
