/**
 * The web snapshot — one file, two writers, one reader.
 *
 * Agent Farm lived entirely inside VS Code: no phone, no second machine, and
 * nothing at all while VS Code was closed (the headless service kept the farm
 * *running* but showed nobody anything). The fix is not a second UI stack — it
 * is a **snapshot contract**:
 *
 *   the extension writes `web-snapshot.json` on a beat while it is open;
 *   whoever owns the port (extension, or the service once the heartbeat goes
 *   stale) serves that file plus one small self-contained page.
 *
 * So the web surface never re-derives anything, can never disagree with the
 * panel, and stays honest when nobody is home: the page shows the snapshot's
 * own age and says plainly that VS Code is closed.
 *
 * Pure: builders and shapers only, no fs, no vscode.
 */

export interface WebAgentRow {
    name: string;
    project: string;
    status: string;
    active: boolean;
    lastActivity: number;
    costToday: number;
    cost30: number;
    quietDays: number;
}

export interface WebNeedRow {
    kind: string;
    agent: string;
    title: string;
    detail: string;
    ts: number;
}

export interface WebNoticeRow {
    title: string;
    type: string;
    level: number;
    agent: string;
    ts: number;
    unread: boolean;
}

export interface WebSessionRow {
    title: string;
    agent: string;
    project: string;
    status: string;
    ts: number;
    cost: number;
    turns: number;
}

export interface WebTaskRow {
    title: string;
    agent: string;
    status: string;
    ts: number;
}

export interface WebProjectRow {
    name: string;
    agents: number;
    sessions: number;
    costToday: number;
    cost: number;
}

export interface WebSnapshot {
    /** snapshot format, so an old page and a new server can tell */
    v: number;
    /** when this snapshot was written */
    ts: number;
    /** who wrote it — the page says "VS Code is closed" honestly */
    writer: 'extension' | 'service';
    host: string;
    totals: {
        agents: number;
        activeAgents: number;
        dormantAgents: number;
        costToday: number;
        cost30: number;
        tokensToday: number;
        needs: number;
        unreadNotices: number;
        runningTasks: number;
    };
    agents: WebAgentRow[];
    needs: WebNeedRow[];
    notices: WebNoticeRow[];
    live: WebSessionRow[];
    sessions: WebSessionRow[];
    tasks: WebTaskRow[];
    projects: WebProjectRow[];
}

export const SNAPSHOT_VERSION = 2;

/** Everything the builder needs, already reduced — the caller owns the sources. */
export interface SnapshotInput {
    host: string;
    writer?: 'extension' | 'service';
    agents: WebAgentRow[];
    needs: WebNeedRow[];
    notices: WebNoticeRow[];
    live: WebSessionRow[];
    sessions: WebSessionRow[];
    tasks: WebTaskRow[];
    projects: WebProjectRow[];
    tokensToday: number;
}

const MAX_ROWS = 40;

export function buildSnapshot(input: SnapshotInput, now = Date.now()): WebSnapshot {
    const agents = input.agents.slice(0, MAX_ROWS);
    return {
        v: SNAPSHOT_VERSION,
        ts: now,
        writer: input.writer ?? 'extension',
        host: input.host,
        totals: {
            agents: input.agents.length,
            activeAgents: input.agents.filter(a => a.active).length,
            dormantAgents: input.agents.filter(a => a.quietDays < 0 || a.quietDays > 14).length,
            costToday: round(input.agents.reduce((n, a) => n + a.costToday, 0)),
            cost30: round(input.agents.reduce((n, a) => n + a.cost30, 0)),
            tokensToday: input.tokensToday,
            needs: input.needs.length,
            unreadNotices: input.notices.filter(n => n.unread).length,
            runningTasks: input.tasks.filter(t => t.status === 'running').length
        },
        agents,
        // the blocked list is the point of looking at a phone — never truncated
        // below what actually blocks work
        needs: input.needs.slice(0, MAX_ROWS),
        notices: input.notices.slice(0, MAX_ROWS),
        live: input.live.slice(0, MAX_ROWS),
        sessions: input.sessions.slice(0, MAX_ROWS),
        tasks: input.tasks.slice(0, MAX_ROWS),
        projects: input.projects.slice(0, MAX_ROWS)
    };
}

function round(n: number): number {
    return Math.round(n * 10000) / 10000;
}

/** How stale is a snapshot, in words the page can print without thinking. */
export function snapshotAge(snapshot: { ts: number; writer: string }, now = Date.now()): {
    seconds: number;
    stale: boolean;
    note: string;
} {
    const seconds = Math.max(0, Math.round((now - snapshot.ts) / 1000));
    // The extension writes on a 20s beat; three missed beats means it is gone.
    // A service-written snapshot is stale by definition however fresh the file
    // is: VS Code is closed, so nothing behind these numbers is moving.
    const stale = snapshot.writer === 'service' || seconds > 75;
    const note = snapshot.writer === 'service'
        ? 'VS Code is closed — the headless service is serving the last snapshot it has, and keeps schedules running.'
        : stale
            ? 'This snapshot has stopped updating — VS Code was probably closed.'
            : 'live';
    return { seconds, stale, note };
}
