/**
 * GET /res/<path> — the files a page loads (media/*.js, common.css, icons,
 * sounds), read from one folder and nothing outside it. A path that climbs,
 * is absolute, hides a backslash or a NUL, or names a type not listed here is
 * not found; so is a folder.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Page } from './host';

const TYPES: Record<string, string> = {
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.wav': 'audio/wav',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
};

/** The file under `root` a /res/ url names, or null when it may not be served. */
export function resolveResource(root: string, url: string): string | null {
    const m = /^\/res\/([^?#]+)/.exec(url);
    if (!m) { return null; }
    let rel: string;
    try { rel = decodeURIComponent(m[1]); } catch { return null; }
    if (/[\\\0]/.test(rel) || rel.split('/').some(s => s === '..' || s === '.' || s === '')) { return null; }
    if (!TYPES[path.extname(rel).toLowerCase()]) { return null; }
    const base = path.resolve(root);
    const file = path.resolve(base, rel);
    return file.startsWith(base + path.sep) ? file : null;
}

export function resourcePage(root: string, url: string): Page | null {
    const file = resolveResource(root, url);
    if (!file) { return null; }
    try {
        // a link inside the folder may not lead out of it; a folder fails the read below
        if (!fs.realpathSync(file).startsWith(fs.realpathSync(root) + path.sep)) { return null; }
        return { status: 200, type: TYPES[path.extname(file).toLowerCase()], body: fs.readFileSync(file) };
    } catch {
        return null;
    }
}
