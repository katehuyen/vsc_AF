/**
 * S-121 — THE TWO CHAIN CONTROLS THE CARD NEVER HAD: continue a chain that
 * stopped, ended or hangs, and end one on purpose.
 *
 * Both only WRITE RECORDS. A continuation is a waiting baton from the leg that
 * ran last, so it goes through the runner's own door — the account pool, the
 * park on a full plan, the chain header — exactly like a pass. Ending a running
 * leg is the user's own last-leg brake plus the chain's closing record, so the
 * whisper, the brakes, the failsafe and the card already know what it means.
 *
 * Pure: the store, the clock and the setting's ceiling come in.
 */
import { Baton, isLive, newBatonId, normalizeLegCeiling } from './baton';
import { chainMaxLegs, isSeal } from './batonSeal';
import { closingRecord } from './batonFailsafe';
import { setLastLeg } from './batonLastLeg';
import { newerRecord } from './chainBoard';
import type { ChainLink } from './chainMembership';
import { SayPart, say, saidSentence, saidWhy } from './uiSentence';

/** The first line of a reopened leg's prompt, under the chain header the door puts on top. */
export const REOPEN_HEADER = '=== CHAIN REOPENED BY THE USER ===';

/** How the running leg's session stands, when the host knows: a running leg is only taken over when it is not working. */
export type LegLiveness = 'working' | 'idle' | 'gone';

const short = (id: string | undefined): string => String(id ?? '').slice(0, 8);
const chainOf = (list: readonly Baton[], chainId: string): Baton[] => list.filter(b => b.chainId === chainId);

/** The newest handover words on record: the latest pass, braked pass or rescue — never a seal's placeholder. */
export function lastWords(list: readonly Baton[], chainId: string): string {
    const b = chainOf(list, chainId).filter(x => !isSeal(x) && x.prompt.trim()).sort((a, b) => b.createdAt - a.createdAt)[0];
    return b ? b.prompt.trim() : '';
}

export interface ContinueInput {
    chainId: string;
    /** the words the new leg starts from; absent = the chain's last handover words */
    prompt?: string;
    by: string;
    why?: string;
    /** a new ceiling for the chain, the reopened leg included; 0 = none */
    maxLegs?: unknown;
    /** how the running leg's session stands, when the newest record is a running leg */
    running?: LegLiveness;
    /** agentFarm.batonMaxHops */
    fallbackMax: number;
    now: number;
    rnd?: () => number;
}

export type ContinueResult =
    | { ok: true; baton: Baton; seal?: Baton; sentence: string; say?: SayPart[] }
    | { ok: false; why: string; say?: SayPart[] };

/**
 * ‼️ CONTINUE: a waiting baton from the leg that ran last. A leg's pass carries
 * the hop of the leg that passes, so a continuation from leg L is hop L — the
 * same number a pass from it would have had (a closed and reopened hop is a
 * shape the chain index already reads, U-170).
 */
export function continueChain(list: readonly Baton[], q: ContinueInput): ContinueResult {
    const chainId = String(q.chainId ?? '').trim();
    const top = chainOf(list, chainId).sort(newerRecord)[0];
    if (!top) { return saidWhy('no chain {chain} with records left — chains.list shows what can be continued.', { chain: chainId || '(none named)' }); }
    if (isLive(top)) {
        return saidWhy('chain {chain} already has a successor waiting ({state}) — baton.now starts it now.', { chain: chainId, state: top.state });
    }
    let hop = top.hop;
    let fromSid = top.from.sessionId;
    if (top.state === 'started') {
        if (q.running !== 'idle' && q.running !== 'gone') {
            return saidWhy(q.running === 'working'
                ? 'leg {leg} of chain {chain} is working — it passes at its own line; continue a chain whose leg is idle, gone or ended.'
                : 'leg {leg} of chain {chain} is running (its state is not known) — it passes at its own line; continue a chain whose leg is idle, gone or ended.',
            { leg: top.hop + 1, chain: chainId });
        }
        hop = top.hop + 1;
        fromSid = top.toSessionId ?? '';
        if (!fromSid) { return saidWhy('leg {leg} of chain {chain} has not named its session yet — nothing to continue from.', { leg: hop, chain: chainId }); }
    }
    const words = String(q.prompt ?? '').trim() || lastWords(list, chainId);
    if (!words) { return saidWhy('chain {chain} has no handover words on record — say what the new leg starts from (prompt).', { chain: chainId }); }
    const next = hop + 1;
    const seal = list.find(b => b.chainId === chainId && isSeal(b));
    const asked = normalizeLegCeiling(q.maxLegs);
    if (q.maxLegs !== undefined && asked === undefined) { return saidWhy('maxLegs is a whole number of legs — 0 for no ceiling.'); }
    if (asked !== undefined && asked > 0 && asked < next) {
        return saidWhy('the reopened leg is leg {leg} — a ceiling of {asked} would forbid it; give {leg} or more, or 0 for none.', { leg: next, asked });
    }
    const max = chainMaxLegs(list, chainId, q.fallbackMax);
    const lift = asked !== undefined ? asked : (max > 0 && next > max ? next : undefined);
    const raised = lift !== undefined && seal ? { ...seal, maxLegs: lift } : undefined;
    const said = q.why ? `: ${String(q.why).trim()}` : '';
    const baton: Baton = {
        id: newBatonId(q.now, q.rnd ?? Math.random),
        chainId, hop,
        prompt: [REOPEN_HEADER,
            `Chain ${chainId} was reopened by ${q.by}${said}. It had stopped at leg ${hop} (${top.state}: ${top.why}).`,
            q.prompt ? 'Its last handover words are replaced by the user\'s own below.' : 'Below are its last handover words — continue from them.',
            '---', words].join('\n'),
        from: { ...top.from, sessionId: fromSid, launchId: top.state === 'started' ? '' : top.from.launchId },
        inherit: top.inherit,
        want: top.want,
        state: 'waiting-end',
        why: `reopened by ${q.by}${said} — leg ${next} opens once session ${short(fromSid)} has ended`,
        note: `reopened by ${q.by}`,
        createdAt: q.now,
        updatedAt: q.now
    };
    const cap = raised ? raised.maxLegs! : (seal ? max : q.fallbackMax);
    const tail = !(cap > 0 && next >= cap) ? []
        : [say(seal ? 'Leg {leg} is the chain\'s last under its ceiling of {cap}; give maxLegs for more.'
            : 'Leg {leg} is the chain\'s last under its ceiling of {cap} (the setting agentFarm.batonMaxHops — this chain has no ceiling of its own); give maxLegs for more.',
        { leg: next, cap })];
    return {
        ok: true, baton, ...(raised ? { seal: raised } : {}),
        ...saidSentence(say('Chain {chain} reopened: leg {leg} opens on its own setup once session {session} has ended.',
            { chain: chainId, leg: next, session: short(fromSid) }), ...tail)
    };
}

export interface EndInput {
    chainId: string;
    by: string;
    why?: string;
    now: number;
    rnd?: () => number;
    /** the store's links: a chain whose batons the cap dropped is ended from them (S-127) */
    links?: readonly ChainLink[];
}

export type EndResult =
    | {
        ok: true;
        /** live batons to stop (the caller stops them through stopBatons, which also cancels an unstarted row) */
        stop: Baton[];
        /** the running leg's opener with the last-leg brake, and the chain's closing record */
        braked?: Baton;
        closing?: Baton;
        /** the closing record's link, when only links are left of the chain */
        closingLink?: ChainLink;
        /** the session the caller may close: the running leg, or the leg a stopped successor waited on */
        sessionId?: string;
        /** the line recorded on every record this writes */
        why: string;
        sentence: string;
        say?: SayPart[];
    }
    | { ok: false; why: string; say?: SayPart[] };

/**
 * ‼️ END: nothing live is left and the chain reads `done`. A waiting or parked
 * successor is stopped; a RUNNING leg is braked as the last and the chain's
 * closing record is written from it — so its handover line asks for the note,
 * a pass it makes anyway is braked, and the failsafe sees the end is recorded.
 */
export function endChain(list: readonly Baton[], q: EndInput): EndResult {
    const chainId = String(q.chainId ?? '').trim();
    const chain = chainOf(list, chainId);
    const top = [...chain].sort(newerRecord)[0];
    const reason = q.why ? String(q.why).trim() : undefined;
    const why = `ended by ${q.by}${reason !== undefined ? `: ${reason}` : ''}`;
    const endVars = { chain: chainId, by: q.by, ...(reason !== undefined ? { reason } : {}) };
    if (!top) {
        // the cap dropped every baton of a leg that never passed: its link still reads `started`, and the closing record's link ends it
        const last = chainId ? (q.links ?? []).filter(l => l.chainId === chainId).sort(newerRecord)[0] : undefined;
        if (last?.state !== 'started' || !last.to) { return saidWhy('no chain {chain} with records left — chains.list shows the chains.', { chain: chainId || '(none named)' }); }
        const closingLink: ChainLink = { chainId, hop: last.hop + 1, from: last.to, state: 'done', createdAt: q.now, updatedAt: q.now };
        return {
            ok: true, stop: [], closingLink, sessionId: last.to, why,
            ...saidSentence(say(reason !== undefined
                ? 'Chain {chain} ended at leg {leg} (ended by {by}: {reason}) — only its links were left on record, and its closing record is now one of them.'
                : 'Chain {chain} ended at leg {leg} (ended by {by}) — only its links were left on record, and its closing record is now one of them.',
            { ...endVars, leg: last.hop + 1 }))
        };
    }
    const stop = chain.filter(isLive);
    if (stop.length) {
        return {
            ok: true, stop, sessionId: top.from.sessionId, why,
            ...saidSentence(say(reason !== undefined
                ? 'Chain {chain} ended — its waiting successor was stopped (ended by {by}: {reason}). Session {session} keeps running unless you close it.'
                : 'Chain {chain} ended — its waiting successor was stopped (ended by {by}). Session {session} keeps running unless you close it.',
            { ...endVars,session: short(top.from.sessionId) }))
        };
    }
    if (top.state !== 'started' || !top.toSessionId) {
        return saidWhy('chain {chain} has already ended ({state}: {why}).', { chain: chainId, state: top.state, why: top.why });
    }
    const sid = top.toSessionId;
    const brake = setLastLeg(list, sid, true, q.by, q.now);
    if (!brake.ok) { return brake; }
    const closing = closingRecord(brake.baton, sid, 'done', why, newBatonId(q.now, q.rnd ?? Math.random), q.now);
    return {
        ok: true, stop: [], braked: brake.baton, closing, sessionId: sid, why,
        ...saidSentence(say(reason !== undefined
            ? 'Chain {chain} ended at leg {leg} (ended by {by}: {reason}) — its handover line now asks for the note, and no successor opens.'
            : 'Chain {chain} ended at leg {leg} (ended by {by}) — its handover line now asks for the note, and no successor opens.',
        { ...endVars,leg: top.hop + 1 }))
    };
}
