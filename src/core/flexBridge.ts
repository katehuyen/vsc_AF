/**
 * The flex points and presets on the bridge (X-368, X-369, U-152). Every op
 * calls the registry, the resolver or `flexActions.ts` — the same code the
 * Farm Settings card calls; nothing is restated here.
 */
import { argStr, BridgeRegistry, need, optStr } from './bridge';
import {
    applyPresetAt, deletePresetNamed, FlexDeps, savePresetAs, setFlexSetting, userPresets
} from './flexActions';
import { FLEX_LEVEL_LABELS, FLEX_LEVELS, FLEX_POINTS, FlexCtx, FlexLevel, flexApplies, flexLevelsOf, flexPoint } from './flexPoints';
import { FlexPreset, presetLibrary } from './flexPresets';
import { FlexLayers, resolveFlex, settingsLayer } from './flexResolve';
import { PRESETS as SENTRY_PRESETS } from './sentryPolicy';

export type FlexBridgeDeps = FlexDeps;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const objArg = (args: Record<string, unknown>, key: string): Record<string, unknown> => {
    const v = args[key];
    need(v === undefined || isObj(v), `\`${key}\` is an object.`);
    return (v ?? {}) as Record<string, unknown>;
};

const levelArg = (args: Record<string, unknown>): Exclude<FlexLevel, 'builtin'> => {
    const level = (optStr(args, 'level') || 'settings') as Exclude<FlexLevel, 'builtin'>;
    need(FLEX_LEVELS.indexOf(level) > 0, `level: one of ${FLEX_LEVELS.slice(1).join(', ')}.`);
    return level;
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
                const all: FlexLayers = 'settings' in layers ? layers : { ...layers, settings: settingsLayer(p!, deps.readSetting) };
                const ctx = args.ctx === undefined ? {} : objArg(args, 'ctx') as FlexCtx;
                return { ...resolveFlex(p!, all), applies: flexApplies(id, ctx) };
            }
        },
        {
            op: 'flex.set',
            describe: 'Set one flex point (U-152): {point, level? (settings — the only level with a store today; a run\'s '
                + 'own value is passed to the op that starts it), value? (omit or null = back to inherited)}. The value is '
                + 'checked against the point; one inside an object setting (agentFarm.taskRetry) is written into it, the '
                + 'other fields kept. Returns the point resolved.',
            handler: async (args) => {
                const level = levelArg(args);
                need(level === 'settings', `${FLEX_LEVEL_LABELS[level]} values have no store yet — pass them to the op that `
                    + 'starts the run (presets.apply level=run returns those args).');
                return setFlexSetting(deps, argStr(args, 'point'), args.value === null ? undefined : args.value);
            }
        },
        {
            op: 'presets.list',
            describe: 'The preset library (X-369): built-in flex presets (cost: Economy · Balanced · Quality), your own '
                + '(agentFarm.flexPresets, global or per project), and — listed, applied by their own doors — launch '
                + 'profiles and the sentry presets (Mechanical · Intelligent · Hybrid). args: project? (id; adds that '
                + 'project\'s own presets). Returns [{kind: flex|launch|sentry, name, family?, scope?, values?, appliedBy?}].',
            handler: (args) => {
                const raw = deps.readSetting('agentFarm.launchProfiles');
                const launch = (Array.isArray(raw) ? raw : []).filter(x => isObj(x) && typeof x.name === 'string')
                    .map(x => ({ name: String((x as Record<string, unknown>).name) }));
                return { presets: presetLibrary(userPresets(deps), optStr(args, 'project') || undefined, launch, SENTRY_PRESETS) };
            }
        },
        {
            op: 'presets.save',
            describe: 'Save one preset of your own (X-369): {name, values: {<flex point id>: value}, scope? global|project, '
                + 'project? (required for scope project), describe?, family?, renameFrom? (renames that preset)}. Built-in '
                + 'names are refused; every value is checked against its point (flex.list).',
            handler: (args) => {
                const scope = optStr(args, 'scope') === 'project' ? 'project' : 'global';
                const p: FlexPreset = {
                    name: argStr(args, 'name'), values: objArg(args, 'values'), scope,
                    ...(scope === 'project' ? { project: optStr(args, 'project') } : {}),
                    ...(optStr(args, 'describe') ? { describe: optStr(args, 'describe') } : {}),
                    ...(optStr(args, 'family') ? { family: optStr(args, 'family') } : {})
                };
                return savePresetAs(deps, p, optStr(args, 'renameFrom') || undefined);
            }
        },
        {
            op: 'presets.delete',
            describe: 'Delete one preset of your own (X-369): {name, project? (for a project preset)}. Built-in presets '
                + 'cannot be deleted.',
            handler: (args) => deletePresetNamed(deps, argStr(args, 'name'), optStr(args, 'project') || undefined)
        },
        {
            op: 'presets.apply',
            describe: 'Apply a flex preset at one level (X-369): {name, level? (settings — the default — writes each value '
                + 'into Farm Settings, merged into object settings; run returns the args to pass to the op that starts '
                + 'the run, e.g. tasks.add), project?, dryRun?}. Returns per point {value, from, sentence} with the '
                + 'origin "preset: <name>", `args` grouped by op, and `skipped` points that level cannot hold.',
            handler: (args) => applyPresetAt(deps, argStr(args, 'name'), levelArg(args), {
                dryRun: args.dryRun === true, project: optStr(args, 'project') || undefined
            })
        }
    ]);
}
