/**
 * Guard: A TOOLTIP THAT TEACHES THE QUERY GRAMMAR BELONGS TO A BOX YOU TYPE A
 * QUERY INTO — audit B-05.
 *
 * `AFQuery.tip(subject)` is not "make me a tooltip". It is the SEARCH BOX's
 * tooltip: it returns the subject, a blank line, and then the whole query
 * grammar (`OR must be uppercase`, `-a excludes…`, `(a OR b)`, `"…"`). Read as
 * a name it looks generic, and on the Alert Sounds section it was used as one.
 *
 * Measured on `alertsettings` before the repair: TWENTY-ONE controls carried
 * the grammar and exactly ONE of them was a search box. Hovering «🔇 Mute the
 * farm» explained boolean operators; so did «Quiet hours», «rate», «vol», the
 * reminder-tone picker, the voice picker, the announcement template, the five
 * per-event sound pickers, the three sound-library name fields, and all four
 * column headers of the table. None of them search anything.
 *
 * No string test could have failed on it — every sentence was well-formed and
 * the SUBJECT of each was correct; the defect was the paragraph bolted on
 * after it. So the rule is measured from two ends:
 *
 *   1. SOURCE — every `AFQuery.tip(...)` call says what is SEARCHED. That is
 *      what the helper is for, and it is the line where the mistake is made.
 *   2. SCREEN — on a laid-out page, an element carrying the grammar is an
 *      `<input>` you can type into. A `<label>`, a `<th>`, a `<select>` or a
 *      button carrying it is the defect, whatever it happens to say.
 *
 *   node test/test_tooltip_subject.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

// ---- 1. the source rule ---------------------------------------------------
// The helper's own contract, read off the helper rather than assumed: it
// appends the grammar to whatever it is given.
{
    const q = fs.readFileSync(path.join(ROOT, 'media', 'afQuery.js'), 'utf8');
    ok('AFQuery.tip really does append the query grammar (so this rule is needed)',
        /function tip\(subject[\s\S]{0,400}SYNTAX/.test(q));
}

{
    const dir = path.join(ROOT, 'media');
    const offenders = [];
    let calls = 0;
    for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.js'))) {
        const lines = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r/g, '').split('\n');
        lines.forEach((ln, i) => {
            const at = ln.indexOf('AFQuery.tip(');
            if (at < 0) { return; }
            // A comment about the helper is not a call of it.
            if (/^\s*(\/\/|\*|\/\*)/.test(ln)) { return; }
            calls++;
            // The subject may start on this line or the next — a call that
            // wraps is still one call, so look at the two together.
            const near = ln.slice(at) + ' ' + (lines[i + 1] || '');
            if (!/Search(ed|es|ing)?\b|Filter(ed|s|ing)?\b/i.test(near)) {
                offenders.push(`${f}:${i + 1} ${ln.trim().slice(0, 90)}`);
            }
        });
    }
    ok(`every AFQuery.tip call names what is SEARCHED (${calls} calls)`
        + (offenders.length ? '\n      ' + offenders.slice(0, 8).join('\n      ') : ''),
        calls > 0 && offenders.length === 0);
}

// ---- 2. the screen rule ---------------------------------------------------
const CANDIDATES = [
    process.env.AF_CHROME,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
];

if (!CANDIDATES.some(p => p && fs.existsSync(p))) {
    console.log('  (no Chrome or Edge on this machine — the measured half is skipped)');
} else {
    const node = (args) => execFileSync(process.execPath, args,
        { cwd: ROOT, encoding: 'utf8', timeout: 300000, stdio: ['ignore', 'pipe', 'pipe'] });

    // Every tooltip a page can carry, in one expression: the native `title`
    // and the two attributes AFTip reads.
    const expr = "(function(){var o=[];document.querySelectorAll('[title],[data-aftip-body],[data-tip]')"
        + ".forEach(function(e){var t=(e.getAttribute('title')||'')+' '+(e.getAttribute('data-aftip-body')||'')"
        + "+' '+(e.getAttribute('data-tip')||'');if(t.indexOf('OR must be uppercase')<0){return;}"
        + "o.push({tag:e.tagName,type:(e.getAttribute('type')||''),id:e.id||'',"
        + "txt:(e.innerText||'').trim().slice(0,40)});});return o;})()";

    // `alertsettings` is where the defect lived; `tasks` is carried alongside
    // it so a rule that passed by finding nothing at all would be visible —
    // that page really does have search boxes and they really do keep the
    // grammar.
    for (const fixture of ['alertsettings', 'tasks']) {
        node([path.join('test', 'render_page.js'), fixture]);
        let boxes = [];
        try {
            const raw = node([path.join('test', 'measure_page.js'), fixture, expr]);
            boxes = JSON.parse(raw.slice(raw.indexOf('[')));
        } catch { boxes = []; }

        ok(`${fixture}: the page really carries the grammar somewhere (${boxes.length})`,
            boxes.length > 0);

        const wrong = boxes.filter(b => b.tag !== 'INPUT');
        ok(`‼️ ${fixture}: only a box you type a query into teaches the query grammar`
            + (wrong.length
                ? ' — ' + Array.from(new Set(wrong.map(b => b.tag + (b.txt ? ' «' + b.txt + '»' : ''))))
                    .slice(0, 6).join(', ')
                : ''),
            wrong.length === 0);
    }
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
