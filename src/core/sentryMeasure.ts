import { RunProgress } from './retry';
import { TrackRecord } from './backlogTrack';
import { SessionFacts, shortSessionId, TouchedCode } from './sessionDiagnosis';
import type { HandoverDiscovery } from './handoverDiscovery';

/**
 * X-176 — MEASURING THE SESSION THAT JUST ENDED, and admitting what it could not.
 *
 * The driver is pure because somebody else measures; this is that somebody, and
 * it is the one place in the sentry where X-174's whole distinction can be
 * quietly lost. So the reading is done through injected functions — the same
 * shape as `resolveSentryTemplates(setting, exists, read)` — and every rule
 * about what an answer MEANS is tested without a disk anywhere near it.
 *
 * ‼️ A THING THAT COULD NOT BE READ IS `undefined`, NOT AN EMPTY ANSWER. An
 * answers folder that would not list is not "no handover note"; a git that
 * would not answer is not "clean". Collapse those two and the verdict is
 * manufactured out of this module's own defaults — and a paid session is opened
 * on it, unattended, at three in the morning.
 *
 * ‼️ ONE UNREADABLE REPOSITORY MAKES THE WHOLE REPO FACT UNMEASURED. "Clean" is
 * a claim about ALL of them; reporting the two that answered would be a claim
 * about the one nobody looked at. The verdict then lands in `unknown`, which is
 * exactly what it should do: ask, rather than assume.
 */

/** Every reading the measurement needs, so none of them happens here. */
export interface SentryMeasureIO {
    /** every file name in the answers folder; `undefined` = it would not list */
    answers: () => string[] | undefined;
    /** uncommitted paths in a repository; `undefined` = git would not answer */
    dirty: (repo: string) => number | undefined;
    /** the backlog track ledger; `undefined` = it could not be read */
    tracks: () => TrackRecord[] | undefined;
    /** the tail of the run's output; `undefined` = there was no output to read */
    output: () => string | undefined;
    /** the five-hour figure at the end; absent or `undefined` = nobody read it */
    quotaPercent?: () => number | undefined;
    /**
     * ‼️ X-189 — WHERE THE HANDOVER NOTE WAS LOOKED FOR, across every source.
     *
     * Optional because a caller that cannot search is not broken; what it must
     * not do is INVENT one. A port that is absent, or that answers
     * `undefined`, leaves the fact absent — and the verdict then says nobody
     * listed a folder, rather than that no note exists. `answers` stays beside
     * it: it is the one-folder question, and it is still the honest answer for
     * a caller that only has one folder.
     */
    handover?: () => HandoverDiscovery | undefined;
}

export interface SentryMeasureAsk {
    sessionId: string;
    /** the repositories this project owns, whose state bears on "is it finished" */
    repos: string[];
    /** what the board already knows the run managed to do — carried, not re-derived */
    progress?: RunProgress;
}

/** Is this ledger row about that session? Written either way round. */
function sameSession(rowSession: string | undefined, sessionId: string): boolean {
    const s = String(rowSession ?? '');
    if (!s) { return false; }
    return s === sessionId || shortSessionId(s) === shortSessionId(sessionId);
}

/**
 * The coded items a session touched, and whether each of them CLOSED.
 *
 * ‼️ THE LAST WORD WINS. An item closed and then reopened in the same session
 * is open — the ledger is a history, and reading only the first line of it
 * would tell the sentry to move on from work somebody deliberately put back.
 *
 * ‼️ A CANCELLED ITEM IS CLOSED. It left the pile; the sentry's next question
 * is "what now", and the answer is the same as for a finished one.
 */
export function codesTouchedIn(records: TrackRecord[], sessionId: string): TouchedCode[] {
    const order: string[] = [];
    const last = new Map<string, { ts: number; event: string }>();
    for (const r of records || []) {
        const code = String(r?.code ?? '').trim();
        if (!code || !sameSession(r.session, sessionId)) { continue; }
        if (!last.has(code)) { order.push(code); }
        const seen = last.get(code);
        const ts = Number(r.ts) || 0;
        if (!seen || ts >= seen.ts) { last.set(code, { ts, event: String(r.event ?? '') }); }
    }
    return order.map(code => {
        const e = last.get(code)?.event ?? '';
        return { code, closed: e === 'done' || e === 'cancelled' };
    });
}

/** What was measured about the session that just ended. Nothing is invented. */
export function measureSession(ask: SentryMeasureAsk, io: SentryMeasureIO): SessionFacts {
    const answerFiles = io.answers();
    const tracks = io.tracks();
    const output = io.output();
    const quota = io.quotaPercent ? io.quotaPercent() : undefined;
    const handoverSearch = io.handover ? io.handover() : undefined;

    // ‼️ ALL OR NOTHING. See the header: a partial answer here is a lie about a
    // repository nobody read, and the verdict it produces reads exactly like a
    // measured one.
    let repos: { path: string; dirty: number }[] | undefined = [];
    for (const p of ask.repos || []) {
        const n = io.dirty(p);
        if (typeof n !== 'number' || !Number.isFinite(n)) { repos = undefined; break; }
        repos!.push({ path: p, dirty: n });
    }

    return {
        sessionId: ask.sessionId,
        ...(answerFiles !== undefined ? { answerFiles } : {}),
        ...(handoverSearch !== undefined ? { handoverSearch } : {}),
        ...(repos !== undefined ? { repos } : {}),
        ...(tracks !== undefined ? { codes: codesTouchedIn(tracks, ask.sessionId) } : {}),
        ...(ask.progress !== undefined ? { progress: ask.progress } : {}),
        ...(output !== undefined ? { output } : {}),
        ...(typeof quota === 'number' && Number.isFinite(quota) ? { quotaPercent: quota } : {})
    };
}
