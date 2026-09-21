/**
 * S-68 — "WHICH SESSION AM I?", answered from evidence and never from a folder.
 *
 * An agent calling the bridge is a process several levels below the CLI that
 * runs its conversation (claude → shell → node af.js). Three sources can name
 * that conversation, tried in this order:
 *   1. `arg` — the caller said it outright;
 *   2. `env` — the CLI's own environment variable, which af.js forwards;
 *   3. `registry` — af.js forwards its parent pid, and the CLI's live registry
 *      (`<config-dir>/sessions/<pid>.json`) holds the pid of every running CLI:
 *      the first of the caller's ancestors that is in it IS the conversation.
 * Nothing else. A cwd match ("the session working in this folder") is refused
 * by name — two sessions in one folder is the ordinary case, not the exotic one.
 *
 * Pure: the registry and the ancestry arrive as arguments.
 */

export type WhoamiSource = 'arg' | 'env' | 'registry';

export interface WhoamiRecord {
    pid: number;
    sessionId: string;
    cwd?: string;
}

export interface WhoamiInput {
    arg?: unknown;
    envSessionId?: unknown;
    /** the caller's own parent pid, as af.js saw it */
    ppid?: unknown;
    /** `ppid` and every process above it, nearest first — omitted when not read */
    ancestors?: readonly number[];
    records: readonly WhoamiRecord[];
}

export type WhoamiResult =
    | { ok: true; sessionId: string; source: WhoamiSource; pid?: number; cwd?: string; depth?: number }
    | { ok: false; why: string };

const sid = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The registry answer alone: the nearest ancestor that is a live CLI. */
export function registryMatch(
    ancestors: readonly number[] | undefined, records: readonly WhoamiRecord[]
): { sessionId: string; pid: number; cwd?: string; depth: number } | undefined {
    const byPid = new Map<number, WhoamiRecord>();
    for (const r of records || []) {
        if (r && Number.isFinite(r.pid) && r.pid > 0 && sid(r.sessionId)) { byPid.set(r.pid, r); }
    }
    const chain = ancestors || [];
    for (let i = 0; i < chain.length; i++) {
        const hit = byPid.get(chain[i]);
        if (hit) { return { sessionId: sid(hit.sessionId), pid: hit.pid, ...(hit.cwd ? { cwd: hit.cwd } : {}), depth: i }; }
    }
    return undefined;
}

export function whoami(input: WhoamiInput): WhoamiResult {
    const arg = sid(input.arg);
    if (arg) { return { ok: true, sessionId: arg, source: 'arg' }; }
    const env = sid(input.envSessionId);
    if (env) { return { ok: true, sessionId: env, source: 'env' }; }
    const ppid = Number(input.ppid);
    if (!Number.isFinite(ppid) || ppid <= 0) {
        return {
            ok: false,
            why: 'the caller named no session, its environment carries none, and it sent no parent pid '
                + '— an older af.js, or a process that is not an agent. Nothing is guessed from the folder.'
        };
    }
    const hit = registryMatch(input.ancestors ?? [ppid], input.records);
    if (hit) { return { ok: true, sessionId: hit.sessionId, source: 'registry', pid: hit.pid, ...(hit.cwd ? { cwd: hit.cwd } : {}), depth: hit.depth }; }
    return {
        ok: false,
        why: `no live CLI registry entry is an ancestor of pid ${ppid} — the caller is not running under a `
            + 'session this machine\'s CLI has registered. Nothing is guessed from the folder.'
    };
}
