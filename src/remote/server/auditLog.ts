/**
 * Every remote act, by the device that did it: pairings and refused codes,
 * connections and refused handshakes, calls that change something (and every
 * call the scope refused), page presses that act, revokes and scope changes.
 * A call that only looks and a page message that only looks are not acts and
 * are not written, so the log stays a record of what was done.
 *
 * JSON lines on disk; the last `keep` are held in memory, and the file is cut
 * back to them once it holds twice as many.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { OpResult, RemoteCaller } from '../port';
import { requiredScope } from '../scopes';

export const AUDIT_KINDS = ['pair', 'pair-refused', 'connect', 'refused', 'call', 'action', 'revoke', 'scope'] as const;
export type AuditWhat = typeof AUDIT_KINDS[number];

export interface AuditEntry {
    ts: number;
    what: AuditWhat;
    /** '' when no paired device was named (a wrong pairing code) */
    device: string;
    name: string;
    user: string;
    ok: boolean;
    /** the bridge op, or the message type of a page press */
    op?: string;
    page?: string;
    detail?: string;
    address?: string;
}

export interface AuditQuery {
    device?: string;
    /** only these kinds */
    what?: AuditWhat[];
    since?: number;
    limit?: number;
}

export const AUDIT_LIMIT = 100;

export class AuditLog {
    private entries: AuditEntry[];
    private lines: number;

    constructor(private readonly file: string | null, private readonly keep = 2000, private readonly now: () => number = Date.now) {
        const all = file ? read(file) : [];
        this.lines = all.length;
        this.entries = all.slice(-keep);
    }

    record(e: Omit<AuditEntry, 'ts'>): AuditEntry {
        const entry: AuditEntry = { ts: this.now(), ...e };
        this.entries.push(entry);
        if (this.entries.length > this.keep) { this.entries.splice(0, this.entries.length - this.keep); }
        this.write(entry);
        return entry;
    }

    /** Newest first. */
    list(q: AuditQuery = {}): AuditEntry[] {
        const limit = q.limit && q.limit > 0 ? Math.floor(q.limit) : AUDIT_LIMIT;
        const out: AuditEntry[] = [];
        for (let i = this.entries.length - 1; i >= 0 && out.length < limit; i--) {
            const e = this.entries[i];
            if (q.since !== undefined && e.ts < q.since) { break; }
            if (q.device && e.device !== q.device) { continue; }
            if (q.what && !q.what.includes(e.what)) { continue; }
            out.push(e);
        }
        return out;
    }

    private write(entry: AuditEntry): void {
        if (!this.file) { return; }
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        if (++this.lines > this.keep * 2) {
            const tmp = this.file + '.tmp';
            fs.writeFileSync(tmp, this.entries.map(x => JSON.stringify(x) + '\n').join(''), { encoding: 'utf8', mode: 0o600 });
            fs.renameSync(tmp, this.file);
            this.lines = this.entries.length;
        } else {
            fs.appendFileSync(this.file, JSON.stringify(entry) + '\n', { encoding: 'utf8', mode: 0o600 });
        }
    }
}

function read(file: string): AuditEntry[] {
    let text: string;
    try { text = fs.readFileSync(file, 'utf8'); } catch { return []; }
    const out: AuditEntry[] = [];
    for (const line of text.split('\n')) {
        if (!line.trim()) { continue; }
        try {
            const e = JSON.parse(line);
            if (Number.isFinite(e?.ts) && typeof e.what === 'string' && typeof e.device === 'string') { out.push(e); }
        } catch { /* a torn last line from a crash is skipped, the rest is kept */ }
    }
    return out;
}

type Fields = Omit<AuditEntry, 'ts' | 'what' | 'device' | 'name' | 'user'> & { name?: string; user?: string };

/** Writes an entry with the device's name and user filled in from the device book. */
export interface Auditor {
    note(device: string, what: AuditWhat, f: Fields): void;
}

export function auditor(log: AuditLog, devices: { get(id: string): { name: string; user: string } | undefined }): Auditor {
    return {
        note(device, what, f) {
            const d = device ? devices.get(device) : undefined;
            const { name, user, ...rest } = f;
            log.record({ what, device, name: name ?? d?.name ?? '', user: user ?? d?.user ?? '', ...rest });
        }
    };
}

type CallOp = (op: string, args: Record<string, unknown>, caller: RemoteCaller) => Promise<OpResult>;

/** `callOp` with its acts written down: an op that changes something, and any call the scope refused. */
export function auditedCalls(callOp: CallOp, audit: Auditor): CallOp {
    return async (op, args, caller) => {
        let r: OpResult;
        try {
            r = await callOp(op, args, caller);
        } catch (e) {
            audit.note(caller.device, 'call', { op, ok: false, detail: String((e as Error)?.message ?? e).slice(0, 200) });
            throw e;
        }
        if (requiredScope(op) !== 'read' || (!r.ok && r.error.startsWith('scope:'))) {
            audit.note(caller.device, 'call', { op, ok: r.ok, ...(r.ok ? {} : { detail: r.error.slice(0, 200) }) });
        }
        return r;
    };
}
