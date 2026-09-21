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
import { Baton, batonPlanSentence, isLive, passBaton, successorSurface } from './baton';
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
}

const PROMPT_PREVIEW = 300;

/** A baton as the bridge shows it — the prompt previewed, the successor's surface resolved. */
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
            describe: 'S-66 — LEAVE THE BATON: the words your successor starts from, when this run is ending (5-hour quota or context wall — _REF/handover.md). It STARTS NOTHING: it records the baton against the calling session (found as sessions.whoami finds it — never from the folder), reads that session\'s sealed launch manifest for the successor\'s whole setup (engine, model, effort, permission, provider, superpowers, folder, project), and answers with `sentence` — what will happen when this session ENDS. A second pass from the same session replaces the first. args: prompt (required — the successor\'s first message), from? (a session id, when you are not the caller), surface? (inherit | console | terminal | headless; default inherit = the surface this run used), account? (default @emptiest), note? (a line for the person reading the chain, never sent to the successor). ‼️ The prompt is prose: never inline it in a shell command — write { "prompt": "…" } to a file with your Write tool and call: node af.js baton.pass "@baton.json". Refused as data (no session found, no launch id or manifest, empty prompt, unknown surface).',
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
                deps.store.put(res.baton, ...res.superseded);
                return {
                    baton: batonView(res.baton),
                    owner: { sessionId: who.sessionId, source: who.source },
                    sentence: batonPlanSentence(res.baton, deps.room?.(res.baton), deps.fmtTime),
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
        }
    ]);
}
