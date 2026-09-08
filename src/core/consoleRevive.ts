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

/**
 * ‼️ X-266 — THE SCROLLBACK A REVIVE CANNOT REBUILD YET, AND WHY IT IS A
 * PLACEHOLDER RATHER THAN A FAILURE.
 *
 * The revive runs inside `activate()`. The transcript index is built by an
 * ASYNC scan that has not answered a single id by then, so the read that
 * rebuilds a card's scrollback came back with "Agent Farm does not have this
 * session in its index yet" — EVERY time, for EVERY card. Not a race and not a
 * corpus problem: the index's map is empty until its scan swaps a new one in.
 *
 * The user's report is the exact shape of it: the session came back, said it
 * had been taken up where it left off, and showed nothing above that line.
 * Ending the card and resuming it from the shelf was the only way back to the
 * conversation — which is the manual step the whole feature exists to remove.
 *
 * So the placeholder is kept (it is honest, and the seat is live while it
 * shows), and it is SWAPPED for the real scrollback the moment the index can
 * answer. Nothing restarts for this, and nothing the card has said since is
 * dropped: the row is replaced where it stands, so the revive notice and
 * anything the reader has already typed keep their order.
 */
export const REVIVE_PLACEHOLDER_ID = 'xh-note';

/**
 * ‼️ B-03.7 — A REVIVE BROUGHT THE CONVERSATION BACK AND NOT THE WORK.
 *
 * X-230's own header says the thing it exists to stop is a DEADLOCK on an
 * unattended night shift: the loop stops until a human comes back. X-232 got
 * the card back into its seat with its whole transcript — and then it sat
 * `idle`, because `reviveInit` carries no prompt and nothing spoke into it. So
 * the night shift still stopped, one step later than before, and the card even
 * said "ask again" to a room with nobody in it. The user's decision, in their
 * own words: **kaldığı yerden devam etsin.**
 *
 * ‼️ AND IT IS SENT TO THE SESSIONS THAT WERE WORKING, NOT TO EVERY SEAT.
 * `midTurn` is already measured for the notice — a session that was ANSWERING
 * when the host went down is one with work in flight, and continuing is what it
 * would have done. A session sitting `idle` was waiting for a human; nudging
 * that one would not be resuming work, it would be inventing it.
 *
 * The last clause is not politeness. A resumed model that cannot tell where it
 * was is exactly the one that will make something up, and this whole audit
 * exists because agents made things up rather than saying they could not tell.
 */
export const REVIVE_NUDGE =
    'Agent Farm restarted the extension host and took this session up again in the same seat — '
    + 'same conversation, same id. You were mid-turn when it went down, so the one answer you '
    + 'were writing was lost on the way; nothing before it is missing. Carry on from where you '
    + 'were. If you cannot tell from the conversation above where that was, say so and stop — '
    + 'do not guess at work you may already have done.';

/** A history that is nothing but the placeholder — i.e. a read that has not
 *  happened yet rather than a conversation. Anything else is left alone. */
export function isPlaceholderHistory(rows: { id: string }[] | undefined): boolean {
    return !!rows && rows.length === 1 && rows[0].id === REVIVE_PLACEHOLDER_ID;
}

/**
 * The placeholder's position, filled with what was finally read. `null` when
 * there is nothing to do — no placeholder on the card, or nothing to put in its
 * place — so a caller never has to decide whether a rewrite was a change.
 */
export function swapPlaceholder<T extends { id: string }>(
    messages: T[] | undefined, rows: T[] | undefined,
    placeholderId: string = REVIVE_PLACEHOLDER_ID
): T[] | null {
    if (!messages?.length || !rows?.length) { return null; }
    const at = messages.findIndex(m => m.id === placeholderId);
    if (at < 0) { return null; }
    const next = messages.slice();
    next.splice(at, 1, ...rows);
    return next;
}
