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

export interface RouteNameEntry { label: string; providerId: string }

export interface RouteNames {
    /** The profiles that exist now, by id. */
    current: Record<string, RouteNameEntry>;
    /** The newest label (and company) a launch recorded for each profile id. */
    last: Record<string, RouteNameEntry>;
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
