/**
 * X-43 — CODEX'S LIVE CONTEXT READING, OFF THE FILE IT IS ALREADY WRITING.
 *
 * ‼️ THE CONSOLE CARD SAID `ctx 5.4M` ON A WINDOW OF 258 400. That figure was
 * the conversation's lifetime spend wearing the label of the window, and it was
 * not a formatting slip: the host state and the `console.sessions` Bridge reply
 * carried the same wrong number, `tokens` and `contextTokens` identical to the
 * digit. Measured on the real `gpt-5.6-sol` thread, 2026-08-15, at that instant
 * the rollout on disk said `total 5 414 907 · last 220 471 · window 258 400`.
 *
 * Codex's stdout stream cannot answer this. It emits usage ONCE, at
 * `turn.completed`, as the thread's running total (codexproto.ts →
 * `codexTurnUsage`) — there is no per-call block on the wire to read a window
 * out of. There IS one on disk: the rollout grows while the turn runs and every
 * `event_msg` line of type `token_count` states the last call, the total and the
 * capacity together. So the live answer is a bounded tail read of a file this
 * machine already has, costing no token and asking the engine nothing.
 *
 * This module is the READING DISCIPLINE around that: which file, how often, what
 * to do when it is not there yet, and when a standing figure has gone stale. It
 * is pure over an injected `RolloutIo` — no `fs`, no `os`, no `vscode` — so the
 * whole matrix is testable without a home directory, the same shape
 * engineUsage.ts uses.
 *
 * ‼️ WHAT IT WILL NEVER DO: return a session or turn total as "approximate ctx".
 * An unfound file, an unparsable tail, a thread that has not had its first turn
 * — all of them are `undefined`, which the surfaces draw as `—`. A wrong number
 * is worse than no number, and this is the file where that temptation lives.
 */

import { readCodexContext } from './codexproto';

/** Everything this module needs from the outside world. */
export interface RolloutIo {
    /**
     * The rollout whose name carries this thread id, or undefined.
     *
     * Codex names the file `rollout-<iso>-<thread-id>.jsonl` under
     * `~/.codex/sessions/YYYY/MM/DD/`, so the id is in the NAME and no file has
     * to be opened to find it.
     */
    find(threadId: string): string | undefined;
    /** mtime and size, or undefined when the file is gone */
    stat(abs: string): { mtimeMs: number; size: number } | undefined;
    /** the LAST `bytes` of the file as text, or undefined */
    readTail(abs: string, bytes: number): string | undefined;
}

/** One reading, in the canonical shape (consoleproto.ts → ContextSample). */
export interface CodexContextReading {
    tokens: number;
    window?: number;
    /** the conversation's cumulative spend the same line stated — NOT ctx, kept
     *  so a caller can prove the two are different numbers */
    spent?: number;
    source: string;
    measuredAt: number;
    stale?: boolean;
}

/**
 * How far back the last `token_count` line can be. Measured: the line is ~700
 * bytes and is written at every turn boundary, so the tail of any rollout
 * carries one — reading a 39 MB file to find it would be a disk read per paint.
 * A turn that wrote an unusually long stretch of items since the last one falls
 * back to nothing rather than to a wrong figure, and the next turn boundary
 * fixes it.
 */
const TAIL_BYTES = 256 * 1024;

/** The fastest this will touch the disk for one thread. The file changes many
 *  times a second while a turn runs and the reader cannot see 200 ms of
 *  difference; every poll under this interval is answered from the cache. */
const MIN_INTERVAL_MS = 700;

/** How long to wait before walking the directory again for a thread whose
 *  rollout has not appeared yet. The file exists within a second of
 *  `thread.started`, but a walk is the one expensive thing here. */
const FIND_RETRY_MS = 2000;

/**
 * A reading older than this, on a session that is not running, is presented as
 * STALE rather than as the current state of the window. It is still shown — it
 * is the last true thing anybody measured — and it says how old it is.
 */
export const STALE_AFTER_MS = 5 * 60 * 1000;

interface ThreadState {
    path?: string;
    /** last `mtimeMs:size` actually read — an unchanged file is not re-parsed */
    sig?: string;
    last?: CodexContextReading;
    checkedAt: number;
    triedFindAt: number;
}

export class CodexContextProbe {
    private threads = new Map<string, ThreadState>();

    constructor(
        private readonly io: RolloutIo,
        private readonly now: () => number = () => Date.now()
    ) { }

    /**
     * The current reading for a thread, or undefined when there is nothing
     * honest to say yet.
     *
     * `force` skips the throttle and is what a turn boundary and a process exit
     * use: those are the two moments where the file has just been given its
     * final word and the reader is about to look at the card.
     *
     * ‼️ IT RETURNS THE LAST GOOD READING WHEN THE FILE HAS NOT MOVED. A poll
     * that finds an unchanged file has not failed — the window genuinely has
     * not changed — so the caller can apply the answer unconditionally and the
     * reducer's own equality check (`type: 'context'`) makes it a no-op.
     */
    read(threadId: string, opts?: { force?: boolean }): CodexContextReading | undefined {
        const id = String(threadId ?? '').trim();
        if (!id) { return undefined; }
        const now = this.now();
        const t = this.threads.get(id) ?? { checkedAt: 0, triedFindAt: 0 };
        this.threads.set(id, t);
        if (!opts?.force && now - t.checkedAt < MIN_INTERVAL_MS) { return t.last; }
        t.checkedAt = now;

        if (!t.path) {
            if (!opts?.force && now - t.triedFindAt < FIND_RETRY_MS) { return t.last; }
            t.triedFindAt = now;
            try { t.path = this.io.find(id) || undefined; } catch { t.path = undefined; }
            // ‼️ Not an error and not a zero: a thread that has not written its
            // first turn has no window to report. The card says `—`.
            if (!t.path) { return t.last; }
        }

        let st: { mtimeMs: number; size: number } | undefined;
        try { st = this.io.stat(t.path); } catch { st = undefined; }
        if (!st) {
            // The file went away (a cleaned home, a renamed thread). Look for it
            // again next time rather than holding a dead path for ever.
            t.path = undefined;
            return t.last;
        }
        const sig = `${st.mtimeMs}:${st.size}`;
        if (sig === t.sig) { return t.last; }
        t.sig = sig;

        let tail: string | undefined;
        try { tail = this.io.readTail(t.path, TAIL_BYTES); } catch { tail = undefined; }
        const found = readCodexContext(tail);
        if (!found) { return t.last; }
        t.last = {
            tokens: found.tokens,
            ...(found.window ? { window: found.window } : {}),
            ...(found.spent ? { spent: found.spent } : {}),
            source: 'rollout-last-token-usage',
            measuredAt: st.mtimeMs || now
        };
        return t.last;
    }

    /** Drop a thread's cache — a closed session, or one whose id changed. */
    forget(threadId: string): void {
        this.threads.delete(String(threadId ?? '').trim());
    }
}

/**
 * Is a reading old enough that presenting it as "now" would be a claim nothing
 * supports? Kept beside the probe so the panel, the Bridge and the tests all
 * mean the same thing by stale.
 */
export function isStale(measuredAt: number | undefined, now: number): boolean {
    if (!measuredAt) { return true; }
    return now - measuredAt > STALE_AFTER_MS;
}
