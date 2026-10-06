/**
 * ‼️ B-24 — WHAT A SESSION SAID, IN ONE SHAPE FOR EVERY ENGINE.
 *
 * The bridge could say WHERE a transcript is (`sessions.find`) and search what
 * was said across all of them (`search.transcripts`), but it could not hand
 * over one conversation. So an agent opened the raw file and had to know each
 * engine's own format — and guessed wrong: a Console snapshot calls the
 * model's reply `agent` and a tool's answer `result`, a filter written for
 * Claude's `assistant` came back empty, and "there is nothing there" was said
 * about a session that was full (measured 2026-09-17).
 *
 * The messages themselves are NOT parsed here. `sessions.read` hands the file
 * to the transcript page's own `buildData`, which already turns every engine
 * into one vocabulary; an agent and the viewer therefore read the same thing.
 * This module only decides WHICH session a reference means and cuts a page out
 * of the steps.
 *
 * Pure: no `fs`, no `vscode`.
 */

export type ReadRole = 'user' | 'assistant' | 'tool' | 'toolResult' | 'system';

export const READ_ROLES: ReadRole[] = ['user', 'assistant', 'tool', 'toolResult', 'system'];

/** What a caller asks for when it asked for nothing: the conversation itself. */
export const DEFAULT_READ_ROLES: ReadRole[] = ['user', 'assistant'];

/**
 * An engine's own words for the same roles. Accepted on the way IN, so a
 * caller who has just looked at a Console snapshot is not refused for using
 * its vocabulary; never produced on the way out.
 */
const ROLE_ALIASES: Record<string, ReadRole> = {
    user: 'user', human: 'user', prompt: 'user',
    assistant: 'assistant', agent: 'assistant', model: 'assistant',
    tool: 'tool', tool_use: 'tool', call: 'tool',
    toolresult: 'toolResult', tool_result: 'toolResult', result: 'toolResult',
    system: 'system'
};

export const READ_LIMIT_DEFAULT = 50;
export const READ_LIMIT_MAX = 500;
export const READ_MAX_CHARS_DEFAULT = 4000;

/** One step as the transcript page builds it — only the fields read here. */
export interface ReadableStep {
    role: string;
    ts: number;
    text?: string;
    tool?: string;
    input?: string;
    isError?: boolean;
    sidechain?: boolean;
    turn?: number;
    model?: string;
    /** the transcript line's own id, where the engine writes one */
    uuid?: string;
}

/**
 * The name a surface and an agent give one step: the transcript line's uuid
 * where the engine writes one (it is the file's own and survives any parse),
 * its 1-based place in the whole conversation (`#n`) where it does not.
 */
export function stepKey(step: { uuid?: string }, index: number): string {
    return step.uuid ? step.uuid : `#${index + 1}`;
}

export interface ReadStep {
    /** 1-based position in the FILTERED list — what `from` counts in. */
    i: number;
    /** the step's name across filters and surfaces — what `alerts.readNow msg` takes (`stepKey`) */
    key: string;
    turn: number | null;
    role: ReadRole;
    ts: number;
    text?: string;
    tool?: string;
    input?: string;
    isError?: true;
    model?: string;
    /** present only when text or input was cut: the full length of the longer one */
    clipped?: number;
}

export interface ReadOptions {
    roles?: unknown;
    turn?: number;
    from?: number;
    limit?: number;
    maxChars?: number;
    sidechain?: boolean;
}

export interface ReadPage {
    roles: ReadRole[];
    turns: number;
    total: number;
    from: number;
    returned: number;
    /** the `from` of the following page; null when this page reaches the end */
    next: number | null;
    clipped: number;
    messages: ReadStep[];
}

/**
 * The roles a caller asked for. `all` (or `*`) is every role; an unknown word
 * is an error rather than a silent drop — a filter that quietly ignores half
 * of what was asked returns a confident, wrong page.
 */
export function readRoles(raw: unknown): { roles: ReadRole[] } | { error: string } {
    const words = (Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [])
        .map(w => String(w ?? '').trim().toLowerCase())
        .filter(Boolean);
    if (!words.length) { return { roles: DEFAULT_READ_ROLES.slice() }; }
    if (words.some(w => w === 'all' || w === '*')) { return { roles: READ_ROLES.slice() }; }
    const out: ReadRole[] = [];
    for (const w of words) {
        const r = ROLE_ALIASES[w];
        if (!r) {
            return { error: `Unknown role "${w}". Roles: ${READ_ROLES.join(', ')} (or "all").` };
        }
        if (!out.includes(r)) { out.push(r); }
    }
    return { roles: out };
}

function clip(s: string | undefined, max: number): { v?: string; full: number } {
    if (typeof s !== 'string' || !s) { return { full: 0 }; }
    if (max <= 0 || s.length <= max) { return { v: s, full: 0 }; }
    return { v: s.slice(0, max), full: s.length };
}

/** A page of a transcript's steps. Never throws; a bad `roles` is returned as `error`. */
export function readTranscriptPage(
    steps: ReadableStep[] | undefined, opts: ReadOptions = {}
): ReadPage | { error: string } {
    const picked = readRoles(opts.roles);
    if ('error' in picked) { return picked; }
    const roles = picked.roles;
    const all = Array.isArray(steps) ? steps : [];
    const turns = all.reduce((m, s) => Math.max(m, typeof s.turn === 'number' ? s.turn : 0), 0);
    const turn = Math.floor(Number(opts.turn) || 0);
    const keyOf = new Map<ReadableStep, string>();
    const wanted = all.filter((s, at) => {
        const keep = roles.includes(s.role as ReadRole)
            && (opts.sidechain === true || s.sidechain !== true)
            && (turn <= 0 || s.turn === turn);
        if (keep) { keyOf.set(s, stepKey(s, at)); }
        return keep;
    });
    const total = wanted.length;
    const limit = Math.min(READ_LIMIT_MAX, Math.max(1, Math.floor(Number(opts.limit) || READ_LIMIT_DEFAULT)));
    const rawFrom = Math.floor(Number(opts.from) || 1);
    // Negative counts from the end: -20 is "the last twenty".
    const from = rawFrom < 0 ? Math.max(1, total + rawFrom + 1) : Math.max(1, rawFrom);
    const maxChars = opts.maxChars === undefined || !isFinite(Number(opts.maxChars))
        ? READ_MAX_CHARS_DEFAULT : Math.max(0, Math.floor(Number(opts.maxChars)));
    let clippedCount = 0;
    const messages = wanted.slice(from - 1, from - 1 + limit).map((s, k): ReadStep => {
        const t = clip(s.text, maxChars);
        const inp = clip(s.input, maxChars);
        const out: ReadStep = {
            i: from + k,
            key: keyOf.get(s) as string,
            turn: typeof s.turn === 'number' ? s.turn : null,
            role: s.role as ReadRole,
            ts: s.ts
        };
        if (t.v !== undefined) { out.text = t.v; }
        if (s.tool) { out.tool = s.tool; }
        if (inp.v !== undefined) { out.input = inp.v; }
        if (s.isError === true) { out.isError = true; }
        if (s.model) { out.model = s.model; }
        const full = Math.max(t.full, inp.full);
        if (full) { out.clipped = full; clippedCount++; }
        return out;
    });
    const end = from - 1 + messages.length;
    return {
        roles, turns, total, from,
        returned: messages.length,
        next: end < total ? end + 1 : null,
        clipped: clippedCount,
        messages
    };
}

export interface SessionRefRow {
    sessionId: string;
    file: string;
}

export type SessionRef<T> =
    | { ok: true; row: T; by: 'id' | 'prefix' | 'file' }
    | { ok: false; error: string; candidates: string[] };

const normPath = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

/**
 * Which ONE session a reference means — an id, a unique id prefix, or the
 * transcript path. Stricter than `sessions.find`'s ranking on purpose: a list
 * may lead with its best guess, but reading the wrong conversation with full
 * confidence is the one failure this op must not have. An ambiguous prefix is
 * refused with the ids it matched.
 */
export function resolveSessionRef<T extends SessionRefRow>(pool: T[], ref: string): SessionRef<T> {
    const q = String(ref ?? '').trim();
    if (!q) {
        return {
            ok: false, candidates: [],
            error: 'Missing "session": an id, its 8-character prefix, or the transcript path (sessions.find gives both).'
        };
    }
    const lower = q.toLowerCase();
    const exact = pool.find(s => s.sessionId.toLowerCase() === lower);
    if (exact) { return { ok: true, row: exact, by: 'id' }; }
    const asPath = normPath(q);
    const byFile = pool.find(s => normPath(s.file) === asPath);
    if (byFile) { return { ok: true, row: byFile, by: 'file' }; }
    const prefixed = pool.filter(s => s.sessionId.toLowerCase().startsWith(lower));
    const ids = [...new Set(prefixed.map(s => s.sessionId))];
    if (ids.length === 1) { return { ok: true, row: prefixed[0], by: 'prefix' }; }
    if (ids.length > 1) {
        return {
            ok: false, candidates: ids.slice(0, 10),
            error: `"${q}" is the start of ${ids.length} session ids — give more of it.`
        };
    }
    return {
        ok: false, candidates: [],
        error: `No session has the id "${q}". sessions.find also searches titles, agents and paths.`
    };
}
