// Portable state (S-61) — the session names and marks that used to be written
// into VS Code's machine-local `state.vscdb` and were therefore lost on every
// machine move. What is measured here is the whole reason the store exists:
//   1. a map survives a round trip through a real file;
//   2. a corrupt file reads as empty but is never silently written over;
//   3. a write is atomic (a sibling, renamed over) so a crash cannot halve it;
//   4. ‼️ a recovery MERGES — an id the target already knows keeps its value,
//      because the machine you recover onto already holds 95 names of its own.
const path = require('path');
const fs = require('fs');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { PortableMap, mergeMissing } = require(path.join(__dirname, '..', 'out', 'core', 'portableState.js'));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-portable-'));
const file = path.join(dir, 'session-titles.json');

// ---------- 1. round trip ----------
{
    const m = new PortableMap(file, fs);
    ok('an absent file reads as an empty map', Object.keys(m.read()).length === 0);
    m.write({ 'sid-a': 'gece kosusu', 'sid-b': 'göç kokpiti' });
    ok('the file is really on disk', fs.existsSync(file));

    const fresh = new PortableMap(file, fs);
    ok('a second reader sees what the first wrote', fresh.read()['sid-a'] === 'gece kosusu');
    ok('…and non-ASCII survives the round trip', fresh.read()['sid-b'] === 'göç kokpiti');
    ok('…and nothing is left behind half-written', !fs.existsSync(file + '.writing'));
}

// ---------- 2. a corrupt file is not an empty one ----------
{
    const bad = path.join(dir, 'broken.json');
    fs.writeFileSync(bad, '{ this is not json', 'utf8');
    const m = new PortableMap(bad, fs);
    ok('a corrupt file reads as empty rather than throwing', Object.keys(m.read()).length === 0);
    // ‼️ and it must not be CACHED as empty: a cached {} plus the next rename
    // would write the empty map over the user's names.
    fs.writeFileSync(bad, JSON.stringify({ 'sid-c': 'kurtarildi' }), 'utf8');
    ok('‼️ …and the failed parse was not cached, so a repaired file is seen',
        m.read()['sid-c'] === 'kurtarildi');

    // ‼️ and a write after a failed parse keeps the broken file beside the new
    // one — the user's names may still be in it, and a rename over it is the
    // one way to make sure they are not.
    const bad2 = path.join(dir, 'broken2.json');
    fs.writeFileSync(bad2, '{ "sid-d": "kayip"', 'utf8');
    const m2 = new PortableMap(bad2, fs);
    m2.read();
    m2.write({ 'sid-e': 'yeni' });
    ok('‼️ a write over a corrupt file keeps the corrupt one as .corrupt',
        fs.existsSync(bad2 + '.corrupt') && fs.readFileSync(bad2 + '.corrupt', 'utf8').includes('kayip'));
    ok('…and the new map is on disk', JSON.parse(fs.readFileSync(bad2, 'utf8'))['sid-e'] === 'yeni');
    ok('…and a second write does not move the good file aside again',
        (m2.write({ 'sid-e': 'yeni2' }), JSON.parse(fs.readFileSync(bad2, 'utf8'))['sid-e'] === 'yeni2'
            && fs.readFileSync(bad2 + '.corrupt', 'utf8').includes('kayip')));
    ok('exists() says whether the file is on disk',
        m2.exists() && !new PortableMap(path.join(dir, 'never.json'), fs).exists());
}

// ---------- 2b. the cache is checked against the file, never trusted ----------
// ‼️ Measured 2026-09-12: the extension read 95 names at start, the recovery
// tool added two from outside, and the next rename would have written the
// cached 95 back over them. The same happens on the other machine after a
// git pull. So a read stats the file and re-reads when it moved.
{
    const f = path.join(dir, 'shared.json');
    const m = new PortableMap(f, fs);
    m.write({ 'sid-a': 'bir' });
    ok('a read after a write sees what was written', m.read()['sid-a'] === 'bir');
    // another hand writes the file, with a later mtime
    const later = new Date(Date.now() + 5000);
    fs.writeFileSync(f, JSON.stringify({ 'sid-a': 'bir', 'sid-z': 'disaridan' }), 'utf8');
    fs.utimesSync(f, later, later);
    ok('‼️ a change made by another hand is seen on the next read', m.read()['sid-z'] === 'disaridan');
    m.write({ ...m.read(), 'sid-b': 'iki' });
    const back = JSON.parse(fs.readFileSync(f, 'utf8'));
    ok('‼️ …and the next write carries it rather than writing the stale copy over it',
        back['sid-z'] === 'disaridan' && back['sid-b'] === 'iki');
}

// ---------- 3. the cleaner decides what the file may hold ----------
{
    const f = path.join(dir, 'cleaned.json');
    fs.writeFileSync(f, JSON.stringify({ good: 'ad', empty: '   ', wrong: 42 }), 'utf8');
    const m = new PortableMap(f, fs, (raw) => {
        const out = {};
        for (const [k, v] of Object.entries(raw || {})) {
            if (typeof v === 'string' && v.trim()) { out[k] = v; }
        }
        return out;
    });
    const got = m.read();
    ok('the cleaner drops what the file should not hold',
        got.good === 'ad' && got.empty === undefined && got.wrong === undefined);
}

// ---------- 4. recovery is a merge, never a copy ----------
{
    const here = { 'sid-1': 'bu makinedeki ad', 'sid-2': 'ikinci' };
    const oldMachine = { 'sid-1': 'ESKI MAKINEDEKI AD', 'sid-9': 'yalniz eskide olan' };
    const { merged, added } = mergeMissing(here, oldMachine);
    ok('‼️ S-61: an id this machine already knows KEEPS its own value',
        merged['sid-1'] === 'bu makinedeki ad');
    ok('…and an id only the old machine had is taken', merged['sid-9'] === 'yalniz eskide olan');
    ok('…and the ones already here are untouched', merged['sid-2'] === 'ikinci');
    ok('…and what was added is reported by name', added.length === 1 && added[0] === 'sid-9');

    const again = mergeMissing(merged, oldMachine);
    ok('…and running it a second time changes nothing (safe to repeat)', again.added.length === 0);

    ok('an absent incoming map is not an error', mergeMissing(here, undefined).added.length === 0);
    ok('…and a null value is never adopted',
        mergeMissing({}, { a: null, b: 'var' }).merged.a === undefined);
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
