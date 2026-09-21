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

export class BatonStore {
    private batons = new Map<string, Baton>();
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

    chain(chainId: string): Baton[] {
        return this.all().filter(b => b.chainId === chainId).sort((a, b) => a.hop - b.hop);
    }

    put(...list: Baton[]): void {
        for (const b of list) { if (b && b.id) { this.batons.set(b.id, b); } }
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
            const raw = JSON.parse(fs.readFileSync(f, 'utf8')) as { batons?: Baton[] };
            for (const b of raw.batons ?? []) {
                if (b && typeof b.id === 'string' && b.id && b.from && typeof b.from.sessionId === 'string') {
                    this.batons.set(b.id, b);
                }
            }
        } catch { /* a torn store is an empty one */ }
    }

    private write(): void {
        const f = this.storeFile;
        if (!f) { return; }
        const kept = pruneBatons(this.all());
        this.batons = new Map(kept.map(b => [b.id, b]));
        try {
            fs.mkdirSync(path.dirname(f), { recursive: true });
            fs.writeFileSync(f, JSON.stringify({ batons: kept }, null, 1), 'utf8');
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
