/**
 * X-368 — the flex points on the bridge: `flex.list` (the registry) and
 * `flex.get` (one point's value and where it came from). Both call the same
 * registry and resolver every surface uses; nothing is restated here.
 */
import { argStr, BridgeRegistry, need } from './bridge';
import { FLEX_LEVEL_LABELS, FLEX_LEVELS, FLEX_POINTS, FlexCtx, FlexLevel, flexApplies, flexLevelsOf, flexPoint } from './flexPoints';
import { FlexLayers, resolveFlex, settingsLayer } from './flexResolve';

export interface FlexBridgeDeps {
    /** what the USER wrote for a full setting key; undefined when untouched */
    readSetting(key: string): unknown;
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
}
