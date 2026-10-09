import { LaunchOptions } from './launch';
import { PROFILE_KEYS } from './launchProfiles';

type ProfileKey = typeof PROFILE_KEYS[number];

/** A dimension's name on the bridge where it differs from the field: the route is `provider` (X-103). */
const ARG_NAME: { readonly [K in ProfileKey]?: string } = { providerId: 'provider' };
export const profileArg = (k: ProfileKey): string => ARG_NAME[k] ?? k;

const text = (v: unknown): string =>
    typeof v === 'string' ? v.trim() : (typeof v === 'number' && isFinite(v) ? String(v) : '');

/**
 * ‼️ B-32 — WHAT A launch.profile.set CALL ASKS TO STORE, built by the SHAPE.
 *
 * The handler built its options from a hand-written field list, so the two
 * dimensions that list did not name — the sign-in (X-253) and the discipline
 * (K-34) — were dropped on every write from the bridge: three profiles edited
 * by an agent lost their `superpowers:false`. This walks PROFILE_KEYS, the list
 * `profileFrom` stores from, so a dimension named there reaches the bridge with
 * no second edit; `superpowers` is the tri-state boolean `profileFrom` keeps
 * beside that loop, and anything but a boolean is refused rather than read as
 * truthy. An empty value is left out, which is "no flag", as in the launcher.
 */
export function setupFromArgs(args: Record<string, unknown>): { setup: LaunchOptions; refused?: string } {
    const setup: LaunchOptions = {};
    for (const k of PROFILE_KEYS) {
        const v = text(args[profileArg(k)]);
        if (v) { (setup as unknown as Record<string, unknown>)[k] = v; }
    }
    if (args.superpowers !== undefined) {
        if (typeof args.superpowers !== 'boolean') {
            return { setup, refused: 'superpowers is true or false — leave it out and the profile says nothing about the discipline' };
        }
        setup.superpowers = args.superpowers;
    }
    return { setup };
}
