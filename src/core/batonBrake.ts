/**
 * S-78 — the two automatic brakes a relay has. The chain's only NATURAL end is
 * a run that finishes the work and passes nothing; these are the other two.
 */
import { Baton } from './baton';

export interface BatonBrake {
    kind: 'ceiling' | 'barren';
    why: string;
}

/**
 * ‼️ WHY A PASS MUST NOT OPEN ANOTHER LEG, or undefined. `draft` is the
 * accepted baton (its `head` read at the pass), `prior` the store before it.
 * Pure.
 *
 * - ceiling: leg `draft.hop` is passing, so the leg it would open is hop + 1.
 * - barren: the two legs before the next one each ended on the same HEAD they
 *   were opened on — two runs in a row committed nothing, and a third would
 *   only spend another window the same way.
 */
export function batonBrake(draft: Baton, prior: readonly Baton[], maxLegs: number): BatonBrake | undefined {
    const next = draft.hop + 1;
    if (maxLegs > 0 && next > maxLegs) {
        return {
            kind: 'ceiling',
            why: `leg ceiling — chain ${draft.chainId} has run ${draft.hop} of its ${maxLegs} legs (agentFarm.batonMaxHops); leg ${next} does not open.`
        };
    }
    const head = draft.head;
    if (!head) { return undefined; }
    const legOf = (hop: number) => prior.find(p => p.chainId === draft.chainId && p.hop === hop && p.state === 'started');
    const h1 = legOf(draft.hop - 1)?.head;
    const h2 = legOf(draft.hop - 2)?.head;
    if (h1 === head && h2 === head) {
        return {
            kind: 'barren',
            why: `barren chain — legs ${draft.hop - 1} and ${draft.hop} both ended with no new commit in ${draft.from.cwd} (HEAD still ${head.slice(0, 8)}); leg ${next} does not open.`
        };
    }
    return undefined;
}
