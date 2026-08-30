// Agent Farm — S-31: what Agent Farm STARTED, written down before it looks for it.
//
// ‼️ THE BUG THIS EXISTS FOR, AND WHY IT WAS INVISIBLE.
//
// `SessionIndex.assignAgent` decides whose session a transcript is by asking
// where it ran: a cwd under the agent's own folder gets the agent's id, and
// anything else gets none. With `includeUnmatchedProjects` off — the default —
// a transcript with no agent is DROPPED from the index entirely. That is a fine
// rule for a conversation somebody had in a random folder and a catastrophic
// one for a run the farm started itself: an automation task whose `workDir` is
// a code repo is, by that test, a stranger. It vanished from `sessions.find`,
// from the Sessions page's Auto filter, from the Console's Resume list and from
// every project and agent table, while its 3.2 MB transcript sat on disk.
//
// And it could not be repaired downstream, because the repair depended on the
// thing that was missing: the launcher map is fed from a task's matched
// transcript, the match runs over `forAgentWithExternal(agentId)`, and a dropped
// session is in no agent's list. Binding needed a match; matching needed a
// binding.
//
// A LaunchBinding breaks that circle by being written at the SPAWN, out of what
// the launcher already knows — which agent, which project, which mechanism,
// which engine, which folder, from when — and by being consulted BEFORE the
// scope filter rather than after it. The farm never has to deduce that a run is
// its own; it said so at the time.
//
// Pure node (no vscode import) — testable.

/** How a binding found its session, in descending order of certainty. */
export type BindingProof =
    /** the id was known before the process started (a resumed conversation, or
     *  an engine that lets its id be chosen) */
    | 'declared'
    /** the engine published its id while it ran and the adapter caught it */
    | 'reported'
    /** nothing published one, so engine + folder + lifespan named exactly one */
    | 'matched';

/**
 * One run Agent Farm started, as it was known at the moment of the spawn.
 *
 * ‼️ `cwd` is the folder the process was actually spawned in — `task.workDir`
 * where there is one and the agent's own folder otherwise. Writing the agent's
 * folder for a run that happened somewhere else is the whole bug: the binding
 * is evidence, and evidence has to be what was true.
 */
export interface LaunchBinding {
    /** the run this is about — a task id; every mechanism produces a task */
    taskId: string;
    /**
     * ‼️ X-102 — WHICH SPAWN, and therefore which MANIFEST.
     *
     * A binding says which run produced a transcript; the manifest says what
     * that run was set up to be — the route, the profile revision, the catalog,
     * what was requested as against what came back. Neither is derivable from
     * the other and the transcript records neither (measured: a Claude JSONL
     * carries sessionId, cwd, version, gitBranch, userType, entrypoint,
     * permissionMode and promptSource, and nothing else that matters here). The
     * launchId is the one field that joins them.
     *
     * ‼️ AND IT IS NOT A SECOND `taskId`. A task can be retried, and a retry is
     * a NEW spawn with its own route resolution and its own manifest under the
     * same task; keying the manifest off `taskId` would make the second run
     * silently claim the first one's setup. Absent on every binding written
     * before this item, which is what `manifestOf` returning `undefined` means.
     */
    launchId?: string;
    agentId: string;
    agentName: string;
    projectId?: string;
    /** the mechanism a person would name: what STARTED it, not what it runs on */
    kind: 'task' | 'schedule' | 'trigger' | 'workflow' | 'mission';
    /** the schedule/trigger/workflow/mission's own id, where there is one */
    launcherId?: string;
    /** what a person calls it — the schedule's name, the task's title */
    label: string;
    /**
     * ‼️ X-125 — the MISSION's own name, on `kind === 'mission'` only. The
     * binding already carried which mission (`launcherId`) and `applyBinding`
     * copied neither it nor this onto the session, so a session the binding
     * itself proved was a mission's could still read as nobody's. `label` is
     * the delegation's title and is not a substitute: it names the step, not
     * the run the step belongs to.
     */
    launcherTitle?: string;
    /** empty/absent = claude, the same absence SessionInfo.source uses */
    engine?: string;
    cwd: string;
    startedAt: number;
    /** absent while the run is still going */
    endedAt?: number;
    /** known without deduction — see BindingProof */
    sessionId?: string;
    transcriptFile?: string;
    /** 'headless' | 'interactive' */
    mode?: string;
}

/** The little a session has to be able to say to be tested against a binding. */
export interface BindableSession {
    sessionId: string;
    file: string;
    cwd?: string;
    /** the engine, in SessionInfo's vocabulary; absent = claude */
    source?: string;
    firstTs: number;
    lastTs: number;
    isSidechain?: boolean;
}

/** The engine a run/session belongs to; absence means Claude on both sides. */
const engineKey = (v: string | undefined): string => (v || 'claude').toLowerCase();

/** Forward slashes, no trailing one, case-folded — Windows compares paths that
 *  way and every path in this file arrives from a different writer. */
export function normCwd(p: string | undefined): string {
    const s = String(p ?? '').trim().replace(/\\/g, '/').replace(/\/+$/, '');
    return s.toLowerCase();
}

/** Is a session's folder inside (or equal to) the folder the run was spawned in? */
function underCwd(sessionCwd: string | undefined, bindingCwd: string): boolean {
    const s = normCwd(sessionCwd), b = normCwd(bindingCwd);
    if (!s || !b) { return false; }
    return s === b || s.startsWith(b + '/');
}

export interface BindingHit {
    binding: LaunchBinding;
    proof: BindingProof;
}

/**
 * ‼️ AMBIGUITY IS AN ANSWER, NOT A COIN TOSS. Two runs of the same engine in the
 * same folder overlapping in time genuinely cannot be told apart from the
 * outside, and picking one would put a real transcript under the wrong task's
 * name — which is worse than the gap, because a gap is visible and a wrong
 * attribution is not. The candidates come back so a caller can record WHY it
 * did not decide.
 */
export interface BindingAmbiguity {
    candidates: LaunchBinding[];
    why: string;
}

/**
 * Which run produced this transcript.
 *
 * The order is the order of certainty: an id somebody wrote down beats an id
 * deduced from the clock, always. `tolMs` absorbs the skew between the farm's
 * own bookkeeping and the timestamps inside a transcript.
 *
 * `now` is passed in rather than read, because a binding with no `endedAt` is a
 * run still going and its window has to end somewhere.
 */
export function bindSession(
    session: BindableSession,
    bindings: readonly LaunchBinding[],
    now: number = Date.now(),
    tolMs = 120_000
): BindingHit | BindingAmbiguity | undefined {
    if (!session || session.isSidechain) { return undefined; }
    const id = String(session.sessionId ?? '').trim();

    // 1. DECLARED — the id or the file was known before anything was deduced.
    const declared = bindings.find(b =>
        (!!b.sessionId && !!id && b.sessionId === id)
        || (!!b.transcriptFile && !!session.file && normCwd(b.transcriptFile) === normCwd(session.file)));
    if (declared) { return { binding: declared, proof: declared.sessionId === id ? 'declared' : 'reported' }; }

    // 2. MATCHED — engine, folder and lifespan, and only when exactly one fits.
    if (!session.firstTs) { return undefined; }
    const want = engineKey(session.source);
    const candidates = bindings.filter(b => {
        if (engineKey(b.engine) !== want) { return false; }
        // A binding that already owns a different transcript is spoken for.
        if (b.sessionId && b.sessionId !== id) { return false; }
        // ‼️ A SESSION THAT STATES NO FOLDER CANNOT CONTRADICT ONE (S-37).
        //
        // The folder test is here to stop a binding claiming a transcript from
        // somewhere else — it is a REFUTATION, and an absent cwd refutes
        // nothing. Antigravity is the engine that has none: its step log
        // (`brain/<id>/…/transcript.jsonl`) records what happened and never
        // where, and the CLI's workspace cache only remembers the newest
        // conversation per folder. Requiring a cwd therefore left every
        // scheduled `agy` run unbound, and unbound means unattributed, and
        // unattributed means dropped by the scope filter — the run vanished
        // from the Sessions page altogether, which is exactly the report.
        // Ambiguity is still refused below, so this widens what CAN be decided
        // without letting anything be decided on less than one clear candidate.
        if (session.cwd && !underCwd(session.cwd, b.cwd)) { return false; }
        const ended = b.endedAt ?? now;
        // ‼️ S-41 — AN INTERACTIVE RUN IS CLAIMED AT ITS SPAWN OR NOT AT ALL.
        //
        // A headless run's window is the run: it starts, prints and exits, and
        // nothing else of ours is in that folder meanwhile. A terminal task is
        // the opposite — it opens in the AGENT'S OWN FOLDER, which is where the
        // user's own conversations live, and it stays open for as long as they
        // keep typing, so `endedAt` is absent and the window is "until now".
        // Matched on lifespan alone, such a binding would claim the next
        // session a person started there and stamp their own dialog 🤖 — the
        // very mislabelling S-37 was about, arriving from the other direction.
        // The run's prompt is on the command line, so its transcript begins at
        // the spawn; a conversation that began later is somebody else's.
        if (b.mode === 'interactive' && session.firstTs > b.startedAt + tolMs) { return false; }
        return session.firstTs >= b.startedAt - tolMs
            && session.firstTs <= ended + 15_000
            && session.lastTs <= ended + tolMs;
    });
    if (candidates.length === 1) { return { binding: candidates[0], proof: 'matched' }; }
    if (candidates.length > 1) {
        return {
            candidates,
            why: `${candidates.length} runs of ${want} in ${session.cwd || 'that folder'} overlap this `
                + 'transcript, so which one produced it cannot be told from the outside — '
                + 'the run that publishes its own session id is the one that will claim it'
        };
    }
    return undefined;
}

/** Narrowing helper — a hit carries a binding, an ambiguity carries candidates. */
export function isBindingHit(r: BindingHit | BindingAmbiguity | undefined): r is BindingHit {
    return !!r && 'binding' in r;
}

/**
 * ‼️ WHAT A BINDING IS ALLOWED TO CHANGE ABOUT A SESSION, AND WHAT IT IS NOT.
 *
 * It supplies an OWNER where the path test found none — that is the whole
 * repair. It never overrules a path match: an agent whose folder genuinely
 * contains the transcript is a stronger statement than a run record, and a
 * binding that could overwrite it would turn a bookkeeping slip into a session
 * filed under the wrong agent. The launcher, though, is applied either way,
 * because "which of our mechanisms started this" is a fact only the binding
 * has.
 */
export function applyBinding<T extends {
    agentId?: string; agentName?: string; projectId?: string; cwd?: string;
    launchedBy?: { kind: string; label: string; mode?: string; missionId?: string; missionTitle?: string };
}>(info: T, hit: BindingHit): T {
    if (!info.agentId) {
        info.agentId = hit.binding.agentId;
        info.agentName = hit.binding.agentName;
    }
    // …and WHERE it ran, on the same terms: supplied where the transcript says
    // nothing, never over the top of what it does say. The binding's cwd is the
    // folder the process was spawned in, so for an engine that records no
    // working directory at all (S-37, Antigravity) this is the only honest
    // answer there is — and without it the row has no folder to show.
    if (!info.cwd) { info.cwd = hit.binding.cwd; }
    if (!info.projectId && hit.binding.projectId) { info.projectId = hit.binding.projectId; }
    // ‼️ X-125 — AND WHICH MISSION, WHERE THE BINDING KNOWS. A mission binding
    // has carried the run's id in `launcherId` since it was written, and only
    // `kind`/`label`/`mode` were ever copied — so `sessionMission`, which reads
    // `missionId` and nothing else, did not count a session the binding itself
    // proved was a mission's. Added like every other field here: filled where
    // the session says nothing, never over the top of what it does say, so an
    // existing stamp (a fresher one, or the persisted snapshot) survives.
    const stamp = hit.binding.kind === 'mission' && hit.binding.launcherId
        ? {
            missionId: hit.binding.launcherId,
            ...(hit.binding.launcherTitle ? { missionTitle: hit.binding.launcherTitle } : {})
        }
        : undefined;
    if (!info.launchedBy) {
        info.launchedBy = {
            kind: hit.binding.kind,
            label: hit.binding.label,
            ...(hit.binding.mode ? { mode: hit.binding.mode } : {}),
            ...(stamp ?? {})
        };
    } else if (stamp && !info.launchedBy.missionId) {
        // ‼️ AND `kind` COMES WITH IT, because `sessionMission` reads BOTH: a
        // stamp under `kind: 'task'` is a fact nobody asks for, and the row it
        // was supposed to save still shows up as nobody's. The launcher the
        // session already had is the step; the binding is proof of the run the
        // step belongs to, and the run is what the mark is about. The label —
        // which names the step, and says more — is left exactly as it was.
        info.launchedBy = { ...info.launchedBy, kind: 'mission', ...stamp };
    }
    return info;
}
