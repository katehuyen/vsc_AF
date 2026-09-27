/**
 * U-114 — THE TURN, AS A CARD A PHONE CAN READ IN ONE LOOK.
 *
 * A Console turn is hundreds of lines of tool calls, file reads and figures;
 * a phone screen holds forty. What the reader on the phone needs is what the
 * agent SAID at the end of the turn, whether it is waiting on them, and what
 * it cost — three blocks, under Telegram's 4096-character ceiling, with the
 * decisions the turn is parked on drawn as BUTTONS rather than as words to
 * type back.
 *
 * Pure: every function here is a projection of `ConsoleSessionState`, so the
 * card, the keyboard and the "has anything happened since I last looked"
 * question are all measurable without a session, a bot or a network. The wire
 * (which chats hear it, what a tap does) is the extension's.
 *
 * ‼️ NO SUMMARISER. The "what was done" block is the agent's own closing text
 * of the turn — the summary it wrote for its user — not a second model's
 * paraphrase of it. A paraphrase costs a call per turn and can be wrong about
 * the one thing the reader is about to act on.
 */

import type { AutoAnswerView } from './autoAnswer';
import { ConsoleAsk, ConsoleSessionState } from './consoleproto';

/** Telegram's own ceiling on a message's text */
export const DIGEST_LIMIT = 4096;
/** Telegram's own ceiling on `callback_data`, in bytes */
export const CALLBACK_LIMIT = 64;
/** what the "done" block may take of the card, so the other two always fit */
const DONE_BUDGET = 2600;
const RULE = '──────────';

export interface DigestContext {
    /** the project's display name, when the session is under one */
    project?: string;
    /** does this engine state a price per turn (X-19)? false = plan-billed, say tokens */
    priced: boolean;
    /** K-45 — the pending question's clock: when it answers, or why none will */
    clock?: AutoAnswerView | null;
}

export interface DigestButton { text: string; data: string }
/** rows of buttons — Telegram's `inline_keyboard` shape */
export type DigestKeyboard = DigestButton[][];

/** What a tap means, decoded from `callback_data` (see `keyboardFor`). */
export type Tap =
    | { kind: 'continue' | 'cancel' | 'diff' | 'status'; id: string }
    /** an option of an AskUserQuestion — `rid` is the request's 8-char prefix */
    | { kind: 'option'; id: string; rid: string; question: number; option: number }
    /** a tool permission — the user's decision, from the user's own phone */
    | { kind: 'permission'; id: string; rid: string; allow: boolean }
    /** U-115 — yes/no under a message a gate stopped (telegramExecution.ts) */
    | { kind: 'confirm'; id: string; yes: boolean }
    /** U-116 — a row of /sessions, tapped to make it the focus */
    | { kind: 'focus'; id: string };

const rid8 = (requestId: string): string => requestId.slice(0, 8);

/** The agent's text of the turn that just ended: everything it said after the
 *  reader's last prompt, tool noise left out. */
export function turnText(state: ConsoleSessionState): string[] {
    const msgs = state.messages ?? [];
    let from = 0;
    for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'user') { from = i + 1; break; }
    }
    return msgs.slice(from)
        .filter(m => m.role === 'agent' && typeof m.text === 'string' && m.text.trim())
        .map(m => (m.text as string).trim());
}

/** The conversation's subject: the first thing the reader asked, one line. */
export function turnTitle(state: ConsoleSessionState): string {
    const first = (state.messages ?? []).find(m => m.role === 'user' && typeof m.text === 'string' && m.text.trim());
    const line = (first?.text ?? '').trim().split('\n')[0].trim();
    return line.length > 60 ? line.slice(0, 57) + '…' : line;
}

function fmtMs(ms: number): string {
    const s = Math.round(ms / 1000);
    if (s < 60) { return s + 's'; }
    const m = Math.floor(s / 60);
    return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function fmtTok(n: number): string {
    return n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
}

/**
 * The agent's closing words, kept whole where they fit. When they do not, the
 * END is kept: a turn's last paragraph is its verdict, and cutting the head
 * loses the setup while cutting the tail loses the answer.
 */
function doneBlock(texts: string[]): string {
    if (!texts.length) { return '(the agent said nothing in words this turn — tool work only)'; }
    const last = texts[texts.length - 1];
    let body = last.length <= DONE_BUDGET ? texts.join('\n\n') : last;
    if (body.length > DONE_BUDGET) { body = '…' + body.slice(body.length - DONE_BUDGET + 1); }
    return body;
}

function askBlock(ask: ConsoleAsk): string {
    if (ask.questions.length) {
        return ask.questions.map((q, i) =>
            (ask.questions.length > 1 ? `${i + 1}. ` : '') + q.question
            + (q.options.length ? '\n' + q.options.map(o => '   · ' + o.label).join('\n') : '')
        ).join('\n');
    }
    return `Permission: ${ask.displayName || ask.tool}` + (ask.detail ? `\n${ask.detail}` : '');
}

/** K-45 — a phone that says nothing about the clock leaves the reader guessing whether to hurry. */
function clockLine(v: AutoAnswerView | null | undefined): string {
    if (!v) { return ''; }
    if (v.state === 'armed') {
        const at = new Date(v.dueAt).toTimeString().slice(0, 5);
        return `\n⏳ Auto-answer at ${at} — then ${v.picks.map(p => `"${p}"`).join(', ')} is chosen for you.`;
    }
    if (v.state === 'held') { return '\n⏸ Timer stopped — this question waits for you.'; }
    return v.reason === 'none' ? '' : '\n⏸ No timer: ' + v.why.replace(/^waiting for you — /, '');
}

function statusBlock(state: ConsoleSessionState, clock?: AutoAnswerView | null): string {
    if (state.pendingAsk) { return '❓ WAITING ON YOU\n' + askBlock(state.pendingAsk) + clockLine(clock); }
    if (state.pendingPermission) {
        return '❓ WAITING ON YOU\nPermission refused: ' + state.pendingPermission.detail;
    }
    const o = state.lastTurn?.outcome;
    return '❓ STATUS\n' + (o === 'failed' ? 'The turn FAILED.'
        : o === 'interrupted' ? 'The turn was interrupted.'
            : state.status === 'working' ? 'Still working.'
                : 'Turn ended — waiting for your next instruction.');
}

function metricBlock(state: ConsoleSessionState, ctx: DigestContext): string {
    const t = state.lastTurn;
    const bits: string[] = [];
    if (t?.ms) { bits.push(fmtMs(t.ms)); }
    if (t?.tokens) { bits.push(fmtTok(t.tokens) + ' tok'); }
    // ‼️ X-19 — a plan-billed engine spends tokens, not dollars: an unstated
    // $0.00 reads as "that was free", so the price is said only where it is one.
    if (ctx.priced && t && t.cost > 0) { bits.push('$' + t.cost.toFixed(t.cost < 0.1 ? 3 : 2)); }
    if (t?.model) { bits.push(t.model); }
    return '⏱ ' + (bits.length ? bits.join(' · ') : 'no figures for this turn');
}

/** The card: header · done · status · metric, under the ceiling. */
export function digestText(state: ConsoleSessionState, ctx: DigestContext): string {
    const head = ['🤖 ' + state.agentName]
        .concat(ctx.project ? ['📁 ' + ctx.project] : [])
        .concat(turnTitle(state) ? ['🎯 ' + turnTitle(state)] : [])
        .concat(['Turn ' + (state.turns || 0)])
        .join(' · ');
    const parts = [head, RULE, '📝 DONE\n' + doneBlock(turnText(state)), RULE, statusBlock(state, ctx.clock), RULE, metricBlock(state, ctx)];
    let text = parts.join('\n');
    if (text.length > DIGEST_LIMIT) {
        // the done block is the only elastic one; take the overflow out of it
        const over = text.length - DIGEST_LIMIT + 1;
        const done = doneBlock(turnText(state));
        parts[2] = '📝 DONE\n…' + done.slice(over + 1);
        text = parts.join('\n');
    }
    return text;
}

/**
 * The buttons under the card. A question's options are buttons, one row each,
 * so the answer is a tap; a permission is Allow / Deny; and the four gestures
 * a reader has at the end of any turn stand under them. Every `data` is under
 * Telegram's 64-byte ceiling by construction — measured in the test.
 */
export function keyboardFor(state: ConsoleSessionState): DigestKeyboard {
    const id = state.id;
    const rows: DigestKeyboard = [];
    const ask = state.pendingAsk;
    if (ask?.questions.length) {
        ask.questions.forEach((q, qi) => {
            q.options.forEach((o, oi) => {
                const prefix = ask.questions.length > 1 ? `${qi + 1}: ` : '';
                rows.push([{ text: prefix + o.label, data: `q:${id}:${rid8(ask.requestId)}:${qi}:${oi}` }]);
            });
        });
    } else if (ask) {
        rows.push([
            { text: '✅ Allow', data: `p:${id}:${rid8(ask.requestId)}:allow` },
            { text: '🚫 Deny', data: `p:${id}:${rid8(ask.requestId)}:deny` }
        ]);
    }
    const live = state.status !== 'ended' && state.status !== 'error';
    if (live) {
        const row: DigestButton[] = [];
        if (!ask && state.status === 'idle') { row.push({ text: '✅ Continue', data: `c:${id}:continue` }); }
        if (state.status === 'working' || ask) { row.push({ text: '⏸ Cancel', data: `c:${id}:cancel` }); }
        row.push({ text: '📄 Diff', data: `c:${id}:diff` }, { text: '📊 Status', data: `c:${id}:status` });
        rows.push(row);
    }
    return rows;
}

/** `callback_data` → what was tapped; undefined for anything not ours. */
export function parseTap(data: string): Tap | undefined {
    const p = String(data || '').split(':');
    if (p[0] === 'c' && p.length === 3 && p[1]) {
        const kind = p[2];
        if (kind === 'continue' || kind === 'cancel' || kind === 'diff' || kind === 'status') { return { kind, id: p[1] }; }
        return undefined;
    }
    if (p[0] === 'q' && p.length === 5 && p[1] && p[2]) {
        const question = Number(p[3]), option = Number(p[4]);
        if (Number.isInteger(question) && Number.isInteger(option) && question >= 0 && option >= 0) {
            return { kind: 'option', id: p[1], rid: p[2], question, option };
        }
        return undefined;
    }
    if (p[0] === 'p' && p.length === 4 && p[1] && p[2] && (p[3] === 'allow' || p[3] === 'deny')) {
        return { kind: 'permission', id: p[1], rid: p[2], allow: p[3] === 'allow' };
    }
    if (p[0] === 'n' && p.length === 3 && p[1] && (p[2] === 'go' || p[2] === 'no')) {
        return { kind: 'confirm', id: p[1], yes: p[2] === 'go' };
    }
    if (p[0] === 'f' && p.length === 2 && p[1]) { return { kind: 'focus', id: p[1] }; }
    return undefined;
}

/** The decision an option tap comes to, against the ask that is pending NOW —
 *  a tap on yesterday's card must not answer today's question. */
export function tapAnswer(
    ask: ConsoleAsk | undefined, tap: Extract<Tap, { kind: 'option' }>
): { answers: Record<string, string>; label: string } | { refused: string } {
    if (!ask || rid8(ask.requestId) !== tap.rid) { return { refused: 'That question is no longer open.' }; }
    const q = ask.questions[tap.question];
    const o = q?.options[tap.option];
    if (!q || !o) { return { refused: 'That option is not on the question any more.' }; }
    return { answers: { [q.question]: o.label }, label: o.label };
}

/**
 * ‼️ WHAT HAPPENED SINCE THE LAST LOOK — per session, without a second
 * announcement. The host fires on every state change (a token, a tool line), so
 * the digest is keyed on the two facts a card is for: the turn's own end time
 * and the request id of the question it is parked on.
 *
 * A turn seen for the FIRST time seeds the memo silently: the extension host
 * starts with every card's last turn already ended, and re-announcing all of
 * them on every reload is noise. A question is different — an unanswered one
 * is actionable however it was found, so it fires on first sight too.
 */
export interface DigestMemo { turnAt: Record<string, number>; askId: Record<string, string> }
export const EMPTY_MEMO: DigestMemo = { turnAt: {}, askId: {} };

export function digestEvents(
    memo: DigestMemo, state: ConsoleSessionState
): { memo: DigestMemo; events: ('turn' | 'ask')[] } {
    const events: ('turn' | 'ask')[] = [];
    const turnAt = { ...memo.turnAt };
    const askId = { ...memo.askId };
    const ended = state.lastTurn?.endedAt ?? 0;
    if (ended && turnAt[state.id] === undefined) { turnAt[state.id] = ended; }
    else if (ended && ended !== turnAt[state.id]) { turnAt[state.id] = ended; events.push('turn'); }
    const rid = state.pendingAsk?.requestId ?? '';
    if (rid && askId[state.id] !== rid) { askId[state.id] = rid; events.push('ask'); }
    if (!rid && askId[state.id]) { delete askId[state.id]; }
    return { memo: { turnAt, askId }, events };
}

/** Drop what the host no longer has, so the memo does not grow with history (X-127). */
export function forgetMemo(memo: DigestMemo, liveIds: string[]): DigestMemo {
    const keep = new Set(liveIds);
    return {
        turnAt: Object.fromEntries(Object.entries(memo.turnAt).filter(([k]) => keep.has(k))),
        askId: Object.fromEntries(Object.entries(memo.askId).filter(([k]) => keep.has(k)))
    };
}
