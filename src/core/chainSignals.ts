/**
 * S-124 — THE CHAIN BOARD'S ATTENTION SIGNALS, OFF ITS OWN PAGE. The signals
 * chains.list derives (chainBoard.ts) become the Living page's row for relay
 * chains; nothing is re-derived here, so the page, the op and this row cannot
 * disagree. Pure: the board's rows and the clock in, the row out.
 */
import type { ChainRow, SignalKind } from './chainBoard';
import type { LivingSignal } from './living';

const KIND_WORD: Record<SignalKind, string> = {
    hanging: 'hanging', 'stuck-wait': 'stuck waiting', cut: 'cut', fault: 'engine fault', brake: 'brake refused'
};

const LIVE = new Set(['running', 'waiting', 'parked']);

/** One row: warn while any chain carries a signal, ok while chains move, none when there is no live chain. */
export function chainLivingSignals(rows: readonly ChainRow[], now: number): LivingSignal[] {
    const flagged = rows.filter(r => r.signals.length > 0);
    if (!flagged.length) {
        const live = rows.filter(r => LIVE.has(r.bucket)).length;
        return live ? [{
            id: 'chains', label: 'Relay chains moving', state: 'ok',
            detail: `${live} chain(s) running or waiting; none needs you`, goto: 'chains', weight: 10
        }] : [];
    }
    const oldest = Math.min(...flagged.flatMap(r => r.signals.map(s => s.since ?? r.since)));
    const named = flagged.slice(0, 4).map(r => `${r.chainId}: ${[...new Set(r.signals.map(s => KIND_WORD[s.kind]))].join(', ')}`);
    return [{
        id: 'chains', label: 'Relay chains moving', state: 'warn',
        detail: named.join(' · ') + (flagged.length > 4 ? ` · +${flagged.length - 4} more` : ''),
        hint: 'Open the Chains page — Needs attention shows each chain with what its record says.',
        ageMs: Math.max(0, now - oldest), goto: 'chains', weight: 50
    }];
}
