/**
 * A JSON template's placeholders are filled INSIDE its string values, so a value
 * carrying a quote, a line end or a Windows path (C:\Users\… — "\U" is no JSON
 * escape) stays valid JSON. Filled as plain text it broke the input, and a local
 * file the input named was then never found to upload. A template that is not
 * JSON (a placeholder standing for a bare number or list) is filled as text.
 */
export function fillJsonTemplate(template: string, fill: (s: string) => string): string {
    let parsed: unknown;
    try { parsed = JSON.parse(template); } catch { return fill(template); }
    if (typeof parsed !== 'object' || parsed === null) { return fill(template); }
    const walk = (v: unknown): unknown => typeof v === 'string' ? fill(v)
        : Array.isArray(v) ? v.map(walk)
        : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]))
        : v;
    return JSON.stringify(walk(parsed));
}
