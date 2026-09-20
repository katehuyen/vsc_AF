/**
 * U-113 — WHICH CONVERSATION A PHONE MESSAGE IS FOR.
 *
 * The chat bridge could talk to ONE agent: `/agent <name>` bound the chat and
 * everything after it went there. On a farm running three conversations at
 * once that is not a missing feature, it is a wrong answer — a message typed
 * about one of them lands in another, and the reader has no way to see that it
 * did until the wrong agent has already acted on it.
 *
 * Telegram answers the question twice before we have to guess, so the engine
 * reads what is already there before it falls back to a remembered choice:
 *
 *   1. **The reply chain.** Every turn the bot sends out is remembered against
 *      the conversation it came from. A reply to that message names its target
 *      exactly — no state, no guess, and it still works months later as long
 *      as the mapping is alive.
 *   2. **The forum topic.** A group in Forum mode gives each conversation a
 *      thread of its own, and every message typed in it carries the thread's
 *      id. The reader is already pointing at the conversation by typing where
 *      they typed.
 *   3. **The focus.** A plain message in a plain chat has neither, so it goes
 *      to the conversation the reader last chose. When there is no such choice
 *      and more than one conversation could be meant, the engine REFUSES and
 *      hands back the candidates — a bridge that guesses here is a bridge that
 *      sends a "yes, do it" to the wrong agent.
 *
 * ‼️ AND AMBIGUOUS IS AN ANSWER, NOT A FAILURE. The one outcome this module
 * exists to make impossible is a confident wrong target, so `resolve` has a
 * third outcome beside hit and miss, and the caller is expected to ask.
 *
 * Pure: no io, no Telegram types, no clock of its own. The transport is
 * `telegram.ts`, the rules of the channel are `messaging.ts`.
 */

/** A conversation this chat can be talking to. */
export interface RoutableSession {
    /** the Console host id — what a caller acts on */
    id: string;
    /** the engine's own session id, when it has one yet */
    sessionId?: string;
    agentId: string;
    agentName: string;
    /** '' when the session is under no project */
    project?: string;
    /** idle = waiting for a prompt; working = mid-turn */
    status?: string;
    /** last activity, epoch ms — the tie-break when nothing else decides */
    lastTs?: number;
    /** U-116 — how many turns it has had, for the list a reader scans */
    turns?: number;
    /** U-116 — what it has stopped for, when it has: the reason to open it */
    waiting?: string;
}

/**
 * What the chat has learned about who is talking to whom.
 *
 * Plain data on purpose: it is small, it is worth keeping across a reload, and
 * a store that can be written to a settings value cannot develop a second
 * source of truth inside an object nobody can print.
 */
export interface RoutingTable {
    /** outgoing Telegram message id → the conversation it was sent from */
    byMessage: Record<string, string>;
    /** forum topic (message_thread_id) → the conversation it belongs to */
    byTopic: Record<string, string>;
    /** chat id → the conversation plain messages go to */
    focus: Record<string, string>;
}

export const EMPTY_ROUTING: RoutingTable = { byMessage: {}, byTopic: {}, focus: {} };

/**
 * ‼️ THE REPLY MAP IS BOUNDED. Every turn the bot sends adds an entry, so an
 * unbounded map is a memory leak with a long fuse — and the oldest entries are
 * the ones nobody will reply to. The newest N survive; N is generous because
 * an entry is two short strings and a reader scrolling back a week is exactly
 * the case this layer exists for.
 */
export const REPLY_MEMORY = 500;

/** U-114 — `button`: a tap on a card the bot sent for that conversation */
export type RouteWhy = 'reply' | 'topic' | 'focus' | 'only-one' | 'button';

export type Routed =
    /** the target is known, and `why` says which layer answered */
    | { kind: 'session'; id: string; why: RouteWhy }
    /** several could be meant and nothing chose — ASK, never guess */
    | { kind: 'ambiguous'; candidates: RoutableSession[] }
    /** there is nothing to route to at all */
    | { kind: 'none' };

/** The message shape this engine needs — a subset of `InboundMessage`, stated
 *  structurally so the routing layer never has to know about the transport. */
export interface RoutableMessage {
    chatId: number;
    replyTo?: number;
    threadId?: number;
}

/**
 * Remember that a turn from `sessionId` went out as Telegram message
 * `messageId`, so a reply to it comes back to the same conversation.
 *
 * Returns a NEW table: the caller decides when to persist, and a routing table
 * mutated in place is one an open settings page cannot notice.
 */
export function rememberOutgoing(
    table: RoutingTable, messageId: number, sessionId: string, limit = REPLY_MEMORY
): RoutingTable {
    if (!(messageId > 0) || !sessionId) { return table; }
    const byMessage = { ...table.byMessage, [String(messageId)]: sessionId };
    // Telegram message ids rise within a chat, so "newest" is "largest" and no
    // clock has to be carried beside them.
    const keys = Object.keys(byMessage);
    if (keys.length > limit) {
        const keep = keys.map(Number).sort((a, b) => b - a).slice(0, limit);
        const kept: Record<string, string> = {};
        for (const k of keep) { kept[String(k)] = byMessage[String(k)]; }
        return { ...table, byMessage: kept };
    }
    return { ...table, byMessage };
}

/** Bind a forum topic to a conversation — the Topics mode of layer 2. */
export function rememberTopic(table: RoutingTable, threadId: number, sessionId: string): RoutingTable {
    if (!(threadId > 0) || !sessionId) { return table; }
    return { ...table, byTopic: { ...table.byTopic, [String(threadId)]: sessionId } };
}

/** The conversation plain messages from this chat go to. '' clears it. */
export function setFocus(table: RoutingTable, chatId: number, sessionId: string): RoutingTable {
    const focus = { ...table.focus };
    if (sessionId) { focus[String(chatId)] = sessionId; } else { delete focus[String(chatId)]; }
    return { ...table, focus };
}

/**
 * ‼️ A CONVERSATION THAT ENDED MUST NOT KEEP ITS SEAT. A stale id in any of the
 * three maps routes a message into nothing — and the reader is told their
 * instruction went somewhere. Called with the sessions that still exist.
 */
export function forgetGone(table: RoutingTable, sessions: RoutableSession[]): RoutingTable {
    const live = new Set(sessions.map(s => s.id));
    const prune = (m: Record<string, string>) => {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(m)) { if (live.has(v)) { out[k] = v; } }
        return out;
    };
    return { byMessage: prune(table.byMessage), byTopic: prune(table.byTopic), focus: prune(table.focus) };
}

/**
 * The three layers, in the order that needs the least guessing.
 *
 * `sessions` is what exists right now, so a remembered id that has since ended
 * is not returned as a hit — the layer below gets its turn instead of the
 * reader being told their message reached a conversation that is gone.
 */
export function resolve(
    table: RoutingTable, msg: RoutableMessage, sessions: RoutableSession[]
): Routed {
    const live = new Map(sessions.map(s => [s.id, s]));
    const hit = (id: string | undefined, why: RouteWhy): Routed | undefined =>
        id && live.has(id) ? { kind: 'session', id, why } : undefined;

    if (!sessions.length) { return { kind: 'none' }; }
    return hit(msg.replyTo !== undefined ? table.byMessage[String(msg.replyTo)] : undefined, 'reply')
        ?? hit(msg.threadId !== undefined ? table.byTopic[String(msg.threadId)] : undefined, 'topic')
        ?? hit(table.focus[String(msg.chatId)], 'focus')
        // ‼️ ONE CONVERSATION IS NOT A CHOICE. Asking "which of these one" is
        // the kind of correctness that reads as a broken bridge.
        ?? (sessions.length === 1
            ? { kind: 'session', id: sessions[0].id, why: 'only-one' }
            : { kind: 'ambiguous', candidates: sessions });
}

/**
 * How a conversation is named where there is one line to name it in.
 *
 * SHORTHAND — agent first because that is what the reader steers by, then the
 * project only when there is one, then the state only when it is not the
 * ordinary one. A row that says `developer · AgentFarm · working` and one that
 * says `developer` are the same shape; the second simply had nothing to add.
 */
export function sessionLabel(s: RoutableSession): string {
    return [s.agentName || s.agentId, s.project || '', s.status === 'working' ? 'working' : '']
        .filter(Boolean).join(' · ');
}

/**
 * The question asked instead of guessing, with its numbered choices.
 *
 * Numbered rather than named: two sessions of one agent are the case this
 * whole item exists for, and "developer or developer?" is not a question.
 */
export function askWhich(candidates: RoutableSession[]): string {
    return [
        'Which conversation is that for?',
        ...candidates.map((s, i) => `${i + 1}. ${sessionLabel(s)}`),
        '',
        'Reply to the message you want to answer, or send /focus <number>.'
    ].join('\n');
}

/**
 * `/sessions` — the same numbering `askWhich` uses, because the reader is
 * expected to answer one with the other and two numbering schemes for one list
 * is the bug this whole module exists to avoid. The conversation in focus is
 * marked rather than moved: its number must not change under the reader's
 * fingers between reading the list and typing the number.
 */
export function sessionList(sessions: RoutableSession[], focusId?: string): string {
    if (!sessions.length) { return 'No live conversations. Send a message to start a headless run instead.'; }
    return [
        `${sessions.length} live conversation${sessions.length === 1 ? '' : 's'}:`,
        // U-116 — the row says where the conversation GOT TO, not only who it
        // is: a turn count to see it moving, and what it has stopped for, which
        // is the one thing on this screen worth opening a laptop for.
        ...sessions.map((s, i) => `${i + 1}. ${sessionLabel(s)}`
            + (s.turns ? ` · turn ${s.turns}` : '')
            + (s.waiting ? ` · ⏳ ${s.waiting}` : '')
            + (s.id === focusId ? '  ← focus' : '')),
        '',
        'Reply to one of my messages to answer it, or /focus <number>.'
    ].join('\n');
}

/**
 * `/focus 2`, `/focus developer`, `/focus <host id>` — one door, because the
 * reader does not know which of the three they are holding.
 *
 * Returns the chosen session, or the candidates that matched when the word
 * fits more than one (the same refusal `resolve` gives, for the same reason).
 */
export function pickFocus(
    arg: string, sessions: RoutableSession[]
): { kind: 'session'; session: RoutableSession } | { kind: 'ambiguous'; candidates: RoutableSession[] } | { kind: 'none' } {
    const want = String(arg ?? '').trim();
    if (!want || !sessions.length) { return { kind: 'none' }; }
    const n = /^\d+$/.test(want) ? Number(want) : 0;
    if (n >= 1 && n <= sessions.length) { return { kind: 'session', session: sessions[n - 1] }; }
    const exact = sessions.find(s => s.id === want || s.sessionId === want);
    if (exact) { return { kind: 'session', session: exact }; }
    const low = want.toLowerCase();
    const byAgent = sessions.filter(s =>
        (s.agentName || '').toLowerCase() === low || (s.agentId || '').toLowerCase() === low);
    if (byAgent.length === 1) { return { kind: 'session', session: byAgent[0] }; }
    if (byAgent.length > 1) { return { kind: 'ambiguous', candidates: byAgent }; }
    return { kind: 'none' };
}

/**
 * The name a forum topic is opened with — `🧵 developer · AgentFarm`.
 *
 * Telegram caps a topic name at 128 characters and refuses the call outright
 * past it, which would take the whole thread down with it rather than the
 * name; so it is cut here, where the cut can be seen.
 */
export function topicName(s: RoutableSession): string {
    const name = '🧵 ' + [s.agentName || s.agentId, s.project || ''].filter(Boolean).join(' · ');
    return name.length <= 128 ? name : name.slice(0, 127) + '…';
}
