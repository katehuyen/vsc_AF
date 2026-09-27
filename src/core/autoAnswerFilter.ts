/**
 * K-45 — WHICH QUESTIONS THE CLOCK LEAVES FOR A PERSON, decided by the USER's settings.
 *
 * 2026-09-27: a night relay stood still for ~3 hours because one word ("silinen")
 * in the description of an option the timer would never have picked matched the
 * built-in list — the clock was never armed. The list and how much of a question
 * it reads are now the user's: a mode and a word list, both settings, both on the
 * Farm Settings page. Pure: the host, the card and the tests read one verdict.
 */

export type AutoAnswerFilter = 'off' | 'recommended' | 'all' | 'strict';
export const AUTO_ANSWER_FILTERS: AutoAnswerFilter[] = ['off', 'recommended', 'all', 'strict'];
export const AUTO_ANSWER_FILTER_KEY = 'agentFarm.console.autoAnswer.filter';
export const AUTO_ANSWER_WORDS_KEY = 'agentFarm.console.autoAnswer.words';
/** The user's decision (2026-09-27): read only what the clock would actually choose. */
export const AUTO_ANSWER_DEFAULT_FILTER: AutoAnswerFilter = 'recommended';

/**
 * The shipped list (package.json carries the same default — a test pins them).
 * An entry matches at the START of a word, any case: "silin" catches "silinen",
 * "overwrite" catches "overwrites". An entry written `/…/` is a regular expression.
 */
export const AUTO_ANSWER_DEFAULT_WORDS: string[] = [
    'delete', 'deleting', 'deletion', 'drop table', 'drop the table', 'drop database', 'drop schema', 'drop index',
    'force push', 'force-push', 'push --force', '--force-with-lease', 'reset --hard', 'rm -rf',
    'wipe', 'purge', 'destroy', 'overwrite', 'overwriting', 'overwritten', 'truncate', 'truncating',
    'irreversible', 'cannot be undone', 'permanently', 'revoke', 'uninstall',
    'kill process', 'kill the process', 'kill session', 'kill the session', 'kill task', 'kill the task',
    '/\\bsil\\b/', 'silmek', 'silme', 'siler', 'silin', 'silecek',
    'kaldır', 'geri alınamaz', 'kalıcı olarak', 'üzerine yaz', 'sıfırla'
];

export function normalizeFilter(v: unknown): AutoAnswerFilter {
    return AUTO_ANSWER_FILTERS.includes(v as AutoAnswerFilter) ? v as AutoAnswerFilter : AUTO_ANSWER_DEFAULT_FILTER;
}

/** The user's list, trimmed and de-duplicated; anything that is not a list is the shipped one. An EMPTY list is kept — it is a choice. */
export function normalizeWords(v: unknown): string[] {
    if (!Array.isArray(v)) { return AUTO_ANSWER_DEFAULT_WORDS.slice(); }
    const out: string[] = [];
    for (const w of v) {
        const t = typeof w === 'string' ? w.trim() : '';
        if (t && !out.some(x => x.toLowerCase() === t.toLowerCase())) { out.push(t); }
    }
    return out;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** One entry as a matcher; a `/…/` that does not compile is matched as the literal text instead of failing. */
export function wordMatcher(word: string): RegExp {
    const m = /^\/(.+)\/([a-z]*)$/i.exec(word);
    if (m) {
        try { return new RegExp(m[1], m[2].includes('i') ? m[2] : m[2] + 'i'); } catch { /* literal below */ }
    }
    return new RegExp('(?:^|[^\\p{L}\\p{N}])(' + escape(word) + '[\\p{L}\\p{N}]*)', 'iu');
}

interface FilterQuestion { question?: string; header?: string; options?: { label?: string; description?: string }[] }

/** What one mode reads: `recommended` = the question and the option the clock would pick; `all`/`strict` = every option too. */
export function filterHaystack(
    ask: { detail?: string; questions?: FilterQuestion[] } | undefined,
    filter: AutoAnswerFilter, pick: (q: FilterQuestion) => string | null
): string[] {
    if (!ask || filter === 'off') { return []; }
    const out: string[] = [String(ask.detail ?? '')];
    for (const q of ask.questions ?? []) {
        out.push(String(q?.question ?? ''), String(q?.header ?? ''));
        const chosen = pick(q);
        for (const o of q?.options ?? []) {
            if (filter === 'recommended' && o?.label !== chosen) { continue; }
            out.push(String(o?.label ?? ''), String(o?.description ?? ''));
        }
    }
    return out;
}

/** The first listed word the mode finds, as written in the question; null = no word keeps the clock from running. */
export function stopWord(
    ask: { detail?: string; questions?: FilterQuestion[] } | undefined,
    filter: AutoAnswerFilter, words: string[], pick: (q: FilterQuestion) => string | null
): string | null {
    const texts = filterHaystack(ask, filter, pick);
    for (const text of texts) {
        for (const w of words) {
            const hit = wordMatcher(w).exec(text);
            if (hit) { return (hit[1] ?? hit[0]).trim(); }
        }
    }
    return null;
}
