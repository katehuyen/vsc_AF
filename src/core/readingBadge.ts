/**
 * U-206 — WHAT IS BEING READ, IN ONE LINE: the status bar item that exists only while a reading lasts.
 *
 * A-22 keeps the bar free of idle icons, so there is no badge — the item is hidden — whenever
 * nothing is read. While something is, the item names whose words they are and where the player
 * is ("developer #3 · 3/9"), and turns to a pause sign while it is paused. Pure, so the item and
 * its test read the same answer.
 */
import type { ReadingSource } from './reader';
import type { PlayState } from './readingPlayer';

export interface ReadingBadge {
    /** the item's text, a codicon first */
    text: string;
    /** the hover's lines, plain text */
    lines: string[];
    paused: boolean;
    /** whose words and where, without the icon: "developer #3 · 3/9" */
    label: string;
    /** "Paragraph 3 of 9"; '' for a single paragraph or before the player speaks */
    paragraph: string;
    /** the speed this reading plays at; null before the player speaks */
    rate: number | null;
}

/** Whose words: the conversation's label, else what kind of text it is (the surface that asked). */
export function readingWho(src: ReadingSource, label: string): string {
    if (src.sessionId) { return String(label || '').trim() || src.sessionId.slice(0, 8); }
    if (src.surface === 'selection') { return 'your selection'; }
    if (src.surface === 'sound') { return 'the sample'; }
    if (src.surface === 'briefing') { return 'the daily briefing'; }
    return 'a text';
}

/** The badge for the reading now; null while nothing is read. */
export function readingBadge(src: ReadingSource | null, at: PlayState | null, label: string): ReadingBadge | null {
    if (!src) { return null; }
    const who = readingWho(src, label);
    const paused = !!at?.paused;
    const step = at && at.paragraphs > 1 ? `${at.paragraph + 1}/${at.paragraphs}` : '';
    const what = src.turn ? `turn ${src.turn}'s answer` : src.surface === 'auto' ? 'its newest answer' : '';
    const named = `${who}${step ? ` · ${step}` : ''}`;
    const paragraph = at && at.paragraphs > 1 ? `Paragraph ${at.paragraph + 1} of ${at.paragraphs}` : '';
    return {
        text: `$(${paused ? 'debug-pause' : 'unmute'}) ${named}`,
        paused, label: named, paragraph, rate: at ? at.rate : null,
        lines: [
            `${paused ? 'Paused' : at ? 'Reading' : 'Starting to read'}: ${who}${what ? ` — ${what}` : ''}`,
            ...(paragraph ? [paragraph] : []),
            ...(at && at.rate ? [`Speed ${at.rate}`] : [])
        ]
    };
}
