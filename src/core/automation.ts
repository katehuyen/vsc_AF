import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_TRIGGER_RULE, kapiciFields } from './kapiciTrigger';

/**
 * Automation gate — the single answer to two questions every unattended launch
 * must pass before it costs anything:
 *
 *   1. "Is the farm allowed to work right now?"   → master switch · pause-until · quiet hours
 *   2. "Is there actually work to do?"            → the firing PRECONDITION
 *
 * Before this module the only brakes were FREQUENCY brakes (debounce, cooldown,
 * maxPerHour). They cap how often an agent wakes, never whether waking is worth
 * anything — so the whole "is there work?" judgment lived inside the agent
 * prompt, and you had to pay a full model wake-up just to learn the answer was
 * "no". Measured: one watch trigger woke opus 23 times over five nights, found
 * nothing every single time, and cost $70.90. A precondition that counts files
 * in a folder answers the same question for free.
 *
 * Pure logic + fs only (no vscode), so every rule here is unit-testable.
 */

// ---------------------------------------------------------------- preconditions

export type PreconditionKind =
    /** the folder holds at least `minCount` files, ignoring `except` names */
    | 'folderHasFiles'
    /** the path does NOT exist (e.g. today's diary file was never written) */
    | 'fileMissing'
    /** the path was modified within the last `hours` */
    | 'pathChangedWithin'
    /** the work queue holds at least `minCount` actionable items */
    | 'queueHasWork'
    /** triggers only: Kapıcı's `rule` decides at fire time, from the changed file or its diff (M-59) */
    | 'kapici';

export interface Precondition {
    kind: PreconditionKind;
    /** target path; supports the {today} / {yesterday} date tokens */
    path?: string;
    /** file names that do not count as work (e.g. the folder's own _LOG_.md) */
    except?: string[];
    /** how many hits are needed (default 1) */
    minCount?: number;
    /** window for pathChangedWithin */
    hours?: number;
    /** look into sub-folders too (folderHasFiles) */
    recursive?: boolean;
    /** kapici: the rule asked (default trigger.has-work) */
    rule?: string;
    /** kapici: what the rule reads — the changed file's content, or its git diff */
    input?: 'file' | 'diff';
}

export interface PreconditionVerdict {
    /** true = there is work; the automation may fire */
    ok: boolean;
    /** one line for the skip log and the UI — always says WHY */
    detail: string;
}

const DATE_TOKEN = /\{(today|yesterday)\}/g;

/** YYYY-MM-DD for a date, local time (the vault's day files are local-dated). */
function dayStamp(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Expand {today} / {yesterday} so a precondition can point at a dated file. */
export function expandDateTokens(p: string, now = new Date()): string {
    return p.replace(DATE_TOKEN, (_m, which) => {
        const d = new Date(now);
        if (which === 'yesterday') { d.setDate(d.getDate() - 1); }
        return dayStamp(d);
    });
}

/** Files in a folder that count as work (skips dot-files and the `except` list). */
function workFiles(dir: string, except: string[], recursive: boolean): string[] {
    const skip = new Set(except.map(e => e.toLowerCase()));
    const out: string[] = [];
    const walk = (d: string, depth: number): void => {
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (e.name.startsWith('.')) { continue; }
            if (e.isDirectory()) {
                if (recursive && depth < 6) { walk(path.join(d, e.name), depth + 1); }
                continue;
            }
            if (skip.has(e.name.toLowerCase())) { continue; }
            out.push(path.join(d, e.name));
        }
    };
    walk(dir, 0);
    return out;
}

export interface PreconditionDeps {
    /** actionable work-queue items (captured/grouped/blocked); injected so this
     *  module never imports the queue store. */
    queueWorkCount?: () => number;
    now?: () => number;
}

/**
 * Does this automation have work? An automation with NO precondition always
 * passes — the guard is opt-in, so nothing that exists today changes behavior
 * until it is configured.
 */
export function evaluatePrecondition(
    pre: Precondition | undefined, deps: PreconditionDeps = {}
): PreconditionVerdict {
    if (!pre || !pre.kind) { return { ok: true, detail: 'no precondition' }; }
    const now = new Date(deps.now?.() ?? Date.now());
    const need = Math.max(1, pre.minCount ?? 1);

    switch (pre.kind) {
        case 'folderHasFiles': {
            const dir = expandDateTokens(pre.path ?? '', now);
            if (!dir) { return { ok: false, detail: 'folderHasFiles: no path configured' }; }
            let stat: fs.Stats;
            try { stat = fs.statSync(dir); } catch {
                return { ok: false, detail: `folder is missing: ${dir}` };
            }
            if (!stat.isDirectory()) { return { ok: false, detail: `not a folder: ${dir}` }; }
            const files = workFiles(dir, pre.except ?? [], pre.recursive !== false);
            return files.length >= need
                ? { ok: true, detail: `${files.length} file(s) waiting` }
                : { ok: false, detail: `no files waiting (need ${need})` };
        }
        case 'fileMissing': {
            const target = expandDateTokens(pre.path ?? '', now);
            if (!target) { return { ok: false, detail: 'fileMissing: no path configured' }; }
            const exists = fs.existsSync(target);
            return exists
                ? { ok: false, detail: `file already exists: ${path.basename(target)}` }
                : { ok: true, detail: `file missing: ${path.basename(target)}` };
        }
        case 'pathChangedWithin': {
            const target = expandDateTokens(pre.path ?? '', now);
            const hours = pre.hours && pre.hours > 0 ? pre.hours : 24;
            let stat: fs.Stats;
            try { stat = fs.statSync(target); } catch {
                return { ok: false, detail: `path is missing: ${target}` };
            }
            const ageH = (now.getTime() - stat.mtimeMs) / 3600_000;
            return ageH <= hours
                ? { ok: true, detail: `changed ${ageH.toFixed(1)}h ago` }
                : { ok: false, detail: `unchanged for ${ageH.toFixed(1)}h (limit ${hours}h)` };
        }
        case 'queueHasWork': {
            const n = deps.queueWorkCount?.() ?? 0;
            return n >= need
                ? { ok: true, detail: `${n} queue item(s) waiting` }
                : { ok: false, detail: `queue has ${n} item(s) (need ${need})` };
        }
        case 'kapici':
            return { ok: true, detail: `Gatekeeper asks ${pre.rule || DEFAULT_TRIGGER_RULE} when it fires` };
        default:
            return { ok: true, detail: `unknown precondition "${String(pre.kind)}" — treated as pass` };
    }
}

/** Human-readable one-liner for the Automations table. */
export function describePrecondition(pre: Precondition | undefined): string {
    if (!pre || !pre.kind) { return ''; }
    const short = (p?: string) => {
        const s = p ?? '';
        return s.length > 30 ? '…' + s.slice(-29) : s;
    };
    switch (pre.kind) {
        case 'folderHasFiles':
            return `files in ${short(pre.path)}${pre.except?.length ? ` (skip ${pre.except.join(', ')})` : ''}`;
        case 'fileMissing':
            return `missing ${short(pre.path)}`;
        case 'pathChangedWithin':
            return `${short(pre.path)} changed <${pre.hours ?? 24}h`;
        case 'queueHasWork':
            return `queue ≥ ${pre.minCount ?? 1}`;
        case 'kapici':
            return `Gatekeeper ${pre.rule || DEFAULT_TRIGGER_RULE}${pre.input === 'diff' ? ' (diff)' : ''}`;
        default:
            return String(pre.kind);
    }
}

/** Normalize anything (bridge args, edited JSON) into a Precondition, or undefined. `kapici` = a trigger's, where that kind is allowed. */
export function parsePrecondition(raw: unknown, o2: { kapici?: boolean } = {}): Precondition | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const o = raw as Record<string, unknown>;
    const kind = String(o.kind ?? '').trim() as PreconditionKind;
    const kinds: PreconditionKind[] =
        ['folderHasFiles', 'fileMissing', 'pathChangedWithin', 'queueHasWork'];
    if (!kinds.includes(kind) && !(kind === 'kapici' && o2.kapici)) { return undefined; }
    const pre: Precondition = { kind };
    if (kind === 'kapici') { const k = kapiciFields(o); return k ? { ...pre, ...k } : undefined; }
    if (typeof o.path === 'string' && o.path.trim()) { pre.path = o.path.trim(); }
    if (Array.isArray(o.except)) {
        pre.except = o.except.filter(x => typeof x === 'string' && x.trim()).map(x => String(x).trim());
    }
    if (typeof o.minCount === 'number' && isFinite(o.minCount)) { pre.minCount = Math.max(1, Math.floor(o.minCount)); }
    if (typeof o.hours === 'number' && isFinite(o.hours) && o.hours > 0) { pre.hours = Math.floor(o.hours); }
    if (typeof o.recursive === 'boolean') { pre.recursive = o.recursive; }
    return pre;
}

// ---------------------------------------------------------------- the gate

/** Farm-wide automation state. Persisted in the task store so the panel, the
 *  bridge and the scheduler all read one truth. */
export interface AutomationState {
    /** master switch: true = no schedule/trigger fires at all */
    paused?: boolean;
    /** temporary pause; epoch ms. Expires on its own — no cleanup needed. */
    pausedUntil?: number;
    /** why the user paused (shown in the UI so a forgotten pause is explainable) */
    pauseReason?: string;
    /** quiet window start, "HH:MM" (empty = quiet hours off) */
    quietFrom?: string;
    /** quiet window end, "HH:MM"; may wrap past midnight (23:00 → 07:00) */
    quietTo?: string;
}

export type GateBlockKind = 'paused' | 'pausedUntil' | 'quiet';

export interface GateBlock {
    kind: GateBlockKind;
    /** one line for the user / skip log */
    reason: string;
    /** when the block lifts (quiet window end, pause expiry); undefined = manual */
    until?: number;
}

/** "HH:MM" → minutes past midnight, or undefined when unset/invalid. */
function hhmm(v: string | undefined): number | undefined {
    const m = /^(\d{1,2}):(\d{2})$/.exec((v ?? '').trim());
    if (!m) { return undefined; }
    const h = Number(m[1]), min = Number(m[2]);
    if (h > 23 || min > 59) { return undefined; }
    return h * 60 + min;
}

/** Next occurrence of an "HH:MM" wall-clock time at or after `now`. */
function nextAt(now: Date, minutes: number): number {
    const d = new Date(now);
    d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    if (d.getTime() <= now.getTime()) { d.setDate(d.getDate() + 1); }
    return d.getTime();
}

/** True while `now` sits inside the quiet window (which may wrap midnight). */
export function inQuietHours(state: AutomationState, now: Date): boolean {
    const from = hhmm(state.quietFrom);
    const to = hhmm(state.quietTo);
    if (from === undefined || to === undefined || from === to) { return false; }
    const cur = now.getHours() * 60 + now.getMinutes();
    return from < to ? (cur >= from && cur < to) : (cur >= from || cur < to);
}

/**
 * May an unattended automation fire right now? Returns the blocking reason, or
 * undefined when the farm is open for business. Manual "Run now" actions pass
 * their own `manual: true` and only respect the master switch, never quiet
 * hours — the user pressing a button is not an unattended wake-up.
 */
export function gateBlock(
    state: AutomationState | undefined, now: Date, opts: { manual?: boolean } = {}
): GateBlock | undefined {
    const s = state ?? {};
    if (s.paused) {
        return {
            kind: 'paused',
            reason: `all automations are paused${s.pauseReason ? ` — ${s.pauseReason}` : ''}`
        };
    }
    if (s.pausedUntil && s.pausedUntil > now.getTime()) {
        return {
            kind: 'pausedUntil',
            reason: `automations paused until ${new Date(s.pausedUntil).toLocaleString()}`,
            until: s.pausedUntil
        };
    }
    if (opts.manual) { return undefined; }
    if (inQuietHours(s, now)) {
        const to = hhmm(s.quietTo);
        return {
            kind: 'quiet',
            reason: `quiet hours ${s.quietFrom}–${s.quietTo}`,
            until: to === undefined ? undefined : nextAt(now, to)
        };
    }
    return undefined;
}

/** True when a pause has lapsed and should be cleared from the store. */
export function pauseExpired(state: AutomationState | undefined, nowMs: number): boolean {
    return !!state?.pausedUntil && state.pausedUntil <= nowMs;
}

// ---------------------------------------------------------------- skip log

/**
 * Every automation decision, fired or skipped, lands here. Principle 1 of the
 * agent constitution: a rule that fails silently is not a rule — a precondition
 * that quietly suppresses work would be exactly that failure mode, so the skip
 * IS the evidence. Powers the Living page and the no-op column.
 */
export interface AutomationEvent {
    ts: number;
    kind: 'schedule' | 'trigger';
    id: string;
    title: string;
    outcome: 'fired' | 'skipped';
    /** why it was skipped (or what the precondition found when it fired) */
    reason: string;
}

export const AUTOMATION_LOG_MAX = 300;

export function appendAutomationEvent(log: AutomationEvent[], ev: AutomationEvent): AutomationEvent[] {
    const next = [...log, ev];
    return next.length > AUTOMATION_LOG_MAX ? next.slice(next.length - AUTOMATION_LOG_MAX) : next;
}

export interface AutomationRollup {
    id: string;
    fired: number;
    skipped: number;
    /** share of decisions that were skipped — how much the precondition saves */
    skipRate: number;
    lastFiredAt?: number;
    lastSkippedAt?: number;
    lastReason?: string;
}

/** Per-automation fired/skipped counts over a window (default 7 days). */
export function rollupAutomationLog(
    log: AutomationEvent[], opts: { now?: number; windowMs?: number } = {}
): Map<string, AutomationRollup> {
    const now = opts.now ?? Date.now();
    const from = now - (opts.windowMs ?? 7 * 24 * 3600_000);
    const out = new Map<string, AutomationRollup>();
    for (const ev of log) {
        if (ev.ts < from) { continue; }
        const r = out.get(ev.id) ?? { id: ev.id, fired: 0, skipped: 0, skipRate: 0 };
        if (ev.outcome === 'fired') { r.fired++; r.lastFiredAt = ev.ts; }
        else { r.skipped++; r.lastSkippedAt = ev.ts; }
        r.lastReason = ev.reason;
        out.set(ev.id, r);
    }
    for (const r of out.values()) {
        const total = r.fired + r.skipped;
        r.skipRate = total ? r.skipped / total : 0;
    }
    return out;
}
