/**
 * S-98 — THE DOOR OF THE USER'S SOFT BRAKE: `baton.lastLeg`.
 *
 * One body for the bridge op and the Console card's brake, so the store write,
 * the refusals and the sentence are the same whoever presses it. The decision
 * is `setLastLeg` (batonLastLeg.ts); this only stores it and says what happens.
 */
import { BridgeRefusal, BridgeRegistry, optBool, optStr } from './bridge';
import { BrakeState, brakeStateOf, runningLegOf, setLastLeg } from './batonLastLeg';
import { BatonStore } from './batonStore';

export interface LastLegDeps {
    store: BatonStore;
    now?: () => number;
}

export type LastLegAnswer =
    | { ok: true; sessionId: string; chainId: string; leg: number; on: boolean; changed: boolean; brake: BrakeState | null; sentence: string }
    | { ok: false; why: string };

/** Set (`on`) or release the brake on a session's running leg, store it, and say what happens now. */
export function applyLastLeg(deps: LastLegDeps, sessionId: string, on: boolean, by: string): LastLegAnswer {
    const now = (deps.now ?? Date.now)();
    const r = setLastLeg(deps.store.all(), sessionId, on, by, now);
    if (!r.ok) { return r; }
    if (r.changed) { deps.store.put(r.baton); }
    const sid = String(sessionId).trim();
    const leg = r.baton.hop + 1;
    const chainId = r.baton.chainId;
    const sentence = on
        ? `Braked: leg ${leg} is the last of chain ${chainId}. At its handover line it is told to write the handover note instead of `
            + 'passing, and if it passes anyway the pass opens nothing. Take it back (on=false) any time before it passes.'
        : `Released: chain ${chainId} goes on as before — leg ${leg} passes the baton at its handover line.`;
    return { ok: true, sessionId: sid, chainId, leg, on, changed: r.changed, brake: brakeStateOf(deps.store.all(), sid) ?? null, sentence };
}

export function registerLastLegOp(bridge: BridgeRegistry, deps: LastLegDeps): void {
    bridge.register([
        {
            op: 'baton.lastLeg',
            describe: 'S-98 — THE USER\'S SOFT BRAKE on a running baton relay: make the leg running now the chain\'s LAST (on=true) or take that back (on=false). '
                + 'Braked, the leg is told at its handover line to write the handover note instead of passing (agentFarm.disciplineOrders relayBraked*), a pass it makes anyway '
                + 'is answered braked and opens nothing, and the failsafe does not rescue it. Released before the pass, nothing is left behind and the chain goes on as if untouched. '
                + 'The window closes at the pass: a leg that already passed is refused (its successor is waiting — baton.stop chain= stops that), and a braked leg whose end is recorded is locked. '
                + 'Released after a braked order already went out, the leg writes its note and the failsafe opens the next leg from it. Same body as the brake on the Console card. '
                + 'args: session? (the running leg\'s session id) | chain? (the chain — its running leg), on? (default true), by? (who, for the record)',
            handler: (args) => {
                const chain = optStr(args, 'chain');
                let sid = optStr(args, 'session');
                if (!sid && chain) {
                    sid = runningLegOf(deps.store.all(), chain) ?? '';
                    if (!sid) {
                        throw new BridgeRefusal(`chain ${chain} has no running leg that can still be braked — baton.status chain=${chain} shows where it stands.`, { step: 'pick', chain });
                    }
                }
                if (!sid) { throw new BridgeRefusal('say which: session (the running leg\'s session id) or chain (its running leg).', { step: 'pick' }); }
                const on = optBool(args, 'on', true);
                const a = applyLastLeg(deps, sid, on, optStr(args, 'by') || 'the user (bridge)');
                if (!a.ok) { throw new BridgeRefusal(a.why, { step: 'brake', sessionId: sid, on }); }
                return a;
            }
        }
    ]);
}
