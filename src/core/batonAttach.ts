/**
 * S-82 — THE TWO HANDS A RUNNING SESSION'S RELAY HAS, shared by the bridge and
 * the Console card: attach one (the session becomes leg 1 of a new chain,
 * sealed at once — `baton.attach` and the card's ⑂ Attach relay) and tell a
 * runner to pass now (the handover order, said into its turn — the card's
 * ⑂ Pass now, which the console.send op already is for an agent).
 */
import { BATON_DEFAULT_MAX_LEGS, Baton, BatonRelay, batonRelayOf, normalizeLegCeiling, openerOf } from './baton';
import { markStored } from './batonLegFacts';
import type { FolderRead } from './legRoots';
import { chainMaxLegs, isSeal, sealFirstLeg } from './batonSeal';
import { BatonStore } from './batonStore';
import { DisciplineOrders, orderFor } from './contextGuard';
import { LaunchManifest, manifestOf } from './launchManifest';

export interface AttachDeps {
    store: BatonStore;
    launchIdOf: (sessionId: string) => string | undefined;
    manifests: () => readonly LaunchManifest[];
    headOf?: FolderRead;
    /** S-92 — the folder's `git status --short` at the seal, for the failsafe */
    dirtOf?: FolderRead;
    /** the setting's leg ceiling, for the sentence */
    maxLegs?: () => number;
    now?: () => number;
}

export interface AttachAsk {
    sessionId: string;
    /** the chain's pool — a policy `@…`; a slot or nothing = the default pool */
    account?: string;
    /** this chain's own leg ceiling as typed; blank = the setting */
    maxHops?: unknown;
    chain?: string;
    by?: string;
}

export type AttachResult =
    | { ok: true; baton: Baton; sentence: string }
    | { ok: false; why: string; step: string; data?: Record<string, unknown> };

/** Seal a running session as leg 1 of a new chain, or say why not — the store is written only on success. */
export async function attachRelay(deps: AttachDeps, ask: AttachAsk): Promise<AttachResult> {
    const sid = String(ask.sessionId ?? '').trim();
    const prior = deps.store.all();
    const inChain = batonRelayOf(prior, sid);
    if (inChain) {
        return {
            ok: false, step: 'attach', data: { chainId: inChain.chainId },
            why: `session ${sid.slice(0, 8)} is already in chain ${inChain.chainId} (it would pass hop ${inChain.hop}) — nothing to attach.`
        };
    }
    const raw = ask.maxHops;
    const maxLegs = normalizeLegCeiling(raw);
    if (maxLegs === undefined && !(raw === undefined || raw === null || raw === '')) {
        return { ok: false, step: 'args', why: `maxHops must be a whole number ≥ 0 (0 = no ceiling), not "${String(raw)}".` };
    }
    const launchId = deps.launchIdOf(sid);
    const r = sealFirstLeg({
        leg: {
            sessionId: sid, launchId, account: ask.account, chainId: ask.chain,
            by: ask.by || 'the user', ...(maxLegs !== undefined ? { maxLegs } : {})
        },
        manifest: launchId ? manifestOf(deps.manifests(), { launchId }) : undefined,
        prior, now: (deps.now ?? Date.now)()
    });
    if (!r) { return { ok: false, step: 'attach', why: `session ${sid.slice(0, 8)} is already in a chain — baton.status session=${sid} shows it.` }; }
    if (!r.ok) { return { ok: false, step: 'seal', why: r.why, data: { sessionId: sid, launchId: launchId ?? null } }; }
    // S-103 — stored BEFORE git is read: a second seal of the same session (a
    // relay the card still wanted) arriving during that read must see this one.
    deps.store.put(r.baton);
    await markStored(deps.store, r.baton, deps.headOf, deps.dirtOf);
    const sealed: Baton = deps.store.all().find(b => b.id === r.baton.id) ?? r.baton;
    const cap = chainMaxLegs([sealed], sealed.chainId, deps.maxLegs ? deps.maxLegs() : BATON_DEFAULT_MAX_LEGS);
    return {
        ok: true, baton: sealed,
        sentence: `Session ${sid.slice(0, 8)} is now leg 1 of chain ${sealed.chainId}: its handover line says "pass the baton" (baton.pass), `
            + `every later leg is placed from ${sealed.want.account}, and the chain runs ${cap ? `at most ${cap} legs` : 'with no leg ceiling'}.`
    };
}

export const PASS_NOW_WORD = 'PASS NOW';

/**
 * What ⑂ Pass now says into a runner's turn: the handover order the context
 * line would have sent, worded for its relay state by the same `orderFor`
 * (and the same user-set orders), headed by who asked.
 */
export function passNowText(relay: BatonRelay | undefined, orders?: Partial<DisciplineOrders>): string {
    return `${PASS_NOW_WORD} — the user pressed Pass now on this session's Console card. ${orderFor('handover', relay, orders)}`;
}

/**
 * S-128 — the record a delivered ⑂ Pass now leaves: on the running leg's
 * opener, so the chain board can say the pass that follows was the user's.
 * Nothing else moves (updatedAt included: the crash-loop guard reads it as
 * the leg's start). A leg that already left its pass or end is not stamped.
 */
export function markPassNow(list: readonly Baton[], sessionId: string, by: string, now: number): Baton | undefined {
    const sid = String(sessionId ?? '').trim();
    const opener = openerOf(list, sid);
    if (!opener || list.some(b => b.from.sessionId === sid && !isSeal(b))) { return undefined; }
    return { ...opener, passNow: { at: now, by } };
}
