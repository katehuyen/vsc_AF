/**
 * U-208 — WHAT A READING SAYS WHEN THE AGENT STOPS ON YOU.
 *
 * A turn parked on a question or a permission ask has no answer to read — the
 * text before it is half an answer. What the person across the room needs is
 * the QUESTION: "developer asks: Which database? Options: Postgres, SQLite." or
 * "developer wants to run: npm test". Pure: the host hands over what it knows
 * of the ask (the Console's card, or the hook's last tool start) and the words
 * of the voice that will read it.
 */
import type { SpeechPhrases } from './speechPhrases';

export interface SpokenAsk {
    tool?: string;
    detail?: string;
    questions: { question: string; options: string[] }[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * The ask, from the Console's pending card when there is one (it names the
 * exact tool and its questions), else from the session's last tool start —
 * the tool a hook-watched session is waiting for permission on.
 */
export function askFrom(pending: unknown, tool?: string, detail?: string): SpokenAsk {
    const p = pending && typeof pending === 'object' ? pending as Record<string, unknown> : undefined;
    const raw = p && Array.isArray(p.questions) ? p.questions as unknown[] : [];
    const questions = raw
        .map(q => (q && typeof q === 'object' ? q as Record<string, unknown> : {}))
        .map(q => ({
            question: str(q.question),
            options: (Array.isArray(q.options) ? q.options as unknown[] : [])
                .map(o => str(o && typeof o === 'object' ? (o as Record<string, unknown>).label : o)).filter(Boolean)
        }))
        .filter(q => q.question);
    return p
        ? { tool: str(p.tool) || undefined, detail: str(p.detail) || undefined, questions }
        : { tool: str(tool) || undefined, detail: str(detail) || undefined, questions };
}

/** The text whose language picks the voice: what the agent wrote, not the tool's name. */
export function askSense(ask: SpokenAsk): string {
    return ask.questions.length
        ? ask.questions.map(q => [q.question, ...q.options].join(' ')).join(' ')
        : ask.detail ?? '';
}

const RUNS = /^(?:bash|powershell)$/i;
const ASKS = /^askuserquestion$/i;

/**
 * The sentence to read ('' = nothing worth reading). Each question is a block
 * of its own so the cleaner ends each with a stop; a question tool whose
 * questions are not known reads nothing — the announcement already says that
 * it is asking, and guessing the question would be worse than silence.
 */
export function askSpoken(who: string, ask: SpokenAsk, words: SpeechPhrases): string {
    const name = who.trim() || words.anAgent;
    if (ask.questions.length) {
        return ask.questions.map((q, i) => [
            i === 0 ? `${words.asks(name)}: ${q.question}` : q.question,
            q.options.length ? `${words.options}: ${q.options.join(', ')}.` : ''
        ].filter(Boolean).join('\n\n')).join('\n\n');
    }
    const tool = ask.tool ?? '';
    if (!tool || ASKS.test(tool)) { return ''; }
    const head = RUNS.test(tool) ? words.wantsToRun(name) : words.wantsToUse(name, tool);
    return ask.detail ? `${head}: ${ask.detail}` : `${head}.`;
}
