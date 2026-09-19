/**
 * Telegram transport for the inbound channel (messaging.ts holds the rules).
 *
 * Long polling over plain HTTPS — no SDK, no dependency, no inbound port: the
 * farm reaches out, so nothing has to be exposed to the internet for a phone
 * to reach it. The bot token lives in the Secrets vault, never in settings.
 */

import * as https from 'https';
import { InboundMessage, parseUpdates } from './messaging';

const API = 'https://api.telegram.org';

/**
 * The one call this module makes, as a type — so a test can hand its own in
 * and every method here is exercisable without a network. The poller has had
 * this door since U-84; `sendMessage` and the topic calls had none, which is
 * why the whole outbound half was unmeasured.
 */
export type TelegramCall = (
    method: string, params: Record<string, string | number>, timeoutMs: number
) => Promise<unknown>;

function request(
    token: string, method: string, params: Record<string, string | number>,
    timeoutMs: number
): Promise<unknown> {
    const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))).toString();
    return new Promise((resolve, reject) => {
        const req = https.get(`${API}/bot${token}/${method}?${qs}`, res => {
            let body = '';
            res.on('data', d => { body += String(d); });
            res.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
            });
        });
        req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout')); });
        req.on('error', reject);
    });
}

/**
 * ‼️ U-113 — WHAT WENT OUT IS AS IMPORTANT AS THAT IT WENT OUT. The id of the
 * message Telegram just created is the whole of the reply layer: a reader who
 * replies to it names the conversation exactly, and an id that was thrown away
 * at the transport can never be recovered. So this returns it rather than
 * `void`, and `threadId` puts the message in a forum topic — the other half of
 * the same question, answered by where the message is rather than by what it
 * is a reply to.
 */
export async function sendMessage(
    token: string, chatId: number, text: string, threadId?: number, call?: TelegramCall,
    keyboard?: { text: string; data: string }[][]
): Promise<number | undefined> {
    // POST would be tidier, but a GET with an encoded query needs no body
    // handling and Telegram accepts it; the text is URL-encoded above.
    // U-114 — the buttons travel as `reply_markup`, Telegram's own JSON shape.
    const r = await (call ?? ((m, p, t) => request(token, m, p, t)))('sendMessage', {
        chat_id: chatId, text, disable_web_page_preview: 'true',
        ...(threadId && threadId > 0 ? { message_thread_id: threadId } : {}),
        ...(keyboard && keyboard.length ? {
            reply_markup: JSON.stringify({
                inline_keyboard: keyboard.map(row => row.map(b => ({ text: b.text, callback_data: b.data })))
            })
        } : {})
    }, 15_000) as { ok?: boolean; result?: { message_id?: number } };
    return r?.ok && typeof r.result?.message_id === 'number' ? r.result.message_id : undefined;
}

/**
 * U-114 — A TAP IS ANSWERED OR THE PHONE SPINS. Telegram shows a progress
 * indicator on the button until `answerCallbackQuery` is called, and gives up
 * after a while with nothing said; so every tap is acknowledged the moment it
 * is read, with a short toast when there is something to say. Failures are
 * swallowed: the acknowledgement is a courtesy to the phone, not a step the
 * action depends on.
 */
export async function answerCallbackQuery(
    token: string, callbackId: string, text?: string, call?: TelegramCall
): Promise<void> {
    try {
        await (call ?? ((m, p, t) => request(token, m, p, t)))('answerCallbackQuery', {
            callback_query_id: callbackId, ...(text ? { text: text.slice(0, 200) } : {})
        }, 15_000);
    } catch { /* the phone stops spinning on its own */ }
}

export async function getMe(token: string): Promise<{ ok: boolean; username?: string }> {
    const r = await request(token, 'getMe', {}, 15_000) as
        { ok?: boolean; result?: { username?: string } };
    return { ok: !!r?.ok, username: r?.result?.username };
}

/**
 * Is this chat a Forum (Topics on)? The answer decides whether a conversation
 * can be given a thread of its own, and it is a property of the group rather
 * than of anything we set — so it is asked, never assumed. A private chat
 * answers `false`, which is the correct answer and not an error.
 */
export async function isForumChat(
    token: string, chatId: number, call?: TelegramCall
): Promise<boolean> {
    try {
        const r = await (call ?? ((m, p, t) => request(token, m, p, t)))(
            'getChat', { chat_id: chatId }, 15_000) as
            { ok?: boolean; result?: { is_forum?: boolean } };
        return !!(r?.ok && r.result?.is_forum);
    } catch { return false; }
}

/**
 * Open a topic for one conversation. Refusals are returned rather than thrown:
 * the bot may simply lack `can_manage_topics` in that group, and the bridge's
 * answer to that is to carry on in the main thread — not to stop talking.
 */
export async function createForumTopic(
    token: string, chatId: number, name: string, call?: TelegramCall
): Promise<{ ok: boolean; threadId?: number; error?: string }> {
    try {
        const r = await (call ?? ((m, p, t) => request(token, m, p, t)))(
            'createForumTopic', { chat_id: chatId, name }, 15_000) as
            { ok?: boolean; description?: string; result?: { message_thread_id?: number } };
        if (r?.ok && typeof r.result?.message_thread_id === 'number') {
            return { ok: true, threadId: r.result.message_thread_id };
        }
        return { ok: false, error: r?.description || 'Telegram refused the topic' };
    } catch (e) { return { ok: false, error: String((e as Error).message ?? e) }; }
}

export interface PollerOptions {
    token: string;
    /** where to resume from; the poller advances it as updates arrive */
    offset: number;
    onMessages: (msgs: InboundMessage[], nextOffset: number) => void;
    onError: (err: Error) => void;
    /**
     * ‼️ U-84 — A POLL COMPLETED, WHICH IS NOT THE SAME AS A POLL PRODUCING
     * WORK. `onMessages` only fires when something arrived, so a bridge nobody
     * is texting gives no sign of life at all — and a badge that clears its
     * last error on `onMessages` would still be showing this morning's timeout
     * at teatime, sending somebody to fix a connection that healed hours ago.
     * This fires on every successful round trip, empty or not.
     */
    onPoll?: () => void;
    /** seconds Telegram holds the connection open with nothing to say */
    longPollSec?: number;
    /**
     * The transport, injectable. Default is the real HTTPS call; a test passes
     * its own, which is the only way this loop can be exercised without a
     * network — and until it could be, it was the one part of the bridge no
     * test had ever run.
     */
    fetch?: (method: string, params: Record<string, string | number>, timeoutMs: number) => Promise<unknown>;
}

/**
 * A long-polling loop that survives network hiccups: a failed poll backs off
 * (2s → 60s) instead of hammering, and any success resets the backoff.
 */
export class TelegramPoller {
    private stopped = false;
    private timer?: NodeJS.Timeout;
    private backoff = 2000;
    private offset: number;

    constructor(private opts: PollerOptions) {
        this.offset = opts.offset;
    }

    start(): void {
        this.stopped = false;
        void this.loop();
    }

    stop(): void {
        this.stopped = true;
        if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    }

    private schedule(ms: number): void {
        if (this.stopped) { return; }
        this.timer = setTimeout(() => void this.loop(), ms);
    }

    private async loop(): Promise<void> {
        if (this.stopped) { return; }
        const wait = this.opts.longPollSec ?? 25;
        const call = this.opts.fetch
            ?? ((method: string, params: Record<string, string | number>, timeoutMs: number) =>
                request(this.opts.token, method, params, timeoutMs));
        try {
            const payload = await call('getUpdates',
                // U-114 — taps on a card's buttons arrive as callback_query
                { offset: this.offset, timeout: wait, allowed_updates: '["message","callback_query"]' },
                (wait + 10) * 1000);
            const msgs = parseUpdates(payload);
            if (msgs.length) {
                this.offset = Math.max(...msgs.map(m => m.updateId)) + 1;
                this.opts.onMessages(msgs, this.offset);
            }
            // ‼️ The round trip completed — announced whether or not it carried
            // anything, because "the bridge is reachable" is the fact a badge
            // needs and an empty inbox is not evidence against it.
            this.opts.onPoll?.();
            this.backoff = 2000;
            this.schedule(250);
        } catch (e) {
            this.opts.onError(e as Error);
            this.schedule(this.backoff);
            this.backoff = Math.min(this.backoff * 2, 60_000);
        }
    }
}
