import * as fs from 'fs';

/**
 * D4 (semantic layer) — file-based vector index over session transcripts.
 * Chunks of user/assistant text are embedded once per session (incremental
 * by mtime) and searched with cosine similarity — a few thousand vectors is
 * trivially fast in plain JS, no SQLite / native modules needed.
 */

export interface SemChunk {
    sessionFile: string;
    sessionId: string;
    agentName: string;
    title: string;
    ts: number;
    text: string;
}

interface StoredChunk extends SemChunk {
    /** base64-encoded Float32Array */
    v: string;
}

export interface SemHit {
    chunk: SemChunk;
    score: number;
}

export function vecToB64(vec: number[]): string {
    return Buffer.from(new Float32Array(vec).buffer).toString('base64');
}

export function b64ToVec(b64: string): Float32Array {
    const buf = Buffer.from(b64, 'base64');
    return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

export function cosine(a: Float32Array, b: Float32Array): number {
    const n = Math.min(a.length, b.length);
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < n; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/** Pull embeddable text chunks out of a transcript (user prompts + assistant text). */
export function chunkTranscript(file: string, maxChunks = 4, chunkChars = 700): string[] {
    let raw: string;
    try { raw = fs.readFileSync(file, 'utf8'); } catch { return []; }
    const pieces: string[] = [];
    for (const lineText of raw.split('\n')) {
        if (!lineText.trim()) { continue; }
        let line: { type?: string; isMeta?: boolean; message?: { content?: unknown } };
        try { line = JSON.parse(lineText); } catch { continue; }
        if (line.type === 'user' && !line.isMeta && typeof line.message?.content === 'string' &&
            !line.message.content.startsWith('<')) {
            pieces.push('KULLANICI: ' + line.message.content);
        } else if (line.type === 'assistant' && Array.isArray(line.message?.content)) {
            const text = (line.message!.content as { type?: string; text?: string }[])
                .filter(b => b?.type === 'text' && b.text)
                .map(b => b.text)
                .join('\n');
            if (text.trim()) { pieces.push('AJAN: ' + text); }
        }
    }
    const joined = pieces.join('\n').replace(/\s+/g, ' ').trim();
    if (!joined) { return []; }
    const chunks: string[] = [];
    for (let i = 0; i < joined.length && chunks.length < maxChunks; i += chunkChars) {
        const c = joined.slice(i, i + chunkChars).trim();
        if (c.length > 40) { chunks.push(c); }
    }
    return chunks;
}

interface StoreShape {
    sessions: Record<string, number>;   // sessionId -> mtime at index time
    chunks: StoredChunk[];
}

export class SemanticIndex {
    private sessions: Record<string, number> = {};
    private chunks: StoredChunk[] = [];

    constructor(private file: string) {
        this.load();
    }

    private load(): void {
        try {
            const json = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<StoreShape>;
            this.sessions = json.sessions ?? {};
            this.chunks = Array.isArray(json.chunks) ? json.chunks : [];
        } catch { /* first run */ }
    }

    save(): void {
        try {
            fs.writeFileSync(this.file, JSON.stringify({
                sessions: this.sessions, chunks: this.chunks
            }), 'utf8');
        } catch { /* best-effort */ }
    }

    stats(): { sessions: number; chunks: number } {
        return { sessions: Object.keys(this.sessions).length, chunks: this.chunks.length };
    }

    indexedCount(allowedSessionIds?: Set<string>): number {
        const ids = Object.keys(this.sessions);
        return allowedSessionIds ? ids.filter(id => allowedSessionIds.has(id)).length : ids.length;
    }

    /** Which of these sessions still need (re)indexing? */
    pending(sessions: { sessionId: string; mtime: number }[]): { sessionId: string; mtime: number }[] {
        return sessions.filter(s => (this.sessions[s.sessionId] ?? 0) < s.mtime);
    }

    /** Replace a session's chunks with freshly embedded ones. */
    addSession(sessionId: string, mtime: number, chunks: SemChunk[], vectors: number[][]): void {
        this.chunks = this.chunks.filter(c => c.sessionId !== sessionId);
        for (const [i, chunk] of chunks.entries()) {
            if (!vectors[i]?.length) { continue; }
            this.chunks.push({ ...chunk, v: vecToB64(vectors[i]) });
        }
        this.sessions[sessionId] = mtime;
    }

    /** Drop sessions that no longer exist (files pruned by Claude Code). */
    prune(liveSessionIds: Set<string>): void {
        this.chunks = this.chunks.filter(c => liveSessionIds.has(c.sessionId));
        for (const id of Object.keys(this.sessions)) {
            if (!liveSessionIds.has(id)) { delete this.sessions[id]; }
        }
    }

    search(queryVec: number[], k = 20, allowedSessionIds?: Set<string>): SemHit[] {
        const q = new Float32Array(queryVec);
        const scored = this.chunks.filter(c => !allowedSessionIds || allowedSessionIds.has(c.sessionId)).map(c => ({
            chunk: {
                sessionFile: c.sessionFile, sessionId: c.sessionId, agentName: c.agentName,
                title: c.title, ts: c.ts, text: c.text
            },
            score: cosine(q, b64ToVec(c.v))
        }));
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, k);
    }
}
