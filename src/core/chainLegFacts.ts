/**
 * S-121 — WHAT THE CHAIN BOARD KNOWS ABOUT ONE LEG'S SESSION, read once per board.
 *
 * Alive is the relay runner's own verdict (`endedVerdict`), so the board and the
 * runner never disagree about whether a leg is over. Idle is a Console card at
 * rest (nothing queued, nothing asked) or a watched session waiting for input.
 * A session nobody knows anything about answers nothing — unknown is never
 * evidence.
 *
 * Pure: the host hands in what its views hold right now.
 */
import { endedVerdict } from './batonRunner';
import type { LegFacts } from './chainBoard';
import { totalTokens } from './pricing';
import type { SessionInfo } from './sessions';

export interface LegCardGlimpse {
    sessionId?: string;
    status: 'starting' | 'idle' | 'working' | 'ended' | 'error';
    queued: number;
    asking: boolean;
    turnEndedAt?: number;
}

export interface LegLiveGlimpse {
    sessionId: string;
    status: string;
    lastEventTs: number;
}

export interface LegSources {
    cards: readonly LegCardGlimpse[];
    live: readonly LegLiveGlimpse[];
    /** session ids with a live CLI process registered (the CLI's own registry) */
    registered: ReadonlySet<string>;
    sessions: readonly SessionInfo[];
}

const REST = new Set(['waiting-input', 'idle']);

export function legFactsSnapshot(src: LegSources): (sessionId: string) => LegFacts | undefined {
    const cards = new Map<string, LegCardGlimpse>();
    for (const c of src.cards) {
        if (!c.sessionId) { continue; }
        const had = cards.get(c.sessionId);
        // a session's live card outranks an ended one left in the list
        if (!had || (had.status === 'ended' || had.status === 'error')) { cards.set(c.sessionId, c); }
    }
    const live = new Map(src.live.map(s => [s.sessionId, s]));
    const info = new Map(src.sessions.map(s => [s.sessionId, s]));
    return (sid: string) => {
        const card = cards.get(sid);
        const s = live.get(sid);
        const i = info.get(sid);
        const registered = src.registered.has(sid);
        if (!card && !s && !i && !registered) { return undefined; }
        const cardLive = !!card && card.status !== 'ended' && card.status !== 'error';
        const alive = !endedVerdict({
            registered,
            ...(card ? { card: cardLive ? 'live' as const : 'ended' as const } : {}),
            live: !s ? 'unknown' : s.status === 'ended' ? 'ended' : 'alive',
            registers: (i?.source || 'claude') === 'claude'
        }).ended;
        const idleSince = !alive ? undefined
            : cardLive ? (card!.status === 'idle' && !card!.queued && !card!.asking ? card!.turnEndedAt : undefined)
                : s && REST.has(s.status) ? s.lastEventTs : undefined;
        return {
            alive,
            ...(idleSince !== undefined ? { idleSince } : {}),
            ...(i ? {
                title: i.title, firstTs: i.firstTs, lastTs: i.lastTs, cost: i.cost, tokens: totalTokens(i.usage),
                ...(i.agentName ? { agentName: i.agentName } : {})
            } : {})
        };
    };
}
