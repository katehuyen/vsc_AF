/**
 * K-45 — A TOUCH ON THE CARD NEVER STOPS THE CLOCK. What the person already
 * picked is kept, and at expiry only the questions they left open get the
 * recommended option. Pure: the timers hold the picks, this decides what they mean.
 */
import {
    AutoAnswerAsk, AutoAnswerSettings, AutoAnswerView, autoAnswerFor, autoAnswerNote, autoAnswerResponse,
    formatCountdown
} from './autoAnswer';

export type AskAnswers = Record<string, string | string[]>;

/** The page's picks cut to this ask's own questions and options — anything else is dropped. */
export function ownPicks(ask: AutoAnswerAsk | undefined, raw: unknown): AskAnswers {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const out: AskAnswers = {};
    for (const q of ask?.questions ?? []) {
        const key = String(q?.question ?? '').trim();
        const labels = new Set((q?.options ?? []).map(o => String(o?.label ?? '')));
        const v = src[q?.question] ?? src[key];
        const list = (Array.isArray(v) ? v : [v])
            .filter((x): x is string => typeof x === 'string' && labels.has(x));
        if (!key || !list.length) { continue; }
        out[key] = q.multiSelect ? list : list[0];
    }
    return out;
}

export interface TimeoutAnswer {
    answers: AskAnswers;
    /** questions the person answered themselves */
    own: string[];
    /** questions the timer answered with the recommended option */
    filled: string[];
}

/** The timer's recommended answers with the person's own picks laid over them, question order kept. */
export function mergeOwn(recommended: AskAnswers, own: AskAnswers): TimeoutAnswer {
    const answers: AskAnswers = { ...recommended };
    const mine: string[] = [];
    for (const [q, a] of Object.entries(own)) {
        if (!(q in answers)) { continue; }
        answers[q] = a;
        mine.push(q);
    }
    return { answers, own: mine, filled: Object.keys(answers).filter(q => !mine.includes(q)) };
}

/** The transcript line when the clock ran out — whose pick each answer was. */
export function ownNote(t: TimeoutAnswer): string {
    if (!t.own.length) { return autoAnswerNote(t.answers); }
    const line = (q: string) => {
        const a = t.answers[q];
        return `${q} → ${Array.isArray(a) ? a.join(', ') : a}${t.own.includes(q) ? ' (senin seçimin)' : ' (önerilen)'}`;
    };
    const head = t.filled.length
        ? '⏱️ Zaman aşımı: seçtiklerin gönderildi, boş kalanlara önerilen seçildi'
        : '⏱️ Zaman aşımı: seçtiklerin gönderildi';
    return `${head} — ${Object.keys(t.answers).map(line).join(' · ')}`;
}

/** What the agent is told beside the picks: which were the person's and which the timer's. */
export function ownResponse(timeoutSeconds: number, t: TimeoutAnswer, typed = ''): string {
    const words = typed.trim();
    const said = words ? ` The user had typed this but did not send it: "${words}".` : '';
    if (!t.own.length) {
        const base = autoAnswerResponse(timeoutSeconds);
        return said ? base.replace(/ If the choice matters/, `${said} If the choice matters`) : base;
    }
    const rest = t.filled.length
        ? ` For ${t.filled.map(q => `"${q}"`).join(', ')} the user picked nothing, so Agent Farm chose the `
            + 'recommended option — the user did not pick that.'
        : '';
    return `(No answer was sent within ${formatCountdown(timeoutSeconds * 1000)} — Agent Farm sent the options the user `
        + `had picked without pressing Send.${rest}${said} If the choice matters, say so where they will see it.)`;
}

/** The card's "then … is chosen for you" names the person's picks where they made one. */
export function ownView(
    view: AutoAnswerView | null, ask: AutoAnswerAsk | undefined, settings: AutoAnswerSettings, own: AskAnswers
): AutoAnswerView | null {
    if (!view || view.state !== 'armed' || !Object.keys(own).length) { return view; }
    const verdict = autoAnswerFor(ask, settings);
    if (!verdict.answers) { return view; }
    const merged = mergeOwn(verdict.answers, own).answers;
    return { ...view, picks: Object.values(merged).flatMap(a => (Array.isArray(a) ? a : [a])) };
}
