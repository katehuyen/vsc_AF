/**
 * X-419 — ONE RECORD ENRICHED: the file looked at by the engine that can open
 * it, the answer checked field by field, written on the CURRENT record with
 * the engine's version check (a person's edit in the Admin panel meanwhile is
 * kept, never overwritten). The run's hooks (src/core/runLibrary.ts) and the
 * bridge (media.enrich) share this one path.
 */
import * as fs from 'fs';
import * as path from 'path';
import { EnrichPlan } from './enrichSpec';
import { EnrichContext, applyEnrich, enrichModality, enrichPrompt, parseEnrich, sectionsFor } from './mediaEnrich';
import { AutoStart, EngineLike } from './mediaRecorder';
import { BY } from './mediaRecordFields';
import { OneShotResult, OneShotWant, oneShotEnvelope } from './oneShot';
import { sanitizePrompt } from './util';

type Dict = Record<string, unknown>;

export interface EnricherDeps {
    ready: (base: string, policy: AutoStart) => Promise<EngineLike | { down: string }>;
    exec: (want: OneShotWant & { cwd: string; timeoutMs?: number }) => Promise<OneShotResult>;
    now?: () => number;
}

export interface EnrichRequest {
    base: string;
    lang?: string;
    id?: string;
    file?: string;
    plan: Pick<EnrichPlan, 'model' | 'videoModel' | 'effort' | 'sections' | 'capUsd'> & { brief?: string };
    autoStart?: AutoStart;
}

export interface EnrichOutcome {
    id?: string; file?: string; engine?: string; model?: string;
    filled: string[]; complete: string[]; missing: { section: string; why: string }[];
    costUsd?: number; skipped?: string; error?: string; why: string[];
}

const norm = (p: string): string => path.resolve(String(p || '')).toLowerCase();
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export class MediaEnricher {
    constructor(private d: EnricherDeps) { }

    private now(): number { return (this.d.now ?? Date.now)(); }

    async enrich(r: EnrichRequest): Promise<EnrichOutcome> {
        const out: EnrichOutcome = { filled: [], complete: [], missing: [], why: [] };
        const lang = r.lang || 'TR';
        const c = await this.d.ready(r.base, r.autoStart ?? 'never');
        if ('down' in c) { return { ...out, error: `the ${r.base} engine is not answering — ${c.down}` }; }
        let id = r.id;
        if (!id && r.file) {
            const want = norm(r.file);
            id = str((await c.listItems('media', lang)).find(it => norm(str(((it.media ?? {}) as Dict).file_path)) === want)?.id) || undefined;
            if (!id) { return { ...out, file: r.file, error: `no record in ${r.base}/${lang} has the file ${path.basename(r.file)}` }; }
        }
        if (!id) { return { ...out, error: 'say which record: id or file' }; }
        const cur = await c.getRecord('media', id, lang);
        const item = (cur.item ?? {}) as Dict;
        const file = str(((item.media ?? {}) as Dict).file_path).replace(/\//g, path.sep) || r.file || '';
        Object.assign(out, { id, file });
        const route = enrichModality(file);
        if (!route.engine) { return { ...out, skipped: route.why }; }
        if (!fs.existsSync(file)) { return { ...out, error: `the file is not there any more: ${file}` }; }
        const secs = sectionsFor(item, r.plan.sections);
        if (!secs.length) { return { ...out, skipped: 'nothing left blank to fill' }; }
        const engine = route.engine;
        const model = engine === 'claude' ? r.plan.model : r.plan.videoModel;
        const prov = (item.provenance ?? {}) as Dict, batch = (item.batch ?? {}) as Dict;
        const ctx: EnrichContext = { lang, prompt: str(prov.generation_prompt), brief: r.plan.brief, run: [str(batch.batch_name), str(((item.workflow ?? {}) as Dict).last_action)].filter(Boolean).join(' — ') };
        const cap = engine === 'claude' && r.plan.capUsd > 0 ? r.plan.capUsd : 0;
        out.why.push(`engine ${engine} (${route.modality}) · model ${model}${engine === 'claude' ? ` · effort ${r.plan.effort}` : ''}`,
            r.plan.capUsd > 0 ? (cap ? `cap $${cap} per record (the engine stops the turn there)` : 'cap not enforced — agy reports no cost') : 'no cap',
            `sections: ${secs.map(s => s.id).join(', ')}`);
        const res = await this.d.exec({
            cwd: path.dirname(file), engine, model, prompt: sanitizePrompt(enrichPrompt(item, file, secs, ctx, engine)), timeoutMs: 300_000,
            ...(engine === 'claude' ? { json: true, effort: r.plan.effort } : { readOnly: true }),
            ...(cap ? { args: `--max-budget-usd ${cap}` } : {})
        });
        const env = engine === 'claude' ? oneShotEnvelope('claude', res.out) : null;
        const text = env ? env.result : res.out;
        if (env?.costUSD) { out.costUsd = Math.round(env.costUSD * 10000) / 10000; }
        if (env?.subtype === 'error_max_budget_usd') { return { ...out, engine, model, error: `the $${cap} cap stopped the turn before it answered — nothing written (a claude turn's own start costs about $0.02)` }; }
        if ((res.error && !text) || env?.isError) { return { ...out, engine, model, error: `the ${engine} turn failed — ${(res.error || env?.subtype || res.stderr || '').slice(0, 200)}` }; }
        const p = parseEnrich(text, item, secs);
        Object.assign(out, { engine, model, complete: p.complete, missing: p.missing });
        if (p.dropped.length) { out.why.push(`refused values: ${p.dropped.slice(0, 8).join('; ')}`); }
        if (p.error) { return { ...out, error: p.error }; }
        const at = new Date(this.now()).toISOString();
        for (let i = 0; ; i++) {
            const now = i ? await c.getRecord('media', id, lang) : cur;
            const it = (now.item ?? {}) as Dict;
            out.filled = applyEnrich(it, p, { at, by: BY, model: `${engine}/${model}`, costUsd: out.costUsd });
            try {
                await c.updateRecord('media', id, { item: it, expectedVersion: typeof now.version === 'number' ? now.version : undefined, backup: true }, lang);
                return out;
            } catch (e) {
                if (i > 0 || !/version|409/i.test(String(e))) { return { ...out, filled: [], error: `the record could not be written — ${(e as Error).message.slice(0, 200)}` }; }
            }
        }
    }
}
