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
 */
import * as fs from 'fs';
import * as path from 'path';

export interface EventFrame {
    kind: 'event';
    seq: number;
    type: string;
    ts: number;
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

    constructor(private readonly file: string | null, private readonly keep = 500, private readonly now: () => number = Date.now) {
        const saved = file ? read(file) : null;
        this.events = saved?.events.slice(-keep) ?? [];
        this.seq = saved?.seq ?? now();
    }

    get lastSeq(): number { return this.seq; }

    append(type: string, data: Record<string, unknown>): EventFrame {
        const ev: EventFrame = { kind: 'event', seq: ++this.seq, type, ts: this.now(), data };
        this.events.push(ev);
        if (this.events.length > this.keep) { this.events.splice(0, this.events.length - this.keep); }
        this.save();
        return ev;
    }

    /** What a phone that last saw `resumeAfter` is owed. Nothing when it is not behind. */
    replay(resumeAfter: number): Replay {
        if (resumeAfter >= this.seq) { return { events: [] }; }
        const oldest = this.events.length ? this.events[0].seq : this.seq + 1;
        const gap = oldest > resumeAfter + 1 ? { from: resumeAfter + 1, to: oldest - 1 } : undefined;
        return { gap, events: this.events.filter(e => e.seq > resumeAfter) };
    }

    private save(): void {
        if (!this.file) { return; }
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const tmp = this.file + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify({ seq: this.seq, events: this.events }), 'utf8');
        fs.renameSync(tmp, this.file);
    }
}

function read(file: string): { seq: number; events: EventFrame[] } | null {
    try {
        const j = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!Number.isInteger(j.seq) || !Array.isArray(j.events)) { return null; }
        return { seq: j.seq, events: j.events.filter((e: EventFrame) => Number.isInteger(e?.seq) && e.seq <= j.seq) };
    } catch {
        return null;
    }
}
