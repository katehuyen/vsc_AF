/**
 * S-121 — THE CHAIN BOARD ON THE BRIDGE: chains.list, chains.continue, chains.end.
 * Each handler hands the store to the pure core (chainBoard.ts, chainControl.ts)
 * and applies what it answers; nothing is decided here.
 */
import { Baton } from './baton';
import { BridgeRefusal, BridgeRegistry, argStr, optBool, optNum, optStr } from './bridge';
import { BatonBoard } from './batonBoard';
import { SuccessorRowCancel, batonView, stopBatons } from './batonBridge';
import { BatonStore } from './batonStore';
import { BoardThresholds, ChainRow, LegFacts, boardCounts, chainBoard, filterBoard } from './chainBoard';
import { ContinueResult, continueChain, endChain } from './chainControl';
import type { FaultEpisode } from './engineFaultWatch';
import { resolveFlex } from './flexResolve';
import type { SayPart } from './uiSentence';

/** `own(key)` = what the USER wrote for agentFarm.<key> (inspect, never get) — resolved on the flex chain. */
export function boardThresholds(own: (key: string) => unknown): BoardThresholds & { sentences: Record<string, string> } {
    const r = (id: string, key: string) => {
        const v = own(key);
        return resolveFlex(id, v === undefined || v === null || v === '' ? {} : { settings: v });
    };
    const hang = r('chains.hangMinutes', 'chainHangMinutes');
    const wait = r('chains.waitMinutes', 'chainWaitMinutes');
    const ms = (v: unknown) => Math.round(Math.max(1, Number(v) || 1) * 60_000);
    return { hangMs: ms(hang.value), waitMs: ms(wait.value), sentences: { hangMinutes: hang.sentence, waitMinutes: wait.sentence } };
}

/** What closing a leg's session came to: closed, kept (it was working and the person said no), or nothing to close. */
export type LegClose = 'closed' | 'kept' | 'none';

export interface ChainBoardOpsDeps {
    store: BatonStore;
    /** one snapshot per board: the session list and the live views are read once, then asked per leg */
    factsNow: () => (sessionId: string) => LegFacts | undefined;
    faults?: () => readonly FaultEpisode[];
    /** agentFarm.batonMaxHops */
    maxLegs: () => number;
    thresholds: () => ReturnType<typeof boardThresholds>;
    now: () => number;
    board?: BatonBoard;
    cancelRow?: SuccessorRowCancel;
    /** ask the runner to look at once, so a reopened leg whose session is already gone does not wait for the sweep */
    sweep?: () => void;
    /** close a leg's session: at rest at once, working only if the person agrees — asked through `confirm` when given */
    closeLeg?: (sessionId: string, why: string, confirm?: LegConfirm) => Promise<LegClose>;
}

/** S-125 — asks whoever pressed (a phone's view, a tab): true = the yes button was chosen. */
export type LegConfirm = (question: string, yes: string) => Promise<boolean>;

export function boardNow(deps: ChainBoardOpsDeps): ChainRow[] {
    const t = deps.thresholds();
    return chainBoard({
        batons: deps.store.all(), links: deps.store.links(), facts: deps.factsNow(), faults: deps.faults?.() ?? [],
        now: deps.now(), maxLegs: deps.maxLegs(), thresholds: { hangMs: t.hangMs, waitMs: t.waitMs }
    });
}

/** chains.continue's body — the op and the Chains page's ↻ alike. */
export function continueOnBoard(deps: ChainBoardOpsDeps, q: { chain: string; prompt?: string; why?: string; by?: string; maxLegs?: unknown }): ContinueResult {
    const row = boardNow(deps).find(r => r.chainId === q.chain);
    const r = continueChain(deps.store.all(), {
        chainId: q.chain, prompt: q.prompt, why: q.why, by: q.by || 'the user',
        maxLegs: q.maxLegs, running: row?.state === 'running' ? row.live : undefined,
        fallbackMax: deps.maxLegs(), now: deps.now()
    });
    if (!r.ok) { return r; }
    deps.store.put(r.baton, ...(r.seal ? [r.seal] : []));
    try { deps.sweep?.(); } catch { /* the minute sweep follows anyway */ }
    return r;
}

export type EndOnBoard =
    | { ok: true; stopped: Baton[]; closing?: Baton; sessionId?: string; session?: LegClose; sentence: string; say?: SayPart[] }
    | { ok: false; why: string; say?: SayPart[] };

/** chains.end's body — the op and the Chains page's ■ alike. */
export async function endOnBoard(deps: ChainBoardOpsDeps, q: { chain: string; why?: string; by?: string; endSession?: boolean; confirm?: LegConfirm }): Promise<EndOnBoard> {
    const r = endChain(deps.store.all(), { chainId: q.chain, by: q.by || 'the user', why: q.why, now: deps.now() });
    if (!r.ok) { return r; }
    const stopped = r.stop.length ? stopBatons(deps.store, r.stop, r.why, deps.now(), deps.board, deps.cancelRow) : [];
    if (r.braked && r.closing) {
        deps.store.put(r.braked, r.closing);
        deps.board?.closeChain(deps.store.chain(q.chain).map(b => b.a2aNoteId), deps.now());
    }
    const session = q.endSession && r.sessionId && deps.closeLeg ? await deps.closeLeg(r.sessionId, r.why, q.confirm) : undefined;
    return {
        ok: true, stopped, ...(r.closing ? { closing: r.closing } : {}), ...(r.sessionId ? { sessionId: r.sessionId } : {}),
        ...(session ? { session } : {}), sentence: r.sentence, ...(r.say ? { say: r.say } : {})
    };
}

export function registerChainBoardOps(bridge: BridgeRegistry, deps: ChainBoardOpsDeps): void {
    bridge.register([
        {
            op: 'chains.list',
            describe: 'S-120 — EVERY RELAY CHAIN IN ONE ROW, derived from the record (batons, the links the store keeps after dropping a finished baton, each leg\'s live facts, the engine-fault watch) — never from what a leg said. '
                + 'Each row: chainId, state (running · waiting · parked · done · stopped · refused · failed) and bucket (the page\'s chips: running · waiting · parked · done · stopped), why + since (the newest record\'s sentence), title, agent, project, engine, leg / maxLegs (0 = none), lastLeg, the current leg\'s sessionId and live (working · idle · gone), startedAt / lastAt, wakeAt, next (the setup the next leg opens on), totals (legs, cost, tokens, ms), brake (ceiling · user · barren), rescue, trimmed (only links left), '
                + 'and signals — the five things the record shows going wrong: hanging (the running leg idle, or its session gone, with no pass and no closing record, past agentFarm.chainHangMinutes), stuck-wait (a successor still waiting on its predecessor\'s end past agentFarm.chainWaitMinutes), cut (failed or refused), fault (the running leg\'s engine failed and the watch has not passed for it), brake (the ceiling or the barren brake refused a pass). '
                + 'Answers { counts, chains, total, thresholds }. args: state? (a state or a chip), agent? (name or id), project? (id), attention? (true = only rows with a signal), limit? (default 50, newest activity first)',
            handler: (args) => {
                const rows = boardNow(deps);
                const picked = filterBoard(rows, {
                    state: optStr(args, 'state'), agent: optStr(args, 'agent'), project: optStr(args, 'project'), attention: optBool(args, 'attention')
                });
                const t = deps.thresholds();
                return {
                    counts: boardCounts(rows),
                    chains: picked.slice(0, Math.max(1, optNum(args, 'limit', 50))),
                    total: picked.length,
                    thresholds: { hangMs: t.hangMs, waitMs: t.waitMs, from: t.sentences }
                };
            }
        },
        {
            op: 'chains.continue',
            describe: 'S-121 — REOPEN A CHAIN that stopped, ended or hangs: a waiting baton from the leg that ran last, so the next leg goes through the relay\'s own door — the chain\'s account pool, its model and surface, a park when every account is full, the chain header. '
                + 'The new leg starts from the chain\'s LAST HANDOVER WORDS under a "reopened by the user" header, or from your prompt. A running leg is taken over only when it is idle (Agent Farm closes its card once at rest) or its session is gone; a chain with a successor already waiting is refused (baton.now starts that). '
                + 'If the reopened leg would pass the chain\'s ceiling, the ceiling is lifted to it (it becomes the last leg) unless you give maxLegs. Nothing is deleted; the record says who reopened it and why. '
                + 'args: chain (chn_… id), prompt? (the words the leg starts from), why? (a line, recorded), maxLegs? (the chain\'s ceiling, this leg included; 0 = none), by? (who, default "the user")',
            handler: (args) => {
                const chainId = argStr(args, 'chain');
                const r = continueOnBoard(deps, { chain: chainId, prompt: optStr(args, 'prompt'), why: optStr(args, 'why'), by: optStr(args, 'by'), maxLegs: args.maxLegs });
                if (!r.ok) { throw new BridgeRefusal(r.why, { step: 'continue', chain: chainId }); }
                return { baton: batonView(r.baton), sentence: r.sentence, ...(r.seal ? { maxLegs: r.seal.maxLegs } : {}) };
            }
        },
        {
            op: 'chains.end',
            describe: 'S-121 — END A CHAIN ON PURPOSE: a waiting or parked successor is stopped (an unstarted successor row is cancelled with it); a RUNNING leg is braked as the chain\'s last and its closing record (done, "ended by …") is written, so its handover line asks for the note, a pass it makes anyway is braked, and the failsafe opens nothing. '
                + 'endSession=true also closes the leg\'s session: at once when it is at rest, and only after asking the person when it is working. Nothing is deleted. Refused as data when the chain has already ended. '
                + 'args: chain (chn_… id), why? (a line, recorded), endSession? (default false), by? (who, default "the user")',
            handler: async (args) => {
                const chainId = argStr(args, 'chain');
                const r = await endOnBoard(deps, { chain: chainId, why: optStr(args, 'why'), by: optStr(args, 'by'), endSession: optBool(args, 'endSession') });
                if (!r.ok) { throw new BridgeRefusal(r.why, { step: 'end', chain: chainId }); }
                return {
                    stopped: r.stopped.map(batonView), closing: r.closing ? batonView(r.closing) : null,
                    sessionId: r.sessionId ?? null, session: r.session ?? null, sentence: r.sentence
                };
            }
        }
    ]);
}
