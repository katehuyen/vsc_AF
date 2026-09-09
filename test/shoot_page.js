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
    const probe = '<script>window.addEventListener("load",function(){'
        + 'var hs=[].slice.call(document.querySelectorAll("h1.rndr-h"));'
        + 'var t=hs.map(function(e){return e.textContent;});'
        + keep
        + 'if(location.search.indexOf("af=measure")<0){return;}'
        // ‼️ THE BODY, NOT THE DOCUMENT ELEMENT. `documentElement.scrollHeight`
        // never falls below the viewport, so a page SHORTER than the measuring
        // window reports the window back — scene 6 alone is 580px and answered
        // 2305, which is the measuring pass measuring itself.
        + 'var b=document.body?document.body.scrollHeight:0;'
        + 'var h=b||document.documentElement.scrollHeight;'
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
        console.log('usage: node test/shoot_page.js <fixture> [--width N] [--light] [--scene N] [--scenes]');
        return;
    }
    const wIdx = args.indexOf('--width');
    const width = wIdx >= 0 ? Number(args[wIdx + 1]) : 1400;
    const light = args.indexOf('--light') >= 0;
    const listOnly = args.indexOf('--scenes') >= 0;
    const sIdx = args.indexOf('--scene');
    const scene = sIdx >= 0 ? Number(args[sIdx + 1]) : 0;
    if (sIdx >= 0 && !(scene > 0)) {
        console.error('--scene takes a 1-based scene number; --scenes lists them');
        process.exitCode = 1;
        return;
    }
    const html = path.join(RENDER, `${name}${light ? '.light' : ''}.html`);
    if (!fs.existsSync(html)) {
        console.error(`no render at ${html} — run: node test/render_page.js ${name}`);
        process.exitCode = 1;
        return;
    }
    const png = html.replace(/\.html$/, `${scene > 0 ? `.s${scene}` : ''}.png`);
    const tmp = path.join(RENDER, `.shoot-${name}${light ? '.light' : ''}.html`);
    fs.writeFileSync(tmp, instrument(fs.readFileSync(html, 'utf8'), scene), 'utf8');
    const url = 'file:///' + tmp.replace(/\\/g, '/');
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'af-shoot-'));
    const common = [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        `--user-data-dir=${profile}`,
        '--no-first-run', '--no-default-browser-check'
    ];
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
    }
}

main();
