// af-test-budget: 600
// U-239 — HIGH CONTRAST IS HELD TO THE SAME RATCHET AS LIGHT. Every fixture is rendered in High
// Contrast and High Contrast Light with the variables VS Code really gives (test/theme_vars.json) and
// measured (lib_theme_audit): the texts below the contrast they need, and the LOST EDGES — each box the
// dark theme draws (a fill or a line) whose edge there is below 3:1. High Contrast sets no button or
// selection fill, so a control that is only a fill vanishes into text there; this is the number that
// says so. test/themeaudit.hc.manifest.json holds each page's [low texts, lost edges] per kind as
// measured: a page may not draw more of either, and a page not in it may draw none.
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

let bin = null;
try { bin = require('./shoot_page').browser(); } catch { bin = null; }
if (!bin) { console.log('test_theme_audit_hc: no Chrome here — skipped'); process.exit(0); }

const { run, pages, lost, HC, HC_MANIFEST } = require('./theme_audit');
const budget = JSON.parse(fs.readFileSync(HC_MANIFEST, 'utf8'));

(async () => {
    const list = pages();
    ok('the budget holds both high-contrast kinds', HC.every(k => budget[k] && typeof budget[k] === 'object'));
    const dark = await run('dark', list, bin, 3);
    for (const kind of HC) {
        const r = await run(kind, list, bin, 3);
        const broken = list.filter(p => r[p].error || dark[p].error);
        ok(`every page renders and is measured in ${kind}` + (broken.length ? ' — not: ' + broken.join(', ') : ''), broken.length === 0);
        const unread = list.filter(p => !r[p].error && r[p].unread.length);
        ok(`‼️ every colour on every page is read in ${kind} — none skipped unseen` + (unread.length ? ' — not: ' + unread.map(p => p + ' ' + r[p].unread.join(' ')).join(' · ') : ''), unread.length === 0);
        const over = [], under = [];
        for (const p of list) {
            if (r[p].error || dark[p].error) { continue; }
            const [lowB, lostB] = Object.prototype.hasOwnProperty.call(budget[kind] || {}, p) ? budget[kind][p] : [0, 0];
            const gone = lost(dark[p], r[p]);
            if (r[p].low > lowB) {
                over.push(p);
                console.log(`  FAIL ${kind} ${p}: ${r[p].low} text(s) below their contrast, budget ${lowB} — e.g. `
                    + r[p].worst.map(w => `"${w.text}" ${w.ratio}:1 (${w.where})`).join(' · '));
            }
            if (gone.length > lostB) {
                over.push(p);
                console.log(`  FAIL ${kind} ${p}: ${gone.length} box(es) the dark theme draws lost their edge, budget ${lostB} — e.g. `
                    + gone.slice(0, 3).map(e => `${e[3]} ${e[1] / 100}:1`).join(' · '));
            }
            if (r[p].low < lowB || gone.length < lostB) { under.push(`${p} [${lowB},${lostB}]→[${r[p].low},${gone.length}]`); }
        }
        ok(`‼️ no page draws more low-contrast text or more lost edges in ${kind} than its budget allows`, over.length === 0);
        if (under.length) { console.log(`  (${kind} budget can be lowered: ` + under.join(', ') + ')'); }
        ok(`the ${kind} budget names only pages that exist`, Object.keys(budget[kind] || {}).every(p => list.includes(p)));
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
