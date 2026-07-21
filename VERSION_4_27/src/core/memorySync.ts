import * as fs from 'fs';
import { AgentInfo, FileMeta } from './agents';
import { hashString, safeReadFile } from './util';

export interface DupCopy {
    agent: AgentInfo;
    file: FileMeta;
    hash: number;
}

export interface DupGroup {
    name: string;
    copies: DupCopy[];
    identical: boolean;
}

const EXCLUDED = new Set(['memory.md']);

/** Memory files sharing a basename across two or more agents. */
export function findDuplicateGroups(agents: AgentInfo[]): DupGroup[] {
    const byName = new Map<string, DupCopy[]>();
    for (const agent of agents) {
        for (const file of agent.memoryFiles) {
            const key = file.name.toLowerCase();
            if (EXCLUDED.has(key)) { continue; }
            const list = byName.get(key) ?? [];
            list.push({ agent, file, hash: hashString(safeReadFile(file.path) ?? '') });
            byName.set(key, list);
        }
    }
    const groups: DupGroup[] = [];
    for (const [name, copies] of byName) {
        if (copies.length < 2) { continue; }
        copies.sort((a, b) => b.file.mtime - a.file.mtime); // newest first
        groups.push({
            name,
            copies,
            identical: copies.every(c => c.hash === copies[0].hash)
        });
    }
    groups.sort((a, b) => Number(a.identical) - Number(b.identical) || a.name.localeCompare(b.name));
    return groups;
}

export interface SyncResult {
    written: string[];
    backups: string[];
    errors: string[];
}

function stamp(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export const MERGE_SECTION_RE = /^===\s*FROM\s.*===\s*$/;

/** Build an editable merge draft containing every copy, newest first. */
export function buildMergeDraft(group: DupGroup): string {
    const lines: string[] = [
        `<!-- Agent Farm merge draft: ${group.name}`,
        `     Edit this document into the final version (delete the === FROM === markers`,
        `     and everything you don't want), then run "Agent Farm: Apply Merged Memory". -->`,
        ''
    ];
    for (const copy of group.copies) {
        const age = Math.round((Date.now() - copy.file.mtime) / 86400000);
        lines.push(`=== FROM ${copy.agent.name} (${age}d old) ===`);
        lines.push((safeReadFile(copy.file.path) ?? '').trimEnd());
        lines.push('');
    }
    return lines.join('\n');
}

/** Strip draft markers and write the merged content to every file, with backups. */
export function applyMergedContent(files: string[], draft: string): SyncResult {
    const result: SyncResult = { written: [], backups: [], errors: [] };
    const content = draft
        .split('\n')
        .filter(line => !MERGE_SECTION_RE.test(line) && !line.startsWith('<!-- Agent Farm merge draft') &&
            !/^\s+Edit this document into the final version/.test(line) &&
            !/^\s+and everything you don't want.*-->\s*$/.test(line))
        .join('\n')
        .replace(/^\n+/, '');
    if (!content.trim()) {
        result.errors.push('merged content is empty — nothing written');
        return result;
    }
    for (const file of files) {
        try {
            if (fs.existsSync(file)) {
                const backup = `${file}.${stamp()}.afbak`;
                fs.copyFileSync(file, backup);
                result.backups.push(backup);
            }
            fs.writeFileSync(file, content, 'utf8');
            result.written.push(file);
        } catch (e) {
            result.errors.push(`${file}: ${String(e)}`);
        }
    }
    return result;
}

/** Copy the source file's content over every other copy, backing each target up first. */
export function syncGroup(group: DupGroup, sourcePath: string): SyncResult {
    const result: SyncResult = { written: [], backups: [], errors: [] };
    const content = safeReadFile(sourcePath);
    if (content === undefined) {
        result.errors.push(`cannot read source: ${sourcePath}`);
        return result;
    }
    for (const copy of group.copies) {
        if (copy.file.path === sourcePath) { continue; }
        try {
            const backup = `${copy.file.path}.${stamp()}.afbak`;
            fs.copyFileSync(copy.file.path, backup);
            result.backups.push(backup);
            fs.writeFileSync(copy.file.path, content, 'utf8');
            result.written.push(copy.file.path);
        } catch (e) {
            result.errors.push(`${copy.file.path}: ${String(e)}`);
        }
    }
    return result;
}
