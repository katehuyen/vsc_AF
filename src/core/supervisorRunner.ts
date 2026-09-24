/**
 * ‼️ M-13 — THE SUPERVISOR, ASKED. Sweeps the held retry rows whose moment has
 * come, asks the supervisor once per incident, checks its answer and hands the
 * outcome to the TaskManager. Every dependency is handed in — the call, the
 * incident, the clock — so the whole loop runs in a test exactly as in a window.
 *
 * ‼️ NEVER TWICE, NEVER RECURSIVE. A row is marked `asking` (and saved) before
 * the call; a row found `asking` that this window is not asking is one a
 * restart interrupted, and it falls back rather than being asked again. A
 * supervisor that fails — its own limit included — falls back too; there is no
 * supervisor of the supervisor.
 */
import type { FarmTask } from './tasks';
import { IncidentBundle, supervisorPrompt } from './retryIncident';
import { confident, parseDecision, SupervisorPolicy, supervisorRefusal, validateDecision } from './retrySupervisor';
import { SupervisionOutcome } from './retrySupervision';

export interface SupervisorAnswer { text: string; costUsd?: number; sessionId?: string; error?: string }

export interface SupervisorRunnerDeps {
    due: (now: number) => FarmTask[];
    begin: (row: FarmTask) => boolean;
    settle: (row: FarmTask, o: SupervisionOutcome, meta: { engine: string; originalPrompt: string; spentUsd?: number; sessionId?: string }) => void;
    find: (id: string) => FarmTask | undefined;
    policyOf: (row: FarmTask) => SupervisorPolicy | undefined;
    incidentOf: (row: FarmTask, failed: FarmTask | undefined) => Promise<IncidentBundle>;
    ask: (p: SupervisorPolicy, prompt: string, row: FarmTask) => Promise<SupervisorAnswer>;
    now?: () => number;
    log?: (line: string) => void;
}

export class SupervisorRunner {
    private readonly inFlight = new Set<string>();

    constructor(private readonly deps: SupervisorRunnerDeps) { }

    private now(): number { return (this.deps.now ?? Date.now)(); }

    /** The chain's own words: the first run's prompt, not a continuation's. */
    private originalPrompt(row: FarmTask, failed?: FarmTask): string {
        return (row.retryOf ? this.deps.find(row.retryOf)?.prompt : undefined) ?? failed?.prompt ?? row.prompt;
    }

    /** One pass. Returns the calls it started, so a caller (or a test) can wait for them. */
    sweep(): Promise<void>[] {
        const started: Promise<void>[] = [];
        for (const row of this.deps.due(this.now())) {
            const s = row.supervision!;
            if (this.inFlight.has(s.key)) { continue; }
            const p = this.deps.policyOf(row);
            const failed = this.deps.find(s.failedTask);
            const fallback = (note: string, extra: { spentUsd?: number; sessionId?: string } = {}) => this.deps.settle(row,
                { kind: 'fallback', fallback: p?.lowConfidence ?? 'smart', note },
                { engine: p?.engine ?? 'supervisor', originalPrompt: this.originalPrompt(row, failed), ...extra });
            if (!p) { fallback('the policy no longer names a supervisor'); continue; }
            if (s.state === 'asking') { fallback('the window closed while the supervisor was being asked, and an incident is never asked twice'); continue; }
            const refused = supervisorRefusal(p, { calls: s.calls, spentUsd: s.spentUsd ?? 0 });
            if (refused) { fallback(refused); continue; }
            if (!this.deps.begin(row)) { continue; }
            this.inFlight.add(s.key);
            started.push(this.askOne(row, p, failed, fallback).finally(() => this.inFlight.delete(s.key)));
        }
        return started;
    }

    private async askOne(row: FarmTask, p: SupervisorPolicy, failed: FarmTask | undefined,
        fallback: (note: string, extra?: { spentUsd?: number; sessionId?: string }) => void): Promise<void> {
        let answer: SupervisorAnswer;
        try {
            const bundle = await this.deps.incidentOf(row, failed);
            answer = await this.deps.ask(p, supervisorPrompt(bundle, this.now()), row);
        } catch (e) {
            fallback(`the supervisor could not be asked: ${String((e as Error)?.message ?? e).slice(0, 160)}`);
            return;
        }
        const extra = { ...(answer.costUsd ? { spentUsd: answer.costUsd } : {}), ...(answer.sessionId ? { sessionId: answer.sessionId } : {}) };
        if (answer.error) { fallback(`the supervisor's run failed: ${answer.error.slice(0, 160)}`, extra); return; }
        const parsed = parseDecision(answer.text);
        if (!parsed.ok) { fallback(parsed.error, extra); return; }
        const checked = validateDecision(parsed.raw, {
            now: this.now(), ...(row.resetAt ? { resetAt: row.resetAt } : {}), resumable: !!row.resumeSessionId
        });
        if (!checked.ok) { fallback(`its decision was refused — ${checked.error}`, extra); return; }
        if (!confident(checked.decision, p)) {
            fallback(`its confidence ${checked.decision.confidence.toFixed(2)} is below ${p.minConfidence.toFixed(2)} ("${checked.decision.action}": ${checked.decision.reason.slice(0, 120)})`, extra);
            return;
        }
        this.deps.settle(row, { kind: 'decision', decision: checked.decision },
            { engine: p.engine, originalPrompt: this.originalPrompt(row, failed), ...extra });
        this.deps.log?.(`supervisor: ${row.id} → ${checked.decision.action}`);
    }
}
