import {
    addWaiver, chargeTurn, ConfirmWhy, inboundVerdict, Inbox, inboxCount, PendingSends, queueInbound, Waived, waiverList
} from './telegramExecution';
import { SpendLedger } from './messaging';

/**
 * ‼️ X-446 — ONE GATE FOR EVERY REMOTE CHANNEL. A sentence sent from the phone
 * app (its `console.send`) meets the same four gates as one typed in Telegram
 * (`inboundVerdict`: still live · today's budget · a destructive command · a
 * running turn), against the SAME ledger, cap, queue and turn-end billing —
 * so the remote budget is one setting and one sum, whichever channel spent it.
 * Only the reply differs: Telegram answers in the chat, the phone in the call's
 * result (`note` and `held` are what its Share screen reads).
 *
 * A confirmation is answered by sending the same text again with
 * `confirm: <why>`; it is honoured only against the pending entry this device
 * was given for that conversation and text, so a phone cannot waive a gate it
 * was never shown. A message parked behind a running turn is released by the
 * turn-end listener like Telegram's, but straight into the conversation.
 */

export interface RemoteChatState {
    ledger: SpendLedger;
    inbox: Inbox;
    pending: PendingSends;
    seen: Record<string, number>;
}

export interface RemoteSayDeps<S extends RemoteChatState> {
    live(session: string): { status?: string; turns?: number; engine?: string; costUSD?: number } | undefined;
    steerable(engine: string | undefined): boolean;
    label(session: string): string;
    state(): S;
    save(next: S): PromiseLike<void>;
    cfg(): { whenBusy: 'queue' | 'steer'; maxDailyUSD: number };
    /** The words into the conversation; undefined = it is not live. */
    send(session: string, text: string): { refused?: string } | undefined;
    day(ms: number): string;
    now(): number;
}

export type RemoteSayResult = { ok: true; result: Record<string, unknown> } | { ok: false; error: string };

/** How long a confirmation the phone was shown can still be answered. */
export const CONFIRM_TTL_MS = 10 * 60 * 1000;

/** The pending-map key a device's confirmation lives under (Telegram's are chat ids). */
export const phoneKey = (device: string) => 'phone:' + device;
/** The device a pending-map key belongs to; undefined for a Telegram chat id. */
export const phoneOfKey = (key: string): string | undefined => key.startsWith('phone:') ? key.slice(6) : undefined;

const WHYS: ConfirmWhy[] = ['budget', 'risk'];

/** `waivedBefore` = the gates a parked message already passed, as it comes out at a turn's end. */
export async function remoteSay<S extends RemoteChatState>(
    d: RemoteSayDeps<S>, device: string, args: Record<string, unknown>, waivedBefore?: Waived
): Promise<RemoteSayResult> {
    const session = String(args.id ?? '').trim();
    const text = String(args.text ?? '');
    if (!session || !text.trim()) { return { ok: false, error: 'console.send needs id and text' }; }
    if (args.attach !== undefined || args.hold !== undefined) {
        return { ok: false, error: 'from a phone a message is plain text: attachments and hold are not taken (a busy conversation queues it)' };
    }
    let st = d.state();
    let waived = waivedBefore, consumed = false;
    if (args.confirm !== undefined) {
        const why = String(args.confirm) as ConfirmWhy;
        const p = st.pending[phoneKey(device)];
        if (!WHYS.includes(why) || !p || p.session !== session || p.text !== text || p.why !== why || d.now() - p.at > CONFIRM_TTL_MS) {
            return { ok: false, error: 'nothing to confirm: send the message again and confirm what it asks' };
        }
        const { [phoneKey(device)]: _done, ...rest } = st.pending;
        st = { ...st, pending: rest };
        waived = addWaiver(p.waived, why);
        consumed = true;
    }
    const s = d.live(session);
    const c = d.cfg();
    const label = d.label(session);
    const v = inboundVerdict({
        status: s?.status, turns: s?.turns ?? 0, label, text,
        whenBusy: c.whenBusy, steerable: d.steerable(s?.engine),
        ledger: st.ledger, capUSD: c.maxDailyUSD, day: d.day(d.now()), waived
    });
    if (v.do === 'gone') {
        if (consumed) { await d.save(st); }
        return { ok: false, error: 'That conversation is no longer live.' };
    }
    if (v.do === 'confirm') {
        // ok:true — the call was answered; `sent:false` + `confirm` say what it waits for, `note` is what the phone shows
        const had = waiverList(waived);
        await d.save({ ...st, pending: { ...st.pending, [phoneKey(device)]: { session, text, why: v.why, at: d.now(), ...(had.length ? { waived: had } : {}) } } });
        return { ok: true, result: { sent: false, confirm: v.why, note: `${v.note}\nNot sent yet — confirm it, or send it from the PC.` } };
    }
    if (v.do === 'hold') {
        const q = queueInbound(st.inbox, session, { chat: 0, device, text, at: d.now(), ...(waived ? { waived } : {}) });
        if (q.refused) { return { ok: false, error: q.refused }; }
        await d.save({ ...st, inbox: q.inbox });
        const n = inboxCount(q.inbox, session);
        return { ok: true, result: { held: true, note: `${v.note}${n > 1 ? ` (${n} waiting)` : ''}` } };
    }
    const r = d.send(session, text);
    if (!r) { return { ok: false, error: 'That conversation is no longer live.' }; }
    if (r.refused) { return { ok: false, error: r.refused }; }
    // the mark the turn-end listener bills this turn against (telegramExecution.chargeTurn)
    const after = d.state();
    await d.save({ ...after, pending: st.pending, seen: chargeTurn(after.seen, session, d.live(session)?.costUSD ?? 0).seen });
    return { ok: true, result: { note: `→ ${label}` } };
}
