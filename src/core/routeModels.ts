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
