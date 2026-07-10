import * as fs from 'fs';
import * as path from 'path';
import { SessionIndex } from './sessions';

/**
 * Memory recall statistics — the memory counterpart of skill/MCP usage.
 * A "recall" is an explicit tool touch (Read/Edit/Write/…) of a file inside a
 * memory/ folder, counted per lowercase basename at transcript-parse time
 * (SessionInfo.memoryReads). Passive injection via system reminders is NOT
 * visible in transcripts and therefore not counted — this measures what the
 * agent actively went and read.
 */

/** Recall counts per memory file basename (lowercase) within the window. */
export function memoryUsage(index: SessionIndex, agentId: string, sinceMs: number): Map<string, number> {
    const cutoff = Date.now() - sinceMs;
    const usage = new Map<string, number>();
    for (const session of index.forAgent(agentId)) {
        if (session.lastTs < cutoff) { continue; }
        for (const [name, count] of Object.entries(session.memoryReads)) {
            usage.set(name, (usage.get(name) ?? 0) + count);
        }
    }
    return usage;
}

/** Approximate last-recall time per memory file: newest session that touched it. */
export function memoryLastUsed(index: SessionIndex, agentId: string): Map<string, number> {
    const last = new Map<string, number>();
    for (const session of index.forAgent(agentId)) {
        for (const name of Object.keys(session.memoryReads)) {
            last.set(name, Math.max(last.get(name) ?? 0, session.lastTs));
        }
    }
    return last;
}

export interface MemoryMeta {
    type?: string;
    description?: string;
}

/** Frontmatter type/description of a memory file (the user's convention). */
export function readMemoryFrontmatter(file: string): MemoryMeta {
    try {
        const raw = fs.readFileSync(file, 'utf8');
        const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
        if (!fm) { return {}; }
        const out: MemoryMeta = {};
        for (const line of fm[1].split('\n')) {
            const kv = /^\s*(type|description):\s*(.+)$/.exec(line);
            if (kv) {
                const key = kv[1] as 'type' | 'description';
                if (!out[key]) { out[key] = kv[2].trim().replace(/^["']|["']$/g, ''); }
            }
        }
        return out;
    } catch {
        return {};
    }
}

/** Basenames (lowercase) referenced from MEMORY.md via [x](y.md) or [[y]] links. */
export function indexedMemoryNames(memoryIndexContent: string): Set<string> {
    const referenced = new Set<string>();
    for (const m of memoryIndexContent.matchAll(/\]\(([^)]+\.md)\)/gi)) {
        referenced.add(m[1].toLowerCase().split('/').pop() ?? '');
    }
    for (const m of memoryIndexContent.matchAll(/\[\[([^\]]+)\]\]/g)) {
        referenced.add(m[1].toLowerCase() + '.md');
    }
    return referenced;
}

export interface IndexFix {
    kind: 'add' | 'remove';
    /** basename this fix is about */
    target: string;
    /** add: the pointer line to append; remove: the exact index line to drop */
    line: string;
}

/**
 * One-click index repair plan: orphan files get a pointer line (description
 * from their frontmatter), index lines whose every file reference is dead get
 * dropped. Returns an empty list when the index is consistent.
 */
export function planIndexFixes(
    agentDir: string,
    memoryFiles: { path: string; name: string }[]
): IndexFix[] {
    const index = path.join(agentDir, 'memory', 'MEMORY.md');
    const indexContent = fs.existsSync(index) ? fs.readFileSync(index, 'utf8') : '';
    const referenced = indexedMemoryNames(indexContent);
    const onDisk = new Set(memoryFiles.map(f => f.name.toLowerCase()));
    const fixes: IndexFix[] = [];

    for (const f of memoryFiles) {
        const base = f.name.toLowerCase();
        if (base === 'memory.md' || referenced.has(base)) { continue; }
        const meta = readMemoryFrontmatter(f.path);
        const title = f.name.replace(/\.md$/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        fixes.push({
            kind: 'add',
            target: f.name,
            line: `- [${title}](${f.name})${meta.description ? ` — ${meta.description}` : ''}`
        });
    }

    for (const line of indexContent.split('\n')) {
        const refs: string[] = [];
        for (const m of line.matchAll(/\]\(([^)]+\.md)\)/gi)) {
            refs.push(m[1].toLowerCase().split('/').pop() ?? '');
        }
        for (const m of line.matchAll(/\[\[([^\]]+)\]\]/g)) {
            refs.push(m[1].toLowerCase() + '.md');
        }
        if (refs.length && refs.every(r => !onDisk.has(r))) {
            fixes.push({ kind: 'remove', target: refs[0], line });
        }
    }
    return fixes;
}

/** Apply selected fixes with a timestamped index backup. Returns the backup path. */
export function applyIndexFixes(agentDir: string, fixes: IndexFix[]): string | undefined {
    if (!fixes.length) { return undefined; }
    const index = path.join(agentDir, 'memory', 'MEMORY.md');
    let content = fs.existsSync(index) ? fs.readFileSync(index, 'utf8') : '# Memory Index\n';
    let backup: string | undefined;
    if (fs.existsSync(index)) {
        backup = `${index}.${Date.now()}.afbak`;
        fs.copyFileSync(index, backup);
    }
    const removals = new Set(fixes.filter(f => f.kind === 'remove').map(f => f.line));
    if (removals.size) {
        content = content.split('\n').filter(l => !removals.has(l)).join('\n');
    }
    const additions = fixes.filter(f => f.kind === 'add');
    if (additions.length) {
        if (!content.endsWith('\n')) { content += '\n'; }
        content += additions.map(f => f.line).join('\n') + '\n';
    }
    fs.writeFileSync(index, content, 'utf8');
    return backup;
}

export const MEMORY_TYPES = ['project', 'feedback', 'user', 'reference'] as const;

const memoryTemplate = (name: string, type: string, description: string) => `---
name: ${name}
description: ${description}
metadata:
  type: ${type}
---

${description}
`;

/**
 * Scaffold memory/<name>.md with the frontmatter convention and register it
 * in MEMORY.md (created with a minimal header if missing) so it is never born
 * as an orphan.
 */
export function addMemoryFile(agentDir: string, name: string, type: string, description: string): string {
    const memDir = path.join(agentDir, 'memory');
    const file = path.join(memDir, `${name}.md`);
    if (fs.existsSync(file)) { throw new Error(`memory file "${name}.md" already exists`); }
    fs.mkdirSync(memDir, { recursive: true });
    fs.writeFileSync(file, memoryTemplate(name, type, description), 'utf8');
    const index = path.join(memDir, 'MEMORY.md');
    let indexContent = fs.existsSync(index) ? fs.readFileSync(index, 'utf8') : '# Memory Index\n';
    if (!indexContent.endsWith('\n')) { indexContent += '\n'; }
    const title = name.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    indexContent += `- [${title}](${name}.md) — ${description}\n`;
    fs.writeFileSync(index, indexContent, 'utf8');
    return file;
}

/**
 * Copy a memory file to another agent and register it in the target's
 * MEMORY.md (created if missing) — copies never arrive orphaned.
 */
export function copyMemoryFileTo(srcPath: string, targetAgentDir: string): string {
    const name = path.basename(srcPath);
    const memDir = path.join(targetAgentDir, 'memory');
    const dest = path.join(memDir, name);
    if (fs.existsSync(dest)) { throw new Error(`"${name}" already exists on the target agent`); }
    fs.mkdirSync(memDir, { recursive: true });
    fs.copyFileSync(srcPath, dest);
    const meta = readMemoryFrontmatter(dest);
    const index = path.join(memDir, 'MEMORY.md');
    let idx = fs.existsSync(index) ? fs.readFileSync(index, 'utf8') : '# Memory Index\n';
    if (!idx.endsWith('\n')) { idx += '\n'; }
    const title = name.replace(/\.md$/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    idx += `- [${title}](${name})${meta.description ? ` — ${meta.description}` : ''}\n`;
    fs.writeFileSync(index, idx, 'utf8');
    return dest;
}

export interface ArchiveResult {
    movedTo: string;
    indexUpdated: boolean;
    indexBackup?: string;
}

/**
 * Archive instead of delete: move the file to memory/archive/ (out of the
 * discovery scan) and drop its pointer line(s) from MEMORY.md — with a
 * timestamped index backup — so the index stops advertising a gone file.
 */
export function archiveMemoryFile(agentDir: string, fileName: string): ArchiveResult {
    const memDir = path.join(agentDir, 'memory');
    const src = path.join(memDir, fileName);
    if (!fs.existsSync(src)) { throw new Error(`"${fileName}" not found in memory/`); }
    const archiveDir = path.join(memDir, 'archive');
    fs.mkdirSync(archiveDir, { recursive: true });
    let dest = path.join(archiveDir, fileName);
    if (fs.existsSync(dest)) {
        dest = path.join(archiveDir, `${path.basename(fileName, '.md')}-${Date.now()}.md`);
    }
    fs.renameSync(src, dest);

    const result: ArchiveResult = { movedTo: dest, indexUpdated: false };
    const index = path.join(memDir, 'MEMORY.md');
    if (fs.existsSync(index) && fileName.toLowerCase() !== 'memory.md') {
        const raw = fs.readFileSync(index, 'utf8');
        const base = fileName.toLowerCase();
        const wiki = `[[${path.basename(fileName, '.md').toLowerCase()}]]`;
        const kept = raw.split('\n').filter(line => {
            const l = line.toLowerCase();
            return !(l.includes(`(${base})`) || l.includes(`/${base})`) || l.includes(wiki));
        });
        if (kept.length !== raw.split('\n').length) {
            const backup = `${index}.${Date.now()}.afbak`;
            fs.copyFileSync(index, backup);
            fs.writeFileSync(index, kept.join('\n'), 'utf8');
            result.indexUpdated = true;
            result.indexBackup = backup;
        }
    }
    return result;
}
