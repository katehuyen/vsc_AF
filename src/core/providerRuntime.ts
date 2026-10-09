/**
 * X-101 — WHAT A CLAUDE ROUTE MUST NOT INHERIT.
 *
 * Agent Farm spawns every engine with `env: { ...process.env, … }`
 * (`core/tasks.ts`). For four of the five engines that is simply correct. For
 * Claude Code it is a silent defect the moment Agent Farm owns the route: an
 * `ANTHROPIC_BASE_URL` sitting in the user's shell is a SECOND answer to the
 * question a route profile was chosen to answer, and the child obeys the
 * inherited one for everything the profile did not name. Two routes in one
 * session, and — measured in August, X-98 — nothing in the transcript that says
 * which one served it.
 *
 * ‼️ THE NAMES ARE MEASURED, NOT REMEMBERED. Read out of the real `claude`
 * binary on this machine on 2026-08-30 (a 217 MB bundle):
 *
 *     grep -ao 'ANTHROPIC_[A-Z0-9_]*' claude | sort -u     → 75 names
 *     grep -ao 'CLAUDE_[A-Z0-9_]*'    claude | sort -u     → ~200 names
 *
 * The documentation lists a fraction of them. A list written from the docs would
 * have missed `ANTHROPIC_PROFILE`, `ANTHROPIC_CONFIG_DIR`,
 * `ANTHROPIC_CUSTOM_HEADERS`, `ANTHROPIC_UNIX_SOCKET`, the Bedrock / Vertex /
 * Foundry / Mantle families, `CLAUDE_CODE_HTTP_PROXY` and
 * `CLAUDE_CODE_CLIENT_CERT` — every one of which moves the route somewhere else.
 *
 * ‼️ AND THE TWO FAMILIES GET DIFFERENT TREATMENT, WHICH IS THE MEASUREMENT
 * WORTH WRITING DOWN. All 75 `ANTHROPIC_*` names are route, credential,
 * model-mapping, alternate-backbone or organisation identity: there is not one a
 * run legitimately keeps while being told to use a different route, so that
 * family is a PREFIX RULE and a name shipped next year is covered before anybody
 * hears about it. The `CLAUDE_*` family is not like that at all — it holds the
 * alternate backbones and the plan credential AND the working context Agent Farm
 * itself depends on (`CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT`,
 * `CLAUDE_CODE_ENTRYPOINT`). Clearing that family wholesale would break the
 * user's own hooks in the name of isolating a route they never changed, so there
 * it is what a name MEANS that decides.
 */

import { RedactedRoute } from './providerIdentity';
import { StoredProviderProfile } from './providerProfiles';
import { routeDefaultEnv, routeModelEnv } from './routeModels';
import { routeValue } from './opencodeRoutes';

/**
 * ‼️ MEANING, NOT MEMBERSHIP. A closed list of `CLAUDE_*` names goes stale
 * silently and in the leaking direction; these are the shapes that carry a
 * route or a credential, and they were derived from the measured list above
 * rather than guessed at.
 */
const CLAUDE_ROUTE_PATTERNS: RegExp[] = [
    /** Any alternate endpoint: API, Bedrock, Vertex, Foundry, memory, runner. */
    /_BASE_URL$/,
    /** The switches that move the whole backbone off Anthropic's own API. */
    /^CLAUDE_CODE_USE_(BEDROCK|VERTEX|FOUNDRY|MANTLE|GATEWAY|CCR_V2|ANTHROPIC_AWS|ANTHROPIC_GOOGLE_CLOUD)$/,
    /** …and the switches that skip a backbone's sign-in. */
    /^CLAUDE_CODE_SKIP_.*(AUTH|CRED_CACHE)$/,
    /** A proxy is a route by another name, credentials and all. */
    /PROXY/,
    /** Every OAuth shape: the plan token, its refresh, the client, the URL. */
    /OAUTH/,
    /** Keys, however they arrive — literal, file descriptor or helper. */
    /API_KEY/,
    /** Auth mode, auth helper, auth file. */
    /AUTH/,
    /** TLS client identity is who the endpoint thinks is calling. */
    /(CERT|CLIENT_KEY)/,
    /** Credential files handed in by a host. */
    /CREDS/,
    /** Where the CLI reads its own stored sign-in from. */
    /CONFIG_DIR$/
];

/**
 * The measured `CLAUDE_*` names that carry a credential or an account without
 * matching any shape above. Named one by one BECAUSE they are exceptions — a
 * pattern loose enough to catch `…_TOKEN` would also catch
 * `CLAUDE_CODE_MAX_OUTPUT_TOKENS`, which is a context setting and not a route.
 */
const CLAUDE_ROUTE_NAMES: ReadonlySet<string> = new Set([
    'CLAUDE_API_KEY',
    'CLAUDE_CODE_SESSION_ACCESS_TOKEN',
    'CLAUDE_CODE_ORGANIZATION_UUID',
    'CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST',
    'CLAUDE_CODE_HFI_BEARER_TOKEN',
    'CLAUDE_TRUSTED_DEVICE_TOKEN',
    'CLAUDE_SESSION_INGRESS_TOKEN_FILE',
    'CLAUDE_BRIDGE_OAUTH_TOKEN'
]);

/**
 * Does this environment name decide WHERE a Claude process talks, or AS WHOM?
 *
 * ‼️ The two prefixes are checked before anything else, so the patterns can be
 * as broad as their meaning requires without reaching outside the family:
 * `OPENAI_API_KEY` matches `/API_KEY/` and is none of our business.
 */
export function isRouteEnvName(name: string): boolean {
    const n = String(name ?? '');
    if (n.startsWith('ANTHROPIC_')) { return true; }
    if (!n.startsWith('CLAUDE_')) { return false; }
    if (CLAUDE_ROUTE_NAMES.has(n)) { return true; }
    return CLAUDE_ROUTE_PATTERNS.some(re => re.test(n));
}

/**
 * The route names REALLY PRESENT in an environment a spawn would inherit.
 *
 * ‼️ Read from the environment rather than asserted from the table, for two
 * reasons. A launch manifest that records "cleared ANTHROPIC_BASE_URL" is
 * recording something that happened; a manifest listing all 75 names on every
 * launch records nothing. And an empty value is not an inherited route — an
 * exported-but-empty variable does not redirect anything, and clearing it would
 * put a name in the record that never mattered.
 */
export function inheritedRouteEnv(env: Record<string, string | undefined> | undefined): string[] {
    if (!env) { return []; }
    const out: string[] = [];
    for (const [name, value] of Object.entries(env)) {
        if (value === undefined || value === null || value === '') { continue; }
        if (isRouteEnvName(name)) { out.push(name); }
    }
    return out;
}

/**
 * What a chosen Claude route turns into, in two halves that are separated BY
 * TYPE rather than by discipline — discipline is what fails quietly.
 */
export interface ClaudeRouteRuntime {
    /** ‼️ PRIVATE. Goes to the child process and nowhere else: never into state,
     *  a notice, a bridge response, an export or a log. */
    spawnEnv: Record<string, string>;
    /** Names to remove from the inherited environment before spawning. */
    clearEnv: string[];
    /** The public half, for the launch manifest and every surface downstream. */
    route: RedactedRoute;
}

/**
 * A route profile plus the environment a spawn would inherit, turned into the
 * exact material that spawn needs.
 *
 * ‼️ THE ONE-SENTENCE RULE, AND IT IS A DECISION: **nothing chosen means
 * nothing touched.** A user who has never opened this feature is running on
 * their own shell's setup deliberately, and sanitising it because Agent Farm now
 * *could* would break a working machine to enforce a choice nobody made. The
 * moment a route IS chosen, the inherited ones all go — including when the
 * choice is Anthropic's own endpoint, because an inherited ANTHROPIC_BASE_URL
 * would otherwise send that run to a third party while the manifest recorded
 * first-party. That is the exact lie X-98 measured and this item exists to end.
 *
 * ‼️ A NAME IN BOTH LISTS IS NOT A CONTRADICTION — it is the order. `clearEnv`
 * is applied to the inherited environment, `spawnEnv` is written afterwards, so
 * a name in both ends up holding the chosen value and none of the old one.
 *
 * @param profile the chosen route, or `undefined` for "no choice was made"
 * @param secret  the credential from the OS keychain. ‼️ Never stored, never
 *                logged, and it does not appear in the returned `route`.
 * @param tier    which tier of the route was asked for (opus, sonnet, …)
 */
export function claudeRouteRuntime(
    profile: StoredProviderProfile | undefined,
    secret: string | undefined,
    inheritedEnv: Record<string, string | undefined> | undefined,
    tier?: string
): ClaudeRouteRuntime {
    if (!profile) { return { spawnEnv: {}, clearEnv: [], route: {} }; }

    const spawnEnv: Record<string, string> = {};
    const route: RedactedRoute = {};

    if (profile.baseUrl) {
        spawnEnv.ANTHROPIC_BASE_URL = profile.baseUrl;
        route.baseUrl = profile.baseUrl;
    }
    if (profile.authKind) { route.authKind = profile.authKind; }

    // ‼️ NO CREDENTIAL IS NOT AN EMPTY CREDENTIAL. Writing an empty value would
    // sign in as nobody, and the CLI would then report an auth failure rather
    // than the thing that is actually wrong — a profile with no key in it.
    if (secret) {
        // The CLI reads ANTHROPIC_AUTH_TOKEN as a bearer and ANTHROPIC_API_KEY
        // as a key; setting both would leave which one wins to the CLI's own
        // precedence, which is not ours to assume. An api-key is the default
        // because it is what every shipped Anthropic-compatible route uses.
        if (profile.authKind === 'oauth') { spawnEnv.ANTHROPIC_AUTH_TOKEN = secret; }
        else { spawnEnv.ANTHROPIC_API_KEY = secret; }
    }

    Object.assign(spawnEnv, routeModelEnv(profile.tiers));

    const t = String(tier ?? '').trim();
    if (t) {
        route.tier = t;
        // A tier this route does not map names NO model rather than a guessed
        // one: the wrong model on the right route answers, bills and is wrong.
        const model = profile.tiers?.[t];
        if (model) { spawnEnv.ANTHROPIC_MODEL = model; }
    } else { Object.assign(spawnEnv, routeDefaultEnv(profile.baseUrl, profile.tiers)); }

    return { spawnEnv, clearEnv: inheritedRouteEnv(inheritedEnv), route };
}

/**
 * ‼️ THE ENVIRONMENT A SPAWN ACTUALLY GETS — the one place `clearEnv` and
 * `spawnEnv` are applied, so there is one order and one thing to read.
 *
 * `tasks.ts` builds `{ ...process.env, ...engineEnv, ...secrets }` at two call
 * sites. Written out twice, the second one is where somebody forgets, and a run
 * that silently kept an inherited route would look exactly like a run that did
 * not — that is the whole failure mode. Both call sites ask this instead.
 *
 * ‼️ THE ORDER IS THE DESIGN: merge everything, clear, then write the private
 * half last.
 *
 * ‼️ AND THE CLEARING REACHES THE LATER LAYERS TOO, WHICH IS A DECISION rather
 * than an oversight. A per-agent secret named `ANTHROPIC_BASE_URL` and a chosen
 * route are two answers to one question, and the route wins because the route is
 * what gets WRITTEN DOWN: the launch manifest records it and the transcript does
 * not (measured, X-98), so letting the quieter one win would make the only
 * record of the run a lie. Where no route is chosen there is nothing to clear
 * and the per-agent value is used exactly as it always was.
 */
export function spawnEnvironment(
    inherited: Record<string, string | undefined> | undefined,
    /**
     * ‼️ X-211 — A LAYER MAY REMOVE A NAME, AND `null` IS HOW IT SAYS SO.
     *
     * "The machine's own sign-in" is not the absence of a layer: a window that
     * was itself launched with the engine's config variable set would inherit
     * it, and the card would run as an account no surface named. Saying nothing
     * could never express that; `null` can, and it means here exactly what it
     * has always meant in `terminalEnvOverlay` — delete, do not blank (see the
     * ANTHROPIC_API_KEY note below: an empty string is a value the CLI finds).
     */
    layers: Array<Record<string, string | null> | undefined>,
    runtime: { spawnEnv?: Record<string, string>; clearEnv?: string[] } | undefined
): Record<string, string> {
    const out: Record<string, string> = {};
    for (const source of [inherited, ...(layers || [])]) {
        if (!source) { continue; }
        for (const [k, v] of Object.entries(source)) {
            // A layer that says `null` is REMOVING the name — see the argument.
            if (v === null) { delete out[k]; continue; }
            // An unset inherited name must not become the string "undefined" —
            // a variable that exists holding that word is worse than an absent
            // one, because everything downstream reads it as a value.
            if (v === undefined) { continue; }
            out[k] = String(v);
        }
    }
    // ‼️ DELETED, NOT BLANKED. `ANTHROPIC_API_KEY=''` is a variable the CLI
    // still finds and still tries to sign in with; the ABSENCE is what makes it
    // fall through to the credentials file, which is the whole point.
    for (const name of runtime?.clearEnv || []) { delete out[name]; }
    for (const [k, v] of Object.entries(runtime?.spawnEnv || {})) { out[k] = routeValue(k, v, out[k]); }
    return out;
}

/**
 * ‼️ THE SAME ISOLATION FOR A VS CODE TERMINAL, WHICH IS A DIFFERENT SHAPE OF
 * PROBLEM AND NOT A DUPLICATE OF THE ABOVE.
 *
 * `cp.spawn` is handed a COMPLETE environment, so removing a name means simply
 * not putting it in. `vscode.window.createTerminal({ env })` is handed an
 * OVERLAY that VS Code merges onto the window's own environment — so leaving a
 * name out changes nothing at all and the inherited route survives untouched.
 * On that surface the absence of an instruction is not an instruction.
 *
 * Measured in the API's own declaration rather than assumed:
 *
 *     env?: { [key: string]: string | null | undefined }
 *
 * where `null` is the documented way to REMOVE a variable. Had it not been,
 * an isolated route would be impossible here and the honest thing would have
 * been to refuse the launch rather than run it on a route nobody chose.
 *
 * ‼️ `null` AND NOT `''`: an empty string is a variable the CLI still finds and
 * still tries to sign in with. Only the removal makes it fall through to the
 * credentials file.
 */
export function terminalEnvOverlay(
    layers: Array<Record<string, string | null> | undefined>,
    runtime: { spawnEnv?: Record<string, string>; clearEnv?: string[] } | undefined,
    opts?: { windowEnv?: Record<string, string | undefined> } // what VS Code merges the overlay onto
): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    for (const source of layers || []) {
        if (!source) { continue; }
        for (const [k, v] of Object.entries(source)) {
            // X-211 — a layer's `null` already means "remove" on this side; it
            // is passed straight through, which is what a terminal overlay is.
            if (v === null) { out[k] = null; continue; }
            if (v === undefined) { continue; }
            out[k] = String(v);
        }
    }
    for (const name of runtime?.clearEnv || []) { out[name] = null; }
    for (const [k, v] of Object.entries(runtime?.spawnEnv || {})) { out[k] = routeValue(k, v, k in out ? out[k] : opts?.windowEnv?.[k]); }
    return out;
}
