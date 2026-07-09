import * as fs from 'fs';

/**
 * D4 — Transcript search. Fast text/regex scan over session .jsonl files
 * (user prompts + assistant text). Newest sessions first, capped results.
 * Semantic search is a possible later layer; this is the workhorse.
 */

export interface SearchableSession {
    file: string;
    agentName?: string;
    title: string;
    mtime: number;
}

export interface SearchHit {
    file: string;
    agentName: string;
    title: string;
    ts: number;
    role: 'user' | 'assistant';
    /** snippet split around the first match so the UI can highlight safely. */
    before: string;
    match: string;
    after: string;
    /** D4 semantic layer: cosine similarity (0-1) when the hit came from the vector index. */
    score?: number;
}

export interface SearchOptions {
    regex?: boolean;
    caseSensitive?: boolean;
    /** restrict to one agent (exact name). */
    agentName?: string;
    maxHits?: number;
    maxPerFile?: number;
}

export interface SearchResult {
    hits: SearchHit[];
    filesScanned: number;
    truncated: boolean;
    error?: string;
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function textOfContent(content: unknown): string {
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

export function searchTranscripts(
    sessions: SearchableSession[],
    query: string,
    opts: SearchOptions = {}
): SearchResult {
    const result: SearchResult = { hits: [], filesScanned: 0, truncated: false };
    if (!query.trim()) { return result; }

    let matcher: RegExp;
    try {
        matcher = new RegExp(
            opts.regex ? query : escapeRegExp(query),
            opts.caseSensitive ? '' : 'i');
    } catch (e) {
        result.error = 'Invalid regex: ' + String((e as Error).message).slice(0, 120);
        return result;
    }

    const maxHits = opts.maxHits ?? 150;
    const maxPerFile = opts.maxPerFile ?? 3;
    const ordered = sessions
        .filter(s => !opts.agentName || s.agentName === opts.agentName)
        .sort((a, b) => b.mtime - a.mtime);

    for (const s of ordered) {
        if (result.hits.length >= maxHits) { result.truncated = true; break; }
        let raw: string;
        try { raw = fs.readFileSync(s.file, 'utf8'); } catch { continue; }
        result.filesScanned++;
        let fileHits = 0;
        for (const lineText of raw.split('\n')) {
            if (fileHits >= maxPerFile || result.hits.length >= maxHits) { break; }
            if (!lineText.trim()) { continue; }
            let line: {
                type?: string; isMeta?: boolean; timestamp?: string;
                message?: { content?: unknown };
            };
            try { line = JSON.parse(lineText); } catch { continue; }

            let role: 'user' | 'assistant';
            let text = '';
            if (line.type === 'user' && !line.isMeta &&
                typeof line.message?.content === 'string' &&
                !line.message.content.startsWith('<')) {
                role = 'user';
                text = line.message.content;
            } else if (line.type === 'assistant') {
                role = 'assistant';
                text = textOfContent(line.message?.content);
            } else {
                continue;
            }
            if (!text) { continue; }
            const flat = text.replace(/\s+/g, ' ').trim();
            const m = matcher.exec(flat);
            if (!m || !m[0]) { continue; }

            const start = m.index;
            const end = m.index + m[0].length;
            result.hits.push({
                file: s.file,
                agentName: s.agentName ?? '?',
                title: s.title,
                ts: line.timestamp ? Date.parse(line.timestamp) : s.mtime,
                role,
                before: (start > CONTEXT_CHARS ? '…' : '') +
                    flat.slice(Math.max(0, start - CONTEXT_CHARS), start),
                match: m[0].slice(0, 200),
                after: flat.slice(end, end + CONTEXT_CHARS) +
                    (end + CONTEXT_CHARS < flat.length ? '…' : '')
            });
            fileHits++;
        }
    }
    if (result.hits.length >= maxHits) { result.truncated = true; }
    return result;
}
