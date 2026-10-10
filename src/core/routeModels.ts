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
 * X-522 — the route's context window, told to Claude Code. Measured in the 2.1.295 binary: for a model it does not
 * know as a Claude model, CLAUDE_CODE_MAX_CONTEXT_TOKENS IS the window, and it silences the 200K notice. Re-measure
 * the name in the binary when the CLI changes. Nothing when the route states none: an inherited value is left alone.
 */
export function routeContextEnv(context: number | undefined): Record<string, string> {
    const n = Math.floor(Number(context) || 0);
    return n > 0 ? { CLAUDE_CODE_MAX_CONTEXT_TOKENS: String(n) } : {};
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
    model: string | undefined,
    rt: { spawnEnv?: Record<string, string>; modelRule?: { refs: string[]; defaultRef: string } } | undefined,
    opts: { live?: boolean } = {}
): string {
    const m = String(model ?? '').trim();
    // X-517 — on a lent route the model sent is always one of the route's: the one asked when it is, else its default.
    if (rt?.modelRule) { return rt.modelRule.refs.includes(m) ? m : rt.modelRule.defaultRef; }
    const env = rt?.spawnEnv;
    // An ALIAS there is the route's default (routeDefaultEnv), not a picked tier: a model sent still wins over it.
    if (m && !opts.live && env?.ANTHROPIC_MODEL && !ROUTE_TIERS.includes(env.ANTHROPIC_MODEL)) { return ''; }
    if (!m || !env?.ANTHROPIC_BASE_URL) { return m; }
    const anthropic = /^claude-/i.test(m) || /^(opus|sonnet|haiku|fable)(\[1m\])?$/i.test(m);
    if (!anthropic) { return m; }
    const fam = /(opus|sonnet|haiku|fable)/i.exec(m)?.[1].toLowerCase() ?? '';
    return fam && env[TIER_ENV[fam]] ? fam : '';
}

/**
 * ‼️ X-496 — WITH NO TIER PICKED, A THIRD-PARTY ROUTE STILL ANSWERS WITH ONE OF
 * ITS OWN TIERS. Measured (Claude Code 2.1.280, local fake endpoint): with no
 * --model and no ANTHROPIC_MODEL the CLI falls back to a settings.json /
 * settings.local.json `model` and sends a full Anthropic id there raw, and sends
 * its own default raw when the route maps no opus — both refused by the route.
 * So the first tier the route maps (ROUTE_TIERS order) is named by its ALIAS:
 * the CLI ranks ANTHROPIC_MODEL above the settings files and below --model, and
 * resolves the alias through the route's own mapping — a model this launch does
 * send still wins (routedModel), and nothing on disk reaches the route raw.
 */
export function routeDefaultTier(baseUrl: string | undefined, tiers: Record<string, string> | undefined): string {
    return baseUrl ? (ROUTE_TIERS.find(n => tiers?.[n]) ?? '') : '';
}

/** One model a route serves, and the tiers it is written into. */
export interface RouteModel {
    model: string;
    tiers: string[];
}

/**
 * ‼️ A ROUTE'S MODELS, READ OFF ITS TIERS — the one list every engine is given.
 * Each model once, in ROUTE_TIERS order and then the other tiers as stored; the
 * first is the route's default, by the same rule as `routeDefaultTier`. Two
 * tiers may name two different models: nothing here folds them into one.
 */
export function routeModelList(tiers: Record<string, string> | undefined): RouteModel[] {
    const all = Object.entries(tiers ?? {}).filter(([, m]) => String(m ?? '').trim());
    const order = [
        ...ROUTE_TIERS.filter(n => all.some(([t]) => t === n)),
        ...all.map(([t]) => t).filter(t => !ROUTE_TIERS.includes(t))
    ];
    const out: RouteModel[] = [];
    for (const tier of order) {
        const model = String(tiers![tier]).trim();
        const hit = out.find(m => m.model === model);
        if (hit) { hit.tiers.push(tier); } else { out.push({ model, tiers: [tier] }); }
    }
    return out;
}

/**
 * ‼️ CAN THIS ROUTE BE LENT TO OPENCODE — one predicate, asked by the store's
 * refusal, by the launch and by every picker: it is marked for OpenCode, it has
 * an address OpenCode can reach, and it serves at least one model.
 */
export function lendableToOpenCode(p: {
    engines?: readonly string[]; baseUrl?: string; opencodeUrl?: string; tiers?: Record<string, string>;
}): boolean {
    return !!p.engines?.includes('opencode')
        && !!(String(p.opencodeUrl ?? '').trim() || String(p.baseUrl ?? '').trim())
        && routeModelList(p.tiers).length > 0;
}

export function routeDefaultEnv(baseUrl: string | undefined, tiers: Record<string, string> | undefined): Record<string, string> {
    const alias = routeDefaultTier(baseUrl, tiers);
    return alias ? { ANTHROPIC_MODEL: alias } : {};
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
