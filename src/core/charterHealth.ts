/**
 * X-438 — the charter-gap sentence for a project FOLDER, for the warning list.
 *
 * The warning list is rebuilt on every project page and tree render, and
 * finding the charter walks the whole folder. So the answer is kept per folder
 * and thrown away when the charter's mtime moves; a folder with no charter is
 * walked again at most once a minute, so a charter created later is noticed.
 */
import * as fs from 'fs';
import { charterGaps, charterGapSentence } from './charterGaps';
import { parseCharterSections, scanRoles } from './projectDocs';

const NO_CHARTER_TTL_MS = 60_000;
const CHARTER_TTL_MS = 10 * 60_000;

interface Entry { at: number; file?: string; mtime: number; sentence?: string }
const cache = new Map<string, Entry>();

function mtimeOf(file: string): number {
    try { return fs.statSync(file).mtimeMs; } catch { return -1; }
}

export function charterWarning(folder: string, now = Date.now()): string | undefined {
    const key = folder.toLowerCase();
    const hit = cache.get(key);
    if (hit) {
        const fresh = hit.file
            ? now - hit.at < CHARTER_TTL_MS && mtimeOf(hit.file) === hit.mtime
            : now - hit.at < NO_CHARTER_TTL_MS;
        if (fresh) { return hit.sentence; }
    }
    const file = scanRoles(folder).charter;
    let text = '';
    if (file) { try { text = fs.readFileSync(file, 'utf8'); } catch { text = ''; } }
    const sentence = charterGapSentence(charterGaps(parseCharterSections(text)), !!file);
    cache.set(key, { at: now, file, mtime: file ? mtimeOf(file) : -1, sentence });
    return sentence;
}
