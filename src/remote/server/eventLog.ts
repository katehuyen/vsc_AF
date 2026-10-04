/**
 * The farm's numbered event stream: every event gets the next seq, the last
 * `keep` are held (on disk too, so a window reload still replays what a phone
 * missed), and a reconnecting phone's `resumeAfter` becomes a gap plus the
 * events after it.
 *
 * Seqs only ever grow — also across a lost file: an empty log starts at the
 * current time in ms, which is past any seq an earlier log could have reached
 * one step at a time. A phone that remembers a higher seq than the log still
 * holds would otherwise ignore every new event as already seen.
 *
 * ‼️ X-501 — A LOADED LOG ALSO STARTS NO LOWER THAN THE CURRENT TIME. The file
 * is written off the host's thread (QueuedFile: a synchronous write froze the
 * host on a slow disk, X-500), so the last events before a reload may never
 * have reached it; the seqs they took are then above the file's. Starting at
 * the later of the two keeps every new seq past them, by the same argument.
 */
import * as fs from 'fs';
import { OWNER, userOf } from './devices';
import { QueuedFile } from './queuedFile';

export interface EventFrame {
    kind: 'event';
    seq: number;
    type: string;
    ts: number;
    /** X-489 — whose event it is (`devices.ts` OWNER) */
    user: string;
    data: Record<string, unknown>;
}

export interface Replay {
    /** Seqs the phone missed that the log no longer holds. */
    gap?: { from: number; to: number };
    events: EventFrame[];
}

export class EventLog {
    private events: EventFrame[] = [];
    private seq: number;
    private readonly out: QueuedFile | null;

    constructor(
        file: string | null, private readonly keep = 500, private readonly now: () => number = Date.now,
        log?: (line: string) => void
    ) {
        const saved = file ? read(file) : null;
        this.events = saved?.events.slice(-keep) ?? [];
        this.seq = Math.max(saved?.seq ?? 0, now());
        this.out = file ? new QueuedFile(file, () => JSON.stringify({ seq: this.seq, events: this.events }), log) : null;
    }

    get lastSeq(): number { return this.seq; }

    append(type: string, data: Record<string, unknown>, user = OWNER): EventFrame {
        const ev: EventFrame = { kind: 'event', seq: ++this.seq, type, ts: this.now(), user, data };
        this.events.push(ev);
        if (this.events.length > this.keep) { this.events.splice(0, this.events.length - this.keep); }
        void this.out?.write();
        return ev;
    }

    /** Resolves once every append so far is on disk (tests). */
    settled(): Promise<void> { return this.out ? this.out.settled() : Promise.resolve(); }

    /** What a phone that last saw `resumeAfter` is owed. Nothing when it is not behind. */
    replay(resumeAfter: number): Replay {
        if (resumeAfter >= this.seq) { return { events: [] }; }
        const oldest = this.events.length ? this.events[0].seq : this.seq + 1;
        const gap = oldest > resumeAfter + 1 ? { from: resumeAfter + 1, to: oldest - 1 } : undefined;
        return { gap, events: this.events.filter(e => e.seq > resumeAfter) };
    }

}

function read(file: string): { seq: number; events: EventFrame[] } | null {
    try {
        const j = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!Number.isInteger(j.seq) || !Array.isArray(j.events)) { return null; }
        return { seq: j.seq, events: j.events.filter((e: EventFrame) => Number.isInteger(e?.seq) && e.seq <= j.seq)
            .map((e: EventFrame) => ({ ...e, user: userOf(e.user) })) };
    } catch {
        return null;
    }
}
