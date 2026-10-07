/**
 * S-140 — THE CHAIN'S PAUSE: one mark, two modes.
 *
 * here — the running leg finishes its atomic step, commits, writes where it
 *   stopped and ends its turn WITHOUT passing; its card stays, and Continue
 *   speaks into the same session. Nothing new holds the chain: a live leg
 *   already holds it.
 * pass — the leg passes as usual and its successor stays at the door
 *   (BatonRunner.release) until chains.resume; it survives a restart and never
 *   starts by itself.
 *
 * ‼️ EVERY VERDICT HERE READS ONLY `pause` (on a running leg's opener) AND
 * `hold` (on a waiting baton). A record without them takes the path it took
 * before, so a chain nobody paused runs exactly as it did. A `here` mark never
 * holds an ordinary pass; it holds only the failsafe's rescue of a leg that
 * died while paused in place.
 *
 * Pure: the store's list, a leg's facts and the clock come in.
 */
import { Baton, ChainPauseMark, isLive, openerOf } from './baton';
import { brakeStateOf, leftBy, runningLegOf } from './batonLastLeg';
import type { LegFacts } from './chainBoard';
import { SayPart, say, saidSentence, saidWhy } from './uiSentence';

export type PauseMode = ChainPauseMark['mode'];

/** How long after its mark a leg paused in place may still be writing its own closing words. */
export const HERE_SETTLE_MS = 120_000;

const short = (id: string | undefined): string => String(id ?? '').slice(0, 8);

export function pauseModeOf(v: unknown): PauseMode | undefined {
    const s = String(v ?? '').trim().toLowerCase();
    return s === 'here' || s === 'pass' ? s : undefined;
}

/** ‼️ THE DOOR'S ONE QUESTION: the mark that keeps this baton at the door, or undefined (it goes through as before). */
export function pauseHeld(list: readonly Baton[], b: Baton): ChainPauseMark | undefined {
    if (b.state !== 'waiting-end') { return undefined; }
    if (b.hold) { return b.hold; }
    const opener = openerOf(list, b.from.sessionId);
    const m = opener && opener.chainId === b.chainId ? opener.pause : undefined;
    if (!m) { return undefined; }
    if (m.mode === 'pass') { return m; }
    // here: an ordinary pass (or one the engine made for the leg) goes through; only a failsafe rescue waits
    return b.rescue && !b.fault ? m : undefined;
}

/** A here mark is fresh while nothing ran in its session after it, its own closing words aside. Unknown disproves nothing. */
export function hereFresh(m: ChainPauseMark, f: Pick<LegFacts, 'idleSince' | 'lastTs'> | undefined, settleMs = HERE_SETTLE_MS): boolean {
    if (m.mode !== 'here') { return false; }
    const last = f?.idleSince ?? f?.lastTs;
    return last === undefined || last <= m.at + settleMs;
}

export interface ChainPaused extends ChainPauseMark {
    /** a successor waits at the door (a pass, or a rescue held under a here mark) */
    held: boolean;
    /** the leg paused in place had its chain closed under it (a restart): Continue reopens it from the mark's words */
    closed?: boolean;
}

/** The leg a non-waiting newest record speaks for: the running leg's opener, or the opener of a leg the failsafe closed. */
function pausedLeg(list: readonly Baton[], top: Baton): { opener: Baton; closed: boolean } | undefined {
    const closed = top.state === 'done' && !top.byUser;
    const opener = top.state === 'started' ? top : closed ? openerOf(list, top.from.sessionId) : undefined;
    return opener && opener.chainId === top.chainId && opener.pause ? { opener, closed } : undefined;
}

/** S-140 — a chain row's pause, from its newest record and that leg's facts; undefined = not paused. */
export function pausedOf(list: readonly Baton[], top: Baton | undefined, f: LegFacts | undefined): ChainPaused | undefined {
    if (!top) { return undefined; }
    if (top.state === 'waiting-end') {
        const m = pauseHeld(list, top);
        return m ? { ...m, held: true } : undefined;
    }
    const leg = pausedLeg(list, top);
    const m = leg && !leg.opener.lastLeg ? leg.opener.pause : undefined;
    if (!leg || !m || (m.mode === 'here' ? !hereFresh(m, f) : leg.closed)) { return undefined; }
    return { ...m, held: false, ...(leg.closed ? { closed: true } : {}) };
}

/** What the person is told, once, when a paused chain's successor is first kept at the door. */
export function heldNotice(b: Baton, m: ChainPauseMark): { title: string; body: string } {
    return {
        title: `Chain ${b.chainId} paused — leg ${b.hop + 1} waits for you`,
        body: `${m.by} paused the chain${m.why ? ` (${m.why})` : ''}. Session ${short(b.from.sessionId)} passed the baton; leg ${b.hop + 1} stays at the door `
            + `until you continue it — ▶ Resume on the Chains page (chains.resume chain=${b.chainId}). It never starts by itself, a restart included.`
    };
}

/** The records that lift a held baton's pause: the baton without its hold, its leg's opener without its mark. */
export function unpause(list: readonly Baton[], b: Baton): Baton[] {
    const out: Baton[] = [];
    if (b.hold) {
        const free: Baton = { ...b };
        delete free.hold;
        out.push(free);
    }
    const opener = openerOf(list, b.from.sessionId);
    if (opener?.pause && opener.chainId === b.chainId) { out.push(unmarked(opener)); }
    return out;
}

function unmarked(opener: Baton): Baton {
    const free: Baton = { ...opener };
    delete free.pause;
    return free;
}

export interface PauseAsk {
    sessionId?: string;
    chainId?: string;
    mode: PauseMode;
    by: string;
    why?: string;
    /** where the leg stopped and what comes next — the leg's own paragraph */
    words?: string;
    /** a HANDOVER order already reached the running leg: it must pass, so `here` is refused */
    handover?: (sessionId: string) => boolean;
    now: number;
}

export type PauseResult =
    | { ok: true; baton: Baton; changed: boolean; on: 'leg' | 'successor'; sessionId: string; chainId: string; mode: PauseMode; sentence: string; say: SayPart[] }
    | { ok: false; why: string; say?: SayPart[] };

/** The same mode said again (the leg confirming the user's press) keeps who paused it, and refreshes when and where. */
function markOf(prev: ChainPauseMark | undefined, q: PauseAsk, mode: PauseMode): ChainPauseMark {
    const keep = prev && prev.mode === mode ? prev : undefined;
    const why = String(q.why ?? '').trim() || keep?.why;
    const words = String(q.words ?? '').trim() || keep?.words;
    return { mode, at: q.now, by: keep?.by ?? q.by, ...(why ? { why } : {}), ...(words ? { words } : {}) };
}

/**
 * ‼️ PAUSE: the mark goes on the running leg's opener (`pause`), or — when the
 * leg has already passed — straight on its waiting successor (`hold`). Nothing
 * else on either record moves (updatedAt included: the crash-loop guard reads
 * it as the leg's start). The caller stores `baton`.
 */
export function markPause(list: readonly Baton[], q: PauseAsk): PauseResult {
    const chainArg = String(q.chainId ?? '').trim();
    const sid = String(q.sessionId ?? '').trim()
        || (chainArg ? runningLegOf(list, chainArg) ?? list.find(b => b.chainId === chainArg && isLive(b))?.from.sessionId ?? '' : '');
    if (!sid) {
        return chainArg
            ? saidWhy('chain {chain} has no leg running and no successor waiting — there is nothing to pause; chains.continue reopens a chain that ended.', { chain: chainArg })
            : saidWhy('say which: session (the running leg) or chain (its chn_… id).');
    }
    const state = brakeStateOf(list, sid);
    if (state === 'passed') {
        const left = leftBy(list, sid)!;
        if (left.state !== 'waiting-end') {
            return saidWhy('the successor of session {session} is already at the door ({state}) — it can no longer be paused; baton.stop stops it.', { session: short(sid), state: left.state });
        }
        const hold = markOf(left.hold, q, 'pass');
        return {
            ok: true, baton: { ...left, hold }, changed: !left.hold, on: 'successor', sessionId: sid, chainId: left.chainId, mode: 'pass',
            ...saidSentence(say('Session {session} had already passed: leg {leg} of chain {chain} stays at the door until Continue (chains.resume).',
                { session: short(sid), leg: left.hop + 1, chain: left.chainId }))
        };
    }
    const opener = openerOf(list, sid);
    if (!opener) { return saidWhy('session {session} is not a leg of a baton relay — there is no chain to pause.', { session: short(sid) }); }
    const leg = opener.hop + 1;
    if (state === 'on') {
        return saidWhy('leg {leg} of chain {chain} is already the chain\'s last (⑂⊣ Last leg) — nothing opens after it, so there is nothing to hold.', { leg, chain: opener.chainId });
    }
    if (state !== 'off') { return saidWhy('leg {leg} of chain {chain} has already reached its end — there is nothing to pause.', { leg, chain: opener.chainId }); }
    if (q.mode === 'here' && q.handover?.(sid)) {
        return saidWhy('a HANDOVER order already reached leg {leg} of chain {chain}, so it must pass — pause it with mode=pass: its successor then waits for Continue.', { leg, chain: opener.chainId });
    }
    const pause = markOf(opener.pause, q, q.mode);
    const vars = { leg, chain: opener.chainId, session: short(sid) };
    return {
        ok: true, baton: { ...opener, pause }, changed: opener.pause?.mode !== q.mode, on: 'leg', sessionId: sid, chainId: opener.chainId, mode: q.mode,
        ...saidSentence(q.mode === 'pass'
            ? say('Chain {chain} pauses at the pass: leg {leg} (session {session}) passes as usual, and its successor waits at the door until Continue (chains.resume).', vars)
            : say('Leg {leg} of chain {chain} (session {session}) pauses in place: it stops after its atomic step without passing, and Continue speaks into the same session.', vars))
    };
}

/** What Continue does: release the held successor · speak into the paused card · cancel a pause not yet reached · reopen a leg that is gone. */
export type ResumeAct = 'release' | 'speak' | 'cancel' | 'reopen';

export type ResumePlan =
    | { ok: true; act: ResumeAct; put: Baton[]; was: Baton[]; chainId: string; sessionId: string; mark: ChainPauseMark }
    | { ok: false; why: string; say?: SayPart[] };

/**
 * ‼️ CONTINUE, decided from the chain's newest record (`top`) and its running
 * leg's liveness. The marks are lifted in `put` (the originals in `was`, for a
 * reopen the door refuses); the caller applies the act. A here mark that has
 * gone stale is still lifted here — the person pressing Continue means it.
 */
export function resumePlan(list: readonly Baton[], top: Baton | undefined, live?: 'working' | 'idle' | 'gone'): ResumePlan {
    if (!top) { return saidWhy('no chain with records left to continue — chains.list shows the chains.'); }
    const chainId = top.chainId;
    if (top.state === 'waiting-end') {
        const m = pauseHeld(list, top);
        if (!m) { return saidWhy('chain {chain} is not paused — its successor waits for session {session} to end; baton.now starts it now.', { chain: chainId, session: short(top.from.sessionId) }); }
        const put = unpause(list, top);
        return { ok: true, act: 'release', put, was: put.map(p => list.find(b => b.id === p.id)!), chainId, sessionId: top.from.sessionId, mark: m };
    }
    const leg = pausedLeg(list, top);
    if (!leg || leg.opener.lastLeg) { return saidWhy('chain {chain} is not paused.', { chain: chainId }); }
    const mark = leg.opener.pause!;
    const sessionId = top.state === 'started' ? top.toSessionId ?? '' : top.from.sessionId;
    const act: ResumeAct = leg.closed || (mark.mode === 'here' && live === 'gone') ? 'reopen' : mark.mode === 'pass' ? 'cancel' : 'speak';
    return { ok: true, act, put: [unmarked(leg.opener)], was: [leg.opener], chainId, sessionId, mark };
}

/** The Chains board's paused legs, for the stuck-items cleanup: their sessions are not stuck, they wait for the user. */
export function pausedSessions(rows: readonly { paused?: ChainPaused; sessionId?: string }[]): Set<string> {
    return new Set(rows.filter(r => r.paused && r.sessionId).map(r => r.sessionId!));
}
