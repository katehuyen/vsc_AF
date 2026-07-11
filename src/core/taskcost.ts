// Agent Farm — task ↔ session cost attribution (Z4).
// Headless tasks run `claude -p` in the agent's folder, which writes a normal
// transcript under ~/.claude/projects — the session index already prices it.
// This matches a finished task to "the one claude session that started and
// ended inside the task's lifespan". Ambiguity (two candidate sessions, e.g.
// an interactive session running in the same agent folder at the same time)
// yields an honest no-match rather than a guessed dollar figure.
// Pure node (no vscode import) — testable.

export interface CostTaskSpan {
    startedAt?: number;
    endedAt?: number;
}

export interface CostSessionLite {
    file: string;
    firstTs: number;
    lastTs: number;
    cost: number;
    source?: string;
    isSidechain?: boolean;
}

/**
 * The matched session, or undefined when there is none / more than one.
 * tolMs absorbs clock skew between task bookkeeping and transcript timestamps.
 */
export function matchTaskSession<T extends CostSessionLite>(
    task: CostTaskSpan,
    sessions: T[],
    tolMs = 120_000
): T | undefined {
    if (!task.startedAt || !task.endedAt) { return undefined; }
    const started = task.startedAt, ended = task.endedAt;
    const candidates = sessions.filter(s =>
        !s.source && !s.isSidechain && s.firstTs > 0
        && s.firstTs >= started - tolMs
        && s.firstTs <= ended + 15_000
        && s.lastTs <= ended + tolMs);
    return candidates.length === 1 ? candidates[0] : undefined;
}
