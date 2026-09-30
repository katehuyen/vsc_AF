/**
 * What the phone hears: the farm's own state changes turned into the remote
 * contract's events (src/remote/contract), each source with its own memo so a
 * fact is said once. Pure — the extension feeds it the Console states, the
 * Needs You rows and the usage readings it already has.
 *
 * Questions come from the Console (they are answered with console.answer);
 * permissions come from Needs You, because that queue holds every engine's
 * and every terminal's waits and is what needs.act answers by key.
 */
import type { ConsoleSessionState } from './consoleproto';
import { blockingCount, needKey, type NeedItem } from './needs';
import { digestEvents, EMPTY_MEMO, forgetMemo, turnText, turnTitle, type DigestMemo } from './telegramDigest';

export interface RemoteEvent { type: string; data: Record<string, unknown> }

const SUMMARY_MAX = 400;

// ---- Console: turn.finished, ask.opened, session.ended ----------------------

export interface ConsoleMemo { digest: DigestMemo; agent: Record<string, string> }
export const EMPTY_CONSOLE_MEMO: ConsoleMemo = { digest: EMPTY_MEMO, agent: {} };

function summaryOf(state: ConsoleSessionState): string {
    const text = turnText(state).join('\n\n').trim();
    return text.length > SUMMARY_MAX ? '…' + text.slice(text.length - SUMMARY_MAX + 1) : text;
}

/** A Console card changed (`state`) or went away (`undefined`). */
export function consoleEvents(memo: ConsoleMemo, id: string, state: ConsoleSessionState | undefined, liveIds: string[]
): { memo: ConsoleMemo; events: RemoteEvent[] } {
    if (!state) {
        const agent = memo.agent[id];
        const rest = { ...memo.agent };
        delete rest[id];
        const next = { digest: forgetMemo(memo.digest, liveIds), agent: rest };
        return { memo: next, events: agent === undefined ? [] : [{ type: 'session.ended', data: { session: id, agent } }] };
    }
    const r = digestEvents(memo.digest, state);
    const events: RemoteEvent[] = [];
    for (const e of r.events) {
        if (e === 'turn') {
            events.push({ type: 'turn.finished', data: {
                session: id, agent: state.agentName, title: turnTitle(state) || state.agentName, summary: summaryOf(state)
            } });
        }
        const ask = state.pendingAsk;
        if (e === 'ask' && ask && ask.questions.length) {
            const q = ask.questions[0];
            events.push({ type: 'ask.opened', data: {
                session: id, agent: state.agentName, askId: ask.requestId, question: q.question,
                // a many-question ask cannot be answered by one tap: the phone opens the app
                options: ask.questions.length === 1 ? q.options.map(o => ({ label: o.label })) : []
            } });
        }
    }
    return { memo: { digest: r.memo, agent: { ...memo.agent, [id]: state.agentName } }, events };
}

// ---- Needs You: needs.changed, permission.opened -----------------------------

export interface NeedsMemo { count: number; perms: string[] }
export const EMPTY_NEEDS_MEMO: NeedsMemo = { count: -1, perms: [] };

function permissionTool(detail: string): string {
    return /\bto use ([\w.:-]+)/i.exec(detail)?.[1] ?? /^([\w.-]+)[:(]/.exec(detail)?.[1] ?? '';
}

export function needsEvents(memo: NeedsMemo, items: NeedItem[]): { memo: NeedsMemo; events: RemoteEvent[] } {
    const events: RemoteEvent[] = [];
    const count = blockingCount(items);
    const perms = items.filter(i => i.kind === 'permission');
    const known = new Set(memo.perms);
    for (const p of perms) {
        const key = needKey(p);
        if (known.has(key)) { continue; }
        events.push({ type: 'permission.opened', data: {
            session: p.ref.sessionId ?? '', agent: p.agentName ?? '', permId: key,
            tool: permissionTool(p.detail ?? ''), summary: p.detail || p.title, key
        } });
    }
    if (count !== memo.count) {
        const top = items[0];
        events.push({ type: 'needs.changed', data: top
            ? { count, top: { kind: top.kind, title: top.title } }
            : { count } });
    }
    return { memo: { count, perms: perms.map(needKey) }, events };
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

export function noticeEvent(n: { id: string; title: string; level: number; agentName: string }): RemoteEvent {
    return { type: 'notice.posted', data: { id: n.id, title: n.title, level: n.level, agent: n.agentName } };
}
