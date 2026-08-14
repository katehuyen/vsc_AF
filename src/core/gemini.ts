/**
 * X-35 — GEMINI (`gemini`), THE THIRD PER-TURN ENGINE: its command line.
 *
 * ‼️ THIS FILE EXISTS BECAUSE ITS ABSENCE WAS A BUG, NOT A GAP. Gemini had an
 * engine row, a model list and a place in every picker — and no transport. The
 * dispatch in `consoleEngine.ts` read "if agy … else Codex", so a Gemini turn
 * was handed `codex exec --json --skip-git-repo-check`, a vocabulary this CLI
 * has never had, and whatever came back was parsed as Codex JSONL. The engine
 * was not half-integrated; it was wired to the wrong program.
 *
 * ‼️ AND NOT `agy` EITHER. `agy` is Antigravity, Google's agent app, whose
 * models include Gemini's — a different program with a different command line
 * (`core/agy.ts`). This one is `@google/gemini-cli`.
 *
 * ‼️ EVERY LINE BELOW WAS MEASURED, NOT READ ABOUT (2026-08-13, gemini-cli
 * 0.55.1, read from the shipped binary's own `--help`, its bundled docs and its
 * bundled source — `packages/cli/src/gemini.tsx`, `packages/core/src/output/
 * stream-json-formatter.js`, `packages/core/src/output/json-formatter.js`).
 * Six of those measurements changed the design:
 *
 *  1. **THE PROMPT GOES ON STDIN, AND NO `-p` IS NEEDED.** `isHeadlessMode()`
 *     returns true the moment stdin OR stdout is not a TTY — which a spawned
 *     child with pipes never is — and the non-interactive path then reads stdin
 *     whole and uses it as the input. `-p`'s own help says its value is
 *     "appended to input on stdin (if any)", so passing both would send the
 *     message twice. Nothing user-typed reaches the command line, which is why
 *     this engine can keep the shell its npm shim needs on Windows.
 *  2. **A NEW CONVERSATION'S ID CAN BE CHOSEN BEFORE IT EXISTS** — `--session-id
 *     <UUID>`. No other engine here offers that: Codex and Antigravity both
 *     announce an id only once the first turn has started, which is the whole
 *     reason external launches were never bound to a live row. On this engine
 *     the identity is a FACT at spawn time, and `init` echoes it back so the
 *     binding can still be verified rather than assumed.
 *  3. **RESUME TAKES THE FULL UUID** — `--resume <id>` (also `latest`, also an
 *     index; only the id is used here, because an index is a different session
 *     tomorrow). Unlike Codex there is no separate subcommand and no different
 *     flag vocabulary, so a terminal launch on this engine can genuinely resume.
 *  4. **THERE IS NO REASONING-EFFORT FLAG.** Not "we have not found it": the
 *     whole option list is above and it has `-m/--model` and nothing beside it.
 *     An effort picked in a panel is therefore DROPPED here rather than turned
 *     into a flag that would exit 42, and `GEMINI_HAS_NO_EFFORT_FLAG` is what
 *     the surfaces say so with.
 *  5. **`ask_user` IS `deny` IN HEADLESS** (its own policy-engine reference, in
 *     those words). So `--approval-mode default` on an unattended turn does not
 *     mean "it will ask" — it means every tool call that would have asked is
 *     refused. That is the same shape as Codex's read-only sandbox and it is
 *     said out loud for the same reason.
 *  6. **PLAN MODE IS NOT A RESTRAINT WHEN NOBODY IS WATCHING.** Its own plan-mode
 *     reference: in non-interactive execution, exiting Plan Mode "automatically
 *     switches to YOLO mode instead of the standard Default mode". A headless
 *     turn started in plan can therefore end up executing with every tool
 *     auto-approved — the exact trap `agyModeNote` exists for on the other
 *     engine, and it must not be discovered by a written file.
 *
 * Exit codes, from the same docs: `0` success · `1` general error or API
 * failure · `42` input error (invalid prompt or arguments) · `53` turn limit.
 *
 * Pure: argument vocabularies and mapping tables. No spawning, no vscode.
 */

/**
 * ‼️ THE FLAG THIS ENGINE DOES NOT HAVE — kept as a named export so the
 * measurement is testable rather than a comment somebody trims. A picker that
 * offers effort here is offering a box with no referent.
 */
export const GEMINI_HAS_NO_EFFORT_FLAG = true;

/** …and the one it has that no other engine here does (measurement 2). */
export const GEMINI_CAN_PRESET_SESSION_ID = true;

/**
 * What a permission mode is called on this engine.
 *
 * ‼️ `default` IS NOT "IT WILL ASK" ON AN UNATTENDED TURN (measurement 5): with
 * nobody to prompt, `ask_user` resolves to `deny`. The mapping is deliberately
 * the same shape as the Codex one — conservative at the top — because the
 * nearest honest thing an engine that cannot ask can do is refuse.
 */
export const GEMINI_APPROVAL: Record<string, string> = {
    default: 'default',
    plan: 'plan',
    acceptEdits: 'auto_edit',
    bypassPermissions: 'yolo'
};

export function geminiApprovalFor(mode: string | undefined): string {
    return GEMINI_APPROVAL[String(mode ?? '').trim()] ?? 'default';
}

/** One line a surface can show beside the picker, so a mode that means
 *  something else here says so instead of looking identical. */
export function geminiModeNote(mode: string | undefined): string {
    const approval = geminiApprovalFor(mode);
    if (approval === 'plan') {
        // measurement 6 — the one that would otherwise be found out by a diff
        return 'Gemini is asked to research read-only and plan first. ‼️ Unattended, this is not a restraint to the end: '
            + 'its own reference says a non-interactive run that LEAVES plan mode switches to YOLO rather than back to default, '
            + 'so the same turn can go on to execute with every tool auto-approved.';
    }
    if (approval === 'auto_edit') {
        return 'Gemini may edit files without asking; anything else still goes through its policy engine.';
    }
    if (approval === 'yolo') {
        return 'Every tool call is auto-approved (--approval-mode yolo). Nothing will stop and ask you.';
    }
    return 'Gemini cannot stop and ask on an unattended turn, and its policy engine turns "ask the user" into "deny" there — '
        + 'so this turn can look, and is refused anything that needed approval.';
}

/**
 * The model flag. There is no effort beside it (measurement 4) — an effort the
 * caller carried from another engine is dropped HERE, in one place, rather than
 * at four call sites that would each have to remember.
 */
export function geminiModelArgs(model: string | undefined): string[] {
    const m = String(model ?? '').trim();
    return m ? ['-m', m] : [];
}

export interface GeminiTurnInit {
    /** The conversation to continue — the full UUID. Absent = a first turn. */
    thread?: string;
    /**
     * ‼️ THE ID A FIRST TURN IS TOLD TO USE (measurement 2). Supplied by the
     * caller rather than generated here so this file stays pure and testable;
     * an engine that cannot preset an id simply ignores the field.
     */
    newThread?: string;
    model?: string;
    permissionMode?: string;
    /** Folders beside the working directory. The working directory itself is
     *  the process's own cwd and is NOT passed as a flag — this CLI takes it
     *  from where it was started, unlike `agy`, which ignores it. */
    includeDirs?: string[];
}

/**
 * The command line for ONE hosted turn — the Console's shape.
 *
 * `stream-json` is what the Console needs (`geminiproto.ts` translates it); the
 * prompt is NOT here, because it travels on stdin (measurement 1).
 */
export function geminiArgs(o: GeminiTurnInit): string[] {
    return [
        '--output-format', 'stream-json',
        ...geminiModelArgs(o.model),
        '--approval-mode', geminiApprovalFor(o.permissionMode),
        ...(o.thread
            ? ['--resume', o.thread]
            : o.newThread ? ['--session-id', o.newThread] : []),
        ...includeArgs(o.includeDirs)
    ];
}

export interface GeminiRunInit {
    model?: string;
    permissionMode?: string;
    includeDirs?: string[];
    /** ‼️ S-19 — the conversation this unattended run continues. `--resume <id>`
     *  is an ordinary flag on this CLI (measurement 3), so unlike Codex the
     *  headless shape needs no separate subcommand. */
    resume?: string;
}

/**
 * ONE unattended run — a headless task.
 *
 * ‼️ `--output-format json` HERE, NOT `stream-json`. Measured from its own
 * `JsonFormatter`: one object, `{session_id, response, stats, error?,
 * warnings?}` — which is the envelope a task archive wants, and which carries
 * the session id so the run can be matched to its transcript afterwards without
 * guessing at a filename. The event stream is for the Console, where something
 * is translating it; in an archive a person reads, JSONL is a log dump where a
 * conversation was wanted.
 */
export function geminiRunArgs(o: GeminiRunInit): string[] {
    return [
        '--output-format', 'json',
        ...geminiModelArgs(o.model),
        '--approval-mode', geminiApprovalFor(o.permissionMode),
        // ‼️ S-19 — and the envelope still carries `session_id`, so a resumed
        // run can be checked against the conversation it claimed to continue
        // rather than trusted to have done so.
        ...(String(o.resume ?? '').trim() ? ['--resume', String(o.resume).trim()] : []),
        ...includeArgs(o.includeDirs)
    ];
}

/**
 * The INTERACTIVE line — the TUI a person sits in.
 *
 * No `--output-format`: that is what turns this into a machine-readable run.
 * `--resume <id>` and `--resume latest` are ordinary flags here, so unlike Codex
 * a terminal launch on this engine can genuinely continue a conversation
 * (measurement 3). A first prompt that should be RUN and then left open is
 * `-i/--prompt-interactive`, which the launcher appends — it is the one value
 * that may contain anything at all, so it is never built into this list.
 */
export function geminiTuiArgs(
    o: GeminiRunInit & { conversation?: string; continueLast?: boolean }
): string[] {
    return [
        ...(o.conversation
            ? ['--resume', o.conversation]
            : o.continueLast ? ['--resume', 'latest'] : []),
        ...geminiModelArgs(o.model),
        '--approval-mode', geminiApprovalFor(o.permissionMode),
        ...includeArgs(o.includeDirs)
    ];
}

function includeArgs(dirs: string[] | undefined): string[] {
    const list = (dirs ?? []).map(d => String(d ?? '').trim()).filter(Boolean);
    return list.length ? ['--include-directories', list.join(',')] : [];
}

/**
 * ‼️ WHAT GEMINI HAS NO CHANNEL FOR — said out loud instead of dropped.
 *
 * Like Codex and Antigravity, this CLI takes no extra system prompt: its inputs
 * are the prompt, `GEMINI.md` in the workspace and its own settings. So a
 * project brief rides INSIDE the first prompt here too, and the surfaces say so
 * rather than letting a session look briefed when it is not.
 *
 * It also has NO IMAGE FLAG on the non-interactive path — an attachment can only
 * be named as a path, which for a picture means the agent is told where it is
 * and cannot look at it. Stated, not hidden.
 */
export const GEMINI_HAS_NO_SYSTEM_PROMPT_FLAG = true;
export const GEMINI_HAS_NO_IMAGE_CHANNEL = true;

/** The exit codes this CLI documents, so a caller can tell "you asked wrong"
 *  from "it broke" without pattern-matching prose. */
export const GEMINI_EXIT = {
    ok: 0,
    error: 1,
    /** invalid prompt or arguments — a bug HERE, not on the account */
    badInput: 42,
    turnLimit: 53
} as const;
