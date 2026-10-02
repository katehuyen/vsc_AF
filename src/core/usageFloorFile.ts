/**
 * X-462 — the floors on disk (usageFloor.ts), so a window reload does not
 * forget what every account was last known to be. One small JSON file in the
 * extension's own storage; a file that is missing or unreadable is a fresh
 * start, never an error.
 */
import * as fs from 'fs';
import { writeAtomicSync } from './atomicFile';
import type { UsageFloor, UsageMemory } from './usageFloor';

function floorFrom(v: unknown): UsageFloor | undefined {
    const f = v as Partial<UsageFloor> | undefined;
    if (!f || typeof f.percent !== 'number' || typeof f.fetchedAt !== 'number') { return undefined; }
    return {
        percent: f.percent, resetsAt: Number(f.resetsAt) || 0,
        bars: Array.isArray(f.bars) ? f.bars : [], fetchedAt: f.fetchedAt,
        ...(f.walled ? { walled: true } : {})
    };
}

export function fileUsageMemory(file: string): UsageMemory {
    return {
        load: () => {
            let raw: unknown;
            try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
            const out: Record<string, UsageFloor> = {};
            for (const [id, v] of Object.entries((raw as { floors?: Record<string, unknown> })?.floors ?? {})) {
                const f = floorFrom(v);
                if (f) { out[id] = f; }
            }
            return out;
        },
        save: floors => { writeAtomicSync(file, JSON.stringify({ version: 1, floors }, null, 1)); }
    };
}
