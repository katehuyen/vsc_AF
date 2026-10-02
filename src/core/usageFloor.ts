/**
 * ‼️ X-462 — WHAT A SIGN-IN'S WINDOW IS KNOWN TO BE RIGHT NOW, and the one fact
 * that keeps an old figure worth something: a plan window's figure only GROWS
 * until its turnover. So the last good reading is a FLOOR until that turnover,
 * a reading whose turnover has passed says the window is fresh, and the plan
 * limit itself is the surest reading of all — full until it turns over.
 *
 * Measured 2026-10-02, chain chn_muptzpk5002246: 2 min 43 s after a window
 * reload every account read "not read yet" (the figures lived in memory only),
 * `@emptiest` fell back to the first unmeasured one, and a relay leg opened on
 * an account at 95% — it handed over without writing a line. A failed read (a
 * 429, an aged token, the network) erased a good figure the same way: the
 * account went back to "unmeasured", which every policy treats as room.
 *
 * Pure: readings in, figures out. The service keeps the floors and the host
 * keeps them on disk (`UsageMemory`).
 */
import type { SlotUsage, UsageBar } from './accountUsage';

/** The last thing known for certain about one slot's window. */
export interface UsageFloor {
    /** the binding figure of that reading, 0–100 */
    percent: number;
    /** its binding window's turnover, epoch ms; 0 = not said */
    resetsAt: number;
    /** every window that reading carried */
    bars: UsageBar[];
    /** when it was known */
    fetchedAt: number;
    /** the plan limit stopped a run on this slot: full until `resetsAt` */
    walled?: boolean;
}

/** Where the floors live between two windows — the host's file. */
export interface UsageMemory {
    load(): Record<string, UsageFloor>;
    save(floors: Record<string, UsageFloor>): void;
}

/** The endpoint's own name for the five-hour window (accountUsage `FIVE_HOUR` — a type import cannot carry a value). */
const FIVE_HOUR_ID = 'five_hour';
/** A per-model week binds only the launches on that model; like `bindingBar`, a floor leaves it out. */
const PER_MODEL = /^seven_day_./;
/** No plan window outlasts this, so a wall with no turnover named is over by then. */
export const LONGEST_WINDOW_MS = 5 * 60 * 60 * 1000;

const turned = (resetsAt: number, now: number): boolean => resetsAt > 0 && resetsAt <= now;

/** One reading's binding figure at `now`: a window that turned over counts 0; -1 = it says nothing. */
function inForce(r: { percent: number; resetsAt: number; bars?: UsageBar[] }, now: number): number {
    if (!(r.percent >= 0)) { return -1; }
    const bars = (r.bars ?? []).filter(b => !PER_MODEL.test(b.id) && b.percent >= 0);
    if (!bars.length) { return turned(r.resetsAt, now) ? 0 : r.percent; }
    return Math.max(0, ...bars.map(b => (turned(b.resetsAt, now) ? 0 : b.percent)));
}

function floorNow(f: UsageFloor, now: number): number {
    if (f.walled && f.resetsAt > now) { return 100; }
    return inForce(f.walled ? { percent: 0, resetsAt: 0, bars: f.bars } : f, now);
}

/**
 * ‼️ THE FIGURE A DECISION STANDS ON: the live reading's, or the floor a failed
 * read, a reload or a wall left — whichever says more. -1 = nothing is known,
 * which every policy still treats as room (a figure we cannot see is not a
 * wall we can name).
 */
export function percentNow(u: SlotUsage | undefined, now = Date.now()): number {
    if (!u) { return -1; }
    const live = u.state === 'ok' ? inForce(u, now) : -1;
    return Math.max(live, u.floor ? floorNow(u.floor, now) : -1);
}

/** The five-hour window alone, the same way — the handover law's own figure (X-353). -1 = not known. */
export function fiveHourNow(u: SlotUsage | undefined, now = Date.now()): number {
    return windowNow(u, FIVE_HOUR_ID, now);
}

/** X-478 — the all-models week alone, the same way: the weekly handover line's figure. -1 = not known. */
export function weekNow(u: SlotUsage | undefined, now = Date.now()): number {
    return windowNow(u, 'seven_day', now);
}

function windowNow(u: SlotUsage | undefined, id: string, now: number): number {
    if (!u) { return -1; }
    const one = (bars: UsageBar[] | undefined): number => {
        const b = (bars ?? []).find(x => x.id === id);
        return b && b.percent >= 0 ? (turned(b.resetsAt, now) ? 0 : b.percent) : -1;
    };
    const live = u.state === 'ok' ? one(u.bars) : -1;
    const f = u.floor;
    const floor = !f ? -1 : f.walled && f.resetsAt > now ? 100 : one(f.bars);
    return Math.max(live, floor);
}

/**
 * When a slot at or past `ceiling` is back under it: the LATEST turnover among
 * the windows holding it there (a week at 92% still holds after the five-hour
 * window turns over). 0 = it is not held, or no turnover is known.
 */
export function backAt(u: SlotUsage, ceiling: number, now = Date.now()): number {
    const walls: number[] = [];
    const take = (r: { percent: number; resetsAt: number; bars?: UsageBar[] }): void => {
        const bars = (r.bars ?? []).filter(b => !PER_MODEL.test(b.id));
        for (const b of bars.length ? bars : [r]) {
            if (b.percent >= ceiling && b.resetsAt > now) { walls.push(b.resetsAt); }
        }
    };
    if (u.state === 'ok') { take(u); }
    if (u.floor) {
        if (u.floor.walled && u.floor.resetsAt > now) { walls.push(u.floor.resetsAt); }
        take({ ...u.floor, percent: u.floor.walled ? 0 : u.floor.percent });
    }
    return walls.length ? Math.max(...walls) : 0;
}

/** What a good reading leaves behind as the floor; undefined for anything else. */
export function floorOf(u: SlotUsage | undefined): UsageFloor | undefined {
    if (!u || u.state !== 'ok' || !(u.percent >= 0)) { return undefined; }
    return { percent: u.percent, resetsAt: u.resetsAt, bars: u.bars ?? [], fetchedAt: u.fetchedAt };
}

/**
 * The reading a surface or a policy is handed: the floor rides along unless a
 * good reading at least as new already says everything (a newer read of a
 * window is the truth, a wall included — it turned over, or it was never one).
 */
export function withFloor(u: SlotUsage, floor: UsageFloor | undefined): SlotUsage {
    if (!floor || (u.state === 'ok' && u.fetchedAt >= floor.fetchedAt)) { return u; }
    return { ...u, floor };
}

/**
 * The plan limit stopped a run on this slot. Full until the window turns over:
 * the five-hour one when it is still ahead (the wall a running leg meets), else
 * the binding one, else the longest a window lasts. A weekly wall is in the
 * bars it keeps and holds on after the five-hour turnover.
 */
export function wallFloor(u: SlotUsage | undefined, now: number): UsageFloor {
    const known = floorOf(u) ?? u?.floor;
    const bars = known?.bars ?? [];
    const five = bars.find(b => b.id === FIVE_HOUR_ID && b.resetsAt > now)?.resetsAt;
    const binding = known && known.resetsAt > now ? known.resetsAt : 0;
    return { percent: 100, resetsAt: five || binding || now + LONGEST_WINDOW_MS, bars, fetchedAt: now, walled: true };
}

/** A floor as one honest phrase: what it says and how old it is. */
export function floorPhrase(f: UsageFloor, now: number, fmt: (t: number) => string): string {
    if (f.walled && f.resetsAt > now) { return `walled by its plan limit until ${fmt(f.resetsAt)}`; }
    return `at least ${floorNow(f, now)}% (last read ${fmt(f.fetchedAt)})`;
}
