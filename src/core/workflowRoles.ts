/**
 * M-53 — A STEP CAN NAME A ROLE INSTEAD OF AN AGENT. A role (senarist, kurgu,
 * yayinci …) is a slot: which agent fills it is decided where the workflow is
 * used, never baked into a recipe — the workflow's own binding, else the
 * Farm's showrunner (agentFarm.showrunner, default youtuber), who leads a
 * content crew and takes every role nobody was given. Pure.
 */
import { resolveFlex } from './flexResolve';

export const ROLE_KEY = /^[a-z][a-z0-9-]{0,23}$/;
export const DEFAULT_SHOWRUNNER = 'youtuber';
/** step kinds that stand in an agent's place in a step's agentName — never a role's name */
const RESERVED = ['media', 'webhook', 'approval', 'select', 'checkpoint', 'tool', 'browser', 'showrunner'];

export type RoleMap = Record<string, string>;
export interface RoleAgent { id: string; name: string }
export interface RoleFill { agent?: RoleAgent; from: 'workflow' | 'showrunner'; why: string; error?: string }

export function roleKeyRefusal(k: unknown): string {
    const s = String(k ?? '').trim();
    if (!ROLE_KEY.test(s)) { return `role "${s}" is not a role name — lower-case letters, digits and "-", starting with a letter (senarist, kurgu, yayinci)`; }
    if (RESERVED.includes(s)) { return `role "${s}" is a step kind or the showrunner itself, not a role`; }
    return '';
}

const findIn = (agents: RoleAgent[], ref: string): RoleAgent | undefined =>
    agents.find(a => a.id === ref) ?? agents.find(a => a.name.toLowerCase() === ref.toLowerCase());

/** A roles box or argument without its blanks; nothing left = undefined. */
export function cleanRoles(raw: unknown): RoleMap | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const out: RoleMap = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        const key = k.trim(), val = String(v ?? '').trim();
        if (key && val) { out[key] = val; }
    }
    return Object.keys(out).length ? out : undefined;
}

/** Refused by name: a role that is not one, an agent that does not exist. '' = fine. */
export function rolesRefusal(raw: unknown, agents: RoleAgent[]): string {
    if (raw === undefined || raw === null) { return ''; }
    if (typeof raw !== 'object' || Array.isArray(raw)) { return 'roles is an object: {"<role>": "<agent name or id>"}'; }
    for (const [k, v] of Object.entries(cleanRoles(raw) ?? {})) {
        const no = roleKeyRefusal(k);
        if (no) { return no; }
        if (!findIn(agents, v)) { return `role "${k}": there is no agent "${v}"`; }
    }
    return '';
}

/** The agent a role is filled with, and where that came from — the workflow's binding, else the showrunner (flex point workflow.role). */
export function fillRole(role: string, o: { workflow?: RoleMap; showrunner?: string; agents: RoleAgent[] }): RoleFill {
    const r = resolveFlex('workflow.role', {
        settings: (o.showrunner ?? '').trim() || undefined,
        workflow: o.workflow?.[role]?.trim() || undefined
    });
    const ref = String(r.value || DEFAULT_SHOWRUNNER);
    const from = r.from === 'workflow' ? 'workflow' as const : 'showrunner' as const;
    const why = `role ${role}: ${r.sentence}${from === 'showrunner' ? ' — the showrunner takes every role the workflow leaves open' : ''}`;
    const agent = findIn(o.agents, ref);
    return agent ? { agent, from, why } : { from, why, error: `role "${role}" goes to ${from === 'workflow' ? 'this workflow\'s' : 'the showrunner'} "${ref}", and there is no such agent` };
}

/** Every role the steps name, first appearance first. */
export function stepRoles(steps: { role?: string }[]): string[] {
    return [...new Set(steps.map(s => (s.role ?? '').trim()).filter(Boolean))];
}

/** workflows.roles: every role a workflow's steps name, who fills it and why. */
export function rolesReport(w: { steps: { role?: string }[]; roles?: RoleMap }, showrunner: string, agents: RoleAgent[]) {
    return {
        showrunner: showrunner.trim() || DEFAULT_SHOWRUNNER,
        roles: stepRoles(w.steps).map(role => {
            const r = fillRole(role, { workflow: w.roles, showrunner, agents });
            return { role, ...(r.agent ? { agent: r.agent.name } : {}), from: r.from, why: r.why, ...(r.error ? { error: r.error } : {}) };
        })
    };
}
