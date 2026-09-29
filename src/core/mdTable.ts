import { full as afFull } from './aftime';
import { LINE_BREAKS } from './lineBreaks';

/**
 * B-21 — one Markdown table, built in one place.
 *
 * ‼️ THE PAGE USED TO ASSEMBLE THE DOCUMENT AND THE HOST ONLY FILED IT, which
 * is why "export the rows you can see" was reachable from a button and from
 * nowhere else: the bytes existed inside a webview. The page still decides
 * WHICH rows (its own search, filters and sort are the question being asked) —
 * it sends them, and the document is assembled here, where an op can assemble
 * the same one.
 *
 * Cells are escaped for the table, never for markup: a `|` would end the column
 * and a newline would end the row.
 */
export function markdownTable(o: {
    title: string;
    cols: string[];
    rows: readonly (readonly unknown[])[];
    /** When it was exported; defaults to now in the reader's own format. */
    at?: number;
    /** An extra clause on the subtitle line, after the row count. */
    note?: string;
}): string {
    const cell = (v: unknown): string =>
        String(v ?? '').replace(/\|/g, '\\|').replace(LINE_BREAKS, ' ');
    const meta = [`Exported ${afFull(o.at ?? Date.now())}`, `${o.rows.length} row(s)`];
    if (o.note) { meta.push(o.note); }
    const lines = [`# ${o.title}`, '', `_${meta.join(' · ')}_`, ''];
    if (!o.rows.length) {
        lines.push('_No rows matched what was being looked at._', '');
        return lines.join('\n');
    }
    lines.push('| ' + o.cols.map(cell).join(' | ') + ' |');
    lines.push('| ' + o.cols.map(() => '---').join(' | ') + ' |');
    for (const r of o.rows) { lines.push('| ' + o.cols.map((_, i) => cell(r[i])).join(' | ') + ' |'); }
    return lines.join('\n') + '\n';
}

/**
 * A table whose COLUMNS ARE DERIVED FROM THE ROWS, never written down. A stat
 * the figures start carrying appears in the export on its own; a hand-written
 * column list is a second declaration of the same shape, and this repo has
 * found three of those wrong in a day.
 */
export function tableOfRecords(
    title: string, rows: readonly Record<string, unknown>[], note?: string
): { title: string; cols: string[]; rows: unknown[][]; note?: string } {
    const cols: string[] = [];
    for (const r of rows) { for (const k of Object.keys(r)) { if (!cols.includes(k)) { cols.push(k); } } }
    const flat = (v: unknown): string =>
        v === null || v === undefined ? ''
            : Array.isArray(v) ? v.map(flat).join(', ')
                : typeof v === 'object' ? JSON.stringify(v)
                    : String(v);
    return { title, cols, rows: rows.map(r => cols.map(c => flat(r[c]))), note };
}

