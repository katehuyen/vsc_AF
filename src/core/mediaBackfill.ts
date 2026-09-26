import * as path from 'path';
import { MediaMeta } from './media';
import { isStage, LibraryStage, libraryType, MediaRole, planLibrary } from './mediaLibrary';
import { Produced } from './mediaRecordFields';
import { RecordOutcome, RecordRequest } from './mediaRecorder';
import { retargetSidecars } from './runLibrary';

/**
 * X-426 — the one-time backfill: every file a gallery sidecar (`<taskId>.media.json`)
 * names goes into the media library with its record, so no media lives only in the
 * extension's outputs folder. A file the database already has (same path or same
 * bytes) stays where it is. The dry run says what would happen; a second run finds
 * nothing to do.
 */

type Dict = Record<string, unknown>;
export const BACKFILL_ACTIONS = ['recorded', 'file', 'record', 'missing', 'skipped'] as const;
export type BackfillAction = typeof BACKFILL_ACTIONS[number];

export interface BackfillItem {
    file: string;
    taskId: string;
    action: BackfillAction;
    why: string;
    role?: MediaRole;
    stage?: LibraryStage;
    /** where it goes (dry run) or went */
    target?: string;
    /** the Studio decision the sidecar carries */
    decision?: 'kept' | 'dropped';
    sequence?: number;
    id?: string;
    pending?: string;
    error?: string;
}

export interface BackfillReport {
    base: string;
    lang: string;
    dryRun: boolean;
    down?: string;
    counts: Record<BackfillAction, number>;
    items: BackfillItem[];
    lines: string[];
}

export interface BackfillDeps {
    outputsDir: string;
    roots: readonly string[];
    metas: readonly MediaMeta[];
    list(base: string, lang: string): Promise<Dict[] | { down: string }>;
    hash(file: string): Promise<string>;
    exists(p: string): boolean;
    record(r: RecordRequest): Promise<RecordOutcome>;
    /** the Studio wall's own writer — a keep or drop carried onto the new record */
    decide(id: string, kind: 'select' | 'reject', base: string, lang: string): Promise<unknown>;
}

const key = (p: string): string => path.resolve(String(p || '')).replace(/\\/g, '/').toLowerCase();
const external = (m: MediaMeta): boolean => String(m.source ?? '').startsWith('external');

/** The stage folder of this base the file already lies in — undefined when it lies outside the library. */
export function stageInLibrary(roots: readonly string[], base: string, file: string): LibraryStage | undefined {
    for (const root of roots) {
        const rel = path.relative(path.join(root, 'media_' + base), file);
        if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) { continue; }
        const parts = rel.split(/[\\/]/);
        if (parts.length === 3 && parts[0] === libraryType(file) && isStage(parts[1])) { return parts[1]; }
    }
    return undefined;
}

function decisionOf(m: MediaMeta, i: number, file: string): BackfillItem['decision'] {
    const names = [m.assetUrls?.[i], file].filter((s): s is string => !!s);
    if (names.some(n => m.rejectedUrls?.includes(n))) { return 'dropped'; }
    return names.some(n => m.selectedUrls?.includes(n)) ? 'kept' : undefined;
}

const roleOf = (m: MediaMeta, d: BackfillItem['decision']): MediaRole => external(m) ? 'input' : d === 'dropped' ? 'rejected' : 'candidate';

function promptOf(input: string): string | undefined {
    try { const p = (JSON.parse(input) as Dict)?.prompt; if (typeof p === 'string' && p) { return p; } } catch { /* not JSON — the input is the prompt */ }
    return input ? input.slice(0, 2000) : undefined;
}

function producedOf(m: MediaMeta, it: BackfillItem): Omit<Produced, 'stage' | 'fingerprint'> {
    const ext = external(m);
    return {
        role: it.role ?? 'unknown', origin: ext ? 'external' : 'AI_generated', productionType: ext ? 'external' : 'fal',
        model: m.model || undefined, prompt: ext ? undefined : promptOf(String(m.input ?? '')),
        costUsd: m.estCost ? m.estCost / Math.max(1, m.assetFiles.length) : undefined, sequence: it.sequence,
        run: { id: m.taskId, name: m.workflowTitle || m.title || m.taskId, startedAt: m.ts, taskId: m.taskId }
    };
}

/** What would happen to every file the sidecars name — nothing is moved or written. */
export async function planBackfill(base: string, lang: string, d: BackfillDeps): Promise<{ items: BackfillItem[]; down?: string }> {
    const listed = await d.list(base, lang);
    if (!Array.isArray(listed)) { return { items: [], down: listed.down }; }
    const byPath = new Map<string, string>(), byFp = new Map<string, string>();
    for (const it of listed) {
        const id = String(it.id ?? '');
        if (!id) { continue; }
        if (typeof it.fingerprint === 'string' && it.fingerprint) { byFp.set(it.fingerprint, id); }
        const fp = ((it.media ?? {}) as Dict).file_path;
        if (typeof fp === 'string' && fp) { byPath.set(key(fp), id); }
    }
    const items: BackfillItem[] = [];
    const seen = new Set<string>();
    for (const m of d.metas) {
        const files = Array.isArray(m.assetFiles) ? m.assetFiles : [];
        for (let i = 0; i < files.length; i++) {
            const file = String(files[i] ?? '');
            if (!file || seen.has(key(file))) { continue; }
            seen.add(key(file));
            const at: BackfillItem = { file, taskId: m.taskId, action: 'skipped', why: '' };
            if (!path.isAbsolute(file) || !libraryType(file)) { items.push({ ...at, why: 'not an image, video or audio file on this machine' }); continue; }
            if (!d.exists(file)) { items.push({ ...at, action: 'missing', why: 'the sidecar names a file that is no longer on disk' }); continue; }
            const id = byPath.get(key(file)) ?? byFp.get(await d.hash(file));
            if (id) { items.push({ ...at, action: 'recorded', id, why: `${id} already has it — left where it is` }); continue; }
            const decision = decisionOf(m, i, file);
            const role = roleOf(m, decision);
            const more = { role, sequence: i + 1, ...(decision ? { decision } : {}) };
            const inLib = stageInLibrary(d.roots, base, file);
            if (inLib) { items.push({ ...at, ...more, action: 'record', stage: inLib, target: file, why: `in the library (${inLib}) with no record — recorded where it is` }); continue; }
            const plan = planLibrary({ roots: d.roots, base, file, role, exists: d.exists });
            if ('error' in plan) { items.push({ ...at, why: plan.error }); continue; }
            items.push({ ...at, ...more, action: 'file', stage: plan.stage, target: plan.target, why: plan.why.join(' · ') });
        }
    }
    return { items };
}

function summary(r: Omit<BackfillReport, 'lines'>): string[] {
    const c = r.counts;
    if (r.down) { return [`Nothing done — the ${r.base} engine is not answering (${r.down}). Without it no file can be matched to its record.`]; }
    const todo = c.file + c.record;
    const head = `${r.dryRun ? 'Dry run — nothing moved or written' : 'Backfill'} · ${r.base}: ${r.items.length} file(s) named by ${new Set(r.items.map(i => i.taskId)).size} sidecar(s) · already recorded ${c.recorded} · ${r.dryRun ? 'to file' : 'filed'} ${c.file} · ${r.dryRun ? 'to record in place' : 'recorded in place'} ${c.record} · missing ${c.missing} · skipped ${c.skipped}`;
    const rows = r.items.filter(i => i.action === 'file' || i.action === 'record' || i.error).slice(0, 50)
        .map(i => `${path.basename(i.file)} → ${i.error ? `stayed — ${i.error}` : `${i.stage}${i.target && key(i.target) !== key(i.file) ? ` (${i.target})` : ''}${i.id ? ` · ${i.id}` : ''}${i.pending ? ' · record pending' : ''}${i.decision ? ` · ${i.decision}` : ''}`}`);
    return [head, ...rows, ...(todo ? [] : ['Nothing to do: every file the sidecars name is in the library or gone.'])];
}

/** The backfill: a dry run unless apply — then each file is filed and recorded, and its sidecar follows it. */
export async function backfillLibrary(base: string, lang: string, apply: boolean, d: BackfillDeps): Promise<BackfillReport> {
    const { items, down } = await planBackfill(base, lang, d);
    if (apply && !down) {
        const metaOf = new Map(d.metas.map(m => [m.taskId, m]));
        for (const it of items.filter(x => x.action === 'file' || x.action === 'record')) {
            const m = metaOf.get(it.taskId);
            if (!m) { continue; }
            try {
                const r = await d.record({ file: it.file, base, lang, autoStart: 'never', stage: it.stage, inPlace: it.action === 'record', produced: producedOf(m, it) });
                if (r.error && !r.pending) { it.error = r.error.slice(0, 300); continue; }
                if (key(r.file) !== key(it.file)) { retargetSidecars(d.outputsDir, it.file, r.file); }
                Object.assign(it, { target: r.file, ...(r.stage ? { stage: r.stage } : {}), ...(r.id ? { id: r.id } : {}), ...(r.pending ? { pending: r.pending } : {}) });
                if (r.id && !r.duplicate && it.decision) { await d.decide(r.id, it.decision === 'kept' ? 'select' : 'reject', base, lang); }
            } catch (e) { it.error = (e as Error).message.slice(0, 300); }
        }
    }
    const counts = Object.fromEntries(BACKFILL_ACTIONS.map(a => [a, items.filter(i => i.action === a).length])) as Record<BackfillAction, number>;
    const r = { base, lang, dryRun: !apply, ...(down ? { down } : {}), counts, items };
    return { ...r, lines: summary(r) };
}
