/**
 * U-203 — THE WORDS A READING OR AN ANNOUNCEMENT INSERTS, PER LANGUAGE.
 *
 * The cleaner (`sanitizeForSpeech`) says a code block's size, a table's rows, a
 * trace's or a log's length, JSON by its keys, "an id" for a hash, "file, line N",
 * "a link" for a bare URL, "There is more." at the cut; an announcement says the
 * event ("asking you") and "an agent" when the name is missing. Those words are
 * said by the voice that reads, so they come from that voice's language — a
 * Turkish voice saying "a one-line code block" in the middle of a Turkish answer
 * is the defect this table ends. A language is one entry here and one in
 * `speechLang.ts`'s table; nothing else names one.
 */
import type { AlertEvent } from './alertVoices';

export interface SpeechPhrases {
    codeBlock: (lines: number) => string;
    table: (rows: number) => string;
    trace: (lines: number) => string;
    log: (lines: number) => string;
    jsonObject: (keys: number) => string;
    jsonList: (items: number) => string;
    fileLine: (file: string, line: number, end?: number) => string;
    id: string;
    link: string;
    image: string;
    path: string;
    more: string;
    anAgent: string;
    events: Record<AlertEvent, string>;
}

export const SPEECH_PHRASES: Readonly<Record<string, SpeechPhrases>> = {
    en: {
        codeBlock: n => (n === 1 ? 'a one-line code block' : `a ${n}-line code block`),
        table: n => (n === 0 ? 'an empty table' : `a table of ${n} row${n === 1 ? '' : 's'}`),
        trace: n => (n === 1 ? 'a one-line error trace' : `an error trace of ${n} lines`),
        log: n => `a log of ${n} lines`,
        jsonObject: n => (n === 1 ? 'a JSON object with one key' : `a JSON object with ${n} keys`),
        jsonList: n => (n === 1 ? 'a JSON list of one item' : `a JSON list of ${n} items`),
        fileLine: (f, a, b) => (b === undefined ? `${f}, line ${a}` : `${f}, lines ${a} to ${b}`),
        id: 'an id',
        link: 'a link', image: 'an image', path: 'a path', more: 'There is more.', anAgent: 'an agent',
        events: { 'turn-ready': 'turn finished', question: 'asking you', stalled: 'stalled', ended: 'session ended', error: 'error' }
    },
    tr: {
        codeBlock: n => (n === 1 ? 'tek satırlık bir kod bloğu' : `${n} satırlık bir kod bloğu`),
        table: n => (n === 0 ? 'boş bir tablo' : `${n} satırlık bir tablo`),
        trace: n => (n === 1 ? 'tek satırlık bir hata izi' : `${n} satırlık bir hata izi`),
        log: n => `${n} satırlık bir günlük`,
        jsonObject: n => (n === 1 ? 'tek anahtarlı bir JSON nesnesi' : `${n} anahtarlı bir JSON nesnesi`),
        jsonList: n => (n === 1 ? 'tek öğeli bir JSON listesi' : `${n} öğeli bir JSON listesi`),
        fileLine: (f, a, b) => (b === undefined ? `${f}, satır ${a}` : `${f}, satır ${a} ile ${b} arası`),
        id: 'bir kimlik',
        link: 'bir bağlantı', image: 'bir görsel', path: 'bir dosya yolu', more: 'Devamı var.', anAgent: 'bir ajan',
        events: { 'turn-ready': 'tur bitti', question: 'sana soruyor', stalled: 'takıldı', ended: 'oturum bitti', error: 'hata' }
    }
};

/** English: what every reading said before languages were known, and the answer when nothing better is. */
export const EN_PHRASES: SpeechPhrases = SPEECH_PHRASES.en;
