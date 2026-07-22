import * as fs from 'fs';
import { argStr, BridgeRegistry, need, optStr } from './bridge';

/**
 * Notices — the farm's agent→user notice board. ANY agent (via the bridge op
 * `notices.post`) drops a titled, optionally bodied message here; the user
 * reads them on the dedicated Notices page (title first, click to expand the
 * body) and a status-bar bell keeps the unread count in view. This is the one
 * shared channel every agent uses for "you should know / remember this" —
 * daily AI-world digests, reminders, results worth surfacing, warnings.
 *
 * Unlike the Needs You queue (needs.ts), which is COMPUTED from live farm state
 * and clears itself, notices are PERSISTED, user-owned messages: they stay
 * until read/dismissed. Pure node module (fs only, no vscode) so the store and
 * every operation are unit-testable; the panel + status bar are wired by the
 * extension host.
 */

export type NoticeLevel = 'info' | 'success' | 'reminder' | 'warning' | 'alert';
export const NOTICE_LEVELS: NoticeLevel[] = ['info', 'success', 'reminder', 'warning', 'alert'];

export interface Notice {
    id: string;
    /** Created-at (ms epoch). */
    ts: number;
    /** Posting agent's name; '' → 'system'. */
    agentName: string;
    level: NoticeLevel;
    /** Shown first, always. */
    title: string;
    /** Markdown, revealed on expand. */
    body?: string;
    tags?: string[];
    /** Optional reminder time (ms epoch) — surfaced, not scheduled here. */
    dueAt?: number;
    read?: boolean;
    readAt?: number;
    pinned?: boolean;
}

export interface NoticeInput {
    title: string;
    body?: string;
    agentName?: string;
    level?: string;
    tags?: string[] | string;
    dueAt?: number;
}

export interface NoticeFilter {
    unread?: boolean;
    agent?: string;
    level?: string;
    tag?: string;
    /** 0 / absent = no limit. */
    limit?: number;
}

const MAX_NOTICES = 300;
const TITLE_MAX = 200;
const BODY_MAX = 20000;
const TAGS_MAX = 12;

export function newNoticeId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function coerceLevel(v: unknown): NoticeLevel {
    const s = String(v ?? '').toLowerCase();
    return (NOTICE_LEVELS as string[]).includes(s) ? s as NoticeLevel : 'info';
}

export function coerceTags(v: unknown): string[] | undefined {
    let arr: string[] = [];
    if (Array.isArray(v)) { arr = v.map(x => String(x).trim()); }
    else if (typeof v === 'string') { arr = v.split(',').map(x => x.trim()); }
    arr = arr.filter(Boolean).slice(0, TAGS_MAX);
    return arr.length ? arr : undefined;
}

/** Validate an input into a fresh Notice (throws on an empty title). */
export function makeNotice(input: NoticeInput, now = Date.now()): Notice {
    const title = String(input.title ?? '').trim().slice(0, TITLE_MAX);
    need(!!title, 'a notice needs a non-empty "title"');
    const bodyRaw = typeof input.body === 'string' ? input.body.trim() : '';
    const agentName = String(input.agentName ?? '').trim().slice(0, 60) || 'system';
    const dueAt = typeof input.dueAt === 'number' && isFinite(input.dueAt) && input.dueAt > 0
        ? input.dueAt : undefined;
    return {
        id: newNoticeId(),
        ts: now,
        agentName,
        level: coerceLevel(input.level),
        title,
        body: bodyRaw ? bodyRaw.slice(0, BODY_MAX) : undefined,
        tags: coerceTags(input.tags),
        dueAt
    };
}

/** Pinned first, then newest. */
export function sortNotices(list: Notice[]): Notice[] {
    return list.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.ts - a.ts);
}

export function filterNotices(list: Notice[], f: NoticeFilter): Notice[] {
    const agent = (f.agent ?? '').toLowerCase();
    const level = (f.level ?? '').toLowerCase();
    const tag = (f.tag ?? '').toLowerCase();
    let out = sortNotices(list).filter(n =>
        (!f.unread || !n.read) &&
        (!agent || n.agentName.toLowerCase() === agent) &&
        (!level || n.level === level) &&
        (!tag || (n.tags ?? []).some(t => t.toLowerCase() === tag)));
    if (f.limit && f.limit > 0) { out = out.slice(0, Math.floor(f.limit)); }
    return out;
}

export function unreadCount(list: Notice[]): number {
    return list.reduce((a, n) => a + (n.read ? 0 : 1), 0);
}

/** Cap the store without ever dropping pinned or unread messages — the newest
 *  read ones are trimmed first. */
export function capNotices(list: Notice[], max = MAX_NOTICES): Notice[] {
    if (list.length <= max) { return list; }
    const keep = list.filter(n => n.pinned || !n.read);
    const rest = list.filter(n => !(n.pinned || !n.read)).sort((a, b) => b.ts - a.ts);
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
        } catch { this.notices = []; /* first run / unreadable */ }
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

    markRead(id: string, read = true): boolean {
        const n = this.notices.find(x => x.id === id);
        if (!n) { return false; }
        n.read = read;
        n.readAt = read ? Date.now() : undefined;
        this.save();
        return true;
    }

    markAllRead(): number {
        const now = Date.now();
        let c = 0;
        for (const n of this.notices) { if (!n.read) { n.read = true; n.readAt = now; c++; } }
        if (c) { this.save(); }
        return c;
    }

    pin(id: string, pinned: boolean): boolean {
        const n = this.notices.find(x => x.id === id);
        if (!n) { return false; }
        n.pinned = pinned;
        this.save();
        return true;
    }

    dismiss(id: string): boolean {
        const before = this.notices.length;
        this.notices = this.notices.filter(n => n.id !== id);
        if (this.notices.length === before) { return false; }
        this.save();
        return true;
    }

    /** Remove every read, non-pinned notice. */
    clearRead(): number {
        const before = this.notices.length;
        this.notices = this.notices.filter(n => !n.read || n.pinned);
        const removed = before - this.notices.length;
        if (removed) { this.save(); }
        return removed;
    }

    unread(): number { return unreadCount(this.notices); }
    list(f: NoticeFilter = {}): Notice[] { return filterNotices(this.notices, f); }
}

// ---------------------------------------------------------------------------
// bridge (constitution §19.C) — the channel every agent posts to / reads from
// ---------------------------------------------------------------------------

export interface NoticesOpsDeps {
    store: NoticesStore;
    /** Any mutation (post / read / dismiss) — extension refreshes panel + badge. */
    onChange?: () => void;
    /** A fresh post — extension may toast for high-severity levels. */
    onPost?: (n: Notice) => void;
}

export function registerNoticesOps(bridge: BridgeRegistry, deps: NoticesOpsDeps): void {
    const changed = () => { try { deps.onChange?.(); } catch { /* UI best-effort */ } };
    bridge.register([
        {
            op: 'notices.post',
            describe: 'Post a notice to the user\'s dashboard notice board (any agent → user; the shared channel for "you should know / remember this"). args: title (required), body? (markdown, shown on expand), agent? (poster name), level? (info|success|reminder|warning|alert), tags? (string[]|csv), dueAt? (ms epoch reminder time)',
            handler: (args) => {
                const n = deps.store.add({
                    title: argStr(args, 'title'),
                    body: optStr(args, 'body') || undefined,
                    agentName: optStr(args, 'agent') || undefined,
                    level: optStr(args, 'level') || undefined,
                    tags: (args.tags as string[] | string | undefined),
                    dueAt: typeof args.dueAt === 'number' ? args.dueAt : undefined
                });
                try { deps.onPost?.(n); } catch { /* toast best-effort */ }
                changed();
                return { id: n.id, ts: n.ts, level: n.level, title: n.title, unread: deps.store.unread() };
            }
        },
        {
            op: 'notices.list',
            describe: 'List notices, pinned/newest first. args: unread? (bool), agent?, level?, tag?, limit? (default 30)',
            handler: (args) => deps.store.list({
                unread: args.unread === true,
                agent: optStr(args, 'agent'),
                level: optStr(args, 'level'),
                tag: optStr(args, 'tag'),
                limit: typeof args.limit === 'number' && args.limit > 0 ? args.limit : 30
            })
        },
        {
            op: 'notices.read',
            describe: 'Mark a notice read. args: id — OR — all:true (mark every notice read)',
            handler: (args) => {
                if (args.all === true) { const c = deps.store.markAllRead(); changed(); return { markedRead: c }; }
                need(deps.store.markRead(argStr(args, 'id'), true), 'Notice not found — notices.list shows current ids.');
                changed();
                return { ok: true, unread: deps.store.unread() };
            }
        },
        {
            op: 'notices.dismiss',
            describe: 'Remove a notice. args: id — OR — clearRead:true (remove every read, non-pinned notice)',
            handler: (args) => {
                if (args.clearRead === true) { const c = deps.store.clearRead(); changed(); return { removed: c }; }
                need(deps.store.dismiss(argStr(args, 'id')), 'Notice not found — notices.list shows current ids.');
                changed();
                return { ok: true };
            }
        }
    ]);
}
