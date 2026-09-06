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
    /**
     * ‼️ U-59 — THE TWO WORDS THAT STAND WHERE A PERCENTAGE WOULD, when the
     * STATE alone does not say enough.
     *
     * `no-plan` is one state reached for two different reasons. Gemini has no
     * plan because it is billed per token against a key, and `per-token` is
     * exactly right for it. OpenCode has no plan because each model runs against
     * its own provider — and it is the one engine here besides Claude that
     * states a real price per turn, so `per-token` read as "your tokens are
     * being billed", which is the opposite of what a free model does. Absent =
     * the state's own word, which is still right for the other four.
     */
    headline?: string;
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
export function readCodexUsage(
    probe: UsageProbe, mtimeOf: (p: string) => number,
    /**
     * ‼️ X-215 — WHOSE `sessions/` FOLDER. The default is the machine's own,
     * which is what the status bar and the Dashboard have always asked for; a
     * captured account passes its OWN directory and gets its own figure out of
     * the same parser. Two roots, one reader — a second copy of this parser is
     * how the card and the status bar would come to disagree about one week.
     */
    relDir = '.codex/sessions'
): EngineUsage {
    const base: EngineUsage = {
        id: 'codex', label: 'Codex', state: 'unknown', bars: [], plan: '', fetchedAt: 0,
        note: 'Codex has not written a quota reading here yet. It records one while it works, '
            + 'so run one turn and this fills in — there is no endpoint to ask.'
    };
    let files: string[] = [];
    try { files = probe.newestFiles(relDir, '.jsonl', ROLLOUTS_TO_TRY); } catch { return base; }
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
        },
        {
            // ‼️ U-59 — THE ROW EXISTS BECAUSE THE ENGINE DOES. This matrix is
            // what the status-bar hover, the Dashboard card and `engines.usage`
            // all enumerate, and an engine simply MISSING from it is the failure
            // this file's own `not-published` row was invented to avoid: the
            // reader cannot tell "no plan window here" from "this build has
            // never heard of it". It is `no-plan` and not `not-published`,
            // because there is nothing being withheld — OpenCode is a client
            // for whichever provider a model belongs to, and it is the ONE
            // engine besides Claude that states the price of every turn.
            id: 'opencode', label: 'OpenCode', state: 'no-plan', bars: [], plan: '', fetchedAt: 0,
            headline: 'priced per turn',
            note: 'OpenCode runs each model against whichever provider it belongs to, so there is no single '
                + 'plan window here to be a percentage of — and no quota to read on a built-in free model. '
                + 'It states the price of every turn itself, so what it has spent is in the cost figures.'
        }
    ];
}

/** The one line an engine's row prints where a percentage would be. */
/**
 * U-96 — CAN THIS ENGINE'S FIGURES BE ASKED FOR AGAIN?
 *
 * ‼️ Derived from the state rather than declared per engine, because a list of
 * ids is a list that goes out of date on the next engine. An engine either has
 * a source this machine can read or it does not, and that is exactly what the
 * state already says:
 *
 *   · `ok` / `unknown` — there IS a source. Claude's is the usage endpoint (a
 *     request), Codex's is the newest rollout file (a disk read). `unknown` is
 *     the case where re-reading matters most: it publishes them and nothing has
 *     been read yet.
 *   · `not-published` — it writes its quota nowhere readable, so a re-read
 *     would read the same nothing.
 *   · `no-plan` — billed per token; there is no percentage to refresh.
 *
 * So the two that offer no action offer none for a REASON, and the surface can
 * say which rather than leaving a gap.
 */
export function canRecheck(u: EngineUsage | undefined): boolean {
    return !u || u.state === 'ok' || u.state === 'unknown';
}

export function usageSummary(u: EngineUsage): string {
    if (u.state === 'ok' && u.bars.length) {
        return u.bars.map(b => `${b.title.replace(/^Current /, '')} ${b.percent}%`).join(' · ');
    }
    // ‼️ U-59 — the row's own word wins where it has one; see `headline`.
    if (u.headline) { return `no plan — ${u.headline}`; }
    return u.state === 'no-plan' ? 'no plan — per-token'
        : u.state === 'not-published' ? 'not published'
            : 'not read yet';
}

/**
 * A window's name, cut to what fits in a status bar (U-40).
 *
 * `Current week (all models)` is a heading — right on a card that has a line to
 * itself, and four times too long on a strip that is sharing a row with the
 * file path, the branch, the line number and every other extension's item.
 * Here the window is a suffix on a percentage, so it gets the shortest form
 * that is still unambiguous: `wk`, `2wk`, `day`, `3d`, `5h`. The parenthesised
 * qualifier goes; which models a limit covers is a card's job, not a strip's.
 */
function shortWindow(title: string): string {
    const t = title.replace(/^Current\s+/i, '').replace(/\s*\([^()]*\)\s*$/, '').trim();
    let m = /^(\d+)?\s*weeks?$/i.exec(t);
    if (m) { return `${m[1] && m[1] !== '1' ? m[1] : ''}wk`; }
    m = /^(\d+)?\s*days?$/i.exec(t);
    if (m) { return m[1] && m[1] !== '1' ? `${m[1]}d` : 'day'; }
    m = /^(\d+)\s*h(?:\s*window)?$/i.exec(t);
    if (m) { return `${m[1]}h`; }
    // 'session', or a window shape nobody has measured: printed as it stands,
    // never invented into a span that was not stated.
    return t.split(/\s+/)[0].toLowerCase();
}

/**
 * The status bar's own text for ONE engine.
 *
 * ‼️ IT IS A STRIP, NOT A SENTENCE — AND THE SUBJECT IS IN THE HOVER (U-40).
 * This function once produced `$(dashboard) Codex sessions 100% (54m) / week
 * (all models) 20% (6d 8h)`: an engine name, two window headings, two
 * percentages and two countdowns, on the one surface in the editor where every
 * character is taken from something else on the same row. The engine name was
 * added to stop a figure being mis-attributed, and the reasoning was sound about
 * a real problem and wrong about where to solve it — the hover already names the
 * engine, draws every other engine's figures beside it, and is where the engine
 * is CHOSEN. Nothing on the strip needed to repeat it.
 *
 * So the shape is the one Claude's own indicator had before four engines existed
 * and it is now what EVERY engine gets:
 *
 *     $(dashboard) 2h 43m - 78% / wk 21%
 *
 * — time left in the first window, then how much of it is gone, then each
 * further window as a short name and a percentage. A window with no stated
 * reset says its own name instead of an invented span, and an engine with no
 * readable figures is cut to two or three words rather than a sentence.
 *
 * Returns undefined when there is nothing to show at all, which is what makes
 * the item hide itself rather than print a placeholder.
 */
export function engineBarText(u: EngineUsage | undefined, remaining: (at: number) => string): string | undefined {
    if (!u) { return undefined; }
    if (u.state !== 'ok' || !u.bars.length) {
        // ‼️ MINIMISED, NOT OMITTED. "not published" is three words and says
        // the read is not broken; the hover carries the paragraph.
        const why = u.state === 'no-plan' ? 'per-token'
            : u.state === 'not-published' ? 'no quota published'
                : 'usage ?';
        return `$(dashboard) ${why}`;
    }
    const parts = u.bars.map((b, i) => {
        const name = shortWindow(b.title);
        if (i === 0) {
            // The first field is the TIME LEFT, not a label: a fixed window name
            // in front of the leading percentage is a constant, and the one
            // number a reader wants about time is how long until it comes back.
            const left = b.resetsAt ? remaining(b.resetsAt) : '';
            return left ? `${left} - ${b.percent}%` : `${name} ${b.percent}%`;
        }
        return `${name} ${b.percent}%`;
    });
    return `$(dashboard) ${parts.join(' / ')}`;
}

/** The peak percentage across an engine's windows — what decides the warning
 *  colour. An engine with no figures is never coloured as if it were at 0. */
export function enginePeak(u: EngineUsage | undefined): number {
    if (!u || u.state !== 'ok') { return 0; }
    return u.bars.reduce((n, b) => Math.max(n, b.percent), 0);
}
