/**
 * Answers already given, per device and call id, so a resend returns the same
 * answer instead of running the op twice (remote-contract.v1.json rules).
 *
 * ‼️ A CALL THAT CHANGES SOMETHING IS REMEMBERED ON DISK, AND BEFORE IT RUNS.
 * The phone resends every call it holds no answer for after each welcome, for
 * as long as its outbox keeps it (and_AgentFarm Outbox.MAX_AGE_MS). A window
 * reload empties a memory held only in RAM, so a call that ran but whose
 * answer never reached the phone ran a second time on the new host. So a
 * `lasting` call is written down as started before `run`, and its answer is
 * written before it is handed back; a resend after a reload gets the stored
 * answer, and one that died mid-run is told so instead of running again.
 * Writes go through QueuedFile (off the host's thread); a failed write is
 * logged and the call goes on — RAM still holds it for this host's life.
 */
import * as fs from 'fs';
import { QueuedFile } from './queuedFile';

export type Answer = Record<string, unknown>;

interface Saved { key: string; at: number; answer?: Answer }

/** Longer than the phone keeps an unanswered call (6 h), so every resend it can make is still known. */
export const CALLS_KEEP_MS = 7 * 60 * 60 * 1000;

/** Past this size a kept answer loses its `result` (the phone's outbox needs the verdict, not the payload). */
export const KEPT_ANSWER_MAX = 16 * 1024;

export interface CallMemoryOptions {
    /** Most entries held in RAM (reads and writes alike). */
    keep?: number;
    /** Most lasting entries on disk. */
    keepSaved?: number;
    now?: () => number;
    log?: (line: string) => void;
}

export class CallMemory {
    private done = new Map<string, Promise<Answer>>();
    private saved = new Map<string, Saved>();
    private readonly out: QueuedFile | null;
    private readonly keep: number;
    private readonly keepSaved: number;
    private readonly now: () => number;

    /** `file` = where lasting calls are kept; null = RAM only. */
    constructor(file: string | null = null, o: CallMemoryOptions = {}) {
        this.keep = o.keep ?? 1000;
        this.keepSaved = o.keepSaved ?? 500;
        this.now = o.now ?? Date.now;
        this.out = file ? new QueuedFile(file, () => this.render(), o.log) : null;
        for (const s of file ? read(file, this.now() - CALLS_KEEP_MS) : []) { this.saved.set(s.key, s); }
    }

    /**
     * The answer for this call: a known one (also while it is still running, or
     * from before a reload), or `run`'s — started once. `lasting` = the op
     * changes something, so it is kept on disk too.
     */
    answer(device: string, id: string, run: () => Promise<Answer>, lasting = false): { result: Promise<Answer>; duplicate: boolean } {
        const key = device + '|' + id;
        const known = this.done.get(key);
        if (known) { return { result: known, duplicate: true }; }
        const past = this.saved.get(key);
        if (past) { return { result: this.hold(key, Promise.resolve(past.answer ?? interrupted(id))), duplicate: true }; }
        return { result: this.hold(key, lasting && this.out ? this.runKept(this.out, key, run) : run()), duplicate: false };
    }

    /** Resolves once everything asked for so far is on disk (tests, and a host that is stopping). */
    settled(): Promise<void> { return this.out ? this.out.settled() : Promise.resolve(); }

    private hold(key: string, result: Promise<Answer>): Promise<Answer> {
        this.done.set(key, result);
        if (this.done.size > this.keep) { this.done.delete(this.done.keys().next().value as string); }
        return result;
    }

    private async runKept(out: QueuedFile, key: string, run: () => Promise<Answer>): Promise<Answer> {
        const entry: Saved = { key, at: this.now() };
        this.saved.set(key, entry);
        await out.write();
        const answer = await run();
        entry.answer = keptForm(answer);
        await out.write();
        return answer;
    }

    /** The kept list as it stands when a write starts: inside the window, newest last, capped. */
    private render(): string {
        const cut = this.now() - CALLS_KEEP_MS;
        const list = [...this.saved.values()].filter(s => s.at >= cut).slice(-this.keepSaved);
        this.saved = new Map(list.map(s => [s.key, s]));
        return JSON.stringify({ v: 1, calls: list });
    }
}

function keptForm(a: Answer): Answer {
    if (JSON.stringify(a).length <= KEPT_ANSWER_MAX) { return a; }
    if (a.ok !== true) { return { ...a, error: String(a.error ?? '').slice(0, 2000) }; }
    return { ...a, result: { kept: false, note: 'the answer was too large to keep; the call ran once' } };
}

/** What a resend is told when the host stopped while the call was running. */
function interrupted(id: string): Answer {
    return {
        kind: 'result', id, ok: false,
        error: 'interrupted: Agent Farm restarted while this call was running, so whether it took effect is unknown - check before sending it again'
    };
}

function read(file: string, cut: number): Saved[] {
    try {
        const j = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!Array.isArray(j?.calls)) { return []; }
        return j.calls.filter((s: Saved) => typeof s?.key === 'string' && typeof s.at === 'number' && s.at >= cut
            && (s.answer === undefined || (typeof s.answer === 'object' && s.answer !== null)));
    } catch {
        return [];
    }
}
