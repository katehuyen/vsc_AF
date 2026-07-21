import * as fs from 'fs';

/**
 * I4 — Semantic memory query: "what does the fleet know about X?"
 * Reuses the 2.1.0 embedding infrastructure (SemanticIndex) over memory/*.md
 * files instead of transcripts. Transcript search finds history; this finds
 * knowledge — answers point at the memory records themselves, per agent.
 */

/**
 * Chunk one memory markdown file for embedding: split on H2/H3 headings so a
 * hit lands on a coherent fact, cap chunk size and count. Frontmatter is kept
 * with the first chunk (it carries the description line).
 */
export function chunkMemoryFile(file: string, maxChunks = 6, chunkChars = 900): string[] {
    let raw: string;
    try { raw = fs.readFileSync(file, 'utf8'); } catch { return []; }
    const text = raw.replace(/\r\n/g, '\n').trim();
    if (!text) { return []; }
    // Split on headings but keep them with their section.
    const sections = text.split(/\n(?=#{1,3} )/g);
    const chunks: string[] = [];
    for (const section of sections) {
        const clean = section.replace(/\s+/g, ' ').trim();
        if (clean.length < 30) { continue; }
        for (let i = 0; i < clean.length && chunks.length < maxChunks; i += chunkChars) {
            const c = clean.slice(i, i + chunkChars).trim();
            if (c.length >= 30) { chunks.push(c); }
        }
        if (chunks.length >= maxChunks) { break; }
    }
    return chunks;
}

export interface MemoryFileRef {
    /** used as the index key (sessionId slot of SemanticIndex) */
    key: string;
    file: string;
    name: string;
    agentName: string;
    mtime: number;
}

/** Flatten agents' memory files into index-ready refs. */
export function memoryFileRefs(
    agents: { name: string; memoryFiles: { path: string; name: string; mtime: number }[] }[]
): MemoryFileRef[] {
    const refs: MemoryFileRef[] = [];
    for (const a of agents) {
        for (const f of a.memoryFiles) {
            refs.push({
                key: `${a.name}::${f.name}`.toLowerCase(),
                file: f.path,
                name: f.name,
                agentName: a.name,
                mtime: f.mtime
            });
        }
    }
    return refs;
}
