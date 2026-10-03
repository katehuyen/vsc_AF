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

export function said(key: string, vars: Record<string, string | number>): Said {
    const v: Record<string, string> = {};
    for (const [k, x] of Object.entries(vars)) { v[k] = String(x); }
    return { title: key.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? v[k] : m)), titleKey: key, titleVars: v };
}
