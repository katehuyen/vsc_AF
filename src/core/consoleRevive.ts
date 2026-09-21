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
    /** X-109 — the route is the resume gate's answer and is taken as it is,
     *  an absent providerId included; carried so a revived card does not
     *  fall through to the agent's standing route. */
    routePinned?: boolean;
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
    /** X-109 — the route is the resume gate's answer and is taken as it is,
     *  an absent providerId included; carried so a revived card does not
     *  fall through to the agent's standing route. */
    routePinned?: boolean;
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
    if (row.routePinned) { out.routePinned = true; }
    if (row.account) { out.account = row.account; }
    // Not dimensions, but facts about THIS session: the project it was started
    // under (its own, never the window's — the context does not survive a
    // resume, so this spawn is the one that re-tells it) and whether it carried
    // the skills discipline.
    //
    // ‼️ X-267 — BOTH OF THESE ARE PART OF THE PIN'S KEY, which is why they are
    // carried rather than re-derived. `resume` above says which conversation to
    // re-tell with the SAME BYTES; these two say which file those bytes were.
    // A revive that guessed the window's project, or the agent's current
    // Superpowers default, would look for a pin that does not exist and
    // regenerate the system prompt — which is the whole defect, in the one path
    // it was actually measured in.
    if (row.projectId) { out.projectId = row.projectId; }
    if (row.superpowers !== undefined) { out.superpowers = row.superpowers; }
    return out;
}

/**
 * ‼️ THE SCROLLBACK A REVIVE CANNOT REBUILD YET, AND WHY IT IS A
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

/**
 * ‼️ X-310 — AND IT GOES TO THE SEAT THAT ASKED FOR THE RESTART, NOBODY ELSE.
 *
 * B-03.7 narrowed the nudge from every seat to every MID-TURN seat, which is
 * one step short of the truth: being mid-turn says a turn was cut, not that
 * this seat wanted it cut. Measured 2026-09-15 — one session asked for the
 * restart and a second, on another card and mid file-write, was taken down with
 * it; both were then handed the same "carry on from where you were", and the
 * one that had consented to nothing woke up and acted on guesses in a
 * conversation whose last exchange had been destroyed under it.
 *
 * The asker is the one place continuing is resuming rather than inventing: it
 * made the call, its last words before it are its own instructions to itself,
 * and it knew the seat was going down. A session cut without being asked is
 * brought back whole and left ALONE — seat live, scrollback restored, nothing
 * spoken into it — so the next word in it is the user's. That is not a lesser
 * outcome: an agent nobody has told what happened cannot tell a lost reply from
 * a reply it never wrote, and this whole family of items exists because the
 * answer to "I cannot tell" was being improvised instead of said.
 *
 * ‼️ AND THE CARD SAYS SO ITSELF, in the note above the scrollback, or the
 * silence would be the one thing the reader cannot interpret: they would see a
 * card that had been answering, is not answering now, and says nothing about
 * why. This is the sentence that replaces "it is being asked to carry on".
 */
export const REVIVE_HELD =
    ' It was ANSWERING when the host went down, so that one reply was lost on the way —'
    + ' nothing before it is missing. This session did not ask for the restart, so nothing has'
    + ' been said into it: it is waiting for you rather than guessing where it was.';

/**
 * ‼️ X-349 — AND THE ASKER IS NUDGED WHETHER OR NOT ITS TURN WAS CUT.
 *
 * X-310 narrowed the nudge to the seat that ASKED, which was right, and left
 * `midTurn` standing beside it, which was not. The two conditions answer
 * different questions: `midTurn` says a reply was destroyed, `itAsked` says
 * this seat consented. Requiring both meant the nudge only ever went out on the
 * `now` path — where the restart fires inside the asking turn — and NEVER on
 * the `armed` one, where it waits for somebody else's turn to end and by then
 * the asker is between turns. Measured 2026-09-21: a restart armed behind
 * another console fired eight minutes later, both copies came back, and the
 * session that had asked for it sat silent with its last instruction to itself
 * unread. The contract that the last words before a restart are what the
 * resumed copy acts on was therefore broken on the path agents actually use.
 *
 * So consent is the whole test. What changes with `midTurn` is only what is
 * TRUE about the gap: a cut turn lost a reply, an idle one lost nothing.
 */
export const REVIVE_NUDGE_IDLE =
    'Agent Farm restarted the extension host and took this session up again in the same seat — '
    + 'same conversation, same id. You ASKED for this restart, and it fired between your turns '
    + 'rather than during one, so nothing was lost: the conversation above is whole. Carry on — '
    + 'the last thing you said before it is what you left yourself to do. If you cannot tell from '
    + 'the conversation above what that was, say so and stop — do not guess at work you may '
    + 'already have done.';

/** The card's own note when the asker was cut mid-answer. */
export const REVIVE_ASKED_MIDTURN =
    ' It was ANSWERING when the host went down, so that one reply was'
    + ' lost on the way — nothing before it is missing, and it is being'
    + ' asked to carry on from where it was.';

/** …and when the asker was between turns: nothing was lost, and it still goes on. */
export const REVIVE_ASKED_IDLE =
    ' It ASKED for this restart and was between turns when it fired, so no reply was lost —'
    + ' and it is being asked to carry on from where it was.';

export interface ReviveSpeech {
    /** what is said INTO the seat, or `null` when it is deliberately left silent */
    nudge: string | null;
    /** the sentence the card's own revive note ends with; `''` adds nothing */
    note: string;
}

/**
 * The whole decision, in one place, so the wiring cannot hold a different
 * opinion from the notice the reader sees: consent decides whether anything is
 * said, `midTurn` decides what is said about the gap.
 */
export function reviveSpeech(o: { midTurn: boolean; itAsked: boolean }): ReviveSpeech {
    if (o.itAsked) {
        return o.midTurn
            ? { nudge: REVIVE_NUDGE, note: REVIVE_ASKED_MIDTURN }
            : { nudge: REVIVE_NUDGE_IDLE, note: REVIVE_ASKED_IDLE };
    }
    // X-310 — cut without being asked: brought back whole, left alone, told so.
    return { nudge: null, note: o.midTurn ? REVIVE_HELD : '' };
}

/**
 * ‼️ X-349 — WHAT A REVIVED CARD IS DOING WHILE IT SAYS `starting`.
 *
 * The persistent CLI announces itself (`system:init`) on its first TURN, not on
 * boot, so a resumed seat nobody speaks into never leaves `starting`. That is
 * not cosmetic in two ways: the reader sees a card that looks stuck, and
 * `starting` is in `SESSION_IN_FLIGHT` (selfRestart.ts), so a silent revived
 * card blocks every LATER restart — the fleet's own door held shut by a session
 * that is doing nothing at all.
 *
 * The honest signal is the CLI's own live registry (`<config>/sessions/<pid>.json`,
 * cliSessions.ts): it is written when the process is up and removed when it
 * dies. So the settle waits for the engine to say it exists and asserts nothing
 * itself — and it gives up rather than waiting for ever, because a process that
 * never registers is a failure to report, not a state to invent.
 */
export type SettleVerdict = 'wait' | 'settle' | 'stop';

export function settleVerdict(o: {
    /** the seat's status now — gone means the card was forgotten */
    status?: string;
    closed?: boolean;
    /** the CLI's registry holds this session id */
    registered: boolean;
    /** polls left after this one */
    triesLeft: number;
}): SettleVerdict {
    // Anything that is no longer a seat waiting to be born ends the watch: the
    // card spoke for itself, was ended, or is gone.
    if (!o.status || o.closed || o.status !== 'starting') { return 'stop'; }
    if (o.registered) { return 'settle'; }
    return o.triesLeft > 0 ? 'wait' : 'stop';
}

export interface ReviveIntent {
    /** the asking session's card, when this restart will bring it back */
    seat?: string;
    agentName?: string;
    /** whether the revived copy will be spoken into */
    nudge: boolean;
    /** one sentence the caller can act on, in the answer that armed the wait */
    note: string;
}

/**
 * ‼️ X-349 — THE ARMED ANSWER SAYS WHAT WILL HAPPEN TO THE CALLER'S OWN SEAT.
 *
 * `armed` means "not yet": the caller goes on working and the restart fires
 * later, out of its control. Whether its last words are an instruction to its
 * resumed self or are simply lost is the one fact that changes what it should
 * write next — and it was not in the answer at all.
 */
export function reviveIntent(o: {
    plan?: RevivePlan; askedBy?: string; resume: boolean;
}): ReviveIntent {
    if (!o.resume) {
        return {
            nudge: false,
            note: 'resume was not asked for, so no card is taken up again on the other side and '
                + 'nothing is said into anything — every live seat goes down with the host.'
        };
    }
    const askedBy = String(o.askedBy ?? '').trim();
    if (!askedBy) {
        return {
            nudge: false,
            note: 'no session named itself as the asker (a panel button or a command has none), so '
                + 'every revived card comes back held and silent — nothing will be said into any of them.'
        };
    }
    const row = (o.plan?.rows ?? []).find(r => r.sessionId === askedBy);
    if (row) {
        return {
            seat: row.id, agentName: row.agentName, nudge: true,
            note: `the seat that asked (${row.agentName}) comes back in the same seat and IS handed the `
                + 'revive nudge, in a turn or between turns — so the LAST thing you say before the '
                + 'restart fires is the instruction the resumed copy will follow. Write the '
                + 'verification steps there, not after.'
        };
    }
    const skip = (o.plan?.skipped ?? []).find(s => s.id === askedBy || s.agentName === askedBy);
    return {
        nudge: false,
        note: skip
            ? `the seat that asked cannot be resumed — ${skip.reason}`
            : 'the session that asked is not a live Console card here (a terminal, a task or another '
            + 'window), so there is nothing to revive it into and nothing will be said into it.'
    };
}

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
