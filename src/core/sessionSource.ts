import * as fs from 'fs';
import { cliSourceOf, LiveEvent } from './live';
import { emptyUsage } from './pricing';
import { SessionInfo } from './sessions';

/**
 * E3 — external session sources. Sessions from other CLIs are normalized to
 * SessionInfo but kept OUT of SessionIndex.all()/forAgent(): consumers opt in
 * via index.external(), so claude-specific analytics (context health, cache,
 * distill, recall, duty compliance, …) structurally never see them. Every
 * source is fail-soft — a broken source contributes nothing, never an error.
 */
export interface SessionSource {
    id: string;
    scan(): SessionInfo[];
}

export function buildExternalSessions(sources: SessionSource[]): SessionInfo[] {
    const out: SessionInfo[] = [];
    for (const source of sources) {
        try { out.push(...source.scan()); } catch { /* fail-soft: skip source */ }
    }
    return dedupeExternal(out);
}

/**
 * A session opened via Start Session With… can appear twice: as a file-less
 * live-events lane AND as the CLI's own transcript (E3b). When a transcript
 * entry of the same CLI overlaps a lane in time (same agent, or either side
 * unassigned), the transcript wins — it is the richer record.
 */
export function dedupeExternal(sessions: SessionInfo[]): SessionInfo[] {
    const transcripts = sessions.filter(s => s.file);
    const SLACK = 5 * 60_000;
    return sessions.filter(s => {
        if (s.file) { return true; }
        return !transcripts.some(t =>
            t.source === s.source &&
            (!t.agentId || !s.agentId || t.agentId === s.agentId) &&
            t.firstTs <= s.lastTs + SLACK && t.lastTs >= s.firstTs - SLACK);
    });
}

/**
 * First concrete source: the live-event store. External-CLI sessions already
 * write lifecycle/hook-bridge events there (`cli:` namespace, ~31 days), so a
 * history entry can be built with zero foreign-format guessing. Token usage is
 * unknown and cost is honestly 0 — transcript adapters are a later step.
 */
export function liveEventsSource(
    getStoreFile: () => string | undefined,
    cacheMs = 60_000
): SessionSource {
    let cache: SessionInfo[] = [];
    let cachedSig = '';
    let lastParse = 0;
    return {
        id: 'live-events',
        scan(): SessionInfo[] {
            const file = getStoreFile();
            if (!file) { return cache = []; }
            let st: fs.Stats;
            try { st = fs.statSync(file); } catch { return cache = []; }
            const sig = `${st.size}:${st.mtimeMs}`;
            const now = Date.now();
            if (sig === cachedSig || now - lastParse < cacheMs) { return cache; }
            cachedSig = sig;
            lastParse = now;

            const bySession = new Map<string, SessionInfo>();
            let raw = '';
            try { raw = fs.readFileSync(file, 'utf8'); } catch { return cache = []; }
            for (const line of raw.split('\n')) {
                if (!line.trim()) { continue; }
                let e: LiveEvent;
                try { e = JSON.parse(line) as LiveEvent; } catch { continue; }
                if (typeof e.ts !== 'number' || !e.kind || !e.sessionId) { continue; }
                const source = cliSourceOf(e.sessionId);
                if (!source) { continue; }
                let s = bySession.get(e.sessionId);
                if (!s) {
                    s = {
                        file: '', // no transcript on disk — viewers must not be offered
                        sessionId: e.sessionId,
                        isSidechain: false,
                        source,
                        agentId: e.agentId,
                        agentName: e.agentName,
                        title: `${source} session`,
                        autoTitle: `${source} session`,
                        firstTs: e.ts,
                        lastTs: e.ts,
                        mtime: e.ts,
                        models: [],
                        usage: emptyUsage(),
                        cost: 0,
                        userTurns: 0,
                        assistantMsgs: 0,
                        toolCalls: 0,
                        tools: {},
                        skillCalls: {},
                        memoryReads: {},
                        errors: 0,
                        daily: {},
                        heat: new Array(168).fill(0),
                        events: [],
                        recentMsgs: []
                    };
                    bySession.set(e.sessionId, s);
                }
                s.firstTs = Math.min(s.firstTs, e.ts);
                s.lastTs = Math.max(s.lastTs, e.ts);
                s.mtime = s.lastTs;
                if (e.agentId) { s.agentId = e.agentId; }
                if (e.agentName) { s.agentName = e.agentName; }
                if (e.kind === 'prompt') {
                    s.userTurns++;
                    if (e.detail && s.title === `${s.source} session`) {
                        s.title = e.detail;
                        s.autoTitle = e.detail;
                    }
                } else if (e.kind === 'toolStart') {
                    s.toolCalls++;
                    if (e.tool) { s.tools[e.tool] = (s.tools[e.tool] ?? 0) + 1; }
                }
            }
            return cache = [...bySession.values()];
        }
    };
}
