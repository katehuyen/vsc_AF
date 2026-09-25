/**
 * S-103 — THE DOOR OF A CHAIN'S LEG CEILING: `baton.setLegs`.
 *
 * One body (`applyChainLegs`) for the bridge op and the legs menu the card's ⑂⊣
 * right-click, the status bar and the palette open — the store write, the
 * refusals and the sentence are the same whoever changes it.
 */
import { openerOf } from './baton';
import { BridgeRefusal, BridgeRegistry, optStr } from './bridge';
import { SetLegsResult, chainLegs, setChainLegs } from './batonLegs';
import { BatonStore } from './batonStore';

export interface LegsDeps {
    store: BatonStore;
    /** agentFarm.batonMaxHops, normalized — the ceiling of a chain with no number of its own */
    fallback: () => number;
    /** the surfaces that draw the ceiling repaint */
    changed?: () => void;
}

/** Set a chain's own ceiling, store it, and say what happens now. */
export function applyChainLegs(deps: LegsDeps, chainId: string, maxLegs: unknown): SetLegsResult {
    const r = setChainLegs(deps.store.all(), chainId, maxLegs, deps.fallback());
    if (r.ok && r.changed) { deps.store.put(r.seal); deps.changed?.(); }
    return r;
}

export function registerLegsOp(bridge: BridgeRegistry, deps: LegsDeps): void {
    bridge.register([
        {
            op: 'baton.setLegs',
            describe: 'S-103 — A RUNNING CHAIN\'S LEG CEILING, READ OR CHANGED. Without maxLegs/add it answers where the chain stands (leg, max, min, own). '
                + 'maxLegs=N sets the chain\'s own ceiling (0 = none); add=K moves it by K (from the leg it is on when it has none). The next pass reads it (the leg ceiling brake), '
                + 'and it is kept on the chain\'s seal, so a reload keeps it. The floor is the leg running now: a ceiling equal to it makes that leg the last (its pass opens nothing — '
                + 'baton.lastLeg tells the leg itself ahead of its handover line), lower is refused. An ended chain, or one with no seal, is refused by name. '
                + 'Same body as the legs menu (right-click ⑂⊣ on the Console card, the ⑂ status-bar item, "Agent Farm: Chain Legs…"). '
                + 'args: chain? | session? (its running leg\'s session — its chain), maxLegs? | add?',
            handler: (args) => {
                const sid = optStr(args, 'session');
                const chain = optStr(args, 'chain') || (sid ? openerOf(deps.store.all(), sid)?.chainId ?? '' : '');
                if (!chain) {
                    throw new BridgeRefusal(sid ? `session ${sid} runs no leg of a relay.` : 'say which: chain (its id) or session (the running leg\'s session id).', { step: 'pick' });
                }
                const at = chainLegs(deps.store.all(), chain, deps.fallback());
                if (!at.ok) { throw new BridgeRefusal(at.why, { step: 'read', chain }); }
                const raw = args.maxLegs ?? args.legs;
                const add = args.add;
                if ((raw === undefined || raw === '') && (add === undefined || add === '')) { return { ok: true, ...at.legs }; }
                let n: unknown = raw;
                if (raw === undefined || raw === '') {
                    const k = Number(add);
                    if (!Number.isInteger(k)) { throw new BridgeRefusal('add must be a whole number (negative lowers the ceiling).', { step: 'legs', chain }); }
                    n = (at.legs.max > 0 ? at.legs.max : at.legs.leg) + k;
                }
                const r = applyChainLegs(deps, chain, n);
                if (!r.ok) { throw new BridgeRefusal(r.why, { step: 'legs', chain }); }
                return { ok: true, ...r.legs, before: r.before, changed: r.changed, sentence: r.sentence };
            }
        }
    ]);
}
