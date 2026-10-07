// af-test-budget: 420
// U-236 — THE LIGHT THEME'S DEBT CAN ONLY SHRINK. Every fixture is rendered in the light theme
// with the variables VS Code really gives (U-235) and measured (lib_theme_audit): the texts below
// the contrast they need. test/themeaudit.manifest.json holds each page's count as it was
// measured; a page may not draw more, and a page not in it may draw none. The same shape as the
// option-tips budget: today's debt is allowed, new debt is not. (The dark theme's own guard is a
// before/after check, test/theme_audit.js --snapshot / --compare: a fingerprint of every colour
// changes with any new markup, so it cannot be a standing test.)
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

let bin = null;
try { bin = require('./shoot_page').browser(); } catch { bin = null; }
if (!bin) { console.log('test_theme_audit: no Chrome here — skipped'); process.exit(0); }

const { run, pages } = require('./theme_audit');
const budget = JSON.parse(fs.readFileSync(path.join(__dirname, 'themeaudit.manifest.json'), 'utf8'));

(async () => {
    const list = pages();
    const r = await run('light', list, bin, 3);
    const broken = list.filter(p => r[p].error);
    ok('every page renders and is measured in the light theme' + (broken.length ? ' — not: ' + broken.join(', ') : ''), broken.length === 0);
    const unread = list.filter(p => !r[p].error && r[p].unread.length);
    ok('‼️ every colour on every page is read — none skipped unseen' + (unread.length ? ' — not: ' + unread.map(p => p + ' ' + r[p].unread.join(' ')).join(' · ') : ''), unread.length === 0);
    const over = [], under = [];
    for (const p of list) {
        if (r[p].error) { continue; }
        const allowed = Object.prototype.hasOwnProperty.call(budget.pages, p) ? budget.pages[p] : 0;
        if (r[p].low > allowed) {
            over.push(p);
            console.log(`  FAIL ${p}: ${r[p].low} text(s) below their contrast in light, budget ${allowed} — e.g. `
                + r[p].worst.map(w => `"${w.text}" ${w.ratio}:1 (${w.where})`).join(' · '));
        } else if (r[p].low < allowed) { under.push(`${p} ${allowed}→${r[p].low}`); }
    }
    ok('‼️ no page draws more low-contrast text in the light theme than its budget allows', over.length === 0);
    if (under.length) { console.log('  (budget can be lowered: ' + under.join(', ') + ')'); }
    ok('the budget names only pages that exist', Object.keys(budget.pages).every(p => list.includes(p)));
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
