/**
 * X-368 — WHICH VALUE A FLEX POINT HAS, AND WHERE IT CAME FROM.
 *
 * `resolveFlex` walks the chain in `media/afFlex.js` (built-in → Farm Settings →
 * agent → project → workflow → step → run start → live): the highest level that
 * was actually given a value wins. A blank string is the box nobody touched, not
 * an answer, so it inherits. A value at a level the point does not declare, or
 * one its type cannot hold, is never silently used — it is returned in `ignored`
 * with the reason, the same honesty the launch resolver keeps.
 *
 * The existing launch resolvers (`resolveDelegateRun`, `resolvePlannerLaunch`)
 * keep their own ladders; `levelOfOrigin` places each of their rungs on this
 * chain, and `test_flex_resolve.js` checks their precedence agrees with it.
 */
import { FLEX_LEVELS, FLEX_LEVEL_LABELS, FlexLevel, FlexPoint, flexPoint, flexValid } from './flexPoints';
import type { DelegateOrigin } from './missionMode';

export type FlexLayers = Partial<Record<FlexLevel, unknown>>;

export interface FlexResolved {
    point: string;
    value: unknown;
    from: FlexLevel;
    /** values set lower down that `from` beat, highest first */
    overridden: { level: FlexLevel; value: unknown }[];
    /** values given but not counted, each with its reason */
    ignored: { level: FlexLevel; value: unknown; why: string }[];
    /** the preset the winning value came from, when a preset was applied at that level */
    preset?: string;
    /** the one line every surface writes: the value, where it came from, what it beat */
    sentence: string;
}

const ORIGIN: Record<FlexLevel, string> = {
    builtin: 'built-in default', settings: 'from Farm Settings', agent: 'from this agent',
    project: 'from this project', workflow: 'from this workflow', step: 'from this step',
    run: 'set for this run', live: 'changed live'
};

/** Every rung of the launch resolvers, placed on the flex chain. */
export const ORIGIN_LEVEL: Record<DelegateOrigin, FlexLevel> = {
    cli: 'builtin',
    // the engine's own settings.json — below anything Agent Farm itself sets
    settings: 'builtin',
    fleet: 'settings',
    // agentFarm.taskExtraArgs is a Farm Setting
    'extra-args': 'settings',
    agent: 'agent',
    mission: 'workflow',
    member: 'step'
};
export const levelOfOrigin = (o: DelegateOrigin): FlexLevel => ORIGIN_LEVEL[o];

const isSet = (v: unknown): boolean =>
    v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '');

/** A value as a surface prints it. */
export function showFlexValue(p: FlexPoint, v: unknown): string {
    if (p.type === 'tri' && p.states) {
        const state = (Object.keys(p.states) as (keyof typeof p.states)[]).find(s => p.states![s] === v);
        return state ? `${state} (${String(v)})` : String(v);
    }
    if (typeof v === 'string') { return v === '' ? '(empty)' : v; }
    if (v !== null && typeof v === 'object') {
        const j = JSON.stringify(v);
        return j.length > 60 ? j.slice(0, 59) + '…' : j;
    }
    return String(v);
}

/** `presets` names, per level, the preset whose values that level holds — it joins the origin. */
export function resolveFlex(
    p: FlexPoint | string, layers: FlexLayers = {}, presets: Partial<Record<FlexLevel, string>> = {}
): FlexResolved {
    const point = typeof p === 'string' ? flexPoint(p) : p;
    if (!point) { throw new Error(`No flex point "${String(p)}".`); }
    const counted: { level: FlexLevel; value: unknown }[] = [];
    const ignored: FlexResolved['ignored'] = [];
    for (const level of FLEX_LEVELS) {
        if (level === 'builtin' || !isSet(layers[level])) { continue; }
        const value = layers[level];
        if (!point.levels[level as Exclude<FlexLevel, 'builtin'>]) {
            ignored.push({ level, value, why: `${point.id} cannot be set at the ${FLEX_LEVEL_LABELS[level]} level` });
        } else if (!flexValid(point, value)) {
            ignored.push({ level, value, why: `not a valid ${point.type} for ${point.id}` });
        } else {
            counted.push({ level, value });
        }
    }
    const top = counted.pop();
    const from: FlexLevel = top ? top.level : 'builtin';
    const value = top ? top.value : point.default;
    const overridden = counted.reverse();
    const beaten = overridden[0]
        ? `; ${FLEX_LEVEL_LABELS[overridden[0].level]} said ${showFlexValue(point, overridden[0].value)}`
        : top && JSON.stringify(point.default) !== JSON.stringify(value)
            ? `; built-in default ${showFlexValue(point, point.default)}` : '';
    const preset = top ? presets[from] : undefined;
    return {
        point: point.id, value, from, overridden, ignored,
        ...(preset ? { preset } : {}),
        sentence: `${showFlexValue(point, value)} — ${ORIGIN[from]}${preset ? ` (preset: ${preset})` : ''}${beaten}`
    };
}

/**
 * The Farm Settings layer of one point, read through `read(key)` — which must
 * answer only what the USER wrote (undefined for an untouched setting), or every
 * point would claim Farm Settings as its origin for the shipped default.
 */
export function settingsLayer(p: FlexPoint, read: (key: string) => unknown): unknown {
    const e = p.levels.settings;
    if (!e || !e.surface.startsWith('setting:')) { return undefined; }
    const [key, sub] = e.surface.slice('setting:'.length).split('#');
    let v = read(key);
    for (const seg of sub ? sub.split('.') : []) {
        v = v !== null && typeof v === 'object' ? (v as Record<string, unknown>)[seg] : undefined;
    }
    return v;
}
