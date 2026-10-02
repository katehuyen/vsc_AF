/**
 * X-474 — A MISPLACED RUN IS SAID (Principle 1: a rule that fails silently is not a rule).
 *
 * A relay leg or a sentry round whose FIRST quota reading (the guard's own,
 * contextGuard QuotaSignalRecord.first) already stands at or past the quota
 * handover line was put on a full account by whatever placed it. The hop that
 * opened the leg carries `misplaced`, the round's row a 'misplaced' event, and
 * one Notice goes out per placement. There is no time window: the definition
 * is the first reading. A chain's first leg (its seal) was placed by a person
 * and is not judged; a reading the guard never took judges nothing.
 */
import type { Baton } from './baton';
import { isSeal } from './batonSeal';
import type { StartWall } from './startRoom';

/** The guard's first reading of a session's account window. */
export interface FirstQuota {
    pct: number;
    ts: number;
    /** the slot, by label */
    account: string;
    /** agentFarm.quotaHandoverPct when it was read; 0 = off */
    line: number;
    /** X-478 — the week's first reading and its own line (agentFarm.quotaWeeklyHandoverPct; 0 = off) */
    week?: number;
    weekLine?: number;
}

export interface Misplaced {
    slot: string;
    pct: number;
    /** the wall the placement should have obeyed (startWall: the Account ceiling, or the campaign's) */
    wall: number;
    /** the quota handover line the first reading stood at or past */
    line: number;
    at: number;
    /** X-478 — the window it was full in, when it was the week */
    window?: 'week';
    why: string;
}

export function misplacedVerdict(first: FirstQuota | undefined, wall: StartWall): Misplaced | undefined {
    if (!first) { return undefined; }
    const placed = `it was placed on a full account, where the wall in force was ${wall.value}% (${wall.why})`;
    if (first.line > 0 && first.pct >= first.line) {
        return {
            slot: first.account, pct: first.pct, wall: wall.value, line: first.line, at: first.ts,
            why: `${first.account} read ${first.pct}% at its first reading — at or past the quota handover line (${first.line}%): ${placed}`
        };
    }
    const week = Number(first.week), wline = Number(first.weekLine);
    if (!(wline > 0) || !(week >= wline)) { return undefined; }
    // X-479 — a week judged against its own wall names that wall
    const ww = typeof wall.week === 'number' ? wall.week : wall.value;
    const placedWeek = typeof wall.week === 'number'
        ? `it was placed on a full account, where the weekly wall in force was ${wall.week}% (${wall.weekWhy})` : placed;
    return {
        slot: first.account, pct: week, wall: ww, line: wline, at: first.ts, window: 'week',
        why: `${first.account} read ${week}% of its weekly window at its first reading — at or past the weekly quota handover line (${wline}%): ${placedWeek}`
    };
}

/** A sentry round as the watch needs it. */
export interface RoundGlimpse {
    taskId: string;
    sessionId: string;
    sentryOf: string;
    /** the row already says it (its 'misplaced' event) */
    said: boolean;
}

export interface MisplacedDeps {
    batons: () => Baton[];
    put: (b: Baton) => void;
    first: (sessionId: string) => FirstQuota | undefined;
    /** the wall a relay leg (no round) or a round was placed under */
    wall: (round?: RoundGlimpse) => StartWall;
    /** RUNNING sentry rounds whose session is known */
    rounds?: () => RoundGlimpse[];
    markRound?: (taskId: string, m: Misplaced) => void;
    notify: (title: string, body: string, key: string) => void;
}

export class MisplacedWatch {
    /** placements already judged this boot: a first reading under the line is final too */
    private readonly judged = new Set<string>();

    constructor(private readonly deps: MisplacedDeps) { }

    sweep(): Misplaced[] {
        const out: Misplaced[] = [];
        for (const b of this.deps.batons()) {
            if (b.state !== 'started' || !b.toSessionId || isSeal(b) || b.misplaced || this.judged.has(b.id)) { continue; }
            const first = this.deps.first(b.toSessionId);
            if (!first) { continue; }
            this.judged.add(b.id);
            const m = misplacedVerdict(first, this.deps.wall());
            if (!m) { continue; }
            this.deps.put({ ...b, misplaced: m });
            this.deps.notify('Relay leg opened on a full account',
                `${m.why}. Chain ${b.chainId}, leg ${b.hop + 1} (session ${b.toSessionId.slice(0, 8)}) — the pass that placed it carries this as misplaced (baton.status).`,
                `misplaced:${b.id}`);
            out.push(m);
        }
        for (const r of this.deps.rounds?.() ?? []) {
            if (r.said || this.judged.has(r.taskId)) { continue; }
            const first = this.deps.first(r.sessionId);
            if (!first) { continue; }
            this.judged.add(r.taskId);
            const m = misplacedVerdict(first, this.deps.wall(r));
            if (!m) { continue; }
            this.deps.markRound?.(r.taskId, m);
            this.deps.notify('Sentry round opened on a full account',
                `${m.why}. Campaign ${r.sentryOf}, round task ${r.taskId} (session ${r.sessionId.slice(0, 8)}).`,
                `misplaced:${r.taskId}`);
            out.push(m);
        }
        return out;
    }
}
