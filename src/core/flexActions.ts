/**
 * What can be DONE with flex points and presets — one implementation the bridge
 * (`flexBridge.ts`) and the Farm Settings card (`panels/settingsFlex.ts`) both
 * call (U-152). A refusal is thrown as an Error carrying the sentence to show.
 */
import { FLEX_POINTS, FlexLevel, FlexPoint, flexPoint, flexValid } from './flexPoints';
import {
    deletePreset, findPreset, FlexPreset, normalizePresets, presetArgs, presetDiff, presetsFor, savePreset
} from './flexPresets';
import { FLEX_OVERRIDES_KEY, OverrideLevel, withOverride } from './flexOverrides';
import { FlexLayers, resolveFlex, settingsLayer } from './flexResolve';

export interface FlexDeps {
    /** what the USER wrote for a full setting key; undefined when untouched */
    readSetting(key: string): unknown;
    /** write one full setting key at user scope (undefined removes it) */
    writeSetting(key: string, value: unknown): Promise<void>;
}

export const PRESETS_KEY = 'agentFarm.flexPresets';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** `patch` laid over `base` key by key, objects merged rather than replaced. */
export function deepMerge(base: unknown, patch: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = isObj(base) ? { ...base } : {};
    for (const [k, v] of Object.entries(patch)) { out[k] = isObj(v) ? deepMerge(out[k], v) : v; }
    return out;
}

export const userPresets = (deps: FlexDeps): FlexPreset[] => normalizePresets(deps.readSetting(PRESETS_KEY));

function pointOrThrow(id: string): FlexPoint {
    const p = flexPoint(id);
    if (!p) { throw new Error(`"${id}" is not a flex point — flex.list shows every one.`); }
    return p;
}

/**
 * Set one point's Farm Settings value, or put it back to inherited with
 * `undefined`. A value inside an object setting is written into that object —
 * its other fields are kept.
 */
export async function setFlexSetting(deps: FlexDeps, id: string, value: unknown) {
    const p = pointOrThrow(id);
    const e = p.levels.settings;
    if (!e) { throw new Error(`${id} has no Farm Settings value — it is set ${Object.keys(p.levels).join(', ')}.`); }
    // ‼️ a Farm-wide value kept outside VS Code's settings (the Airtable page's defaults) has its own op;
    // reading its surface as a setting key wrote a nonsense key and reported success
    if (!e.surface.startsWith('setting:')) {
        throw new Error(`${id}'s Farm-wide value is not a VS Code setting — ${e.bridge} writes it.`);
    }
    if (value !== undefined && !flexValid(p, value)) { throw new Error(`${JSON.stringify(value)} is not a valid ${p.type} for ${id}.`); }
    const [key, sub] = e.surface.slice('setting:'.length).split('#');
    if (!sub) {
        await deps.writeSetting(key, value);
    } else {
        const segs = sub.split('.');
        const next = deepMerge(deps.readSetting(key), {});
        let node = next;
        for (const s of segs.slice(0, -1)) { node = (node[s] = isObj(node[s]) ? { ...(node[s] as object) } : {}) as Record<string, unknown>; }
        if (value === undefined) { delete node[segs[segs.length - 1]]; } else { node[segs[segs.length - 1]] = value; }
        await deps.writeSetting(key, next);
    }
    return resolveFlex(p, { settings: value });
}

/**
 * U-151 — set one point for ONE agent or ONE project (`agentFarm.flexOverrides`), or
 * take it back to inherited with `undefined`. Refused for a point that is not set
 * at that level, and for a value the point does not accept.
 */
export async function setFlexOverride(deps: FlexDeps, id: string, level: OverrideLevel, target: string, value: unknown) {
    const p = pointOrThrow(id);
    if (!p.levels[level]) { throw new Error(`${id} is not set per ${level} — it is set ${Object.keys(p.levels).join(', ')}.`); }
    const who = String(target ?? '').trim();
    if (!who) { throw new Error(`target: which ${level} (${level === 'agent' ? 'its name' : 'its id'}).`); }
    if (value !== undefined && !flexValid(p, value)) { throw new Error(`${JSON.stringify(value)} is not a valid ${p.type} for ${id}.`); }
    await deps.writeSetting(FLEX_OVERRIDES_KEY, withOverride(deps.readSetting(FLEX_OVERRIDES_KEY), level, who, id, value));
    const layers: FlexLayers = { settings: settingsLayer(p, deps.readSetting) };
    layers[level] = value;
    return { level, target: who, ...resolveFlex(p, layers) };
}

/** Apply a preset at one level — written at Farm Settings (merged), returned as op args elsewhere. */
export async function applyPresetAt(
    deps: FlexDeps, name: string, level: Exclude<FlexLevel, 'builtin'> = 'settings',
    opts: { dryRun?: boolean; project?: string } = {}
) {
    const p = findPreset(userPresets(deps), name, opts.project);
    if (!p) { throw new Error(`No preset "${name}" — presets.list shows them (launch profiles and sentry presets apply through their own doors).`); }
    const { ops, skipped } = presetArgs(p, level);
    const write = level === 'settings' && opts.dryRun !== true;
    if (write) {
        for (const [key, v] of Object.entries(ops['settings.set'] ?? {})) {
            await deps.writeSetting(key, isObj(v) ? deepMerge(deps.readSetting(key), v) : v);
        }
    }
    const points = Object.keys(p.values).filter(id => !skipped.some(s => s.point === id)).map(id => {
        const pt = pointOrThrow(id);
        const layers: FlexLayers = level === 'settings' ? {} : { settings: settingsLayer(pt, deps.readSetting) };
        layers[level] = p.values[id];
        const r = resolveFlex(pt, layers, { [level]: p.name });
        return { point: id, value: r.value, from: r.from, sentence: r.sentence };
    });
    return { preset: p.name, level, written: write, points, args: ops, skipped };
}

export async function savePresetAs(deps: FlexDeps, p: FlexPreset, renameFrom?: string) {
    const next = savePreset(userPresets(deps), p, renameFrom);
    await deps.writeSetting(PRESETS_KEY, next);
    return { saved: p.name.trim(), count: next.length };
}

export async function deletePresetNamed(deps: FlexDeps, name: string, project?: string) {
    const next = deletePreset(userPresets(deps), name, project);
    await deps.writeSetting(PRESETS_KEY, next);
    return { deleted: name, count: next.length };
}

/** Every Farm Settings point as it stands now — the values a "save as preset" keeps. */
export function currentSettingsValues(deps: FlexDeps): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const p of FLEX_POINTS) {
        if (p.levels.settings) { out[p.id] = resolveFlex(p, { settings: settingsLayer(p, deps.readSetting) }).value; }
    }
    return out;
}

/**
 * What the Farm Settings card draws: every point with a Farm Settings level —
 * DERIVED from the registry, so a point added there gains its row with nobody
 * touching the page — and the flex presets, each read against the values now.
 */
export function flexSettingsState(deps: FlexDeps) {
    const now = currentSettingsValues(deps);
    return {
        points: FLEX_POINTS.filter(p => p.levels.settings).map(p => {
            const r = resolveFlex(p, { settings: settingsLayer(p, deps.readSetting) });
            return {
                id: p.id, label: p.label, type: p.type, default: p.default, value: r.value, from: r.from,
                sentence: r.sentence, key: p.levels.settings!.surface.slice('setting:'.length),
                ...(p.min !== undefined ? { min: p.min } : {}), ...(p.max !== undefined ? { max: p.max } : {}),
                ...(p.options ? { options: p.options } : {}), ...(p.states ? { states: p.states } : {}),
                ...(p.emptyLabel ? { emptyLabel: p.emptyLabel } : {})
            };
        }),
        presets: presetsFor(userPresets(deps)).map(p => ({
            name: p.name, builtin: !!p.builtin, family: p.family ?? '', describe: p.describe ?? '',
            scope: p.scope, values: p.values, reads: presetDiff(p, now).label,
            matches: presetDiff(p, now).changed.length === 0
        }))
    };
}
