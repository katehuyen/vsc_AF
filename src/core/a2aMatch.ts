/**
 * N-5 — THE MATCHING ENGINE: whether a note or a task is "for me", and how well.
 *
 * One engine under both stores, because a note and a task are addressed the
 * same way and an agent asking "is this mine" must get the same answer from
 * either. N-3 scored the axes; this file puts the two things N-3 left open ON
 * TOP of that scoring rather than beside it: the PROJECT as a container in
 * every mode, and TIME in `preferred`.
 *
 * The five coordinates and what each one is:
 *
 *   project        — CONTAINMENT. A miss excludes in every mode; `*` on either
 *                    side is "every project", which is how a fleet-wide
 *                    broadcast is written without a second mechanism.
 *   targetRole     — ADDRESSING. This is what `strictness` is about.
 *   subsystem      — ABOUTNESS: the workdir or module. Ranks; excludes only
 *   topic            under `hard`.
 *   targetSession  — LINEAGE: the one session (a resume keeps its id) this is
 *                    for; `*` = any.
 *
 * And the three strictness levels, as a table — `must` is hit-or-wildcard,
 * `rank` is miss-allowed-but-scored-lower:
 *
 *              hard   preferred·in grace   preferred·after   any
 *   project    must   must                 must              must
 *   role       must   must                 rank              rank
 *   session    must   must                 rank              rank
 *   about      must   rank                 rank              rank
 *
 * ‼️ `preferred` IS `hard` ON THE ROLE FOR A WHILE, THEN `any`. The target
 * role has the work to itself for `graceMs` after it was posted (2 h unless
 * the caller says otherwise); a task nobody of that role took in that time is
 * opened to whoever else fits the project. Without the clock, `preferred` and
 * `any` were the same rule with a different name.
 *
 * `requires` is a filter, not an axis: every capability the work names must
 * be one the seeker has, in every mode, or it is not theirs.
 */

import type { A2AStrictness } from './a2aNotes';

/** How long `preferred` work is the target role's alone. */
export const PREFERRED_GRACE_MS = 2 * 3_600_000;

/** A capability name: lower-case, `a-z 0-9 _ -`, starting with a letter. */
export const CAPABILITY_RE = /^[a-z][a-z0-9_-]*$/;

/** The coordinates a note or a task carries — the ADDRESSED side. */
export interface Addressed {
    project: string;
    subsystem: string;
    topic: string;
    targetRole: string;
    /** '*' = any session; a note written before this axis existed reads as '*' */
    targetSession?: string;
    strictness: A2AStrictness;
    requires?: string[];
    /** when it was posted — the grace clock starts here */
    ts: number;
}

/** The coordinates a reader or a claimant arrives with — the SEEKING side. */
export interface Seeker {
    project?: string;
    subsystem?: string;
    topic?: string;
    role?: string;
    sessionId?: string;
    capabilities?: string[];
    /** overrides PREFERRED_GRACE_MS */
    graceMs?: number;
}

export type Axis = 'hit' | 'wild' | 'miss';

/** One coordinate: '*' on either side is anything, and a blank query asks nothing. */
export function axis(have: string | undefined, want: string | undefined): Axis {
    if (!want || !have) { return 'wild'; }
    if (have === '*' || want === '*') { return 'wild'; }
    return have.toLowerCase() === want.toLowerCase() ? 'hit' : 'miss';
}

export type Why =
    | 'missing a required capability'
    | 'another project'
    | 'reserved for its target role'
    | 'the coordinates are not yours';

export interface Fit {
    eligible: boolean;
    /** higher is closer; role and session weigh double because they are addresses */
    score: number;
    why?: Why;
    /** for a reserved fit: when it opens to the seeker */
    opensAt?: number;
    axes: { project: Axis; role: Axis; session: Axis; subsystem: Axis; topic: Axis };
}

const weight = { project: 1, role: 2, session: 2, subsystem: 1, topic: 1 };

/** Every capability the work names, present on the seeker — case-insensitively. */
export function hasCapabilities(requires: string[] | undefined, have: string[] | undefined): boolean {
    const set = new Set((have ?? []).map(c => c.toLowerCase()));
    return (requires ?? []).every(r => set.has(r.toLowerCase()));
}

export function fit(a: Addressed, s: Seeker, now = Date.now()): Fit {
    const axes = {
        project: axis(a.project, s.project),
        role: axis(a.targetRole, s.role),
        session: axis(a.targetSession ?? '*', s.sessionId),
        subsystem: axis(a.subsystem, s.subsystem),
        topic: axis(a.topic, s.topic)
    };
    const score = (Object.keys(axes) as (keyof typeof axes)[])
        .reduce((n, k) => n + (axes[k] === 'hit' ? weight[k] : 0), 0);
    const no = (why: Why, extra: Partial<Fit> = {}): Fit => ({ eligible: false, score, why, axes, ...extra });

    if (!hasCapabilities(a.requires, s.capabilities)) { return no('missing a required capability'); }
    if (axes.project === 'miss') { return no('another project'); }
    const addressMiss = axes.role === 'miss' || axes.session === 'miss';
    if (a.strictness === 'hard') {
        if (addressMiss || axes.subsystem === 'miss' || axes.topic === 'miss') { return no('the coordinates are not yours'); }
    } else if (a.strictness === 'preferred' && addressMiss) {
        const grace = typeof s.graceMs === 'number' && s.graceMs >= 0 ? s.graceMs : PREFERRED_GRACE_MS;
        const opensAt = a.ts + grace;
        if (now < opensAt) { return no('reserved for its target role', { opensAt }); }
    }
    return { eligible: true, score, axes };
}

/**
 * Best fit first, then newest. `preferred` means something only because of
 * this order: an exact hit outranks a permitted miss.
 */
export function byFit<T>(rows: { row: T; fit: Fit; ts: number }[]): T[] {
    return rows
        .filter(x => x.fit.eligible)
        .sort((x, y) => y.fit.score - x.fit.score || y.ts - x.ts)
        .map(x => x.row);
}

/** Lower-cased and trimmed; the first name that is not a capability name, if any. */
export function normaliseCapabilities(list: string[]): { ok: string[]; bad?: string } {
    const ok: string[] = [];
    for (const raw of list) {
        const c = raw.trim().toLowerCase();
        if (!c) { continue; }
        if (!CAPABILITY_RE.test(c)) { return { ok, bad: raw }; }
        if (!ok.includes(c)) { ok.push(c); }
    }
    return { ok };
}
