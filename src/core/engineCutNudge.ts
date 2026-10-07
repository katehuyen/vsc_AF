/**
 * ‼️ X-483 — A RELAY LEG THE ENGINE CUT IS ASKED ONCE TO GO ON.
 *
 * A turn the engine ends in silence, with no stop asked anywhere in Agent Farm
 * (X-480's NO_STOP_ASKED, `lastTurn.engineCut`), leaves a Console card idle
 * and alive: the failsafe (S-83) judges only a leg that ENDED, S-86 only one
 * that passed, S-90 only one told to hand over — so the chain stalled for
 * ever. The user's decision (2026-10-07, option A): such a turn gets ONE
 * automatic "continue" in the same session; a stop someone asked for is never
 * answered with one, because the card then carries `stopAsked`, not a cut.
 *
 * Only a leg of a chain that still flows is asked (brakeStateOf 'off'): not
 * one that passed, a Last leg, a chain the user ended, a leg a HANDOVER order
 * reached (S-90 and the failsafe carry it), nor one paused in place. The turn
 * a nudge opened is never nudged again when it is cut too — it is said once,
 * and the chain waits for a person. Anything typed after a cut starts a new
 * turn, which clears `lastTurn`, so a person who spoke first is never talked
 * over. Pure decision; the class applies it.
 */
import { Baton, openerOf } from './baton';
import { brakeStateOf } from './batonLastLeg';
import { hereFresh } from './chainPause';

/** How the nudge opens — also how the turn it opened is known again. To the agent, so English. */
export const CUT_NUDGE = 'Agent Farm: your last turn was cut by the engine — nothing in Agent Farm asked it to stop.';

export function cutNudgeText(): string {
    return `${CUT_NUDGE} Pick up exactly where you stopped and carry on with the work.`;
}

/** The little of a Console message this reads. */
export interface CutMessage { role: string; text?: string; steer?: boolean }

/** The prompt that opened the last finished turn ('' when there is none): a steered line joins a turn, it never opens one. */
export function turnOpener(messages: readonly CutMessage[]): string {
    let i = messages.length - 1;
    while (i >= 0 && messages[i].role !== 'result') { i--; }
    for (i--; i >= 0; i--) {
        const m = messages[i];
        if (m.role === 'user' && !m.steer) { return String(m.text ?? ''); }
    }
    return '';
}

/** A Console card as the watch reads it. */
export interface CutCard {
    id: string;
    sessionId: string;
    status: string;
    queued: number;
    asking: boolean;
    lastTurn?: { endedAt: number; engineCut?: boolean };
    /** turnOpener() of its messages */
    opened: string;
}

/** The host's card, narrowed to what the watch reads. */
export function cutCardOf(c: {
    id: string; sessionId?: string; status: string; queued?: readonly unknown[];
    pendingAsk?: unknown; pendingPermission?: unknown;
    lastTurn?: { endedAt: number; engineCut?: boolean }; messages: readonly CutMessage[];
}): CutCard {
    return {
        id: c.id, sessionId: c.sessionId ?? '', status: c.status, queued: c.queued?.length ?? 0,
        asking: !!(c.pendingAsk || c.pendingPermission), lastTurn: c.lastTurn, opened: turnOpener(c.messages)
    };
}

export type CutOrder =
    | { act: 'none'; why: string }
    | { act: 'nudge' | 'spent'; why: string; chainId: string; leg: number };

export function cutOrder(i: { card: CutCard; list: readonly Baton[]; handover?: (sessionId: string) => boolean }): CutOrder {
    const { card, list } = i;
    const sid = card.sessionId;
    const turn = card.lastTurn;
    if (!sid || !turn?.engineCut) { return { act: 'none', why: 'its last turn was not cut by the engine' }; }
    if (card.status !== 'idle' || card.asking || card.queued > 0) { return { act: 'none', why: 'the card is not at rest on the cut turn' }; }
    const opener = openerOf(list, sid);
    if (!opener) { return { act: 'none', why: 'not a relay leg' }; }
    const leg = opener.hop + 1;
    const brake = brakeStateOf(list, sid);
    if (brake !== 'off') {
        return { act: 'none', why: brake === 'passed' ? 'the leg has passed the baton' : brake === 'on' ? 'the leg is its chain\'s last (⑂⊣ Last leg)' : 'its chain does not go on past this leg' };
    }
    if (i.handover?.(sid)) { return { act: 'none', why: 'a HANDOVER order reached the leg — S-90 closes it and the failsafe opens the next leg' }; }
    const pause = opener.pause;
    if (pause?.mode === 'here' && hereFresh(pause, { idleSince: turn.endedAt })) { return { act: 'none', why: 'the leg is paused in place — Continue speaks into it' }; }
    const vars = { chainId: opener.chainId, leg };
    if (card.opened.startsWith(CUT_NUDGE)) {
        return { act: 'spent', ...vars, why: `the engine cut leg ${leg} again, in the turn Agent Farm's nudge opened — it is not asked twice, so the chain waits for you` };
    }
    return { act: 'nudge', ...vars, why: `the engine cut leg ${leg}'s turn with no stop asked — the same session is asked once to go on` };
}

export interface CutWatchDeps {
    batons: () => readonly Baton[];
    cards: () => CutCard[];
    handover: (sessionId: string) => boolean;
    /** say it into the same session; false = it could not be sent */
    nudge: (cardId: string, text: string) => boolean;
    say: (title: string, body: string, key: string, level: 1 | 2, type: 'info' | 'warning') => void;
    log?: (line: string) => void;
}

export class EngineCutWatch {
    /** `${sessionId}:${endedAt}` of each cut already answered, so a 60 s sweep acts on it once */
    private readonly done = new Set<string>();

    constructor(private readonly deps: CutWatchDeps) { }

    check(): CutOrder[] {
        const list = this.deps.batons();
        const orders: CutOrder[] = [];
        const keep = new Set<string>();
        for (const card of this.deps.cards()) {
            let o: CutOrder;
            try { o = cutOrder({ card, list, handover: this.deps.handover }); } catch { continue; }
            orders.push(o);
            if (o.act === 'none') { continue; }
            const key = `${card.sessionId}:${card.lastTurn!.endedAt}`;
            keep.add(key);
            if (this.done.has(key)) { continue; }
            this.done.add(key);
            this.apply(card, o, key);
        }
        for (const k of [...this.done]) { if (!keep.has(k)) { this.done.delete(k); } }
        return orders;
    }

    private apply(card: CutCard, o: Extract<CutOrder, { act: 'nudge' | 'spent' }>, key: string): void {
        const tag = `baton leg ${card.sessionId.slice(0, 8)} (chain ${o.chainId})`;
        if (o.act === 'spent') {
            this.log(`${tag}: ${o.why}`);
            this.say(`Leg ${o.leg} of chain ${o.chainId} cut again — the chain waits for you`,
                `${o.why}.\n\nOpen the session and say how to go on, or press ⑂ Pass now on its card.`, `cut:${key}`, 2, 'warning');
            return;
        }
        let sent = false;
        try { sent = this.deps.nudge(card.id, cutNudgeText()); } catch { sent = false; }
        this.log(`${tag}: ${o.why}${sent ? '' : ' — the nudge could not be sent'}`);
        this.say(sent ? `Leg ${o.leg} of chain ${o.chainId} was cut by the engine — asked once to go on` : `Leg ${o.leg} of chain ${o.chainId} was cut by the engine — the nudge could not be sent`,
            sent ? `${o.why}. If the turn it opens is cut too, it is not asked again: the chain then waits for you.`
                : `${o.why}, but the Console refused the message. The chain waits for you: open the session and say how to go on.`,
            `cut:${key}`, sent ? 1 : 2, sent ? 'info' : 'warning');
    }

    private say(title: string, body: string, key: string, level: 1 | 2, type: 'info' | 'warning'): void {
        try { this.deps.say(title, body, key, level, type); } catch { /* best effort */ }
    }

    private log(line: string): void { try { this.deps.log?.(line); } catch { /* best effort */ } }
}
