// X-528 — OpenCode's half-written catalog files: the harvest no longer makes them, and the leftovers are swept safely.
const path = require('path');
const fs = require('fs');
const os = require('os');
const ROOT = path.join(__dirname, '..');
const T = require(path.join(ROOT, 'out', 'core', 'opencodeCacheTemps.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const NOW = Date.parse('2026-10-10T05:00:00Z');
const H = 60 * 60_000;
const name = (pid, ts) => `models.json.${pid}.${ts}.tmp`;

// ---------- which files may go ----------
{
    const names = [
        name(101, NOW - 2 * H),            // old, writer gone -> goes
        name(202, NOW - 10 * 60_000),      // ten minutes old -> may still be in flight, stays
        name(303, NOW - 3 * H),            // old but its pid is alive -> stays
        'models.json',                     // the catalog itself, never
        'models.json.tmp',                 // not OpenCode's pattern, never
        'other.101.1.tmp'                  // another file, never
    ];
    const alive = pid => pid === 303;
    const out = T.staleCatalogTemps(names, NOW, alive);
    ok('‼️ only a catalog temp file older than an hour whose writer is gone is chosen', out.join() === name(101, NOW - 2 * H));
    ok('the catalog itself and any other name are never chosen', !out.includes('models.json') && !out.includes('models.json.tmp'));
}

// ---------- the sweep on a real folder ----------
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-x528-'));
    fs.writeFileSync(path.join(dir, 'models.json'), '{}');
    fs.writeFileSync(path.join(dir, name(101, NOW - 2 * H)), 'x'.repeat(10));
    fs.writeFileSync(path.join(dir, name(202, NOW - 60_000)), 'y');
    const r = T.sweepCatalogTemps(dir, NOW, () => false);
    const left = fs.readdirSync(dir).sort();
    ok('the sweep removes exactly the stale one and counts its bytes', r.removed === 1 && r.bytes === 10);
    ok('…and leaves the catalog and the young temp file', left.join() === ['models.json', name(202, NOW - 60_000)].sort().join());
    ok('a folder that is not there is no error', T.sweepCatalogTemps(path.join(dir, 'nope'), NOW, () => false).removed === 0);
    fs.rmSync(dir, { recursive: true, force: true });
}

// ---------- where OpenCode keeps it, and the pid check ----------
{
    ok('the cache folder is XDG_CACHE_HOME when set', T.opencodeCacheDir({ XDG_CACHE_HOME: 'X:/c' }, 'H:/u') === path.join('X:/c', 'opencode'));
    ok('…else ~/.cache, on Windows too (measured)', T.opencodeCacheDir({}, 'H:/u') === path.join('H:/u', '.cache', 'opencode'));
    ok('this process is alive; a pid nobody holds is not', T.pidAlive(process.pid) === true && T.pidAlive(2147483646) === false);
}

// ---------- the harvest's own calls never refresh the catalog ----------
{
    const src = fs.readFileSync(path.join(ROOT, 'src', 'core', 'opencodeharvest.ts'), 'utf8');
    const cli = src.slice(src.indexOf('export function nodeOpencodeCli'), src.indexOf('export function nodeOpencodeCli') + 900);
    ok('‼️ the harvest spawns with OPENCODE_DISABLE_MODELS_FETCH (its list and export only read the store)',
        /env: \{ \.\.\.process\.env, \.\.\.NO_MODELS_FETCH \}/.test(cli) && T.NO_MODELS_FETCH.OPENCODE_DISABLE_MODELS_FETCH === '1');
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const h = ext.slice(ext.indexOf('const harvestOpencode = async'), ext.indexOf('const harvestOpencode = async') + 700);
    ok('every harvest pass sweeps the leftovers and says how many', /sweepCatalogTemps\(\)/.test(h) && /catalogTemps/.test(h));
}

console.log(`test_opencode_cache_temps: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
