/**
 * X-369 — PRESETS: a named set of flex point values, applied at one level.
 *
 * Built-in presets ship here; the user's own live in `agentFarm.flexPresets`,
 * global or bound to one project. Launch profiles and the sentry's three
 * presets keep working exactly as they do — the library LISTS them, with the
 * door that applies them, rather than absorbing them.
 *
 * Editing after applying never changes the preset: `presetDiff` reads the
 * current values against it ("Balanced + 2 changes").
 */
import { FLEX_LEVEL_LABELS, FlexLevel, flexPoint, flexValid } from './flexPoints';

export type PresetScope = 'global' | 'project';

export interface FlexPreset {
    name: string;
    /** point id → value */
    values: Record<string, unknown>;
    scope: PresetScope;
    /** the project id when scope is `project` */
    project?: string;
    describe?: string;
    /** a family of presets that are alternatives to each other */
    family?: string;
    builtin?: boolean;
}

export interface PresetEntry {
    kind: 'flex' | 'launch' | 'sentry';
    name: string;
    describe?: string;
    family?: string;
    scope?: PresetScope;
    project?: string;
    builtin?: boolean;
    values?: Record<string, unknown>;
    /** for a preset this library does not apply itself: the door that does */
    appliedBy?: string;
}

/**
 * The cost profile. Balanced IS the shipped behaviour, so applying it changes
 * nothing; Economy and Quality move only caps and the judge's model. Models of
 * engine-specific points are left alone — a name one engine accepts is an
 * error on another.
 */
export const BUILTIN_PRESETS: FlexPreset[] = [
    {
        name: 'Economy', family: 'cost', scope: 'global', builtin: true,
        describe: 'The cheapest judge, one supervisor call with a $0.50 cap, $1 a day of sentry leader turns.',
        values: {
            'judge.args': '--model claude-haiku-4-5-20251001',
            'retry.supervisor.maxCalls': 1, 'retry.supervisor.budgetUsd': 0.5,
            'sentry.leaderBudgetUsd': 1
        }
    },
    {
        name: 'Balanced', family: 'cost', scope: 'global', builtin: true,
        describe: 'The shipped defaults.',
        values: {
            'judge.args': '--model claude-haiku-4-5-20251001',
            'retry.supervisor.maxCalls': 2, 'retry.supervisor.budgetUsd': 0,
            'sentry.leaderBudgetUsd': 2
        }
    },
    {
        name: 'Quality', family: 'cost', scope: 'global', builtin: true,
        describe: 'A stronger judge, three supervisor calls, $5 a day of sentry leader turns.',
        values: {
            'judge.args': '--model claude-sonnet-5',
            'retry.supervisor.maxCalls': 3, 'retry.supervisor.budgetUsd': 0,
            'sentry.leaderBudgetUsd': 5
        }
    }
];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Why a preset cannot be stored, or '' — unknown points and values their type cannot hold are named. */
export function presetError(p: Partial<FlexPreset>): string {
    if (!p || typeof p.name !== 'string' || !p.name.trim()) { return 'A preset needs a name.'; }
    if (!isObj(p.values) || !Object.keys(p.values).length) { return `${p.name}: a preset sets at least one flex point.`; }
    for (const [id, v] of Object.entries(p.values)) {
        const pt = flexPoint(id);
        if (!pt) { return `${p.name}: "${id}" is not a flex point.`; }
        if (!flexValid(pt, v)) { return `${p.name}: ${JSON.stringify(v)} is not a valid ${pt.type} for ${id}.`; }
    }
    if (p.scope === 'project' && !String(p.project ?? '').trim()) { return `${p.name}: a project preset names its project.`; }
    return '';
}

/** The stored list, made safe: a malformed entry is dropped, never half-read. */
export function normalizePresets(raw: unknown): FlexPreset[] {
    if (!Array.isArray(raw)) { return []; }
    return raw.filter(isObj).map(o => ({
        name: String(o.name ?? '').trim(),
        values: isObj(o.values) ? o.values : {},
        scope: (o.scope === 'project' ? 'project' : 'global') as PresetScope,
        ...(o.scope === 'project' && typeof o.project === 'string' ? { project: o.project } : {}),
        ...(typeof o.describe === 'string' && o.describe.trim() ? { describe: o.describe.trim() } : {}),
        ...(typeof o.family === 'string' && o.family.trim() ? { family: o.family.trim() } : {})
    })).filter(p => !presetError(p));
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const sameScope = (p: FlexPreset, project?: string) =>
    p.scope === 'global' ? !project : p.project === project;

/** The presets that apply in a place: built-in, then global, then the project's own. */
export function presetsFor(user: FlexPreset[], project?: string): FlexPreset[] {
    return [...BUILTIN_PRESETS, ...user.filter(p => p.scope === 'global' || (!!project && p.project === project))];
}

/** One preset by name; a project's own wins over a global one of the same name. */
export function findPreset(user: FlexPreset[], name: string, project?: string): FlexPreset | undefined {
    const all = presetsFor(user, project);
    return all.find(p => p.scope === 'project' && sameName(p.name, name)) ?? all.find(p => sameName(p.name, name));
}

/** Save (or replace, or rename via `renameFrom`) one user preset. Throws the reason it cannot. */
export function savePreset(user: FlexPreset[], p: FlexPreset, renameFrom?: string): FlexPreset[] {
    const err = presetError(p);
    if (err) { throw new Error(err); }
    if (BUILTIN_PRESETS.some(b => sameName(b.name, p.name))) {
        throw new Error(`"${p.name}" is a built-in preset — save yours under another name.`);
    }
    const project = p.scope === 'project' ? p.project : undefined;
    const drop = renameFrom ?? p.name;
    if (renameFrom && !sameName(renameFrom, p.name)
        && user.some(x => sameScope(x, project) && sameName(x.name, p.name))) {
        throw new Error(`A preset named "${p.name}" already exists here.`);
    }
    const kept = user.filter(x => !(sameScope(x, project) && sameName(x.name, drop)));
    const clean: FlexPreset = { ...p, name: p.name.trim() };
    delete clean.builtin;
    return [...kept, clean];
}

/** Delete one user preset. Throws when it is built-in or not there. */
export function deletePreset(user: FlexPreset[], name: string, project?: string): FlexPreset[] {
    if (BUILTIN_PRESETS.some(b => sameName(b.name, name))) { throw new Error(`"${name}" is built-in and cannot be deleted.`); }
    const kept = user.filter(x => !(sameScope(x, project) && sameName(x.name, name)));
    if (kept.length === user.length) { throw new Error(`No preset named "${name}"${project ? ' in this project' : ''}.`); }
    return kept;
}

/** "Balanced", or "Balanced + 2 changes" when the current values moved off it. */
export function presetDiff(p: FlexPreset, current: Record<string, unknown>): { changed: string[]; label: string } {
    const changed = Object.keys(p.values).filter(id =>
        id in current && JSON.stringify(current[id]) !== JSON.stringify(p.values[id]));
    const n = changed.length;
    return { changed, label: n ? `${p.name} + ${n} change${n === 1 ? '' : 's'}` : p.name };
}

/**
 * What applying a preset at one level means on the bridge, grouped by op: each
 * point's value placed at its level's bridge key path. A point that cannot be
 * set at that level is returned in `skipped` with the reason.
 */
export function presetArgs(p: FlexPreset, level: Exclude<FlexLevel, 'builtin'>): {
    ops: Record<string, Record<string, unknown>>;
    skipped: { point: string; why: string }[];
} {
    const ops: Record<string, Record<string, unknown>> = {};
    const skipped: { point: string; why: string }[] = [];
    for (const [id, value] of Object.entries(p.values)) {
        const e = flexPoint(id)?.levels[level];
        if (!e) { skipped.push({ point: id, why: `${id} cannot be set at the ${FLEX_LEVEL_LABELS[level]} level` }); continue; }
        const colon = e.bridge.indexOf(':');
        const op = e.bridge.slice(0, colon);
        // settings.set takes `<setting key>[#path]` and a key has dots of its own; every other op, a dotted arg path
        const arg = e.bridge.slice(colon + 1);
        const segs = op === 'settings.set'
            ? arg.split('#').flatMap((s, i) => (i === 0 ? [s] : s.split('.')))
            : arg.split('.');
        let node = (ops[op] ??= {});
        segs.slice(0, -1).forEach(s => { node = (isObj(node[s]) ? node[s] : (node[s] = {})) as Record<string, unknown>; });
        node[segs[segs.length - 1]] = value;
    }
    return { ops, skipped };
}

/** The library as one list: flex presets, then the launch profiles and sentry presets it only lists. */
export function presetLibrary(
    user: FlexPreset[], project: string | undefined,
    launchProfiles: { name: string }[], sentryPresets: { id: string; label: string; describe: string }[]
): PresetEntry[] {
    return [
        ...presetsFor(user, project).map(p => ({ kind: 'flex' as const, ...p })),
        ...launchProfiles.map(l => ({
            kind: 'launch' as const, name: l.name,
            appliedBy: 'the launcher or the Console composer; launch.profiles reads it and sessions.start takes its fields'
        })),
        ...sentryPresets.map(s => ({
            kind: 'sentry' as const, name: s.label, describe: s.describe, family: 'wake',
            appliedBy: `sentry.start preset=${s.id}`
        }))
    ];
}
