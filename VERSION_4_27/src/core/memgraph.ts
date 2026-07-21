import { AgentInfo } from './agents';
import { indexedMemoryNames, readMemoryFrontmatter } from './memusage';
import { safeReadFile } from './util';

/**
 * Memory link graph: the user's memory convention connects records with
 * [[wikilink]]s (target = the other file's frontmatter `name:` slug, which by
 * convention equals its basename). This module makes that invisible structure
 * visible: who links to whom, which records are broken (link to nothing),
 * which are unlinked islands, which are hubs.
 *
 * MEMORY.md is the index, not a knowledge node — it contributes the inIndex
 * flag but is excluded from the graph itself.
 */

export interface MemNode {
    /** basename incl. .md */
    name: string;
    tokens: number;
    mtime: number;
    type?: string;
    description?: string;
    /** referenced from MEMORY.md */
    inIndex: boolean;
    /** recall count in the caller-supplied window */
    recalls: number;
    incoming: number;
    outgoing: number;
    path: string;
}

export interface MemLink {
    /** basename of the source file */
    from: string;
    /** resolved target basename, or the raw [[slug]] when broken */
    to: string;
    broken: boolean;
}

export interface MemGraph {
    nodes: MemNode[];
    links: MemLink[];
    /** raw [[slugs]] that resolve to no file */
    missing: string[];
}

const WIKILINK_RE = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;

export function buildMemoryGraph(
    agent: AgentInfo,
    recalls: Map<string, number>
): MemGraph {
    const files = agent.memoryFiles.filter(f => f.name.toLowerCase() !== 'memory.md');
    const indexContent = agent.memoryIndexPath ? safeReadFile(agent.memoryIndexPath) ?? '' : '';
    const indexed = indexedMemoryNames(indexContent);

    // Resolve [[slug]] → file via basename AND frontmatter name (both conventions).
    const bySlug = new Map<string, string>(); // slug (lower) -> basename
    const metas = new Map<string, { type?: string; description?: string }>();
    for (const f of files) {
        bySlug.set(f.name.toLowerCase().replace(/\.md$/, ''), f.name);
        const meta = readMemoryFrontmatter(f.path);
        metas.set(f.name, meta);
        const fmName = /^---[\s\S]*?\bname:\s*([^\n]+)/.exec(safeReadFile(f.path)?.slice(0, 400) ?? '');
        if (fmName) { bySlug.set(fmName[1].trim().toLowerCase(), f.name); }
    }

    const links: MemLink[] = [];
    const missing = new Set<string>();
    const incoming = new Map<string, number>();
    const outgoing = new Map<string, number>();

    for (const f of files) {
        const raw = safeReadFile(f.path) ?? '';
        for (const m of raw.matchAll(WIKILINK_RE)) {
            const slug = m[1].trim().toLowerCase();
            if (!slug) { continue; }
            const target = bySlug.get(slug);
            if (target === f.name) { continue; } // self-link — noise
            if (target) {
                links.push({ from: f.name, to: target, broken: false });
                outgoing.set(f.name, (outgoing.get(f.name) ?? 0) + 1);
                incoming.set(target, (incoming.get(target) ?? 0) + 1);
            } else {
                links.push({ from: f.name, to: m[1].trim(), broken: true });
                outgoing.set(f.name, (outgoing.get(f.name) ?? 0) + 1);
                missing.add(m[1].trim());
            }
        }
    }

    const nodes: MemNode[] = files.map(f => ({
        name: f.name,
        tokens: f.tokens,
        mtime: f.mtime,
        type: metas.get(f.name)?.type,
        description: metas.get(f.name)?.description,
        inIndex: indexed.has(f.name.toLowerCase()),
        recalls: recalls.get(f.name.toLowerCase()) ?? 0,
        incoming: incoming.get(f.name) ?? 0,
        outgoing: outgoing.get(f.name) ?? 0,
        path: f.path
    })).sort((a, b) => (b.incoming + b.outgoing) - (a.incoming + a.outgoing) || a.name.localeCompare(b.name));

    return { nodes, links, missing: [...missing].sort() };
}
