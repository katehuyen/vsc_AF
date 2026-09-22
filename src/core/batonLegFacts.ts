/**
 * S-83 — WHAT IS KNOWN ABOUT A RELAY LEG'S END, read from the places that
 * know it: its Console card or its task row (how it ended, and who ended it),
 * the context guard (was it told to hand over), the handover note it wrote,
 * the live monitor (did it do anything) and git (did it leave work behind).
 *
 * Each source is an accessor the host hands in, so the reading is testable
 * without a window. A source that cannot answer answers nothing — and nothing
 * is never evidence (`batonFailsafe.ts`).
 */
import { LegEndFacts } from './batonFailsafe';

export interface LegFactSources {
    /** the Console card for the session, if it has one */
    card: (sessionId: string) => { status: string; exitReason?: string; lastTurn?: { steps?: number } } | undefined;
    /** the task row the session ran on, if any: its status and last word */
    row: (sessionId: string) => { status: string; why?: string } | undefined;
    /** the context guard's record: the handover deliveries it made */
    guard: (sessionId: string) => { handover?: { pct: number }; quota?: { handover?: { pct: number } } } | undefined;
    /** the handover note the session wrote (absolute path), if one is found */
    notePath: (sessionId: string) => string | undefined;
    readNote: (file: string) => { ts: number; text: string } | undefined;
    /** tool calls the live monitor counted */
    toolCalls: (sessionId: string) => number | undefined;
    /** the leg's folder */
    cwdOf: (sessionId: string) => string | undefined;
    /** `git status --short` of a folder; undefined when it is not a repository */
    gitStatus: (cwd: string) => Promise<string | undefined>;
}

/** The Console's own word for a card the user closed (consolehost.ts). */
const CLOSED_BY_USER = 'closed by you';

export function legFactsFrom(src: LegFactSources): (sessionId: string, endedAt: number) => Promise<LegEndFacts> {
    const safe = <T>(f: () => T): T | undefined => { try { return f(); } catch { return undefined; } };
    return async (sid, endedAt) => {
        const card = safe(() => src.card(sid));
        const row = safe(() => src.row(sid));
        const rec = safe(() => src.guard(sid));
        const handover = rec?.quota?.handover ? `QUOTA HANDOVER ${rec.quota.handover.pct}%`
            : rec?.handover ? `CONTEXT HANDOVER ${rec.handover.pct}%` : undefined;
        const path = safe(() => src.notePath(sid));
        const read = path ? safe(() => src.readNote(path)) : undefined;
        const code = /exited with code (-?\d+)/.exec(card?.exitReason ?? '');
        const error = card?.status === 'error' ? (card.exitReason || 'the Console run ended in error')
            : row?.status === 'failed' ? (row.why || 'its task row failed') : undefined;
        const tools = safe(() => src.toolCalls(sid)) ?? card?.lastTurn?.steps;
        const cwd = safe(() => src.cwdOf(sid));
        const dirty = cwd ? await src.gitStatus(cwd).catch(() => undefined) : undefined;
        return {
            sessionId: sid, endedAt,
            byUser: card?.exitReason === CLOSED_BY_USER || row?.status === 'cancelled',
            ...(handover ? { handover } : {}),
            ...(path && read ? { note: { path, ts: read.ts, text: read.text } } : {}),
            ...(code ? { exitCode: Number(code[1]) } : {}),
            ...(error ? { error } : {}),
            ...(dirty !== undefined ? { dirty } : {}),
            ...(typeof tools === 'number' ? { toolCalls: tools } : {})
        };
    };
}
