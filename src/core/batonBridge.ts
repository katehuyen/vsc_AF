/**
 * S-69 — THE DOOR A RUN LEAVES ITS BATON THROUGH: `baton.pass` and `baton.status`.
 *
 * `baton.pass` STARTS NOTHING. It finds the calling session from evidence
 * (S-68), reads that session's sealed launch manifest, records the baton as
 * waiting for the session to end, and answers with the sentence saying what
 * will happen — so a wrong expectation is visible while the agent can still
 * correct it. Opening the successor is S-70/S-71's job, after the run ended.
 *
 * Every dependency is handed in, so the ops dispatch in a test exactly as they
 * do in the window.
 */
import { BridgeCaller, BridgeRefusal, BridgeRegistry, optNum, optStr } from './bridge';
import { BATON_DEFAULT_MAX_LEGS, Baton, batonBrake, batonPlanSentence, isLive, moveBaton, passBaton, successorSurface } from './baton';
import { BatonStore } from './batonStore';
import { LaunchManifest, manifestOf } from './launchManifest';
import { WhoamiResult } from './whoami';

export interface BatonBridgeDeps {
    store: BatonStore;
    /** the calling session, from evidence (sessions.whoami's own resolution) */
    caller: (argSession: string | undefined, from: BridgeCaller | undefined) => Promise<WhoamiResult>;
    /** the launch id the session was started with — its card first, then the index binding */
    launchIdOf: (sessionId: string) => string | undefined;
    manifests: () => readonly LaunchManifest[];
    /** the account policy's answer for this moment, WITHOUT moving a round-robin cursor */
    room?: (b: Baton) => { account?: string; resetsAt?: number; refusal?: string } | undefined;
    fmtTime?: (t: number) => string;
    now?: () => number;
    /** S-74 — the runner's button: the successor starts now (BatonRunner.startNow) */
    startNow?: (b: Baton, by: string) => { ok: true; baton: Baton } | { ok: false; why: string };
    /** S-78 — the passing folder's git HEAD, for the barren brake */
    headOf?: (cwd: string) => Promise<string | undefined>;
    /** S-78 — agentFarm.batonMaxHops; absent = BATON_DEFAULT_MAX_LEGS */
    maxLegs?: () => number;
    /** S-78 — a brake stopped a chain: one of the two things a relay tells Notices (S-77) */
    notify?: (title: string, body: string, key: string) => void;
}

/** S-74 — the live batons an op's `baton` / `chain` / `session` argument names. */
export function pickLive(store: BatonStore, args: Record<string, unknown>, allowChain: boolean): { list: Baton[]; by: string } {
    const id = optStr(args, 'baton');
    const chain = allowChain ? optStr(args, 'chain') : undefined;
    const session = optStr(args, 'session');
    if (id) {
        const b = store.get(id);
        return { list: b && isLive(b) ? [b] : [], by: `baton ${id}` };
    }
    if (chain) { return { list: store.chain(chain).filter(isLive), by: `chain ${chain}` }; }
    if (session) {
        const b = store.liveFrom(session);
        return { list: b ? [b] : [], by: `session ${session.slice(0, 8)}` };
    }
    return { list: [], by: '' };
}

const PROMPT_PREVIEW = 300;

/** A baton as the bridge shows it — the prompt previewed, the successor's surface resolved. */
/** THE USER'S BRAKE, one body for the bridge op and the card's ✕ (S-74 · S-77): recorded, never deleted. */
export function stopBatons(store: BatonStore, list: readonly Baton[], why: string, at: number): Baton[] {
    const stopped: Baton[] = [];
    for (const b of list) {
        const r = moveBaton(b, 'stopped', why, at);
        if (r.ok) { stopped.push(r.baton); }
    }
    store.put(...stopped);
    return stopped;
}

export function batonView(b: Baton): Record<string, unknown> {
    return {
        id: b.id, chainId: b.chainId, hop: b.hop, state: b.state, why: b.why,
        from: {
            sessionId: b.from.sessionId, agentId: b.from.agentId, engine: b.from.engine,
            cwd: b.from.cwd, projectId: b.from.projectId ?? null
        },
        surface: successorSurface(b), account: b.want.account,
        inherit: b.inherit,
        prompt: b.prompt.length > PROMPT_PREVIEW ? b.prompt.slice(0, PROMPT_PREVIEW) + '…' : b.prompt,
        promptChars: b.prompt.length,
        note: b.note ?? null,
        wakeAt: b.wakeAt ?? null, taskId: b.taskId ?? null, toSessionId: b.toSessionId ?? null,
        createdAt: b.createdAt, updatedAt: b.updatedAt
    };
}

export function registerBatonOps(bridge: BridgeRegistry, deps: BatonBridgeDeps): void {
    const now = () => (deps.now ?? Date.now)();

    bridge.register([
        {
            op: 'baton.pass',
            describe: 'S-66 — LEAVE THE BATON: the words your successor starts from, when this run is ending (5-hour quota or context wall — _REF/handover.md). It STARTS NOTHING: it records the baton against the calling session (found as sessions.whoami finds it — never from the folder), reads that session\'s sealed launch manifest for the successor\'s whole setup (engine, model, effort, permission, provider, superpowers, folder, project), and answers with `sentence` — what will happen when this session ENDS. A second pass from the same session replaces the first. args: prompt (required — the successor\'s first message), from? (a session id, when you are not the caller), surface? (inherit | console | terminal | headless; default inherit = the surface this run used), account? (default @emptiest), note? (a line for the person reading the chain, never sent to the successor). ‼️ The prompt is prose: never inline it in a shell command — write { "prompt": "…" } to a file with your Write tool and call: node af.js baton.pass "@baton.json". Refused as data (no session found, no launch id or manifest, empty prompt, unknown surface). ‼️ S-78: a pass past the leg ceiling (agentFarm.batonMaxHops) or after two legs in a row that left no new commit is answered with `braked` (ceiling | barren) and opens NOTHING — the baton is kept as stopped; write the handover note instead.',
            handler: async (args, from) => {
                const who = await deps.caller(optStr(args, 'from') || undefined, from);
                if (!who.ok) { throw new BridgeRefusal(who.why, { step: 'caller' }); }
                const launchId = deps.launchIdOf(who.sessionId);
                const res = passBaton({
                    prompt: args.prompt, sessionId: who.sessionId, launchId,
                    manifest: manifestOf(deps.manifests(), { launchId }),
                    surface: args.surface, account: args.account, note: args.note,
                    prior: deps.store.all(), now: now()
                });
                if (!res.ok) {
                    throw new BridgeRefusal(res.why, {
                        step: 'pass', sessionId: who.sessionId, source: who.source, launchId: launchId ?? null
                    });
                }
                const head = deps.headOf ? await deps.headOf(res.baton.from.cwd).catch(() => undefined) : undefined;
                const accepted: Baton = head ? { ...res.baton, head } : res.baton;
                const brake = batonBrake(accepted, deps.store.all(), deps.maxLegs ? deps.maxLegs() : BATON_DEFAULT_MAX_LEGS);
                if (brake) {
                    const moved = moveBaton(accepted, 'stopped', `braked — ${brake.why}`, now());
                    const stopped = moved.ok ? moved.baton : accepted;
                    deps.store.put(stopped, ...res.superseded);
                    deps.notify?.(
                        `Baton chain stopped — ${brake.kind === 'ceiling' ? 'leg ceiling' : 'barren chain'} (${stopped.chainId})`,
                        `${brake.why} The runner (session ${who.sessionId.slice(0, 8)}) was told to write a handover note instead, so a person can pick the work up. `
                        + (brake.kind === 'ceiling'
                            ? 'agentFarm.batonMaxHops sets the ceiling (0 = none).'
                            : `What each leg did: baton.status chain=${stopped.chainId}.`),
                        `baton:${stopped.id}:braked`);
                    return {
                        baton: batonView(stopped),
                        owner: { sessionId: who.sessionId, source: who.source },
                        braked: brake.kind,
                        sentence: `The chain stops here: ${brake.why} Nothing opens after this session — write a handover note instead (_REF/handover.md, section 4) so a person can pick the work up, then end the run.`,
                        superseded: res.superseded.map(b => b.id)
                    };
                }
                deps.store.put(accepted, ...res.superseded);
                return {
                    baton: batonView(accepted),
                    owner: { sessionId: who.sessionId, source: who.source },
                    sentence: batonPlanSentence(accepted, deps.room?.(accepted), deps.fmtTime),
                    superseded: res.superseded.map(b => b.id)
                };
            }
        },
        {
            op: 'baton.status',
            describe: 'S-66 — THE BATONS: every live one (waiting for its session to end, or parked until a reset) and the chains they belong to, hop by hop — who passed, who was started, what each is waiting for, its wake time, the sentence of its last change. args: chain? (one chain id), session? (batons passed by or started for that session), limit? (chains, default 20, newest first)',
            handler: (args) => {
                const chain = optStr(args, 'chain');
                const session = optStr(args, 'session');
                const limit = Math.max(1, optNum(args, 'limit', 20));
                const all = deps.store.all().filter(b =>
                    (!chain || b.chainId === chain)
                    && (!session || b.from.sessionId === session || b.toSessionId === session));
                const chains = new Map<string, Baton[]>();
                for (const b of all) {
                    const list = chains.get(b.chainId) ?? [];
                    list.push(b);
                    chains.set(b.chainId, list);
                }
                return {
                    live: all.filter(isLive).map(batonView),
                    chains: [...chains.entries()].slice(0, limit).map(([id, list]) => ({
                        chainId: id,
                        hops: [...list].sort((a, b) => a.hop - b.hop || a.createdAt - b.createdAt).map(batonView),
                        live: list.some(isLive)
                    })),
                    total: deps.store.all().length
                };
            }
        },
        {
            op: 'baton.stop',
            describe: 'S-74 — THE USER\'S BRAKE: stop a waiting or parked baton, or a whole chain. Nothing is deleted — each record stays as `stopped` with your reason in `why`, and baton.status still shows it. A task row the baton had already opened is NOT touched (cancel it with tasks.cancel if you mean to). args: baton? (one id) | chain? (every live baton of that chain) | session? (the live baton that session passed) — exactly one of the three; why? (a line, recorded on each). Refused as data when nothing live matches. The same brake as ✕ on the card.',
            handler: (args) => {
                const picked = pickLive(deps.store, args, true);
                if (!picked.by) { throw new BridgeRefusal('say which: baton (an id), chain (a chain id) or session (the session that passed it).', { step: 'pick' }); }
                if (!picked.list.length) { throw new BridgeRefusal(`nothing live matches ${picked.by} — baton.status lists what is waiting or parked.`, { step: 'pick', by: picked.by }); }
                const stopped = stopBatons(deps.store, picked.list, optStr(args, 'why') || 'stopped by the user', now());
                return { stopped: stopped.map(batonView), by: picked.by };
            }
        },
        {
            op: 'baton.now',
            describe: 'S-74 — THE USER\'S GO: start the successor NOW instead of waiting. A baton waiting for its session to end goes through the door at once — you are saying the predecessor is done, or accepting two runs at once; a baton parked on a queued task row asks the pump again, which is what you want after freeing an account or lifting a ceiling by hand. args: baton? (one id) | session? (the live baton that session passed) — one of the two; by? (who, default "the user", recorded in why). Answers the baton in its new state (started · parked with the hold · refused with the door\'s reason); refused as data when nothing live matches or the row is no longer queued.',
            handler: (args) => {
                if (!deps.startNow) { throw new BridgeRefusal('no runner is wired in this build.', { step: 'runner' }); }
                const picked = pickLive(deps.store, args, false);
                if (!picked.by) { throw new BridgeRefusal('say which: baton (an id) or session (the session that passed it).', { step: 'pick' }); }
                if (!picked.list.length) { throw new BridgeRefusal(`nothing live matches ${picked.by} — baton.status lists what is waiting or parked.`, { step: 'pick', by: picked.by }); }
                const r = deps.startNow(picked.list[0], optStr(args, 'by') || 'the user');
                if (!r.ok) { throw new BridgeRefusal(r.why, { step: 'now', baton: picked.list[0].id, state: picked.list[0].state }); }
                return { baton: batonView(r.baton), by: picked.by };
            }
        }
    ]);
}
