/**
 * One file the remote host keeps, written OFF the extension host's thread.
 *
 * A synchronous write held the host for 20 s on a slow disk (X-500), and the
 * phone host writes on every event and every call that changes something. So
 * a write is queued: one at a time, each rendering the CURRENT content when it
 * starts (temp file, then rename), and asks made while one is waiting to start
 * share it. `write()` resolves once a write that began after the ask is on
 * disk; it never rejects — a failure is logged and the next write tries again.
 * src/remote may not reach src/core/backgroundFile.ts (test_remote_boundary).
 */
import * as fs from 'fs';
import * as path from 'path';

export class QueuedFile {
    private tail: Promise<void> = Promise.resolve();
    private next: Promise<void> | null = null;

    constructor(
        private readonly file: string,
        private readonly render: () => string,
        private readonly log: (line: string) => void = () => { }
    ) { }

    write(): Promise<void> {
        if (this.next) { return this.next; }
        const queued = this.tail.then(async () => {
            this.next = null;
            try {
                await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
                const tmp = this.file + '.tmp';
                await fs.promises.writeFile(tmp, this.render(), 'utf8');
                await renameRetrying(tmp, this.file);
            } catch (e) {
                this.log(`remote: ${path.basename(this.file)} not written (${String((e as Error)?.message ?? e)}) - held in memory only`);
            }
        });
        this.next = queued;
        this.tail = queued;
        return queued;
    }

    /** Resolves once everything asked for so far is on disk (or has failed and been logged). */
    settled(): Promise<void> { return this.tail; }
}

/** Windows holds a file a reader or scanner has open; a moment later the rename goes through. */
async function renameRetrying(from: string, to: string): Promise<void> {
    for (let i = 0; ; i++) {
        try { await fs.promises.rename(from, to); return; } catch (e) {
            const code = (e as NodeJS.ErrnoException)?.code;
            if (i >= 4 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) { throw e; }
            await new Promise(r => setTimeout(r, 50 * (i + 1)));
        }
    }
}
