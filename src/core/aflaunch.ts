/**
 * The narrowing rule, on the extension-host side — LOADED, not reimplemented.
 *
 * ‼️ THERE IS EXACTLY ONE ANSWER TO "THE ENGINE MOVED — WHAT HAPPENS TO THE
 * BOXES UNDER IT" AND IT LIVES IN `media/afLaunch.js` (X-149). The Console, the
 * Tasks form and the engine component render in a webview, which cannot import
 * from `out/`; the launcher, the bridge and every task spawn run here. The rule
 * this exists to keep — a model this engine does not offer is dropped, and the
 * effort beside it becomes something that model really publishes — is worth
 * nothing if the two sides drop a different pair.
 *
 * Same arrangement as `src/core/aftime.ts` and `src/core/query.ts`: `tsc`
 * compiles this to `out/core/aflaunch.js`, so `__dirname` is `<extension>/out/core`
 * in development and in the packaged VSIX alike, and `media/` sits two levels up
 * in both.
 */
import * as path from 'path';
import { LaunchChoice } from './launch';

/** A catalogue in the one shape `media/afLaunch.js` reads. Build it with `catalog`. */
export interface LaunchCatalog {
    known: boolean;
    models: LaunchChoice[];
    efforts: Record<string, LaunchChoice[]> | null;
    defaultEffort: Record<string, string>;
    fallbackEfforts: LaunchChoice[];
    takesEffort: boolean;
}

/** What a caller hands `catalog()` — whatever of these it happens to hold. */
export interface LaunchCatalogSource {
    /** the engine's published catalogue, when there is one */
    em?: { models: LaunchChoice[]; efforts: Record<string, LaunchChoice[]>; defaultEffort: Record<string, string> } | null;
    /** false = nothing is narrowed at all */
    known?: boolean;
    /** the model rows, when they do not come from `em` */
    models?: LaunchChoice[];
    /** the flat effort list to fall back on */
    efforts?: LaunchChoice[];
    /** false = this engine has no effort flag at all */
    takesEffort?: boolean;
}

/** How a caller's own case differs — every divergence has a name (see afLaunch.js). */
export interface NarrowOpts {
    /** S-34: a remembered setup for THIS engine wins over the catalogue */
    keep?: { model?: string; effort?: string } | null;
    /** the model was just picked by hand — its own default effort wins */
    preferModelDefault?: boolean;
    /** S-47/K-28: `big-pickle` may resolve to `opencode/big-pickle` */
    resolveAlias?: boolean;
}

interface LaunchModule {
    catalog(src: LaunchCatalogSource): LaunchCatalog;
    takesEffort(engineRow: { takesEffort?: boolean } | undefined): boolean;
    modelsFor(cat: LaunchCatalog): LaunchChoice[];
    effortsFor(cat: LaunchCatalog, model: string | undefined): LaunchChoice[];
    narrow(cat: LaunchCatalog, intent: { model?: string; effort?: string }, opts?: NarrowOpts): { model: string; effort: string };
    narrowModel(cat: LaunchCatalog, model: string | undefined, opts?: NarrowOpts): string;
    narrowEffort(cat: LaunchCatalog, model: string | undefined, effort: string | undefined, opts?: NarrowOpts): string;
    withCurrent(list: LaunchChoice[], current: string | undefined): LaunchChoice[];
    vocabularyFor(cat: LaunchCatalog, dimension: string, intent: { model?: string; effort?: string }): LaunchChoice[];
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const impl: LaunchModule = require(path.join(__dirname, '..', '..', 'media', 'afLaunch.js'));

/** Normalise whatever this surface holds into the shape the rule reads. */
export const catalog = (src: LaunchCatalogSource): LaunchCatalog => impl.catalog(src);
/** Does this engine take an effort at all — asked of its row, not of its name. */
export const engineTakesEffort = (row: { takesEffort?: boolean } | undefined): boolean => impl.takesEffort(row);
/** The levels THAT model supports — `[]` when the engine takes none. */
export const effortsForModel = (cat: LaunchCatalog, model: string | undefined): LaunchChoice[] => impl.effortsFor(cat, model);
/** The pair, made coherent: model first, then the effort THAT model publishes. */
export const narrow = (cat: LaunchCatalog, intent: { model?: string; effort?: string }, opts?: NarrowOpts) => impl.narrow(cat, intent, opts);
/** The model half on its own. */
export const narrowModel = (cat: LaunchCatalog, model: string | undefined, opts?: NarrowOpts): string => impl.narrowModel(cat, model, opts);
/** The effort half on its own, measured against the model it is ASKED about. */
export const narrowEffort = (cat: LaunchCatalog, model: string | undefined, effort: string | undefined, opts?: NarrowOpts): string =>
    impl.narrowEffort(cat, model, effort, opts);
/** S-34: keep whatever is really set on the list, catalogue or not. */
export const withCurrent = (list: LaunchChoice[], current: string | undefined): LaunchChoice[] => impl.withCurrent(list, current);
/** What a picker for one dimension may show. */
export const vocabularyFor = (cat: LaunchCatalog, dimension: string, intent: { model?: string; effort?: string }): LaunchChoice[] =>
    impl.vocabularyFor(cat, dimension, intent);
