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

export async function sendMessage(token: string, chatId: number, text: string): Promise<void> {
    // POST would be tidier, but a GET with an encoded query needs no body
    // handling and Telegram accepts it; the text is URL-encoded above.
    await request(token, 'sendMessage', { chat_id: chatId, text, disable_web_page_preview: 'true' }, 15_000);
}

export async function getMe(token: string): Promise<{ ok: boolean; username?: string }> {
    const r = await request(token, 'getMe', {}, 15_000) as
        { ok?: boolean; result?: { username?: string } };
    return { ok: !!r?.ok, username: r?.result?.username };
}

export interface PollerOptions {
    token: string;
    /** where to resume from; the poller advances it as updates arrive */
    offset: number;
    onMessages: (msgs: InboundMessage[], nextOffset: number) => void;
    onError: (err: Error) => void;
    /** seconds Telegram holds the connection open with nothing to say */
    longPollSec?: number;
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
        try {
            const payload = await request(this.opts.token, 'getUpdates',
                { offset: this.offset, timeout: wait, allowed_updates: '["message"]' },
                (wait + 10) * 1000);
            const msgs = parseUpdates(payload);
            if (msgs.length) {
                this.offset = Math.max(...msgs.map(m => m.updateId)) + 1;
                this.opts.onMessages(msgs, this.offset);
            }
            this.backoff = 2000;
            this.schedule(250);
        } catch (e) {
            this.opts.onError(e as Error);
            this.schedule(this.backoff);
            this.backoff = Math.min(this.backoff * 2, 60_000);
        }
    }
}
