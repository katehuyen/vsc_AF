/**
 * The launch dimensions, on the extension-host side — LOADED, not restated.
 *
 * ‼️ THE ARRAY LIVES IN `media/afDimensions.js` (X-150). Both sides need it and
 * only that direction works: a page cannot import from `out/`, and the shell key
 * has to be computed BY THE PAGE or every repaint waits a round trip. Same
 * arrangement as `src/core/aftime.ts`, `src/core/query.ts` and
 * `src/core/aflaunch.ts`.
 *
 * What this file adds is the TYPE side, and it derives it from `LaunchOptions`
 * rather than from the array — so the two are pinned to each other from both
 * ends. `test/test_launch_dimensions.js` reads the interface out of
 * `src/core/launch.ts` and compares it against the array in both directions: a
 * field added to `LaunchOptions` with no row here goes red, and a row here for a
 * field that no longer exists goes red too. That is the whole point of the item
 * — "every dimension, every door" stops being a sentence somebody has to
 * remember and becomes something that fails the build.
 */
import * as path from 'path';
import { LaunchOptions } from './launch';

/** Every answer that describes a session. Derived from `LaunchOptions` itself. */
export type LaunchDimensionId = keyof LaunchOptions;

/** A partial set of those answers — what a door collects and a surface holds. */
export type LaunchIntent = { [K in LaunchDimensionId]?: LaunchOptions[K] };

/** What the caller already knows about the engine in front of it. */
export interface LaunchDimensionCtx {
    engine?: string;
    /** false = this engine has no effort flag at all (X-35) */
    takesEffort?: boolean;
    /** false = this engine has no provider axis (`axis: 'not-applicable'`) */
    hasProviderAxis?: boolean;
    /** false = the chosen route publishes no tiers */
    hasTiers?: boolean;
    /** false = the chosen model publishes no reasoning variants */
    hasVariants?: boolean;
}

export interface LaunchDimensionSpec {
    id: LaunchDimensionId;
    /** whose answer it is: somebody picked it, the engine decides, or we resolved it */
    owner: 'user' | 'engine' | 'farm';
    /** does a launch write it back into `agentfarm.lastLaunch` */
    remembered: boolean;
    /** X-145 — is it remembered per ENGINE rather than flat */
    perEngine: boolean;
    /** S-51 — does changing it rebuild the composer shell */
    redraws: boolean;
    /** where the dimension does not exist at all rather than being empty */
    appliesTo?: (ctx: LaunchDimensionCtx) => boolean;
    /** one line: why this dimension is the way it is */
    why: string;
}

interface DimensionsModule {
    LAUNCH_DIMENSIONS: LaunchDimensionSpec[];
    ids(): LaunchDimensionId[];
    dimension(id: string): LaunchDimensionSpec | null;
    idsWhere(flag: 'remembered' | 'perEngine' | 'redraws'): LaunchDimensionId[];
    applies(id: string, ctx: LaunchDimensionCtx): boolean;
    shellKeyOf(intent: LaunchIntent): string;
    rememberIntent(intent: LaunchIntent): Record<string, string>;
    seedIntent(intent: LaunchIntent, prev: LaunchIntent): Record<string, string | boolean>;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const impl: DimensionsModule = require(path.join(__dirname, '..', '..', 'media', 'afDimensions.js'));

/** The 16, in the order `LaunchOptions` declares them. */
export const LAUNCH_DIMENSIONS: LaunchDimensionSpec[] = impl.LAUNCH_DIMENSIONS;
/** Their ids, in the same order. */
export const launchDimensionIds = (): LaunchDimensionId[] => impl.ids();
/** One spec by id, or null. */
export const launchDimension = (id: string): LaunchDimensionSpec | null => impl.dimension(id);
/** The ids whose spec answers true for a flag — the fold every derivation is. */
export const launchDimensionsWhere = (flag: 'remembered' | 'perEngine' | 'redraws'): LaunchDimensionId[] =>
    impl.idsWhere(flag);
/** Does this dimension exist on this engine at all? An unstated fact means yes. */
export const launchDimensionApplies = (id: string, ctx: LaunchDimensionCtx): boolean => impl.applies(id, ctx);
/** S-51 — what rebuilds the composer shell, derived rather than typed out. */
export const shellKeyOf = (intent: LaunchIntent): string => impl.shellKeyOf(intent);
/** X-145 — the per-engine row a launch writes back. */
export const rememberIntent = (intent: LaunchIntent): Record<string, string> => impl.rememberIntent(intent);
/** What an opening surface inherits: this launch's own answer, else the row. */
export const seedIntent = (intent: LaunchIntent, prev: LaunchIntent): Record<string, string | boolean> =>
    impl.seedIntent(intent, prev);
