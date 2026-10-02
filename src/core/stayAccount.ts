/**
 * S-106 — A HANDOVER THAT IS NOT THE QUOTA'S STAYS ON ITS ACCOUNT while that
 * account still has room.
 *
 * A run that hands over because its CONTEXT window filled up (or passes for any
 * reason other than a quota handover) used to open its successor on the pool's
 * pick — usually another account — leaving its own five-hour window half used
 * and starting another one early. Under `agentFarm.contextHandoverStayAccountPct`
 * the successor opens on the SAME account instead; at or above it, or when the
 * handover was the quota's, the pool picks as before. 0 = off (a used account
 * is never under 0%). One rule for the baton relay's next leg and the sentry's
 * next round. Pure: facts in, verdict out.
 *
 * ‼️ X-470 — A STAY IS A START, so it obeys the wall every start obeys
 * (`wall`, startRoom.ts startWall: the Account ceiling, never above the quota
 * handover line). The stay line is the user's second box and may only be
 * STRICTER: set above the wall it acts at the wall, and the sentence says so.
 * Measured 2026-10-02, chain chn_muqifjzc001n2b: the stay line was 90, the leg
 * passed on its own probe at 90 while Agent Farm read 89 and no quota order had
 * gone out, so the successor stayed — and opened at 92%. The account's FIGURE
 * decides here, not whether an order reached the agent.
 */
import { resolveFlex } from './flexResolve';
import type { StartWall } from './startRoom';

/** The line in force, on the flex chain; `own(key)` = what the USER wrote for agentFarm.<key>. */
export function stayPctOf(own: (key: string) => unknown): { value: number; sentence: string } {
    const v = own('contextHandoverStayAccountPct');
    const r = resolveFlex('baton.stayAccountPct', v === undefined || v === null || v === '' ? {} : { settings: v });
    const n = Number(r.value);
    return { value: Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0, sentence: r.sentence };
}

export interface StayInput {
    /** agentFarm.contextHandoverStayAccountPct — 0 = off */
    stayPct: number;
    /** the slot the ending run was on; empty = the main sign-in, nothing to stay on */
    slotId?: string;
    /** that slot's five-hour usage now, 0–100 (the figure in force: a floor counts); negative or absent = not measured */
    percent?: number;
    /** that window's reset, epoch ms; a reset already past means the window is fresh */
    resetsAt?: number;
    /** a QUOTA handover order reached the run */
    quotaHandover: boolean;
    /** X-462 — the plan limit walled the run on this slot: its figure may still read under the line */
    walled?: boolean;
    /** X-470 — the wall every start obeys (startWall); the stay line never stands above it */
    wall: StartWall;
    now: number;
}

export type StayVerdict = { stay: true; slotId: string; why: string } | { stay: false; why: string };

/** The line a stay is judged at: the stay box, or the start wall when that is lower. */
export function stayLineOf(stayPct: number, wall: StartWall | undefined): { value: number; atWall: boolean; why: string } {
    const line = Number(stayPct);
    const w = Number(wall?.value);
    if (wall && Number.isFinite(w) && w > 0 && w < line) {
        return { value: w, atWall: true, why: `the ${w}% wall every start obeys (${wall.why}); the stay line ${line}% stands above it and acts there` };
    }
    return { value: line, atWall: false, why: `the ${line}% line (the stay line, contextHandoverStayAccountPct)` };
}

/** The Settings row's note when the stay box acts at the wall rather than at its own figure; undefined when it acts as written. */
export function stayInForceNote(stayPct: number, wall: StartWall | undefined): string | undefined {
    const at = stayLineOf(stayPct, wall);
    if (!at.atWall || !wall) { return undefined; }
    const source = String(wall.why).replace(/^\d+(\.\d+)?% — /, '');
    return `In force: ${at.value}% — a stay is a start, and every start obeys the ${at.value}% wall (${source}).`;
}

export function stayOnAccount(i: StayInput): StayVerdict {
    const line = Number(i.stayPct);
    if (!Number.isFinite(line) || line <= 0) { return { stay: false, why: 'staying on the account is off (contextHandoverStayAccountPct 0)' }; }
    const slot = String(i.slotId ?? '').trim();
    if (!slot) { return { stay: false, why: 'the run was on the main sign-in — there is no account to stay on' }; }
    if (i.quotaHandover) { return { stay: false, why: `the handover was the quota's — the pool picks another account than ${slot}` }; }
    if (i.walled) { return { stay: false, why: `the plan limit walled the run on ${slot} — the pool picks another account` }; }
    const fresh = !!i.resetsAt && i.resetsAt > 0 && i.resetsAt <= i.now;
    const pct = fresh ? 0 : Number(i.percent);
    if (!Number.isFinite(pct) || pct < 0) { return { stay: false, why: `${slot}'s five-hour window is not measured — the pool picks` }; }
    const at = stayLineOf(line, i.wall);
    if (pct >= at.value) {
        return { stay: false, why: `${slot} is at ${Math.round(pct)}% of its five-hour window, not under ${at.why} — the pool picks` };
    }
    return {
        stay: true, slotId: slot,
        why: `${slot} is at ${Math.round(pct)}% of its five-hour window${fresh ? ' (it has reset)' : ''}, under ${at.why} — `
            + 'the successor stays on it rather than opening another account\'s window'
    };
}
