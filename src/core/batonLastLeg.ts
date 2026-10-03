/**
 * S-96 — THE USER'S SOFT BRAKE: "the leg running now is this chain's last".
 *
 * A flag on the OPENER of the running leg (its seal on leg 1), never a baton
 * of its own. Set, the leg's pass is braked by `batonBrake` (nothing opens,
 * the runner is told to write the note), its whisper says so (`batonRelayOf`
 * → braked) and the failsafe stays out. Removed, nothing was written anywhere
 * else, so the chain goes on as if it had never been touched. The window
 * closes at the pass: after it the leg's end is recorded and the flag can no
 * longer change it. The next leg has an opener of its own, so a flag cannot
 * leak past the leg it was set on.
 *
 * Pure: the list and the clock come in, the changed opener goes out.
 */
import { Baton, isLive, openerOf } from './baton';
import { isSeal } from './batonSeal';
import { SayPart, saidWhy } from './uiSentence';

/** `off`/`on` can still be pressed · `passed` = a successor waits (✕⑂ Stop chain's turn) · `locked` = ended braked */
export type BrakeState = 'off' | 'on' | 'passed' | 'locked';

export type LastLegResult =
    | { ok: true; baton: Baton; on: boolean; changed: boolean }
    | { ok: false; why: string; say?: SayPart[] };

const short = (id: string): string => id.slice(0, 8);

/** What the leg left behind it — its pass, a braked pass, or its closing record — newest first. */
function leftBy(list: readonly Baton[], sid: string): Baton | undefined {
    return list.filter(b => b.from.sessionId === sid && !isSeal(b)).sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

/** Where the brake of a session's leg stands; undefined = no running relay leg to brake. */
export function brakeStateOf(list: readonly Baton[], sessionId: string): BrakeState | undefined {
    const sid = String(sessionId ?? '').trim();
    if (!sid) { return undefined; }
    const opener = openerOf(list, sid);
    if (!opener) { return undefined; }
    const left = leftBy(list, sid);
    if (left) {
        if (isLive(left)) { return 'passed'; }
        return opener.lastLeg && left.state !== 'started' ? 'locked' : undefined;
    }
    if (list.some(b => b.chainId === opener.chainId && b.hop > opener.hop)) { return undefined; }
    return opener.lastLeg ? 'on' : 'off';
}

/** The session running chain `chainId`'s newest leg, while the chain has not gone past it. */
export function runningLegOf(list: readonly Baton[], chainId: string): string | undefined {
    const top = list.filter(b => b.chainId === chainId).sort((a, b) => b.hop - a.hop || b.updatedAt - a.updatedAt)[0];
    return top && top.state === 'started' && top.toSessionId ? top.toSessionId : undefined;
}

/** Set (`on`) or release the brake on a session's running leg. The caller stores `baton` when `changed`. */
export function setLastLeg(list: readonly Baton[], sessionId: string, on: boolean, by: string, now: number): LastLegResult {
    const sid = String(sessionId ?? '').trim();
    if (!sid) { return saidWhy('no session named — pass session=<id>, or chain=<id> for the leg it is running'); }
    const opener = openerOf(list, sid);
    if (!opener) { return saidWhy('session {session} is not a leg of a baton relay — there is no chain to end', { session: short(sid) }); }
    const state = brakeStateOf(list, sid);
    if (state === 'passed') {
        return saidWhy('session {session} has already passed the baton — its successor is waiting; ✕⑂ Stop chain (baton.stop chain={chain}) stops that',
            { session: short(sid), chain: opener.chainId });
    }
    if (state !== 'on' && state !== 'off') {
        return saidWhy('leg {leg} of chain {chain} has already reached its end — the brake can no longer change it', { leg: opener.hop + 1, chain: opener.chainId });
    }
    if (on === (state === 'on')) { return { ok: true, baton: opener, on, changed: false }; }
    if (on) { return { ok: true, baton: { ...opener, lastLeg: { at: now, by } }, on, changed: true }; }
    const released: Baton = { ...opener };
    delete released.lastLeg;
    return { ok: true, baton: released, on, changed: true };
}
