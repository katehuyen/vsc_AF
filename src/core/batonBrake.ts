/**
 * S-78 — the brakes a relay has. The chain's only NATURAL end is a run that
 * finishes the work and passes nothing; these are the others. Two act on their
 * own (ceiling, barren); S-96 adds the user's (`lastLeg` on the running leg).
 */
import { Baton, BrakeKind, openerOf } from './baton';
import { headsLabel, headsRoots } from './legRoots';
import { BARREN_REPAIR } from './batonRules';

export interface BatonBrake {
    kind: BrakeKind;
    why: string;
}

/**
 * ‼️ WHY A PASS MUST NOT OPEN ANOTHER LEG, or undefined. `draft` is the
 * accepted baton (its `head` read at the pass), `prior` the store before it.
 * Pure. The ONE decision both doors ask — `baton.pass` and the failsafe's
 * rescue — so a brake added here holds on both without touching either.
 *
 * - ceiling: leg `draft.hop` is passing, so the leg it would open is hop + 1.
 * - user: the passing leg's opener carries `lastLeg` — the user made it the last.
 * - barren: the two legs before the next one each ended on the same HEAD they
 *   were opened on — two runs in a row committed nothing, and a third would
 *   only spend another window the same way. ‼️ S-83: `head` fingerprints the
 *   leg's folder AND its project's repositories (legRoots.ts) — the folder
 *   alone read three commits in the project's repo as none and killed a rescue.
 *   ‼️ X-462: a STARVED leg (no room left on its account when it passed —
 *   passCause.ts starvedOf) is not evidence of a chain spinning; it is a chain waiting
 *   for quota, so either leg of the two being starved keeps the brake off. The
 *   door then places the next leg where there is room or parks it until the
 *   first turnover — and the starved account itself is never placed on again
 *   before it turns over (its figure, or its wall, says so).
 */
export function batonBrake(draft: Baton, prior: readonly Baton[], maxLegs: number): BatonBrake | undefined {
    const next = draft.hop + 1;
    if (maxLegs > 0 && next > maxLegs) {
        return {
            kind: 'ceiling',
            why: `leg ceiling — chain ${draft.chainId} has run ${draft.hop} of its ${maxLegs} legs (agentFarm.batonMaxHops); leg ${next} does not open.`
        };
    }
    const opener = openerOf(prior, draft.from.sessionId);
    if (opener?.lastLeg && opener.chainId === draft.chainId) {
        return {
            kind: 'user',
            why: `last leg — ${opener.lastLeg.by} made leg ${draft.hop} the last of chain ${draft.chainId}; leg ${next} does not open.`
        };
    }
    const head = draft.head;
    if (!head) { return undefined; }
    const legOf = (hop: number) => prior.find(p => p.chainId === draft.chainId && p.hop === hop && p.state === 'started');
    const prev = legOf(draft.hop - 1);
    const h1 = prev?.head;
    const h2 = legOf(draft.hop - 2)?.head;
    // S-140 — a pass the user asked for with "pass and pause" is not a chain spinning either
    const pausing = opener?.chainId === draft.chainId && opener.pause?.mode === 'pass';
    if (h1 === head && h2 === head && !draft.starved && !prev?.starved && !pausing) {
        const roots = headsRoots(head);
        return {
            kind: 'barren',
            why: `barren chain — legs ${draft.hop - 1} and ${draft.hop} both ended with no new commit in ${roots.length ? roots.join(', ') : draft.from.cwd} (HEAD still ${headsLabel(head)}); leg ${next} does not open. ${BARREN_REPAIR}`
        };
    }
    return undefined;
}
