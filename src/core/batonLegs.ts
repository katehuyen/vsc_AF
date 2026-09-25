/**
 * S-103 — A CHAIN'S LEG CEILING, CHANGED WHILE IT RUNS.
 *
 * The ceiling lives on the chain's seal (hop 0, `maxLegs`) and every pass reads
 * it there (chainMaxLegs → batonBrake), so writing the seal IS the change: the
 * next pass reads the new number, and a reload keeps it because the store is
 * the disk. The floor is the leg the chain is on — a ceiling equal to it makes
 * that leg the last, lower than it would pretend a running leg never started.
 *
 * Pure: the list, the setting's number and the clock come in; the seal goes out.
 */
import { Baton, isLive } from './baton';
import { chainMaxLegs, isSeal } from './batonSeal';

export interface ChainLegs {
    chainId: string;
    /** the leg running now, or the one a waiting successor opens */
    leg: number;
    /** the ceiling in force — 0 = none */
    max: number;
    /** the chain's own number (its seal) rather than the setting's */
    own: boolean;
    /** the lowest ceiling the chain can still take: the leg it is on */
    min: number;
    /** the session running the leg, while one runs */
    sessionId?: string;
    /** that leg is braked as the last (⑂⊣, baton.lastLeg) */
    lastLeg: boolean;
}

export type ChainLegsResult = { ok: true; legs: ChainLegs; seal: Baton } | { ok: false; why: string };

const newestOf = (list: readonly Baton[], chainId: string): Baton | undefined =>
    list.filter(b => b.chainId === chainId).sort((a, b) => b.hop - a.hop || b.updatedAt - a.updatedAt)[0];

/** Where a chain stands on its legs, or why it has none left to count. */
export function chainLegs(list: readonly Baton[], chainId: string, fallback: number): ChainLegsResult {
    const id = String(chainId ?? '').trim();
    const top = id ? newestOf(list, id) : undefined;
    if (!top) { return { ok: false, why: `no chain ${id || '(none named)'} — baton.status lists the chains.` }; }
    const seal = list.find(b => b.chainId === id && isSeal(b));
    if (!seal) {
        return { ok: false, why: `chain ${id} has no seal (it was started before relays were sealed), so its ceiling is the setting agentFarm.batonMaxHops — change that instead.` };
    }
    if (!isLive(top) && top.state !== 'started') {
        return { ok: false, why: `chain ${id} has ended (${top.state}: ${top.why}) — there is no leg left to count.` };
    }
    const leg = top.hop + 1;
    const running = top.state === 'started' && !!top.toSessionId;
    return {
        ok: true, seal,
        legs: {
            chainId: id, leg, min: leg,
            max: chainMaxLegs(list, id, fallback),
            own: typeof seal.maxLegs === 'number',
            lastLeg: running && !!top.lastLeg,
            ...(running ? { sessionId: top.toSessionId } : {})
        }
    };
}

/** A typed ceiling: a whole number ≥ 0 (0 = none), or why not. */
export function parseLegs(v: unknown, min: number): { ok: true; n: number } | { ok: false; why: string } {
    const raw = typeof v === 'string' ? v.trim() : v;
    const n = raw === '' || raw === null || raw === undefined ? Number.NaN : Number(raw);
    if (!Number.isInteger(n) || n < 0) { return { ok: false, why: 'a whole number of legs — 0 for no ceiling.' }; }
    if (n > 0 && n < min) {
        return { ok: false, why: `leg ${min} is already running — the lowest ceiling is ${min}, which makes it the last leg (⑂⊣ says so to the leg before its handover line).` };
    }
    return { ok: true, n };
}

export type SetLegsResult =
    | { ok: true; legs: ChainLegs; before: number; changed: boolean; seal: Baton; sentence: string }
    | { ok: false; why: string };

const said = (n: number): string => (n > 0 ? `${n} legs` : 'no ceiling');

/** Set chain `chainId`'s own ceiling. The caller stores `seal` when `changed`. */
export function setChainLegs(list: readonly Baton[], chainId: string, maxLegs: unknown, fallback: number): SetLegsResult {
    const at = chainLegs(list, chainId, fallback);
    if (!at.ok) { return at; }
    const p = parseLegs(maxLegs, at.legs.min);
    if (!p.ok) { return { ok: false, why: `chain ${at.legs.chainId}: ${p.why}` }; }
    const before = at.legs.max;
    const changed = !(at.legs.own && before === p.n);
    const legs: ChainLegs = { ...at.legs, max: p.n, own: true };
    const tail = p.n === 0 ? 'it runs until the work is done or you brake it.'
        : p.n === legs.leg ? `leg ${legs.leg} is now its last — its pass opens nothing.`
            : `leg ${legs.leg} is running; the next pass reads the new ceiling.`;
    return {
        ok: true, legs, before, changed, seal: { ...at.seal, maxLegs: p.n },
        sentence: `Chain ${legs.chainId}: ${said(before)} → ${said(p.n)} — ${tail}`
    };
}

export interface LegsChoice {
    label: string;
    detail: string;
    /** the ceiling this sets; absent for an action */
    n?: number;
    act?: 'type' | 'lastLeg' | 'release';
}

/** What the legs menu offers, in order — shared by the card's right-click, the status bar and the palette. */
export function legsChoices(l: ChainLegs): LegsChoice[] {
    const base = l.max > 0 ? l.max : l.leg;
    const to = (n: number) => `ceiling ${said(l.max)} → ${said(n)}`;
    const out: LegsChoice[] = [
        { label: '$(add) One more leg', detail: to(base + 1), n: base + 1 },
        { label: '$(add) Three more legs', detail: to(base + 3), n: base + 3 }
    ];
    if (l.max > 0 && l.max - 1 >= l.min) { out.push({ label: '$(remove) One leg fewer', detail: to(l.max - 1), n: l.max - 1 }); }
    out.push({ label: '$(edit) Set a number…', detail: `${l.min} or more — 0 for no ceiling`, act: 'type' });
    if (l.max > 0) { out.push({ label: '$(circle-slash) No ceiling', detail: to(0), n: 0 }); }
    if (l.sessionId) {
        out.push(l.lastLeg
            ? { label: '⑂⊣ Take back "last leg"', detail: `leg ${l.leg} passes the baton at its handover line again`, act: 'release' }
            : { label: '⑂⊣ This leg is the last', detail: `leg ${l.leg} writes the handover note instead of passing (baton.lastLeg)`, act: 'lastLeg' });
    }
    return out;
}

/** The menu's title — the MIRROR line: where the chain stands. */
export function legsTitle(l: ChainLegs): string {
    const of = l.max > 0 ? ` of ${l.max}` : ' — no ceiling';
    return `Chain ${l.chainId} — leg ${l.leg}${of}${l.lastLeg ? ' · last leg' : ''}${l.own ? '' : ' (the setting\'s ceiling)'}`;
}
