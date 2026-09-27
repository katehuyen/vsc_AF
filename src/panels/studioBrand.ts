import { AgentInfo } from '../core/agents';
import { saveBrandPreset, setProductionBrand } from '../core/brandBridge';
import { brandPresetsIn, kitFromPreset } from '../core/brandPresets';
import { FlexDeps, userPresets } from '../core/flexActions';
import { DiscoveredProduction } from '../core/production';

/**
 * M-50 — the Studio's Brand kits block: what the page draws (every production's
 * kit, the brand presets) and what its buttons write. Each act is the bridge
 * op's own function (studio.brand.set / studio.brand.save); taking a kept kit
 * only fills the page's editor, so nothing is written until Save.
 */
export function studioBrandData(found: DiscoveredProduction[], flex?: FlexDeps) {
    return {
        brands: found.map(p => ({ id: p.production.id, title: p.production.title, brand: p.production.brand ?? {} })),
        brandPresets: flex ? brandPresetsIn(userPresets(flex)).map(p => ({ name: p.name, describe: p.describe ?? '', brand: kitFromPreset(p) })) : []
    };
}

/** Handles a brand message; returns the sentence to show on a refusal, '' when done, undefined when not ours. */
export async function studioBrandMessage(
    msg: { type: string; [k: string]: unknown }, agents: AgentInfo[], flex?: FlexDeps
): Promise<string | undefined> {
    const str = (k: string) => (typeof msg[k] === 'string' ? (msg[k] as string).trim() : '');
    try {
        switch (msg.type) {
            case 'brand:set':
                setProductionBrand(agents, str('production'), msg.brand, true);
                return '';
            case 'brand:save':
                if (!flex) { return 'Presets are not reachable here.'; }
                await saveBrandPreset(agents, flex, str('production'), str('name'));
                return '';
            default:
                return undefined;
        }
    } catch (e) {
        return (e as Error).message;
    }
}
