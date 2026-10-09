/**
 * X-114 — THREE DIFFERENT QUESTIONS ABOUT A PROVIDER, AND ONLY ONE OF THEM
 * COSTS ANYTHING.
 *
 * `engines.ts` answers "is this ENGINE ready" off the disk and `engineTest.ts`
 * answers "does it really run" with one real turn. Neither one reaches the
 * provider axis: a Claude route with no key, a route answered a second time in
 * the CLI's own settings file, a tier mapped to nothing, an OpenCode provider
 * the catalog no longer lists — every one of those is a run that starts and
 * fails, on an engine both of those modules call healthy.
 *
 * ‼️ SO THE ANSWER IS THREE STATES AND NOT A LADDER, which is this item's first
 * acceptance clause:
 *
 *   · `configured` — something declares this provider: a route Agent Farm
 *     holds, or the engine's own catalog. It says nothing about whether it
 *     would run.
 *   · `available`  — the FREE static verdict. Everything readable without
 *     spending a token agrees a run could be started. Three values, because
 *     `unknown` is a real answer: with no catalog fetched, "no" would be a lie
 *     and "yes" would be a guess.
 *   · `tested`     — a real turn was run through this provider and it answered.
 *     Absent until somebody presses it, and it never becomes true on its own.
 *
 * A row can be configured and unavailable (a route with no key), available and
 * never tested (the ordinary case), or tested and since edited — which is why
 * the record is KEYED rather than dated (see `ProviderTestKey`).
 *
 * ‼️ AND THE SECOND ACCEPTANCE CLAUSE IS A MEASUREMENT, NOT A COURTESY: an
 * OpenCode provider with no credential is NOT unhealthy. Measured on this
 * machine (and already written down in `engines.ts`): with a completely empty
 * `auth.json` the CLI still lists and runs seven models on its own connected
 * `opencode` provider. A health check that demanded a credential per provider
 * would paint the one provider that works red. Here the absence of a credential
 * is a NOTE on an engine that owns its own credentials, never a problem.
 *
 * Pure, with everything injected, so the whole matrix is testable without a
 * CLI, a keychain or a token.
 */

import {
    CatalogSource, ProviderAdapter, ProviderAxis, ProviderCatalog, ProviderSelection
} from './providerAdapter';
import { StoredProviderProfile } from './providerProfiles';
import { isRouteEnvName } from './providerRuntime';
import { diagnoseEngineConfig, EngineConfigFile, EngineConfigRead } from './engineConfigDiagnosis';
import { goneRouteProblems, SavedRoute } from './savedRoutes';

/** ‼️ `unknown` is an ANSWER: nothing was readable, so nothing is claimed. */
export type Availability = 'yes' | 'no' | 'unknown';

/**
 * WHAT A PASS ACTUALLY PROVED, so a cached green tick cannot be read as a claim
 * about something else.
 *
 * A turn proves that THIS provider, with THIS model, resolved by THIS adapter,
 * through THIS CLI, answered. Change any one of them and the verdict is about a
 * configuration that no longer exists — most sharply on Claude, where editing a
 * route's endpoint or replacing its key bumps `revision` and turns yesterday's
 * pass into a statement about a different endpoint entirely.
 */
export interface ProviderTestKey {
    engine: string;
    providerId: string;
    /** The engine's own wire spelling where there is one (`opencode/big-pickle`). */
    modelId: string;
    /** `adapter.id@adapter.version` — the code that resolved the route. */
    adapter: string;
    /** The CLI revision the turn ran through; `''` when nothing read one. */
    cli: string;
    /** Claude: the route revision. Absent on engines that own their own routes. */
    revision?: number;
}

export interface ProviderTestRecord {
    key: ProviderTestKey;
    /** did the provider answer */
    ok: boolean;
    at: number;
    ms: number;
    detail: string;
    /** the engine's own words when it failed, trimmed — never invented */
    error?: string;
    /**
     * ‼️ NOTHING WAS CALLED, AND THAT IS NOT A FAILURE — the same third state
     * `engineTest.ts` had to grow (U-59). "This provider publishes no free
     * model, so the check would spend money — you choose" is worth more than a
     * silent bill, and it must not draw as a red cross.
     */
    refused?: string;
}

/** A stable string for the key, so records can be stored in a plain map. */
export function testKeyOf(k: ProviderTestKey): string {
    return [
        k.engine, k.providerId, k.modelId, k.adapter, k.cli,
        k.revision === undefined ? '' : String(k.revision)
    ].map(s => String(s ?? '').trim().toLowerCase()).join('|');
}

/**
 * The record that answers for the configuration as it stands NOW — and, when
 * there is none, the one that answered for a configuration this replaced.
 *
 * ‼️ THE SECOND HALF IS THE POINT. Dropping a superseded record shows a person
 * "never tested" about a provider they tested an hour ago, and they press it
 * again for nothing; showing it as current claims a pass for an endpoint that
 * has since changed. Saying *why* it no longer answers is the only honest third
 * option, and it is the sentence that tells them whether to bother.
 */
export function findTest(
    records: readonly ProviderTestRecord[] | undefined, key: ProviderTestKey
): { record?: ProviderTestRecord; superseded?: ProviderTestRecord; why?: string } {
    const want = testKeyOf(key);
    const all = records ?? [];
    const exact = all.find(r => r && testKeyOf(r.key) === want);
    if (exact) { return { record: exact }; }
    const sameProvider = all
        .filter(r => r && r.key.engine === key.engine && r.key.providerId === key.providerId)
        .sort((a, b) => b.at - a.at)[0];
    if (!sameProvider) { return {}; }
    const k = sameProvider.key;
    const why = k.revision !== key.revision
        ? `the route has been edited since (revision ${k.revision ?? '?'} → ${key.revision ?? '?'})`
        : k.modelId !== key.modelId
            ? `that turn ran on ${k.modelId || 'another model'}`
            : k.cli !== key.cli
                ? `the CLI has changed since (${k.cli || 'unknown'} → ${key.cli || 'unknown'})`
                : `the adapter has changed since (${k.adapter} → ${key.adapter})`;
    return { superseded: sameProvider, why };
}

/** What a provider row states about itself. No credential, ever — see `notes`. */
export interface ProviderHealthRow {
    engine: string;
    providerId: string;
    label: string;
    /** Something declares it. Never a claim that it would run. */
    configured: boolean;
    /** In one phrase: who declares it. */
    configuredBy: string;
    available: Availability;
    /** Why `available` is `no` — the adapter's own words first. */
    problems: string[];
    /**
     * ‼️ THINGS THAT LOOK LIKE PROBLEMS AND ARE NOT. This field exists for the
     * OpenCode provider with no credential, and it earns its place every time a
     * reader would otherwise have gone looking for a fault that is not there.
     */
    notes: string[];
    /** How many models a launch could name on it, from the catalog. */
    models: number;
    /** Their wire spellings, which are public metadata and nothing else. */
    modelRefs: string[];
    /** The last real turn, when one was ever pressed for this configuration. */
    tested?: ProviderTestRecord;
    /** A verdict about a configuration this one replaced, with the reason. */
    testedSuperseded?: ProviderTestRecord;
    testedSupersededWhy?: string;
}

export interface ProviderHealthReport {
    engine: string;
    axis: ProviderAxis;
    /** Where the catalog came from — `not-fetched` is why a row can be unknown. */
    source: CatalogSource;
    cli: { present: boolean; version?: string };
    rows: ProviderHealthRow[];
    /** Wrong with the ENGINE rather than with any one provider. */
    problems: string[];
    notes: string[];
    /** X-116 — the engine's own config files that were read (never written). */
    config: EngineConfigRead[];
}

export interface ProviderHealthInput {
    engine: string;
    adapter: ProviderAdapter;
    catalog: ProviderCatalog;
    /** Claude: the routes Agent Farm holds. */
    profiles?: readonly StoredProviderProfile[];
    /** Whether a credential exists for a route. ‼️ A BOOLEAN — never the value. */
    hasSecret?: (profileId: string) => boolean;
    /** What `engines.ts` already read about the CLI itself. */
    cli?: { present: boolean; version?: string };
    /** The environment a spawn would inherit — `process.env` at the call site. */
    inheritedEnv?: Record<string, string | undefined>;
    /**
     * The `env` block of the CLI's own settings file (`~/.claude/settings.json`).
     * ‼️ THE THIRD ANSWER TO THE ROUTE QUESTION, and the one X-101 could not
     * reach: `clearEnv` empties the inherited process environment, and a name
     * sitting in this file is read by the CLI afterwards, from inside. Agent
     * Farm owns the route and still loses to it, silently.
     */
    settingsEnv?: Record<string, unknown>;
    /** X-116 — the per-folder and engine-owned config files, as found on disk. */
    configFiles?: readonly EngineConfigFile[];
    /** X-116 — every saved choice on this engine that names a route. */
    savedRoutes?: readonly SavedRoute[];
    /** X-116 — can a launch be pointed at this route now? The spawn's own rule. */
    routeRunnable?: (providerId: string) => boolean;
    /** X-116 — what reading the stored routes had to fill in or skip. */
    profileRead?: { upgraded: readonly string[]; dropped: readonly string[] };
    /** The engine's own credential file, for the engines that own one. */
    engineCredentials?: { file: string; present: boolean; entries: number };
    records?: readonly ProviderTestRecord[];
}

const trim = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The route names really present in the CLI's own settings file. */
export function settingsRouteEnv(settingsEnv: Record<string, unknown> | undefined): string[] {
    return Object.keys(settingsEnv ?? {}).filter(isRouteEnvName).sort();
}

/**
 * The static, free verdict for one engine's whole provider axis.
 *
 * Nothing here spawns, reads a keychain or touches the network; every fact it
 * uses was already read for another reason, which is why this can be asked on
 * every page open while `providerSmoke` below can not.
 */
export function providerHealth(input: ProviderHealthInput): ProviderHealthReport {
    const { adapter, catalog } = input;
    const engine = trim(input.engine) || adapter.engine;
    const cli = input.cli ?? { present: true };
    const problems: string[] = [];
    const notes: string[] = [];

    if (!cli.present) {
        problems.push(`the ${engine} CLI is not on PATH, so nothing on it can be started`);
    }

    // ‼️ THE SETTINGS FILE IS ASKED BEFORE ANY ROW, because a route answered
    // there is answered for every row at once.
    const settings = settingsRouteEnv(input.settingsEnv);
    if (settings.length) {
        problems.push(`${settings.join(', ')} ${settings.length > 1 ? 'are' : 'is'} set in the CLI's own `
            + 'settings.json env block, which a spawn cannot clear — the route chosen here is '
            + 'answered a second time from inside the process');
    }

    const inherited = Object.keys(input.inheritedEnv ?? {}).filter(isRouteEnvName).sort();
    if (inherited.length) {
        notes.push(`${inherited.join(', ')} ${inherited.length > 1 ? 'are' : 'is'} present in the `
            + 'inherited environment; a launch on a route clears them by name (X-101), so this is '
            + 'only a route for a run started with no route at all');
    }

    // X-116 — a provider named in a config file is only refused against a
    // catalog somebody actually read; with none, it is neither confirmed nor
    // refused.
    const catalogRead = !!catalog && catalog.source !== 'not-fetched';
    const cfg = diagnoseEngineConfig(input.configFiles ?? [],
        catalogRead ? (catalog.providers ?? []).map(p => p.providerId) : undefined);
    problems.push(...cfg.problems, ...(input.profileRead?.dropped ?? []));
    notes.push(...cfg.notes, ...(input.profileRead?.upgraded ?? []));

    if (adapter.axis === 'not-applicable') {
        return {
            engine, axis: adapter.axis, source: catalog?.source ?? 'not-fetched', cli,
            rows: [],
            config: cfg.files,
            problems,
            notes: [...notes, `${engine} has no provider axis — there is nothing here to configure`]
        };
    }

    const fetched = !!catalog && catalog.source !== 'not-fetched';
    if (!fetched) {
        notes.push('no catalog has been read yet, so availability is unknown rather than false');
    }

    // ‼️ OPENCODE OWNS ITS OWN CREDENTIALS, AND AN EMPTY FILE IS NOT A FAULT.
    const creds = input.engineCredentials;
    const credentialsEmpty = !!creds && (!creds.present || creds.entries === 0);
    if (credentialsEmpty) {
        notes.push(`${creds!.file} holds no credential, and on this engine that is not a fault: its `
            + 'own connected provider lists and runs models with an empty credentials file '
            + '(measured) — a provider the catalog offers is available whether or not one is stored');
    }

    const rows: ProviderHealthRow[] = (catalog?.providers ?? []).map(p => {
        const profile = (input.profiles ?? []).find(x => x && x.id === p.providerId);
        const rowProblems: string[] = [];
        const rowNotes: string[] = [];

        // ‼️ THE ENTRY'S OWN LIST, not one reassembled from the rows. `rows` is
        // empty on the Claude catalog — its models come from a route's tier
        // mapping rather than from a model listing — and a health check built
        // on rows alone would report every Claude route as offering nothing.
        const modelRefs = [...new Set(p.models ?? [])].filter(m => trim(m));

        // The adapter's own refusal comes first and in its own words — it is
        // the same sentence a launch would print, so two surfaces cannot come
        // to differ over what is wrong.
        const sel: ProviderSelection = { engine, providerId: p.providerId };
        for (const e of adapter.preflight(sel)) { rowProblems.push(e); }

        if (profile) {
            // ‼️ A TIER THAT MAPS TO NOTHING is the quiet one: the route looks
            // complete, the picker offers the tier, and the spawn asks for a
            // model whose name is the empty string.
            for (const [tier, model] of Object.entries(profile.tiers ?? {})) {
                if (!trim(model)) {
                    rowProblems.push(`the "${tier}" tier maps to no model, so a run picking it `
                        + 'would ask for a model with no name');
                }
            }
            // A missing key on a third-party endpoint is already `preflight`'s
            // sentence above; saying it again here would read as two faults.
            if (!profile.baseUrl) {
                rowNotes.push('this route names no endpoint of its own, so it is the engine\'s '
                    + 'first-party one and its sign-in lives in the credentials file rather than here');
            }
        } else if (fetched && !modelRefs.length) {
            rowProblems.push('the catalog offers this provider but publishes no model a launch '
                + 'could name on it');
        }

        if (credentialsEmpty) {
            rowNotes.push('no credential is stored for this engine, and it is offering this '
                + 'provider anyway');
        }

        // ‼️ WHAT THE TRANSPORT CANNOT CARRY IS NOT A FAULT OF THE PROVIDER —
        // and saying nothing about it is how a person comes to believe a
        // reasoning variant they picked was applied. Measured against the
        // installed CLI (X-103): the interactive TUI takes no `--variant` flag
        // and ACP declares only `model` and `mode`, so a card started here runs
        // the model's default however the picker was set; a headless run takes
        // the flag. The provider is available on all three either way.
        const variants = [...new Set(p.variants ?? [])].filter(v => trim(v));
        if (variants.length) {
            rowNotes.push(`this provider publishes ${variants.length} reasoning `
                + `${variants.length > 1 ? 'variants' : 'variant'} (${variants.join(', ')}); a `
                + 'headless run can pick one, while a hosted card cannot — ACP declares only model '
                + 'and mode, and the interactive TUI takes no --variant flag');
        }

        const available: Availability = !cli.present || rowProblems.length
            ? 'no'
            : fetched ? 'yes' : 'unknown';

        return {
            engine,
            providerId: p.providerId,
            label: p.providerLabel || p.providerId,
            configured: true,
            configuredBy: profile ? 'a route Agent Farm holds' : 'the engine\'s own catalog',
            available,
            problems: rowProblems,
            notes: rowNotes,
            models: modelRefs.length,
            modelRefs
        };
    });

    // A route Agent Farm holds that the catalog does not offer is still
    // CONFIGURED — it exists, somebody made it — and that is exactly the pair of
    // states this item asks to be kept apart.
    for (const profile of input.profiles ?? []) {
        if (!profile || !profile.engines.includes(engine)) { continue; }
        if (rows.some(r => r.providerId === profile.id)) { continue; }
        rows.push({
            engine,
            providerId: profile.id,
            label: profile.label || profile.id,
            configured: true,
            configuredBy: 'a route Agent Farm holds',
            available: fetched ? 'no' : 'unknown',
            problems: fetched
                ? ['this route is held here but the catalog does not offer it']
                : [],
            notes: [],
            models: 0,
            modelRefs: []
        });
    }

    // ‼️ X-116 — only against a catalog somebody read: with none, every saved
    // route would be reported gone.
    if (fetched) {
        const listed = new Set(rows.map(r => r.providerId));
        problems.push(...goneRouteProblems(input.savedRoutes, input.routeRunnable ?? (id => listed.has(id))));
    }

    for (const row of rows) {
        const key = keyFor(input, row.providerId, row.modelRefs[0] ?? '');
        const found = findTest(input.records, key);
        if (found.record) { row.tested = found.record; }
        if (found.superseded) {
            row.testedSuperseded = found.superseded;
            row.testedSupersededWhy = found.why;
        }
    }

    return {
        engine, axis: adapter.axis, source: catalog?.source ?? 'not-fetched', cli, rows, problems, notes,
        config: cfg.files
    };
}

/** The key a turn through this provider would be filed under. */
export function keyFor(
    input: Pick<ProviderHealthInput, 'engine' | 'adapter' | 'cli' | 'profiles'>,
    providerId: string, modelId: string
): ProviderTestKey {
    const profile = (input.profiles ?? []).find(x => x && x.id === providerId);
    return {
        engine: trim(input.engine) || input.adapter.engine,
        providerId,
        modelId,
        adapter: `${input.adapter.id}@${input.adapter.version}`,
        cli: input.cli?.version ?? '',
        ...(profile ? { revision: profile.revision } : {})
    };
}

/**
 * ‼️ WHAT A SMOKE TURN MUST REFUSE TO DO, decided before anything is spawned.
 *
 * One real turn on a provider is a token off somebody's plan or a line on
 * somebody's bill, so — exactly as in `engineTest.ts` — it is PRESSED, never
 * scheduled, never run on a page open and never "refreshed" in the background.
 * This is the gate that says whether pressing it is even legitimate, and a
 * refusal is a complete answer rather than a failure.
 */
export function smokeRefusal(row: ProviderHealthRow | undefined, modelId: string): string {
    if (!row) { return 'there is no such provider to test'; }
    if (row.available === 'no') {
        return `a turn would fail for a reason already known: ${row.problems[0]}`;
    }
    if (row.available === 'unknown') {
        return 'no catalog has been read, so a turn would be aimed at a model nobody has confirmed';
    }
    if (!trim(modelId) && !row.modelRefs.length) {
        return 'this provider publishes no model, so there is nothing to send a turn to';
    }
    return '';
}

/**
 * X-115 — ‼️ A VERDICT ABOUT A ROUTE NOBODY HOLDS IS A STATEMENT ABOUT NOTHING.
 *
 * Removing a route collects its key from the keychain (X-100); the verdicts
 * filed under it are the last trace left, and every one of them goes — current
 * and superseded alike, because "superseded" only means something while there
 * is a current configuration to be superseded BY. Matched on engine AND id: the
 * same id on another engine is a different provider and is not touched.
 *
 * A route that was only EDITED keeps its records on purpose — they turn into
 * superseded ones with the reason attached (`findTest`), which is the answer a
 * reader of an edited route needs.
 */
export function dropTestsFor(
    records: readonly ProviderTestRecord[] | undefined, engine: string, providerId: string
): ProviderTestRecord[] {
    return (records ?? []).filter(r =>
        !(r && r.key && r.key.engine === engine && r.key.providerId === providerId));
}
