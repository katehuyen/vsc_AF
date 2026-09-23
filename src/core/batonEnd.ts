/**
 * ‼️ S-86 — A LEG THAT PASSED IS ENDED BY AGENT FARM, NEVER BY ITS OWN HAND.
 *
 * A baton waits for its session to END (two agents in one repo, never). A
 * headless run ends by itself when its turn does; an interactive one does not:
 * a Console card and a terminal TUI sit waiting for the next message, so the
 * baton waited for ever. The first leg only got through because the agent that
 * built the relay knew and closed its own card; the next one followed the rule
 * and locked the chain. So the end is mechanical: once the turn that passed has
 * come to rest — nothing queued, no question open, a few quiet seconds — the
 * session is ended here (a card closed, a registered process killed with its
 * tree, which takes any background command it left behind with it), and the
 * release follows on the usual evidence.
 *
 * The decision is pure; the class only schedules it and applies the order.
 */
import { Baton } from './baton';

/** How long the passing turn must be at rest before its session is ended. */
export const BATON_END_SETTLE_MS = 10_000;
/** After an order, how long before the sweep is asked (a kill takes seconds on Windows). */
const SWEEP_AFTER_MS = 6_000;
/** An order that did not take is given again after this long. */
const REORDER_MS = 60_000;

export interface PassedLegCard {
    id: string;
    status: 'starting' | 'idle' | 'working' | 'ended' | 'error';
    queued: number;
    /** a question or a permission is open on the card */
    asking: boolean;
    /** when its last turn ended */
    turnEndedAt?: number;
}

/** What is known about the session that passed; each part optional. */
export interface PassedLegFacts {
    /** the Console card hosting it */
    card?: PassedLegCard;
    /** the live monitor's view (a terminal, a headless run) */
    live?: { status: string; lastEventTs: number };
    /** the process registered for it */
    pid?: number;
}

export type EndOrder =
    | { act: 'close-card'; cardId: string; why: string }
    | { act: 'kill'; pid: number; why: string }
    | { act: 'wait'; why: string; at?: number };

const REST = new Set(['waiting-input', 'idle']);

export function passedLegOrder(b: Baton, f: PassedLegFacts, now: number, settleMs = BATON_END_SETTLE_MS): EndOrder {
    if (b.state !== 'waiting-end') { return { act: 'wait', why: `the baton is ${b.state}` }; }
    const done = `the baton was passed (${b.id}) and the turn that passed it came to rest — Agent Farm ended the session so the successor can start`;
    const card = f.card;
    if (card && card.status !== 'ended' && card.status !== 'error') {
        if (card.status !== 'idle') { return { act: 'wait', why: 'the turn that passed the baton is still running' }; }
        if (card.asking) { return { act: 'wait', why: 'a question is open on its card' }; }
        if (card.queued > 0) { return { act: 'wait', why: 'a message is queued for it' }; }
        const due = Math.max(b.createdAt, card.turnEndedAt ?? 0) + settleMs;
        if (now < due) { return { act: 'wait', why: 'its turn is at rest — Agent Farm closes the card in a moment', at: due }; }
        return { act: 'close-card', cardId: card.id, why: done };
    }
    if (card) { return { act: 'wait', why: 'its card has ended' }; }
    if (!f.pid) { return { act: 'wait', why: 'no live process of its own to end' }; }
    if (!f.live) { return { act: 'wait', why: 'no watcher can see whether its turn is over — end the session by hand' }; }
    if (!REST.has(f.live.status)) { return { act: 'wait', why: 'the turn that passed the baton is still running' }; }
    const due = Math.max(b.createdAt, f.live.lastEventTs) + settleMs;
    if (now < due) { return { act: 'wait', why: 'its turn is at rest — Agent Farm ends it in a moment', at: due }; }
    return { act: 'kill', pid: f.pid, why: done };
}

export interface PassedLegEnderDeps {
    batons: () => readonly Baton[];
    facts: (b: Baton) => PassedLegFacts;
    closeCard: (cardId: string, why: string) => void;
    kill: (pid: number) => void;
    /** asked a beat after an order, so the release does not wait for the next sweep */
    sweep: () => void;
    log?: (line: string) => void;
    now?: () => number;
    settleMs?: number;
    sweepAfterMs?: number;
}

export class PassedLegEnder {
    private timer?: ReturnType<typeof setTimeout>;
    private due = Infinity;
    private readonly ordered = new Map<string, number>();

    constructor(private readonly deps: PassedLegEnderDeps) {}

    private now(): number { return (this.deps.now ?? Date.now)(); }

    /** Something moved (a card, the watcher, the store): look again soon, if any baton waits. */
    poke(): void {
        if (!this.deps.batons().some(b => b.state === 'waiting-end')) { return; }
        this.schedule(this.now() + 1000);
    }

    private schedule(at: number): void {
        if (this.timer && at >= this.due) { return; }
        if (this.timer) { clearTimeout(this.timer); }
        this.due = at;
        this.timer = setTimeout(() => { this.timer = undefined; this.due = Infinity; this.check(); }, Math.max(250, at - this.now()));
    }

    /** One pass over every waiting baton: end what is due, schedule what will be. */
    check(): EndOrder[] {
        const now = this.now();
        const orders: EndOrder[] = [];
        let next = Infinity;
        for (const b of this.deps.batons()) {
            if (b.state !== 'waiting-end') { continue; }
            const last = this.ordered.get(b.id);
            if (last !== undefined && now - last < REORDER_MS) { continue; }
            let o: EndOrder;
            try { o = passedLegOrder(b, this.deps.facts(b), now, this.deps.settleMs); } catch { continue; }
            orders.push(o);
            if (o.act === 'wait') { if (o.at) { next = Math.min(next, o.at); } continue; }
            this.ordered.set(b.id, now);
            try {
                if (o.act === 'close-card') { this.deps.closeCard(o.cardId, o.why); } else { this.deps.kill(o.pid); }
                this.deps.log?.(`baton ${b.id}: ${o.act === 'close-card' ? `card ${o.cardId} closed` : `pid ${o.pid} ended`} — ${o.why}`);
            } catch (e) {
                this.deps.log?.(`baton ${b.id}: could not end session ${b.from.sessionId.slice(0, 8)}: ${String((e as Error)?.message ?? e)}`);
            }
            setTimeout(() => { try { this.deps.sweep(); } catch { /* the periodic sweep follows */ } }, this.deps.sweepAfterMs ?? SWEEP_AFTER_MS);
        }
        if (next < Infinity) { this.schedule(next); }
        return orders;
    }

    dispose(): void { if (this.timer) { clearTimeout(this.timer); this.timer = undefined; } }
}
