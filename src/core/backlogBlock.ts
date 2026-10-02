/**
 * X-460 — AN ITEM IS ITS LINE AND THE INDENTED LINES UNDER IT.
 *
 * Backlog items are written on one line, but a file the user edits by hand
 * carries older items with indented notes, precedents and analysis beneath them.
 * A move that takes only the checkbox line leaves that text behind, headless,
 * under whatever item now sits above it. So an item's block runs on through
 * every following line that is indented, stopping at a line that is not, at the
 * next item (a nested checkbox is an item of its own and moves on its own
 * account) or at the end of the file. A blank line belongs to the block only
 * when indented text follows it; trailing blanks stay where they are.
 */
export function itemBlockEnd(lines: string[], line: number, itemLines: Set<number>): number {
    let end = line;
    for (let n = line + 1; n < lines.length; n++) {
        if (itemLines.has(n)) { break; }
        const s = lines[n];
        if (!s.trim()) { continue; }
        if (!/^[ \t]/.test(s)) { break; }
        end = n;
    }
    return end;
}
