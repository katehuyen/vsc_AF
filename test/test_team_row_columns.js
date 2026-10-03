/**
 * Guard: THE TEAM ROWS OF THE MISSION FORM ARE COLUMNS, on every row.
 *
 * Found in audit B-02.2, by measuring the laid-out page rather than reading it.
 * X-225 draws the account picker only where this machine holds a sign-in for
 * the engine that row is on — which is right; a box with no referent is what
 * `docs/CONVENTIONS.md` forbids. But `.tmrow` is a flex row, so DROPPING the
 * sixth control let the other five grow into the space it left. Measured on the
 * scene where one member runs on OpenCode:
 *
 *   manager    en@481..649  md@657..825  ef@833..1001  pm@1009..1177  ac@1185..1353
 *   developer  en@567..735  md@743..911  ef@919..1087  pm@1095..1263  (nothing)
 *
 * Three rows of the same five axes, and not one of them under the row above:
 * the developer's ENGINE box sat under the manager's MODEL, its PERMISSIONS
 * under the manager's ACCOUNT. The row has no header, so the only way to know
 * which box was which was to hover every one of them.
 *
 * The fix holds the slot instead of the box, and this is the rule that keeps it
 * held: every team row a variant draws carries the same axes, and the account
 * axis is present exactly once — as its `<select>` or as the placeholder that
 * says why there is nothing to choose.
 *
 *   node test/test_team_row_columns.js
 */
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

let pass = 0, fail = 0;
function ok(what, cond) {
    if (cond) { pass++; console.log('  ok  ' + what); }
    else { fail++; console.log('FAIL  ' + what); }
}

const fixture = require(path.join(__dirname, 'fixtures', 'missions.js'));

/** The axes a team row draws, in the order the row resolves them (U-97).
 *  The account axis is satisfied by EITHER control — that is the point. */
const AXES = [
    { name: 'agent', re: /<input type="checkbox" id="tm-/ },
    { name: 'role', re: /id="rl-/ },
    { name: 'engine', re: /id="en-/ },
    // X-493 — on a route that decides the model the cell is a placeholder naming its axis
    { name: 'model', re: /id="md-|data-axis="model"/ },
    { name: 'effort', re: /id="ef-/ },
    { name: 'permissions', re: /id="pm-/ },
    { name: 'account', re: /id="ac-|data-axis="account"/ },
    // ‼️ X-107 — two more axes on the same rule: the box where the engine has
    // routes, the placeholder where it has none, and the tier's placeholder
    // until a route that serves tiers is named above it. Each placeholder
    // names ITS axis, so a route dash cannot satisfy the account column.
    { name: 'route', re: /id="pr-|data-axis="route"/ },
    { name: 'tier', re: /id="tr-|data-axis="tier"/ }
];

/** Everything the page wrote — the same reach `render_page.js` takes a picture
 *  of, because the form is filled into a slot rather than into #app alone. */
function markup(r) {
    const app = r.els.app && r.els.app.innerHTML;
    let h = (app && app.trim()) ? app : r.html();
    for (const id of Object.keys(r.els)) {
        if (id !== 'app') { h += '\n' + String(r.els[id].innerHTML || ''); }
    }
    return h;
}

/** The inner markup of each `<div class="tmrow">…</div>`. A row holds only
 *  labels, inputs, selects and spans — no div of its own — so the first
 *  `</div>` after it is its own closing tag. */
function teamRows(html) {
    const out = [];
    const re = /<div class="tmrow">/g;
    let m;
    while ((m = re.exec(html))) {
        const start = m.index + m[0].length;
        const end = html.indexOf('</div>', start);
        out.push(html.slice(start, end === -1 ? html.length : end));
    }
    return out;
}

let rowsSeen = 0, accountless = 0, routeless = 0, tiered = 0, routedModel = 0;
const findings = [];
for (const v of fixture.variants()) {
    let html;
    try {
        const r = runPage(fixture.script, v.data, fixture.window || {});
        if (v.act) { v.act(r); }
        html = markup(r);
    } catch { continue; }
    for (const [i, row] of teamRows(html).entries()) {
        rowsSeen++;
        const missing = AXES.filter(a => !a.re.test(row)).map(a => a.name);
        if (missing.length) { findings.push(`${v.id} row ${i + 1}: no ${missing.join(', ')}`); }
        if (/data-axis="account"/.test(row)) { accountless++; }
        if (/data-axis="route"/.test(row)) { routeless++; }
        if (/id="tr-/.test(row)) { tiered++; }
        if (/data-axis="model"/.test(row)) { routedModel++; }
    }
}

ok('the fixture draws team rows at all', rowsSeen > 0);
ok('‼️ EVERY TEAM ROW CARRIES EVERY AXIS — a dropped slot is a shifted column'
    + (findings.length ? '\n      ' + findings.join('\n      ') : '')
    + ` (${rowsSeen} rows)`,
    findings.length === 0);
ok('…and at least one row is on an engine with no sign-ins, so the placeholder'
    + ` is really being exercised (${accountless} of ${rowsSeen})`,
    accountless > 0);
ok('‼️ X-107 — …and one on an engine with no routes, so THAT placeholder is'
    + ` exercised too (${routeless} of ${rowsSeen})`,
    routeless > 0);
ok('…and one on a route that serves tiers, so the tier box is really drawn'
    + ` and not only its placeholder (${tiered} of ${rowsSeen})`,
    tiered > 0);
ok('X-493 — …and on that route the Model cell is the placeholder, so it holds its column too'
    + ` (${routedModel} of ${rowsSeen})`,
    routedModel > 0);

// The placeholder holds the column only if it is given the select's own flex
// slot; a bare <span> would collapse and put the rows back out of line.
{
    const fs = require('fs');
    const css = fs.readFileSync(path.join(__dirname, '..', 'media', 'missions.js'), 'utf8');
    const sel = /\.tmrow select \{([^}]*)\}/.exec(css);
    const none = /\.tmnone \{([^}]*)\}/.exec(css);
    const flexOf = (s) => {
        const g = (k) => { const m = new RegExp(k + '\\s*:\\s*([^;]+)').exec(s || ''); return m ? m[1].trim() : ''; };
        return [g('flex'), g('min-width'), g('max-width')].join(' / ');
    };
    ok('both are declared', !!sel && !!none);
    ok(`…and the placeholder has the SAME flex slot as the box it stands in for (${flexOf(none && none[1])})`,
        !!sel && !!none && flexOf(sel[1]) === flexOf(none[1]));
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
