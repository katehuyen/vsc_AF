/**
 * M-50 — THE BRAND KIT: a production's characters, look, voice and logo rules,
 * read by any step as `{brand.<path>}` — `{brand.style}`,
 * `{brand.character.ana.ref}`. The kit is a fact about the production, so it
 * lives in that production's own `production.json`; a workflow names the
 * production it reads (`workflow.production`), a media step's own production
 * is that step's, a run may name another for itself — and a step may set any
 * field for itself, the origin kept per field. Pure node, no vscode.
 */
import { pick, show } from './runContext';

export const BRAND_TEXT = ['style', 'negative', 'colors', 'typography', 'voice', 'logoPlace', 'aspect', 'duration'] as const;
export const BRAND_LOGO = ['remove', 'keep', 'place'] as const;
export const CHARACTER_FIELDS = ['name', 'ref', 'desc'] as const;
export const CHARACTER_KEY = /^[A-Za-z][\w-]{0,31}$/;

export type BrandText = typeof BRAND_TEXT[number];
export type BrandLogo = typeof BRAND_LOGO[number];
export type BrandCharacter = Partial<Record<typeof CHARACTER_FIELDS[number], string>>;
export type BrandKit = Partial<Record<BrandText, string>> & {
    logo?: BrandLogo;
    character?: Record<string, BrandCharacter>;
};

/** Where one resolved field came from: the production's kit or the step's own value. */
export type BrandOrigin = 'production' | 'step';
export interface ResolvedBrand {
    kit: BrandKit;
    /** dotted path (`style`, `character.ana.ref`) → origin */
    origin: Record<string, BrandOrigin>;
    /** the production whose kit is under it, when there is one */
    production?: string;
}

const KNOWN = [...BRAND_TEXT, 'logo', 'character'];
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Why a kit cannot be stored, by name — '' when it can. Absent is fine. */
export function brandRefusal(raw: unknown): string {
    if (raw === undefined || raw === null) { return ''; }
    if (!isObj(raw)) { return 'brand must be an object'; }
    for (const [k, v] of Object.entries(raw)) {
        if (!KNOWN.includes(k)) { return `brand.${k} is not a kit field — known: ${KNOWN.join(', ')}`; }
        if (v === null) { continue; }
        if (k === 'logo') {
            if (v !== '' && v !== undefined && !(BRAND_LOGO as readonly unknown[]).includes(v)) {
                return `brand.logo must be one of ${BRAND_LOGO.join(' | ')}`;
            }
        } else if (k === 'character') {
            if (v === undefined) { continue; }
            if (!isObj(v)) { return 'brand.character must be an object of characters by key'; }
            for (const [ck, cv] of Object.entries(v)) {
                if (!CHARACTER_KEY.test(ck)) { return `brand.character.${ck}: a key is a letter then letters, digits, _ or - (32 at most)`; }
                if (cv === null) { continue; }
                if (!isObj(cv)) { return `brand.character.${ck} must be an object {${CHARACTER_FIELDS.join(', ')}}`; }
                for (const [f, fv] of Object.entries(cv)) {
                    if (!(CHARACTER_FIELDS as readonly string[]).includes(f)) { return `brand.character.${ck}.${f} is not a character field — known: ${CHARACTER_FIELDS.join(', ')}`; }
                    if (typeof fv !== 'string') { return `brand.character.${ck}.${f} must be text`; }
                }
            }
        } else if (v !== undefined && typeof v !== 'string') {
            return `brand.${k} must be text`;
        }
    }
    return '';
}

/** The kit as stored: known fields, trimmed, blanks dropped; undefined when nothing is left. Fail-soft. */
export function cleanBrand(raw: unknown): BrandKit | undefined {
    if (!isObj(raw)) { return undefined; }
    const out: BrandKit = {};
    for (const k of BRAND_TEXT) {
        const v = raw[k];
        if (typeof v === 'string' && v.trim()) { out[k] = v.trim(); }
    }
    if ((BRAND_LOGO as readonly unknown[]).includes(raw.logo)) { out.logo = raw.logo as BrandLogo; }
    if (isObj(raw.character)) {
        const chars: Record<string, BrandCharacter> = {};
        for (const [ck, cv] of Object.entries(raw.character)) {
            if (!CHARACTER_KEY.test(ck) || !isObj(cv)) { continue; }
            const c: BrandCharacter = {};
            for (const f of CHARACTER_FIELDS) {
                const fv = cv[f];
                if (typeof fv === 'string' && fv.trim()) { c[f] = fv.trim(); }
            }
            if (Object.keys(c).length) { chars[ck] = c; }
        }
        if (Object.keys(chars).length) { out.character = chars; }
    }
    return Object.keys(out).length ? out : undefined;
}

/**
 * A change laid over a kit, field by field: a given field replaces that field,
 * '' or null removes it, a character given as null is removed whole and one
 * given as an object changes only the fields it names.
 */
export function patchBrand(base: BrandKit | undefined, patch: Record<string, unknown>): BrandKit | undefined {
    const next: Record<string, unknown> = JSON.parse(JSON.stringify(base ?? {}));
    for (const [k, v] of Object.entries(patch)) {
        if (k !== 'character') { next[k] = v; continue; }
        if (v === null) { delete next.character; continue; }
        const chars = (isObj(next.character) ? next.character : {}) as Record<string, unknown>;
        for (const [ck, cv] of Object.entries(v as Record<string, unknown>)) {
            if (cv === null) { delete chars[ck]; continue; }
            chars[ck] = { ...(isObj(chars[ck]) ? chars[ck] as object : {}), ...(cv as object) };
        }
        next.character = chars;
    }
    return cleanBrand(next);
}

/** Every dotted path a kit sets a value at: `style`, `character.ana.ref`. */
export function brandPaths(kit: BrandKit | undefined): string[] {
    if (!kit) { return []; }
    const out: string[] = [];
    for (const [k, v] of Object.entries(kit)) {
        if (k !== 'character') { out.push(k); continue; }
        for (const [ck, cv] of Object.entries(v as Record<string, BrandCharacter>)) {
            for (const f of Object.keys(cv)) { out.push(`character.${ck}.${f}`); }
        }
    }
    return out;
}

/** The production's kit with the step's own values laid over it, field by field. */
export function resolveBrand(base: BrandKit | undefined, over: BrandKit | undefined, production?: string): ResolvedBrand {
    const kit: BrandKit = JSON.parse(JSON.stringify(base ?? {}));
    const origin: Record<string, BrandOrigin> = {};
    for (const p of brandPaths(base)) { origin[p] = 'production'; }
    for (const p of brandPaths(over)) {
        const keys = p.split('.');
        let cur = kit as Record<string, unknown>;
        for (const k of keys.slice(0, -1)) {
            if (!isObj(cur[k])) { cur[k] = {}; }
            cur = cur[k] as Record<string, unknown>;
        }
        cur[keys[keys.length - 1]] = pick(over, p);
        origin[p] = 'step';
    }
    return { kit, origin, ...(production ? { production } : {}) };
}

const REF = /\{brand\.([A-Za-z][\w-]*(?:\.[A-Za-z][\w-]*)*)\}/g;

/**
 * `{brand.<path>}` filled from the kit: a field the kit does not set reads as
 * empty. With NO kit at all the placeholders are left as written, so a run
 * that was meant to have a brand and has none says so in its own prompt.
 */
export function fillBrand(text: string, kit: BrandKit | undefined): string {
    if (!text || !kit || text.indexOf('{brand.') < 0) { return text; }
    return text.replace(REF, (_m, p: string) => show(pick(kit, p)));
}

/** Every `{brand.<path>}` a set of texts reads. */
export function brandRefs(texts: readonly unknown[]): string[] {
    const out = new Set<string>();
    const walk = (v: unknown): void => {
        if (typeof v === 'string') { for (const m of v.matchAll(REF)) { out.add(m[1]); } }
        else if (Array.isArray(v)) { v.forEach(walk); }
        else if (isObj(v)) { Object.values(v).forEach(walk); }
    };
    texts.forEach(walk);
    return [...out];
}

/**
 * Which production a step reads its kit from — lowest to highest: the
 * workflow's, the media step's own (`media.projectId`), this run's.
 */
export function brandProductionFor(
    workflow: { production?: string } | undefined,
    step: { media?: { projectId?: string } } | undefined,
    run?: { production?: string }
): string | undefined {
    return run?.production || step?.media?.projectId || workflow?.production || undefined;
}
