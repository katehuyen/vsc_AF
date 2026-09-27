import { AgentInfo } from './agents';
import { BridgeRegistry, need, optNum, optStr } from './bridge';
import {
    brandPaths, brandProductionFor, brandRefusal, BRAND_LOGO, BRAND_TEXT, CHARACTER_FIELDS,
    patchBrand, resolveBrand
} from './brandKit';
import { DiscoveredProduction, discoverProductions, writeProduction } from './production';

/**
 * M-50 — the brand kit on the bridge: read a production's kit, or what one
 * step of a workflow will actually read (with each field's origin); change a
 * kit field by field. The same core functions the Studio card calls.
 */
export interface BrandBridgeDeps {
    getAgents(): AgentInfo[];
    /** a workflow by id or title, for "what does this step read" */
    workflow?(ref: string): { production?: string; steps: { title: string; media?: { projectId?: string }; brand?: unknown }[] } | undefined;
    refresh?(): void;
}

export const BRAND_FIELDS_DOC = `${BRAND_TEXT.join(', ')}, logo (${BRAND_LOGO.join('|')}), character {<key>: {${CHARACTER_FIELDS.join(', ')}}}`;

export function findProductionIn(all: DiscoveredProduction[], ref: string): DiscoveredProduction | undefined {
    return all.find(x => x.production.id === ref)
        ?? all.find(x => x.production.title.toLowerCase() === ref.toLowerCase());
}

/** A workflow's production as a caller named it (id or title) → its id; '' clears it; refused by name when unknown. */
export function productionRef(agents: AgentInfo[], ref: unknown): { id?: string; error?: string } {
    if (ref === undefined) { return {}; }
    const s = String(ref ?? '').trim();
    if (!s) { return { id: '' }; }
    const p = findProductionIn(discoverProductions(agents), s);
    return p ? { id: p.production.id } : { error: `no production "${s}" — studio.productions lists what exists` };
}

export function registerBrandOps(bridge: BridgeRegistry, deps: BrandBridgeDeps): void {
    const production = (ref: string): DiscoveredProduction => {
        const p = findProductionIn(discoverProductions(deps.getAgents()), ref);
        need(p, `No production "${ref}" — studio.productions lists what exists.`);
        return p as DiscoveredProduction;
    };
    bridge.register([
        {
            op: 'studio.brand.get',
            describe: `A production's BRAND KIT (M-50) — what steps read as {brand.<path>}, e.g. {brand.style}, {brand.character.ana.ref}. Fields: ${BRAND_FIELDS_DOC}. args: production (id or title) — its kit as stored in its production.json; OR workflow (id or title) + step? (1-based) — the kit THAT step reads: the production (a media step's own media.projectId, else the workflow's production) with the step's own brand fields over it, and origin per field (production | step). A kit field the kit does not set reads empty; with no kit at all a {brand.*} placeholder stays as written.`,
            handler: (args) => {
                const wref = optStr(args, 'workflow');
                if (!wref) {
                    need(optStr(args, 'production'), 'production (id or title) or workflow is required.');
                    const p = production(optStr(args, 'production'));
                    return { production: p.production.id, title: p.production.title, file: p.file, brand: p.production.brand ?? {}, paths: brandPaths(p.production.brand) };
                }
                const w = deps.workflow?.(wref);
                need(w, `No workflow "${wref}" — workflows.list shows current ones.`);
                const wf = w as NonNullable<typeof w>;
                const at = optNum(args, 'step', 1);
                need(Number.isInteger(at) && at >= 1 && at <= wf.steps.length, `step must be 1..${wf.steps.length}.`);
                const step = wf.steps[at - 1];
                const id = brandProductionFor(wf, step);
                const p = id ? findProductionIn(discoverProductions(deps.getAgents()), id) : undefined;
                const r = resolveBrand(p?.production.brand, patchBrand(undefined, (step.brand ?? {}) as Record<string, unknown>), id);
                return {
                    step: at, title: step.title, production: id ?? '', productionTitle: p?.production.title ?? '',
                    ...(id && !p ? { warning: `production "${id}" was not found — the step reads its own fields only` } : {}),
                    brand: r.kit, origin: r.origin
                };
            }
        },
        {
            op: 'studio.brand.set',
            describe: `Change a production's BRAND KIT (M-50), written into its production.json. args: production (id or title), brand (object; fields: ${BRAND_FIELDS_DOC}) — field by field: a given field replaces that field, "" or null removes it, a character given as null is removed whole and one given as an object changes only the fields it names; replace? (true = the kit becomes exactly brand). Refused by name: an unknown field, a logo outside ${BRAND_LOGO.join('|')}, a character key that is not a letter then letters/digits/_/-.`,
            handler: (args) => {
                const p = production(optStr(args, 'production'));
                const raw = args.brand;
                need(raw && typeof raw === 'object' && !Array.isArray(raw), 'brand is required — an object of kit fields.');
                const no = brandRefusal(raw);
                need(!no, `${no}.`);
                const kit = patchBrand(args.replace === true ? undefined : p.production.brand, raw as Record<string, unknown>);
                const next = { ...p.production };
                if (kit) { next.brand = kit; } else { delete next.brand; }
                writeProduction(p.file, next);
                deps.refresh?.();
                return { production: p.production.id, file: p.file, brand: kit ?? {}, paths: brandPaths(kit) };
            }
        }
    ]);
}
