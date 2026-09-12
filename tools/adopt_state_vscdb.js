// Adopt session names and marks out of a VS Code `state.vscdb` (S-61).
//
// ‼️ WHY THIS EXISTS. Until 3.464.0 a session's name, pin, tags and colour were
// written to `context.globalState` — one JSON blob in a row of the editor's
// machine-local SQLite file, outside the extension folder, outside the repo,
// outside the migration. A machine moved and every name stayed behind. The
// extension now keeps them in `session-titles.json` / `session-marks.json`
// inside its `globalStorage` and adopts its OWN leftover row once, by itself.
// What it cannot reach is (a) a `state.vscdb` carried over from ANOTHER
// machine and (b) the row written under the old publisher id
// (`miropharm.agent-farm` — measured: 2 names live only there). This reads
// both rows of any such file and merges them into the files the fleet keeps.
//
// ‼️ A RECOVERY IS A MERGE, NEVER A COPY. The machine you recover onto is not
// empty (this one held 95 names and 8 marks). So: an id the target already
// knows keeps its value; only ids it has never seen are added; and an id both
// sides know WITH DIFFERENT VALUES is a conflict, listed side by side and left
// alone — the user decides, never this script. Nothing is written without
// `--apply`, and a conflict is only taken from the incoming side with an
// explicit `--prefer incoming`.
//
//   node tools/adopt_state_vscdb.js <state.vscdb>                 dry run — report only
//   node tools/adopt_state_vscdb.js <state.vscdb> --apply         add the missing ids
//   node tools/adopt_state_vscdb.js <state.vscdb> --apply --prefer incoming
//                                                                 …and take the incoming
//                                                                 value on every conflict
//   --target <dir>   the extension's globalStorage folder (default: this machine's)
//
// Needs Node 22.13+ for `node:sqlite` (Node 24 on this machine). The database is
// COPIED to a temp file before it is opened: the live one is held by VS Code.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { PortableMap, mergeMissing } = require('../out/core/portableState.js');

const ROWS = ['muvusoft.agent-farm', 'miropharm.agent-farm'];
const TITLES_KEY = 'agentfarm.sessionTitles';
const MARKS_KEY = 'agentfarm.sessionMarks';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const dbPath = argv.find(a => !a.startsWith('--') && a.endsWith('.vscdb'));
if (!dbPath) { console.log('usage: node tools/adopt_state_vscdb.js <state.vscdb> [--apply] [--prefer incoming|existing] [--target <globalStorage dir>]'); process.exit(2); }
const apply = flag('--apply');
const prefer = opt('--prefer') || 'existing';
if (prefer !== 'existing' && prefer !== 'incoming') { console.log('--prefer must be incoming or existing'); process.exit(2); }
const target = opt('--target') || path.join(
    process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
    'Code', 'User', 'globalStorage', 'muvusoft.agent-farm');

// ---- read the incoming rows (newest publisher first; the old one fills gaps)
const tmp = path.join(os.tmpdir(), `af-adopt-${Date.now()}.vscdb`);
fs.copyFileSync(dbPath, tmp);
const incomingTitles = {};
const incomingMarks = {};
try {
    const db = new DatabaseSync(tmp, { readOnly: true });
    const rows = db.prepare('SELECT key, value FROM ItemTable WHERE key = ?');
    for (const key of ROWS) {
        const row = rows.get(key);
        if (!row) { console.log(`row ${key}: absent`); continue; }
        let blob;
        try { blob = JSON.parse(row.value); } catch { console.log(`row ${key}: not JSON — skipped`); continue; }
        const t = blob[TITLES_KEY] || {};
        const m = blob[MARKS_KEY] || {};
        let tn = 0, mn = 0;
        for (const [id, v] of Object.entries(t)) {
            if (typeof v === 'string' && v.trim() && !(id in incomingTitles)) { incomingTitles[id] = v; tn++; }
        }
        for (const [id, v] of Object.entries(m)) {
            if (v && typeof v === 'object' && !(id in incomingMarks)) { incomingMarks[id] = v; mn++; }
        }
        console.log(`row ${key}: ${Object.keys(t).length} titles, ${Object.keys(m).length} marks (${tn} / ${mn} new to the incoming set)`);
    }
    db.close();
} finally {
    try { fs.unlinkSync(tmp); } catch { /* best-effort */ }
}

// ---- merge into what the fleet already keeps
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const report = (label, file, incoming) => {
    const store = new PortableMap(file, fs);
    const existing = store.read();
    const { merged, added } = mergeMissing(existing, incoming);
    const conflicts = Object.keys(incoming).filter(id => id in existing && !same(existing[id], incoming[id]));
    console.log(`\n${label}: ${path.basename(file)} holds ${Object.keys(existing).length}, incoming ${Object.keys(incoming).length}`);
    console.log(`  ${added.length} would be added, ${conflicts.length} conflict(s), ${Object.keys(incoming).length - added.length - conflicts.length} already identical`);
    for (const id of added) { console.log(`  + ${id}  ${JSON.stringify(incoming[id])}`); }
    for (const id of conflicts) {
        console.log(`  ! ${id}\n      here:     ${JSON.stringify(existing[id])}\n      incoming: ${JSON.stringify(incoming[id])}`);
    }
    if (!apply) { return; }
    let out = merged;
    let taken = 0;
    if (prefer === 'incoming') { for (const id of conflicts) { out[id] = incoming[id]; taken++; } }
    if (added.length || taken) {
        store.write(out);
        console.log(`  written: ${added.length} added${taken ? `, ${taken} conflict(s) taken from incoming` : ''} → ${file}`);
    } else {
        console.log('  nothing to write');
    }
    if (conflicts.length && !taken) { console.log(`  ${conflicts.length} conflict(s) left as they are — rerun with --prefer incoming to take the incoming values`); }
};

console.log(`\ntarget: ${target}`);
report('titles', path.join(target, 'session-titles.json'), incomingTitles);
report('marks', path.join(target, 'session-marks.json'), incomingMarks);
if (!apply) { console.log('\n(dry run — nothing written; add --apply)'); }
