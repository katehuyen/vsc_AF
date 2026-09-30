import { isBlocking, needKey, type NeedItem } from './needs';

/**
 * U-177 — THE "NOW" PAGE'S ONE SNAPSHOT: what waits for you, what is running,
 * today's spend and quotas, the latest notices. The phone opens it as its home
 * and the desktop as a tab; both draw exactly this, and `now.get` returns it.
 * Pure: the extension hands the readings over, nothing here reads the disk.
 */

export interface NowSessionIn {
    id: string;
    agentName: string;
    engine?: string;
    status: string;
    startedAt: number;
    turnStartedAt?: number;
    lastTs: number;
    costUSD: number;
    messages: { role: string; text?: string; tool?: { name: string; detail: string } }[];
    pendingAsk?: unknown;
    pendingPermission?: unknown;
}

export interface NowQuota { account: string; engine: string; percent: number; resetsAt: number }

export interface NowNoticeIn {
    id: string; ts: number; agentName: string; type: string; level: number; title: string; read?: boolean;
}

export interface NowInput {
    needs: NeedItem[];
    sessions: NowSessionIn[];
    todayCost: number;
    quotas: NowQuota[];
    notices: NowNoticeIn[];
    now: number;
}

export interface NowWaiting { key: string; kind: string; agentName: string; title: string; detail: string; ts: number }

export interface NowRunning {
    id: string; agentName: string; engine: string; status: string;
    /** the turn's start while working, else the session's */
    since: number;
    /** the session's last visible act: its own words or the tool it ran */
    doing: string;
    costUSD: number;
    /** a question or a permission holds it */
    waits: boolean;
}

export interface NowData {
    waiting: NowWaiting[];
    /** blocking rows beyond the ones listed */
    waitingMore: number;
    running: NowRunning[];
    today: { cost: number; quotas: NowQuota[] };
    notices: NowNoticeIn[];
    generatedAt: number;
}

export const NOW_LIMITS = { waiting: 8, notices: 6, doing: 160 } as const;

const ORDER: Record<string, number> = { working: 1, starting: 2, idle: 3, error: 4 };

export function doingOf(messages: NowSessionIn['messages']): string {
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        const said = m.role === 'agent' && m.text ? m.text : m.role === 'tool' && m.tool
            ? `${m.tool.name} ${m.tool.detail}`.trim() : '';
        const line = said.replace(/\s+/g, ' ').trim();
        if (line) { return line.length > NOW_LIMITS.doing ? line.slice(0, NOW_LIMITS.doing - 1) + '…' : line; }
    }
    return '';
}

export function buildNow(i: NowInput): NowData {
    const blocking = i.needs.filter(isBlocking);
    const running = i.sessions
        .filter(s => s.status !== 'ended')
        .map((s): NowRunning => ({
            id: s.id, agentName: s.agentName, engine: s.engine ?? 'claude', status: s.status,
            since: s.status === 'working' ? (s.turnStartedAt ?? s.startedAt) : s.startedAt,
            doing: doingOf(s.messages), costUSD: s.costUSD,
            waits: !!(s.pendingAsk || s.pendingPermission)
        }))
        .sort((a, b) => Number(b.waits) - Number(a.waits)
            || (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9)
            || b.since - a.since);
    return {
        waiting: blocking.slice(0, NOW_LIMITS.waiting).map(n => ({
            key: needKey(n), kind: n.kind, agentName: n.agentName, title: n.title, detail: n.detail, ts: n.ts
        })),
        waitingMore: Math.max(0, blocking.length - NOW_LIMITS.waiting),
        running,
        today: { cost: i.todayCost, quotas: [...i.quotas].sort((a, b) => b.percent - a.percent) },
        notices: [...i.notices].sort((a, b) => b.ts - a.ts).slice(0, NOW_LIMITS.notices),
        generatedAt: i.now
    };
}
