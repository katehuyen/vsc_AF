/**
 * U-229 — the values a Farm Settings picker offers, by source name (the page's DATA.valueSources). The catalog's
 * control names the source (src/core/settingsCatalog); a chips control names it with `from`. Read on every draw:
 * an agent, a secret or a database added since the page opened is in the list the next time it is drawn.
 * A model or an effort is not here: those are the engine's own lists (DATA.engineModels).
 */
import { ENGINE_IDS } from './engines';
import { LIBRARY_STAGES } from './mediaLibrary';
import { ENRICH_SECTION_IDS } from './mediaEnrich';

export interface SettingSourceDeps {
    agentNames?(): string[];
    /** the Secrets vault's names — never a value */
    secretNames?(): string[];
    /** the local Airtable databases (engine instances) this machine has */
    airtableBases?(): string[];
}

export function settingValueSources(d: SettingSourceDeps): Record<string, string[]> {
    return {
        agent: d.agentNames?.() ?? [],
        secret: d.secretNames?.() ?? [],
        airtableBase: d.airtableBases?.() ?? [],
        engine: [...ENGINE_IDS],
        stage: [...LIBRARY_STAGES],
        enrichSection: [...ENRICH_SECTION_IDS]
    };
}
