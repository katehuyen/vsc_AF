/**
 * S-67 — the batons on disk (`globalStorage/.../batons.json`).
 *
 * The store pattern `contextGuard.ts` uses: an optional file (absent = memory
 * only, which is every test), a debounced write, a torn file read as an empty
 * one, and `flush()` for a host that is shutting down. Every decision about
 * what a baton may do is `baton.ts`; this only keeps them.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Baton, isLive, pruneBatons } from './baton';
import { ChainLink, linkOf } from './chainMembership';

/** U-168 - how many links of dropped batons are kept: a chain's membership outlives its batons. */
export const LINK_CAP = 3000;

export class BatonStore {
    private batons = new Map<string, Baton>();
    /** U-168 - the thin link of every finished baton the cap dropped */
    private archived: ChainLink[] = [];
    private saveTimer: NodeJS.Timeout | undefined;

    constructor(private readonly storeFile?: string) {
        this.load();
    }

    all(): Baton[] {
        return [...this.batons.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    }

    get(id: string): Baton | undefined { return this.batons.get(String(id ?? '').trim()); }

    /** The live baton a session left, if any — at most one survives a pass. */
    liveFrom(sessionId: string): Baton | undefined {
        const sid = String(sessionId ?? '').trim();
        return this.all().find(b => b.from.sessionId === sid && isLive(b));
    }

    /** U-163 - every chain link: the kept batons' and the dropped ones' */
    links(): ChainLink[] {
        return [...this.archived, ...this.all().map(linkOf)];
    }

    chain(chainId: string): Baton[] {
        return this.all().filter(b => b.chainId === chainId).sort((a, b) => a.hop - b.hop);
    }

    put(...list: Baton[]): void {
        for (const b of list) { if (b && b.id) { this.batons.set(b.id, b); } }
        this.changed();
    }

    /** S-127 — a record for a chain the cap dropped every baton of: its links are all that is left to write to. */
    putLink(link: ChainLink): void {
        this.archived = [link, ...this.archived].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, LINK_CAP);
        this.changed();
    }

    private changed(): void {
        this.save();
        for (const fn of this.listeners) { try { fn(); } catch { /* a surface's redraw never stops a write */ } }
    }

    private readonly listeners: (() => void)[] = [];

    /** S-77 — the surfaces that draw the relay redraw on every change. */
    onDidChange(fn: () => void): { dispose(): void } {
        this.listeners.push(fn);
        return { dispose: () => { const i = this.listeners.indexOf(fn); if (i >= 0) { this.listeners.splice(i, 1); } } };
    }

    private load(): void {
        const f = this.storeFile;
        if (!f || !fs.existsSync(f)) { return; }
        try {
            const raw = JSON.parse(fs.readFileSync(f, 'utf8')) as { batons?: Baton[]; links?: ChainLink[] };
            this.archived = (raw.links ?? []).filter(l => l && typeof l.chainId === 'string' && typeof l.from === 'string');
            for (const b of raw.batons ?? []) {
                if (b && typeof b.id === 'string' && b.id && b.from && typeof b.from.sessionId === 'string') {
                    this.batons.set(b.id, b);
                }
            }
        } catch { /* a torn store is an empty one */ }
    }

    private write(): void {
        const f = this.storeFile;
        const kept = pruneBatons(this.all());
        const keep = new Set(kept.map(b => b.id));
        const dropped = this.all().filter(b => !keep.has(b.id)).map(linkOf);
        if (dropped.length) {
            this.archived = [...this.archived, ...dropped].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, LINK_CAP);
        }
        this.batons = new Map(kept.map(b => [b.id, b]));
        if (!f) { return; }
        try {
            fs.mkdirSync(path.dirname(f), { recursive: true });
            fs.writeFileSync(f, JSON.stringify({ batons: kept, links: this.archived }, null, 1), 'utf8');
        } catch { /* the next change writes again */ }
    }

    private save(): void {
        if (!this.storeFile || this.saveTimer) { return; }
        this.saveTimer = setTimeout(() => { this.saveTimer = undefined; this.write(); }, 250);
        if (typeof this.saveTimer.unref === 'function') { this.saveTimer.unref(); }
    }

    /** Write now, for a host that is shutting down. */
    flush(): void {
        if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = undefined; }
        this.write();
    }
}
