import { normalizeSupervisor, statedSupervisor, SupervisorPolicy } from './retrySupervisor';

/**
 * ‼️ M-3 — WHAT HAPPENS WHEN A RUN FAILS, AS A SETTING RATHER THAN A SECRET.
 *
 * Agent Farm already retried tasks, and that was the problem: it did it with
 * numbers nobody could see or change (six attempts, forty minutes) and only for
 * one kind of failure (the Claude session limit), decided by matching the
 * output against a regular expression and by parsing the attempt number out of
 * the task's TITLE. Everything else — a flaky network, a tool that was busy, a
 * push that raced a colleague — was final on the first try, at three in the
 * morning, with nobody watching.
 *
 * So retrying is a policy, it rides with the work like every other run
 * dimension (`RunDimensions`), and it answers exactly the questions a person
 * asks about it:
 *
 *   · SHOULD it retry at all                       → `max` (0 = never)
 *   · HOW MANY times                                → `max`
 *   · HOW LONG before the first one                 → `delayMin`
 *   · …and before the second and the third          → `delay2Min` · `delay3Min`
 *   · AND BEFORE THE ONES AFTER THAT                → `backoff` (+ `formula`, `capMin`)
 *   · WITH WHAT — the same prompt, or another       → `prompt`
 *   · AND FOR WHICH failures                        → `when`
 *   · …and when the failure was a LIMIT, whether to
 *     wait for the window to reset instead          → `resetAware` + `safetyBufferMin`
 *
 * ‼️ M-10 — THE THREE MIDDLE ANSWERS AND THE LAST TWO ARE THIS ROUND'S WORK.
 * M-3 asked for them in as many words ("let the user set the first three waits
 * one by one, and let the rest follow a formula rather than a fixed shape") and
 * they were not built: the policy carried a single `delayMin` and a two-valued
 * `backoff`. A retry against a usage limit was therefore always a guess at a
 * duration, when the CLI had just printed the exact hour the window reopens.
 *
 * Pure: no vscode, no fs, no clock beyond what is handed in. The manager owns
 * the timer; this owns every rule about whether there should be one.
 */

/**
 * How the wait grows for retry 4 and after.
 *
 * ‼️ `same` and `double` are the two this file shipped with and they still mean
 * exactly what they meant; a policy written before M-10 computes the same
 * minutes today. `linear` and `formula` are the new ones, and `formula` is the
 * one the item actually asked for — "not condemned to a fixed shape".
 */
export type RetryBackoff = 'same' | 'double' | 'linear' | 'formula';

/** Which failures are worth trying again. */
export type RetryWhen = 'any' | 'limit';

/** ‼️ M-10 — a retry is a fresh run (`simple`) or a continuation of the one that
 *  was cut off (`smart`). Absent means `simple`, for every policy ever written.
 *  ‼️ M-13 — `supervisor` is `smart` whose continuation after a limit is decided
 *  by a bounded agent (retrySupervisor.ts); `smart` is its fallback. */
export type RetryBehavior = 'simple' | 'smart' | 'supervisor';

/** ‼️ M-10 — what `smart` does when it cannot tell whether work happened. */
export type UnknownProgressFallback = 'park' | 'simple' | 'stop' | 'ask';

export interface RetryPolicy {
    /**
     * ‼️ M-10 — WHAT A RETRY *IS*, WHICH IS TWO DIFFERENT THINGS.
     *
     * `simple` (the default, and what every policy written before this field
     * means) — a retry is a FRESH run: the original prompt, or `prompt` below,
     * sent into a new conversation with no memory of the last one. Right when
     * the failure was outside the work: the CLI refused to start, a lock was
     * held, the window was spent before anything began.
     *
     * `smart` — a retry after a run that had ALREADY DONE WORK is not a repeat,
     * it is a continuation. Sending the original prompt again would tell an
     * engine with no memory to redo forty-five minutes it cannot see. So this
     * mode reads M-12's `phase`: work that never started is retried normally,
     * and work that was CUT OFF is resumed — the same session, S-19's resume,
     * with `continuationPrompt` as the next turn.
     *
     * ‼️ It is opt-in and no migration turns it on. A policy that says nothing
     * is `simple`, for ever.
     */
    behavior?: RetryBehavior;
    /**
     * ‼️ M-10 — WHAT TO SAY WHEN PICKING WORK BACK UP, as opposed to starting it.
     *
     * Sent as the NEXT TURN of the run's own conversation, so it may be short —
     * everything the run knew is still in front of it. Empty uses the
     * documented default. Placeholders: {taskTitle}, {attempt}, {failureReason},
     * {resetAt}, {progressSummary}.
     */
    continuationPrompt?: string;
    /** The 2nd continuation, when picking up twice needs different words from
     *  picking up once. Absent = `continuationPrompt`. */
    continuationPrompt2?: string;
    /** The 3rd and every one after it. Absent = `continuationPrompt2`, then
     *  `continuationPrompt`. */
    continuationPromptLater?: string;
    /**
     * ‼️ M-10 — WHAT TO DO WHEN NOBODY CAN SAY WHETHER WORK HAPPENED.
     *
     * `phase: 'unknown'` is a real state (the transcript is not bound yet, or
     * the engine published nothing), and the one thing that must NOT follow it
     * is blindly resending the original prompt as if the run had been idle.
     * `park` — hold it visibly and say why (the default). `simple` — treat it
     * as an ordinary retry. `stop` — do not retry at all. `ask` — hold it and
     * put the question to the user.
     */
    unknownProgressFallback?: UnknownProgressFallback;
    /**
     * ‼️ X-226 (round 2) — AT A LIMIT, WHICH SIGN-IN CARRIES THE WORK ON.
     *
     * ABSENT IS "STAY": the run keeps the sign-in it was given and waits for
     * that plan's reset, which is what the user asked for by choosing it. The
     * first cut of X-226 moved a walled run onto whichever account had room,
     * with no setting and no question — the user had picked one account for
     * the night on purpose and woke up to another plan spent. So the handover
     * is OPT-IN and this field is the switch: a policy id (`@emptiest`,
     * `@round-robin`, `@<named rule>`) lets that rule choose among the OTHER
     * accounts of the engine; a slot id names the one account to carry on with.
     */
    carryOn?: string;
    /** ‼️ M-13 — who judges the continuation when `behavior` is `supervisor` (retrySupervisor.ts); U-151: only the fields this level said — resolveRetry makes it whole */
    supervisor?: Partial<SupervisorPolicy>;
    /** How many times to try AGAIN after a failure. 0 (or absent) = never. */
    max?: number;
    /** Minutes to wait before the FIRST retry — and the `base` every strategy
     *  and every formula below is written in terms of. */
    delayMin?: number;
    /**
     * ‼️ M-10 — RETRY 2 AND RETRY 3, EACH ON ITS OWN.
     *
     * "Try again in five minutes; if that fails give it twenty; if THAT fails
     * leave it an hour" is the shape a person actually wants for the first
     * handful of attempts, and it is not any curve. Absent means "whatever the
     * strategy below says for that attempt", so a policy that never states them
     * behaves precisely as it did before these fields existed.
     */
    delay2Min?: number;
    delay3Min?: number;
    /**
     * `same` — every retry waits `delayMin`.
     * `double` — the wait doubles each time (delayMin, ×2, ×4 …), which is what
     * you want against something that is busy rather than broken: hammering a
     * rate limit at a fixed interval is how a retry policy becomes the problem.
     * `linear` — delayMin × n.
     * `formula` — `formula` below, evaluated for each attempt.
     */
    backoff?: RetryBackoff;
    /**
     * ‼️ M-10 — THE WAIT FOR RETRY 4+, IN ARITHMETIC, AND NEVER THROUGH `eval`.
     *
     * Three variables (`n` — which retry this is, `prev` — the wait before it,
     * `base` — `delayMin`), the four operators, `^`, `min()`, `max()` and
     * brackets. That is the whole language: it is tokenised and parsed by
     * `compileRetryFormula`, so a string that is not arithmetic is REFUSED with
     * the position it went wrong at, rather than being handed to a language
     * runtime that would happily run it. `eval` here would be a code-execution
     * hole in a field that travels over the bridge and out of a settings file.
     */
    formula?: string;
    /** The longest any computed wait may become, in minutes. Absent = the
     *  built-in 12-hour ceiling, which still applies on top of this. */
    capMin?: number;
    /**
     * What to send on a retry. Empty = the original prompt again, which is the
     * right default for a run that failed for a reason outside itself. A
     * different prompt is for the other case — "you failed; read the output and
     * fix the thing you got wrong" — and it is sent INSTEAD of the original,
     * not appended, because a retry is a fresh headless run with no memory of
     * the last one.
     */
    prompt?: string;
    /**
     * `limit` — only when the failure was the Claude usage/session limit, i.e.
     * the work was never actually attempted. This is what the extension did for
     * everybody before there was a setting, so it stays the default.
     * `any` — any non-zero exit.
     */
    when?: RetryWhen;
    /**
     * ‼️ M-10 — WAIT FOR THE WINDOW, NOT FOR A NUMBER.
     *
     * When the run actually hit a usage/session limit, the engine has already
     * said when it reopens — either as structured data (the Claude usage
     * endpoint, Codex's own `rate_limits.resets_at`) or in the sentence it
     * printed ("resets 5am"). Guessing forty minutes against that is either a
     * wasted attempt or an hour of dead time.
     *
     * So with this on, the FIRST retry's moment is `resetAt + safetyBufferMin`
     * — an absolute time, not a duration, which is what makes it survive a
     * restart. Retries 2 and 3 use their own stated minutes and 4+ the strategy,
     * because by then the window question has been answered.
     */
    resetAware?: boolean;
    /** How long after the stated reset to actually go, in minutes. The window
     *  reopening and the CLI agreeing that it has are not the same instant. */
    safetyBufferMin?: number;
}

/**
 * ‼️ THE DEFAULT IS THE OLD HARD-CODED BEHAVIOUR, EXACTLY. Six attempts, forty
 * minutes apart, only for a session limit, with the same prompt. A release that
 * changed what an unconfigured task does would be changing every automation the
 * user already has, silently, which is the one thing a settings item must not
 * do on its way in.
 *
 * ‼️ M-10 keeps that promise: `resetAware` defaults OFF, and the three new
 * delay fields default to absent, which means "whatever the strategy said
 * before you existed".
 */
export const DEFAULT_RETRY: Required<Pick<RetryPolicy, 'max' | 'delayMin' | 'backoff' | 'when'>> = {
    max: 6, delayMin: 40, backoff: 'same', when: 'limit'
};

/** Ceilings, so a typo cannot make a run that retries for a week. */
export const RETRY_MAX_ATTEMPTS = 20;
export const RETRY_MAX_DELAY_MIN = 1440;
/** The longest a computed wait may grow to, whatever the arithmetic says. */
export const RETRY_MAX_WAIT_MIN = 12 * 60;
/** Minutes after a stated reset that the first retry goes, when nobody says. */
export const RETRY_DEFAULT_SAFETY_MIN = 3;
/** The most a safety buffer may be — it is a cushion, not a second policy. */
export const RETRY_MAX_SAFETY_MIN = 240;
/** A formula is an expression, not a program. */
export const RETRY_FORMULA_MAX_CHARS = 120;
/** ‼️ M-10 — a continuation prompt is an instruction, not a brief: the run it
 *  goes to already has the whole conversation in front of it. Generous enough
 *  for a paragraph and short enough that nobody pastes the original task in. */
export const RETRY_PROMPT_MAX_CHARS = 2000;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

// ---------------------------------------------------------------------------
// M-10 — the formula: a tokeniser and a parser, and deliberately no `eval`
// ---------------------------------------------------------------------------

/** The names a formula may use. Anything else is refused BY NAME, so a typo
 *  reads as a typo rather than as "invalid formula". */
export const RETRY_FORMULA_VARS = ['n', 'prev', 'base'] as const;
/** The functions a formula may call. */
export const RETRY_FORMULA_FUNCS = ['min', 'max'] as const;

export interface RetryFormulaVars {
    /** Which retry this is — 1 is the first. */
    n: number;
    /** The wait before this one, in minutes. */
    prev: number;
    /** The user's own base, i.e. `delayMin`. */
    base: number;
}

type Token =
    | { t: 'num'; v: number }
    | { t: 'name'; v: string }
    | { t: 'op'; v: string };

/** Split into tokens, or say where it stopped making sense. */
function lexFormula(src: string): { tokens: Token[] } | { error: string } {
    const out: Token[] = [];
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (c === ' ' || c === '\t') { i++; continue; }
        if (c >= '0' && c <= '9') {
            let j = i;
            while (j < src.length && ((src[j] >= '0' && src[j] <= '9') || src[j] === '.')) { j++; }
            const text = src.slice(i, j);
            const v = Number(text);
            if (!Number.isFinite(v)) { return { error: `"${text}" is not a number (position ${i + 1})` }; }
            out.push({ t: 'num', v });
            i = j;
            continue;
        }
        if (/[a-zA-Z_]/.test(c)) {
            let j = i;
            while (j < src.length && /[a-zA-Z_0-9]/.test(src[j])) { j++; }
            out.push({ t: 'name', v: src.slice(i, j).toLowerCase() });
            i = j;
            continue;
        }
        if ('+-*/^(),'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
        return { error: `"${c}" is not allowed here (position ${i + 1}) — use ${RETRY_FORMULA_VARS.join(', ')}, numbers, + - * / ^, min(), max() and brackets` };
    }
    return { tokens: out };
}

export interface CompiledFormula {
    /** Minutes, before any clamping — the caller applies the ceilings. */
    value: (vars: RetryFormulaVars) => number;
}

/**
 * ‼️ PARSE IT, DO NOT RUN IT.
 *
 * Recursive descent over the token list, producing a closure that does nothing
 * but arithmetic on three numbers. There is no property access, no call into
 * anything the caller did not name, and no way to reach a scope: a formula is a
 * number, and the worst a hostile one can do is be large — which the ceilings
 * above already answer.
 *
 * `^` is right-associative (`2^3^2` is 512, as everywhere else that has it) and
 * binds tighter than unary minus on its left operand, matching how the same
 * expression reads in a spreadsheet.
 */
export function compileRetryFormula(src: string): { ok: true; formula: CompiledFormula } | { ok: false; error: string } {
    const text = String(src ?? '').trim();
    if (!text) { return { ok: false, error: 'the formula is empty — say what retry 4 and after should wait' }; }
    if (text.length > RETRY_FORMULA_MAX_CHARS) {
        return { ok: false, error: `the formula is longer than ${RETRY_FORMULA_MAX_CHARS} characters — it is an expression, not a program` };
    }
    const lexed = lexFormula(text);
    if ('error' in lexed) { return { ok: false, error: lexed.error }; }
    const tk = lexed.tokens;
    if (!tk.length) { return { ok: false, error: 'the formula is empty — say what retry 4 and after should wait' }; }

    let at = 0;
    let failure = '';
    const fail = (msg: string): ((v: RetryFormulaVars) => number) => {
        if (!failure) { failure = msg; }
        return () => 0;
    };
    const peek = (): Token | undefined => tk[at];
    const isOp = (v: string): boolean => { const t = peek(); return !!t && t.t === 'op' && t.v === v; };

    type Fn = (v: RetryFormulaVars) => number;

    const parseExpr = (): Fn => {
        let left = parseTerm();
        for (; ;) {
            if (isOp('+')) { at++; const r = parseTerm(); const l = left; left = v => l(v) + r(v); }
            else if (isOp('-')) { at++; const r = parseTerm(); const l = left; left = v => l(v) - r(v); }
            else { return left; }
        }
    };
    const parseTerm = (): Fn => {
        let left = parseUnary();
        for (; ;) {
            if (isOp('*')) { at++; const r = parseUnary(); const l = left; left = v => l(v) * r(v); }
            else if (isOp('/')) { at++; const r = parseUnary(); const l = left; left = v => l(v) / r(v); }
            else { return left; }
        }
    };
    const parseUnary = (): Fn => {
        if (isOp('-')) { at++; const r = parseUnary(); return v => -r(v); }
        if (isOp('+')) { at++; return parseUnary(); }
        return parsePower();
    };
    const parsePower = (): Fn => {
        const base = parsePrimary();
        if (isOp('^')) {
            at++;
            const exp = parseUnary();   // right-associative, and -x is a valid exponent
            return v => Math.pow(base(v), exp(v));
        }
        return base;
    };
    const parsePrimary = (): Fn => {
        const t = peek();
        if (!t) { return fail('the formula stops in the middle — something is missing at the end'); }
        if (t.t === 'num') { at++; const c = t.v; return () => c; }
        if (t.t === 'name') {
            at++;
            const name = t.v;
            if ((RETRY_FORMULA_FUNCS as readonly string[]).includes(name)) {
                if (!isOp('(')) { return fail(`${name} needs brackets: ${name}(a, b)`); }
                at++;
                const args: Fn[] = [parseExpr()];
                while (isOp(',')) { at++; args.push(parseExpr()); }
                if (!isOp(')')) { return fail(`${name}(…'s bracket is never closed`); }
                at++;
                if (args.length < 2) { return fail(`${name}() needs two values — ${name}(a, b)`); }
                return name === 'min'
                    ? v => Math.min(...args.map(a => a(v)))
                    : v => Math.max(...args.map(a => a(v)));
            }
            if ((RETRY_FORMULA_VARS as readonly string[]).includes(name)) {
                return v => v[name as keyof RetryFormulaVars];
            }
            return fail(`"${name}" is not something a retry formula can use — the names are ${RETRY_FORMULA_VARS.join(', ')} and the functions are ${RETRY_FORMULA_FUNCS.map(f => f + '()').join(', ')}`);
        }
        if (t.v === '(') {
            at++;
            const inner = parseExpr();
            if (!isOp(')')) { return fail('a bracket is never closed'); }
            at++;
            return inner;
        }
        return fail(`"${t.v}" cannot start a value (position ${at + 1} of the expression)`);
    };

    const fn = parseExpr();
    if (!failure && at < tk.length) {
        const t = tk[at];
        failure = `there is something left over after the expression: "${t.t === 'num' ? t.v : t.v}"`;
    }
    if (failure) { return { ok: false, error: failure }; }
    return { ok: true, formula: { value: fn } };
}

/** '' when the formula is fine; the reason when it is not. The one validator
 *  every surface calls, so a form and the bridge refuse the same strings. */
export function retryFormulaError(src: string): string {
    const r = compileRetryFormula(src);
    return r.ok ? '' : r.error;
}

/**
 * ‼️ REFUSE IT WHERE A PERSON TYPED IT. `normalizeRetry` is deliberately
 * total — it is called on stored policies, on settings files and on the way out
 * of a schedule that fires at 03:00, and a throw on any of those paths would
 * turn a bad character into a run that never happens. So the LOUD check is
 * this, called by the form and by the bridge before anything is stored.
 *
 * Returns '' when the policy is storable.
 */
export function retryRefusal(raw: unknown): string {
    if (!raw || typeof raw !== 'object') { return ''; }
    const o = raw as Record<string, unknown>;
    if (o.backoff !== undefined && o.backoff !== null && o.backoff !== ''
        && !['same', 'double', 'linear', 'formula'].includes(String(o.backoff))) {
        return `"${String(o.backoff)}" is not a retry strategy — same, double, linear or formula`;
    }
    const wantsFormula = String(o.backoff ?? '') === 'formula';
    const src = typeof o.formula === 'string' ? o.formula.trim() : '';
    if (wantsFormula || src) {
        const err = retryFormulaError(src);
        if (err) { return `the retry formula was refused — ${err}`; }
    }
    if (o.behavior === 'supervisor' && !normalizeSupervisor(o.supervisor)) {
        return 'behavior "supervisor" needs supervisor.engine — the engine that judges the continuation';
    }
    return '';
}

// ---------------------------------------------------------------------------
// Reading and resolving a policy
// ---------------------------------------------------------------------------

/**
 * One optional whole-minute field, clamped, or nothing at all.
 *
 * ‼️ M-10 — ZERO IS SILENCE ON THE *OPTIONAL* FIELDS (`zeroIsUnset`). An empty
 * number box reads back as `0` on more than one of the paths that feed this (a
 * form, a JSON file written by hand, a bridge caller being tidy), and clamping
 * that up to 1 would state "wait one minute before the second retry" where the
 * user said nothing at all — turning an untouched field into a decision. On
 * `delayMin`, which every policy has and which has always clamped, 0 stays a
 * too-small number and becomes 1: that is the behaviour this shipped with and
 * changing it is not this item's business.
 */
function minutes(
    o: Record<string, unknown>, key: string, lo: number, hi: number, zeroIsUnset = false
): number | undefined {
    const v = o[key];
    if (v === undefined || v === null || v === '') { return undefined; }
    const n = Number(v);
    if (!Number.isFinite(n)) { return undefined; }
    if (zeroIsUnset && n <= 0) { return undefined; }
    return clamp(Math.round(n), lo, hi);
}

/**
 * Read a policy off whatever a form, a settings file or a bridge call produced.
 * Returns undefined when there is nothing to say — an absent policy means "use
 * the default", which is a different statement from `max: 0` ("never retry").
 */
export function normalizeRetry(raw: unknown): RetryPolicy | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const o = raw as Record<string, unknown>;
    const out: RetryPolicy = {};
    if (o.max !== undefined && o.max !== null && o.max !== '') {
        const n = Number(o.max);
        if (!Number.isFinite(n)) { return undefined; }
        out.max = clamp(Math.round(n), 0, RETRY_MAX_ATTEMPTS);
    }
    const d1 = minutes(o, 'delayMin', 1, RETRY_MAX_DELAY_MIN);
    if (d1 !== undefined) { out.delayMin = d1; }
    // ‼️ M-10 — the second and third waits. Clamped by the same function and to
    // the same ceiling as the first, because they are the same kind of thing and
    // a form that let the third be a week would be a different bug.
    const d2 = minutes(o, 'delay2Min', 1, RETRY_MAX_DELAY_MIN, true);
    if (d2 !== undefined) { out.delay2Min = d2; }
    const d3 = minutes(o, 'delay3Min', 1, RETRY_MAX_DELAY_MIN, true);
    if (d3 !== undefined) { out.delay3Min = d3; }
    const cap = minutes(o, 'capMin', 1, RETRY_MAX_WAIT_MIN, true);
    if (cap !== undefined) { out.capMin = cap; }
    if (o.backoff === 'same' || o.backoff === 'double'
        || o.backoff === 'linear' || o.backoff === 'formula') { out.backoff = o.backoff; }
    // ‼️ THE TEXT IS KEPT EVEN WHEN IT DOES NOT PARSE. Dropping it would leave a
    // policy claiming a strategy with nothing behind it and no way for the user
    // to see what they typed; `describeRetry` and the run's own record both say
    // that it could not be read and that the base wait is being used instead.
    const formula = typeof o.formula === 'string' ? o.formula.trim() : '';
    if (formula) { out.formula = formula.slice(0, RETRY_FORMULA_MAX_CHARS); }
    if (o.when === 'any' || o.when === 'limit') { out.when = o.when; }
    if (o.resetAware === true || o.resetAware === 'true') { out.resetAware = true; }
    const buf = minutes(o, 'safetyBufferMin', 0, RETRY_MAX_SAFETY_MIN);
    if (buf !== undefined) { out.safetyBufferMin = buf; }
    const p = typeof o.prompt === 'string' ? o.prompt.trim() : '';
    if (p) { out.prompt = p; }
    // ‼️ M-10 — SMART IS OPT-IN AND ONLY THE WORD "smart" TURNS IT ON. Anything
    // else — absent, misspelt, `true`, a number — is `simple`, so a store or a
    // bridge caller cannot half-say it and get a run resuming a conversation
    // nobody asked it to resume.
    if (o.behavior === 'smart') { out.behavior = 'smart'; }
    // U-151 — only what was said is kept, so the levels merge field by field in
    // resolveRetry; a supervisor with no engine at ANY level is the `smart` it
    // falls back to, decided there rather than here.
    const sup = statedSupervisor(o.supervisor);
    if (sup) { out.supervisor = sup; }
    if (o.behavior === 'supervisor') { out.behavior = 'supervisor'; }
    for (const k of ['continuationPrompt', 'continuationPrompt2', 'continuationPromptLater'] as const) {
        const v = typeof o[k] === 'string' ? (o[k] as string).trim() : '';
        if (v) { out[k] = v.slice(0, RETRY_PROMPT_MAX_CHARS); }
    }
    if (o.unknownProgressFallback === 'park' || o.unknownProgressFallback === 'simple'
        || o.unknownProgressFallback === 'stop' || o.unknownProgressFallback === 'ask') {
        out.unknownProgressFallback = o.unknownProgressFallback;
    }
    // X-226 — kept as typed (a policy id or a slot id); the run resolves it
    // against the accounts of the moment, and an empty string is "stay".
    const carryOn = typeof o.carryOn === 'string' ? o.carryOn.trim() : '';
    if (carryOn) { out.carryOn = carryOn.slice(0, 80); }
    return Object.keys(out).length ? out : undefined;
}

/** A policy with every hole filled — what the manager actually runs on. */
export function resolveRetry(policy?: RetryPolicy, fallback?: RetryPolicy): Required<
    Pick<RetryPolicy, 'max' | 'delayMin' | 'backoff' | 'when'>
> & Omit<RetryPolicy, 'max' | 'delayMin' | 'backoff' | 'when' | 'supervisor'> & { supervisor?: SupervisorPolicy } {
    const a = policy ?? {};
    const b = fallback ?? {};
    const pick = <K extends keyof RetryPolicy>(k: K): NonNullable<RetryPolicy[K]> =>
        (a[k] ?? b[k] ?? DEFAULT_RETRY[k as 'max' | 'delayMin' | 'backoff' | 'when']) as NonNullable<RetryPolicy[K]>;
    const out = {
        max: pick('max') as number,
        delayMin: pick('delayMin') as number,
        backoff: pick('backoff') as RetryBackoff,
        when: pick('when') as RetryWhen
    } as Required<Pick<RetryPolicy, 'max' | 'delayMin' | 'backoff' | 'when'>> & Omit<RetryPolicy, 'supervisor'> & { supervisor?: SupervisorPolicy };
    // ‼️ THE OPTIONAL HALVES FALL THROUGH ONE FIELD AT A TIME. A run stating
    // only "wait 5 minutes first" must still inherit the user's formula and the
    // user's reset-awareness — merging whole objects would make every partial
    // policy a silent reset of everything the default said.
    for (const k of ['delay2Min', 'delay3Min', 'capMin', 'safetyBufferMin'] as const) {
        const v = a[k] ?? b[k];
        if (v !== undefined) { out[k] = v; }
    }
    const formula = (a.formula ?? b.formula ?? '').trim();
    if (formula) { out.formula = formula; }
    if (a.resetAware ?? b.resetAware) { out.resetAware = true; }
    const prompt = (a.prompt ?? b.prompt ?? '').trim();
    if (prompt) { out.prompt = prompt; }
    // ‼️ M-10 — the continuation half falls through the same way, and `behavior`
    // is INHERITED rather than defaulted-on: a run that says nothing gets the
    // user's own setting, and a user who has said nothing gets `simple`.
    const behavior = a.behavior ?? b.behavior;
    // ‼️ U-151 — FIELD BY FIELD, then made whole: the run's own fields over the
    // user's default, the built-in values only for what neither said.
    const sup = normalizeSupervisor({ ...(b.supervisor ?? {}), ...(a.supervisor ?? {}) });
    if (sup) { out.supervisor = sup; }
    if (behavior === 'smart' || (behavior === 'supervisor' && !sup)) { out.behavior = 'smart'; }
    if (behavior === 'supervisor' && sup) { out.behavior = 'supervisor'; }
    for (const k of ['continuationPrompt', 'continuationPrompt2', 'continuationPromptLater'] as const) {
        const v = (a[k] ?? b[k] ?? '').trim();
        if (v) { out[k] = v; }
    }
    const fb = a.unknownProgressFallback ?? b.unknownProgressFallback;
    if (fb) { out.unknownProgressFallback = fb; }
    // X-226 — the handover switch falls through like the rest: a run that says
    // nothing gets the user's default, and a user who said nothing STAYS.
    const carryOn = (a.carryOn ?? b.carryOn ?? '').trim();
    if (carryOn) { out.carryOn = carryOn; }
    return out;
}

/**
 * ‼️ M-10 — THE DEFAULT WORDS FOR PICKING WORK BACK UP.
 *
 * Deliberately not a sentence about Agent Farm and deliberately not in Turkish
 * or English by policy: it is the shortest true instruction to an engine that
 * is looking at its own half-finished work, and the user overwrites it with
 * whatever they like. It says READ FIRST, because the failure this whole
 * mechanism exists for is a run being told to redo work it cannot see.
 */
export const DEFAULT_CONTINUATION_PROMPT =
    'Carry on from where you stopped. Read the transcript above and the current state of the working '
    + 'folder first, then finish the ORIGINAL task without redoing work that is already done.';

/** Which continuation text this attempt uses, falling back one step at a time. */
export function continuationPromptFor(p: RetryPolicy, attempt: number): string {
    const one = (p.continuationPrompt ?? '').trim();
    const two = (p.continuationPrompt2 ?? '').trim();
    const later = (p.continuationPromptLater ?? '').trim();
    if (attempt >= 3) { return later || two || one || DEFAULT_CONTINUATION_PROMPT; }
    if (attempt === 2) { return two || one || DEFAULT_CONTINUATION_PROMPT; }
    return one || DEFAULT_CONTINUATION_PROMPT;
}

/**
 * The placeholders, filled. ‼️ An unknown `{name}` is LEFT ALONE rather than
 * blanked: a typo that silently deletes half a sentence is worse than one a
 * person can see in the prompt the run is about to be given.
 */
export function fillContinuation(text: string, vars: Record<string, string>): string {
    return String(text ?? '').replace(/\{(\w+)\}/g, (whole, name: string) =>
        (Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : whole));
}

/**
 * ‼️ THE ONE FAILURE THAT IS NOT A FAILURE. The Claude CLI refuses the run
 * outright when the plan window is spent, so nothing was attempted and nothing
 * is wrong with the work. It clears within hours by itself, which is why it is
 * the default `when` and why a fixed forty minutes is the right wait for it.
 *
 * The other three engines say it in their own words, and they are here for the
 * same reason the Claude phrase is: a limit is the one failure whose retry has
 * a KNOWN right moment (M-10), and an engine whose sentence nobody matched was
 * getting the guess instead.
 */
export function isLimitFailure(output: string): boolean {
    return /hit your (session|weekly) limit|(session|weekly) limit[^.]*reset|usage limit reached|rate.?limit(ed)? (reached|exceeded)|quota exceeded|resource_exhausted|429 |too many requests/i
        .test(String(output ?? ''));
}

/**
 * ‼️ B-03.8 — WHICH WALL IT WAS, because the two do not reset on the same
 * calendar. Both are plan windows and both are retryable — that is why they are
 * one question above — but a session window reopens in hours and a weekly one
 * in days, and only the second makes a bare clock time an incomplete answer
 * (see `planLimitReset`).
 *
 * A run walled by the WEEKLY window is also the case the account handover
 * (X-226) exists for: the wait it would otherwise sleep is measured in days,
 * and another sign-in is free right now.
 *
 * Deliberately NOT here: `monthly spend limit`, which is a billing ceiling
 * rather than a window — nothing reopens it but a person raising it, so a run
 * that waits for it waits for ever.
 */
export function limitWindow(output: string): LimitWindow | undefined {
    const text = String(output ?? '');
    if (/\bweekly limit\b/i.test(text)) { return 'weekly'; }
    if (isLimitFailure(text)) { return 'session'; }
    return undefined;
}

/**
 * ‼️ M-12 — WHAT A FAILED RUN ACTUALLY DID BEFORE IT FAILED.
 *
 * `isLimitFailure` answers "was this the plan window", and the code used to
 * treat that as the whole answer: the moment the regex matched, the run was
 * described as one where *nothing was attempted*. For the failure it was
 * written about — the CLI refusing a run outright — that is true. For a run
 * that worked for 45 minutes, edited thirteen files and met the limit on the
 * way out, it is the opposite of the truth, and it is the sentence the user
 * was shown about exactly that run.
 *
 * `claude -p` prints the RESULT, not the working: if the limit arrives before
 * the final message, the output file holds the limit sentence and nothing else.
 * So the output can never be the evidence. The transcript is — which S-31 made
 * reachable by binding a run to its own session.
 *
 * ‼️ TIME IS NOT PROGRESS. A run can sit for forty minutes waiting on a lock
 * and attempt nothing. Only assistant/tool activity counts.
 */
export type FailurePhase =
    /** the engine never started a turn — the one phase that may say "nothing was attempted" */
    | 'not-started'
    /** the transcript shows real work: assistant text, tool use, tool results */
    | 'interrupted'
    /** no session bound yet, or the engine published nothing to judge by */
    | 'unknown';

/** What a run's own transcript says it managed to do. Absent = not known yet. */
export interface RunProgress {
    /** assistant messages in this run's transcript */
    assistantSteps?: number;
    /** tool calls in it */
    toolCalls?: number;
    /** how long the process was up, in ms — REPORTED, never used as evidence */
    elapsedMs?: number;
}

export interface FailureVerdict {
    phase: FailurePhase;
    /** was the failure the plan/usage window, in any engine's words */
    limit: boolean;
    /** one line for the row, the event and the output file */
    why: string;
}

/**
 * Classify a failed run. `progress` absent means the transcript has not been
 * found yet — which is `unknown`, not `not-started`: the two are different
 * statements and only one of them may be made without evidence.
 */
export function classifyFailure(o: {
    output?: string;
    progress?: RunProgress;
}): FailureVerdict {
    const limit = isLimitFailure(o.output ?? '');
    const p = o.progress;
    const mins = (ms?: number): string =>
        ms && ms > 0 ? `${Math.max(1, Math.round(ms / 60000))} min` : '';
    if (!p || (p.assistantSteps === undefined && p.toolCalls === undefined)) {
        return {
            phase: 'unknown', limit,
            why: limit
                ? 'the session limit was hit — whether any work had started is not known yet, '
                + 'because this run has no transcript bound to it'
                : 'it failed — whether any work had started is not known yet, '
                + 'because this run has no transcript bound to it'
        };
    }
    const steps = (p.assistantSteps ?? 0) + (p.toolCalls ?? 0);
    if (steps > 0) {
        const did = [
            p.assistantSteps ? `${p.assistantSteps} assistant step${p.assistantSteps === 1 ? '' : 's'}` : '',
            p.toolCalls ? `${p.toolCalls} tool call${p.toolCalls === 1 ? '' : 's'}` : ''
        ].filter(Boolean).join(' · ');
        const ran = mins(p.elapsedMs);
        return {
            phase: 'interrupted', limit,
            why: limit
                ? `${ran ? ran + ' of work — ' : ''}${did} — and then the session limit cut it off. `
                + 'The work was NOT untouched: read the transcript before sending it again'
                : `${ran ? ran + ' of work — ' : ''}${did} — and then it failed part-way through`
        };
    }
    return {
        phase: 'not-started', limit,
        why: limit
            ? 'the session limit was hit before any work started, so nothing was attempted'
            : 'it failed before any work started'
    };
}

/** The effective ceiling for one policy — the user's, under the built-in one. */
function capOf(p: RetryPolicy): number {
    const own = p.capMin && p.capMin > 0 ? p.capMin : RETRY_MAX_WAIT_MIN;
    return Math.min(RETRY_MAX_WAIT_MIN, own);
}

/**
 * How long to wait before attempt `n` (1 = the first retry), in minutes.
 *
 * ‼️ M-10 — THE FIRST THREE ARE ANSWERED ONE BY ONE, AND ONLY THEN DOES A CURVE
 * GET A SAY. A policy that states none of the new fields computes exactly what
 * it computed before they existed: that is the compatibility test, and it is
 * why the strategy branch is reached with the same `n` it always was.
 */
export function retryWaitMin(p: RetryPolicy, attempt: number): number {
    const base = p.delayMin ?? DEFAULT_RETRY.delayMin;
    const n = Math.max(1, Math.round(attempt));
    const cap = capOf(p);
    const fit = (v: number): number => {
        if (!Number.isFinite(v)) { return cap; }
        return clamp(Math.round(v), 1, cap);
    };
    if (n === 1) { return fit(base); }
    if (n === 2 && p.delay2Min) { return fit(p.delay2Min); }
    if (n === 3 && p.delay3Min) { return fit(p.delay3Min); }
    const kind = p.backoff ?? DEFAULT_RETRY.backoff;
    if (kind === 'double') { return fit(base * Math.pow(2, n - 1)); }
    if (kind === 'linear') { return fit(base * n); }
    if (kind === 'formula') {
        const c = compileRetryFormula(p.formula ?? '');
        // A formula that cannot be read falls back to the base wait rather than
        // to nothing — and every surface says so out loud (`describeRetry`, and
        // the `[retry]` line in the run's own output).
        if (!c.ok) { return fit(base); }
        // `prev` is the wait actually used for the attempt before this one, so a
        // formula chains off the user's own second and third numbers instead of
        // off a curve they overrode.
        return fit(c.formula.value({ n, prev: retryWaitMin(p, n - 1), base }));
    }
    return fit(base);
}

// ---------------------------------------------------------------------------
// M-10 — "resets 5am": reading the moment the window reopens
// ---------------------------------------------------------------------------

export interface LimitReset {
    /** Epoch ms of the reset. */
    at: number;
    /** What was matched, for the record — never a reconstruction. */
    text: string;
    /** The stated moment had already passed when this was read. */
    past: boolean;
    /**
     * ‼️ B-03.8 — WHICH BRANCH PRODUCED THIS, because a bare clock time is the
     * only one that carries no calendar. `resets 7pm` is a complete answer for
     * a window that resets today and an incomplete one for a window that resets
     * on some later day; the caller cannot tell the two apart unless the shape
     * of the evidence travels with the number.
     */
    kind: 'absolute' | 'relative' | 'clock';
}

const DAY_MS = 24 * 3600_000;

/**
 * The UTC offset (in minutes, east-positive) a named zone is at, at `at`.
 * Unknown zone → undefined, and the caller falls back to this machine's own
 * clock rather than to a guess.
 */
function zoneOffsetMin(zone: string, at: number): number | undefined {
    try {
        const fmt = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' });
        const part = fmt.formatToParts(new Date(at)).find(p => p.type === 'timeZoneName')?.value ?? '';
        const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(part);
        if (!m) { return part === 'GMT' ? 0 : undefined; }
        const sign = m[1] === '-' ? -1 : 1;
        return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
    } catch { return undefined; }
}

/**
 * ‼️ M-10 — THE HOUR THE CLI JUST PRINTED, READ RATHER THAN GUESSED AT.
 *
 * The shapes seen in the wild, and each one is a test:
 *   · `resets 5am` · `resets at 5:30 PM` — 12-hour, with and without minutes
 *   · `resets at 17:30` — 24-hour
 *   · `resets at 5am (Europe/Istanbul)` · `… 5:30am UTC` · `… 05:30 +03:00`
 *   · `resets at 2026-08-14T02:30:00Z` — an absolute stamp
 *   · `resets in 42 minutes` · `resets in 2h 15m`
 *
 * ‼️ A CLOCK TIME IS THE NEXT ONE, WHICH IS WHAT MIDNIGHT MEANS HERE. "resets
 * 1am" read at 23:50 is ten minutes away, not twenty-three hours ago; the roll
 * forward is what makes that right, and the two-minute tolerance below is for
 * the other case — a reset that has just passed and is being reported a moment
 * late must not become tomorrow.
 *
 * Returns nothing at all rather than a guess: an unparseable line is a FALLBACK
 * that the caller has to state, not a number to invent.
 */
export function parseLimitReset(output: string, now: number): LimitReset | undefined {
    const text = String(output ?? '');
    if (!text) { return undefined; }
    // Only look at lines that actually talk about a reset — "at 5pm" in a
    // transcript is not a statement about the quota window.
    const line = text.split(/\r?\n/).reverse()
        .find(l => /reset|resets_at|limit will reset/i.test(l));
    if (!line) { return undefined; }

    // 1) an absolute stamp, which needs no interpretation at all
    const iso = /reset[^0-9]{0,20}(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/i.exec(line);
    if (iso) {
        const at = Date.parse(iso[1].replace(' ', 'T'));
        if (Number.isFinite(at)) { return { at, text: iso[1], past: at <= now, kind: 'absolute' }; }
    }
    // …and the same thing as a number of seconds, the way Codex writes it
    const epoch = /resets?_at["'\s:]+(\d{10,13})/i.exec(line);
    if (epoch) {
        const raw = Number(epoch[1]);
        const at = raw > 1e12 ? raw : raw * 1000;
        return { at, text: epoch[1], past: at <= now, kind: 'absolute' };
    }

    // 2) "in 45 minutes" / "in 2h 15m" — a duration, so no calendar at all
    const rel = /reset[^.]{0,20}?\bin\s+((?:\d+\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\s*)+)/i.exec(line);
    if (rel) {
        let ms = 0;
        for (const m of rel[1].matchAll(/(\d+)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)/gi)) {
            ms += Number(m[1]) * (/^h/i.test(m[2]) ? 3600_000 : 60_000);
        }
        if (ms > 0) { return { at: now + ms, text: rel[1].trim(), past: false, kind: 'relative' }; }
    }

    // 3) a clock time, the common case
    const clock = /reset[^0-9]{0,20}?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?:\s*\(?\s*([A-Za-z_]+\/[A-Za-z_+-]+|UTC|GMT|Z)\s*\)?|\s*([+-]\d{2}:?\d{2}))?/i
        .exec(line);
    if (!clock) { return undefined; }
    let hour = Number(clock[1]);
    const min = Number(clock[2] ?? 0);
    const ampm = (clock[3] ?? '').toLowerCase();
    if (hour > 23 || min > 59) { return undefined; }
    if (ampm === 'pm' && hour < 12) { hour += 12; }
    // 12am is midnight, which is hour 0 — the one case the arithmetic above gets
    // wrong on its own and the one a person is most likely to be woken by.
    if (ampm === 'am' && hour === 12) { hour = 0; }
    if (!ampm && clock[1].length === 1 && !clock[2]) {
        // A bare "resets 5" with no am/pm and no minutes: ambiguous by nature.
        // Refused rather than resolved — a wrong half-day here is a run that
        // sleeps twelve hours.
        return undefined;
    }

    const zoneName = clock[4];
    const zoneOff = clock[5];
    let offsetMin: number | undefined;
    if (zoneOff) {
        const m = /([+-])(\d{2}):?(\d{2})/.exec(zoneOff);
        if (m) { offsetMin = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])); }
    } else if (zoneName) {
        const z = zoneName.toUpperCase();
        offsetMin = z === 'UTC' || z === 'GMT' || z === 'Z' ? 0 : zoneOffsetMin(zoneName, now);
    }

    let at: number;
    if (offsetMin === undefined) {
        // This machine's own clock — the same wall time the user is reading.
        const d = new Date(now);
        d.setHours(hour, min, 0, 0);
        at = d.getTime();
    } else {
        // Build the instant in the stated zone: take the zone's own calendar day
        // for `now`, then put the stated clock time on it.
        const shifted = new Date(now + offsetMin * 60_000);
        at = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), hour, min)
            - offsetMin * 60_000;
    }
    // The next occurrence — see the header. Two minutes of tolerance so a reset
    // reported a moment late is "now", not "tomorrow".
    if (at < now - 2 * 60_000) { at += DAY_MS; }
    return { at, text: clock[0].trim(), past: false, kind: 'clock' };
}

/** Where a reset time came from. Priority order, highest first. */
export type ResetSource = 'engine' | 'output' | 'none';

/** ‼️ B-03.8 — which plan window walled the run. See `limitWindow`. */
export type LimitWindow = 'session' | 'weekly';

export interface ResetPlan {
    /** Absolute moment the first retry may go, epoch ms. */
    at: number;
    source: ResetSource;
    /** One line for the task's record: the reset, the buffer and the result. */
    why: string;
}

/** Local `HH:MM`, which is what a person reads off their own clock. */
function hhmm(ts: number): string {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * ‼️ M-10 — WHEN THE FIRST RETRY GOES, WHEN THE FAILURE WAS A LIMIT.
 *
 * Source priority, and it is the item's own: what the ENGINE published beats
 * what its output happened to print, and both beat the ordinary first interval.
 * A fallback is never silent — it comes back as `source: 'none'` with the words
 * that say so, and the manager writes them on the run's record.
 */
export function planLimitReset(o: {
    now: number;
    /** Structured, from the engine's own usage data. */
    engineResetAt?: number;
    /** The failed run's output, for the printed sentence. */
    output?: string;
    /** Minutes after the reset to actually go. */
    safetyBufferMin?: number;
    /** What the ordinary policy would have waited, in minutes. */
    fallbackMin: number;
    /**
     * ‼️ B-03.8 — WHICH WALL, when the caller knows. Absent behaves exactly as
     * this function did before the field existed.
     */
    window?: LimitWindow;
}): ResetPlan {
    const buffer = clamp(Math.round(o.safetyBufferMin ?? RETRY_DEFAULT_SAFETY_MIN), 0, RETRY_MAX_SAFETY_MIN);
    const use = (at: number, source: Exclude<ResetSource, 'none'>, note: string): ResetPlan => {
        // A reset that has already passed is not a reason to wait until
        // tomorrow: the window is open, and the buffer alone is the wait.
        const from = Math.max(at, o.now);
        const go = from + buffer * 60_000;
        return {
            at: go, source,
            why: `limit reset ${hhmm(at)}${at < o.now ? ' (already passed)' : ''} + ${buffer} min → retry ${hhmm(go)} — ${note}`
        };
    };
    if (o.engineResetAt && Number.isFinite(o.engineResetAt) && o.engineResetAt > 0) {
        return use(o.engineResetAt, 'engine', 'the engine\'s own usage data');
    }
    const parsed = parseLimitReset(o.output ?? '', o.now);
    // ‼️ B-03.8 — A WEEKLY WALL PRINTS A CLOCK AND NOT A CALENDAR, and reading
    // it as today's clock is how a run wakes hours early, fails on the same
    // wall, and spends an attempt proving it. Measured, verbatim:
    // "You've hit your weekly limit · resets 7pm (Asia/Bangkok)" — nothing in
    // that sentence says WHICH 7pm, and this window's answer is very rarely
    // today. The absolute and relative readings are unaffected: both carry
    // their own calendar, so they are trusted for either window.
    if (parsed && !(o.window === 'weekly' && parsed.kind === 'clock')) {
        return use(parsed.at, 'output', `read from the run's output ("${parsed.text}")`);
    }
    const go = o.now + Math.max(1, o.fallbackMin) * 60_000;
    return {
        at: go, source: 'none',
        why: parsed
            ? `the weekly window printed a clock time ("${parsed.text}") and no day, which cannot say `
                + `WHICH one — the ordinary first wait was used instead — retry ${hhmm(go)} (${o.fallbackMin} min)`
            : `no reset time was published or printed, so the ordinary first wait was used — retry ${hhmm(go)} (${o.fallbackMin} min)`
    };
}

/**
 * ‼️ S-64 — THE RUN WAS TOLD TO HAND OVER. What the guard knows about the
 * conversation smart continue is about to resume.
 *
 * `told` is the only field that decides anything; the rest is so the record
 * can say WHY rather than "no continuation".
 */
export interface HandoverEvidence {
    /** the run was sent `CONTEXT HANDOVER` — its window had reached the line */
    told: boolean;
    /** the reading that fired it */
    pct?: number;
    /** a handover note has already closed this session */
    note?: string;
}

export interface RetryDecision {
    retry: boolean;
    /** How long the manager should wait, in ms. 0 when there is no retry. */
    delayMs: number;
    /** Which attempt this would be (1 = the first retry). */
    attempt: number;
    /**
     * ‼️ M-10 — THE ABSOLUTE MOMENT, when one was worked out from a limit reset.
     * A duration would be re-derived on every read and would drift; the whole
     * point of reading "resets 05:30" is that 05:33 survives a restart.
     */
    notBefore?: number;
    /** Where that moment came from, when there is one. */
    resetSource?: ResetSource;
    /** ‼️ M-12 — what the failed run actually managed to do, so the row and the
     *  event stop guessing the flattering half. */
    phase?: FailurePhase;
    /**
     * ‼️ M-10 — THIS RETRY CONTINUES THE RUN'S OWN CONVERSATION.
     *
     * True only in `smart` behaviour and only for work that was CUT OFF. The
     * caller resumes that session (S-19) and sends `promptTemplate` as the next
     * turn; it must NOT send the original prompt, which would ask an engine
     * with no memory to redo what it cannot see.
     */
    continueRun?: boolean;
    /** The continuation text, with its placeholders still in it — the caller
     *  owns the run and therefore owns the values. */
    promptTemplate?: string;
    /**
     * ‼️ M-10 — the retry exists but must NOT start yet, because nobody can say
     * whether work happened. `park` holds it visibly; `ask` holds it and puts
     * the question to the user. Never a silent repeat of the original prompt.
     */
    hold?: 'park' | 'ask';
    /**
     * ‼️ M-13 — ASK THE SUPERVISOR BEFORE APPLYING THIS. Set only in
     * `supervisor` behaviour, only for a LIMIT that cut off work that had
     * happened (the first version's whole scope). Everything else on the
     * decision is the deterministic `smart` answer — the fallback the manager
     * applies when the supervisor cannot be asked, fails, or is not confident.
     */
    supervise?: boolean;
    /** Said in words, because it goes on the task's own record and in its
     *  output file — "attempt 2 of 6" alone never explains a retry that did NOT
     *  happen, and that is the case somebody comes looking for. */
    why: string;
}

/**
 * Should this failure be tried again? `done` is never asked; only a failure
 * reaches here.
 */
export function retryDecision(policy: RetryPolicy | undefined, o: {
    /** How many retries have already happened. 0 on the original run. */
    attempt: number;
    /** The run's output, for the limit test. */
    output?: string;
    /** A fallback policy (the user's global default). */
    fallback?: RetryPolicy;
    /** Now, so the reset arithmetic is testable. */
    now?: number;
    /** ‼️ M-10 — what the ENGINE says about its own window, if anything. */
    engineResetAt?: number;
    /** ‼️ M-12 — what the run's own transcript says it managed to do. Absent =
     *  not known, which is a THIRD answer and not a quiet "nothing". */
    progress?: RunProgress;
    /** ‼️ S-64 — whether this run's window had reached the handover line.
     *  Absent = the guard said nothing, which is not "it had room". */
    handover?: HandoverEvidence;
}): RetryDecision {
    const p = resolveRetry(policy, o.fallback);
    const attempt = Math.max(0, Math.round(o.attempt)) + 1;
    // ‼️ M-12 — the verdict is reached BEFORE any early return, because "what
    // did this run manage to do" is a fact about the run and not about whether
    // there is a retry left. A row that is out of retries is exactly the one
    // somebody opens to ask what happened.
    const verdict = classifyFailure({ output: o.output, progress: o.progress });
    const no = (why: string): RetryDecision =>
        ({ retry: false, delayMs: 0, attempt, why, phase: verdict.phase });
    if (p.max <= 0) { return no('retry is off for this run'); }
    if (attempt > p.max) { return no(`out of retries — ${p.max} already used`); }
    const wasLimit = verdict.limit;
    if (p.when === 'limit' && !wasLimit) {
        return no('the failure was not a session limit, and this run only retries those');
    }
    const wait = retryWaitMin(p, attempt);
    const now = o.now ?? Date.now();

    /**
     * ‼️ M-10 — SMART CONTINUE, DECIDED OFF M-12'S EVIDENCE AND NOTHING ELSE.
     *
     * Three phases, three different right answers, and the whole value of the
     * mode is that it never guesses between them:
     *   not-started → an ordinary retry; the original prompt is still correct.
     *   interrupted → resume the SAME conversation and say "carry on".
     *   unknown     → hold. The one thing that must not happen is the original
     *                 prompt going out as if the run had been idle.
     */
    const smart = p.behavior === 'smart' || p.behavior === 'supervisor';
    let continueRun = false;
    let promptTemplate: string | undefined;
    let hold: 'park' | 'ask' | undefined;
    /**
     * ‼️ S-64 — AND A CONVERSATION THAT WAS TOLD TO STOP IS NOT RESUMED.
     *
     * Smart continue is right about interrupted work and wrong about exactly
     * one run: the one whose window had reached the handover line. The law is
     * explicit — "the next run is always a fresh session that starts from the
     * note, never a resume of the saturated one" — and resuming it puts the
     * new turn into a window that was already full, which is how a retry walks
     * straight back into the wall it was sent to escape.
     *
     * The work is not lost: the ordinary retry carries the original prompt, and
     * the handover note (when one was written) is what the fresh run reads.
     */
    const handedOver = o.handover?.told === true;
    if (smart) {
        if (verdict.phase === 'interrupted' && !handedOver) {
            continueRun = true;
            promptTemplate = continuationPromptFor(p, attempt);
        } else if (verdict.phase === 'unknown') {
            // Left exactly as it was: knowing the window was full says nothing
            // about whether the work landed, and the original prompt going out
            // blind is the thing this fallback exists to prevent.
            const fb = p.unknownProgressFallback ?? 'park';
            if (fb === 'stop') {
                return no('smart continue is on and nothing can say whether this run had already done '
                    + 'work — it is not retried, because resending the original prompt could repeat '
                    + 'work that is already done');
            }
            if (fb !== 'simple') { hold = fb; }
        }
    }
    // The one case worth a sentence on the record: smart continue would have
    // resumed, and the handover line is why it did not.
    const handoverWhy = smart && handedOver && verdict.phase === 'interrupted'
        ? ' — not continued: this run was told to hand over'
            + (typeof o.handover?.pct === 'number' ? ` at ${o.handover.pct}%` : '')
            + (o.handover?.note ? ` and ${o.handover.note} closed it` : '')
            + ', and a saturated conversation is never resumed — the fresh run carries the original prompt'
        : '';
    const supervise = p.behavior === 'supervisor' && !!p.supervisor && wasLimit && continueRun;
    const held = (d: RetryDecision): RetryDecision => hold
        ? {
            ...d, hold,
            why: `${d.why} — held: smart continue cannot yet tell whether this run had already done work`
            + (hold === 'ask' ? ', and you asked to be the one who decides' : '')
        }
        : supervise
            ? { ...d, supervise, why: `${d.why} — the supervisor (${p.supervisor!.engine}) decides how it goes on; this is its fallback` }
            : d;

    // ‼️ M-10 — RESET-AWARE OVERRIDES THE FIRST RETRY AND ONLY THE FIRST, and
    // only when the failure really was a limit. Attempts 2 and 3 have their own
    // stated minutes and 4+ the strategy: by then the window question has been
    // answered once and asking it again would flatten the policy the user set.
    if (p.resetAware && wasLimit && attempt === 1) {
        const plan = planLimitReset({
            now, engineResetAt: o.engineResetAt, output: o.output,
            safetyBufferMin: p.safetyBufferMin, fallbackMin: wait,
            // ‼️ B-03.8 — the wall names itself, so the reading of its reset can
            // be judged rather than taken.
            ...(limitWindow(o.output ?? '') ? { window: limitWindow(o.output ?? '')! } : {})
        });
        return held({
            retry: true,
            delayMs: Math.max(0, plan.at - now),
            attempt,
            notBefore: plan.at,
            resetSource: plan.source,
            phase: verdict.phase,
            continueRun, promptTemplate,
            why: `${verdict.why} — ${plan.why} — ${continueRun ? 'continue' : 'retry'} `
                + `${attempt} of ${p.max}${handoverWhy}`
        });
    }
    return held({
        retry: true, delayMs: wait * 60_000, attempt, phase: verdict.phase,
        continueRun, promptTemplate,
        // ‼️ M-12 — WHAT THE RUN DID, NOT WHAT THE REGEX MATCHED. This said
        // "nothing was attempted" the instant `isLimitFailure` was true, so the
        // one run it was most wrong about — 45 minutes of work stopped by the
        // limit on the way out — was described to the user as a run that never
        // started. The phrase now comes from the evidence, and where there is
        // none it says THAT rather than assuming the flattering half.
        why: `${verdict.why} — ${continueRun ? 'continue' : 'retry'} ${attempt} of ${p.max} in ${wait} min`
            + handoverWhy
    });
}

/**
 * One line for a hover or a form's summary. ‼️ It says the whole policy or it
 * says nothing: "retries 3 times" leaves out the two numbers that decide
 * whether the run finishes tonight or tomorrow.
 */
export function describeRetry(policy?: RetryPolicy, fallback?: RetryPolicy): string {
    const p = resolveRetry(policy, fallback);
    if (p.max <= 0) { return 'no retry — one attempt and it is done'; }
    const bits = [`${p.max}×`];
    const cap = p.capMin && p.capMin < RETRY_MAX_WAIT_MIN ? `, capped at ${p.capMin} min` : '';
    /** What retry 4 and after do, in three words. */
    const curve = (): string => {
        if (p.backoff === 'double') { return `doubling${cap}`; }
        if (p.backoff === 'linear') { return `${p.delayMin} × n${cap}`; }
        if (p.backoff === 'formula') {
            const err = retryFormulaError(p.formula ?? '');
            return err
                ? `a formula that could not be read (${err}) — the base wait is used instead`
                : `${p.formula}${cap}`;
        }
        return `the same wait${cap}`;
    };
    // ‼️ M-10 — the first three, in the words the user set them in. A summary
    // that said "every 30 min" about a policy of 5 / 20 / 60 would be a lie in
    // exactly the place people check before leaving a run overnight.
    //
    // ‼️ …AND A POLICY THAT STATES NEITHER SAYS WHAT IT ALWAYS SAID. The two
    // legacy sentences are reproduced to the character, because this string is
    // read back by the bridge (`retryPolicy`) and by every hover that quotes a
    // policy: a release that reworded them would look like a behaviour change
    // in the one place people check to be sure there was none.
    const staged = p.delay2Min !== undefined || p.delay3Min !== undefined;
    if (!staged) {
        bits.push(p.backoff === 'same'
            ? `every ${p.delayMin} min${cap}`
            : `first after ${p.delayMin} min, then ${curve()}`);
    } else {
        const first = [p.delayMin, p.delay2Min, p.delay3Min]
            .slice(0, Math.min(3, p.max))
            .map(v => (v === undefined ? '(the curve)' : `${v}`));
        bits.push(`${first.join(' → ')} min`);
        if (p.max > first.length) { bits.push(`then ${curve()}`); }
    }
    bits.push(p.when === 'limit' ? 'only on a session limit' : 'on any failure');
    if (p.resetAware) {
        bits.push(`first retry at the limit reset + ${p.safetyBufferMin ?? RETRY_DEFAULT_SAFETY_MIN} min`);
    }
    if (p.prompt) { bits.push('with a different prompt'); }
    // X-226 — said out loud, because it is the one part of a policy that can
    // spend a plan the run was not given.
    if (p.carryOn) { bits.push(`at a limit carries on via ${p.carryOn}`); }
    if (p.behavior === 'supervisor' && p.supervisor) {
        bits.push(`after a limit, ${p.supervisor.engine}${p.supervisor.model ? ` (${p.supervisor.model})` : ''} decides how it continues`);
    }
    return bits.join(' · ');
}
