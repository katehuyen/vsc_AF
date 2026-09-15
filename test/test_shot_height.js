/**
 * Guard: THE PICTURE IS AS TALL AS WHAT IS DRAWN ON IT.
 *
 * Found in audit B-03.1. `shoot_page.js --scene N` is the tool every visual
 * verdict in `DENETİM - Sicil.md` rests on, and on the Console it answered
 * **1400×2305 for all seventeen scenes** — the height of the measuring window,
 * not of the scene. The cause is that a fixture carries the PAGE's stylesheet,
 * and `media/console.js` declares `html, body { height:100% }`: the body is
 * pinned to the viewport whatever is inside it, so `body.scrollHeight` reports
 * the window back. Measured at the time: sixteen of seventeen scenes removed,
 * the surviving `#app` 55..418, the body still 2308. A reader scaling 2305px
 * down to fit sees a 418px scene at a fifth of its size — which is the same
 * defect A-12.10 found from the other end, where the tool CUT instead.
 *
 * Three numbers, because the two obvious repairs each break one of the others:
 *
 *   1. a short scene of a page that pins the body — must be its own height,
 *      and nowhere near the measuring window;
 *   2. a scene whose AFTip panel hangs BELOW its page box — measuring only the
 *      renderer's own frame makes this one lose the panel it exists for;
 *   3. the whole Console montage — treating the body as a clipping ancestor
 *      (it declares its own overflow) throws away every scene past the first.
 *
 * It runs the real measuring pass out of `shoot_page.js`, not a copy of it, and
 * skips itself where there is no Chrome or Edge — the same rule as
 * test_console_identity_width.js.
 *
 *   node test/test_shot_height.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const RENDER = path.join(ROOT, 'dist', 'render');
const shoot = require('./shoot_page.js');
const { headlessFlags, sweepAndReport } = require('./headless_chrome');

let pass = 0, fail = 0;
function ok(what, cond) {
    if (cond) { pass++; console.log('  ok  ' + what); }
    else { fail++; console.log('FAIL  ' + what); }
}

let bin = null;
try { bin = shoot.browser(); } catch { bin = null; }
if (!bin) {
    console.log('  --  no Chrome or Edge on this machine; nothing to measure');
    console.log('0 passed, 0 failed');
    return;
}

/** The height the tool would shoot at, plus what the page says about itself. */
function measure(fixture, scene) {
    // ‼️ ALWAYS RENDERED, NEVER REUSED. `dist/render/` is whatever the last
    // person left there — a page from before today's change, or from a fixture
    // that has since grown two scenes. Measuring that is measuring the past
    // while reporting it as the present, which is the one failure this file
    // exists to catch in the SHOOTING tool.
    const src = path.join(RENDER, `${fixture}.html`);
    execFileSync(process.execPath, [path.join(__dirname, 'render_page.js'), fixture],
        { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
    const tmp = path.join(RENDER, `.height-${fixture}-${scene}.html`);
    fs.writeFileSync(tmp, shoot.instrument(fs.readFileSync(src, 'utf8'), scene), 'utf8');
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'af-height-'));
    try {
        // ‼️ X-311 — the flags live in ONE file (test/headless_chrome.js).
        const dom = execFileSync(bin, headlessFlags(profile).concat([
            `--window-size=1400,${shoot.FALLBACK_HEIGHT}`,
            '--virtual-time-budget=4000', '--dump-dom',
            pathToFileURL(tmp).href + '?af=measure'
        ]), { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
        const m = new RegExp(`<pre id="${shoot.MARK}">([\\s\\S]*?)</pre>`).exec(dom);
        if (!m) { return null; }
        return JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    } finally {
        try { fs.rmSync(tmp, { force: true }); } catch { /* nothing to clean */ }
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* locked is not our problem */ }
        sweepAndReport();
    }
}

// The window every one of these is measured in. A height that lands ON it is
// the window measuring itself, which is the whole defect.
const WINDOW = shoot.FALLBACK_HEIGHT;

// ---- 1. a short scene of a page that pins html/body to 100% ---------------
{
    ok('the Console page still pins the body to the window, so this is still the hard case',
        /html,\s*body\s*\{\s*height:100%/.test(fs.readFileSync(path.join(ROOT, 'media', 'console.js'), 'utf8')));

    const r = measure('console', 4);
    ok('the Console fixture answers the measuring pass', !!r && r.h > 0);
    if (r) {
        ok(`‼️ ONE SHORT SCENE IS ITS OWN HEIGHT, NOT THE WINDOW'S (${r.h}px, window ${WINDOW})`,
            r.h > 200 && r.h < 1200);
        // ‼️ THE NUMBER IS READ OFF THE FIXTURE, NEVER TYPED HERE. Typed, it
        // made every scene somebody ADDS a red in a test about cropping — and a
        // red that says nothing about its own subject is how a suite teaches
        // people to skim it. The claim is unchanged: shooting one scene still
        // reports the whole page, and the whole page is however many scenes the
        // fixture declares.
        const SCENES = require('./fixtures/console.js').variants().length;
        ok(`…and the scene count is the PAGE's, not the crop's (${SCENES})`,
            r.scenes.length === SCENES);
    }
}

// ---- 2. a scene whose open panel hangs below its own page box -------------
{
    const r = measure('missions', 17);
    ok('the Missions fixture answers the measuring pass', !!r && r.h > 0);
    if (r) {
        // The `.rndr-page` box of that scene is ~420px; the AFTip panel it is a
        // picture of reaches ~1100px. Measuring the frame alone passes every
        // other case here and silently cuts this panel in half.
        ok(`‼️ AN OPEN PANEL BELOW ITS PAGE BOX IS IN THE PICTURE (${r.h}px)`, r.h > 900);
    }
}

// ---- 3. the whole montage of the same body-pinning page -------------------
{
    const r = measure('console', 0);
    ok('the Console montage answers the measuring pass', !!r && r.h > 0);
    if (r) {
        ok(`‼️ THE WHOLE MONTAGE IS STILL WHOLE (${r.h}px, ${r.scenes.length} scenes)`, r.h > 8000);
    }
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
