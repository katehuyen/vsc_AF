/**
 * S-124 — THE CHAIN BOARD'S ATTENTION SIGNALS, OFF ITS OWN PAGE. The signals
 * chains.list derives (chainBoard.ts) become the Living page's row for relay
 * chains and the notices behind the bell; nothing is re-derived here, so the
 * page, the op, the row and the bell cannot disagree. Pure: the board's rows
 * and the clock in, the row and the notice plan out.
 */
import type { Baton } from './baton';
import type { ChainRow, ChainSignal, SignalKind } from './chainBoard';
import { ChainActs, chainActs } from './chainsPage';
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

/** Source-key prefix of a chain's attention notice: one per chain, signal and leg session. */
export const CHAIN_NOTICE_PREFIX = 'chain-signal:';
/** The one notice naming what already needed attention the first time the bell looked. */
export const CHAIN_NOTICE_CARRIED = 'chain-signals-carried';

/**
 * ‼️ Only the two signals nothing else announces reach the bell. A cut chain, an
 * engine fault and a brake each have their own notice at the moment they happen
 * (batonLegEnd, engineFaultWatch, batonBridge); a second one here would be the
 * same news twice.
 */
const BELL: ReadonlySet<SignalKind> = new Set<SignalKind>(['hanging', 'stuck-wait']);

export interface ChainNotice {
    key: string;
    title: string;
    body: string;
    type: 'warning';
    level: 2;
    tags: string[];
    projectId?: string;
}

export interface ChainNoticePlan {
    post: ChainNotice[];
    /** posted keys whose condition has ended — the notice is withdrawn and the key freed */
    retract: string[];
    /** signals older than this were there before the bell first looked; set on that look and kept */
    baseline: number;
}

export const chainNoticeKey = (chainId: string, kind: SignalKind, sessionId?: string): string =>
    `${CHAIN_NOTICE_PREFIX}${chainId}:${kind}:${String(sessionId ?? '').slice(0, 8)}`;

const sentence = (s: string): string => (s.charAt(0).toUpperCase() + s.slice(1)).replace(/\.?$/, '.');

const CONTROLS: readonly [keyof ChainActs, string][] = [
    ['now', '**⏭ Start now** (the waiting leg opens without waiting)'], ['cont', '**↻ Continue** (a new leg from where it stopped)'],
    ['end', '**■ End chain** (closed on purpose)'], ['stop', '**✕ Stop chain** (no further leg opens)']
];

function noticeOf(r: ChainRow, s: ChainSignal, key: string, acts: ChainActs): ChainNotice {
    const who = `${r.agentName ?? r.chainId}, leg ${r.leg}`;
    const where = `Chain ${r.chainId}${r.title ? ` — ${r.title}` : ''}.`;
    const offered = CONTROLS.filter(([k]) => !!acts[k]).map(([, words]) => words);
    const controls = offered.length ? ` On the Chains page its row has ${offered.join(', ')}.` : ' The Chains page shows its record.';
    const body = `${sentence(s.why)}\n\n${where} It counts as ${s.kind === 'hanging' ? 'hanging after agentFarm.chainHangMinutes' : 'stuck after agentFarm.chainWaitMinutes'}.`
        + `${controls} This notice withdraws itself once ${s.kind === 'hanging' ? 'the chain moves again' : 'the next leg opens'}.`;
    return {
        key, title: `Relay chain ${s.kind === 'hanging' ? 'hanging' : 'stuck waiting'} — ${who}`, body,
        type: 'warning', level: 2, tags: ['chains'], ...(r.projectId ? { projectId: r.projectId } : {})
    };
}

/**
 * ‼️ THE BELL'S SHARE OF THE BOARD. A signal that began after the baseline is
 * one notice, posted once and withdrawn when the board stops showing it; the
 * ones already standing on the first look are named together in a single
 * notice, so turning this on does not bury the bell under old chains.
 */
export function chainSignalNotices(rows: readonly ChainRow[], q: { now: number; baseline?: number; posted: readonly string[]; batons: readonly Baton[] }): ChainNoticePlan {
    const baseline = q.baseline ?? q.now;
    const current = new Set<string>();
    const post: ChainNotice[] = [];
    const carried: string[] = [];
    for (const r of rows) {
        for (const s of r.signals) {
            const key = chainNoticeKey(r.chainId, s.kind, s.sessionId);
            if (!BELL.has(s.kind) || current.has(key)) { continue; }
            current.add(key);
            if ((s.since ?? r.since) < baseline) { carried.push(`- chain ${r.chainId} (${r.agentName ?? 'agent'}, leg ${r.leg}): ${s.why}`); }
            else { post.push(noticeOf(r, s, key, chainActs(r, q.batons))); }
        }
    }
    if (q.baseline === undefined && carried.length) {
        post.push({
            key: CHAIN_NOTICE_CARRIED, type: 'warning', level: 2, tags: ['chains'],
            title: `${carried.length} relay chain(s) already needed attention`,
            body: 'These were already flagged when Agent Farm first looked, so they are named here once rather than one notice each:\n\n'
                + carried.slice(0, 12).join('\n') + (carried.length > 12 ? `\n- … and ${carried.length - 12} more` : '')
                + '\n\nThe Chains page lists them under ⚠ Needs attention, with ↻ Continue and ■ End chain on each row. '
                + 'From now on each new one is announced as it happens and withdrawn when it clears.'
        });
    }
    return { post, retract: q.posted.filter(k => k.startsWith(CHAIN_NOTICE_PREFIX) && !current.has(k)), baseline };
}
