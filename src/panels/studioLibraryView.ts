import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { MediaMeta } from '../core/media';
import { CacheEntry, cacheOf, LibraryWall, STUDIO_VIEW_KEYS, StudioView, viewRefusal } from '../core/studioLibrary';

/** Reads one view of the library — the same function the studio.library op calls. */
export type WallReader = (view: StudioView, cache: CacheEntry[]) => Promise<LibraryWall>;

/**
 * X-424 — the Studio wall's library state on the host: the page's live filter
 * (never remembered), the last wall read, and the webview roots its previews
 * need. A read is async while the page's data is not, so the panel paints what
 * it has and this calls back when a newer wall arrives.
 */
export class StudioLibraryView {
    private view: StudioView = {};
    private wall?: LibraryWall;
    private error = '';
    private seq = 0;

    constructor(private read: WallReader | undefined, private onWall: (newDirs: boolean) => void) {}

    /** The page's filter row changed: blanks inherit, an invalid value is refused and said. */
    setView(v: unknown): void {
        const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
        const next: StudioView = {};
        for (const k of STUDIO_VIEW_KEYS) { const x = String(o[k] ?? '').trim(); if (x) { next[k] = x; } }
        const no = viewRefusal(next);
        this.error = no;
        if (!no) { this.view = next; }
    }

    async load(metas: readonly MediaMeta[], roots: readonly string[]): Promise<void> {
        if (!this.read) { return; }
        const my = ++this.seq;
        try {
            const w = await this.read(this.view, cacheOf(metas, fs.existsSync));
            if (my !== this.seq) { return; }
            this.wall = w;
        } catch (e) {
            if (my !== this.seq) { return; }
            this.error = `the library could not be read — ${(e as Error).message}`;
        }
        this.onWall(this.dirs().some(d => !under(d, roots)));
    }

    current(): LibraryWall | undefined { return this.wall; }

    /** What the page draws over the wall. */
    state(): Record<string, unknown> {
        if (!this.read) { return { source: 'off', note: 'The library is not wired on this page — showing the sidecar files.' }; }
        if (!this.wall) { return { source: 'loading', note: 'Reading the library…', view: this.view, error: this.error }; }
        const w = this.wall;
        return { source: w.source, note: w.note, base: w.base, why: w.why, resolved: w.view, view: this.view, matched: w.matched, error: this.error };
    }

    /** Every folder a card's preview lives in. */
    dirs(): string[] {
        return [...new Set((this.wall?.cards ?? []).filter(c => c.file).map(c => path.dirname(c.file)))];
    }
}

const under = (dir: string, roots: readonly string[]): boolean =>
    roots.some(r => { const rel = path.relative(r, dir); return !rel.startsWith('..') && !path.isAbsolute(rel); });

/** The webview roots a Studio needs: its media, the outputs folder, and every folder a shown file lives in. */
export function studioRoots(extensionUri: vscode.Uri, outputsDir: string, metas: readonly MediaMeta[], extra: readonly string[]): vscode.Uri[] {
    const dirs = new Set<string>([outputsDir, ...extra]);
    for (const m of metas) { for (const f of m.assetFiles) { dirs.add(path.dirname(f)); } }
    return [vscode.Uri.joinPath(extensionUri, 'media'), ...[...dirs].map(d => vscode.Uri.file(d))];
}
