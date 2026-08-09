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
 *
 * It runs Chrome with its own throwaway profile under the system temp folder,
 * so the user's own windows, tabs and session are never touched — which is a
 * hard rule, not a nicety.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RENDER = path.join(ROOT, 'dist', 'render');

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

function main() {
    const args = process.argv.slice(2);
    const name = args[0];
    if (!name) {
        console.log('usage: node test/shoot_page.js <fixture> [--width N] [--light]');
        return;
    }
    const wIdx = args.indexOf('--width');
    const width = wIdx >= 0 ? Number(args[wIdx + 1]) : 1400;
    const light = args.indexOf('--light') >= 0;
    const html = path.join(RENDER, `${name}${light ? '.light' : ''}.html`);
    if (!fs.existsSync(html)) {
        console.error(`no render at ${html} — run: node test/render_page.js ${name}`);
        process.exitCode = 1;
        return;
    }
    const png = html.replace(/\.html$/, '.png');
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'af-shoot-'));
    try {
        execFileSync(browser(), [
            '--headless=new',
            '--disable-gpu',
            '--hide-scrollbars',
            '--force-device-scale-factor=1',
            `--user-data-dir=${profile}`,
            '--no-first-run', '--no-default-browser-check',
            `--window-size=${width},2400`,
            `--screenshot=${png}`,
            'file:///' + html.replace(/\\/g, '/')
        ], { stdio: 'pipe', timeout: 90000 });
    } catch (e) {
        // Chrome exits non-zero on plenty of harmless conditions; the picture
        // either exists or it does not, and that is the honest test.
        if (!fs.existsSync(png)) { throw e; }
    } finally {
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* a locked profile is not our problem */ }
    }
    console.log(png);
}

main();
