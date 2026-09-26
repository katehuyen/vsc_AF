/**
 * X-420 — A RUN'S MATERIAL FOUND IN THE LOCAL AIRTABLE.
 *
 * A workflow input of type `airtable` is a search: database + text + stage,
 * kind, status, tags, success. Before the first step the search runs and the
 * matching records become the input's value — a JSON list of
 * {id, file, name, stage, type, topic, tags, status, failed} — so a step reads
 * `{input.refs}` and a for-each step walks it (`{item.file}`, `{item.id}`).
 * A run (or a trigger) that hands a file path instead gets THAT file's record.
 * Defaults are flex points `airtable.input.*`: stages asset + final, 20
 * records, newest first. Pure, apart from the injected lister.
 */
import * as path from 'path';
import { resolveFlex } from './flexResolve';
import { LIBRARY_STAGES } from './mediaLibrary';

type Dict = Record<string, unknown>;

export const INPUT_SORTS = ['newest', 'oldest', 'name'] as const;
export const INPUT_KINDS = ['image', 'video', 'audio'] as const;
export interface AirtableQuery { base?: string; query?: string; stages?: string; kind?: string; status?: string; tags?: string; success?: string; limit?: number | string; sort?: string }
export type QuerySettings = Partial<Record<'stages' | 'limit' | 'sort', unknown>>;
export interface ResolvedQuery { base?: string; query: string; stages: string[]; kind?: string; status?: string; tags: string[]; success?: string; limit: number; sort: string; why: string[] }
export interface RecordSummary { id: string; file: string; name: string; stage: string; type: string; topic: string; tags: string[]; status: string; failed: boolean }

const KEYS = ['base', 'query', 'stages', 'kind', 'status', 'tags', 'success', 'limit', 'sort'] as const;
const list = (v: unknown): string[] => String(v ?? '').split(',').map(s => s.trim()).filter(Boolean);
const lower = (s: unknown): string => String(s ?? '').toLocaleLowerCase('tr');
const get = (o: Dict, p: string): unknown => p.split('.').reduce<unknown>((a, k) => (a && typeof a === 'object' ? (a as Dict)[k] : undefined), o);

/** Why this search cannot be saved — '' when it can. */
export function queryRefusal(v: unknown): string {
    if (v === undefined || v === null) { return ''; }
    if (typeof v !== 'object' || Array.isArray(v)) { return `airtable is an object: {${KEYS.join(', ')}}`; }
    const o = v as Dict;
    const extra = Object.keys(o).filter(k => !(KEYS as readonly string[]).includes(k));
    if (extra.length) { return `airtable has no ${extra.join(', ')} — ${KEYS.join(', ')}`; }
    const bad = list(o.stages).filter(s => !(LIBRARY_STAGES as readonly string[]).includes(s));
    if (bad.length) { return `airtable.stages has no ${bad.join(', ')} — ${LIBRARY_STAGES.join(', ')}`; }
    if (o.kind && !(INPUT_KINDS as readonly string[]).includes(String(o.kind))) { return `airtable.kind is ${INPUT_KINDS.join(' | ')}`; }
    if (o.success && !['passed', 'failed'].includes(String(o.success))) { return 'airtable.success is passed | failed'; }
    if (o.sort && !(INPUT_SORTS as readonly string[]).includes(String(o.sort))) { return `airtable.sort is ${INPUT_SORTS.join(' | ')}`; }
    if (o.limit !== undefined && o.limit !== '' && !(Number.isInteger(Number(o.limit)) && Number(o.limit) >= 1 && Number(o.limit) <= 200)) { return 'airtable.limit is a whole number, 1 to 200'; }
    if (o.base && !/^[\w.\- ]{1,80}$/.test(String(o.base))) { return 'airtable.base is a plain name'; }
    return '';
}

/** Saved without its blanks. */
export function cleanQuery(v: AirtableQuery | undefined): AirtableQuery | undefined {
    const kept = Object.fromEntries(Object.entries(v ?? {}).filter(([k, x]) => (KEYS as readonly string[]).includes(k) && x !== undefined && x !== null && String(x).trim() !== ''));
    return Object.keys(kept).length ? kept as AirtableQuery : undefined;
}

/** The search one run makes: the input's own values over the Farm setting over the built-in; a run's text replaces the query. */
export function resolveQuery(q: AirtableQuery | undefined, settings: QuerySettings = {}, runText?: string): ResolvedQuery {
    const r = (k: 'stages' | 'limit' | 'sort') => resolveFlex('airtable.input.' + k, {
        ...(settings[k] !== undefined && settings[k] !== '' ? { settings: settings[k] } : {}),
        ...(q?.[k] !== undefined && q[k] !== '' ? { workflow: q[k] } : {})
    });
    const st = r('stages'), li = r('limit'), so = r('sort');
    const query = String(runText ?? '').trim() || String(q?.query ?? '').trim();
    return {
        ...(q?.base ? { base: q.base } : {}), query, stages: list(st.value), tags: list(q?.tags),
        ...(q?.kind ? { kind: q.kind } : {}), ...(q?.status ? { status: q.status } : {}), ...(q?.success ? { success: q.success } : {}),
        limit: Math.min(200, Math.max(1, Number(li.value) || 20)), sort: String(so.value || 'newest'),
        why: [`stages: ${st.sentence}`, `limit: ${li.sentence}`, `sort: ${so.sentence}`, ...(runText?.trim() ? ['query: given by the run'] : [])]
    };
}

/** What a step is handed for one record. */
export function summarize(item: Dict): RecordSummary {
    const file = String(get(item, 'media.file_path') ?? '').replace(/\//g, path.sep);
    const stage = String(get(item, 'workflow.stage') ?? '') || (LIBRARY_STAGES as readonly string[]).find(s => new RegExp(`[\\\\/]${s}[\\\\/][^\\\\/]+$`).test(file)) || '';
    return {
        id: String(item.id ?? ''), file, name: String(item.name || path.basename(file)), stage, type: String(get(item, 'media.type') ?? ''),
        topic: String(item.topic ?? ''), tags: Array.isArray(item.tags) ? (item.tags as unknown[]).map(String) : [], status: String(item.status ?? ''),
        failed: get(item, 'failure.is_failed') === true
    };
}

const hay = (item: Dict): string => lower([item.name, item.topic, item.subtopic, item.content, item.description, (item.tags as unknown[] ?? []).join(' '),
    ((get(item, 'seo.keywords') as unknown[]) ?? []).join(' '), path.basename(String(get(item, 'media.file_path') ?? ''))].join(' '));

/** The records a search finds — or, given a file, that file's own record. */
export function findRecords(items: readonly Dict[], q: ResolvedQuery, file?: string): RecordSummary[] {
    if (file) {
        // a Windows path folds case ordinally: KEDI.png is kedi.png, never a Turkish dotless i
        const key = (p: string) => path.resolve(p).toLowerCase();
        const want = key(file);
        return items.filter(it => key(String(get(it, 'media.file_path') ?? '')) === want).slice(0, 1).map(summarize);
    }
    const words = lower(q.query).split(/\s+/).filter(Boolean);
    const tags = q.tags.map(lower);
    const found = items.filter(it => {
        const s = summarize(it);
        if (q.stages.length && !q.stages.includes(s.stage)) { return false; }
        if (q.kind && s.type !== q.kind) { return false; }
        if (q.status && s.status !== q.status) { return false; }
        if (q.success && (q.success === 'failed') !== s.failed) { return false; }
        if (tags.length && !tags.every(t => s.tags.map(lower).includes(t))) { return false; }
        const h = words.length ? hay(it) : '';
        return words.every(w => h.includes(w));
    });
    const at = (it: Dict) => Date.parse(String(it.created_at ?? '')) || 0;
    found.sort((a, b) => q.sort === 'name' ? summarize(a).name.localeCompare(summarize(b).name, 'tr') : q.sort === 'oldest' ? at(a) - at(b) : at(b) - at(a));
    return found.slice(0, q.limit).map(summarize);
}

/** A run value that is a path to a file means "that file's record", anything else is search text. */
export const isFileValue = (v: string, exists: (p: string) => boolean): boolean => path.isAbsolute(v) && exists(v);

export interface InputLookupDeps {
    list: (base: string, lang: string) => Promise<Dict[] | { down: string }>;
    settings: () => QuerySettings;
    defaultBase: () => string;
    lang: () => string;
    exists: (p: string) => boolean;
}

/** Every airtable input of a run looked up: its value becomes the JSON list, one line each says what was found and why. */
export async function lookupInputs(inputs: readonly { name: string; airtable?: AirtableQuery }[], given: Record<string, string>, d: InputLookupDeps):
    Promise<{ values: Record<string, string>; lines: string[]; error?: string; base?: string }> {
    const values: Record<string, string> = {};
    const lines: string[] = [];
    let first = '';
    for (const i of inputs) {
        const q = resolveQuery(i.airtable, d.settings(), given[i.name] && !isFileValue(given[i.name], d.exists) ? given[i.name] : undefined);
        const base = q.base || d.defaultBase();
        if (!base) { return { values, lines, error: `input "${i.name}": no database — set one on the input or a default on the Airtable page` }; }
        first = first || base;
        const items = await d.list(base, d.lang());
        if (!Array.isArray(items)) { return { values, lines, error: `input "${i.name}": the ${base} engine is not answering — ${items.down}` }; }
        const file = given[i.name] && isFileValue(given[i.name], d.exists) ? given[i.name] : undefined;
        const found = findRecords(items, q, file);
        values[i.name] = JSON.stringify(found);
        lines.push(`input ${i.name}: ${found.length} record(s) from ${base}${file ? ` — the record of ${path.basename(file)}` : ` — ${[q.query && `"${q.query}"`, q.stages.join('+'), q.kind, q.success, q.tags.length && `tags ${q.tags.join('+')}`].filter(Boolean).join(' · ')} · ${q.sort} · max ${q.limit}`}`);
    }
    return { values, lines, base: first };
}

/** The line an agent step is told when its run reads the library: look there first. */
export const libraryHint = (base: string): string =>
    `Material: this run reads the local Airtable database "${base}". Look for existing media there first (airtable_search / airtable_get MCP tools) before making anything new; every file you make is filed into its media library for you.`;
