/**
 * What the phone hears: the farm's own state changes turned into the remote
 * contract's events (src/remote/contract), each source with its own memo so a
 * fact is said once. Pure — the extension feeds it the Console states, the
 * Needs You rows and the usage readings it already has.
 *
 * Questions come from the Console (they are answered with console.answer);
 * permissions come from Needs You, because that queue holds every engine's
 * and every terminal's waits and is what needs.act answers by key.
 *
 * A wait that ends — answered at the desk, on Telegram or on the phone, or
 * withdrawn — is said too (ask.closed / permission.closed), so its alert
 * leaves every phone rather than only the one that answered it.
 *
 * U-217 — what a phone reads aloud rides on the event (`spoken`, from
 * `remoteSpoken.ts`); `ui` is the interface's language, for a text with no sign
 * of its own.
 */
import { askFrom, type SpokenAsk } from './askSpoken';
import type { ConsoleSessionState } from './consoleproto';
import { blockingCount, needKey, type NeedItem } from './needs';
import { askSpokenOf, noticeSpoken, turnSpoken, withSpoken } from './remoteSpoken';
import { digestEvents, EMPTY_MEMO, forgetMemo, turnText, turnTitle, type DigestMemo } from './telegramDigest';

export interface RemoteEvent { type: string; data: Record<string, unknown> }

const SUMMARY_MAX = 400;

// ---- Console: turn.finished, ask.opened, ask.closed, session.ended ------------

/** `asks`: the question each card's phone alert is up for, by card id. */
export interface ConsoleMemo { digest: DigestMemo; agent: Record<string, string>; asks: Record<string, string> }
export const EMPTY_CONSOLE_MEMO: ConsoleMemo = { digest: EMPTY_MEMO, agent: {}, asks: {} };

function summaryOf(state: ConsoleSessionState): string {
    const text = turnText(state).join('\n\n').trim();
    return text.length > SUMMARY_MAX ? '…' + text.slice(text.length - SUMMARY_MAX + 1) : text;
}

/** A Console card changed (`state`) or went away (`undefined`). */
export function consoleEvents(memo: ConsoleMemo, id: string, state: ConsoleSessionState | undefined, liveIds: string[], ui = ''
): { memo: ConsoleMemo; events: RemoteEvent[] } {
    if (!state) {
        const agent = memo.agent[id];
        const rest = { ...memo.agent };
        delete rest[id];
        // session.ended takes the card's alerts down on its own; its question needs no ask.closed
        const asks = { ...memo.asks };
        delete asks[id];
        const next = { digest: forgetMemo(memo.digest, liveIds), agent: rest, asks };
        return { memo: next, events: agent === undefined ? [] : [{ type: 'session.ended', data: { session: id, agent } }] };
    }
    const r = digestEvents(memo.digest, state);
    const events: RemoteEvent[] = [];
    const asks = { ...memo.asks };
    const up = asks[id];
    if (up !== undefined && state.pendingAsk?.requestId !== up) {
        events.push({ type: 'ask.closed', data: { session: id, askId: up } });
        delete asks[id];
    }
    for (const e of r.events) {
        if (e === 'turn') {
            // the PC reads what the turn ENDED with, not every step before it
            const said = turnText(state).pop() ?? '';
            events.push({ type: 'turn.finished', data: {
                session: id, agent: state.agentName, title: turnTitle(state) || state.agentName, summary: summaryOf(state),
                ...withSpoken(turnSpoken(said, ui))
            } });
        }
        const ask = state.pendingAsk;
        if (e === 'ask' && ask && ask.questions.length) {
            const q = ask.questions[0];
            events.push({ type: 'ask.opened', data: {
                session: id, agent: state.agentName, askId: ask.requestId, question: q.question,
                // a many-question ask cannot be answered by one tap: the phone opens the app
                options: ask.questions.length === 1 ? q.options.map(o => ({ label: o.label })) : [],
                ...withSpoken(askSpokenOf('ask.opened', state.agentName, askFrom(ask), ui))
            } });
            asks[id] = ask.requestId;
        }
    }
    return { memo: { digest: r.memo, agent: { ...memo.agent, [id]: state.agentName }, asks }, events };
}

// ---- Needs You: needs.changed, permission.opened, permission.closed ----------

/** `perms`: the permission rows announced and still open, key → session. */
export interface NeedsMemo { count: number; perms: Record<string, string> }
export const EMPTY_NEEDS_MEMO: NeedsMemo = { count: -1, perms: {} };

function permissionTool(detail: string): string {
    return /\bto use ([\w.:-]+)/i.exec(detail)?.[1] ?? /^([\w.-]+)[:(]/.exec(detail)?.[1] ?? '';
}

/**
 * `askOf`: what the session is stopped on, as the PC's reader knows it (the
 * Console card, else its last tool start) — the row itself names only the tool.
 */
export function needsEvents(memo: NeedsMemo, items: NeedItem[], ui = '', askOf?: (sessionId: string) => SpokenAsk | undefined
): { memo: NeedsMemo; events: RemoteEvent[] } {
    const events: RemoteEvent[] = [];
    const count = blockingCount(items);
    const perms = items.filter(i => i.kind === 'permission');
    const now: Record<string, string> = {};
    for (const p of perms) { now[needKey(p)] = p.ref.sessionId ?? ''; }
    for (const [key, session] of Object.entries(memo.perms)) {
        if (!(key in now)) { events.push({ type: 'permission.closed', data: { session, permId: key } }); }
    }
    for (const p of perms) {
        const key = needKey(p);
        if (key in memo.perms) { continue; }
        const session = p.ref.sessionId ?? '';
        const tool = permissionTool(p.detail ?? '');
        const seen = session ? askOf?.(session) : undefined;
        const ask = seen && (seen.questions.length || seen.tool) ? seen : askFrom(undefined, tool);
        events.push({ type: 'permission.opened', data: {
            session, agent: p.agentName ?? '', permId: key, tool, summary: p.detail || p.title, key,
            ...withSpoken(askSpokenOf('permission.opened', p.agentName ?? '', ask, ui))
        } });
    }
    if (count !== memo.count) {
        const top = items[0];
        events.push({ type: 'needs.changed', data: top
            ? { count, top: { kind: top.kind, title: top.title } }
            : { count } });
    }
    return { memo: { count, perms: now }, events };
}

// ---- Usage: quota.warn --------------------------------------------------------

/** Warned once per slot per climb: falling back under the line re-arms it. */
export interface QuotaMemo { warned: Record<string, boolean> }
export const EMPTY_QUOTA_MEMO: QuotaMemo = { warned: {} };

export function quotaEvents(memo: QuotaMemo, reading: { slotId: string; engine: string; percent: number | undefined; window: string },
    threshold: number): { memo: QuotaMemo; events: RemoteEvent[] } {
    const p = reading.percent;
    if (p === undefined || !Number.isFinite(p)) { return { memo, events: [] }; }
    const over = p >= threshold;
    const was = memo.warned[reading.slotId] === true;
    if (over === was) { return { memo, events: [] }; }
    const memoNext = { warned: { ...memo.warned, [reading.slotId]: over } };
    return { memo: memoNext, events: over
        ? [{ type: 'quota.warn', data: { engine: reading.engine, percent: Math.round(p), window: reading.window } }]
        : [] };
}

// ---- Notices: notice.posted --------------------------------------------------

/** The five-hour line a phone is warned at: the handover default, where work stops. */
export const QUOTA_WARN_PCT = 90;

export function noticeEvent(n: { id: string; title: string; level: number; agentName: string }, ui = ''): RemoteEvent {
    return { type: 'notice.posted', data: {
        id: n.id, title: n.title, level: n.level, agent: n.agentName, ...withSpoken(noticeSpoken(n.title, ui))
    } };
}
