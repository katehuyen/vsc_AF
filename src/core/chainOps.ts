/**
 * U-163 — A CHAIN'S LEGS, IN ORDER, FOR AN AGENT. The same answer the session
 * page's ‹ › arrows and first/last badges draw (chainPlace), so an agent can
 * walk a relay the way a person does.
 */
import { BridgeRefusal, BridgeRegistry, optStr } from './bridge';
import { ChainIndex, chainIndexNow, chainPlace } from './chainMembership';
import { SessionInfo } from './sessions';

export interface ChainOpsDeps {
    sessions(): SessionInfo[];
}

/** A full session id, or a prefix that names ONE chained session. */
export function chainedSessionOf(ix: ChainIndex, q: string): string | undefined {
    const needle = String(q ?? '').trim().toLowerCase();
    if (!needle) { return undefined; }
    if (ix.bySession.has(needle)) { return needle; }
    const hits = [...ix.bySession.keys()].filter(sid => sid.toLowerCase().startsWith(needle));
    return hits.length === 1 ? hits[0] : undefined;
}

export function registerChainOps(bridge: BridgeRegistry, deps: ChainOpsDeps): void {
    bridge.register([
        {
            op: 'baton.legs',
            describe: 'U-163 — A RELAY CHAIN\'S LEGS IN ORDER, by the chain id or by any one of its sessions: every leg\'s session (id, title, agent, first/last time) and the stretch it ran — `opened` (when the pass that opened it was recorded) and `passed` (when it passed on; null = no pass on record), what the "Ran:" line draws; '
                + 'whether the chain can still grow (`open`), and — asked by a session — its place: leg, prev, next, first, last (what the session page\'s ‹ › arrows and first/last badges draw). '
                + 'A chain whose batons the store already dropped still answers: its links are kept. args: chain? (chn_… id) | session? (a full id or an unambiguous prefix)',
            handler: (args) => {
                const ix = chainIndexNow();
                const chainArg = optStr(args, 'chain');
                const sessionArg = optStr(args, 'session');
                if (!chainArg && !sessionArg) { throw new BridgeRefusal('say which: chain (its chn_… id) or session (one of its legs).', { step: 'pick' }); }
                const sid = sessionArg ? chainedSessionOf(ix, sessionArg) : undefined;
                if (sessionArg && !sid) { throw new BridgeRefusal(`session ${sessionArg} ran no leg of a relay on record (or the prefix names several).`, { step: 'read' }); }
                const place = sid ? chainPlace(ix, sid) : undefined;
                const chainId = place?.chainId ?? chainArg;
                const chain = ix.byChain.get(chainId);
                if (!chain) { throw new BridgeRefusal(`no chain ${chainId} on record — baton.status lists the chains.`, { step: 'read' }); }
                const byId = new Map(deps.sessions().map(s => [s.sessionId, s]));
                return {
                    chainId, open: chain.open, legs: chain.legs.map(l => {
                        const s = byId.get(l.sessionId);
                        return {
                            leg: l.leg, sessionId: l.sessionId, title: s?.title ?? null, agent: s?.agentName ?? null,
                            firstTs: s?.firstTs ?? null, lastTs: s?.lastTs ?? null, file: s?.file ?? null,
                            opened: l.opened ?? null, passed: l.passed ?? null
                        };
                    }),
                    ...(place ? {
                        place: {
                            sessionId: sid, leg: place.leg, prev: place.prev ?? null, next: place.next ?? null,
                            first: place.first, last: place.last
                        }
                    } : {})
                };
            }
        }
    ]);
}
