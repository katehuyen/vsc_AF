import { BridgeRegistry, optStr } from './bridge';
import { ENGINE_ENUM } from './consoleEngine';
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
    /**
     * Milliseconds until the next turn opened (last turn: until the session's
     * end). Milliseconds rather than minutes because every surface formats a
     * duration with the same helper now, and rounding to minutes here threw
     * away what that helper shows below one (see charts.js fmtDur).
     */
    durationMs: number;
    /** How long the turn itself ran — prompt to its last line. */
    ms: number;
    /** Round trips, and every step they carried — see SessionTurn.steps. */
    apiCalls: number;
    steps: number;
    /** Of those steps, the ones that were the model reasoning. */
    thinking: number;
    /** What the window held when the turn ended. */
    endCtx: number;
    tokens: number;
    /** The same turn against the plan limit — see SessionTurn.wTokens. */
    wTokens: number;
    cost: number;
    tools: number;
    errors: number;
    models: string[];
    sidechain: boolean;
    /** Who started the session this turn belongs to — 'user' dialog or 'auto' run. */
    origin: SessionOrigin;
    active: boolean;
    /**
     * ‼️ WHICH ENGINE RAN THE TURN (X-35). Named exactly as the sessions tables
     * name it (`SessionInfo.source ?? 'claude'`), because a Claude transcript
     * states no engine and the answer being an ABSENCE is why this page could
     * not say "Claude" out loud. Every row carries it, so a page listing four
     * engines' turns can be read and filtered.
     */
    engine: string;
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
            durationMs: t.ts && endTs >= t.ts ? endTs - t.ts : 0,
            ms: t.ms,
            apiCalls: t.apiCalls,
            steps: t.steps,
            thinking: t.thinking,
            endCtx: t.endCtx,
            tokens: t.tokens,
            wTokens: t.wTokens,
            cost: t.cost,
            tools: t.tools,
            errors: t.errors,
            models: t.models,
            sidechain: s.isSidechain,
            origin,
            active,
            engine: s.source ?? 'claude'
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
        describe: 'Every user turn across the farm, newest first (the Turns page as data). args: agent? (name filter), engine? (' + ENGINE_ENUM + ' — which engine ran the turn), origin? ("user" = turns of sessions a person started interactively — the page default; "auto" = turns of automation runs (schedule/trigger/task/mission); omit or "all" = both), limit? (default 20)',
        handler: (args) => {
            const agent = optStr(args, 'agent').toLowerCase();
            const engine = optStr(args, 'engine').toLowerCase();
            const origin = optStr(args, 'origin').toLowerCase();
            const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.floor(args.limit) : 20;
            return buildTurnRows(deps.sessions(), deps.isActive)
                .filter(r => !agent || r.agentName.toLowerCase() === agent)
                // ‼️ The same axis the page filters on — an agent calling this op
                // to ask "what has Codex been doing" had no way to say so.
                .filter(r => !engine || engine === 'all' || r.engine.toLowerCase() === engine)
                .filter(r => origin !== 'user' && origin !== 'auto' ? true : r.origin === origin)
                .slice(0, limit)
                .map(r => ({
                    agent: r.agentName, engine: r.engine,
                    session: r.session, turn: `${r.n}/${r.of}`,
                    label: r.label, ts: r.ts, origin: r.origin, tokens: r.tokens,
                    wTokens: Math.round(r.wTokens),
                    cost: Math.round(r.cost * 10000) / 10000,
                    tools: r.tools, errors: r.errors, models: r.models
                }));
        }
    });
}
