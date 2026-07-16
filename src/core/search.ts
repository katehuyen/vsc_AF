import * as fs from 'fs';
import * as path from 'path';

/**
 * D4 — Transcript search. Fast text/regex scan over session .jsonl files.
 * Newest sessions first, capped results. Measured on the real corpus
 * (95 MB / 121 files): a full-fleet scan is ~1-2s, so no index is needed.
 *
 * S1 (2.53.0): the scan covers tool inputs and tool results too — they are
 * ~90% of all transcript text ("which session touched this file?" lives
 * there). `roles` picks what to search; the default stays user+assistant
 * (dialog), exactly the pre-S1 behavior.
 * S2: `files` / `tsFrom..tsTo` narrow the scope to a session set or a time
 * window (a turn is a time window), and every hit is tagged with its turn.
 * Semantic search is a separate layer; this is the workhorse.
 */

export interface SearchableSession {
    file: string;
    agentName?: string;
    title: string;
    mtime: number;
}

export type SearchRole = 'user' | 'assistant' | 'tool' | 'toolResult';

export interface SearchHit {
    file: string;
    agentName: string;
    title: string;
    ts: number;
    role: SearchRole | 'memory' | 'event';
    /** snippet split around the first match so the UI can highlight safely. */
    before: string;
    match: string;
    after: string;
    /** D4 semantic layer: cosine similarity (0-1) when the hit came from the vector index. */
    score?: number;
    /** 1-based turn the hit belongs to (transcript hits; 0 = before the first prompt). */
    turn?: number;
    /** First words of the turn's opening prompt — lets the UI group hits per turn. */
    turnLabel?: string;
    /** Tool name for tool / toolResult hits. */
    tool?: string;
    /** Where the hit came from; transcript hits leave this unset. */
    kind?: 'memory' | 'event';
}

export interface SearchOptions {
    regex?: boolean;
    caseSensitive?: boolean;
    /** restrict to one agent (exact name). */
    agentName?: string;
    /** restrict to this agent set (exact names). undefined = every agent incl.
     *  unassigned sessions; [] = none (an all-unticked picker finds nothing). */
    agentNames?: string[];
    /** restrict to these transcript files (session / selection scope). */
    files?: string[];
    /** only hits inside this time window (a turn is a window). 0/undefined = open. */
    tsFrom?: number;
    tsTo?: number;
    /** which message kinds to search; default user+assistant (dialog). */
    roles?: SearchRole[];
    maxHits?: number;
    maxPerFile?: number;
    /** stop scanning further files after this long (regex safety net). */
    timeBudgetMs?: number;
}

export interface SearchResult {
    hits: SearchHit[];
    filesScanned: number;
    truncated: boolean;
    /** true when the time budget cut the scan short — results are partial. */
    timedOut?: boolean;
    error?: string;
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function contentToText(content: unknown): string {
    if (typeof content === 'string') { return content; }
    if (Array.isArray(content)) {
        return content
            .filter((b): b is { type: string; text?: string } =>
                !!b && typeof b === 'object' && (b as { type?: string }).type === 'text')
            .map(b => b.text ?? '')
            .join('\n');
    }
    return '';
}

const CONTEXT_CHARS = 90;
/** Per-message search-text cap — tool results can be megabytes; matches beyond
 *  this depth are traded for bounded regex time. */
const TEXT_CAP = 200_000;
const DEFAULT_ROLES: SearchRole[] = ['user', 'assistant'];
const DEFAULT_TIME_BUDGET_MS = 10_000;

export function buildMatcher(query: string, opts: SearchOptions): RegExp | string {
    try {
        return new RegExp(
            opts.regex ? query : escapeRegExp(query),
            opts.caseSensitive ? '' : 'i');
    } catch (e) {
        return 'Invalid regex: ' + String((e as Error).message).slice(0, 120);
    }
}

/** Flatten + match one text; null when it doesn't match. */
function snip(text: string, matcher: RegExp): { before: string; match: string; after: string } | null {
    const flat = text.length > TEXT_CAP
        ? text.slice(0, TEXT_CAP).replace(/\s+/g, ' ').trim()
        : text.replace(/\s+/g, ' ').trim();
    const m = matcher.exec(flat);
    if (!m || !m[0]) { return null; }
    const start = m.index;
    const end = m.index + m[0].length;
    return {
        before: (start > CONTEXT_CHARS ? '…' : '') +
            flat.slice(Math.max(0, start - CONTEXT_CHARS), start),
        match: m[0].slice(0, 200),
        after: flat.slice(end, end + CONTEXT_CHARS) +
            (end + CONTEXT_CHARS < flat.length ? '…' : '')
    };
}

export function searchTranscripts(
    sessions: SearchableSession[],
    query: string,
    opts: SearchOptions = {}
): SearchResult {
    const result: SearchResult = { hits: [], filesScanned: 0, truncated: false };
    if (!query.trim()) { return result; }

    const matcher = buildMatcher(query, opts);
    if (typeof matcher === 'string') {
        result.error = matcher;
        return result;
    }

    const maxHits = opts.maxHits ?? 150;
    const maxPerFile = opts.maxPerFile ?? 3;
    const roles = new Set(opts.roles && opts.roles.length ? opts.roles : DEFAULT_ROLES);
    const fileSet = opts.files && opts.files.length ? new Set(opts.files) : null;
    const agentSet = opts.agentNames ? new Set(opts.agentNames) : null;
    const tsFrom = opts.tsFrom ?? 0;
    const tsTo = opts.tsTo ?? 0;
    const deadline = Date.now() + (opts.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);
    const ordered = sessions
        .filter(s => (!opts.agentName || s.agentName === opts.agentName) &&
            (!agentSet || agentSet.has(s.agentName ?? '')) &&
            (!fileSet || fileSet.has(s.file)))
        .sort((a, b) => b.mtime - a.mtime);

    for (const s of ordered) {
        if (result.hits.length >= maxHits) { result.truncated = true; break; }
        if (Date.now() > deadline) { result.timedOut = true; result.truncated = true; break; }
        let raw: string;
        try { raw = fs.readFileSync(s.file, 'utf8'); } catch { continue; }
        result.filesScanned++;
        let fileHits = 0;
        let turn = 0;
        let turnLabel = '';
        for (const lineText of raw.split('\n')) {
            if (fileHits >= maxPerFile || result.hits.length >= maxHits) { break; }
            if (!lineText.trim()) { continue; }
            let line: {
                type?: string; isMeta?: boolean; isSidechain?: boolean; timestamp?: string;
                message?: { content?: unknown };
            };
            try { line = JSON.parse(lineText); } catch { continue; }

            // Candidate texts on this line. A user line can hold prompt text AND
            // tool results; an assistant line text AND tool calls.
            const texts: { role: SearchRole; text: string; tool?: string }[] = [];
            const content = line.message?.content;
            if (line.type === 'user') {
                if (typeof content === 'string') {
                    if (!line.isMeta && !content.startsWith('<')) {
                        texts.push({ role: 'user', text: content });
                        if (!line.isSidechain) { turn++; turnLabel = content.slice(0, 60); }
                    }
                } else if (Array.isArray(content)) {
                    for (const b of content as { type?: string; text?: string; content?: unknown; is_error?: boolean }[]) {
                        if (b?.type === 'text' && b.text) {
                            texts.push({ role: 'user', text: b.text });
                            if (!line.isSidechain) { turn++; turnLabel = b.text.slice(0, 60); }
                        } else if (b?.type === 'tool_result') {
                            texts.push({ role: 'toolResult', text: contentToText(b.content) || String(b.text ?? '') });
                        }
                    }
                }
            } else if (line.type === 'assistant' && Array.isArray(content)) {
                for (const b of content as { type?: string; text?: string; name?: string; input?: unknown }[]) {
                    if (b?.type === 'text' && b.text) {
                        texts.push({ role: 'assistant', text: b.text });
                    } else if (b?.type === 'tool_use') {
                        // tool name + raw input — file paths, commands, code all live here
                        let input = '';
                        try { input = typeof b.input === 'string' ? b.input : JSON.stringify(b.input ?? ''); } catch { /* cyclic — skip input */ }
                        texts.push({ role: 'tool', text: `${b.name ?? ''} ${input}`, tool: b.name });
                    }
                }
            } else {
                continue;
            }

            const ts = line.timestamp ? Date.parse(line.timestamp) : 0;
            if ((tsFrom && ts && ts < tsFrom) || (tsTo && ts && ts > tsTo)) { continue; }

            for (const t of texts) {
                if (fileHits >= maxPerFile || result.hits.length >= maxHits) { break; }
                if (!roles.has(t.role) || !t.text) { continue; }
                const sn = snip(t.text, matcher);
                if (!sn) { continue; }
                result.hits.push({
                    file: s.file,
                    agentName: s.agentName ?? '?',
                    title: s.title,
                    ts: ts || s.mtime,
                    role: t.role,
                    ...sn,
                    turn,
                    turnLabel,
                    tool: t.tool
                });
                fileHits++;
            }
        }
    }
    if (result.hits.length >= maxHits) { result.truncated = true; }
    return result;
}

// ---------------------------------------------------------------------------
// S5 — extra sources beyond transcripts. Same hit shape, tagged with `kind`
// so the UI can badge them and route clicks (md file / timeline instead of
// the session viewer). Both are fail-soft: an unreadable source yields
// nothing rather than an error.
// ---------------------------------------------------------------------------

export interface MemorySearchable {
    file: string;
    agentName: string;
}

/** Search the agents' memory/*.md notes. */
export function searchMemory(
    files: MemorySearchable[],
    query: string,
    opts: SearchOptions = {}
): SearchHit[] {
    if (!query.trim()) { return []; }
    const matcher = buildMatcher(query, opts);
    if (typeof matcher === 'string') { return []; }
    const maxPerFile = opts.maxPerFile ?? 3;
    const agentSet = opts.agentNames ? new Set(opts.agentNames) : null;
    const hits: SearchHit[] = [];
    for (const f of files) {
        if (opts.agentName && f.agentName !== opts.agentName) { continue; }
        if (agentSet && !agentSet.has(f.agentName)) { continue; }
        let raw = '';
        let mtime = 0;
        try {
            raw = fs.readFileSync(f.file, 'utf8');
            mtime = fs.statSync(f.file).mtimeMs;
        } catch { continue; }
        let fileHits = 0;
        // paragraph-wise so one note can yield distinct matches
        for (const para of raw.split(/\n\s*\n/)) {
            if (fileHits >= maxPerFile) { break; }
            const sn = snip(para, matcher);
            if (!sn) { continue; }
            hits.push({
                file: f.file,
                agentName: f.agentName,
                title: path.basename(f.file),
                ts: mtime,
                role: 'memory',
                kind: 'memory',
                ...sn
            });
            fileHits++;
        }
    }
    return hits;
}

/** Search the persisted live-event store — but ONLY events whose transcript is
 *  gone or never existed (external CLI lanes, pruned sessions). Everything
 *  else is already covered richer by the transcript scan; duplicating it here
 *  would double every prompt hit. */
export function searchLiveEvents(
    storeFile: string,
    query: string,
    opts: SearchOptions = {}
): SearchHit[] {
    if (!query.trim()) { return []; }
    const matcher = buildMatcher(query, opts);
    if (typeof matcher === 'string') { return []; }
    let raw = '';
    try { raw = fs.readFileSync(storeFile, 'utf8'); } catch { return []; }
    const transcriptExists = new Map<string, boolean>();
    const agentSet = opts.agentNames ? new Set(opts.agentNames) : null;
    const hits: SearchHit[] = [];
    const maxHits = opts.maxHits ?? 50;
    for (const lineText of raw.split('\n')) {
        if (hits.length >= maxHits) { break; }
        if (!lineText.trim()) { continue; }
        let ev: {
            ts?: number; kind?: string; detail?: string; tool?: string;
            agentName?: string; transcriptPath?: string;
        };
        try { ev = JSON.parse(lineText); } catch { continue; }
        const text = [ev.tool, ev.detail].filter(Boolean).join(' ');
        if (!text) { continue; }
        if (opts.agentName && ev.agentName !== opts.agentName) { continue; }
        if (agentSet && !agentSet.has(ev.agentName ?? '')) { continue; }
        const tp = ev.transcriptPath ?? '';
        if (tp) {
            if (!transcriptExists.has(tp)) {
                let alive = false;
                try { alive = fs.existsSync(tp); } catch { /* treat as gone */ }
                transcriptExists.set(tp, alive);
            }
            if (transcriptExists.get(tp)) { continue; } // transcript scan covers it
        }
        const sn = snip(text, matcher);
        if (!sn) { continue; }
        hits.push({
            file: tp,
            agentName: ev.agentName ?? '?',
            title: ev.kind ?? 'event',
            ts: ev.ts ?? 0,
            role: 'event',
            kind: 'event',
            tool: ev.tool,
            ...sn
        });
    }
    return hits;
}
