/**
 * ‼️ X-427 — A RELAY LEG WHOSE ENGINE FAILED IS NEVER LEFT TO STALL.
 *
 * The failsafe (S-83) judges a leg when it ENDS; a Console turn that fails on
 * the engine's side ends nothing — the card sits idle on a failed turn, and the
 * chain waited for ever. This watches the running legs' cards at turn end and
 * answers by the fault's kind (engineFault.ts):
 *   flagged — the conversation is refused, and the agent may be unable to
 *             pass: Agent Farm writes the baton FOR it (the failsafe's rescue,
 *             same door, same brakes), and the ender closes the card so the
 *             successor opens on the usual release. A cap on flagged passes in
 *             a row holds the chain for a person instead of looping; from the
 *             second one on, the successor opens on the fallback model if set.
 *   outage / auth — never a new leg (it would fail the same way): the SAME
 *             session is asked to continue at growing intervals, up to a
 *             ceiling; past it, a person is asked (Needs You).
 * The decision is pure; the class keeps each episode and applies the order.
 */
import { Baton, openerOf } from './baton';
import { classifyEngineFault, EngineFault } from './engineFault';
import { isSeal } from './batonSeal';
import type { NeedItem } from './needs';

export const FAULT_WAIT_DEFAULT_HOURS = 24;
export const FLAGGED_PASSES_DEFAULT = 3;
/** The first nudge after a failed turn; each next one waits twice as long, up to the step cap. */
const FIRST_NUDGE_MS = 60_000;
const NUDGE_STEP_CAP_MS = 60 * 60_000;

export interface FaultOpts {
    /** how long the same session is asked again before a person is; 0 = no ceiling */
    waitMs: number;
    /** flagged passes in a row before the chain holds for a person; 0 = no cap of its own */
    maxFlagged: number;
    /** the model a successor opens on from the second flagged pass in a row; '' = the chain's own */
    flaggedModel: string;
}

/** A Console card as the watch reads it. */
export interface FaultCard {
    id: string;
    sessionId: string;
    status: string;
    queued: number;
    asking: boolean;
    lastTurn?: { endedAt: number; outcome: string };
    /** faultText() of its messages */
    text: string;
}

export interface FaultEpisode {
    sessionId: string;
    cardId: string;
    chainId: string;
    leg: number;
    kind: Exclude<EngineFault['kind'], 'none'>;
    said: string;
    /** when the engine last worked for this leg — the ceiling counts from here */
    since: number;
    nudges: number;
    lastNudgeAt?: number;
    nextAt?: number;
    state: 'waiting' | 'passed' | 'held' | 'gave-up';
    why: string;
}

export type FaultOrder =
    | { act: 'none'; why: string }
    | { act: 'clear'; why: string }
    | { act: 'pass'; why: string; fault: EngineFault; model?: string }
    | { act: 'hold' | 'give-up'; why: string; fault: EngineFault }
    | { act: 'nudge' | 'wait'; why: string; fault: EngineFault; at: number; since: number };

export function nudgeDelay(nudges: number): number {
    return Math.min(NUDGE_STEP_CAP_MS, FIRST_NUDGE_MS * 2 ** Math.max(0, Math.min(nudges, 12)));
}

/** Flagged passes in a row at the tail of the chain (the hop that opened the running leg included). */
export function flaggedStreak(list: readonly Baton[], chainId: string): number {
    const tail = list.filter(b => b.chainId === chainId && !isSeal(b)).sort((a, b) => b.hop - a.hop);
    let n = 0;
    for (const b of tail) { if (b.fault !== 'flagged') { break; } n++; }
    return n;
}

const span = (ms: number): string => (ms < 3_600_000 ? `${Math.max(1, Math.round(ms / 60_000))} min` : `${Math.round(ms / 3_600_000)} h`);

export function faultOrder(i: {
    card: FaultCard; list: readonly Baton[]; episode?: FaultEpisode; now: number; opts: FaultOpts;
}): FaultOrder {
    const { card, list, episode: ep, now, opts } = i;
    const sid = card.sessionId;
    const opener = openerOf(list, sid);
    if (!opener) { return { act: 'none', why: 'not a relay leg' }; }
    if (list.some(b => b.from.sessionId === sid && !isSeal(b))) { return { act: 'none', why: 'the leg has passed the baton' }; }
    if (card.status !== 'idle' || card.asking || card.queued > 0 || !card.lastTurn) { return { act: 'none', why: 'the card is not at rest on a finished turn' }; }
    const fault = card.lastTurn.outcome === 'failed' ? classifyEngineFault(card.text) : { kind: 'none' as const, said: '' };
    if (fault.kind === 'none') {
        return ep ? { act: 'clear', why: card.lastTurn.outcome === 'failed' ? 'its last turn failed on something other than the engine' : 'its last turn went through' }
            : { act: 'none', why: 'no engine fault' };
    }
    const leg = opener.hop + 1;
    if (fault.kind === 'flagged') {
        if (ep?.kind === 'flagged') { return { act: 'none', why: `already ${ep.state}` }; }
        const streak = flaggedStreak(list, opener.chainId);
        if (opts.maxFlagged > 0 && streak >= opts.maxFlagged) {
            return { act: 'hold', fault, why: `the engine flagged leg ${leg}, and ${streak} flagged pass${streak === 1 ? '' : 'es'} in a row already reached the cap (${opts.maxFlagged}) — the chain waits for you` };
        }
        const model = streak >= 1 && opts.flaggedModel ? opts.flaggedModel : undefined;
        return { act: 'pass', fault, ...(model ? { model } : {}), why: `the engine flagged leg ${leg}'s conversation and answers nothing more in it — Agent Farm passes the baton for it${model ? ` (the successor opens on ${model})` : ''}` };
    }
    const since = ep && ep.kind !== 'flagged' ? ep.since : card.lastTurn.endedAt;
    if (opts.waitMs > 0 && now - since >= opts.waitMs) {
        return ep?.state === 'gave-up' ? { act: 'none', why: 'already past the ceiling' }
            : { act: 'give-up', fault, why: `the engine has failed leg ${leg} for ${span(now - since)} — past the ${span(opts.waitMs)} ceiling, Agent Farm stops asking and waits for you` };
    }
    const nudges = ep && ep.kind !== 'flagged' ? ep.nudges : 0;
    const at = Math.max(card.lastTurn.endedAt, ep?.lastNudgeAt ?? 0) + nudgeDelay(nudges);
    const what = fault.kind === 'auth' ? 'the engine refuses the sign-in' : 'the engine is down or overloaded';
    return now >= at
        ? { act: 'nudge', fault, at, since, why: `${what} — leg ${leg} is asked to continue (attempt ${nudges + 1})` }
        : { act: 'wait', fault, at, since, why: `${what} — leg ${leg} waits; the same session is asked again in ${span(at - now)}, no new leg is opened` };
}

/** What the leg is told when it is asked again — to the agent, so English. */
export function nudgeText(f: EngineFault, attempt: number): string {
    return `Agent Farm: your last turn failed on the engine's side (${f.kind}: ${f.said}). `
        + `This is attempt ${attempt} to continue: pick up exactly where you stopped.`;
}

/** Needs You: only the episodes a person must act on (the admission test in needs.ts). */
export function faultNeedItems(list: readonly FaultEpisode[], urgency: number): NeedItem[] {
    return list.filter(e => e.kind === 'auth' || e.state === 'held' || e.state === 'gave-up').map(e => ({
        urgency, kind: 'engine-fault' as const, agentName: `chain ${e.chainId.slice(-6)}`,
        title: e.state === 'held' ? `Leg ${e.leg} flagged again — the chain holds for you`
            : e.kind === 'auth' ? `Leg ${e.leg}: the engine refuses the sign-in` : `Leg ${e.leg}: the engine is still down`,
        // U-118 — the row is a line; the engine's own words are the opened body
        detail: e.why.length > 140 ? e.why.slice(0, 139) + '…' : e.why,
        body: `${e.why}\n\n${e.said}`,
        ts: e.since,
        ref: { consoleId: e.cardId, sessionId: e.sessionId },
        actions: [{ id: 'open-console', label: 'Open the session' }]
    }));
}

export interface FaultWatchDeps {
    batons: () => readonly Baton[];
    cards: () => FaultCard[];
    opts: () => FaultOpts;
    /** the mechanical pass (LegEndWatch.enginePass); resolves to the baton it wrote */
    pass: (sessionId: string, why: string, model?: string) => Promise<Baton | undefined>;
    /** say it into the same session; false = it could not be sent */
    nudge: (cardId: string, text: string) => boolean;
    say: (title: string, body: string, key: string, level: 1 | 2 | 3, type: 'info' | 'warning') => void;
    changed?: () => void;
    log?: (line: string) => void;
    now?: () => number;
}

export class EngineFaultWatch {
    private readonly episodes = new Map<string, FaultEpisode>();

    constructor(private readonly deps: FaultWatchDeps) { }

    list(): FaultEpisode[] { return [...this.episodes.values()]; }

    check(): FaultOrder[] {
        const now = (this.deps.now ?? Date.now)();
        const list = this.deps.batons();
        const opts = this.deps.opts();
        const orders: FaultOrder[] = [];
        let moved = false;
        const seen = new Set<string>();
        for (const card of this.deps.cards()) {
            if (!card.sessionId) { continue; }
            seen.add(card.sessionId);
            const ep = this.episodes.get(card.sessionId);
            let o: FaultOrder;
            try { o = faultOrder({ card, list, episode: ep, now, opts }); } catch { continue; }
            orders.push(o);
            if (o.act === 'none') { continue; }
            if (o.act === 'wait' && ep && ep.state === 'waiting' && ep.kind === o.fault.kind) { ep.nextAt = o.at; ep.why = o.why; continue; }
            moved = true;
            this.apply(card, list, ep, o, now);
        }
        for (const sid of [...this.episodes.keys()]) { if (!seen.has(sid)) { this.episodes.delete(sid); moved = true; } }
        if (moved) { try { this.deps.changed?.(); } catch { /* best effort */ } }
        return orders;
    }

    private apply(card: FaultCard, list: readonly Baton[], ep: FaultEpisode | undefined, o: FaultOrder, now: number): void {
        const sid = card.sessionId;
        const opener = openerOf(list, sid)!;
        const chain = opener.chainId;
        const tag = `baton leg ${sid.slice(0, 8)} (chain ${chain})`;
        if (o.act === 'clear' || o.act === 'none') {
            this.episodes.delete(sid);
            if (o.act === 'clear' && ep && ep.kind !== 'flagged') {
                this.say(`Engine back — chain ${chain} leg ${ep.leg} goes on`, `${o.why}; the same session carries on after ${ep.nudges} attempt(s).`, `fault:${sid}:back`, 1, 'info');
            }
            this.log(`${tag}: ${o.why}`);
            return;
        }
        const base: FaultEpisode = {
            sessionId: sid, cardId: card.id, chainId: chain, leg: opener.hop + 1, kind: o.fault.kind as FaultEpisode['kind'],
            said: o.fault.said, since: 'since' in o ? o.since : card.lastTurn?.endedAt ?? now,
            nudges: ep && ep.kind !== 'flagged' && o.fault.kind !== 'flagged' ? ep.nudges : 0,
            ...(ep?.lastNudgeAt && o.fault.kind !== 'flagged' ? { lastNudgeAt: ep.lastNudgeAt } : {}),
            state: 'waiting', why: o.why
        };
        this.log(`${tag}: ${o.why}`);
        if (o.act === 'pass') {
            this.episodes.set(sid, { ...base, state: 'passed' });
            const failed = (why: string): void => {
                this.log(`${tag}: ${why}`);
                this.episodes.set(sid, { ...base, state: 'held', why });
                this.say(`Relay held — chain ${chain}`, `${why}.\n\n${o.fault.said}`, `fault:${sid}:nopass`, 2, 'warning');
                try { this.deps.changed?.(); } catch { /* best effort */ }
            };
            void this.deps.pass(sid, `${o.why} ("${o.fault.said}")`, o.model).then(b => {
                if (b) { this.log(`${tag}: baton ${b.id} ${b.state}`); } else { failed(`the engine flagged leg ${base.leg}, but the mechanical pass wrote no baton`); }
            }).catch(e => failed(`the engine flagged leg ${base.leg}, and the mechanical pass failed: ${String((e as Error)?.message ?? e)}`));
            return;
        }
        if (o.act === 'hold' || o.act === 'give-up') {
            this.episodes.set(sid, { ...base, state: o.act === 'hold' ? 'held' : 'gave-up' });
            this.say(o.act === 'hold' ? `Relay held — chain ${chain} flagged again` : `Engine still down — chain ${chain} waits for you`,
                `${o.why}.\n\n${o.fault.said}\n\nNeeds You has a row that opens the session.`, `fault:${sid}:${o.act}`, 2, 'warning');
            return;
        }
        if (!ep) {
            this.say(`Engine fault — chain ${chain} leg ${base.leg} waits`,
                `${o.why}.\n\n${o.fault.said}\n\nNo new leg is opened while the engine fails; the same session is asked again at growing intervals. baton.faults shows where it stands.`,
                `fault:${sid}:start`, 1, 'info');
        }
        if (o.act === 'wait') { this.episodes.set(sid, { ...base, nextAt: o.at }); return; }
        const attempt = base.nudges + 1;
        let sent = false;
        try { sent = this.deps.nudge(card.id, nudgeText(o.fault, attempt)); } catch { sent = false; }
        this.episodes.set(sid, { ...base, nudges: attempt, lastNudgeAt: now, nextAt: now + nudgeDelay(attempt), why: sent ? o.why : `${o.why} — the nudge could not be sent` });
    }

    private say(title: string, body: string, key: string, level: 1 | 2 | 3, type: 'info' | 'warning'): void {
        try { this.deps.say(title, body, key, level, type); } catch { /* best effort */ }
    }

    private log(line: string): void { try { this.deps.log?.(line); } catch { /* best effort */ } }
}
