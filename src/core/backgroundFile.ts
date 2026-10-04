import * as fs from 'fs';
import * as path from 'path';
import { isLockError, RENAME_RETRY_DELAYS_MS, writeAtomicSync } from './atomicFile';

/**
 * X-500 — A FILE WHOSE LATEST CONTENT IS WRITTEN OFF THE EXTENSION HOST'S THREAD.
 *
 * Measured: on a slow disk one synchronous write of a 126 KB store held the
 * host's only thread for 20.4 s (the same write normally takes 0.5 ms), and
 * every extension on the host stood still with it. A state file written on a
 * beat — nobody waits for its bytes — does not need that thread at all.
 *
 * What it keeps of a synchronous write: the newest content handed in is the one
 * that ends on disk, in order (content superseded while a write is running is
 * never written); a reader sees the old file or the new one, never half of one
 * (temp file + rename, the rename retried while somebody holds the target);
 * and `flushSync` writes the newest content before the host goes away.
 */

export interface BackgroundIo {
    mkdir(dir: string): Promise<void>;
    write(file: string, content: string): Promise<void>;
    rename(from: string, to: string): Promise<void>;
    remove(file: string): Promise<void>;
    sleep(ms: number): Promise<void>;
}

const nodeIo: BackgroundIo = {
    mkdir: async dir => { await fs.promises.mkdir(dir, { recursive: true }); },
    write: (file, content) => fs.promises.writeFile(file, content, 'utf8'),
    rename: (from, to) => fs.promises.rename(from, to),
    remove: async file => { try { await fs.promises.unlink(file); } catch { /* best effort */ } },
    sleep: ms => new Promise(r => setTimeout(r, ms))
};

export class BackgroundFile {
    private pending: string | undefined;
    private running: Promise<void> | undefined;
    /** Bumped by a synchronous write: a background write started before it must not land after it. */
    private generation = 0;
    lastError: string | undefined;
    written = 0;

    constructor(
        readonly file: string,
        private readonly io: BackgroundIo = nodeIo,
        private readonly delays: number[] = RENAME_RETRY_DELAYS_MS,
        private readonly writeSync: (file: string, content: string) => { ok: boolean; error?: string } = writeAtomicSync
    ) { }

    /** Hand in the newest content; returns at once. */
    write(content: string): void {
        this.pending = content;
        if (!this.running) { this.running = this.drain(); }
    }

    /** Settles once everything handed in so far is on disk (or has failed — see lastError). */
    idle(): Promise<void> { return this.running ?? Promise.resolve(); }

    get busy(): boolean { return this.running !== undefined; }

    /** For a host that is shutting down: this content, written before the call returns; nothing older lands after it. */
    flushSync(content: string): boolean {
        this.pending = undefined;
        this.generation++;
        const r = this.writeSync(this.file, content);
        if (r.ok) { this.written++; this.lastError = undefined; } else { this.lastError = r.error; }
        return r.ok;
    }

    private async drain(): Promise<void> {
        try {
            while (this.pending !== undefined) {
                const text = this.pending;
                this.pending = undefined;
                await this.writeOnce(text, this.generation);
            }
        } finally {
            this.running = undefined;
        }
    }

    private async writeOnce(text: string, generation: number): Promise<void> {
        const tmp = `${this.file}.af.bg.tmp`;
        try {
            await this.io.mkdir(path.dirname(this.file));
            await this.io.write(tmp, text);
        } catch (e) {
            await this.io.remove(tmp);
            this.lastError = `could not write ${path.basename(tmp)}: ${String((e as Error)?.message ?? e)}`;
            return;
        }
        for (let attempt = 0; ; attempt++) {
            if (generation !== this.generation) { await this.io.remove(tmp); return; }
            try {
                await this.io.rename(tmp, this.file);
                this.written++;
                this.lastError = undefined;
                return;
            } catch (e) {
                if (!isLockError(e) || attempt >= this.delays.length) {
                    await this.io.remove(tmp);
                    this.lastError = `could not replace ${path.basename(this.file)}: ${String((e as Error)?.message ?? e)}`;
                    return;
                }
                await this.io.sleep(this.delays[attempt]);
            }
        }
    }
}
