import {
    BindableSession, BindingIndex, engineKey, LaunchBinding, normCwd, PreparedBinding, underNorm
} from './launchBinding';

/**
 * ‼️ X-345 — A BINDING CHANGE COSTS WHAT THE CHANGE TOUCHES, NOT WHAT THE
 * FARM REMEMBERS.
 *
 * X-128 made each comparison cheap; the SWEEP still ran over every session on
 * every task change, so its cost grew with the history and nothing capped it
 * (X-127's shared criterion: proportional to what CHANGED, never to what is
 * stored). This module is the other half: which bindings a change added or
 * removed (`bindingDelta`), which sessions one of those could possibly have a
 * say about (`bindingReaches` — a SUPERSET of what `bindSessionIn` decides,
 * never a subset), and an index over sessions that answers that question by
 * declared id, declared file and lifespan window instead of by walking the
 * whole list (`ReachIndex`). A sweep then re-asks only those sessions, and a
 * change that alters no binding asks nobody.
 */

/**
 * One line that carries everything a binding decides with or hands over. Two
 * bindings with the same line ARE the same binding: nothing about a session's
 * attribution could differ between them, so neither replaces the other.
 */
export function bindingSig(b: LaunchBinding): string {
    return `${b.taskId}:${b.agentId}:${normCwd(b.cwd)}:${b.engine || 'claude'}:`
        + `${b.startedAt}:${b.endedAt ?? 0}:${b.sessionId ?? ''}:${normCwd(b.transcriptFile)}:`
        + `${b.mode ?? ''}:${b.kind}:${b.label}:${b.launchId ?? ''}:${b.projectId ?? ''}:${b.launcherId ?? ''}`;
}

export interface BindingDelta {
    /** in the new index and not the old: a run that started, or a run whose record changed */
    added: PreparedBinding[];
    /** in the old index and not the new: a run archived, or the old shape of one that changed */
    removed: PreparedBinding[];
}

/** What came and what went between two prepared lists, by signature. */
export function bindingDelta(before: BindingIndex, after: BindingIndex): BindingDelta {
    const was = new Set(before.all.map(p => bindingSig(p.binding)));
    const is = new Set(after.all.map(p => bindingSig(p.binding)));
    return {
        added: after.all.filter(p => !was.has(bindingSig(p.binding))),
        removed: before.all.filter(p => !is.has(bindingSig(p.binding)))
    };
}

/**
 * Could this binding have anything to say about this session? Every refutation
 * `bindSessionIn` applies is applied here or omitted — never tightened — so a
 * session the matcher would decide differently with or without this binding is
 * always reached. Declared id or file reaches regardless of engine and clock
 * (a resumed run declares a session that began long before it did).
 */
export function bindingReaches(p: PreparedBinding, s: BindableSession, now: number, tolMs = 120_000): boolean {
    if (!s || s.isSidechain) { return false; }
    const id = String(s.sessionId ?? '').trim();
    if (p.sessionId && id && p.sessionId === id) { return true; }
    if (p.file && p.file === normCwd(s.file)) { return true; }
    if (!s.firstTs) { return false; }
    if (engineKey(s.source) !== p.engine) { return false; }
    if (s.cwd && !underNorm(normCwd(s.cwd), p.cwd)) { return false; }
    const ended = p.binding.endedAt ?? now;
    return s.firstTs >= p.binding.startedAt - tolMs && s.firstTs <= ended + 15_000;
}

/**
 * The sessions, findable by what a binding reaches with: declared id, declared
 * file, and the lifespan window (kept in `firstTs` order, so a window is a
 * binary search and a walk over its members). Insert and remove are one item
 * each; `rebuild` is for the moments the owner replaces its whole map.
 */
export class ReachIndex<T extends BindableSession> {
    private byId = new Map<string, T[]>();
    private byFile = new Map<string, T>();
    private order: T[] = [];

    get size(): number { return this.order.length; }

    rebuild(items: Iterable<T>): void {
        this.byId.clear();
        this.byFile.clear();
        this.order = [];
        for (const it of items) { this.add(it); }
    }

    /** Adds one session; a session already held under the same file is replaced. */
    add(item: T): void {
        const key = normCwd(item.file);
        if (this.byFile.has(key)) { this.remove(item.file); }
        this.byFile.set(key, item);
        const id = String(item.sessionId ?? '').trim();
        if (id) {
            const row = this.byId.get(id);
            if (row) { row.push(item); } else { this.byId.set(id, [item]); }
        }
        this.order.splice(this.upperBound(item.firstTs || 0), 0, item);
    }

    remove(file: string): void {
        const key = normCwd(file);
        const item = this.byFile.get(key);
        if (!item) { return; }
        this.byFile.delete(key);
        const id = String(item.sessionId ?? '').trim();
        const row = id ? this.byId.get(id) : undefined;
        if (row) {
            const at = row.indexOf(item);
            if (at >= 0) { row.splice(at, 1); }
            if (!row.length) { this.byId.delete(id); }
        }
        const ts = item.firstTs || 0;
        for (let i = this.lowerBound(ts); i < this.order.length && (this.order[i].firstTs || 0) === ts; i++) {
            if (this.order[i] === item) { this.order.splice(i, 1); return; }
        }
    }

    /** Everything one binding could reach, each session once. */
    reach(p: PreparedBinding, now: number, tolMs = 120_000): T[] {
        const out = new Set<T>();
        for (const s of this.byId.get(p.sessionId) ?? []) { out.add(s); }
        const declared = p.file ? this.byFile.get(p.file) : undefined;
        if (declared) { out.add(declared); }
        const from = p.binding.startedAt - tolMs;
        const to = (p.binding.endedAt ?? now) + 15_000;
        for (let i = this.lowerBound(from); i < this.order.length && (this.order[i].firstTs || 0) <= to; i++) {
            const s = this.order[i];
            if (bindingReaches(p, s, now, tolMs)) { out.add(s); }
        }
        return [...out];
    }

    /** The union over several bindings — the sweep a change asks for. */
    reachAll(list: readonly PreparedBinding[], now: number, tolMs = 120_000): T[] {
        const out = new Set<T>();
        for (const p of list) { for (const s of this.reach(p, now, tolMs)) { out.add(s); } }
        return [...out];
    }

    private lowerBound(ts: number): number {
        let lo = 0, hi = this.order.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if ((this.order[mid].firstTs || 0) < ts) { lo = mid + 1; } else { hi = mid; }
        }
        return lo;
    }

    private upperBound(ts: number): number {
        let lo = 0, hi = this.order.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if ((this.order[mid].firstTs || 0) <= ts) { lo = mid + 1; } else { hi = mid; }
        }
        return lo;
    }
}
