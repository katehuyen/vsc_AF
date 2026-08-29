/**
 * Session marks — the shelf. A farm that has been running for a while holds
 * hundreds of transcripts, and among them are the five or six the user keeps
 * coming back to (a product, a customer, a long investigation). Renaming a
 * session made it recognisable; it did not make it reachable.
 *
 * A mark is the user's own annotation on a session id: **pinned** (put it on
 * the shelf — it is listed first and never falls off the bottom of a top-N
 * cut) and **tags** (free-text labels the session tables and the shelf picker
 * search on). Session titles live in their own store and are untouched by
 * this one.
 *
 * Pure data, no VS Code: the extension persists the map in globalState, the
 * SessionIndex projects it onto SessionInfo, and the tests use it directly.
 */

export interface SessionMark {
    pinned?: boolean;
    tags?: string[];
    /** K-35 — the user's own colour on this session, `#rrggbb`. See below. */
    color?: string;
}

export type SessionMarks = Record<string, SessionMark>;

/**
 * ‼️ K-35 — A COLOUR IS A MARK, WHICH IS WHY IT LIVES HERE.
 *
 * A card in the Console's left panel is one of a dozen that all look alike, and
 * the eye finds a colour before it reads a word. That makes the colour the same
 * KIND of thing as the pin and the labels: the user's own annotation on a
 * session id, meaningful nowhere else and persisted the same way — so it goes
 * in the same store rather than in a second one that would have to be loaded,
 * migrated and kept in step with this.
 *
 * ‼️ AND IT IS VALIDATED HERE, ONCE. The value reaches a `style` attribute in a
 * webview. A string that arrives from a page and is written into CSS is an
 * injection, so nothing but `#rrggbb` is ever stored: everything else — a
 * colour name, `url(...)`, an empty string — normalises to '' and clears the
 * mark. The page may offer whatever picker it likes; what survives is a hex.
 */
export function normalizeColor(raw: unknown): string {
    if (typeof raw !== 'string') { return ''; }
    const t = raw.trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(t)) {
        return ('#' + t[0] + t[0] + t[1] + t[1] + t[2] + t[2]).toLowerCase();
    }
    return /^[0-9a-fA-F]{6}$/.test(t) ? ('#' + t).toLowerCase() : '';
}

/** Split a typed tag line on commas and newlines only — a label is allowed to
 *  be two words ("customer x"), so a space is not a separator. Trimmed,
 *  inner whitespace collapsed, de-duped case-insensitively (the first spelling
 *  wins), empties dropped. */
export function parseTags(input: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of String(input ?? '').split(/[,\n]+/)) {
        const t = raw.trim().replace(/\s+/g, ' ');
        if (!t) { continue; }
        const key = t.toLowerCase();
        if (seen.has(key)) { continue; }
        seen.add(key);
        out.push(t);
    }
    return out;
}

/** Accept whatever globalState hands back (older shapes, hand-edited JSON)
 *  and return a clean map. Entries that mark nothing are dropped. */
export function normalizeMarks(raw: unknown): SessionMarks {
    const out: SessionMarks = {};
    if (!raw || typeof raw !== 'object') { return out; }
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
        if (!id || !value || typeof value !== 'object') { continue; }
        const v = value as { pinned?: unknown; tags?: unknown; color?: unknown };
        const mark: SessionMark = {};
        if (v.pinned === true) { mark.pinned = true; }
        const tags = Array.isArray(v.tags)
            ? parseTags(v.tags.filter(t => typeof t === 'string').join(', '))
            : [];
        if (tags.length) { mark.tags = tags; }
        const color = normalizeColor(v.color);
        if (color) { mark.color = color; }
        if (mark.pinned || mark.tags || mark.color) { out[id] = mark; }
    }
    return out;
}

/** Immutable update helper — returns a new map with `id` changed. An entry
 *  that ends up marking nothing is removed rather than stored as an empty
 *  object, so the store stays exactly as long as the shelf is. */
function patch(marks: SessionMarks, id: string, change: SessionMark): SessionMarks {
    const next: SessionMarks = { ...marks };
    const merged: SessionMark = { ...(next[id] ?? {}), ...change };
    const clean: SessionMark = {};
    if (merged.pinned === true) { clean.pinned = true; }
    if (merged.tags?.length) { clean.tags = merged.tags; }
    if (merged.color) { clean.color = merged.color; }
    if (clean.pinned || clean.tags || clean.color) { next[id] = clean; } else { delete next[id]; }
    return next;
}

/** Toggle (or force with `on`) the pin of one session. */
export function togglePin(marks: SessionMarks, id: string, on?: boolean): SessionMarks {
    const want = on === undefined ? !marks[id]?.pinned : !!on;
    return patch(marks, id, { pinned: want ? true : undefined });
}

export function setTags(marks: SessionMarks, id: string, tags: string[]): SessionMarks {
    return patch(marks, id, { tags: tags.length ? tags : undefined });
}

/** K-35 — set (or clear, with anything that is not a hex) one session's colour. */
export function setColor(marks: SessionMarks, id: string, color: unknown): SessionMarks {
    const hex = normalizeColor(color);
    return patch(marks, id, { color: hex || undefined });
}

export function isPinned(marks: SessionMarks, id: string): boolean {
    return marks[id]?.pinned === true;
}

export function colorOf(marks: SessionMarks, id: string): string {
    return marks[id]?.color ?? '';
}

/**
 * ‼️ K-35 — THE FIXED SWATCHES, HERE RATHER THAN IN THE PAGE.
 *
 * The palette is offered on the card AND is what `sessions.color` documents to
 * an agent asking what a colour may be, so it is one list. They are hexes, not
 * theme tokens: a custom colour comes out of a colour input as a hex, and a
 * store holding two kinds of value is a store every reader has to branch on.
 * Chosen to hold their identity as a 9px dot on both a dark and a light card.
 */
export const SESSION_COLORS: readonly string[] = [
    '#e05252', '#e08a3c', '#d9b310', '#5fb85f', '#2eb6b6',
    '#3d8bfd', '#8b6ddb', '#d15fa8', '#9c7a5c', '#8a94a6'
];

export function tagsOf(marks: SessionMarks, id: string): string[] {
    return marks[id]?.tags ?? [];
}

export function pinnedIds(marks: SessionMarks): string[] {
    return Object.entries(marks).filter(([, m]) => m.pinned).map(([id]) => id);
}

/** Every tag in use, sorted — the tag picker's option list. */
export function allTags(marks: SessionMarks): string[] {
    const seen = new Map<string, string>();
    for (const m of Object.values(marks)) {
        for (const t of m.tags ?? []) {
            const key = t.toLowerCase();
            if (!seen.has(key)) { seen.set(key, t); }
        }
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Sort comparator: pinned rows first, order within each group untouched
 *  (callers chain their own criterion after it). */
export function pinnedFirst(a: { pinned?: boolean }, b: { pinned?: boolean }): number {
    return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
}
