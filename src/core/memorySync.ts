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
