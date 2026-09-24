/**
 * ‼️ M-13 — WHAT THE SUPERVISOR IS SHOWN, AND HOW IT IS ASKED.
 *
 * The runner (supervisorRunner.ts) takes both as dependencies; these are the
 * real ones. The incident is built from the task rows and three read-only
 * sources the host hands in (the transcript's tail, the folder's git state, the
 * retries left), never from the whole transcript. The call is one read-only
 * turn spawned with an ARGUMENT VECTOR and the prompt on STDIN: the incident
 * carries transcript text and git output, and a prompt spelt into a shell line
 * is a prompt the shell gets to read first.
 */
import * as cp from 'child_process';
import { oneShotArgv, oneShotEngines, oneShotEnv, oneShotEnvelope } from './oneShot';
import { buildIncident, IncidentAttempt, IncidentBundle } from './retryIncident';
import type { SupervisorPolicy } from './retrySupervisor';
import type { SupervisorAnswer } from './supervisorRunner';
import type { FarmTask } from './tasks';

export interface IncidentSources {
    all: () => readonly FarmTask[];
    /** the engine's own id for a row (batonDoor.rowSessionId) */
    sessionOf: (t: FarmTask) => string | undefined;
    /** the conversation's last turns as plain text; '' when it cannot be read */
    lastTurns: (sessionId: string) => Promise<string>;
    /** `git status --short` + `git diff --stat` of the run's folder; undefined when it is not a repository */
    changes: (t: FarmTask) => Promise<{ status: string; stat: string } | undefined>;
    retriesLeft: (row: FarmTask) => number;
}

const lastWord = (t: FarmTask): string =>
    [...(t.events ?? [])].reverse().find(e => e.kind === 'finished')?.note ?? '';

/** Every run of the chain the held row belongs to, oldest first, as attempts. */
export function attemptsOf(all: readonly FarmTask[], row: FarmTask): IncidentAttempt[] {
    const origin = row.retryOf ?? row.id;
    return all.filter(t => t.id !== row.id && (t.id === origin || t.retryOf === origin) && t.endedAt)
        .sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0))
        .map((t, i) => ({
            n: (t.retryAttempt ?? i) + 1, at: t.endedAt ?? t.createdAt,
            ...(t.failurePhase ? { phase: t.failurePhase } : {}), why: lastWord(t) || t.status
        }));
}

export function incidentFrom(src: IncidentSources): (row: FarmTask, failed: FarmTask | undefined) => Promise<IncidentBundle> {
    return async (row, failed) => {
        const f = failed ?? row;
        const sid = src.sessionOf(f) ?? row.resumeSessionId;
        const origin = row.retryOf ? src.all().find(t => t.id === row.retryOf) : undefined;
        const [turns, changes] = await Promise.all([
            sid ? src.lastTurns(sid).catch(() => '') : Promise.resolve(''),
            src.changes(f).catch(() => undefined)
        ]);
        return buildIncident({
            key: row.supervision?.key ?? row.id,
            task: { id: row.id, title: row.title, prompt: origin?.prompt ?? f.prompt },
            failure: {
                phase: f.failurePhase ?? 'unknown', why: lastWord(f) || 'no reason was recorded', engine: f.engine || 'claude',
                ...(sid ? { sessionId: sid } : {}), ...(row.resetAt ? { resetAt: row.resetAt } : {})
            },
            attempts: attemptsOf(src.all(), row),
            lastTurns: turns || '(the transcript could not be read)',
            ...(changes ? { changes } : {}),
            remaining: { retries: Math.max(0, src.retriesLeft(row)) }
        });
    };
}

/** A model name the spawn may carry: `shell` is on for Windows, so nothing but a name gets through. */
const SAFE_MODEL = /^[\w.:\-[\]]{1,80}$/;

export interface AskDeps {
    cwdOf: (row: FarmTask) => string;
    /** the sign-in the supervisor runs on (the same pick `supervisorRoom` previewed) */
    accountFor?: (p: SupervisorPolicy) => string | undefined;
    timeoutMs?: number;
    spawn?: typeof cp.spawn;
}

/** One read-only turn of the supervisor's engine; its reply, cost and session as the runner reads them. */
export function supervisorAsk(d: AskDeps): (p: SupervisorPolicy, prompt: string, row: FarmTask) => Promise<SupervisorAnswer> {
    return (p, prompt, row) => new Promise(resolve => {
        if (p.model && !SAFE_MODEL.test(p.model)) { resolve({ text: '', error: `the supervisor model "${p.model.slice(0, 40)}" is not a model name` }); return; }
        const argv = oneShotArgv({ engine: p.engine, ...(p.model ? { model: p.model } : {}), json: true, readOnly: true });
        if (!argv) {
            resolve({ text: '', error: `no one-shot turn is implemented for "${p.engine}" yet — the engines that can be asked are ${oneShotEngines().join(', ')}` });
            return;
        }
        let done = false;
        const finish = (a: SupervisorAnswer): void => { if (!done) { done = true; resolve(a); } };
        let child: cp.ChildProcess;
        try {
            const account = d.accountFor?.(p);
            child = (d.spawn ?? cp.spawn)(argv.cmd, argv.args, {
                cwd: d.cwdOf(row), windowsHide: true, shell: process.platform === 'win32',
                env: oneShotEnv({ engine: p.engine, ...(account ? { account } : {}) })
            });
        } catch (e) { finish({ text: '', error: String((e as Error)?.message ?? e) }); return; }
        const ms = d.timeoutMs ?? 240_000;
        const timer = setTimeout(() => {
            try { child.kill(); } catch { /* gone */ }
            finish({ text: '', error: `the supervisor passed its ${Math.round(ms / 1000)}s ceiling and was cut` });
        }, ms);
        let out = '', err = '';
        child.stdout?.on('data', b => { out += String(b); });
        child.stderr?.on('data', b => { err += String(b); });
        child.on('error', e => { clearTimeout(timer); finish({ text: '', error: String(e?.message ?? e) }); });
        child.on('close', () => {
            clearTimeout(timer);
            const env = oneShotEnvelope(p.engine, out);
            if (!env) { finish(out.trim() ? { text: out.trim() } : { text: '', error: (err.trim() || 'no output').slice(0, 200) }); return; }
            finish({
                text: env.result,
                ...(env.costUSD ? { costUsd: env.costUSD } : {}),
                ...(env.sessionId ? { sessionId: env.sessionId } : {}),
                ...(env.isError ? { error: `the engine reported an error (${env.subtype ?? 'unknown'})` } : {})
            });
        });
        if (argv.stdin) { child.stdin?.end(prompt); } else { child.stdin?.end(); }
    });
}
