/**
 * ‼️ X-121 (U-100) — WHAT THE ORCHESTRATOR ACTUALLY RUNS WITH, RESOLVED ONCE.
 *
 * The planner is not a worker and never climbed the worker ladder
 * (`resolveDelegateRun`): it is a headless `claude` spawned in the LEAD AGENT'S
 * folder with `agentFarm.taskExtraArgs` pasted onto its command line. Two
 * different pieces of code knew that — the launch built the command, and the
 * preview described it — and they did not agree:
 *
 *   · The launch put `taskExtraArgs` on the line and then appended its own
 *     `--model`. A user whose extra args carry `--model` got a command with the
 *     flag twice, and which one the CLI honours is a bet nobody in this repo
 *     had measured.
 *   · The preview read NOTHING. An empty `plannerModel` was reported as
 *     `origin: cli` — "nobody set it, the CLI decided" — while the extra args
 *     on that very command line, or the lead's own `.claude/settings.json`,
 *     were naming a model. U-100's requirement is the ACTUAL resolved value and
 *     its source; a hard-coded "CLI chooses" is neither.
 *
 * So there is one ladder here and both callers climb it:
 *
 *   1. THE MISSION said it (`plannerModel` / `plannerEffort`) — an explicit
 *      override, and the only rung a person typed for THIS run.
 *   2. `agentFarm.taskExtraArgs` carries the flag. It is on the command line,
 *      so it beats any file.
 *   3. THE SETTINGS LAYERS Claude Code itself reads in the lead's folder, in
 *      the CLI's own order (`permissionLayerPaths`). Model only — see below.
 *   4. Nothing. `cli` here means genuinely unknown: no flag, no file, the CLI's
 *      own built-in default, which this extension does not know and will not
 *      guess.
 *
 * ‼️ THE CONFLICT IS RESOLVED BY REMOVAL, NOT BY PRECEDENCE. When rung 1 and
 * rung 2 both name a dimension, the extra-args flag is STRIPPED from the string
 * that reaches the command line, so the flag appears exactly once and the
 * answer this module reports is the answer the CLI is given. Emitting both and
 * asserting which wins would be a claim about a program whose argument parser
 * we do not own — the kind of claim this item exists to delete.
 *
 * ‼️ EFFORT HAS NO SETTINGS LAYER, and saying so is part of the answer. Claude
 * Code's settings.json catalogues a `model` key and no effort key
 * (`claudesettings.ts` — the catalogue is read off the real file, not off
 * documentation). So effort resolves through rungs 1, 2 and 4 only. Inventing a
 * third rung for it would be a source that does not exist.
 *
 * ‼️ THE MANAGED LAYER IS READ AS A SOURCE, NOT AS A POLICY. It is in the list
 * so a model set there can be NAMED rather than reported as "nobody set it";
 * nothing here claims it outranks a `--model` on the command line, because that
 * precedence has not been measured. `permissions.disableBypassPermissionsMode`
 * is the one managed key this repo has measured, and it lives where it was
 * measured (`permissionmode.ts`).
 *
 * Pure: the caller supplies the layer TEXT, so this is testable and this file
 * knows nothing about vscode or disk.
 */

/** Which rung answered. The first two and the last are shared with the worker
 *  ladder's vocabulary; `extra-args` and `settings` exist only here, because
 *  only the orchestrator's command line has them. */
export type PlannerOrigin = 'mission' | 'extra-args' | 'settings' | 'cli';

/** One settings file as the CLI would read it. `text` absent = not on disk. */
export interface PlannerSettingsLayer {
    id: string;
    file: string;
    text?: string;
}

export interface PlannerDimension {
    value?: string;
    origin: PlannerOrigin;
    /** Where it was said: a file path, or the flag verbatim. Absent when the
     *  rung is its own explanation (`mission`) or said nothing (`cli`). */
    source?: string;
}

export interface PlannerLaunch {
    model: PlannerDimension;
    effort: PlannerDimension;
    /**
     * `taskExtraArgs` with every flag the mission overrode removed. This is the
     * string that goes on the command line — never the raw setting.
     */
    extraArgs: string;
    /**
     * The flags rung 1 displaced, verbatim. A conflict a person can be shown is
     * a conflict; one that is silently dropped is a bug report six months later.
     */
    displaced: string[];
}

/** The same bare-word guard the task launcher's `--effort` has: these strings
 *  live on disk and can be written by the bridge, so anything that is not one
 *  plain word is dropped to the CLI's own default rather than smuggled into a
 *  shell. */
const BARE = /^[\w.:-]+$/;

/**
 * Split a command-line string into tokens, honouring double and single quotes.
 * Not a shell — it does not expand anything. It exists so `--model "gpt 5"`
 * reads as one value rather than two tokens, and so a quoted value can be put
 * back together unchanged when a flag is removed.
 */
export function splitArgTokens(s: string): string[] {
    const out: string[] = [];
    let cur = '';
    let quote = '';
    let has = false;
    for (const ch of String(s ?? '')) {
        if (quote) {
            if (ch === quote) { quote = ''; } else { cur += ch; }
            continue;
        }
        if (ch === '"' || ch === '\'') { quote = ch; has = true; continue; }
        if (/\s/.test(ch)) {
            if (has || cur) { out.push(cur); cur = ''; has = false; }
            continue;
        }
        cur += ch;
        has = true;
    }
    if (has || cur) { out.push(cur); }
    return out;
}

/** A value read back out of an args string, and where in it, so the flag can be
 *  removed without touching anything else. */
interface FlagHit {
    value: string;
    /** token indices this flag occupies — one for `--x=y`, two for `--x y`. */
    span: number[];
    /** the flag as written, with its value — for the `displaced` report */
    text: string;
}

/** ‼️ THE LAST OCCURRENCE WINS, deliberately. Repeating a flag on one command
 *  line is the user's own doing and the CLI reads the line left to right; if we
 *  reported the first while the CLI took the last, the report would be wrong in
 *  exactly the case somebody is debugging. */
function readFlag(tokens: readonly string[], names: readonly string[]): FlagHit | undefined {
    let hit: FlagHit | undefined;
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        for (const name of names) {
            if (t === name) {
                const v = tokens[i + 1];
                // A flag with nothing after it names nothing — it is not a
                // source, and removing it would change a command we did not
                // understand. Left exactly as it is.
                if (v === undefined || v.startsWith('-')) { continue; }
                hit = { value: v, span: [i, i + 1], text: `${name} ${v}` };
            } else if (t.startsWith(name + '=')) {
                const v = t.slice(name.length + 1);
                if (v) { hit = { value: v, span: [i], text: t }; }
            }
        }
    }
    return hit;
}

/** Put the tokens back together, quoting only what has to be quoted — a value
 *  that arrived unquoted leaves unquoted, so the string a user typed survives
 *  a round trip it did not need. */
function joinTokens(tokens: readonly string[], drop: ReadonlySet<number>): string {
    return tokens
        .map((t, i) => (drop.has(i) ? undefined : (/\s/.test(t) ? `"${t}"` : t)))
        .filter((t): t is string => t !== undefined)
        .join(' ')
        .trim();
}

/** The `model` Claude Code's own settings say, from the FIRST layer that names
 *  one — the same "first layer wins, in the CLI's order" rule
 *  `resolveEffectivePermission` follows. */
function modelInLayers(
    layers: readonly PlannerSettingsLayer[]
): { value: string; file: string } | undefined {
    for (const layer of layers) {
        if (!layer.text?.trim()) { continue; }
        let json: unknown;
        try { json = JSON.parse(layer.text); } catch { continue; }
        if (!json || typeof json !== 'object' || Array.isArray(json)) { continue; }
        const m = (json as Record<string, unknown>)['model'];
        if (typeof m === 'string' && m.trim()) { return { value: m.trim(), file: layer.file }; }
    }
    return undefined;
}

/**
 * The one answer, for the preview and for the launch alike.
 *
 * ‼️ THE RESUME ROUND CLIMBS THE SAME LADDER. Every planning round after the
 * first is a `--resume` of the same session, and X-122 settled that the pair is
 * rebuilt identically on each one — so this function takes no "is this a
 * resume" flag, and that ABSENCE is the guarantee. A resolver that behaved
 * differently on a resume would reintroduce the drift between the first round
 * and the rest that X-122 closed.
 */
export function resolvePlannerLaunch(
    spec: { plannerModel?: string; plannerEffort?: string } | undefined,
    extraArgs: string,
    layers: readonly PlannerSettingsLayer[] = []
): PlannerLaunch {
    const tokens = splitArgTokens(extraArgs);
    const drop = new Set<number>();
    const displaced: string[] = [];

    const dimension = (
        fromMission: string,
        flagNames: readonly string[],
        fromSettings?: { value: string; file: string }
    ): PlannerDimension => {
        const flag = readFlag(tokens, flagNames);
        const mission = fromMission.trim();
        if (mission && BARE.test(mission)) {
            // Rung 1 wins, so rung 2's flag comes OFF the line rather than
            // riding along as a second copy of the same argument.
            if (flag) {
                flag.span.forEach(i => drop.add(i));
                displaced.push(flag.text);
            }
            return { value: mission, origin: 'mission' };
        }
        // A mission value that is not one bare word is dropped, exactly as the
        // command builder always dropped it — so the answer stays the answer
        // the CLI is actually given, and the ladder continues below it.
        if (flag && BARE.test(flag.value)) {
            return { value: flag.value, origin: 'extra-args', source: flag.text };
        }
        if (fromSettings) {
            return { value: fromSettings.value, origin: 'settings', source: fromSettings.file };
        }
        return { origin: 'cli' };
    };

    const model = dimension(String(spec?.plannerModel ?? ''), ['--model', '-m'], modelInLayers(layers));
    // ‼️ No settings rung — Claude Code's settings.json has no effort key.
    const effort = dimension(String(spec?.plannerEffort ?? ''), ['--effort']);

    return { model, effort, extraArgs: joinTokens(tokens, drop), displaced };
}

/**
 * The planner's command line — the ONE producer, so a fresh round, a resumed
 * round and the preview cannot describe three different commands.
 *
 * Everything that varies is an argument; nothing is read from anywhere. The
 * dimensions arrive already resolved and already deconflicted
 * (`resolvePlannerLaunch`), which is why this function has no ladder of its own
 * and no opinion about precedence.
 */
export function plannerCommand(parts: {
    launch: PlannerLaunch;
    disallowedTools: string;
    maxTurns: number;
    /** `--append-system-prompt-file`, first call only — a resume already has it
     *  in the conversation and repeating it pays for the same tokens per round. */
    contextFile?: string;
    resumeSessionId?: string;
}): string {
    const { launch } = parts;
    const extra = launch.extraArgs.trim();
    // ‼️ Only what rung 1 decided becomes a flag here. A value that came from
    // the extra args is ALREADY on the line inside `extra`, and a value that
    // came from a settings file must NOT become a flag at all: passing a file's
    // own value back on the command line is a second source of truth silently
    // overriding a file the user may edit by hand — the same carve-out the
    // worker ladder makes for Claude (`missionMode.ts`).
    const model = launch.model.origin === 'mission' && launch.model.value
        ? `--model ${launch.model.value} ` : '';
    const effort = launch.effort.origin === 'mission' && launch.effort.value
        ? `--effort ${launch.effort.value} ` : '';
    const ctx = parts.contextFile && !parts.contextFile.includes('"')
        ? `--append-system-prompt-file "${parts.contextFile}" ` : '';
    return `claude ${extra ? extra + ' ' : ''}${model}${effort}${ctx}`
        + `--disallowedTools "${parts.disallowedTools}" `
        + `--max-turns ${parts.maxTurns} `
        + `${parts.resumeSessionId ? `--resume ${parts.resumeSessionId} ` : ''}-p --output-format json`;
}

/** One line for a narrow surface: what the orchestrator runs with and who said
 *  so. Empty when every rung fell through — "the CLI decides everything" is a
 *  state, not a row. */
export function describePlannerLaunch(l: PlannerLaunch): string {
    const parts: string[] = [];
    const say = (label: string, d: PlannerDimension) => {
        if (!d.value || d.origin === 'cli') { return; }
        parts.push(label + ' ' + d.value + (d.origin === 'mission' ? '' : ` (${d.origin})`));
    };
    say('model', l.model);
    say('effort', l.effort);
    return parts.join(' · ');
}
