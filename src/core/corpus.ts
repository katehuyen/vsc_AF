/**
 * ‼️ U-76 — THE WORDS OF ONE STEP, WITHOUT OPENING THE TRANSCRIPT.
 *
 * The Live Timeline already lets a point be opened: left-click lands the
 * viewer on that exact moment, and the step's own copy button is two clicks
 * further on. Two clicks and a lost place, for one line of text somebody wanted
 * to paste into a message. So the point's right-click menu copies it directly.
 *
 * What "it" is has ONE definition and it is not invented here: a tool step's
 * payload is its `input`, everything else says what it has to say in `text` —
 * the same rule the viewer's copy button uses (`stepText` in
 * `media/sessionViewer.js`), because a copy that disagreed with the button it
 * is a shortcut for would be a second, quieter answer to the same question.
 *
 * And it is read from the TRANSCRIPT rather than from the chart's own event.
 * The store shortens what it keeps and flattens its whitespace (`truncate`), so
 * copying that would hand over a one-line, clipped version of a prompt while
 * looking like the whole thing. The file has the whole thing.
 */

/** The shape this needs out of a viewer message; the real one has more. */
export interface CorpusStep {
    role?: string;
    ts?: number;
    text?: string;
    input?: string;
    tool?: string;
}

export interface Corpus {
    /** What goes on the clipboard. */
    text: string;
    role: string;
    /** The step's own instant — not the instant that was asked for. */
    ts: number;
    tool?: string;
    /** How far the step was from the moment that was pointed at, in ms. A
     *  point and its line are written within the same second; anything larger
     *  is worth SAYING rather than passing off as an exact hit. */
    offBy: number;
}

/** The words of one step — the viewer's rule, stated once. */
export function stepWords(m: CorpusStep | undefined): string {
    if (!m) { return ''; }
    return String((m.role === 'tool' ? m.input : m.text) || '');
}

/**
 * The step a moment on the chart stands for.
 *
 * Nearest by time among the steps that actually have words: a tool RESULT and a
 * turn boundary are real steps with nothing to put on a clipboard, and landing
 * on one of those would answer a copy with silence.
 */
export function corpusAt(messages: CorpusStep[] | undefined, ts: number): Corpus | undefined {
    if (!messages || !messages.length) { return undefined; }
    let best: CorpusStep | undefined;
    let bestOff = Infinity;
    for (const m of messages) {
        if (!stepWords(m)) { continue; }
        const off = Math.abs((m.ts || 0) - ts);
        // `<` and not `<=`: on a tie the EARLIER step wins, which is the one
        // whose event fired the mark.
        if (off < bestOff) { best = m; bestOff = off; }
    }
    if (!best) { return undefined; }
    return {
        text: stepWords(best),
        role: String(best.role || ''),
        ts: best.ts || 0,
        tool: best.tool,
        offBy: bestOff
    };
}
