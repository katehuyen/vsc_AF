/**
 * S-81 — THE FIRST LEG'S SEAL.
 *
 * A relay used to exist only from its first `baton.pass` on, so the run that
 * started it was in no chain: the whisper told it to write a handover note, the
 * card and the bar drew nothing, and the pool the user picked for the chain was
 * never recorded anywhere a pass could read it. A run that ASKED to open a relay
 * (`baton: true` on its task) is now sealed the moment its session is known —
 * one record, born `started`, whose successor is that session itself.
 *
 * ‼️ THE SEAL IS HOP 0. A baton's `hop` is the leg that PASSES it and a session
 * runs leg `opener.hop + 1` (`batonRelayOf`, the card, the bar, `passBaton`), so
 * hop 0 is what makes the first run leg 1, its first pass hop 1, and the leg
 * ceiling count the leg that started the chain — exactly once.
 *
 * Pure: the manifest, the store and the clock are handed in.
 */
import { isPolicyId } from './accountPolicy';
import { BATON_DEFAULT_ACCOUNT, Baton, inheritFrom, newBatonId, newChainId } from './baton';
import { LaunchManifest } from './launchManifest';

/** A run that opens a relay — a task row that asked to, or a session attached by hand (baton.attach). */
export interface FirstLeg {
    taskId?: string;
    /** who attached a running session (baton.attach); absent on a task row */
    by?: string;
    /** this chain's leg ceiling; absent = the setting */
    maxLegs?: number;
    sessionId: string;
    launchId?: string;
    /** the chain's name when the caller gave one; absent = a new `chn_…` */
    chainId?: string;
    /** what the row ASKED for — a policy (`@…`) or a slot. The manifest holds the resolved slot. */
    account?: string;
    title?: string;
}

const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The record that opened a chain rather than being passed along it. */
export function isSeal(b: Pick<Baton, 'hop'>): boolean {
    return b.hop === 0;
}

/**
 * The pool every later leg is placed from: the policy the first leg named, or
 * the default when it named a single slot — that slot is the one running out.
 */
export function chainPool(account: unknown): string {
    const a = s(account);
    return isPolicyId(a) ? a : BATON_DEFAULT_ACCOUNT;
}

/** A chain's leg ceiling: its seal's own, else the setting's. */
export function chainMaxLegs(list: readonly Baton[], chainId: string, fallback: number): number {
    const own = list.find(b => b.chainId === chainId && isSeal(b))?.maxLegs;
    return typeof own === 'number' ? own : fallback;
}

export type SealResult =
    | { ok: true; baton: Baton }
    | { ok: false; why: string };

/**
 * Seal a first leg, or say why not. `undefined` = nothing to do: the session
 * is already in a chain (sealed before, or opened by a baton — a successor row
 * is never sealed a second time) or the row is some baton's own successor row.
 */
export function sealFirstLeg(input: {
    leg: FirstLeg;
    manifest?: LaunchManifest;
    prior: readonly Baton[];
    now: number;
    rnd?: () => number;
}): SealResult | undefined {
    const { leg, prior, now } = input;
    const sid = s(leg.sessionId);
    if (!sid) { return undefined; }
    if (prior.some(b => b.toSessionId === sid || (!!leg.taskId && b.taskId === leg.taskId))) { return undefined; }
    const src = inheritFrom(sid, leg.launchId, input.manifest);
    const what = leg.taskId ? `task ${leg.taskId}` : `session ${sid.slice(0, 8)}`;
    if (!src.ok) { return { ok: false, why: `first leg of ${what} not sealed: ${src.why}` }; }
    const named = s(leg.chainId);
    if (named && prior.some(b => b.chainId === named)) {
        return {
            ok: false,
            why: `chain ${named} already has legs — a first leg opens a new chain; a running one is continued with baton.pass.`
        };
    }
    const rnd = input.rnd ?? Math.random;
    const chainId = named || newChainId(now, rnd);
    const title = s(leg.title);
    const cap = typeof leg.maxLegs === 'number' && Number.isFinite(leg.maxLegs) && leg.maxLegs >= 0 ? Math.floor(leg.maxLegs) : undefined;
    return {
        ok: true,
        baton: {
            id: newBatonId(now, rnd),
            chainId,
            hop: 0,
            prompt: leg.taskId
                ? `(first leg — task ${leg.taskId}${title ? `: ${title}` : ''})`
                : `(first leg — attached by ${s(leg.by) || 'the user'})`,
            from: src.from,
            inherit: src.inherit,
            want: { surface: 'inherit', account: chainPool(leg.account) },
            state: 'started',
            ...(leg.taskId ? { taskId: leg.taskId } : {}),
            ...(cap !== undefined ? { maxLegs: cap } : {}),
            toSessionId: sid,
            why: `first leg sealed — session ${sid.slice(0, 8)} opens chain ${chainId}`,
            createdAt: now,
            updatedAt: now
        }
    };
}
