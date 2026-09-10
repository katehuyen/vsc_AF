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
export type BridgeState =
    'disabled' | 'no-token' | 'no-chats' | 'over-budget' | 'connected' | 'error';

/** The colour family the page paints, as an ANSWER rather than an `if` on the
 *  page — a sixth state cannot then arrive with no colour. */
export const TONE_OF: Record<BridgeState, 'ok' | 'bad' | 'warn' | 'off'> = {
    disabled: 'off',
    'no-token': 'bad',
    'no-chats': 'warn',
    // audit B-05 — the poller is alive and nothing is broken; it is the RUNS
    // that are refused, which is the same shape of failure as an empty
    // allowlist and gets the same colour.
    'over-budget': 'warn',
    connected: 'ok',
    error: 'bad'
};

/** One sentence a person can read, per state. In words, because a badge alone
 *  tells somebody the colour of their problem and nothing else. */
export const DETAIL_OF: Record<BridgeState, string> = {
    disabled: 'The bridge is switched off. Nothing is polled and no chat can start a run.',
    'no-token': 'There is no bot token in the secret vault, so the bridge cannot sign in to Telegram.',
    'no-chats': 'Polling, but the allowlist is empty — every message that arrives is refused.',
    /**
     * ‼️ audit B-05 — THE CEILING IS A STATE, AND IT USED TO BE INVISIBLE.
     *
     * Measured on `dist/render/tgsettings.s4.png`, the scene whose own title is
     * "the day's ceiling is reached": the strip beside the badge drew
     * `$0.4102 / $0.25` with the bar in red, and the badge above it said
     * `● connected` with the sentence "Polling Telegram and answering the chats
     * on the allowlist" — which is the one thing it is not doing. `chatRunPrompt`
     * refuses every prompt with "Today's chat budget is used up", so a green
     * badge there tells somebody their phone can start a run when it cannot,
     * which is the exact failure the head of this file was written about.
     */
    'over-budget': 'Polling, but today\'s ceiling is reached — a message asking for a run is refused'
        + ' until the ledger rolls over. /status, /agent and /cancel still answer.',
    connected: 'Polling Telegram and answering the chats on the allowlist.',
    error: 'The last poll failed. The bridge is backing off and retrying on its own.'
};

/** What to do next, where there is something to do. `connected` has none — an
 *  instruction under a working service is noise a person learns to skip. */
const NEXT_OF: Partial<Record<BridgeState, string>> = {
    disabled: 'Switch it on here, or set agentFarm.telegram.enabled.',
    'no-token': 'Run "Connect Telegram…" and paste the token from @BotFather.',
    'no-chats': 'Message the bot once; it replies with its chat id, and adding that id here switches it on for that chat.',
    'over-budget': 'Raise agentFarm.telegram.maxDailyUSD, or wait for the ledger to roll over at local midnight.',
    error: 'If it keeps failing, check the network and re-verify the token.'
};

export interface BridgeStatusInput {
    enabled: boolean;
    /** WHETHER a token exists. ‼️ Never the token. */
    hasToken: boolean;
    allowCount: number;
    /** The last poll error, if the poller reported one. */
    lastError?: string;
    /**
     * ‼️ audit B-05 — TODAY'S CEILING, answered by `budgetReading().blocked`
     * and never re-derived here. It is the same figure the chat handler itself
     * obeys, so a card cannot say "answering" over a bridge that is refusing.
     */
    blocked?: boolean;
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
 *
 * ‼️ audit B-05 — AND THE CEILING SITS BELOW THE ALLOWLIST, for the same
 * reason: with an empty allowlist nothing reaches the budget at all, so
 * reporting the ceiling would send somebody to raise a number that is not what
 * is stopping them.
 */
export function bridgeStatus(input: BridgeStatusInput): BridgeStatus {
    const running = !!input.enabled && !!input.hasToken;
    const state: BridgeState =
        !input.enabled ? 'disabled'
            : !input.hasToken ? 'no-token'
                : input.lastError ? 'error'
                    : input.allowCount <= 0 ? 'no-chats'
                        : input.blocked ? 'over-budget' : 'connected';
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

/**
 * ‼️ U-84 — WHAT A SNAPSHOT OF THE BRIDGE IS, and why the host takes it.
 *
 * Three of these facts are unreachable from a panel. The bot token is in the
 * secret vault, the day's spend is in `globalState`, and the last poll error is
 * held by a poller that lives for the length of `activate()`. A panel that
 * reached for any of them would either fail or grow its own second copy — so
 * the extension, which owns all three, hands over the ANSWER.
 *
 * ‼️ AND `hasToken` IS A BOOLEAN ON PURPOSE. A card has to be able to draw
 * "this bridge has no token yet" without the token ever entering a webview —
 * the same boundary X-100 draws with `hasSecret`, for the same reason.
 */
export interface TelegramSnapshot {
    hasToken: boolean;
    /** The bot's own name, once something has asked Telegram for it. */
    botUsername?: string;
    ledger: SpendLedger;
    /** The local day the ledger is being read against. */
    day: string;
    lastError?: string;
}

/** The four settings the card reads, on top of the snapshot the host takes. */
export interface TelegramCardInput extends TelegramSnapshot {
    enabled: boolean;
    allowedChats: readonly number[];
    maxDailyUSD: number;
    defaultAgent: string;
}

export interface TelegramCard {
    enabled: boolean;
    hasToken: boolean;
    botUsername?: string;
    allowedChats: number[];
    maxDailyUSD: number;
    defaultAgent: string;
    status: BridgeStatus;
    budget: BudgetReading;
}

/**
 * ‼️ THE CARD IS COMPOSED ONCE, FOR EVERY SURFACE THAT DRAWS IT.
 *
 * U-84 asks for this card in TWO places — the Toolbox's Services tab and Farm
 * Settings — and the second one is exactly where a copy gets made: given
 * `enabled`, `hasToken` and a list length, a second panel can work a badge out
 * for itself in four lines, and those four lines then go quietly out of date
 * the first time `applyChatBridge` changes. They would go out of date IN GREEN,
 * which is the failure worth spending a function on.
 *
 * So each panel reads the settings (only a host can) and hands them here; what
 * reaches either page is the same decided object.
 */
export function telegramCard(input: TelegramCardInput): TelegramCard {
    const allowedChats = [...input.allowedChats]
        .filter(n => typeof n === 'number' && Number.isFinite(n));
    // audit B-05 — read ONCE, so the badge and the bar beside it cannot
    // disagree about whether today's ceiling has been reached.
    const budget = budgetReading(input.ledger, input.maxDailyUSD, input.day);
    return {
        enabled: !!input.enabled,
        hasToken: !!input.hasToken,
        ...(input.botUsername ? { botUsername: input.botUsername } : {}),
        allowedChats,
        maxDailyUSD: input.maxDailyUSD,
        defaultAgent: input.defaultAgent,
        status: bridgeStatus({
            enabled: !!input.enabled,
            hasToken: !!input.hasToken,
            allowCount: allowedChats.length,
            blocked: budget.blocked,
            ...(input.lastError ? { lastError: input.lastError } : {})
        }),
        budget
    };
}
