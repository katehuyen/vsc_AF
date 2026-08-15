import * as fs from 'fs';
import * as path from 'path';
import { compileQuery, CompiledQuery } from './query';

export interface SearchableSession {
    file: string;
    agentName?: string;
    title: string;
    mtime: number;
    sessionId?: string;
    engine?: string;
    isSidechain?: boolean;
    /** Resolved from this session, never inferred from its agent's default. */
    project?: string;
}

export type SearchRole = 'user' | 'assistant' | 'delegator' | 'handler' | 'tool' | 'toolResult';
export const DIALOG_ROLES: SearchRole[] = ['user', 'assistant'];
export const DELEGATION_ROLES: SearchRole[] = ['delegator', 'handler'];
export const ALL_ROLES: SearchRole[] = ['user', 'assistant', 'delegator', 'handler', 'tool', 'toolResult'];

export function isSearchRole(v: unknown): v is SearchRole {
    return typeof v === 'string' && (ALL_ROLES as string[]).includes(v);
}

export interface ForeignMessage {
    role: 'user' | 'assistant' | 'tool' | 'toolResult' | 'system';
    ts: number;
    text?: string;
    tool?: string;
    input?: string;
    turn?: number;
}

export interface ForeignTranscript {
    messages: ForeignMessage[];
    turns?: { n: number; label: string }[];
}

export type ParseForeign = (raw: string, file: string) => ForeignTranscript | undefined;

export interface SearchHit {
    file: string;
    agentName: string;
    title: string;
    ts: number;
    role: SearchRole | 'memory' | 'event';
    sessionId?: string;
    engine?: string;
    /** Session activity time; group sorting must not depend on the first hit. */
    sessionTs?: number;
    project?: string;
    speaker?: string;
    before: string;
    match: string;
    after: string;
    score?: number;
    turn?: number;
    turnLabel?: string;
    tool?: string;
    kind?: 'memory' | 'event';
}

export interface SearchOptions {
    regex?: boolean;
    caseSensitive?: boolean;
    wholeWord?: boolean;
    agentName?: string;
    agentNames?: string[];
    files?: string[];
    tsFrom?: number;
    tsTo?: number;
    roles?: SearchRole[];
    maxHits?: number;
    maxPerFile?: number;
    timeBudgetMs?: number;
    parseForeign?: ParseForeign;
}

export interface SessionMatchCount {
    file: string;
    found: number;
    shown: number;
}

export interface SearchResult {
    hits: SearchHit[];
    filesScanned: number;
    truncated: boolean;
    /** Explicit accounting prevents capped previews from posing as all matches. */
    matchesFound: number;
    matchesShown: number;
    sessionsMatched: number;
    omittedMatches: number;
    sessionMatches: SessionMatchCount[];
    parseFailures: number;
    timedOut?: boolean;
    error?: string;
}

/**
 * ‼️ ONE RECORD PRODUCER, TWO READERS (X-42).
 *
 * A searchable message, already cut to TEXT_CAP and already
 * whitespace-normalized. The normalization used to happen inside `snip()` —
 * once per message PER QUERY, on a cache hit as much as on a miss — which is
 * the same work done again every time somebody pressed a key. It happens here
 * instead, once, and both readers take their records from this one producer:
 * the direct transcript scan below and the persistent corpus
 * (`textSearchCorpus.ts`). A second parser would be a second answer.
 */
export interface SearchRecord {
    role: SearchRole;
    text: string;
    ts: number;
    turn: number;
    turnLabel: string;
    tool?: string;
}

interface CacheEntry {
    sig: string;
    messages: SearchRecord[] | undefined;
    chars: number;
}

const DEFAULT_ROLES: SearchRole[] = DIALOG_ROLES;
const DEFAULT_TIME_BUDGET_MS = 10_000;
const CONTEXT_CHARS = 90;
const TEXT_CAP = 200_000;
const CACHE_MAX_FILES = 80;
const CACHE_MAX_CHARS = 48_000_000;
const transcriptCache = new Map<string, CacheEntry>();
let cacheChars = 0;

export function buildMatcher(query: string, opts: SearchOptions): CompiledQuery {
    return compileQuery(query, {
        regex: opts.regex,
        caseSensitive: opts.caseSensitive,
        wholeWord: opts.wholeWord
    });
}

/**
 * Whitespace collapsed to single spaces — the ONE form every searchable text
 * takes, applied where a record is made rather than where it is matched. A
 * snippet is cut out of this, so it is also what the reader sees.
 */
export function normalizeText(text: string): string {
    return String(text ?? '').replace(/\s+/g, ' ').trim();
}

export function emptyResult(): SearchResult {
    return {
        hits: [], filesScanned: 0, truncated: false,
        matchesFound: 0, matchesShown: 0, sessionsMatched: 0,
        omittedMatches: 0, sessionMatches: [], parseFailures: 0
    };
}

function contentToText(content: unknown): string {
    if (typeof content === 'string') { return content; }
    if (!Array.isArray(content)) { return ''; }
    return content
        .filter((b): b is { type: string; text?: string } =>
            !!b && typeof b === 'object' && (b as { type?: string }).type === 'text')
        .map(b => b.text ?? '')
        .join('\n');
}

function isHarnessText(text: string): boolean {
    return /^<(?:system-reminder|project-context|local-command-(?:caveat|stdout)|command-name|command-message)>/i
        .test(text.trim());
}

function parseClaude(raw: string, lane: boolean): SearchRecord[] {
    const messages: SearchRecord[] = [];
    let turn = 0;
    let turnLabel = '';
    for (const lineText of raw.split('\n')) {
        if (!lineText.trim()) { continue; }
        let line: {
            type?: string; isMeta?: boolean; isSidechain?: boolean; timestamp?: string;
            message?: { content?: unknown };
        };
        try { line = JSON.parse(lineText); } catch { continue; }
        const side = lane || line.isSidechain === true;
        const said: SearchRole = side ? 'delegator' : 'user';
        const answered: SearchRole = side ? 'handler' : 'assistant';
        const ts = line.timestamp ? Date.parse(line.timestamp) : 0;
        const content = line.message?.content;
        const candidates: { role: SearchRole; text: string; tool?: string }[] = [];
        let opening = '';

        if (line.type === 'user' && !line.isMeta) {
            if (typeof content === 'string') {
                if (!isHarnessText(content)) {
                    candidates.push({ role: said, text: content });
                    opening = content;
                }
            } else if (Array.isArray(content)) {
                for (const b of content as { type?: string; text?: string; content?: unknown }[]) {
                    if (b?.type === 'text' && b.text && !isHarnessText(b.text)) {
                        candidates.push({ role: said, text: b.text });
                        if (!opening) { opening = b.text; }
                    } else if (b?.type === 'tool_result') {
                        candidates.push({
                            role: 'toolResult',
                            text: contentToText(b.content) || String(b.text ?? '')
                        });
                    }
                }
            }
            // One user record is one turn even when it has several text blocks.
            if (!side && opening) { turn++; turnLabel = opening.slice(0, 60); }
        } else if (line.type === 'assistant' && Array.isArray(content)) {
            for (const b of content as { type?: string; text?: string; name?: string; input?: unknown }[]) {
                if (b?.type === 'text' && b.text) {
                    candidates.push({ role: answered, text: b.text });
                } else if (b?.type === 'tool_use') {
                    let input = '';
                    try { input = typeof b.input === 'string' ? b.input : JSON.stringify(b.input ?? ''); } catch { /* cyclic */ }
                    candidates.push({ role: 'tool', text: `${b.name ?? ''} ${input}`, tool: b.name });
                }
            }
        }
        for (const c of candidates) {
            // The cap first, then the normalization — that order is what the
            // query-time `snip()` used to do and a message is cut at 200k of
            // its OWN characters, not of its whitespace-free ones.
            const text = normalizeText(c.text.slice(0, TEXT_CAP));
            if (!text) { continue; }
            messages.push({ ...c, text, ts, turn, turnLabel });
        }
    }
    return messages;
}

/**
 * The records of one session — the single door onto a transcript's searchable
 * text. `undefined` means it could not be read as one (a parse failure), which
 * is not the same answer as "no records".
 */
export function buildRecords(
    raw: string, s: SearchableSession, parse?: ParseForeign
): SearchRecord[] | undefined {
    try {
        if (s.engine && s.engine !== 'claude') {
            const foreign = parse?.(raw, s.file);
            if (!foreign) { return undefined; }
            const labels = new Map((foreign.turns ?? []).map(t => [t.n, t.label]));
            const out: SearchRecord[] = [];
            for (const m of foreign.messages) {
                if (m.role === 'system') { continue; }
                const text = normalizeText((m.role === 'tool'
                    ? `${m.tool ?? ''} ${m.input ?? m.text ?? ''}` : (m.text ?? '')).trim().slice(0, TEXT_CAP));
                if (!text) { continue; }
                out.push({
                    role: m.role as SearchRole,
                    text,
                    ts: m.ts,
                    turn: m.turn ?? 0,
                    turnLabel: labels.get(m.turn ?? 0) ?? '',
                    ...(m.tool ? { tool: m.tool } : {})
                });
            }
            return out;
        }
        return parseClaude(raw, s.isSidechain === true);
    } catch { return undefined; }
}

function cachePut(file: string, entry: CacheEntry): void {
    const old = transcriptCache.get(file);
    if (old) { cacheChars -= old.chars; transcriptCache.delete(file); }
    transcriptCache.set(file, entry);
    cacheChars += entry.chars;
    while (transcriptCache.size > CACHE_MAX_FILES || cacheChars > CACHE_MAX_CHARS) {
        const oldest = transcriptCache.keys().next().value as string | undefined;
        if (!oldest) { break; }
        cacheChars -= transcriptCache.get(oldest)?.chars ?? 0;
        transcriptCache.delete(oldest);
    }
}

/** The signature that decides whether a cached (or indexed) read is still the
 *  file on disk. Shared with the corpus, so the two cannot age differently. */
export function transcriptSignature(s: SearchableSession): string {
    const tail = `${s.engine ?? 'claude'}:${s.isSidechain ? 1 : 0}`;
    try {
        const st = fs.statSync(s.file);
        return `${st.mtimeMs}:${st.size}:${tail}`;
    } catch { return `${s.mtime}:0:${tail}`; }
}

export function readTranscript(s: SearchableSession, parse?: ParseForeign): SearchRecord[] | undefined {
    // Absence of a foreign parser is not a parse result and must not poison the
    // cache for a later caller that supplies the shared CLI viewer parser.
    if (s.engine && s.engine !== 'claude' && !parse) { return undefined; }
    const sig = transcriptSignature(s);
    const cached = transcriptCache.get(s.file);
    if (cached?.sig === sig) {
        transcriptCache.delete(s.file);
        transcriptCache.set(s.file, cached);
        return cached.messages;
    }
    let raw = '';
    try { raw = fs.readFileSync(s.file, 'utf8'); } catch { return undefined; }
    const messages = buildRecords(raw, s, parse);
    const chars = messages?.reduce((n, m) => n + m.text.length, 0) ?? 0;
    cachePut(s.file, { sig, messages, chars });
    return messages;
}

/** The text arrives already normalized (see SearchRecord); the two callers that
 *  hand it raw prose normalize on the way in. */
function snip(flat: string, matcher: CompiledQuery): { before: string; match: string; after: string } | null {
    if (!matcher.test(flat)) { return null; }
    const at = matcher.find(flat) ?? { index: 0, length: 0 };
    const start = at.index;
    const end = at.index + at.length;
    return {
        before: (start > CONTEXT_CHARS ? '…' : '') + flat.slice(Math.max(0, start - CONTEXT_CHARS), start),
        match: flat.slice(start, end).slice(0, 200),
        after: flat.slice(end, end + CONTEXT_CHARS) + (end + CONTEXT_CHARS < flat.length ? '…' : '')
    };
}

/** Everything the reducer needs that is not the records themselves. */
export interface ScanLimits {
    roles: Set<SearchRole>;
    maxHits: number;
    maxPerFile: number;
    tsFrom: number;
    tsTo: number;
}

/** The scan options, read once, in the one place both readers share. */
export function scanLimits(opts: SearchOptions): ScanLimits {
    return {
        roles: new Set(opts.roles?.length ? opts.roles : DEFAULT_ROLES),
        maxHits: opts.maxHits ?? 250,
        maxPerFile: opts.maxPerFile ?? 12,
        tsFrom: opts.tsFrom ?? 0,
        tsTo: opts.tsTo ?? 0
    };
}

/** The sessions a scan will walk, in the order it walks them (newest first). */
export function orderSessions(
    sessions: SearchableSession[], opts: SearchOptions
): SearchableSession[] {
    const fileSet = opts.files?.length ? new Set(opts.files) : null;
    const agentSet = opts.agentNames ? new Set(opts.agentNames) : null;
    return sessions
        .filter(s => (!opts.agentName || s.agentName === opts.agentName)
            && (!agentSet || agentSet.has(s.agentName ?? ''))
            && (!fileSet || fileSet.has(s.file)))
        .sort((a, b) => b.mtime - a.mtime);
}

/**
 * ‼️ THE ONE REDUCER (X-42). Records in, hits and counters out — and the SAME
 * function whether the records came off disk in a corpus shard or straight out
 * of a transcript. Two copies of this would count `found` differently within a
 * month, and the figure under the results box is the one thing on the page a
 * reader cannot check for themselves.
 *
 * The preview cap stops HITS BEING KEPT, never the scan: `found` is every match
 * there is, which is what makes "showing 12 of 340" an honest sentence.
 */
export function scanSession(
    records: SearchRecord[], s: SearchableSession,
    matcher: CompiledQuery, lim: ScanLimits, result: SearchResult
): void {
    let found = 0;
    let shown = 0;
    for (const m of records) {
        if (!lim.roles.has(m.role) || !m.text) { continue; }
        if ((lim.tsFrom && m.ts && m.ts < lim.tsFrom) || (lim.tsTo && m.ts && m.ts > lim.tsTo)) { continue; }
        const part = snip(m.text, matcher);
        if (!part) { continue; }
        found++;
        result.matchesFound++;
        if (shown >= lim.maxPerFile || result.hits.length >= lim.maxHits) { continue; }
        result.hits.push({
            file: s.file,
            agentName: s.agentName ?? '?',
            title: s.title,
            ts: m.ts || s.mtime,
            role: m.role,
            sessionTs: s.mtime,
            ...(s.sessionId ? { sessionId: s.sessionId } : {}),
            ...(s.engine ? { engine: s.engine } : {}),
            ...(s.project ? { project: s.project } : {}),
            ...(m.role === 'delegator' && s.agentName ? { speaker: s.agentName } : {}),
            ...part,
            turn: m.turn,
            turnLabel: m.turnLabel,
            tool: m.tool
        });
        shown++;
        result.matchesShown++;
    }
    if (found) {
        result.sessionsMatched++;
        result.sessionMatches.push({ file: s.file, found, shown });
    }
}

/** What `truncated` and `omittedMatches` mean, said once for both readers. */
export function finishResult(result: SearchResult): SearchResult {
    result.omittedMatches = Math.max(0, result.matchesFound - result.matchesShown);
    if (result.omittedMatches) { result.truncated = true; }
    return result;
}

export function searchTranscripts(
    sessions: SearchableSession[], query: string, opts: SearchOptions = {}
): SearchResult {
    const result = emptyResult();
    if (!query.trim()) { return result; }
    const matcher = buildMatcher(query, opts);
    if (!matcher.ok) { result.error = matcher.error; return result; }

    const lim = scanLimits(opts);
    const deadline = Date.now() + (opts.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);

    for (const s of orderSessions(sessions, opts)) {
        if (Date.now() > deadline) { result.timedOut = true; result.truncated = true; break; }
        const messages = readTranscript(s, opts.parseForeign);
        if (!messages) { result.parseFailures++; continue; }
        result.filesScanned++;
        scanSession(messages, s, matcher, lim, result);
    }
    return finishResult(result);
}

export interface MemorySearchable {
    file: string;
    agentName: string;
}

function outsideWindow(ts: number, opts: SearchOptions): boolean {
    if (!ts) { return false; }
    return !!((opts.tsFrom && ts < opts.tsFrom) || (opts.tsTo && ts > opts.tsTo));
}

/** Memory notes are small but they are re-read on EVERY keystroke-driven
 *  search; a signature cache costs a `stat` and saves the parse. */
interface SourceCache<T> { sig: string; data: T }
const memoryCache = new Map<string, SourceCache<{ mtime: number; paras: string[] }>>();

function fileSignature(file: string): { sig: string; mtime: number } | null {
    try {
        const st = fs.statSync(file);
        return { sig: `${st.mtimeMs}:${st.size}`, mtime: st.mtimeMs };
    } catch { return null; }
}

export function searchMemory(
    files: MemorySearchable[], query: string, opts: SearchOptions = {}
): SearchHit[] {
    if (!query.trim()) { return []; }
    const matcher = buildMatcher(query, opts);
    if (!matcher.ok) { return []; }
    const maxPerFile = opts.maxPerFile ?? 12;
    const agentSet = opts.agentNames ? new Set(opts.agentNames) : null;
    const hits: SearchHit[] = [];
    for (const f of files) {
        if (opts.agentName && f.agentName !== opts.agentName) { continue; }
        if (agentSet && !agentSet.has(f.agentName)) { continue; }
        const stamp = fileSignature(f.file);
        if (!stamp) { continue; }
        let entry = memoryCache.get(f.file);
        if (entry?.sig !== stamp.sig) {
            let raw = '';
            try { raw = fs.readFileSync(f.file, 'utf8'); } catch { continue; }
            entry = {
                sig: stamp.sig,
                data: {
                    mtime: stamp.mtime,
                    paras: raw.split(/\n\s*\n/)
                        .map(p => normalizeText(p.slice(0, TEXT_CAP)))
                        .filter(Boolean)
                }
            };
            memoryCache.set(f.file, entry);
        }
        const { mtime, paras } = entry.data;
        if (outsideWindow(mtime, opts)) { continue; }
        let fileHits = 0;
        for (const para of paras) {
            if (fileHits >= maxPerFile) { break; }
            const part = snip(para, matcher);
            if (!part) { continue; }
            hits.push({
                file: f.file, agentName: f.agentName, title: path.basename(f.file),
                ts: mtime, role: 'memory', kind: 'memory', ...part
            });
            fileHits++;
        }
    }
    return hits;
}

interface LiveEventRecord {
    ts: number; kind: string; tool?: string; agentName: string;
    transcriptPath: string; text: string;
}

/**
 * ‼️ THE EVENT STORE IS PARSED ONCE PER WRITE, NOT ONCE PER KEYSTROKE (X-42).
 * It is a 26 MB append-only JSONL on this machine and it was being read and
 * JSON-parsed on every single query, which is most of what "the search is slow"
 * meant even when the transcripts were cheap. The ORPHAN decision is
 * deliberately NOT cached with it: whether a transcript still exists is a fact
 * about the disk today, so an event whose session was deleted an hour ago has
 * to become visible without the store being touched.
 */
let liveEventCache: SourceCache<LiveEventRecord[]> | undefined;

function liveEventRecords(storeFile: string): LiveEventRecord[] {
    const stamp = fileSignature(storeFile);
    if (!stamp) { return []; }
    const sig = `${storeFile}:${stamp.sig}`;
    if (liveEventCache?.sig === sig) { return liveEventCache.data; }
    let raw = '';
    try { raw = fs.readFileSync(storeFile, 'utf8'); } catch { return []; }
    const out: LiveEventRecord[] = [];
    for (const lineText of raw.split('\n')) {
        if (!lineText.trim()) { continue; }
        let ev: { ts?: number; kind?: string; detail?: string; tool?: string; agentName?: string; transcriptPath?: string };
        try { ev = JSON.parse(lineText); } catch { continue; }
        const text = normalizeText([ev.tool, ev.detail].filter(Boolean).join(' '));
        if (!text) { continue; }
        out.push({
            ts: ev.ts ?? 0, kind: ev.kind ?? 'event', agentName: ev.agentName ?? '?',
            transcriptPath: ev.transcriptPath ?? '', text,
            ...(ev.tool ? { tool: ev.tool } : {})
        });
    }
    liveEventCache = { sig, data: out };
    return out;
}

export function searchLiveEvents(
    storeFile: string, query: string, opts: SearchOptions = {}
): SearchHit[] {
    if (!query.trim()) { return []; }
    const matcher = buildMatcher(query, opts);
    if (!matcher.ok) { return []; }
    const transcriptExists = new Map<string, boolean>();
    const agentSet = opts.agentNames ? new Set(opts.agentNames) : null;
    const hits: SearchHit[] = [];
    const maxHits = opts.maxHits ?? 50;
    for (const ev of liveEventRecords(storeFile)) {
        if (hits.length >= maxHits) { continue; }
        if ((opts.agentName && ev.agentName !== opts.agentName)
            || (agentSet && !agentSet.has(ev.agentName)) || outsideWindow(ev.ts, opts)) { continue; }
        const tp = ev.transcriptPath;
        if (tp) {
            if (!transcriptExists.has(tp)) { transcriptExists.set(tp, fs.existsSync(tp)); }
            if (transcriptExists.get(tp)) { continue; }
        }
        const part = snip(ev.text, matcher);
        if (!part) { continue; }
        hits.push({
            file: tp, agentName: ev.agentName, title: ev.kind,
            ts: ev.ts, role: 'event', kind: 'event', tool: ev.tool, ...part
        });
    }
    return hits;
}
