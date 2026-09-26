/**
 * X-419 — WHEN A RUN'S RECORDS GET THEIR MEANING: the plan (library.enrich.*)
 * rides on every ledger entry like the stage mapping does, so a FAIL, a
 * selection and the run's end — even after a window reload — all read it.
 *   record — an entry the moment it is in scope (filed final, failed, left out)
 *   end    — every in-scope entry once the run has ended, whatever its status
 *   never  — no plan is stamped at all
 * One model turn at a time; a record already enriched is never asked twice.
 */
import { EnrichPlan, EnrichSettings, inScope, resolveEnrich } from './enrichSpec';
import { EnrichOutcome, EnrichRequest } from './mediaEnricher';
import type { LedgerEntry } from './runLibrary';
import { LibrarySpec } from './runLibrarySpec';

export interface EnrichHook {
    enricher: { enrich(r: EnrichRequest): Promise<EnrichOutcome> };
    settings: () => EnrichSettings;
}

export interface EnrichedMark { at: number; filled: number; complete: string[]; missing: string[]; costUsd?: number; skipped?: string; error?: string }

export class RunEnrich {
    private chain: Promise<unknown> = Promise.resolve();

    constructor(private hook: EnrichHook, private save: () => void, private now: () => number = Date.now) { }

    /** The plan a workflow's files carry — undefined when it is never. */
    plan(w: { library?: LibrarySpec; goal?: string }): EnrichPlan | undefined {
        const p = resolveEnrich(w.library?.enrich, this.hook.settings(), w.goal).plan;
        return p.when === 'never' ? undefined : p;
    }

    /** An entry was filed or moved: at record timing, one now in scope is filled now. */
    touched(e: LedgerEntry): void {
        if (e.en?.when !== 'record' || e.enriched || !inScope(e.en.scope, e)) { return; }
        this.chain = this.chain.then(() => this.one(e)).catch(() => undefined);
    }

    /** The run ended: every in-scope entry not yet enriched, one after another. */
    async ended(ledger: LedgerEntry[]): Promise<string[]> {
        await this.chain;
        const lines: string[] = [];
        for (const e of ledger) {
            if (!e.en || e.enriched || !inScope(e.en.scope, e)) { continue; }
            const m = await this.one(e);
            lines.push(`Enrich: ${e.file} — ${m.error ? 'failed: ' + m.error : m.skipped ? 'skipped: ' + m.skipped : `${m.filled} field(s), complete ${m.complete.join(', ') || 'none'}${m.missing.length ? `, missing ${m.missing.join('; ')}` : ''}`}`);
        }
        return lines;
    }

    private async one(e: LedgerEntry): Promise<EnrichedMark> {
        let o: EnrichOutcome;
        try {
            o = await this.hook.enricher.enrich({ base: e.base, lang: e.lang, id: e.id, plan: e.en as EnrichPlan, autoStart: 'never' });
        } catch (err) {
            o = { filled: [], complete: [], missing: [], why: [], error: (err as Error).message.slice(0, 300) };
        }
        const m: EnrichedMark = {
            at: this.now(), filled: o.filled.length, complete: o.complete, missing: o.missing.map(x => `${x.section} (${x.why})`),
            ...(o.costUsd ? { costUsd: o.costUsd } : {}), ...(o.skipped ? { skipped: o.skipped } : {}), ...(o.error ? { error: o.error } : {})
        };
        e.enriched = m;
        this.save();
        return m;
    }
}
