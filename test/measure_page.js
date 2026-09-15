/**
 * MEASURE a rendered page instead of guessing at it.
 *
 * ‼️ WHY THIS SITS NEXT TO `shoot_page.js`. A picture answers "does it look
 * right"; it does not answer "how wide is that box, and what is deciding it".
 * Widths in this repo have been argued about in shares of numbers nobody read
 * off the screen — and a share of a guess is a guess. This runs the SAME
 * rendered file through the SAME already-installed Chrome, evaluates one
 * expression against the laid-out DOM, and prints what it returns.
 *
 * It uses `--dump-dom`, not a debug port: opening a CDP connection on a user's
 * machine is a thing to ask about first, and a DOM dump needs no permission at
 * all. The expression writes its answer into the document; the dump carries it
 * back.
 *
 *   node test/render_page.js console
 *   node test/measure_page.js console "[...document.querySelectorAll('.crow select')].map(e => e.id + ' ' + Math.round(e.getBoundingClientRect().width))"
 *   node test/measure_page.js console "<expr>" --width 900
 *
 * The expression may return anything JSON can hold; arrays print one per line.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { headlessFlags, sweepAndReport } = require('./headless_chrome');

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
    if (!hit) { throw new Error('no Chrome or Edge found — set AF_CHROME to its path'); }
    return hit;
}

function main() {
    const args = process.argv.slice(2);
    const name = args[0];
    const expr = args[1];
    if (!name || !expr) {
        console.log('usage: node test/measure_page.js <fixture> "<js expression>" [--width N] [--light]');
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

    // A copy, so the file the user may have open is never rewritten. The script
    // runs after the page's own, replaces the document with its answer, and the
    // dump is then just that answer.
    const MARK = 'AF-MEASURE';
    const probe = '<script>window.addEventListener("load",function(){var out;'
        + 'try{out=JSON.stringify((' + expr + '),null,1);}catch(e){out="ERROR: "+e.message;}'
        + 'document.documentElement.innerHTML="<pre id=\\"' + MARK + '\\"></pre>";'
        + 'document.getElementById("' + MARK + '").textContent=out;});</script>';
    const tmp = path.join(RENDER, `.measure-${name}.html`);
    fs.writeFileSync(tmp, fs.readFileSync(html, 'utf8') + probe, 'utf8');

    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'af-measure-'));
    try {
        // ‼️ X-311 — the flags live in ONE file (test/headless_chrome.js).
        const dom = execFileSync(browser(), headlessFlags(profile).concat([
            `--window-size=${width},2400`,
            '--virtual-time-budget=4000',
            '--dump-dom',
            'file:///' + tmp.replace(/\\/g, '/')
        ]), { encoding: 'utf8', timeout: 90000, stdio: ['ignore', 'pipe', 'pipe'] });
        const m = new RegExp('<pre id="' + MARK + '">([\\s\\S]*?)</pre>').exec(dom);
        if (!m) { console.error('the page did not report — is the expression valid?'); process.exitCode = 1; return; }
        console.log(m[1]
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    } finally {
        try { fs.rmSync(tmp, { force: true }); } catch { /* nothing to clean */ }
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* a locked profile is not our problem */ }
        sweepAndReport();
    }
}

main();
