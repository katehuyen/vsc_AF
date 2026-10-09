/**
 * S-137 — ONE NAME PER ROUTE PROFILE, asked here by every surface.
 *
 * A profile id is given once (retiredProfiles.ts), so it is a safe key for the
 * profile's name. While the profile exists, its CURRENT label names every
 * session that ran on it — a rename reaches the past rows too, because "which
 * route is this" has one answer, not one per launch. Once it is removed, the
 * last label any launch recorded for it names them all, and the run says the
 * profile is gone. The name a session was started under, when it differs, is
 * carried beside it so a hover can say so.
 *
 * Pure: the caller reads the profile list and the launch records.
 */

import { LaunchManifest } from './launchManifest';
import { routeIdOfWire } from './opencodeRoutes';

export interface RouteNameEntry { label: string; providerId: string }

export interface RouteNames {
    /** The profiles that exist now, by id. */
    current: Record<string, RouteNameEntry>;
    /** The newest label (and company) a launch recorded for each profile id. */
    last: Record<string, RouteNameEntry>;
    /** X-521 — OpenCode's own catalog: a model reference → its display name (CatalogModelRow.label). */
    models?: Record<string, string>;
}

/**
 * X-521 — WHAT THE SECOND BADGE SAYS ON A RUN OF OPENCODE'S OWN MODEL: the
 * catalog's name for the model it ran on (reported, else requested), else the
 * reference itself. '' on any other run — a route keeps its label, and a Claude
 * run's identity is untouched. The reference is matched, never a display name
 * cut at '/' (a model id may hold one).
 */
export function runModelLabel(
    engine: string, origin: string, reportedProviderIds: readonly string[], reportedModels: readonly string[],
    requestedModelRef: string, models: Record<string, string> | undefined
): string {
    if (engine !== 'opencode' || origin !== 'engine-native') { return ''; }
    const bare = String(reportedModels[reportedModels.length - 1] ?? '').trim();
    const prov = reportedProviderIds.length === 1 ? String(reportedProviderIds[0]).trim() : '';
    const ref = bare ? (prov && !bare.startsWith(prov + '/') ? `${prov}/${bare}` : bare) : String(requestedModelRef ?? '').trim();
    if (!ref) { return ''; }
    const table = models ?? {};
    if (table[ref]) { return table[ref]; }
    const tails = Object.keys(table).filter(k => k.slice(k.indexOf('/') + 1) === ref);
    return tails.length === 1 ? table[tails[0]] : ref;
}

export interface RouteName {
    label: string;
    /** The company behind the profile — the chip's colour key. '' when unknown. */
    providerId: string;
    /** The label the session was started under, only when it is not `label`. */
    launchedAs: string;
    removed: boolean;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const idOf = (v: unknown): string => str(v).toLowerCase();

export function routeNames(
    profiles: readonly { id: string; label?: string; providerId?: string }[],
    manifests: readonly LaunchManifest[] | undefined
): RouteNames {
    const current: Record<string, RouteNameEntry> = {};
    for (const p of profiles || []) {
        const id = idOf(p && p.id);
        if (id) { current[id] = { label: str(p.label), providerId: str(p.providerId) }; }
    }
    const last: Record<string, RouteNameEntry> = {};
    const at: Record<string, number> = {};
    for (const m of manifests || []) {
        const id = idOf(m && m.identity && m.identity.providerProfileId);
        const label = str(m && m.identity && m.identity.providerLabel);
        const when = Number(m && m.at) || 0;
        if (!id || !label || (id in at && at[id] > when)) { continue; }
        at[id] = when;
        last[id] = { label, providerId: str(m.identity.providerId) };
    }
    return { current, last };
}

/**
 * X-521 — A LENT ROUTE READ BACK AS ITS COMPANY. OpenCode names a lent route's provider
 * `af-<route id>`; the record says the company the launch declared, as the live path
 * does (openCodeAdapter vendorOf), so declared and reported agree. The run's own
 * declaration first, then the profile now, then the last launch on it; anything else untouched.
 */
export function routeVendorOf(
    providerId: string, declared: { providerProfileId?: string; providerId?: string } | undefined, names: RouteNames | undefined
): string {
    const bare = routeIdOfWire(providerId);
    const rid = idOf(bare);
    if (!rid) { return providerId; }
    if (declared && idOf(declared.providerProfileId) === rid && str(declared.providerId)) { return str(declared.providerId); }
    const known = names && (names.current[rid] || names.last[rid]);
    return (known && known.providerId) || bare;
}

type BadgeIdentity = { origin?: string; providerProfileId?: string; providerId?: string; requestedModelRef?: string };

/**
 * X-521 — WHAT THE BADGE SAYS BEYOND THE DECLARED ROUTE, off the RAW reports: OpenCode's own
 * model by its catalog name, or a lent route the run moved onto at a turn boundary (its last
 * turn reported `af-<id>`, not the declared profile) by that route's name — never the service.
 */
export function badgeNames(
    engine: string, identity: BadgeIdentity | undefined, turns: readonly { providerIds?: readonly string[] }[],
    models: readonly string[], names: RouteNames | undefined
): { modelLabel: string; servedLabel: string } {
    const ids = (t?: { providerIds?: readonly string[] }) => (t?.providerIds ?? []).map(str).filter(Boolean);
    const raw = [...new Set(turns.flatMap(t => ids(t)))];
    const last = ids(turns[turns.length - 1]);
    const rid = engine === 'opencode' && last.length === 1 ? routeIdOfWire(last[0]) : '';
    return {
        modelLabel: rid ? '' : runModelLabel(engine, str(identity?.origin), raw, models, str(identity?.requestedModelRef), names?.models),
        servedLabel: rid && idOf(rid) !== idOf(identity?.providerProfileId) ? (routeName(rid, '', names)?.label || rid) : ''
    };
}

/** X-521 — one turn's badge facts: its reported providers read back, and the names `badgeNames` gives that turn. */
export function turnMark(
    engine: string, identity: BadgeIdentity | undefined,
    providerIds: readonly string[] | undefined, models: readonly string[] | undefined, names: RouteNames | undefined
): { servedBy: string[]; modelLabel: string; servedLabel: string } {
    const reported = providerIds ?? [];
    return {
        servedBy: [...new Set(reported.map(p => routeVendorOf(p, identity, names)))],
        ...(reported.length ? badgeNames(engine, identity, [{ providerIds: reported }], models ?? [], names) : { modelLabel: '', servedLabel: '' })
    };
}

/** Undefined when the run named no profile, or the caller gave no names. */
export function routeName(profileId: string, recordedLabel: string, names: RouteNames | undefined): RouteName | undefined {
    const id = idOf(profileId);
    if (!id || !names) { return undefined; }
    const rec = str(recordedLabel);
    const now = names.current[id];
    const was = names.last[id];
    const label = (now ? now.label : was && was.label) || rec || str(profileId);
    return {
        label,
        providerId: (now ? now.providerId : was && was.providerId) || '',
        launchedAs: rec && rec !== label ? rec : '',
        removed: !now
    };
}
