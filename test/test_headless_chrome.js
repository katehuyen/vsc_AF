// ‼️ THE FLAGS THAT KEEP A HEADLESS CHROME OUT OF %TEMP%, AND THE SWEEPER FOR
// WHAT ONE LEFT THERE — X-311.
//
// Three copies of one flag list, each launching a FRESH profile, had Chrome
// installing the machine's external extensions (Adobe Acrobat, IDM) into %TEMP%
// on every run and dying before the install finished: 2,584 folders, 4,145 CRX
// files, 15.5 GB, the system drive at zero. Measured against the real Chrome:
// `--disable-extensions` takes the count from one-per-launch to none.
//
// Three halves: the SOURCE half says every launch site takes its flags from the
// one file (a fourth copy written by hand is caught by its bare `--headless=new`),
// the SWEEP half proves the sweeper takes exactly the leak's shape and nothing
// else, and the BROWSER half — when a Chrome is on the machine — launches one
// with the flags and counts what appeared in %TEMP%.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const hc = require('./headless_chrome');

// ---------- the source half ------------------------------------------------
{
    const flags = hc.headlessFlags('X:\\profile');
    ok('‼️ --disable-extensions IS IN THE LIST — the one flag that measured to zero', flags.includes('--disable-extensions'));
    ok('…with --disable-component-update and --disable-background-networking behind it',
        flags.includes('--disable-component-update') && flags.includes('--disable-background-networking'));
    ok('the profile handed in is the profile launched', flags.includes('--user-data-dir=X:\\profile'));
    ok('and it is still headless, GPU-less and first-run-less', flags.includes('--headless=new') && flags.includes('--disable-gpu') && flags.includes('--no-first-run'));

    // Every file under test/ and tools/ that launches a headless Chrome does it
    // through headlessFlags — the quoted headless switch followed by a comma is
    // an element of a hand-written list, i.e. a fourth copy, and the fourth
    // copy is how the drift comes back. (Asking `flags.includes(...)` is not.)
    const sites = [];
    for (const dir of ['test', 'tools']) {
        for (const f of fs.readdirSync(path.join(ROOT, dir))) {
            if (!f.endsWith('.js') || f === 'headless_chrome.js') { continue; }
            const src = fs.readFileSync(path.join(ROOT, dir, f), 'utf8');
            if (/['"]--headless=new['"]\s*,/.test(src)) { sites.push(`${dir}/${f}`); }
        }
    }
    ok(`‼️ NO LAUNCH SITE CARRIES ITS OWN FLAG LIST${sites.length ? ' — ' + sites.join(', ') : ''}`, sites.length === 0);

    for (const f of ['test/shoot_page.js', 'test/measure_page.js', 'test/test_shot_height.js']) {
        const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
        ok(`${f} launches with headlessFlags(profile) and sweeps in its finally`,
            /headlessFlags\(profile\)/.test(src) && /sweepAndReport\(\)/.test(src)
            && src.indexOf('sweepAndReport()') > src.lastIndexOf('finally'));
    }
    ok('the suite runner sweeps once more at the end', /headless_chrome.*sweepAndReport/.test(fs.readFileSync(path.join(ROOT, 'test', 'run-all.js'), 'utf8')));

    // ‼️ K-41 — A STALE RENDER PHOTOGRAPHS THE WRONG SCENE AND SAYS NOTHING.
    // `shoot_page.js` shoots whatever `dist/render/<name>.html` already holds,
    // so a fixture edited without a re-render answers with the page as it was —
    // and with `--scene N`, adding a scene shifts every number after it, so the
    // stale file hands back a DIFFERENT scene under the right number. Measured
    // twice here: a new button that "did not appear", and a `--light` run that
    // had never been re-rendered and photographed its neighbour (29 scenes
    // against the dark 30). The fixture decides the scene list, so its mtime is
    // the test, and the refusal names the exact command — with `--light` where
    // that is the half being shot, because the two themes are two files.
    {
        const src = fs.readFileSync(path.join(ROOT, 'test', 'shoot_page.js'), 'utf8');
        ok('‼️ shoot_page refuses a render older than its fixture rather than shooting it',
            /fs\.statSync\(fixture\)\.mtimeMs > fs\.statSync\(html\)\.mtimeMs/.test(src)
            && /is OLDER than test\/fixtures\//.test(src));
        ok('…and the command it names re-renders the SAME theme it was asked for',
            /const renderCmd = `node test\/render_page\.js \$\{name\}\$\{light \? ' --light' : ''\}`/.test(src)
            && !/run: node test\/render_page\.js \$\{name\}`/.test(src));
    }
}

// ---------- the sweep half -------------------------------------------------
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-x311-'));
    const OLD = Date.now() - 3 * 3600 * 1000;
    const age = (p) => fs.utimesSync(p, new Date(OLD), new Date(OLD));
    const mk = (name, files) => {
        const d = path.join(tmp, name);
        fs.mkdirSync(d, { recursive: true });
        for (const [rel, body] of Object.entries(files || {})) {
            fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true });
            fs.writeFileSync(path.join(d, rel), body);
        }
        return d;
    };
    const crx = Buffer.concat([Buffer.from('Cr24'), Buffer.alloc(200)]);
    const guid = (n) => `0000000${n}-1111-2222-3333-444444444444.tmp`;

    const oldManifest = mk('scoped_dir1_11', { 'ext/manifest.json': '{"name":"IDM"}', 'ext/bg.js': '' }); age(oldManifest);
    const oldEmpty = mk('scoped_dir2_22'); age(oldEmpty);
    const oldOther = mk('scoped_dir3_33', { 'notes.txt': 'not an extension' }); age(oldOther);
    const freshManifest = mk('scoped_dir4_44', { 'manifest.json': '{}' });
    const notScoped = mk('scoped_dirX', { 'manifest.json': '{}' }); age(notScoped);
    const oldCrx = path.join(tmp, guid(1)); fs.writeFileSync(oldCrx, crx); age(oldCrx);
    const oldNotCrx = path.join(tmp, guid(2)); fs.writeFileSync(oldNotCrx, Buffer.alloc(200)); age(oldNotCrx);
    const freshCrx = path.join(tmp, guid(3)); fs.writeFileSync(freshCrx, crx);
    const oldZero = path.join(tmp, guid(4)); fs.writeFileSync(oldZero, ''); age(oldZero);
    const oldOtherTmp = path.join(tmp, 'random.tmp'); fs.writeFileSync(oldOtherTmp, crx); age(oldOtherTmp);
    const profile = mk('af-shoot-abc', { 'Default/Preferences': '{}' }); age(profile);

    let r;
    try { r = hc.sweepLeftovers({ tmp }); } catch (e) { r = { error: e }; }
    ok('the sweep never throws', !r.error);
    ok('‼️ an old scoped_dir with an unpacked manifest is taken', !fs.existsSync(oldManifest));
    ok('an old EMPTY scoped_dir is taken (the unpack that never started)', !fs.existsSync(oldEmpty));
    ok('‼️ an old scoped_dir holding something ELSE is left alone — not the leak\'s shape', fs.existsSync(oldOther));
    ok('a fresh scoped_dir is left alone — it may be mid-unpack', fs.existsSync(freshManifest));
    ok('a name that is not <pid>_<n> is not a scoped_dir', fs.existsSync(notScoped));
    ok('‼️ an old <guid>.tmp that starts with Cr24 is taken', !fs.existsSync(oldCrx));
    ok('an old <guid>.tmp with any other header is left alone', fs.existsSync(oldNotCrx));
    ok('a fresh CRX is left alone — it may still be downloading', fs.existsSync(freshCrx));
    ok('an old empty <guid>.tmp is left alone — locked zero-byte files are somebody else\'s', fs.existsSync(oldZero));
    ok('a .tmp that is not a guid is not looked at', fs.existsSync(oldOtherTmp));
    ok('an af-* profile is not this sweeper\'s (run-all.js owns those)', fs.existsSync(profile));
    ok(`the answer counts what it took: 2 dirs, 1 file (${r.dirs}/${r.files})`, r.dirs === 2 && r.files === 1);
    ok(`…and the bytes it freed are the CRX (204) plus the unpack (14): ${r.bytes}`, r.bytes === 218);
    ok('a temp folder that does not exist is an empty answer, not a crash', (() => { const x = hc.sweepLeftovers({ tmp: path.join(tmp, 'nope') }); return x.dirs === 0 && x.files === 0; })());
    ok('the age is two hours by default', hc.LEFTOVER_AGE_MS === 2 * 3600 * 1000);

    fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------- the browser half ------------------------------------------------
{
    let bin = null;
    try { bin = require('./shoot_page.js').browser(); } catch { bin = null; }
    if (!bin) {
        console.log('  --  no Chrome or Edge on this machine; the launch itself is not measured here');
    } else {
        const tmp = os.tmpdir();
        const snap = () => new Set(fs.readdirSync(tmp).filter(n => hc.SCOPED_DIR.test(n)));
        const before = snap();
        const profile = fs.mkdtempSync(path.join(tmp, 'af-x311-live-'));
        try {
            try {
                execFileSync(bin, hc.headlessFlags(profile).concat([
                    '--window-size=800,600', '--virtual-time-budget=4000', '--dump-dom', 'about:blank'
                ]), { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
            } catch { /* the exit code is not the question */ }
            const after = snap();
            const fresh = [...after].filter(n => !before.has(n));
            ok(`‼️ A LAUNCH WITH THESE FLAGS LEAVES NO scoped_dir IN %TEMP% (${fresh.length} appeared)`, fresh.length === 0);
            for (const n of fresh) { try { fs.rmSync(path.join(tmp, n), { recursive: true, force: true }); } catch { /* leave it */ } }
        } finally {
            try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* locked is not our problem */ }
        }
    }
}

console.log(`test_headless_chrome.js: ${pass} passed, ${fail} failed`);
if (fail) { process.exit(1); }
