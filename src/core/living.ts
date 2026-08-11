import { AutomationEvent, evaluatePrecondition, Precondition, PreconditionDeps } from './automation';

/**
 * The Living page — one screen that answers a single question: **is the system
 * actually alive today?**
 *
 * Everything else in the farm reports on parts: tasks, notices, the queue,
 * costs. Nothing reported on the WHOLE, and that is exactly where a living
 * system dies — not with an error, but with a link that nobody picks up. The
 * measured failure this exists to make impossible: the daily LifeOS cycle
 * stopped for 16 days while the safety-net duty ran correctly every morning,
 * posted its reminder, and nobody read it. Every part "worked"; the system was
 * dead. Constitution Principle 1 — a rule that fails silently is not a rule —
 * demands a surface where that shows.
 *
 * A signal is not an error log. It is a claim about a loop: it opened, and did
 * it close? Pure logic (no fs, no vscode) so every rule is unit-testable; the
 * host injects the farm's current state.
 */

export type SignalState = 'ok' | 'warn' | 'dead' | 'idle';

export interface LivingSignal {
    id: string;
    /** the loop being checked, in the user's terms */
    label: string;
    state: SignalState;
    /** the concrete finding — always a fact, never a category */
    detail: string;
    /** what closes the loop, when it is open */
    hint?: string;
    /** how long it has been like this (ms), when that is the point */
    ageMs?: number;
    /** page the row navigates to */
    goto?: string;
    /** sort weight; higher floats to the top */
    weight: number;
}

/** A user-defined check: a precondition where TRUE means "needs attention". */
export interface LivingCheck {
    label: string;
    when: Precondition;
    /** how loud when it hits (default 'warn') */
    level?: 'info' | 'warn' | 'alert';
    hint?: string;
    /** shown instead of the raw precondition detail when it hits */
    detail?: string;
    /** text for the healthy case (default: the precondition's own detail) */
    okDetail?: string;
}

export interface NoticeLike {
    id: string;
    ts: number;
    type: string;
    level: number;
    title: string;
    read?: boolean;
    status?: string;
    handled?: boolean;
    agentName?: string;
}

export interface QueueLike {
    id: string;
    ts: number;
    status: string;
    text: string;
    author?: string;
}

export interface AutomationLike {
    id: string;
    title: string;
    enabled: boolean;
    hasGuard: boolean;
    lastFiredAt?: number;
    /** schedules only: the agent that runs it */
    agentName?: string;
}

export interface DutyLike {
    agentName: string;
    title: string;
    cadence: string;
    paused?: boolean;
    /** true when a schedule or trigger actually drives this duty */
    wired: boolean;
}

export interface LivingInput {
    now?: number;
    notices: NoticeLike[];
    queue: QueueLike[];
    automations: AutomationLike[];
    duties: DutyLike[];
    automationLog: AutomationEvent[];
    checks: LivingCheck[];
    /** farm gate: a blocking reason, or undefined when open for business */
    gateReason?: string;
    /** today's spend and the ceiling, when one is configured */
    spendToday?: number;
    budgetToday?: number;
    /** hours after which an unread important notice counts as ignored */
    noticeStaleHours?: number;
    /** hours after which a captured queue item counts as stalled */
    queueStaleHours?: number;
    /**
     * Projects and what is currently wrong with each — the SAME sentences the
     * project page prints, computed once by the host. This module does not
     * re-derive them: a second opinion on "is this folder there" is a second
     * answer that will disagree within a week.
     */
    projects?: { name: string; warnings: string[] }[];
    preconditionDeps?: PreconditionDeps;
}

export interface LivingReport {
    generatedAt: number;
    /** 0-100; the share of checked loops that are closing */
    score: number;
    /** the one-line verdict shown at the top */
    verdict: string;
    signals: LivingSignal[];
    counts: { ok: number; warn: number; dead: number; idle: number };
    /** newest automation decisions, for the "what has the farm been doing" tail */
    recent: AutomationEvent[];
}

const HOUR = 3600_000;

function ageOf(ts: number, now: number): string {
    const h = (now - ts) / HOUR;
    if (h < 1) { return `${Math.max(1, Math.round(h * 60))} min`; }
    if (h < 48) { return `${Math.round(h)} h`; }
    return `${Math.round(h / 24)} days`;
}

/**
 * Signal 1 — NOTICES: the board is agent→user. An important notice that has sat
 * unread is the exact shape of the failure this page exists for: the agent did
 * its job, and the loop still never closed.
 */
function noticeSignals(input: LivingInput, now: number): LivingSignal[] {
    const staleH = input.noticeStaleHours ?? 24;
    const out: LivingSignal[] = [];
    const unread = input.notices.filter(n => !n.read);
    const important = unread.filter(n => n.level >= 3);
    const stale = important.filter(n => now - n.ts > staleH * HOUR);
    const oldest = stale.slice().sort((a, b) => a.ts - b.ts)[0];

    if (stale.length) {
        out.push({
            id: 'notices-stale',
            label: 'Important notices read',
            state: stale.length > 2 ? 'dead' : 'warn',
            detail: `${stale.length} unread level-3+ notice(s) older than ${staleH}h — oldest "${oldest.title}" (${ageOf(oldest.ts, now)})`,
            hint: 'Open the board: an announcement nobody reads is the same as one nobody sent.',
            ageMs: now - oldest.ts,
            goto: 'notices',
            weight: 90 + stale.length
        });
    } else {
        out.push({
            id: 'notices-stale',
            label: 'Important notices read',
            state: 'ok',
            detail: unread.length
                ? `${unread.length} unread, none important and stale`
                : 'nothing unread',
            goto: 'notices',
            weight: 10
        });
    }

    // An open question is a loop the AGENT is blocked on — it asked and is still
    // waiting. That is worse than an unread update, so it gets its own row.
    const open = input.notices.filter(n => n.type === 'question' && n.status === 'open');
    const oldQ = open.slice().sort((a, b) => a.ts - b.ts)[0];
    out.push(open.length ? {
        id: 'questions',
        label: 'Agent questions answered',
        state: now - oldQ.ts > 24 * HOUR ? 'dead' : 'warn',
        detail: `${open.length} question(s) waiting — oldest from ${oldQ.agentName ?? 'an agent'}, ${ageOf(oldQ.ts, now)}: "${oldQ.title}"`,
        hint: 'The asking agent is working without this answer until you give it.',
        ageMs: now - oldQ.ts,
        goto: 'notices',
        weight: 95
    } : {
        id: 'questions', label: 'Agent questions answered', state: 'ok',
        detail: 'no question is waiting on you', goto: 'notices', weight: 10
    });

    // A question that was answered but never acted on: the agent's side is open.
    const unhandled = input.notices.filter(n =>
        n.type === 'question' && (n.status === 'answered' || n.status === 'declined') && !n.handled);
    if (unhandled.length) {
        out.push({
            id: 'questions-unhandled',
            label: 'Answers picked up by the agent',
            state: 'warn',
            detail: `${unhandled.length} answered question(s) the agent has not processed yet`,
            hint: 'The agent applies the answer and resolves it on its next run.',
            goto: 'notices',
            weight: 55
        });
    }
    return out;
}

/**
 * Signal 2 — THE QUEUE: user→agent. An item stuck in `captured` means the user
 * answered and the system dropped it. Measured: a sleep-log entry sat in
 * `captured` because the sweeping schedule was off, and the data never reached
 * the vault.
 */
function queueSignals(input: LivingInput, now: number): LivingSignal[] {
    const staleH = input.queueStaleHours ?? 24;
    const active = input.queue.filter(i =>
        i.status === 'captured' || i.status === 'grouped' || i.status === 'blocked');
    const blocked = active.filter(i => i.status === 'blocked');
    const out: LivingSignal[] = [];

    if (!active.length) {
        out.push({
            id: 'queue', label: 'Work queue moving', state: 'ok',
            detail: 'queue is empty', goto: 'queue', weight: 10
        });
    } else {
        const oldest = active.slice().sort((a, b) => a.ts - b.ts)[0];
        const ageH = (now - oldest.ts) / HOUR;
        out.push({
            id: 'queue',
            label: 'Work queue moving',
            state: ageH > staleH ? 'dead' : ageH > staleH / 2 ? 'warn' : 'ok',
            detail: `${active.length} active item(s); oldest ${ageOf(oldest.ts, now)} in "${oldest.status}" — "${oldest.text.slice(0, 60)}"`,
            hint: ageH > staleH
                ? 'Nothing is sweeping the queue: an item this old means the pipeline stopped, not that it is warming up.'
                : undefined,
            ageMs: now - oldest.ts,
            goto: 'queue',
            weight: ageH > staleH ? 92 : 40
        });
    }
    if (blocked.length) {
        out.push({
            id: 'queue-blocked',
            label: 'Blocked queue items',
            state: 'warn',
            detail: `${blocked.length} item(s) blocked on a question for you`,
            hint: 'Blocked is the only attention-grabbing state — answer to unblock the agent.',
            goto: 'queue',
            weight: 80
        });
    }
    return out;
}

/**
 * Signal 3 — AUTOMATIONS: are the loops that should run, running? Three
 * distinct failure shapes, each with its own row.
 */
function automationSignals(input: LivingInput, now: number): LivingSignal[] {
    const out: LivingSignal[] = [];
    const enabled = input.automations.filter(a => a.enabled);

    if (input.gateReason) {
        out.push({
            id: 'gate',
            label: 'Automation gate open',
            state: 'warn',
            detail: input.gateReason,
            hint: 'Nothing runs on its own while the gate is closed — deliberate is fine, forgotten is not.',
            goto: 'tasks',
            weight: 85
        });
    }
    if (!enabled.length) {
        out.push({
            id: 'automations',
            label: 'Automations enabled',
            state: 'dead',
            detail: `all ${input.automations.length} automation(s) are switched off`,
            hint: 'Nothing wakes on its own: every duty now depends on you remembering it.',
            goto: 'tasks',
            weight: 99
        });
    } else {
        // "enabled but has not fired in a week" is the quiet death: still on the
        // list, still green, doing nothing.
        const silent = enabled.filter(a => !a.lastFiredAt || now - a.lastFiredAt > 7 * 24 * HOUR);
        out.push({
            id: 'automations',
            label: 'Automations enabled',
            state: silent.length ? 'warn' : 'ok',
            detail: silent.length
                ? `${enabled.length} enabled, but ${silent.length} have not fired in 7 days (${silent.slice(0, 3).map(s => s.title).join(', ')}${silent.length > 3 ? '…' : ''})`
                : `${enabled.length} enabled, all fired within the week`,
            hint: silent.length ? 'Either its precondition is never met, or it is wired to nothing.' : undefined,
            goto: 'tasks',
            weight: silent.length ? 60 : 12
        });
    }

    const unguarded = enabled.filter(a => !a.hasGuard);
    if (unguarded.length) {
        out.push({
            id: 'guards',
            label: 'Wake-ups are guarded',
            state: 'warn',
            detail: `${unguarded.length} live automation(s) have no precondition — they wake an agent whether or not there is work`,
            hint: 'Add a fireIf guard: it is checked for free, before anything is spent.',
            goto: 'tasks',
            weight: 50
        });
    }
    return out;
}

/**
 * Signal 4 — DUTIES: a standing duty with a daily/weekly cadence and nothing
 * wired to it is a dead duty. `[every-turn]` is passive by design; only a
 * schedule or trigger makes a duty actually happen.
 */
function dutySignals(input: LivingInput): LivingSignal[] {
    const needsWiring = input.duties.filter(d =>
        !d.paused && (d.cadence === 'daily' || d.cadence === 'weekly'));
    if (!needsWiring.length) { return []; }
    const dead = needsWiring.filter(d => !d.wired);
    return [dead.length ? {
        id: 'duties',
        label: 'Standing duties wired',
        state: 'warn',
        detail: `${dead.length} of ${needsWiring.length} timed duties have no schedule/trigger behind them (${dead.slice(0, 3).map(d => `${d.agentName}: ${d.title}`).join(' · ')}${dead.length > 3 ? '…' : ''})`,
        hint: 'A duty nothing drives only runs when something else happens to wake the agent.',
        goto: 'tasks',
        weight: 65
    } : {
        id: 'duties', label: 'Standing duties wired', state: 'ok',
        detail: `all ${needsWiring.length} timed duties have an automation behind them`,
        goto: 'tasks', weight: 12
    }];
}

/** Signal 5 — SPEND against today's ceiling. */
function spendSignal(input: LivingInput): LivingSignal[] {
    if (input.spendToday === undefined) { return []; }
    const spend = input.spendToday;
    const budget = input.budgetToday;
    if (!budget) {
        return [{
            id: 'spend', label: 'Spend today', state: 'idle',
            detail: `$${spend.toFixed(2)} today · no ceiling set`,
            hint: 'Set agentFarm.budgets to make the ceiling a brake, not a hope.',
            goto: 'dashboard', weight: 20
        }];
    }
    const pct = Math.round(100 * spend / budget);
    return [{
        id: 'spend',
        label: 'Spend today',
        state: pct >= 100 ? 'dead' : pct >= 80 ? 'warn' : 'ok',
        detail: `$${spend.toFixed(2)} of $${budget.toFixed(2)} (${pct}%)`,
        hint: pct >= 100 ? 'The ceiling is reached — nothing new launches until it resets or you raise it.' : undefined,
        goto: 'dashboard',
        weight: pct >= 100 ? 88 : pct >= 80 ? 45 : 15
    }];
}

/**
 * Signal 6 — PROJECTS: an umbrella whose own health has stopped being true.
 *
 * ‼️ IT DOES NOT INVENT A SECOND ALARM SYSTEM, AND THAT IS THE WHOLE POINT
 * (Faz 6). The project page has told the truth about missing folders, blown
 * budgets and projects marked active that nothing has touched — on the project
 * page, which is where you go when you already suspect something. This is the
 * screen you look at when you do not, and a warning that only exists somewhere
 * you have to think to visit is Principle 1's silent rule.
 *
 * ONE row for all of them rather than one per project: a fleet with nine
 * projects would otherwise push every other loop off the page, and "three
 * projects need attention" plus their names is the same information at a
 * tenth of the height. The names are in the detail, so the row still says
 * WHICH — a count with no names is a row you cannot act on.
 */
function projectSignals(input: LivingInput): LivingSignal[] {
    const rows = input.projects ?? [];
    if (!rows.length) { return []; }
    const bad = rows.filter(p => p.warnings.length);
    if (!bad.length) {
        return [{
            id: 'projects', label: 'Projects healthy', state: 'ok',
            detail: `all ${rows.length} project(s): folder there, inside budget, worked recently`,
            goto: 'projects', weight: 13
        }];
    }
    // A missing folder is the one that stops a loop dead: the plan, the
    // backlog and the worklog are in it, so every write side of the project
    // axis is broken until it is relinked. The others are a project needing
    // attention, not a mechanism that has stopped.
    const gone = bad.filter(p => p.warnings.some(w => w.startsWith('folder not found')));
    const detail = bad.slice(0, 4)
        .map(p => `${p.name}: ${p.warnings[0]}`)
        .join(' · ') + (bad.length > 4 ? ` · +${bad.length - 4} more` : '');
    return [{
        id: 'projects',
        label: bad.length === 1 ? '1 project needs attention' : `${bad.length} projects need attention`,
        state: gone.length ? 'dead' : 'warn',
        detail,
        hint: gone.length
            ? 'A folder that is not there takes the plan, the backlog and the worklog with it — relink it on the project page.'
            : 'Open the project page: each warning names its own answer.',
        goto: 'projects',
        weight: gone.length ? 84 : 48
    }];
}

/** Signal 7 — the user's own checks (vault day files, inbox folders, …). */
function checkSignals(input: LivingInput): LivingSignal[] {
    return input.checks.map((c, i) => {
        const v = evaluatePrecondition(c.when, input.preconditionDeps);
        const level = c.level ?? 'warn';
        return {
            id: `check-${i}`,
            label: c.label,
            // TRUE = needs attention
            state: v.ok ? (level === 'alert' ? 'dead' : level === 'info' ? 'idle' : 'warn') : 'ok',
            detail: v.ok ? (c.detail ?? v.detail) : (c.okDetail ?? v.detail),
            hint: v.ok ? c.hint : undefined,
            weight: v.ok ? (level === 'alert' ? 93 : level === 'info' ? 30 : 70) : 11
        } as LivingSignal;
    });
}

/** Assemble the whole picture. */
export function buildLivingReport(input: LivingInput): LivingReport {
    const now = input.now ?? Date.now();
    const signals = [
        ...noticeSignals(input, now),
        ...queueSignals(input, now),
        ...automationSignals(input, now),
        ...dutySignals(input),
        ...spendSignal(input),
        ...projectSignals(input),
        ...checkSignals(input)
    ].sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));

    const counts = { ok: 0, warn: 0, dead: 0, idle: 0 };
    for (const s of signals) { counts[s.state]++; }
    const scored = counts.ok + counts.warn + counts.dead;
    // A dead loop counts zero, a warning counts half — a system with one dead
    // loop should not read as "94% healthy".
    const score = scored ? Math.round(100 * (counts.ok + 0.5 * counts.warn) / scored) : 100;

    const verdict = counts.dead
        ? `${counts.dead} loop(s) have stopped`
        : counts.warn
            ? `${counts.warn} loop(s) need you`
            : 'every loop is closing';

    return {
        generatedAt: now,
        score,
        verdict,
        signals,
        counts,
        recent: input.automationLog.slice(-25).reverse()
    };
}

/**
 * Which duties are actually driven by something. A duty counts as wired when a
 * schedule or trigger names it — by its own title, or by an automation title
 * that contains the duty title (how `duties.automate` names what it creates).
 */
export function wireDuties(
    duties: { agentName: string; title: string; cadence: string; paused?: boolean }[],
    automations: { title: string; prompt?: string; enabled: boolean }[]
): DutyLike[] {
    const live = automations.filter(a => a.enabled);
    return duties.map(d => {
        const needle = d.title.toLowerCase();
        return {
            ...d,
            wired: live.some(a =>
                a.title.toLowerCase().includes(needle) ||
                (a.prompt ?? '').toLowerCase().includes(needle))
        };
    });
}
