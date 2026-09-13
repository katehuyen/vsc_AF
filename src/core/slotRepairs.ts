import { SlotCompleteness } from './slotCompleteness';

/**
 * ‼️ X-292 — A REPAIR IS AN EVENT. A system that heals itself and never says
 * what it healed hides the thing that keeps breaking it.
 *
 * The birth contract (X-284) is asked at three gates, and until this file the
 * answer was thrown away at all three: `try { completeSlots(); } catch {}`. So
 * four junctions were re-made twice in one day, the slot read `complete` both
 * times, and the only reason anybody learned the engine's own housekeeping was
 * removing them is that a person went and looked at the disk by hand. That is
 * Principle 1 — a rule that fails silently is not a rule — and a REPAIR that
 * succeeds silently is the same defect wearing the other face.
 *
 * What goes in a row: the clause, the slot, the gate that ran, and the reading
 * the repair ran AGAINST (`was`) — because after the repair every reading says
 * the slot is well, which is the sentence that hid this. Plus one piece of
 * evidence the contract itself has no use for: the mtime of the file the ENGINE
 * stamps when its own housekeeping runs (`adapter.housekeeping`). The
 * correlation is then DERIVED from the journal by `repairPattern`, never
 * declared here — a declared cause rots the first time the engine changes, a
 * derived one simply stops counting.
 *
 * What does NOT go in a row: paths, file contents, identities. A repair journal
 * that grows into a second transcript store is the wrong file.
 */

export interface SlotRepairEvent {
    at: number;
    slotId: string;
    engine: string;
    /** which gate ran the contract: `start` · `capture` · `launch` · `press` · `ask` */
    gate: string;
    /** the clause id, e.g. `link:todos` */
    clause: string;
    /** the failing reading, in the words the Engines card and Doctor print */
    was: string;
    /** whether the repair actually changed the disk */
    fixed: boolean;
    error?: string;
    /**
     * mtime of the engine's own housekeeping stamp when this repair ran.
     * Absent = the engine stamps nothing, or the stamp was not there.
     */
    keptAt?: number;
}

export interface RepairJournalFs {
    existsSync(p: string): boolean;
    readFileSync(p: string, enc: 'utf8'): string;
    writeFileSync(p: string, data: string, enc: 'utf8'): void;
    renameSync(from: string, to: string): void;
    mkdirSync(p: string, o: { recursive: boolean }): void;
    statSync(p: string): { mtimeMs: number };
}

/** The engine's own housekeeping stamp, in ms, or undefined when there is none. */
export function housekeepingAt(
    fs: Pick<RepairJournalFs, 'existsSync' | 'statSync'>,
    dir: string,
    stamp: string | undefined
): number | undefined {
    if (!stamp) { return undefined; }
    const p = dir.replace(/[\\/]+$/, '') + '/' + stamp;
    try { return fs.existsSync(p) ? fs.statSync(p).mtimeMs : undefined; } catch { return undefined; }
}

/**
 * The rows a finished `completeSlot` has to say out loud. Only clauses whose
 * repair RAN are events; a slot that was already whole produces none, which is
 * what keeps the journal small enough to read.
 */
export function repairEvents(
    after: SlotCompleteness,
    meta: { slotId: string; engine: string; gate: string; at: number; keptAt?: number }
): SlotRepairEvent[] {
    return after.rows
        .filter(r => r.wrote !== undefined)
        .map(r => {
            const e: SlotRepairEvent = {
                at: meta.at, slotId: meta.slotId, engine: meta.engine, gate: meta.gate,
                clause: r.id, was: r.was ?? r.detail, fixed: !!r.wrote
            };
            if (r.error) { e.error = r.error; }
            if (meta.keptAt !== undefined) { e.keptAt = meta.keptAt; }
            return e;
        });
}

export interface RepairPatternRow {
    clause: string;
    /** how many repairs of this clause the journal holds */
    count: number;
    /** the slots it has happened on */
    slots: string[];
    first: number;
    last: number;
    /**
     * How many of those repairs could be compared with the one before it on the
     * same slot — the denominator, stated so the figure beside it can be read.
     */
    compared: number;
    /**
     * …and how many of THOSE followed a housekeeping run the slot had not seen
     * at its previous repair. `afterHousekeeping === compared` is the engine's
     * own cleanup doing it, every time, with nothing declared to say so.
     */
    afterHousekeeping: number;
}

export function repairPattern(events: readonly SlotRepairEvent[]): RepairPatternRow[] {
    const byClause = new Map<string, SlotRepairEvent[]>();
    for (const e of [...events].sort((a, b) => a.at - b.at)) {
        const list = byClause.get(e.clause);
        if (list) { list.push(e); } else { byClause.set(e.clause, [e]); }
    }
    const rows: RepairPatternRow[] = [];
    for (const [clause, list] of byClause) {
        const prevKept = new Map<string, number | undefined>();
        const seenSlot = new Set<string>();
        let compared = 0, after = 0;
        for (const e of list) {
            if (seenSlot.has(e.slotId)) {
                compared++;
                const before = prevKept.get(e.slotId);
                if (e.keptAt !== undefined && (before === undefined || e.keptAt > before)) { after++; }
            }
            seenSlot.add(e.slotId);
            prevKept.set(e.slotId, e.keptAt);
        }
        rows.push({
            clause, count: list.length, slots: [...new Set(list.map(e => e.slotId))],
            first: list[0].at, last: list[list.length - 1].at, compared, afterHousekeeping: after
        });
    }
    return rows.sort((a, b) => b.count - a.count || a.clause.localeCompare(b.clause));
}

const SCHEMA = 1;
const KEEP = 500;

/**
 * The journal on disk. Deliberately dumber than `MissionOutcomeStore`: this is
 * evidence about the machine, not the user's own work, so a file that cannot be
 * read is set aside and measurement starts again rather than freezing every
 * write until a person deals with it. Losing a week of repair rows costs a
 * diagnosis that the next week reproduces; refusing to write costs the next
 * diagnosis outright.
 */
export class SlotRepairJournal {
    private events: SlotRepairEvent[] = [];
    private loaded = false;
    private note?: string;

    constructor(
        private readonly file: string,
        private readonly fs: RepairJournalFs,
        private readonly keep = KEEP
    ) { }

    get degraded(): string | undefined { return this.note; }

    private load(): void {
        if (this.loaded) { return; }
        this.loaded = true;
        if (!this.fs.existsSync(this.file)) { return; }
        try {
            const doc = JSON.parse(this.fs.readFileSync(this.file, 'utf8')) as { v?: number; events?: unknown };
            if (Array.isArray(doc?.events)) { this.events = (doc.events as SlotRepairEvent[]).filter(isRepairEvent); }
            if (typeof doc?.v === 'number' && doc.v > SCHEMA) {
                this.note = 'the repair journal was written by a newer version (schema ' + doc.v
                    + ') - it is read as far as this build understands it';
            }
        } catch (e) {
            const dest = this.file.replace(/\.json$/i, '') + '.corrupt-' + Date.now() + '.json';
            try { this.fs.renameSync(this.file, dest); } catch { /* locked - it will be written over */ }
            this.note = 'the repair journal was unreadable (' + String((e as Error)?.message ?? e)
                + ') - measurement starts from an empty list';
        }
    }

    all(): readonly SlotRepairEvent[] { this.load(); return this.events; }

    /** Nothing to say is the common case and must cost no write. */
    record(events: readonly SlotRepairEvent[]): void {
        if (!events.length) { return; }
        this.load();
        this.events = [...this.events, ...events].slice(-this.keep);
        const dir = this.file.replace(/[\\/][^\\/]*$/, '');
        try { this.fs.mkdirSync(dir, { recursive: true }); } catch { /* already there */ }
        const tmp = this.file + '.writing';
        try {
            this.fs.writeFileSync(tmp, JSON.stringify({ v: SCHEMA, events: this.events }, null, 2), 'utf8');
            this.fs.renameSync(tmp, this.file);
        } catch (e) {
            this.note = 'the repair journal could not be written (' + String((e as Error)?.message ?? e) + ')';
        }
    }
}

function isRepairEvent(v: unknown): v is SlotRepairEvent {
    const e = v as SlotRepairEvent;
    return !!e && typeof e.at === 'number' && typeof e.slotId === 'string'
        && typeof e.clause === 'string' && typeof e.gate === 'string' && typeof e.fixed === 'boolean';
}
