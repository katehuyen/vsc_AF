/**
 * Guard: a CLASS ON A TABLE ELEMENT MAY NOT BE GIVEN A NON-TABLE `display`.
 *
 * Found in audit B-02.3. The Missions delegation table drew its column headers
 * in the right third of the page while their own data sat on the left, and no
 * string test could see it: the markup was a correct <table> with seven <th>
 * and seven <td>. The cause was a NAME, not a layout. The mission composer
 * above declares `.srow { display:flex }` for its form rows, and the step row
 * of the delegation table was also called `.srow` — so the <tr> became a flex
 * container, its cells stopped being table cells, and the <thead> was left to
 * lay itself out against nothing.
 *
 * A collision like that is invisible to review (the two rules are 350 lines
 * apart) and invisible to the suite (both selectors are legal CSS). It is
 * visible to a measurement, and this is that measurement written as a rule
 * rather than as a list of the classes we happen to know about today: every
 * page script is read, the classes it puts on <tr>/<td>/<th> are collected
 * from its own markup, and any CSS rule in the same file that gives one of
 * them a display of flex/grid/block/inline-* is a finding.
 *
 *   node test/test_table_row_display.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MEDIA = path.join(ROOT, 'media');

let pass = 0, fail = 0;
function ok(what, cond) {
    if (cond) { pass++; console.log('  ok  ' + what); }
    else { fail++; console.log('FAIL  ' + what); }
}

// `display` values a table element can carry without losing its cells. `none`
// is here because hiding a row is a legitimate thing to do to one.
const SAFE_DISPLAY = new Set([
    'none', 'contents', 'table', 'inline-table', 'table-row', 'table-cell',
    'table-row-group', 'table-header-group', 'table-footer-group',
    'table-column', 'table-column-group', 'table-caption', 'revert', 'inherit', 'initial', 'unset'
]);

/** Class tokens a file puts on a <tr>, <td> or <th>. Interpolations are
 *  dropped — `${x ? 'a' : ''}` is not a literal class we can judge. */
function tableClasses(src) {
    const out = new Set();
    const re = /<(tr|td|th)\b[^>]*?\bclass="([^"]*)"/g;
    let m;
    while ((m = re.exec(src))) {
        m[2].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).forEach(t => {
            if (t && /^[A-Za-z][\w-]*$/.test(t)) { out.add(t); }
        });
    }
    return out;
}

/** Every CSS rule in the file that sets `display`, as
 *  `{ selector, value }` — one entry per selector in a group. */
function displayRules(src) {
    const out = [];
    // Selectors live in <style> template literals; a rule is `sel { … }` with no
    // nested braces of its own. Interpolations inside a body would break the
    // match, and a rule carrying one is not a static declaration we can judge.
    const re = /([^{}();`]+)\{([^{}`]*)\}/g;
    let m;
    while ((m = re.exec(src))) {
        const body = m[2];
        const d = /(?:^|[;{\s])display\s*:\s*([A-Za-z-]+)/.exec(body);
        if (!d) { continue; }
        const sel = m[1].trim().replace(/\s+/g, ' ');
        if (!sel || !sel.includes('.')) { continue; }
        sel.split(',').forEach(s => {
            const one = s.trim();
            if (one) { out.push({ selector: one, value: d[1].toLowerCase() }); }
        });
    }
    return out;
}

/** The classes in a selector's LAST compound — the ones that name the element
 *  the rule actually styles. `.sform .srow` styles `.srow`, not `.sform`. */
function subjectClasses(selector) {
    const last = selector.split(/[\s>+~]+/).filter(Boolean).pop() || '';
    return (last.match(/\.([A-Za-z][\w-]*)/g) || []).map(c => c.slice(1));
}

const files = fs.readdirSync(MEDIA).filter(f => f.endsWith('.js')).sort();
ok('there are page scripts to read at all', files.length > 0);

const findings = [];
let scannedWithTables = 0;
for (const f of files) {
    const src = fs.readFileSync(path.join(MEDIA, f), 'utf8');
    const classes = tableClasses(src);
    if (!classes.size) { continue; }
    scannedWithTables++;
    for (const rule of displayRules(src)) {
        if (SAFE_DISPLAY.has(rule.value)) { continue; }
        for (const c of subjectClasses(rule.selector)) {
            if (classes.has(c)) {
                findings.push(`${f}: <tr|td|th class="${c}"> is also styled "${rule.selector} { display:${rule.value} }"`);
            }
        }
    }
}

ok('more than one page script draws tables (the scan is not looking at one file)',
    scannedWithTables > 1);
ok('‼️ NO TABLE-ELEMENT CLASS IS GIVEN A NON-TABLE display'
    + (findings.length ? '\n      ' + findings.join('\n      ') : ''),
    findings.length === 0);

// The rule is only worth anything if it can see the defect it was written for,
// so the original collision is replayed against the same scanner.
{
    const src = fs.readFileSync(path.join(MEDIA, 'missions.js'), 'utf8');
    ok('the delegation step row still carries a class of its own',
        /<tr class="steprow" data-step=/.test(src));

    const broken = src.replace('<tr class="steprow" data-step=', '<tr class="srow" data-step=');
    const classes = tableClasses(broken);
    const hits = displayRules(broken).filter(r => !SAFE_DISPLAY.has(r.value)
        && subjectClasses(r.selector).some(c => classes.has(c)));
    ok('…and putting it back on the composer\'s .srow is caught by this scan (mutation)',
        hits.length > 0 && hits.some(h => h.value === 'flex'));
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
