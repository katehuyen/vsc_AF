/**
 * S-128 — WHY A LEG ENDED, read off the record it left and never off a sentence.
 *
 * The record is the leg's pass, its braked pass or its closing record
 * (`leftBy`), and the opener it ran under. Each answer stands on a field:
 *   context · quota  — the pass's measured cause (passCause.ts); a plan limit is the quota's
 *   user             — ⑂ Pass now was said into the leg before it passed (opener.passNow),
 *                      or it closed under the user's brake / End (opener.lastLeg) or by hand (byUser)
 *   fault            — the failsafe passed for it (rescue), the engine flagged it, or the crash-loop guard closed it
 *   early · done     — the agent passed with no line reached · it finished cleanly without passing
 * A record that holds none of these answers nothing: unknown is never evidence.
 *
 * Pure: the records in, the verdict out.
 */
import type { Baton } from './baton';
import type { PassCauseKind } from './passCause';

export type LegEndKind = 'context' | 'quota' | 'user' | 'fault' | 'early' | 'done';

export interface LegEnd {
    kind: LegEndKind;
    /** the sentence the verdict stands on, as the record holds it */
    why: string;
}

const BY_CAUSE: Record<PassCauseKind, LegEndKind> = { context: 'context', quota: 'quota', limit: 'quota', flagged: 'fault', early: 'early' };

export function legEndOf(end: Baton | undefined, opener: Baton | undefined): LegEnd | undefined {
    if (!end) { return undefined; }
    if (end.state === 'failed') { return { kind: 'fault', why: end.why }; }
    if (end.state === 'done') { return { kind: end.byUser || opener?.lastLeg ? 'user' : 'done', why: end.why }; }
    if (end.rescue) { return { kind: 'fault', why: end.rescue }; }
    const cause = end.cause;
    const asked = opener?.passNow && opener.passNow.at <= end.createdAt ? opener.passNow : undefined;
    if (asked) { return { kind: 'user', why: `${asked.by} pressed Pass now${cause ? ` — ${cause.why}` : ''}` }; }
    if (cause) { return { kind: BY_CAUSE[cause.kind] ?? 'early', why: cause.why }; }
    if (end.fault) { return { kind: end.fault === 'limit' ? 'quota' : 'fault', why: end.why }; }
    return undefined;
}
