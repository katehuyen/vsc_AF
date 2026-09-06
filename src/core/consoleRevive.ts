/**
 * X-232 — THE CONSOLE SESSIONS THAT SURVIVE A RESTART OF THE EXTENSION HOST.
 *
 * X-230 measured the loss and drew the only honest conclusion available at the
 * time: a Console card's handle lives in this process's memory, so restarting
 * the host loses every live one — therefore wait for the window to go quiet, or
 * say `force` and lose the conversation. This is the third way. What is running
 * is written down before the process dies (into the stamp X-230 already writes
 * synchronously) and taken up again on the other side, in the same seat, by the
 * resume path the "continue this card" command has used all along.
 *
 * ‼️ A RESURRECTION IS ONLY AS HONEST AS ITS DIMENSIONS. A session brought back
 * on a different account, route, model or permission mode is not that session —
 * it is a new one wearing its transcript, and nothing on the card would say so.
 * That is why the row here is not a hand-written field list: the test derives it
 * from `RunDimensions` itself, so a dimension added there fails the build until
 * a revived session carries it too.
 *
 * ‼️ AND TWO THINGS ARE REFUSED RATHER THAN FAKED:
 *   · a session the engine never named has nothing to resume BY — it is reported
 *     as lost, not quietly dropped, because the reader saw a card there;
 *   · a session killed mid-turn comes back with everything that was SAID and
 *     without the answer that was being said. It is marked, so the notice can
 *     admit it instead of letting the reader wait for a reply nobody is writing.
 */

/** The live shape this reads — `ConsoleSessionState`, named structurally so the
 *  decision stays testable without a window. */
export interface ReviveSource {
    id: string;
    agentId: string;
    agentName: string;
    cwd: string;
    status: string;
    sessionId?: string;
    engine?: string;
    model?: string;
    effort?: string;
    permissionMode?: string;
    providerId?: string;
    tier?: string;
    account?: string;
    projectId?: string;
    superpowers?: boolean;
}

export interface ReviveRow extends ReviveSource {
    sessionId: string;
    /** killed while it was answering: the transcript survives, the reply does not */
    midTurn: boolean;
}

export interface ReviveSkip {
    id: string;
    agentName: string;
    reason: string;
}

/** The card as `ConsoleHost.start` takes it back — the dimensions and the two
 *  session facts, and deliberately nothing that has to be read off a transcript. */
export interface ReviveInit {
    agentId: string;
    agentName: string;
    cwd: string;
    resume?: string;
    engine?: string;
    model?: string;
    effort?: string;
    permissionMode?: string;
    providerId?: string;
    tier?: string;
    account?: string;
    projectId?: string;
    superpowers?: boolean;
}

export interface RevivePlan {
    rows: ReviveRow[];
    skipped: ReviveSkip[];
}

/** A card whose process is already gone is not a loss this can prevent. */
const DEAD = new Set(['ended', 'error']);

export function planRevive(sessions: ReviveSource[] | undefined): RevivePlan {
    const rows: ReviveRow[] = [];
    const skipped: ReviveSkip[] = [];
    for (const s of sessions ?? []) {
        if (DEAD.has(String(s.status))) { continue; }
        if (!s.sessionId) {
            skipped.push({
                id: s.id,
                agentName: s.agentName || s.id,
                reason: `${s.engine || 'the CLI'} had not given this session an id yet, so there is `
                    + 'nothing to resume it by — it goes down with the host.'
            });
            continue;
        }
        rows.push({ ...s, sessionId: s.sessionId, midTurn: String(s.status) === 'working' });
    }
    return { rows, skipped };
}

/**
 * The row as the host's `start()` takes it. History and what the session already
 * spent are deliberately NOT here: both are read off the transcript index at the
 * wiring, and inventing them in a pure function would mean two places that can
 * disagree about what a session said.
 *
 * ‼️ A TIER WITHOUT A ROUTE IS DROPPED, exactly as `runExtras` drops it: `opus`
 * is a different model on two routes, so a tier with nothing to resolve against
 * would let the revived card claim a decision that cannot be made.
 */
export function reviveInit(row: ReviveSource & { sessionId?: string }): ReviveInit {
    const out: ReviveInit = {
        agentId: row.agentId,
        agentName: row.agentName,
        cwd: row.cwd,
        resume: row.sessionId
    };
    if (row.engine) { out.engine = row.engine; }
    if (row.model) { out.model = row.model; }
    if (row.effort) { out.effort = row.effort; }
    if (row.permissionMode) { out.permissionMode = row.permissionMode; }
    if (row.providerId) {
        out.providerId = row.providerId;
        if (row.tier) { out.tier = row.tier; }
    }
    if (row.account) { out.account = row.account; }
    // Not dimensions, but facts about THIS session: the project it was started
    // under (its own, never the window's — the context does not survive a
    // resume, so this spawn is the one that re-tells it) and whether it carried
    // the skills discipline.
    if (row.projectId) { out.projectId = row.projectId; }
    if (row.superpowers !== undefined) { out.superpowers = row.superpowers; }
    return out;
}
