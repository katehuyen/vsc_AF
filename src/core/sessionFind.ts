import { chainIndexNow, chainSessionsMatching } from './chainMembership';
import { SessionInfo } from './sessions';

/**
 * The session an id / path / phrase points at, and the candidates when it
 * points at several — shared by the `findSession` command and the
 * `sessions.find` bridge op so the two can never answer differently (X-34).
 */
export function findSessions(
    pool: SessionInfo[], q: string, limit = 20
): SessionInfo[] {
    const needle = String(q ?? '').trim().toLowerCase();
    if (!needle) {
        return pool.slice().sort((a, b) => (b.lastTs || b.mtime) - (a.lastTs || a.mtime)).slice(0, limit);
    }
    const chained = chainSessionsMatching(chainIndexNow(), needle);
    const score = (s: SessionInfo): number => {
        const id = s.sessionId.toLowerCase();
        if (id === needle) { return 0; }
        if (id.startsWith(needle)) { return 1; }
        if (id.includes(needle)) { return 2; }
        // U-165 - a chain id finds every leg, the first one too (its prompt never names the chain)
        if (chained.has(s.sessionId)) { return 2.5; }
        if (s.file.toLowerCase().includes(needle)) { return 3; }
        if ((s.title ?? '').toLowerCase().includes(needle)) { return 4; }
        if ((s.agentName ?? '').toLowerCase().includes(needle)) { return 5; }
        if ((s.tags ?? []).some(t => t.toLowerCase().includes(needle))) { return 6; }
        return -1;
    };
    return pool
        .map(s => ({ s, n: score(s) }))
        .filter(x => x.n >= 0)
        .sort((a, b) => a.n - b.n || (b.s.lastTs || b.s.mtime) - (a.s.lastTs || a.s.mtime))
        .slice(0, limit)
        .map(x => x.s);
}
