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
import { underConfidence } from './decisionCore';
import { SupervisionOutcome } from './retrySupervision';
import { answeredAction, kapiciAnswerText, SupervisorKapici, supervisorOptions } from './kapiciSupervisor';
import { gate } from './kapici/shadow';
import { KapiciVerdict } from './kapici/types';
import { DEFAULT_CONTINUATION_PROMPT } from './retry';

/** A policy whose engine is Kapıcı asks no model at all (agentFarm.kapici.retry must not be off). */
export const KAPICI_ENGINE = 'kapici';

export interface SupervisorAnswer { text: string; costUsd?: number; sessionId?: string; error?: string }

export interface SupervisorRunnerDeps {
    due: (now: number) => FarmTask[];
    begin: (row: FarmTask) => boolean;
    settle: (row: FarmTask, o: SupervisionOutcome, meta: { engine: string; originalPrompt: string; spentUsd?: number; sessionId?: string }) => void;
    find: (id: string) => FarmTask | undefined;
    policyOf: (row: FarmTask) => SupervisorPolicy | undefined;
    incidentOf: (row: FarmTask, failed: FarmTask | undefined) => Promise<IncidentBundle>;
    ask: (p: SupervisorPolicy, prompt: string, row: FarmTask) => Promise<SupervisorAnswer>;
    /** agentFarm.kapici.retry: undefined when off, so the call below is exactly today's. */
    kapici?: () => SupervisorKapici | undefined;
    /** The continuation a resume sends — the policy's own text for the next attempt. */
    continuationOf?: (row: FarmTask) => string;
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
        let by = p.engine;
        try {
            const bundle = await this.deps.incidentOf(row, failed);
            const k = this.deps.kapici?.();
            const ctx = { resumable: !!row.resumeSessionId, ...(row.resetAt ? { resetAt: row.resetAt } : {}) };
            const options = supervisorOptions(ctx);
            const fromVerdict = (v: KapiciVerdict): SupervisorAnswer | undefined => {
                const text = kapiciAnswerText(v, { ...ctx, continuation: this.deps.continuationOf?.(row) ?? DEFAULT_CONTINUATION_PROMPT });
                return text ? { text, ...(v.costUsd ? { costUsd: v.costUsd } : {}) } : undefined;
            };
            if (p.engine === KAPICI_ENGINE) {
                if (!k) { fallback('the policy names Gatekeeper as its supervisor, and Gatekeeper is off for retries (agentFarm.kapici.retry)'); return; }
                const v = await k.evaluate(bundle, options, 'on');
                const a = v.fallback === undefined ? fromVerdict(v) : undefined;
                if (!a) { fallback(`Gatekeeper could not decide — ${v.reason.slice(0, 160)}`); return; }
                answer = a;
            } else if (k) {
                const g = await gate<SupervisorAnswer>({
                    mode: k.mode, today: () => this.deps.ask(p, supervisorPrompt(bundle, this.now()), row),
                    ask: (m, actual) => k.evaluate(bundle, options, m, actual),
                    decisionOf: a => answeredAction(a.text), fromVerdict, log: k.log
                });
                answer = g.value;
                if (g.by === 'kapici') { by = KAPICI_ENGINE; }
            } else {
                answer = await this.deps.ask(p, supervisorPrompt(bundle, this.now()), row);
            }
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
            fallback(`${underConfidence(checked.decision.confidence, p.minConfidence)} ("${checked.decision.action}": ${checked.decision.reason.slice(0, 120)})`, extra);
            return;
        }
        this.deps.settle(row, { kind: 'decision', decision: checked.decision },
            { engine: by, originalPrompt: this.originalPrompt(row, failed), ...extra });
        this.deps.log?.(`supervisor: ${row.id} → ${checked.decision.action}${by === KAPICI_ENGINE ? ' (Gatekeeper)' : ''}`);
    }
}
