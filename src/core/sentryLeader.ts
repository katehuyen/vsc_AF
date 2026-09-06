import { SessionDiagnosis } from './sessionDiagnosis';
import type { PolicyVerdict } from './sentryPolicy';
import type { ModelAssist } from './sentryPrompt';

/**
 * X-191 — THE LEADER WAKES, TAKES THE SITUATION IN HAND, AND GOES BACK TO SLEEP.
 *
 * This is the defect the whole family was reopened for. `ModelAssist` and
 * `modelNeeded()` were WRITTEN and never wired: `sentryStep({…})` has never once
 * filled `assist`, so the sleeping leader the user designed — "akıllı uyuyan
 * ajan, yani lider ajan uyansın ve duruma el koysun, durumu çözsün, tekrar
 * uyusun" — was never built at all. What shipped fills a template.
 *
 * ‼️ AND THE REASON IT WAS NOT BUILT IS THE THING TO GET RIGHT.
 *
 * The `automation.ts` precedent burned $70.90 over five nights asking a model
 * something that could have been counted, and the agent that wrote this family
 * over-corrected into "never call a model". That was never the answer. The
 * answer is **govern when, and how much** — so every rule in this file is a
 * leash, and none of them is a brake on the WORK:
 *
 *   1. the leader wakes only when a condition fired. A routine round is free.
 *   2. the model is cheap by default, and the default is named in one place.
 *   3. a turn has a time ceiling and a cost ceiling.
 *   4. a campaign has a DAILY budget; when it is gone the campaign carries on
 *      MECHANICALLY and the user is told. It does not stop.
 *   5. every turn is recorded — model, ms, dollars, ok.
 *   6. N failures in a row drop the mode to mechanical AND SAY SO.
 *
 * ‼️ THE LEADER NEVER STOPS THE CAMPAIGN. Unreadable output, a thrown runner, a
 * timeout, an empty answer: every one falls to the mechanical path and is
 * recorded as a fault. A leader that can halt the night is a worse failure than
 * a leader that is occasionally wrong.
 *
 * ‼️ AND IT IS NOT A DAEMON (X-167 decision 3). "Sleeping" here means not
 * existing until it is called. Nothing in this file schedules anything.
 *
 * Pure: no `fs`, no `child_process`, no `vscode`, no clock and no model. The one
 * impure act — running the turn — arrives as a `LeaderRunner` port, which is
 * also what makes "the same system for the other engines later" a second port
 * rather than a second design.
 */

/* ------------------------------------------------------------- the brief */

/** What the leader is told. Everything is optional except the two things that
 *  make the round a leader round at all: what happened, and what fired. */
export interface LeaderBriefInput {
    diagnosis: SessionDiagnosis;
    verdict: PolicyVerdict;
    /** the item `projects.backlog.next` picked, when there is one */
    next?: { code: string; text: string; effort?: string };
    /** the note that was found (X-189) — its path AND its opening lines */
    handover?: { path: string; head: string };
    /** `git diff --stat`, summarised by the caller */
    diffStat?: string;
    project?: string;
    repos?: string[];
    /** the accounts this campaign may spend, with what is left of each */
    accounts?: { slotId: string; percent: number; usable: boolean }[];
    /** ‼️ X-192 fills this: the user's own saved instructions, as MATERIAL for
     *  the leader to blend — never a template for it to copy. */
    instructions?: { label: string; text: string; when?: string }[];
    /** what this campaign has already spent, so the leader knows its leash */
    budget?: LeaderBudgetState;
}

/** ‼️ A prompt longer than this is REFUSED rather than cut. Half an instruction
 *  is worse than none: the next session would run on a sentence that stops. */
export const MAX_LEADER_PROMPT = 20000;

const line = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * The words the leader is woken with.
 *
 * ‼️ X-174's law travels INTO the prompt. A fact nobody measured is presented as
 * unmeasured, not as absent — an absent fact is an invitation to invent one, and
 * inventing is exactly what a model does when a brief reads as complete.
 */
export function buildLeaderBrief(i: LeaderBriefInput): string {
    const d = i.diagnosis;
    const out: string[] = [];

    out.push('You are the LEADER of an unattended overnight campaign. One round has just '
        + 'ended and you have been woken because something about it was not routine. Decide '
        + 'what the NEXT session should be told, then go back to sleep. You get one turn.');
    out.push('');

    out.push('## Why you were woken');
    out.push(i.verdict?.fired?.length
        ? `These conditions fired: ${i.verdict.fired.join(', ')}.`
        : 'No condition was named, which is itself worth noting.');
    if (i.verdict?.why) { out.push(line(i.verdict.why)); }
    if (i.verdict?.problems?.length) {
        out.push(`Conditions that could not be evaluated: ${i.verdict.problems.join(' · ')}`);
    }
    out.push('');

    out.push('## What the round left behind');
    out.push(`Session ${d.session} — verdict "${d.outcome}" by rule "${d.rule}".`);
    if (d.why) { out.push(line(d.why)); }
    if (d.evidence?.length) {
        out.push('Measured:');
        for (const e of d.evidence) { out.push(`  - ${e}`); }
    }
    // ‼️ Never merged into the list above. The whole point is that the leader can
    // tell the two apart.
    if (d.unknown?.length) {
        out.push('NOT MEASURED — nobody measured these, which is not the same as them being '
            + 'empty. Do not fill them in from imagination:');
        for (const u of d.unknown) { out.push(`  - ${u}`); }
    }
    out.push('');

    if (i.handover) {
        out.push('## The handover note the last session left');
        out.push(i.handover.path);
        if (i.handover.head) { out.push('', i.handover.head); }
        out.push('');
    }
    if (i.diffStat) {
        out.push('## What is uncommitted', i.diffStat, '');
    }
    if (i.next) {
        out.push('## What the backlog offers next');
        out.push(`${i.next.code} — ${line(i.next.text).slice(0, 600)}`
            + (i.next.effort ? ` (effort ${i.next.effort})` : ''));
        out.push('');
    }
    if (i.accounts?.length) {
        out.push('## Accounts this campaign may spend');
        for (const a of i.accounts) {
            out.push(`  - ${a.slotId} — ${a.percent}% of its window used`
                + (a.usable ? '' : ' — NOT USABLE right now'));
        }
        out.push('');
    }
    if (i.instructions?.length) {
        out.push('## The user\'s own standing instructions');
        out.push('Blend these into what you write. They are material, not a template to copy.');
        for (const s of i.instructions) {
            out.push(`  - [${s.label}]${s.when ? ` (when ${s.when})` : ''} ${line(s.text)}`);
        }
        out.push('');
    }
    if (i.budget) {
        const spent = Number(i.budget.spentUsd ?? 0);
        out.push('## Your leash');
        out.push(`Spent on leader turns today: $${spent.toFixed(4)} across `
            + `${i.budget.turns ?? 0} turn(s). When the daily budget is gone the campaign `
            + 'carries on without you. Be brief.');
        out.push('');
    }

    out.push('## Answer with one JSON object and nothing that matters outside it');
    out.push('{');
    out.push('  "prompt":  "the words the next session opens on — everything it needs, because '
        + 'it starts cold and has only this",');
    out.push('  "account": "the slot id to run it on, or null to leave the choice alone",');
    out.push('  "hold":    false,');
    out.push('  "why":     "one sentence: why this prompt"');
    out.push('}');
    out.push('');
    out.push('Set "hold" to true only if the next round should WAIT rather than open. '
        + 'If your answer cannot be read as JSON the round falls back to the mechanical '
        + 'template and your turn is recorded as a fault — so decide, then answer, and do '
        + 'not narrate around it.');

    return out.join('\n');
}

/* ------------------------------------------------------------- the reply */

export interface LeaderDecision {
    prompt: string;
    account: string | null;
    hold: boolean;
    why: string;
}

export interface LeaderReply {
    ok: boolean;
    decision?: LeaderDecision;
    /** why it could not be read — '' when it could */
    why: string;
}

/**
 * Every top-level `{…}` span in a string, brace-counted rather than matched with
 * a regular expression.
 *
 * ‼️ THIS MATTERS MORE THAN IT LOOKS. The thing the leader writes is a PROMPT,
 * and prompts in this codebase are full of `{nextCode}` placeholders. A greedy
 * or lazy regex either swallows the narration around the object or stops inside
 * the prompt string. String contents are skipped, escapes respected.
 */
function jsonSpans(s: string): string[] {
    const out: string[] = [];
    let depth = 0, start = -1, inStr = false, esc = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (inStr) {
            if (esc) { esc = false; }
            else if (c === '\\') { esc = true; }
            else if (c === '"') { inStr = false; }
            continue;
        }
        if (c === '"') { inStr = true; continue; }
        if (c === '{') { if (depth === 0) { start = i; } depth++; continue; }
        if (c === '}' && depth > 0) {
            depth--;
            if (depth === 0 && start >= 0) { out.push(s.slice(start, i + 1)); start = -1; }
        }
    }
    return out;
}

function readDecision(raw: string): LeaderReply {
    let obj: Record<string, unknown>;
    try { obj = JSON.parse(raw) as Record<string, unknown>; }
    catch (e) { return { ok: false, why: `that is not valid JSON — ${String((e as Error)?.message ?? e)}` }; }

    const prompt = typeof obj.prompt === 'string' ? obj.prompt.trim() : '';
    if (!prompt) {
        return { ok: false, why: 'the answer carries no "prompt", and an empty opening is an empty session' };
    }
    if (prompt.length > MAX_LEADER_PROMPT) {
        return {
            ok: false,
            why: `the prompt is ${prompt.length} characters, over the ${MAX_LEADER_PROMPT} limit — `
                + 'it is refused rather than cut, because half an instruction is worse than none'
        };
    }
    const acct = typeof obj.account === 'string' ? obj.account.trim() : '';
    return {
        ok: true,
        decision: {
            prompt,
            // '' is nobody, not a slot named empty-string; a number is not a slot at all.
            account: acct || null,
            hold: obj.hold === true,
            why: typeof obj.why === 'string' ? obj.why.trim() : ''
        },
        why: ''
    };
}

/**
 * Read the leader's answer out of whatever it actually said.
 *
 * The LAST valid object wins: a model that reconsiders puts its final answer
 * last, and a model that narrates puts prose first. When none of them is valid,
 * the refusal reported is the LAST one's — that is the answer it meant.
 */
export function parseLeaderReply(text: unknown): LeaderReply {
    const s = typeof text === 'string' ? text : '';
    const spans = jsonSpans(s);
    if (!spans.length) {
        return { ok: false, why: 'the answer contains no JSON object at all — it only narrated' };
    }
    let last: LeaderReply = { ok: false, why: 'the answer could not be read' };
    for (let i = spans.length - 1; i >= 0; i--) {
        const r = readDecision(spans[i]);
        if (r.ok) { return r; }
        if (i === spans.length - 1) { last = r; }
    }
    return last;
}

/* -------------------------------------------------------------- the leash */

export interface LeaderCaps {
    /** the model the turn runs on; '' = the campaign never chose one */
    model: string;
    /** seconds one turn may take before it is cut */
    maxSeconds: number;
    /** dollars one turn may cost before the NEXT one is refused */
    maxUsd: number;
    /** dollars per calendar day, per campaign */
    dailyUsd: number;
    /** failed turns in a row that drop the campaign to mechanical; 0 = no brake */
    failLimit: number;
    /**
     * ‼️ X-249 — WHOSE PLAN PAYS FOR THE TURN.
     *
     * The leader is the turn that decides which account the NEXT round opens
     * on, and it used to run on none: the runner spawned with no environment,
     * so it went to whatever sign-in the machine was holding — outside the pool
     * the user allowed, invisible to `pickAccount`, and able to wall the very
     * account the round it was choosing for was about to use.
     *
     * ‼️ EMPTY IS A REAL ANSWER AND IT IS NOT "THE MACHINE'S SIGN-IN". It means
     * nobody named one HERE, so the caller's own resolution stands — and the
     * caller's resolution is the campaign's pool, because a turn about the pool
     * belongs inside it. It is a slot id, not a directory: the variable's name
     * is the engine adapter's business (`engineAccounts.accountEnv`) and this
     * module has no disk.
     */
    account: string;
}

/**
 * ‼️ THE ENGINE THE LEADER RUNNER CAN ACTUALLY SPAWN TODAY — named here so that
 * exactly one place knows it, and so a surface asking "which models may the
 * leader be set to" has somewhere honest to ask.
 *
 * It is a CONSTANT rather than a choice because the runner is one
 * (`sentryLeaderRunner` in `src/extension.ts` spawns this engine and no other),
 * and a settable field over a runner that ignores it would be a box that lies.
 * X-249 turns it into a real axis; until then this is the truth, in one place.
 */
export const LEADER_ENGINE = 'claude';

/** ‼️ CHEAP BY DEFAULT, AND NAMED ONCE. The constitution's own test and cost
 *  policy: expensive models are not what an unattended loop runs on. The user
 *  can raise it from the settings, deliberately, having read the number. */
export const DEFAULT_LEADER_CAPS: LeaderCaps = {
    model: 'haiku',
    maxSeconds: 120,
    maxUsd: 0.25,
    dailyUsd: 2,
    failLimit: 3,
    // ‼️ There is no machine-wide default account, on purpose. The other four
    // are policy — a model and three numbers that mean the same thing on every
    // campaign — while an account belongs to the POOL a campaign was given, so
    // a farm-wide setting would answer a question nobody asked here.
    account: ''
};

/** What one campaign has already spent. Lives on the campaign record, so it
 *  survives the reload a timer would not. */
export interface LeaderBudgetState {
    /** the calendar day `spentUsd` is about */
    day?: string;
    spentUsd?: number;
    turns?: number;
    failStreak?: number;
    /** ‼️ has the user already been told the leader stopped waking today? An
     *  alert that repeats every round is an alert nobody reads. */
    announced?: boolean;
    /** the last N turns, newest last — the transparency surface (X-195) draws this */
    log?: ModelAssist[];
}

export interface LeaderAllowance {
    allowed: boolean;
    /** one sentence, always. A refusal with no stated cause is the bill again. */
    why: string;
    /** true when the user should be TOLD, not merely skipped */
    announce: boolean;
    remainingUsd: number;
}

/** How many turns the ledger keeps. Enough to see a night; not a log file. */
export const LEADER_LOG_KEEP = 20;

const num = (v: unknown, or = 0): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : or;
};

/**
 * May the leader be woken at all?
 *
 * ‼️ EVERY REFUSAL HERE MEANS "RUN MECHANICALLY", NEVER "STOP". That is the
 * whole difference between a leash and a brake, and it is the user's own line:
 * the campaign carries on, it just stops thinking for a while.
 */
export function leaderAllowed(
    state: LeaderBudgetState | undefined, caps: LeaderCaps, today: string
): LeaderAllowance {
    const fresh = !state || state.day !== today;
    const spent = fresh ? 0 : num(state?.spentUsd);
    const remainingUsd = Math.max(0, num(caps.dailyUsd) - spent);
    // A day that has rolled over has not been announced yet, whatever yesterday said.
    const announce = !(state?.announced && !fresh);

    if (num(caps.dailyUsd) > 0 && spent >= num(caps.dailyUsd)) {
        return {
            allowed: false, announce, remainingUsd: 0,
            why: `the leader's daily budget of $${num(caps.dailyUsd).toFixed(2)} is spent — `
                + 'the campaign carries on mechanically until tomorrow'
        };
    }
    const streak = num(state?.failStreak);
    if (num(caps.failLimit) > 0 && streak >= num(caps.failLimit)) {
        return {
            allowed: false, announce, remainingUsd,
            why: `${streak} leader turns failed in a row — the campaign has dropped to the `
                + 'mechanical path rather than paying for a seventh'
        };
    }
    // ‼️ A ceiling cannot un-spend money. What it can do is refuse the next one.
    const last = state?.log?.length ? state.log[state.log.length - 1] : undefined;
    if (!fresh && last && num(caps.maxUsd) > 0 && num(last.costUsd) > num(caps.maxUsd)) {
        return {
            allowed: false, announce, remainingUsd,
            why: `the last leader turn cost $${num(last.costUsd).toFixed(4)}, over the $`
                + `${num(caps.maxUsd).toFixed(2)} per-turn ceiling — running mechanically instead`
        };
    }
    return { allowed: true, announce: false, remainingUsd, why: '' };
}

/**
 * The ledger after a turn. Returns a NEW state; the one handed in is never
 * touched, because it is the campaign record somebody else is holding.
 *
 * ‼️ A turn that cost nothing is still a turn. A runner that never started
 * spends no money and fails just as much — counting only the expensive failures
 * is how a failure streak never trips.
 */
export function recordLeaderTurn(
    state: LeaderBudgetState | undefined, assist: ModelAssist, today: string, keep = LEADER_LOG_KEEP
): LeaderBudgetState {
    const fresh = !state || state.day !== today;
    const log = [...(state?.log ?? []), assist];
    return {
        day: today,
        spentUsd: (fresh ? 0 : num(state?.spentUsd)) + num(assist?.costUsd),
        turns: (fresh ? 0 : num(state?.turns)) + 1,
        // ‼️ The streak crosses midnight. A broken setup is broken tomorrow too;
        // only the MONEY is a daily thing.
        failStreak: assist?.ok ? 0 : num(state?.failStreak) + 1,
        ...(fresh ? {} : (state?.announced ? { announced: true } : {})),
        log: log.slice(Math.max(0, log.length - Math.max(1, keep)))
    };
}

/* --------------------------------------------------------------- the turn */

/**
 * The one impure act, injected. A second engine is a second port.
 *
 * ‼️ X-249 — AND `account` IS PART OF THE ASK, not of the runner's own memory.
 * It is a slot id and nothing more: what variable isolates that slot is the
 * engine adapter's answer, given where the process is actually spawned. A
 * runner that fetched the account itself would be a second place deciding whose
 * plan pays, and the two would disagree the first time a campaign named one.
 */
export type LeaderRunner = (o: {
    prompt: string; model: string; account: string; timeoutMs: number;
}) => Promise<{ text: string; costUsd?: number; error?: string }>;

export interface LeaderOutcome {
    /** 'leader' = its words open the next round · 'mechanical' = the template does */
    path: 'leader' | 'mechanical';
    decision?: LeaderDecision;
    assist?: ModelAssist;
    /** one sentence for the round's row and for Notices */
    why: string;
    /** the budget AFTER the turn — the caller persists this either way */
    budget: LeaderBudgetState;
    /** true when the user should be told something changed */
    announce: boolean;
}

/**
 * One bounded leader turn, or an honest refusal to take one.
 *
 * ‼️ NOTHING THROWN INSIDE THIS FUNCTION LEAVES IT. It is called from an
 * unattended loop at three in the morning; an exception here is a campaign that
 * stopped for a reason nobody will find until breakfast.
 */
export async function runLeaderTurn(
    i: LeaderBriefInput, caps: LeaderCaps, run: LeaderRunner,
    o: { today: string; now: () => number }
): Promise<LeaderOutcome> {
    const budget = i.budget ?? {};
    const mechanical = (why: string, announce = false): LeaderOutcome =>
        ({ path: 'mechanical', why, budget, announce });

    // 1. A round nothing fired on is FREE. This is the first leash and the one
    //    that does most of the work: the routine night costs nothing at all.
    if (i.verdict?.verdict !== 'leader') {
        return mechanical('no condition fired, so the leader was not woken');
    }

    const allow = leaderAllowed(budget, caps, o.today);
    if (!allow.allowed) {
        return {
            path: 'mechanical', why: allow.why, announce: allow.announce,
            // Remembering that it was announced is what makes "told once" true.
            budget: allow.announce ? { ...budget, announced: true } : budget
        };
    }

    const model = (caps.model || '').trim() || DEFAULT_LEADER_CAPS.model;
    // ‼️ X-249 — NOT `|| DEFAULT`, unlike the model. An unnamed account is not a
    // missing answer waiting for a fallback, it is the caller saying "you
    // decide"; substituting anything here would make this module a second place
    // that chooses whose plan pays.
    const account = String(caps.account ?? '').trim();
    const t0 = o.now();
    let text = '', costUsd = 0, error = '';
    try {
        const res = await run({
            prompt: buildLeaderBrief(i), model, account,
            timeoutMs: Math.max(1, num(caps.maxSeconds, DEFAULT_LEADER_CAPS.maxSeconds)) * 1000
        });
        text = String(res?.text ?? '');
        costUsd = num(res?.costUsd);
        error = String(res?.error ?? '');
    } catch (e) {
        error = String((e as Error)?.message ?? e);
    }

    // ‼️ X-249 — `account` is written on EVERY assist, including the failed
    // ones. A turn that spent a purse and produced nothing still spent it out of
    // somebody's five-hour window, and a record that only names the account on
    // success is a record that hides exactly the burns worth finding.
    const assist = (okTurn: boolean, note: string): ModelAssist => ({
        model, account, ms: Math.max(0, o.now() - t0), costUsd, at: o.now(), ok: okTurn,
        ...(note ? { note } : {})
    });

    if (error) {
        const a = assist(false, error);
        return {
            path: 'mechanical', assist: a, announce: false,
            why: `the leader turn failed — ${error}`,
            budget: recordLeaderTurn(budget, a, o.today)
        };
    }

    const reply = parseLeaderReply(text);
    if (!reply.ok || !reply.decision) {
        const a = assist(false, reply.why);
        return {
            path: 'mechanical', assist: a, announce: false,
            why: `the leader's answer could not be read — ${reply.why}`,
            budget: recordLeaderTurn(budget, a, o.today)
        };
    }

    const a = assist(true, '');
    return {
        path: 'leader', decision: reply.decision, assist: a, announce: false,
        why: reply.decision.why || 'the leader wrote the next prompt itself',
        budget: recordLeaderTurn(budget, a, o.today)
    };
}
