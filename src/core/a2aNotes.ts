import { byFit, fit } from './a2aMatch';
import { a2aId, Envelope, readEnvelope, withLock, writeEnvelope } from './a2aStore';
import { ClearFilter, clearable, sweepable } from './a2aHygiene';

/**
 * N-3 — WHAT ONE AGENT LEAVES FOR ANOTHER TO READ. A note is PASSIVE: nobody
 * is assigned it, nothing waits on it, and it is consumed by whoever the
 * coordinates match. That is the whole difference from a task, and it is why
 * the two are separate stores rather than one table with a flag — a queue you
 * can read without claiming is a queue whose states mean nothing.
 *
 * ‼️ THE COORDINATES ARE A MATCH, NOT AN ADDRESS. `project` · `subsystem` ·
 * `topic` · `targetRole` say what the note is ABOUT and who it is FOR, and a
 * reader arrives with coordinates of their own. `'*'` on either side is
 * "anything", which is how a broadcast is written without a second mechanism.
 * `strictness` decides what happens when only some of them line up:
 *
 *   hard      — every stated coordinate must match, or the note is not yours
 *   preferred — mismatches are allowed but rank below exact hits
 *   any       — the coordinates are a label; anyone may read it
 */

/**
 * S-84 — `baton` is a relay's own handover card, kept apart from fleet traffic
 * so a race can be hidden, isolated or swept on rules of its own.
 */
export type A2ACategory = 'info' | 'warning' | 'convention' | 'discovery' | 'result' | 'baton';
export const A2A_CATEGORIES: A2ACategory[] = ['info', 'warning', 'convention', 'discovery', 'result', 'baton'];

export type A2AStrictness = 'hard' | 'preferred' | 'any';
export const A2A_STRICTNESS: A2AStrictness[] = ['hard', 'preferred', 'any'];

/** The user's word on a note, and it outranks every rule an agent applies. */
export interface HumanDirective {
    kind: 'steer' | 'veto' | 'constraint';
    text: string;
    ts: number;
}

export const DIRECTIVE_HEADER = '⚠️ [HUMAN SUPERVISOR DIRECTIVE]';

/**
 * N-8 — THE DIRECTIVE AS THE FIRST THING AN AGENT READS. Rendered at the top
 * of every bridge answer that hands over a note or a task carrying one, and
 * at the top of the prompt of a run started for such a task, so the user's
 * word is met before the constitution, the agent's own file or the task's
 * instructions — which is what "supreme override" means in practice.
 */
export function directiveBlock(d: HumanDirective): string {
    const verb = { steer: 'do it THIS way', veto: 'NOT this — do something else', constraint: 'stay WITHIN these limits' }[d.kind] ?? d.kind;
    return `${DIRECTIVE_HEADER} — ${d.kind}: ${verb}\n${d.text.trim()}\n`
        + `(set by the user ${new Date(d.ts).toISOString()}. This outranks every rule you apply — the constitution, `
        + 'your own instructions, the task\'s own text. Follow it; if it cannot be followed, stop and say why.)';
}

export interface A2ANote {
    id: string;
    ts: number;
    fromAgent: string;
    fromSessionId?: string;
    /** '*' = every project */
    project: string;
    /** the workdir or subsystem it is about; '*' = anywhere */
    subsystem: string;
    /** the anchor a reader searches by; '*' = anything */
    topic: string;
    /** the role or capability meant to read it; '*' = anyone */
    targetRole: string;
    /** the one session (a resume keeps its id) it is for; '*' = any */
    targetSession: string;
    strictness: A2AStrictness;
    category: A2ACategory;
    title: string;
    body: string;
    /** absolute paths worth opening alongside the note */
    contextFiles: string[];
    humanDirective?: HumanDirective;
    /** epoch ms after which the note is history; 0 = it does not expire */
    expiresAt: number;
    resolved: boolean;
    /** when it was resolved — what the 48-hour hygiene sweep counts from */
    resolvedAt?: number;
    /** S-84 — the user's exemption: a pinned note is never swept, only deleted by hand */
    pinned?: boolean;
    /** who has read it — a note is passive, so this is the only "state" it has */
    readBy: string[];
}

export interface A2ANoteInput {
    fromAgent: string;
    fromSessionId?: string;
    title: string;
    body?: string;
    project?: string;
    subsystem?: string;
    topic?: string;
    targetRole?: string;
    targetSession?: string;
    strictness?: A2AStrictness;
    category?: A2ACategory;
    contextFiles?: string[];
    /** how long it stays live, in ms; 0 or absent = forever */
    ttlMs?: number;
}

const str = (v: unknown, fallback = ''): string =>
    typeof v === 'string' && v.trim() ? v.trim() : fallback;

export function makeNote(input: A2ANoteInput, now = Date.now()): A2ANote {
    const ttl = typeof input.ttlMs === 'number' && input.ttlMs > 0 ? input.ttlMs : 0;
    return {
        id: a2aId('n', now),
        ts: now,
        fromAgent: str(input.fromAgent, 'unknown'),
        ...(input.fromSessionId ? { fromSessionId: input.fromSessionId } : {}),
        project: str(input.project, '*'),
        subsystem: str(input.subsystem, '*'),
        topic: str(input.topic, '*'),
        targetRole: str(input.targetRole, '*'),
        targetSession: str(input.targetSession, '*'),
        strictness: A2A_STRICTNESS.includes(input.strictness as A2AStrictness)
            ? input.strictness as A2AStrictness : 'preferred',
        category: A2A_CATEGORIES.includes(input.category as A2ACategory)
            ? input.category as A2ACategory : 'info',
        title: str(input.title, '(untitled)'),
        body: typeof input.body === 'string' ? input.body : '',
        contextFiles: Array.isArray(input.contextFiles)
            ? input.contextFiles.filter(f => typeof f === 'string' && f.trim()) : [],
        expiresAt: ttl ? now + ttl : 0,
        resolved: false,
        readBy: []
    };
}

/** A row off disk, filled in — a note written by an older build is still a note. */
export function normaliseNote(row: Partial<A2ANote> & { id: string }): A2ANote {
    return {
        id: row.id,
        ts: typeof row.ts === 'number' ? row.ts : 0,
        fromAgent: str(row.fromAgent, 'unknown'),
        ...(row.fromSessionId ? { fromSessionId: row.fromSessionId } : {}),
        project: str(row.project, '*'),
        subsystem: str(row.subsystem, '*'),
        topic: str(row.topic, '*'),
        targetRole: str(row.targetRole, '*'),
        targetSession: str(row.targetSession, '*'),
        strictness: A2A_STRICTNESS.includes(row.strictness as A2AStrictness)
            ? row.strictness as A2AStrictness : 'preferred',
        category: A2A_CATEGORIES.includes(row.category as A2ACategory)
            ? row.category as A2ACategory : 'info',
        title: str(row.title, '(untitled)'),
        body: typeof row.body === 'string' ? row.body : '',
        contextFiles: Array.isArray(row.contextFiles) ? row.contextFiles : [],
        ...(row.humanDirective ? { humanDirective: row.humanDirective } : {}),
        expiresAt: typeof row.expiresAt === 'number' ? row.expiresAt : 0,
        resolved: row.resolved === true,
        ...(typeof row.resolvedAt === 'number' ? { resolvedAt: row.resolvedAt } : {}),
        ...(row.pinned === true ? { pinned: true } : {}),
        readBy: Array.isArray(row.readBy) ? row.readBy : []
    };
}

export interface NoteQuery {
    project?: string;
    subsystem?: string;
    topic?: string;
    /** the reader's own role — matched against the note's targetRole */
    role?: string;
    /** the reader's session — matched against the note's targetSession */
    sessionId?: string;
    /** what the reader can do — a note that `requires` more is not theirs */
    capabilities?: string[];
    /** how long `preferred` is the target role's alone (a2aMatch.PREFERRED_GRACE_MS) */
    graceMs?: number;
    category?: A2ACategory;
    /** the reader's name, for unread-only reads */
    reader?: string;
    unreadOnly?: boolean;
    includeResolved?: boolean;
    includeExpired?: boolean;
}

/**
 * How well a note answers a reader's coordinates. `undefined` = not theirs.
 * The rule is the engine's (a2aMatch.fit): the project contains, the role is
 * what strictness is about, and `preferred` is the target role's alone for a
 * while. A higher score is a closer fit.
 */
export function noteScore(note: A2ANote, q: NoteQuery, now = Date.now()): number | undefined {
    const f = fit(note, q, now);
    return f.eligible ? f.score : undefined;
}

export function matchNotes(notes: A2ANote[], q: NoteQuery, now = Date.now()): A2ANote[] {
    return byFit(notes
        .filter(n => q.includeResolved || !n.resolved)
        .filter(n => q.includeExpired || !n.expiresAt || n.expiresAt > now)
        .filter(n => !q.category || n.category === q.category)
        .filter(n => !(q.unreadOnly && q.reader) || !n.readBy.includes(q.reader as string))
        .map(n => ({ row: n, fit: fit(n, q, now), ts: n.ts })));
}

export class A2ANotesStore {
    notes: A2ANote[] = [];
    private rev = 0;

    constructor(private file: string) { }

    load(): void {
        const env = readEnvelope<A2ANote>(this.file, r => normaliseNote(r as A2ANote & { id: string }));
        this.notes = env.items;
        this.rev = env.rev;
    }

    /**
     * Every write is a locked read-modify-write against what is ON DISK, not
     * against what this process last saw. Another host's note written while
     * this one was thinking survives; the alternative is a farm where the
     * second agent to speak erases the first.
     */
    private mutate<T>(fn: (notes: A2ANote[]) => { notes: A2ANote[]; out: T }): T | undefined {
        return withLock(this.file, () => {
            const disk = readEnvelope<A2ANote>(this.file, r => normaliseNote(r as A2ANote & { id: string }));
            const r = fn(disk.items);
            const env: Envelope<A2ANote> = { rev: disk.rev + 1, items: r.notes };
            if (!writeEnvelope(this.file, env)) { return undefined as T; }
            this.notes = r.notes;
            this.rev = env.rev;
            return r.out;
        });
    }

    add(input: A2ANoteInput, now = Date.now()): A2ANote | undefined {
        const note = makeNote(input, now);
        return this.mutate(notes => ({ notes: [note, ...notes], out: note }));
    }

    get(id: string): A2ANote | undefined { return this.notes.find(n => n.id === id); }

    read(q: NoteQuery, now = Date.now()): A2ANote[] {
        this.load();
        return matchNotes(this.notes, q, now);
    }

    /** Mark it seen by this reader. Idempotent — reading twice is not news. */
    markRead(id: string, reader: string): A2ANote | undefined {
        return this.mutate(notes => {
            const out = notes.map(n => n.id === id && !n.readBy.includes(reader)
                ? { ...n, readBy: [...n.readBy, reader] } : n);
            return { notes: out, out: out.find(n => n.id === id) };
        });
    }

    resolve(id: string, resolved = true, now = Date.now()): A2ANote | undefined {
        return this.mutate(notes => {
            const out = notes.map(n => {
                if (n.id !== id) { return n; }
                const { resolvedAt: _was, ...rest } = n;
                return resolved ? { ...rest, resolved, resolvedAt: now } : { ...rest, resolved };
            });
            return { notes: out, out: out.find(n => n.id === id) };
        });
    }

    /** S-84 — the user's exemption from every automatic sweep; only a hand takes it off. */
    pin(id: string, pinned = true): A2ANote | undefined {
        return this.mutate(notes => {
            const out = notes.map(n => {
                if (n.id !== id) { return n; }
                const { pinned: _was, ...rest } = n;
                return pinned ? { ...rest, pinned: true } : rest;
            });
            return { notes: out, out: out.find(n => n.id === id) };
        });
    }

    /** S-84 — stamp a ttl on notes by id: what a finished chain does to its own cards. */
    expire(ids: string[], at: number): number {
        const want = new Set(ids);
        return this.mutate(notes => {
            let hit = 0;
            const out = notes.map(n => {
                if (!want.has(n.id)) { return n; }
                hit++;
                return { ...n, expiresAt: at };
            });
            return { notes: out, out: hit };
        }) ?? 0;
    }

    /**
     * S-84 — delete by hand, which is the one way a PINNED note goes. Everything
     * automatic (`sweep`) spares them; a person asking by id does not.
     */
    remove(ids: string[]): number {
        const want = new Set(ids);
        return this.mutate(notes => {
            const out = notes.filter(n => !want.has(n.id));
            return { notes: out, out: notes.length - out.length };
        }) ?? 0;
    }

    /**
     * S-84 — clear the board, or the part of it a filter names. Pinned notes stay
     * unless `includePinned` says the user meant them too.
     */
    clear(filter: ClearFilter = {}): number {
        return this.mutate(notes => {
            const out = notes.filter(n => !clearable(n, filter));
            return { notes: out, out: notes.length - out.length };
        }) ?? 0;
    }

    /** The user's word, which every agent treats as the highest rule there is; `undefined` takes it off. */
    direct(id: string, directive: HumanDirective | undefined): A2ANote | undefined {
        return this.mutate(notes => {
            const out = notes.map(n => {
                if (n.id !== id) { return n; }
                const { humanDirective: _old, ...rest } = n;
                return directive ? { ...rest, humanDirective: directive } : rest;
            });
            return { notes: out, out: out.find(n => n.id === id) };
        });
    }

    /**
     * Drop what the board no longer owes — the rules are `a2aHygiene.sweepable`,
     * and a pinned note is never one of them.
     */
    sweep(now = Date.now()): number {
        return this.mutate(notes => {
            const out = notes.filter(n => !sweepable(n, now));
            return { notes: out, out: notes.length - out.length };
        }) ?? 0;
    }
}
