/**
 * X-425 — THE STUDIO WRITES TO THE LIBRARY: what a person decides on a card of
 * the wall (select, reject, tags, score, note) is written onto that file's
 * Airtable record; a promotion moves the file and its record together
 * (media.restage — mediaRecorder.restage, not here).
 *
 * ‼️ THE ENGINE'S VERSION WINS. An edit is written only onto the version the
 * card showed: if the record changed since (an edit in the Admin panel), nothing
 * is written — the answer says so, the wall is read again, and the person does
 * it once more on what is there now. A panel edit is never overwritten.
 *
 * Where each decision lands, in the record's own schema:
 *   select / reject → workflow.approval_chain (+ a Studio rejection clears on select);
 *                     reject → failure {is_failed, reason, salvageable} + workflow.rejection_count
 *   tags            → tags
 *   score           → technical_quality.human_quality_score (0–1, the Admin form's scale)
 *   note            → moderation.notes (+ reviewed_by, last_reviewed_at) — the review note,
 *                     never `content`, which is the file's own description
 * Every write adds a pipeline_history line and stamps workflow.last_action.
 */
type Dict = Record<string, unknown>;

export const STUDIO_EDITS = ['select', 'reject', 'tags', 'score', 'note'] as const;
export type StudioEditKind = typeof STUDIO_EDITS[number];
export const STUDIO_BY = 'user (Studio)';
const STUDIO_REJECT = 'rejected in Studio';

export interface StudioEdit {
    kind: StudioEditKind;
    /** tags: string[] (or a comma list) · score: 0–1 (a percent 1–100 is read as one) · note: text */
    value?: unknown;
    /** reject: why (default "rejected in Studio") */
    reason?: string;
}

export interface StudioEditRequest extends StudioEdit {
    id: string;
    base?: string;
    lang?: string;
    /** the version the card showed; absent = write onto whatever is there now */
    version?: number;
}

export interface StudioEditOutcome {
    id: string;
    base: string;
    written: boolean;
    version?: number;
    conflict?: { seen: number; now?: number };
    error?: string;
    why: string;
}

export interface EditClient {
    getRecord(collection: string, id: string, lang?: string): Promise<Dict>;
    updateRecord(collection: string, id: string, payload: { item: Dict; expectedVersion?: number; backup?: boolean }, lang?: string): Promise<Dict>;
}

const obj = (o: Dict, k: string): Dict => (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) ? o[k] : (o[k] = {})) as Dict;
const tagList = (v: unknown): string[] => [...new Set((Array.isArray(v) ? v : String(v ?? '').split(','))
    .map(t => String(t).trim()).filter(Boolean))].slice(0, 50);

/** A score as the record keeps it: 0–1; 1 < v ≤ 100 is a percent. */
export function scoreOf(v: unknown): number | undefined {
    const n = typeof v === 'number' ? v : Number(String(v ?? '').replace('%', '').replace(',', '.').trim());
    if (!Number.isFinite(n) || n < 0 || n > 100 || String(v ?? '').trim() === '') { return undefined; }
    return Math.round((n > 1 ? n / 100 : n) * 100) / 100;
}

/** Why this edit cannot be written — '' when it can. */
export function editRefusal(e: Partial<StudioEditRequest>): string {
    if (!e.kind || !(STUDIO_EDITS as readonly string[]).includes(e.kind)) { return `the edit is ${STUDIO_EDITS.join(' | ')}`; }
    if (!String(e.id ?? '').trim()) { return 'name the record (id)'; }
    if (e.kind === 'score' && scoreOf(e.value) === undefined) { return 'a score is 0–1 (or a percent, 0–100)'; }
    if (e.kind === 'note' && String(e.value ?? '').length > 4000) { return 'a note is at most 4000 characters'; }
    return '';
}

/** The edit, applied to the CURRENT record. Pure. */
export function applyStudioEdit(item: Dict, e: StudioEdit, at: number, by = STUDIO_BY): Dict {
    const when = new Date(at).toISOString();
    const wf = obj(item, 'workflow');
    let note = '';
    if (e.kind === 'select' || e.kind === 'reject') {
        const chain = Array.isArray(wf.approval_chain) ? wf.approval_chain as unknown[] : [];
        const failure = obj(item, 'failure');
        if (e.kind === 'reject') {
            note = String(e.reason ?? '').trim();
            Object.assign(failure, { is_failed: true, reason: note || STUDIO_REJECT, salvageable: true });
            obj(item, 'completed_sections').failure = true;
            wf.rejection_count = Number(wf.rejection_count || 0) + 1;
        } else if (failure.is_failed === true && /rejected in studio/i.test(String(failure.reason ?? ''))) {
            Object.assign(failure, { is_failed: false, reason: '', salvageable: false });
            note = 'its Studio rejection taken back';
        }
        wf.approval_chain = [...chain, { by, at: when, decision: e.kind === 'select' ? 'selected' : 'rejected', ...(note ? { note } : {}) }];
    } else if (e.kind === 'tags') {
        item.tags = tagList(e.value);
        obj(item, 'completed_sections').tags = (item.tags as string[]).length > 0;
        note = (item.tags as string[]).join(', ') || '(none)';
    } else if (e.kind === 'score') {
        obj(item, 'technical_quality').human_quality_score = scoreOf(e.value) ?? 0;
        note = String(scoreOf(e.value));
    } else {
        const m = obj(item, 'moderation');
        m.notes = String(e.value ?? '');
        m.reviewed_by = by;
        m.last_reviewed_at = when;
        note = String(e.value ?? '').slice(0, 200);
    }
    const action = e.kind === 'select' ? 'selected' : e.kind === 'reject' ? 'rejected' : `${e.kind} set`;
    wf.last_action = `${action} in Studio${note ? ' — ' + note : ''}`.slice(0, 300);
    wf.last_modified = when;
    const hist = Array.isArray(item.pipeline_history) ? item.pipeline_history as unknown[] : [];
    item.pipeline_history = [...hist, { at: when, by, action, ...(note ? { note } : {}) }];
    return item;
}

const isConflict = (e: unknown): boolean => /version|409|conflict/i.test(String((e as Error)?.message ?? e));

/**
 * Write one edit — onto the version the card showed, or refuse and say so.
 * `connect` answers the engine of a base, or why it is down (the page never starts one).
 */
export async function writeStudioEdit(
    connect: (base: string) => Promise<EditClient | { down: string }>,
    r: StudioEditRequest, defaults: { base: string; lang: string }, now: number
): Promise<StudioEditOutcome> {
    const base = String(r.base ?? '').trim() || defaults.base;
    const id = String(r.id ?? '').trim();
    const no = editRefusal(r);
    if (no) { return { id, base, written: false, error: no, why: `nothing written — ${no}` }; }
    const c = await connect(base);
    if ('down' in c) { return { id, base, written: false, error: c.down, why: `nothing written — the ${base} engine is not answering (${c.down})` }; }
    const lang = String(r.lang ?? '').trim() || defaults.lang;
    const cur = await c.getRecord('media', id, lang);
    const seen = typeof r.version === 'number' && Number.isFinite(r.version) ? r.version : undefined;
    const now0 = typeof cur.version === 'number' ? cur.version : undefined;
    const said = (v?: number) => `the record changed since the wall read it (v${seen} → v${v ?? '?'}) — nothing written; the wall is read again, do it once more on what is there now`;
    if (seen !== undefined && now0 !== undefined && now0 !== seen) {
        return { id, base, written: false, conflict: { seen, now: now0 }, why: said(now0) };
    }
    const item = applyStudioEdit((cur.item ?? {}) as Dict, r, now);
    try {
        const res = await c.updateRecord('media', id, { item, expectedVersion: now0, backup: true }, lang);
        const v = typeof res.version === 'number' ? res.version : undefined;
        return { id, base, written: true, ...(v !== undefined ? { version: v } : {}), why: `${r.kind} written to ${id} on ${base}` };
    } catch (e) {
        if (isConflict(e)) { return { id, base, written: false, conflict: { seen: seen ?? now0 ?? 0 }, why: said() }; }
        return { id, base, written: false, error: String((e as Error).message ?? e), why: `nothing written — ${(e as Error).message ?? e}` };
    }
}

/** The stage a card is promoted to, from where it stands — raw → asset, semi → final; none from anywhere else. */
export function promotionOf(stage: string): string | undefined {
    return ({ raw: 'asset', semi: 'final' } as Record<string, string>)[String(stage ?? '')];
}
