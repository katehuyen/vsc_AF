/**
 * S-122 — THE CHAINS PAGE'S DATA: the chain board's rows and chips, and per row
 * what its buttons may do — derived here once, so the page draws and never decides.
 *
 * A button is offered only where its op would accept it (the same preconditions
 * chainControl.ts, pickLive and setLastLeg refuse by), so a press is never
 * answered "nothing to do". A chain the store keeps only as links has no record
 * left to act on: it is shown, never offered a control.
 *
 * Pure: the host hands in the board, the batons, the index and the facts.
 */
import { Baton, isLive, openerOf } from './baton';
import { chainAccountOf } from './chainAccount';
import { leftBy } from './batonLastLeg';
import { BoardCounts, ChainRow, LegFacts, boardCounts, newerRecord } from './chainBoard';
import { lastWords } from './chainControl';
import { pauseChoices } from './chainPauseMenu';
import { LegEnd, legEndOf } from './chainLegEnd';
import type { ChainIndex } from './chainMembership';

export interface ChainActs {
    /** baton.stop — the chain has a waiting or parked baton */
    stop: boolean;
    /** baton.now — the waiting baton to start at once */
    now?: string;
    /** baton.lastLeg — the running leg's session can still be braked (or released) */
    lastLeg: boolean;
    /** baton.setLegs — the chain can still grow, so its ceiling means something */
    legs: boolean;
    /** chains.continue — nothing waits and no leg is working */
    cont: boolean;
    /** chains.end — the chain has not ended */
    end: boolean;
    /** S-143 chains.setAccount — a leg runs or a successor waits at the door, so the next legs' account can be set */
    account: boolean;
    /** S-141 chains.pause — not paused, and the pause menu has a way to pause it */
    pause: boolean;
    /** S-141 chains.resume — paused; the press continues it */
    resume: boolean;
}

/** S-128 — `words`: the chain's newest handover words, so the page's search reaches them */
export interface ChainsRow extends ChainRow { acts: ChainActs; words?: string }

export interface ChainsData {
    generatedAt: number;
    counts: BoardCounts;
    chains: ChainsRow[];
    hangMs: number;
    waitMs: number;
}

const ACTIVE = new Set(['running', 'waiting', 'parked']);

export function chainActs(row: ChainRow, batons: readonly Baton[]): ChainActs {
    if (row.trimmed) { return { stop: false, lastLeg: false, legs: false, cont: false, end: false, account: false, pause: false, resume: false }; }
    const live = batons.filter(b => b.chainId === row.chainId && isLive(b)).sort(newerRecord);
    const active = ACTIVE.has(row.state);
    const runningAt = row.state === 'running' && !!row.sessionId;
    const menu = pauseChoices(row, false);
    return {
        pause: !row.paused && menu.length > 0,
        resume: menu.some(c => c.act === 'resume'),
        stop: live.length > 0,
        ...(live[0] ? { now: live[0].id } : {}),
        lastLeg: runningAt && (row.live === 'working' || row.live === 'idle'),
        legs: active,
        cont: !live.length && (row.state !== 'running' || row.live === 'idle' || row.live === 'gone'),
        end: active,
        account: !!chainAccountOf(batons, row.chainId)?.settable
    };
}

export function chainsPageData(rows: readonly ChainRow[], batons: readonly Baton[], t: { hangMs: number; waitMs: number }, now: number): ChainsData {
    return {
        generatedAt: now,
        counts: boardCounts(rows),
        chains: rows.map(r => {
            const words = lastWords(batons, r.chainId);
            return { ...r, acts: chainActs(r, batons), ...(words ? { words } : {}) };
        }),
        hangMs: t.hangMs,
        waitMs: t.waitMs
    };
}

/** One leg on the row's legs strip: the session, the stretch it ran, what it cost, the words it passed on. */
export interface ChainLegLine {
    leg: number;
    sessionId: string;
    title?: string;
    agentName?: string;
    opened?: number;
    passed?: number;
    firstTs?: number;
    lastTs?: number;
    cost?: number;
    tokens?: number;
    live?: 'working' | 'idle' | 'gone';
    /** the handover words this leg passed to the next (absent: no pass, or the store dropped it) */
    words?: string;
    /** S-128 — why it ended, off its record (chainLegEnd.ts) */
    end?: LegEnd;
    /** S-128 — the account rule it was placed by (its opener's), and the slot it ran on */
    rule?: string;
    account?: string;
}

export function chainLegLines(
    ix: ChainIndex, chainId: string, batons: readonly Baton[], facts: (sessionId: string) => LegFacts | undefined,
    slotOf?: (sessionId: string) => string | undefined
): ChainLegLine[] {
    const chain = ix.byChain.get(chainId);
    if (!chain) { return []; }
    const mine = batons.filter(b => b.chainId === chainId);
    const passes = mine.filter(b => b.hop > 0 && b.prompt).sort(newerRecord);
    return chain.legs.map(l => {
        const f = facts(l.sessionId);
        const words = passes.find(b => b.from.sessionId === l.sessionId)?.prompt;
        const opener = openerOf(mine, l.sessionId);
        const end = legEndOf(leftBy(mine, l.sessionId), opener);
        const slot = slotOf?.(l.sessionId);
        return {
            leg: l.leg, sessionId: l.sessionId,
            ...(f?.title ? { title: f.title } : {}),
            ...(f?.agentName ? { agentName: f.agentName } : {}),
            ...(l.opened !== undefined ? { opened: l.opened } : {}),
            ...(l.passed !== undefined ? { passed: l.passed } : {}),
            ...(f?.firstTs !== undefined ? { firstTs: f.firstTs } : {}),
            ...(f?.lastTs !== undefined ? { lastTs: f.lastTs } : {}),
            ...(f?.cost !== undefined ? { cost: f.cost } : {}),
            ...(f?.tokens !== undefined ? { tokens: f.tokens } : {}),
            ...(f ? { live: f.alive ? (f.idleSince !== undefined ? 'idle' as const : 'working' as const) : 'gone' as const } : {}),
            ...(words ? { words } : {}),
            ...(end ? { end } : {}),
            ...(opener?.want.account ? { rule: opener.want.account } : {}),
            ...(slot ? { account: slot } : {})
        };
    });
}
