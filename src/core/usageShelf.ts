/**
 * ‼️ U-160 — ONE READING PER TOKEN, KNOWN TO EVERY READER THE MOMENT IT LANDS.
 *
 * `PlanUsageService` (the toolbar indicator) and `AccountUsageService` (the
 * account boxes, the Accounts page) ask the same endpoint about the same
 * credentials file, and X-240 already made them share its FLOOR through
 * `UsageGate`. They did not share the ANSWER: after the accounts service read
 * the standing sign-in, the gate told the indicator "this token was just read"
 * and the indicator served its own figure from before that read — the console
 * box said 54% while the toolbar said 37%, for as long as the floor lasted.
 *
 * So the answer is shelved here, keyed like the gate, and every surface asks
 * for the newer of its own reading and this one. A reading that ANSWERED is the
 * only kind shelved: a refusal is about the request that met it, not about the
 * account. Pure — no timers, no vscode.
 */
import { tokenKey } from './usageGate';
import type { PlanUsageSnapshot } from './planusage';

export type UsageShelfListener = (file: string, snap: PlanUsageSnapshot, from: string) => void;

export class UsageShelf {
    private byToken = new Map<string, PlanUsageSnapshot>();
    private listeners = new Set<UsageShelfListener>();

    /** Shelve a reading; true when it is now the newest for its token. `from` names the reader that took it. */
    put(file: string, snap: PlanUsageSnapshot, from = ''): boolean {
        if (!file || snap.state !== 'ok') { return false; }
        const key = tokenKey(file);
        const had = this.byToken.get(key);
        if (had && had.fetchedAt >= snap.fetchedAt) { return false; }
        this.byToken.set(key, snap);
        for (const fn of [...this.listeners]) {
            try { fn(file, snap, from); } catch { /* one surface failing to redraw never loses the reading */ }
        }
        return true;
    }

    latest(file: string): PlanUsageSnapshot | undefined {
        return file ? this.byToken.get(tokenKey(file)) : undefined;
    }

    /** Told of every reading that became the newest for its token; returns the unsubscribe. */
    onReading(fn: UsageShelfListener): () => void {
        this.listeners.add(fn);
        return () => { this.listeners.delete(fn); };
    }
}

/** The newer of two readings of one token — the one a surface should draw. */
export function newerReading<T extends { fetchedAt: number }>(a: T | undefined, b: T | undefined): T | undefined {
    if (!a) { return b; }
    if (!b) { return a; }
    return b.fetchedAt > a.fetchedAt ? b : a;
}
