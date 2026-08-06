/**
 * Prompt snippets — the phrases you say to an agent over and over, in a file.
 *
 * ‼️ THE FILE IS A NORMAL MARKDOWN DOCUMENT, NOT A CONFIG FORMAT. It is written
 * in the user's own vault, edited in Obsidian, and read here — so it has to
 * survive being a document: headings, paragraphs, notes to self, half-finished
 * thoughts. Only what sits inside a ``` fence is offered as a snippet, and
 * everything else is commentary the reader wrote for themselves. That rule is
 * the user's, and it is the whole parser: no front matter, no keys, no schema
 * to remember six months later.
 *
 * ‼️ A SNIPPET STILL NEEDS A NAME, and that is the one thing the fence alone
 * cannot give. A picker listing eight paragraphs of prose is a picker nobody
 * reads, so the label is taken from the markdown AROUND the block, in the order
 * a person would guess:
 *   1. the fence's own info string (```review notes),
 *   2. the line immediately above it, if there is one and it is not blank,
 *   3. failing both, the snippet's own first line.
 * Nothing is invented and nothing outside a fence is ever SENT — the label is
 * only how the block is offered.
 *
 * ‼️ THE NEAREST HEADING IS THE GROUP, NEVER THE LABEL, and that ordering is
 * deliberate. A file with one heading and ten blocks under it would otherwise
 * offer ten rows all called the same thing — the heading is already drawn once,
 * above them, so spending each row's name on it says nothing twice.
 */

/** One offered snippet. `text` is exactly what was between the fences. */
export interface PromptSnippet {
    /** What the picker shows. Never empty — see the four rules above. */
    label: string;
    /** The heading it sits under, '' when it sits under none. */
    group: string;
    /** The body, verbatim, with the trailing newline trimmed. */
    text: string;
    /** 1-based line of the opening fence — so "open the file here" is possible. */
    line: number;
}

export interface PromptSnippetFile {
    /** Every fenced block in the file, in the order they appear. */
    items: PromptSnippet[];
    /** Blocks that had a fence but nothing inside — reported, not offered. */
    empty: number;
}

/** A fence: three or more backticks (or tildes), then an optional info string. */
const FENCE = /^(\s*)(`{3,}|~{3,})(.*)$/;
const HEADING = /^#{1,6}\s+(.*\S)\s*$/;

/** Markdown decoration a label does not need: list bullets, emphasis, the
 *  trailing colon somebody writes before a block ("Kod incelemesi:"). */
function tidyLabel(s: string): string {
    return String(s ?? '')
        .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
        .replace(/^\s*>+\s*/, '')
        .replace(/[*_`]/g, '')
        .replace(/\s*:\s*$/, '')
        .trim();
}

/** One line, cut to something a menu row can hold. */
function shorten(s: string, max = 80): string {
    const one = String(s ?? '').replace(/\s+/g, ' ').trim();
    return one.length > max ? `${one.slice(0, max).replace(/\s+\S*$/, '')}…` : one;
}

/**
 * Read a markdown document into its snippets.
 *
 * Deliberately a pure function over the TEXT: the caller owns the file, the
 * setting and the "it is not there any more" case, and this is testable without
 * a disk.
 */
export function parsePromptSnippets(text: string): PromptSnippetFile {
    const lines = String(text ?? '').split(/\r?\n/);
    const items: PromptSnippet[] = [];
    let empty = 0;
    let heading = '';
    /** The last non-blank, non-heading line seen — candidate label. */
    let above = '';
    let i = 0;
    while (i < lines.length) {
        const m = FENCE.exec(lines[i]);
        if (!m) {
            const h = HEADING.exec(lines[i]);
            if (h) { heading = tidyLabel(h[1]); above = ''; }
            else if (lines[i].trim()) { above = lines[i]; }
            else { above = ''; }
            i++;
            continue;
        }
        // A fence closes on the first line that is a fence of the SAME
        // character and at least as long — the CommonMark rule, so a block
        // containing ``` inside a longer ```` fence survives.
        const marker = m[2];
        const info = tidyLabel(m[3]);
        const openedAt = i;
        const body: string[] = [];
        i++;
        while (i < lines.length) {
            const c = FENCE.exec(lines[i]);
            if (c && c[2][0] === marker[0] && c[2].length >= marker.length && !c[3].trim()) { break; }
            body.push(lines[i]);
            i++;
        }
        i++;                                        // step past the closing fence
        const snippet = body.join('\n').replace(/\s+$/, '');
        if (!snippet.trim()) { empty++; above = ''; continue; }
        const label = info
            || tidyLabel(above)
            || shorten(snippet.split('\n')[0].trim())
            || heading;
        items.push({
            label: shorten(label) || 'snippet',
            group: heading,
            text: snippet,
            line: openedAt + 1
        });
        above = '';
    }
    return { items, empty };
}
