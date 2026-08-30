/**
 * U-84 — WHAT THE TELEGRAM BRIDGE CARD IS ALLOWED TO CLAIM.
 *
 * `telegram.ts` is the transport and `messaging.ts` is the rulebook. Neither of
 * them answers the question a management card asks: **is this thing actually
 * working, and if not, what do I press?** That answer was nowhere — the bridge
 * announced itself through two `showWarningMessage` calls at startup and then
 * went silent, so a token that expired on Tuesday looked exactly like a bridge
 * nobody had switched on.
 *
 * ‼️ THE CARD DERIVES NOTHING FOR ITSELF. A page that works out its own badge
 * is a second implementation of the launch rules, and the first time
 * `applyChatBridge` changes, the card goes on drawing last month's logic in
 * green. Everything the card shows comes from here, and here is measured
 * against what that function really does.
 *
 * ‼️ THE MEASUREMENT WORTH WRITING DOWN: **an empty allowlist does not stop the
 * poller.** `applyChatBridge` warns about it and calls `start()` anyway; every
 * message that then arrives is refused by `isAllowed`. So RUNNING and USABLE
 * are two different questions. A single badge collapsing them would be wrong
 * twice — it would call a live-but-deaf bridge "off", and it would send
 * somebody to restart a service that is already running fine.
 *
 * Pure: no vscode, no io, no token. The card is handed `hasToken`, never the
 * token — the same boundary X-100 draws with `hasSecret`, for the same reason.
 */

import { SpendLedger, withinBudget } from './messaging';

/**
 * The five states a bridge can be in. Deliberately not a boolean: "off",
 * "misconfigured" and "broken" send a person to three different places, and a
 * card that says only on/off makes them guess which one they are looking at.
 */
export type BridgeState = 'disabled' | 'no-token' | 'no-chats' | 'connected' | 'error';

/** The colour family the page paints, as an ANSWER rather than an `if` on the
 *  page — a sixth state cannot then arrive with no colour. */
export const TONE_OF: Record<BridgeState, 'ok' | 'bad' | 'warn' | 'off'> = {
    disabled: 'off',
    'no-token': 'bad',
    'no-chats': 'warn',
    connected: 'ok',
    error: 'bad'
};

/** One sentence a person can read, per state. In words, because a badge alone
 *  tells somebody the colour of their problem and nothing else. */
export const DETAIL_OF: Record<BridgeState, string> = {
    disabled: 'The bridge is switched off. Nothing is polled and no chat can start a run.',
    'no-token': 'There is no bot token in the secret vault, so the bridge cannot sign in to Telegram.',
    'no-chats': 'Polling, but the allowlist is empty — every message that arrives is refused.',
    connected: 'Polling Telegram and answering the chats on the allowlist.',
    error: 'The last poll failed. The bridge is backing off and retrying on its own.'
};

/** What to do next, where there is something to do. `connected` has none — an
 *  instruction under a working service is noise a person learns to skip. */
const NEXT_OF: Partial<Record<BridgeState, string>> = {
    disabled: 'Switch it on here, or set agentFarm.telegram.enabled.',
    'no-token': 'Run "Connect Telegram…" and paste the token from @BotFather.',
    'no-chats': 'Message the bot once; it replies with its chat id, and adding that id here switches it on for that chat.',
    error: 'If it keeps failing, check the network and re-verify the token.'
};

export interface BridgeStatusInput {
    enabled: boolean;
    /** WHETHER a token exists. ‼️ Never the token. */
    hasToken: boolean;
    allowCount: number;
    /** The last poll error, if the poller reported one. */
    lastError?: string;
}

export interface BridgeStatus {
    state: BridgeState;
    tone: 'ok' | 'bad' | 'warn' | 'off';
    detail: string;
    next?: string;
    /**
     * ‼️ IS THE POLLER ALIVE — a different question from whether the bridge is
     * useful. True whenever `applyChatBridge` would have reached `start()`,
     * which is exactly "switched on and holding a token".
     */
    running: boolean;
    lastError?: string;
}

/**
 * ‼️ THE PRECEDENCE IS A DECISION, NOT AN ORDER OF CONVENIENCE.
 *
 * A bridge that is switched off has no token problem, no chat problem and no
 * network problem — reporting one of those would send somebody to fix a thing
 * that is not wrong. A missing token EXPLAINS a network error rather than
 * competing with it. And an error outranks an empty allowlist because a poll
 * that cannot complete is the louder failure: fixing the allowlist under it
 * changes nothing.
 */
export function bridgeStatus(input: BridgeStatusInput): BridgeStatus {
    const running = !!input.enabled && !!input.hasToken;
    const state: BridgeState =
        !input.enabled ? 'disabled'
            : !input.hasToken ? 'no-token'
                : input.lastError ? 'error'
                    : input.allowCount > 0 ? 'connected' : 'no-chats';
    const next = NEXT_OF[state];
    return {
        state,
        tone: TONE_OF[state],
        detail: DETAIL_OF[state],
        ...(next ? { next } : {}),
        running,
        ...(input.lastError ? { lastError: input.lastError } : {})
    };
}

export interface ChatIdParse {
    ok: boolean;
    id?: number;
    error?: string;
}

/**
 * A chat id somebody typed, turned into one we may store — or a refusal that
 * says why.
 *
 * ‼️ TWO THINGS THIS GETS RIGHT THAT AN OBVIOUS IMPLEMENTATION DOES NOT.
 * A GROUP chat id is NEGATIVE (`-1001234567890`), and refusing the minus sign
 * would break the feature in the case it is most wanted in. And an id longer
 * than JavaScript can hold exactly is REFUSED rather than rounded: a rounded id
 * is a valid-looking number that belongs to nobody, stored for ever, silently
 * never matching the chat it was meant to allow.
 */
export function parseChatId(text: string, existing: readonly number[]): ChatIdParse {
    const t = String(text ?? '').trim();
    if (!t) { return { ok: false, error: 'Enter a chat id — the bot replies with it when you message it.' }; }
    if (!/^-?\d+$/.test(t)) {
        return {
            ok: false,
            error: 'A chat id is a whole number (negative for groups) — not a name or a link.'
        };
    }
    const id = Number(t);
    if (!Number.isSafeInteger(id)) {
        return { ok: false, error: 'That number is too long to store exactly, so it would not match any chat.' };
    }
    // Refused BY NAME rather than silently deduped: pressing add and seeing
    // nothing happen is indistinguishable from a broken button.
    if (existing.includes(id)) { return { ok: false, error: `${id} is already on the allowlist.` }; }
    return { ok: true, id };
}

export interface BudgetReading {
    spent: number;
    cap: number;
    remaining: number;
    /** 0-100, for the bar. Never past 100 — a bar that overflows says nothing
     *  the number beside it did not already say. */
    pct: number;
    /** ‼️ Answered by `messaging.withinBudget`, which is the rule the chat
     *  handler itself obeys. Re-implementing the comparison here would drift
     *  from it the first time either side changed. */
    blocked: boolean;
}

/** Today's spend against today's cap. Yesterday's total is not today's spend —
 *  the ledger rolls over at midnight, and reading it without the day would
 *  block a fresh morning on last night's work. */
export function budgetReading(ledger: SpendLedger, capUSD: number, day: string): BudgetReading {
    const cap = Number.isFinite(capUSD) && capUSD > 0 ? capUSD : 0;
    const spent = ledger && ledger.day === day && Number.isFinite(ledger.usd) ? ledger.usd : 0;
    const remaining = Math.max(0, Math.round((cap - spent) * 10000) / 10000);
    const pct = cap > 0 ? Math.min(100, Math.round((spent / cap) * 100)) : 100;
    return {
        spent,
        cap,
        remaining,
        pct,
        blocked: !withinBudget(ledger, capUSD, day)
    };
}
