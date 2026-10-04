/**
 * U-217 — WHAT A PHONE SAYS FOR A REMOTE EVENT, MADE BY THE HOST'S OWN READER.
 *
 * The phone had a cleaner of its own (fenced code became " code block " in
 * English, a cut at a fixed length), so one answer was read two ways. The host
 * now puts the reading on the event: `spoken: { text, lang }` — the text through
 * `sanitizeForSpeech` with the inserted words in the text's own language, and
 * that language's tag so the phone picks a voice that speaks it. The field is
 * optional: an older phone ignores it, and nothing speakable leaves it off.
 *
 * Each event says what the PC's reader says for it: a turn its last answer, a
 * question or a permission `askSpoken`'s sentence, a notice its title, a
 * question about to answer itself the reminder's sentence. `fallback` is the
 * interface's language — what a text that gives no sign of its own is read in.
 */
import { DIALOGUE_MAX, SPEAK_MAX, sanitizeForSpeech } from './speech';
import { detectLang, langOfCulture, phrasesFor, SPEECH_LANGS } from './speechLang';
import { askSense, askSpoken, type SpokenAsk } from './askSpoken';
import type { SpeechPhrases } from './speechPhrases';

export interface Spoken { text: string; lang: string }

/** How much each event says: a reading the PC reader's ceiling, a headline an announcement's. */
export const SPOKEN_MAX = {
    'turn.finished': DIALOGUE_MAX,
    'ask.opened': DIALOGUE_MAX,
    'permission.opened': DIALOGUE_MAX,
    'notice.posted': SPEAK_MAX,
    'ask.answersSoon': SPEAK_MAX
} as const;
export type SpokenType = keyof typeof SPOKEN_MAX;

/** The text's language, else the interface's, else the table's first. */
export function spokenLang(sense: string, fallback: string): string {
    return detectLang(sense) || langOfCulture(fallback) || SPEECH_LANGS[0].tag;
}

/** `sense` picks the language; `say` builds the sentence in its words. Nothing speakable → undefined. */
export function spokenOf(type: SpokenType, sense: string, fallback: string, say: (words: SpeechPhrases) => string
): Spoken | undefined {
    const lang = spokenLang(sense, fallback);
    const words = phrasesFor(lang);
    const text = sanitizeForSpeech(say(words), SPOKEN_MAX[type], words);
    return text ? { text, lang } : undefined;
}

export const turnSpoken = (said: string, fallback: string): Spoken | undefined =>
    spokenOf('turn.finished', said, fallback, () => said);

export const askSpokenOf = (type: 'ask.opened' | 'permission.opened', who: string, ask: SpokenAsk, fallback: string
): Spoken | undefined => spokenOf(type, askSense(ask), fallback, w => askSpoken(who, ask, w));

export const noticeSpoken = (title: string, fallback: string): Spoken | undefined =>
    spokenOf('notice.posted', title, fallback, () => title);

export const answersSoonSpoken = (who: string, minutes: number, fallback: string): Spoken | undefined =>
    spokenOf('ask.answersSoon', '', fallback, w => w.answersSoon(who.trim() || w.anAgent, minutes));

/** The field as it rides on an event's data: present only when there is something to say. */
export const withSpoken = (s: Spoken | undefined): { spoken?: Spoken } => (s ? { spoken: s } : {});
