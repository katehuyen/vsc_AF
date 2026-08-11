import { ProjectAnalysis, localDay, localWeek } from './projectAnalysis';

/**
 * A project, written down — the markdown a person reads and an agent posts.
 *
 * ‼️ ONE BUILDER, TWO CALLERS, AND THAT IS THE POINT. `projects.report` (an
 * agent asking) and the weekly digest (the farm telling) used to be two
 * paragraphs somebody would have written twice, and two summaries of the same
 * project that disagree are worse than one nobody reads. The period is an
 * argument; everything else is the same document.
 *
 * ‼️ IT STATES ITS OWN GAPS. A project with no folder has no plan and no
 * backlog, and a report that simply omitted those sections would read as "there
 * is nothing open" — which is a different claim from "nobody has told Agent
 * Farm where this project's documents are". Every section that can be absent
 * for a reason says the reason.
 *
 * Pure: the caller reads the folder, resolves the sessions and folds the
 * analysis; this arranges. Hard-coded strings are English (the extension's
 * working language); everything quoted from the project — item text, plan
 * lines, decision titles — is the user's own and is reproduced verbatim.
 */

export interface ReportProject {
    name: string;
    status: string;
    kind?: string;
    summary?: string;
    folder?: string;
    repos?: string[];
    people?: { name: string; role: string }[];
    budgetUSD?: number;
    budgetTotalUSD?: number;
    dueAt?: number;
    /** what the project page says is currently wrong */
    warnings?: string[];
}

export interface ReportWork {
    runningTasks: number;
    queuedTasks: number;
    doneTasks: number;
    failedTasks: number;
    liveMissions: number;
    openNotices: number;
    openQuestions: number;
    liveQueue: number;
    blockedQueue: number;
}

export interface ReportItem {
    code?: string;
    text: string;
    state?: string;
}

export interface ReportEvent {
    ts: number;
    kind: string;
    title: string;
    detail?: string;
}

export interface ProjectReportInput {
    project: ReportProject;
    /** Period covered, in ms epoch. `sinceTs === 0` means "everything". */
    sinceTs: number;
    now?: number;
    /** the fold from projectAnalysis.ts, over the WHOLE project */
    analysis?: ProjectAnalysis;
    /** cost figures the Cost tab already computes */
    cost?: { total: number; today: number; period?: number };
    sessions?: { n: number; turns: number; agents: string[] };
    work?: ReportWork;
    /** open plan items, in the document's own words */
    plan?: ReportItem[];
    /** the next few backlog items, in the user's own queue order */
    backlog?: ReportItem[];
    /** what closed inside the period */
    closed?: ReportItem[];
    /** decisions and deliverables recorded inside the period */
    events?: ReportEvent[];
    /** the newest worklog lines, verbatim */
    worklog?: string[];
    /** why a section is empty, when the reason is not "nothing happened" */
    gaps?: { noFolder?: boolean; noPlan?: boolean; noBacklog?: boolean; noRepos?: boolean };
}

const DAY = 86400000;

function money(n: number | undefined): string {
    return '$' + (Number(n) || 0).toFixed(2);
}

/** A period a person reads without doing arithmetic. */
function periodLabel(sinceTs: number, now: number): string {
    if (!sinceTs) { return 'the whole project'; }
    const days = Math.max(1, Math.round((now - sinceTs) / DAY));
    if (days === 7) { return 'the last 7 days'; }
    if (days === 1) { return 'the last 24 hours'; }
    if (days % 7 === 0) { return `the last ${days / 7} weeks`; }
    return `the last ${days} days`;
}

/** One item as a line: the code when it has one, then the user's own words. */
function itemLine(i: ReportItem, max = 160): string {
    const text = String(i.text ?? '').replace(/\s+/g, ' ').trim();
    const cut = text.length > max ? text.slice(0, max - 1) + '…' : text;
    return `- ${i.code ? `**${i.code}** ` : ''}${cut}`;
}

/**
 * The report.
 *
 * `heading` is the H1; the digest passes the project's name and the date, an
 * agent asking for a report gets the same document with its own title.
 */
export function buildProjectReport(input: ProjectReportInput, heading?: string): string {
    const now = input.now ?? Date.now();
    const p = input.project;
    const period = periodLabel(input.sinceTs, now);
    const L: string[] = [];

    L.push(`# ${heading ?? `${p.name} — project report`}`, '');
    L.push(`_${localDay(now)} · covering ${period}_`, '');
    if (p.summary) { L.push(p.summary, ''); }

    // ---- what it is ----
    const facts = [
        `- Status: **${p.status}**${p.kind ? ` · ${p.kind}` : ''}`,
        p.dueAt ? `- Due: ${localDay(p.dueAt)}` : '',
        p.folder ? `- Docs: \`${p.folder}\`` : '- Docs: **no folder chosen** — the plan, the backlog and the worklog all live in one, so none of them can be reported until there is.',
        (p.repos ?? []).length ? `- Code: ${(p.repos ?? []).map(r => `\`${r}\``).join(' · ')}` : '- Code: no roots declared — nothing files a commit to this project.',
        (p.people ?? []).length ? `- People: ${(p.people ?? []).map(x => `${x.name} (${x.role})`).join(' · ')}` : '',
        p.budgetUSD ? `- Daily budget: ${money(p.budgetUSD)}` : '',
        p.budgetTotalUSD ? `- Total budget: ${money(p.budgetTotalUSD)}` : ''
    ].filter(Boolean);
    L.push(...facts, '');

    if ((p.warnings ?? []).length) {
        L.push('## ‼️ Needs attention', '');
        for (const w of p.warnings ?? []) { L.push(`- ${w}`); }
        L.push('');
    }

    // ---- the period ----
    L.push('## What happened', '');
    if (input.sessions) {
        const s = input.sessions;
        L.push(`- ${s.n} session(s), ${s.turns} turn(s)`
            + (s.agents.length ? ` · ${s.agents.join(', ')}` : ''));
    }
    if (input.cost) {
        L.push(`- Spend: ${money(input.cost.total)} total`
            + (input.cost.period !== undefined ? ` · ${money(input.cost.period)} in ${period}` : '')
            + ` · ${money(input.cost.today)} today`);
    }
    if (input.work) {
        const w = input.work;
        const bits = [
            w.runningTasks ? `${w.runningTasks} task(s) running` : '',
            w.queuedTasks ? `${w.queuedTasks} queued` : '',
            w.liveMissions ? `${w.liveMissions} mission(s) in flight` : '',
            w.doneTasks ? `${w.doneTasks} task(s) finished` : '',
            w.failedTasks ? `${w.failedTasks} failed` : ''
        ].filter(Boolean);
        if (bits.length) { L.push(`- Work: ${bits.join(' · ')}`); }
        const needs = [
            w.openQuestions ? `${w.openQuestions} unanswered question(s)` : '',
            w.openNotices ? `${w.openNotices} unread notice(s)` : '',
            w.blockedQueue ? `${w.blockedQueue} queue item(s) blocked on you` : ''
        ].filter(Boolean);
        if (needs.length) { L.push(`- **Waiting on you:** ${needs.join(' · ')}`); }
    }
    if (!input.sessions && !input.cost && !input.work) {
        L.push('_Nothing was measured for this period._');
    }
    L.push('');

    // ---- closed ----
    L.push('## Closed', '');
    if ((input.closed ?? []).length) {
        for (const i of input.closed ?? []) { L.push(itemLine(i)); }
    } else if (input.gaps?.noBacklog) {
        L.push('_This project has no backlog document (`af-role: backlog`), so there is nothing to close against._');
    } else {
        L.push(`_No backlog item closed in ${period}._`);
    }
    L.push('');

    // ---- what is next ----
    L.push('## Open', '');
    if ((input.plan ?? []).length) {
        L.push('**Plan**', '');
        for (const i of input.plan ?? []) { L.push(itemLine(i)); }
        L.push('');
    } else if (input.gaps?.noPlan) {
        L.push('_No plan document (`af-role: plan`) in this project\'s folder._', '');
    }
    if ((input.backlog ?? []).length) {
        L.push('**Next in backlog**', '');
        for (const i of input.backlog ?? []) { L.push(itemLine(i)); }
        L.push('');
    } else if (!input.gaps?.noBacklog) {
        L.push('_Nothing queued in the backlog._', '');
    }

    // ---- decisions and deliverables ----
    if ((input.events ?? []).length) {
        L.push('## Recorded', '');
        for (const e of input.events ?? []) {
            L.push(`- \`${localDay(e.ts)}\` **${e.kind}** — ${e.title}${e.detail ? ` · ${e.detail}` : ''}`);
        }
        L.push('');
    }

    // ---- how it is being worked ----
    const a = input.analysis;
    if (a) {
        L.push('## How it is being worked', '');
        if (a.pace) {
            L.push(`- Pace: **${a.pace.recentPerWeek}** sessions/week over the last 4, against **${a.pace.allPerWeek}** across ${a.pace.weeksCovered} week(s)`);
            L.push(`- Cost per session: **${money(a.pace.recentCostPerSession)}** recently, **${money(a.pace.allCostPerSession)}** all told`);
        }
        if (a.cycle) {
            L.push(`- Cycle time: median **${a.cycle.medianDays}** day(s) from first touch to close, 90th percentile ${a.cycle.p90Days} (${a.cycle.n} items)`);
        } else {
            L.push('- Cycle time: not enough closed items with a recorded start and end yet.');
        }
        if (a.rhythm) {
            const dow = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][a.rhythm.peak.dow];
            L.push(`- Rhythm: busiest ${dow} around ${String(a.rhythm.peak.hour).padStart(2, '0')}:00 · ${Math.round(a.rhythm.outOfHours * 100)}% of turns outside Mon–Fri 09:00–18:00`);
        }
        if (a.files.length) {
            L.push(`- Most written: ${a.files.slice(0, 5).map(f => `\`${f.key.split(/[\\/]/).pop()}\` (${f.n})`).join(' · ')}`);
        }
        // The recent weeks, as a table a person can scan.
        const weeks = a.weeks.slice(-6);
        if (weeks.length > 1) {
            L.push('', '| week of | sessions | turns | cost | commits | opened | closed |',
                '|---|---:|---:|---:|---:|---:|---:|');
            for (const w of weeks) {
                L.push(`| ${w.week} | ${w.sessions} | ${w.turns} | ${money(w.cost)} | ${w.commits} | ${w.opened} | ${w.closed} |`);
            }
        }
        L.push('');
    }

    // ---- the user's own log ----
    if ((input.worklog ?? []).length) {
        L.push('## From the worklog', '');
        for (const line of input.worklog ?? []) { L.push(line); }
        L.push('');
    } else if (input.gaps?.noFolder) {
        L.push('## From the worklog', '',
            '_No folder, so no worklog. Choose one on the project page and Agent Farm builds the skeleton._', '');
    }

    L.push('---', '',
        '_Built by Agent Farm from what the project itself records: its sessions, its tasks and missions, '
        + 'the commits in its declared code roots, and its own documents. Nothing here is inferred from an '
        + 'agent\'s name or a folder that was not declared — work nobody filed under this project is absent '
        + 'rather than guessed at._');
    return L.join('\n') + '\n';
}

/**
 * The one-paragraph version — a notice's BODY, with the report as its second
 * leg (`_REF/notices.md`).
 *
 * ‼️ A GENUINE SUMMARY, NOT A TEASER. The constitution's rule for the second
 * leg is that the body stands on its own and the file holds the depth; a body
 * that says "see the report" is a notification, and a notification about a
 * weekly digest is a thing people switch off in a fortnight.
 */
export function buildDigestBody(input: ProjectReportInput): string {
    const now = input.now ?? Date.now();
    const p = input.project;
    const s = input.sessions;
    const w = input.work;
    const bits: string[] = [];

    if (s && s.n) {
        bits.push(`${s.n} session(s) and ${s.turns} turn(s)`
            + (input.cost?.period !== undefined ? `, ${money(input.cost.period)}` : ''));
    } else {
        bits.push('no sessions');
    }
    if ((input.closed ?? []).length) {
        bits.push(`${(input.closed ?? []).length} backlog item(s) closed`);
    }
    if (w?.doneTasks) { bits.push(`${w.doneTasks} task(s) finished`); }
    if (w?.failedTasks) { bits.push(`${w.failedTasks} failed`); }

    const lines = [`**${p.name}** — ${periodLabel(input.sinceTs, now)}: ${bits.join(' · ')}.`];

    const needs = [
        w?.openQuestions ? `${w.openQuestions} unanswered question(s)` : '',
        w?.blockedQueue ? `${w.blockedQueue} queue item(s) blocked on you` : '',
        w?.openNotices ? `${w.openNotices} unread notice(s)` : ''
    ].filter(Boolean);
    if (needs.length) { lines.push('', `**Waiting on you:** ${needs.join(' · ')}.`); }

    if ((p.warnings ?? []).length) {
        lines.push('', `**‼️ ${(p.warnings ?? []).join(' · ')}**`);
    }

    if ((input.closed ?? []).length) {
        lines.push('', '**Closed**', ...(input.closed ?? []).slice(0, 6).map(i => itemLine(i, 110)));
    }
    const next = (input.backlog ?? []).slice(0, 3);
    if (next.length) {
        lines.push('', '**Next**', ...next.map(i => itemLine(i, 110)));
    }
    if (!s?.n && !(input.closed ?? []).length && !needs.length) {
        lines.push('', '_Quiet week — nothing ran, nothing closed, nothing is waiting on you._');
    }
    return lines.join('\n');
}

/**
 * The digest's file-name stem — the report writer adds the date and the agent.
 *
 * English, because a name this code GENERATES is part of the mechanism; the
 * project's own name rides inside it untouched, which is the user's. Same rule
 * as every other hard-coded string in the extension.
 */
export function digestName(projectName: string, now = Date.now()): string {
    return `${projectName} weekly digest ${localWeek(now)}`;
}
