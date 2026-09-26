/**
 * X-419 — A RECORD'S MEANING, FILLED BY A MODEL THAT LOOKED AT THE FILE.
 *
 * The recorder (X-418) writes what code can measure; this writes what only a
 * look can say — the Admin panel's meaning sections (W:\zome\db\<base>\Admin\
 * src\App.jsx MEDIA_FIELD_SECTIONS, options copied verbatim so a filled record
 * is indistinguishable from a hand-entered one). Measurements (engagement,
 * quiz rates, study time) are never guessed. A field a person already filled
 * is never overwritten. Pure: the prompt, the answer's validation, the patch.
 */
import * as path from 'path';
import { assetModality, Modality } from './judgeEngines';
import { extractJson } from './util';

type Dict = Record<string, unknown>;
type Kind = 'text' | 'long' | 'list' | 'score' | 'bool' | string[];
interface Field { path: string; kind: Kind }
export interface EnrichSection { id: string; done: string; label: string; fields: Field[]; when?: 'failed' }

const USAGE = ['education', 'marketing', 'entertainment', 'documentation', 'presentation', 'social_media', 'advertising', 'branding', 'ui_element', 'stock_asset'];
const ROLE = ['primary_content', 'supporting_visual', 'overlay', 'background_layer', 'thumbnail', 'intro_outro', 'transition', 'branding_element', 'decorative', 'reference_material', 'audio_layer', 'text_overlay', 'call_to_action', 'interactive_element'];
const LEVEL = ['primary', 'secondary', 'highschool', 'university', 'postgraduate', 'doctorate'];
const STYLE = ['academic', 'school', 'youtube', 'tiktok', 'quiz', 'marketing'];
const f = (p: string, kind: Kind): Field => ({ path: p, kind });

export const ENRICH_SECTIONS: readonly EnrichSection[] = [
    { id: 'identity', done: 'identity', label: 'Genel', fields: [f('name', 'text'), f('topic', 'text'), f('subtopic', 'text'), f('content', 'long'), f('description', 'long')] },
    { id: 'taxonomy', done: 'taxonomy', label: 'Taksonomi', fields: [f('domain', 'text'), f('discipline', 'text'), f('field', 'text'), f('branch', 'text')] },
    { id: 'function', done: 'content_context', label: 'Fonksiyon & Stil', fields: [f('usage_context', USAGE), f('content_role', ROLE), f('style', STYLE), f('level', LEVEL)] },
    { id: 'tone', done: 'style_tone', label: 'Ton & Duygu', fields: [f('tone.audience', ['child', 'teen', 'adult', 'expert']), f('tone.emotion', ['neutral', 'enthusiastic', 'serious', 'humorous', 'provocative']), f('tone.energy', ['low', 'medium', 'high', 'very_high']), f('tone.formality', ['formal', 'neutral', 'casual', 'playful'])] },
    {
        id: 'education', done: 'educational_impact', label: 'Pedagoji & Eğitsel Etki', fields: [
            f('didactic_intent', ['introduce', 'deepen', 'reinforce', 'apply', 'test']), f('bloom_taxonomy_level', ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']),
            f('prerequisite_knowledge', 'list'), f('learning_objectives', 'list'), f('educational_impact.educational_value', 'score'),
            f('educational_impact.hook_psychology', ['shock', 'curiosity', 'fear', 'authority', 'personal_experience', 'comparison', 'reassurance', 'promise', 'contrast', 'problem']),
            f('educational_impact.hook_value', ['speed', 'transformation', 'exam_success', 'ease', 'certainty', 'free_resource', 'optimization']),
            f('educational_impact.difficulty_perceived', ['very_easy', 'easy', 'medium', 'hard', 'very_hard'])
        ]
    },
    { id: 'marketing', done: 'marketing', label: 'Pazarlama', fields: [f('marketing.clickbait_score', 'score'), f('marketing.credibility_score', 'score'), f('marketing.shock_factor', 'score'), f('marketing.virality_score', 'score')] },
    {
        id: 'platform', done: 'platform_fit', label: 'Platform Uyum', fields: [
            ...['slide_body', 'slide_title', 'flashcard', 'video_overlay', 'tiktok_visual', 'tiktok_sound_on_score'].map(k => f('platform_fit.' + k, 'score')),
            ...['youtube_thumbnail_optimized', 'youtube_description_ready', 'instagram_story_ready', 'instagram_feed_ready', 'instagram_reel_ready', 'tiktok_vertical_optimized', 'tiktok_text_overlay_safe'].map(k => f('platform_fit.' + k, 'bool'))
        ]
    },
    { id: 'accessibility', done: 'accessibility', label: 'Erişilebilirlik', fields: [f('accessibility.alt_text', 'long'), f('accessibility.aria_label', 'text')] },
    { id: 'seo', done: 'seo', label: 'SEO', fields: [f('seo.title', 'text'), f('seo.description', 'long'), f('seo.keywords', 'list'), f('seo.slug', 'text')] },
    { id: 'tags', done: 'tags', label: 'Etiketler', fields: [f('tags', 'list')] },
    { id: 'salvage', done: 'failure', label: 'Başarı Statüsü — kurtarılabilir parçalar', fields: [f('failure.salvage_notes', 'long')], when: 'failed' }
];
export const ENRICH_SECTION_IDS = ENRICH_SECTIONS.map(s => s.id);

const get = (o: Dict, p: string): unknown => p.split('.').reduce<unknown>((a, k) => (a && typeof a === 'object' ? (a as Dict)[k] : undefined), o);
function set(o: Dict, p: string, v: unknown): void {
    const ks = p.split('.');
    let at = o;
    for (const k of ks.slice(0, -1)) { at = (at[k] && typeof at[k] === 'object' ? at[k] : (at[k] = {})) as Dict; }
    at[ks[ks.length - 1]] = v;
}

/** Nothing a person wrote: blank, zero, false, an empty list — or the file's own name standing in for a name. */
export function isBlank(item: Dict, p: string): boolean {
    const v = get(item, p);
    if (v === undefined || v === null || v === '' || v === 0 || v === false) { return true; }
    if (Array.isArray(v)) { return v.length === 0; }
    if (typeof v !== 'string') { return false; }
    // the recorder puts the file's name into name / content as a placeholder
    const b = path.basename(String(get(item, 'media.file_path') ?? ''));
    return !!b && (v === b || v === path.basename(b, path.extname(b)));
}

/** The sections this record gets asked about: the wanted ones, salvage only for a failed file, and only those with a blank field. */
export function sectionsFor(item: Dict, want?: readonly string[]): EnrichSection[] {
    const ids = want && want.length ? want : ENRICH_SECTION_IDS;
    const failed = get(item, 'failure.is_failed') === true;
    return ENRICH_SECTIONS.filter(s => ids.includes(s.id) && (s.when !== 'failed' || failed) && s.fields.some(x => isBlank(item, x.path)));
}

/** Which engine can look at this file, by modality — audio has none (measured: agy saw frames, heard nothing). */
export function enrichModality(file: string): { modality: Modality; engine?: 'claude' | 'agy'; why?: string } {
    const m = assetModality(file);
    if (m === 'image') { return { modality: m, engine: 'claude' }; }
    if (m === 'video') { return { modality: m, engine: 'agy' }; }
    return { modality: m, why: m === 'audio' ? 'no engine here can hear an audio file — agy sees video frames only' : `a ${m} file is not media a model can look at` };
}

export interface EnrichContext { prompt?: string; brief?: string; run?: string; lang?: string }

function kindWord(k: Kind): string {
    if (Array.isArray(k)) { return 'one of: ' + k.join(' | '); }
    return { text: 'short text', long: 'one to three sentences', list: 'array of short strings (3-12)', score: 'number 0..1 (two decimals)', bool: 'true | false' }[k] ?? 'text';
}

/** The one turn's prompt: the file, what is known, the blank fields and the strict answer shape. */
export function enrichPrompt(item: Dict, file: string, sections: readonly EnrichSection[], ctx: EnrichContext, engine: string): string {
    const lang = String(ctx.lang || item.lang || 'TR').toUpperCase();
    const known = [
        ctx.prompt && `generation prompt: ${ctx.prompt.slice(0, 800)}`,
        ctx.brief && `production brief: ${ctx.brief.slice(0, 600)}`,
        ctx.run && `made by: ${ctx.run.slice(0, 300)}`,
        get(item, 'failure.is_failed') === true && `this file FAILED its check: ${String(get(item, 'failure.reason') ?? '').slice(0, 600)}`,
        `media: ${String(get(item, 'media.type') ?? '')} ${String(get(item, 'media.width') ?? '')}x${String(get(item, 'media.height') ?? '')}${get(item, 'media.duration_seconds') ? `, ${String(get(item, 'media.duration_seconds'))} s` : ''}`
    ].filter(Boolean).join('\n');
    const ask = sections.map(s => `"${s.id}" (${s.label}): {${s.fields.filter(x => isBlank(item, x.path)).map(x => `"${x.path}": ${kindWord(x.kind)}`).join(', ')}}`).join('\n');
    return [
        `Open the file "${path.basename(file)}"${engine === 'claude' ? ' with the Read tool' : ''} and look at it carefully. Do not run shell commands and do not change any file.`,
        'You are filling the catalogue record of this media file, the way a careful librarian would.',
        known,
        `Fill these fields. Free text in language ${lang}; option values exactly as listed; scores are your honest estimate from what you SEE.`,
        ask,
        'salvage_notes (when asked) names what can still be used: which seconds, frames or regions, and why.',
        'A section you cannot fill honestly from the file (e.g. education for non-educational content) goes to "missing" with the reason — never guess.',
        'Answer with ONE valid JSON object (double quotes) and nothing else: {"fill": {"<section id>": {"<field path>": <value>}}, "missing": [{"section": "<id>", "why": "<reason>"}]}'
    ].join('\n\n');
}

export interface EnrichParse { patch: Dict; filled: string[]; complete: string[]; missing: { section: string; why: string }[]; dropped: string[]; error?: string }

function value(k: Kind, v: unknown): unknown {
    if (Array.isArray(k)) { const s = String(v ?? '').trim(); return k.includes(s) ? s : undefined; }
    if (k === 'score') { const n = Number(v); return Number.isFinite(n) ? Math.round(Math.min(1, Math.max(0, n)) * 100) / 100 : undefined; }
    if (k === 'bool') { return v === true || v === 'true' ? true : v === false || v === 'false' ? false : undefined; }
    if (k === 'list') {
        const a = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
        const out = a.map(x => String(x ?? '').trim()).filter(Boolean).slice(0, 20).map(x => x.slice(0, 120));
        return out.length ? out : undefined;
    }
    const s = String(v ?? '').trim();
    return s ? s.slice(0, k === 'long' ? 1200 : 200) : undefined;
}

/** A field as a model wrote it: "tone.audience" verbatim, nested {"tone": {"audience"}}, or the bare leaf "audience" (measured: haiku nests, gemini does not). */
function pick(got: Dict, p: string): unknown {
    if (got[p] !== undefined) { return got[p]; }
    const nested = get(got, p);
    return nested !== undefined ? nested : got[p.slice(p.lastIndexOf('.') + 1)];
}

/** Apply the parse to the CURRENT record: a field a person filled meanwhile is kept; one history line says what happened. */
export function applyEnrich(item: Dict, p: EnrichParse, note: { at: string; by: string; model: string; costUsd?: number }): string[] {
    const put: string[] = [];
    for (const k of p.filled) { if (isBlank(item, k)) { set(item, k, get(p.patch, k)); put.push(k); } }
    for (const id of p.complete) { const s = ENRICH_SECTIONS.find(x => x.id === id); if (s) { set(item, 'completed_sections.' + s.done, true); } }
    const hist = Array.isArray(item.pipeline_history) ? item.pipeline_history as unknown[] : [];
    const miss = p.missing.map(m => `${m.section} (${m.why})`).join('; ');
    hist.push({
        at: note.at, by: note.by, action: 'enriched', model: note.model, ...(note.costUsd ? { cost_usd: note.costUsd } : {}),
        note: `filled ${put.length} field(s)${p.complete.length ? ` — complete: ${p.complete.join(', ')}` : ''}${miss ? ` — missing: ${miss}` : ''}`.slice(0, 1500)
    });
    item.pipeline_history = hist;
    return put;
}

/** The model's answer → the patch (blank fields only), what was filled, what stays missing and why. */
export function parseEnrich(out: string, item: Dict, sections: readonly EnrichSection[]): EnrichParse {
    const res: EnrichParse = { patch: {}, filled: [], complete: [], missing: [], dropped: [] };
    const j = (extractJson(out) ?? {}) as Dict;
    if (!j || typeof j !== 'object' || !j.fill || typeof j.fill !== 'object') {
        res.error = 'the answer was not the JSON asked for';
        res.missing = sections.map(s => ({ section: s.id, why: res.error as string }));
        return res;
    }
    const fill = (j.fill ?? {}) as Dict;
    const said = new Map<string, string>();
    for (const m of Array.isArray(j.missing) ? j.missing as Dict[] : []) { if (m && typeof m.section === 'string') { said.set(m.section, String(m.why ?? '').slice(0, 300)); } }
    for (const s of sections) {
        const got = (fill[s.id] && typeof fill[s.id] === 'object' ? fill[s.id] : {}) as Dict;
        const blank = s.fields.filter(x => isBlank(item, x.path));
        const left: string[] = [];
        for (const x of blank) {
            const raw = pick(got, x.path);
            const v = value(x.kind, raw);
            if (v === undefined) { if (raw !== undefined) { res.dropped.push(`${x.path}: ${String(raw).slice(0, 40)}`); } left.push(x.path); continue; }
            set(res.patch, x.path, v);
            res.filled.push(x.path);
        }
        if (!left.length) { res.complete.push(s.id); set(res.patch, 'completed_sections.' + s.done, true); }
        else { res.missing.push({ section: s.id, why: said.get(s.id) || `not filled: ${left.join(', ')}` }); }
    }
    return res;
}
