/**
 * X-342 — THE T2 MERGE BODY, the extension's copy of `_setup/sync/t2.js`.
 *
 * ‼️ ONE RULE, TWO DOORS. The migration engine runs `t2.js` with node when the
 * extension is closed; while it is open the store's owner runs THIS, so a merge
 * never lands under a process that would save its stale copy over it (B6).
 * The two must answer alike — `test/test_sync_merge.js` runs the same cases
 * through both whenever the agent tree is on the machine.
 *
 * K2: the key set is the UNION; a key both sides hold with different values
 * keeps the NEWER when the record carries its own time field, else the LIVE one,
 * and the pair is listed — never silently lost.
 */

export interface T2Spec {
    shape: 'map' | 'items';
    /** items shape: the array's field (default `items`). */
    list?: string;
    /** items shape: the identity field (default `id`). */
    key?: string;
    /** a record's own time field — the newer wins a conflict. */
    time?: string;
}

export interface T2Conflict { key: string; live: unknown; src: unknown; kept: 'live' }

export interface T2Outcome {
    merged: unknown;
    added: number;
    replaced: number;
    conflicts: T2Conflict[];
    changed: boolean;
}

type Doc = Record<string, unknown>;
interface Tally { added: number; replaced: number; conflicts: T2Conflict[] }

function same(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }

function stamp(v: unknown, field: string | undefined): number | undefined {
    const t = v && typeof v === 'object' && field ? (v as Doc)[field] : undefined;
    if (typeof t === 'number') { return t; }
    return typeof t === 'string' && !isNaN(Date.parse(t)) ? Date.parse(t) : undefined;
}

function decide(key: string, live: unknown, src: unknown, field: string | undefined, out: Tally): unknown {
    if (same(live, src)) { return live; }
    const tl = stamp(live, field), ts = stamp(src, field);
    if (tl !== undefined && ts !== undefined && ts > tl) { out.replaced++; return src; }
    out.conflicts.push({ key, live, src, kept: 'live' });
    return live;
}

function mergeMap(live: Doc, src: Doc, spec: T2Spec, out: Tally): Doc {
    const merged: Doc = Object.assign({}, live);
    for (const k of Object.keys(src)) {
        if (!(k in merged)) { merged[k] = src[k]; out.added++; continue; }
        merged[k] = decide(k, merged[k], src[k], spec.time, out);
    }
    return merged;
}

function mergeItems(live: Doc, src: Doc, spec: T2Spec, out: Tally): Doc {
    const list = spec.list || 'items', key = spec.key || 'id';
    const la = Array.isArray(live[list]) ? live[list] as Doc[] : [];
    const sa = Array.isArray(src[list]) ? src[list] as Doc[] : [];
    const at = new Map<unknown, number>(la.map((x, i) => [x && x[key], i]));
    const items = la.slice();
    for (const x of sa) {
        const k = x && x[key];
        if (k === undefined) { continue; }
        if (!at.has(k)) { at.set(k, items.length); items.push(x); out.added++; continue; }
        const i = at.get(k) as number;
        items[i] = decide(String(k), items[i], x, spec.time, out) as Doc;
    }
    const merged: Doc = Object.assign({}, live, { [list]: items });
    if (typeof live.rev === 'number' || typeof src.rev === 'number') {
        merged.rev = Math.max((live.rev as number) || 0, (src.rev as number) || 0) + (out.added || out.replaced ? 1 : 0);
    }
    return merged;
}

/** `live` undefined = no such file here yet. */
export function mergeT2(spec: T2Spec, live: unknown, src: unknown): T2Outcome {
    const out: Tally = { added: 0, replaced: 0, conflicts: [] };
    const s = (src ?? {}) as Doc;
    if (live === undefined) {
        const arr = s[spec.list || 'items'];
        const n = spec.shape === 'items' ? (Array.isArray(arr) ? arr.length : 0) : Object.keys(s).length;
        return { merged: src, added: n, replaced: 0, conflicts: [], changed: n > 0 };
    }
    const l = live as Doc;
    const merged = spec.shape === 'items' ? mergeItems(l, s, spec, out) : mergeMap(l, s, spec, out);
    return Object.assign({ merged, changed: out.added + out.replaced > 0 }, out);
}
