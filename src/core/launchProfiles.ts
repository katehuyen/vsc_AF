import { EngineId } from './engines';
import { describeLaunch, LaunchOptions, LaunchProfile, RunSurface } from './launch';

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
 *   · AND THE SURFACE WAS DROPPED THE SAME WAY. Console or terminal is decided
 *     in the launcher next to the engine and the model, and it is the dimension
 *     a reader NOTICES first — but it lived in a local variable that no profile
 *     ever saw, so a setup saved with "the Console panel" on it reopened as a
 *     terminal and there was no box anywhere, in saving or in editing, that
 *     even mentioned it. It is `surface` on the profile now: stored on save,
 *     applied on load, and one of the rows in the edit picker.
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
export const PROFILE_KEYS = [
    'engine',
    /**
     * ‼️ X-103 — THE ROUTE IS PART OF THE SETUP, not a detail beside it. A
     * profile called "gece taraması" that stored the engine, the model and the
     * permissions but not WHICH ENDPOINT they ran against reproduced everything
     * about a launch except the one thing that decides what it costs, who serves
     * it and whose key pays — and two profiles differing only in route would
     * have been indistinguishable, which is precisely `matchProfile`'s job to
     * tell apart.
     *
     * Listed here rather than handled beside the list on purpose: `profileFrom`,
     * `applyProfile` and `matchProfile` all iterate this, so a dimension named
     * once is saved, loaded and compared without three functions being edited —
     * which is how `surface` came to be stored on save and dropped on load.
     */
    'providerId', 'tier',
    /**
     * ‼️ X-253 — WHOSE PLAN THE SETUP SPENDS, and the user's own decision was
     * the SOFT one: the profile remembers a sign-in, the box opens on it, and
     * nothing is locked.
     *
     * It sits beside the route because it is the same question one axis over —
     * the route says which endpoint answers, this says which sign-in is billed
     * and rate-limited for it. The objection it was exempt for is real and is
     * answered elsewhere rather than by leaving the dimension out: a profile
     * pointing at a slot that is no longer on the machine arrives EMPTY and
     * says so (`profileAccountGone`), and a stored one never outranks the box
     * the reader can move before pressing (`matchProfile` treats it as a seed).
     *
     * ‼️ AND IT IS NOT A LOCK IN `matchProfile`, which is where the obvious
     * implementation breaks: every profile on this machine was saved before
     * this dimension existed and a launcher always carries a resolved account,
     * so a strict comparison would have made the row stop recognising all of
     * them at once — the same trap `surface` has its own clause for.
     */
    'account',
    'model', 'variant', 'effort', 'permissionMode', 'prompt'
] as const;

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
export function profileFrom(
    o: LaunchOptions, name: string, surface?: RunSurface
): LaunchProfile {
    const out: LaunchProfile = { name: name.trim() };
    for (const k of PROFILE_KEYS) {
        const v = o[k];
        if (typeof v === 'string' && v.trim()) { put(out, k, v.trim()); }
    }
    // ‼️ Only a REAL answer is stored. `undefined` means "this profile says
    // nothing about where", which is what every profile saved before this
    // meant, and what it must go on meaning — writing a default in here would
    // silently start moving old profiles to the terminal.
    if (surface === 'console' || surface === 'terminal') { out.surface = surface; }
    // ‼️ K-34 — SAME RULE, SAME REASON, and it cannot live in `PROFILE_KEYS`:
    // that loop is written for STRINGS (`typeof v === 'string' && v.trim()`),
    // and this is a tri-state boolean whose `false` is an answer a truthiness
    // test would eat. Absent means "this profile says nothing about the
    // discipline", which is what every profile saved before this meant.
    if (typeof o.superpowers === 'boolean') { out.superpowers = o.superpowers; }
    return out;
}

/** Where a profile says a session should open, or undefined when it does not
 *  say — the launcher then keeps whatever surface it is already on. */
export function profileSurface(p: LaunchProfile): RunSurface | undefined {
    return p.surface === 'console' || p.surface === 'terminal' ? p.surface : undefined;
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
    // ‼️ K-34 — cleared when the profile is silent, exactly as the string
    // dimensions above are. "Load this setup" means the setup is now THIS, and
    // a discipline left over from the last thing the launcher was showing is a
    // decision the user did not make and cannot see they are carrying.
    if (typeof p.superpowers === 'boolean') { out.superpowers = p.superpowers; }
    else { delete out.superpowers; }
    return out;
}

/**
 * ‼️ S-34 — WHICH SAVED PROFILE THE LAUNCHER IS SHOWING RIGHT NOW, if any.
 *
 * Loading a profile and then reopening the launcher restored the setup and said
 * nothing about it, so "did it remember my profile?" was a question the reader
 * could only answer by opening the list and comparing five values by eye —
 * which is how a launcher that remembers almost everything reads as one that
 * remembers nothing.
 *
 * Derived rather than stored, and that is the point: a remembered NAME would go
 * on claiming a profile after the model row had been changed under it. This
 * compares the setup itself, so it stops being true the moment it stops being
 * true.
 */
export function matchProfile(
    list: LaunchProfile[], o: LaunchOptions, surface?: RunSurface
): LaunchProfile | undefined {
    const mine = profileFrom(o, 'current', surface);
    return list.find(p =>
        PROFILE_KEYS.filter(k => k !== 'account')
            .every(k => (p[k] ?? '') === (mine[k] ?? ''))
        // ‼️ X-253 — THE ACCOUNT IS A SEED, NOT A LOCK, and this clause is the
        // whole difference between the user's answer and the strict one they
        // did not pick. A profile that says nothing about the sign-in matches
        // whatever the launcher resolved — which is EVERY profile saved before
        // this dimension existed, and the launcher always carries a resolved
        // account, so without this the row would have stopped naming any of
        // them the day this shipped. A profile that DOES name one must agree,
        // because the reader may move the box after loading it and the row must
        // not go on claiming a setup that is no longer on screen.
        && (!p.account || (p.account ?? '') === (mine.account ?? ''))
        // ‼️ K-34 — a profile that says nothing about the discipline matches a
        // launcher that says nothing either, and a profile that DOES say must
        // agree — otherwise the row would go on claiming a profile after the
        // ⚡ row had been changed under it, which is the exact defect this
        // function exists to prevent.
        && (p.superpowers ?? undefined) === (mine.superpowers ?? undefined)
        // A profile that says nothing about where it runs matches whatever the
        // launcher is on — the promise `profileSurface` makes. Demanding an
        // answer it never stored would mean no profile saved before the surface
        // existed could ever be recognised again.
        && (!p.surface || p.surface === mine.surface));
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
    list: LaunchProfile[], name: string, o: LaunchOptions, surface?: RunSurface
): LaunchProfile[] {
    return list.map(x => (x.name === name ? profileFrom(o, name, surface) : x));
}

/**
 * ‼️ THE ROW A NEW NAME WOULD DESTROY, NAMED — so no caller has to destroy it
 * to find out.
 *
 * `editProfile` and `renameProfile` both obey one-name-one-profile by dropping
 * whatever else owns the name. That is the right END state and a catastrophic
 * DEFAULT: renaming "gece" to "sabah" quietly deleted the whole "sabah" setup,
 * with no warning before and no way back after. The rule stays; the decision
 * stops being silent. Returns the profile that is in the way, or undefined.
 */
export function profileNameClash(
    list: LaunchProfile[], name: string, exceptName: string
): LaunchProfile | undefined {
    const want = name.trim();
    if (!want || want === exceptName) { return undefined; }
    return list.find(x => x.name === want);
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
    const bits = [describeLaunch(rest)];
    /**
     * ‼️ X-253 — AND WHOSE PLAN IT SPENDS, said HERE rather than in
     * `describeLaunch`.
     *
     * That function describes a LAUNCH, where the account is resolved a moment
     * later and naming it on every line would spend a column on an answer
     * nobody chose. A profile is the one place it IS a chosen part of the
     * setup — so a row offering to spend a particular plan says which one
     * before it is pressed, and two profiles differing only in sign-in stop
     * reading as the same row.
     */
    if (p.account?.trim()) { bits.push(`as ${p.account.trim()}`); }
    // ‼️ …and WHERE, because it is the dimension a reader notices first and the
    // one that was invisible: a row that reads "opus · effort high" says
    // nothing about the window the session will appear in.
    const where = profileSurface(p);
    if (where) { bits.push(where === 'console' ? 'in the Console' : 'in a terminal'); }
    // "CLI defaults" is what `describeLaunch` says when nothing was chosen; it
    // is a sentence, not a bit, so anything real crowds it out rather than
    // standing beside it.
    return bits.length > 1 && bits[0] === 'CLI defaults'
        ? bits.slice(1).join(' · ') : bits.join(' · ');
}

/**
 * ‼️ X-253 — THE SIGN-IN A PROFILE NAMES THAT IS NO LONGER ON THIS MACHINE.
 *
 * The risk the account exemption was written for, answered by name instead of
 * by leaving the dimension out: a setup saved months ago points at a slot the
 * user has since deleted, and pressing it must NOT quietly spend a different
 * plan. So the caller asks this first, drops the dead answer, and SAYS which
 * one it dropped — an empty box the reader can see beats a full one that is
 * wrong.
 *
 * ‼️ AN EMPTY MACHINE IS NOT A MACHINE WHERE EVERYTHING IS GONE. With no slots
 * captured at all the account axis does not apply, and answering "gone" there
 * would put a warning in front of every profile on a fresh install — including
 * every one saved before this dimension existed.
 *
 * Returns the slot id that is missing, or `undefined` when there is nothing to
 * warn about.
 */
export function profileAccountGone(
    p: LaunchProfile, known: readonly string[]
): string | undefined {
    const want = (p.account ?? '').trim();
    if (!want || !known.length) { return undefined; }
    return known.some(k => k === want) ? undefined : want;
}
