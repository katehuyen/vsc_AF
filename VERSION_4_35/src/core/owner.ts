// Agent Farm — cross-window ownership lease (B11).
// Cheap mutual exclusion via a small lease file: windows race to claim it, the
// holder renews every few seconds, and a lease older than ttlMs belongs to a
// window that died and can be taken over. Same-instant races are settled by
// re-reading after the write — whoever's write survived owns the lease.
// Pure node (no vscode import) so it is testable and reusable by the service.

import * as fs from 'fs';

export class OwnerLease {
    constructor(
        private file: string,
        readonly id: string,
        private ttlMs: number = 20_000,
        private now: () => number = Date.now
    ) { }

    private read(): { id: string; ts: number } | undefined {
        try {
            const j = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { id?: unknown; ts?: unknown };
            if (j && typeof j.id === 'string' && typeof j.ts === 'number') {
                return { id: j.id, ts: j.ts };
            }
        } catch { /* absent or corrupt = free */ }
        return undefined;
    }

    /** Claim (or renew) the lease. True = this process holds it. */
    tryClaim(): boolean {
        const cur = this.read();
        if (cur && cur.id !== this.id && this.now() - cur.ts < this.ttlMs) { return false; }
        try {
            fs.writeFileSync(this.file, JSON.stringify({ id: this.id, ts: this.now() }), 'utf8');
        } catch { return false; }
        const check = this.read();
        return !!check && check.id === this.id;
    }

    /** Current live holder's id, if any (stale leases count as free). */
    ownerId(): string | undefined {
        const cur = this.read();
        return cur && this.now() - cur.ts < this.ttlMs ? cur.id : undefined;
    }

    /** Free the lease if this process holds it (called on window close). */
    release(): void {
        const cur = this.read();
        if (cur && cur.id === this.id) {
            try { fs.unlinkSync(this.file); } catch { /* gone */ }
        }
    }
}
