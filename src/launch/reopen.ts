import type { Baton } from '../core/baton';
import { ClosingSetup, ReopenSetup, SetupObsMap, SetupValues, resolveReopen } from '../core/closingSetup';

/**
 * ‼️ S-109 — A BATON LEG OPENS ON WHAT ITS PREDECESSOR CLOSED WITH.
 *
 * `inheritFrom` copies the predecessor's LAUNCH manifest, so a chain whose
 * head was started at medium and raised to xhigh on its card ran every leg at
 * medium (measured: chn_munnti1e001fvm, chn_muodelr900e71j). Model, effort and
 * permission mode now come from the session's own closing answers where it has
 * them. Untouched: the account (S-106 decides it at the door), the engine,
 * folder, surface, route and project (the manifest's), and the model of a
 * FLAGGED pass, which swapped it on purpose.
 */
export function batonOnClosing(b: Baton, own: SetupValues): Baton {
    const v = (d: 'model' | 'effort' | 'permissionMode') => String(own[d] ?? '').trim();
    const inherit = { ...b.inherit };
    if (v('model') && b.fault !== 'flagged') { inherit.model = v('model'); }
    if (v('effort')) { inherit.effort = v('effort'); }
    if (v('permissionMode')) { inherit.permissionMode = v('permissionMode'); }
    return { ...b, inherit };
}

/**
 * ‼️ S-109 — THE ONE CALL EVERY REOPEN DOOR MAKES.
 *
 * A Resume button, the bridge's `console.start resume=`, a terminal resume, a
 * task picking its conversation back up and a baton leg all ask the same
 * question — "what did this session close with?" — and each used to answer it
 * with its own hand-written `transcript || manifest || agent || fleet`. This
 * gathers the layers once and lets `resolveReopen` order them; the door keeps
 * only what is really its own (its route gate, its project, its surface).
 *
 * The door states what it decided itself in `explicit` (an account move's new
 * slot, a deliberate escalation) and that always wins.
 */
export interface ReopenDeps {
    /** The card-fed durable record, if this session ever ran in a card. */
    closing: (sessionId: string) => ClosingSetup | undefined;
    /** Claude: the transcript's last values with their times. Other engines: `{}`. */
    transcript: (sessionId: string, engine: string) => SetupObsMap;
    /** The index's last values (S-45) — used, undated, where the transcript gave nothing. */
    indexed: (sessionId: string) => SetupValues;
    /** The launch manifest's `requested`, only when it is this engine's. */
    requested: (sessionId: string, engine: string) => SetupValues;
    /** The account the launch manifest (or the engine's evidence) placed it on. */
    sessionAccount: (sessionId: string) => string | undefined;
    /** The agent's own model/effort on this engine. */
    agentDefaults: (agentName: string | undefined, engine: string) => SetupValues;
    /** The fleet's launch defaults. */
    fleet: () => { engine?: string; model?: string; effort?: string; permissionMode?: string };
    /** The engine catalogue's narrowing of a model/effort pair (X-30). */
    narrow: (engine: string, model: string | undefined, effort: string | undefined) => { model?: string; effort?: string };
}

export interface ReopenQuery {
    sessionId: string;
    engine: string;
    agentName?: string;
    explicit?: SetupValues;
    /**
     * A door's SOFT layer — the Console composer's boxes, which are seeded
     * from the defaults and so are not a choice. It sits under everything the
     * session itself says and over the agent and the fleet, where S-45 put it.
     */
    soft?: SetupValues;
}

/**
 * Only what the SESSION itself says (its card record, its transcript, its own
 * launch, its account) — for a door that applies the agent and fleet layers
 * itself afterwards, so they are not decided twice.
 */
export function sessionOwnOf(r: ReopenSetup): SetupValues {
    const out: SetupValues = {};
    for (const d of ['model', 'effort', 'permissionMode', 'account'] as const) {
        const src = r.from[d];
        if (r[d] && (src === 'card' || src === 'transcript' || src === 'launch' || src === 'session')) { out[d] = r[d]; }
    }
    return out;
}

export function reopenSetupFor(deps: ReopenDeps, q: ReopenQuery): ReopenSetup {
    const engine = q.engine || 'claude';
    const read = deps.transcript(q.sessionId, engine);
    const idx = deps.indexed(q.sessionId);
    const transcript: SetupObsMap = { ...read };
    for (const d of ['model', 'effort', 'permissionMode'] as const) {
        const v = String(idx[d] ?? '').trim();
        if (!transcript[d] && v) { transcript[d] = { value: v, at: 0, from: 'transcript' }; }
    }
    const f = deps.fleet();
    const sameEngine = (f.engine || 'claude') === engine;
    const own = deps.agentDefaults(q.agentName, engine);
    const soft = q.soft ?? {};
    const r = resolveReopen({
        explicit: q.explicit,
        closing: deps.closing(q.sessionId)?.dims,
        transcript,
        launch: deps.requested(q.sessionId, engine),
        agent: {
            model: soft.model || own.model,
            effort: soft.effort || own.effort,
            permissionMode: soft.permissionMode || own.permissionMode
        },
        fleet: {
            ...(sameEngine ? { model: f.model, effort: f.effort } : {}),
            permissionMode: f.permissionMode
        },
        sessionAccount: deps.sessionAccount(q.sessionId)
    });
    const n = deps.narrow(engine, r.model, r.effort);
    const out: ReopenSetup = { ...r, from: { ...r.from } };
    if (n.model) { out.model = n.model; } else { delete out.model; }
    if (n.effort) { out.effort = n.effort; } else { delete out.effort; }
    return out;
}
