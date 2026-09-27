/**
 * K-43 — THE CLOCK ITSELF: one timer per card, owned by the host.
 *
 * The decision is `autoAnswer.ts` and stays pure; this only holds the timers
 * and re-reads that decision at both ends. It lives in the HOST, not the page:
 * an unattended fleet is exactly the one with no panel open, and a countdown
 * that ran in the webview would stop the moment nobody was looking.
 *
 * The ask is read fresh at expiry rather than remembered at arming, so a
 * question answered, withdrawn or replaced in the meantime can never be
 * answered by a stale timer — the request id has to still be the one it armed.
 */
import {
    AutoAnswerAsk, AutoAnswerSettings, AutoAnswerView, autoAnswerClock, autoAnswerFor, autoAnswerView
} from './autoAnswer';

interface Slot {
    requestId: string;
    timer?: ReturnType<typeof setTimeout>;
    /** a person pressed Stop — this ask waits for them now, whatever the settings say */
    heldAt?: number;
}

export interface AutoAnswerTimerDeps {
    settings: () => AutoAnswerSettings;
    /** the card's pending ask, as it is right now */
    askOf: (id: string) => AutoAnswerAsk | undefined;
    /** the clock ran out: answer this card with these picks */
    expire: (id: string, answers: Record<string, string | string[]>, settings: AutoAnswerSettings) => void;
    now?: () => number;
}

export class AutoAnswerTimers {
    private slots = new Map<string, Slot>();

    constructor(private deps: AutoAnswerTimerDeps) {}

    private now(): number { return (this.deps.now ?? Date.now)(); }

    /**
     * Bring the card's timer in line with its ask. Cheap when nothing changed,
     * so it is called on every repaint; `force` re-arms after a settings change.
     */
    sync(id: string, force = false): void {
        const ask = this.deps.askOf(id);
        const slot = this.slots.get(id);
        if (!ask) {
            if (slot) { this.drop(id); }
            return;
        }
        const same = !!slot && slot.requestId === ask.requestId;
        if (same && !force) { return; }
        if (slot?.timer) { clearTimeout(slot.timer); }
        // K-45 — the user turned the filter off: a clock somebody stopped runs again
        const off = this.deps.settings().filter === 'off';
        const next: Slot = { requestId: ask.requestId, heldAt: same && !off ? slot!.heldAt : undefined };
        this.slots.set(id, next);
        if (!next.heldAt) { this.arm(id, next, ask); }
    }

    private arm(id: string, slot: Slot, ask: AutoAnswerAsk): void {
        const settings = this.deps.settings();
        if (!autoAnswerFor(ask, settings).armed) { return; }
        const clock = autoAnswerClock(ask, settings, this.now());
        if (!clock) { return; }
        const timer = setTimeout(() => this.fire(id, slot.requestId), clock.remainingMs);
        // a pending question must never be what keeps a process alive
        (timer as { unref?: () => void }).unref?.();
        slot.timer = timer;
    }

    private fire(id: string, requestId: string): void {
        const slot = this.slots.get(id);
        if (!slot || slot.requestId !== requestId || slot.heldAt) { return; }
        slot.timer = undefined;
        const ask = this.deps.askOf(id);
        if (!ask || ask.requestId !== requestId) { this.drop(id); return; }
        const settings = this.deps.settings();
        const verdict = autoAnswerFor(ask, settings);
        if (!verdict.armed || !verdict.answers) { return; }
        // The wait was lengthened while it ran: honour the new figure.
        if (!autoAnswerClock(ask, settings, this.now())?.expired) { this.arm(id, slot, ask); return; }
        this.deps.expire(id, verdict.answers, settings);
    }

    /**
     * Stop the clock on this card's current ask. False when there is nothing to stop —
     * ‼️ and ALWAYS false while the user's filter is `off` (K-45): then nothing stops it.
     */
    hold(id: string): boolean {
        const ask = this.deps.askOf(id);
        if (!ask || this.deps.settings().filter === 'off') { return false; }
        let slot = this.slots.get(id);
        if (!slot || slot.requestId !== ask.requestId) {
            slot = { requestId: ask.requestId };
            this.slots.set(id, slot);
        }
        if (slot.heldAt) { return false; }
        if (slot.timer) { clearTimeout(slot.timer); slot.timer = undefined; }
        slot.heldAt = this.now();
        return true;
    }

    view(id: string): AutoAnswerView | null {
        const ask = this.deps.askOf(id);
        const slot = this.slots.get(id);
        return autoAnswerView(ask, this.deps.settings(),
            ask && slot?.requestId === ask.requestId ? slot.heldAt : undefined);
    }

    /** true while this card has a clock running */
    running(id: string): boolean { return !!this.slots.get(id)?.timer; }

    private drop(id: string): void {
        const slot = this.slots.get(id);
        if (slot?.timer) { clearTimeout(slot.timer); }
        this.slots.delete(id);
    }

    dispose(): void {
        for (const id of [...this.slots.keys()]) { this.drop(id); }
    }
}
