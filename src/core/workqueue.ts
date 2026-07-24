import * as fs from 'fs';
import { argStr, BridgeRegistry, need, optStr } from './bridge';

/**
 * Work Queue — the farm's user→agent async work channel (the mirror image of
 * Notices, which is agent→user). The user drops small "fix this / do this"
 * items with almost no friction; they PERSIST in a queue and are never lost
 * until HANDLED. The manager scans the queue on a cadence, GROUPS related
 * items, and when a group is mature delegates it to the right agent in a single
 * turn — then stamps each item with the outcome.
 *
 * Why a separate store from Notices (not a striped Notice): the two have
 * OPPOSITE semantics. Notices are curated, sparse, "one thing = one notice, no
 * spam"; the queue is the reverse — high-volume, friction-free capture ("jot
 * every little thing"). Cramming capture noise into the Notices board would
 * destroy its discipline. Instead the two are joined at the ATTENTION layer
 * (one bell) and by the manager PUMP (queue = input, notices = output), while
 * each keeps a clean data model. Cross-links (a notice can spawn queue items;
 * a queue item remembers its source notice) tie them together without merging.
 *
 * Lifecycle (the proven drop→scan→process→stamp→done pattern, generalised from
 * the _LOG_ stamp system and the Notices question flow):
 *   captured → grouped → delegated → done          (the happy path)
 *              ↘ blocked (needs the user — the ONLY state that pulls attention)
 *              ↘ dropped (voided: duplicate / not-actionable / user-cancelled)
 * done + dropped are TERMINAL; everything else is "live" and is never capped
 * away or hard-deleted. An item cannot be removed until it is terminal — the
 * user's hard rule: a note must not disappear before it is handled, even if
 * the user hits delete (to void a mistaken capture the user sets it `dropped`,
 * which IS a form of handling).
 *
 * Pure node module (fs only) so store + logic are unit-testable; the extension
 * injects vscode-side concerns (report writing, terminal handoff).
 */

export type QueueStatus =
    | 'captured' | 'grouped' | 'delegated' | 'done' | 'blocked' | 'dropped';
export const QUEUE_STATUSES: QueueStatus[] =
    ['captured', 'grouped', 'delegated', 'done', 'blocked', 'dropped'];

/** Terminal states: handled, safe to archive/remove. */
export const TERMINAL_STATUSES: QueueStatus[] = ['done', 'dropped'];

/** User's urgency hint. `urgent` short-circuits batching (fires its group now). */
export type QueueUrgency = 'normal' | 'soon' | 'urgent';
export const QUEUE_URGENCIES: QueueUrgency[] = ['normal', 'soon', 'urgent'];

/** A queue item spawned from a notice, remembered ON the notice (see notices.ts). */
export interface SpawnedItemRef {
    itemId: string;
    /** Snapshot of what the user wrote — legible even if the item is later gone. */
    text: string;
    ts: number;
}

export interface WorkItem {
    id: string;
    /** capturedAt. */
    ts: number;
    /** 'user' for a user capture; the agent name if an agent queued it. */
    author: string;
    /** The raw capture — the whole point, friction-free. */
    text: string;
    /** Free-text routing hint: a repo/area or an agent name. */
    target?: string;
    tags?: string[];
    /** default 'normal'. */
    urgency: QueueUrgency;
    status: QueueStatus;
    /** Batch membership (manager-assigned). */
    groupId?: string;
    /** Delegation links — set when fired to an agent. */
    missionId?: string;
    taskId?: string;
    // --- result / stamp (the "handle" mechanic; mirrors _LOG_ stamps) ---
    /** Terse outcome tag: "-DONE- …" | "-SORU- …" | "-DROPPED- …". */
    stamp?: string;
    /** Full human-readable "what was done and how" — the user's tracking answer,
     *  shown inline in the Bitti lane. Enough for most (simple) items. */
    resolution?: string;
    /** The item's ANSWER as a FILE, when the outcome needs real detail — written
     *  to 01_CEVAPLAR. This is a "cevap" (answer), NOT a user-requested report:
     *  it explains what was done. Only detailed answers get a file; simple ones
     *  live in `resolution` alone. */
    answerPath?: string;
    /** A genuine REPORT/deliverable the user EXPLICITLY asked for in the item's
     *  instruction ("bana rapor ver") — lives in the normal report flow
     *  (10_REPORT), distinct from the answer above. */
    reportPath?: string;
    delegatedAt?: number;
    handledAt?: number;
    // --- source link (a notice the user converted into this item) ---
    sourceNoticeId?: string;
    /** Snapshot of the source notice title — origin stays legible if the notice
     *  is deleted (the default on convert). */
    sourceNoticeTitle?: string;
    // --- user bookkeeping ---
    pinned?: boolean;
    archived?: boolean;
    edited?: boolean;
    editedAt?: number;
}

export interface WorkItemInput {
    text: string;
    author?: string;
    target?: string;
    tags?: string[] | string;
    urgency?: string;
    sourceNoticeId?: string;
    sourceNoticeTitle?: string;
}

export interface WorkItemFilter {
    status?: string;
    /** Everything not yet terminal (captured|grouped|delegated|blocked). */
    active?: boolean;
    author?: string;
    target?: string;
    urgency?: string;
    groupId?: string;
    tag?: string;
    sourceNoticeId?: string;
    limit?: number;
}

/** What a stamp writes onto an item when the manager handles it. */
export interface StampInput {
    /** Terse tag, e.g. "-DONE- fixed in content.js". */
    stamp?: string;
    /** Full outcome the user reads in the "Bitti" lane. */
    resolution?: string;
    /** Path to a detailed-answer file (01_CEVAPLAR). */
    answerPath?: string;
    /** Path to a user-requested report/deliverable (10_REPORT). */
    reportPath?: string;
    /** Resulting terminal-ish status; default 'done'. */
    status?: QueueStatus;
}

const MAX_ITEMS = 600;
const TEXT_MAX = 8000;
const NAME_MAX = 60;
const TARGET_MAX = 60;
const TAGS_MAX = 12;
const RESOLUTION_MAX = 12000;

export function newItemId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function newGroupId(): string {
    return 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

export function coerceStatus(v: unknown, fallback: QueueStatus = 'captured'): QueueStatus {
    const s = String(v ?? '').toLowerCase();
    return (QUEUE_STATUSES as string[]).includes(s) ? s as QueueStatus : fallback;
}

export function coerceUrgency(v: unknown): QueueUrgency {
    const s = String(v ?? '').toLowerCase();
    return (QUEUE_URGENCIES as string[]).includes(s) ? s as QueueUrgency : 'normal';
}

export function coerceTags(v: unknown): string[] | undefined {
    let arr: string[] = [];
    if (Array.isArray(v)) { arr = v.map(x => String(x).trim()); }
    else if (typeof v === 'string') { arr = v.split(',').map(x => x.trim()); }
    arr = arr.filter(Boolean).slice(0, TAGS_MAX);
    return arr.length ? arr : undefined;
}

export function isTerminal(item: WorkItem): boolean {
    return (TERMINAL_STATUSES as string[]).includes(item.status);
}

/** Validate an input into a fresh WorkItem (throws on empty text). */
export function makeWorkItem(input: WorkItemInput, now = Date.now()): WorkItem {
    const text = String(input.text ?? '').trim().slice(0, TEXT_MAX);
    if (!text) { throw new Error('a work item needs non-empty "text"'); }
    const item: WorkItem = {
        id: newItemId(),
        ts: now,
        author: String(input.author ?? '').trim().slice(0, NAME_MAX) || 'user',
        text,
        urgency: coerceUrgency(input.urgency),
        status: 'captured',
        tags: coerceTags(input.tags)
    };
    const target = String(input.target ?? '').trim().slice(0, TARGET_MAX);
    if (target) { item.target = target; }
    const srcId = String(input.sourceNoticeId ?? '').trim();
    if (srcId) {
        item.sourceNoticeId = srcId.slice(0, 60);
        const srcTitle = String(input.sourceNoticeTitle ?? '').trim();
        if (srcTitle) { item.sourceNoticeTitle = srcTitle.slice(0, 200); }
    }
    return item;
}

/** Pinned first, then newest. */
export function sortItems(list: WorkItem[]): WorkItem[] {
    return list.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.ts - a.ts);
}

export function filterItems(list: WorkItem[], f: WorkItemFilter): WorkItem[] {
    const status = (f.status ?? '').toLowerCase();
    const author = (f.author ?? '').toLowerCase();
    const target = (f.target ?? '').toLowerCase();
    const urgency = (f.urgency ?? '').toLowerCase();
    const tag = (f.tag ?? '').toLowerCase();
    let out = sortItems(list).filter(n =>
        (!status || n.status === status) &&
        (!f.active || !isTerminal(n)) &&
        (!author || n.author.toLowerCase() === author) &&
        (!target || (n.target ?? '').toLowerCase() === target) &&
        (!urgency || n.urgency === urgency) &&
        (!f.groupId || n.groupId === f.groupId) &&
        (!f.sourceNoticeId || n.sourceNoticeId === f.sourceNoticeId) &&
        (!tag || (n.tags ?? []).some(t => t.toLowerCase() === tag)));
    if (f.limit && f.limit > 0) { out = out.slice(0, Math.floor(f.limit)); }
    return out;
}

/** Count of items still needing the USER (the only queue state that pings the
 *  attention bell — everything else is the manager's problem). */
export function blockedCount(list: WorkItem[]): number {
    return list.reduce((a, n) => a + (n.status === 'blocked' ? 1 : 0), 0);
}

/** Count of live (non-terminal) items — for page badges, not the bell. */
export function activeCount(list: WorkItem[]): number {
    return list.reduce((a, n) => a + (isTerminal(n) ? 0 : 1), 0);
}

/** Cap without ever dropping a LIVE item — only trims the oldest terminal ones. */
export function capItems(list: WorkItem[], max = MAX_ITEMS): WorkItem[] {
    if (list.length <= max) { return list; }
    const live = (n: WorkItem) => !isTerminal(n) || n.pinned;
    const keep = list.filter(live);
    const rest = list.filter(n => !live(n)).sort((a, b) => b.ts - a.ts);
    const room = Math.max(0, max - keep.length);
    return sortItems([...keep, ...rest.slice(0, room)]);
}

export class WorkQueueStore {
    items: WorkItem[] = [];

    constructor(private file: string) { }

    load(): void {
        try {
            const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { items?: WorkItem[] } | WorkItem[];
            const arr = Array.isArray(raw) ? raw : raw?.items;
            this.items = Array.isArray(arr)
                ? arr.filter(n => n && typeof n.id === 'string').map(normalise)
                : [];
        } catch { this.items = []; }
    }

    save(): void {
        this.items = capItems(this.items);
        try {
            fs.writeFileSync(this.file, JSON.stringify({ items: this.items }, null, 2), 'utf8');
        } catch { /* best-effort */ }
    }

    add(input: WorkItemInput): WorkItem {
        const n = makeWorkItem(input);
        this.items.unshift(n);
        this.save();
        return n;
    }

    private find(id: string): WorkItem | undefined { return this.items.find(x => x.id === id); }

    get(id: string): WorkItem | undefined { return this.find(id); }

    /** Free-form field edits (text / target / urgency / tags). */
    edit(id: string, patch: { text?: string; target?: string; urgency?: string; tags?: string[] | string }): boolean {
        const n = this.find(id); if (!n) { return false; }
        if (typeof patch.text === 'string' && patch.text.trim()) { n.text = patch.text.trim().slice(0, TEXT_MAX); }
        if (patch.target !== undefined) { const t = String(patch.target).trim(); n.target = t ? t.slice(0, TARGET_MAX) : undefined; }
        if (patch.urgency !== undefined) { n.urgency = coerceUrgency(patch.urgency); }
        if (patch.tags !== undefined) { n.tags = coerceTags(patch.tags); }
        n.edited = true; n.editedAt = Date.now();
        this.save(); return true;
    }

    setUrgency(id: string, urgency: string): boolean {
        const n = this.find(id); if (!n) { return false; }
        n.urgency = coerceUrgency(urgency); this.save(); return true;
    }

    setTarget(id: string, target: string): boolean {
        const n = this.find(id); if (!n) { return false; }
        const t = String(target ?? '').trim(); n.target = t ? t.slice(0, TARGET_MAX) : undefined;
        this.save(); return true;
    }

    pin(id: string, pinned: boolean): boolean {
        const n = this.find(id); if (!n) { return false; }
        n.pinned = pinned; this.save(); return true;
    }

    /** Set a bare status (manager pipeline moves). Guards the value. */
    setStatus(id: string, status: string): boolean {
        const n = this.find(id); if (!n) { return false; }
        n.status = coerceStatus(status, n.status);
        this.save(); return true;
    }

    /** Assign a group to a set of items (captured → grouped). Returns count moved. */
    group(ids: string[], groupId?: string): { groupId: string; count: number } {
        const gid = (groupId && groupId.trim()) || newGroupId();
        const set = new Set(ids); let c = 0;
        for (const n of this.items) {
            if (set.has(n.id) && !isTerminal(n)) {
                n.groupId = gid;
                if (n.status === 'captured') { n.status = 'grouped'; }
                c++;
            }
        }
        if (c) { this.save(); }
        return { groupId: gid, count: c };
    }

    /** Mark an item delegated, linking the mission/task it was fired into. */
    delegate(id: string, link: { missionId?: string; taskId?: string }): boolean {
        const n = this.find(id); if (!n) { return false; }
        if (link.missionId) { n.missionId = String(link.missionId).slice(0, 60); }
        if (link.taskId) { n.taskId = String(link.taskId).slice(0, 60); }
        n.status = 'delegated'; n.delegatedAt = Date.now();
        this.save(); return true;
    }

    /** The "handle" mechanic: stamp an outcome + resolution and set a status.
     *  Default result is 'done'; use 'blocked' when the user is needed, or
     *  'dropped' to void. Sets handledAt for terminal-ish outcomes. */
    stamp(id: string, s: StampInput): boolean {
        const n = this.find(id); if (!n) { return false; }
        if (s.stamp !== undefined) { n.stamp = String(s.stamp).trim().slice(0, 400) || undefined; }
        if (s.resolution !== undefined) { n.resolution = String(s.resolution).trim().slice(0, RESOLUTION_MAX) || undefined; }
        if (s.answerPath !== undefined) { const p = String(s.answerPath).trim(); n.answerPath = p ? p.slice(0, 500) : undefined; }
        if (s.reportPath !== undefined) { const p = String(s.reportPath).trim(); n.reportPath = p ? p.slice(0, 500) : undefined; }
        n.status = coerceStatus(s.status, 'done');
        n.handledAt = Date.now();
        this.save(); return true;
    }

    /** Archive a handled item out of the active lanes (kept, not deleted). */
    archive(id: string, archived = true): boolean {
        const n = this.find(id); if (!n) { return false; }
        if (archived && !isTerminal(n)) { return false; }  // never archive a live item
        n.archived = archived; this.save(); return true;
    }

    /** Remove an item — REFUSED unless it is terminal (the un-deletable rule).
     *  A live item the user regrets is voided via stamp(status:'dropped') first. */
    remove(id: string): { ok: boolean; reason?: string } {
        const n = this.find(id);
        if (!n) { return { ok: false, reason: 'not-found' }; }
        if (!isTerminal(n)) { return { ok: false, reason: 'not-handled' }; }
        this.items = this.items.filter(x => x.id !== id);
        this.save();
        return { ok: true };
    }

    blocked(): number { return blockedCount(this.items); }
    active(): number { return activeCount(this.items); }
    list(f: WorkItemFilter = {}): WorkItem[] { return filterItems(this.items, f); }
}

/** Repair a loaded record: fill defaults for fields added over time. */
function normalise(n: WorkItem): WorkItem {
    n.status = coerceStatus(n.status, 'captured');
    n.urgency = coerceUrgency(n.urgency);
    if (typeof n.author !== 'string' || !n.author) { n.author = 'user'; }
    if (typeof n.text !== 'string') { n.text = ''; }
    return n;
}

// ---------------------------------------------------------------------------
// bridge (constitution §19.C) — every queue function an agent can trigger
// ---------------------------------------------------------------------------

/** A thin port onto the Notices store so the queue can cross-link WITHOUT a
 *  hard import of the notices module (keeps the dependency one-way). The
 *  extension wires this to the real NoticesStore. */
export interface NoticesPort {
    /** Title of a notice, for the queue's source-snapshot. */
    titleOf(id: string): string | undefined;
    /** Record on the notice that it spawned this queue item (bi-di link). */
    addSpawnedItem(noticeId: string, ref: SpawnedItemRef): boolean;
    /** Remove the notice (the default on convert). */
    dismiss(noticeId: string): boolean;
}

export interface QueueOpsDeps {
    store: WorkQueueStore;
    /** Optional — enables queue.fromNotice cross-linking. */
    notices?: NoticesPort;
    /** Second leg for a DETAILED answer: persist markdown to 01_CEVAPLAR (a
     *  "cevap", not a report) and return its absolute path. Injected by the host
     *  so this module stays vscode-free. */
    writeAnswer?: (a: { title: string; name?: string; body: string; agentName?: string }) => string;
    onChange?: () => void;
    onPost?: (item: WorkItem) => void;
}

/** Read a string-array arg, tolerating a single string. */
function argIds(args: Record<string, unknown>, key: string): string[] {
    const v = args[key];
    if (Array.isArray(v)) { return v.map(x => String(x).trim()).filter(Boolean); }
    if (typeof v === 'string' && v.trim()) { return [v.trim()]; }
    return [];
}

export function registerQueueOps(bridge: BridgeRegistry, deps: QueueOpsDeps): void {
    const changed = () => { try { deps.onChange?.(); } catch { /* UI best-effort */ } };
    const store = deps.store;
    bridge.register([
        {
            op: 'queue.add',
            describe: 'Drop ONE work item into the user\'s async work queue (user→agent; the low-friction capture channel — "fix this / do this" that does NOT deserve its own turn). Persists until HANDLED. args: text (required, the raw one-liner), target? (free-text routing hint: a repo/area or an agent name), urgency? (normal|soon|urgent; urgent short-circuits batching), tags? (string[]|csv), author? (defaults to the agent name for agent-queued items; "user" for user captures). The manager scans, groups and batch-delegates these.',
            handler: (args) => {
                const item = store.add({
                    text: argStr(args, 'text'),
                    author: optStr(args, 'author') || undefined,
                    target: optStr(args, 'target') || undefined,
                    urgency: optStr(args, 'urgency') || undefined,
                    tags: (args.tags as string[] | string | undefined)
                });
                try { deps.onPost?.(item); } catch { /* best-effort */ }
                changed();
                return { id: item.id, ts: item.ts, status: item.status, active: store.active() };
            }
        },
        {
            op: 'queue.list',
            describe: 'List work items, pinned/newest first. args: status? (captured|grouped|delegated|done|blocked|dropped), active? (bool — only non-terminal), author?, target?, urgency?, groupId?, tag?, sourceNoticeId?, limit? (default 50). Manager sweep: active=true (or status=captured) to find pending work; blocked items are the only ones that need the USER.',
            handler: (args) => store.list({
                status: optStr(args, 'status') || undefined,
                active: args.active === true ? true : undefined,
                author: optStr(args, 'author') || undefined,
                target: optStr(args, 'target') || undefined,
                urgency: optStr(args, 'urgency') || undefined,
                groupId: optStr(args, 'groupId') || undefined,
                tag: optStr(args, 'tag') || undefined,
                sourceNoticeId: optStr(args, 'sourceNoticeId') || undefined,
                limit: typeof args.limit === 'number' && args.limit > 0 ? args.limit : 50
            })
        },
        {
            op: 'queue.get',
            describe: 'Fetch one work item in full (all pipeline/result fields). args: id',
            handler: (args) => {
                const n = store.get(argStr(args, 'id'));
                need(!!n, 'Work item not found — queue.list shows current ids.');
                return n;
            }
        },
        {
            op: 'queue.edit',
            describe: 'Edit a work item\'s fields. args: id, text?, target?, urgency?, tags?',
            handler: (args) => {
                need(store.edit(argStr(args, 'id'), {
                    text: optStr(args, 'text') || undefined,
                    target: args.target !== undefined ? optStr(args, 'target') : undefined,
                    urgency: optStr(args, 'urgency') || undefined,
                    tags: (args.tags as string[] | string | undefined)
                }), 'Work item not found — queue.list shows current ids.');
                changed(); return { ok: true };
            }
        },
        {
            op: 'queue.setStatus',
            describe: 'Move a work item along the pipeline. args: id, status (captured|grouped|delegated|done|blocked|dropped). For a delegation link use queue.delegate; to write an outcome use queue.stamp.',
            handler: (args) => {
                need(store.setStatus(argStr(args, 'id'), argStr(args, 'status')), 'Work item not found — queue.list shows current ids.');
                changed(); return { ok: true };
            }
        },
        {
            op: 'queue.group',
            describe: 'Assign a batch group to items (captured→grouped). args: ids (string[]), groupId? (omit to mint a new one). Returns { groupId, count }. This is how the manager forms a batch before delegating it in one turn.',
            handler: (args) => {
                const ids = argIds(args, 'ids');
                need(ids.length > 0, 'queue.group needs a non-empty "ids" array.');
                const r = store.group(ids, optStr(args, 'groupId') || undefined);
                changed(); return r;
            }
        },
        {
            op: 'queue.delegate',
            describe: 'Mark item(s) delegated and link the mission/task they were fired into (status→delegated). args: id OR ids (string[]), missionId?, taskId?. Call this right after missions.start / tasks.add so the queue shows what is in flight.',
            handler: (args) => {
                const ids = argIds(args, 'ids');
                if (!ids.length) { ids.push(argStr(args, 'id')); }
                const link = { missionId: optStr(args, 'missionId') || undefined, taskId: optStr(args, 'taskId') || undefined };
                let c = 0; for (const id of ids) { if (store.delegate(id, link)) { c++; } }
                changed(); return { delegated: c };
            }
        },
        {
            op: 'queue.stamp',
            describe: 'HANDLE an item: write the outcome the user tracks (the manager\'s "delege et ama sahiplen" close-out). args: id, stamp? (terse tag e.g. "-DONE- fixed in content.js" / "-SORU- which locale?"), resolution? (the CEVAP — full human-readable what/how was done, shown inline in the Bitti lane; enough for most items), status? (done|blocked|dropped; default done). For a DETAILED answer that needs its own file, pass answer? (full markdown) — the host writes it to 01_CEVAPLAR as a "cevap" (NOT a report) and links it; answerName? overrides the file name. Only if the user EXPLICITLY asked for a report/deliverable does that go via reportPath? (10_REPORT). Sets handledAt; only after this is the item removable.',
            handler: (args) => {
                const id = argStr(args, 'id');
                let answerPath = optStr(args, 'answerPath') || undefined;
                const answerBody = optStr(args, 'answer');
                if (!answerPath && answerBody && deps.writeAnswer) {
                    const it = store.get(id);
                    try {
                        answerPath = deps.writeAnswer({
                            title: it?.text?.slice(0, 60) || 'cevap',
                            name: optStr(args, 'answerName') || undefined,
                            body: answerBody,
                            agentName: optStr(args, 'agent') || undefined
                        });
                    } catch { /* answer write best-effort; the stamp still applies */ }
                }
                need(store.stamp(id, {
                    stamp: args.stamp !== undefined ? optStr(args, 'stamp') : undefined,
                    resolution: args.resolution !== undefined ? optStr(args, 'resolution') : undefined,
                    answerPath: answerPath !== undefined ? answerPath : (args.answerPath !== undefined ? optStr(args, 'answerPath') : undefined),
                    reportPath: args.reportPath !== undefined ? optStr(args, 'reportPath') : undefined,
                    status: optStr(args, 'status') as QueueStatus || undefined
                }), 'Work item not found — queue.list shows current ids.');
                changed(); return { ok: true, answerPath };
            }
        },
        {
            op: 'queue.setUrgency',
            describe: 'Set an item\'s urgency. args: id, urgency (normal|soon|urgent)',
            handler: (args) => {
                need(store.setUrgency(argStr(args, 'id'), argStr(args, 'urgency')), 'Work item not found — queue.list shows current ids.');
                changed(); return { ok: true };
            }
        },
        {
            op: 'queue.pin',
            describe: 'Pin/unpin a work item to the top. args: id, pinned (bool)',
            handler: (args) => {
                need(store.pin(argStr(args, 'id'), args.pinned === true), 'Work item not found — queue.list shows current ids.');
                changed(); return { ok: true };
            }
        },
        {
            op: 'queue.archive',
            describe: 'Archive a HANDLED item out of the active lanes (kept, not deleted). args: id, archived? (default true). Refused for a live item.',
            handler: (args) => {
                const archived = args.archived === false ? false : true;
                need(store.archive(argStr(args, 'id'), archived), 'Cannot archive — item not found or still live (handle it first).');
                changed(); return { ok: true };
            }
        },
        {
            op: 'queue.remove',
            describe: 'Delete a work item — REFUSED unless it is terminal (done|dropped). The un-deletable rule: a note must not vanish before it is handled. To void a mistaken capture, queue.stamp it status=dropped first. args: id',
            handler: (args) => {
                const r = store.remove(argStr(args, 'id'));
                need(r.ok, r.reason === 'not-handled'
                    ? 'Cannot delete an unhandled item — stamp it done/dropped first (un-deletable rule).'
                    : 'Work item not found — queue.list shows current ids.');
                changed(); return { ok: true };
            }
        },
        {
            op: 'queue.fromNotice',
            describe: 'Convert a Notices message into a work item (the user\'s reply/elaboration becomes the item). Links both ways. args: noticeId (required), text (required — what the user wrote), deleteNotice? (default true — the source notice is removed; false keeps it and records the spawned item ON the notice so the linkage stays visible). One notice may be converted several times.',
            handler: (args) => {
                const noticeId = argStr(args, 'noticeId');
                const text = argStr(args, 'text');
                const title = deps.notices?.titleOf(noticeId);
                const item = store.add({ text, author: 'user', sourceNoticeId: noticeId, sourceNoticeTitle: title });
                const del = args.deleteNotice === false ? false : true;
                if (deps.notices) {
                    if (del) { deps.notices.dismiss(noticeId); }
                    else { deps.notices.addSpawnedItem(noticeId, { itemId: item.id, text: item.text, ts: item.ts }); }
                }
                try { deps.onPost?.(item); } catch { /* best-effort */ }
                changed();
                return { id: item.id, noticeDeleted: del, sourceNoticeId: noticeId };
            }
        }
    ]);
}
