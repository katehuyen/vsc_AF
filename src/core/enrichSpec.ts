/**
 * X-419 — WHEN AND HOW A RUN'S RECORDS GET THEIR MEANING FILLED.
 *
 * Every field is a flex point `library.enrich.*` (media/afFlex.js): the Farm
 * setting is the fleet level, the workflow form's Library block the production
 * level. Built-in (user's decision 2026-09-26): at the end of the run, the
 * final and the failed files, images on sonnet at low effort, video on agy's
 * gemini-3.8-flash-low (the M-42 measured route), every section, no cap. Pure.
 */
import { resolveFlex } from './flexResolve';
import { ENRICH_SECTION_IDS } from './mediaEnrich';
import { LibraryStage, MediaRole } from './mediaLibrary';

export const ENRICH_WHEN = ['end', 'record', 'never'] as const;
export type EnrichWhen = typeof ENRICH_WHEN[number];
export const ENRICH_SCOPES = ['final-failed', 'final', 'all'] as const;
export type EnrichScope = typeof ENRICH_SCOPES[number];

export interface EnrichSpec { when?: EnrichWhen; scope?: EnrichScope; model?: string; videoModel?: string; effort?: string; sections?: string; cap?: number | string }
export type EnrichSettings = Partial<Record<keyof EnrichSpec, unknown>>;

/** What a run carries on each ledger entry once enrichment is on. */
export interface EnrichPlan { when: EnrichWhen; scope: EnrichScope; model: string; videoModel: string; effort: string; sections: string[]; capUsd: number; brief?: string }

const KEYS: (keyof EnrichSpec)[] = ['when', 'scope', 'model', 'videoModel', 'effort', 'sections', 'cap'];
const DRAFT: Record<keyof EnrichSpec, string> = { when: 'libEnWhen', scope: 'libEnScope', model: 'libEnModel', videoModel: 'libEnVideo', effort: 'libEnEffort', sections: 'libEnSections', cap: 'libEnCap' };
export const ENRICH_DRAFT_KEYS = KEYS.map(k => DRAFT[k]);
const MODEL = /^[\w.\-:[\]]{1,80}$/;

export const splitSections = (v: unknown): string[] => String(v ?? '').split(/[\s,]+/).map(s => s.trim()).filter(Boolean);

/** Why this `library.enrich` cannot be saved — '' when it can. */
export function enrichRefusal(v: unknown): string {
    if (v === undefined || v === null || v === '') { return ''; }
    if (typeof v !== 'object' || Array.isArray(v)) { return `library.enrich is an object: {${KEYS.join(', ')}}`; }
    const o = v as Record<string, unknown>;
    const extra = Object.keys(o).filter(k => !(KEYS as string[]).includes(k));
    if (extra.length) { return `library.enrich has no ${extra.join(', ')} — ${KEYS.join(', ')}`; }
    const has = (k: string) => o[k] !== undefined && o[k] !== '';
    if (has('when') && !(ENRICH_WHEN as readonly string[]).includes(String(o.when))) { return `library.enrich.when is ${ENRICH_WHEN.join(' | ')}`; }
    if (has('scope') && !(ENRICH_SCOPES as readonly string[]).includes(String(o.scope))) { return `library.enrich.scope is ${ENRICH_SCOPES.join(' | ')}`; }
    for (const k of ['model', 'videoModel', 'effort']) { if (has(k) && !MODEL.test(String(o[k]))) { return `library.enrich.${k} "${String(o[k]).slice(0, 40)}" is not a plain name`; } }
    if (has('sections')) {
        const bad = splitSections(o.sections).filter(s => !ENRICH_SECTION_IDS.includes(s));
        if (bad.length) { return `library.enrich.sections has no ${bad.join(', ')} — ${ENRICH_SECTION_IDS.join(', ')}`; }
    }
    if (has('cap') && !(Number(o.cap) >= 0 && Number(o.cap) <= 50)) { return 'library.enrich.cap is dollars per record, 0 (none) to 50'; }
    return '';
}

export function enrichSeed(v: EnrichSpec | undefined): Record<string, string> {
    return Object.fromEntries(KEYS.map(k => [DRAFT[k], String(v?.[k] ?? '')]));
}

export function enrichFromDraft(raw: Record<string, unknown>): EnrichSpec | undefined {
    const out: Record<string, string> = {};
    for (const k of KEYS) { const s = String(raw[DRAFT[k]] ?? '').trim(); if (s) { out[k] = s; } }
    return Object.keys(out).length ? out as EnrichSpec : undefined;
}

/** The plan a run's files get: workflow over the Farm setting over the built-in, each said. */
export function resolveEnrich(w: EnrichSpec | undefined, settings: EnrichSettings = {}, brief?: string): { plan: EnrichPlan; why: string[] } {
    const r = (k: keyof EnrichSpec) => resolveFlex('library.enrich.' + k, {
        ...(settings[k] !== undefined && settings[k] !== '' ? { settings: settings[k] } : {}),
        ...(w?.[k] !== undefined && w[k] !== '' ? { workflow: w[k] } : {})
    });
    const v = Object.fromEntries(KEYS.map(k => [k, r(k)])) as Record<keyof EnrichSpec, ReturnType<typeof resolveFlex>>;
    const plan: EnrichPlan = {
        when: String(v.when.value || 'end') as EnrichWhen, scope: String(v.scope.value || 'final-failed') as EnrichScope,
        model: String(v.model.value || 'sonnet'), videoModel: String(v.videoModel.value || 'gemini-3.8-flash-low'),
        effort: String(v.effort.value || 'low'), sections: splitSections(v.sections.value), capUsd: Math.max(0, Number(v.cap.value) || 0),
        ...(brief ? { brief: brief.slice(0, 600) } : {})
    };
    return { plan, why: KEYS.map(k => `enrich.${k}: ${v[k].sentence}`) };
}

/** Is this file one the plan fills — by where it ended up, or by what happened to it. */
export function inScope(scope: EnrichScope, e: { stage: LibraryStage; role?: MediaRole; id?: string; unrecorded?: boolean }): boolean {
    if (!e.id || e.unrecorded) { return false; }
    const fin = e.stage === 'final' || e.stage === 'asset';
    if (scope === 'all') { return true; }
    if (scope === 'final') { return fin; }
    return fin || e.role === 'failed' || e.role === 'rejected';
}
