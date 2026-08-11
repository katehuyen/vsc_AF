import * as fs from 'fs';
import { argStr, BridgeRegistry, need, optStr } from './bridge';

/**
 * Notices — the farm's agent→user board (and, via the `question` type, the
 * async question channel that replaces the old MESSAGING.md). ANY agent posts
 * ONE notice per thing-it-wants-to-tell-the-user: a single root line (title)
 * that expands into a rich body — optionally split into independently
 * collapsible SECTIONS, each fully self-contained (a real summary, not a
 * link-only teaser). The user reads them on the Notices page.
 *
 * Two orthogonal axes:
 *   - TYPE  = what KIND of message (update / reminder / report / question)
 *   - LEVEL = how IMPORTANT (1 routine · 2 medium · 3 important · 4 ultra)
 * plus a user-owned STAR mark (0-3) for "come back to this".
 *
 * The `question` type carries an async lifecycle: an agent asks, the user
 * ANSWERS in the UI (status→answered) or DISMISSES it (status→declined so the
 * asking agent learns it was passed over). Each turn an agent checks its own
 * questions, acts on the answers (save to memory / apply), then RESOLVES them
 * (handled=true). Pure node module (fs only) so store + ops are unit-testable.
 */

export type NoticeType =
    | 'update' | 'report' | 'result' | 'reminder' | 'suggestion' | 'warning' | 'question';
export const NOTICE_TYPES: NoticeType[] =
    ['update', 'report', 'result', 'reminder', 'suggestion', 'warning', 'question'];

/** Importance: 1 routine · 2 medium · 3 important · 4 ultra (rare, critical). */
export type NoticeLevel = 1 | 2 | 3 | 4;

/** Question lifecycle (question type only). */
export type NoticeStatus = 'open' | 'answered' | 'declined';

export interface NoticeSection {
    /** Sub-headline shown when the notice is opened; expands to `body`. */
    title: string;
    /** Full self-contained summary (markdown). */
    body: string;
}

/** A queue item the user spawned FROM a notice — remembered on the notice so
 *  "what did I turn this into, and what did I write" stays visible here. The
 *  work queue holds the mirror link (WorkItem.sourceNoticeId). */
export interface NoticeSpawnedRef {
    itemId: string;
    /** Snapshot of what the user wrote when converting. */
    text: string;
    ts: number;
}

export interface Notice {
    id: string;
    ts: number;
    agentName: string;
    type: NoticeType;
    level: NoticeLevel;
    title: string;
    /** Intro / whole message (markdown), shown when opened. */
    body?: string;
    /** Independently collapsible sub-items; each fully summarised. */
    sections?: NoticeSection[];
    tags?: string[];
    dueAt?: number;
    /** The "second leg": absolute path to a full-length MD report file this
     *  notice summarises. The body/sections stay a summary; the report holds
     *  the depth. Clicking it in the UI opens the file. */
    reportPath?: string;
    read?: boolean;
    readAt?: number;
    pinned?: boolean;
    /** User's own mark, 0-3. */
    stars?: number;
    // --- question lifecycle ---
    status?: NoticeStatus;
    answer?: string;
    answeredAt?: number;
    /** The asking agent processed the answer/decline. */
    handled?: boolean;
    handledAt?: number;
    // --- user edits ---
    edited?: boolean;
    editedAt?: number;
    /** Content snapshot before the first user edit (for diff). */
    original?: NoticeSnapshot;
    /** Queue items the user spawned FROM this notice (bi-directional link with
     *  the work queue). A notice can spawn several; each remembers what the user
     *  wrote, so the linkage is visible inside the notice and clickable. */
    spawnedItems?: NoticeSpawnedRef[];
    /** Set only on notices the FARM posts about a live condition (never on an
     *  agent's own message): the identity of the thing being reported, so the
     *  same condition ending can take the notice back (see dismissBySource). */
    sourceKey?: string;
    /**
     * Which project this notice is about (Faz 5).
     *
     * ‼️ STAMPED, NEVER DERIVED. An agent works on several projects, so reading
     * the poster's name and guessing would be exactly the misattribution the
     * project entity was rebuilt to kill. It is set by whoever posts — the
     * window's active project for a farm-posted one, an explicit `project` arg
     * for an agent's — and the user can change or clear it on the row.
     */
    projectId?: string;
}

export interface NoticeSnapshot {
    title: string;
    type: NoticeType;
    level: NoticeLevel;
    body?: string;
    sections?: NoticeSection[];
    tags?: string[];
}

export interface NoticeEdit {
    title?: string;
    type?: string;
    level?: number;
    body?: string;
    sections?: unknown;
    tags?: string[] | string;
}

export interface NoticeInput {
    title: string;
    type?: string;
    level?: number;
    body?: string;
    sections?: unknown;
    agentName?: string;
    tags?: string[] | string;
    dueAt?: number;
    /** Absolute path to an already-written full report file (second leg). */
    reportPath?: string;
    /** Identity of the live condition this notice reports (host-posted only). */
    sourceKey?: string;
    /** Which project this is about — see Notice.projectId. */
    projectId?: string;
}

export interface NoticeFilter {
    type?: string;
    level?: number;
    minLevel?: number;
    agent?: string;
    unread?: boolean;
    status?: string;
    handled?: boolean;
    minStars?: number;
    tag?: string;
    /** A project id — or `NO_PROJECT` for "the ones nobody filed". Absent = no
     *  project filter at all, which is not the same question. */
    projectId?: string;
    limit?: number;
}

/** The filter value that asks for rows carrying NO project. A real id can
 *  never collide with it: ids are `prj_…`. */
export const NO_PROJECT = '(none)';

const MAX_NOTICES = 400;
const TITLE_MAX = 200;
const BODY_MAX = 20000;
const TAGS_MAX = 12;
const SECTIONS_MAX = 60;

export function newNoticeId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function coerceType(v: unknown): NoticeType {
    const s = String(v ?? '').toLowerCase();
    return (NOTICE_TYPES as string[]).includes(s) ? s as NoticeType : 'update';
}

export function coerceLevel(v: unknown): NoticeLevel {
    const n = typeof v === 'number' ? Math.round(v) : parseInt(String(v ?? ''), 10);
    return (n === 2 || n === 3 || n === 4) ? n as NoticeLevel : 1;
}

export function coerceStars(v: unknown): number {
    const n = typeof v === 'number' ? Math.round(v) : parseInt(String(v ?? ''), 10);
    return isFinite(n) && n >= 0 && n <= 3 ? n : 0;
}

export function coerceTags(v: unknown): string[] | undefined {
    let arr: string[] = [];
    if (Array.isArray(v)) { arr = v.map(x => String(x).trim()); }
    else if (typeof v === 'string') { arr = v.split(',').map(x => x.trim()); }
    arr = arr.filter(Boolean).slice(0, TAGS_MAX);
    return arr.length ? arr : undefined;
}

/** Accept [{title|heading, body|content}, …]; tolerant of loose shapes. */
export function coerceSections(v: unknown): NoticeSection[] | undefined {
    if (!Array.isArray(v)) { return undefined; }
    const out: NoticeSection[] = [];
    for (const s of v) {
        if (!s || typeof s !== 'object') { continue; }
        const o = s as Record<string, unknown>;
        const title = String(o.title ?? o.heading ?? '').trim().slice(0, TITLE_MAX);
        const body = String(o.body ?? o.content ?? o.text ?? '').trim().slice(0, BODY_MAX);
        if (!title && !body) { continue; }
        out.push({ title: title || '(untitled)', body });
        if (out.length >= SECTIONS_MAX) { break; }
    }
    return out.length ? out : undefined;
}

/** Validate an input into a fresh Notice (throws on an empty title). */
export function makeNotice(input: NoticeInput, now = Date.now()): Notice {
    const title = String(input.title ?? '').trim().slice(0, TITLE_MAX);
    need(!!title, 'a notice needs a non-empty "title"');
    const type = coerceType(input.type);
    const bodyRaw = typeof input.body === 'string' ? input.body.trim() : '';
    const agentName = String(input.agentName ?? '').trim().slice(0, 60) || 'system';
    const dueAt = typeof input.dueAt === 'number' && isFinite(input.dueAt) && input.dueAt > 0
        ? input.dueAt : undefined;
    const n: Notice = {
        id: newNoticeId(),
        ts: now,
        agentName,
        type,
        level: coerceLevel(input.level),
        title,
        body: bodyRaw ? bodyRaw.slice(0, BODY_MAX) : undefined,
        sections: coerceSections(input.sections),
        tags: coerceTags(input.tags),
        dueAt
    };
    const reportPath = String(input.reportPath ?? '').trim();
    if (reportPath) { n.reportPath = reportPath.slice(0, 500); }
    const sourceKey = String(input.sourceKey ?? '').trim();
    if (sourceKey) { n.sourceKey = sourceKey.slice(0, 200); }
    const projectId = String(input.projectId ?? '').trim();
    if (projectId) { n.projectId = projectId.slice(0, 60); }
    if (type === 'question') { n.status = 'open'; }
    return n;
}

/** Pinned first, then newest. Client controls further sort. */
export function sortNotices(list: Notice[]): Notice[] {
    return list.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.ts - a.ts);
}

export function filterNotices(list: Notice[], f: NoticeFilter): Notice[] {
    const type = (f.type ?? '').toLowerCase();
    const agent = (f.agent ?? '').toLowerCase();
    const status = (f.status ?? '').toLowerCase();
    const tag = (f.tag ?? '').toLowerCase();
    const project = (f.projectId ?? '').trim();
    let out = sortNotices(list).filter(n =>
        (!type || n.type === type) &&
        (!f.level || n.level === f.level) &&
        (!f.minLevel || n.level >= f.minLevel) &&
        (!agent || n.agentName.toLowerCase() === agent) &&
        (!f.unread || !n.read) &&
        (!status || (n.status ?? 'open') === status) &&
        (f.handled === undefined || !!n.handled === f.handled) &&
        (!f.minStars || (n.stars ?? 0) >= f.minStars) &&
        (!project || (project === NO_PROJECT ? !n.projectId : n.projectId === project)) &&
        (!tag || (n.tags ?? []).some(t => t.toLowerCase() === tag)));
    if (f.limit && f.limit > 0) { out = out.slice(0, Math.floor(f.limit)); }
    return out;
}

export function unreadCount(list: Notice[]): number {
    return list.reduce((a, n) => a + (n.read ? 0 : 1), 0);
}

/** An open question is a pending ask — surfaced separately from unread. */
export function openQuestionCount(list: Notice[]): number {
    return list.reduce((a, n) => a + (n.type === 'question' && (n.status ?? 'open') === 'open' ? 1 : 0), 0);
}

/** Cap without ever dropping pinned / unread / unresolved questions. */
export function capNotices(list: Notice[], max = MAX_NOTICES): Notice[] {
    if (list.length <= max) { return list; }
    const sticky = (n: Notice) =>
        n.pinned || !n.read || (n.type === 'question' && !n.handled) || (n.stars ?? 0) > 0;
    const keep = list.filter(sticky);
    const rest = list.filter(n => !sticky(n)).sort((a, b) => b.ts - a.ts);
    const room = Math.max(0, max - keep.length);
    return sortNotices([...keep, ...rest.slice(0, room)]);
}

/** Source-key prefix of the "this session is waiting for you" reminder. */
export const IDLE_REMINDER_PREFIX = 'idle:';

/**
 * Which posted `idle:<sessionId>` reminders have stopped being true.
 *
 * ‼️ The question is answered by the FLEET, not by remembering what the user
 * did: a reminder stands only while its session is still the one holding your
 * ball. Answered, closed, resumed by the agent, gone from the fleet entirely —
 * all the same verdict, so no way of dealing with a session has to be listed
 * here to be handled. Keys of other kinds are left alone: they report other
 * conditions, and each owns its own liveness test.
 */
export function staleReminderKeys(postedKeys: string[], waitingSessionIds: Iterable<string>): string[] {
    const waiting = new Set(waitingSessionIds);
    return postedKeys.filter(k =>
        k.startsWith(IDLE_REMINDER_PREFIX) && !waiting.has(k.slice(IDLE_REMINDER_PREFIX.length)));
}

export class NoticesStore {
    notices: Notice[] = [];

    constructor(private file: string) { }

    load(): void {
        try {
            const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { notices?: Notice[] } | Notice[];
            const arr = Array.isArray(raw) ? raw : raw?.notices;
            this.notices = Array.isArray(arr) ? arr.filter(n => n && typeof n.id === 'string') : [];
        } catch { this.notices = []; }
    }

    save(): void {
        this.notices = capNotices(this.notices);
        try {
            fs.writeFileSync(this.file, JSON.stringify({ notices: this.notices }, null, 2), 'utf8');
        } catch { /* best-effort */ }
    }

    add(input: NoticeInput): Notice {
        const n = makeNotice(input);
        this.notices.unshift(n);
        this.save();
        return n;
    }

    private find(id: string): Notice | undefined { return this.notices.find(x => x.id === id); }

    markRead(id: string, read = true): boolean {
        const n = this.find(id); if (!n) { return false; }
        n.read = read; n.readAt = read ? Date.now() : undefined;
        this.save(); return true;
    }

    markAllRead(): number {
        const now = Date.now(); let c = 0;
        for (const n of this.notices) { if (!n.read) { n.read = true; n.readAt = now; c++; } }
        if (c) { this.save(); } return c;
    }

    /** Bulk mark a set of ids read/unread (UI checkbox selection). */
    markReadMany(ids: string[], read: boolean): number {
        const set = new Set(ids); const now = Date.now(); let c = 0;
        for (const n of this.notices) {
            if (set.has(n.id) && !!n.read !== read) { n.read = read; n.readAt = read ? now : undefined; c++; }
        }
        if (c) { this.save(); } return c;
    }

    pin(id: string, pinned: boolean): boolean {
        const n = this.find(id); if (!n) { return false; }
        n.pinned = pinned; this.save(); return true;
    }

    /**
     * File notices under a project — or take them out of one.
     *
     * ‼️ REVERSIBLE, AND THAT IS THE POINT OF STAMPING AT ALL. The window
     * stamps whatever project it was showing, which is right most of the time
     * and wrong the rest; a mark you cannot take off is a mark nobody trusts.
     * An empty `projectId` clears it. Bulk because the row is a checkbox row.
     */
    setProject(ids: string[], projectId: string): number {
        const set = new Set(ids);
        const pid = String(projectId ?? '').trim();
        let c = 0;
        for (const n of this.notices) {
            if (!set.has(n.id)) { continue; }
            if (pid) { if (n.projectId === pid) { continue; } n.projectId = pid; }
            else { if (!n.projectId) { continue; } delete n.projectId; }
            c++;
        }
        if (c) { this.save(); } return c;
    }

    /** Drop stamps pointing at projects that no longer exist — called after a
     *  project is removed, so the board never filters on a ghost. */
    pruneProjects(aliveIds: Iterable<string>): number {
        const alive = new Set(aliveIds);
        let c = 0;
        for (const n of this.notices) {
            if (n.projectId && !alive.has(n.projectId)) { delete n.projectId; c++; }
        }
        if (c) { this.save(); } return c;
    }

    setStars(id: string, stars: number): boolean {
        const n = this.find(id); if (!n) { return false; }
        n.stars = coerceStars(stars); this.save(); return true;
    }

    /** User edits content; the first edit snapshots the original for diff. */
    edit(id: string, patch: NoticeEdit): boolean {
        const n = this.find(id); if (!n) { return false; }
        if (!n.edited) {
            n.original = { title: n.title, type: n.type, level: n.level, body: n.body, sections: n.sections, tags: n.tags };
        }
        if (typeof patch.title === 'string' && patch.title.trim()) { n.title = patch.title.trim().slice(0, TITLE_MAX); }
        if (patch.type !== undefined) { n.type = coerceType(patch.type); }
        if (patch.level !== undefined) { n.level = coerceLevel(patch.level); }
        if (patch.body !== undefined) { const b = String(patch.body).trim(); n.body = b ? b.slice(0, BODY_MAX) : undefined; }
        if (patch.sections !== undefined) { n.sections = coerceSections(patch.sections); }
        if (patch.tags !== undefined) { n.tags = coerceTags(patch.tags); }
        n.edited = true; n.editedAt = Date.now();
        this.save(); return true;
    }

    /** User answers a question (UI). */
    answer(id: string, text: string): boolean {
        const n = this.find(id); if (!n || n.type !== 'question') { return false; }
        const a = String(text ?? '').trim(); if (!a) { return false; }
        n.answer = a.slice(0, BODY_MAX); n.answeredAt = Date.now();
        n.status = 'answered'; n.read = true; n.readAt = n.readAt ?? Date.now();
        this.save(); return true;
    }

    /** User dismisses a question without answering — the asker learns it was passed over. */
    decline(id: string): boolean {
        const n = this.find(id); if (!n || n.type !== 'question') { return false; }
        n.status = 'declined'; n.read = true; n.readAt = n.readAt ?? Date.now();
        this.save(); return true;
    }

    /** Asking agent processed the answer/decline. */
    resolve(id: string): boolean {
        const n = this.find(id); if (!n) { return false; }
        n.handled = true; n.handledAt = Date.now();
        this.save(); return true;
    }

    /** Record that the user converted this notice into a queue item (the
     *  bi-directional link). A notice may spawn several; they accumulate here
     *  and stay visible on the notice until the user removes it. */
    addSpawnedItem(id: string, ref: NoticeSpawnedRef): boolean {
        const n = this.find(id); if (!n) { return false; }
        if (!n.spawnedItems) { n.spawnedItems = []; }
        n.spawnedItems.push({ itemId: ref.itemId, text: String(ref.text ?? '').slice(0, 400), ts: ref.ts || Date.now() });
        this.save(); return true;
    }

    /** Title of a notice (for the queue's source-snapshot). */
    titleOf(id: string): string | undefined { return this.find(id)?.title; }

    dismiss(id: string): boolean {
        const before = this.notices.length;
        this.notices = this.notices.filter(n => n.id !== id);
        if (this.notices.length === before) { return false; }
        this.save(); return true;
    }

    /**
     * Take back a notice the farm posted about a condition that has since
     * ended — "developer is waiting for you", once you have answered it.
     *
     * ‼️ A REMINDER THAT OUTLIVES WHAT IT REMINDS YOU OF IS WORSE THAN NO
     * REMINDER: it is the line that teaches you the board is stale. The notice
     * is posted from a live state, so it is withdrawn from the same state — the
     * user does not have to tidy up after a condition they already dealt with.
     *
     * Two exceptions, both the user's own mark on it: a PINNED or STARRED
     * notice was kept deliberately, and nothing automatic removes what a person
     * decided to hold on to. Returns the ids actually removed.
     */
    dismissBySource(key: string): string[] {
        const k = String(key ?? '').trim();
        if (!k) { return []; }
        const gone = this.notices.filter(n =>
            n.sourceKey === k && !n.pinned && (n.stars ?? 0) === 0).map(n => n.id);
        if (!gone.length) { return []; }
        const set = new Set(gone);
        this.notices = this.notices.filter(n => !set.has(n.id));
        this.save();
        return gone;
    }

    /** Bulk remove a set of ids; returns the removed notices (for UI undo). */
    dismissMany(ids: string[]): Notice[] {
        const set = new Set(ids);
        const removed = this.notices.filter(n => set.has(n.id));
        if (removed.length) { this.notices = this.notices.filter(n => !set.has(n.id)); this.save(); }
        return removed;
    }

    /** Re-insert previously removed notices (UI undo). Skips ids still present. */
    restore(list: Notice[]): number {
        let c = 0;
        for (const n of list) {
            if (n && typeof n.id === 'string' && !this.notices.some(x => x.id === n.id)) { this.notices.unshift(n); c++; }
        }
        if (c) { this.save(); } return c;
    }

    /** Remove read, non-pinned, non-starred notices — returns them (for undo).
     *  A question is the exception: its point is being ANSWERED, not read, so it
     *  is protected here until the asking agent has HANDLED it. The user still
     *  deletes a question manually (or the agent removes it after acting). */
    clearRead(): Notice[] {
        const removed = this.notices.filter(n =>
            n.read && !n.pinned && (n.stars ?? 0) === 0
            && !(n.type === 'question' && !n.handled));
        if (removed.length) {
            const gone = new Set(removed.map(n => n.id));
            this.notices = this.notices.filter(n => !gone.has(n.id));
            this.save();
        }
        return removed;
    }

    unread(): number { return unreadCount(this.notices); }
    openQuestions(): number { return openQuestionCount(this.notices); }
    list(f: NoticeFilter = {}): Notice[] { return filterNotices(this.notices, f); }
}

// ---------------------------------------------------------------------------
// markdown export
// ---------------------------------------------------------------------------

export const TYPE_LABEL: Record<NoticeType, string> = {
    update: 'Update', report: 'Report', result: 'Result', reminder: 'Reminder',
    suggestion: 'Suggestion', warning: 'Warning', question: 'Question'
};
export const LEVEL_LABEL: Record<number, string> = { 1: 'Routine', 2: 'Medium', 3: 'Important', 4: 'Ultra' };

/** One notice as a self-contained markdown block. */
export function noticeMarkdown(n: Notice, headingLevel = 2): string {
    const h = '#'.repeat(Math.min(6, Math.max(1, headingLevel)));
    const secH = '#'.repeat(Math.min(6, headingLevel + 1));
    const meta = [
        TYPE_LABEL[n.type] ?? n.type,
        `Level ${n.level} (${LEVEL_LABEL[n.level] ?? ''})`,
        n.agentName,
        new Date(n.ts).toLocaleString()
    ];
    if (n.stars) { meta.push('★'.repeat(n.stars)); }
    if (n.edited) { meta.push('edited'); }
    if (n.tags?.length) { meta.push(n.tags.map(t => '#' + t).join(' ')); }
    const lines: string[] = [`${h} ${n.title}`, '', `_${meta.join(' · ')}_`, ''];
    if (n.body) { lines.push(n.body, ''); }
    for (const s of n.sections ?? []) { lines.push(`${secH} ${s.title}`, '', s.body, ''); }
    if (n.reportPath) { lines.push(`**Full report:** \`${n.reportPath}\``, ''); }
    if (n.type === 'question') {
        const st = n.status ?? 'open';
        if (st === 'answered') { lines.push(`**Answer:** ${n.answer ?? ''}`, ''); }
        else if (st === 'declined') { lines.push('_Question dismissed without an answer._', ''); }
        else { lines.push('_Question — awaiting your answer._', ''); }
    }
    if (n.dueAt) { lines.push(`_Due: ${new Date(n.dueAt).toLocaleString()}_`, ''); }
    return lines.join('\n').trimEnd() + '\n';
}

export interface NoticesExportOpts { view: boolean; foldedTitles: boolean; }

/** Page export. `shownIds` = ordered ids the user sees (post filter/sort/search);
 *  `openIds` = expanded ones. view=false dumps every shown notice in full;
 *  view=true dumps open ones in full and folded ones as a title (foldedTitles)
 *  or omits them. */
export function buildNoticesMarkdown(
    all: Notice[], shownIds: string[], openIds: Set<string>, opts: NoticesExportOpts
): string {
    const byId = new Map(all.map(n => [n.id, n]));
    const lines: string[] = ['# Agent Farm — Notices export', ''];
    lines.push(`- Generated: ${new Date().toLocaleString()}`);
    lines.push(opts.view
        ? `- Export: current view · ${shownIds.length} listed · open notices in full · folded ${opts.foldedTitles ? 'as titles' : 'omitted'}`
        : `- Export: current view · ${shownIds.length} listed · all in full`);
    lines.push('');
    let emitted = 0;
    for (const id of shownIds) {
        const n = byId.get(id);
        if (!n) { continue; }
        if (!opts.view || openIds.has(id)) { lines.push(noticeMarkdown(n, 2)); emitted++; }
        else if (opts.foldedTitles) {
            lines.push(`## ${n.title}`, '', `_(folded — ${TYPE_LABEL[n.type] ?? n.type} · Level ${n.level} · ${n.agentName})_`, '');
            emitted++;
        }
    }
    if (!emitted) { lines.push('_No notices matched the export selection._', ''); }
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// bridge (constitution §19.C) — the channel every agent posts to / reads from
// ---------------------------------------------------------------------------

export interface NoticesOpsDeps {
    store: NoticesStore;
    onChange?: () => void;
    onPost?: (n: Notice) => void;
    /** Second leg: persist a full-length MD report to the default report folder
     *  (naming via reportFileStem — YYYY-MM-DD_<agent>_<name>.md) and return its
     *  absolute path. Injected by the host so this module stays vscode-free and
     *  unit-testable. */
    writeReport?: (a: { title: string; name?: string; body: string; agentName?: string }) => string;
    /**
     * A project id or name → the id, or undefined if there is no such project.
     *
     * ‼️ The caller may say either, and NEITHER is guessed at: an unknown key
     * comes back undefined and the notice posts unfiled rather than under a
     * project somebody nearly named. Injected because the registry is the
     * host's.
     */
    resolveProject?: (key: string) => string | undefined;
}

/** Strip only what a Windows filename cannot hold; keep Turkish letters +
 *  spaces (vault naming §13). Collapses whitespace and trims. */
function cleanNamePart(s: string, max: number): string {
    return String(s ?? '').replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Build the report file stem (no directory, no `.md`) for the second-leg report
 * writer. Reports from every agent land in ONE shared folder, so the poster's
 * name must be visible in the filename — the user's naming decision is
 * `YYYY-MM-DD_<agent>_<topic>` (constitution §7), and BOTH flows honour it:
 * an explicit `reportName` is the TOPIC part only. Defensive: a leading date
 * and/or agent the caller put into reportName anyway is stripped first, so
 * nothing ever doubles.
 *   reportName given → `YYYY-MM-DD_<agent>_<reportName>`
 *   auto (from title) → `YYYY-MM-DD_<agent>_<title>` (agent omitted if unknown)
 */
export function reportFileStem(a: { title: string; name?: string; agentName?: string; date?: Date }): string {
    const d = a.date ?? new Date();
    const p2 = (n: number) => String(n).padStart(2, '0');
    const datePart = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
    const agent = cleanNamePart(a.agentName ?? '', 40);
    let name = cleanNamePart(a.name ?? '', 80);
    if (name) {
        name = name.replace(/^\d{4}-\d{2}-\d{2}[_ ]+/, '');
        if (agent && name.toLowerCase().startsWith(agent.toLowerCase() + '_')) {
            name = name.slice(agent.length + 1);
        }
    }
    const topic = name || cleanNamePart(a.title ?? '', 80) || 'rapor';
    return agent ? `${datePart}_${agent}_${topic}` : `${datePart}_${topic}`;
}

/**
 * A caller's `project` argument → what the filter wants.
 *
 * `(none)` is passed through verbatim (it is a question, not a project), a name
 * is resolved to an id, and a key nothing matches falls back to itself so the
 * list comes back EMPTY rather than unfiltered — a filter that silently stops
 * filtering hands back the whole board and looks like an answer.
 */
function projectFilter(key: string | undefined, deps: NoticesOpsDeps): string | undefined {
    const k = String(key ?? '').trim();
    if (!k) { return undefined; }
    if (k === NO_PROJECT) { return NO_PROJECT; }
    return deps.resolveProject?.(k) ?? k;
}

export function registerNoticesOps(bridge: BridgeRegistry, deps: NoticesOpsDeps): void {
    const changed = () => { try { deps.onChange?.(); } catch { /* UI best-effort */ } };
    bridge.register([
        {
            op: 'notices.post',
            describe: 'Post ONE notice to the user\'s dashboard board (agent→user; the shared channel — post a single entry per thing you want to tell the user, never one per sub-item). args: title (required, the one-line root), type? (update|report|result|reminder|suggestion|warning|question, default update), level? (1 routine|2 medium|3 important|4 ultra, default 1 — ALWAYS pick honestly, never omit), body? (markdown, shown on expand), sections? ([{title, body}] independently-collapsible sub-items, each a FULL self-contained summary — not a link-only teaser), agent? (poster name), tags? (string[]|csv), dueAt? (ms epoch). SECOND LEG for substantial content (reports/digests/summaries/work outputs — anything the user may want in full): pass report? (the full markdown, written in Turkish with source URLs at the end) — the host saves it to the default report folder as YYYY-MM-DD_<name>.md and links it as a clickable "full report"; reportName? overrides the file name; OR pass reportPath? to link a file you already wrote. Keep body/sections a genuine SUMMARY; put the depth in the report. Use type=question to leave the user an async question (they answer in the UI); check & resolve your answered questions each turn. project? (id or name) files the notice under a project so it shows on that project\'s Work tab and timeline — if you are in a project session, pass it; an unknown name is reported back and the notice posts unfiled rather than being guessed at.',
            handler: (args) => {
                const title = argStr(args, 'title');
                const agentName = optStr(args, 'agent') || undefined;
                let reportPath = optStr(args, 'reportPath') || undefined;
                const reportBody = optStr(args, 'report');
                // ‼️ The second leg NEVER fails quietly. A caller that asked for a
                // report and did not get one used to read `ok: true` and believe the
                // job was delivered — measured 2026-08-10, a 14 KB guide the user
                // never received. The notice still posts (it is the caller's message
                // and losing it too would help nobody), but the answer says what
                // happened to the report.
                let reportError: string | undefined;
                if (!reportPath && args.report !== undefined && !reportBody) {
                    reportError = 'report was not a usable string, so no report file was written — '
                        + 'if you built the JSON in PowerShell, cast the text with [string] '
                        + '(Get-Content -Raw hands back a decorated object).';
                }
                if (!reportPath && reportBody && deps.writeReport) {
                    try {
                        reportPath = deps.writeReport({ title, name: optStr(args, 'reportName') || undefined, body: reportBody, agentName });
                    } catch (e) {
                        reportError = 'report file could not be written: ' + String((e as Error)?.message ?? e).slice(0, 200);
                    }
                }
                // ‼️ A PROJECT NOBODY KNOWS IS SAID SO, NOT SWALLOWED. Filing
                // under nothing is the honest answer to a misspelt name; doing
                // it silently is how an agent believes for a month that its
                // reports are reaching a project page they never touched.
                const projectKey = optStr(args, 'project');
                let projectId: string | undefined;
                let projectError: string | undefined;
                if (projectKey) {
                    projectId = deps.resolveProject?.(projectKey);
                    if (!projectId) {
                        projectError = `no project matches "${projectKey}" — the notice was posted unfiled; projects.list shows the ids and names.`;
                    }
                }
                const n = deps.store.add({
                    title,
                    type: optStr(args, 'type') || undefined,
                    level: typeof args.level === 'number' ? args.level : undefined,
                    body: optStr(args, 'body') || undefined,
                    sections: args.sections,
                    agentName,
                    tags: (args.tags as string[] | string | undefined),
                    dueAt: typeof args.dueAt === 'number' ? args.dueAt : undefined,
                    reportPath,
                    projectId
                });
                try { deps.onPost?.(n); } catch { /* toast best-effort */ }
                changed();
                return { id: n.id, ts: n.ts, type: n.type, level: n.level, title: n.title, reportPath: n.reportPath, reportError, projectId: n.projectId, projectError, unread: deps.store.unread() };
            }
        },
        {
            op: 'notices.list',
            describe: 'List notices, pinned/newest first. args: type?, level?, minLevel?, agent?, unread? (bool), status? (open|answered|declined), handled? (bool), minStars?, tag?, project? (id or name — or "(none)" for the ones nobody filed), limit? (default 30). To poll your answered questions: agent=<you>, type=question, handled=false.',
            handler: (args) => deps.store.list({
                type: optStr(args, 'type'),
                level: typeof args.level === 'number' ? args.level : undefined,
                minLevel: typeof args.minLevel === 'number' ? args.minLevel : undefined,
                agent: optStr(args, 'agent'),
                unread: args.unread === true ? true : undefined,
                status: optStr(args, 'status'),
                handled: typeof args.handled === 'boolean' ? args.handled : undefined,
                minStars: typeof args.minStars === 'number' ? args.minStars : undefined,
                tag: optStr(args, 'tag'),
                projectId: projectFilter(optStr(args, 'project'), deps),
                limit: typeof args.limit === 'number' && args.limit > 0 ? args.limit : 30
            })
        },
        {
            op: 'notices.project',
            describe: 'File notices under a project, or take them out of one. args: id (or ids: string[]), project (id or name; empty string or omitted CLEARS the stamp). Reversible on purpose — the window stamps what it was showing, which is right most of the time and wrong the rest.',
            handler: (args) => {
                const ids = Array.isArray(args.ids)
                    ? args.ids.map(x => String(x ?? '').trim()).filter(Boolean)
                    : [argStr(args, 'id')];
                need(ids.length > 0, 'notices.project needs "id" or a non-empty "ids"');
                const key = optStr(args, 'project');
                let projectId = '';
                if (key) {
                    projectId = deps.resolveProject?.(key) ?? '';
                    need(!!projectId, `no project matches "${key}" — projects.list shows the ids and names.`);
                }
                const changedCount = deps.store.setProject(ids, projectId);
                changed();
                return { changed: changedCount, projectId: projectId || null };
            }
        },
        {
            op: 'notices.read',
            describe: 'Mark a notice read. args: id — OR — all:true',
            handler: (args) => {
                if (args.all === true) { const c = deps.store.markAllRead(); changed(); return { markedRead: c }; }
                need(deps.store.markRead(argStr(args, 'id'), true), 'Notice not found — notices.list shows current ids.');
                changed(); return { ok: true, unread: deps.store.unread() };
            }
        },
        {
            op: 'notices.resolve',
            describe: 'Mark a question handled after you (the asking agent) acted on the user\'s answer or decline — drops it from your pending list. args: id',
            handler: (args) => {
                need(deps.store.resolve(argStr(args, 'id')), 'Notice not found — notices.list shows current ids.');
                changed(); return { ok: true };
            }
        },
        {
            op: 'notices.dismiss',
            describe: 'Remove a notice. args: id — OR — clearRead:true (remove read, non-pinned, non-starred, non-open-question notices)',
            handler: (args) => {
                if (args.clearRead === true) { const removed = deps.store.clearRead(); changed(); return { removed: removed.length }; }
                need(deps.store.dismiss(argStr(args, 'id')), 'Notice not found — notices.list shows current ids.');
                changed(); return { ok: true };
            }
        }
    ]);
}
