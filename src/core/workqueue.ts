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
    /** GAP-4 — ids of items this one must follow (a soft ordering hint the
     *  manager reads when it sequences a batch's delegation). The queue only
     *  stores/carries the field; the sequencing judgment lives in the manager. */
    dependsOn?: string[];
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
    // --- blocked → user feedback loop (GAP-2) ---
    /** The user's reply to a BLOCKED item — what unblocks it. Accumulates across
     *  several rounds (a Q&A trail), separated by a blank line. */
    userReply?: string;
    userRepliedAt?: number;
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
    dependsOn?: string[] | string;
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
const DEPS_MAX = 20;
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

/** GAP-4 — normalise a dependsOn value (string[]|csv) into deduped item ids,
 *  dropping empties and any self-reference. Returns undefined when empty. */
export function coerceDeps(v: unknown, selfId?: string): string[] | undefined {
    let arr: string[] = [];
    if (Array.isArray(v)) { arr = v.map(x => String(x).trim()); }
    else if (typeof v === 'string') { arr = v.split(',').map(x => x.trim()); }
    arr = Array.from(new Set(arr.filter(x => x && x !== selfId))).slice(0, DEPS_MAX);
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
    const deps = coerceDeps(input.dependsOn, item.id);
    if (deps) { item.dependsOn = deps; }
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

/** One row of the active-groups digest (GAP-3). */
export interface GroupSummary {
    groupId: string;
    /** Live (non-terminal) members in the group. */
    count: number;
    /** Age in hours of the group's oldest live member — the batching clock. */
    oldestAgeHours: number;
    /** Distinct routing targets the group spans. */
    targets: string[];
    /** Status → count breakdown of the live members. */
    statuses: Record<string, number>;
    /** Any member marked urgent — the batching short-circuit. */
    hasUrgent: boolean;
}

/** GAP-3 — summarise the ACTIVE (non-terminal) batch groups so the manager reads
 *  batching maturity DIRECTLY instead of re-deriving it from every item on each
 *  scan: one row per group with size, the age of its oldest member, the targets
 *  it spans, a status breakdown, and whether anything in it is urgent. Ripest
 *  (oldest) group first — the order the manager wants to fire them in. */
export function groupSummaries(list: WorkItem[], now = Date.now()): GroupSummary[] {
    const by = new Map<string, WorkItem[]>();
    for (const n of list) {
        if (!n.groupId || isTerminal(n)) { continue; }
        (by.get(n.groupId) ?? by.set(n.groupId, []).get(n.groupId)!).push(n);
    }
    const out: GroupSummary[] = [];
    for (const [groupId, items] of by) {
        const oldest = items.reduce((m, n) => Math.min(m, n.ts || now), now);
        const targets = Array.from(new Set(items.map(n => n.target).filter((t): t is string => !!t)));
        const statuses: Record<string, number> = {};
        for (const n of items) { statuses[n.status] = (statuses[n.status] ?? 0) + 1; }
        out.push({
            groupId,
            count: items.length,
            oldestAgeHours: Math.round(((now - oldest) / 3600000) * 100) / 100,
            targets,
            statuses,
            hasUrgent: items.some(n => n.urgency === 'urgent')
        });
    }
    out.sort((a, b) => b.oldestAgeHours - a.oldestAgeHours);
    return out;
}

/** What a sweep should do right now, decided in code instead of re-derived from
 *  prose on every run. */
export interface QueueMaturity {
    /** groups that have earned a delegation (size, age, or urgency) */
    ripe: (GroupSummary & { why: string })[];
    /** live captured items that were never grouped at all */
    ungrouped: number;
    /**
     * Ungrouped items already past the age ceiling. THE starvation case, and a
     * real one: an item that never got a groupId is invisible to the group
     * digest, so a sweep reading only groups concludes "nothing to do" while a
     * user's answer rots in the queue. That is exactly how a sleep-log entry
     * sat in `captured` until it was noticed by hand.
     */
    starving: { id: string; text: string; ageHours: number; status: string }[];
    /** is waking an agent worth it at all */
    actionable: boolean;
    /** one line the sweep can act on (and the user can read) */
    reason: string;
}

export function queueMaturity(
    list: WorkItem[],
    opts: { groupSize?: number; maxAgeHours?: number; now?: number } = {}
): QueueMaturity {
    const now = opts.now ?? Date.now();
    const size = opts.groupSize ?? 3;
    const maxAge = opts.maxAgeHours ?? 24;
    const live = list.filter(n => !isTerminal(n));

    const ripe = groupSummaries(live, now)
        .map(g => {
            const why = g.hasUrgent ? 'urgent item'
                : g.oldestAgeHours > maxAge ? `waited ${Math.round(g.oldestAgeHours)}h (ceiling ${maxAge}h)`
                    : g.count >= size ? `${g.count} items (batch size ${size})`
                        : '';
            return { ...g, why };
        })
        .filter(g => g.why);

    const loose = live.filter(n => !n.groupId && n.status === 'captured');
    const starving = loose
        .map(n => ({
            id: n.id, text: n.text.slice(0, 80), status: n.status,
            ageHours: Math.round(((now - (n.ts || now)) / 3600000) * 10) / 10
        }))
        .filter(n => n.ageHours > maxAge)
        .sort((a, b) => b.ageHours - a.ageHours);

    const blocked = live.filter(n => n.status === 'blocked').length;
    const actionable = ripe.length > 0 || starving.length > 0 || blocked > 0;
    const reason = !live.length ? 'queue is empty'
        : starving.length ? `${starving.length} ungrouped item(s) past the ${maxAge}h ceiling — oldest ${starving[0].ageHours}h`
            : ripe.length ? `${ripe.length} group(s) ripe: ${ripe.map(g => g.why).join('; ')}`
                : blocked ? `${blocked} blocked item(s) waiting on the user`
                    : `${live.length} item(s) still warming up (need ${size} or ${maxAge}h)`;

    return { ripe, ungrouped: loose.length, starving, actionable, reason };
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

/** The last-touched timestamp of an item — the tiebreaker when the same id
 *  exists in two concurrently-saved copies (GAP-6 merge). */
export function itemModifiedAt(n: WorkItem): number {
    return Math.max(n.ts || 0, n.editedAt || 0, n.delegatedAt || 0, n.handledAt || 0, n.userRepliedAt || 0);
}

/** GAP-6 — union two copies of the queue by id, keeping the most-recently-touched
 *  version of each item, so a concurrent writer's work is never clobbered by a
 *  whole-file overwrite (e.g. the manager stamping while a second window captures).
 *  Trade-off: an item deleted by one writer while another still holds it can
 *  reappear — deliberately, since the priority is never LOSING a capture; the
 *  resurrected terminal item is cleaned up on the next handle. */
export function mergeItems(ours: WorkItem[], theirs: WorkItem[]): WorkItem[] {
    const byId = new Map<string, WorkItem>();
    for (const t of theirs) { if (t && typeof t.id === 'string') { byId.set(t.id, t); } }
    for (const o of ours) {
        if (!o || typeof o.id !== 'string') { continue; }
        const t = byId.get(o.id);
        byId.set(o.id, !t || itemModifiedAt(o) >= itemModifiedAt(t) ? o : t);
    }
    return Array.from(byId.values());
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
    /** Monotonic on-disk revision — bumped on every write, used to detect a
     *  concurrent writer since we loaded (GAP-6). */
    private rev = 0;

    constructor(private file: string) { }

    /** Read + normalise the store from disk without touching in-memory state. */
    private readDiskRaw(): { rev: number; items: WorkItem[] } | undefined {
        try {
            const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { rev?: number; items?: WorkItem[] } | WorkItem[];
            const arr = Array.isArray(raw) ? raw : raw?.items;
            const items = Array.isArray(arr) ? arr.filter(n => n && typeof n.id === 'string').map(normalise) : [];
            const rev = !Array.isArray(raw) && typeof raw?.rev === 'number' ? raw.rev : 0;
            return { rev, items };
        } catch { return undefined; }
    }

    load(): void {
        const disk = this.readDiskRaw();
        this.items = disk?.items ?? [];
        this.rev = disk?.rev ?? 0;
    }

    save(): void {
        // GAP-6 — concurrency safety: if another writer bumped the on-disk rev
        // since we loaded/last-saved, merge their items in before overwriting so
        // nothing they captured is lost. Then write ATOMICALLY (temp + rename) so
        // a reader never sees a half-written file.
        let diskRev = this.rev;
        const disk = this.readDiskRaw();
        if (disk) {
            diskRev = disk.rev;
            if (diskRev !== this.rev) { this.items = mergeItems(this.items, disk.items); }
        }
        this.items = capItems(this.items);
        this.rev = Math.max(this.rev, diskRev) + 1;
        const tmp = `${this.file}.tmp-${process.pid}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        try {
            fs.writeFileSync(tmp, JSON.stringify({ rev: this.rev, items: this.items }, null, 2), 'utf8');
            fs.renameSync(tmp, this.file);
        } catch {
            try { fs.unlinkSync(tmp); } catch { /* ignore — best-effort cleanup */ }
        }
    }

    add(input: WorkItemInput): WorkItem {
        const n = makeWorkItem(input);
        this.items.unshift(n);
        this.save();
        return n;
    }

    private find(id: string): WorkItem | undefined { return this.items.find(x => x.id === id); }

    get(id: string): WorkItem | undefined { return this.find(id); }

    /** Free-form field edits (text / target / urgency / tags / dependsOn). */
    edit(id: string, patch: { text?: string; target?: string; urgency?: string; tags?: string[] | string; dependsOn?: string[] | string }): boolean {
        const n = this.find(id); if (!n) { return false; }
        if (typeof patch.text === 'string' && patch.text.trim()) { n.text = patch.text.trim().slice(0, TEXT_MAX); }
        if (patch.target !== undefined) { const t = String(patch.target).trim(); n.target = t ? t.slice(0, TARGET_MAX) : undefined; }
        if (patch.urgency !== undefined) { n.urgency = coerceUrgency(patch.urgency); }
        if (patch.tags !== undefined) { n.tags = coerceTags(patch.tags); }
        if (patch.dependsOn !== undefined) { n.dependsOn = coerceDeps(patch.dependsOn, n.id); }
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

    /** GAP-2 — the blocked→user feedback loop. The user ANSWERS a blocked item:
     *  the reply is recorded and the item is re-animated back into the pipeline
     *  (to its prior 'grouped' if it was batched, else 'captured') so the manager
     *  reprocesses it. Without this, a blocked item has no way back and would pile
     *  up unresolved in the bell. Replies accumulate as a Q&A trail. Refused for a
     *  missing id or an empty reply; a terminal item keeps its terminal status. */
    answer(id: string, text: string): boolean {
        const n = this.find(id); if (!n) { return false; }
        const reply = String(text ?? '').trim().slice(0, TEXT_MAX);
        if (!reply) { return false; }
        n.userReply = n.userReply ? `${n.userReply}\n\n${reply}`.slice(0, TEXT_MAX) : reply;
        n.userRepliedAt = Date.now();
        if (n.status === 'blocked') { n.status = n.groupId ? 'grouped' : 'captured'; }
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
    /** GAP-3 — digest of the active batch groups (see groupSummaries). */
    groups(): GroupSummary[] { return groupSummaries(this.items); }

    /** The sweep decision in one call (see queueMaturity). */
    maturity(opts: { groupSize?: number; maxAgeHours?: number } = {}): QueueMaturity {
        return queueMaturity(this.items, opts);
    }
    list(f: WorkItemFilter = {}): WorkItem[] { return filterItems(this.items, f); }
}

/** Repair a loaded record: fill defaults for fields added over time. */
function normalise(n: WorkItem): WorkItem {
    n.status = coerceStatus(n.status, 'captured');
    n.urgency = coerceUrgency(n.urgency);
    if (typeof n.author !== 'string' || !n.author) { n.author = 'user'; }
    if (typeof n.text !== 'string') { n.text = ''; }
    if (n.dependsOn !== undefined) { n.dependsOn = coerceDeps(n.dependsOn, n.id); }
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
    /** Batching thresholds, read live from settings by the host. */
    thresholds?: () => { groupSize: number; maxAgeHours: number };
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
            describe: 'Drop ONE work item into the user\'s async work queue (user→agent; the low-friction capture channel — "fix this / do this" that does NOT deserve its own turn). Persists until HANDLED. args: text (required, the raw one-liner), target? (free-text routing hint: a repo/area or an agent name), urgency? (normal|soon|urgent; urgent short-circuits batching), tags? (string[]|csv), dependsOn? (string[]|csv of item ids this one must FOLLOW — a soft ordering hint), author? (defaults to the agent name for agent-queued items; "user" for user captures). The manager scans, groups and batch-delegates these.',
            handler: (args) => {
                const item = store.add({
                    text: argStr(args, 'text'),
                    author: optStr(args, 'author') || undefined,
                    target: optStr(args, 'target') || undefined,
                    urgency: optStr(args, 'urgency') || undefined,
                    tags: (args.tags as string[] | string | undefined),
                    dependsOn: args.dependsOn !== undefined ? (args.dependsOn as string[] | string) : undefined
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
            describe: 'Edit a work item\'s fields. args: id, text?, target?, urgency?, tags?, dependsOn? (string[]|csv of item ids this one must FOLLOW — a soft ordering hint for the manager when it sequences a batch; pass [] or "" to clear).',
            handler: (args) => {
                need(store.edit(argStr(args, 'id'), {
                    text: optStr(args, 'text') || undefined,
                    target: args.target !== undefined ? optStr(args, 'target') : undefined,
                    urgency: optStr(args, 'urgency') || undefined,
                    tags: (args.tags as string[] | string | undefined),
                    dependsOn: args.dependsOn !== undefined ? (args.dependsOn as string[] | string) : undefined
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
            op: 'queue.answer',
            describe: 'Answer a BLOCKED work item — the user→agent reply that unblocks it (mirror of answering a Notices question). The reply is recorded on the item and the item is re-animated back into the pipeline (to its prior group if it had one, else captured) so the manager reprocesses it; the attention bell drops. Replies accumulate as a Q&A trail. args: id, text (the reply). Refused for a missing id or empty text.',
            handler: (args) => {
                const id = argStr(args, 'id');
                need(store.answer(id, argStr(args, 'text')), 'Work item not found or empty reply — queue.list shows current ids.');
                changed(); return { ok: true, status: store.get(id)?.status };
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
            op: 'queue.groups',
            describe: 'Digest of the ACTIVE batch groups in ONE shot — so the manager reads batching maturity directly instead of re-deriving it from every item each scan. Returns [{ groupId, count, oldestAgeHours, targets[], statuses {status:count}, hasUrgent }], ripest (oldest) group first. Compare count against agentFarm.queue.groupSize, oldestAgeHours against queue.maxAgeHours, and hasUrgent (the short-circuit) to pick the groups mature enough to delegate now. NOTE: only items that already HAVE a groupId appear here — use queue.maturity to also see ungrouped items that are starving. args: none.',
            handler: () => store.groups()
        },
        {
            op: 'queue.maturity',
            describe: 'THE SWEEP DECISION in one call: what deserves a delegation right now, with the thresholds already applied. Returns { actionable, reason, ripe:[{groupId,count,oldestAgeHours,why}], ungrouped, starving:[{id,text,ageHours}] }. `starving` is the one queue.groups CANNOT show you — a captured item that was never grouped has no groupId, so a sweep reading only groups sees an empty digest while a user answer rots past the ceiling. Start every sweep here. args: groupSize?, maxAgeHours? (default: the agentFarm.queue.* settings).',
            handler: (args) => {
                const t = deps.thresholds?.() ?? { groupSize: 3, maxAgeHours: 24 };
                return store.maturity({
                    groupSize: typeof args.groupSize === 'number' ? args.groupSize : t.groupSize,
                    maxAgeHours: typeof args.maxAgeHours === 'number' ? args.maxAgeHours : t.maxAgeHours
                });
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
                // The second leg never fails quietly — an answer that was asked for
                // and not written is said out loud, exactly as notices.post does it.
                let answerError: string | undefined;
                if (!answerPath && args.answer !== undefined && !answerBody) {
                    answerError = 'answer was not a usable string, so no answer file was written — '
                        + 'if you built the JSON in PowerShell, cast the text with [string] '
                        + '(Get-Content -Raw hands back a decorated object).';
                }
                if (!answerPath && answerBody && deps.writeAnswer) {
                    const it = store.get(id);
                    try {
                        answerPath = deps.writeAnswer({
                            title: it?.text?.slice(0, 60) || 'cevap',
                            name: optStr(args, 'answerName') || undefined,
                            body: answerBody,
                            agentName: optStr(args, 'agent') || undefined
                        });
                    } catch (e) {
                        answerError = 'answer file could not be written: ' + String((e as Error)?.message ?? e).slice(0, 200);
                    }
                }
                need(store.stamp(id, {
                    stamp: args.stamp !== undefined ? optStr(args, 'stamp') : undefined,
                    resolution: args.resolution !== undefined ? optStr(args, 'resolution') : undefined,
                    answerPath: answerPath !== undefined ? answerPath : (args.answerPath !== undefined ? optStr(args, 'answerPath') : undefined),
                    reportPath: args.reportPath !== undefined ? optStr(args, 'reportPath') : undefined,
                    status: optStr(args, 'status') as QueueStatus || undefined
                }), 'Work item not found — queue.list shows current ids.');
                changed(); return { ok: true, answerPath, answerError };
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
