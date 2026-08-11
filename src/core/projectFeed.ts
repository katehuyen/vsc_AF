/**
 * The project's feed — what happened, when, in one chronological list.
 *
 * A project owns almost no data of its own. Sessions, tasks, missions, commits
 * and file writes all live where they already lived; the project is the JOIN
 * over them. This module is that join, and it is deliberately **pure**: it takes
 * already-collected, already-filtered arrays and returns events. Nothing here
 * reads a file, spawns git, or knows what a `vscode` is — which is what makes
 * the merge testable without a window, and what stops the "which project does
 * this belong to?" judgment from leaking into twelve different places.
 *
 * ‼️ MEMBERSHIP IS THE CALLER'S JOB, NOT THIS MODULE'S.
 * The caller hands over what already belongs to the project. That is not
 * laziness — it is the only way the answer stays consistent with the resolution
 * order (`projects.ts`), which is the single source of truth for what belongs
 * to whom. A second membership rule living in here would disagree with it
 * within a week, and both answers would look plausible.
 *
 * **How each source knows which project it belongs to.** Sessions resolve
 * through the membership order; tasks, missions, notices and queue items carry
 * a `projectId` of their own; commits belong to a declared code root; decisions,
 * deliverables and completed plan items come out of the project's OWN folder,
 * so their membership is not a guess at all.
 *
 * ‼️ THE STAMP IS THE ONLY THING THAT SPEAKS FOR A NOTICE OR A QUEUE ITEM.
 * Faz 5 gave them a `projectId` — set by whoever posts, changeable and
 * removable from the row. What it did NOT do is derive one, and that is the
 * point: an agent works on several projects, so reading the poster's name and
 * guessing would be exactly the misattribution the entity model was rebuilt to
 * kill. An unstamped notice is absent from every project's feed, and that is
 * the honest answer rather than a plausible one.
 *
 * ‼️ A DOCUMENT EVENT NEEDS A REAL DATE OR IT DOES NOT APPEAR.
 * A decision states `af-date`; a deliverable row states its Date column; a plan
 * item carries the ✅ date the user's own Tasks plugin wrote when they ticked it
 * in Obsidian. Anything without one is left out rather than stamped with the
 * file's mtime — a hundred plan items all landing at the moment somebody saved
 * the file is a timeline that looks precise and says nothing.
 */

// ---------------------------------------------------------------------------
// the event
// ---------------------------------------------------------------------------

/**
 * Every source reduces to one of these. The list is closed on purpose: a
 * timeline whose vocabulary grows per source becomes a filter row nobody reads.
 */
export type ProjectEventKind =
    | 'session'      // a session ran (one event, spanning its life)
    | 'turn'         // one turn inside a session — the finest grain there is
    | 'task'         // a headless task reached a terminal state
    | 'mission'      // a mission run, or one of its rounds
    | 'commit'       // a git commit in one of the project's code roots
    | 'files'        // what a session wrote, aggregated — never one row per file
    | 'notice'       // a notice somebody filed under this project
    | 'queue'        // a work-queue item filed under this project
    | 'decision'     // a decision record in the project folder
    | 'deliverable'  // a row in the project's deliverables table
    | 'plan';        // a plan item the document records as completed

export const PROJECT_EVENT_KINDS: ProjectEventKind[] =
    ['session', 'turn', 'task', 'mission', 'commit', 'files',
        'notice', 'queue', 'decision', 'deliverable', 'plan'];

/**
 * Sources that exist but cannot yet say which project they belong to.
 *
 * Exported because the PAGE has to say so: a filter chip that can never light
 * up is a promise the product does not keep, and naming the gap is the
 * difference between "empty" and "broken".
 *
 * ‼️ EMPTY SINCE FAZ 5, AND THE LIST STAYS. Notices and queue items were the
 * two entries; both carry a `projectId` now. It is kept rather than deleted
 * because the honesty mechanism is the thing worth keeping — the next source
 * that arrives half-wired goes in here instead of quietly drawing a dead chip.
 */
export const UNFILED_EVENT_KINDS: ProjectEventKind[] = [];

/** What clicking a row opens. Kept as data rather than a command string so the
 *  page and the bridge can each do the right thing with it. */
export type ProjectLink =
    | { to: 'session'; sessionId: string; file?: string; ts?: number }
    | { to: 'task'; id: string }
    | { to: 'mission'; id: string }
    | { to: 'file'; path: string }
    | { to: 'commit'; repo: string; hash: string }
    | { to: 'notice'; id: string }
    | { to: 'queue'; id: string };

export interface ProjectEvent {
    ts: number;
    kind: ProjectEventKind;
    /** The thing itself, one line. */
    title: string;
    /** The second line — context the title does not already carry. */
    detail?: string;
    agent?: string;
    /** Dollars this event accounts for. Only where it is REAL: a turn's cost is
     *  the turn's, a session's is the session's, and the two must never be
     *  summed together (see `feedSpend`). */
    cost?: number;
    tone?: 'ok' | 'bad' | 'warn';
    link?: ProjectLink;
}

// ---------------------------------------------------------------------------
// inputs — the shapes the caller reduces its stores to
// ---------------------------------------------------------------------------

export interface FeedTurn {
    n: number;
    label: string;
    ts: number;
    cost: number;
    tokens: number;
    models: string[];
}

export interface FeedSession {
    sessionId: string;
    file?: string;
    title?: string;
    agentName?: string;
    firstTs: number;
    lastTs: number;
    cost: number;
    turns?: FeedTurn[];
    /** path → number of write calls, as the index already counts them */
    filesEdited?: Record<string, number>;
    models?: string[];
    /** day (YYYY-MM-DD) → dollars, for the cost series */
    daily?: Record<string, number>;
    /** the CLI has not closed it yet */
    live?: boolean;
}

export interface FeedTask {
    id: string;
    title: string;
    agentName?: string;
    status: string;
    createdAt: number;
    startedAt?: number;
    endedAt?: number;
    costUSD?: number;
    missionId?: string;
}

export interface FeedMissionRound {
    n: number;
    at: number;
    thought?: string;
    action?: string;
}

export interface FeedMission {
    id: string;
    title: string;
    status: string;
    startedAt: number;
    endedAt?: number;
    totalCostUSD?: number;
    rounds?: FeedMissionRound[];
}

export interface FeedCommit {
    repo: string;
    hash: string;
    ts: number;
    author?: string;
    subject: string;
}

/**
 * Something the project's own documents record, already dated by them.
 *
 * The caller does the reading (this module touches no filesystem) AND the
 * dating: a doc with no real date must not reach here at all, because there is
 * nowhere in this merge to say "the time is made up".
 */
export interface FeedDoc {
    kind: 'decision' | 'deliverable' | 'plan' | 'notice' | 'queue';
    ts: number;
    title: string;
    detail?: string;
    /** The file it lives in — the row opens it. */
    path?: string;
}

/**
 * A notice filed under this project (Faz 5).
 *
 * ‼️ ONE ROW, AT THE MOMENT IT WAS POSTED. A notice's later life — read,
 * starred, answered — belongs on the notices board, not in a project's history:
 * four rows for one message is four times the noise for no extra fact. The
 * exception is an ANSWERED question, which is a second thing that happened, at
 * a different time, and the reason the whole question channel exists.
 */
export interface FeedNotice {
    id: string;
    ts: number;
    title: string;
    type: string;
    level?: number;
    agentName?: string;
    /** question lifecycle — an answer is its own event */
    status?: string;
    answeredAt?: number;
}

/** A work-queue item filed under this project (Faz 5). One row, stamped at the
 *  latest thing that happened to it — the same rule a task follows. */
export interface FeedQueueItem {
    id: string;
    ts: number;
    text: string;
    status: string;
    urgency?: string;
    author?: string;
    target?: string;
    handledAt?: number;
    delegatedAt?: number;
}

export interface ProjectFeedInput {
    sessions?: FeedSession[];
    tasks?: FeedTask[];
    missions?: FeedMission[];
    commits?: FeedCommit[];
    docs?: FeedDoc[];
    notices?: FeedNotice[];
    queue?: FeedQueueItem[];
}

export interface ProjectFeedOptions {
    /** Only these kinds. Undefined = everything the input carried. */
    kinds?: ProjectEventKind[];
    /** Nothing older than this. */
    since?: number;
    /** Rows returned. The COUNTS are always over everything, so a filter chip
     *  can show a real number even when the list is cut. */
    limit?: number;
}

export interface ProjectFeed {
    events: ProjectEvent[];
    /** How many of each kind the input actually produced, before limiting —
     *  what the filter row is drawn from. */
    counts: Partial<Record<ProjectEventKind, number>>;
    /** True when `limit` cut the list. */
    truncated: boolean;
    /** Kinds present in this feed, newest-first order irrelevant. */
    kinds: ProjectEventKind[];
}

export const FEED_DEFAULT_LIMIT = 300;

// ---------------------------------------------------------------------------
// building
// ---------------------------------------------------------------------------

const short = (s: string, n = 90): string => {
    const t = String(s ?? '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

/** A duration a person reads without doing arithmetic. */
export function humanSpan(ms: number): string {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) { return `${s}s`; }
    const m = Math.round(s / 60);
    if (m < 60) { return `${m} min`; }
    const h = Math.floor(m / 60);
    return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

/**
 * A session is ONE row, not two.
 *
 * "Started" and "ended" as separate events doubles the length of the timeline
 * and splits one fact across two places the reader has to reunite. The row is
 * stamped at the END (or now, while it is still open), because a timeline is
 * read newest-first and a session that ran for three hours belongs where it
 * finished, not where it began.
 */
function sessionEvent(s: FeedSession): ProjectEvent {
    const span = humanSpan(Math.max(0, s.lastTs - s.firstTs));
    const turns = s.turns?.length ?? 0;
    const bits = [span, turns ? `${turns} turn${turns === 1 ? '' : 's'}` : ''].filter(Boolean);
    return {
        ts: s.lastTs || s.firstTs,
        kind: 'session',
        title: short(s.title || '(untitled session)'),
        detail: s.live ? `running · ${bits.join(' · ')}` : bits.join(' · '),
        agent: s.agentName,
        cost: s.cost,
        tone: s.live ? 'warn' : undefined,
        link: { to: 'session', sessionId: s.sessionId, file: s.file, ts: s.firstTs }
    };
}

/**
 * What a session wrote, as ONE row.
 *
 * One row per file would bury every other source: a single refactor session
 * touches forty files and would own the whole day. The names are still here —
 * the first few, then a count — because "it wrote something" is not an answer.
 */
function filesEvent(s: FeedSession): ProjectEvent | undefined {
    const entries = Object.entries(s.filesEdited ?? {});
    if (!entries.length) { return undefined; }
    const writes = entries.reduce((n, [, c]) => n + (Number(c) || 0), 0);
    const names = entries
        .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))
        .map(([p]) => p.split(/[\\/]/).pop() || p);
    const shown = names.slice(0, 4).join(', ');
    return {
        ts: s.lastTs || s.firstTs,
        kind: 'files',
        title: `${entries.length} file${entries.length === 1 ? '' : 's'} written · ${writes} edit${writes === 1 ? '' : 's'}`,
        detail: names.length > 4 ? `${shown} +${names.length - 4} more` : shown,
        agent: s.agentName,
        link: { to: 'session', sessionId: s.sessionId, file: s.file, ts: s.firstTs }
    };
}

function turnEvents(s: FeedSession): ProjectEvent[] {
    return (s.turns ?? []).map(t => ({
        ts: t.ts,
        kind: 'turn' as const,
        title: short(t.label || `turn ${t.n}`),
        detail: [`turn ${t.n}`, t.models.join(' · ')].filter(Boolean).join(' · '),
        agent: s.agentName,
        cost: t.cost,
        link: { to: 'session' as const, sessionId: s.sessionId, file: s.file, ts: t.ts }
    }));
}

/** Terminal states carry a tone; everything else is neutral. A queued task is
 *  not "good news" and must not be coloured as if it were. */
function taskTone(status: string): ProjectEvent['tone'] {
    if (status === 'done') { return 'ok'; }
    if (status === 'failed' || status === 'cancelled') { return 'bad'; }
    if (status === 'running') { return 'warn'; }
    return undefined;
}

/**
 * A task is one row too, at the latest thing that happened to it.
 *
 * The design listed created/started/done/failed as four sources. Four rows for
 * one task is four times the noise for no extra fact: the row already says
 * which state it reached and how long it took to get there.
 */
function taskEvent(t: FeedTask): ProjectEvent {
    const ts = t.endedAt ?? t.startedAt ?? t.createdAt;
    const ran = t.startedAt && t.endedAt ? humanSpan(t.endedAt - t.startedAt) : '';
    const waited = t.startedAt && t.startedAt > t.createdAt
        ? `waited ${humanSpan(t.startedAt - t.createdAt)}` : '';
    return {
        ts,
        kind: 'task',
        title: short(t.title),
        detail: [t.status, ran, waited].filter(Boolean).join(' · '),
        agent: t.agentName,
        cost: t.costUSD,
        tone: taskTone(t.status),
        link: { to: 'task', id: t.id }
    };
}

function missionEvents(m: FeedMission): ProjectEvent[] {
    const out: ProjectEvent[] = [{
        ts: m.endedAt ?? m.startedAt,
        kind: 'mission',
        title: short(m.title),
        detail: [m.status, `${m.rounds?.length ?? 0} round(s)`,
        m.endedAt ? humanSpan(m.endedAt - m.startedAt) : 'running'].filter(Boolean).join(' · '),
        cost: m.totalCostUSD,
        tone: m.status === 'done' ? 'ok'
            : (m.status === 'failed' || m.status === 'cancelled') ? 'bad'
                : m.status.startsWith('waiting') || m.status === 'paused' ? 'warn' : undefined,
        link: { to: 'mission', id: m.id }
    }];
    // Rounds are the mission's turns: the same argument as `turn`, so they ride
    // under the same `mission` kind and the reader filters the pair together.
    for (const r of m.rounds ?? []) {
        out.push({
            ts: r.at,
            kind: 'mission',
            title: short(r.thought || `round ${r.n}`),
            detail: [`round ${r.n}`, r.action].filter(Boolean).join(' · '),
            link: { to: 'mission', id: m.id }
        });
    }
    return out;
}

/** The four notice types that mean something went wrong or is waiting get a
 *  tone; the rest are neutral. A routine update coloured green reads as good
 *  news it never claimed to be. */
function noticeTone(n: FeedNotice): ProjectEvent['tone'] {
    if (n.type === 'warning' || (n.level ?? 1) >= 4) { return 'bad'; }
    if (n.type === 'question' && (n.status ?? 'open') === 'open') { return 'warn'; }
    if (n.type === 'result') { return 'ok'; }
    return undefined;
}

function noticeEvents(n: FeedNotice): ProjectEvent[] {
    const out: ProjectEvent[] = [{
        ts: n.ts,
        kind: 'notice',
        title: short(n.title),
        detail: [n.type, n.level && n.level > 1 ? `L${n.level}` : ''].filter(Boolean).join(' · '),
        agent: n.agentName,
        tone: noticeTone(n),
        link: { to: 'notice', id: n.id }
    }];
    // An answer is a second event at a second time — the user acting, which is
    // the whole reason the question channel exists. Only when it really has a
    // date: a stored `answered` with no `answeredAt` would land on the ask.
    if (n.status === 'answered' && (n.answeredAt ?? 0) > 0) {
        out.push({
            ts: n.answeredAt as number,
            kind: 'notice',
            title: `answered: ${short(n.title, 70)}`,
            detail: 'question · answered',
            tone: 'ok',
            link: { to: 'notice', id: n.id }
        });
    }
    return out;
}

function queueTone(status: string): ProjectEvent['tone'] {
    if (status === 'done') { return 'ok'; }
    if (status === 'dropped') { return 'bad'; }
    if (status === 'blocked') { return 'warn'; }
    return undefined;
}

function queueEvent(q: FeedQueueItem): ProjectEvent {
    const ts = q.handledAt ?? q.delegatedAt ?? q.ts;
    const waited = q.handledAt && q.handledAt > q.ts ? `took ${humanSpan(q.handledAt - q.ts)}` : '';
    return {
        ts,
        kind: 'queue',
        title: short(q.text),
        detail: [q.status, q.urgency && q.urgency !== 'normal' ? q.urgency : '',
            q.target ? `→ ${q.target}` : '', waited].filter(Boolean).join(' · '),
        agent: q.author && q.author !== 'user' ? q.author : undefined,
        tone: queueTone(q.status),
        link: { to: 'queue', id: q.id }
    };
}

function commitEvent(c: FeedCommit): ProjectEvent {
    return {
        ts: c.ts,
        kind: 'commit',
        title: short(c.subject),
        detail: [c.hash.slice(0, 7), c.repo.split(/[\\/]/).pop() || c.repo].filter(Boolean).join(' · '),
        agent: c.author,
        link: { to: 'commit', repo: c.repo, hash: c.hash }
    };
}

/**
 * Merge everything into one list, newest first.
 *
 * Ties break on kind then title, not on input order: two events at the same
 * millisecond must come back in the same sequence on every call, or the page
 * reshuffles rows on a repaint and the reader loses their place.
 */
export function buildProjectFeed(
    input: ProjectFeedInput, opts: ProjectFeedOptions = {}
): ProjectFeed {
    const all: ProjectEvent[] = [];
    for (const s of input.sessions ?? []) {
        all.push(sessionEvent(s));
        const f = filesEvent(s);
        if (f) { all.push(f); }
        all.push(...turnEvents(s));
    }
    for (const t of input.tasks ?? []) { all.push(taskEvent(t)); }
    for (const m of input.missions ?? []) { all.push(...missionEvents(m)); }
    for (const c of input.commits ?? []) { all.push(commitEvent(c)); }
    for (const n of input.notices ?? []) { all.push(...noticeEvents(n)); }
    for (const q of input.queue ?? []) { all.push(queueEvent(q)); }
    for (const d of input.docs ?? []) {
        // A document event with no real date is dropped, not placed. Sorting it
        // to 1970 or to "now" both put it somewhere it did not happen, and the
        // reader has no way to tell which rows were guesses.
        if (!(d.ts > 0)) { continue; }
        all.push({
            ts: d.ts, kind: d.kind, title: short(d.title), detail: d.detail,
            ...(d.path ? { link: { to: 'file' as const, path: d.path } } : {})
        });
    }

    const since = opts.since ?? 0;
    const inWindow = since ? all.filter(e => e.ts >= since) : all;

    // Counts are taken over the WINDOW but before the kind filter, so a chip
    // says how many rows turning it on would add — which is the only number
    // that makes a filter row worth reading.
    const counts: Partial<Record<ProjectEventKind, number>> = {};
    for (const e of inWindow) { counts[e.kind] = (counts[e.kind] ?? 0) + 1; }

    const wanted = opts.kinds?.length ? new Set(opts.kinds) : undefined;
    const filtered = wanted ? inWindow.filter(e => wanted.has(e.kind)) : inWindow;

    filtered.sort((a, b) =>
        b.ts - a.ts || a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));

    const limit = opts.limit ?? FEED_DEFAULT_LIMIT;
    const events = limit > 0 ? filtered.slice(0, limit) : filtered;
    return {
        events,
        counts,
        truncated: limit > 0 && filtered.length > limit,
        kinds: PROJECT_EVENT_KINDS.filter(k => counts[k])
    };
}

/**
 * What a slice of the feed cost — WITHOUT double counting.
 *
 * A turn's cost is part of its session's cost. Summing an unfiltered feed's
 * `cost` fields would bill every session twice, and the number would look
 * plausible, which is the dangerous kind of wrong. Sessions win: they are the
 * atom the fleet total is built from.
 */
export function feedSpend(events: ProjectEvent[]): number {
    const seen = new Set<string>();
    let total = 0;
    for (const e of events) {
        if (e.kind === 'turn') { continue; }
        if (e.kind === 'session' && e.link?.to === 'session') {
            if (seen.has(e.link.sessionId)) { continue; }
            seen.add(e.link.sessionId);
        }
        total += e.cost ?? 0;
    }
    return Math.round(total * 1e6) / 1e6;
}

// ---------------------------------------------------------------------------
// cost
// ---------------------------------------------------------------------------

export interface ProjectCostInput {
    sessions: FeedSession[];
    budgetUSD?: number;
    budgetTotalUSD?: number;
    startedAt?: number;
    dueAt?: number;
    now?: number;
}

export interface CostByModel {
    model: string;
    cost: number;
    turns: number;
}

export interface ProjectCost {
    total: number;
    today: number;
    /** Oldest first — a burn curve is read left to right. */
    days: { day: string; cost: number }[];
    byAgent: { agent: string; cost: number; sessions: number }[];
    byModel: CostByModel[];
    /**
     * ‼️ Cost a model breakdown CANNOT claim.
     *
     * The transcript bills a turn, not a model, and a turn served by more than
     * one model cannot be split without inventing a ratio. That money is
     * reported here instead of being quietly folded into whichever model
     * happened to be first in the list.
     */
    mixedTurnCost: number;
    /** Sessions with no per-turn detail at all (external CLIs, old indexes). */
    unattributed: number;
    burn: {
        perDay7: number;
        perDay30: number;
        /** Spend to date plus perDay7 × days remaining. Undefined without a due date. */
        projectedAtDue?: number;
        /** Days of runway at perDay7. Undefined without a total budget. */
        daysToBudget?: number;
        budgetUsedPct?: number;
        /** Today's spend against the DAILY budget. */
        todayPct?: number;
    };
}

/** YYYY-MM-DD, local — the same rule as everywhere else in the project axis:
 *  a "day" is the user's day, not UTC's. */
export function costDay(ms: number): string {
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function buildProjectCost(o: ProjectCostInput): ProjectCost {
    const now = o.now ?? Date.now();
    const today = costDay(now);
    const dayCost = new Map<string, number>();
    const agentCost = new Map<string, { cost: number; sessions: number }>();
    const modelCost = new Map<string, { cost: number; turns: number }>();
    let total = 0, mixedTurnCost = 0, unattributed = 0;

    for (const s of o.sessions) {
        total += s.cost ?? 0;

        // the day series: the index's own buckets when it has them, otherwise
        // the whole session lands on the day it last ran
        const buckets = Object.entries(s.daily ?? {});
        if (buckets.length) {
            for (const [day, cost] of buckets) {
                dayCost.set(day, (dayCost.get(day) ?? 0) + (Number(cost) || 0));
            }
        } else if (s.cost) {
            const day = costDay(s.lastTs || s.firstTs || now);
            dayCost.set(day, (dayCost.get(day) ?? 0) + s.cost);
        }

        const agent = s.agentName || '(no agent)';
        const a = agentCost.get(agent) ?? { cost: 0, sessions: 0 };
        a.cost += s.cost ?? 0;
        a.sessions += 1;
        agentCost.set(agent, a);

        // Per-MODEL cost exists only at turn granularity, and only for turns a
        // single model served. Everything else is named rather than guessed.
        const turns = s.turns ?? [];
        if (!turns.length) { unattributed += s.cost ?? 0; continue; }
        for (const t of turns) {
            if (t.models.length === 1) {
                const m = modelCost.get(t.models[0]) ?? { cost: 0, turns: 0 };
                m.cost += t.cost ?? 0;
                m.turns += 1;
                modelCost.set(t.models[0], m);
            } else if (t.models.length > 1) {
                mixedTurnCost += t.cost ?? 0;
            } else {
                unattributed += t.cost ?? 0;
            }
        }
    }

    const days = [...dayCost.entries()]
        .map(([day, cost]) => ({ day, cost: Math.round(cost * 1e6) / 1e6 }))
        .sort((a, b) => a.day.localeCompare(b.day));

    const spendSince = (cutoffDays: number): number => {
        const from = costDay(now - cutoffDays * 86400000);
        return days.filter(d => d.day > from).reduce((n, d) => n + d.cost, 0);
    };
    const perDay7 = spendSince(7) / 7;
    const perDay30 = spendSince(30) / 30;

    const burn: ProjectCost['burn'] = {
        perDay7: Math.round(perDay7 * 1e4) / 1e4,
        perDay30: Math.round(perDay30 * 1e4) / 1e4
    };
    if (o.dueAt && o.dueAt > now) {
        const left = Math.ceil((o.dueAt - now) / 86400000);
        burn.projectedAtDue = Math.round((total + perDay7 * left) * 100) / 100;
    }
    if (o.budgetTotalUSD) {
        burn.budgetUsedPct = Math.round((total / o.budgetTotalUSD) * 1000) / 10;
        if (perDay7 > 0) {
            burn.daysToBudget = Math.max(0, Math.round((o.budgetTotalUSD - total) / perDay7));
        }
    }
    const todayCost = dayCost.get(today) ?? 0;
    if (o.budgetUSD) {
        burn.todayPct = Math.round((todayCost / o.budgetUSD) * 1000) / 10;
    }

    return {
        total: Math.round(total * 1e6) / 1e6,
        today: Math.round(todayCost * 1e6) / 1e6,
        days,
        byAgent: [...agentCost.entries()]
            .map(([agent, v]) => ({ agent, cost: Math.round(v.cost * 1e6) / 1e6, sessions: v.sessions }))
            .sort((a, b) => b.cost - a.cost),
        byModel: [...modelCost.entries()]
            .map(([model, v]) => ({ model, cost: Math.round(v.cost * 1e6) / 1e6, turns: v.turns }))
            .sort((a, b) => b.cost - a.cost),
        mixedTurnCost: Math.round(mixedTurnCost * 1e6) / 1e6,
        unattributed: Math.round(unattributed * 1e6) / 1e6,
        burn
    };
}
