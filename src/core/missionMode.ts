/**
 * ‼️ M-15 (X-32) — THE ADAPTIVE CONTRACT, AND THE CLASSIC RUN THAT MUST NOT
 * NOTICE IT EXISTS.
 *
 * A classic mission is a RECIPE: the user names the team, the lead delegates
 * round by round and finishes. An adaptive mission is an OBJECTIVE: the user
 * says what must be true at the end (`successCriteria`), what may not be done
 * to get there (`constraints`), who may be drawn on (`pool`) and how much rope
 * the lead has (`autonomy`) — and the lead works out the rest at runtime.
 *
 * This file is the CONTRACT only. It writes no engine, no second store and no
 * parallel control plane: the mode is one optional field on the spec Agent Farm
 * already has, and everything here is pure — types, normalisation, validation
 * and the deterministic lead default. The loop that uses it is M-16, the
 * evaluation is M-17.
 *
 * ‼️ ABSENT MEANS CLASSIC, DEFINITIVELY. Every mission ever written is in the
 * store with no `mode` field, and a run that guessed would be a run that
 * changed behaviour on upgrade. There is no "unknown" third state and no
 * heuristic: `mode` is read once, through `missionModeOf`, and anything that is
 * not the exact string `'adaptive'` is a classic mission.
 */

/** The two ways a mission is described. Absent on an old record = 'classic'. */
export type MissionMode = 'classic' | 'adaptive';

/**
 * How much the lead may decide without coming back to the person.
 *
 * Not a permission level and not a budget — those already exist
 * (`permissionMode` per member, `MissionLimits` per run). This is the ONE
 * sentence an objective needs that a recipe does not: when the lead reaches a
 * fork the objective does not settle, does it choose or does it ask? It is
 * carried into the briefing and read again by the evaluation gate (M-17).
 */
export type MissionAutonomy = 'ask-when-unsure' | 'decide-alone';

export const DEFAULT_AUTONOMY: MissionAutonomy = 'ask-when-unsure';

/**
 * ‼️ ONE THING THAT MUST BE TRUE AT THE END — AND AN ID THAT OUTLIVES ITS
 * WORDING.
 *
 * Evaluations refer to criteria across rounds, across a revise/replan and
 * across a reload (M-17), so a criterion cannot be identified by its text: the
 * moment somebody fixes a typo in it, every judgement already recorded about it
 * would be orphaned and the run would look like it had never assessed
 * anything. The id is assigned once, is never renumbered, and is what the
 * evaluation record points at.
 */
export interface SuccessCriterion {
    /** stable for the life of the spec — never re-derived from `text` */
    id: string;
    text: string;
    /** false = the objective is still met without it; it is a preference */
    required: boolean;
}

/**
 * A candidate the lead may draw on. Deliberately the SAME shape as a classic
 * team member — an adaptive run does not invent a second kind of agent, it
 * chooses from the fleet at runtime instead of being handed a fixed list.
 */
export interface MissionPoolMember {
    agentId: string;
    agentName: string;
    /** what this agent is FOR, in the fleet's own words — the lead reads it */
    role?: string;
    model?: string;
    engine?: string;
    /** ‼️ M-18 — the fourth run dimension, which was the only one of the four a
     *  member could not state. See `resolveDelegateRun`. */
    effort?: string;
    permissionMode?: string;
}

/**
 * ‼️ WHAT THE LEAD ACTUALLY DID WITH THE POOL — a binding, not a folder.
 *
 * When an adaptive lead puts an agent to work it is choosing a ROLE for this
 * run: this agent, this brief, these run dimensions, from now. It is recorded
 * on the run because that is the only place it is true — nothing is created on
 * disk, no agent folder is written, and the same agent can hold a different
 * role in the next run without either statement being wrong.
 */
export interface MissionRuntimeRole {
    agentId: string;
    agentName: string;
    /** the lead's own words for what this agent is doing on THIS run */
    brief: string;
    model?: string;
    engine?: string;
    effort?: string;
    permissionMode?: string;
    boundAt: number;
}

/** The adaptive half of a spec. Every field is absent on a classic mission. */
export interface MissionObjective {
    /** things the run may NOT do, in the user's words — never an instruction */
    constraints?: string[];
    successCriteria?: SuccessCriterion[];
    pool?: MissionPoolMember[];
    autonomy?: MissionAutonomy;
}

const MAX_CRITERIA = 20;
const MAX_CONSTRAINTS = 20;
const MAX_TEXT = 500;

/** The one place `mode` is read. Anything that is not 'adaptive' is classic. */
export function missionModeOf(spec: { mode?: string } | undefined): MissionMode {
    return spec && spec.mode === 'adaptive' ? 'adaptive' : 'classic';
}

export function isAdaptive(spec: { mode?: string } | undefined): boolean {
    return missionModeOf(spec) === 'adaptive';
}

/**
 * ‼️ THE ID IS GIVEN ONCE AND NEVER TAKEN BACK.
 *
 * A criterion arriving without one (typed in a UI, posted over the bridge, or
 * written by hand into the store) gets the first `cN` not already in use —
 * counted from the whole list, not from the position, so filling a gap can
 * never hand out an id another criterion already answers to.
 */
export function normalizeCriteria(raw: unknown): SuccessCriterion[] {
    if (!Array.isArray(raw)) { return []; }
    const out: SuccessCriterion[] = [];
    const taken = new Set<string>();
    for (const item of raw.slice(0, MAX_CRITERIA)) {
        const o = (item && typeof item === 'object' ? item : { text: item }) as Record<string, unknown>;
        const text = String(o.text ?? '').trim().slice(0, MAX_TEXT);
        if (!text) { continue; }
        let id = String(o.id ?? '').trim().slice(0, 40);
        if (!id || taken.has(id)) {
            let n = out.length + 1;
            while (taken.has('c' + n)) { n++; }
            id = 'c' + n;
        }
        taken.add(id);
        // Absent means REQUIRED: a criterion somebody bothered to write is what
        // the objective is, and a default of "optional" would let a run report
        // success having met none of them.
        out.push({ id, text, required: o.required !== false });
    }
    return out;
}

function normalizeStrings(raw: unknown, max: number): string[] {
    if (!Array.isArray(raw)) { return []; }
    const out: string[] = [];
    for (const v of raw) {
        const s = String(v ?? '').trim().slice(0, MAX_TEXT);
        if (s && !out.includes(s)) { out.push(s); }
        if (out.length >= max) { break; }
    }
    return out;
}

export function normalizePool(raw: unknown): MissionPoolMember[] {
    if (!Array.isArray(raw)) { return []; }
    const out: MissionPoolMember[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
        const o = (item ?? {}) as Record<string, unknown>;
        const agentId = String(o.agentId ?? '').trim();
        const agentName = String(o.agentName ?? '').trim() || agentId;
        if (!agentId || seen.has(agentId)) { continue; }
        seen.add(agentId);
        const m: MissionPoolMember = { agentId, agentName };
        for (const k of ['role', 'model', 'engine', 'effort', 'permissionMode'] as const) {
            const v = String(o[k] ?? '').trim();
            if (v) { m[k] = v; }
        }
        out.push(m);
    }
    return out;
}

/**
 * Bring one spec's adaptive half into its canonical shape. Idempotent, and it
 * NEVER writes a field onto a classic spec: an old record that round-trips
 * through here comes out byte-identical, which is the whole migration.
 */
export function normalizeObjective(raw: { mode?: string } & MissionObjective): MissionObjective {
    if (!isAdaptive(raw)) { return {}; }
    const o: MissionObjective = {};
    const constraints = normalizeStrings(raw.constraints, MAX_CONSTRAINTS);
    if (constraints.length) { o.constraints = constraints; }
    const criteria = normalizeCriteria(raw.successCriteria);
    if (criteria.length) { o.successCriteria = criteria; }
    const pool = normalizePool(raw.pool);
    if (pool.length) { o.pool = pool; }
    o.autonomy = raw.autonomy === 'decide-alone' ? 'decide-alone' : DEFAULT_AUTONOMY;
    return o;
}

/**
 * ‼️ WHAT IS WRONG WITH THIS OBJECTIVE, SAID BEFORE ANYTHING IS SPENT.
 *
 * Every one of these is a run that would otherwise start, call the planner and
 * fail somewhere in the middle with the money gone — an objective with no
 * criteria cannot be evaluated, a lead with no name cannot be prompted, an
 * empty pool has nobody to delegate to. Returned as a LIST rather than the
 * first error, because a form that reports one fault at a time is a form
 * somebody fills in four times.
 */
export function validateObjective(spec: {
    mode?: string; goal?: string; leadAgentId?: string; leadAgentName?: string;
} & MissionObjective): string[] {
    if (!isAdaptive(spec)) { return []; }
    const errors: string[] = [];
    if (!String(spec.goal ?? '').trim()) {
        errors.push('an adaptive mission needs a goal — the outcome, not the recipe');
    }
    if (!String(spec.leadAgentId ?? '').trim() || !String(spec.leadAgentName ?? '').trim()) {
        errors.push('no lead resolved — an adaptive run never starts with a nameless lead');
    }
    const criteria = spec.successCriteria ?? [];
    if (!criteria.length) {
        errors.push('an adaptive mission needs at least one success criterion — without one '
            + 'there is nothing to judge the result against');
    }
    const ids = new Set<string>();
    for (const c of criteria) {
        if (!c || !String(c.text ?? '').trim()) { errors.push('a success criterion has no text'); continue; }
        if (!String(c.id ?? '').trim()) { errors.push(`success criterion "${c.text}" has no stable id`); continue; }
        if (ids.has(c.id)) { errors.push(`two success criteria share the id "${c.id}"`); }
        ids.add(c.id);
    }
    if (criteria.length && !criteria.some(c => c && c.required)) {
        errors.push('every success criterion is optional — then nothing decides whether the '
            + 'objective was met');
    }
    const pool = spec.pool ?? [];
    if (!pool.length) {
        errors.push('the agent pool is empty — resolve it from the fleet before starting');
    }
    for (const m of pool) {
        if (!m || !String(m.agentId ?? '').trim()) { errors.push('a pool member has no agentId'); }
    }
    if (spec.autonomy && spec.autonomy !== 'ask-when-unsure' && spec.autonomy !== 'decide-alone') {
        errors.push(`unknown autonomy "${spec.autonomy}" (use ask-when-unsure | decide-alone)`);
    }
    for (const c of spec.constraints ?? []) {
        if (!String(c ?? '').trim()) { errors.push('a constraint is empty'); }
    }
    return errors;
}

export interface FleetAgent { id: string; name: string; role?: string }

/**
 * ‼️ THE LEAD IS RESOLVED BEFORE THE RUN, AND THE RULE IS DETERMINISTIC.
 *
 * An adaptive user gives an outcome, not a cast list, so "who leads" is a
 * question they should not have to answer — but the engine must never be handed
 * a nameless lead, and a default picked by cleverness (the biggest model, the
 * agent that did well last time) is a default nobody can predict or explain.
 * So: the first member of the pool if there is one, otherwise the first agent
 * of the fleet, both in the order the caller already sees them in. Same input,
 * same lead, every time — and the caller shows it before the run starts, so a
 * person who wanted somebody else can say so.
 */
export function resolveLead(
    fleet: readonly FleetAgent[], pool: readonly MissionPoolMember[] = []
): { agentId: string; agentName: string } | undefined {
    for (const m of pool) {
        if (m && m.agentId) { return { agentId: m.agentId, agentName: m.agentName || m.agentId }; }
    }
    for (const a of fleet) {
        if (a && a.id) { return { agentId: a.id, agentName: a.name || a.id }; }
    }
    return undefined;
}

/** The whole fleet as a pool — what a caller that was given no preference uses. */
export function poolFromFleet(fleet: readonly FleetAgent[]): MissionPoolMember[] {
    return normalizePool(fleet.map(a => ({ agentId: a.id, agentName: a.name, role: a.role })));
}

/**
 * ‼️ A ROLE IS BOUND ONCE PER AGENT PER RUN.
 *
 * The lead names an agent and says what it is doing; the second time it names
 * the same agent it is continuing that role, not opening another one. Rebinding
 * would give the run two role rows for one agent and make "who was the
 * reviewer" a question with two answers. The brief is refreshed — the lead's
 * later wording is its current wording — and the binding time is not.
 */
export function bindRuntimeRole(
    roles: readonly MissionRuntimeRole[],
    member: MissionPoolMember,
    brief: string,
    now: number
): MissionRuntimeRole[] {
    const out = roles.slice();
    const at = out.findIndex(r => r.agentId === member.agentId);
    const bound: MissionRuntimeRole = {
        agentId: member.agentId,
        agentName: member.agentName || member.agentId,
        brief: String(brief ?? '').trim().slice(0, MAX_TEXT),
        ...(member.model ? { model: member.model } : {}),
        ...(member.engine ? { engine: member.engine } : {}),
        ...(member.effort ? { effort: member.effort } : {}),
        ...(member.permissionMode ? { permissionMode: member.permissionMode } : {}),
        boundAt: at >= 0 ? out[at].boundAt : now
    };
    if (at >= 0) { out[at] = bound; } else { out.push(bound); }
    return out;
}

/**
 * ‼️ M-18 — A DELEGATION IS A LAUNCH, SO IT RESOLVES ITS DIMENSIONS LIKE ONE.
 *
 * The hole this closes: open agent `X` from the Agent Farm UI and it runs on
 * the model and effort configured FOR that agent (`agentFarm.agentEngineDefaults`,
 * then `agentFarm.launchDefaults` — the whole point of U-29/U-33). Hand the SAME
 * agent the same work through a mission and none of it applied: the delegation
 * read three fields off the team member and nothing else, so a member left blank
 * ran on the CLI's raw built-in default. The same agent behaved differently
 * depending on who asked — which is the mystery `resolveDefault` exists to end,
 * restated one surface over.
 *
 * The layers, highest first, per field:
 *
 *   1. the MEMBER — what this mission says about this agent
 *   2. the MISSION — `spec.engine`, `spec.workdir` (engine and folder ONLY: a
 *      mission-wide model would silently overrule per-agent model policy)
 *   3. the AGENT's own per-engine default, looked up for the engine resolved in
 *      steps 1–2 and not before — which is why `farm` is a callback and not a
 *      value: nothing can look that store up until the engine is known
 *   4. the FLEET (`agentFarm.launchDefaults`)
 *   5. nothing — the CLI decides, exactly as it did before this existed
 *
 * ‼️ CLAUDE'S MODEL AND EFFORT SKIP LAYER 3, and that is not an oversight — it
 * is the same carve-out `withAgentEngineDefaults` makes for a launch. Claude
 * Code reads the agent's own `.claude/settings.local.json` itself, so passing a
 * value derived from that file back on the command line would be a second
 * source of truth silently overriding a file the user may have edited by hand.
 *
 * Pure: the caller supplies the layers, so this is testable and this file goes
 * on knowing nothing about vscode or disk.
 */
export interface DelegateRunLayers {
    /** `agentFarm.agentEngineDefaults` for THIS agent on the engine that was
     *  resolved — a callback, because the engine is decided inside. */
    farm?: (engine: string) => { model?: string; effort?: string } | undefined;
    /** `agentFarm.launchDefaults` — fleet-wide, applies to every engine. */
    launch?: { engine?: string; model?: string; effort?: string; permissionMode?: string };
}

export type DelegateOrigin = 'member' | 'mission' | 'agent' | 'fleet' | 'cli';

/** The dimensions a delegation actually runs with. An unresolved field is
 *  ABSENT, never `''` — a written empty string is a claim that somebody chose
 *  nothing, and it is what would reach a command line. */
export interface DelegateRun {
    /** Always resolved; `claude` is the floor, as it has always been. */
    engine: string;
    model?: string;
    effort?: string;
    permissionMode?: string;
    workDir?: string;
    /** Which layer decided each field — for the day somebody asks why a
     *  delegate ran on a model nobody typed into this mission. */
    origin: Record<'engine' | 'model' | 'effort' | 'permissionMode', DelegateOrigin>;
}

export function resolveDelegateRun(
    member: { model?: string; engine?: string; effort?: string; permissionMode?: string } | undefined,
    spec: { engine?: string; workdir?: string } | undefined,
    layers: DelegateRunLayers = {}
): DelegateRun {
    const t = (v: unknown) => String(v ?? '').trim();
    const launch = layers.launch ?? {};

    // The engine first — every other field is looked up FOR it.
    let engineOrigin: DelegateOrigin = 'cli';
    let engine = t(member?.engine);
    if (engine) { engineOrigin = 'member'; }
    if (!engine) { engine = t(spec?.engine); if (engine) { engineOrigin = 'mission'; } }
    if (!engine) { engine = t(launch.engine); if (engine) { engineOrigin = 'fleet'; } }
    if (!engine) { engine = 'claude'; engineOrigin = 'cli'; }
    engine = engine.toLowerCase();

    const own = engine === 'claude' ? undefined : (layers.farm?.(engine) ?? undefined);

    const pick = (
        fromMember: string, fromAgent: string, fromFleet: string
    ): { value: string; origin: DelegateOrigin } => {
        if (fromMember) { return { value: fromMember, origin: 'member' }; }
        if (fromAgent) { return { value: fromAgent, origin: 'agent' }; }
        if (fromFleet) { return { value: fromFleet, origin: 'fleet' }; }
        return { value: '', origin: 'cli' };
    };

    const model = pick(t(member?.model), t(own?.model), t(launch.model));
    const effort = pick(t(member?.effort), t(own?.effort), t(launch.effort));
    // ‼️ Permission mode has no per-agent, per-engine layer to fall through to:
    // that store holds a model and an effort and nothing else. Going straight to
    // the fleet default is the honest reading — inventing a third layer here
    // would be a setting with nowhere to be typed.
    const perm = pick(t(member?.permissionMode), '', t(launch.permissionMode));

    const out: DelegateRun = {
        engine,
        origin: {
            engine: engineOrigin, model: model.origin,
            effort: effort.origin, permissionMode: perm.origin
        }
    };
    if (model.value) { out.model = model.value; }
    if (effort.value) { out.effort = effort.value; }
    if (perm.value) { out.permissionMode = perm.value; }
    const wd = t(spec?.workdir);
    if (wd) { out.workDir = wd; }
    return out;
}

/** One line for the trace: what the delegate is running with and who said so.
 *  Empty when nothing was resolved at all — "the CLI decides everything" is the
 *  state this existed to describe and is not worth a row. */
export function describeDelegateRun(r: DelegateRun): string {
    const parts: string[] = [];
    const say = (label: string, value: string | undefined, from: DelegateOrigin) => {
        if (!value || from === 'cli') { return; }
        parts.push(label + ' ' + value + (from === 'member' ? '' : ' (' + from + ')'));
    };
    say('engine', r.engine !== 'claude' ? r.engine : '', r.origin.engine);
    say('model', r.model, r.origin.model);
    say('effort', r.effort, r.origin.effort);
    say('permissions', r.permissionMode, r.origin.permissionMode);
    return parts.join(' · ');
}
