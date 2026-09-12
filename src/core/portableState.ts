/**
 * Portable state — the things that belong to the FLEET and have to travel.
 *
 * ‼️ S-61 — VS CODE'S `globalState` IS NAILED TO THE MACHINE. It is one row in
 * `%APPDATA%\Code\User\globalStorage\state.vscdb`, a SQLite file that is not in
 * the extension's own folder, is not in the repo, and is not carried by the
 * migration. So a session's name, its pin, its tags and its colour — the user's
 * own words about their own work — were written to the one place on the machine
 * that a move cannot reach. Measured: a new machine came up with every
 * transcript present and every name gone.
 *
 * ‼️ AND IT IS THE SAME FAULT AS X-271, one layer up. There the wrong owner was
 * the account slot; here it is the editor's per-machine store. A session record
 * outlives both — the account it was run under and the machine it was run on —
 * so it is kept where the fleet keeps everything: a plain JSON file inside the
 * extension's own `globalStorage`, which is junctioned onto `D:\zone\agent` and
 * therefore committed, pushed and cloned like every other fact.
 *
 * A store here is deliberately dumb: one small map, read through a cache
 * because the session tables ask for a title per row, written whole because
 * these files are kilobytes and a partial write is worse than a slow one.
 */

export interface PortableFs {
    existsSync(p: string): boolean;
    statSync(p: string): { mtimeMs: number; size: number };
    readFileSync(p: string, enc: 'utf8'): string;
    writeFileSync(p: string, data: string, enc: 'utf8'): void;
    renameSync(from: string, to: string): void;
    mkdirSync(p: string, o: { recursive: boolean }): void;
}

export class PortableMap<T> {
    private cache: Record<string, T> | undefined;
    /** mtime+size the cache was read at — the file is re-read when they move. */
    private stamp = '';
    private corrupt = false;

    constructor(
        private readonly file: string,
        private readonly fs: PortableFs,
        /** Drops what the file should not be trusted to hold. Identity by default. */
        private readonly clean: (raw: unknown) => Record<string, T> = (raw) => (raw ?? {}) as Record<string, T>
    ) { }

    /** Whether the file is on disk at all — the one-shot adoption keys on this. */
    exists(): boolean { return this.fs.existsSync(this.file); }

    /** mtime+size of the file now, or '' when it is not there. */
    private stampNow(): string {
        try {
            if (!this.fs.existsSync(this.file)) { return ''; }
            const st = this.fs.statSync(this.file);
            return `${st.mtimeMs}:${st.size}`;
        } catch { return ''; }
    }

    /**
     * What is on the shelf. A file that is missing, empty or corrupt reads as {}.
     *
     * ‼️ THE CACHE IS CHECKED AGAINST THE FILE, NOT TRUSTED. This file is written
     * by other hands while the extension runs — `tools/adopt_state_vscdb.js`
     * adding two names, `git pull` on the other machine bringing ninety — and
     * a cache that never looked again would write its stale copy over them on
     * the next rename. One stat per read is the price of never losing a name.
     */
    read(): Record<string, T> {
        const now = this.stampNow();
        if (this.cache && now === this.stamp) { return this.cache; }
        let raw: unknown = {};
        try {
            if (this.fs.existsSync(this.file)) { raw = JSON.parse(this.fs.readFileSync(this.file, 'utf8')); }
        } catch {
            // ‼️ A CORRUPT FILE IS NOT AN EMPTY ONE, and the difference matters:
            // reading it as {} and then writing would erase the user's names on
            // the first rename. So nothing is cached from a failed parse — the
            // next read tries again — and the next write keeps the broken file
            // beside the new one instead of renaming over it.
            this.cache = undefined;
            this.corrupt = true;
            return {};
        }
        this.cache = this.clean(raw);
        this.stamp = now;
        this.corrupt = false;
        return this.cache;
    }

    /**
     * Replace the map. Written to a sibling and renamed over the target, so a
     * crash mid-write leaves the previous file rather than half of the new one.
     */
    write(next: Record<string, T>): void {
        const dir = this.file.replace(/[\\/][^\\/]*$/, '');
        try { this.fs.mkdirSync(dir, { recursive: true }); } catch { /* already there */ }
        if (this.corrupt && this.fs.existsSync(this.file)) {
            this.fs.renameSync(this.file, this.file + '.corrupt');
            this.corrupt = false;
        }
        const tmp = this.file + '.writing';
        this.fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
        this.fs.renameSync(tmp, this.file);
        this.cache = this.clean(next);
        this.stamp = this.stampNow();
    }

    /** Forget what was read — for a caller that knows the file changed under it. */
    invalidate(): void { this.cache = undefined; this.stamp = ''; }

    /**
     * Re-read if the file moved under us; true when it did.
     *
     * ‼️ A NAME THAT ARRIVES FROM OUTSIDE HAS TO BE SHOWN, NOT MERELY KEPT.
     * `read()` protects the file — a rename can no longer paste a stale copy
     * over what another hand wrote — but whoever was HANDED the map at startup
     * still holds that copy. Measured 2026-09-12: the adoption tool added 54
     * titles and 11 marks and the session tables showed none of them until a
     * restart. So a caller that repaints keeps asking this, and pushes only on
     * a real move: one stat, no parse, no repaint while the file sits still.
     */
    reloadIfChanged(): boolean {
        const before = this.stamp;
        this.read();
        return this.stamp !== before;
    }
}

/**
 * ‼️ A RECOVERY IS A MERGE, NEVER A COPY — and this is the rule the whole
 * feature turns on. The machine you are recovering ONTO is not empty: measured
 * 2026-09-12, this one already held 95 session titles and 8 marks. Laying the
 * old machine's map over it would repair one loss by causing another, which is
 * why nothing here overwrites: an id the target already knows keeps the value
 * it has, and only ids it has never seen are taken from the incoming map.
 *
 * That makes it safe to run repeatedly — once against the editor's own
 * leftover `globalState` the first time the file is missing, and again by hand
 * against a `state.vscdb` carried over from another machine. Once, not at
 * every start: the old row is never written again, so it can only ever hold
 * what the file already took — and merging it again would resurrect every
 * name the user has since removed.
 */
export function mergeMissing<T>(
    target: Record<string, T>,
    incoming: Record<string, T> | undefined
): { merged: Record<string, T>; added: string[] } {
    const merged: Record<string, T> = { ...target };
    const added: string[] = [];
    for (const [k, v] of Object.entries(incoming ?? {})) {
        if (v === undefined || v === null) { continue; }
        if (Object.prototype.hasOwnProperty.call(merged, k)) { continue; }
        merged[k] = v;
        added.push(k);
    }
    return { merged, added };
}
