/**
 * U-27 — WHAT IS LEFT ON *THIS* ENGINE'S PLAN.
 *
 * ‼️ THE STATUS BAR WAS ANSWERING FOR ONE ENGINE AND LABELLED FOR ALL OF THEM.
 * The remaining-limit indicator reads Anthropic's own `/api/oauth/usage`
 * (core/planusage.ts) and says "86% / wk 41%" — which is true, and which is
 * true about Claude only. Once three other engines could run a session, an
 * indicator that silently means one of them is worse than no indicator: it
 * answers a question the reader did not ask and looks like it answered theirs.
 *
 * So the axis is the engine, and each engine's answer comes from what that
 * engine actually publishes. Measured on this machine, 2026-08-10:
 *
 *   · Claude — the OAuth usage endpoint. Percentages and reset times, the same
 *     figures `/usage` prints in the CLI. Lives in core/planusage.ts and is not
 *     duplicated here.
 *   · Codex — ‼️ IT IS ON DISK, AND NOBODY HAD LOOKED. Every rollout transcript
 *     carries `event_msg` lines of type `token_count`, and on the recent ones
 *     `rate_limits` is populated: `{ primary: { used_percent, window_minutes,
 *     resets_at }, secondary, plan_type }`. That is a real quota reading, for
 *     free, with no network call and no token — the CLI wrote it down while it
 *     worked. This module reads the newest one.
 *   · Antigravity — nothing. Its CLI runs a `quota_manager` (the log says so:
 *     `doRefreshQuota: starting reload`) and it does not write the figures
 *     anywhere this extension can read: no cache file, no state file, and the
 *     conversation store is protobuf. **This is reported as "not published",
 *     never as 0%** — a limit bar reading zero for an engine nobody can measure
 *     is the single most dangerous thing this file could draw.
 *   · Gemini — an API key, billed per token. There is no plan to have a
 *     percentage OF, so the honest row says that rather than showing an empty
 *     bar.
 *
 * Pure over injected readers, like engines.ts and models.ts: the whole matrix is
 * testable without a home directory.
 */

import { EngineId } from './engines';
import { PlanBar } from './planusage';

/** Why an engine has no percentage — never conflated with "0% used". */
export type UsageState =
    /** real figures, read from the engine's own record */
    | 'ok'
    /** the engine publishes no quota this machine can read */
    | 'not-published'
    /** it is billed per token; there is no plan to be a percentage of */
    | 'no-plan'
    /** it publishes them, but nothing has been read yet (never run here) */
    | 'unknown';

export interface EngineUsage {
    id: EngineId;
    label: string;
    state: UsageState;
    /** the rows a bar draws — empty unless `state === 'ok'` */
    bars: PlanBar[];
    /** the plan tier the engine's own record names ('plus', 'max', …) */
    plan: string;
    /** when the figures were produced (epoch ms), 0 when there are none */
    fetchedAt: number;
    /** ‼️ ONE line the reader can act on. Never "not configured", and never a
     *  blank where a percentage would have been. */
    note: string;
}

/** Everything this module needs from the outside world. */
export interface UsageProbe {
    /** newest-first list of the engine's transcript files, or empty */
    newestFiles(relDir: string, ext: string, limit: number): string[];
    /** the LAST `bytes` of a file as text, or undefined */
    readTail(absPath: string, bytes: number): string | undefined;
}

/** How far back into a rollout the last `token_count` line can be. Measured:
 *  the line is ~700 bytes and is written at every turn boundary, so the tail of
 *  a file always carries one — reading the whole 24 MB to find it would be a
 *  disk read per status-bar paint. */
const TAIL_BYTES = 256 * 1024;
/** How many recent rollouts to look at before giving up. The newest file is
 *  usually the answer; a session that ended before its first turn is not, and
 *  three is enough to step past a couple of those. */
const ROLLOUTS_TO_TRY = 3;

interface CodexLimits {
    used: number;
    windowMinutes: number;
    resetsAt: number;
    plan: string;
    /** the second window, when the plan has one */
    secondary?: { used: number; windowMinutes: number; resetsAt: number };
}

/** `10080` → `Current week`. The CLI states the window in minutes and names it
 *  nowhere, so the name is derived rather than invented. */
export function windowTitle(minutes: number): string {
    if (!(minutes > 0)) { return 'Current window'; }
    if (minutes % (60 * 24 * 7) === 0) {
        const w = minutes / (60 * 24 * 7);
        return w === 1 ? 'Current week' : `Current ${w} weeks`;
    }
    if (minutes % (60 * 24) === 0) {
        const d = minutes / (60 * 24);
        return d === 1 ? 'Current day' : `Current ${d} days`;
    }
    const h = minutes / 60;
    return Number.isInteger(h) ? `Current ${h}h window` : `Current ${minutes}m window`;
}

function num(v: unknown): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * The last `rate_limits` block in one rollout's tail.
 *
 * ‼️ A NULL `rate_limits` IS NOT AN ANSWER. The field is present on every
 * `token_count` line and is `null` until the service has said something —
 * measured: the July files carry `"rate_limits": null` on every line and the
 * August ones carry the real block. Taking the last line regardless would
 * report "no limits" for an account that has them.
 */
export function readCodexLimits(tail: string | undefined): CodexLimits | undefined {
    const text = String(tail ?? '');
    if (!text) { return undefined; }
    let found: CodexLimits | undefined;
    for (const line of text.split(/\r?\n/)) {
        if (!line.includes('"rate_limits"')) { continue; }
        let row: Record<string, unknown>;
        try { row = JSON.parse(line) as Record<string, unknown>; } catch { continue; }
        const payload = row.payload as Record<string, unknown> | undefined;
        const rl = payload?.rate_limits as Record<string, unknown> | undefined;
        if (!rl || typeof rl !== 'object') { continue; }
        const primary = rl.primary as Record<string, unknown> | undefined;
        if (!primary || typeof primary !== 'object') { continue; }
        const secondaryRaw = rl.secondary as Record<string, unknown> | undefined;
        found = {
            used: num(primary.used_percent),
            windowMinutes: num(primary.window_minutes),
            // the CLI writes SECONDS here, unlike every other stamp in this repo
            resetsAt: num(primary.resets_at) * 1000,
            plan: typeof rl.plan_type === 'string' ? rl.plan_type : '',
            ...(secondaryRaw && typeof secondaryRaw === 'object' ? {
                secondary: {
                    used: num(secondaryRaw.used_percent),
                    windowMinutes: num(secondaryRaw.window_minutes),
                    resetsAt: num(secondaryRaw.resets_at) * 1000
                }
            } : {})
        };
    }
    return found;
}

function codexBars(l: CodexLimits): PlanBar[] {
    const bars: PlanBar[] = [{
        id: 'codex_primary',
        title: windowTitle(l.windowMinutes),
        percent: Math.max(0, Math.min(100, Math.floor(l.used))),
        resetsAt: l.resetsAt
    }];
    if (l.secondary) {
        bars.push({
            id: 'codex_secondary',
            title: windowTitle(l.secondary.windowMinutes),
            percent: Math.max(0, Math.min(100, Math.floor(l.secondary.used))),
            resetsAt: l.secondary.resetsAt
        });
    }
    return bars;
}

/**
 * Codex's own reading of its quota, out of the newest rollout that has one.
 *
 * `fetchedAt` is deliberately the file's own mtime rather than "now": these
 * figures are as old as the last turn Codex ran, and a card that stamped them
 * with the time it read the file would be claiming a freshness nothing has.
 */
export function readCodexUsage(probe: UsageProbe, mtimeOf: (p: string) => number): EngineUsage {
    const base: EngineUsage = {
        id: 'codex', label: 'Codex', state: 'unknown', bars: [], plan: '', fetchedAt: 0,
        note: 'Codex has not written a quota reading here yet. It records one while it works, '
            + 'so run one turn and this fills in — there is no endpoint to ask.'
    };
    let files: string[] = [];
    try { files = probe.newestFiles('.codex/sessions', '.jsonl', ROLLOUTS_TO_TRY); } catch { return base; }
    for (const file of files) {
        let limits: CodexLimits | undefined;
        try { limits = readCodexLimits(probe.readTail(file, TAIL_BYTES)); } catch { continue; }
        if (!limits) { continue; }
        let at = 0;
        try { at = mtimeOf(file); } catch { at = 0; }
        return {
            ...base,
            state: 'ok',
            bars: codexBars(limits),
            plan: limits.plan,
            fetchedAt: at,
            note: 'Read from Codex\'s own transcript, which records the limit the service returned '
                + 'on its last turn. It costs nothing and asks nothing — but it is as old as that turn.'
        };
    }
    return base;
}

/** The whole matrix, in the order a picker draws it. */
export function readEngineUsage(
    probe: UsageProbe,
    mtimeOf: (p: string) => number,
    /** Claude's answer comes from the OAuth endpoint and is passed in — this
     *  module never makes a network call. */
    claude: { state: UsageState; bars: PlanBar[]; plan: string; fetchedAt: number; note: string }
): EngineUsage[] {
    return [
        { id: 'claude', label: 'Claude Code', ...claude },
        readCodexUsage(probe, mtimeOf),
        {
            id: 'gemini', label: 'Gemini', state: 'no-plan', bars: [], plan: '', fetchedAt: 0,
            note: 'This engine is billed per token against an API key, so there is no plan window to be '
                + 'a percentage of. What it has spent is in the cost figures, not here.'
        },
        {
            // ‼️ NOT ZERO. Its CLI refreshes a quota and writes the numbers
            // nowhere — measured. A bar at 0% would read as "nothing used".
            id: 'agy', label: 'Antigravity', state: 'not-published', bars: [], plan: '', fetchedAt: 0,
            note: 'Antigravity publishes no quota figure this machine can read: its CLI refreshes one '
                + 'internally and writes it to no file. Its usage is visible in the Antigravity app itself.'
        }
    ];
}

/** The one line an engine's row prints where a percentage would be. */
export function usageSummary(u: EngineUsage): string {
    if (u.state === 'ok' && u.bars.length) {
        return u.bars.map(b => `${b.title.replace(/^Current /, '')} ${b.percent}%`).join(' · ');
    }
    return u.state === 'no-plan' ? 'no plan — per-token'
        : u.state === 'not-published' ? 'not published'
            : 'not read yet';
}

/**
 * The status bar's own text for ONE engine.
 *
 * ‼️ IT NAMES THE ENGINE, ALWAYS. The figure that was there before said
 * `3h 49m - 86% / wk 41%` and meant Claude, on a machine with four engines
 * installed — a number whose subject the reader has to guess is a number the
 * reader will attribute to whatever they were last working in. The badge
 * costs five characters and removes the whole class of mistake.
 *
 * Returns undefined when there is nothing to show at all, which is what makes
 * the item hide itself rather than print a placeholder.
 */
export function engineBarText(u: EngineUsage | undefined, remaining: (at: number) => string): string | undefined {
    if (!u) { return undefined; }
    const tag = u.id === 'claude' ? '' : ` ${u.label.split(' ')[0]}`;
    if (u.state !== 'ok' || !u.bars.length) {
        // A row with no figure still says WHOSE row it is: switching to
        // Antigravity and seeing a blank bar would look like a broken read.
        return `$(dashboard)${tag} ${usageSummary(u)}`;
    }
    const parts = u.bars.map(b => {
        const left = b.resetsAt ? remaining(b.resetsAt) : '';
        const name = b.title.replace(/^Current /, '');
        return left ? `${name} ${b.percent}% (${left})` : `${name} ${b.percent}%`;
    });
    return `$(dashboard)${tag} ${parts.join(' / ')}`;
}

/** The peak percentage across an engine's windows — what decides the warning
 *  colour. An engine with no figures is never coloured as if it were at 0. */
export function enginePeak(u: EngineUsage | undefined): number {
    if (!u || u.state !== 'ok') { return 0; }
    return u.bars.reduce((n, b) => Math.max(n, b.percent), 0);
}
