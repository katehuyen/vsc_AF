/**
 * U-197 — READING ON DEMAND: "read that answer now".
 *
 * Until now the one way to hear an answer was to switch Read aloud on for a
 * conversation and have EVERY turn read as it ended, cut at the timeline's
 * quote length. A reading somebody asks for is a different act: it reads the
 * whole text, it is not silenced by Mute all / Quiet hours / Silent (those stop
 * noise nobody chose, and a click is a choice), and it shares the one reading
 * channel with the automatic reader, so the newest reading cuts the older one.
 *
 * Pure: what to read and how an ask is spelt. The player is `DialogueSpeaker`
 * (turnAlerts.ts); which reading is current is `ReadingNow` (soundCard.ts).
 */

import { DIALOGUE_MAX, sanitizeForSpeech } from './speech';
import { EN_PHRASES, SpeechPhrases } from './speechPhrases';

/** Where a reading came from: the conversation, the message or turn in it, and the surface that asked. */
export interface ReadingSource {
    /** '' for free text an agent asked to have read to the user. */
    sessionId: string;
    msg?: string;
    turn?: number;
    /** 'auto' for Read aloud; a page id or 'bridge' for an ask. */
    surface: string;
}

/** The text a reading speaks: an ask reads all of it; Read aloud keeps its ceiling. */
export function readingText(raw: unknown, onDemand: boolean, words: SpeechPhrases = EN_PHRASES): string {
    return sanitizeForSpeech(raw, onDemand ? 0 : DIALOGUE_MAX, words);
}

/** One ask, as `alerts.readNow` takes it — exactly one of message, turn, last answer or free text. */
export type ReadAsk =
    | { kind: 'msg'; sessionId: string; msg: string }
    | { kind: 'turn'; sessionId: string; turn: number }
    | { kind: 'last'; sessionId: string }
    | { kind: 'text'; text: string; sessionId: string };

/** Spells an ask out of loose arguments, or says why it cannot. */
export function readAskOf(args: Record<string, unknown>): ReadAsk | { error: string } {
    const sid = typeof args.sessionId === 'string' ? args.sessionId.trim() : '';
    const msg = typeof args.msg === 'string' ? args.msg.trim() : '';
    const text = typeof args.text === 'string' ? args.text : '';
    const turn = Number(args.turn);
    const hasTurn = args.turn !== undefined && args.turn !== null && args.turn !== '';
    const last = args.last === true || args.last === 'true';
    const picks = [!!msg, hasTurn, last, !!text.trim()].filter(Boolean).length;
    if (picks > 1) { return { error: 'name ONE of msg, turn, last or text' }; }
    if (text.trim()) { return { kind: 'text', text, sessionId: sid }; }
    if (!sid) { return { error: 'sessionId is required unless text is given' }; }
    if (msg) { return { kind: 'msg', sessionId: sid, msg }; }
    if (hasTurn) {
        return Number.isInteger(turn) && turn > 0
            ? { kind: 'turn', sessionId: sid, turn }
            : { error: 'turn must be a whole number from 1' };
    }
    return { kind: 'last', sessionId: sid };
}
