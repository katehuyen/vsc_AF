/**
 * The inbound channel — a message from outside becomes work inside.
 *
 * Agent Farm could shout out (`notifyWebhookUrl`) and could be poked into
 * running something (`/trigger/<token>`), but there was no way to *write to it*
 * and get an answer back: "ask the developer agent what broke the build" from
 * a phone, in a chat app, with the reply arriving in the same thread.
 *
 * This module is the pure half — parsing what arrived, deciding what it means,
 * and enforcing the two rules that keep a chat channel from becoming a way to
 * spend money on someone else's behalf:
 *
 *   1. **Allowlist.** An empty allowlist means the bridge does not run at all.
 *      A message from an unknown chat is answered with a refusal, never work.
 *   2. **Daily cap.** Runs started from chat carry their own USD ceiling,
 *      counted per day, and stop asking the model once it is reached.
 *
 * Transport (HTTPS long polling) lives in telegram.ts; this file has no io.
 */

export interface InboundMessage {
    updateId: number;
    chatId: number;
    /** who sent it, for the log and the refusal message */
    from: string;
    text: string;
    ts: number;
    /**
     * ‼️ U-113 — THE THREE FACTS A MESSAGE CARRIES ABOUT WHO IT IS FOR.
     *
     * One chat can be watching several conversations at once, and a bare text
     * says nothing about which. Telegram already answers it twice over — the
     * message this one REPLIES to, and the forum topic it was typed in — and
     * dropping both here is what made a chat bridge a single-session toy.
     * `messageId` is this message's own, so the reply chain can be followed
     * back later. Absent where Telegram said nothing (a private chat has no
     * topics; a fresh message replies to nothing). See `telegramRouting.ts`.
     */
    messageId?: number;
    replyTo?: number;
    threadId?: number;
    /**
     * U-114 — A TAP, NOT A TEXT. A button under a card comes back as a
     * `callback_query`: no words, only the `data` the button carried and the
     * id Telegram wants answered (`answerCallbackQuery`) so the phone stops
     * showing a spinner. `text` is '' for these; `messageId` is the CARD the
     * button was on, which is how a tap is routed to the conversation the card
     * was sent for (telegramRouting.ts, the reply layer).
     */
    callback?: { id: string; data: string };
}

export type ChatCommand =
    | { kind: 'help' }
    | { kind: 'status' }
    | { kind: 'agents' }
    | { kind: 'use'; agent: string }
    /** U-116 — no arg stops the run this chat started; an arg names a live turn */
    | { kind: 'cancel'; arg: string }
    /** U-113 — the live conversations, numbered, so `/focus 2` has a 2 */
    | { kind: 'sessions' }
    /** U-113 — where plain messages from this chat go. Empty arg = ask */
    | { kind: 'focus'; arg: string }
    | { kind: 'prompt'; text: string };

/** Telegram's getUpdates payload → the messages we care about. */
export function parseUpdates(payload: unknown): InboundMessage[] {
    const out: InboundMessage[] = [];
    const root = payload as { ok?: boolean; result?: unknown[] } | undefined;
    if (!root?.ok || !Array.isArray(root.result)) { return out; }
    for (const item of root.result) {
        const u = item as {
            update_id?: number;
            message?: {
                text?: string; date?: number;
                message_id?: number;
                message_thread_id?: number;
                reply_to_message?: { message_id?: number };
                chat?: { id?: number };
                from?: { username?: string; first_name?: string };
            };
            callback_query?: {
                id?: string; data?: string;
                from?: { username?: string; first_name?: string };
                message?: { message_id?: number; message_thread_id?: number; chat?: { id?: number } };
            };
        };
        if (typeof u?.update_id !== 'number') { continue; }
        const cb = u.callback_query;
        if (cb && typeof cb.id === 'string' && typeof cb.data === 'string') {
            const chatId = cb.message?.chat?.id;
            if (typeof chatId !== 'number') { continue; }
            out.push({
                updateId: u.update_id,
                chatId,
                from: cb.from?.username || cb.from?.first_name || String(chatId),
                text: '',
                ts: Date.now(),
                callback: { id: cb.id, data: cb.data },
                ...(typeof cb.message?.message_id === 'number' ? { messageId: cb.message.message_id } : {}),
                ...(typeof cb.message?.message_thread_id === 'number'
                    ? { threadId: cb.message.message_thread_id } : {})
            });
            continue;
        }
        const msg = u.message;
        if (!msg || typeof msg.text !== 'string') { continue; }
        const chatId = msg.chat?.id;
        if (typeof chatId !== 'number') { continue; }
        out.push({
            updateId: u.update_id,
            chatId,
            from: msg.from?.username || msg.from?.first_name || String(chatId),
            text: msg.text.trim(),
            ts: (msg.date ?? Math.floor(Date.now() / 1000)) * 1000,
            // U-113 — carried only where Telegram really said it; a 0 would be
            // a message id and a topic id that do not exist.
            ...(typeof msg.message_id === 'number' ? { messageId: msg.message_id } : {}),
            ...(typeof msg.reply_to_message?.message_id === 'number'
                ? { replyTo: msg.reply_to_message.message_id } : {}),
            ...(typeof msg.message_thread_id === 'number'
                ? { threadId: msg.message_thread_id } : {})
        });
    }
    return out;
}

/** What does this message ask for? Everything that is not a command is work. */
export function parseCommand(text: string): ChatCommand {
    const t = text.trim();
    const m = /^\/([a-z]+)(?:@\w+)?\s*(.*)$/i.exec(t);
    if (!m) { return { kind: 'prompt', text: t }; }
    const cmd = m[1].toLowerCase();
    const arg = m[2].trim();
    if (cmd === 'help' || cmd === 'start') { return { kind: 'help' }; }
    if (cmd === 'status') { return { kind: 'status' }; }
    if (cmd === 'agents') { return { kind: 'agents' }; }
    if (cmd === 'cancel' || cmd === 'stop') { return { kind: 'cancel', arg }; }
    if (cmd === 'agent' || cmd === 'use') { return { kind: 'use', agent: arg }; }
    if (cmd === 'sessions') { return { kind: 'sessions' }; }
    if (cmd === 'focus') { return { kind: 'focus', arg }; }
    // an unknown slash command is not a prompt — running it would be a guess
    return { kind: 'help' };
}

/** Chat ids allowed to drive the farm. Empty list = the bridge stays off. */
export function isAllowed(chatId: number, allowlist: number[]): boolean {
    return allowlist.length > 0 && allowlist.includes(chatId);
}

export interface SpendLedger {
    /** local day key the total belongs to */
    day: string;
    usd: number;
}

/** Add a run's cost, rolling the ledger over at midnight. */
export function addSpend(ledger: SpendLedger, usd: number, day: string): SpendLedger {
    return ledger.day === day
        ? { day, usd: Math.round((ledger.usd + usd) * 10000) / 10000 }
        : { day, usd: Math.round(usd * 10000) / 10000 };
}

/** Is there room left today? A cap of 0 means "no chat-started runs at all". */
export function withinBudget(ledger: SpendLedger, capUSD: number, day: string): boolean {
    if (!(capUSD > 0)) { return false; }
    return ledger.day !== day || ledger.usd < capUSD;
}

export const HELP_TEXT = [
    'Agent Farm — this chat can talk to your agents.',
    '',
    'Reply to one of my messages and your words go back to THAT conversation.',
    'In a Forum group each conversation gets its own topic — just type in it.',
    'Anywhere else, plain messages go to the conversation in focus.',
    '',
    '/sessions — the live conversations, numbered, one tap from being the focus',
    '/focus <number|agent> — send plain messages to that one (/focus off clears it)',
    '/agent <name> — the agent a headless run is started for when nothing is live',
    '/agent <name> <prompt> — run that prompt now, answered in this thread',
    '/agents — the agents and what each one thinks with',
    '/status — the farm: what is running, what needs you, today\'s cost, what is left on each plan',
    '/cancel — stop the run this chat started · /cancel <number> stops a live turn',
    '/help — this message',
    '',
    'Runs started from chat are headless and carry their own daily budget.',
    'Write to a conversation that is working and your message WAITS for the turn',
    'to end rather than cutting into it — it survives a restart. Over the daily',
    'budget, or asking for something that cannot be undone, I ask you first.'
].join('\n');

/** Telegram messages cap at 4096 chars — cut with an honest marker. */
export function clipForChat(text: string, limit = 3500): string {
    const t = String(text ?? '').trim();
    if (t.length <= limit) { return t || '(no output)'; }
    return t.slice(0, limit) + `\n\n… (cut — ${t.length - limit} more characters; the full output is in the Tasks panel)`;
}
