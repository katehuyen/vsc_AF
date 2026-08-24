/**
 * The parsed session index, kept on disk.
 *
 * ‼️ WHY THIS FILE EXISTS: A WINDOW OPEN MUST COST WHAT CHANGED, NOT WHAT WAS
 * EVER SAID. Without it, every start re-read every transcript ever written —
 * measured here at 703 MB / 7.5 s, and growing forever because a .jsonl
 * transcript is append-only and nothing ever shrinks it. Extrapolated on the
 * same machine: 23 s at 1 000 sessions, 68 s at 3 000, 228 s at 10 000, all of
 * it on the extension host's only thread, i.e. with every extension in the
 * window frozen behind it. A tool meant to be used for years cannot have a
 * start-up cost that grows with the years.
 *
 * A finished session never changes again, so its parse is a fact that can be
 * written down: ~10 KB per session, against the ~2 MB transcript it summarises.
 * The whole index for 3 000 sessions is ~31 MB — read once, in the background.
 *
 * ‼️ AND IT IS A CACHE, NEVER A SOURCE. Every entry is admitted only if the
 * file it describes still has the same size AND mtime; anything else is
 * re-read from the transcript. The transcripts remain the only truth, so the
 * worst a corrupt, truncated or stale index can cost is one slow start.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { SessionInfo } from './sessions';

/** One remembered parse, with the evidence needed to re-trust it. */
export interface StoredSession {
    file: string;
    /** Size in bytes at the time of the parse. */
    size: number;
    mtimeMs: number;
    info: SessionInfo;
}

interface StoreHeader {
    v: number;
    /** Everything that would make a remembered parse WRONG rather than stale. */
    sig: string;
}

const FORMAT = 2;
/** Bytes buffered before a write — one syscall per session does not scale. */
const BATCH_BYTES = 1 << 20;
/** Entries read before handing the event loop back — see load(). */
const LOAD_BREATH = 512;

const breathe = (): Promise<void> => new Promise<void>(res => setImmediate(res));

export class SessionStore {
    constructor(private readonly file: string) { }

    /**
     * Remembered parses that are still trustworthy, keyed by transcript path.
     *
     * ‼️ JSONL AND A LINE READER, NOT ONE JSON.parse. The point of this file is
     * to stop blocking the extension host, and handing a 100 MB string to
     * JSON.parse would block it exactly as long as the scan it replaces. One
     * line per session parses in microseconds and yields between lines.
     *
     * A signature mismatch is not an error and is not repaired: it means the
     * arithmetic changed (new prices, new weights, a new parser), so every
     * remembered figure is now wrong and the only honest answer is to forget
     * all of them and read the transcripts again.
     */
    async load(signature: string): Promise<Map<string, StoredSession>> {
        const out = new Map<string, StoredSession>();
        if (!fs.existsSync(this.file)) { return out; }
        let stream: fs.ReadStream;
        try { stream = fs.createReadStream(this.file, { encoding: 'utf8' }); } catch { return out; }
        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
        let header: StoreHeader | undefined;
        try {
            for await (const line of rl) {
                if (!line) { continue; }
                if (!header) {
                    try { header = JSON.parse(line) as StoreHeader; } catch { break; }
                    if (header.v !== FORMAT || header.sig !== signature) { break; }
                    continue;
                }
                try {
                    const e = JSON.parse(line) as StoredSession;
                    // A half-written last line (a window killed mid-save) parses
                    // as nothing or as an object without these — dropped, not fatal.
                    if (e && typeof e.file === 'string' && typeof e.size === 'number'
                        && typeof e.mtimeMs === 'number' && e.info) {
                        out.set(e.file, e);
                    }
                } catch { /* one unreadable line costs one re-read */ }
                // ‼️ Reading the index must not become the new stall. A line
                // reader hands over whole buffers, so a 100 MB store would
                // otherwise parse thousands of sessions back-to-back with the
                // host held the entire time — exactly the shape of the problem
                // this file was written to end.
                if (out.size % LOAD_BREATH === 0) { await breathe(); }
            }
        } catch { /* unreadable store — the transcripts are still there */ }
        finally { rl.close(); stream.close(); }
        return header ? out : new Map();
    }

    /**
     * Write the index.
     *
     * ‼️ THROUGH A TEMPORARY FILE AND A RENAME. This is written while the user
     * may close the window at any moment, and a half-written index that still
     * carried a valid header would be read back as truth. A rename is atomic:
     * the reader sees either the old index or the new one, never a torn one.
     */
    async save(entries: Iterable<StoredSession>, signature: string): Promise<void> {
        const tmp = this.file + '.tmp';
        try { await fs.promises.mkdir(path.dirname(this.file), { recursive: true }); } catch { /* exists */ }
        const header: StoreHeader = { v: FORMAT, sig: signature };
        let fh: fs.promises.FileHandle | undefined;
        try {
            fh = await fs.promises.open(tmp, 'w');
            // Batched rather than one write per session: 3 000 syscalls to save
            // 31 MB is the kind of cost that only shows up on the machine that
            // already has 3 000 sessions.
            let batch = JSON.stringify(header) + '\n';
            for (const e of entries) {
                let line: string;
                try { line = JSON.stringify(e) + '\n'; } catch { continue; }
                batch += line;
                if (batch.length >= BATCH_BYTES) { await fh.write(batch); batch = ''; }
            }
            if (batch) { await fh.write(batch); }
            await fh.close();
            fh = undefined;
            await fs.promises.rename(tmp, this.file);
        } catch {
            try { await fh?.close(); } catch { /* already closed */ }
            try { await fs.promises.unlink(tmp); } catch { /* never created */ }
        }
    }

    /** Forget everything — used when the user asks for a real rescan. */
    async clear(): Promise<void> {
        try { await fs.promises.unlink(this.file); } catch { /* nothing to clear */ }
    }
}
