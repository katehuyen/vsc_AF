import * as path from 'path';
import { adapterFor, EngineAuthAdapter, liveSource } from './engineAccounts';

/**
 * X-294 — THE SIXTH GATE: the fleet's own file changed.
 *
 * X-291 finished both legs of the account contract — the fleet's values are
 * projected into every slot, and what a slot session answered travels back —
 * but both of them only ever ran at a GATE somebody opened: activation,
 * capture, launch, a press on the card, a bridge call. Measured 2026-09-13:
 * nothing watched the engine's own `~/.claude/settings.json`, `~/.claude.json`
 * or `~/.codex/config.toml`, and `onDidChangeConfiguration` hears only the
 * `agentFarm.*` side of VS Code. So a permission granted at a terminal prompt
 * in the main directory, or a key typed into the file by hand, reached no slot
 * until the next gate happened to open. Nothing was lost — but a session
 * started in between ran on the old value, and the user's sentence for that is
 * "I changed it and it did not work".
 *
 * ‼️ WHICH FILES IS DERIVED, NEVER TYPED. A watcher holding a list of file
 * names is a second place the truth lives, and it goes stale the moment an
 * engine gains a behaviour file — which happened the same day (X-279 gave Codex
 * `config.toml` and `hooks.json`). The set is exactly what the contract READS
 * from the fleet: every `carryFiles` entry and every file with key-level
 * `ownership`, put through `liveSource` so an engine keeping its identity at
 * the home root rather than under its own directory needs no special case.
 *
 * ‼️ AND THE HARD PART IS NOT THE WATCHING, IT IS NOT HEARING YOURSELF. The
 * return leg WRITES these same files: a promotion puts a slot's new answer into
 * `~/.claude.json`, which is a watched path, which would call the gate, which
 * would promote again. Convergence alone would end it — the second pass writes
 * nothing — but a loop that terminates only because the work happens to be
 * idempotent is one non-idempotent write away from spinning for ever, with
 * nothing to say so (Principle 1).
 *
 * So this is QUIET BY COMPARISON, NOT BY FLAG — the same rule
 * `reproduceSlotSettings` already lives by. Every watched file's content is
 * fingerprinted; an event whose file still says what we last saw is not a
 * change and never reaches the gate, and the gate re-fingerprints afterwards so
 * whatever IT wrote is already accounted for. A timer would have been the other
 * way to do this and is worse twice over: it assumes a latency the file system
 * does not promise, and a real edit landing inside the window is swallowed
 * silently.
 */

/**
 * ‼️ TWO THINGS ABOUT THE WATCH ITSELF, MEASURED ON THIS MACHINE 2026-09-13
 * RATHER THAN ASSUMED, because both would have been quiet failures.
 *
 * `~/.claude` here is a JUNCTION into the agent repo (`D:\zone\agent\…`), and a
 * watch that did not report through it would simply never fire — the feature
 * would look wired and do nothing. It does report: one write produced four
 * events through the junction path.
 *
 * Four events for one write is also the reason the caller debounces. The engine
 * writes its own files several times a second, and `rename` and `change` both
 * arrive for a single save, so one sweep has to answer all of them.
 */

/** One file the fleet owns, and where it is. */
export interface WatchedFile {
    /** the engine whose contract reads it */
    engine: string;
    /** the directory to watch — `fs.watch` is only reliable on a directory */
    dir: string;
    /** the file inside it, compared by name because a directory reports its whole contents */
    name: string;
    /** the full path, which is what is fingerprinted */
    file: string;
}

/**
 * The fleet-side files the contract reads, for the engines that have slots.
 *
 * Engines are passed in rather than read off the stored accounts: an engine
 * with no captured account has nothing to project into and watching it would
 * cost a handle for a gate that can do nothing.
 */
export function watchedFiles(home: string, engines: string[], adapter = adapterFor): WatchedFile[] {
    const out: WatchedFile[] = [];
    const seen = new Set<string>();
    for (const engine of [...new Set(engines)]) {
        const a: EngineAuthAdapter = adapter(engine);
        const names = new Set([...(a.carryFiles ?? []), ...Object.keys(a.ownership ?? {})]);
        for (const name of names) {
            const file = path.join(home, liveSource(engine, name));
            const key = file.toLowerCase();
            if (seen.has(key)) { continue; }
            seen.add(key);
            out.push({ engine, dir: path.dirname(file), name: path.basename(file), file });
        }
    }
    return out;
}

/** Only what this needs off a disk, so the rule is testable without one. */
export interface WatchFs {
    existsSync(p: string): boolean;
    readFileSync(p: string, enc: 'utf8'): string;
}

/**
 * ‼️ WHAT THE FLEET'S FILES SAY RIGHT NOW — the value an event is compared
 * against. A file that is not there has its own mark, distinct from an empty
 * one: deleting `settings.json` is a change the slots must follow, and reading
 * both as `''` would hide it.
 */
export function fingerprint(fs: WatchFs, files: WatchedFile[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const w of files) {
        try { out[w.file] = fs.existsSync(w.file) ? 'v:' + fs.readFileSync(w.file, 'utf8') : 'absent'; }
        catch { out[w.file] = 'unreadable'; }
    }
    return out;
}

/**
 * Which watched files really changed since the last fingerprint — the whole
 * decision, in one pure function so the loop that matters can be measured
 * without a file system, a timer or a window.
 */
export function changedSince(
    fs: WatchFs, files: WatchedFile[], before: Record<string, string>
): { changed: WatchedFile[]; now: Record<string, string> } {
    const now = fingerprint(fs, files);
    return { changed: files.filter(w => now[w.file] !== before[w.file]), now };
}
