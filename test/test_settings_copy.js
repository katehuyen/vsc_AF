// U-230 — a setting's description (package.json) is read in two places, the Farm Settings panel and VS Code's own
// Settings editor, so it is held to the text standard: at most 350 characters of plain sentences, no ‼️, no
// #agentFarm.x# key reference (another setting is named by its name), no Turkish letter. Per key, its length and its
// forbidden marks may only fall (test/settings_copy.ratchet.json); a key new to the manifest starts within the
// standard. A section whose copy is finished keeps a name and a summary on every row. --fix locks lower figures in.
//   node test/test_settings_copy.js [--fix]
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const PROPS = require(path.join(ROOT, 'package.json')).contributes.configuration.properties;
const CAT = require(path.join(ROOT, 'out', 'core', 'settingsCatalog', 'index.js'));
const FILE = path.join(__dirname, 'settings_copy.ratchet.json');
const MAX = 350;
/** the sections whose every row has its name and summary written (U-230, U-231, U-232 add theirs) */
const DONE = ['general', 'projects', 'agents', 'engines', 'sessions', 'notify', 'cost', 'handover', 'tasks', 'monitor', 'reports'];

const marks = d => (d.match(/‼️|#agentFarm\.|[çğıöşüÇĞİÖŞÜ]/g) || []).length;
const now = {};
for (const [k, p] of Object.entries(PROPS)) {
    const d = String(p.markdownDescription || p.description || '');
    now[k.replace(/^agentFarm\./, '')] = [d.length, marks(d)];
}
const was = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')).keys : {};
const list = a => (a.length ? ': ' + a.slice(0, 8).join(', ') + (a.length > 8 ? ` … (${a.length})` : '') : '');

const grown = Object.keys(now).filter(k => was[k] && (now[k][0] > was[k][0] || now[k][1] > was[k][1]));
const fresh = Object.keys(now).filter(k => !was[k] && (now[k][0] > MAX || now[k][1] > 0));
const gone = Object.keys(was).filter(k => !now[k]);
ok('no description grew longer or gained a forbidden mark' + list(grown.map(k => `${k} ${was[k]} -> ${now[k]}`)), grown.length === 0);
ok(`a setting new to the manifest is described in at most ${MAX} characters with no forbidden mark` + list(fresh), fresh.length === 0);
ok('the ratchet names no setting the manifest lost' + list(gone), gone.length === 0);

const done = CAT.SECTIONS.filter(s => DONE.includes(s.id));
ok('every finished section is still in the catalog', done.length === DONE.length);
const unnamed = [], long = [];
for (const s of done) {
    for (const [k, r] of Object.entries(s.rows)) {
        if (!r.label || !r.summary) { unnamed.push(k); }
        if (now[k] && (now[k][0] > MAX || now[k][1] > 0)) { long.push(`${k} ${now[k]}`); }
    }
}
ok('a finished section has a name and a summary on every row' + list(unnamed), unnamed.length === 0);
ok(`…and every description in it within ${MAX} characters, no forbidden mark` + list(long), long.length === 0);

if (process.argv.includes('--fix')) {
    // the first run records today's debt as it stands; after that a new key comes in only within the standard
    const first = !fs.existsSync(FILE);
    const keys = {};
    for (const k of Object.keys(now).sort()) {
        const w = was[k];
        if (w) { keys[k] = [Math.min(w[0], now[k][0]), Math.min(w[1], now[k][1])]; }
        else if (first || (now[k][0] <= MAX && now[k][1] === 0)) { keys[k] = now[k]; }
    }
    const about = 'U-230 — per setting, its description\'s length and forbidden marks (‼️, #agentFarm., a Turkish letter); they may only fall. test/test_settings_copy.js --fix locks lower figures in.';
    fs.writeFileSync(FILE, JSON.stringify({ about, max: MAX, keys }, null, 1) + '\n', 'utf8');
    console.log('written', Object.keys(keys).length, 'keys');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
