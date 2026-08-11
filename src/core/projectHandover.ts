import { ProjectAnalysis, localDay } from './projectAnalysis';

/**
 * The handover — the letter you write to whoever picks this up in three months,
 * including yourself.
 *
 * ‼️ IT IS NOT A SECOND REPORT. `projectReport.ts` answers "what happened
 * lately"; this answers "I know nothing about this project and I have to work
 * on it tomorrow". Different questions, so different content: where every file
 * is, who to ask, why it is built the way it is, what was tried and abandoned,
 * and what to do in the first five minutes. A report is a period; a handover is
 * a **starting position**, and it deliberately has no period at all.
 *
 * ‼️ THE MOST VALUABLE SECTION IS THE ONE MACHINES CANNOT WRITE. Everything
 * here is derived — documents, ledgers, git roots, the fold. The traps ("the
 * build breaks unless you run X first"), the reasons a thing was NOT done, the
 * person who must be told before a release: only the user has those. So the
 * document ends in a block that is **theirs**, is preserved verbatim every time
 * the rest is regenerated (`mergeHandoverNotes`), and says out loud that it is
 * the part worth writing. A generated file that silently ate somebody's notes
 * on its second run would be worse than no file.
 *
 * Pure: the caller reads the folder, the ledger and the repos; this arranges.
 * Hard-coded strings are English (the extension's working language); everything
 * quoted from the project is the user's own and is reproduced verbatim.
 */

/** Where the user's own writing starts. Everything from this line down survives
 *  a regeneration — it is a marker, not a position, so it can be moved. */
export const HANDOVER_NOTES_ANCHOR = '<!-- af:handover-notes -->';

export interface HandoverDoc {
    role: string;
    /** relative to the project folder */
    path: string;
}

export interface HandoverItem {
    code?: string;
    text: string;
    /** for a blocked item: what it waits on */
    blockedBy?: string;
}

export interface HandoverRecord {
    ts: number;
    title: string;
    /** relative path, when the record is a file of its own */
    path?: string;
    detail?: string;
}

/** A coded item somebody worked and did not close — the most expensive thing to
 *  rediscover, and the only place it is written down is the track ledger. */
export interface HandoverUnfinished {
    code: string;
    text: string;
    /** how many sessions have touched it */
    sessions: number;
    /** when it was last worked */
    lastTs: number;
    /** the last note left on it, verbatim */
    note?: string;
}

export interface HandoverInput {
    project: {
        name: string;
        status: string;
        kind?: string;
        summary?: string;
        folder?: string;
        folderMissing?: boolean;
        repos?: { path: string; missing?: boolean }[];
        people?: { name: string; role: string; contact?: string }[];
        tags?: string[];
        startedAt?: number;
        dueAt?: number;
        budgetUSD?: number;
        budgetTotalUSD?: number;
        warnings?: string[];
    };
    /** the project this one is part of, and the parts it has */
    parent?: { name: string; status: string };
    children?: { name: string; status: string }[];
    /** which document holds which role, so a newcomer can open them by hand */
    docs?: HandoverDoc[];
    /** the charter's own prose, verbatim — the project's answer to "what is this" */
    charter?: string;
    plan?: HandoverItem[];
    backlog?: HandoverItem[];
    blocked?: HandoverItem[];
    decisions?: HandoverRecord[];
    deliverables?: HandoverRecord[];
    unfinished?: HandoverUnfinished[];
    work?: {
        runningTasks: number;
        queuedTasks: number;
        liveMissions: number;
        openQuestions: number;
        blockedQueue: number;
    };
    sessions?: { n: number; turns: number; agents: string[]; firstTs?: number; lastTs?: number };
    cost?: { total: number; today: number };
    analysis?: ProjectAnalysis;
    worklog?: string[];
    /** why a section is empty when the reason is not "nothing happened" */
    gaps?: { noFolder?: boolean; noPlan?: boolean; noBacklog?: boolean; noCharter?: boolean };
    now?: number;
}

const money = (n: number | undefined): string => '$' + (Number(n) || 0).toFixed(2);

function itemLine(i: HandoverItem, max = 160): string {
    const text = String(i.text ?? '').replace(/\s+/g, ' ').trim();
    const cut = text.length > max ? text.slice(0, max - 1) + '…' : text;
    return `- ${i.code ? `**${i.code}** ` : ''}${cut}${i.blockedBy ? ` — ⛔ waits on ${i.blockedBy}` : ''}`;
}

/**
 * "3 months ago", "11 days ago", "today" — a WHOLE phrase, not a number the
 * caller then has to word.
 *
 * ‼️ It returns the "ago" itself, because the first version did not and every
 * call site wrote `${ageOf(...)} ago` — which printed **"today ago"** the first
 * time it was run against real data. A helper that leaves one word to the
 * caller leaves it to every caller.
 */
function sinceOf(from: number, to: number): string {
    const days = Math.max(0, Math.round((to - from) / 86400000));
    if (days < 1) { return 'today'; }
    if (days === 1) { return 'yesterday'; }
    if (days < 60) { return `${days} days ago`; }
    return `${Math.round(days / 30)} months ago`;
}

/**
 * The generated body — everything above the user's own block.
 *
 * Split out because `mergeHandoverNotes` needs the two halves separately: this
 * is the part that is rewritten, and only this part.
 */
export function buildHandoverBody(input: HandoverInput): string {
    const now = input.now ?? Date.now();
    const p = input.project;
    const L: string[] = [];

    L.push(`# ${p.name} — handover`, '');
    L.push(`_Written by Agent Farm on ${localDay(now)}. If you are picking this project up, `
        + 'read it top to bottom once — it is arranged as the order of the questions you are '
        + 'about to have._', '');

    // ---- 1. what this is ----
    L.push('## What this is', '');
    if (p.summary) { L.push(p.summary, ''); }
    if (input.charter) {
        L.push(input.charter.trim(), '');
    } else if (input.gaps?.noCharter) {
        L.push('_This project has no charter document (`af-role: charter`), so nothing here says '
            + 'what it is for in its own words — the single most useful thing to write next._', '');
    }
    const facts = [
        `- Status: **${p.status}**${p.kind ? ` · ${p.kind}` : ''}`,
        p.startedAt ? `- Started: ${localDay(p.startedAt)} (${sinceOf(p.startedAt, now)})` : '',
        p.dueAt ? `- Due: ${localDay(p.dueAt)}` : '',
        input.parent ? `- Part of: **${input.parent.name}** (${input.parent.status})` : '',
        (input.children ?? []).length
            ? `- Parts: ${(input.children ?? []).map(c => `**${c.name}** (${c.status})`).join(' · ')}`
            : '',
        (p.tags ?? []).length ? `- Tags: ${(p.tags ?? []).join(' · ')}` : '',
        p.budgetUSD ? `- Daily budget: ${money(p.budgetUSD)}` : '',
        p.budgetTotalUSD ? `- Total budget: ${money(p.budgetTotalUSD)}` : ''
    ].filter(Boolean);
    L.push(...facts, '');

    // ---- 2. where everything is ----
    L.push('## Where everything is', '');
    if (p.folder) {
        L.push(`- **Documents:** \`${p.folder}\``
            + (p.folderMissing ? ' — ‼️ **not on this machine.** Everything below that comes from a document is missing for that reason, not because it is empty.' : ''));
    } else {
        L.push('- **Documents: no folder chosen.** The plan, the backlog, the decisions and the '
            + 'worklog all live in one, so none of them exist yet. Pick a folder on the project '
            + 'page and Agent Farm builds the skeleton.');
    }
    for (const d of input.docs ?? []) {
        L.push(`    - ${d.role}: \`${d.path}\``);
    }
    if ((p.repos ?? []).length) {
        for (const r of p.repos ?? []) {
            L.push(`- **Code:** \`${r.path}\``
                + (r.missing ? ' — ‼️ not on this machine; clone it before anything below about commits means anything.' : ''));
        }
    } else {
        L.push('- **Code: no roots declared.** Nothing files a commit to this project, and the '
            + 'Code tab will stay empty however much work happens in a repository.');
    }
    L.push('');

    // ---- 3. who to ask ----
    L.push('## Who to ask', '');
    if ((p.people ?? []).length) {
        for (const x of p.people ?? []) {
            L.push(`- **${x.name}** — ${x.role}${x.contact ? ` · ${x.contact}` : ''}`);
        }
    } else {
        L.push('_Nobody is recorded. "Who decides" and "who pays" are different people and in '
            + 'three months nobody remembers which was which — the People tab is where that goes._');
    }
    L.push('');

    // ---- 4. where it stands ----
    L.push('## Where it stands', '');
    if (input.sessions) {
        const s = input.sessions;
        const span = s.firstTs && s.lastTs
            ? ` between ${localDay(s.firstTs)} and ${localDay(s.lastTs)}`
            : '';
        L.push(`- ${s.n} session(s), ${s.turns} turn(s)${span}`
            + (s.agents.length ? ` · ${s.agents.join(', ')}` : ''));
        if (s.lastTs) { L.push(`- Last touched **${sinceOf(s.lastTs, now)}**`); }
    }
    if (input.cost) { L.push(`- Spend: ${money(input.cost.total)} all told · ${money(input.cost.today)} today`); }
    if (input.work) {
        const w = input.work;
        const bits = [
            w.runningTasks ? `${w.runningTasks} task(s) still running` : '',
            w.queuedTasks ? `${w.queuedTasks} queued` : '',
            w.liveMissions ? `${w.liveMissions} mission(s) in flight` : ''
        ].filter(Boolean);
        if (bits.length) { L.push(`- **In flight right now:** ${bits.join(' · ')}`); }
        const needs = [
            w.openQuestions ? `${w.openQuestions} unanswered question(s)` : '',
            w.blockedQueue ? `${w.blockedQueue} queue item(s) blocked on a person` : ''
        ].filter(Boolean);
        if (needs.length) { L.push(`- **Waiting on a human:** ${needs.join(' · ')}`); }
    }
    // ‼️ A HEADING WITH NOTHING UNDER IT IS THE ONE THING THIS FILE IS AGAINST,
    // and it happened the first time the builder was run against a real folder:
    // a caller that passes no measurements at all left "Where it stands" empty,
    // which reads as a project nobody has touched rather than as a caller that
    // asked for less than the whole document.
    if (!input.sessions && !input.cost && !input.work) {
        L.push('_Nothing was measured for this project — no sessions, no cost and no work were '
            + 'passed in. That is a gap in whoever asked for this document, not a quiet project._');
    }
    if ((p.warnings ?? []).length) {
        L.push('', '**‼️ Currently wrong:**');
        for (const w of p.warnings ?? []) { L.push(`- ${w}`); }
    }
    L.push('');

    // ---- 5. what is open ----
    L.push('## What is open', '');
    if ((input.plan ?? []).length) {
        L.push('**Plan — the roadmap**', '');
        for (const i of input.plan ?? []) { L.push(itemLine(i)); }
        L.push('');
    } else if (input.gaps?.noPlan) {
        L.push('_No plan document (`af-role: plan`) — there is no roadmap to inherit._', '');
    } else {
        L.push('_Every plan item is ticked._', '');
    }
    if ((input.backlog ?? []).length) {
        L.push('**Backlog — what to pick up first**, in the project\'s own queue order', '');
        for (const i of input.backlog ?? []) { L.push(itemLine(i)); }
        L.push('');
    } else if (input.gaps?.noBacklog) {
        L.push('_No backlog document (`af-role: backlog`)._', '');
    } else {
        L.push('_Nothing queued._', '');
    }
    if ((input.blocked ?? []).length) {
        L.push('**Blocked — do not start these first**', '');
        for (const i of input.blocked ?? []) { L.push(itemLine(i)); }
        L.push('');
    }

    // ---- 6. fought and not closed ----
    L.push('## Already fought, still open', '');
    if ((input.unfinished ?? []).length) {
        L.push('Somebody has been here before you. Read their note before you start from scratch — '
            + 'the Track tab opens the exact turn.', '');
        for (const u of input.unfinished ?? []) {
            L.push(`- **${u.code}** ${u.text.replace(/\s+/g, ' ').slice(0, 140)}`);
            L.push(`    - ${u.sessions} session(s), last ${localDay(u.lastTs)} (${sinceOf(u.lastTs, now)})`);
            if (u.note) { L.push(`    - _"${u.note.replace(/\s+/g, ' ').slice(0, 260)}"_`); }
        }
    } else {
        L.push('_Nothing was started and abandoned — every coded item that was worked on was closed._');
    }
    L.push('');

    // ---- 7. why it is like this ----
    L.push('## Why it is like this', '');
    if ((input.decisions ?? []).length) {
        for (const d of input.decisions ?? []) {
            L.push(`- \`${localDay(d.ts)}\` **${d.title}**${d.path ? ` — \`${d.path}\`` : ''}`);
        }
    } else {
        L.push('_No decision records. Every "why is it done this way" question this project raises '
            + 'is currently answered by nothing at all._');
    }
    L.push('');

    // ---- 8. what shipped ----
    if ((input.deliverables ?? []).length) {
        L.push('## What has shipped', '');
        for (const d of input.deliverables ?? []) {
            L.push(`- \`${localDay(d.ts)}\` **${d.title}**${d.detail ? ` — ${d.detail}` : ''}`);
        }
        L.push('');
    }

    // ---- 9. how it is worked ----
    const a = input.analysis;
    if (a) {
        L.push('## How this project is actually worked', '');
        if (a.pace) {
            L.push(`- Pace: **${a.pace.recentPerWeek}** sessions/week over the last 4, against `
                + `**${a.pace.allPerWeek}** across ${a.pace.weeksCovered} week(s)`);
            L.push(`- Cost per session: **${money(a.pace.recentCostPerSession)}** recently, `
                + `**${money(a.pace.allCostPerSession)}** all told`);
        }
        if (a.cycle) {
            L.push(`- An item takes a median **${a.cycle.medianDays}** day(s) from first touch to `
                + `close, 90th percentile ${a.cycle.p90Days} (${a.cycle.n} items) — budget your own `
                + 'first item against that, not against how long it looks.');
        }
        if (a.rhythm) {
            const dow = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][a.rhythm.peak.dow];
            L.push(`- Rhythm: busiest ${dow} around ${String(a.rhythm.peak.hour).padStart(2, '0')}:00 · `
                + `${Math.round(a.rhythm.outOfHours * 100)}% of turns outside Mon–Fri 09:00–18:00`);
        }
        if (a.files.length) {
            L.push(`- The files this project actually touches: `
                + a.files.slice(0, 8).map(f => `\`${f.key.split(/[\\/]/).pop()}\` (${f.n})`).join(' · '));
        }
        if (a.agents.length) {
            L.push(`- Who does the work: ${a.agents.slice(0, 5).map(x => `${x.key} (${x.n})`).join(' · ')}`);
        }
        L.push('');
    }

    // ---- 10. the worklog ----
    if ((input.worklog ?? []).length) {
        L.push('## The last things that happened', '',
            '_Verbatim from the worklog — the user\'s own record, which no fold of ours replaces._', '');
        for (const line of input.worklog ?? []) { L.push(line); }
        L.push('');
    }

    // ---- 11. what to do first ----
    L.push('## Your first five minutes', '');
    const steps: string[] = [];
    if (!p.folder) {
        steps.push('Give this project a folder on its page — until it has one it has no plan, no '
            + 'backlog and no worklog.');
    } else {
        steps.push(`Open \`${p.folder}\` and read the charter, then the last few worklog lines.`);
    }
    if ((input.unfinished ?? []).length) {
        steps.push(`Read the note on **${(input.unfinished ?? [])[0].code}** before touching it — `
            + 'it has been worked on and left open.');
    }
    if ((input.backlog ?? []).length) {
        steps.push(`Take **${(input.backlog ?? [])[0].code ?? 'the first backlog item'}** — it is at `
            + 'the top of the queue the user set by hand.');
    }
    if ((p.repos ?? []).some(r => r.missing)) {
        steps.push('Clone the code roots marked missing above; nothing about commits is true until you do.');
    }
    steps.push('Set this project active in the window (the sidebar\'s first row) so the sessions you '
        + 'start get filed under it.');
    steps.push('Write what you learn back into this project — the worklog line, the plan tick, the '
        + 'decision record. The next person\'s handover is built out of them.');
    for (let i = 0; i < steps.length; i++) { L.push(`${i + 1}. ${steps[i]}`); }
    L.push('');

    return L.join('\n');
}

/** The block that is the user's, with the invitation that makes it get written. */
export function handoverNotesBlock(): string {
    return [
        HANDOVER_NOTES_ANCHOR,
        '',
        '## What only you know',
        '',
        '_Everything above is derived and is rewritten every time this document is regenerated.',
        'Everything from the marker above down is **yours** and is carried over untouched — write',
        'here and it stays. The things worth writing are exactly the ones no ledger holds:_',
        '',
        '- _the trap: what breaks if you do the obvious thing_',
        '- _what was tried and deliberately abandoned, and why_',
        '- _who has to be told before anything ships_',
        '- _the credential, the machine, the licence that is not in any file here_',
        ''
    ].join('\n');
}

/** The whole document, for a project that has none yet. */
export function buildHandover(input: HandoverInput): string {
    return buildHandoverBody(input) + '\n' + handoverNotesBlock();
}

/**
 * Regenerate, keeping the human half.
 *
 * ‼️ THE ANCHOR IS SEARCHED FOR IN THE EXISTING FILE, NOT ASSUMED AT A POSITION.
 * The user may have moved the block, renamed its heading, or written above it;
 * whatever sits from the anchor line onwards is theirs and is carried across
 * verbatim. A file that has LOST its anchor — deleted by hand, or written by
 * something else — is not overwritten at all: the caller is told, and a document
 * we cannot safely rewrite is one we do not rewrite.
 */
export function mergeHandoverNotes(
    existing: string | undefined, input: HandoverInput
): { text?: string; error?: string } {
    const body = buildHandoverBody(input);
    const prev = String(existing ?? '');
    if (!prev.trim()) { return { text: body + '\n' + handoverNotesBlock() }; }
    const at = prev.indexOf(HANDOVER_NOTES_ANCHOR);
    if (at < 0) {
        return {
            error: 'this handover has no ' + HANDOVER_NOTES_ANCHOR + ' marker, so there is no way '
                + 'to tell which part is yours — nothing was overwritten. Delete the file to have '
                + 'a fresh one built, or put the marker back above your own notes.'
        };
    }
    return { text: body + '\n' + prev.slice(at) };
}
