import * as fs from 'fs';
import * as path from 'path';
import { BridgeGuardCatch } from './bridgeGuard';

/**
 * B-23 — the bridge guard's refusals, kept on disk. A count that a window
 * reload sets back to zero would say "the rule was kept" about a run that was
 * stopped an hour ago, so the card's chip reads from here and not from memory.
 */

/** Refusals are rare; this many is weeks of them and still a small file. */
export const BRIDGE_GUARD_LOG_CAP = 500;

export class BridgeGuardLog {
    private catches: BridgeGuardCatch[] = [];
    private saveTimer: NodeJS.Timeout | undefined;

    constructor(private readonly file?: string) {
        this.load();
    }

    add(c: BridgeGuardCatch): void {
        this.catches.push(c);
        if (this.catches.length > BRIDGE_GUARD_LOG_CAP) {
            this.catches.splice(0, this.catches.length - BRIDGE_GUARD_LOG_CAP);
        }
        this.save();
    }

    get total(): number { return this.catches.length; }

    /** Newest first. */
    all(limit = BRIDGE_GUARD_LOG_CAP): BridgeGuardCatch[] {
        return [...this.catches].reverse().slice(0, Math.max(0, limit));
    }

    forSession(sessionId: string | undefined): BridgeGuardCatch[] {
        const id = String(sessionId ?? '').trim();
        if (!id) { return []; }
        return this.catches.filter(c => c.sessionId === id);
    }

    private load(): void {
        const f = this.file;
        if (!f || !fs.existsSync(f)) { return; }
        try {
            const raw = JSON.parse(fs.readFileSync(f, 'utf8')) as { catches?: BridgeGuardCatch[] };
            this.catches = (raw.catches ?? [])
                .filter(c => c && typeof c.id === 'string' && typeof c.ts === 'number')
                .slice(-BRIDGE_GUARD_LOG_CAP);
        } catch { /* a torn store is an empty one */ }
    }

    private save(): void {
        if (!this.file || this.saveTimer) { return; }
        this.saveTimer = setTimeout(() => { this.saveTimer = undefined; this.flush(); }, 250);
        if (typeof this.saveTimer.unref === 'function') { this.saveTimer.unref(); }
    }

    /** Write now, for a host that is shutting down. */
    flush(): void {
        if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = undefined; }
        const f = this.file;
        if (!f) { return; }
        try {
            fs.mkdirSync(path.dirname(f), { recursive: true });
            fs.writeFileSync(f, JSON.stringify({ catches: this.catches }, null, 1), 'utf8');
        } catch { /* the next refusal writes again */ }
    }
}
