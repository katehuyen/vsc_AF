import { RoutableSession, sessionLabel } from './telegramRouting';
import { DigestKeyboard } from './telegramDigest';

/**
 * U-116 — WHAT THE FARM LOOKS LIKE ON A PHONE SCREEN. The commands themselves
 * are wired in extension.ts; what is pure — and therefore what is measured —
 * is the RENDERING and the two places a word has to be read as more than one
 * thing (`/agent <name> <prompt>`, `/cancel <which>`).
 *
 * The rule the whole file follows: a figure that is missing is SAID to be
 * missing. A plan the engine publishes nowhere is not 0%, and printing it as a
 * number is the one mistake that turns telemetry into a lie you act on.
 */

/** One engine's plan, as `usage.engines` reports it. */
export interface UsageBar { id: string; title: string; percent: number | null }
export interface UsageEngine {
    id: string; label: string;
    state: 'ok' | 'not-published' | 'no-plan' | 'unknown';
    bars: UsageBar[];
}

const WHY: Record<Exclude<UsageEngine['state'], 'ok'>, string> = {
    'not-published': 'keeps a quota but writes it nowhere readable',
    'no-plan': 'billed per token — no window to be a percentage of',
    unknown: 'publishes one, nothing read yet'
};

/**
 * The quota block of `/status`. Only engines that HAVE something to say get a
 * line; the rest are named once at the end so their silence is visible without
 * costing five lines on a phone.
 */
export function quotaLines(engines: UsageEngine[]): string[] {
    const out: string[] = [];
    const quiet: string[] = [];
    for (const e of engines) {
        const bars = e.state === 'ok' ? e.bars.filter(b => typeof b.percent === 'number') : [];
        if (bars.length) {
            out.push(`${e.label}: ` + bars.map(b => `${b.title} ${Math.round(b.percent as number)}%`).join(' · '));
        } else {
            quiet.push(`${e.label} (${WHY[e.state === 'ok' ? 'unknown' : e.state]})`);
        }
    }
    if (quiet.length) { out.push('No figure: ' + quiet.join(', ')); }
    return out.length ? ['Plans:', ...out.map(l => '  ' + l)] : [];
}

export interface FarmStatusInput {
    agents: number;
    activeAgents: number;
    /** everything the farm spent today, in USD */
    todayUSD: number;
    /** what the chat bridge itself has spent today, against its cap */
    chatUSD: number;
    capUSD: number;
    needs: { count: number; first?: string };
    runningTasks: { count: number; first?: string };
    conversations: number;
    /** the conversation plain messages from this chat go to, already resolved */
    focus?: string;
    /** messages this chat has waiting for a busy conversation (U-115) */
    queued: number;
    /** the agent a headless run is started for when nothing is live */
    bound?: string;
    engines: UsageEngine[];
}

const usd = (n: number) => '$' + (Math.round(n * 100) / 100).toFixed(2);

/** `/status` — the whole farm on one phone screen. */
export function farmStatusText(i: FarmStatusInput): string {
    return [
        `Farm: ${i.agents} agents · ${i.activeAgents} active`,
        `Today: ${usd(i.todayUSD)} · chat runs ${usd(i.chatUSD)} of ${usd(i.capUSD)}`,
        `Needs you: ${i.needs.count}${i.needs.first ? ' — ' + i.needs.first : ''}`,
        `Running tasks: ${i.runningTasks.count}${i.runningTasks.first ? ' — ' + i.runningTasks.first : ''}`,
        `Conversations: ${i.conversations}`
            + (i.conversations ? ' · focus ' + (i.focus || 'none — I will ask') : ''),
        ...(i.queued ? [`Queued from here: ${i.queued} message${i.queued > 1 ? 's' : ''}`] : []),
        i.bound ? `This chat: ${i.bound}` : 'This chat is not bound to an agent yet (/agent <name>)',
        ...quotaLines(i.engines)
    ].join('\n');
}

/** `/agents` — who is here and what each one thinks with. */
export function agentsText(
    agents: { name: string; model?: string }[], bound?: string
): string {
    if (!agents.length) { return 'No agents found.'; }
    return [
        `${agents.length} agent${agents.length === 1 ? '' : 's'}:`,
        ...agents.map(a => `  ${a.name}${a.model ? ` — ${a.model}` : ''}${a.name === bound ? '  ← this chat' : ''}`),
        '',
        '/agent <name> binds this chat · /agent <name> <prompt> runs one now'
    ].join('\n');
}

/**
 * ‼️ ONE WORD, TWO READINGS. `/agent developer` binds the chat; `/agent
 * developer run the tests` starts a run. Which one it is cannot be decided by
 * counting words, because an agent's name is a folder name and a folder name
 * can contain a space — so the LONGEST name that matches wins, and whatever is
 * left over is the prompt. A name nobody has is neither: the caller says so.
 */
export function splitAgentPrompt(
    arg: string, names: string[]
): { agent: string; prompt: string } | undefined {
    const t = String(arg ?? '').trim();
    if (!t) { return undefined; }
    const lower = t.toLowerCase();
    let best: string | undefined;
    for (const n of names) {
        const ln = n.toLowerCase();
        if (lower !== ln && !lower.startsWith(ln + ' ')) { continue; }
        if (!best || n.length > best.length) { best = n; }
    }
    if (!best) { return undefined; }
    return { agent: best, prompt: t.slice(best.length).trim() };
}

/**
 * `/sessions` as buttons, not only as a numbered list — the number still works
 * for a reader who is scrolling back, but the list they are looking at NOW is
 * one tap from being the focus. Telegram stacks two per row comfortably on a
 * phone; past eight conversations the list is the thing to read, not the
 * keyboard, so it stops.
 */
export const SESSION_BUTTON_LIMIT = 8;

export function sessionsKeyboard(sessions: RoutableSession[], focusId?: string): DigestKeyboard {
    const rows: DigestKeyboard = [];
    sessions.slice(0, SESSION_BUTTON_LIMIT).forEach((s, i) => {
        const mark = s.id === focusId ? '🎯 ' : '';
        const btn = { text: `${mark}${i + 1}. ${s.agentName}`, data: `f:${s.id}` };
        if (i % 2 === 0) { rows.push([btn]); } else { rows[rows.length - 1].push(btn); }
    });
    return rows;
}

/**
 * `/cancel` with no argument is the run THIS CHAT started — the old meaning,
 * kept, because that is the one a reader who started something is thinking of.
 * With an argument it is a live conversation's turn, named the same three ways
 * `/focus` accepts. The two are deliberately one command: from a phone "stop
 * it" is one thought, and making the reader remember which kind of thing they
 * started is a design that serves the code.
 */
export function cancelTarget(arg: string): 'own-run' | 'session' {
    return String(arg ?? '').trim() ? 'session' : 'own-run';
}
