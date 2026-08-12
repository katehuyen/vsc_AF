// Agent Farm — task ↔ session cost attribution (Z4).
// A headless task runs its engine's own one-shot mode in the agent's folder,
// which leaves a transcript the session index already reads — `claude -p` under
// ~/.claude/projects, a Codex rollout under ~/.codex/sessions, and so on.
// This matches a finished task to "the one session ON THAT ENGINE that started
// and ended inside the task's lifespan". Ambiguity (two candidate sessions,
// e.g. an interactive session running in the same agent folder at the same
// time) yields an honest no-match rather than a guessed figure.
// Pure node (no vscode import) — testable.

export interface CostTaskSpan {
    startedAt?: number;
    endedAt?: number;
    /**
     * ‼️ WHICH ENGINE RAN IT (X-35). `FarmTask.engine`; empty = claude, the
     * same absence `SessionInfo.source` uses. A task is only ever matched
     * against its own engine's sessions — this is what stops a Claude task
     * from picking up the Codex conversation that happened to overlap it, and
     * it is why the pool handed in may be the WIDE one.
     */
    engine?: string;
}

export interface CostSessionLite {
    file: string;
    firstTs: number;
    lastTs: number;
    cost: number;
    source?: string;
    isSidechain?: boolean;
}

/** The engine a task/session belongs to; absence means Claude on both sides. */
function engineKey(v: string | undefined): string {
    return v || 'claude';
}

/**
 * The matched session, or undefined when there is none / more than one.
 * tolMs absorbs clock skew between task bookkeeping and transcript timestamps.
 *
 * ‼️ Pass `sessions` WIDE (`allWithExternal` / `forAgentWithExternal`). Handing
 * in the Claude-only list means a task run on any other engine can never match
 * and stays priceless for ever, with no surface saying why — the exact failure
 * X-35 exists to remove. The engine filter below, not the caller's pool, is
 * what keeps engines from being confused for one another.
 *
 * A matched session whose engine reports no price yields `cost: 0`. That is the
 * documented contract (X-19): zero means "this engine states no price", never
 * "this run was cheap", and the surfaces that print it say so.
 */
export function matchTaskSession<T extends CostSessionLite>(
    task: CostTaskSpan,
    sessions: T[],
    tolMs = 120_000
): T | undefined {
    if (!task.startedAt || !task.endedAt) { return undefined; }
    const started = task.startedAt, ended = task.endedAt;
    const want = engineKey(task.engine);
    const candidates = sessions.filter(s =>
        engineKey(s.source) === want && !s.isSidechain && s.firstTs > 0
        && s.firstTs >= started - tolMs
        && s.firstTs <= ended + 15_000
        && s.lastTs <= ended + tolMs);
    return candidates.length === 1 ? candidates[0] : undefined;
}
