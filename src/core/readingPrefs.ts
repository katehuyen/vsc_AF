/**
 * U-205 — HOW A READING SOUNDS, SET APART FROM THE ANNOUNCEMENT (`agentFarm.alerts.reading`).
 *
 * An announcement is one sentence somebody wrote for a voice ("developer, asking you"),
 * heard a hundred times a day; a reading is an answer in whatever language the agent
 * wrote it, heard once and often long. So the two do not share a voice, a speed or a
 * ceiling: the reading has its own.
 *
 * - `voice` — '' is Auto: each reading is voiced by an installed voice of its own
 *   language (U-203). A conversation's own voice still wins over it.
 * - `rate` — SAPI's scale, −10 … 10; a long text is often listened to faster.
 * - `length` — what Read aloud (the automatic reading at a turn's end) reads: the
 *   `first` part, cut at a sentence near the ceiling with "There is more", or the
 *   `whole` answer. A reading somebody asks for always reads all of it.
 * - `code` — a code block, an error trace, a log or JSON is said by its `size`
 *   ("a 3-line code block"), or `skip`ped without a word.
 *
 * Pure: the host reads the setting through `readingPrefsOf` and every reading —
 * asked for or automatic — takes its voice, rate, ceiling and words from here.
 */
import { DIALOGUE_MAX } from './speech';
import type { SpeechPhrases } from './speechPhrases';

export const READ_LENGTHS = ['first', 'whole'] as const;
export const READ_CODES = ['size', 'skip'] as const;
export type ReadLength = typeof READ_LENGTHS[number];
export type ReadCode = typeof READ_CODES[number];

export interface ReadingPrefs {
    voice: string;
    rate: number;
    length: ReadLength;
    code: ReadCode;
}

/** Today's readings, exactly: Auto voice, the voice's own speed, Read aloud cut at its ceiling, code said by its size. */
export const READING_DEFAULT: Readonly<ReadingPrefs> = Object.freeze({ voice: '', rate: 0, length: 'first', code: 'size' });

/** What Hear it reads when nobody hands it a text: a sentence, a short block of code, a sentence — so `code` is heard too. */
export const READING_SAMPLE = 'This is how an answer is read aloud. Here is a short piece of code:\n\n```\nnpm run build\nnpm test\n```\n\nThat was the whole sample.';

const VOICE_MAX = 120;

const rateOf = (v: unknown): number | null => {
    if (v === undefined || v === null || v === '' || typeof v === 'boolean') { return null; }
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(-10, Math.min(10, Math.round(n))) : null;
};

const oneOf = <T extends string>(list: readonly T[], v: unknown): T | null =>
    (list as readonly string[]).includes(String(v)) ? String(v) as T : null;

/** The stored setting, whatever is in it: an unknown or missing field is the default's. */
export function readingPrefsOf(raw: unknown): ReadingPrefs {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return {
        voice: typeof r.voice === 'string' ? r.voice.trim().slice(0, VOICE_MAX) : READING_DEFAULT.voice,
        rate: rateOf(r.rate) ?? READING_DEFAULT.rate,
        length: oneOf(READ_LENGTHS, r.length) ?? READING_DEFAULT.length,
        code: oneOf(READ_CODES, r.code) ?? READING_DEFAULT.code
    };
}

/** What someone asked to change (the page, the bridge): each field refused by name rather than stored as something else. */
export function parseReadingPatch(args: Record<string, unknown>): { ok: true; patch: Partial<ReadingPrefs> } | { ok: false; error: string } {
    const patch: Partial<ReadingPrefs> = {};
    if (args.voice !== undefined) {
        if (typeof args.voice !== 'string') { return { ok: false, error: 'voice is a voice\'s name, or "" for Auto — match the text\'s language' }; }
        patch.voice = args.voice.trim().slice(0, VOICE_MAX);
    }
    if (args.rate !== undefined) {
        const r = rateOf(args.rate);
        if (r === null) { return { ok: false, error: 'rate is a number from -10 (slowest) to 10 (fastest)' }; }
        patch.rate = r;
    }
    if (args.length !== undefined) {
        const l = oneOf(READ_LENGTHS, args.length);
        if (!l) { return { ok: false, error: `length is one of ${READ_LENGTHS.join(', ')}` }; }
        patch.length = l;
    }
    if (args.code !== undefined) {
        const c = oneOf(READ_CODES, args.code);
        if (!c) { return { ok: false, error: `code is one of ${READ_CODES.join(', ')}` }; }
        patch.code = c;
    }
    return { ok: true, patch };
}

/** The ceiling a reading is cut at, 0 = none: an ask reads everything; Read aloud follows `length`. */
export function readingLimit(p: ReadingPrefs, onDemand: boolean): number {
    return onDemand || p.length === 'whole' ? 0 : DIALOGUE_MAX;
}

/** The words a reading inserts: with `code: skip`, code, traces, logs and JSON leave no words at all. */
export function readingWords(words: SpeechPhrases, p: ReadingPrefs): SpeechPhrases {
    if (p.code !== 'skip') { return words; }
    const none = (): string => '';
    return { ...words, codeBlock: none, trace: none, log: none, jsonObject: none, jsonList: none };
}

/** The voice a reading asks for: the conversation's own, else the reading's ('' = Auto). */
export function readingVoiceWant(own: string, p: ReadingPrefs): string {
    return String(own || '').trim() || p.voice;
}
