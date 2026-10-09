/**
 * X-475 — THE ACCOUNT / RELAY DECISION SURFACE, IN ONE PLACE.
 *
 * Which sign-in a launch runs on, the wall every unattended start obeys, why a
 * relay leg passed, whether its successor stays on the account, where a parked
 * or system-placed row goes at its start: one module, read as a whole. The host
 * hands every machine fact in through `PlacementDeps`; each dep is asked only
 * when a decision is made, so the surface may be built before the stores exist
 * (a dep asked too early throws exactly as the host's own closure would).
 */
import { AccountPolicy, isPolicyId, PolicyPool, PolicyResolution, PolicyWorld, resolvePolicy } from '../core/accountPolicy';
import { asleepIn } from '../core/accountLife';
import { accountResolution, findSlot, slotLabel } from '../core/accountStore';
import { SEVEN_DAY, SlotUsage } from '../core/accountUsage';
import type { Baton, BatonFault } from '../core/baton';
import { DEFAULT_CONTEXT_THRESHOLDS, ContextSignalRecord } from '../core/contextGuard';
import { EngineAccountSlot } from '../core/engineAccounts';
import { resolveFlex } from '../core/flexResolve';
import { PassCause, passCause } from '../core/passCause';
import { normalizeRetry, RETRY_DEFAULT_SAFETY_MIN } from '../core/retry';
import type { SupervisorRoom } from '../core/retrySupervisor';
import type { SentryRecord } from '../core/sentryCampaign';
import { StartWall, startRoom, startWall } from '../core/startRoom';
import { StayVerdict, stayOnAccount, stayPctOf } from '../core/stayAccount';
import type { FarmTask } from '../core/tasks';
import { fiveHourNow, splitNow, weekNow } from '../core/usageFloor';

export interface PlacementDeps {
    /** agentFarm.<key> as the user set it, no default (undefined = unset) */
    ownSetting: (key: string) => unknown;
    /** agentFarm.<key> with its default */
    setting: <T>(key: string, fallback: T) => T;
    usage: () => SlotUsage[];
    refreshSlot: (slot: string) => Promise<unknown>;
    markWalled: (slot: string) => void;
    stored: () => EngineAccountSlot[];
    active: () => Record<string, string>;
    standing: (agentId: string | undefined, engine: string | undefined) => string;
    policies: () => AccountPolicy[];
    sentry: () => SentryRecord | undefined;
    guard: (sessionId: string) => ContextSignalRecord | undefined;
    /** the account a session's Console card runs on */
    cardAccount: (sessionId: string) => string | undefined;
    /** a live baton holds this task row */
    liveBatonOn: (taskId: string) => boolean;
    cursor: (key: string) => string;
    setCursor: (key: string, value: string) => void;
    log: (line: string) => void;
}

/** Where `@round-robin` remembers the slot it picked last, per engine. */
export const roundRobinKey = (engine: string): string =>
    `af.roundRobinCursor.${(engine || 'claude').trim().toLowerCase() || 'claude'}`;

export function accountPlacement(d: PlacementDeps) {
    const labelOf = (id: string): string => { const sl = findSlot(d.stored(), id); return sl ? slotLabel(sl) : id; };
    // X-530 — an asleep slot is never placed on: not by a standing choice, a pool, a stay or a relay's own account
    const asleep = (id: string | undefined): boolean => !!id && asleepIn(d.stored())(id);
    /** agentFarm.quotaHandoverPct — its default is the context guard's, never a number written here. */
    function handoverLine(): number {
        return d.setting<number>('quotaHandoverPct', DEFAULT_CONTEXT_THRESHOLDS.quotaHandoverPct);
    }
    /** X-479 — a box's value as the flex point resolves it (an unset box is its shipped default). */
    const boxOf = (key: string, point: string): unknown => {
        const mine = d.ownSetting(key);
        return resolveFlex(point, mine === undefined || mine === null || mine === '' ? {} : { settings: mine }).value;
    };
    // ‼️ X-469 — THE wall every unattended start obeys (startRoom.ts startWall): defaultAccountCeiling, or a wall the
    // caller names for itself, never above the quota handover line. X-479 — the week walled apart, by its own box.
    function accountCeiling(own?: { value: unknown; why: string }): StartWall {
        const set = boxOf('defaultAccountCeiling', 'accounts.defaultCeiling');
        return startWall({ setting: set, handoverPct: handoverLine(), ...(own ? { own: own.value, ownWhy: own.why } : {}),
            weekSetting: boxOf('defaultAccountWeeklyCeiling', 'accounts.defaultWeeklyCeiling'),
            weekHandoverPct: d.setting<number>('quotaWeeklyHandoverPct', DEFAULT_CONTEXT_THRESHOLDS.quotaWeeklyHandoverPct) });
    }
    /** X-471 — a sentry campaign's wall: its own ceiling when it states one, else the Account ceiling; never above the handover line. */
    function campaignWall(rec: { ceiling?: unknown }): StartWall {
        return accountCeiling({ value: rec.ceiling, why: 'the campaign\'s wall' });
    }
    // ‼️ S-106 — a handover that is not the quota's stays on its account under agentFarm.contextHandoverStayAccountPct
    const handoverStay = (slotId: string | undefined, cause: PassCause): StayVerdict => {
        const u = slotId ? d.usage().find(x => x.slotId === slotId) : undefined;
        const pct = stayPctOf(d.ownSetting).value;
        const s = splitNow(u);
        return stayOnAccount({
            asleep: asleep(slotId),
            // X-462 / X-472 — the figure the verdict stood on (a floor counts, an agent's figure only raises it); a turned-over window is fresh
            stayPct: pct, slotId, percent: cause.quotaPct >= 0 ? cause.quotaPct : (u ? s.five : undefined), resetsAt: u?.resetsAt,
            // X-479 — the week, judged against the wall's own weekly figure (a recorded week only raises it)
            week: Math.max(s.week, typeof cause.weekPct === 'number' ? cause.weekPct : -1),
            // X-472 — the measured cause, never whether an order reached the run
            quotaHandover: cause.kind === 'quota', walled: cause.kind === 'limit', now: Date.now(),
            // X-470 — a stay is a start: it obeys the wall every start obeys (startWall)
            wall: accountCeiling()
        });
    };
    /**
     * X-472 — why a leg passed, from every reading there is (passCause.ts): Agent Farm's figure for the
     * slot (a floor counts), the guard's last reading for the session while its window stands, what the
     * pass recorded, and the agent's own — which only raises it. The stay, the starved note and the card read it.
     */
    const passCauseOf = (o: { sessionId?: string; slot?: string; fault?: BatonFault; recorded?: PassCause; agentPct?: number }): PassCause => {
        const sid = String(o.sessionId ?? '');
        const u = o.slot ? d.usage().find(x => x.slotId === o.slot) : undefined;
        const sl = o.slot ? findSlot(d.stored(), o.slot) : undefined;
        const g = sid ? d.guard(sid) : undefined;
        const live = (resetsAt: number | undefined): boolean => !(resetsAt && resetsAt <= Date.now());
        return passCause({
            fault: o.fault, slot: sl ? slotLabel(sl) : o.slot,
            readings: {
                'agent-farm': fiveHourNow(u),
                ...(g?.quota && live(g.quota.resetsAt) ? { guard: g.quota.lastPct } : {}),
                ...(o.recorded && live(u?.resetsAt) ? { recorded: o.recorded.quotaPct } : {}),
                ...(o.agentPct !== undefined ? { agent: o.agentPct } : {})
            },
            quotaHandoverPct: handoverLine(),
            // X-478 — the week, read the same three ways, against its own line
            week: {
                readings: {
                    'agent-farm': weekNow(u),
                    ...(g?.quota?.week && live(g.quota.week.resetsAt) ? { guard: g.quota.week.lastPct } : {}),
                    ...(o.recorded?.weekPct !== undefined && live((u?.bars ?? []).find(b => b.id === SEVEN_DAY)?.resetsAt) ? { recorded: o.recorded.weekPct } : {})
                },
                line: d.setting<number>('quotaWeeklyHandoverPct', DEFAULT_CONTEXT_THRESHOLDS.quotaWeeklyHandoverPct)
            },
            contextPct: g?.lastPct,
            contextHandoverPct: d.setting<number>('contextHandoverPct', DEFAULT_CONTEXT_THRESHOLDS.handoverPct)
        });
    };
    /** X-472 — the passing slot read fresh before the verdict; a failed or slow read leaves its floor (usageFloor.ts). */
    const freshenSlot = async (slot: string | undefined): Promise<void> => {
        if (!slot) { return; }
        await Promise.race([
            d.refreshSlot(slot).then(() => undefined, () => undefined),
            new Promise<void>(r => setTimeout(r, 4000))
        ]);
    };
    /** The slot a leg ran on: its Console card's, else the one its launch was sealed with. */
    const legSlotOf = (b: Baton): string | undefined =>
        (() => { try { return d.cardAccount(b.from.sessionId); } catch { return undefined; } })() || b.inherit.account;
    /**
     * ‼️ X-305 — the campaign's pool `@pool` walks: its named accounts in the user's order, or every slot of the
     * engine it named; a campaign that named neither has no pool, and `@pool` refuses rather than meaning "any".
     */
    const policyPool = (): PolicyPool | undefined => {
        const rec = d.sentry();
        if (!rec || rec.stoppedAt) { return undefined; }
        const engineId = String(rec.engine ?? '').trim().toLowerCase();
        const accounts = (rec.pool ?? []).length
            ? (rec.pool ?? []).filter(id => !asleep(id))
            : engineId
                ? d.usage()
                    .filter(u => String(u.engine ?? '').toLowerCase() === engineId)
                    .map(u => u.slotId)
                : [];
        if (!accounts.length) { return undefined; }
        return {
            accounts,
            ...(rec.rotation ? { rotation: String(rec.rotation) } : {}),
            ceiling: campaignWall(rec).value,
            ...(engineId ? { engine: engineId } : {})
        };
    };
    /** ‼️ X-305 — the figures a policy decides against, assembled at the moment it is asked: one assembly, so a policy cannot mean one thing to the launcher and another to the spawn. */
    const policyWorldFor = (
        engine: string | undefined, agentId?: string, model?: string
    ): PolicyWorld => {
        const eng = (String(engine || '').trim() || 'claude').toLowerCase();
        const standing = accountResolution('', eng, d.active(),
            d.standing(agentId, eng), undefined, asleep);
        const pool = policyPool();
        return {
            engine: eng,
            usage: d.usage(),
            ceiling: accountCeiling().value,
            handoverPct: handoverLine(),
            weekCeiling: accountCeiling().week,
            standing: standing.id,
            standingOrigin: standing.origin,
            ...(pool ? { pool } : {}),
            cursor: d.cursor(roundRobinKey(eng)),
            policies: d.policies(),
            ...(model ? { model } : {}),
            stored: d.stored().filter(s => s.engine === eng && !s.disabled).map(s => s.id),
            labelOf
        };
    };
    /**
     * ‼️ X-305 — WHAT THE ACCOUNT BOX RESOLVES TO RIGHT NOW, refusal and all. It never throws and never commits:
     * a door about to SPAWN asks `launchAccountFor`; a page describing a setup asks this. A stated slot passes through.
     */
    const launchAccountPick = (
        o: { engine?: string; account?: string; agentId?: string; model?: string }
    ): PolicyResolution => {
        const stated = String(o.account ?? '').trim();
        if (!isPolicyId(stated)) {
            const r = accountResolution(stated, o.engine, d.active(),
                d.standing(o.agentId, o.engine),
                labelOf, asleep);
            return { id: r.id, policy: '', note: r.note };
        }
        return resolvePolicy(stated, policyWorldFor(o.engine, o.agentId, o.model));
    };
    /**
     * ‼️ X-169 / X-302 — which sign-in a launch runs on. A stated policy that can choose nothing THROWS rather than
     * answering '' (no variable = the main sign-in). `commit` moves the `@round-robin` cursor: only a real spawn passes it.
     */
    const launchAccountFor = (
        engine: string | undefined, stated?: string, agentId?: string,
        o?: { model?: string; commit?: boolean }
    ): string => {
        const r = launchAccountPick({ engine, account: stated, agentId, model: o?.model });
        if (r.refusal) { throw new Error(r.refusal); }
        if (o?.commit && r.cursor) {
            d.setCursor(roundRobinKey(String(engine || 'claude')), r.cursor);
        }
        return r.id;
    };
    /** The slot a launch resolves to, or nothing (= the main account); a refusing policy is "no slot" here, never a throw. */
    const launchAccountSlot = (
        o: { engine?: string; account?: string; agentId?: string }
    ): EngineAccountSlot | undefined => {
        const id = launchAccountPick(o).id;
        return id ? findSlot(d.stored(), id) : undefined;
    };
    /**
     * ‼️ X-462 — A PARKED RELAY LEG'S ROW AT ITS WAKE keeps waiting (`quota:5h`) while its pool has no account under
     * the wall — never launched into a refusal that would fail the row and end the chain. Asked while activating, before
     * the relay is wired, it holds nothing.
     */
    function relayWakeHold(task: FarmTask): { code: 'quota:5h'; reason: string; basis: 'account' } | undefined {
        try {
            if (!isPolicyId(String(task.account ?? '').trim())) { return undefined; }
            // X-473 — a row sent back to its pool waits for room like a relay leg does
            if (!task.accountPool && !d.liveBatonOn(task.id)) { return undefined; }
            const r = launchAccountPick({ engine: task.engine || 'claude', account: task.account, agentId: task.agentId, model: task.model });
            if (r.refusal && r.resetsAt) { return { code: 'quota:5h', basis: 'account', reason: `relay leg waits for room — ${r.refusal}` }; }
            return undefined;
        } catch { return undefined; }
    }
    // X-473 — the last line: a slot the system chose is asked again at the start, under the row's own wall
    const replaceAccount = (task: FarmTask): { account: string; why: string } | undefined => {
        const u = d.usage().find(x => x.slotId === task.account);
        const camp: SentryRecord | undefined = d.sentry();
        const own: StartWall = task.sentryOf && camp?.id === task.sentryOf ? campaignWall(camp) : accountCeiling();
        const room = startRoom(u, own);
        if (room.ok) { return undefined; }
        return { account: String(task.accountPool), why: `${labelOf(String(task.account))}: ${room.why} — placed again from ${task.accountPool}` };
    };
    /**
     * ‼️ X-477 — WHETHER THE SUPERVISOR'S TURN MAY START NOW (M-13): the sign-in it would run on, judged by the one
     * wall every unattended start obeys, on the figure in force (a floor counts). No figure is 'unknown', never 'free'.
     */
    const supervisorRoom = (p: { engine?: string; model?: string }): SupervisorRoom => {
        try {
            const r = launchAccountPick({ engine: p.engine, ...(p.model ? { model: p.model } : {}) });
            if (r.refusal) { return 'full'; }
            const u = r.id ? d.usage().find(x => x.slotId === r.id) : undefined;
            if (!u || u.state === 'no-source' || !Number.isFinite(u.percent)) { return 'unknown'; }
            const room = startRoom(u, accountCeiling());
            return !room.ok ? 'full' : room.pct < 0 ? 'unknown' : 'free';
        } catch { return 'unknown'; }
    };
    /**
     * The relay door's account: the predecessor's slot, the measured cause, the S-106 stay, and — every account full
     * RIGHT NOW — the park (first reset + the safety buffer; a preview, the round-robin cursor does not move).
     */
    const successorPlacement = (b: Baton, agentId: string, ruled?: string) => {
        const was = legSlotOf(b);
        // X-462 — the account the plan limit walled is full until it turns over, whatever its last figure says
        if (b.fault === 'limit' && was) { try { d.markWalled(was); } catch { /* the stay rule still refuses it */ } }
        // X-462 — a pass the plan limit forced never keeps the successor on the walled account
        // X-472 — classified again at the door, raised by what the pass recorded; the stay reads that verdict
        const cause = passCauseOf({ sessionId: b.from.sessionId, slot: was, fault: b.fault, recorded: b.cause });
        // S-143 — the user set the chain's account for this leg (chainAccount.ts accountRuled): no stay overrides it
        const stay: StayVerdict = ruled ? { stay: false, why: ruled } : handoverStay(was, cause);
        if (stay.stay || ruled) { d.log(`baton ${b.id}: ${stay.why}`); }
        // S-73 — every account full RIGHT NOW: the row is written with the first reset + the safety buffer as its notBefore
        // X-530 — a chain whose own account was put to sleep opens its next leg through the pool, and says so
        const wanted = asleep(b.want.account) ? '@emptiest' : b.want.account;
        if (wanted !== b.want.account) { d.log(`baton ${b.id}: ${labelOf(String(b.want.account))} is disabled — the next leg is placed by @emptiest`); }
        const pick = launchAccountPick({ engine: b.from.engine, account: stay.stay ? stay.slotId : wanted, agentId, model: b.inherit.model });
        const park = pick.refusal && pick.resetsAt
            ? {
                resetsAt: pick.resetsAt,
                bufferMin: normalizeRetry(d.setting<unknown>('taskRetry', undefined))?.safetyBufferMin ?? RETRY_DEFAULT_SAFETY_MIN,
                refusal: pick.refusal
            }
            : undefined;
        return { stay, park };
    };
    return {
        handoverLine, accountCeiling, campaignWall, handoverStay, passCauseOf, freshenSlot, legSlotOf, policyPool,
        policyWorldFor, launchAccountPick, launchAccountFor, launchAccountSlot, relayWakeHold, replaceAccount, successorPlacement,
        supervisorRoom
    };
}

export type AccountPlacement = ReturnType<typeof accountPlacement>;
