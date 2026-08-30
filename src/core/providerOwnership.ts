/**
 * X-100 — WHO OWNS WHICH FACT, AND WHERE THE VAULT BOUNDARY RUNS.
 *
 * ‼️ THE FAILURE THIS EXISTS TO PREVENT IS TWO VAULTS.
 *
 * The obvious design gives every engine the same provider-profile manager: one
 * CRUD surface, one SecretStorage entry per route, one revision counter. For
 * **Claude Code** that is exactly right — a "provider" there is a route Agent
 * Farm assembles, and nothing else on the machine knows it exists. If Agent Farm
 * does not hold it, nobody does.
 *
 * For **OpenCode** it is exactly wrong. That engine already owns `/connect`,
 * `opencode auth login`, `auth.json` and a global and per-project
 * `opencode.json`. A second copy here produces two vaults, two revisions and two
 * contradicting truths — and the copy that loses is always the one the user did
 * not edit last, which is the worst possible way for a credential to fail.
 *
 * So ownership is a fact PER ENGINE PER KIND OF DATA, stated once, in one table
 * a surface can draw. That is the item's first acceptance line: it must be
 * visible which engine is the authority for which data. A rule that lives only
 * in the heads of the people who wrote the adapters is a rule the next adapter
 * breaks.
 *
 * Everything here is pure. WHERE the public half is stored and WHO calls
 * SecretStorage belong to the extension; this module decides what the public
 * half IS, and refuses the writes Agent Farm has no business making.
 */

/** Who is the authority for a piece of provider data. */
export type DataOwner = 'agent-farm' | 'engine';

/** The kinds of provider data there are. */
export type ProviderDataKind =
    /** Which providers and models exist at all. */
    | 'catalog'
    /** What unlocks them. */
    | 'credential'
    /** The engine's own configuration file. */
    | 'config'
    /**
     * ‼️ WHICH PROVIDER A RUN WAS ACTUALLY STARTED WITH — history, not
     * configuration, and therefore Agent Farm's on EVERY engine. No engine keeps
     * it: Claude's transcript demonstrably cannot (measured — two routes, one
     * model name, nothing in the record to tell them apart), and OpenCode's
     * export keeps it only for as long as the export exists. This is the whole
     * point of the launch manifest in X-102.
     */
    | 'selection';

export interface OwnershipRow {
    engine: string;
    kind: ProviderDataKind;
    owner: DataOwner;
    /** ‼️ In words, because the table is meant to be READ. A row that only says
     *  "engine" tells a person which way to go and nothing about why, and the
     *  first time the answer is inconvenient somebody will change it. */
    why: string;
}

/**
 * The table, which IS the acceptance line. Two engines have a provider axis;
 * the others own their (non-existent) provider data by default, because saying
 * `agent-farm` there would imply Agent Farm has something to manage for them.
 */
export const OWNERSHIP: OwnershipRow[] = [
    {
        engine: 'claude', kind: 'catalog', owner: 'agent-farm',
        why: 'Claude Code has no provider list of its own. A route is something Agent Farm '
            + 'assembles from a template, so the list of them exists here or nowhere.'
    },
    {
        engine: 'claude', kind: 'credential', owner: 'agent-farm',
        why: 'The key for a route Agent Farm injects is held in SecretStorage, keyed by the '
            + 'profile id. The CLI is never told where it came from and keeps no copy.'
    },
    {
        engine: 'claude', kind: 'config', owner: 'agent-farm',
        why: 'The environment a Claude process is spawned with is built per launch: inherited '
            + 'route variables are cleared and the chosen profile is injected in isolation.'
    },
    {
        engine: 'opencode', kind: 'catalog', owner: 'engine',
        why: 'OpenCode publishes its own providers and models (`opencode models --verbose`, ACP '
            + 'configOptions). A shipped list here would be a build claiming to know a machine.'
    },
    {
        engine: 'opencode', kind: 'credential', owner: 'engine',
        why: 'The engine owns `/connect`, `opencode auth login` and `auth.json`. A second copy '
            + 'in Agent Farm makes two vaults and two revisions, and the stale one wins silently.'
    },
    {
        engine: 'opencode', kind: 'config', owner: 'engine',
        why: 'The global and per-project `opencode.json` are the user\'s files. Agent Farm reads '
            + 'what it needs and never rewrites them — an automated edit to a hand-kept config '
            + 'is a change nobody asked for and nobody can find afterwards.'
    }
];

/**
 * Who owns this. ‼️ `selection` is answered before the table is consulted: it is
 * Agent Farm's on every engine, present or future, because it is a record of
 * something that happened rather than a setting.
 */
export function ownerOf(engine: string, kind: ProviderDataKind): DataOwner {
    if (kind === 'selection') { return 'agent-farm'; }
    const row = OWNERSHIP.find(r => r.engine === engine && r.kind === kind);
    // ‼️ THE DEFAULT IS THE ENGINE, and that is the cautious answer: an engine
    // nobody has written a row for is one Agent Farm knows nothing about, and
    // claiming ownership of its credentials would be the two-vault failure
    // arriving by default rather than by decision.
    return row ? row.owner : 'engine';
}

/**
 * The table, for a surface to draw — ‼️ INCLUDING THE ROW THAT IS NOT IN
 * `OWNERSHIP`.
 *
 * `selection` is answered by rule rather than by row (it is Agent Farm's on
 * every engine, present or future), and a table built by listing `OWNERSHIP`
 * therefore drew three of the four kinds and silently dropped the fourth. The
 * acceptance line is that it must be VISIBLE which engine is the authority for
 * which data; a kind that exists in the type, is enforced by `ownerOf` and
 * appears nowhere a person can look is the rule failing quietly — which is
 * exactly what the whole table exists to prevent.
 *
 * So the drawn table is DERIVED from `ownerOf`, one call per cell, for every
 * engine the table knows and every kind there is. One rule, one reader.
 */
export function ownershipTable(): OwnershipRow[] {
    const engines = [...new Set(OWNERSHIP.map(r => r.engine))];
    const kinds: ProviderDataKind[] = ['catalog', 'credential', 'config', 'selection'];
    const out: OwnershipRow[] = [];
    for (const engine of engines) {
        for (const kind of kinds) {
            const row = OWNERSHIP.find(r => r.engine === engine && r.kind === kind);
            if (row) { out.push({ ...row }); continue; }
            out.push({
                engine, kind, owner: ownerOf(engine, kind),
                why: kind === 'selection'
                    ? 'Which provider a run was actually started with is HISTORY, not configuration — '
                    + 'and no engine keeps it. Claude\'s transcript demonstrably cannot (measured: two '
                    + 'routes, one model name, nothing in the record to tell them apart) and OpenCode\'s '
                    + 'export keeps it only while the export exists. So Agent Farm records it on every '
                    + 'engine; that is what the launch manifest is for.'
                    : `No row has been written for ${engine}'s ${kind}, so the cautious answer applies: `
                    + 'an engine Agent Farm knows nothing about owns its own, and claiming otherwise '
                    + 'would be the two-vault failure arriving by default rather than by decision.'
            });
        }
    }
    return out;
}

/**
 * ‼️ ONE SECRET, ONE KEY, DERIVED FROM THE ID AND NOT THE NAME.
 *
 * A key built out of a label moves the moment somebody edits the label, and the
 * old entry stays in the OS keychain forever — nothing ever collects it, and the
 * profile silently has no credential. The id never changes, which is what makes
 * it the only thing a key may be built from.
 */
export function secretKeyFor(profileId: string | undefined): string {
    const id = (profileId || '').trim();
    return id ? `agentFarm.providerProfile.${id}` : '';
}

/** The half of a profile that may be seen — by settings, the bridge, the CLI,
 *  a notice and an export, which are all the same question asked five times. */
export interface PublicProviderProfile {
    id: string;
    label: string;
    engine: string;
    providerId: string;
    baseUrl?: string;
    authKind?: string;
    tiers: Record<string, string>;
    revision: number;
    /** ‼️ WHETHER there is a credential is public; the credential is not. A
     *  surface has to be able to draw "this route has no key yet" without ever
     *  reading one. */
    hasSecret: boolean;
}

/**
 * ‼️ BUILT BY NAMING WHAT IS PUBLIC, NEVER BY DELETING WHAT IS NOT.
 *
 * The stored object is whatever a profile record happens to hold — today a key
 * and headers, tomorrow a field nobody here has thought of. An allow-list stays
 * correct when that shape grows; a `delete p.apiKey` stops being correct
 * silently, in the one place where being silently wrong writes a credential into
 * settings, a bridge response, a CLI line, a notice and an export at once.
 */
export function publicProfile(
    stored: Record<string, unknown>, opts?: { hasSecret?: boolean }
): PublicProviderProfile {
    const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
    const tiersIn = (stored.tiers && typeof stored.tiers === 'object' && !Array.isArray(stored.tiers))
        ? stored.tiers as Record<string, unknown> : {};
    const tiers: Record<string, string> = {};
    for (const [k, v] of Object.entries(tiersIn)) { if (str(v)) { tiers[k] = str(v); } }
    const rev = typeof stored.revision === 'number' && Number.isFinite(stored.revision)
        ? stored.revision : 1;
    const out: PublicProviderProfile = {
        id: str(stored.id),
        label: str(stored.label) || str(stored.id),
        engine: str(stored.engine) || 'claude',
        providerId: str(stored.providerId),
        tiers,
        revision: rev,
        hasSecret: opts?.hasSecret === true
    };
    if (str(stored.baseUrl)) { out.baseUrl = str(stored.baseUrl); }
    if (str(stored.authKind)) { out.authKind = str(stored.authKind); }
    return out;
}

/**
 * ‼️ AGENT FARM REFUSES TO MANAGE WHAT IT DOES NOT OWN — by name, with the
 * engine's own way of doing it, because a refusal that does not say what to do
 * instead is just a wall.
 *
 * Reading the public half is never refused: that is how a surface draws "this
 * engine has three connected providers" without owning anything. Recording what
 * a run chose is never refused either — that is `selection`, and it is Agent
 * Farm's on every engine.
 */
export function ownershipRefusal(
    engine: string, kind: ProviderDataKind, action: 'read' | 'write'
): string[] {
    if (action === 'read') { return []; }
    if (ownerOf(engine, kind) === 'agent-farm') { return []; }
    if (kind === 'credential') {
        return [`${engine} owns its own credentials — Agent Farm does not store them. `
            + `Sign in with the engine itself (\`opencode auth login\`, or /connect in its TUI); `
            + `Agent Farm reads only whether a credential exists.`];
    }
    if (kind === 'config') {
        return [`${engine} owns its own configuration (\`opencode.json\`) and Agent Farm does not `
            + `rewrite it — an automated edit to a hand-kept file is a change nobody asked for `
            + `and nobody can find afterwards. Edit it in the engine, or by hand.`];
    }
    return [`${engine} is the authority for its ${kind}; Agent Farm reads it and does not write it.`];
}

/**
 * ‼️ A PROFILE THAT CHANGED IS A DIFFERENT PROFILE TO A RUN THAT ALREADY
 * HAPPENED. The launch manifest records the revision it ran on (X-102), so a
 * route edited afterwards cannot silently rewrite history — without it the
 * record names a profile whose base URL is no longer the one that served the
 * session, and nothing anywhere says so.
 */
export function bumpRevision<T extends { revision?: number }>(profile: T): T & { revision: number } {
    const rev = typeof profile.revision === 'number' && Number.isFinite(profile.revision)
        ? profile.revision : 0;
    return { ...profile, revision: rev + 1 };
}

/**
 * A copy is a NEW profile: its own id, its own history starting at revision 1,
 * and ‼️ no credential. Duplicating a key by pressing "copy" would put the same
 * secret behind two names, and revoking one of them would leave the other
 * working with no sign of why.
 */
export function copyProfile(
    profile: Record<string, unknown>, newId: string
): PublicProviderProfile {
    return { ...publicProfile(profile), id: newId.trim(), revision: 1, hasSecret: false };
}
