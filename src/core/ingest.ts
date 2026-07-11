import * as fs from 'fs';
import * as path from 'path';
import { MEDIA_EXTS, MediaMeta, registerExternalAsset, registeredAssetPaths } from './media';

/**
 * Wave A (media roadmap) — asset ingest: watched folders (downloads, render
 * exports…) are scanned on a slow poll; new media files are registered into
 * the gallery as external assets (sidecar meta, file referenced in place).
 * Polling readdir instead of fs.watch keeps it reliable on Windows and cheap
 * (a folder listing every 30s). Pure node — the host wires config + events.
 */

export interface IngestFolder {
    path: string;
    label?: string;
    projectId?: string;
    sceneId?: string;
}

/** Files older than this at scan time are ignored (protects against pointing
 *  the watcher at a folder full of years-old downloads). Recent files are
 *  backfilled so "downloaded while VS Code was closed" still lands. */
export const INGEST_BACKFILL_MS = 48 * 3600 * 1000;
const STABLE_CHECK_MS = 1500;

export interface IngestScanResult {
    registered: MediaMeta[];
    /** files seen but still growing — retried on the next scan */
    pending: string[];
}

/**
 * One scan pass over the configured folders. Non-recursive by design (point it
 * at the flat download/export folder). A file is registered only when its size
 * is unchanged across a short recheck (downloads in progress are skipped).
 */
export async function scanIngestFolders(
    outputsDir: string,
    folders: IngestFolder[],
    known?: Set<string>
): Promise<IngestScanResult> {
    const registry = known ?? registeredAssetPaths(outputsDir);
    const registered: MediaMeta[] = [];
    const pending: string[] = [];
    const now = Date.now();

    interface Candidate { file: string; folder: IngestFolder; size: number; }
    const candidates: Candidate[] = [];
    for (const folder of folders) {
        let names: string[];
        try { names = fs.readdirSync(folder.path); } catch { continue; }
        for (const name of names) {
            const ext = name.split('.').pop()?.toLowerCase() ?? '';
            if (!MEDIA_EXTS.includes(ext)) { continue; }
            const file = path.join(folder.path, name);
            if (registry.has(path.resolve(file).toLowerCase())) { continue; }
            try {
                const st = fs.statSync(file);
                if (!st.isFile() || st.mtimeMs < now - INGEST_BACKFILL_MS) { continue; }
                candidates.push({ file, folder, size: st.size });
            } catch { /* vanished between readdir and stat */ }
        }
    }
    if (!candidates.length) { return { registered, pending }; }

    // Size-stability recheck: a file still being written keeps growing.
    await new Promise(r => setTimeout(r, STABLE_CHECK_MS));
    for (const c of candidates) {
        try {
            const st = fs.statSync(c.file);
            if (st.size !== c.size || st.size === 0) {
                pending.push(c.file);
                continue;
            }
        } catch { continue; }
        const meta = registerExternalAsset(outputsDir, c.file, {
            projectId: c.folder.projectId,
            sceneId: c.folder.sceneId,
            source: 'external:' + (c.folder.label ?? path.basename(c.folder.path))
        }, registry);
        if (meta) { registered.push(meta); }
    }
    return { registered, pending };
}

/** Slow-poll driver around scanIngestFolders. */
export class IngestWatcher {
    private timer?: NodeJS.Timeout;
    private scanning = false;
    private registry?: Set<string>;

    constructor(
        private outputsDir: string,
        private getFolders: () => IngestFolder[],
        private onRegistered: (metas: MediaMeta[]) => void,
        private intervalMs = 30_000
    ) { }

    start(): void {
        this.stop();
        const folders = this.getFolders();
        if (!folders.length) { return; }
        void this.scan();
        this.timer = setInterval(() => void this.scan(), this.intervalMs);
    }

    /** Config changed: rebuild the dedup registry on the next scan. */
    restart(): void {
        this.registry = undefined;
        this.start();
    }

    private async scan(): Promise<void> {
        if (this.scanning) { return; }
        this.scanning = true;
        try {
            if (!this.registry) { this.registry = registeredAssetPaths(this.outputsDir); }
            const res = await scanIngestFolders(this.outputsDir, this.getFolders(), this.registry);
            if (res.registered.length) { this.onRegistered(res.registered); }
        } catch { /* never break the host on a bad folder */ }
        finally { this.scanning = false; }
    }

    stop(): void {
        if (this.timer) { clearInterval(this.timer); this.timer = undefined; }
    }

    dispose(): void { this.stop(); }
}
