/**
 * X-100 — THE PROFILE STORE: what a route IS, and the writes Agent Farm refuses.
 *
 * `providerOwnership.ts` answers "who owns this fact" and "what may be seen".
 * This answers the other half: what a stored route looks like, which edits are
 * legal, and what a list of them does when one is added, changed, copied or
 * removed. Pure — no vscode, no disk, no SecretStorage. WHERE the list lives
 * and WHO holds the key belong to the extension.
 *
 * ‼️ THE ONE STRUCTURAL DECISION, AND EVERYTHING ELSE FOLLOWS FROM IT:
 * **THE STORED RECORD IS THE PUBLIC RECORD.** There is no private half of a
 * profile. `StoredProviderProfile` is `PublicProviderProfile` minus the one
 * derived field (`hasSecret`), and `storedProfile` builds it by NAMING its
 * fields — so a `key`, an `apiKey`, an `authorization` header or a field
 * invented next year cannot be stored at all.
 *
 * The acceptance line says "settings, bridge, CLI, notice and export contain no
 * secret". A filter applied at five surfaces is five chances to forget one. A
 * record that never HELD a secret cannot leak one at any of them, and the
 * remaining question — does each surface really serialise through this? — is a
 * thing a test can measure, which is what `test_provider_profiles.js` does.
 */

import { modelIdOk } from './launch';
import {
    ownershipRefusal, PublicProviderProfile, publicProfile, secretKeyFor
} from './providerOwnership';

/**
 * What is written down. ‼️ Deliberately the public shape minus `hasSecret`:
 * that one is DERIVED (does SecretStorage hold a key for this id?) and storing
 * it would be a second copy of a fact that can go stale — a profile whose key
 * was revoked outside Agent Farm would go on claiming it had one.
 */
export interface StoredProviderProfile {
    id: string;
    label: string;
    engine: string;
    providerId: string;
    baseUrl?: string;
    authKind?: string;
    /** tier (`opus`, `sonnet`, `haiku`) → the model id this route serves for it. */
    tiers: Record<string, string>;
    revision: number;
    /** The owner's own note — whose key, which account, what for. Which key it is lives with the
     *  keychain (`ProviderKeys` binds), never here: this file is written by hand and by agents. */
    description?: string;
}

/**
 * ‼️ THE ID IS ALSO A KEYCHAIN KEY (`secretKeyFor`), so its charset is a
 * security question and not a style one. Lowercase, digits and hyphen: no dot
 * (it is the separator in the key), no space, no slash, nothing that could make
 * two different ids collapse into one entry.
 */
export const PROFILE_ID = /^[a-z0-9][a-z0-9-]{1,39}$/;

export const PROFILE_ID_REFUSAL =
    'a profile id is 2–40 characters of lowercase letters, digits and hyphens, starting with a '
    + 'letter or digit — it is also the key its credential is stored under, so it may not contain '
    + 'a dot, a space or a slash.';

/** Anything a caller might hand over. Nothing here is trusted; nothing not
 *  named in `storedProfile` survives the trip. */
export interface ProviderProfileInput {
    id?: string;
    label?: string;
    engine?: string;
    providerId?: string;
    baseUrl?: string;
    authKind?: string;
    tiers?: Record<string, unknown>;
    revision?: number;
    description?: string;
    [k: string]: unknown;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * ‼️ BUILT BY NAMING, NEVER BY DELETING — the same rule as `publicProfile`, one
 * layer earlier, and this is the layer that matters most: `publicProfile`
 * protects what is SHOWN, this protects what is WRITTEN. A settings object that
 * a person typed a key into by hand loses it here, on the way in.
 */
export function storedProfile(input: ProviderProfileInput): StoredProviderProfile {
    const tiers: Record<string, string> = {};
    const raw = (input.tiers && typeof input.tiers === 'object' && !Array.isArray(input.tiers))
        ? input.tiers as Record<string, unknown> : {};
    for (const [k, v] of Object.entries(raw)) {
        const tier = str(k), model = str(v);
        if (tier && model) { tiers[tier] = model; }
    }
    const rev = typeof input.revision === 'number' && Number.isFinite(input.revision)
        && input.revision >= 1 ? Math.floor(input.revision) : 1;
    const out: StoredProviderProfile = {
        id: str(input.id).toLowerCase(),
        label: str(input.label) || str(input.id),
        engine: str(input.engine).toLowerCase() || 'claude',
        providerId: str(input.providerId),
        tiers,
        revision: rev
    };
    if (str(input.baseUrl)) { out.baseUrl = str(input.baseUrl); }
    if (str(input.authKind)) { out.authKind = str(input.authKind); }
    if (str(input.description)) { out.description = str(input.description).replace(/\s+/g, ' ').slice(0, 200); }
    return out;
}

/**
 * ‼️ A ROUTE'S BASE URL CARRIES A CREDENTIAL TO IT, so plain `http` to anywhere
 * but this machine puts the key on the wire in clear. Loopback is allowed by
 * name because a local gateway or proxy is an ordinary, measured setup and
 * refusing it would push people to disable the check rather than obey it.
 */
export function baseUrlRefusal(url: string): string {
    const u = str(url);
    if (!u) { return ''; }
    if (/^https:\/\/[^\s]+$/.test(u)) { return ''; }
    if (/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/[^\s]*)?$/.test(u)) { return ''; }
    return 'base URL must be https, or http on this machine (localhost / 127.0.0.1). '
        + 'A key sent over plain http to another host travels in clear.';
}

/**
 * Everything wrong with one profile, together. ‼️ ALL OF THEM, not the first:
 * a form that reports one fault per press makes the user find them serially,
 * and this one is filled in from a dialog.
 *
 * `engines` is passed in rather than imported: this module must not know which
 * engines exist, or a new one means editing a validator that has no opinion
 * about it.
 */
export function profileRefusal(
    p: StoredProviderProfile,
    opts: { engines?: string[]; takenIds?: string[] } = {}
): string[] {
    const out: string[] = [];
    if (!PROFILE_ID.test(p.id)) { out.push(PROFILE_ID_REFUSAL); }
    if (opts.takenIds?.includes(p.id)) {
        out.push(`a profile with the id "${p.id}" already exists — ids are permanent because the `
            + 'credential is filed under one; rename the label instead, or copy it to a new id.');
    }
    if (opts.engines?.length && !opts.engines.includes(p.engine)) {
        out.push(`engine "${p.engine}" is not one of: ${opts.engines.join(', ')}`);
    }
    /**
     * ‼️ AND THE OWNERSHIP QUESTION IS ASKED HERE, NOT AT THE SURFACE.
     *
     * A profile IS a stored credential (`hasSecret` is what it is for), so
     * creating one for an engine that owns its own credentials is exactly the
     * two-vault failure `providerOwnership` exists to prevent — arriving
     * through a form instead of through a design decision. The refusal names
     * the engine's own way of doing it, so the answer is "do it there", not
     * "you may not".
     */
    out.push(...ownershipRefusal(p.engine, 'credential', 'write'));
    if (!p.providerId) {
        out.push('a profile names the provider it routes to (anthropic, kimi, minimax, …).');
    }
    const url = baseUrlRefusal(p.baseUrl ?? '');
    if (url) { out.push(url); }
    for (const [tier, model] of Object.entries(p.tiers)) {
        if (!modelIdOk(model)) {
            out.push(`the model for tier "${tier}" is not a model id — letters, digits, dot, `
                + 'colon, slash and hyphen only: it goes on a command line.');
        }
    }
    return out;
}

/**
 * ‼️ HAS THE ROUTE ITSELF CHANGED — the question the revision answers.
 *
 * X-102 records the revision a run happened on so a route edited afterwards
 * cannot silently rewrite history. That only works while the number means
 * something: bumping it on a label change would make it a counter of edits
 * rather than a statement about the route, and a reader could no longer use it
 * to ask "is this still what served that session?".
 *
 * The label is deliberately NOT in here. The credential IS — but it is not a
 * field, so the caller that replaces one bumps the revision itself
 * (`bumpRevision`); the same key under a different route and the same route
 * under a different key are both new routes to a run that already happened.
 */
export function routeChanged(a: StoredProviderProfile, b: StoredProviderProfile): boolean {
    if (a.providerId !== b.providerId) { return true; }
    if ((a.baseUrl ?? '') !== (b.baseUrl ?? '')) { return true; }
    if ((a.authKind ?? '') !== (b.authKind ?? '')) { return true; }
    if (a.engine !== b.engine) { return true; }
    const ta = Object.keys(a.tiers).sort(), tb = Object.keys(b.tiers).sort();
    if (ta.join(',') !== tb.join(',')) { return true; }
    return ta.some(k => a.tiers[k] !== b.tiers[k]);
}

/** What every write returns: the new list, or the reasons there is not one.
 *  Never both — a partial write to a credential store is the worst outcome. */
export interface ProfileWrite {
    list: StoredProviderProfile[];
    refusal: string[];
    /** The profile as it ended up, for a caller that has to key a secret on it. */
    profile?: StoredProviderProfile;
}

const refuse = (list: StoredProviderProfile[], refusal: string[]): ProfileWrite =>
    ({ list, refusal });

/** Read a stored list back into shape — a settings array is whatever somebody
 *  typed, and every consumer past this point may assume the shape. */
export function readProfiles(raw: unknown): StoredProviderProfile[] {
    return readProfilesReport(raw).list;
}

/**
 * ‼️ X-116 — THE SAME READ, AND WHAT IT HAD TO DO TO THE STORED SHAPE, SAID.
 *
 * A record written before a field existed is read with that field filled in,
 * and a record whose id cannot be a key is dropped. Both were silent: a route
 * typed by hand with a space in its id simply was not there, on any surface.
 * The stored copy is never rewritten here — the reader only reports.
 */
export interface ProfileReadReport {
    list: StoredProviderProfile[];
    /** One sentence per record read with a field filled in for it. */
    upgraded: string[];
    /** One sentence per record that could not be read at all. */
    dropped: string[];
}

export function readProfilesReport(raw: unknown): ProfileReadReport {
    const out: ProfileReadReport = { list: [], upgraded: [], dropped: [] };
    if (!Array.isArray(raw)) { return out; }
    raw.forEach((item, at) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            out.dropped.push(`stored route #${at + 1} is not a record, so it was skipped`);
            return;
        }
        const input = item as ProviderProfileInput;
        const p = storedProfile(input);
        // ‼️ An unusable id is DROPPED rather than repaired: a repaired id is a
        // different id, and its credential is filed under the original.
        if (!PROFILE_ID.test(p.id)) {
            out.dropped.push(`stored route "${str(input.id) || `#${at + 1}`}" was skipped: ${PROFILE_ID_REFUSAL}`);
            return;
        }
        const filled: string[] = [];
        if (!str(input.engine)) { filled.push(`engine ${p.engine}`); }
        const rev = input.revision;
        if (!(typeof rev === 'number' && Number.isFinite(rev) && rev >= 1)) { filled.push(`revision ${p.revision}`); }
        if (!str(input.label)) { filled.push(`label "${p.label}"`); }
        if (str(input.id) !== p.id) { filled.push(`id "${p.id}" (stored as "${str(input.id)}")`); }
        if (filled.length) {
            out.upgraded.push(`route "${p.id}" was stored in an older shape and is read with ${filled.join(', ')} `
                + '— the stored copy is left as it is until the route is next saved');
        }
        out.list.push(p);
    });
    return out;
}

export function addProfile(
    list: StoredProviderProfile[], input: ProviderProfileInput, engines?: string[]
): ProfileWrite {
    const p = { ...storedProfile(input), revision: 1 };
    const refusal = profileRefusal(p, { engines, takenIds: list.map(x => x.id) });
    if (refusal.length) { return refuse(list, refusal); }
    return { list: [...list, p], refusal: [], profile: p };
}

/**
 * Change one. ‼️ THE ID IS NOT CHANGEABLE — it is the key the credential is
 * filed under, and moving it would leave the old entry in the OS keychain with
 * nothing to collect it. Copying to a new id is the supported way, and it
 * deliberately does not carry the key.
 */
export function setProfile(
    list: StoredProviderProfile[], id: string, patch: ProviderProfileInput, engines?: string[]
): ProfileWrite {
    const at = list.findIndex(x => x.id === str(id).toLowerCase());
    if (at < 0) { return refuse(list, [`no profile with the id "${str(id)}"`]); }
    const before = list[at];
    const merged = storedProfile({
        ...before,
        ...patch,
        // stated here rather than trusted from the patch: see above.
        id: before.id,
        revision: before.revision
    });
    const refusal = profileRefusal(merged, { engines });
    if (refusal.length) { return refuse(list, refusal); }
    const next = routeChanged(before, merged)
        ? { ...merged, revision: before.revision + 1 }
        : merged;
    const out = [...list];
    out[at] = next;
    return { list: out, refusal: [], profile: next };
}

/** Remove one. The caller deletes the credential — this cannot, and a list that
 *  quietly dropped the row while the key stayed behind is the orphan case
 *  `secretKeyFor` exists to make impossible. */
export function removeProfile(list: StoredProviderProfile[], id: string): ProfileWrite {
    const want = str(id).toLowerCase();
    if (!list.some(x => x.id === want)) {
        return refuse(list, [`no profile with the id "${str(id)}"`]);
    }
    return {
        list: list.filter(x => x.id !== want), refusal: [],
        profile: list.find(x => x.id === want)
    };
}

/**
 * ‼️ A COPY IS A NEW PROFILE, AT REVISION 1, WITH NO CREDENTIAL.
 *
 * `copyProfile` in `providerOwnership.ts` states that rule for the public
 * shape; this applies it to the list and picks the new id. Duplicating a key by
 * pressing "copy" would put one secret behind two names, and revoking one of
 * them would leave the other working with nothing to say why.
 */
export function duplicateProfile(
    list: StoredProviderProfile[], id: string, newId?: string
): ProfileWrite {
    const src = list.find(x => x.id === str(id).toLowerCase());
    if (!src) { return refuse(list, [`no profile with the id "${str(id)}"`]); }
    const wanted = str(newId).toLowerCase() || freeProfileId(list, src.id);
    const copy: StoredProviderProfile = {
        ...src, id: wanted, label: `${src.label} (copy)`, revision: 1
    };
    const refusal = profileRefusal(copy, { takenIds: list.map(x => x.id) });
    if (refusal.length) { return refuse(list, refusal); }
    return { list: [...list, copy], refusal: [], profile: copy };
}

/** `kimi` → `kimi-2` → `kimi-3`. Counts up and never reuses, for the reason a
 *  backlog code does: an id that came back would inherit a keychain entry. */
export function freeProfileId(list: StoredProviderProfile[], base: string): string {
    const taken = new Set(list.map(x => x.id));
    const root = str(base).toLowerCase().replace(/-\d+$/, '') || 'profile';
    for (let n = 2; n < 1000; n++) {
        const id = `${root}-${n}`;
        if (!taken.has(id) && PROFILE_ID.test(id)) { return id; }
    }
    return '';
}

/**
 * The list as it may be SEEN, which is every surface's answer.
 *
 * `hasSecret` is asked of the caller because only the extension can look in
 * SecretStorage — and it is a set of ids rather than a lookup so a page draw
 * cannot become one keychain read per row.
 */
export function publicProfiles(
    list: StoredProviderProfile[], withSecret: Iterable<string> = []
): PublicProviderProfile[] {
    const has = new Set(withSecret);
    return list.map(p => publicProfile(
        p as unknown as Record<string, unknown>, { hasSecret: has.has(p.id) }));
}

/** The keychain keys this list owns — so a caller can find entries whose
 *  profile is gone and collect them. An orphan credential is the one failure
 *  that leaves a working key nobody can see. */
export function profileSecretKeys(list: StoredProviderProfile[]): string[] {
    return list.map(p => secretKeyFor(p.id)).filter(k => k);
}
