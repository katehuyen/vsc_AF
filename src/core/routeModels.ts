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
 */
export function routedModel(
    model: string | undefined, rt: { spawnEnv?: Record<string, string> } | undefined
): string {
    const m = String(model ?? '').trim();
    const env = rt?.spawnEnv;
    if (!m || !env?.ANTHROPIC_BASE_URL) { return m; }
    const anthropic = /^claude-/i.test(m) || /^(opus|sonnet|haiku|fable)(\[1m\])?$/i.test(m);
    if (!anthropic) { return m; }
    const fam = /(opus|sonnet|haiku|fable)/i.exec(m)?.[1].toLowerCase() ?? '';
    return fam && env[TIER_ENV[fam]] ? fam : '';
}
