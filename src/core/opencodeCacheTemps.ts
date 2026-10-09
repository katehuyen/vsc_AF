/**
 * X-528 — OPENCODE'S HALF-WRITTEN CATALOG FILES, AND WHY THEY STOP HERE.
 *
 * Measured (2026-10-10, OpenCode 1.18.35): every `opencode` process forks a
 * models.dev refresh at start, which writes `models.json.<pid>.<ms>.tmp` and
 * renames it over `models.json`; a failed rename removes the temp file, but a
 * process that ENDS between the write and the rename leaves it. Short CLI calls
 * end exactly there — 182 such files (786 MB) had piled up, their gaps whole
 * multiples of the ten-minute history harvest, and 40% of them within 30 s of two
 * or more OpenCode starts against 9.6% of random instants. So the harvest's own
 * calls run with OPENCODE_DISABLE_MODELS_FETCH (they only read the store), and
 * what is left from any source is swept: a catalog temp file only, older than an
 * hour, and only when the process named in it is gone.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** The one name OpenCode gives the file: `models.json.<pid>.<ms since epoch>.tmp`. */
const CATALOG_TEMP = /^models\.json\.(\d+)\.(\d+)\.tmp$/;
export const CATALOG_TEMP_MIN_AGE_MS = 60 * 60_000;

/** The variable that keeps a read-only OpenCode call from refreshing the catalog. */
export const NO_MODELS_FETCH: Readonly<Record<string, string>> = { OPENCODE_DISABLE_MODELS_FETCH: '1' };

/** Which of these names are leftovers it is safe to delete. Pure. */
export function staleCatalogTemps(
    names: readonly string[], now: number, alive: (pid: number) => boolean, minAgeMs = CATALOG_TEMP_MIN_AGE_MS
): string[] {
    return names.filter(n => {
        const m = CATALOG_TEMP.exec(n);
        return !!m && now - Number(m[2]) > minAgeMs && !alive(Number(m[1]));
    });
}

/** OpenCode's cache folder: XDG_CACHE_HOME, else ~/.cache — on Windows too (measured). */
export function opencodeCacheDir(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string {
    return path.join(env.XDG_CACHE_HOME || path.join(home, '.cache'), 'opencode');
}

/** A process with this id exists (EPERM: it exists and is not ours). */
export function pidAlive(pid: number): boolean {
    try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
}

/** Delete the leftovers in `dir`; a file that cannot be removed is left and counted out. */
export function sweepCatalogTemps(dir = opencodeCacheDir(), now = Date.now(), alive = pidAlive): { removed: number; bytes: number } {
    let names: string[];
    try { names = fs.readdirSync(dir); } catch { return { removed: 0, bytes: 0 }; }
    let removed = 0, bytes = 0;
    for (const n of staleCatalogTemps(names, now, alive)) {
        const f = path.join(dir, n);
        try { const size = fs.statSync(f).size; fs.unlinkSync(f); removed++; bytes += size; } catch { /* in use or gone */ }
    }
    return { removed, bytes };
}
