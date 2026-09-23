/**
 * Session launch — the vocabulary and the command line of "start a session".
 *
 * Until now every interactive session started as a bare `claude`: model,
 * effort, permission mode, name and first prompt were things the user typed
 * into the terminal by hand, every time. This module owns the vocabulary
 * (which flags exist, what they mean) and turns a set of choices into the
 * exact command line — so the launcher picker, the plain Start/Continue/Resume
 * commands and the bridge op all build the same string, and the tests can
 * check it without VS Code.
 *
 * Everything here is pure. Flags are only emitted for choices that were
 * actually made: an empty field means "no flag", i.e. the CLI's / the agent's
 * own default stays in charge.
 */

import { AGY_MODES_REFUSED, agyModeRefusal } from './agy';
import { engineFirstPromptFlag, engineOf, EngineId, ENGINES, tuiArgs } from './consoleEngine';
import { EffectivePermission, permissionFlags } from './permissionmode';
// ‼️ X-150 — the 16 launch dimensions are DATA (`media/afDimensions.js`), and the
// three places below that used to count them by hand fold over that list now.
import { LaunchIntent, launchDimensionsWhere, rememberIntent, seedIntent } from './launchDimensions';

/** One offered value of a launch dimension. `id: ''` is always "leave it alone". */
export interface LaunchChoice {
    id: string;
    label: string;
    detail: string;
}

export interface LaunchOptions {
    /**
     * ‼️ WHICH ENGINE (X-18). Absent means `claude` — what every caller written
     * before engines existed means, and what this whole module was built around.
     * It is a dimension like the model, not a different launcher: one set of
     * choices, one command builder, so a surface cannot offer a session on an
     * engine it then fails to start.
     */
    engine?: EngineId;
    /**
     * ‼️ X-169 — WHICH SIGN-IN OF THAT ENGINE RUNS IT, by slot id
     * (`agentFarm.accounts`). Empty or absent means the main account: the
     * identity that is signed in on this machine right now, which is what every
     * launch made before this said and must keep meaning. NOTHING IS INJECTED
     * for it — the absence of the variable IS the main account, and naming the
     * default explicitly would put a config-dir override into every session
     * Agent Farm starts that no session carried before.
     *
     * ‼️ IT IS NOT REMEMBERED, unlike the model or the effort, and that is a
     * decision rather than an omission. Those are preferences; an account is a
     * STATE — how much of a plan is left, which changes hourly. Remembered per
     * agent it would pin an agent to an exhausted plan and, through the S-34
     * layer order, would silently outrank the "use this next" gesture on the
     * Engines page: the user would press a button that does nothing visible.
     * One place holds it (`agentFarm.activeAccounts`, per engine), one gesture
     * moves it, and `accountStore.resolveAccount` is the only order there is.
     *
     * ‼️ AN ID THAT NAMES NOTHING IS REFUSED, NOT IGNORED
     * (`accountStore.accountRefusal`): falling back to the main account for a
     * slot that was forgotten would start the session on whichever identity
     * happens to be signed in, which is the exact accident this family exists
     * to end. The command builders never emit it — like `cli` it decides the
     * process's ENVIRONMENT, not its command line.
     */
    account?: string;
    /**
     * ‼️ X-103 — WHICH PROVIDER THIS RUN IS ON, and it sits here rather than
     * beside the model because it decides what the model row MEANS.
     *
     * On Claude it is the id of a stored route profile: an environment isolation
     * with a credential behind it, fixed for the session. On OpenCode it is the
     * engine's own provider id, which the engine may legitimately change at a
     * turn boundary. Absent is a real answer on both and the important one:
     * NOTHING IS INJECTED AND NOTHING IS CLEARED, so the child inherits whatever
     * this window carries — which is what every launch made before X-101 did.
     *
     * ‼️ NOT DERIVED FROM `model`. `opencode/big-pickle` looks like it names its
     * own provider and splitting on the slash would agree most of the time,
     * which is exactly what makes it the wrong rule — see `providerRegistry.ts`.
     */
    providerId?: string;
    /**
     * ‼️ CLAUDE ONLY — which tier of that route, and a different question from
     * `model`. `opus` is `kimi-k2-thinking` on one route and `MiniMax-M2` on
     * another, so folding it into the model would make one word mean different
     * things depending on which route happened to be selected.
     */
    tier?: string;
    /**
     * The reasoning variant, only where the engine publishes one FOR THE CHOSEN
     * MODEL — measured per model, not per engine: of the six models this
     * machine's OpenCode offers, some carry `"variants": {}` and some carry
     * low/medium/high.
     */
    variant?: string;
    /** --model (alias or full id); '' = the agent's / CLI's own default */
    model?: string;
    /** --effort: low | medium | high | xhigh | max; '' = default */
    effort?: string;
    /** --permission-mode; '' = default (ask) */
    permissionMode?: string;
    /**
     * ‼️ K-34 — DOES THIS SESSION WORK TO THE SUPERPOWERS DISCIPLINE.
     *
     * X-133 gave the Console composer a ⚡ chip and M-30 gave the task forms a
     * box; a TERMINAL launch had neither, so the same agent worked one way in
     * the panel and another way in a terminal — decided by a setting the person
     * starting it could not see, let alone change. It is a dimension like the
     * model: one set of choices, carried by every surface that starts a
     * session, or a surface offers a session it then starts differently.
     *
     * ‼️ THREE STATES, AND ABSENT IS ONE OF THEM — `undefined` means "the
     * agent's own default decides" (`agentFarm.superpowersDefaults`), which is
     * what every launch made before this said and must keep meaning. It is NOT
     * in `LaunchDefaults` beside the four above, deliberately: this dimension
     * ALREADY has a user-level default, per agent, and a second one would give
     * two settings the same job and no rule for which wins.
     */
    superpowers?: boolean;
    /**
     * ‼️ K-22 — WHAT THAT PERMISSION MODE ACTUALLY MEANS, resolved against
     * Claude's own settings layers before the command line is built.
     *
     * The Console has done this since 3.135.1; a TERMINAL launch never did, and
     * that is the half of the contract that was still broken. Two things went
     * wrong without it:
     *
     *   · **`--permission-mode bypassPermissions` does not enforce bypass.** It
     *     is read through a branch the CLI guards, and `gad()` can downgrade it
     *     to `default` when `bypassPermissionsModeAccepted` was never set. The
     *     flag that enforces is `--dangerously-skip-permissions`, which short-
     *     circuits at the top — measured out of the binary for K-22, and the
     *     reason `permissionFlags` exists rather than a string built here.
     *   · **`Default` was never resolved at all.** A user whose own settings say
     *     `permissions.defaultMode: bypassPermissions` got an asking session,
     *     and the first `rm -f` parked the whole terminal on a `[y/n]` nobody
     *     was watching.
     *
     * Absent means "nobody resolved it", and then the old spelling is emitted
     * exactly as before — so every caller and test written before this keeps
     * its command line to the character.
     */
    permission?: EffectivePermission;
    /** -n: display name shown in the prompt box, the /resume picker and the terminal title */
    name?: string;
    /** first prompt, passed as the positional argument */
    prompt?: string;
    /** --resume <id> */
    resume?: string;
    /** --continue (mutually exclusive with resume) */
    continueLast?: boolean;
    /**
     * ‼️ X-109 — `providerId`/`tier` ARE THE RESUME GATE'S ANSWER: take them as
     * they are, an empty providerId included, and neither fill them from the
     * agent's record nor ask the gate again. Per-launch like `resume` itself —
     * never remembered, never inherited — because it is a fact about ONE
     * conversation's route, not a setup anybody chose.
     */
    routePinned?: boolean;
    /**
     * --append-system-prompt-file <path>: the project this session belongs to,
     * told to the agent before the user types anything (see projectContext.ts).
     *
     * A FILE and not inline text, measured: this command line is handed to a
     * shell, and multi-line text does not survive that on any platform. The
     * path is quoted here for the same reason a name is.
     */
    projectContextFile?: string;
    /**
     * ‼️ THE FOLDER, WHICH ON ONE ENGINE IS NOT OPTIONAL.
     *
     * Claude Code and Codex work in the process's own directory and the terminal
     * already sets it. Antigravity does NOT: measured, it reports the cwd back
     * and then works in `~/.gemini/antigravity-cli/scratch` unless the folder is
     * handed to it with `--add-dir`. Left out, a terminal session on that engine
     * opens in the right place and answers about the wrong one.
     */
    cwd?: string;
    /**
     * ‼️ THE OTHER EXECUTOR (M-22) — a named `agentFarm.cliProfiles` entry.
     *
     * It is the one field here that is NOT a flag, and it is here anyway
     * because it is the only thing `engine` can contradict. A CLI profile does
     * not add arguments to an engine's command line, it REPLACES the whole
     * line (`tasks.ts` — `const command = profile ? …`, on the headless path
     * and the terminal one alike), so a run carrying both does not blend them:
     * the profile runs and the engine is dropped without a word. That is the
     * contradiction `validateLaunch` refuses, and it can only refuse a pair it
     * can see. The command builders below never emit it (test_launch.js holds
     * them to that) — it decides WHICH program runs, not how it is called.
     */
    cli?: string;
}

/**
 * ‼️ M-22 — ONE SENTENCE, READ BY BOTH DOORS. The bridge refused this pair and
 * the page refused it in different words, which is how two surfaces start
 * describing the same rule differently and one of them eventually stops
 * applying it.
 *
 * ‼️ NO BACKTICKS, deliberately. The page shows this verbatim in the composer's
 * message strip (`media/tasksPage.js` — escaped into `.ntmsg`), so markup meant
 * for an agent reading a bridge error would sit there as literal punctuation.
 * The two field names are the same word on both doors — `engine` and `cli` are
 * the args AND the form's rows — so naming them plainly serves both readers.
 */
export const ONE_EXECUTOR =
    'A run has ONE executor: an engine, or a CLI profile — never both. '
    + 'An engine is a machine Agent Farm understands and can build a command line for; '
    + 'a CLI profile (cli, from agentFarm.cliProfiles) is a template for a binary it knows '
    + 'nothing about, and it replaces that command line entirely — so with both set the '
    + 'profile runs and the engine is silently ignored. Clear one of them.';

/**
 * ‼️ M-14 — IS THIS A MODEL ID WE MAY PUT ON A COMMAND LINE?
 *
 * A charset guard, not a catalogue: the model reaches `--model ${m}` inside a
 * command STRING (`tasks.ts` — `modelArgs`), so a stored value must never be
 * able to smuggle shell syntax. It is not asking whether the model exists —
 * that is the engine's answer, and a farm that hardcoded the list would refuse
 * every model released after it.
 *
 * ‼️ `/` IS PART OF THE CHARSET, and leaving it out was a real refusal: every
 * engine except Claude names a model `provider/model`, so `schedules.add`
 * answered "model must be a model id/alias (e.g. opus, sonnet, haiku)" to
 * `opencode/nemotron-3.5-lightning-free` — a schedule simply could not be given
 * an OpenCode model. Measured by installing one. A slash is not syntax in
 * PowerShell, cmd or a POSIX shell; it is an ordinary character in an ordinary
 * token, which is exactly why it was safe to have been keeping out by accident.
 */
export function modelIdOk(m: unknown): boolean {
    return /^[\w./:-]+$/.test(String(m ?? ''));
}

/** ‼️ The refusal names BOTH shapes, because the old one named only Claude's
 *  aliases and that is precisely the reader who then believes an engine model
 *  is unsupported rather than mistyped. */
export const MODEL_ID_REFUSAL =
    'model must be a model id or alias — a bare name like opus / sonnet / haiku, '
    + 'or an engine model like opencode/nemotron-3.5-lightning-free. '
    + 'Letters, digits, dot, colon, slash and hyphen only: it goes on a command line.';

/**
 * Do these two say different things about which program runs?
 *
 * The condition lives here once so the panel, the bridge ops and
 * `validateLaunch` cannot drift apart on what counts as a conflict. `claude`
 * is deliberately NOT one: an absent engine already means claude, so naming it
 * beside a profile states nothing the profile does not already override.
 */
export function twoExecutors(cli: unknown, engine: unknown): boolean {
    const e = String(engine ?? '').trim().toLowerCase();
    return !!String(cli ?? '').trim() && !!e && e !== 'claude';
}

/** The three dimensions the launcher offers. Kept verbatim from `claude --help`
 *  so a picker never offers a flag value the installed CLI would reject. */
export const EFFORT_CHOICES: LaunchChoice[] = [
    { id: '', label: 'Default', detail: 'no --effort flag — the CLI decides' },
    { id: 'low', label: 'low', detail: 'shortest reasoning — cheap, for mechanical work' },
    { id: 'medium', label: 'medium', detail: 'balanced' },
    { id: 'high', label: 'high', detail: 'more reasoning per turn' },
    { id: 'xhigh', label: 'xhigh', detail: 'deep reasoning — slower, pricier' },
    { id: 'max', label: 'max', detail: 'maximum reasoning — the expensive end' }
];

export const PERMISSION_CHOICES: LaunchChoice[] = [
    // ‼️ K-22 — "Default" IS NOT "asks". It means "whatever your own Claude
    // settings say", and when those say bypassPermissions this launch really is
    // a bypass launch. The row used to promise asking, which is how a user with
    // bypass in their settings could believe a terminal would stop for them.
    { id: '', label: 'Default', detail: 'no --permission-mode flag — whatever your Claude settings say (which may be bypass)' },
    { id: 'plan', label: 'plan', detail: 'plans only, changes nothing until you approve' },
    { id: 'acceptEdits', label: 'acceptEdits', detail: 'file edits auto-approved, everything else still asks' },
    { id: 'auto', label: 'auto', detail: 'the CLI decides what is safe to run unattended' },
    { id: 'manual', label: 'manual', detail: 'asks for every action' },
    { id: 'dontAsk', label: 'dontAsk', detail: 'stops instead of asking when it would need permission' },
    { id: 'bypassPermissions', label: '⚠ bypassPermissions', detail: 'EVERY action auto-approved — no prompts at all' }
];

/**
 * ‼️ S-60 — THE ROWS AN ENGINE CAN KEEP. `PERMISSION_CHOICES` is Claude's
 * vocabulary, and every picker offered all seven rows on every engine with a
 * note beside them saying which ones meant something else here. A row whose
 * meaning is "ask me" on an engine that has no way to ask is not a row with a
 * caveat, it is a promise the box cannot keep — so it is not drawn, and it is
 * refused by name at every door (`validateLaunch`, the bridge's run
 * dimensions). The rule is the engine's own (`core/agy.ts`); this is the one
 * place that turns it into rows, so the pages and the doors cannot disagree.
 * An engine with no rule of its own gets the whole list, exactly as before.
 */
export function permissionChoicesFor(engine: string | undefined): LaunchChoice[] {
    if (engineOf(engine).id !== 'agy') { return PERMISSION_CHOICES; }
    return PERMISSION_CHOICES
        .filter(c => !(AGY_MODES_REFUSED as readonly string[]).includes(c.id))
        .map(c => c.id === 'plan'
            ? { ...c, detail: 'asked to plan (--mode plan) — steering, not a restraint: measured, it still wrote a file' }
            : c.id === '' ? { ...c, detail: 'no flag — whatever the Antigravity app\'s own tool-permission setting allows' }
                : c);
}

/** The refusal for a mode this engine cannot keep, or '' — the door's sentence. */
export function permissionRefusalFor(engine: string | undefined, mode: string | undefined): string {
    return engineOf(engine).id === 'agy' ? agyModeRefusal(mode) : '';
}

/**
 * The engines whose rows DIFFER from the one list, for a page that draws a
 * picker beside an engine box: `permissionsByEngine[engine] || permissions`.
 * Built off `permissionChoicesFor`, so a page and a door read one rule.
 */
export function permissionChoicesByEngine(): Record<string, LaunchChoice[]> {
    const out: Record<string, LaunchChoice[]> = {};
    for (const id of Object.keys(ENGINES)) {
        const rows = permissionChoicesFor(id);
        if (rows !== PERMISSION_CHOICES) { out[id] = rows; }
    }
    return out;
}

/** Model list = the user's own `agentFarm.modelAliases` knowledge base, with
 *  "Default" in front. One list, kept current in one place (Farm Settings),
 *  shows up in every picker — including this one. */
export function modelChoices(aliases: string[]): LaunchChoice[] {
    return [
        { id: '', label: 'Default', detail: "the agent's own model setting / the CLI default" },
        ...aliases.filter(a => typeof a === 'string' && a.trim())
            .map(a => ({ id: a.trim(), label: a.trim(), detail: 'passed as --model' }))
    ];
}

/**
 * Make a free-text value safe to sit inside the double quotes of a command
 * line that may be read by PowerShell, cmd.exe or a POSIX shell — the three
 * shells an integrated or external terminal can be running.
 *
 * `"` would close the quoting (→ ') and a backtick is PowerShell's escape
 * character (→ dropped); newlines would submit the line early (→ spaces).
 * `$` / `%` are LEFT ALONE on purpose: mangling the user's own text silently
 * is worse than a shell expanding a variable, and the launcher prints the
 * exact command line before it runs anything, so what will happen is visible.
 */
export function quoteArg(s: string): string {
    return '"' + String(s ?? '').replace(/"/g, "'").replace(/`/g, '').replace(/\s+/g, ' ').trim() + '"';
}

/**
 * The interactive line for an engine that is NOT Claude Code.
 *
 * ‼️ TWO OF CLAUDE'S DIMENSIONS HAVE NO EQUIVALENT ON EITHER OF THEM, AND THEY
 * ARE DROPPED LOUDLY RATHER THAN QUIETLY:
 *   · `-n` (session display name) — these engines name their own sessions;
 *   · `--append-system-prompt-file` — neither has a system-prompt channel (see
 *     CODEX_HAS_NO_SYSTEM_PROMPT_FLAG / AGY_HAS_NO_SYSTEM_PROMPT_FLAG), so a
 *     project brief cannot ride the command line at all and the caller has to
 *     put it in the prompt.
 *
 * ‼️ AND THE THIRD ONE — RESUME — DEPENDS ON WHICH ENGINE IT IS, which is the
 * measurement that stopped this from being one rule. `codex resume <id>` is its
 * own subcommand with its own flag vocabulary and nobody here has measured it,
 * so a Codex resume goes through the Console. `agy --conversation <id>` is an
 * ordinary flag on the ordinary command, measured to come back with the same id
 * and the context carried — so on that engine a terminal resume is real, and
 * refusing it "because it is not Claude" would have been a rule pretending to be
 * a fact (see EngineTransport.resumeInTerminal).
 *
 * `describeLaunch` names the engine so a picker cannot claim otherwise.
 */
function buildOtherEngineCommand(exe: string, engine: EngineId, o: LaunchOptions): string {
    const spec = ENGINES[engine];
    const parts = [exe || spec.exe, ...tuiArgs(engine, {
        model: o.model, effort: o.effort, permissionMode: o.permissionMode,
        // Only the engine that needs it is given it — `codexTuiArgs` uses `-C`
        // for the same job and the terminal already sets the directory there.
        ...(engine === 'agy' ? { cwd: o.cwd } : {}),
        ...(spec.resumeInTerminal
            ? { conversation: o.resume, continueLast: o.continueLast }
            : {})
    })];
    if (o.prompt?.trim()) {
        // ‼️ THE FIRST PROMPT IS A FLAG ON TWO OF THEM AND A POSITIONAL ON THE
        // THIRD, and the difference is not cosmetic — it is whether the person
        // ends up in a conversation or watching one answer and exit. Which is
        // which lives in `engineFirstPromptFlag`, with the measurement.
        parts.push(...engineFirstPromptFlag(engine), quoteArg(o.prompt));
    }
    return parts.join(' ');
}

/** Build the command line for a launch. `exe` lets a caller reuse it for a
 *  wrapper; everything else follows `claude --help` exactly — or, on another
 *  engine, that engine's own measured help (see buildCodexCommand). */
export function buildLaunchCommand(exe: string, o: LaunchOptions = {}): string {
    const spec = engineOf(o.engine);
    if (spec.id !== 'claude') {
        return buildOtherEngineCommand(exe && exe !== 'claude' ? exe : spec.exe, spec.id, o);
    }
    const parts = [exe || 'claude'];
    // Resume/continue first — they say WHICH conversation; the rest tunes it.
    if (o.resume) { parts.push('--resume', o.resume); }
    else if (o.continueLast) { parts.push('--continue'); }
    if (o.model?.trim()) { parts.push('--model', o.model.trim()); }
    if (o.effort?.trim()) { parts.push('--effort', o.effort.trim()); }
    // ‼️ K-22 — ONE PLACE DECIDES HOW BYPASS IS SPELLED, and it is
    // `permissionFlags`, shared with the Console. A terminal launch that spelled
    // it its own way is how "the card says bypass and the process asks" came
    // back on the CLI side after the Console half was fixed.
    //
    // Only the bypass case changes shape. Every other mode keeps the command
    // line it has always had, to the character: this item is about bypass being
    // REAL, and widening it into "every terminal launch gains a flag" would be
    // a change nobody asked for on a surface people use all day.
    if (o.permission?.bypass) {
        parts.push(...permissionFlags(o.permission).launch);
    } else if (o.permission?.blocked) {
        // ‼️ BYPASS WAS WANTED AND A POLICY FORBIDS IT. Emitting
        // `--permission-mode bypassPermissions` here would produce exactly the
        // state the item rejects — a session labelled bypass that then asks.
        // The flag is left off and `validateLaunch` refuses the launch outright.
    } else if (o.permissionMode?.trim()) {
        parts.push('--permission-mode', o.permissionMode.trim());
    }
    // The project context rides on EVERY launch, resumes included — the flag
    // does not survive --resume (measured; see consoleproto.hostArgs). Quoted
    // with plain quotes rather than quoteArg: quoteArg collapses whitespace,
    // which is right for a name typed by a person and wrong for a path.
    if (o.projectContextFile?.trim() && !o.projectContextFile.includes('"')) {
        parts.push('--append-system-prompt-file', `"${o.projectContextFile.trim()}"`);
    }
    if (o.name?.trim()) { parts.push('-n', quoteArg(o.name)); }
    // The first prompt is the positional argument and must stay last.
    if (o.prompt?.trim()) { parts.push(quoteArg(o.prompt)); }
    return parts.join(' ');
}

/**
 * ‼️ S-34 — WHAT IS ABOUT TO START, ON THE ROW THAT STARTS IT.
 *
 * `describeLaunch` below names what was CHANGED — it drops the engine when it
 * is Claude and the model when nothing was typed, because it was written for a
 * toast that says what a launch is unusual about. On the Start row that rule is
 * exactly backwards: the reader is not comparing this launch against a default,
 * they are checking the one they are about to press, and the two facts that
 * decide what a session IS — which program and which model — were the two the
 * line left out. It read `effort high · auto · superpowers on`.
 *
 * So this one is a SETUP line and it always answers, in the order a person
 * reads it: **engine · model · effort · permissions · discipline · project.**
 *
 * ‼️ IT SAYS THE RESOLVED ANSWER, NOT THE WORD "DEFAULT". `superpowers` is a
 * tri-state on the options and a plain yes/no in the session that runs, so the
 * caller passes what it resolved to — a row reading "agent default" makes the
 * reader open a second screen to find out what will happen, which is the thing
 * a summary exists to prevent.
 *
 * ‼️ AND IT IS SHORT ON PURPOSE. A quickpick row truncates: the effort is the
 * bare word (it is unmistakable after a model), the discipline is `⚡on`/`⚡off`
 * rather than the sentence, and a field nobody stated is left out rather than
 * spending a column on "default" — except the model, which is named either way
 * because "which model" is never a detail.
 */
export function launchSummary(o: LaunchOptions, facts: {
    /** The discipline as it will actually be, agent default already resolved. */
    superpowers?: boolean;
    /** The project's display name (icon included), '' / absent for none. */
    project?: string;
    /**
     * ‼️ X-103 — THE ROUTE'S LABEL, resolved by the caller because only a
     * surface holding the catalog can turn a profile id into the name a person
     * recognises. Absent falls back to the id, which is still the truth; the one
     * thing this must never do is print nothing while a route is set.
     */
    provider?: string;
} = {}): string {
    const bits: string[] = [engineOf(o.engine).label];
    // ‼️ IT SITS BESIDE THE ENGINE, NOT NEAR THE MODEL. Two sessions on "Claude
    // Code · opus" that ran on different routes are two different programs, and
    // a summary that made them read identically is exactly the confusion X-101
    // was written to end. Named only when one is set: absent means nothing is
    // injected, and spending a column on "no route" on every launch would be the
    // answer nobody chose.
    const route = facts.provider?.trim() || o.providerId?.trim();
    if (route) { bits.push(o.tier?.trim() ? `${route} (${o.tier.trim()})` : route); }
    bits.push(o.model?.trim() || 'default model');
    if (o.variant?.trim()) { bits.push(o.variant.trim()); }
    if (o.effort?.trim()) { bits.push(o.effort.trim()); }
    if (o.permissionMode?.trim()) { bits.push(o.permissionMode.trim()); }
    const sp = facts.superpowers ?? o.superpowers;
    if (sp !== undefined) { bits.push(sp ? '⚡on' : '⚡off'); }
    bits.push(facts.project?.trim() ? facts.project.trim() : 'no project');
    return bits.join(' · ');
}

/** One-line summary of what is set, for a picker row / a toast. */
export function describeLaunch(o: LaunchOptions): string {
    const bits: string[] = [];
    // The engine leads, and only when it is not the default: a line that says
    // "Codex · opus" would be nonsense, and one that says "Claude Code" on every
    // launch spends a column on the answer nobody asked for.
    const spec = engineOf(o.engine);
    if (spec.id !== 'claude') { bits.push(spec.label); }
    // ‼️ X-103 — the route, by the same rule as the engine: named only when it
    // is an answer. A setup line that dropped it would describe two launches on
    // two different endpoints with one identical sentence.
    if (o.providerId?.trim()) {
        bits.push(o.tier?.trim() ? `${o.providerId.trim()} (${o.tier.trim()})` : o.providerId.trim());
    }
    if (o.model?.trim()) { bits.push(o.model.trim()); }
    if (o.variant?.trim()) { bits.push('variant ' + o.variant.trim()); }
    if (o.effort?.trim()) { bits.push('effort ' + o.effort.trim()); }
    if (o.permissionMode?.trim()) { bits.push(o.permissionMode.trim()); }
    // ‼️ K-34 — NAMED ONLY WHEN IT IS AN ANSWER. Absent means "the agent's own
    // default decides", and printing that on every line would spend a column on
    // the answer nobody chose — the same rule the engine follows above.
    if (o.superpowers !== undefined) {
        bits.push(o.superpowers ? 'superpowers on' : 'superpowers off');
    }
    if (o.name?.trim()) { bits.push(`“${o.name.trim()}”`); }
    if (o.prompt?.trim()) { bits.push('with a first prompt'); }
    return bits.length ? bits.join(' · ') : 'CLI defaults';
}

/**
 * ‼️ WHERE A LAUNCH RUNS — a dimension of the launch, not of the command line.
 *
 * It is declared here rather than inside `activate()` because it is part of a
 * saved SETUP (see `LaunchProfile.surface`): a profile that stored the engine,
 * the model and the permissions but not whether the session opens in the
 * Console or in a terminal reproduced everything about a launch except the
 * window it happens in.
 */
export type RunSurface = 'terminal' | 'console';

/* ================ M-26 — THE TWO AXES OF AN INTERACTIVE RUN ================
 *
 * ‼️ WHY THEY LIVE HERE AND NOT ON THE TASK. This module is "the vocabulary of
 * starting a session", and these are two more words in it — the same kind of
 * closed list as the efforts and the permission modes below, read by the same
 * form helper and refused by the same validator. A task, a schedule, a trigger,
 * a template and a workflow step all carry them (`RunDimensions`), so the
 * values cannot be spelled in the module that happens to own tasks.
 *
 * `RunSurface` above is the sibling question for a SESSION a person starts by
 * hand, and it deliberately stays two-valued: that path has had its own OS
 * terminal setting for releases, and folding the two lists together would make
 * one of the two surfaces answer a question it does not ask.
 */
export type InteractiveTarget = 'vscode' | 'external' | 'console';
export type InteractiveClose = 'stay-open' | 'auto-close';

export const INTERACTIVE_TARGETS: readonly InteractiveTarget[] = ['vscode', 'external', 'console'];
export const INTERACTIVE_CLOSES: readonly InteractiveClose[] = ['stay-open', 'auto-close'];

/** The surfaces, in the shape every other dimension's picker takes. */
export const TARGET_CHOICES: LaunchChoice[] = [
    {
        id: 'vscode', label: 'VS Code terminal',
        detail: 'the integrated terminal, in this window — where every interactive task has always opened'
    },
    {
        id: 'external', label: 'OS terminal (Windows Terminal)',
        detail: 'its own window outside VS Code. The integrated terminal is xterm.js inside Chromium and '
            + 'long TUI sessions glitch there; a native window does not. Its exit code is read back, so the '
            + 'task still finishes on its own.'
    },
    {
        id: 'console', label: 'Agent Farm Console',
        detail: 'inside the panel — Agent Farm hosts the conversation, so the run stays visible to the '
            + 'extension and the task follows what the session is actually doing'
    }
];

/** What happens once the agent has answered. */
export const CLOSE_CHOICES: LaunchChoice[] = [
    {
        id: 'stay-open', label: 'stay open — keep talking',
        detail: 'the conversational form of the CLI: the prompt is sent, the answer arrives, and the '
            + 'session waits for you. The task finishes when you close it.'
    },
    {
        id: 'auto-close', label: 'auto-close — one turn, then done',
        detail: 'the engine is asked in its print-and-exit form: the answer is written where you can watch '
            + 'it, the process ends, and the task is done. A TUI has no other way to say "the answer is over".'
    }
];

/** A stored, formed or bridged value — or the default. Never a guess: an
 *  unknown string becomes the default rather than the nearest-looking option,
 *  because "it opened somewhere else" is what nobody would notice. */
export function normInteractiveTarget(v: unknown): InteractiveTarget {
    return INTERACTIVE_TARGETS.includes(v as InteractiveTarget) ? v as InteractiveTarget : 'vscode';
}
/**
 * ‼️ K-34 — THE THREE ANSWERS, in the order a picker shows them, and the first
 * one is NOT "off". Shared by the launcher and the profile editor so the two
 * cannot drift into offering different words for the same dimension.
 */
export const SUPERPOWERS_CHOICES: LaunchChoice[] = [
    {
        id: '', label: 'Agent default',
        detail: 'whatever agentFarm.superpowersDefaults says for this agent — what every session started before this row existed did'
    },
    {
        id: 'on', label: 'On',
        detail: 'this session works to the discipline: brainstorm before building, a plan before code, systematic debugging before a fix'
    },
    {
        id: 'off', label: 'Off',
        detail: 'not this session, whatever the agent\'s default says'
    }
];

/** ‼️ The one place the picker's three words become the launch's three states.
 *  Anything unreadable is the DEFAULT, never "off": a value nobody can parse
 *  must fall back to the behaviour every launch had before this existed. */
export function normSuperpowers(v: unknown): boolean | undefined {
    const w = String(v ?? '').trim().toLowerCase();
    return w === 'on' ? true : w === 'off' ? false : undefined;
}

/** The inverse, for a picker that has to show what is currently set. */
export function superpowersWord(v: boolean | undefined): string {
    return v === true ? 'on' : v === false ? 'off' : '';
}

export function normInteractiveClose(v: unknown): InteractiveClose {
    return INTERACTIVE_CLOSES.includes(v as InteractiveClose) ? v as InteractiveClose : 'stay-open';
}

/** A saved, named launch setup (`agentFarm.launchProfiles`). */
export interface LaunchProfile extends LaunchOptions {
    name: string;
    /**
     * ‼️ Console or terminal, saved WITH the setup. Absent means the profile
     * predates this and says nothing — the launcher then keeps whatever it is
     * already set to, which is what such a profile has always done. It is not
     * a `LaunchOptions` field because it is not a flag: it decides which
     * surface starts the session, not what is on its command line.
     */
    surface?: RunSurface;
    /**
     * ‼️ X-180 — WHO the setup was saved for. The launcher is opened for one
     * agent, so Save knows; stored here, a saved setup is a whole start — one
     * press on the Start Session… icon, no agent question. Absent means the
     * profile predates this and the agent is asked for once. Not a
     * `LaunchOptions` field: it is the subject of the session, not a flag.
     */
    agentId?: string;
}

/** The always-applied defaults (`agentFarm.launchDefaults`) — the three
 *  dimensions that make sense for EVERY session, including resumes. Name and
 *  first prompt are per-launch by nature and deliberately not defaultable. */
export interface LaunchDefaults {
    /** ‼️ WHICH ENGINE, SET ONCE (X-18). "Always Codex" is a preference, not a
     *  choice to be repeated on every launch — and an empty value keeps meaning
     *  `claude`, so an existing settings file changes nothing. */
    engine?: string;
    model?: string;
    effort?: string;
    permissionMode?: string;
}

/** Explicit choice wins over the default; a default of '' changes nothing. */
export function withDefaults(o: LaunchOptions, d: LaunchDefaults | undefined): LaunchOptions {
    const pick = (own: string | undefined, def: string | undefined) =>
        (own?.trim() ? own.trim() : (def?.trim() ?? ''));
    const engine = pick(o.engine, d?.engine);
    return {
        ...o,
        ...(engine ? { engine: engine as EngineId } : {}),
        model: pick(o.model, d?.model),
        effort: pick(o.effort, d?.effort),
        permissionMode: pick(o.permissionMode, d?.permissionMode)
    };
}

/**
 * ‼️ S-34 — WHAT ONE AGENT WAS LAST STARTED WITH, INCLUDING WHERE.
 *
 * Kept per agent, not per window: the launcher, the ▶ button and the composer
 * are all per-agent doors, and an agent you always talk to in the Console on
 * `opus` does not stop being that one because the last thing you started
 * somewhere else was a Codex terminal.
 *
 * `surface` sits beside the options rather than inside them for the reason
 * `LaunchProfile` keeps it outside `LaunchOptions`: it is not a flag on a
 * command line, it decides which surface runs the command. Absent means
 * nothing was said — a record written before this existed reads the same as
 * an agent that has never been started.
 */
export interface LastLaunch extends LaunchOptions {
    surface?: RunSurface;
    /**
     * ‼️ X-145 — AND THE ENGINE'S OWN WORDS, KEPT PER ENGINE.
     *
     * The record used to hold ONE model, ONE effort and ONE permission mode for
     * the whole agent, so the three engines an agent is used on shared a single
     * row and overwrote each other. Starting OpenCode in `manual` and then
     * pressing ▶ on the same agent with Claude produced a Claude session in
     * `manual` — not because anyone said so about Claude, but because the last
     * thing typed anywhere else was still sitting in the one box there was.
     *
     * Keyed by engine id. `byEngine.claude` is what this agent last ran as ON
     * CLAUDE and answers no question about any other engine, which is the whole
     * point: switching the engine now RECALLS that engine's setup instead of
     * dropping to nothing or carrying the previous one across.
     *
     * The flat fields above stay and still mean "the last launch, whatever
     * engine it was on" — they are what a record written before this says, and
     * `rememberedOn` is the one place that decides which of the two answers.
     */
    byEngine?: Record<string, EngineLaunchMemory>;
}

/**
 * ‼️ X-145 — THE THREE DIMENSIONS THAT BELONG TO AN ENGINE.
 *
 * The model and the effort are the engine's own vocabulary (`opus` means
 * nothing to Codex). The permission mode is Agent Farm's word, spelled the same
 * everywhere — but what it TURNS INTO is the engine's (on Codex it becomes a
 * sandbox chosen up front, on Claude a `--permission-mode` flag that overrides
 * the settings file), so a person who chose `manual` chose it for the engine
 * they were looking at. All three are per engine; `superpowers` and `surface`
 * are not, and stay on the record itself.
 */
export interface EngineLaunchMemory {
    model?: string;
    effort?: string;
    permissionMode?: string;
    /**
     * ‼️ X-103 — AND THE ROUTE IS PER ENGINE MORE PLAINLY THAN ANY OF THE THREE
     * ABOVE. A Claude route profile id means nothing to OpenCode and an OpenCode
     * provider id means nothing to Claude, so a flat record would carry one onto
     * the other on the first engine switch — the exact defect X-145 fixed for
     * the model, arriving again through a newer field.
     */
    providerId?: string;
    tier?: string;
    variant?: string;
}

/**
 * ‼️ THE ENGINE-OWNED DIMENSIONS, IN ONE PLACE. `rememberedOn` merges over this
 * rather than over field names written out twice — which is how the three that
 * existed first stayed right for a year and the three added after them leaked
 * onto the wrong engine on their first day.
 *
 * ‼️ X-150 — AND THE LIST IS NO LONGER TYPED OUT HERE EITHER. It is the
 * `perEngine` dimensions of `media/afDimensions.js`, which is the one place the
 * 16 launch dimensions are described. A seventh engine-owned dimension is now a
 * flag on a row rather than an edit to this constant that somebody has to
 * remember to make — and `test_launch_dimensions.js` counts both directions.
 */
export const ENGINE_MEMORY_FIELDS =
    launchDimensionsWhere('perEngine') as unknown as readonly (keyof EngineLaunchMemory)[];

/**
 * ‼️ S-34 — THE MEMORY AS A LAYER, BETWEEN WHAT THE CALLER SAID AND THE FLEET
 * DEFAULTS.
 *
 * The resolution order every door now shares is: what this launch states →
 * what this AGENT was last started with → the agent's engine defaults → the
 * fleet's `agentFarm.launchDefaults`. The memory is a layer rather than a
 * seeding step so it can be applied at a door without that door having to know
 * which fields exist: a dimension added to `LaunchOptions` later is remembered
 * by the recorder and re-applied here, instead of being forgotten by nine
 * doors out of ten — which is the defect this item is named for.
 *
 * ‼️ `superpowers` IS A TRI-STATE AND `??` IS THE WHOLE REASON IT WORKS.
 * `undefined` is "nobody said"; `false` is a person saying "not this session",
 * and `||` would quietly promote the second into the first — reinstating a
 * discipline the previous launch deliberately turned off.
 *
 * ‼️ AND THE MEMORY IS SCOPED BY ENGINE — see `rememberedOn` below.
 */
export function withLastLaunch(o: LaunchOptions, last: LastLaunch | undefined): LaunchOptions {
    if (!last) { return o; }
    const pick = (own: string | undefined, prev: string | undefined) =>
        (own?.trim() ? own.trim() : (prev?.trim() ?? ''));
    const engine = pick(o.engine, last.engine);
    const prev = rememberedOn(engine, last);
    const sp = o.superpowers ?? last.superpowers;
    /**
     * ‼️ X-150 — THE ENGINE-OWNED SIX ARE FOLDED, NOT NAMED.
     *
     * They used to be six lines, each one a place a seventh dimension could
     * fail to appear — and X-103 and X-145 are both the record of that
     * happening. `seedIntent` reads them off `prev` and NOT off `last`, which is
     * the whole of both those items: the row belongs to the engine this launch
     * is on, so a mode chosen for one engine cannot arrive on the next as a flag
     * nobody typed, and a Claude route profile id cannot land on OpenCode.
     *
     * ‼️ THE TWO FLAT ONES STAY BY NAME, and `test_launch_dimensions.js`
     * requires it. `engine` DECIDES which row the six are read from, so it
     * cannot be one of them; `superpowers` has three states and `undefined` is
     * the one that means "the agent's own default decides" (K-34), which a fold
     * over strings would spell as `''` and quietly turn into a fourth.
     */
    return {
        ...o,
        ...(engine ? { engine: engine as EngineId } : {}),
        ...seedIntent(o as LaunchIntent, prev as LaunchIntent),
        ...(sp === undefined ? {} : { superpowers: sp })
    };
}

/**
 * ‼️ A REMEMBERED MODEL BELONGS TO THE ENGINE IT RAN ON.
 *
 * `gemini-3-pro` is not something Claude can be asked to be, and `opus` means
 * nothing to Codex. The record is one row per agent, so a launch that changes
 * the engine was reading the previous engine's model out of it and carrying it
 * across: switch the launcher from Antigravity to Claude, press Start, and the
 * Console opened with the engine box saying Claude and the model box saying the
 * Antigravity model underneath it — a setup that cannot run, drawn as if it
 * would. The effort follows the model rather than standing on its own (the list
 * of levels is looked up BY model, and several engines draw no effort box at
 * all), so it is dropped with it.
 *
 * ‼️ X-145 — AND THE ANSWER IS NO LONGER "NOTHING": THE ENGINE HAS ITS OWN ROW.
 *
 * Dropping was only ever half the fix. An agent used on two engines has two
 * setups, and emptying the boxes on every switch made the user retype the one
 * they had already chosen ten minutes earlier — so `byEngine` holds one row per
 * engine and this reads THAT row first. Only when the engine has no row of its
 * own does the flat record answer, and then only if it does not name a
 * different engine.
 *
 * ‼️ THE PERMISSION MODE FALLS WITH THEM. It used to be kept across the switch
 * on the grounds that `plan` is Agent Farm's word rather than the CLI's — true
 * about the spelling, false about the effect: it becomes a FLAG, and a flag
 * beats the engine's own settings file. A `manual` typed for OpenCode therefore
 * arrived at Claude as an explicit `--permission-mode manual` and overrode the
 * `bypassPermissions` the user had set in `~/.claude/settings.json`. Silence is
 * what lets that file decide, so silence is what an engine with no row gets.
 *
 * ‼️ A RECORD WITH NO ENGINE ON IT IS INHERITED. It predates the engine being
 * recorded, so it cannot contradict anything — and treating silence as a
 * mismatch would empty the boxes for every agent that has not been started
 * since, which is a regression dressed up as a fix.
 */
export function rememberedOn(engine: string | undefined, last: LastLaunch): LastLaunch {
    const was = (last.engine || '').trim();
    const now = (engine || '').trim();
    const own = now ? last.byEngine?.[now] : undefined;
    /**
     * ‼️ X-103 — MERGED OVER THE FIELD LIST, NOT OVER NAMES TYPED IN TWICE.
     *
     * Both branches below used to name `model`, `effort` and `permissionMode`
     * one by one, so the moment the route joined `EngineLaunchMemory` it leaked:
     * a Claude profile id survived a switch to OpenCode and arrived on an engine
     * that has never heard of it. The list is the shape's, so the next field
     * added to the memory is carried and cleared without this function being
     * touched at all.
     */
    const blank = Object.fromEntries(ENGINE_MEMORY_FIELDS.map(f => [f, ''])) as EngineLaunchMemory;
    if (own) {
        return { ...last, ...blank, ...Object.fromEntries(
            ENGINE_MEMORY_FIELDS.map(f => [f, own[f] ?? ''])) };
    }
    if (!was || !now || was === now) { return last; }
    return { ...last, ...blank };
}

/**
 * ‼️ S-34 — AND WHAT GETS WRITTEN BACK, derived from the launch that actually
 * happened.
 *
 * One function, so the record cannot differ door to door — the failure this
 * item exists to fix was exactly that: one door writing five dimensions and
 * the rest writing none. Only the dimensions that MEAN something for the next
 * launch are kept: `name`, `prompt` and `resume`/`continueLast` are per-launch
 * by nature, and re-applying them would give a second session the same name
 * and send the same opening message on the user's behalf.
 */
export function launchToRemember(
    o: LaunchOptions, surface?: RunSurface, prev?: LastLaunch
): LastLaunch {
    // ‼️ X-150 — the row is BUILT from the dimension list, so a dimension that
    // joins `EngineLaunchMemory` is written back without this line being
    // touched. A row that omitted a field would let the previous engine's value
    // show through the merge in `rememberedOn`, which is what makes writing
    // every one of them, blank included, part of the shape rather than a habit.
    const mem: EngineLaunchMemory = rememberIntent(o as LaunchIntent) as EngineLaunchMemory;
    const engine = (o.engine || '').trim();
    /**
     * ‼️ X-145 — THE OTHER ENGINES' ROWS SURVIVE THIS LAUNCH.
     *
     * `prev` is the record being replaced, and its `byEngine` is carried
     * forward with only THIS engine's row rewritten. Writing the map from
     * scratch would make every start erase what the agent runs as on the two
     * engines it was not started on — a memory that only ever remembers the
     * last engine, which is the one it already had.
     *
     * A launch that names no engine writes no row: the caller means "whatever
     * the fleet default is", and this module cannot read that setting. Its
     * flat fields still record what ran, which is what such a record has always
     * meant. The recorder in `extension.ts` resolves the engine before calling
     * here, so the unnamed case is the bridge's and the tests', not a door's.
     */
    return {
        ...(o.engine ? { engine: o.engine } : {}),
        ...mem,
        ...(o.superpowers === undefined ? {} : { superpowers: o.superpowers }),
        ...(surface ? { surface } : {}),
        ...(engine
            ? { byEngine: { ...(prev?.byEngine ?? {}), [engine]: mem } }
            : (prev?.byEngine ? { byEngine: prev.byEngine } : {}))
    };
}

/** Sanity-check values that came from settings or the bridge (not from a
 *  picker), so a typo fails with a readable message instead of the CLI
 *  refusing to start in a terminal the user then has to read. */
export function validateLaunch(o: LaunchOptions): string[] {
    const errors: string[] = [];
    const known = (list: LaunchChoice[], v: string) => list.some(c => c.id === v);
    // ‼️ The NAME only — whether the engine can RUN is a question about this
    // machine and belongs to core/engines.ts (`engineRefusal`). A typo has to
    // fail here, before anything spawns, with the list of real names.
    if (o.engine && !(o.engine in ENGINES)) {
        errors.push(`engine "${o.engine}" is not one of: ${Object.keys(ENGINES).join(', ')}`);
    }
    // X-330 — OpenCode's levels are its models' own variants (`minimal` is one),
    // checked against the catalog by openCodeVariantRefusal, not this list.
    if (o.effort?.trim() && o.engine !== 'opencode' && !known(EFFORT_CHOICES, o.effort.trim())) {
        errors.push(`effort "${o.effort.trim()}" is not one of: ` +
            EFFORT_CHOICES.filter(c => c.id).map(c => c.id).join(', '));
    }
    if (o.permissionMode?.trim() && !known(PERMISSION_CHOICES, o.permissionMode.trim())) {
        errors.push(`permission mode "${o.permissionMode.trim()}" is not one of: ` +
            PERMISSION_CHOICES.filter(c => c.id).map(c => c.id).join(', '));
    } else if (o.permissionMode?.trim() && permissionRefusalFor(o.engine, o.permissionMode.trim())) {
        // S-60 — a real name the ENGINE cannot keep is refused with the engine's own sentence.
        errors.push(permissionRefusalFor(o.engine, o.permissionMode.trim()));
    }
    if (o.resume && o.continueLast) {
        errors.push('resume and continue are mutually exclusive');
    }
    /**
     * ‼️ X-103 — THE PROVIDER AXIS, CHECKED FOR SHAPE HERE AND FOR TRUTH BY THE
     * ADAPTER. What belongs here is only what is true without asking an engine:
     * a charset (these reach a command line — `--variant` — and an environment
     * resolution), and the one contradiction that is a contradiction on any
     * catalog. Whether a route EXISTS is `preflight`'s answer, and restating it
     * here would be a second list to keep in step.
     */
    for (const [field, value] of [
        ['provider', o.providerId], ['tier', o.tier], ['variant', o.variant]
    ] as const) {
        const v = value?.trim();
        if (v && !modelIdOk(v)) {
            errors.push(`${field} "${v}" is not a valid id — letters, digits, dot, colon, slash and hyphen only`);
        }
    }
    // A tier with no route is not a narrow choice, it is an unanswerable one:
    // the ROUTE is what decides which model `opus` means, so the word has no
    // referent until one is picked and it would be silently ignored at spawn.
    if (o.tier?.trim() && !o.providerId?.trim()) {
        errors.push(`tier "${o.tier.trim()}" needs a route — a tier is a question the route answers `
            + '(`opus` is one model on one route and another on the next), so with no route it names nothing');
    }
    // ‼️ K-22 — A SESSION THAT CANNOT KEEP ITS LABEL DOES NOT START. The
    // tempting alternative is to open the terminal in the ordinary asking mode
    // and let the user find out at the first `[y/n]`; that IS the failure this
    // item is about, and it is worse in a terminal than in the Console because
    // nothing draws a card — the prompt sits on a tty nobody is watching.
    if (o.permission?.blocked) {
        errors.push(`bypassPermissions cannot be enforced here — ${o.permission.blocked.why}`
            + ` (${o.permission.blocked.file}). Starting anyway would label the session bypass`
            + ' and then stop it on a permission prompt, which is the one outcome this refuses.');
    }
    // ‼️ M-22 — REFUSED, NOT RANKED. Ranking them is what the runner already
    // does, and that is the bug: the loser is not reported anywhere, so a
    // schedule set to OpenCode with an old CLI profile left on it runs the
    // profile at 3 a.m. and says nothing. One of the caller's two statements
    // has to be a no-op; the only honest moment to say so is before it starts.
    if (twoExecutors(o.cli, o.engine)) {
        errors.push(ONE_EXECUTOR);
    }
    // ‼️ REFUSED, NOT SILENTLY DROPPED — AND ONLY ON THE ENGINE THAT CANNOT DO
    // IT. `codex resume` is its own subcommand with its own flag vocabulary and
    // nobody here has measured it; the measured resume there is `codex exec
    // resume`, which is the Console's path. Building a terminal line that
    // ignored the id would open a NEW conversation while the caller believed it
    // had continued one. Antigravity takes `--conversation <id>` on the ordinary
    // command (measured), so it is not refused — the rule follows the engine's
    // own vocabulary rather than "is it Claude".
    if (o.engine && (o.resume || o.continueLast) && !engineOf(o.engine).resumeInTerminal) {
        errors.push(`${engineOf(o.engine).label} cannot be resumed from a terminal here — continue it in the Console, which resumes the thread by id`);
    }
    return errors;
}
