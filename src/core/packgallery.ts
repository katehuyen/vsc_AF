import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { readAgentPack } from './agentpack';
import { hashString } from './util';

/**
 * J4 — Agentpack gallery. Git-repo (or plain folder) based pack sources:
 * browse the packs they contain and import with the normal, safe import
 * flow (fresh memory, disabled triggers, new tokens). E4's publishing story
 * gets its consumption side.
 */

export interface GalleryPack {
    file: string;
    packName: string;
    exportedAt?: number;
    fileCount: number;
    workflowCount: number;
    source: string;
}

function findPackFiles(dir: string, depth = 0): string[] {
    if (depth > 2) { return []; }
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
    const out: string[] = [];
    for (const e of entries) {
        if (e.name.startsWith('.')) { continue; }
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { out.push(...findPackFiles(p, depth + 1)); }
        else if (e.name.endsWith('.agentpack')) { out.push(p); }
    }
    return out;
}

function gitSync(url: string, cacheDir: string): Promise<{ dir?: string; error?: string }> {
    const dir = path.join(cacheDir, 'gal-' + hashString(url).toString(36));
    return new Promise(resolve => {
        const done = (err: unknown) => {
            if (err) { resolve({ error: String(err).slice(0, 200) }); }
            else { resolve({ dir }); }
        };
        if (fs.existsSync(path.join(dir, '.git'))) {
            cp.exec('git pull --ff-only', { cwd: dir, timeout: 60_000, windowsHide: true },
                // A failed pull still leaves a usable (stale) checkout.
                () => resolve({ dir }));
        } else {
            fs.mkdirSync(cacheDir, { recursive: true });
            cp.exec(`git clone --depth 1 "${url}" "${dir}"`, { timeout: 120_000, windowsHide: true },
                (err) => done(err));
        }
    });
}

function looksLikeGitUrl(source: string): boolean {
    return /^(https?:\/\/|git@|ssh:\/\/|file:\/\/)/i.test(source.trim());
}

/**
 * Collect packs from all configured sources. Local folders are scanned as-is;
 * git URLs are shallow-cloned (then pulled) into the cache dir.
 */
export async function collectGalleryPacks(
    sources: string[],
    cacheDir: string
): Promise<{ packs: GalleryPack[]; errors: string[] }> {
    const packs: GalleryPack[] = [];
    const errors: string[] = [];
    for (const source of sources) {
        if (!source?.trim()) { continue; }
        let dir = source.trim();
        if (looksLikeGitUrl(dir)) {
            const r = await gitSync(dir, cacheDir);
            if (!r.dir) { errors.push(`${source}: ${r.error}`); continue; }
            dir = r.dir;
        }
        if (!fs.existsSync(dir)) { errors.push(`${source}: folder not found`); continue; }
        for (const file of findPackFiles(dir)) {
            const { pack, error } = readAgentPack(file);
            if (!pack) { errors.push(`${path.basename(file)}: ${error}`); continue; }
            packs.push({
                file,
                packName: pack.name,
                exportedAt: pack.exportedAt,
                fileCount: pack.files.length,
                workflowCount: pack.workflows?.length ?? 0,
                source
            });
        }
    }
    packs.sort((a, b) => (b.exportedAt ?? 0) - (a.exportedAt ?? 0));
    return { packs, errors };
}
