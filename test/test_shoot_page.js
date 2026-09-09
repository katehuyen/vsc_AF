// ‼️ THE TOOL THAT TAKES THE EVIDENCE IS ITSELF EVIDENCE.
//
// Every visual rule in this repo ends in "and the PNG is looked at". That rule
// was being satisfied against a picture of the top 2400px of the page: Chrome's
// `--screenshot` captures the VIEWPORT, `shoot_page.js` handed it a fixed
// `--window-size=<w>,2400`, and nothing said a word about the rest. `missions`
// is 18,449px over 19 scenes — sixteen of them had never been photographed, and
// the audit rows that said "looked at, both themes" had looked at scenes 1-3.
//
// So the gate is behavioural where it can be. The source half pins the two
// decisions that are invisible from outside (measure the BODY, read the scene
// titles BEFORE the crop); the browser half proves the picture really is as
// tall as the page and that `--scene` really is smaller than the whole.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const SHOOT = path.join(ROOT, 'test', 'shoot_page.js');
const RENDER = path.join(ROOT, 'dist', 'render');
const src = fs.readFileSync(SHOOT, 'utf8');

// ---------- the source half: the two decisions nothing else can see ----------

ok('‼️ THE SCREENSHOT PASS IS NOT GIVEN A FIXED HEIGHT — a literal beside '
    + '`--screenshot` is the whole defect, so it is banned by shape rather than by name',
    !/--window-size=\$\{width\},\s*\d/.test(src));

ok('…and the height it IS given comes from a measurement', /--window-size=\$\{width\},\$\{height\}/.test(src));

ok('‼️ THE BODY IS WHAT IS MEASURED. `documentElement.scrollHeight` never falls '
    + 'below the viewport, so a short page reports the measuring window back at you',
    /document\.body\.scrollHeight/.test(src)
    && /var h=b\|\|document\.documentElement\.scrollHeight/.test(src));

ok('‼️ THE SCENE TITLES ARE READ BEFORE THE CROP — taken after, a `--scene 6` '
    + 'measures a page of one and refuses itself as out of range',
    src.indexOf('var t=hs.map(') > 0
    && src.indexOf('var t=hs.map(') < src.indexOf("+ keep"));

ok('a failed measurement is never silent — the fallback says what is missing from the picture',
    /could not measure/.test(src) && /NOT IN THIS PICTURE/.test(src));

ok('and a page too tall to photograph whole says so instead of cutting quietly',
    /cut to \$\{MAX_HEIGHT\}px/.test(src));

ok('no debug port is opened — a DOM dump needs no permission, a CDP connection does',
    !/remote-debugging-port/.test(src) && /--dump-dom/.test(src));

// ---------- the browser half: the picture is the size of the page ----------

const CANDIDATES = [
    process.env.AF_CHROME,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
];
const haveBrowser = CANDIDATES.some(p => p && fs.existsSync(p));

/** PNG dimensions live in the IHDR chunk, at bytes 16 and 20. */
function png(file) {
    const b = fs.readFileSync(file);
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
const node = (args) => execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'] });

if (!haveBrowser) {
    console.log('  (no Chrome or Edge on this machine — the browser half is skipped)');
} else {
    // `secrets` is the smallest fixture with more than one scene, which is the
    // only shape that can tell a whole montage from one scene of it.
    const FIX = 'secrets';
    node([path.join('test', 'render_page.js'), FIX]);

    const list = node([SHOOT, FIX, '--scenes']).trim().split('\n').filter(Boolean);
    ok('`--scenes` lists the scenes, numbered from 1', list.length >= 2 && /^1\. /.test(list[0]));

    const whole = node([SHOOT, FIX]);
    const wholePng = png(path.join(RENDER, `${FIX}.png`));
    const said = /(\d+)×(\d+)/.exec(whole);
    ok('the shot reports the size it took', !!said);
    ok('‼️ AND THE PICTURE IS AS TALL AS THE PAGE SAID IT WAS — this is the '
        + 'assertion the old tool could never have passed: it always answered 2400',
        !!said && Number(said[2]) === wholePng.h);
    ok('…and that is not the old fixed height wearing a new name',
        wholePng.h !== 2400);
    ok('the width is still the width that was asked for', wholePng.w === 1400);

    node([SHOOT, FIX, '--scene', '1']);
    const one = png(path.join(RENDER, `${FIX}.s1.png`));
    ok('one scene is written beside the montage, not over it',
        fs.existsSync(path.join(RENDER, `${FIX}.png`)));
    ok('‼️ AND ONE SCENE IS SHORTER THAN ALL OF THEM — the crop really crops, so '
        + 'a scene can be read at its own size instead of at a nineteenth of one',
        one.h > 0 && one.h < wholePng.h);

    let refused = '';
    try { node([SHOOT, FIX, '--scene', String(list.length + 5)]); }
    catch (e) { refused = String(e.stderr || e.stdout || e.message); }
    ok('a scene number the page does not have is refused, and says how many there are',
        /the page has \d+/.test(refused));
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
