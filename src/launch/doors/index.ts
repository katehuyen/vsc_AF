/**
 * THE LAUNCH DOORS — every place a session can be started from, named. (X-151)
 *
 * ‼️ WHY THIS FOLDER EXISTS, IN ONE MEASUREMENT.
 *
 * `test/test_launch_parity.js` wrote its own reason down before this folder did:
 *
 *   "These live inside quickpick loops and message handlers in extension.ts,
 *    which nothing can call. THE SOURCE IS THE HANDLE, and a missing door here
 *    is the structural failure `_REF/agentfarm-dev.md` names."
 *
 * So door parity was measured by throwing regular expressions at 30.476 lines of
 * source, and a regular expression has exactly one blind spot — the one that
 * matters: it can see the absence of something it was told to look for, and it
 * cannot look for a rule nobody has written yet. `providerId` and `tier` reached
 * the type and the launcher and never got a box in the Console composer, and
 * nothing went red, because nothing was counting.
 *
 * ‼️ WHAT A DOOR IS, AND WHAT IT DELIBERATELY IS NOT.
 *
 * A door ANSWERS THE QUESTION "what session is about to start". It does not
 * start it. `collect(ctx)` returns the intent the door has assembled — the same
 * object its call site was already building — and the spawning, the recording
 * and the UI plumbing stay exactly where they are.
 *
 * That is the whole design, and it is deliberate: this is a live product with
 * real users, and the hardening is worth nothing if it breaks the thing it is
 * hardening. Extracting the ANSWER makes every door callable with a fixture,
 * which is all the 208-cell matrix ever needed; extracting the ACT would have
 * moved seven spawn paths at once for no extra measurement.
 *
 * ‼️ SO A DOOR MODULE NEVER REIMPLEMENTS ANYTHING. Everything it needs arrives
 * in `ctx` as a function the extension already owns — `seed` is the S-34 layer
 * (`seedLastLaunch`), `engineSeed` is X-145's per-engine resolve. A door that
 * computed its own defaults would be the eleventh copy of the rule, which is
 * the failure this whole family is named after.
 */
import { LaunchOptions } from '../../core/launch';
import { LaunchIntent } from '../../core/launchDimensions';

/** What a door is handed. Every function on it is the extension's own. */
export interface LaunchDoorCtx {
    /** whose session it is, where the door knows */
    agentId?: string;
    /** the engine this door has settled on, where it settles one */
    engine?: string;
    /** the project the session is being started under, where there is one */
    project?: string;
    /**
     * ‼️ S-34 — THE REMEMBERED SETUP, AS A LAYER. Never read
     * `agentfarm.lastLaunch` directly; this is `seedLastLaunch`.
     */
    seed: (agentId: string, o?: LaunchOptions) => LaunchOptions;
    /** ‼️ X-145 — this agent's per-engine default, resolved from Settings. */
    engineSeed?: (agentId: string, engine: string) => LaunchOptions;
    /** what the person actually answered at this door, where it asks. */
    picked?: LaunchIntent;
    /**
     * ‼️ X-169 — WHICH SIGN-IN THIS ENGINE IS ON, and it is a function for the
     * same reason `seed` is one: the rule belongs to
     * `accountStore.resolveAccount` and a door that wrote it out would be the
     * fourteenth copy of it.
     *
     * It answers `stated ?? this agent's standing sign-in (X-255) ?? the
     * engine's active account ?? nothing`, so a door with no picker still hands
     * on the account its session will really run under.
     */
    accountFor?: (engine: string | undefined, stated?: string, agentId?: string) => string;
}

export interface LaunchDoor {
    id: string;
    label: string;
    /** what this door produces */
    surface: 'console' | 'terminal' | 'either' | 'task' | 'headless';
    /**
     * ‼️ TRUE WHEN THE EXTENSION REALLY CALLS THIS DOOR, AND THE DISTINCTION IS
     * THE POINT OF HAVING IT.
     *
     * A door module that merely DESCRIBES what a call site does is a second
     * statement of the same rule, free to drift from it — which is the failure
     * this whole family is named after, arriving one level up. So a door is
     * either driving the code (`wired: true`, and the matrix is then measuring
     * the real thing) or it is a model of code somebody still has to move over,
     * and it is COUNTED as such. The count may only rise.
     */
    wired?: boolean;
    /** one line: why this is a door, and what forgetting it costs */
    why: string;
    /**
     * ‼️ THE DIMENSIONS THIS DOOR DELIBERATELY DOES NOT CARRY, EACH WITH ITS
     * REASON — the same mechanism the bridge parity gate proved works. An
     * exemption is somebody's stated judgement; a dimension merely missing is a
     * GAP, and the matrix counts those separately and lets the count only fall.
     */
    exempt?: Record<string, string>;
    /** The intent this door has assembled. Never spawns. */
    collect(ctx: LaunchDoorCtx): LaunchIntent;
}

/**
 * ‼️ THE CLASS-LEVEL EXEMPTION, STATED ONCE INSTEAD OF THIRTY-NINE TIMES.
 *
 * Three dimensions carry `owner: 'farm'` in `media/afDimensions.js`: `permission`
 * (K-22 — what a permission mode actually MEANS, resolved against Claude's own
 * settings layers), `projectContextFile` (the project brief, written to a file
 * at spawn) and `cwd` (the folder, which only Antigravity needs told). None of
 * them is a question anybody is asked at a door — they are resolved centrally on
 * the way to the process, from answers the door DID collect. A door that
 * "carried" them would be a door that had resolved them early, which is the one
 * thing that must not happen twice.
 */
export const FARM_RESOLVED: Record<string, string> = {
    permission: 'owner:farm - K-22 resolves the permission MODE into what it means '
        + 'against Claude\'s own settings layers, on the way to the process. A door that '
        + 'resolved it would be resolving it twice, from a worse vantage point.',
    projectContextFile: 'owner:farm - the project brief is written to a file at spawn '
        + '(projectContext.ts) out of the projectId the door did collect. Multi-line text '
        + 'does not survive a shell, which is why it is a path and not an answer.',
    cwd: 'owner:farm - only Antigravity needs told (measured: it reports the cwd back and '
        + 'then works in its own scratch dir), and the spawner is what knows the folder.'
};

/**
 * ‼️ WHAT A DOOR LETS THROUGH, WRITTEN AS THE LIST IT REALLY FORWARDS.
 *
 * Several doors do not hand the whole setup on — they name four or five fields
 * into a `ConsolePanel.show({ launch: … })` or a `consoleTaskStart({ … })`. That
 * is not a style; it is the defect this family is named after, because a
 * dimension added to the type reaches such a door and stops there in silence.
 * So those doors `pick` exactly what they really forward, and the matrix reports
 * the rest as gaps rather than being told they are fine.
 */
export function pick(o: LaunchOptions, keys: readonly string[]): LaunchIntent {
    const out: Record<string, unknown> = {};
    const src = o as unknown as Record<string, unknown>;
    for (const k of keys) { if (src[k] !== undefined) { out[k] = src[k]; } }
    return out as LaunchIntent;
}

/**
 * ‼️ X-169 — THE ACCOUNT, PUT ON A DOOR'S ANSWER RATHER THAN LEFT TO THE SPAWN.
 *
 * The dimension is NOT remembered (an account is a state, not a preference), so
 * the S-34 layer cannot carry it the way it carries the model — and a door that
 * simply said nothing would leave "which account is this?" to be answered
 * behind its back, minutes later, by whatever `agentFarm.activeAccounts` says
 * at spawn time. That is the shape of every defect this folder is named after:
 * the surface shows one thing and the process runs on another.
 *
 * So every door resolves it HERE, through the extension's own resolver, and
 * hands it on as a settled answer. Two consequences worth stating:
 *
 *   · **A stated account still wins** — `resolveAccount` puts it first, so a
 *     picker at the door (the launcher, the composer, a task form, the bridge's
 *     arguments) overrules the standing one exactly as it should.
 *   · **Empty means nothing was settled**, and the key is left OFF rather than
 *     written as `''`. An empty string travelling as an answer would reach
 *     `resolveAccount` again at the spawn and be re-resolved anyway — but every
 *     surface in between would show a door that had answered "the main account"
 *     when it had answered nothing at all.
 */
export function withAccount(ctx: LaunchDoorCtx, o: LaunchIntent): LaunchIntent {
    if (!ctx.accountFor) { return o; }
    const src = o as Record<string, unknown>;
    // ‼️ X-255 — THE AGENT TRAVELS WITH THE QUESTION. The per-agent standing
    // sign-in is a rung of the one resolution, so a door that asked without
    // saying whose session it is would resolve to the machine-wide answer and
    // then show it — the "surface says one thing, process runs another" defect
    // this whole folder is named after, arriving through the newest rung.
    const id = ctx.accountFor(
        (src.engine as string | undefined) ?? ctx.engine,
        src.account as string | undefined,
        (src.agentId as string | undefined) ?? ctx.agentId);
    return id ? { ...o, account: id } as LaunchIntent : o;
}

const REGISTRY: LaunchDoor[] = [];

/**
 * ‼️ REGISTERING TWICE IS AN ERROR, NOT A MERGE. Two doors under one id is two
 * places answering for one surface, which is the exact shape of the defect this
 * folder exists to end.
 */
export function registerDoor(d: LaunchDoor): void {
    if (REGISTRY.some(x => x.id === d.id)) {
        throw new Error(`launch door "${d.id}" is already registered`);
    }
    REGISTRY.push(d);
}

/** Every door, in registration order. */
export const launchDoors = (): LaunchDoor[] => REGISTRY.slice();
/** One door by id. */
export const launchDoor = (id: string): LaunchDoor | undefined => REGISTRY.find(d => d.id === id);
/** Every reason this door does not carry a dimension — its own, plus the class. */
export const doorExemptions = (d: LaunchDoor): Record<string, string> =>
    ({ ...FARM_RESOLVED, ...(d.exempt ?? {}) });
