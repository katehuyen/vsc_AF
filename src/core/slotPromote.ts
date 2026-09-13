import * as path from 'path';
import { EngineAuthAdapter, liveSource } from './engineAccounts';
import { JsonJournal } from './jsonJournal';
import {
    isJsonObject, mergeBase, parseOwnedFile, promotable, promoteOwned, Promotion
} from './keyOwnership';

/**
 * ‼️ X-291 — THE RETURN LEG: what a slot session answered, carried back to the
 * fleet at the next gate.
 *
 * Every other clause of the birth contract runs one way, fleet → slot, because
 * everything a slot holds belongs to the fleet (X-270). A permission is the one
 * exception and it took a user decision to say so: the approval a person gives
 * a terminal prompt inside a slot session is THEIRS, not that account's, and
 * under `fleet` it was deleted at the next gate with nothing said. Switching
 * account then asked the same question again, for ever.
 *
 * ‼️ WHAT IT DOES NOT DO. It promotes `merge` keys and nothing else — no
 * scalar, no MCP server definition, no sign-in — and only inside entries the
 * fleet already has (`promotable` says why). It never asks: the user decided a
 * promotion is automatic at the gate, on the grounds that they had already
 * answered the question once. Automatic is not silent — every promotion is a
 * row in the journal and a badge on the card (Principle 1).
 *
 * ‼️ THE BASE IS WHAT MAKES IT A MERGE. Without the value both sides converged
 * on last time, the fleet deleting an approval and a slot adding one look the
 * same, and the return leg would resurrect every permission the user revoked.
 * The base is kept beside the journal, never inside a slot: a slot is an
 * identity and carries the least possible.
 */

export interface PromotionEvent {
    at: number;
    slotId: string;
    engine: string;
    /** which gate ran it: `start` · `capture` · `launch` · `press` · `ask` */
    gate: string;
    /** the slot-relative file it came out of, e.g. `.claude.json` */
    file: string;
    /** the key path, e.g. `projects[D:\repo].allowedTools` */
    path: string;
    /** what the fleet gained, in the words the engine wrote */
    added: string[];
    /** why nothing could be written; absent when it went through */
    error?: string;
}

export function isPromotionEvent(v: unknown): v is PromotionEvent {
    const e = v as PromotionEvent;
    return !!e && typeof e.at === 'number' && typeof e.slotId === 'string'
        && typeof e.file === 'string' && typeof e.path === 'string' && Array.isArray(e.added);
}

export class PromotionJournal extends JsonJournal<PromotionEvent> {
    constructor(file: string, fs: ConstructorParameters<typeof JsonJournal>[1], keep?: number) {
        super(file, fs, isPromotionEvent, 'promotion journal', keep);
    }
}

export interface PromotionPatternRow {
    file: string;
    path: string;
    /** how many items this path has ever handed to the fleet */
    added: number;
    /** the slots they came from */
    slots: string[];
    last: number;
}

/** What the card shows: one row per key path, newest first by weight. */
export function promotionPattern(events: readonly PromotionEvent[]): PromotionPatternRow[] {
    const by = new Map<string, PromotionPatternRow>();
    for (const e of events) {
        if (e.error) { continue; }
        const id = e.file + '|' + e.path;
        const row = by.get(id);
        if (row) {
            row.added += e.added.length;
            if (!row.slots.includes(e.slotId)) { row.slots.push(e.slotId); }
            if (e.at > row.last) { row.last = e.at; }
        } else {
            by.set(id, { file: e.file, path: e.path, added: e.added.length, slots: [e.slotId], last: e.at });
        }
    }
    return [...by.values()].sort((a, b) => b.added - a.added || a.path.localeCompare(b.path));
}

/**
 * The merge base on disk: per slot, per owned file, the value both sides
 * converged on at the end of the previous gate. Only `merge` keys are in it —
 * a base that copied the whole file would be a second identity store.
 */
export interface KeyBaseFs {
    existsSync(p: string): boolean;
    readFileSync(p: string, enc: 'utf8'): string;
    writeFileSync(p: string, data: string, enc: 'utf8'): void;
    renameSync(from: string, to: string): void;
    mkdirSync(p: string, o: { recursive: boolean }): void;
}

type Obj = Record<string, unknown>;

export class KeyBaseStore {
    private slots: Record<string, Record<string, Obj>> = {};
    private loaded = false;

    constructor(private readonly file: string, private readonly fs: KeyBaseFs) { }

    private load(): void {
        if (this.loaded) { return; }
        this.loaded = true;
        if (!this.fs.existsSync(this.file)) { return; }
        try {
            const doc = JSON.parse(this.fs.readFileSync(this.file, 'utf8')) as { slots?: unknown };
            if (doc && typeof doc.slots === 'object' && doc.slots) {
                this.slots = doc.slots as Record<string, Record<string, Obj>>;
            }
        } catch { this.slots = {}; }
    }

    /**
     * ‼️ NO BASE IS AN EMPTY BASE, NEVER THE FLEET'S VALUE. A machine meeting
     * this for the first time has slots the old `fleet` policy equalised at the
     * last gate, so the slot holds nothing the fleet does not and an empty base
     * promotes nothing. Seeding it with the fleet's value would instead make
     * every slot-side approval look like a revocation and delete it — the fault
     * being repaired, on the one pass nobody would look at.
     */
    get(slotId: string, file: string): Obj {
        this.load();
        const v = this.slots[slotId]?.[file];
        return v && typeof v === 'object' ? v : {};
    }

    set(slotId: string, file: string, value: Obj): void {
        this.load();
        const held = this.slots[slotId] ?? (this.slots[slotId] = {});
        if (JSON.stringify(held[file]) === JSON.stringify(value)) { return; }
        held[file] = value;
        this.write();
    }

    /** A slot that is gone takes its base with it — nothing outlives the account it describes. */
    forget(slotId: string): void {
        this.load();
        if (!(slotId in this.slots)) { return; }
        delete this.slots[slotId];
        this.write();
    }

    private write(): void {
        const dir = this.file.replace(/[\\/][^\\/]*$/, '');
        try { this.fs.mkdirSync(dir, { recursive: true }); } catch { /* already there */ }
        const tmp = this.file + '.writing';
        try {
            this.fs.writeFileSync(tmp, JSON.stringify({ v: 1, slots: this.slots }, null, 2), 'utf8');
            this.fs.renameSync(tmp, this.file);
        } catch { /* a base that cannot be written costs a promotion, never a gate */ }
    }
}

export interface PromoteFs extends KeyBaseFs { }

export interface PromoteContext {
    fs: PromoteFs;
    home: string;
    /** the slot folder */
    dir: string;
    slotId: string;
    adapter: EngineAuthAdapter;
    base: KeyBaseStore;
}

export interface PromoteResult {
    file: string;
    /** what would go / went to the fleet */
    promotions: Promotion[];
    /** true when the fleet's own file was rewritten */
    wrote: boolean;
    error?: string;
}

/**
 * Carry one slot's new answers back to the fleet, then record the value both
 * sides now agree on as the next base.
 *
 * ‼️ THE BASE IS RECORDED EVEN WHEN NOTHING WAS PROMOTED, because the base is
 * not "what we promoted" but "what both sides last agreed on" — the gate that
 * finds them already equal is exactly the one whose agreement a later
 * revocation has to be measured against.
 *
 * `dryRun` reports and touches nothing, including the base.
 */
export function promoteFromSlot(ctx: PromoteContext, dryRun = false): PromoteResult[] {
    const out: PromoteResult[] = [];
    for (const [name, own] of Object.entries(ctx.adapter.ownership ?? {})) {
        const row: PromoteResult = { file: name, promotions: [], wrote: false };
        try {
            const slotPath = path.join(ctx.dir, name);
            const fleetPath = path.join(ctx.home, liveSource(ctx.adapter.engine, name));
            const slotText = ctx.fs.existsSync(slotPath) ? ctx.fs.readFileSync(slotPath, 'utf8') : undefined;
            const fleetText = ctx.fs.existsSync(fleetPath) ? ctx.fs.readFileSync(fleetPath, 'utf8') : undefined;
            // ‼️ NEITHER SIDE IS GUESSED AT. A slot with no file has answered
            // nothing, and a fleet file that is not a JSON object is one a
            // rewrite would destroy — the same refusal the `keys:` clause makes
            // in the other direction.
            if (!isJsonObject(slotText)) { out.push(row); continue; }
            if (fleetText !== undefined && !isJsonObject(fleetText)) {
                row.error = `${name} on the fleet's side is not a JSON object`;
                out.push(row);
                continue;
            }
            const fleet = parseOwnedFile(fleetText);
            const slot = parseOwnedFile(slotText);
            const base = ctx.base.get(ctx.slotId, name);
            row.promotions = promotable(own, fleet, slot, base);
            const next = promoteOwned(own, fleet, slot, base);
            const text = JSON.stringify(next, null, 2) + '\n';
            if (row.promotions.length && fleetText !== text) {
                row.wrote = true;
                if (!dryRun) { writeAtomic(ctx.fs, fleetPath, text); }
            }
            if (!dryRun) { ctx.base.set(ctx.slotId, name, mergeBase(own, next)); }
        } catch (e) {
            row.error = String((e as Error)?.message ?? e);
        }
        out.push(row);
    }
    return out;
}

/**
 * ‼️ THE FLEET'S OWN FILE IS WRITTEN WHOLE OR NOT AT ALL. `~/.claude.json` is
 * rewritten by every Claude process the user starts outside a slot, so a torn
 * file here would cost them their sign-in and every folder trust in it. A
 * rename over the target is the cheapest thing that cannot half-happen.
 */
function writeAtomic(fs: PromoteFs, target: string, text: string): void {
    const tmp = target + '.writing';
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, target);
}

/** The rows a finished promotion pass has to say out loud — nothing promoted is no event. */
export function promotionEvents(
    results: readonly PromoteResult[],
    meta: { slotId: string; engine: string; gate: string; at: number }
): PromotionEvent[] {
    const out: PromotionEvent[] = [];
    for (const r of results) {
        for (const p of r.promotions) {
            const e: PromotionEvent = {
                at: meta.at, slotId: meta.slotId, engine: meta.engine, gate: meta.gate,
                file: r.file, path: p.path, added: p.added
            };
            if (r.error) { e.error = r.error; }
            out.push(e);
        }
        if (r.error && !r.promotions.length) {
            out.push({
                at: meta.at, slotId: meta.slotId, engine: meta.engine, gate: meta.gate,
                file: r.file, path: '', added: [], error: r.error
            });
        }
    }
    return out;
}
