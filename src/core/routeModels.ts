/**
 * X-491 — A ROUTE'S TIERS AS THE CLI'S OWN MODEL ALIASES.
 *
 * Only ANTHROPIC_MODEL was written, so a background haiku call or a /model
 * switch asked the third party for an Anthropic model id. Claude Code reads one
 * variable per alias (measured in the shipped binary); every tier the route maps
 * answers for its alias too, and the small-fast model follows haiku.
 */
const TIER_ENV: Record<string, string> = {
    opus: 'ANTHROPIC_DEFAULT_OPUS_MODEL',
    sonnet: 'ANTHROPIC_DEFAULT_SONNET_MODEL',
    haiku: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    fable: 'ANTHROPIC_DEFAULT_FABLE_MODEL'
};

/** The tiers the CLI has an alias for — the boxes a route form offers one each. */
export const ROUTE_TIERS: readonly string[] = Object.keys(TIER_ENV);

export function routeModelEnv(tiers: Record<string, string> | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [name, model] of Object.entries(tiers ?? {})) {
        const env = TIER_ENV[name];
        if (env && model) { out[env] = model; }
    }
    if (out.ANTHROPIC_DEFAULT_HAIKU_MODEL) { out.ANTHROPIC_SMALL_FAST_MODEL = out.ANTHROPIC_DEFAULT_HAIKU_MODEL; }
    return out;
}

/**
 * ‼️ X-495 — ON A THIRD-PARTY ROUTE, AN ANTHROPIC MODEL IS ASKED FOR BY ITS ALIAS.
 *
 * `--model claude-opus-5-5` reaches the route as that literal id, which no third
 * party serves; `--model opus` reaches it through the route's own mapping above.
 * So an Anthropic id or alias becomes its family's alias when the route maps
 * that family, and is dropped when it does not (the route's default answers
 * rather than a model it cannot serve). Any other id — the route's own — passes
 * untouched, and so does everything on a run that is not routed elsewhere.
 * `rt` is the runtime the spawn's environment is built from.
 *
 * ‼️ X-493 — AT A SPAWN, THE TIER PICKED ON THE ROUTE IS THE ONE ANSWER. The CLI
 * ranks `--model` above ANTHROPIC_MODEL (measured in the shipped binary), so a
 * model left over from an agent default or the last launch silently overrode
 * the tier a person picked for this route. A live switch (`live`) is a person
 * choosing the model now, so there the model is still asked for. Only a route
 * writes ANTHROPIC_MODEL into `spawnEnv`, so this holds on a route with no base
 * URL of its own too — the surfaces fold the Model box into the tier on both.
 */
export function routedModel(
    model: string | undefined, rt: { spawnEnv?: Record<string, string> } | undefined,
    opts: { live?: boolean } = {}
): string {
    const m = String(model ?? '').trim();
    const env = rt?.spawnEnv;
    if (m && !opts.live && env?.ANTHROPIC_MODEL) { return ''; }
    if (!m || !env?.ANTHROPIC_BASE_URL) { return m; }
    const anthropic = /^claude-/i.test(m) || /^(opus|sonnet|haiku|fable)(\[1m\])?$/i.test(m);
    if (!anthropic) { return m; }
    const fam = /(opus|sonnet|haiku|fable)/i.exec(m)?.[1].toLowerCase() ?? '';
    return fam && env[TIER_ENV[fam]] ? fam : '';
}

/**
 * ‼️ X-493 — ON A ROUTE WITH ITS OWN BASE URL THE ROUTE DECIDES THE MODEL, so a
 * surface draws no Anthropic Model box there (routedModel never sends one the
 * route does not map); this is the sentence that stands in its place. Undefined
 * where that box still means something: no route, or a route with no base URL —
 * Anthropic's own endpoint, which serves the model it is asked for.
 */
export function routeModelNote(
    route: { label: string; baseUrl?: string; tiers: readonly string[] } | undefined
): string | undefined {
    if (!route?.baseUrl) { return undefined; }
    return route.tiers.length
        ? `${route.label} decides the model: pick one of its tiers. Anthropic's own model list does not apply here.`
        : `${route.label} maps no tiers, so there is no model to choose here — the route answers with what it serves `
            + 'for whatever Claude Code asks. Give it tiers (Providers page, Edit) to choose one.';
}
