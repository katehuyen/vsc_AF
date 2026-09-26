/**
 * X-416 / X-417 / X-418 — A WORKFLOW'S LIBRARY: which Airtable database its
 * files are filed and recorded in, and how.
 *
 * Every field is a flex point (`library.*`, media/afFlex.js): the Airtable
 * page's default database and language are the Farm-wide level, the workflow
 * form's Library row the production level, a media or tool step's Library row
 * the step level. Nothing stated = the module default, every file recorded,
 * failures too. Pure.
 */
import { resolveFlex } from './flexResolve';
import { AutoStart } from './mediaRecorder';
import { LibraryStage, stageRefusal } from './mediaLibrary';

export const LIBRARY_RECORDS = ['all', 'passed', 'none'] as const;
export type LibraryRecord = typeof LIBRARY_RECORDS[number];

export interface LibrarySpec { base?: string; lang?: string; autoStart?: AutoStart; record?: LibraryRecord; template?: string }
export interface StepLibrarySpec { base?: string; lang?: string; record?: LibraryRecord; template?: string; stage?: LibraryStage }

const FIELDS = { workflow: ['base', 'lang', 'autoStart', 'record', 'template'], step: ['base', 'lang', 'record', 'template', 'stage'] } as const;
const NAME = /^[\w.\- ]{1,80}$/;

/** Why this `library` cannot be saved — '' when it can. */
export function libraryRefusal(v: unknown, level: 'workflow' | 'step'): string {
    if (v === undefined || v === null) { return ''; }
    if (typeof v !== 'object' || Array.isArray(v)) { return 'library is an object: {' + FIELDS[level].join(', ') + '}'; }
    const o = v as Record<string, unknown>;
    const extra = Object.keys(o).filter(k => !(FIELDS[level] as readonly string[]).includes(k));
    if (extra.length) { return `library has no ${extra.join(', ')} at the ${level} level — ${FIELDS[level].join(', ')}`; }
    for (const k of ['base', 'lang', 'template']) {
        if (o[k] !== undefined && o[k] !== '' && (typeof o[k] !== 'string' || !NAME.test(o[k] as string))) { return `library.${k} "${String(o[k]).slice(0, 40)}" is not a plain name`; }
    }
    if (o.autoStart !== undefined && o.autoStart !== '' && !['ask', 'auto', 'never'].includes(String(o.autoStart))) { return 'library.autoStart is ask | auto | never'; }
    if (o.record !== undefined && o.record !== '' && !(LIBRARY_RECORDS as readonly string[]).includes(String(o.record))) { return `library.record is ${LIBRARY_RECORDS.join(' | ')}`; }
    if (o.stage !== undefined && o.stage !== '') { const no = stageRefusal(o.stage); if (no) { return 'library.stage: ' + no; } }
    return '';
}

/** Saved without its empty fields; nothing stated = no library object at all. */
export function cleanLibrary<T extends object>(v: T | undefined): T | undefined {
    const kept = Object.fromEntries(Object.entries(v ?? {}).filter(([, x]) => x !== undefined && x !== null && String(x).trim() !== ''));
    return Object.keys(kept).length ? kept as T : undefined;
}

const DRAFT: Record<string, string> = { base: 'libBase', lang: 'libLang', autoStart: 'libStart', record: 'libRecord', template: 'libTemplate', stage: 'libStage' };

/** The Library boxes of a form, from the spec; a blank box is the level below. */
export function librarySeed(v: LibrarySpec | StepLibrarySpec | undefined, level: 'workflow' | 'step'): Record<string, string> {
    const o = (v ?? {}) as Record<string, unknown>;
    return Object.fromEntries(FIELDS[level].map(k => [DRAFT[k], String(o[k] ?? '')]));
}

/** …and back. */
export function libraryFromDraft(raw: Record<string, unknown>, level: 'workflow' | 'step'): LibrarySpec | StepLibrarySpec | undefined {
    const out: Record<string, string> = {};
    for (const k of FIELDS[level]) { const s = String(raw[DRAFT[k]] ?? '').trim(); if (s) { out[k] = s; } }
    return Object.keys(out).length ? out : undefined;
}

export interface ResolvedLibrary {
    on: boolean;
    base: string;
    lang: string;
    autoStart: AutoStart;
    record: LibraryRecord;
    template?: string;
    stage?: LibraryStage;
    /** one line per point: its value and where it came from — or why the library is off */
    why: string[];
}

/** The library one step files into: step over workflow over the Airtable page, each said. */
export function resolveLibrary(w: LibrarySpec | undefined, s: StepLibrarySpec | undefined, module: { defaultInstance?: string; defaultLang?: string; mediaRoots?: string[] }): ResolvedLibrary {
    const r = (id: string, settings?: unknown, wf?: unknown, st?: unknown) =>
        resolveFlex('library.' + id, { ...(settings !== undefined ? { settings } : {}), ...(wf !== undefined ? { workflow: wf } : {}), ...(st !== undefined ? { step: st } : {}) });
    const base = r('base', module.defaultInstance || undefined, w?.base, s?.base);
    const lang = r('lang', module.defaultLang || undefined, w?.lang, s?.lang);
    const auto = r('autoStart', undefined, w?.autoStart);
    const rec = r('record', undefined, w?.record, s?.record);
    const tpl = r('template', undefined, w?.template, s?.template);
    const stage = r('stage', undefined, undefined, s?.stage);
    const why = [`base: ${base.sentence}`, `lang: ${lang.sentence}`, `autoStart: ${auto.sentence}`, `record: ${rec.sentence}`, `template: ${tpl.sentence}`, `stage: ${stage.sentence}`];
    const out: ResolvedLibrary = {
        on: true, base: String(base.value ?? ''), lang: String(lang.value ?? '') || 'TR',
        autoStart: String(auto.value ?? 'auto') as AutoStart, record: String(rec.value ?? 'all') as LibraryRecord,
        ...(tpl.value ? { template: String(tpl.value) } : {}), ...(stage.value ? { stage: String(stage.value) as LibraryStage } : {}), why
    };
    const off = out.record === 'none' ? 'record is none' : !out.base ? 'no Airtable database — set a default on the Airtable page, or one on the workflow'
        : !(module.mediaRoots ?? []).length ? 'no media root — add one on the Airtable page' : '';
    if (off) { out.on = false; why.unshift(`off: ${off}`); }
    return out;
}
