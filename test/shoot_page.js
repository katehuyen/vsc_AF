/**
 * Take a picture of what `render_page.js` produced.
 *
 * ‼️ THE POINT IS TO LOOK. A rendered HTML file still has to be opened by
 * somebody, and an agent changing colours cannot open a browser window — so
 * this drives a headless Chrome that is ALREADY on the machine (no download, no
 * Playwright browser) and writes a PNG next to the HTML.
 *
 *   node test/render_page.js track && node test/shoot_page.js track
 *   node test/shoot_page.js track --width 1600
 *   node test/shoot_page.js missions --scenes      list the scenes, numbered
 *   node test/shoot_page.js missions --scene 7     photograph only that one
 *
 * It runs Chrome with its own throwaway profile under the system temp folder,
 * so the user's own windows, tabs and session are never touched — which is a
 * hard rule, not a nicety.
 *
 * ‼️ THE PAGE IS MEASURED BEFORE IT IS PHOTOGRAPHED (audit A-12.10). Chrome's `--screenshot`
 * captures the VIEWPORT, and this file used to hand it a fixed
 * `--window-size=<w>,2400` — so every fixture taller than 2400px was cut at
 * 2400 with nothing said, and the cut was invisible because the top of a
 * montage looks exactly like a whole montage. Measured: `missions` is 18,449px
 * tall, so thirteen per cent of it was the entire photographic record, and
 * every scene that mattered to the item being checked sat below the fold. The
 * height now comes from the laid-out page itself, over the same `--dump-dom`
 * route `measure_page.js` uses — a DOM dump needs no debug port, and opening
 * one on the user's machine is a thing to ask about first.
 *
 * ‼️ AND A WHOLE MONTAGE IS NOT A READABLE PICTURE. 18,449px of scenes scaled
 * down to fit a reader is ~180px a scene: nothing is lost any more, but nothing
 * is legible either. `--scene N` is the other half of the repair — it removes
 * the other scenes BEFORE the page is measured, so one scene is photographed at
 * its own size. `--scenes` prints the list to pick from.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { headlessFlags, sweepAndReport } = require('./headless_chrome');

const ROOT = path.resolve(__dirname, '..');
const RENDER = path.join(ROOT, 'dist', 'render');

/** Past this a window is refused and the picture would not be a picture anyway.
 *  The shot is then cut — and the cut is ANNOUNCED, which is the whole point. */
const MAX_HEIGHT = 30000;
const FALLBACK_HEIGHT = 2400;

const CANDIDATES = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
];

function browser() {
    const env = process.env.AF_CHROME;
    if (env && fs.existsSync(env)) { return env; }
    const hit = CANDIDATES.find(p => p && fs.existsSync(p));
    if (!hit) {
        throw new Error('no Chrome or Edge found — set AF_CHROME to its path');
    }
    return hit;
}

const MARK = 'AF-SHOOT';

/**
 * ONE file serves both passes. `?af=measure` makes the page report its height
 * and its scene titles instead of drawing; without the query it just draws.
 * Two files would be two pages, and the thing measured could drift from the
 * thing photographed — which is the failure this whole repair is about.
 */
function instrument(html, scene) {
    // ‼️ THE TITLES ARE READ BEFORE ANYTHING IS REMOVED. Taking them afterwards
    // reports the ONE scene that survived, so `--scene 6` measured a page of one
    // and refused itself as out of range — the count has to be the page's, not
    // the crop's.
    const keep = scene > 0
        ? 'var pg=[].slice.call(document.querySelectorAll("div.rndr-page"));'
        + 'for(var i=0;i<hs.length;i++){if(i!==' + (scene - 1) + '){'
        + 'if(hs[i]){hs[i].remove();}if(pg[i]){pg[i].remove();}}}'
        : '';
    // ‼️ U-162 — AN OPEN PANEL IS DRAWN WHERE THE PAGE WOULD PUT IT. The render
    // opens a `tip:` scene's panel with the static `af-on`, and no page script
    // runs, so the edge flip never happened: a panel the real page opens upwards
    // or lifts out of its table was photographed cut at the table's floor. The
    // component is loaded here and flips every open panel once the scene is cut.
    const edge = '<script>' + fs.readFileSync(path.join(ROOT, 'media', 'afTipEdge.js'), 'utf8').replace(/<\/script/gi, '<\\/script') + '</script>';
    const flipOpen = 'if(window.AFTipEdge){[].slice.call(document.querySelectorAll(".af-tipw.af-on")).forEach(function(w){window.AFTipEdge.flip(w);});}';
    const probe = edge + '<script>window.addEventListener("load",function(){'
        + 'var hs=[].slice.call(document.querySelectorAll("h1.rndr-h"));'
        + 'var t=hs.map(function(e){return e.textContent;});'
        + keep
        + flipOpen
        + 'if(location.search.indexOf("af=measure")<0){return;}'
        // ‼️ MEASURE WHAT IS DRAWN, NOT WHAT THE PAGE SAYS IT IS.
        //
        // `documentElement.scrollHeight` never falls below the viewport, so a
        // page SHORTER than the measuring window reports the window back.
        // Switching to `body.scrollHeight` was supposed to fix that and did not,
        // because a fixture carries the PAGE's stylesheet: media/console.js:189
        // is `html, body { height:100% }`, which pins the body to the viewport
        // whatever is inside it. Measured: with sixteen of seventeen scenes
        // removed, the surviving `#app` was 55..418 and the body still answered
        // 2308 — every `--scene N` of the Console came out 1400×2305, five times
        // its own height, and a reader scaling that to fit shrank the scene to a
        // fifth for nothing. The whole-page shot hid it: there the content is
        // taller than the window, so the same expression was right.
        //
        // So the height is the lowest edge anything is actually DRAWN at. Two
        // things have to be subtracted from "every element's bottom", and both
        // were measured on fixtures in this repo rather than guessed:
        //   · a CLOSED AFTip panel is a 5,169px static block inside a
        //     `position:fixed` shell — laid out, never painted. It answers
        //     `checkVisibility` with false, which is what excludes it (taking
        //     the frame alone instead would have cut the OPEN panel of
        //     missions/history, which hangs 685px past its page box);
        //   · a row scrolled out of a list is still a rect below the list —
        //     scene 19's council reached 18,923px inside a box ending at
        //     18,407px. Every ancestor that clips is intersected, memoised once
        //     per element so the sweep stays one `getComputedStyle` deep.
        // The scene titles and page boxes are added last so an EMPTY page still
        // has a height of its own.
        + 'var clip=new Map();'
        // ‼️ …AND THE BODY IS NOT ONE OF THE CLIPPERS. media/console.js:189 is
        // `html, body { height:100% }` with the page's own `overflow`, so
        // treating the body as a clipping ancestor clamped the WHOLE Console
        // montage to 2,317px — the eleven scenes below the first three simply
        // stopped existing. A full-page shot scrolls; the body does not clip it.
        + 'function clipOf(el){'
        + 'if(!el||el===document.body||el===document.documentElement){return Infinity;}'
        + 'if(clip.has(el)){return clip.get(el);}'
        + 'var v=clipOf(el.parentElement);'
        + 'var cs=getComputedStyle(el);'
        + 'if(cs.overflowY!=="visible"){var cb=el.getBoundingClientRect().bottom;if(cb<v){v=cb;}}'
        + 'clip.set(el,v);return v;}'
        + 'var low=0;'
        + 'var all=[].slice.call(document.body?document.body.querySelectorAll("*"):[]);'
        + 'all=all.concat([].slice.call(document.querySelectorAll("h1.rndr-h,div.rndr-page")));'
        + 'for(var k=0;k<all.length;k++){var e=all[k];'
        + 'if(e.checkVisibility&&!e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})){continue;}'
        + 'var r=e.getBoundingClientRect();'
        + 'if(r.width<=0&&r.height<=0){continue;}'
        + 'var bot=Math.min(r.bottom,clipOf(e.parentElement));'
        + 'if(bot>low){low=bot;}}'
        + 'var pad=document.body?(parseFloat(getComputedStyle(document.body).paddingBottom)||0):0;'
        + 'var drawn=low>0?Math.ceil(low+pad):0;'
        + 'var b=document.body?document.body.scrollHeight:0;'
        + 'var h=drawn||b||document.documentElement.scrollHeight;'
        + 'var out=JSON.stringify({h:h,scenes:t});'
        + 'document.documentElement.innerHTML='
        + JSON.stringify('<pre id="' + MARK + '"></pre>') + ';'
        + 'document.getElementById(' + JSON.stringify(MARK) + ').textContent=out;'
        + '});</script>';
    return html + probe;
}

function run(bin, args) {
    return execFileSync(bin, args, { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
}

function main() {
    const args = process.argv.slice(2);
    const name = args[0];
    if (!name || name.startsWith('--')) {
        console.log('usage: node test/shoot_page.js <fixture> [--width N] [--light] [--scene N] [--scenes] [--scale N]');
        return;
    }
    const wIdx = args.indexOf('--width');
    const width = wIdx >= 0 ? Number(args[wIdx + 1]) : 1400;
    const light = args.indexOf('--light') >= 0;
    const listOnly = args.indexOf('--scenes') >= 0;
    const sIdx = args.indexOf('--scene');
    const scene = sIdx >= 0 ? Number(args[sIdx + 1]) : 0;
    const zIdx = args.indexOf('--scale');
    const scale = zIdx >= 0 ? Number(args[zIdx + 1]) || 1 : 1;
    if (sIdx >= 0 && !(scene > 0)) {
        console.error('--scene takes a 1-based scene number; --scenes lists them');
        process.exitCode = 1;
        return;
    }
    const html = path.join(RENDER, `${name}${light ? '.light' : ''}.html`);
    const renderCmd = `node test/render_page.js ${name}${light ? ' --light' : ''}`;
    if (!fs.existsSync(html)) {
        // ‼️ NAME THE --light TOO. The two themes are two files, and a message
        // that always said "render <name>" sent people to re-render the dark one
        // while the light one stayed missing or stale.
        console.error(`no render at ${html} — run: ${renderCmd}`);
        process.exitCode = 1;
        return;
    }
    /**
     * ‼️ A STALE RENDER PHOTOGRAPHS THE WRONG SCENE, AND SAYS NOTHING.
     *
     * This tool shoots whatever `dist/render/<name>.html` already holds. Edit a
     * fixture, forget to re-render, and the picture is of the page as it was —
     * which looks like the change not working. Worse with `--scene N`: adding a
     * scene shifts every number after it, so the stale file answers with a
     * DIFFERENT scene under the right number and the label in the banner is the
     * only clue. Measured twice in this repo — a new button that "did not
     * appear", and a `--light` run that had never been re-rendered at all and
     * quietly photographed its neighbour (29 scenes against the dark 30).
     *
     * The fixture is what decides the scene list, so its mtime is the test.
     */
    const fixture = path.join(__dirname, 'fixtures', `${name}.js`);
    if (fs.existsSync(fixture) && fs.statSync(fixture).mtimeMs > fs.statSync(html).mtimeMs) {
        console.error(`‼️ ${path.basename(html)} is OLDER than test/fixtures/${name}.js — `
            + 'it would photograph the page as it was, and with --scene the numbers have moved. '
            + `Run: ${renderCmd}`);
        process.exitCode = 1;
        return;
    }
    // …and the same for the PAGE ITSELF: a script or stylesheet edited after the
    // render is a change the photograph cannot contain (measured K-42: a layout
    // change "did nothing" because the old render was shot).
    const media = path.join(ROOT, 'media');
    const renderedAt = fs.statSync(html).mtimeMs;
    const newerMedia = fs.readdirSync(media).filter(n => /\.(js|css)$/.test(n))
        .find(n => fs.statSync(path.join(media, n)).mtimeMs > renderedAt);
    if (newerMedia) {
        console.error(`‼️ ${path.basename(html)} is OLDER than media/${newerMedia} — `
            + 'it would photograph the page as it was before that change. '
            + `Run: ${renderCmd}`);
        process.exitCode = 1;
        return;
    }
    const png = html.replace(/\.html$/, `${scene > 0 ? `.s${scene}` : ''}.png`);
    const tmp = path.join(RENDER, `.shoot-${name}${light ? '.light' : ''}.html`);
    fs.writeFileSync(tmp, instrument(fs.readFileSync(html, 'utf8'), scene), 'utf8');
    const url = 'file:///' + tmp.replace(/\\/g, '/');
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'af-shoot-'));
    // ‼️ X-311 — the flags live in ONE file; a fresh profile launched without
    // them installs the machine's external extensions into %TEMP% on every run.
    // `--scale N` shoots at N device pixels per CSS pixel, for test/crop_png.js
    const common = headlessFlags(profile).map(f => (scale > 1 && f.startsWith('--force-device-scale-factor=')
        ? '--force-device-scale-factor=' + scale : f));
    try {
        // PASS 1 — ask the laid-out page how tall it is and what its scenes are
        // called. Failing here is never silent: it falls back to the old fixed
        // height AND says that anything below it is not in the picture.
        let height = 0;
        let scenes = [];
        try {
            const dom = run(browser(), common.concat([
                `--window-size=${width},${FALLBACK_HEIGHT}`,
                '--virtual-time-budget=4000',
                '--dump-dom',
                `${url}?af=measure`
            ]));
            const m = new RegExp(`<pre id="${MARK}">([\\s\\S]*?)</pre>`).exec(dom);
            if (m) {
                const j = JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
                height = Number(j.h) || 0;
                scenes = Array.isArray(j.scenes) ? j.scenes : [];
            }
        } catch { /* the shot still has to happen — but not quietly; see below */ }

        if (listOnly) {
            if (!scenes.length) { console.error('the page reported no scenes'); process.exitCode = 1; return; }
            scenes.forEach((t, i) => console.log(`${i + 1}. ${t}`));
            return;
        }
        if (scene > 0 && scenes.length && scene > scenes.length) {
            console.error(`scene ${scene} — the page has ${scenes.length}; --scenes lists them`);
            process.exitCode = 1;
            return;
        }
        if (!height) {
            console.error(`‼️ could not measure ${path.basename(html)} — shooting at ${FALLBACK_HEIGHT}px, so ANYTHING BELOW THAT IS NOT IN THIS PICTURE`);
            height = FALLBACK_HEIGHT;
        } else if (height > MAX_HEIGHT) {
            console.error(`‼️ ${path.basename(html)} is ${height}px — cut to ${MAX_HEIGHT}px. Read it a scene at a time: --scenes, then --scene N`);
            height = MAX_HEIGHT;
        }

        // PASS 2 — the picture, at the height the page actually asked for.
        try {
            run(browser(), common.concat([
                `--window-size=${width},${height}`,
                `--screenshot=${png}`,
                url
            ]));
        } catch (e) {
            // Chrome exits non-zero on plenty of harmless conditions; the picture
            // either exists or it does not, and that is the honest test.
            if (!fs.existsSync(png)) { throw e; }
        }
        console.log(png);
        console.log(`${width}×${height}${scenes.length
            ? ` · ${scene > 0 ? `scene ${scene} of ${scenes.length}` : `${scenes.length} scene(s)`}` : ''}`);
        // ‼️ THE WARNING IS ABOUT THE WHOLE PICTURE, NOT THE SCENE. A reader
        // scales the FILE down to fit, so what a scene ends up worth is its
        // share of the total — 19 scenes over 18,449px survive the shot and
        // still arrive ~100px tall. Anything past a couple of screens is read a
        // scene at a time or it is not read.
        if (!scene && scenes.length > 1 && height > 3000) {
            console.log(`‼️ ${height}px scaled to fit a reader leaves each of the ${scenes.length} scenes ~${Math.round(2000 / scenes.length)}px — read them one at a time with --scene N`);
        }
    } finally {
        try { fs.rmSync(tmp, { force: true }); } catch { /* nothing to clean */ }
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* a locked profile is not our problem */ }
        sweepAndReport();
    }
}

// ‼️ THE MEASURING PASS IS THE PART THAT LIES WHEN IT IS WRONG, so it is
// reachable on its own: test/test_shot_height.js builds the same instrumented
// page and reads the same number back, instead of a test that reads the source
// and agrees with it. Requiring this file must not take a photograph.
if (require.main === module) { main(); }
module.exports = { instrument, browser, MARK, FALLBACK_HEIGHT };
