/**
 * S-143 — chains.setAccount on the bridge, and the body the Chains page's Next
 * cell calls. The store goes to the pure core (chainAccount.ts) and what it
 * answers is stored; nothing is said into the running leg — the rule is read
 * by the pass and the door, never by the agent.
 */
import { BridgeRefusal, BridgeRegistry, optStr } from './bridge';
import { batonView } from './batonBridge';
import { BatonStore } from './batonStore';
import { AccountResult, ChainAccountNow, chainAccountOf, chainNamed, setChainAccount } from './chainAccount';
import { fullSession } from './chainPauseOps';
import { saidWhy } from './uiSentence';

/** One account or rule a chain can be set to — the launcher's own rows (extension.ts accountRowsFor). */
export interface AccountChoice { id: string; label: string; detail: string }

export interface ChainAccountDeps {
    store: BatonStore;
    /** the stated-account check for an engine: a slot that is not stored or is another engine's, a rule that does not exist; '' = acceptable */
    refusal: (account: string, engine: string) => string;
    /** the rules and the stored accounts this engine offers */
    choices: (engine: string) => AccountChoice[];
    now: () => number;
}

/** The chain a request names: its chn_… id, or a session (full id or a prefix on record) of one of its legs. */
export function chainOfAsk(deps: Pick<ChainAccountDeps, 'store'>, q: { chain?: string; session?: string }): string {
    const list = deps.store.all();
    return chainNamed(list, { chainId: q.chain, sessionId: fullSession(list, q.session) });
}

/** What the chain's next legs open on now, or why there is no such chain. */
export function chainAccountNow(deps: ChainAccountDeps, q: { chain?: string; session?: string }): ChainAccountNow | { ok: false; why: string } {
    const chainId = chainOfAsk(deps, q);
    const now = chainId ? chainAccountOf(deps.store.all(), chainId) : undefined;
    return now ?? saidWhy('say which chain: chain (its chn_… id) or session (one of its legs) — chains.list shows the chains.');
}

/** chains.setAccount's body — the op and the Chains page alike. */
export function setAccountOfChain(deps: ChainAccountDeps, q: { chain?: string; session?: string; account: string; by: string }): AccountResult {
    const chainId = chainOfAsk(deps, q);
    if (!chainId) { return saidWhy('say which chain: chain (its chn_… id) or session (one of its legs) — chains.list shows the chains.'); }
    const r = setChainAccount(deps.store.all(), { chainId, account: q.account, by: q.by, refusal: deps.refusal, now: deps.now() });
    // the same account said again is still the user's choice: the mark makes the next door obey it over the stay
    if (r.ok) { deps.store.put(...r.put); }
    return r;
}

export function registerChainAccountOps(bridge: BridgeRegistry, deps: ChainAccountDeps): void {
    bridge.register([{
        op: 'chains.setAccount',
        describe: 'S-143 — THE ACCOUNT A FLOWING CHAIN\'S NEXT LEGS OPEN ON. Without account: what they open on now (account, pinned, rule = who set it and when), whether it can be set, and the choices for the chain\'s engine. '
            + 'With account: set while a leg runs (its pass, and every pass after it, carry it) or while a successor waits at the door (it opens on it). The first leg after the change opens on it even when the stay rule would keep it on its predecessor\'s account; after that the stay applies as before. '
            + 'A rule (@emptiest, @round-robin, a named rule) moves between accounts; a single account holds every later leg to it, and when it is full the next leg parks until it resets. Refused for a leg already parked on its task row, a chain that has ended, and an account the chain\'s engine cannot run on. '
            + 'args: chain? (chn_… id) | session? (one of its legs, full id or prefix), account? (a stored account id or a rule), by? (who, default "the user")',
        handler: (args, from) => {
            const account = optStr(args, 'account');
            const q = { chain: optStr(args, 'chain'), session: optStr(args, 'session') };
            if (!account) {
                const now = chainAccountNow(deps, q);
                if ('ok' in now) { throw new BridgeRefusal(now.why, { step: 'chain' }); }
                return { ...now, rule: now.rule ?? null, choices: deps.choices(now.engine) };
            }
            const by = optStr(args, 'by') || (from?.sessionId ? `the user, through session ${from.sessionId.slice(0, 8)}` : 'the user');
            const r = setAccountOfChain(deps, { ...q, account, by });
            if (!r.ok) { throw new BridgeRefusal(r.why, { step: 'setAccount', say: r.say }); }
            return { chainId: r.chainId, account: r.account, pinned: r.pinned, changed: r.changed, leg: r.leg, batons: r.put.map(batonView), sentence: r.sentence };
        }
    }]);
}
