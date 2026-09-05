// U-128 — AN OPTION IN A NARROW BOX SAYS ITS OWN NAME.
//
// The user asked why the Console's project picker did not show a project's full
// name on hover when the boxes beside it did, and answered the question in the
// asking: our own design principles already said it had to. The measurement was
// worse than the report — 2 291 of the 2 639 options this extension draws
// carried no usable `title` at all, so the answer could not be "put one on that
// box" and be honest.
//
//   · ‼️ A `<select>` CUTS ITS OWN TEXT and the popup it opens is drawn by the
//     operating system, so an AFTip cannot reach into it. The option's native
//     `title` is the ONLY surface there is; an option without one is a fact the
//     reader cannot get to at all.
//   · ‼️ THIS IS A BUDGET, NOT A BAN — the same shape as the parity gate's
//     `gapBudget`. Every page is measured today and no page may get worse; a
//     page that is cleaned up lowers its own number and can never go back. A
//     page missing from the manifest must be at zero, so a NEW page cannot be
//     added with the defect already in it.
const fs = require('fs');
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const FIXTURES = path.join(__dirname, 'fixtures');
const MANIFEST = path.join(__dirname, 'optiontips.manifest.json');

/**
 * Everything the page wrote — `#app` when it has the page, plus every slot it
 * filled separately. The same reach `render_page.js` uses to take a picture,
 * for the same reason: the Console writes a shell and then fills a dozen empty
 * slots inside it, and looking at only one of the two sees half a page.
 */
function markup(r) {
    const app = r.els.app && r.els.app.innerHTML;
    let h = (app && app.trim()) ? app : r.html();
    for (const id of Object.keys(r.els)) {
        if (id !== 'app') { h += '\n' + String(r.els[id].innerHTML || ''); }
    }
    return h;
}

/** How many options this page draws, and how many of them say nothing. */
function measure(name) {
    let fixture, variants;
    try { fixture = require(path.join(FIXTURES, name + '.js')); } catch { return null; }
    try { variants = fixture.variants ? fixture.variants() : [{ id: name, data: fixture.data() }]; }
    catch { return null; }
    let total = 0, bare = 0;
    const samples = [];
    for (const v of variants) {
        let r;
        try {
            r = runPage(fixture.script, v.data, fixture.window || {});
            if (v.act) { v.act(r); }
        } catch { continue; }
        let h = '';
        try { h = markup(r); } catch { continue; }
        // ‼️ U-130 — A `<datalist>` OPTION IS NOT ONE OF THESE. It is not in a
        // `<select>`, it opens no popup of its own, and no browser shows a
        // `title` on it — it is a SUGGESTION behind a text box the reader can
        // type anything into. Counting it made the debt look bigger than it
        // was and, worse, invited dead markup: a title nobody can ever see.
        h = h.replace(/<datalist\b[\s\S]*?<\/datalist>/gi, '');
        for (const o of (h.match(/<option\b[^>]*>[^<]*/g) || [])) {
            total++;
            const t = /title="([^"]*)"/.exec(o);
            if (!t || !t[1].trim()) {
                bare++;
                samples.push((o.split('>')[1] || '').trim().slice(0, 30));
            }
        }
    }
    return { total, bare, samples: [...new Set(samples)].slice(0, 4) };
}

const budget = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const names = fs.readdirSync(FIXTURES).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3));

let drawn = 0, bare = 0, regressed = 0, improved = [];
for (const name of names) {
    const m = measure(name);
    if (!m || !m.total) { continue; }
    drawn += m.total; bare += m.bare;
    const allowed = Object.prototype.hasOwnProperty.call(budget.pages, name) ? budget.pages[name] : 0;
    if (m.bare > allowed) {
        regressed++;
        console.log(`  FAIL ${name}: ${m.bare} option(s) with no usable title, budget ${allowed}`
            + (m.samples.length ? ` — e.g. ${m.samples.join(' · ')}` : ''));
    } else if (m.bare < allowed) {
        improved.push(`${name} ${allowed}→${m.bare}`);
    }
}
ok('‼️ no page draws more title-less options than its budget allows', regressed === 0);
if (improved.length) {
    console.log('  (budget can be lowered: ' + improved.join(', ') + ')');
}

// ---- and the page the item was actually about ---------------------------
{
    const c = measure('console');
    ok('U-128: the Console draws options at all, so the check is measuring something',
        !!c && c.total > 100);
    ok('‼️ U-128: …and every single one of them says its own name',
        !!c && c.bare === 0);

    const fixture = require(path.join(FIXTURES, 'console.js'));
    const norm = x => String(x).replace(/&[a-z]+;|&#\d+;/g, '').replace(/\s+/g, ' ').trim();
    let seen = 0, mismatched = 0;
    for (const v of (fixture.variants ? fixture.variants() : [])) {
        let r;
        try { r = runPage(fixture.script, v.data, fixture.window || {}); if (v.act) { v.act(r); } }
        catch { continue; }
        for (const o of (markup(r).match(/<option\b[^>]*title="([^"]*)"[^>]*>([^<]*)/g) || [])) {
            const t = /title="([^"]*)"/.exec(o)[1];
            const label = (o.split('>')[1] || '').trim();
            if (!label) { continue; }
            seen++;
            if (norm(t).indexOf(norm(label).slice(0, 12)) < 0) { mismatched++; }
        }
    }
    // ‼️ THE NAME, NOT A CONSTANT. A title that said the same thing on every
    // option would pass a "has a title" check and give the reader nothing —
    // the point is the text the box CUT, handed back whole.
    ok('‼️ U-128: an option\'s hover OPENS with the option\'s own text',
        seen > 40 && mismatched === 0);
}

console.log(`\n${drawn} options measured · ${bare} still say nothing`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
