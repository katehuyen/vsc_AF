/**
 * X-424 — THE STUDIO WALL READ FROM THE LIBRARY.
 *
 * A card per media record of the chosen database: what the search summary
 * already carries (id, file, stage, status, failed…) plus what a reviewer
 * judges by — the score, how much of the form is filled, why it failed, and
 * the relation chain it sits in. The `.media.json` sidecars are only a cache:
 * the wall shows one when the engine is not answering or when its file has no
 * record yet, and the wall's `note` says which of the two it is. Pure, apart
 * from the injected lister.
 */
import * as path from 'path';
import { matchRecords, RecordSummary, ResolvedQuery, summarize } from './airtableInput';
import { resolveFlex } from './flexResolve';
import { assetKind, MediaMeta } from './media';
import { LIBRARY_STAGES } from './mediaLibrary';

type Dict = Record<string, unknown>;

export interface LibraryCard extends RecordSummary {
    /** human_quality_score when a person gave one, else auto_quality_score; 0 = none */
    score: number;
    scoreBy: 'human' | 'auto' | '';
    /** completed_sections that are true, as a percentage of all of them */
    fill: number;
    reason: string;
    causes: string[];
    effects: string[];
    version: number;
    /** created_at, ms; 0 = unknown */
    at: number;
}

export interface WallCard extends LibraryCard { from: 'library' | 'cache' }

export const STUDIO_VIEW_KEYS = ['base', 'stages', 'kind', 'success'] as const;
export type StudioViewKey = typeof STUDIO_VIEW_KEYS[number];
export type StudioView = Partial<Record<StudioViewKey, string>>;
/** the most cards one wall draws — the note says when there were more */
export const WALL_LIMIT = 200;

/** One sidecar-known file: what the cache can say about it. */
export interface CacheEntry { file: string; name: string; kind: string; at: number }

export interface LibraryWall {
    base: string;
    source: 'library' | 'cache';
    /** the one line the page shows over the wall: where it reads, and why when it is the cache */
    note: string;
    view: { base: string; stages: string[]; kind: string; success: string };
    /** each view value with where it came from */
    why: string[];
    cards: WallCard[];
    /** cards that matched before the cut at WALL_LIMIT */
    matched: number;
}

export interface WallDeps {
    list(base: string, lang: string): Promise<Dict[] | { down: string }>;
    settings(): Partial<Record<StudioViewKey, unknown>>;
    defaultBase(): string;
    lang(): string;
}

const get = (o: unknown, p: string): unknown => p.split('.').reduce<unknown>((a, k) => (a && typeof a === 'object' ? (a as Dict)[k] : undefined), o);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
const list = (v: unknown): string[] => String(v ?? '').split(',').map(s => s.trim()).filter(Boolean);
// a Windows path folds case ordinally: KEDI.png is kedi.png, never a Turkish dotless i
const fileKey = (p: string): string => (p ? path.resolve(p).toLowerCase() : '');

export function libraryCard(item: Dict): LibraryCard {
    const human = num(get(item, 'technical_quality.human_quality_score'));
    const auto = num(get(item, 'technical_quality.auto_quality_score'));
    const sections = get(item, 'completed_sections');
    const flags = sections && typeof sections === 'object' ? Object.values(sections as Dict) : [];
    return {
        ...summarize(item),
        score: human || auto,
        scoreBy: human ? 'human' : auto ? 'auto' : '',
        fill: flags.length ? Math.round(100 * flags.filter(f => f === true).length / flags.length) : 0,
        reason: String(get(item, 'failure.reason') ?? ''),
        causes: ids(get(item, 'relations.causal.causes')),
        effects: ids(get(item, 'relations.causal.effects')),
        version: num(item.version),
        at: Date.parse(String(item.created_at ?? '')) || 0
    };
}

/** Why this view cannot be used — '' when it can. */
export function viewRefusal(v: StudioView): string {
    const bad = list(v.stages).filter(s => !(LIBRARY_STAGES as readonly string[]).includes(s));
    if (bad.length) { return `stages has no ${bad.join(', ')} — ${LIBRARY_STAGES.join(', ')}`; }
    if (v.kind && !['image', 'video', 'audio'].includes(v.kind)) { return 'kind is image | video | audio'; }
    if (v.success && !['passed', 'failed'].includes(v.success)) { return 'success is passed | failed'; }
    if (v.base && !/^[\w.\- ]{1,80}$/.test(v.base)) { return 'base is a plain name'; }
    return '';
}

/** The page's own filter over the Farm setting over the built-in (every stage, every kind, both outcomes). */
export function resolveView(view: StudioView | undefined, settings: Partial<Record<StudioViewKey, unknown>>, defaultBase: string):
    { base: string; stages: string[]; kind: string; success: string; why: string[] } {
    const r = (k: StudioViewKey) => resolveFlex('studio.library.' + k, {
        ...(settings[k] !== undefined && settings[k] !== '' ? { settings: settings[k] } : {}),
        ...(view?.[k] !== undefined && view[k] !== '' ? { live: view[k] } : {})
    });
    const b = r('base'), st = r('stages'), ki = r('kind'), su = r('success');
    const base = String(b.value || '') || defaultBase;
    return {
        base, stages: list(st.value), kind: String(ki.value || ''), success: String(su.value || ''),
        why: [`base: ${b.value ? b.sentence : defaultBase ? 'the Airtable page\'s default' : 'none chosen'}`, `stages: ${st.sentence}`, `kind: ${ki.sentence}`, `success: ${su.sentence}`]
    };
}

/** The sidecar metas as cache entries: one per meta whose asset is still on disk. */
export function cacheOf(metas: readonly MediaMeta[], exists: (p: string) => boolean): CacheEntry[] {
    const out: CacheEntry[] = [];
    for (const m of metas) {
        const file = m.assetFiles.find(exists);
        if (file) { out.push({ file, name: m.title || path.basename(file), kind: assetKind(file), at: m.ts || 0 }); }
    }
    return out;
}

/** The wall's items: each card joined to the sidecar item of its file (which keeps its re-run, vary and scene doors); a record nothing here generated gets a bare item. */
export function wallItems<T extends { assetPath?: string }>(sidecar: readonly T[], wall: LibraryWall | undefined): (T & { lib?: WallCard })[] {
    if (!wall) { return [...sidecar]; }
    const byFile = new Map(sidecar.filter(s => s.assetPath).map(s => [fileKey(s.assetPath as string), s]));
    return wall.cards.map(card => {
        const s = byFile.get(fileKey(card.file));
        if (s) { return { ...s, lib: card }; }
        return {
            taskId: '', title: card.name, model: '', input: '', estCost: 0, ts: card.at, source: 'library',
            selectedCount: 0, rejectedCount: 0, assetPath: card.file, kind: card.type || assetKind(card.file), lib: card
        } as unknown as T & { lib: WallCard };
    });
}

/** A sidecar file as the record it would be: enough for the same filter to judge it. */
const cacheItem = (c: CacheEntry): Dict => ({ name: c.name, media: { file_path: c.file, type: c.kind }, created_at: c.at ? new Date(c.at).toISOString() : '' });

/** The wall one view draws: the records of its database, and the sidecar cache where the database cannot answer. */
export async function libraryWall(view: StudioView | undefined, cache: readonly CacheEntry[], d: WallDeps): Promise<LibraryWall> {
    const v = resolveView(view, d.settings(), d.defaultBase());
    const q: ResolvedQuery = { query: '', stages: v.stages, tags: [], kind: v.kind || undefined, success: v.success || undefined, limit: Number.MAX_SAFE_INTEGER, sort: 'newest', why: [] };
    const fromCache = (entries: readonly CacheEntry[]): WallCard[] => matchRecords(entries.map(cacheItem), q).map(it => ({ ...libraryCard(it), from: 'cache' as const }));
    const done = (source: LibraryWall['source'], note: string, cards: WallCard[]): LibraryWall => {
        cards.sort((a, b) => b.at - a.at);
        const cut = cards.length > WALL_LIMIT ? ` · the newest ${WALL_LIMIT} of ${cards.length} shown` : '';
        return { base: v.base, source, note: note + cut, view: { base: v.base, stages: v.stages, kind: v.kind, success: v.success }, why: v.why, cards: cards.slice(0, WALL_LIMIT), matched: cards.length };
    };
    if (!v.base) {
        const c = fromCache(cache);
        return done('cache', `No database chosen — set a default on the Airtable page or pick one here. Showing the sidecar cache (${c.length}), not a database.`, c);
    }
    const items = await d.list(v.base, d.lang());
    if (!Array.isArray(items)) {
        const c = fromCache(cache);
        return done('cache', `The ${v.base} engine is not answering (${items.down}) — showing the sidecar cache (${c.length}), not the database.`, c);
    }
    const recorded = new Set(items.map(it => fileKey(String(get(it, 'media.file_path') ?? ''))).filter(Boolean));
    const records = matchRecords(items, q).map(it => ({ ...libraryCard(it), from: 'library' as const }));
    const loose = fromCache(cache.filter(c => !recorded.has(fileKey(c.file))));
    return done('library', `${records.length} record(s) from ${v.base}${loose.length ? ` · ${loose.length} file(s) with no record yet, shown from the sidecar cache` : ''}.`, [...records, ...loose]);
}
