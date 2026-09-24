/**
 * X-368 — the flex points on the bridge: `flex.list` (the registry) and
 * `flex.get` (one point's value and where it came from). Both call the same
 * registry and resolver every surface uses; nothing is restated here.
 */
import { argStr, BridgeRegistry, need, optStr } from './bridge';
import { FLEX_LEVEL_LABELS, FLEX_LEVELS, FLEX_POINTS, FlexCtx, FlexLevel, flexApplies, flexLevelsOf, flexPoint } from './flexPoints';
import {
    deletePreset, findPreset, FlexPreset, normalizePresets, presetArgs, presetLibrary, savePreset
} from './flexPresets';
import { FlexLayers, resolveFlex, settingsLayer } from './flexResolve';
import { PRESETS as SENTRY_PRESETS } from './sentryPolicy';

export interface FlexBridgeDeps {
    /** what the USER wrote for a full setting key; undefined when untouched */
    readSetting(key: string): unknown;
    /** write one full setting key at user scope — the writer settings.set uses */
    writeSetting(key: string, value: unknown): Promise<void>;
}

const PRESETS_KEY = 'agentFarm.flexPresets';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** `patch` laid over `base` key by key, objects merged rather than replaced. */
function deepMerge(base: unknown, patch: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = isObj(base) ? { ...base } : {};
    for (const [k, v] of Object.entries(patch)) { out[k] = isObj(v) ? deepMerge(out[k], v) : v; }
    return out;
}

const objArg = (args: Record<string, unknown>, key: string): Record<string, unknown> => {
    const v = args[key];
    need(v === undefined || (v !== null && typeof v === 'object' && !Array.isArray(v)), `\`${key}\` is an object.`);
    return (v ?? {}) as Record<string, unknown>;
};

export function registerFlexOps(bridge: BridgeRegistry, deps: FlexBridgeDeps): void {
    bridge.register([
        {
            op: 'flex.list',
            describe: 'The flex point registry (X-367): every preference a user can set — id, label, type, default, '
                + 'min/max/options/states, remembered, and each level it can be set at (built-in → settings → agent → '
                + 'project → workflow → step → run → live) with the surface and bridge key that set it. '
                + 'args: ctx? (facts, e.g. {retryBehavior}) adds applies {ok, why?} per point.',
            handler: (args) => {
                const ctx = args.ctx === undefined ? undefined : objArg(args, 'ctx') as FlexCtx;
                return {
                    levels: FLEX_LEVELS.map(l => ({ level: l, label: FLEX_LEVEL_LABELS[l] })),
                    points: FLEX_POINTS.map(p => ({
                        id: p.id, label: p.label, type: p.type, default: p.default, remembered: p.remembered,
                        ...(p.min !== undefined ? { min: p.min } : {}),
                        ...(p.max !== undefined ? { max: p.max } : {}),
                        ...(p.options ? { options: p.options } : {}),
                        ...(p.states ? { states: p.states } : {}),
                        levels: flexLevelsOf(p.id).map(l => ({ level: l, ...p.levels[l as Exclude<FlexLevel, 'builtin'>] })),
                        ...(ctx ? { applies: flexApplies(p.id, ctx) } : {})
                    }))
                };
            }
        },
        {
            op: 'flex.get',
            describe: 'One flex point resolved (X-368): {value, from (the level that won), overridden [{level, value}], '
                + 'ignored [{level, value, why}], sentence ("Opus — from this workflow; Farm Settings said Sonnet"), applies}. '
                + 'args: point (id, see flex.list); layers? {agent|project|workflow|step|run|live: value} — the levels '
                + 'with no store yet are passed by the caller; the Farm Settings layer is read from what the user wrote '
                + 'unless layers.settings is given; ctx? facts for applies.',
            handler: (args) => {
                const id = argStr(args, 'point');
                const p = flexPoint(id);
                need(p, `"${id}" is not a flex point — flex.list shows every one.`);
                const layers = objArg(args, 'layers') as FlexLayers;
                const given = 'settings' in layers;
                const all: FlexLayers = given ? layers : { ...layers, settings: settingsLayer(p!, deps.readSetting) };
                const ctx = args.ctx === undefined ? {} : objArg(args, 'ctx') as FlexCtx;
                return { ...resolveFlex(p!, all), applies: flexApplies(id, ctx) };
            }
        }
    ]);
    registerPresetOps(bridge, deps);
}

function registerPresetOps(bridge: BridgeRegistry, deps: FlexBridgeDeps): void {
    const user = (): FlexPreset[] => normalizePresets(deps.readSetting(PRESETS_KEY));
    const store = (list: FlexPreset[]) => deps.writeSetting(PRESETS_KEY, list);
    const launchNames = (): { name: string }[] => {
        const raw = deps.readSetting('agentFarm.launchProfiles');
        return (Array.isArray(raw) ? raw : []).filter(x => isObj(x) && typeof x.name === 'string')
            .map(x => ({ name: String((x as Record<string, unknown>).name) }));
    };
    bridge.register([
        {
            op: 'presets.list',
            describe: 'The preset library (X-369): built-in flex presets (cost: Economy · Balanced · Quality), your own '
                + '(agentFarm.flexPresets, global or per project), and — listed, applied by their own doors — launch '
                + 'profiles and the sentry presets (Mechanical · Intelligent · Hybrid). args: project? (id; adds that '
                + 'project\'s own presets). Returns [{kind: flex|launch|sentry, name, family?, scope?, values?, appliedBy?}].',
            handler: (args) => ({
                presets: presetLibrary(user(), optStr(args, 'project') || undefined, launchNames(), SENTRY_PRESETS)
            })
        },
        {
            op: 'presets.save',
            describe: 'Save one preset of your own (X-369): {name, values: {<flex point id>: value}, scope? global|project, '
                + 'project? (required for scope project), describe?, family?, renameFrom? (renames that preset)}. Built-in '
                + 'names are refused; every value is checked against its point (flex.list).',
            handler: async (args) => {
                const scope = optStr(args, 'scope') === 'project' ? 'project' : 'global';
                const p: FlexPreset = {
                    name: argStr(args, 'name'), values: objArg(args, 'values'), scope,
                    ...(scope === 'project' ? { project: optStr(args, 'project') } : {}),
                    ...(optStr(args, 'describe') ? { describe: optStr(args, 'describe') } : {}),
                    ...(optStr(args, 'family') ? { family: optStr(args, 'family') } : {})
                };
                let next: FlexPreset[] = [];
                try { next = savePreset(user(), p, optStr(args, 'renameFrom') || undefined); } catch (e) { need(false, (e as Error).message); }
                await store(next);
                return { saved: p.name.trim(), count: next.length };
            }
        },
        {
            op: 'presets.delete',
            describe: 'Delete one preset of your own (X-369): {name, project? (for a project preset)}. Built-in presets '
                + 'cannot be deleted.',
            handler: async (args) => {
                let next: FlexPreset[] = [];
                try { next = deletePreset(user(), argStr(args, 'name'), optStr(args, 'project') || undefined); } catch (e) { need(false, (e as Error).message); }
                await store(next);
                return { deleted: argStr(args, 'name'), count: next.length };
            }
        },
        {
            op: 'presets.apply',
            describe: 'Apply a flex preset at one level (X-369): {name, level? (settings — the default — writes each value '
                + 'into Farm Settings, merged into object settings; run returns the args to pass to the op that starts '
                + 'the run, e.g. tasks.add), project?, dryRun?}. Returns per point {value, from, sentence} with the '
                + 'origin "preset: <name>", `args` grouped by op, and `skipped` points that level cannot hold.',
            handler: async (args) => {
                const project = optStr(args, 'project') || undefined;
                const name = argStr(args, 'name');
                const p = findPreset(user(), name, project);
                need(p, `No preset "${name}" — presets.list shows them (launch profiles and sentry presets apply through their own doors).`);
                const level = (optStr(args, 'level') || 'settings') as Exclude<FlexLevel, 'builtin'>;
                need(FLEX_LEVELS.indexOf(level) > 0, `level: one of ${FLEX_LEVELS.slice(1).join(', ')}.`);
                const { ops, skipped } = presetArgs(p!, level);
                const write = level === 'settings' && args.dryRun !== true;
                if (write) {
                    for (const [key, v] of Object.entries(ops['settings.set'] ?? {})) {
                        await deps.writeSetting(key, isObj(v) ? deepMerge(deps.readSetting(key), v) : v);
                    }
                }
                const points = Object.keys(p!.values).filter(id => !skipped.some(s => s.point === id)).map(id => {
                    const pt = flexPoint(id)!;
                    const layers: FlexLayers = level === 'settings' ? {} : { settings: settingsLayer(pt, deps.readSetting) };
                    layers[level] = p!.values[id];
                    const r = resolveFlex(pt, layers, { [level]: p!.name });
                    return { point: id, value: r.value, from: r.from, sentence: r.sentence };
                });
                return { preset: p!.name, level, written: write, points, args: ops, skipped };
            }
        }
    ]);
}
