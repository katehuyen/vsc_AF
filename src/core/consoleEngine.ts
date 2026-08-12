/**
 * Which engine a hosted session talks to, and what that changes.
 *
 * ‼️ THE TWO ENGINES ARE NOT TWO SPELLINGS OF THE SAME THING. Claude Code is
 * ONE LONG-LIVED PROCESS: it is spawned once, user messages are written to its
 * stdin as JSON, and control requests change the model, the effort and the
 * permission mode mid-conversation. Codex `exec` is ONE PROCESS PER TURN: it
 * takes the prompt, runs it, prints JSONL, and exits — the conversation is
 * picked up again by `codex exec resume <thread_id>`. Everything that follows
 * falls out of that one difference, and pretending it away is how a Console
 * would end up silently dropping half of what the user typed.
 *
 * ‼️ MEASURED, NOT READ ABOUT (2026-08-10, codex-cli 0.147.0, this machine):
 *
 *   · `codex exec --json -s <mode> -C <dir> [PROMPT]` — the first turn.
 *   · `codex exec resume <thread_id> --json [PROMPT]` — every later turn, and it
 *     comes back with the SAME `thread_id` and the context carried.
 *   · ‼️ `resume` REFUSES `-s` and `-C` (exit code 2). They are not optional
 *     there, they are not accepted there. The sandbox goes through
 *     `-c sandbox_mode=…`, which resume does take, and the working directory is
 *     the process's own cwd. So the first turn and the later ones do NOT share
 *     a flag vocabulary, which is exactly the kind of thing that is discovered
 *     in production if it is guessed at here.
 *   · With a prompt given as an argument the CLI still reads stdin if stdin is
 *     a pipe, and says so on stderr ("Reading additional input from stdin…").
 *     The prompt therefore travels on STDIN, alone, and stdin is closed after
 *     it — an argument would leave the process waiting for a second copy.
 *
 * Pure: argument vocabularies and one mapping table. No spawning, no vscode.
 */

// ‼️ `EngineId` is NOT redeclared here. `core/engines.ts` owns the question
// "which engines are there and is this one usable on this machine"; this file
// owns "and how does a turn reach one". Two lists of engine names would drift
// the first time a third engine arrived.
import { EngineId } from './engines';
import { agyArgs, agyModeNote, agyRunArgs, agyTuiArgs, AgyTurnInit } from './agy';

export { EngineId };

/**
 * How a turn reaches the engine.
 *
 * `persistent` — one process for the whole session; a turn is a line on stdin.
 * `perTurn`    — one process per turn; the conversation is resumed by its id.
 */
export type EngineShape = 'persistent' | 'perTurn';

/** What talking to an engine COSTS in machinery — as opposed to `EngineStatus`
 *  in `core/engines.ts`, which is whether this machine can talk to it at all. */
export interface EngineTransport {
    id: EngineId;
    /** The command, as it is on PATH. */
    exe: string;
    shape: EngineShape;
    /** Can the model, effort or permission mode be changed WHILE a turn runs? */
    liveControls: boolean;
    /** Does a finished turn come with a price? A subscription engine counts
     *  tokens and states no dollars — see the note in codexproto.ts. */
    reportsCost: boolean;
    /** Human name for the surfaces. */
    label: string;
    /**
     * ‼️ WHERE THE PROMPT TRAVELS — measured per engine, and they disagree.
     *
     * `stdin` — Codex: given the prompt as an argument it STILL drains stdin
     * when stdin is a pipe and waits for a second copy that never comes.
     * `argv`  — Antigravity: `--print` takes the prompt as its value and refuses
     * an empty one (*empty prompt. Usage: agy --print "your prompt here"*);
     * nothing is read from stdin at all.
     *
     * Getting this backwards does not fail loudly — it hangs, or it sends an
     * empty turn — which is why it is a field and not a habit.
     */
    promptOn: 'stdin' | 'argv';
    /**
     * ‼️ AND WHETHER A SHELL IS ALLOWED TO SEE THE COMMAND LINE.
     *
     * `claude` and `codex` are `.cmd` shims on Windows and need one; nothing
     * user-typed reaches their command line, so it is safe. `agy` is a real
     * `.exe` AND carries the prompt in argv — a multi-line message does not
     * survive `cmd.exe`, so it is spawned with no shell and the argument arrives
     * byte-for-byte (verified with newlines, quotes, a backtick, `$`, `%`, `&`).
     */
    spawnShell: boolean;
    /**
     * Can a conversation be picked up again from a TERMINAL launch?
     *
     * Claude has `--resume`; Antigravity has `--conversation <id>` and
     * `--continue`, ordinary flags on the ordinary command. Codex does NOT: its
     * resume is a separate subcommand with a different flag vocabulary, and the
     * one this codebase has measured is `codex exec resume`, which belongs to
     * the Console. A launcher that ignored that would open a NEW conversation
     * while the caller believed it had continued one.
     */
    resumeInTerminal: boolean;
    /**
     * ‼️ DOES A CONVERSATION ON THIS ENGINE LEAVE A FILE A VIEWER CAN OPEN?
     *
     * Three of them do — a JSONL transcript or rollout on disk, which is how
     * they got into the sessions index in the first place. Antigravity does
     * not: its conversations are protobuf BLOBs inside per-conversation SQLite
     * databases (measured 2026-08-10, `cliTranscripts.ts`), so the row is built
     * from the CLI's own metadata index and carries an EMPTY `file` on purpose.
     *
     * This exists because "no transcript on disk **yet**" is the sentence those
     * rows used to get, and on this engine "yet" is a lie that leaves the user
     * waiting for a file that is never coming.
     */
    readableTranscript: boolean;
}

export const ENGINES: Record<EngineId, EngineTransport> = {
    claude: {
        id: 'claude', exe: 'claude', shape: 'persistent',
        liveControls: true, reportsCost: true, label: 'Claude Code',
        promptOn: 'stdin', spawnShell: true, resumeInTerminal: true,
        readableTranscript: true
    },
    codex: {
        id: 'codex', exe: 'codex', shape: 'perTurn',
        // A per-turn engine has nothing to change mid-turn: the flags of the
        // NEXT turn are the controls, and they take effect the moment it starts.
        liveControls: false, reportsCost: false, label: 'Codex',
        promptOn: 'stdin', spawnShell: true, resumeInTerminal: false,
        readableTranscript: true
    },
    gemini: {
        id: 'gemini', exe: 'gemini', shape: 'perTurn',
        liveControls: false, reportsCost: false, label: 'Gemini',
        promptOn: 'stdin', spawnShell: true, resumeInTerminal: false,
        readableTranscript: true
    },
    agy: {
        // ‼️ `agy`, and the label is "Antigravity" — NOT "Gemini". The row above
        // is `@google/gemini-cli`, a different program. This one is Google's
        // agent app, and the models it offers include Anthropic's.
        id: 'agy', exe: 'agy', shape: 'perTurn',
        liveControls: false, reportsCost: false, label: 'Antigravity',
        promptOn: 'argv', spawnShell: false, resumeInTerminal: true,
        readableTranscript: false
    }
};

/**
 * ‼️ WHY THERE IS NOTHING TO OPEN — the engine's own answer (X-35).
 *
 * "No transcript on disk for that session yet" was said to every session with
 * an empty `file`, and on Antigravity the word "yet" is simply false: the
 * conversation is on disk, in a form nothing here can read, and it will never
 * turn into a transcript. Telling a user to wait for that is the quiet kind of
 * wrong this whole item exists to remove. Every caller that finds no file asks
 * this instead of writing the sentence itself.
 */
export function noTranscriptNote(engine: string | undefined): string {
    const e = engineOf(engine);
    return e.readableTranscript
        ? `No transcript on disk for that ${e.label} session yet — it is written as the conversation runs.`
        : `${e.label} keeps its conversations as protobuf inside per-conversation SQLite files, `
        + 'so there is no transcript to read — the row is built from the CLI\'s own index.';
}

/** The engine of an id that may be anything, defaulting to the one every
 *  existing session and every existing caller means. */
export function engineOf(id: string | undefined): EngineTransport {
    const key = String(id ?? '').trim().toLowerCase() as EngineId;
    return ENGINES[key] ?? ENGINES.claude;
}

/**
 * ‼️ WHAT A PERMISSION MODE MEANS ON AN ENGINE THAT CANNOT ASK.
 *
 * Claude's modes are a conversation: the CLI stops and asks, and the panel
 * answers. `codex exec` has nobody to ask — it is non-interactive by
 * construction — so the mode has to be spent UP FRONT, as a sandbox. The
 * mapping is deliberately conservative at the top: `default` on Claude means
 * "ask me", and the nearest honest thing an engine that cannot ask can do is
 * refuse to write. It is not "the same mode"; the surfaces say so rather than
 * letting the word carry an assumption it cannot keep.
 */
export const CODEX_SANDBOX: Record<string, string> = {
    default: 'read-only',
    plan: 'read-only',
    acceptEdits: 'workspace-write',
    bypassPermissions: 'danger-full-access'
};

export function codexSandboxFor(mode: string | undefined): string {
    return CODEX_SANDBOX[String(mode ?? '').trim()] ?? 'read-only';
}

/** One line a surface can show beside the picker, so a mode that means
 *  something else here says so instead of looking identical. */
export function codexModeNote(mode: string | undefined): string {
    const sandbox = codexSandboxFor(mode);
    return sandbox === 'read-only'
        ? 'Codex cannot stop and ask, so this turn runs read-only — it can look, not write.'
        : sandbox === 'workspace-write'
            ? 'Codex may write inside the working folder without asking; it cannot ask.'
            : 'Codex runs with no sandbox at all. Nothing will stop and ask you.';
}

export interface CodexTurnInit {
    /** The thread to continue. Absent = this is the first turn. */
    thread?: string;
    model?: string;
    permissionMode?: string;
    /** The engine's own reasoning effort, where it has one. */
    effort?: string;
    /** Passed as `-C` on a first turn; on a resume it is the process's cwd,
     *  because resume does not accept the flag. */
    cwd?: string;
    /** Image files to attach. `-i` is the only way this engine can SEE one, and
     *  both shapes accept it. */
    images?: string[];
}

/**
 * The prompt as a per-turn engine receives it: plain text, with any non-image
 * file named as a PATH.
 *
 * ‼️ The wording matches the Claude side deliberately (`userMessageLine`). The
 * agent has this disk and can open a file itself, which is cheaper on context
 * than embedding it and re-reads a file that changed mid-conversation; saying it
 * differently on each engine would make the same instruction behave differently
 * for no reason a reader could see.
 */
export function codexPromptText(
    text: string, attachments: { kind: string; path: string }[] = []
): string {
    const paths = attachments.filter(a => a.kind !== 'image');
    if (!paths.length) { return text; }
    return `${text}${text ? '\n\n' : ''}`
        + `Attached file${paths.length === 1 ? '' : 's'} on this machine — open with Read:\n`
        + paths.map(a => `- \`${a.path}\``).join('\n');
}

/**
 * The command line for ONE Codex turn.
 *
 * ‼️ The two shapes are genuinely different and the difference is measured, not
 * stylistic — see the header. Written in one place so that the next person to
 * add a flag cannot add it to only one of them.
 */
export function codexArgs(o: CodexTurnInit): string[] {
    const model = o.model?.trim();
    // `-c key=value` is accepted by BOTH shapes, which is why the settings that
    // have to survive a resume are expressed that way rather than as flags.
    const config = codexConfig(o);
    const images = (o.images ?? []).flatMap(p => ['-i', p]);
    if (o.thread) {
        return [
            'exec', 'resume', o.thread, '--json', '--skip-git-repo-check',
            ...config,
            ...(model ? ['-m', model] : []),
            ...images,
            // ‼️ The prompt is read from stdin — `-` says so explicitly. Given as
            // an argument the CLI STILL drains stdin when stdin is a pipe, and
            // waits for a second copy of the message that never comes.
            '-'
        ];
    }
    return [
        'exec', '--json', '--skip-git-repo-check',
        ...config,
        ...(model ? ['-m', model] : []),
        ...images,
        ...(o.cwd ? ['-C', `"${o.cwd}"`] : []),
        '-'
    ];
}

/**
 * ‼️ WHY THIS IS NOT A `--sandbox` FLAG ON THE RESUME PATH — kept as a named
 * export so the measurement is testable rather than a comment somebody trims.
 * `codex exec resume <id> -s read-only …` exits 2: the subcommand does not
 * accept it.
 */
export const CODEX_RESUME_REFUSES = ['-s', '--sandbox', '-C', '--cd'];

// ---------------------------------------------------------------------------
// X-18 — the same engine, on the surfaces that are NOT the hosted Console
// ---------------------------------------------------------------------------

/**
 * ‼️ A TASK AND A TERMINAL ARE NOT THE CONSOLE, AND THE COMMAND IS NOT THE SAME.
 *
 * The hosted path asks for `--json` because something is translating it
 * (codexproto.ts). A task's output is an archived markdown file a PERSON reads,
 * and a terminal is a person watching — JSONL in either place is a log dump
 * where a conversation was wanted. Measured on this machine (codex-cli 0.147.0,
 * 2026-08-10) with the plain form:
 *
 *   OpenAI Codex v0.147.0
 *   --------
 *   workdir: … · model: gpt-5.6-terra · provider: openai
 *   approval: never · sandbox: read-only · reasoning effort: low
 *   session id: 019fe859-…
 *   --------
 *   user … codex … tokens used 260
 *
 * — which is exactly the header a task archive wants, written by the engine
 * itself rather than reconstructed. `-o <file>` additionally writes the final
 * message alone, so a workflow step can read a result without parsing a log.
 */
export interface CodexRunInit {
    model?: string;
    effort?: string;
    permissionMode?: string;
    cwd?: string;
    /** where the LAST message should be written, for a caller that wants the
     *  answer without the transcript around it (`-o`) */
    lastMessageFile?: string;
}

/** The `-c key=value` pairs both shapes accept, in one place so a setting that
 *  must survive a resume can never be expressed as a flag by accident. */
function codexConfig(o: { permissionMode?: string; effort?: string }): string[] {
    const effort = o.effort?.trim();
    return [
        '-c', `sandbox_mode="${codexSandboxFor(o.permissionMode)}"`,
        ...(effort ? ['-c', `model_reasoning_effort="${effort}"`] : [])
    ];
}

/**
 * ONE unattended Codex run — a headless task.
 *
 * ‼️ THE PROMPT STILL TRAVELS ON STDIN (`-`), for a second reason on top of the
 * measured one: a task's prompt is multi-line by nature and this command line is
 * handed to a shell, where multi-line text does not survive on any platform.
 * Callers therefore pipe it — see `TaskManager.spawnHeadless`.
 */
export function codexRunArgs(o: CodexRunInit): string[] {
    return [
        'exec', '--skip-git-repo-check',
        ...codexConfig(o),
        ...(o.model?.trim() ? ['-m', o.model.trim()] : []),
        ...(o.cwd ? ['-C', `"${o.cwd}"`] : []),
        ...(o.lastMessageFile ? ['-o', `"${o.lastMessageFile}"`] : []),
        '-'
    ];
}

/**
 * The INTERACTIVE engine — `codex [flags] [PROMPT]`, the TUI a person sits in.
 *
 * Measured from `codex --help` (0.147.0): the bare command takes `-m`, `-s`,
 * `-C`, `-c` and a positional prompt, exactly like `exec` does. `-s` is spelled
 * out here rather than pushed through `-c`, because this shape accepts it and a
 * person reading the line they are about to run should see the sandbox in words.
 */
export function codexTuiArgs(o: CodexRunInit & { prompt?: string }): string[] {
    return [
        '-s', codexSandboxFor(o.permissionMode),
        ...(o.effort?.trim() ? ['-c', `model_reasoning_effort="${o.effort.trim()}"`] : []),
        ...(o.model?.trim() ? ['-m', o.model.trim()] : []),
        ...(o.cwd ? ['-C', `"${o.cwd}"`] : [])
    ];
}

/**
 * ‼️ WHAT CODEX HAS NO CHANNEL FOR — said out loud instead of dropped.
 *
 * Claude Code takes an extra system prompt on the command line
 * (`--append-system-prompt-file`), which is how a session is told which project
 * it belongs to before the user types anything. `codex` has no equivalent: its
 * only inputs are the prompt, `AGENTS.md` in the working folder and its own
 * config. So on this engine the project brief has to ride INSIDE the first
 * prompt, and the surfaces say so rather than letting a session look briefed
 * when it is not.
 */
export const CODEX_HAS_NO_SYSTEM_PROMPT_FLAG = true;

/** The brief, as the first prompt of a per-turn engine carries it. Fenced and
 *  labelled so the agent can tell the handed-over context from the instruction
 *  — the same separation the system-prompt channel gives for free on Claude. */
export function codexContextPrefix(context: string): string {
    const text = String(context ?? '').trim();
    if (!text) { return ''; }
    return `<project-context>\n${text}\n</project-context>\n\n`;
}

/**
 * One line for a surface: what changes about talking to this engine.
 *
 * ‼️ THE DIFFERENCE IS NOT COSMETIC AND MUST NOT BE DISCOVERED BY LOSING A
 * MESSAGE. On a persistent engine a message typed mid-turn steers that turn; on
 * a per-turn engine it is held until the turn ends, the pickers are the NEXT
 * turn's flags, and the permission mode is a sandbox chosen up front because the
 * engine has nobody to ask. Every picker that offers the engine prints this.
 */
export function engineNote(id: string | undefined): string {
    const e = engineOf(id);
    if (e.shape === 'persistent') {
        return 'One long-lived process: a message typed mid-turn steers that turn, and model, effort and permissions can be changed while it runs. It reports what each turn cost.';
    }
    if (e.id === 'agy') {
        // ‼️ THE SAME SHAPE, A DIFFERENT SENTENCE. Saying "a sandbox chosen up
        // front" here would be a promise this engine does not keep: measured,
        // its permission flags do not restrain it — the Antigravity app's own
        // setting does (see agyModeNote).
        return 'One process per turn: a message typed mid-turn is HELD until the turn ends, and the pickers are the NEXT turn\'s flags. '
            + 'It sees only the folders it is given, cannot be handed a picture, and takes its permissions from the Antigravity app rather than from this box. '
            + 'It runs on an account, so it counts tokens and states no price.';
    }
    return 'One process per turn: a message typed mid-turn is HELD until the turn ends, the pickers are the NEXT turn\'s flags, and the permission mode becomes a sandbox chosen up front — this engine cannot stop and ask. It runs on a plan, so it counts tokens and states no price.';
}

// ---------------------------------------------------------------------------
// S-21 — ONE CALL SITE PER JOB, WHATEVER THE ENGINE IS
// ---------------------------------------------------------------------------

/**
 * ‼️ THE DISPATCH LIVES HERE, NOT AT THE CALL SITES.
 *
 * When Codex was the only per-turn engine, `ConsoleHost`, `TaskManager` and the
 * launcher each called `codexArgs` / `codexRunArgs` / `codexTuiArgs` by name.
 * Adding a second per-turn engine that way would have put an `if (engine ===
 * 'agy')` in each of them — three places to forget, and the fourth engine would
 * make it four. The vocabularies stay in their own files (`consoleEngine.ts` for
 * Codex, `agy.ts` for Antigravity); what is shared is which one gets asked.
 */

/** One hosted turn's dimensions, in the words every per-turn engine understands.
 *  `thread` is whatever that engine calls a conversation it can pick up again. */
export interface TurnInit {
    thread?: string;
    model?: string;
    effort?: string;
    permissionMode?: string;
    cwd?: string;
    /** Image files to attach — ignored by an engine with no image channel, and
     *  that engine says so rather than dropping them silently. */
    images?: string[];
}

/** The command line for ONE hosted turn on any per-turn engine. */
export function turnArgs(engine: string | undefined, o: TurnInit): string[] {
    const spec = engineOf(engine);
    if (spec.id === 'agy') {
        const init: AgyTurnInit = {
            conversation: o.thread, model: o.model, effort: o.effort,
            permissionMode: o.permissionMode, cwd: o.cwd
        };
        return agyArgs(init);
    }
    return codexArgs(o as CodexTurnInit);
}

/** …and for one unattended run — a headless task. */
export function runArgs(engine: string | undefined, o: CodexRunInit): string[] {
    return engineOf(engine).id === 'agy' ? agyRunArgs(o) : codexRunArgs(o);
}

/** …and for the interactive command a person is about to watch in a terminal. */
export function tuiArgs(
    engine: string | undefined, o: CodexRunInit & { conversation?: string; continueLast?: boolean }
): string[] {
    return engineOf(engine).id === 'agy' ? agyTuiArgs(o) : codexTuiArgs(o);
}

/** The one line beside a permission picker: what this mode does HERE. */
export function engineModeNote(engine: string | undefined, mode: string | undefined): string {
    return engineOf(engine).id === 'agy' ? agyModeNote(mode) : codexModeNote(mode);
}

/** The prompt as a per-turn engine receives it — the same wording on both, so
 *  the same instruction cannot behave differently for no visible reason. */
export function enginePromptText(
    engine: string | undefined, text: string, attachments: { kind: string; path: string }[] = []
): string {
    const spec = engineOf(engine);
    if (spec.id !== 'agy') { return codexPromptText(text, attachments); }
    // ‼️ NO IMAGE CHANNEL ON THIS ONE (agy.ts): Codex keeps images out of the
    // prompt because `-i` can carry them. Here there is no `-i`, so a picture is
    // named as a path like everything else — the agent is told where it is and
    // cannot look at it, which is better than it never being mentioned.
    return codexPromptText(text, attachments.map(a => ({ ...a, kind: 'file' })));
}

/** The project brief, fenced, for an engine with no system-prompt channel —
 *  which is both of the per-turn ones. */
export function engineContextPrefix(context: string): string {
    return codexContextPrefix(context);
}
