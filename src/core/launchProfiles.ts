import { EngineId } from './engines';
import { describeLaunch, LaunchOptions, LaunchProfile } from './launch';

/**
 * ‼️ A-11 — LAUNCH PROFILES, AS A THING THAT CAN BE TESTED.
 *
 * A profile is a launch somebody kept: "opus, high effort, acceptEdits, and the
 * prompt I always open this kind of session with". Saving and loading one lived
 * inside the launcher's quickpick loop in `extension.ts`, which is a function
 * nobody can call — so every rule about what a profile IS was written in a
 * place where no test could reach it, and two of them were wrong for a whole
 * release:
 *
 *   · THE ENGINE WAS DROPPED, on the way in AND on the way out. A profile saved
 *     while the launcher was on Codex stored no engine at all, so loading it
 *     silently produced a Claude session with Codex's model name on it — the
 *     failure furthest in time from the mistake, on the one dimension that
 *     decides what every other dimension MEANS. This is what "it does not load
 *     the profile any more" was: it loaded half of one.
 *
 *   · AND A PROFILE'S NAME IS NOT THE SESSION'S NAME, though they are the same
 *     field: `LaunchProfile extends LaunchOptions`, whose `name` is `-n`, the
 *     display name of the conversation. Spread a profile into the launcher's
 *     options and every session started from "gece taraması" is called "gece
 *     taraması" — and the reverse, saving with a session name in the box, puts
 *     a `-n` inside a profile that then overrides the name of every session
 *     started from it afterwards.
 *
 * So the rules live here, in functions that take a list and return a list.
 * `extension.ts` keeps exactly what only it can do: showing the picker and
 * writing the setting.
 */

/** The dimensions a SETUP has. Deliberately not: the session's own name, which
 *  is per-launch, and not `resume`/`continueLast`, which are not setups. */
export const PROFILE_KEYS = ['engine', 'model', 'effort', 'permissionMode', 'prompt'] as const;

type ProfileKey = typeof PROFILE_KEYS[number];

const put = (o: LaunchProfile | LaunchOptions, k: ProfileKey, v: string): void => {
    (o as unknown as Record<string, unknown>)[k] = v;
};

/**
 * The launcher's current state, kept under a name.
 *
 * ‼️ `name` here is the PROFILE's, and the session's own name is dropped rather
 * than carried: a `-n` inside a profile would rename every session started from
 * it, which is not what "save this setup" means to anybody.
 */
export function profileFrom(o: LaunchOptions, name: string): LaunchProfile {
    const out: LaunchProfile = { name: name.trim() };
    for (const k of PROFILE_KEYS) {
        const v = o[k];
        if (typeof v === 'string' && v.trim()) { put(out, k, v.trim()); }
    }
    return out;
}

/**
 * A profile applied to the launcher's options.
 *
 * ‼️ EVERY DIMENSION IT STORES, INCLUDING THE ENGINE — that was the bug. And
 * every dimension it does NOT store is CLEARED rather than left standing:
 * loading a profile means "the setup is now this", and a model left over from
 * the last thing you looked at is a value the user did not choose and cannot
 * see they are carrying.
 *
 * Two things survive on purpose: the session's own `name`, because it is not
 * part of a setup and the profile's name is not a session name; and a first
 * prompt the user has already typed, because it is the one field that is as
 * often per-launch as it is part of a setup, it can be long, and the launcher
 * shows it on its own row — so it is not a value carried invisibly.
 */
export function applyProfile(o: LaunchOptions, p: LaunchProfile): LaunchOptions {
    const out: LaunchOptions = { ...o };
    for (const k of PROFILE_KEYS) {
        const v = p[k];
        const kept = typeof v === 'string' ? v.trim() : '';
        if (k === 'engine') {
            if (kept) { out.engine = kept as EngineId; } else { delete out.engine; }
        } else if (k === 'prompt') {
            if (kept) { out.prompt = kept; }
        } else {
            put(out, k, kept);
        }
    }
    return out;
}

/**
 * Put one in the list. ‼️ ONE NAME, ONE PROFILE: a name that already exists is
 * replaced, which is the rule Save has always followed — two rows with the same
 * name make a picker you cannot use, and the second one is unreachable.
 *
 * A profile that is replacing one already in the list keeps THAT row's place:
 * the order is the user's, and saving over a name is an edit, not a new entry.
 */
export function saveProfile(list: LaunchProfile[], p: LaunchProfile): LaunchProfile[] {
    return list.some(x => x.name === p.name)
        ? list.map(x => (x.name === p.name ? p : x))
        : [...list, p];
}

/** Rename one, keeping its place in the list — the order is the user's, and a
 *  rename that sent a profile to the bottom would be a move nobody asked for. */
export function renameProfile(
    list: LaunchProfile[], from: string, to: string
): LaunchProfile[] {
    const want = to.trim();
    if (!want || want === from) { return list; }
    // Renaming ONTO an existing name replaces that one (the Save rule), and the
    // renamed profile keeps the position of the row that was renamed.
    return list
        .filter(x => x.name !== want || x.name === from)
        .map(x => (x.name === from ? { ...x, name: want } : x));
}

/** Replace what a profile stores, keeping its name and its place. */
export function replaceProfile(
    list: LaunchProfile[], name: string, o: LaunchOptions
): LaunchProfile[] {
    return list.map(x => (x.name === name ? profileFrom(o, name) : x));
}

/**
 * ‼️ THE EDIT THE USER ASKED FOR: not a rename, but every dimension of an
 * existing row rewritten in place — name included. Renaming and replacing are
 * the two halves of it and both were needed anyway; this is the one call that
 * does them together, so a row edited from the picker moves nowhere and a name
 * typed onto another row still obeys the one-name-one-profile rule.
 */
export function editProfile(
    list: LaunchProfile[], name: string, next: LaunchProfile
): LaunchProfile[] {
    const want = next.name.trim();
    if (!want) { return list; }
    const edited = { ...next, name: want };
    return list
        // a different row that already owns the new name gives way…
        .filter(x => x.name === name || x.name !== want)
        // …and the edited row stays exactly where it was.
        .map(x => (x.name === name ? edited : x));
}

export function deleteProfile(list: LaunchProfile[], name: string): LaunchProfile[] {
    return list.filter(x => x.name !== name);
}

/**
 * What a row says about itself — the launcher's own words for the same setup,
 * so the picker and the Start row never describe one thing two ways.
 *
 * ‼️ The profile's name is taken OFF before describing it: `describeLaunch`
 * reads `name` as the SESSION's name and would print a profile called "gece"
 * as a session called “gece”, which is the very confusion this module exists
 * to end.
 */
export function describeProfile(p: LaunchProfile): string {
    const rest: LaunchOptions = { ...p };
    delete rest.name;
    return describeLaunch(rest);
}
