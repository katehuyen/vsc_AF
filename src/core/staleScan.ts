/**
 * S-101 — WHAT IS STUCK: records a restart does not clear.
 *
 * Task rows, Console cards and relay batons are written to disk so that no work
 * is lost across a reload — which also means a row nobody will ever start, or a
 * card nobody will come back to, survives every restart. Measured 2026-09-25:
 * eight rows queued for 1–17 days, and a finished leg's row "running" and
 * holding its agent's seat. Anything waiting 24 hours or more is assumed stuck
 * (the user's rule); a shorter wait is somebody's pause and is left alone.
 *
 * Pure: snapshots and the clock come in, the list and the words go out.
 */
export const STALE_AFTER_MS = 24 * 3600 * 1000;

export type StaleKind = 'queued' | 'running' | 'baton' | 'card' | 'chain';

export interface StaleItem {
    kind: StaleKind;
    /** the task, card or baton id the cleanup acts on */
    id: string;
    title: string;
    /** when it last moved */
    since: number;
    ageMs: number;
    why: string;
    /** a running row's Console card: closed with it, never counted twice */
    cardId?: string;
}

export interface StaleTask {
    id: string; title?: string; status: string; createdAt: number; startedAt?: number;
    events?: { ts: number }[]; runSession?: string; hostedSessionId?: string;
}
export interface StaleCard { id: string; agentName?: string; status: string; sessionId?: string; startedAt: number; messages?: { ts: number }[] }
export interface StaleBaton { id: string; chainId: string; hop: number; state: string; updatedAt: number }
/** S-127 — a Chains-board row (chainBoard.ts ChainRow): its `hanging` signal is what the record shows stuck. */
export interface StaleChain { chainId: string; leg: number; agentName?: string; signals: readonly { kind: string; since?: number; why: string }[] }

export interface StaleInput {
    now: number;
    tasks: readonly StaleTask[];
    cards: readonly StaleCard[];
    batons: readonly StaleBaton[];
    chains?: readonly StaleChain[];
    afterMs?: number;
}

const LIVE_BATON = new Set(['armed', 'waiting-end', 'parked']);
const WAITING_TASK = new Set(['queued', 'parked', 'waiting']);

const lastOf = (xs: readonly { ts: number }[] | undefined, floor: number): number =>
    (xs ?? []).reduce((m, x) => (typeof x?.ts === 'number' && x.ts > m ? x.ts : m), floor);

const cardSince = (c: StaleCard): number => lastOf(c.messages, c.startedAt);

export function fmtAge(ms: number): string {
    const h = Math.floor(ms / 3600000);
    if (h < 24) { return `${Math.max(h, 0)}h`; }
    const d = Math.floor(h / 24);
    return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

/** Everything waiting at least `afterMs` (24 h), oldest first. A card or row that is working is never stuck. */
export function scanStale(i: StaleInput): StaleItem[] {
    const after = i.afterMs ?? STALE_AFTER_MS;
    const out: StaleItem[] = [];
    const push = (kind: StaleKind, id: string, title: string, since: number, why: string, cardId?: string) => {
        const ageMs = i.now - since;
        if (ageMs >= after) { out.push({ kind, id, title, since, ageMs, why, ...(cardId ? { cardId } : {}) }); }
    };
    const cardOf = (sid?: string) => (sid ? i.cards.find(c => c.sessionId === sid) : undefined);
    const heldCards = new Set<string>();
    for (const t of i.tasks) {
        const title = t.title || t.id;
        if (WAITING_TASK.has(t.status)) {
            push('queued', t.id, title, lastOf(t.events, t.createdAt), `${t.status}, never started`);
        } else if (t.status === 'running') {
            const card = cardOf(t.hostedSessionId || t.runSession);
            if (card) { heldCards.add(card.id); }
            if (card && card.status === 'working') { continue; }
            const since = Math.max(lastOf(t.events, t.startedAt ?? t.createdAt), card ? cardSince(card) : 0);
            push('running', t.id, title, since, card ? `running, its Console card ${card.status}` : 'running, no Console card holds it', card?.id);
        }
    }
    for (const c of i.cards) {
        if (heldCards.has(c.id) || c.status === 'working') { continue; }
        push('card', c.id, `${c.agentName || 'session'} ${String(c.sessionId || c.id).slice(0, 8)}`, cardSince(c), `Console card ${c.status}`);
    }
    for (const b of i.batons) {
        if (LIVE_BATON.has(b.state)) { push('baton', b.id, `chain ${b.chainId} hop ${b.hop}`, b.updatedAt, `baton ${b.state}`); }
    }
    // a started leg that ended (or sits idle) with no pass and no closing record has no live baton: only the board sees it
    for (const c of i.chains ?? []) {
        const h = c.signals.find(s => s.kind === 'hanging');
        if (h?.since !== undefined) { push('chain', c.chainId, `chain ${c.chainId} leg ${c.leg}${c.agentName ? ` (${c.agentName})` : ''}`, h.since, h.why); }
    }
    return out.sort((a, b) => a.since - b.since);
}

const LABEL: Record<StaleKind, string> = {
    queued: 'task rows queued and never started',
    running: 'task rows still "running" with nothing working',
    baton: 'relay batons still waiting',
    card: 'idle Console cards',
    chain: 'relay chains hanging with no pass and no closing record'
};

/** One line per kind: how many, the oldest. */
export function staleLines(items: readonly StaleItem[]): string[] {
    return (Object.keys(LABEL) as StaleKind[])
        .map(k => items.filter(x => x.kind === k))
        .filter(xs => xs.length)
        .map(xs => `${xs.length} ${LABEL[xs[0].kind]} — oldest ${fmtAge(Math.max(...xs.map(x => x.ageMs)))}`);
}

/** The notice: the counts, then every item with its age — at most once a day, however many things are open. */
export function staleNotice(items: readonly StaleItem[]): { title: string; body: string } {
    const title = `${items.length} thing${items.length === 1 ? '' : 's'} waiting 24h+ — possibly stuck`;
    const body = [
        'These have waited at least 24 hours. A restart does not clear them — they are kept on disk so no work is lost.',
        '',
        ...staleLines(items).map(l => `- ${l}`),
        '',
        '| What | Waiting | Why |',
        '|---|---|---|',
        ...items.slice(0, 30).map(x => `| ${x.title.replace(/\|/g, '/')} | ${fmtAge(x.ageMs)} | ${x.why} |`),
        ...(items.length > 30 ? [`| … ${items.length - 30} more | | |`] : []),
        '',
        'Clean up: the 🧹 item in the status bar, or Command Palette → "Agent Farm: Clean Up Stuck Items…" (review, pick, clean). '
        + 'Nothing is deleted: rows are cancelled, batons stopped, cards closed — a closed card\'s conversation can be resumed — '
        + 'and a hanging chain gets its closing record.'
    ].join('\n');
    return { title, body };
}

export interface StaleDeps {
    tasks: () => readonly StaleTask[];
    cards: () => readonly StaleCard[];
    batons: () => readonly StaleBaton[];
    /** S-127 — the Chains board's rows; absent = chains are not scanned */
    chains?: () => readonly StaleChain[];
    cancelTask: (id: string) => void;
    closeCard: (id: string) => void;
    stopBaton: (id: string, why: string) => void;
    /** writes the chain's closing record (chains.end without closing a session); throws when it refuses */
    endChain?: (chainId: string, by: string, why: string) => void;
    now?: () => number;
}

export interface CleanResult { cleaned: StaleItem[]; failed: { item: StaleItem; why: string }[] }

export function staleNow(d: StaleDeps): StaleItem[] {
    return scanStale({ now: (d.now ?? Date.now)(), tasks: d.tasks(), cards: d.cards(), batons: d.batons(), chains: d.chains?.() ?? [] });
}

/** Clean every stuck item, or only the ids named — one body for the chip, the notification and farm.cleanup. */
export function cleanStale(d: StaleDeps, ids?: readonly string[], by = 'the user'): CleanResult {
    const pick = new Set(ids ?? []);
    const out: CleanResult = { cleaned: [], failed: [] };
    for (const x of staleNow(d).filter(s => !ids || pick.has(s.id))) {
        try {
            if (x.kind === 'card') { d.closeCard(x.id); }
            else if (x.kind === 'chain') {
                if (!d.endChain) { throw new Error('this host cannot end a chain'); }
                d.endChain(x.id, `the stuck-items cleanup (${by})`, `hanging ${fmtAge(x.ageMs)}`);
            } else if (x.kind === 'baton') { d.stopBaton(x.id, `stopped by the stuck-items cleanup (${by}) — waiting ${fmtAge(x.ageMs)}`); }
            else {
                if (x.cardId) { d.closeCard(x.cardId); }
                d.cancelTask(x.id);
            }
            out.cleaned.push(x);
        } catch (e) { out.failed.push({ item: x, why: String((e as Error)?.message ?? e) }); }
    }
    return out;
}

/** At most one notice per day: the first once something is 24h old, the next only a full day after the last. */
export function shouldNotify(count: number, lastAt: number | undefined, now: number, afterMs = STALE_AFTER_MS): boolean {
    return count > 0 && (!lastAt || now - lastAt >= afterMs);
}
