/**
 * X-418 — THE MECHANICAL HALF OF A MEDIA RECORD: every field the code already
 * knows about a file a run made, in the Admin form's own field names.
 *
 * The meaning half (name, topic, taxonomy, tone, SEO…) is X-419's; this fills
 * what needs no judgement — Provenans (model, prompt, seed…, origin), the run
 * as a batch, Başarı Statüsü for a failed or rejected file, the library stage
 * in workflow.stage, a pipeline_history line per event, the content
 * fingerprint, and which form sections that completes. Pure.
 */
import * as crypto from 'crypto';
import { LibraryStage, MediaRole } from './mediaLibrary';

type Dict = Record<string, unknown>;

/** The form's Köken options (App.jsx MEDIA_PROVENANCE_ORIGIN_OPTIONS). */
export type MediaOrigin = 'AI_generated' | 'uploaded' | 'external' | 'manual_creation' | 'manual_extraction' | 'user_submission' | 'imported';

export interface ProducedRun {
    id: string;
    name: string;
    startedAt?: number;
    stepIndex?: number;
    steps?: number;
    stepTitle?: string;
    taskId?: string;
    attempt?: number;
}

export interface Produced {
    stage: LibraryStage;
    role: MediaRole;
    origin: MediaOrigin;
    /** what made it, in a word: `fal`, `tool:split`, `input` */
    productionType?: string;
    model?: string;
    modelVersion?: string;
    prompt?: string;
    negativePrompt?: string;
    seed?: number;
    steps?: number;
    cfgScale?: number;
    /** the inputs it was made from — paths or URLs */
    sourceMaterial?: string[];
    costUsd?: number;
    run?: ProducedRun;
    /** 1-based position among the files its step made */
    sequence?: number;
    failure?: { reason: string; salvageable?: boolean; notes?: string };
    /** sha256 of the file's bytes, `sha256:<hex>` */
    fingerprint?: string;
}

export interface HistoryEntry { at: string; by: string; action: string; stage?: string; from?: string; to?: string; note?: string; cost_usd?: number }

export const BY = 'agent-farm';
const iso = (ms?: number): string => new Date(ms ?? Date.now()).toISOString();
const num = (n: unknown): number | undefined => typeof n === 'number' && Number.isFinite(n) ? n : undefined;

export const promptHash = (prompt: string): string =>
    crypto.createHash('sha256').update(String(prompt), 'utf8').digest('hex').slice(0, 16);

/** One human line for Orijinal Bağlam: where in which run this file was made. */
export function contextLine(p: Produced): string {
    const r = p.run;
    const parts = ['Agent Farm'];
    if (r) {
        parts.push(r.name || r.id);
        if (r.stepIndex !== undefined) { parts.push(`step ${r.stepIndex + 1}${r.steps ? '/' + r.steps : ''}${r.stepTitle ? ` "${r.stepTitle}"` : ''}`); }
        if (r.attempt) { parts.push(`attempt ${r.attempt + 1}`); }
        parts.push(`run ${r.id}`);
    }
    if (p.costUsd) { parts.push(`$${p.costUsd.toFixed(3)}`); }
    return parts.join(' · ');
}

/** The Başarı Statüsü of a failed or rejected file — kept, and said why. */
export function failureFields(f: Produced['failure']): Dict | undefined {
    if (!f) { return undefined; }
    return { is_failed: true, reason: String(f.reason || '').slice(0, 2000), salvageable: f.salvageable !== false, salvage_notes: f.notes ?? '' };
}

export interface RecordFields {
    status: string;
    provenance: Dict;
    failure?: Dict;
    extra: Dict;
}

/** Everything but the file core (buildMediaRecord reads that off the disk) — ready for saveMedia. */
export function producedFields(p: Produced, probed: Dict = {}, at = Date.now()): RecordFields {
    const provenance: Dict = {
        origin: p.origin,
        production_type: p.productionType ?? '',
        original_context: contextLine(p)
    };
    if (p.model) { provenance.model = p.model; }
    if (p.modelVersion) { provenance.model_version = p.modelVersion; }
    if (p.prompt) { provenance.generation_prompt = p.prompt.slice(0, 20_000); provenance.prompt_hash = promptHash(p.prompt); }
    if (p.negativePrompt) { provenance.negative_prompt = p.negativePrompt; }
    if (num(p.seed) !== undefined) { provenance.seed = p.seed; }
    if (num(p.steps) !== undefined) { provenance.steps = p.steps; }
    if (num(p.cfgScale) !== undefined) { provenance.cfg_scale = p.cfgScale; }
    if (p.sourceMaterial?.length) { provenance.source_material = p.sourceMaterial.join(' | ').slice(0, 4000); }

    const r = p.run;
    const failure = failureFields(p.failure);
    const history: HistoryEntry = {
        at: iso(at), by: BY, action: p.role === 'input' ? 'filed as a run input' : `produced (${p.role})`, stage: p.stage,
        ...(r?.stepTitle ? { note: r.stepTitle } : {}), ...(p.costUsd ? { cost_usd: p.costUsd } : {})
    };
    const extra: Dict = {
        ...probed,
        workflow: {
            stage: p.stage,
            last_action: history.action,
            last_modified: iso(at),
            iteration_count: (r?.attempt ?? 0) + 1,
            ...(p.role === 'rejected' ? { rejection_count: 1 } : {})
        },
        pipeline_history: [history],
        completed_sections: {
            media_core: true, provenance: true, workflow: true,
            ...(failure ? { failure: true } : {}),
            ...(probed.technical_quality ? { technical_quality: true } : {})
        }
    };
    if (r) {
        extra.batch = {
            batch_id: r.id, batch_name: r.name, batch_source: BY,
            batch_created: r.startedAt ? iso(r.startedAt) : '',
            ...(r.stepIndex !== undefined ? { sort_a: r.stepIndex + 1 } : {}),
            ...(r.steps ? { batch_size: r.steps } : {}),
            ...(p.sequence ? { batch_sequence: p.sequence } : {})
        };
    }
    if (p.fingerprint) { extra.fingerprint = p.fingerprint; }
    return { status: 'draft', provenance, ...(failure ? { failure } : {}), extra };
}

/** The in-place edit of a record whose file moved to another stage — applied to the CURRENT record. */
export function applyRestage(item: Dict, o: { file: string; stage: LibraryStage; from?: string; reason?: string; failure?: Produced['failure']; at?: number }): Dict {
    const media = (item.media ?? (item.media = {})) as Dict;
    const wf = (item.workflow ?? (item.workflow = {})) as Dict;
    const at = iso(o.at);
    const before = String(wf.stage || o.from || '');
    media.file_path = o.file.replace(/\\/g, '/');
    wf.stage = o.stage;
    wf.last_action = `moved to ${o.stage}${o.reason ? ' — ' + o.reason : ''}`;
    wf.last_modified = at;
    const f = failureFields(o.failure);
    if (f) {
        item.failure = { ...((item.failure as Dict) ?? {}), ...f };
        ((item.completed_sections ?? (item.completed_sections = {})) as Dict).failure = true;
        if (/not selected|rejected/i.test(o.failure?.reason ?? '')) { wf.rejection_count = Number(wf.rejection_count || 0) + 1; }
    }
    const hist = Array.isArray(item.pipeline_history) ? item.pipeline_history as unknown[] : [];
    hist.push({ at, by: BY, action: 'moved', from: before, to: o.stage, ...(o.reason ? { note: o.reason } : {}) } as HistoryEntry);
    item.pipeline_history = hist;
    return item;
}

/** Add `id` to one direction of a record's causal relation (the form's causes ↔ effects), once. */
export function addCausal(item: Dict, side: 'causes' | 'effects', ids: string[]): boolean {
    const rel = (item.relations && typeof item.relations === 'object' ? item.relations : (item.relations = {})) as Dict;
    const causal = (rel.causal && typeof rel.causal === 'object' ? rel.causal : (rel.causal = {})) as Dict;
    const list = Array.isArray(causal[side]) ? (causal[side] as string[]) : [];
    const add = ids.filter(i => i && !list.includes(i));
    if (!add.length) { return false; }
    causal[side] = [...list, ...add];
    return true;
}
