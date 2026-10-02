/**
 * X-479 (X-461) — THE WALL HAS TWO FIGURES. A start is judged by the five-hour
 * window (or any window an engine names that is not the all-models week)
 * against one figure, and by the all-models week against its own
 * (agentFarm.defaultAccountWeeklyCeiling): an account past the Account ceiling
 * on its WEEK alone used to be unusable for days. A bare number walls both
 * alike — the shape every caller had before. Pure, no imports.
 */
export type Wall = number | { value: number; week?: number };

export interface WallParts {
    five: number;
    week: number;
}

export function wallParts(w: Wall): WallParts {
    if (typeof w === 'number') { return { five: w, week: w }; }
    return { five: w.value, week: typeof w.week === 'number' && Number.isFinite(w.week) ? w.week : w.value };
}

/** A wall handed in from outside: a number or a wall object; anything else is `fallback`. */
export function wallOr(w: unknown, fallback: number): Wall {
    if (typeof w === 'number') { return w; }
    if (w && typeof w === 'object' && typeof (w as { value?: unknown }).value === 'number') { return w as Wall; }
    return fallback;
}

/** A wall a rule, step, pool or caller names for itself replaces the five-hour figure; the week keeps its own when it has one. */
export function withFive(w: Wall, five: number): Wall {
    return typeof w === 'object' && typeof w.week === 'number' ? { value: five, week: w.week } : five;
}

/** The wall in a sentence: '70%', or '70% (week 95%)' when the week has its own. */
export function wallText(w: Wall): string {
    const p = wallParts(w);
    return p.week === p.five ? `${p.five}%` : `${p.five}% (week ${p.week}%)`;
}

/** Which window stands at or past its wall: '' = both under (an unknown figure, -1, is room). */
export function wallHit(s: { five: number; week: number }, w: Wall): '' | 'five' | 'week' {
    const p = wallParts(w);
    if (s.five >= 0 && s.five >= p.five) { return 'five'; }
    if (s.week >= 0 && s.week >= p.week) { return 'week'; }
    return '';
}
