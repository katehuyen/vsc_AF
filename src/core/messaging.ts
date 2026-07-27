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
}

export type ChatCommand =
    | { kind: 'help' }
    | { kind: 'status' }
    | { kind: 'agents' }
    | { kind: 'use'; agent: string }
    | { kind: 'cancel' }
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
                chat?: { id?: number };
                from?: { username?: string; first_name?: string };
            };
        };
        const msg = u?.message;
        if (typeof u?.update_id !== 'number' || !msg || typeof msg.text !== 'string') { continue; }
        const chatId = msg.chat?.id;
        if (typeof chatId !== 'number') { continue; }
        out.push({
            updateId: u.update_id,
            chatId,
            from: msg.from?.username || msg.from?.first_name || String(chatId),
            text: msg.text.trim(),
            ts: (msg.date ?? Math.floor(Date.now() / 1000)) * 1000
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
    if (cmd === 'cancel' || cmd === 'stop') { return { kind: 'cancel' }; }
    if (cmd === 'agent' || cmd === 'use') { return { kind: 'use', agent: arg }; }
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
    'Send any message and the agent you are bound to runs it, then answers here.',
    '',
    '/agent <name> — bind this chat to an agent',
    '/agents — list the agents',
    '/status — farm status: what is running, what needs you, today\'s cost',
    '/cancel — stop the run this chat started',
    '/help — this message',
    '',
    'Runs started from chat are headless and carry their own daily budget.'
].join('\n');

/** Telegram messages cap at 4096 chars — cut with an honest marker. */
export function clipForChat(text: string, limit = 3500): string {
    const t = String(text ?? '').trim();
    if (t.length <= limit) { return t || '(no output)'; }
    return t.slice(0, limit) + `\n\n… (cut — ${t.length - limit} more characters; the full output is in the Tasks panel)`;
}
