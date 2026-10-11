/**
 * X-536 — `farm.brief`: EVERYTHING AN AGENT SHOULD KNOW ABOUT ITS SITUATION, IN ONE CALL.
 *
 * Who it is (session, agent, project, account), what waits for it (answered
 * questions, queue items, A2A), what the fleet is doing, which engines can run,
 * whether automations are live, and which language the user reads. Composed
 * from the PUBLIC ops through the registry — no second path into any store —
 * each under a short timeout, so one slow op costs a line, never the brief.
 */

import type { BridgeCaller, BridgeOutcome } from './bridge';

export interface BriefDeps {
    dispatch: (op: string, args: Record<string, unknown>, from?: BridgeCaller) => Promise<BridgeOutcome>;
    version: string;
    /** the language the user reads, as a BCP-47-ish tag ("en", "tr", "de") */
    userLanguage: () => string;
    /** the command agents should type */
    command: () => string;
    timeoutMs?: number;
}

type Dict = Record<string, unknown>;

const arr = (v: unknown): Dict[] => Array.isArray(v) ? v as Dict[] : Array.isArray((v as Dict)?.rows) ? (v as Dict).rows as Dict[] : [];
const s = (v: unknown): string => typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';

async function call(deps: BriefDeps, op: string, args: Dict, from?: BridgeCaller): Promise<unknown> {
    const ms = deps.timeoutMs ?? 4000;
    let timer: NodeJS.Timeout | undefined;
    try {
        const out = await Promise.race([
            deps.dispatch(op, args, from),
            new Promise<BridgeOutcome>(res => { timer = setTimeout(() => res({ ok: false, error: 'timeout' }), ms); })
        ]);
        return out.ok ? out.result : undefined;
    } catch { return undefined; } finally { if (timer) { clearTimeout(timer); } }
}

/** The agent whose folder holds `cwd` — a hint, said as one, never an identity. */
function agentByFolder(agents: Dict[], cwd: string): string {
    const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    const c = norm(cwd);
    const hit = agents.filter(a => s(a.dir) && (c === norm(s(a.dir)) || c.startsWith(norm(s(a.dir)) + '/')))
        .sort((a, b) => s(b.dir).length - s(a.dir).length)[0];
    return hit ? s(hit.name) : '';
}

export async function composeBrief(deps: BriefDeps, args: Dict, from?: BridgeCaller): Promise<{ data: Dict; text: string }> {
    const who = (await call(deps, 'sessions.whoami', {}, from)) as Dict | undefined;
    const card = (who?.card ?? undefined) as Dict | undefined;
    const agentsP = call(deps, 'agents.list', {});
    const agents = arr(await agentsP);
    let agent = s(args.agent) || s(card?.agent);
    let agentFrom = s(args.agent) ? 'argument' : agent ? 'console card' : '';
    if (!agent && s(who?.cwd)) {
        agent = agentByFolder(agents, s(who?.cwd));
        if (agent) { agentFrom = 'folder (a hint: pass agent=<name> to be exact)'; }
    }
    const [now, gate, project, engines, questions, answered, mine, a2a] = await Promise.all([
        call(deps, 'now.get', {}),
        call(deps, 'automations.status', { windowDays: 1 }),
        call(deps, 'projects.current', {}),
        call(deps, 'engines.status', {}),
        agent ? call(deps, 'notices.list', { agent, type: 'question', handled: false }) : undefined,
        agent ? call(deps, 'queue.list', { sourceNoticeAgent: agent, active: true }) : undefined,
        agent ? call(deps, 'queue.list', { target: agent, active: true }) : undefined,
        agent ? call(deps, 'a2a.status', { agent }, from) : undefined
    ]) as [Dict | undefined, Dict | undefined, Dict | undefined, Dict | undefined, unknown, unknown, unknown, Dict | undefined];

    const running = arr(now?.running);
    const waitingYou = arr(now?.waiting);
    const quotas = arr((now?.today as Dict | undefined)?.quotas);
    const engineRows = arr(engines?.engines);
    const ready = engineRows.filter(e => e.ready).map(e => s(e.id));
    const notReady = engineRows.filter(e => !e.ready).map(e => s(e.id));
    const gateRow = (gate?.gate ?? {}) as Dict;
    const data: Dict = {
        version: deps.version,
        command: deps.command(),
        you: {
            sessionId: s(who?.sessionId) || null,
            identifiedBy: s(who?.source) || null,
            agent: agent || null,
            agentFrom: agentFrom || null,
            engine: s(card?.engine) || null,
            account: s(card?.account) || null,
            consoleCard: s(card?.id) || null,
            projectId: s(card?.projectId) || null
        },
        userLanguage: deps.userLanguage(),
        windowProject: project && s(project.name) ? { id: s(project.id), name: s(project.name) } : null,
        waitingForYou: agent ? {
            openQuestions: arr(questions).length,
            answeredIntoQueue: arr(answered).length,
            queueItems: arr(mine).length,
            a2aUnreadNotes: Number(a2a?.unreadNotes ?? 0),
            a2aClaimable: Number(a2a?.claimable ?? 0),
            a2aHeld: arr(a2a?.held).length
        } : null,
        fleet: {
            agents: agents.map(a => s(a.name)),
            runningConsole: running.length,
            needsUser: waitingYou.length + Number(now?.waitingMore ?? 0),
            todayCostUSD: Number((now?.today as Dict | undefined)?.cost ?? 0),
            quotas: quotas.map(q => ({ account: s(q.account), engine: s(q.engine), percent: Number(q.percent) }))
        },
        automations: gateRow.blocked ? { blocked: true, kind: s(gateRow.kind), reason: s(gateRow.reason) } : { blocked: false },
        engines: { ready, notReady }
    };
    return { data, text: renderBrief(data) };
}

export function renderBrief(d: Dict): string {
    const you = d.you as Dict;
    const w = d.waitingForYou as Dict | null;
    const f = d.fleet as Dict;
    const eng = d.engines as Dict;
    const auto = d.automations as Dict;
    const lines: string[] = [`# Brief: Agent Farm ${s(d.version)}`];
    const youBits = [
        you.sessionId ? `session ${s(you.sessionId).slice(0, 8)} (from ${s(you.identifiedBy)})` : 'session unknown (your engine published no id; pass session=<id> to ops that need it)',
        you.agent ? `agent ${s(you.agent)} (from ${s(you.agentFrom)})` : 'agent unknown (pass agent=<name>)',
        you.engine ? `engine ${s(you.engine)}` : '',
        you.account ? `account ${s(you.account)}` : '',
        you.projectId ? `project ${s(you.projectId)}` : ''
    ].filter(Boolean);
    lines.push(`You: ${youBits.join(' · ')}`);
    lines.push(`User language: ${s(d.userLanguage) || 'unknown'}. Write what the user reads (notices, reports, replies) in it; `
        + 'system files and agent-to-agent text in English.');
    if (d.windowProject) { lines.push(`Active project in the window: ${s((d.windowProject as Dict).name)}`); }
    if (w) {
        const items = [
            w.openQuestions ? `${w.openQuestions} open question(s) you asked` : '',
            w.answeredIntoQueue ? `${w.answeredIntoQueue} answered notice(s) in the queue for you` : '',
            w.queueItems ? `${w.queueItems} queue item(s) routed to you` : '',
            w.a2aUnreadNotes ? `${w.a2aUnreadNotes} unread A2A note(s)` : '',
            w.a2aHeld ? `${w.a2aHeld} A2A task(s) you hold` : '',
            w.a2aClaimable ? `${w.a2aClaimable} A2A task(s) you could claim` : ''
        ].filter(Boolean);
        lines.push(items.length ? `Waiting for you: ${items.join(' · ')} → \`farm.guide id=check-inbox\`` : 'Waiting for you: nothing.');
    }
    const quota = (f.quotas as Dict[]).slice(0, 4).map(q => `${s(q.account)} ${s(q.engine)} ${s(q.percent)}%`).join(', ');
    lines.push(`Fleet: ${(f.agents as string[]).length} agents · ${s(f.runningConsole)} Console session(s) running · `
        + `${s(f.needsUser)} item(s) need the user · today $${Number(f.todayCostUSD).toFixed(2)}`
        + (quota ? ` · 5-hour quota: ${quota}` : ''));
    lines.push(`Agents: ${(f.agents as string[]).join(', ') || 'none found'}`);
    lines.push(`Engines ready: ${(eng.ready as string[]).join(', ') || 'none'}`
        + ((eng.notReady as string[]).length ? ` (not ready: ${(eng.notReady as string[]).join(', ')}; \`engines.status\`)` : ''));
    lines.push(auto.blocked ? `Automations: HELD (${s(auto.kind)}: ${s(auto.reason)})` : 'Automations: live');
    lines.push('', `Next: \`farm.find q="<the user's request>"\` · \`farm.guide\` (map) · details: \`now.get\`, \`farm.waits\`, \`tasks.list\`.`);
    return lines.join('\n');
}
