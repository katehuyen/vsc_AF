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

import { ReadableStep, stepKey } from './sessionRead';
import { DIALOGUE_MAX, sanitizeForSpeech, speechParagraphs } from './speech';
import { EN_PHRASES, SpeechPhrases } from './speechPhrases';
import { DIALOGUE_TIMEOUT_MS } from './turnAlerts';

/** Where a reading came from: the conversation, the message or turn in it, and the surface that asked. */
export interface ReadingSource {
    /** '' for free text an agent asked to have read to the user. */
    sessionId: string;
    msg?: string;
    turn?: number;
    /** 'auto' for Read aloud; a page id or 'bridge' for an ask. */
    surface: string;
    /** U-199 — when a reading spans several steps: the step each paragraph belongs to (`readingKeyNow`). */
    keys?: string[];
}

/** The step being read right now: the paragraph's own step on a reading of several, else the one asked for. */
export function readingKeyNow(src: ReadingSource | null, at: { paragraph: number } | null): string {
    if (!src) { return ''; }
    return (src.keys && at ? src.keys[at.paragraph] : undefined) ?? src.msg ?? '';
}

/** The text a reading speaks: an ask reads all of it; Read aloud keeps its ceiling. */
export function readingText(raw: unknown, onDemand: boolean, words: SpeechPhrases = EN_PHRASES): string {
    return sanitizeForSpeech(raw, onDemand ? 0 : DIALOGUE_MAX, words);
}

/** U-198 — the same text in its paragraphs, which the player steps between. */
export function readingParagraphs(raw: unknown, onDemand: boolean, words: SpeechPhrases = EN_PHRASES): string[] {
    return speechParagraphs(raw, onDemand ? 0 : DIALOGUE_MAX, words);
}

/** One ask, as `alerts.readNow` takes it — exactly one of message, turn (its answer, or `whole`), from a step on, last answer or free text. */
export type ReadAsk =
    | { kind: 'msg'; sessionId: string; msg: string }
    | { kind: 'turn'; sessionId: string; turn: number; whole?: boolean }
    | { kind: 'from'; sessionId: string; from: string }
    | { kind: 'last'; sessionId: string }
    | { kind: 'text'; text: string; sessionId: string; key?: string };

/** Spells an ask out of loose arguments, or says why it cannot. */
export function readAskOf(args: Record<string, unknown>): ReadAsk | { error: string } {
    const sid = typeof args.sessionId === 'string' ? args.sessionId.trim() : '';
    const msg = typeof args.msg === 'string' ? args.msg.trim() : '';
    const from = typeof args.from === 'string' ? args.from.trim() : '';
    const text = typeof args.text === 'string' ? args.text : '';
    const turn = Number(args.turn);
    const hasTurn = args.turn !== undefined && args.turn !== null && args.turn !== '';
    const last = args.last === true || args.last === 'true';
    const whole = args.whole === true || args.whole === 'true';
    const picks = [!!msg, hasTurn, last, !!text.trim(), !!from].filter(Boolean).length;
    if (picks > 1) { return { error: 'name ONE of msg, turn, from, last or text' }; }
    if (whole && !hasTurn) { return { error: 'whole goes with turn — it reads all of that turn' }; }
    // U-207 — a page names its own text (a notice, an article) so its button shows ■ / ▶ while that text is read
    const key = typeof args.key === 'string' ? args.key.trim().slice(0, 200) : '';
    if (text.trim()) { return { kind: 'text', text, sessionId: sid, ...(key ? { key } : {}) }; }
    if (!sid) { return { error: 'sessionId is required unless text is given' }; }
    if (msg) { return { kind: 'msg', sessionId: sid, msg }; }
    if (from) { return { kind: 'from', sessionId: sid, from }; }
    if (hasTurn) {
        return Number.isInteger(turn) && turn > 0
            ? { kind: 'turn', sessionId: sid, turn, ...(whole ? { whole: true } : {}) }
            : { error: 'turn must be a whole number from 1' };
    }
    return { kind: 'last', sessionId: sid };
}

/** `segments`: the steps read, in order, each under its own key — what a page marks while it is read. */
export interface ReadTarget { text: string; msg: string; turn?: number; segments: { key: string; text: string }[] }

const hasWords = (s: ReadableStep): boolean => !!s.text?.trim();
/** An answer is what the agent itself said in words — never a subagent's aside. */
const isAnswer = (s: ReadableStep): boolean => s.role === 'assistant' && s.sidechain !== true && hasWords(s);

/** What a conversation ask reads, found in the steps the transcript page parsed (unclipped). */
export function readTarget(
    steps: readonly ReadableStep[], ask: Exclude<ReadAsk, { kind: 'text' }>
): ReadTarget | { error: string } {
    const turnOf = (i: number) => typeof steps[i].turn === 'number' ? { turn: steps[i].turn as number } : {};
    const at = (i: number): ReadTarget => {
        const key = stepKey(steps[i], i), text = String(steps[i].text);
        return { text, msg: key, ...turnOf(i), segments: [{ key, text }] };
    };
    /** Several steps read as one: the whole of a turn, or from a step to the end. */
    const many = (idx: number[], msg: string, turnAt: number): ReadTarget => {
        const segments = idx.map(i => ({ key: stepKey(steps[i], i), text: String(steps[i].text) }));
        return { text: segments.map(s => s.text).join('\n\n'), msg, ...turnOf(turnAt), segments };
    };
    const turns = () => steps.reduce((m, s) => Math.max(m, typeof s.turn === 'number' ? s.turn : 0), 0);
    if (ask.kind === 'turn' && ask.whole) {
        if (ask.turn > turns()) { return { error: `there is no turn ${ask.turn} — the conversation has ${turns()}` }; }
        // The whole turn as it was spoken: what was asked and everything the agent said in words.
        const idx = steps.map((s, i) => s.turn === ask.turn && s.sidechain !== true && hasWords(s)
            && (s.role === 'user' || s.role === 'assistant') ? i : -1).filter(i => i >= 0);
        return idx.length ? many(idx, stepKey(steps[idx[0]], idx[0]), idx[0]) : { error: `turn ${ask.turn} has nothing in words to read` };
    }
    if (ask.kind === 'from') {
        const pos = /^#(\d+)$/.exec(ask.from);
        const i = pos ? Number(pos[1]) - 1 : steps.findIndex(s => s.uuid === ask.from);
        if (i < 0 || i >= steps.length) { return { error: `no step "${ask.from}" in this conversation — sessions.read gives each step's key` }; }
        // That step, then the agent's own words to the end of the conversation.
        const idx = steps.map((s, j) => (j === i && hasWords(s)) || (j > i && isAnswer(s)) ? j : -1).filter(j => j >= 0);
        return idx.length ? many(idx, ask.from, i) : { error: `nothing in words follows step "${ask.from}"` };
    }
    const lastAnswer = (turn?: number): number => {
        for (let i = steps.length - 1; i >= 0; i--) {
            if (isAnswer(steps[i]) && (turn === undefined || steps[i].turn === turn)) { return i; }
        }
        return -1;
    };
    if (ask.kind === 'last') {
        const i = lastAnswer();
        return i < 0 ? { error: 'this conversation has no answer to read yet' } : at(i);
    }
    if (ask.kind === 'turn') {
        if (ask.turn > turns()) { return { error: `there is no turn ${ask.turn} — the conversation has ${turns()}` }; }
        const i = lastAnswer(ask.turn);
        return i < 0 ? { error: `turn ${ask.turn} has no answer in words to read` } : at(i);
    }
    const pos = /^#(\d+)$/.exec(ask.msg);
    // One transcript line can hold a sentence and the tool call after it: the
    // key names the line, and what is read is every step of it that has words.
    const hits = pos
        ? [Number(pos[1]) - 1].filter(i => i >= 0 && i < steps.length)
        : steps.map((s, i) => s.uuid === ask.msg ? i : -1).filter(i => i >= 0);
    if (!hits.length) { return { error: `no step "${ask.msg}" in this conversation — sessions.read gives each step's key` }; }
    const spoken = hits.filter(i => hasWords(steps[i]));
    if (!spoken.length) { return { error: `step "${ask.msg}" has nothing to read — a tool call carries no words` }; }
    const text = spoken.map(i => String(steps[i].text)).join('\n\n');
    return { text, msg: ask.msg, ...turnOf(spoken[0]), segments: [{ key: ask.msg, text }] };
}

/** U-206 — a spoken paragraph's first words: what a page matches in the text it shows to mark the paragraph being read. */
export function paragraphHead(p: unknown, words = 12): string {
    return String(p ?? '').trim().split(/\s+/).slice(0, words).join(' ');
}

/**
 * How long a reading may run before its player is taken for hung. Measured
 * with SAPI writing to a file: about 5 characters a second at the slowest
 * rate, 15 at the default — so the auto reader's fixed limit would cut a
 * whole answer read on demand half way. The floor stays that limit.
 */
const SLOWEST_CHARS_PER_SEC = 4;
export function readingTimeoutMs(chars: number): number {
    return Math.max(DIALOGUE_TIMEOUT_MS, Math.ceil(Math.max(0, chars) / SLOWEST_CHARS_PER_SEC) * 1000 + 60_000);
}
