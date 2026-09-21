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
}

/**
 * The settings as they will actually be used. An out-of-range number is CLAMPED
 * rather than refused — this is a wait, and a user who typed 1 meant "as soon as
 * possible", not "fail". A value that is not a number at all falls back to the
 * default, because guessing at intent from a string is how a 30-second wait
 * becomes no wait at all.
 */
export function autoAnswerSettings(raw: {
    enabled?: unknown; timeoutSeconds?: unknown;
} | undefined): AutoAnswerSettings {
    const n = Number(raw?.timeoutSeconds);
    const seconds = Number.isFinite(n) && n > 0
        ? Math.min(AUTO_ANSWER_MAX_SECONDS, Math.max(AUTO_ANSWER_MIN_SECONDS, Math.round(n)))
        : AUTO_ANSWER_DEFAULT_SECONDS;
    return {
        // Only an explicit `false` turns it off: an absent setting is the
        // default, and the default is on.
        enabled: raw?.enabled !== false,
        timeoutSeconds: seconds
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
 * ‼️ THE VOCABULARY THAT STOPS THE CLOCK. Deliberately read over the question,
 * the headers, every option label AND every description — a label reading
 * "Yes" is safe until the description under it says "deletes the branch".
 *
 * English and Turkish, because the fleet asks in both. This list is a filter,
 * not a judgement: a false positive costs a question that waits for a person,
 * which is the outcome the feature is allowed to fall back to. A false negative
 * costs an unattended machine doing something irreversible, which it is not.
 */
const DESTRUCTIVE = [
    /\bdelet(e|es|ing|ion)\b/i, /\bdrop(ping)? (the )?(table|database|schema|index)\b/i,
    /\bforce[- ]push\b/i, /\bpush --force\b/i, /--force-with-lease/i,
    /\breset --hard\b/i, /\brm -rf\b/i, /\bwipe[sd]?\b/i, /\bpurge[sd]?\b/i,
    /\bdestroy(s|ed|ing)?\b/i, /\boverwrit(e|es|ing|ten)\b/i, /\btruncate[sd]?\b/i,
    /\birreversible\b/i, /\bcannot be undone\b/i, /\bpermanently\b/i, /\brevoke[sd]?\b/i,
    /\buninstall(s|ed|ing)?\b/i, /\bkill (the )?(process|session|task)\b/i,
    /\bsil(?:\b|mek|er|in|inir|iniyor|inecek)/i, /\bkaldır(?:\b|mak|ır|ılır|ılacak)/i,
    /\bgeri alınamaz\b/i, /\bkalıcı olarak\b/i, /\büzerine yaz/i, /\bsıfırla(?:\b|mak|r|nır)/i
];

/**
 * The word that makes this question a person's to answer, or `null`. Returned
 * rather than a boolean so the card can SAY which word stopped it — a silent
 * refusal to auto-answer looks exactly like the feature being switched off.
 */
export function destructiveWord(ask: AutoAnswerAsk | undefined): string | null {
    const haystack: string[] = [String(ask?.detail ?? '')];
    for (const q of ask?.questions ?? []) {
        haystack.push(String(q?.question ?? ''), String(q?.header ?? ''));
        for (const o of q?.options ?? []) {
            haystack.push(String(o?.label ?? ''), String(o?.description ?? ''));
        }
    }
    for (const text of haystack) {
        for (const re of DESTRUCTIVE) {
            const hit = re.exec(text);
            if (hit) { return hit[0]; }
        }
    }
    return null;
}

export interface AutoAnswerVerdict {
    /** the clock runs for this ask */
    armed: boolean;
    /** the answers to send when it expires — only when `armed` */
    answers?: Record<string, string | string[]>;
    /** why it is not armed, in one sentence for the card; empty when it is */
    why: string;
}

/**
 * The whole decision. Called both to arm the countdown and to build the answer
 * when it expires, so the card can never promise a pick the timer would not make.
 */
export function autoAnswerFor(
    ask: AutoAnswerAsk | undefined, settings: AutoAnswerSettings
): AutoAnswerVerdict {
    if (!ask) { return { armed: false, why: 'nothing is being asked.' }; }
    if (!settings.enabled) {
        return { armed: false, why: `waiting for you — ${AUTO_ANSWER_ENABLED_KEY} is off.` };
    }
    if (!ask.interactive) {
        return {
            armed: false,
            why: 'waiting for you — this is a permission ask, and a permission is never '
                + 'answered on a timer.'
        };
    }
    const stopper = destructiveWord(ask);
    if (stopper) {
        return {
            armed: false,
            why: `waiting for you — this question says "${stopper}", and a choice that may not be `
                + 'undone is yours to make.'
        };
    }
    const answers: Record<string, string | string[]> = {};
    for (const q of ask.questions ?? []) {
        const key = String(q?.question ?? '').trim();
        const pick = recommendedOption(q);
        if (!key || !pick) {
            return {
                armed: false,
                why: 'waiting for you — one of these questions offers nothing to pick, so there is '
                    + 'no deterministic answer to give it.'
            };
        }
        answers[key] = q.multiSelect ? [pick] : pick;
    }
    if (!Object.keys(answers).length) {
        return { armed: false, why: 'waiting for you — this ask carries no questions.' };
    }
    return { armed: true, answers, why: '' };
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
