/**
 * X-111 — THE PROVIDER / PROFILE / MODEL FILTER RULE, for the host.
 *
 * ‼️ THERE IS EXACTLY ONE RULE AND IT LIVES IN `media/afRunFilter.js`, the way
 * the query grammar lives in `media/afQuery.js` (see `query.ts`): the pages run
 * it in the webview and the bridge runs it here, so "which sessions ran through
 * Kimi" cannot get two answers depending on who asked.
 */

import * as path from 'path';

interface RunFilterModule {
    NONE: string;
    providersOf(identity: unknown, turnProviderIds?: readonly string[]): string[];
    profileOf(identity: unknown): string;
    modelsOf(identity: unknown, turnModels?: readonly string[]): string[];
    matchesAny(values: readonly string[] | undefined, selection: readonly string[] | null | undefined): boolean;
    options(valueLists: readonly (readonly string[])[], labelOf?: (v: string) => string, noneLabel?: string): { v: string; t: string }[];
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const impl: RunFilterModule = require(path.join(__dirname, '..', '..', 'media', 'afRunFilter.js'));

export const NO_PROVIDER = impl.NONE;
export const providersOf = impl.providersOf;
export const profileOf = impl.profileOf;
export const modelsOf = impl.modelsOf;
export const matchesAny = impl.matchesAny;

/** The three axes, as bridge args — one shape for every op that lists runs. */
export interface RunSelection {
    providers: string[] | null;
    profiles: string[] | null;
    models: string[] | null;
}

export function runSelectionArgs(args: Record<string, unknown>): RunSelection {
    return {
        providers: selectionArg(args.providers),
        profiles: selectionArg(args.profiles),
        models: selectionArg(args.models)
    };
}

/** Whether a run (or a turn of it) is one of the ones the caller picked — AND across the three axes. */
export function runSelected(
    sel: RunSelection, identity: unknown,
    turn?: { providerIds?: readonly string[]; models?: readonly string[] }
): boolean {
    return matchesAny(providersOf(identity, turn?.providerIds), sel.providers)
        && matchesAny([profileOf(identity)].filter(Boolean), sel.profiles)
        && matchesAny(modelsOf(identity, turn?.models), sel.models);
}

export const RUN_SELECTION_ARGS = 'providers? / profiles? / models? (X-111 — each one id, several comma-separated, or a list; '
    + 'a provider is the ROUTE a run was served by, beside engine (a Claude session pointed at Kimi is engine=claude, providers=kimi); '
    + 'a run matches when ANY of its values was picked; "(none)" picks the runs with no value)';

/**
 * A bridge argument that may be one value, a list, or a comma-separated
 * string — the three shapes an agent actually types (`providers=kimi`,
 * `providers=kimi,minimax`, `"providers":["kimi"]`). Absent is NO FILTER, which
 * is not the same as an empty list.
 */
export function selectionArg(v: unknown): string[] | null {
    if (v === undefined || v === null || v === '') { return null; }
    const list = Array.isArray(v) ? v : String(v).split(',');
    return list.map(x => String(x ?? '').trim()).filter(Boolean);
}
