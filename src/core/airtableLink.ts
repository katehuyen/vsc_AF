import * as path from 'path';
import { MediaMeta } from './media';
import { newAirtableRegistry, airtableAutoRecord } from './airtableConfig';
import { EngineRegistry, Instance } from '../mcp/airtable/engine';

/**
 * Deep integration: Agent Farm's own media capture (the ingest watcher and the
 * "Register Asset" command) also records into the user's Airtable engine — the
 * two media systems become one. Records are created as DRAFTS referencing the
 * file in place (never moved). Meaningful enrichment (topic/tags/provenance) is
 * left to an agent, on demand — this link never spawns one (cost discipline).
 *
 * Everything here is best-effort and non-throwing: a down engine or a missing
 * instance must never break AF's own ingest/gallery flow.
 */

export interface LinkResult { instance?: string; saved: string[]; skipped: string[]; errors: string[]; }

const msg = (e: unknown): string => String((e as Error)?.message ?? e).slice(0, 200);

function provenanceFromMeta(meta?: MediaMeta): Record<string, unknown> | undefined {
    if (!meta?.model) { return undefined; } // only fal-generated metas carry a model
    return {
        model: meta.model,
        origin: 'ai_generated',
        generation_prompt: String(meta.input ?? '').slice(0, 1000),
        production_type: meta.workflowTitle ?? '',
    };
}

/** Record a batch of (file, meta?) pairs into the default instance. */
export async function recordAssetsInEngine(items: { file: string; meta?: MediaMeta }[]): Promise<LinkResult> {
    const res: LinkResult = { saved: [], skipped: [], errors: [] };
    if (!items.length) { return res; }
    const registry: EngineRegistry = newAirtableRegistry();
    let inst: Instance;
    try { inst = await registry.resolveInstance(); }
    catch (e) { res.errors.push('no instance: ' + msg(e)); return res; }
    if (inst.live === false) { res.errors.push(`instance '${inst.name}' is offline`); return res; }
    res.instance = inst.name;

    for (const { file, meta } of items) {
        try {
            const out = await registry.mediaSave(inst.name, {
                file_path: file,
                topic: meta?.title || undefined,
                content: meta?.title || undefined,
                status: 'draft',
                skip_if_exists: true,
                provenance: provenanceFromMeta(meta),
            }) as { id: string; skipped?: string };
            if (out.skipped) { res.skipped.push(out.id); } else { res.saved.push(out.id); }
        } catch (e) { res.errors.push(path.basename(file) + ': ' + msg(e)); }
    }
    return res;
}

/** Fired from the ingest watcher's onRegistered — no-op unless autoRecord is on. */
export async function autoRecordMetas(metas: MediaMeta[]): Promise<LinkResult | null> {
    if (!airtableAutoRecord() || !metas.length) { return null; }
    const items: { file: string; meta?: MediaMeta }[] = [];
    for (const m of metas) {
        for (const f of m.assetFiles ?? []) { items.push({ file: f, meta: m }); }
    }
    return recordAssetsInEngine(items);
}
