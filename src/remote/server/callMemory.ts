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
 * Writes are asynchronous and queued (never on the host's thread: a sync
 * write froze the host for 20 s on a slow disk, X-500); a failed write is
 * logged and the call goes on — RAM still holds it for this host's life.
 */
import * as fs from 'fs';
import * as path from 'path';

export type Answer = Record<string, unknown>;

interface Saved { key: string; at: number; answer?: Answer }

/** Longer than the phone keeps an unanswered call (6 h), so every resend it can make is still known. */
export const CALLS_KEEP_MS = 7 * 60 * 60 * 1000;

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
    private writing: Promise<void> = Promise.resolve();
    private readonly keep: number;
    private readonly keepSaved: number;
    private readonly now: () => number;
    private readonly log: (line: string) => void;

    /** `file` = where lasting calls are kept; null = RAM only. */
    constructor(private readonly file: string | null = null, o: CallMemoryOptions = {}) {
        this.keep = o.keep ?? 1000;
        this.keepSaved = o.keepSaved ?? 500;
        this.now = o.now ?? Date.now;
        this.log = o.log ?? (() => { });
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
        return { result: this.hold(key, lasting && this.file ? this.runKept(key, run) : run()), duplicate: false };
    }

    /** Resolves once everything asked for so far is on disk (tests, and a host that is stopping). */
    settled(): Promise<void> { return this.writing; }

    private hold(key: string, result: Promise<Answer>): Promise<Answer> {
        this.done.set(key, result);
        if (this.done.size > this.keep) { this.done.delete(this.done.keys().next().value as string); }
        return result;
    }

    private async runKept(key: string, run: () => Promise<Answer>): Promise<Answer> {
        const entry: Saved = { key, at: this.now() };
        this.saved.set(key, entry);
        await this.save();
        const answer = await run();
        entry.answer = keptForm(answer);
        await this.save();
        return answer;
    }

    /** Queued behind the write before it; each writes the whole current list. */
    private save(): Promise<void> {
        const file = this.file!;
        this.writing = this.writing.then(async () => {
            const cut = this.now() - CALLS_KEEP_MS;
            const list = [...this.saved.values()].filter(s => s.at >= cut).slice(-this.keepSaved);
            this.saved = new Map(list.map(s => [s.key, s]));
            try {
                await fs.promises.mkdir(path.dirname(file), { recursive: true });
                const tmp = file + '.tmp';
                await fs.promises.writeFile(tmp, JSON.stringify({ v: 1, calls: list }), 'utf8');
                await renameRetrying(tmp, file);
            } catch (e) {
                this.log(`remote: call memory not written (${String((e as Error)?.message ?? e)}) - held in memory only`);
            }
        });
        return this.writing;
    }
}

/** Past this size a kept answer loses its `result` (the phone's outbox needs the verdict, not the payload). */
export const KEPT_ANSWER_MAX = 16 * 1024;

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
