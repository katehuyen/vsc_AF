/**
 * X-427 — the engine-fault watch's settings, resolved on the flex chain, and
 * its bridge op: where every relay leg whose engine failed stands.
 */
import { BridgeRegistry, optBool } from './bridge';
import { EngineFaultWatch, FaultOpts } from './engineFaultWatch';
import { resolveFlex } from './flexResolve';

/** `own(key)` = what the USER wrote for agentFarm.<key> (inspect, never get). */
export function faultOpts(own: (key: string) => unknown): FaultOpts & { sentences: Record<string, string> } {
    const r = (id: string, key: string) => {
        const v = own(key);
        return resolveFlex(id, v === undefined || v === null || v === '' ? {} : { settings: v });
    };
    const wait = r('baton.faultWaitHours', 'batonFaultWaitHours');
    const cap = r('baton.flaggedPasses', 'batonFlaggedPasses');
    const model = r('baton.flaggedModel', 'batonFlaggedModel');
    const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
    return {
        waitMs: Math.round(num(wait.value, 24) * 3_600_000),
        maxFlagged: Math.floor(num(cap.value, 3)),
        flaggedModel: String(model.value ?? '').trim(),
        sentences: { waitHours: wait.sentence, flaggedPasses: cap.sentence, flaggedModel: model.sentence }
    };
}

export function registerFaultOps(bridge: BridgeRegistry, watch: EngineFaultWatch, opts: () => ReturnType<typeof faultOpts>): void {
    bridge.register([{
        op: 'baton.faults',
        describe: 'X-427 — RELAY LEGS WHOSE ENGINE FAILED A TURN, and what Agent Farm is doing about each. A flagged conversation gets the baton passed FOR it '
            + '(state passed; held once agentFarm.batonFlaggedPasses flagged passes came in a row); an outage or a refused sign-in never opens a new leg — the same '
            + 'session is asked to continue at growing intervals (state waiting, nudges, nextAt) until agentFarm.batonFaultWaitHours, then gave-up + a Needs You row. '
            + 'Answers { faults: [{ sessionId, cardId, chainId, leg, kind, state, said, since, nudges, nextAt, why }], settings } with where each setting came from. '
            + 'args: check? (true = run a pass now instead of waiting for the minute sweep)',
        handler: (args) => {
            const orders = optBool(args, 'check') ? watch.check().filter(o => o.act !== 'none').map(o => ({ act: o.act, why: o.why })) : undefined;
            const o = opts();
            return {
                ok: true,
                faults: watch.list(),
                ...(orders ? { orders } : {}),
                settings: { waitMs: o.waitMs, maxFlagged: o.maxFlagged, flaggedModel: o.flaggedModel, from: o.sentences }
            };
        }
    }]);
}
