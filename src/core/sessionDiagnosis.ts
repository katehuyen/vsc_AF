import { RunProgress, isLimitFailure } from './retry';
import { slugify } from './util';
// ‼️ TYPE-ONLY, AND IT HAS TO STAY THAT WAY. `handoverDiscovery` imports the
// name primitives BELOW as values, so a runtime edge back would be a cycle.
// The direction is deliberate: this module reasons about a search somebody
// else ran, and never runs one itself.
import type { HandoverDiscovery, HandoverHit } from './handoverDiscovery';

/**
 * X-174 — WHAT A FINISHED SESSION LEFT BEHIND, WITHOUT ASKING A MODEL.
 *
 * The sentry's first question about a session that has just ended is "can the
 * next one pick this up, and from what". Almost all of that is MEASUREMENT: a
 * handover note either exists or it does not, a repo is either clean or it is
 * not, an item either closed or it did not. The precedent is `automation.ts` —
 * asking a model a question that could have been counted burned $70.90 over
 * five nights, and this family exists partly because of that bill.
 *
 * ‼️ SO THIS MODULE REASONS AND NEVER READS. Every fact is handed in. There is
 * no `fs` here, no `child_process`, no engine call — which is what makes the
 * "it costs nothing" claim checkable rather than promised, and what lets the
 * whole ladder be tested without a machine in a particular state.
 *
 * ‼️ AND IT NEVER GUESSES. A fact that was not measured is not the same as a
 * fact that came back empty: `answerFiles: undefined` means nobody listed the
 * folder; `answerFiles: []` means it was listed and there was nothing in it.
 * The first goes on `unknown`, the second is evidence. `unknown` is exactly the
 * list X-175 reads to decide whether a model is worth calling at all, so
 * blurring the two would put the cost back that this module exists to remove.
 */

/** One repository the session could have touched. */
export interface RepoState {
    path: string;
    /** uncommitted paths, as `git status --porcelain` counts them */
    dirty: number;
    branch?: string;
}

/** A coded backlog item this session worked on. */
export interface TouchedCode {
    code: string;
    closed: boolean;
}

/**
 * What was MEASURED about a finished session. Every field is optional on
 * purpose: a caller that could not measure something leaves it out, and the
 * verdict says so rather than assuming the empty answer.
 */
export interface SessionFacts {
    /** the session's own id — a handover note is found by its first 8 characters */
    sessionId: string;
    /**
     * every file name in the answers folder. `undefined` = nobody listed it.
     *
     * ‼️ X-189 left this in place rather than replacing it. A caller with one
     * folder and nothing else is not wrong, it is just looking in one place —
     * and `handoverName` / `nextHandoverSeq` still need a plain listing to
     * WRITE a note. What changed is that a caller may now hand in a whole
     * search instead, and that search wins when both are present.
     */
    answerFiles?: string[];
    /**
     * ‼️ X-189 — everywhere a note was looked for, and what came back
     * (`core/handoverDiscovery`). `undefined` = nobody searched, which is not
     * the same as searching and finding nothing; the search says which of the
     * two it was in its own `measured` flag.
     */
    handoverSearch?: HandoverDiscovery;
    /** one row per repository whose state was read */
    repos?: RepoState[];
    /** the coded items this session touched, and whether each of them closed */
    codes?: TouchedCode[];
    /** what the transcript says the session managed to do (retry.ts owns the shape) */
    progress?: RunProgress;
    /** the tail of the run's output — the only place an engine says "limit" */
    output?: string;
    /** the five-hour figure at the end, if it was read at all */
    quotaPercent?: number;
    /**
     * ‼️ S-64 — THE OTHER TRIGGER. The law binds a run to two: the 5-hour quota
     * and the context window. `quotaPercent` above is the first; this is the
     * second, and without it a run that filled its window and stopped was
     * diagnosed `wall-unfinished` — "the session ended on its own" — about a
     * run that had been TOLD to stop. Those are different faults and they need
     * different answers. `undefined` = the guard was not asked.
     */
    context?: ContextFacts;
}

/** What the context guard said to this session, as far as it was measured. */
export interface ContextFacts {
    /** the line the reading crossed */
    level?: 'converge' | 'handover';
    /** the reading that crossed it */
    pct?: number;
    /**
     * ‼️ WHETHER THE SENTENCE ACTUALLY REACHED THE RUN. An engine whose hooks
     * carry no channel crosses the line in silence, and blaming that run for
     * not obeying an order nobody read is the one verdict this must not reach.
     */
    delivered?: boolean;
}

/**
 * ‼️ THE LADDER IS POLICY, NOT A RULE CARVED INTO THE CODE. These four are the
 * defaults the user approved, and they said in the same breath that a campaign
 * must be able to decide how strict its own sentry is. A switch here is named
 * after the JUDGEMENT it makes, not after the branch it flips.
 */
export interface DiagnosisPolicy {
    /**
     * Does a closed item still count as finished work when the repository has
     * uncommitted changes? Default no: work left behind with nothing explaining
     * it is a fault, and the next agent cannot tell what is half-done.
     */
    closedItemNeedsCleanRepo: boolean;
    /**
     * Does a session that produced nothing get its own answer? Default yes.
     * "Hit the wall" is an alarm; raising it for a session that was a question
     * and an answer is how an alarm stops being read.
     */
    idleIsItsOwnOutcome: boolean;
    /** How many uncommitted paths a repository may carry and still read clean. */
    dirtyFloor: number;
    /**
     * Does a handover note outrank a closed item? Default no — an item that
     * closed on a clean repository needs no continuation, and saying "carry on
     * from the note" would send the next session after work that is done.
     */
    handoverBeatsClosedItem: boolean;
}

export const DEFAULT_DIAGNOSIS_POLICY: DiagnosisPolicy = {
    closedItemNeedsCleanRepo: true,
    idleIsItsOwnOutcome: true,
    dirtyFloor: 0,
    handoverBeatsClosedItem: false
};

/** The four answers, in the order the sentry cares about them. */
export type SessionOutcome =
    /** the work is done and nothing is waiting — pick the next item */
    | 'item-done'
    /** something is waiting AND the note that says where it is exists */
    | 'clean-handover'
    /** nothing was attempted, so there is nothing to carry on from */
    | 'nothing-to-continue'
    /** something is waiting and NOTHING says where — the state that needs a person */
    | 'hit-the-wall';

export interface HandoverNote {
    file: string;
    date: string;
    /** the two-digit daily counter */
    seq: number;
    /** the eight-character session id the note was written for */
    session: string;
    topic: string;
}

export interface SessionDiagnosis {
    /** the session this is about, exactly as it was handed in */
    sessionId: string;
    /** …and its eight-character form, the one a note and a folder are named by */
    session: string;
    outcome: SessionOutcome;
    /** the rule that produced it, by name — a verdict you can argue with */
    rule: string;
    /** one line a person reads */
    why: string;
    /** every measured fact that bore on the verdict */
    evidence: string[];
    /** ‼️ what could NOT be measured. X-175 calls a model only when this is not empty */
    unknown: string[];
    /** ‼️ X-189 widened this from `HandoverNote` to the SEARCH HIT: a note that
     *  misses the canonical name has no `date`/`seq`/`topic` to report, but it
     *  is still the note, and it now carries where it was found and how sure. */
    handover?: HandoverHit;
    /** did any engine say the plan window was spent */
    limit: boolean;
    /**
     * ‼️ X-307 — DID THIS SESSION LEAVE ANY TRACE AT ALL?
     *
     * `hit-the-wall` says work is outstanding and nothing says where. It does
     * NOT say whether the session got anywhere, and the sentry needs those
     * apart: a round that worked for an hour and forgot the note is a normal
     * round to carry on from, while a round that answered and left nothing
     * behind will answer identically the next time it is opened — which is the
     * shape a misconfigured campaign takes, and it bills for every repetition.
     *
     * Three measurements, all of them already taken: an item touched, an
     * uncommitted path, a handover note. `unknown` when any of the three was
     * not measured — the loop is claimed on evidence or not at all.
     */
    left: LeftBehind;
    /** the policy that was applied, echoed so a verdict can be read months later */
    policy: DiagnosisPolicy;
}

/** What a finished session left behind, as far as it was measured. */
export type LeftBehind = 'something' | 'nothing' | 'unknown';

/* ============ THE NOTE'S NAME, READ AND WRITTEN IN ONE PLACE ==============
 *
 * `YYYY-MM-DD_devir_##_<sid8>_<topic>.md`. X-175 has to BUILD this name and
 * this module has to FIND it; a pattern held in two places drifts on the first
 * change, and the failure is silent — a note written under one spelling and
 * looked for under another produces "no handover note" about a session that
 * wrote a perfectly good one.
 */

const NAME_RE = /^(\d{4}-\d{2}-\d{2})_devir_(\d{2})_([0-9a-f]{8})_(.+)\.md$/i;

/** The eight characters a note, a folder and a log row all name a session by.
 *  One function, because a second copy that trimmed differently would look for
 *  a note under a name nobody wrote. */
export function shortSessionId(id: string): string {
    return String(id ?? '').replace(/-/g, '').slice(0, 8).toLowerCase();
}

/** Read a handover file name apart. Anything else is not one — no near misses. */
export function parseHandoverName(file: string): HandoverNote | undefined {
    const m = NAME_RE.exec(String(file ?? '').trim());
    if (!m) { return undefined; }
    return { file, date: m[1], seq: Number(m[2]), session: m[3].toLowerCase(), topic: m[4] };
}

/** The note written FOR a session, found by the id it names rather than by
 *  position in the folder — the newest file is somebody else's note as often
 *  as it is this one's. */
export function handoverFor(sessionId: string, files: string[]): HandoverNote | undefined {
    const short = shortSessionId(sessionId);
    if (short.length < 8) { return undefined; }
    const mine = (files || []).map(parseHandoverName)
        .filter((n): n is HandoverNote => !!n && n.session === short);
    // More than one is not an error: a long session may hand over twice. The
    // LAST one is the live instruction, so the highest counter wins.
    return mine.sort((a, b) => a.seq - b.seq).pop();
}

/**
 * ‼️ The topic is folded to ASCII (`slugify` maps the Turkish six by hand) so
 * that a note written about "X172 kapandı" is findable by a shell, a glob and a
 * git status on any machine. A file name is a machine's handle here; what a
 * person reads is inside the note.
 */
export function handoverName(o: { date: string; seq: number; sessionId: string; topic: string }): string {
    const short = shortSessionId(o.sessionId);
    const seq = String(Math.max(1, Math.min(99, Math.round(o.seq || 1)))).padStart(2, '0');
    const topic = slugify(o.topic || 'devir', { ascii: true, max: 48 }) || 'devir';
    return `${o.date}_devir_${seq}_${short}_${topic}.md`;
}

/** The next counter for a calendar day. It counts THAT day only — the sequence
 *  resets every day, so yesterday's fourteen notes do not push today's first
 *  one to 15. */
export function nextHandoverSeq(files: string[], date: string): number {
    const today = (files || []).map(parseHandoverName)
        .filter((n): n is HandoverNote => !!n && n.date === date);
    return today.reduce((max, n) => Math.max(max, n.seq), 0) + 1;
}

/* ============ THE VERDICT ================================================= */

/** `12 assistant steps · 47 tool calls`, or nothing when neither was counted. */
function didWhat(p?: RunProgress): string {
    if (!p || (p.assistantSteps === undefined && p.toolCalls === undefined)) { return ''; }
    const a = p.assistantSteps ?? 0, t = p.toolCalls ?? 0;
    return `${a} assistant step${a === 1 ? '' : 's'} · ${t} tool call${t === 1 ? '' : 's'}`;
}

/**
 * Diagnose a finished session. `policy` is a PATCH over the defaults, so a
 * caller that cares about one switch does not have to restate the other three
 * — and cannot silently reset them by forgetting one.
 */
export function diagnoseSession(
    facts: SessionFacts, policy?: Partial<DiagnosisPolicy>
): SessionDiagnosis {
    const p: DiagnosisPolicy = { ...DEFAULT_DIAGNOSIS_POLICY, ...(policy || {}) };
    const evidence: string[] = [];
    const unknown: string[] = [];

    // ---- the note ----------------------------------------------------------
    //
    // ‼️ X-189 — A SEARCH OUTRANKS A FOLDER LISTING, and it does so completely.
    // Falling back to `answerFiles` after a search that read four sources and
    // found nothing would put the very defect back: the one hard-coded folder
    // having the last word. A caller that ran a search has already looked
    // there, because `fallback` IS that folder.
    let handover: HandoverHit | undefined;
    // ‼️ X-307 — "no note was found" and "nobody looked" are the same value of
    // `handover` and must not be the same evidence. The search already answers
    // exactly this in `measured`; requiring an EMPTY `unknown` instead would
    // have been too strict against the live record this item was opened on,
    // where eighteen notes were really read and the residual unknown was a
    // second, misconfigured source that does not exist on this machine.
    let handoverMeasured = false;
    const search = facts.handoverSearch;
    if (search) {
        handover = search.hit;
        for (const u of search.unknown) { unknown.push(u); }
        for (const e of search.evidence) { evidence.push(e); }
        handoverMeasured = !!handover || search.measured;
    } else if (facts.answerFiles === undefined) {
        unknown.push('the answers folder was not listed, so a handover note cannot be ruled out');
    } else {
        const note = handoverFor(facts.sessionId, facts.answerFiles);
        // The legacy path knows one folder and one pattern, so it can only ever
        // report the canonical source at full confidence — which is exactly
        // what it was doing before, now said out loud.
        handover = note ? { ...note, source: 'fallback', score: 8, parts: ['id', 'word', 'canonical'], identified: true, why: '', note } : undefined;
        evidence.push(handover
            ? `handover note: ${handover.file}`
            : 'no handover note names this session');
        handoverMeasured = true;
    }

    // ---- the repositories --------------------------------------------------
    let repoClean: boolean | undefined;
    if (facts.repos === undefined) {
        unknown.push('no repo state was measured, so uncommitted work cannot be ruled out');
    } else {
        repoClean = true;
        for (const r of facts.repos) {
            const over = (r.dirty ?? 0) > p.dirtyFloor;
            if (over) { repoClean = false; }
            evidence.push(over
                ? `${r.path}: ${r.dirty} uncommitted path${r.dirty === 1 ? '' : 's'}`
                : `${r.path}: clean`);
        }
    }

    // ---- the items ---------------------------------------------------------
    let closed: TouchedCode[] = [];
    if (facts.codes === undefined) {
        unknown.push('the items this session touched were not read, so a close cannot be ruled out');
    } else {
        closed = facts.codes.filter(c => c.closed);
        for (const c of facts.codes) {
            evidence.push(c.closed ? `${c.code} closed` : `${c.code} touched, still open`);
        }
    }

    // ---- did it leave anything behind at all? (X-307) ----------------------
    const left: LeftBehind =
        handover || (facts.codes ?? []).length > 0 || repoClean === false ? 'something'
            : handoverMeasured && facts.codes !== undefined && repoClean !== undefined ? 'nothing'
                : 'unknown';
    if (left === 'nothing') {
        evidence.push('no item touched, nothing uncommitted and no handover note — '
            + 'this session left no trace anywhere it was looked for');
    }

    // ---- what it managed to do --------------------------------------------
    const did = didWhat(facts.progress);
    if (!did) {
        unknown.push('the transcript was not read, so what the session managed to do is not known');
    } else {
        evidence.push(did);
    }
    const idle = !!did && (facts.progress?.assistantSteps ?? 0) === 0
        && (facts.progress?.toolCalls ?? 0) === 0;

    // ---- the plan window ---------------------------------------------------
    const limit = isLimitFailure(facts.output ?? '');
    if (limit) { evidence.push('the engine said the plan window was spent'); }
    if (typeof facts.quotaPercent === 'number' && facts.quotaPercent >= 0) {
        evidence.push(`five-hour window at ${facts.quotaPercent}%`);
    }

    // ---- the context window ------------------------------------------------
    const ctx = facts.context;
    const ctxPct = typeof ctx?.pct === 'number' ? `${ctx.pct}%` : 'the line';
    if (ctx?.level) {
        evidence.push(ctx.delivered === false
            ? `the context window reached the ${ctx.level} line at ${ctxPct} and this engine could not be told`
            : `the run was told CONTEXT ${ctx.level.toUpperCase()} at ${ctxPct}`);
    }

    const out = (outcome: SessionOutcome, rule: string, why: string): SessionDiagnosis => ({
        sessionId: facts.sessionId, session: shortSessionId(facts.sessionId),
        outcome, rule, why, evidence, unknown, handover, limit, left, policy: p
    });

    // ---- the ladder --------------------------------------------------------
    const codes = closed.map(c => c.code).join(', ');
    const finished = closed.length > 0 && (!p.closedItemNeedsCleanRepo || repoClean === true);
    if (handover && p.handoverBeatsClosedItem) {
        return out('clean-handover', 'handover-first',
            `${handover.file} says where this was left — the campaign reads a note before a close.`);
    }
    if (finished) {
        return out('item-done', 'closed-item',
            `${codes} closed${repoClean === true ? ' on a clean repository' : ''} — there is nothing here to carry on from.`);
    }
    if (handover) {
        return out('clean-handover', 'handover',
            `${handover.file} says where this was left; the next session starts from it.`);
    }
    // ‼️ Idle is claimed only when the transcript was actually read. Calling an
    // unmeasured session idle is the guess this module is built not to make.
    if (p.idleIsItsOwnOutcome && idle && closed.length === 0 && repoClean !== false) {
        return out('nothing-to-continue', 'idle',
            'The session produced no turn and left nothing behind — there is nothing to carry on from.');
    }
    // ‼️ X-307 — ONE OUTCOME, TWO WALLS. A spent plan window reopens by itself
    // and the round that met it was doing fine; a session that ended on its own
    // with nothing written down did not. The sentry's brake reads the rule, so
    // the difference has to be on the verdict rather than in the sentence.
    // ‼️ S-64 — AND A THIRD WALL, WHICH USED TO READ AS THE SECOND. A run whose
    // CONTEXT window reached the handover line was told to stop, commit and
    // write the note. Ending with no note is then a discipline failure with a
    // name, not "the session ended on its own" — and the campaign can answer it
    // differently, because the next round starts fresh either way but this one
    // has evidence of where the work got to.
    if (ctx?.level === 'handover') {
        return ctx.delivered === false
            ? out('hit-the-wall', 'wall-context-blind',
                `The context window reached the handover line at ${ctxPct} and this engine has no channel to be told through — `
                + 'the run was never asked to write a note, so its absence is the wiring, not the agent.'
                + (limit ? ' The plan window was spent as well.' : ''))
            : out('hit-the-wall', 'wall-context',
                `The run was told to hand over at ${ctxPct} and no note was written — what was in flight is not written down anywhere.`
                + (limit ? ' The plan window was spent as well.' : ''));
    }
    if (limit) {
        return out('hit-the-wall', 'wall-limit',
            'The plan window was spent and no handover note was written — what was in flight is not written down anywhere.');
    }
    return out('hit-the-wall', 'wall-unfinished', left === 'nothing'
        ? 'The session ended on its own and left no trace — no item touched, nothing uncommitted, no note. Opening the same round again would produce the same nothing.'
        : 'The session ended with work outstanding and no handover note — what was in flight is not written down anywhere.');
}
