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
    | { ok: true; baton: Baton; seal?: Baton; sentence: string }
    | { ok: false; why: string };

/**
 * ‼️ CONTINUE: a waiting baton from the leg that ran last. A leg's pass carries
 * the hop of the leg that passes, so a continuation from leg L is hop L — the
 * same number a pass from it would have had (a closed and reopened hop is a
 * shape the chain index already reads, U-170).
 */
export function continueChain(list: readonly Baton[], q: ContinueInput): ContinueResult {
    const chainId = String(q.chainId ?? '').trim();
    const top = chainOf(list, chainId).sort(newerRecord)[0];
    if (!top) { return { ok: false, why: `no chain ${chainId || '(none named)'} with records left — chains.list shows what can be continued.` }; }
    if (isLive(top)) {
        return { ok: false, why: `chain ${chainId} already has a successor waiting (${top.state}) — baton.now starts it now.` };
    }
    let hop = top.hop;
    let fromSid = top.from.sessionId;
    if (top.state === 'started') {
        if (q.running !== 'idle' && q.running !== 'gone') {
            return {
                ok: false,
                why: `leg ${top.hop + 1} of chain ${chainId} is ${q.running === 'working' ? 'working' : 'running (its state is not known)'} — it passes at its own line; continue a chain whose leg is idle, gone or ended.`
            };
        }
        hop = top.hop + 1;
        fromSid = top.toSessionId ?? '';
        if (!fromSid) { return { ok: false, why: `leg ${hop} of chain ${chainId} has not named its session yet — nothing to continue from.` }; }
    }
    const words = String(q.prompt ?? '').trim() || lastWords(list, chainId);
    if (!words) { return { ok: false, why: `chain ${chainId} has no handover words on record — say what the new leg starts from (prompt).` }; }
    const next = hop + 1;
    const seal = list.find(b => b.chainId === chainId && isSeal(b));
    const asked = normalizeLegCeiling(q.maxLegs);
    if (q.maxLegs !== undefined && asked === undefined) { return { ok: false, why: 'maxLegs is a whole number of legs — 0 for no ceiling.' }; }
    if (asked !== undefined && asked > 0 && asked < next) {
        return { ok: false, why: `the reopened leg is leg ${next} — a ceiling of ${asked} would forbid it; give ${next} or more, or 0 for none.` };
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
    const tail = cap > 0 && next >= cap
        ? ` Leg ${next} is the chain's last under its ceiling of ${cap}${seal ? '' : ' (the setting agentFarm.batonMaxHops — this chain has no ceiling of its own)'}; give maxLegs for more.`
        : '';
    return {
        ok: true, baton, ...(raised ? { seal: raised } : {}),
        sentence: `Chain ${chainId} reopened: leg ${next} opens on its own setup once session ${short(fromSid)} has ended.${tail}`
    };
}

export interface EndInput {
    chainId: string;
    by: string;
    why?: string;
    now: number;
    rnd?: () => number;
}

export type EndResult =
    | {
        ok: true;
        /** live batons to stop (the caller stops them through stopBatons, which also cancels an unstarted row) */
        stop: Baton[];
        /** the running leg's opener with the last-leg brake, and the chain's closing record */
        braked?: Baton;
        closing?: Baton;
        /** the session the caller may close: the running leg, or the leg a stopped successor waited on */
        sessionId?: string;
        /** the line recorded on every record this writes */
        why: string;
        sentence: string;
    }
    | { ok: false; why: string };

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
    if (!top) { return { ok: false, why: `no chain ${chainId || '(none named)'} with records left — chains.list shows the chains.` }; }
    const why = `ended by ${q.by}${q.why ? `: ${String(q.why).trim()}` : ''}`;
    const stop = chain.filter(isLive);
    if (stop.length) {
        return {
            ok: true, stop, sessionId: top.from.sessionId, why,
            sentence: `Chain ${chainId} ended — its waiting successor was stopped (${why}). Session ${short(top.from.sessionId)} keeps running unless you close it.`
        };
    }
    if (top.state !== 'started' || !top.toSessionId) {
        return { ok: false, why: `chain ${chainId} has already ended (${top.state}: ${top.why}).` };
    }
    const sid = top.toSessionId;
    const brake = setLastLeg(list, sid, true, q.by, q.now);
    if (!brake.ok) { return { ok: false, why: brake.why }; }
    const closing = closingRecord(brake.baton, sid, 'done', why, newBatonId(q.now, q.rnd ?? Math.random), q.now);
    return {
        ok: true, stop: [], braked: brake.baton, closing, sessionId: sid, why,
        sentence: `Chain ${chainId} ended at leg ${top.hop + 1} (${why}) — its handover line now asks for the note, and no successor opens.`
    };
}
