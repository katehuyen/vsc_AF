/**
 * U-151 — 'Run with…' on a saved schedule: one run's own supervisor values, laid
 * over the schedule's own supervised retry for that run only. The page's card and
 * `schedules.runNow` both come through here; a cost preset contributes its
 * run-level supervisor values (the ones `tasks.add` takes).
 */
import { flexPoint, flexPointIds, flexValid } from './flexPoints';
import { FlexPreset, presetArgs } from './flexPresets';
import { RetryPolicy } from './retry';

const SUP = 'retry.supervisor.';
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The supervisor fields one run can set: the retry.supervisor points with a run level. */
export const runSupervisorFields = (): string[] =>
    flexPointIds().filter(id => id.startsWith(SUP) && !!flexPoint(id)?.levels.run).map(id => id.slice(SUP.length));

/** A card's or a bridge call's supervisor values, each checked against its point; '' / null = say nothing. */
export function runSupervisor(raw: unknown): { value: Record<string, unknown>; error: string } {
    if (raw === undefined || raw === null) { return { value: {}, error: '' }; }
    if (!isObj(raw)) { return { value: {}, error: `supervisor is an object: {${runSupervisorFields().join('?, ')}?}` }; }
    const value: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
        if (v === undefined || v === null || v === '') { continue; }
        const p = flexPoint(SUP + k);
        if (!p || !p.levels.run) { return { value: {}, error: `supervisor.${k}: one run sets ${runSupervisorFields().join(', ')}` }; }
        const typed = p.type === 'number' && typeof v === 'string' ? Number(v) : v;
        if (!flexValid(p, typed)) { return { value: {}, error: `supervisor.${k}: ${JSON.stringify(v)} is not a valid ${p.type}` }; }
        value[k] = typed;
    }
    return { value, error: '' };
}

/** The schedule's own retry with this run's supervisor values laid over it — refused unless it is supervised. */
export function retryForRun(own: RetryPolicy | undefined, sup: Record<string, unknown>): { retry?: RetryPolicy; error: string } {
    if (!Object.keys(sup).length) { return { retry: own, error: '' }; }
    if (!own || own.behavior !== 'supervisor') {
        return { error: 'its retry is not supervised — there is no supervisor to set for one run' };
    }
    return { retry: { ...own, supervisor: { ...(own.supervisor ?? {}), ...sup } as RetryPolicy['supervisor'] }, error: '' };
}

/** What picking a preset on the card fills in: its run-level supervisor values. */
/** A-27 — a preset's values for one workflow run: every point it sets whose run level is a workflows.run key. */
export function workflowRunPreset(p: FlexPreset): Record<string, unknown> {
    return { ...(presetArgs(p, 'run').ops['workflows.run'] ?? {}) };
}

export function presetSupervisor(p: FlexPreset): Record<string, unknown> {
    const t = presetArgs(p, 'run').ops['tasks.add'] as { retry?: { supervisor?: Record<string, unknown> } } | undefined;
    return { ...(t?.retry?.supervisor ?? {}) };
}
