/**
 * U-151 — the store for a flex value set for ONE agent or ONE project.
 *
 * Decided by the user 2026-09-27 ("karma"): a workflow's own values live on its
 * record; agent and project values live in one setting, keyed the way the other
 * per-agent settings are (agents by NAME, projects by id). In the chain an agent
 * value beats Farm Settings, a project value beats the agent's, and the run's
 * own value beats both.
 */
import { flexPoint } from './flexPoints';
import { normalizeRetry, RetryPolicy } from './retry';
import { statedSupervisor, SupervisorPolicy } from './retrySupervisor';

export const FLEX_OVERRIDES_KEY = 'agentFarm.flexOverrides';

export type OverrideLevel = 'agent' | 'project';
export const OVERRIDE_LEVELS: OverrideLevel[] = ['agent', 'project'];
export type FlexOverrides = Record<OverrideLevel, Record<string, Record<string, unknown>>>;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** What the setting holds, made safe: unknown levels, non-object targets and non-point keys dropped. */
export function normalizeOverrides(raw: unknown): FlexOverrides {
    const out: FlexOverrides = { agent: {}, project: {} };
    if (!isObj(raw)) { return out; }
    for (const level of OVERRIDE_LEVELS) {
        const byTarget = raw[level];
        if (!isObj(byTarget)) { continue; }
        for (const [target, values] of Object.entries(byTarget)) {
            if (!target.trim() || !isObj(values)) { continue; }
            const kept = Object.fromEntries(Object.entries(values).filter(([id, v]) => !!flexPoint(id) && v !== undefined && v !== null));
            if (Object.keys(kept).length) { out[level][target] = kept; }
        }
    }
    return out;
}

/** The values one agent or one project states, by point id. */
export function overridesAt(raw: unknown, level: OverrideLevel, target: string | undefined): Record<string, unknown> {
    return target ? normalizeOverrides(raw)[level][target] ?? {} : {};
}

/** The setting with one value set (or, `undefined`, taken back to inherited); an emptied target disappears. */
export function withOverride(raw: unknown, level: OverrideLevel, target: string, point: string, value: unknown): FlexOverrides {
    const next = normalizeOverrides(raw);
    const values = { ...(next[level][target] ?? {}) };
    if (value === undefined || value === null) { delete values[point]; } else { values[point] = value; }
    if (Object.keys(values).length) { next[level][target] = values; } else { delete next[level][target]; }
    return next;
}

const SUP = 'retry.supervisor.';

/** The retry supervisor fields an agent and a project state, lowest first (the project's win); undefined when neither says anything. */
export function supervisorOverrides(raw: unknown, agent?: string, project?: string): Partial<SupervisorPolicy> | undefined {
    const pick = (values: Record<string, unknown>) => Object.fromEntries(
        Object.entries(values).filter(([id]) => id.startsWith(SUP)).map(([id, v]) => [id.slice(SUP.length), v]));
    return statedSupervisor({ ...pick(overridesAt(raw, 'agent', agent)), ...pick(overridesAt(raw, 'project', project)) });
}

/** Every agent's and project's supervisor fields, for a page that works out what an empty box inherits. */
export function supervisorOverrideMap(raw: unknown): Record<OverrideLevel, Record<string, Partial<SupervisorPolicy>>> {
    const all = normalizeOverrides(raw);
    const out: Record<OverrideLevel, Record<string, Partial<SupervisorPolicy>>> = { agent: {}, project: {} };
    for (const level of OVERRIDE_LEVELS) {
        for (const target of Object.keys(all[level])) {
            const s = level === 'agent' ? supervisorOverrides(raw, target) : supervisorOverrides(raw, undefined, target);
            if (s) { out[level][target] = s; }
        }
    }
    return out;
}

/** The user's default retry policy with an agent's and a project's supervisor fields laid over it, field by field. */
export function layeredRetry(base: RetryPolicy | undefined, over: Partial<SupervisorPolicy> | undefined): RetryPolicy | undefined {
    if (!over) { return base; }
    return { ...(base ?? {}), supervisor: { ...(base?.supervisor ?? {}), ...over } } as RetryPolicy;
}

/** The default retry policy FOR one run: Farm Settings, then its agent's and its project's values. `read` takes a full setting key. */
export function retryDefaultFor(read: (key: string) => unknown, t?: { agentName?: string; projectId?: string }): RetryPolicy | undefined {
    return layeredRetry(normalizeRetry(read('agentFarm.taskRetry')),
        supervisorOverrides(read(FLEX_OVERRIDES_KEY), t?.agentName, t?.projectId));
}
