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
import { Baton, isLive, moveBaton } from './baton';
import { BatonStore } from './batonStore';

/** What the live monitor holds for a session. */
export type LiveKnowledge = 'alive' | 'ended' | 'unknown';

export interface EndEvidence {
    /** a live CLI process is registered for the session (the CLI's own registry) */
    registered: boolean;
    /** what the live monitor knows */
    live: LiveKnowledge;
    /** does this engine register its processes at all (claude does; the others do not) */
    registers: boolean;
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
    if (ev.live === 'ended') { return { ended: true, why: 'the watcher saw the session end' }; }
    if (ev.registers) { return { ended: true, why: 'no live CLI process is registered for the session' }; }
    if (ev.live === 'unknown') { return { ended: true, why: 'no watcher knows the session any more' }; }
    return { ended: false, why: 'the watcher still holds the session open' };
}

/** What the door answered: the row it opened, and the session when already known. */
export interface DoorAnswer {
    taskId: string;
    sessionId?: string;
    /** why the row is not running yet (a ceiling, the automation gate) */
    held?: string;
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
    /** the two moments a person is told: a refusal, and nothing else here */
    notify?: (title: string, body: string, key: string) => void;
    now?: () => number;
    log?: (line: string) => void;
}

/** A baton on a task row: the row's session becomes the successor. */
export function bindSuccessor(b: Baton, sessionId: string, now: number): Baton {
    return { ...b, toSessionId: sessionId, why: `successor session ${sessionId.slice(0, 8)} is running`, updatedAt: now };
}

export class BatonRunner {
    constructor(private readonly deps: BatonRunnerDeps) { }

    private now(): number { return (this.deps.now ?? Date.now)(); }
    private log(line: string): void { try { this.deps.log?.(line); } catch { /* best effort */ } }

    private waiting(): Baton[] {
        return this.deps.store.all().filter(b => b.state === 'waiting-end');
    }

    /** One of the three signals: this session ended. Releases its baton, if any. */
    sessionEnded(sessionId: string, reason: string): Baton[] {
        const sid = String(sessionId ?? '').trim();
        if (!sid) { return []; }
        return this.waiting()
            .filter(b => b.from.sessionId === sid)
            .map(b => this.release(b, `session ended (${reason || 'end'})`));
    }

    /**
     * The backup, and the boot pass: every waiting baton whose session cannot be
     * shown alive is released; the rest are listed with why they wait.
     */
    sweep(): { released: Baton[]; waiting: { id: string; sessionId: string; why: string }[] } {
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
        return { released, waiting };
    }

    /**
     * The successor's row moved. A row that names its session binds the baton
     * to it (`parked` → `started`); a row that ended without ever naming one is
     * a refusal, with the row's own last word as the reason.
     */
    follow(): Baton[] {
        const read = this.deps.task;
        if (!read) { return []; }
        const changed: Baton[] = [];
        for (const b of this.deps.store.all()) {
            if (!isLive(b) || !b.taskId || b.toSessionId) { continue; }
            const t = read(b.taskId);
            if (!t) { continue; }
            if (t.sessionId) {
                const next = b.state === 'started'
                    ? bindSuccessor(b, t.sessionId, this.now())
                    : this.move(b, 'started', `successor session ${t.sessionId.slice(0, 8)} is running`, { toSessionId: t.sessionId });
                if (next) { changed.push(next); }
            } else if (t.status === 'done' || t.status === 'failed' || t.status === 'cancelled') {
                const next = this.move(b, 'refused', `task ${b.taskId} ${t.status} before a session started${t.why ? `: ${t.why}` : ''}`);
                if (next) { changed.push(next); this.tell(next); }
            }
        }
        return changed;
    }

    /** The session is over: through the door, and the baton records what the door did. */
    private release(b: Baton, why: string): Baton {
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
        return this.move(b, 'parked', `${why}; task ${answer.taskId} is on the board — ${answer.held || 'waiting for the pump to start it'}`,
            { taskId: answer.taskId }) ?? b;
    }

    private move(b: Baton, to: Baton['state'], why: string, patch: Partial<Pick<Baton, 'taskId' | 'toSessionId'>> = {}): Baton | undefined {
        const r = moveBaton(b, to, why, this.now(), patch);
        if (!r.ok) { this.log(`baton ${b.id}: ${r.why}`); return undefined; }
        this.deps.store.put(r.baton);
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
