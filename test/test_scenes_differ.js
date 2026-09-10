/**
 * Guard: NO TWO SCENES OF A FIXTURE DRAW THE SAME PAGE.
 *
 * Found in audit B-02.2. The Missions fixture's `history` scene is labelled
 * "The recorded history strip, PANEL OPEN". It had no `act` and no tip, so it
 * rendered the default page — byte for byte the same picture as the scene above
 * it, and with the panel it is named after nowhere on it. Nothing was wrong
 * with the page; the SCENE was a promise nobody had kept, and the suite had no
 * way of noticing because every string it asserts was present in both copies.
 *
 * Two scenes that produce identical markup are one scene and one lie about what
 * has been looked at — which is the whole disease this audit track exists for.
 * A scene costs a photograph and a reading; a duplicate costs those and returns
 * a verdict about a state that was never drawn.
 *
 * This is deliberately a rule about ALL page fixtures rather than a list: the
 * next scene added by deriving one from another inherits the check.
 *
 *   node test/test_scenes_differ.js
 */
const fs = require('fs');
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

let pass = 0, fail = 0;
function ok(what, cond) {
    if (cond) { pass++; console.log('  ok  ' + what); }
    else { fail++; console.log('FAIL  ' + what); }
}

const FIXTURES = path.join(__dirname, 'fixtures');

/** Everything the page wrote — the same reach `render_page.js` photographs. */
function markup(r) {
    const app = r.els.app && r.els.app.innerHTML;
    let h = (app && app.trim()) ? app : r.html();
    for (const id of Object.keys(r.els)) {
        if (id !== 'app') { h += '\n' + String(r.els[id].innerHTML || ''); }
    }
    return h;
}

const names = fs.readdirSync(FIXTURES).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3));
const findings = [];
let scenes = 0, fixtures = 0;

for (const name of names) {
    let fixture;
    try { fixture = require(path.join(FIXTURES, name + '.js')); } catch { continue; }
    if (!fixture.variants || !fixture.script) { continue; }
    let variants;
    try { variants = fixture.variants(); } catch { continue; }
    if (variants.length < 2) { continue; }
    fixtures++;
    const seen = new Map();
    for (const v of variants) {
        let h;
        try {
            const r = runPage(fixture.script, v.data, fixture.window || {}, v.state);
            if (v.act) { v.act(r); }
            h = markup(r);
        } catch { continue; }
        scenes++;
        // A scene may declare a tip or a menu instead of an act — what those
        // open is added by the renderer, not by the page, so a scene that names
        // one is drawing something the scene beside it is not.
        const key = (v.tip ? 'tip:' + v.tip + '\n' : '') + (v.menu ? 'menu:' + v.menu + '\n' : '') + h;
        // ‼️ AND A KNOWN TWIN SAYS SO ON ITSELF. One case is real: the Console's
        // palette only exists after a press this harness cannot make (the shim
        // holds one identity per slot id, measured and documented in that
        // fixture). A scene that DECLARES the twin is a gap somebody measured;
        // an undeclared one is a promise nobody kept, which is the whole point.
        if (v.twin) {
            if (!variants.some(o => o.id === v.twin)) {
                findings.push(`${name}: "${v.id}" declares twin "${v.twin}", which is not a scene here`);
            }
            continue;
        }
        if (seen.has(key)) {
            findings.push(`${name}: "${v.id}" draws exactly what "${seen.get(key)}" draws`);
        } else {
            seen.set(key, v.id);
        }
    }
}

ok(`there are multi-scene fixtures to check (${fixtures} fixtures · ${scenes} scenes)`,
    fixtures > 1 && scenes > 10);
ok('‼️ EVERY SCENE DRAWS SOMETHING THE OTHERS DO NOT'
    + (findings.length ? '\n      ' + findings.join('\n      ') : ''),
    findings.length === 0);

// The rule has to be able to see the case it was written for: `history` was
// the default page under a label that said "panel open", and taking its tip
// away must put it straight back on top of the scene it used to duplicate.
{
    const fixture = require(path.join(FIXTURES, 'missions.js'));
    const variants = fixture.variants();
    const hist = variants.find(v => v.id === 'history');
    ok('the history scene still names the panel it is a picture of', !!hist && !!hist.tip);

    const draw = (v) => {
        const r = runPage(fixture.script, v.data, fixture.window || {}, v.state);
        if (v.act) { v.act(r); }
        return markup(r);
    };
    const others = variants.filter(v => v.id !== 'history' && !v.act && !v.tip && !v.menu).map(draw);
    ok('…and without it the page it draws is one another scene already draws (mutation)',
        !!hist && others.some(h => h === draw(Object.assign({}, hist, { tip: undefined }))));
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
