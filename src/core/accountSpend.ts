/**
 * X-252 — WHAT THIS SIGN-IN SPENT, WHICH IS THE QUESTION THE WHOLE MULTI-ACCOUNT
 * ARRANGEMENT IS FOR.
 *
 * ‼️ MEASURED BEFORE THIS FILE EXISTED (2026-09-07, re-measured 2026-09-14):
 * `taskcost.ts` splits cost by ENGINE (`engineKey` — "absence means Claude on
 * both sides") and the word `account` does not appear in it; `taskstats.ts` and
 * the analytics page are the same. So with five sign-ins running under one
 * engine, "what did this account spend today, whose five-hour window did that
 * burn, which one is running cheap and which one expensive" had no answer
 * anywhere after the fact — while every rotation decision the fleet makes is
 * taken on exactly those figures.
 *
 * ‼️ THE ATTRIBUTION IS NOT RE-DERIVED HERE, IT IS ASKED FOR. `accountOf` is
 * handed in, and on the extension side it is `sessionAccountOf` — the one reader
 * X-251 declared, which reaches the LaunchManifest by the session's `launchId`
 * and has NO fallback. That absence is the whole point and it travels: a session
 * this farm did not start (a terminal the user opened themselves, or anything
 * from before X-251) has no manifest, and guessing the machine's current sign-in
 * onto it would be an attribution nobody ever made. Those sessions are counted
 * and named as UNATTRIBUTED instead of being folded into somebody's bill.
 *
 * ‼️ AND A DAY IS A DAY, NOT A SESSION. `SessionInfo.daily` already holds each
 * day's own cost and weighted tokens, so a conversation that ran over midnight
 * is split where it really fell. Where an engine's parser writes no daily
 * buckets the session can still be counted WHOLE — but only when its whole span
 * is inside the window, because slicing a total by a ratio would be an invented
 * figure. What cannot be placed is reported as `unsplit` rather than dropped:
 * a surface that quietly loses rows is worse than one that says how many.
 *
 * ‼️ AND ZERO IS NOT FREE (X-19). An engine that states no price yields
 * `cost: 0`, which means "no figure", never "nothing was spent". Each row
 * carries how many of its sessions came from such an engine, so a card can say
 * so instead of printing a confident $0.00.
 *
 * Pure — no vscode, no I/O, no clock of its own.
 */

import { dayKey } from './util';

/** What this module needs off a session; `SessionInfo` satisfies it. */
export interface SpendSession {
    sessionId: string;
    /** The engine; absence means Claude, the same absence the index uses. */
    source?: string;
    cost: number;
    wTokens: number;
    firstTs: number;
    lastTs: number;
    daily?: Record<string, { cost: number; wTokens: number }>;
    isSidechain?: boolean;
    /** Set on an import row whose work is already counted under the canonical. */
    aliasOf?: string;
}

/** The sign-in a session ran on, as the one reader answers it. */
export interface SpendAccount {
    id: string;
    label?: string;
}

export interface AccountSpendRow {
    account: string;
    label: string;
    /** Engines seen under this account — one in every ordinary case. */
    engines: string[];
    cost: number;
    wTokens: number;
    sessions: number;
    /** Sessions whose engine publishes no price: their 0 is not a zero. */
    unpriced: number;
    /** Sessions that could not be placed in the window by day (see the header). */
    unsplit: number;
    lastTs: number;
}

export interface AccountSpendReport {
    rows: AccountSpendRow[];
    /** Sessions with no manifest — never folded into an account. */
    unattributed: AccountSpendRow;
    from: string;
    to: string;
}

export interface SpendWindow {
    /** Inclusive local day keys. Both absent = every day there is. */
    from?: string;
    to?: string;
}

const UNATTRIBUTED = '';

function blank(account: string, label: string): AccountSpendRow {
    return {
        account, label, engines: [],
        cost: 0, wTokens: 0, sessions: 0, unpriced: 0, unsplit: 0, lastTs: 0
    };
}

const inWindow = (day: string, w: SpendWindow): boolean =>
    (!w.from || day >= w.from) && (!w.to || day <= w.to);

/**
 * Group spend by the sign-in that paid for it.
 *
 * `pricedEngine` answers "does this engine state a price at all" — handed in
 * because the engine table lives beside vscode and this file does not. Absence
 * treats every engine as priced, which is what a test wants and what the
 * caller's own default already is.
 */
export function spendByAccount(
    sessions: readonly SpendSession[],
    accountOf: (s: SpendSession) => SpendAccount | undefined,
    window: SpendWindow = {},
    pricedEngine: (engine: string) => boolean = () => true
): AccountSpendReport {
    const byAccount = new Map<string, AccountSpendRow>();
    const unattributed = blank(UNATTRIBUTED, 'not attributed');

    for (const s of sessions) {
        // An alias is the same work counted once already, and a sidechain is a
        // sub-agent's leg of a turn the parent row has in full.
        if (s.isSidechain || s.aliasOf) { continue; }

        const engine = s.source || 'claude';
        const days = Object.entries(s.daily ?? {});
        let cost = 0, wTokens = 0, counted = false, unsplit = false;
        if (days.length) {
            for (const [day, b] of days) {
                if (!inWindow(day, window)) { continue; }
                cost += b.cost;
                wTokens += b.wTokens;
                counted = true;
            }
        } else {
            // No day buckets: the session counts whole or not at all.
            const first = dayKey(s.firstTs), last = dayKey(s.lastTs);
            if (inWindow(first, window) && inWindow(last, window)) {
                cost = s.cost; wTokens = s.wTokens; counted = true;
            } else if (inWindow(first, window) || inWindow(last, window)) {
                unsplit = true;
            }
        }
        // ‼️ THE ROW IS CREATED ONLY ONCE THERE IS SOMETHING TO PUT IN IT. Doing
        // it earlier drew an empty sign-in on every window the account did not
        // touch — "spent nothing today" and "was not here today" are different
        // answers and the first one is the misleading one.
        if (!counted && !unsplit) { continue; }
        const acct = accountOf(s);
        const key = acct?.id?.trim() || UNATTRIBUTED;
        let row = unattributed;
        if (key) {
            row = byAccount.get(key) ?? blank(key, acct?.label?.trim() || key);
            byAccount.set(key, row);
        }

        if (!row.engines.includes(engine)) { row.engines.push(engine); }
        row.lastTs = Math.max(row.lastTs, s.lastTs);
        if (unsplit) { row.unsplit++; continue; }
        row.cost += cost;
        row.wTokens += wTokens;
        row.sessions++;
        if (!pricedEngine(engine)) { row.unpriced++; }
    }

    const rows = [...byAccount.values()].sort((a, b) =>
        b.cost - a.cost || b.wTokens - a.wTokens || a.account.localeCompare(b.account));
    for (const r of rows) { r.engines.sort(); }
    unattributed.engines.sort();
    return { rows, unattributed, from: window.from ?? '', to: window.to ?? '' };
}

/** The window a card means by "today" — one local day, as `daily` keys it. */
export function todayWindow(now: number): SpendWindow {
    const d = dayKey(now);
    return { from: d, to: d };
}

/** The window a page means by "the last N days", today included. */
export function lastDaysWindow(now: number, days: number): SpendWindow {
    const span = Math.max(1, Math.floor(days));
    return { from: dayKey(now - (span - 1) * 86_400_000), to: dayKey(now) };
}
