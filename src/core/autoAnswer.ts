/**
 * K-43 — A QUESTION NOBODY IS IN THE ROOM FOR MUST NOT HOLD THE TURN FOR EVER.
 *
 * An agent that asks `AskUserQuestion` parks its turn until somebody answers.
 * On an attended card that is the whole point. On an unattended one — a night
 * shift, a queued task, a fleet running while the user sleeps — it is the same
 * deadlock X-230's family exists to remove, one layer up: the session is alive,
 * costing nothing, doing nothing, and nothing reports that it is stuck on a
 * question rather than on work.
 *
 * So the wait is BOUNDED, and what happens at the end of it is deterministic
 * rather than clever: the option the asking agent itself marked as recommended
 * is taken, and if it marked none, the first — which is the same thing, because
 * the tool's own contract puts the recommended option first.
 *
 * ‼️ THREE THINGS THIS DELIBERATELY WILL NOT DO, and each one is a decision.
 *
 * 1. **A permission ask is never auto-answered.** `interactive` tells the two
 *    apart on the wire (see `ConsoleAsk`): an `AskUserQuestion` IS the question
 *    and answering it picks between options the agent offered itself; an
 *    ordinary permission ask is "may this tool run, with this input" and
 *    answering that on a timer would hand an unattended machine to whatever
 *    asked. The clock is for the first kind only.
 * 2. **A question that reads as destructive is left alone, and says why.** The
 *    options belong to the agent, so nothing here can know what a label really
 *    does — but a choice that names deletion, a force push, a hard reset or a
 *    dropped table is exactly the one a person would want to be present for.
 *    Refusing to pick is honest; picking and hoping is not.
 * 3. **Nothing is invented when there is nothing to pick.** A question with no
 *    options has no deterministic answer, so the timer does not fire for it.
 *
 * Pure (no vscode import): the decision is testable without a window, and the
 * host and the panel read the SAME verdict rather than each forming an opinion.
 */

/** The settings this reads, by their contributed names — one source for the
 *  manifest, the category mapping and the reader. */
import {
    AUTO_ANSWER_DEFAULT_WORDS, AutoAnswerFilter, normalizeFilter, normalizeWords, stopWord
} from './autoAnswerFilter';

export const AUTO_ANSWER_ENABLED_KEY = 'agentFarm.console.autoAnswer.enabled';
export const AUTO_ANSWER_TIMEOUT_KEY = 'agentFarm.console.autoAnswer.timeoutSeconds';

/**
 * Five minutes. Long enough that somebody who stepped away from an attended
 * card comes back to their own question rather than to an answer; short enough
 * that an unattended fleet is not held overnight by one of them.
 */
export const AUTO_ANSWER_DEFAULT_SECONDS = 300;
/** Below this the countdown is theatre — the reader cannot read it and react. */
export const AUTO_ANSWER_MIN_SECONDS = 5;
/** Two hours. Past this, "waiting for a person" is the honest description. */
export const AUTO_ANSWER_MAX_SECONDS = 7200;

export interface AutoAnswerSettings {
    enabled: boolean;
    timeoutSeconds: number;
    /** K-45 — how much of a question the word list reads; `off` = no word keeps the clock from running */
    filter: AutoAnswerFilter;
    /** K-45 — the user's word list */
    words: string[];
}

/**
 * The settings as they will actually be used. An out-of-range number is CLAMPED
 * rather than refused — this is a wait, and a user who typed 1 meant "as soon as
 * possible", not "fail". A value that is not a number at all falls back to the
 * default, because guessing at intent from a string is how a 30-second wait
 * becomes no wait at all.
 */
export function autoAnswerSettings(raw: {
    enabled?: unknown; timeoutSeconds?: unknown; filter?: unknown; words?: unknown;
} | undefined): AutoAnswerSettings {
    const n = Number(raw?.timeoutSeconds);
    const seconds = Number.isFinite(n) && n > 0
        ? Math.min(AUTO_ANSWER_MAX_SECONDS, Math.max(AUTO_ANSWER_MIN_SECONDS, Math.round(n)))
        : AUTO_ANSWER_DEFAULT_SECONDS;
    return {
        // Only an explicit `false` turns it off: an absent setting is the
        // default, and the default is on.
        enabled: raw?.enabled !== false,
        timeoutSeconds: seconds,
        filter: normalizeFilter(raw?.filter),
        words: normalizeWords(raw?.words)
    };
}

/** The shape read off a pending ask — named structurally so this file never
 *  imports the panel's state. */
export interface AutoAnswerQuestion {
    question: string;
    header?: string;
    multiSelect?: boolean;
    options: { label: string; description?: string }[];
}

export interface AutoAnswerAsk {
    requestId: string;
    interactive: boolean;
    questions: AutoAnswerQuestion[];
    detail?: string;
    ts: number;
}

/**
 * ‼️ THE MARK THE ASKING AGENT PUTS ON ITS OWN PREFERRED OPTION, in both
 * languages the fleet speaks. The tool's contract asks for `(Recommended)` and
 * for that option to be first — so the mark and the position agree almost
 * always, and where they disagree the MARK wins: it is a statement, the
 * position is a convention.
 */
const RECOMMENDED = /\((?:recommended|önerilen|onerilen|tavsiye edilen)\)/i;

/** The recommended option, or the first — `null` when there is nothing to pick. */
export function recommendedOption(q: AutoAnswerQuestion | undefined): string | null {
    const options = (q?.options ?? []).filter(o => typeof o?.label === 'string' && o.label.trim());
    if (!options.length) { return null; }
    const marked = options.find(o => RECOMMENDED.test(o.label));
    return (marked ?? options[0]).label;
}

/**
 * The word that makes this question a person's to answer, or `null` — returned so
 * the card can SAY which word stopped it. K-45: the list and how much of the
 * question is read are the user's settings (`autoAnswerFilter.ts`); by default
 * only the question and the option the clock would pick are read.
 */
export function destructiveWord(
    ask: AutoAnswerAsk | undefined, filter: AutoAnswerFilter = 'all', words: string[] = AUTO_ANSWER_DEFAULT_WORDS
): string | null {
    return stopWord(ask, filter, words, q => recommendedOption(q as AutoAnswerQuestion));
}

/**
 * Why the clock is or is not running, as a code the card can branch on. The
 * card stays SILENT for `off` (the user switched it off and knows) and for
 * `permission` (no permission card ever carries a timer, so a line saying so on
 * every one is noise); it SAYS the other two, because a question that will not
 * be auto-answered looks exactly like one that will until it is too late.
 */
export type AutoAnswerReason = 'armed' | 'none' | 'off' | 'permission' | 'destructive' | 'nothing-to-pick';

export interface AutoAnswerVerdict {
    /** the clock runs for this ask */
    armed: boolean;
    /** the answers to send when it expires — only when `armed` */
    answers?: Record<string, string | string[]>;
    /** why it is not armed, in one sentence for the card; empty when it is */
    why: string;
    reason: AutoAnswerReason;
}

/**
 * The whole decision. Called both to arm the countdown and to build the answer
 * when it expires, so the card can never promise a pick the timer would not make.
 */
export function autoAnswerFor(
    ask: AutoAnswerAsk | undefined, settings: AutoAnswerSettings
): AutoAnswerVerdict {
    if (!ask) { return { armed: false, why: 'nothing is being asked.', reason: 'none' }; }
    if (!settings.enabled) {
        return { armed: false, why: `waiting for you — ${AUTO_ANSWER_ENABLED_KEY} is off.`, reason: 'off' };
    }
    if (!ask.interactive) {
        return {
            armed: false,
            why: 'waiting for you — this is a permission ask, and a permission is never '
                + 'answered on a timer.',
            reason: 'permission'
        };
    }
    const filter = settings.filter ?? 'recommended';
    const stopper = destructiveWord(ask, filter, settings.words ?? AUTO_ANSWER_DEFAULT_WORDS);
    if (stopper) {
        return {
            armed: false,
            why: `waiting for you — this question says "${stopper}", a word on your list (question timer filter: ${filter} — `
                + 'Farm Settings), and a choice that may not be undone is yours to make.',
            reason: 'destructive'
        };
    }
    const answers: Record<string, string | string[]> = {};
    for (const q of ask.questions ?? []) {
        const key = String(q?.question ?? '').trim();
        // K-45 — the strict filter answers only a question that MARKS its recommendation
        if (filter === 'strict' && !(q?.options ?? []).some(o => RECOMMENDED.test(String(o?.label ?? '')))) {
            return {
                armed: false,
                why: 'waiting for you — the strict question-timer filter answers only a question that marks '
                    + 'an option "(Recommended)", and this one marks none.',
                reason: 'nothing-to-pick'
            };
        }
        const pick = recommendedOption(q);
        if (!key || !pick) {
            return {
                armed: false,
                why: 'waiting for you — one of these questions offers nothing to pick, so there is '
                    + 'no deterministic answer to give it.',
                reason: 'nothing-to-pick'
            };
        }
        answers[key] = q.multiSelect ? [pick] : pick;
    }
    if (!Object.keys(answers).length) {
        return { armed: false, why: 'waiting for you — this ask carries no questions.', reason: 'nothing-to-pick' };
    }
    return { armed: true, answers, why: '', reason: 'armed' };
}

/** Where the countdown stands. `heldAt` freezes it — the reader pressed Hold. */
export interface AutoAnswerClock {
    dueAt: number;
    remainingMs: number;
    expired: boolean;
}

/**
 * ‼️ MEASURED FROM THE ASK, NOT FROM WHEN THE PANEL NOTICED IT. A card opened
 * four minutes into a five-minute wait must show one minute left, not five —
 * otherwise reloading the window silently buys the question another wait, and
 * the countdown the reader is watching is not the one that decides.
 */
export function autoAnswerClock(
    ask: AutoAnswerAsk | undefined, settings: AutoAnswerSettings, now: number, heldAt?: number
): AutoAnswerClock | null {
    if (!ask) { return null; }
    const dueAt = ask.ts + settings.timeoutSeconds * 1000;
    const at = heldAt && heldAt > 0 ? Math.min(heldAt, now) : now;
    const remainingMs = Math.max(0, dueAt - at);
    return { dueAt, remainingMs, expired: !heldAt && remainingMs === 0 };
}

/** `M:SS`, or `H:MM:SS` past an hour — the shortest unambiguous form (SHORTHAND). */
export function formatCountdown(remainingMs: number): string {
    const total = Math.max(0, Math.ceil(remainingMs / 1000));
    const s = total % 60;
    const m = Math.floor(total / 60) % 60;
    const h = Math.floor(total / 3600);
    const two = (n: number) => (n < 10 ? '0' : '') + n;
    return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

/**
 * The line the transcript keeps when the clock ran out. It names the picks, so
 * the conversation records WHAT was chosen for the user and not merely that
 * something was.
 */
export function autoAnswerNote(answers: Record<string, string | string[]> | undefined): string {
    const picks = Object.entries(answers ?? {})
        .map(([q, a]) => `${q} → ${Array.isArray(a) ? a.join(', ') : a}`)
        .filter(line => !line.endsWith('→ '));
    return picks.length
        ? `⏱️ Zaman aşımı: önerilen seçenekler seçildi — ${picks.join(' · ')}`
        : '⏱️ Zaman aşımı: önerilen seçenekler seçildi';
}

/**
 * ‼️ WHAT THE AGENT IS TOLD, beside the picks. Without it the tool result reads
 * exactly like the user choosing, and the agent carries on believing a person
 * agreed. It rides as `response`, which `askInput` folds together with the
 * picks — the one channel the CLI never drops (X-166).
 */
export function autoAnswerResponse(timeoutSeconds: number): string {
    return `(No answer came within ${formatCountdown(timeoutSeconds * 1000)} — Agent Farm chose the `
        + 'recommended option automatically; the user did not pick it. If the choice matters, say so '
        + 'where they will see it.)';
}

/** What the card draws under a pending ask — one verdict, read by the page and the bridge. */
export interface AutoAnswerView {
    requestId: string;
    /** `armed` counts down · `held` was stopped by a person · `waiting` never ran */
    state: 'armed' | 'held' | 'waiting';
    reason: AutoAnswerReason;
    why: string;
    /** when the clock runs out (epoch ms); 0 when it never ran */
    dueAt: number;
    heldAt?: number;
    timeoutSeconds: number;
    /** the labels the timer will choose, in question order */
    picks: string[];
}

export function autoAnswerView(
    ask: AutoAnswerAsk | undefined, settings: AutoAnswerSettings, heldAt?: number
): AutoAnswerView | null {
    if (!ask) { return null; }
    const verdict = autoAnswerFor(ask, settings);
    const base = { requestId: ask.requestId, timeoutSeconds: settings.timeoutSeconds };
    if (!verdict.armed) {
        return { ...base, state: 'waiting', reason: verdict.reason, why: verdict.why, dueAt: 0, picks: [] };
    }
    const picks = Object.values(verdict.answers ?? {}).flatMap(a => (Array.isArray(a) ? a : [a]));
    const dueAt = ask.ts + settings.timeoutSeconds * 1000;
    return heldAt && heldAt > 0
        ? {
            ...base, state: 'held', reason: 'armed', dueAt, heldAt, picks,
            why: 'waiting for you — the timer was stopped, so nothing will be chosen for you.'
        }
        : { ...base, state: 'armed', reason: 'armed', why: '', dueAt, picks };
}
