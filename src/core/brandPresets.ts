/**
 * M-50 — a brand kit kept as a PRESET: one entry of the preset library
 * (`agentFarm.flexPresets`, the one Economy · Balanced · Quality live in), in
 * the family `brand`, its values the `brand.<field>` flex points. Applying one
 * to a production copies its values into that production's own
 * production.json — the kit a production reads is always its own.
 */
import { BrandKit, cleanBrand } from './brandKit';
import { FlexPreset } from './flexPresets';

export const BRAND_FAMILY = 'brand';

/** A kit as preset values: `brand.<field>` → its value; the characters as one object. */
export function brandPresetValues(kit: BrandKit): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(kit)) { out['brand.' + k] = v; }
    return out;
}

/** The kit a preset holds; undefined when it holds none. */
export function kitFromPreset(p: FlexPreset | undefined): BrandKit | undefined {
    if (!p) { return undefined; }
    const raw: Record<string, unknown> = {};
    for (const [id, v] of Object.entries(p.values)) {
        if (id.startsWith('brand.')) { raw[id.slice('brand.'.length)] = v; }
    }
    return cleanBrand(raw);
}

/** The brand kits among a list of presets. */
export const brandPresetsIn = (list: FlexPreset[]): FlexPreset[] =>
    list.filter(p => p.family === BRAND_FAMILY && !!kitFromPreset(p));

/** A production's kit as a preset to save. */
export function brandPreset(kit: BrandKit, name: string, productionTitle: string, scope?: { project?: string }): FlexPreset {
    return {
        name: name.trim(), values: brandPresetValues(kit), family: BRAND_FAMILY,
        describe: `Brand kit, saved from ${productionTitle}`,
        ...(scope?.project ? { scope: 'project' as const, project: scope.project } : { scope: 'global' as const })
    };
}
