/**
 * U-189 — A SENTENCE THE HOST COMPOSES FOR A PAGE. The English text is kept
 * whole for the bridge and the agents that read it; the template and its
 * values travel beside it, so the page translates where it draws (AFI18n t()),
 * never where the row is built.
 */
export interface Said {
    title: string;
    titleKey: string;
    titleVars: Record<string, string>;
}

/** The same for a row's detail line: { detail, detailKey, detailVars }. */
export function saidDetail(key: string, vars: Record<string, string | number>): { detail: string; detailKey: string; detailVars: Record<string, string> } {
    const s = said(key, vars);
    return { detail: s.title, detailKey: s.titleKey, detailVars: s.titleVars };
}

export function said(key: string, vars: Record<string, string | number>): Said {
    const v: Record<string, string> = {};
    for (const [k, x] of Object.entries(vars)) { v[k] = String(x); }
    return { title: key.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? v[k] : m)), titleKey: key, titleVars: v };
}

/** One part of an answer the page draws: the page joins t(key, vars) of every part with a space. */
export interface SayPart { key: string; vars: Record<string, string> }

export function say(key: string, vars: Record<string, string | number> = {}): SayPart {
    const s = said(key, vars);
    return { key: s.titleKey, vars: s.titleVars };
}

/** The English of the parts — what the bridge and the agents read. */
export function sayText(parts: readonly SayPart[]): string {
    return parts.map(p => said(p.key, p.vars).title).join(' ');
}

/** A refusal: `why` stays whole for the bridge, `say` travels beside it for a page. */
export function saidWhy(key: string, vars: Record<string, string | number> = {}): { ok: false; why: string; say: SayPart[] } {
    const parts = [say(key, vars)];
    return { ok: false, why: sayText(parts), say: parts };
}

/** A success sentence in parts, the same way. */
export function saidSentence(...parts: SayPart[]): { sentence: string; say: SayPart[] } {
    return { sentence: sayText(parts), say: parts };
}
