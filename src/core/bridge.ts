/**
 * Farm Bridge — the official gate for AGENTS (or any external process) to use
 * Agent Farm's functions as if they clicked the UI themselves. The user tells
 * an agent "kur şunu / başlat bunu"; the agent drops a request file, the
 * RUNNER window executes it through the same managers the UI uses, and writes
 * a response file back.
 *
 * Protocol (file-based on purpose — no port discovery, works for any process
 * that can write a file):
 *   <globalStorage>/bridge/<name>.request.json   →  { "op": "...", "args": { ... } }
 *   <globalStorage>/bridge/<name>.response.json  ←  { "ok": true, "result": ... }
 *                                                |  { "ok": false, "error": "..." }
 * The request file is deleted after processing; responses are pruned after a
 * day. If no VS Code window is open, requests simply wait — the next runner
 * picks them up (the caller should time out and say so honestly).
 *
 * Future-proofing is the registry: every subsystem registers its ops with a
 * one-line contract, and `farm.ops` returns the whole catalog — so an agent
 * can DISCOVER what today's build offers instead of hardcoding a list, and a
 * new feature ships its bridge access by adding one registration.
 */

export interface BridgeOpSpec {
    op: string;                       // e.g. "schedules.add"
    /** One-line contract shown in the farm.ops catalog: what it does + args. */
    describe: string;
    handler: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

export interface BridgeOutcome {
    ok: boolean;
    result?: unknown;
    error?: string;
}

export class BridgeRegistry {
    private ops = new Map<string, BridgeOpSpec>();

    constructor() {
        this.register({
            op: 'farm.ops',
            describe: 'List every available bridge operation with its one-line contract. args: none',
            handler: () => this.catalog()
        });
    }

    register(spec: BridgeOpSpec | BridgeOpSpec[]): void {
        for (const s of Array.isArray(spec) ? spec : [spec]) {
            this.ops.set(s.op, s);
        }
    }

    catalog(): { op: string; describe: string }[] {
        return [...this.ops.values()]
            .map(s => ({ op: s.op, describe: s.describe }))
            .sort((a, b) => a.op.localeCompare(b.op));
    }

    async dispatch(op: string, args: Record<string, unknown>): Promise<BridgeOutcome> {
        const spec = this.ops.get(op);
        if (!spec) {
            return {
                ok: false,
                error: `Unknown op "${op}" — call { "op": "farm.ops" } for the catalog of ${this.ops.size} operations.`
            };
        }
        try {
            return { ok: true, result: await spec.handler(args) };
        } catch (e) {
            return { ok: false, error: String((e as Error)?.message ?? e).slice(0, 500) };
        }
    }
}

/** Validate a request file's content. Errors are messages for the response. */
export function parseBridgeRequest(text: string): { op: string; args: Record<string, unknown> } | { error: string } {
    // Strip a UTF-8 BOM — PowerShell's `Set-Content -Encoding utf8` (the natural
    // way a Windows agent writes the file) prepends one, and JSON.parse rejects
    // it. The bridge must accept what the callers actually produce.
    const clean = text.replace(/^\uFEFF/, '').trim();
    let parsed: unknown;
    try { parsed = JSON.parse(clean); } catch (e) {
        return { error: 'Request is not valid JSON: ' + String((e as Error).message).slice(0, 120) };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { error: 'Request must be a JSON object: { "op": "...", "args": { ... } }' };
    }
    const o = parsed as Record<string, unknown>;
    if (typeof o.op !== 'string' || !o.op.trim()) {
        return { error: 'Missing "op" — call { "op": "farm.ops" } to list operations.' };
    }
    const args = o.args && typeof o.args === 'object' && !Array.isArray(o.args)
        ? o.args as Record<string, unknown>
        : {};
    return { op: o.op.trim(), args };
}

/** Throw with a friendly message — handlers use this for arg validation. */
export function need(cond: unknown, message: string): void {
    if (!cond) { throw new Error(message); }
}

/** A required string arg, trimmed. */
export function argStr(args: Record<string, unknown>, key: string): string {
    const v = args[key];
    need(typeof v === 'string' && v.trim(), `Missing required string arg "${key}".`);
    return (v as string).trim();
}

/** An optional string arg ('' when absent). */
export function optStr(args: Record<string, unknown>, key: string): string {
    const v = args[key];
    return typeof v === 'string' ? v.trim() : '';
}

/**
 * The session (or sessions) an op was called about — `sessionId`, `sessionIds`,
 * or both.
 *
 * ‼️ ONE spelling of "which sessions", shared by every op that can act on more
 * than one. The alternative is each op inventing its own plural key and an
 * agent having to remember which is which; and once the panels can do a thing
 * to a selection, the bridge has to be able to do it to a set or the two
 * surfaces have drifted (`_REF/agentfarm-dev.md`). Duplicates are collapsed —
 * an op told the same session twice must not do the work twice.
 */
export function argSessionIds(args: Record<string, unknown>): string[] {
    const out: string[] = [];
    const push = (v: unknown): void => {
        const s = String(v ?? '').trim();
        if (s && !out.includes(s)) { out.push(s); }
    };
    push(args.sessionId);
    if (Array.isArray(args.sessionIds)) { for (const v of args.sessionIds) { push(v); } }
    return out;
}
