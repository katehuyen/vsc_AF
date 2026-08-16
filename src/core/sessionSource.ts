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
 * entry of the same CLI overlaps a lane in time and the agent attribution is
 * consistent (both the same agent, or both unassigned), the transcript wins —
 * it is the richer record. One side assigned + the other not is NOT a match:
 * suppressing there could hide a different agent's legitimate lane.
 */
export function dedupeExternal(sessions: SessionInfo[]): SessionInfo[] {
    const transcripts = sessions.filter(s => s.file);
    const SLACK = 5 * 60_000;
    return sessions.filter(s => {
        if (s.file) { return true; }
        return !transcripts.some(t =>
            t.source === s.source &&
            (t.agentId && s.agentId ? t.agentId === s.agentId : !t.agentId && !s.agentId) &&
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
    /**
     * ‼️ S-37 — AN APPEND-ONLY LOG IS NOT RE-READ FROM THE TOP EVERY MINUTE.
     *
     * Measured on the user's store: `live-events.jsonl` had grown to 26.6 MB /
     * 81,104 lines, and this scan read and parsed ALL of it once a minute —
     * 325 ms on the extension host's own thread — to produce, on that machine,
     * exactly ZERO rows, because every id in it belonged to Claude and this
     * source only builds rows for the external CLIs' `<engine>:` ids. A cost
     * that grows with a log that never shrinks, paid for nothing.
     *
     * The log only ever has lines APPENDED, so the parse carries on from where
     * it stopped: what was read stays read, and only the new bytes are work. A
     * file that got SHORTER was rotated or pruned, and that is the one case
     * that starts again from the top.
     */
    let readBytes = 0;
    let carry = '';
    const bySession = new Map<string, SessionInfo>();
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

            if (st.size < readBytes) {
                // rotated/pruned — everything this source believed is now unproven
                readBytes = 0; carry = ''; bySession.clear();
            }
            let chunk = '';
            try {
                const fd = fs.openSync(file, 'r');
                try {
                    const len = st.size - readBytes;
                    if (len > 0) {
                        const buf = Buffer.allocUnsafe(len);
                        const n = fs.readSync(fd, buf, 0, len, readBytes);
                        chunk = buf.subarray(0, n).toString('utf8');
                        readBytes += n;
                    }
                } finally { fs.closeSync(fd); }
            } catch { return cache = []; }
            const parts = (carry + chunk).split('\n');
            // the last piece may be half a line the writer has not finished
            carry = parts.pop() ?? '';
            for (const line of parts) {
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
                        wTokens: 0,
                        cost: 0,
                        userTurns: 0,
                        assistantMsgs: 0,
                        toolCalls: 0,
                        tools: {},
                        skillCalls: {},
                        memoryReads: {},
                        // external CLIs report no tool inputs — honestly empty
                        filesEdited: {},
                        errors: 0,
                        daily: {},
                        heat: new Array(168).fill(0),
                        events: [],
                        recentMsgs: [],
                        turns: []
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
