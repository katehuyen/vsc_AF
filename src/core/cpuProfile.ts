/**
 * X-482 — WHICH FUNCTION THE EXTENSION HOST'S TIME GOES TO. A listener timing
 * names the subscription; it cannot say which call inside it is slow. A V8
 * sampling profile can, and this reads one into two lists: where the thread
 * was standing (self) and what was on the stack (inclusive), per function.
 */

export interface CpuCallFrame { functionName: string; url: string; lineNumber: number; columnNumber?: number }
export interface CpuNode { id: number; callFrame: CpuCallFrame; hitCount?: number; children?: number[] }
export interface CpuProfile { nodes: CpuNode[]; startTime: number; endTime: number; samples?: number[]; timeDeltas?: number[] }

export interface CpuRow { fn: string; at: string; ms: number; pct: number; ours: boolean }
export interface CpuSummary {
    ms: number; samples: number; busyMs: number; idleMs: number; gcMs: number; programMs: number;
    self: CpuRow[]; inclusive: CpuRow[];
}

const SPECIAL = new Set(['(root)', '(program)', '(idle)', '(garbage collector)']);

/** A script url as a short place: under `root` it is relative to it, else its last two segments. */
export function placeOf(url: string, root: string): { file: string; ours: boolean } {
    let p = String(url || '');
    try { p = decodeURIComponent(p); } catch { /* not encoded */ }
    p = p.replace(/^file:\/\/\/?/i, '').replace(/\\/g, '/');
    const r = String(root || '').replace(/\\/g, '/').replace(/\/+$/, '');
    if (r && p.toLowerCase().startsWith(r.toLowerCase() + '/')) { return { file: p.slice(r.length + 1), ours: true }; }
    return { file: p.split('/').filter(Boolean).slice(-2).join('/'), ours: false };
}

/** Self time per node id: each sample stands until the next one (the DevTools convention). */
function selfTimes(p: CpuProfile): Map<number, number> {
    const self = new Map<number, number>();
    const samples = p.samples ?? [], deltas = p.timeDeltas ?? [];
    if (samples.length && deltas.length === samples.length) {
        for (let i = 0; i < samples.length; i++) {
            const us = i + 1 < deltas.length ? deltas[i + 1] : 0;
            self.set(samples[i], (self.get(samples[i]) ?? 0) + Math.max(0, us) / 1000);
        }
        return self;
    }
    const hits = p.nodes.reduce((n, x) => n + (x.hitCount ?? 0), 0);
    const per = hits ? (p.endTime - p.startTime) / 1000 / hits : 0;
    for (const n of p.nodes) { if (n.hitCount) { self.set(n.id, n.hitCount * per); } }
    return self;
}

export function summarizeCpuProfile(p: CpuProfile, root: string, top = 25): CpuSummary {
    const self = selfTimes(p);
    const byId = new Map(p.nodes.map(n => [n.id, n]));
    const keyOf = (n: CpuNode) => {
        const { file, ours } = placeOf(n.callFrame.url, root);
        const fn = n.callFrame.functionName || '(anonymous)';
        return { key: `${fn}\u0000${file}:${n.callFrame.lineNumber + 1}`, fn, at: file ? `${file}:${n.callFrame.lineNumber + 1}` : '', ours };
    };
    const selfAgg = new Map<string, CpuRow>();
    const incAgg = new Map<string, CpuRow>();
    let idleMs = 0, gcMs = 0, programMs = 0, totalMs = 0;
    for (const [id, ms] of self) {
        const n = byId.get(id);
        if (!n) { continue; }
        totalMs += ms;
        const name = n.callFrame.functionName;
        if (name === '(idle)') { idleMs += ms; continue; }
        if (name === '(garbage collector)') { gcMs += ms; continue; }
        if (name === '(program)') { programMs += ms; continue; }
        const k = keyOf(n);
        const row = selfAgg.get(k.key) ?? { fn: k.fn, at: k.at, ms: 0, pct: 0, ours: k.ours };
        row.ms += ms;
        selfAgg.set(k.key, row);
    }
    // Inclusive: a function counted once per stack, however deep it recurses.
    const parentOf = new Map<number, number>();
    for (const n of p.nodes) { for (const c of n.children ?? []) { parentOf.set(c, n.id); } }
    for (const [id, ms] of self) {
        const seen = new Set<string>();
        for (let cur: number | undefined = id; cur !== undefined; cur = parentOf.get(cur)) {
            const n = byId.get(cur);
            if (!n || SPECIAL.has(n.callFrame.functionName)) { continue; }
            const k = keyOf(n);
            if (seen.has(k.key)) { continue; }
            seen.add(k.key);
            const row = incAgg.get(k.key) ?? { fn: k.fn, at: k.at, ms: 0, pct: 0, ours: k.ours };
            row.ms += ms;
            incAgg.set(k.key, row);
        }
    }
    const busyMs = totalMs - idleMs;
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const rank = (m: Map<string, CpuRow>) => [...m.values()]
        .sort((a, b) => b.ms - a.ms).slice(0, top)
        .map(x => ({ ...x, ms: r1(x.ms), pct: busyMs > 0 ? r1(x.ms / busyMs * 100) : 0 }));
    return {
        ms: r1((p.endTime - p.startTime) / 1000), samples: (p.samples ?? []).length,
        busyMs: r1(busyMs), idleMs: r1(idleMs), gcMs: r1(gcMs), programMs: r1(programMs),
        self: rank(selfAgg), inclusive: rank(incAgg)
    };
}
