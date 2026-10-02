/**
 * S-70 — THE RELEASE: a baton waits for its session to END, and this is the
 * part that notices the end and hands the baton to the door (S-71).
 *
 * Three signals converge on ONE channel — the hook's `SessionEnd`, the Console
 * host's exit and a terminal's close all arrive as the live monitor's `end`
 * event — and a sweep is the backup for a run that died with no hook at all
 * (measured in this repo: `engineAccounts.ts:246`).
 *
 * ‼️ TWO AGENTS IN ONE REPO, NEVER. A session is ended by EVIDENCE — no live
 * CLI process is registered for it, or a watcher saw it end — never by
 * silence. A baton whose session cannot be shown dead waits and says why.
 * An agent that passed the baton and kept working therefore keeps its repo.
 *
 * The decisions are pure functions at the top; the class only wires them to a
 * store and a clock, so every rule is testable without a window.
 */
import { Baton, EnginePassHow, isLive, moveBaton } from './baton';
import { BatonBoard } from './batonBoard';
import { FirstLeg, sealFirstLeg } from './batonSeal';
import { LegEndFacts } from './batonFailsafe';
import { LegEndWatch, NoticeLevel } from './batonLegEnd';
import { markStored } from './batonLegFacts';
import type { FolderRead } from './legRoots';
import { BatonStore } from './batonStore';
import { LaunchManifest } from './launchManifest';

/** What the live monitor holds for a session. */
export type LiveKnowledge = 'alive' | 'ended' | 'unknown';

export interface EndEvidence {
    /** a live CLI process is registered for the session (the CLI's own registry) */
    registered: boolean;
    /** what the live monitor knows */
    live: LiveKnowledge;
    /** does this engine register its processes at all (claude does; the others do not) */
    registers: boolean;
    /**
     * the Console holds a card for the session that is not ended — the host
     * owns that process (or is reclaiming it after a reload, S-59) and will
     * say SessionEnd itself when it goes; absent = no card
     */
    card?: 'live' | 'ended';
}

/**
 * Is the session that passed this baton over? Registry first — a registered
 * process is alive whatever the monitor thinks. Then the monitor's own end.
 * Then, for an engine that registers, "no record" IS the process being gone.
 * An engine with no registry is believed dead only once the monitor has
 * forgotten it (its TTL), never because it went quiet.
 */
export function endedVerdict(ev: EndEvidence): { ended: boolean; why: string } {
    if (ev.registered) { return { ended: false, why: 'a live CLI process is still registered for the session' }; }
    if (ev.card === 'live') { return { ended: false, why: 'the Console still holds a live card for the session' }; }
    if (ev.live === 'ended') { return { ended: true, why: 'the watcher saw the session end' }; }
    if (ev.registers) { return { ended: true, why: 'no live CLI process is registered for the session' }; }
    if (ev.live === 'unknown') { return { ended: true, why: 'no watcher knows the session any more' }; }
    return { ended: false, why: 'the watcher still holds the session open' };
}

/** What the door answered: the row it opened, and the session when already known. */
export interface DoorAnswer {
    taskId: string;
    sessionId?: string;
    /** S-85 — the row is RUNNING but its engine has not named the session yet (a Console card before its init) */
    running?: boolean;
    /** why the row is not running yet (a ceiling, the automation gate) */
    held?: string;
    /** S-73 — every account was full: the row waits until this moment (first reset + buffer) */
    wakeAt?: number;
}

/** The little a baton needs to know about its task row. */
export interface TaskGlimpse {
    status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
    sessionId?: string;
    /** the row's own last word, when it ended */
    why?: string;
}

export interface BatonRunnerDeps {
    store: BatonStore;
    /** S-71 — opens the successor's task row; THROWS with the reason to refuse */
    door: (b: Baton) => DoorAnswer;
    evidence: (b: Baton) => EndEvidence;
    task?: (taskId: string) => TaskGlimpse | undefined;
    /** S-74 — ask the pump again for a QUEUED row (the user made room by hand); undefined = no such queued row */
    nudge?: (taskId: string) => DoorAnswer | undefined;
    /** what a person is told: a refusal, a park on a reset, and a chain's end (S-83, with its level) */
    notify?: (title: string, body: string, key: string, level?: NoticeLevel, type?: 'info' | 'warning') => void;
    /** S-83 — what is known about a relay leg that ended; absent = no failsafe */
    legFacts?: (sessionId: string, endedAt: number) => Promise<LegEndFacts>;
    /** S-83 — the launch id a session started with, for the rescue's manifest */
    launchIdOf?: (sessionId: string) => string | undefined;
    /** S-83 — agentFarm.batonMaxHops, for the rescue's brake */
    maxLegs?: () => number;
    /** S-83 — how long a leg's end settles (its card, its task row) before it is read */
    settleMs?: number;
    fmtTime?: (t: number) => string;
    now?: () => number;
    log?: (line: string) => void;
    /** S-81 — task rows that asked to open a relay and whose session is known */
    firstLegs?: () => FirstLeg[];
    manifestOf?: (launchId: string) => LaunchManifest | undefined;
    /** the folder's git HEAD, recorded on the seal for the barren brake */
    headOf?: FolderRead;
    /** S-92 — the folder's `git status --short`, recorded on a seal and a rescue for the failsafe */
    dirtOf?: FolderRead;
    /** S-84 — the A2A board the chain's handover cards live on; absent = no cards */
    board?: BatonBoard;
    /** X-462 — why a leg had no room left when it ended (batonRoom.ts starvedWhy); the rescue's barren brake skips it */
    starvedOf?: (b: Baton) => string | undefined;
}

/** A baton on a task row: the row's session becomes the successor (`was` = the id it held before, S-85). */
export function bindSuccessor(b: Baton, sessionId: string, now: number, was?: string): Baton {
    const why = was
        ? `${b.why} · bound to session ${sessionId.slice(0, 8)} (it held ${was}, which the row no longer names)`
        : `successor session ${sessionId.slice(0, 8)} is running`;
    return { ...b, toSessionId: sessionId, why, updatedAt: now };
}

export class BatonRunner {
    /** S-83 — the failsafe for a leg that ends without passing */
    private readonly legs?: LegEndWatch;

    constructor(private readonly deps: BatonRunnerDeps) {
        if (!deps.legFacts) { return; }
        this.legs = new LegEndWatch({
            store: deps.store, legFacts: deps.legFacts,
            isEnded: (sid, o) => endedVerdict(deps.evidence({ ...o, from: { ...o.from, sessionId: sid } })).ended,
            launchIdOf: deps.launchIdOf, manifestOf: deps.manifestOf, headOf: deps.headOf, dirtOf: deps.dirtOf, maxLegs: deps.maxLegs,
            notify: deps.notify, now: () => this.now(), log: l => this.log(l), settleMs: deps.settleMs, starvedOf: deps.starvedOf
        }, (b, why) => this.release(b, why));
    }

    private now(): number { return (this.deps.now ?? Date.now)(); }
    private log(line: string): void { try { this.deps.log?.(line); } catch { /* best effort */ } }

    private waiting(): Baton[] {
        return this.deps.store.all().filter(b => b.state === 'waiting-end');
    }

    /** One of the three signals: this session ended. Releases its baton, if any. */
    sessionEnded(sessionId: string, reason: string): Baton[] {
        const sid = String(sessionId ?? '').trim();
        if (!sid) { return []; }
        const released = this.waiting()
            .filter(b => b.from.sessionId === sid)
            .map(b => this.release(b, `session ended (${reason || 'end'})`));
        if (!released.length) { void this.legEnded(sid, reason || 'end'); }
        return released;
    }

    /** S-83 — a relay leg ended without passing: closed, failed or rescued (batonLegEnd.ts). */
    legEnded(sessionId: string, reason: string): Promise<Baton | undefined> {
        if (!this.legs) { return Promise.resolve(undefined); }
        return this.legs.legEnded(sessionId, reason).then(b => {
            if (b && (b.state === 'done' || b.state === 'failed')) { this.closeBoard(b.chainId); }
            return b;
        });
    }

    /** X-427 / X-462 — the engine flagged a running leg, or its account hit the plan limit: its baton is written for it (batonLegEnd.ts). */
    enginePass(sessionId: string, why: string, how: EnginePassHow): Promise<Baton | undefined> {
        return this.legs ? this.legs.enginePass(sessionId, why, how) : Promise.resolve(undefined);
    }

    /**
     * S-84 — the chain is over: its cards stay readable for a day (the race is
     * worth reading after it ends) and the hygiene sweep then clears them. A
     * pinned card is spared, which is the whole point of the pin.
     */
    closeBoard(chainId: string): number {
        if (!this.deps.board) { return 0; }
        return this.deps.board.closeChain(this.deps.store.chain(chainId).map(b => b.a2aNoteId), this.now());
    }

    /**
     * The backup, and the boot pass: every waiting baton whose session cannot be
     * shown alive is released; the rest are listed with why they wait.
     */
    sweep(): { released: Baton[]; waiting: { id: string; sessionId: string; why: string }[] } {
        // S-85 — the backup for follow() too: a Console card names its session
        // without the task board moving
        this.follow();
        const released: Baton[] = [];
        const waiting: { id: string; sessionId: string; why: string }[] = [];
        for (const b of this.waiting()) {
            let ev: EndEvidence;
            try { ev = this.deps.evidence(b); } catch (e) {
                waiting.push({ id: b.id, sessionId: b.from.sessionId, why: `evidence unavailable: ${String((e as Error)?.message ?? e)}` });
                continue;
            }
            const v = endedVerdict(ev);
            if (v.ended) { released.push(this.release(b, `swept: ${v.why}`)); } else {
                waiting.push({ id: b.id, sessionId: b.from.sessionId, why: v.why });
            }
        }
        this.legs?.sweep();
        return { released, waiting };
    }

    /**
     * The successor's row moved. A row that names its session binds the baton
     * to it (`parked` → `started`); a row that ended without ever naming one is
     * a refusal, with the row's own last word as the reason.
     *
     * ‼️ S-85 — A STARTED BATON IS FOLLOWED TOO, until it names the session its
     * row names: a Console row starts before its engine names the session, and
     * a baton written before this held the card's id instead. The row is the
     * truth, so a baton that disagrees with it is bound again.
     */
    follow(): Baton[] {
        const changed: Baton[] = this.seal();
        const read = this.deps.task;
        if (!read) { return changed; }
        for (const b of this.deps.store.all()) {
            const bound = b.state === 'started';
            if (!b.taskId || (!bound && (!isLive(b) || b.toSessionId))) { continue; }
            const t = read(b.taskId);
            if (!t) { continue; }
            if (t.sessionId) {
                if (bound && b.toSessionId === t.sessionId) { continue; }
                const next = bound
                    ? bindSuccessor(b, t.sessionId, this.now(), b.toSessionId)
                    : this.move(b, 'started', `successor session ${t.sessionId.slice(0, 8)} is running`, { toSessionId: t.sessionId });
                if (bound && next) { this.deps.store.put(next); this.log(`baton ${b.id}: ${next.why}`); }
                if (next) { changed.push(next); }
            } else if (t.status === 'done' || t.status === 'failed' || t.status === 'cancelled') {
                const why = `task ${b.taskId} ${t.status} before a session started${t.why ? `: ${t.why}` : ''}`;
                if (!bound) {
                    const next = this.move(b, 'refused', why);
                    if (next) { changed.push(next); this.tell(next); }
                } else if (!b.toSessionId && !this.unnamed.has(b.id)) {
                    // a started record cannot be moved again; the run that never
                    // named its session is SAID, once, or the chain ends in silence
                    this.unnamed.add(b.id);
                    this.tell({ ...b, why });
                }
            }
        }
        return changed;
    }

    private readonly unnamed = new Set<string>();

    private readonly unsealable = new Set<string>();

    /**
     * S-81 — every first leg whose session is now known gets its seal, so the
     * run that started the chain is leg 1 of it from its first turn on. A row
     * that cannot be sealed (no manifest, a chain name already taken) is said
     * once in the log and not asked again.
     */
    seal(): Baton[] {
        const sealed: Baton[] = [];
        for (const leg of this.deps.firstLegs?.() ?? []) {
            const key = leg.taskId || leg.sessionId;
            if (!leg.launchId || this.unsealable.has(key)) { continue; }
            const r = sealFirstLeg({ leg, manifest: this.deps.manifestOf?.(leg.launchId), prior: this.deps.store.all(), now: this.now() });
            if (!r) { continue; }
            if (!r.ok) { this.unsealable.add(key); this.log(r.why); continue; }
            this.deps.store.put(r.baton);
            sealed.push(r.baton);
            this.log(`baton ${r.baton.id}: ${r.baton.why}`);
            void markStored(this.deps.store, r.baton, this.deps.headOf, this.deps.dirtOf).catch(() => undefined);
        }
        return sealed;
    }

    /**
     * S-74 — THE USER'S BUTTON: start the successor NOW. A waiting baton goes
     * through the door without waiting for its session to end (the person
     * pressing this knows the predecessor is done, or accepts two runs); a
     * baton parked on a queued row asks the pump again, which is what a hand
     * that just freed an account or lifted a ceiling wants.
     */
    startNow(b: Baton, by: string): { ok: true; baton: Baton } | { ok: false; why: string } {
        if (b.state === 'waiting-end') { return { ok: true, baton: this.release(b, `started now by ${by}, before the session ended`) }; }
        if (b.state !== 'parked') { return { ok: false, why: `a baton that is ${b.state} cannot be started now.` }; }
        if (!b.taskId) { return { ok: true, baton: this.release(b, `started now by ${by}`) }; }
        const answer = this.deps.nudge?.(b.taskId);
        if (!answer) { return { ok: false, why: `task ${b.taskId} is not a queued row any more — read baton.status and the task itself.` }; }
        if (answer.sessionId || answer.running) {
            const opened = answer.sessionId ? `successor session ${answer.sessionId.slice(0, 8)} opened` : 'successor opened';
            return { ok: true, baton: this.move(b, 'started', `started now by ${by}; ${opened} on task ${answer.taskId}`,
                { taskId: answer.taskId, ...(answer.sessionId ? { toSessionId: answer.sessionId } : {}) }) ?? b };
        }
        return { ok: true, baton: this.move(b, 'parked', `asked again by ${by}; task ${answer.taskId} is still held — ${answer.held || 'waiting for the pump'}`,
            { taskId: answer.taskId }) ?? b };
    }

    /**
     * S-84 — a baton that reached the door with no card on the board gets one
     * now: the failsafe's rescue hop is a handover too, and it is written by a
     * session that is already gone.
     */
    private hang(b: Baton): Baton {
        if (b.a2aNoteId || !this.deps.board) { return b; }
        const noteId = this.deps.board.hang(b, this.now());
        if (!noteId) { return b; }
        const hung = { ...b, a2aNoteId: noteId };
        this.deps.store.put(hung);
        return hung;
    }

    /** The session is over: through the door, and the baton records what the door did. */
    private release(baton: Baton, why: string): Baton {
        const b = this.hang(baton);
        this.log(`baton ${b.id}: released — ${why}`);
        let answer: DoorAnswer;
        try { answer = this.deps.door(b); } catch (e) {
            const refused = this.move(b, 'refused', `${why}; the door refused: ${String((e as Error)?.message ?? e)}`) ?? b;
            this.tell(refused);
            return refused;
        }
        if (answer.sessionId) {
            return this.move(b, 'started', `${why}; successor session ${answer.sessionId.slice(0, 8)} opened on task ${answer.taskId}`,
                { taskId: answer.taskId, toSessionId: answer.sessionId }) ?? b;
        }
        if (answer.running) {
            return this.move(b, 'started', `${why}; successor opened on task ${answer.taskId} — its session is bound when the engine names it`,
                { taskId: answer.taskId }) ?? b;
        }
        if (answer.wakeAt && answer.wakeAt > this.now()) {
            // S-73 — every account is full: parked until the first reset, and
            // said ONCE. The pump wakes the row itself (its notBefore); no timer here.
            const at = (this.deps.fmtTime ?? (t => new Date(t).toISOString().slice(11, 16)))(answer.wakeAt);
            const parked = this.move(b, 'parked', `${why}; every account is full — task ${answer.taskId} wakes at ${at}`,
                { taskId: answer.taskId, wakeAt: answer.wakeAt }) ?? b;
            try {
                this.deps.notify?.(`Baton parked — chain ${b.chainId} hop ${b.hop} starts at ${at}`,
                    `Every account is full, so the successor of session ${b.from.sessionId.slice(0, 8)} (${b.from.agentId}) waits on task `
                    + `${answer.taskId} until ${at} (the first reset plus the safety buffer). The pump starts it then; `
                    + 'baton.now starts it sooner once you have made room, baton.stop drops it.', `baton:${b.id}:parked`);
            } catch { /* best effort */ }
            return parked;
        }
        return this.move(b, 'parked', `${why}; task ${answer.taskId} is on the board — ${answer.held || 'waiting for the pump to start it'}`,
            { taskId: answer.taskId }) ?? b;
    }

    private move(b: Baton, to: Baton['state'], why: string, patch: Partial<Pick<Baton, 'taskId' | 'toSessionId' | 'wakeAt'>> = {}): Baton | undefined {
        const r = moveBaton(b, to, why, this.now(), patch);
        if (!r.ok) { this.log(`baton ${b.id}: ${r.why}`); return undefined; }
        this.deps.store.put(r.baton);
        // S-84 — the successor is running, so the words have reached the run
        // they were written for: the card leaves the active board.
        if (to === 'started') { this.deps.board?.handedOn(r.baton.a2aNoteId, this.now()); }
        return r.baton;
    }

    private tell(b: Baton): void {
        try {
            this.deps.notify?.(`Baton refused — chain ${b.chainId} hop ${b.hop}`,
                `${b.why}\n\nPassed by session ${b.from.sessionId.slice(0, 8)} (${b.from.agentId}). The chain stops here; `
                + 'nothing was started. baton.status shows the record.', `baton:${b.id}`);
        } catch { /* best effort */ }
    }
}
