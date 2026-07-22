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
    limit?: number;
}

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
    let out = sortNotices(list).filter(n =>
        (!type || n.type === type) &&
        (!f.level || n.level === f.level) &&
        (!f.minLevel || n.level >= f.minLevel) &&
        (!agent || n.agentName.toLowerCase() === agent) &&
        (!f.unread || !n.read) &&
        (!status || (n.status ?? 'open') === status) &&
        (f.handled === undefined || !!n.handled === f.handled) &&
        (!f.minStars || (n.stars ?? 0) >= f.minStars) &&
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

    pin(id: string, pinned: boolean): boolean {
        const n = this.find(id); if (!n) { return false; }
        n.pinned = pinned; this.save(); return true;
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

    dismiss(id: string): boolean {
        const before = this.notices.length;
        this.notices = this.notices.filter(n => n.id !== id);
        if (this.notices.length === before) { return false; }
        this.save(); return true;
    }

    /** Remove read, non-pinned, non-starred, non-open-question notices. */
    clearRead(): number {
        const before = this.notices.length;
        this.notices = this.notices.filter(n =>
            !n.read || n.pinned || (n.stars ?? 0) > 0
            || (n.type === 'question' && (n.status ?? 'open') !== 'declined' && !n.handled));
        const removed = before - this.notices.length;
        if (removed) { this.save(); } return removed;
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
}

export function registerNoticesOps(bridge: BridgeRegistry, deps: NoticesOpsDeps): void {
    const changed = () => { try { deps.onChange?.(); } catch { /* UI best-effort */ } };
    bridge.register([
        {
            op: 'notices.post',
            describe: 'Post ONE notice to the user\'s dashboard board (agent→user; the shared channel — post a single entry per thing you want to tell the user, never one per sub-item). args: title (required, the one-line root), type? (update|reminder|report|question, default update), level? (1 routine|2 medium|3 important|4 ultra, default 1), body? (markdown, shown on expand), sections? ([{title, body}] independently-collapsible sub-items, each a FULL self-contained summary — not a link-only teaser), agent? (poster name), tags? (string[]|csv), dueAt? (ms epoch). Use type=question to leave the user an async question (they answer in the UI); check & resolve your answered questions each turn.',
            handler: (args) => {
                const n = deps.store.add({
                    title: argStr(args, 'title'),
                    type: optStr(args, 'type') || undefined,
                    level: typeof args.level === 'number' ? args.level : undefined,
                    body: optStr(args, 'body') || undefined,
                    sections: args.sections,
                    agentName: optStr(args, 'agent') || undefined,
                    tags: (args.tags as string[] | string | undefined),
                    dueAt: typeof args.dueAt === 'number' ? args.dueAt : undefined
                });
                try { deps.onPost?.(n); } catch { /* toast best-effort */ }
                changed();
                return { id: n.id, ts: n.ts, type: n.type, level: n.level, title: n.title, unread: deps.store.unread() };
            }
        },
        {
            op: 'notices.list',
            describe: 'List notices, pinned/newest first. args: type?, level?, minLevel?, agent?, unread? (bool), status? (open|answered|declined), handled? (bool), minStars?, tag?, limit? (default 30). To poll your answered questions: agent=<you>, type=question, handled=false.',
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
                limit: typeof args.limit === 'number' && args.limit > 0 ? args.limit : 30
            })
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
                if (args.clearRead === true) { const c = deps.store.clearRead(); changed(); return { removed: c }; }
                need(deps.store.dismiss(argStr(args, 'id')), 'Notice not found — notices.list shows current ids.');
                changed(); return { ok: true };
            }
        }
    ]);
}
