/**
 * The ONE place a headless Chrome launched by this repo gets its flags, and the
 * ONE sweeper for what such a launch leaves behind.
 *
 * ‼️ WHY THIS FILE EXISTS (X-311). `shoot_page.js`, `measure_page.js` and
 * `test_shot_height.js` each carried their own copy of the same flag list, and
 * every launch used a FRESH throwaway profile — correct, the user's own browser
 * must never be touched. But a fresh profile is a profile Chrome has never seen,
 * so on every launch it installed the machine's EXTERNAL extensions into it
 * (the ones the registry names under `Software\Google\Chrome\Extensions` —
 * measured here: Adobe Acrobat twice and the IDM integration module): the CRX is
 * downloaded to `%TEMP%\<guid>.tmp` and unpacked into
 * `%TEMP%\scoped_dir<pid>_<n>`, and the process is then killed by `--dump-dom`
 * finishing, before the install ever completes — so nothing is cleaned up.
 * Measured 2026-09-15: 2,584 folders and 4,145 CRX files, 15.5 GB, the system
 * drive at ZERO bytes and a VSIX install failing with ENOSPC. Every full suite
 * run left ~40 of them, at the exact minutes the suite was running.
 *
 * Measured fix, three rounds each against the installed Chrome:
 *   the old list                        → 1 scoped_dir per launch, every time
 *   + --disable-extensions              → 0, every time
 *   + --disable-component-update alone  → 1 (it is the extension, not a component)
 * `--disable-component-update` and `--disable-background-networking` stay in the
 * list anyway: a longer page gives the component updater time to start its own
 * downloads, which end the same way.
 *
 * The sweeper is the second half, because the flags only stop NEW leftovers and
 * because some other launcher of the same binary may leave the same shape. It
 * takes only what has this leak's exact shape and is older than two hours —
 * a `scoped_dir<pid>_<n>` that is empty or holds an unpacked `manifest.json`,
 * a `<guid>.tmp` whose first four bytes are the CRX magic `Cr24` — and skips
 * anything the OS will not let go of. It runs after every launch and at the
 * end of the suite; `node test/headless_chrome.js --sweep` runs it by hand.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

/** Two hours: a real Chrome unpacks a CRX in seconds, so anything this old is dead. */
const LEFTOVER_AGE_MS = 2 * 60 * 60 * 1000;

const SCOPED_DIR = /^scoped_dir\d+_\d+$/;
const CRX_TMP = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/i;
const CRX_MAGIC = 'Cr24';

/**
 * Every flag a headless launch in this repo gets. `profile` is the throwaway
 * `--user-data-dir` the caller made and will remove; the caller appends its own
 * window size, budget and target.
 */
function headlessFlags(profile) {
    return [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        `--user-data-dir=${profile}`,
        '--no-first-run',
        '--no-default-browser-check',
        // ‼️ X-311 — the three that keep a fresh profile from pulling the
        // machine's external extensions and component updates into %TEMP%.
        '--disable-extensions',
        '--disable-component-update',
        '--disable-background-networking'
    ];
}

function hasManifest(dir, depth = 0) {
    if (depth > 4) { return false; }
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return false; }
    for (const e of entries) {
        if (e.isFile() && e.name === 'manifest.json') { return true; }
        if (e.isDirectory() && hasManifest(path.join(dir, e.name), depth + 1)) { return true; }
    }
    return false;
}

function isEmptyDir(dir) {
    try { return fs.readdirSync(dir).length === 0; } catch { return false; }
}

function isCrx(file) {
    let fd = null;
    try {
        fd = fs.openSync(file, 'r');
        const b = Buffer.alloc(4);
        const n = fs.readSync(fd, b, 0, 4, 0);
        return n === 4 && b.toString('latin1') === CRX_MAGIC;
    } catch {
        return false;
    } finally {
        if (fd !== null) { try { fs.closeSync(fd); } catch { /* already closed */ } }
    }
}

/**
 * Remove the leak's leftovers from `tmp` (default: the system temp folder) that
 * are older than `maxAgeMs`. Returns what it took and what it skipped; never
 * throws — a locked entry is somebody's, and is left exactly where it is.
 */
function sweepLeftovers(opts = {}) {
    const tmp = opts.tmp || os.tmpdir();
    const maxAgeMs = opts.maxAgeMs ?? LEFTOVER_AGE_MS;
    const now = opts.now ?? Date.now();
    const out = { dirs: 0, files: 0, bytes: 0, skipped: 0 };
    let names;
    try { names = fs.readdirSync(tmp); } catch { return out; }
    for (const name of names) {
        const dir = SCOPED_DIR.test(name);
        if (!dir && !CRX_TMP.test(name)) { continue; }
        const p = path.join(tmp, name);
        let st;
        try { st = fs.statSync(p); } catch { continue; }
        if (now - st.mtimeMs < maxAgeMs) { continue; }
        if (dir) {
            if (!st.isDirectory() || !(isEmptyDir(p) || hasManifest(p))) { continue; }
            const bytes = dirBytes(p);
            try { fs.rmSync(p, { recursive: true, force: true }); } catch { out.skipped++; continue; }
            if (fs.existsSync(p)) { out.skipped++; continue; }
            out.dirs++; out.bytes += bytes;
        } else {
            if (!st.isFile() || !isCrx(p)) { continue; }
            try { fs.rmSync(p, { force: true }); } catch { out.skipped++; continue; }
            if (fs.existsSync(p)) { out.skipped++; continue; }
            out.files++; out.bytes += st.size;
        }
    }
    return out;
}

function dirBytes(dir, depth = 0) {
    if (depth > 6) { return 0; }
    let sum = 0;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
    for (const e of entries) {
        const q = path.join(dir, e.name);
        if (e.isDirectory()) { sum += dirBytes(q, depth + 1); }
        else { try { sum += fs.statSync(q).size; } catch { /* gone */ } }
    }
    return sum;
}

/** One line on stderr when something was swept, nothing otherwise — the tools'
 *  stdout is what their callers parse. */
function sweepAndReport(opts) {
    const r = sweepLeftovers(opts);
    if (r.dirs || r.files) {
        console.error(`swept ${r.dirs} scoped_dir folder(s) and ${r.files} CRX file(s) older than ${Math.round((opts?.maxAgeMs ?? LEFTOVER_AGE_MS) / 3600000)}h — ${(r.bytes / 1048576).toFixed(1)} MB — out of ${opts?.tmp || os.tmpdir()}${r.skipped ? ` (${r.skipped} locked, left alone)` : ''}`);
    }
    return r;
}

module.exports = { headlessFlags, sweepLeftovers, sweepAndReport, LEFTOVER_AGE_MS, SCOPED_DIR, CRX_TMP };

if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.includes('--sweep')) {
        const i = args.indexOf('--hours');
        const maxAgeMs = i >= 0 ? Number(args[i + 1]) * 3600000 : LEFTOVER_AGE_MS;
        const r = sweepAndReport({ maxAgeMs });
        if (!r.dirs && !r.files) { console.log(`nothing older than ${Math.round(maxAgeMs / 3600000)}h to sweep in ${os.tmpdir()}${r.skipped ? ` (${r.skipped} locked)` : ''}`); }
    } else {
        console.log('usage: node test/headless_chrome.js --sweep [--hours N]   (default 2h)');
    }
}
