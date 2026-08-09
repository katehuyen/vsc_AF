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
}

export const ENGINES: Record<EngineId, EngineTransport> = {
    claude: {
        id: 'claude', exe: 'claude', shape: 'persistent',
        liveControls: true, reportsCost: true, label: 'Claude Code'
    },
    codex: {
        id: 'codex', exe: 'codex', shape: 'perTurn',
        // A per-turn engine has nothing to change mid-turn: the flags of the
        // NEXT turn are the controls, and they take effect the moment it starts.
        liveControls: false, reportsCost: false, label: 'Codex'
    },
    gemini: {
        id: 'gemini', exe: 'gemini', shape: 'perTurn',
        liveControls: false, reportsCost: false, label: 'Gemini'
    }
};

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
    const sandbox = codexSandboxFor(o.permissionMode);
    const model = o.model?.trim();
    const effort = o.effort?.trim();
    // `-c key=value` is accepted by BOTH shapes, which is why the settings that
    // have to survive a resume are expressed that way rather than as flags.
    const config = [
        '-c', `sandbox_mode="${sandbox}"`,
        ...(effort ? ['-c', `model_reasoning_effort="${effort}"`] : [])
    ];
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
