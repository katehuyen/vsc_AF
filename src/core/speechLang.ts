/**
 * U-203 — WHICH LANGUAGE A READING IS IN, AND WHICH VOICE READS IT.
 *
 * A reading was voiced by whatever the setting named, else the system default:
 * a Turkish answer read by an en-US voice is unintelligible. So:
 *   - the text's language is SENSED from its script, its letters and its most
 *     common words — fenced code, inline code, links and paths are left out,
 *     being English-shaped whatever the prose around them is;
 *   - with no voice chosen (Auto), the installed voice whose culture matches
 *     reads it; a voice chosen by hand always wins;
 *   - the words the reading inserts follow the voice that speaks
 *     (`speechPhrases.ts`).
 * The table starts with English and Turkish and is data: a language is one
 * entry here and one in `speechPhrases.ts`.
 *
 * Pure: the text and the installed voices in, the choice out.
 */
import { InstalledVoice, matchVoice } from './speech';
import { EN_PHRASES, SPEECH_PHRASES, SpeechPhrases } from './speechPhrases';

export interface SpeechLang {
    /** BCP-47 primary tag — what a voice's culture starts with */
    tag: string;
    /** its name, as the Sound page says it */
    name: string;
    /** letters only this language carries among the table's */
    letters?: RegExp;
    /** a script of its own: every letter in it is a strong sign */
    script?: RegExp;
    /** its most common short words */
    words: readonly string[];
}

export const SPEECH_LANGS: readonly SpeechLang[] = [
    {
        tag: 'en', name: 'English',
        words: ['the', 'and', 'is', 'are', 'to', 'of', 'in', 'that', 'it', 'for', 'with', 'this', 'you', 'was', 'not', 'on', 'be', 'have', 'will', 'can', 'what', 'which', 'from', 'now']
    },
    {
        tag: 'tr', name: 'Turkish', letters: /[çğışÇĞİŞ]/g,
        words: ['ve', 'bir', 'bu', 'için', 'ile', 'da', 'de', 'mi', 'ne', 'çok', 'daha', 'olarak', 'var', 'yok', 'gibi', 'ama', 'şu', 'ki', 'değil', 'sonra', 'şimdi', 'her', 'ben', 'sen', 'neden', 'nasıl']
    }
];

const known = (tag: string): boolean => SPEECH_LANGS.some(l => l.tag === tag);

/** `tr-TR` → `tr`; '' when the culture names none of the table's languages. */
export function langOfCulture(culture: string | undefined): string {
    const tag = String(culture ?? '').trim().toLowerCase().split(/[-_]/)[0];
    return known(tag) ? tag : '';
}

export function phrasesFor(lang: string | undefined): SpeechPhrases {
    return SPEECH_PHRASES[String(lang ?? '')] ?? EN_PHRASES;
}

function proseOf(text: string): string {
    return text
        .replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\1[^\n]*$|(?![\s\S]))/gm, ' ')
        .replace(/`[^`\n]*`/g, ' ')
        .replace(/https?:\/\/\S+/gi, ' ')
        .replace(/[\w.-]*[/\\][\w./\\-]+/g, ' ');
}

/**
 * The language of a text, or '' when it gives no sign. A distinctive letter
 * counts three, a common word one, a letter of a language's own script two;
 * the winner needs at least two and must lead the runner-up.
 */
export function detectLang(text: string | undefined): string {
    const prose = proseOf(String(text ?? ''));
    const words = prose.toLocaleLowerCase('tr').match(/\p{L}+/gu) ?? [];
    if (!words.length) { return ''; }
    const scored = SPEECH_LANGS.map(l => {
        const set = new Set(l.words);
        let score = words.filter(w => set.has(w)).length;
        if (l.letters) { score += (prose.match(l.letters) ?? []).length * 3; }
        if (l.script) { score += (prose.match(l.script) ?? []).length * 2; }
        return { tag: l.tag, score };
    }).sort((a, b) => b.score - a.score);
    const [top, next] = scored;
    return top.score >= 2 && top.score > (next ? next.score : 0) ? top.tag : '';
}

/** The installed voice that speaks `lang`: OneCore first (where language packs go), then by name. */
export function voiceForLang(voices: readonly InstalledVoice[], lang: string): InstalledVoice | undefined {
    if (!lang) { return undefined; }
    return voices.filter(v => langOfCulture(v.culture) === lang)
        .sort((a, b) => (a.engine === 'onecore' ? 0 : 1) - (b.engine === 'onecore' ? 0 : 1) || a.name.localeCompare(b.name))[0];
}

export interface SpeechChoice {
    /** what the speaker is handed: a chosen name as written, an Auto match's token id, or '' (the system's own voice) */
    voice: string;
    /** the language of the words the reading inserts */
    lang: string;
    /** chosen by hand · matched to the text (auto) · nothing installed speaks it (default) */
    how: 'chosen' | 'auto' | 'default';
    match?: InstalledVoice;
}

/**
 * ‼️ A VOICE CHOSEN BY HAND ALWAYS WINS; Auto ('') matches the text. `fallback`
 * is the language assumed when the text gives no sign — the interface's. The
 * inserted words follow the voice that speaks: a chosen voice's own culture,
 * else the text's language.
 */
export function chooseSpeechVoice(want: string, text: string, voices: readonly InstalledVoice[], fallback: string): SpeechChoice {
    const chosen = String(want ?? '').trim();
    const sensed = detectLang(text) || langOfCulture(fallback) || SPEECH_LANGS[0].tag;
    if (chosen) {
        const hit = matchVoice([...voices], chosen);
        return { voice: chosen, lang: langOfCulture(hit?.culture) || sensed, how: 'chosen', ...(hit ? { match: hit } : {}) };
    }
    const v = voiceForLang(voices, sensed);
    return v ? { voice: v.id, lang: sensed, how: 'auto', match: v } : { voice: '', lang: sensed, how: 'default' };
}

/** What Auto reads each of the table's languages with — the Sound page's answer, a missing voice included. */
export function autoVoices(voices: readonly InstalledVoice[]): { tag: string; name: string; voice?: InstalledVoice }[] {
    return SPEECH_LANGS.map(l => {
        const v = voiceForLang(voices, l.tag);
        return { tag: l.tag, name: l.name, ...(v ? { voice: v } : {}) };
    });
}
