/**
 * X-536 — WHERE THE MANUAL FAILED AN AGENT, KEPT SO SOMEBODY CAN FIX IT.
 *
 * Principle 1 for documentation: a manual that silently fails its readers is
 * not a manual. Three moments are recorded, locally and nowhere else:
 * - `unknown-op`  an agent called an op that does not exist (with the names it was offered)
 * - `weak-find`   farm.find had no confident answer
 * - `no-guide`    farm.guide was asked for an id that does not exist
 * af.js appends the same lines from the agent's side (it answers the reads
 * locally), so both writers share one bounded JSONL file in the bridge folder.
 * `manual.gaps` reads and clears it; Insights can surface the count.
 */

import * as fs from 'fs';
import * as path from 'path';

export const GAPS_FILE = 'manual-gaps.jsonl';
const KEEP = 500;

export type GapKind = 'unknown-op' | 'weak-find' | 'no-guide';

export interface ManualGap {
    ts: number;
    kind: GapKind;
    what: string;
    near?: string[];
    session?: string;
}

export function gapsPath(bridgeDir: string): string {
    return path.join(bridgeDir, GAPS_FILE);
}

export function appendGap(bridgeDir: string, gap: ManualGap): void {
    const file = gapsPath(bridgeDir);
    try {
        fs.mkdirSync(bridgeDir, { recursive: true });
        fs.appendFileSync(file, JSON.stringify(gap) + '\n', 'utf8');
        // Trim now and then rather than on every line: an append must stay cheap.
        const size = fs.statSync(file).size;
        if (size > 256 * 1024) {
            const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(-KEEP);
            fs.writeFileSync(file, rows.join('\n') + '\n', 'utf8');
        }
    } catch { /* a gap that cannot be recorded must never fail the call that found it */ }
}

export function readGaps(bridgeDir: string, limit = 100): ManualGap[] {
    let text = '';
    try { text = fs.readFileSync(gapsPath(bridgeDir), 'utf8'); } catch { return []; }
    const out: ManualGap[] = [];
    for (const line of text.split('\n')) {
        if (!line.trim()) { continue; }
        try {
            const g = JSON.parse(line) as ManualGap;
            if (g && typeof g.what === 'string' && typeof g.kind === 'string') { out.push(g); }
        } catch { /* a torn line from a concurrent append */ }
    }
    return out.slice(-Math.max(1, limit)).reverse();
}

/** The same question asked many times is one gap with a count. */
export function summarizeGaps(gaps: readonly ManualGap[]): { kind: GapKind; what: string; count: number; last: number; near?: string[] }[] {
    const by = new Map<string, { kind: GapKind; what: string; count: number; last: number; near?: string[] }>();
    for (const g of gaps) {
        const key = `${g.kind}\u0000${g.what.toLowerCase()}`;
        const row = by.get(key);
        if (row) { row.count++; row.last = Math.max(row.last, g.ts); } else {
            by.set(key, { kind: g.kind, what: g.what, count: 1, last: g.ts, ...(g.near?.length ? { near: g.near } : {}) });
        }
    }
    return [...by.values()].sort((a, b) => b.count - a.count || b.last - a.last);
}

export function clearGaps(bridgeDir: string): boolean {
    try { fs.unlinkSync(gapsPath(bridgeDir)); return true; } catch { return false; }
}
