/**
 * The flex points, on the extension-host side — LOADED, not restated (X-367).
 *
 * The array lives in `media/afFlex.js` because the page needs it too; this file
 * adds the types. `test/test_flex_points.js` reads the two unions below out of
 * this source and compares them with the array's `LEVELS` and `TYPES`, so a level
 * added on one side only goes red.
 */
import * as path from 'path';

export type FlexLevel = 'builtin' | 'settings' | 'agent' | 'project' | 'workflow' | 'step' | 'run' | 'live';

export type FlexType = 'enum' | 'number' | 'boolean' | 'text' | 'range' | 'tri' | 'conditions' | 'dimensions' | 'list';

export type FlexTriState = 'ask' | 'auto' | 'never';

/** Where one level is set: `setting:<key>[#path]` or `<media file>#<element id>`, and `<op>:<arg path>`. */
export interface FlexLevelEntry {
    surface: string;
    bridge: string;
}

/** What the caller already knows; an unstated fact means the point applies. */
export interface FlexCtx {
    retryBehavior?: string;
    [fact: string]: unknown;
}

export interface FlexPoint {
    id: string;
    label: string;
    type: FlexType;
    default: unknown;
    /** the levels it can be SET at — `builtin` is `default` and is never declared */
    levels: Partial<Record<Exclude<FlexLevel, 'builtin'>, FlexLevelEntry>>;
    /** is the last choice remembered for the next time */
    remembered: boolean;
    /** true, or the reason it means nothing here */
    applies?: (ctx: FlexCtx) => true | string;
    /** an optional reasoned proposal */
    suggest?: (ctx: FlexCtx) => { value: unknown; why: string } | undefined;
    min?: number;
    max?: number;
    options?: string[];
    /** what an `enum` point's empty option means ("every kind") — the box shows it instead of a blank */
    emptyLabel?: string;
    /** a `tri` point's stored value for each of ask / auto / never */
    states?: Record<FlexTriState, string>;
}

interface FlexModule {
    LEVELS: FlexLevel[];
    LEVEL_LABELS: Record<FlexLevel, string>;
    TYPES: FlexType[];
    POINTS: FlexPoint[];
    ids(): string[];
    point(id: string): FlexPoint | null;
    levelsOf(id: string): FlexLevel[];
    pointsAt(level: FlexLevel): string[];
    applies(id: string, ctx?: FlexCtx): { ok: true } | { ok: false; why: string };
    valid(p: FlexPoint, v: unknown): boolean;
    problems(list?: FlexPoint[]): string[];
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const impl: FlexModule = require(path.join(__dirname, '..', '..', 'media', 'afFlex.js'));

export const FLEX_LEVELS: FlexLevel[] = impl.LEVELS;
export const FLEX_LEVEL_LABELS: Record<FlexLevel, string> = impl.LEVEL_LABELS;
export const FLEX_TYPES: FlexType[] = impl.TYPES;
export const FLEX_POINTS: FlexPoint[] = impl.POINTS;
export const flexPointIds = (): string[] => impl.ids();
export const flexPoint = (id: string): FlexPoint | null => impl.point(id);
export const flexLevelsOf = (id: string): FlexLevel[] => impl.levelsOf(id);
export const flexPointsAt = (level: FlexLevel): string[] => impl.pointsAt(level);
export const flexApplies = (id: string, ctx?: FlexCtx): { ok: true } | { ok: false; why: string } => impl.applies(id, ctx);
export const flexValid = (p: FlexPoint, v: unknown): boolean => impl.valid(p, v);
export const flexProblems = (list?: FlexPoint[]): string[] => impl.problems(list);
