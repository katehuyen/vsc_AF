import { BridgeRegistry, optStr } from './bridge';
import { SessionInfo, SessionOrigin, sessionOrigin } from './sessions';

/**
 * Turns page data: every session unrolled into one row per user turn. Turn
 * rollups are collected once at transcript-parse time (SessionInfo.turns), so
 * building the page is a cheap map over the index — no re-reading transcripts.
 */

export interface TurnRow {
    file: string;
    sessionId: string;
    cwd: string;
    /** Display name incl. machine label, like the Sessions tables. */
    agent: string;
    /** Raw agent name — the filter select matches on this. */
    agentName: string;
    /** Session title (short column; the full text rides in the tooltip). */
    session: string;
    /** 1-based turn number within its session. */
    n: number;
    /** The session's total turn count (context for "turn n of N"). */
    of: number;
    /** Opening prompt snippet — the row's identity. */
    label: string;
    ts: number;
    /** Minutes until the next turn opened (last turn: until the session's end). */
    durationMin: number;
    tokens: number;
    cost: number;
    tools: number;
    errors: number;
    models: string[];
    sidechain: boolean;
    /** Who started the session this turn belongs to — 'user' dialog or 'auto' run. */
    origin: SessionOrigin;
    active: boolean;
}

/** All turn rows of one session, newest data included. */
export function turnRowsFor(s: SessionInfo, active: boolean): TurnRow[] {
    const origin = sessionOrigin(s);
    return s.turns.map((t, i) => {
        const next = s.turns[i + 1];
        const endTs = next?.ts || s.lastTs || t.ts;
        return {
            file: s.file,
            sessionId: s.sessionId,
            cwd: s.cwd ?? '',
            agent: (s.agentName ?? '?') + (s.machine ? ` ⇄ ${s.machine}` : ''),
            agentName: s.agentName ?? '',
            session: s.title,
            n: t.n,
            of: s.turns.length,
            label: t.label,
            ts: t.ts,
            durationMin: t.ts && endTs >= t.ts ? Math.round((endTs - t.ts) / 60000) : 0,
            tokens: t.tokens,
            cost: t.cost,
            tools: t.tools,
            errors: t.errors,
            models: t.models,
            sidechain: s.isSidechain,
            origin,
            active
        };
    });
}

/** Every turn across the farm, newest first. */
export function buildTurnRows(
    sessions: SessionInfo[],
    isActive: (s: SessionInfo) => boolean
): TurnRow[] {
    const rows: TurnRow[] = [];
    for (const s of sessions) {
        rows.push(...turnRowsFor(s, isActive(s)));
    }
    return rows.sort((a, b) => b.ts - a.ts);
}

/** Bridge access (constitution §19.C): the Turns page's data as an op. */
export function registerTurnsOps(
    bridge: BridgeRegistry,
    deps: { sessions(): SessionInfo[]; isActive(s: SessionInfo): boolean }
): void {
    bridge.register({
        op: 'turns.list',
        describe: 'Every user turn across the farm, newest first (the Turns page as data). args: agent? (name filter), origin? ("user" = turns of sessions a person started interactively — the page default; "auto" = turns of automation runs (schedule/trigger/task/mission); omit or "all" = both), limit? (default 20)',
        handler: (args) => {
            const agent = optStr(args, 'agent').toLowerCase();
            const origin = optStr(args, 'origin').toLowerCase();
            const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.floor(args.limit) : 20;
            return buildTurnRows(deps.sessions(), deps.isActive)
                .filter(r => !agent || r.agentName.toLowerCase() === agent)
                .filter(r => origin !== 'user' && origin !== 'auto' ? true : r.origin === origin)
                .slice(0, limit)
                .map(r => ({
                    agent: r.agentName, session: r.session, turn: `${r.n}/${r.of}`,
                    label: r.label, ts: r.ts, origin: r.origin, tokens: r.tokens,
                    cost: Math.round(r.cost * 10000) / 10000,
                    tools: r.tools, errors: r.errors, models: r.models
                }));
        }
    });
}
