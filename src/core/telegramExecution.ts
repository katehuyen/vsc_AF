import { addSpend, SpendLedger, withinBudget } from './messaging';
import { DigestKeyboard } from './telegramDigest';
import { fmtUSD } from './util';

/**
 * U-115 — WHAT HAPPENS TO A SENTENCE TYPED ON A PHONE, decided before
 * anything is written into a conversation. Four gates, in this order, and the
 * order is the design:
 *
 *  1. the conversation is still there   — otherwise nothing else matters
 *  2. today's money                     — a cap that is checked after the turn
 *                                         started is not a cap
 *  3. what the sentence would DO        — a destructive command typed with a
 *                                         thumb gets one question first
 *  4. whether a turn is running         — from a phone the reader cannot see
 *                                         what the agent is in the middle of,
 *                                         so the default is to WAIT, not to
 *                                         steer (the umbrella's own concern 3)
 *
 * ‼️ AND THE QUEUE LIVES HERE, NOT IN THE CONVERSATION. `ConsoleHost` has a
 * queue of its own, but it is in memory and an extension host restart throws
 * it away — measured: nothing in the revive path carries it. A message a
 * reader sent from a bus stop and was told was "queued" must still be there
 * after a reload, so the phone's queue is part of the chat state that is
 * already persisted, and it is released by the same turn-end signal the digest
 * card rides on.
 */

/**
 * A message from a phone, parked until the conversation can take it. `waived`
 * travels with it: a gate the reader already answered yes to must not be asked
 * again when the message is finally let in, or confirming a destructive
 * command on a busy conversation would cost two taps instead of one.
 */
/** `device` = sent from the phone app (X-446, core/remoteSay.ts): released into the conversation, not to a chat (`chat` is 0). */
export interface InboxItem { chat: number; text: string; at: number; waived?: Waived; device?: string }
/** session id → the messages waiting for it, oldest first */
export type Inbox = Record<string, InboxItem[]>;

export type ConfirmWhy = 'budget' | 'risk';
/**
 * Every gate the reader said yes to for ONE message. A yes is added to the
 * earlier ones, never put in their place: a message both over budget and
 * destructive is asked twice and then goes in — with one slot, confirming the
 * second gate forgot the first and the two questions took turns for ever.
 * A single value is what older saved state holds; it still reads.
 */
export type Waived = ConfirmWhy | readonly ConfirmWhy[];

export function waives(w: Waived | undefined, why: ConfirmWhy): boolean {
    return typeof w === 'string' ? w === why : !!w && w.includes(why);
}

export function waiverList(w: Waived | undefined): ConfirmWhy[] {
    return w === undefined ? [] : typeof w === 'string' ? [w] : [...w];
}

export function addWaiver(w: Waived | undefined, why: ConfirmWhy): ConfirmWhy[] {
    const all = waiverList(w);
    return all.includes(why) ? all : [...all, why];
}

/** A message stopped at a gate, waiting for the reader to say yes. `waived` = the yeses it already had. */
export interface PendingSend { session: string; text: string; why: ConfirmWhy; at: number; waived?: ConfirmWhy[] }
/** chat id → the one message that chat has waiting on a yes */
export type PendingSends = Record<string, PendingSend>;

export const INBOX_LIMIT = 10;

export type Verdict =
    | { do: 'gone' }
    | { do: 'confirm'; why: ConfirmWhy; note: string }
    | { do: 'hold'; note: string }
    | { do: 'send' };

/**
 * Commands that cannot be taken back. Matched on the SHAPE of the command, not
 * on intent: "clean up the temp files" is English and passes, `rm -rf /tmp` is
 * an instruction and stops. Guessing at intent would stop half the ordinary
 * sentences a reader types and still miss the one that mattered.
 */
const RISKY: { re: RegExp; what: string }[] = [
    { re: /\brm\s+-[a-zA-Z]*[rf]/, what: 'rm -rf' },
    { re: /\bgit\s+reset\s+--hard\b/i, what: 'git reset --hard' },
    { re: /\bgit\s+clean\s+-[a-zA-Z]*f/i, what: 'git clean -f' },
    { re: /\bgit\s+push\b[^\n]*(--force|-f\b)/i, what: 'git push --force' },
    { re: /\bgit\s+branch\s+-D\b/, what: 'git branch -D' },
    { re: /\bdrop\s+(table|database)\b/i, what: 'DROP TABLE' },
    { re: /\btruncate\s+table\b/i, what: 'TRUNCATE TABLE' },
    { re: /\bremove-item\b[^\n]*-recurse/i, what: 'Remove-Item -Recurse' },
    { re: /\bdel\s+\/[sqf]/i, what: 'del /s' },
    { re: /\bformat\s+[a-z]:/i, what: 'format <drive>' }
];

/** The name of the destructive thing this sentence would run, if any. */
export function riskyIntent(text: string): string | undefined {
    const t = String(text ?? '');
    return RISKY.find(r => r.re.test(t))?.what;
}

export interface VerdictInput {
    /** the conversation's status; undefined when it is no longer live */
    status?: string;
    turns: number;
    label: string;
    text: string;
    /** what a message meets when a turn is already running */
    whenBusy: 'queue' | 'steer';
    /** whether this engine can take words into a running turn at all */
    steerable: boolean;
    ledger: SpendLedger;
    capUSD: number;
    day: string;
    /** the gates the reader has already answered yes to */
    waived?: Waived;
}

export function inboundVerdict(a: VerdictInput): Verdict {
    if (!a.status || a.status === 'ended' || a.status === 'error') { return { do: 'gone' }; }
    const spent = a.ledger.day === a.day ? a.ledger.usd : 0;
    if (!waives(a.waived, 'budget') && !withinBudget(a.ledger, a.capUSD, a.day)) {
        return {
            do: 'confirm', why: 'budget',
            note: `💸 Today's phone budget is used up — ${fmtUSD(spent)} of ${fmtUSD(a.capUSD)}.\n`
                + `Run this turn anyway on ${a.label}?`
        };
    }
    const risk = waives(a.waived, 'risk') ? undefined : riskyIntent(a.text);
    if (risk) {
        return {
            do: 'confirm', why: 'risk',
            note: `⚠️ This asks for ${risk} on ${a.label}, which cannot be undone.\nRun it?`
        };
    }
    const busy = a.status === 'working' || a.status === 'starting';
    if (busy && !(a.whenBusy === 'steer' && a.steerable && a.status === 'working')) {
        return {
            do: 'hold',
            note: `⏸ ${a.label} is working (turn ${a.turns}). Queued — it goes in when this turn ends.`
        };
    }
    return { do: 'send' };
}

/** Park a message for a conversation that is busy. */
export function queueInbound(
    inbox: Inbox, session: string, item: InboxItem, limit = INBOX_LIMIT
): { inbox: Inbox; refused?: string } {
    const waiting = inbox[session] ?? [];
    if (waiting.length >= limit) {
        return { inbox, refused: `Already ${waiting.length} messages waiting for this conversation — let it work through them first.` };
    }
    return { inbox: { ...inbox, [session]: [...waiting, item] } };
}

/**
 * The next parked message, taken out. ONE at a time: each released message
 * starts a turn, so releasing the whole queue at a turn's end would pile
 * every message into one prompt and lose the order the reader wrote them in.
 */
export function releaseInbound(inbox: Inbox, session: string): { inbox: Inbox; item?: InboxItem } {
    const [head, ...rest] = inbox[session] ?? [];
    if (!head) { return { inbox }; }
    const next = { ...inbox };
    if (rest.length) { next[session] = rest; } else { delete next[session]; }
    return { inbox: next, item: head };
}

export function inboxCount(inbox: Inbox, session: string): number {
    return (inbox[session] ?? []).length;
}

/** Conversations that are gone take their parked messages with them. */
export function forgetInbox(inbox: Inbox, liveIds: string[]): Inbox {
    const live = new Set(liveIds);
    const next: Inbox = {};
    for (const [id, items] of Object.entries(inbox)) { if (live.has(id)) { next[id] = items; } }
    return next;
}

/**
 * What a conversation has cost SINCE THE PHONE LAST LOOKED. A console session
 * reports its total, not its turn, so the ledger is fed the difference and the
 * new total is remembered. Called once when the phone starts a turn (to set
 * the mark, the figure discarded) and once when that turn ends (to bill it).
 */
export function chargeTurn(
    seen: Record<string, number>, session: string, costUSD: number
): { seen: Record<string, number>; usd: number } {
    const before = seen[session];
    const usd = typeof before === 'number' ? Math.max(0, costUSD - before) : 0;
    return { seen: { ...seen, [session]: costUSD }, usd };
}

export function forgetSeen(seen: Record<string, number>, liveIds: string[]): Record<string, number> {
    const live = new Set(liveIds);
    const next: Record<string, number> = {};
    for (const [id, n] of Object.entries(seen)) { if (live.has(id)) { next[id] = n; } }
    return next;
}

/** The slice of the chat state a turn ending touches. */
export interface TurnEndState { ledger: SpendLedger; inbox: Inbox; seen: Record<string, number> }

/**
 * A TURN ENDING IS TWO THINGS TO THE PHONE, and neither of them is the card:
 * what the turn cost (billed against today's cap, so the cap counts the turns
 * the phone actually started) and what is waiting (the next parked message
 * comes out). Both happen whatever the digest setting says — a reader who was
 * told "queued" is owed the message going in even with the cards switched off.
 *
 * A conversation with no mark has never been driven from a phone: the farm's
 * own work is not the phone's spend, so it is neither billed nor marked here.
 */
export function turnEnded<T extends TurnEndState>(
    st: T, session: string, costUSD: number, day: string
): { state: T; release?: InboxItem; billedUSD: number } {
    let state = st, billedUSD = 0;
    if (st.seen[session] !== undefined) {
        const c = chargeTurn(st.seen, session, costUSD);
        billedUSD = c.usd;
        state = { ...state, seen: c.seen, ledger: addSpend(state.ledger, c.usd, day) };
    }
    const rel = releaseInbound(state.inbox, session);
    if (rel.item) { state = { ...state, inbox: rel.inbox }; }
    return { state, ...(rel.item ? { release: rel.item } : {}), billedUSD };
}

/** Yes / no under a message that was stopped at a gate. */
export function confirmKeyboard(session: string): DigestKeyboard {
    return [[
        { text: '✅ Run it', data: `n:${session}:go` },
        { text: '✖ Cancel', data: `n:${session}:no` }
    ]];
}
