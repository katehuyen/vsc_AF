/**
 * Guard: THE SCENE THAT EXISTS TO PROVE THE HOST'S RESOLUTION ACTUALLY CARRIES IT.
 *
 * Found in audit B-02.2. `form-preview` is the one picture of what a draft
 * would be refused for, and of a row drawing its ENGINE'S catalogue rather than
 * Claude's. It had never shown either. The page accepts a resolution only when
 * its token matches the draft as it stands (`previewSeq`, X-118); the scene
 * answered with a made-up `seq: 0`, and the first render has already moved that
 * counter past 0 — so every photograph ever taken of this scene was of a form
 * with no host answer at all, while its own label said "refusals and all".
 *
 * The lesson is not "seq 0 was wrong". It is that a scene which SENDS a host
 * message proves nothing unless the page KEPT it, and nothing in the suite was
 * asking that question. So this asks it of the rendered markup:
 *
 *   · the refusal list is on the page, with every fault at once;
 *   · the row whose engine came from the fleet offers that engine's models;
 *   · and the draft the reader sees is the one that was typed.
 *
 *   node test/test_preview_scene_truth.js
 */
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

let pass = 0, fail = 0;
function ok(what, cond) {
    if (cond) { pass++; console.log('  ok  ' + what); }
    else { fail++; console.log('FAIL  ' + what); }
}

const fixture = require(path.join(__dirname, 'fixtures', 'missions.js'));
const scene = fixture.variants().find(v => v.id === 'form-preview');
ok('the scene is still in the fixture', !!scene);

const r = runPage(fixture.script, scene.data, fixture.window || {});
scene.act(r);

function markup(res) {
    const app = res.els.app && res.els.app.innerHTML;
    let h = (app && app.trim()) ? app : res.html();
    for (const id of Object.keys(res.els)) {
        if (id !== 'app') { h += '\n' + String(res.els[id].innerHTML || ''); }
    }
    return h;
}
const html = markup(r);

// What the scene handed the page — read off the scene rather than repeated
// here, so a reworded refusal does not need this file edited too.
const sent = (function () {
    let found = null;
    const probe = runPage(fixture.script, scene.data, fixture.window || {});
    const realSend = probe.send;
    probe.send = (m) => { if (m && m.type === 'preview') { found = m; } return realSend(m); };
    scene.act(probe);
    return found;
})();
ok('the scene answers a `preview` at all', !!sent && !!sent.preview);

const problems = (sent && sent.preview && sent.preview.problems) || [];
ok(`the answer carries more than one fault, so "every fault at once" is what is drawn (${problems.length})`,
    problems.length > 1);

const missing = problems.filter(p => !html.includes(p.replace(/&/g, '&amp;').replace(/"/g, '&quot;')));
ok('‼️ EVERY REFUSAL THE HOST STATED IS ON THE PAGE'
    + (missing.length ? ' — missing: ' + missing.map(p => p.slice(0, 40)).join(' · ') : ''),
    missing.length === 0);

ok('…under the heading that says what the list is',
    /This draft would be refused/.test(html));

// The other half: the row the host resolved onto another engine offers THAT
// engine's models. Claude's aliases on a row that will launch on OpenCode is
// the exact lie X-121 was opened for.
ok('‼️ THE FLEET-RESOLVED ROW DRAWS ITS OWN ENGINE\'S CATALOGUE, not Claude\'s',
    /Grok Code/.test(html) && /Nemotron/.test(html));

// …and the answer landing did not wipe what was typed into the draft.
ok('the goal the scene typed survived the resolution',
    html.includes('Run the OpenCode engine through every production path'));

// The mutation this file was written against: an invented token is refused by
// the page, and the scene then proves nothing.
{
    const stale = runPage(fixture.script, scene.data, fixture.window || {});
    const realSend = stale.send;
    stale.send = (m) => realSend(m && m.type === 'preview' ? Object.assign({}, m, { seq: 0 }) : m);
    scene.act(stale);
    const h = markup(stale);
    ok('…and answering with a made-up seq draws no resolution at all (mutation)',
        !/This draft would be refused/.test(h));
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
