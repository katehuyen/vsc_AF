import * as fs from 'fs';
import * as path from 'path';
import { BridgeRegistry, argStr, need } from './bridge';
import {
    WIKI_INDEX_REL, WIKI_LOG_REL, WikiDeps, WikiStore, checkCategoryName, lintWiki, readWikiCategories
} from './wiki';

/**
 * ‼️ U-125 — A CATEGORY LIVES IN THREE PLACES, SO IT IS RENAMED IN THREE.
 *
 * The folder under the wiki root, its `## <Category>` section in `index.md`,
 * and the `topics` of every mark in the pool that will be compiled into it.
 * Renaming the folder by hand in Obsidian left the other two behind: the index
 * still named the old heading and the next compile, reading a pending mark's
 * old topic, opened the old folder again. This moves all three together.
 *
 * ‼️ A TARGET THAT ALREADY EXISTS IS A MERGE, NOT A COLLISION. Its folder
 * receives every entry of the source — but only after every name was checked,
 * so a clash stops the whole move before a single file has left, and a move
 * that fails half-way puts back what it already moved. The two index sections
 * become one (items unioned by the page they link, sorted) and the source
 * section goes. `[[links]]` name the concept, never the folder, so no page
 * body needs touching.
 */

export interface CategoryRenamed {
    ok: true;
    from: string;
    to: string;
    merged: boolean;
    folder: 'renamed' | 'merged' | 'none';
    moved: string[];
    /** `missing` = the wiki has no index.md; `none` = it has no section for the category. */
    index: 'renamed' | 'merged' | 'none' | 'missing';
    marks: number;
    logged: boolean;
    lint: ReturnType<typeof lintWiki>;
}
export type CategoryRenameResult = CategoryRenamed | { ok: false; error: string; clashes?: string[] };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

interface Section { name: string; start: number; end: number }

function sections(lines: string[]): Section[] {
    const out: Section[] = [];
    for (let i = 0; i < lines.length; i++) {
        const m = /^##\s+(.+?)\s*$/.exec(lines[i]);
        if (!m || lines[i].startsWith('###')) { continue; }
        let end = i + 1;
        while (end < lines.length && !/^#{1,2}\s/.test(lines[end])) { end++; }
        out.push({ name: m[1], start: i, end });
    }
    return out;
}

const ITEM = /^\s*[-*+]\s+/;
const itemKey = (l: string) => (/\[\[([^\]|#]+)/.exec(l)?.[1] ?? l.replace(ITEM, '')).trim().toLowerCase();

/** The index half, as text in and text out — line endings kept as found. */
export function renameIndexSection(text: string, from: string, to: string):
    { text: string; did: 'renamed' | 'merged' | 'none' } {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r?\n/);
    const secs = sections(lines);
    const src = secs.find(s => same(s.name, from));
    if (!src) { return { text, did: 'none' }; }
    const dst = secs.find(s => s !== src && same(s.name, to));
    if (!dst) {
        lines[src.start] = `## ${to}`;
        return { text: lines.join(eol), did: 'renamed' };
    }
    const dBody = lines.slice(dst.start + 1, dst.end);
    const sBody = lines.slice(src.start + 1, src.end);
    const seen = new Set<string>();
    const items = [...dBody, ...sBody].filter(l => ITEM.test(l)).filter(l => {
        const k = itemKey(l);
        if (seen.has(k)) { return false; }
        seen.add(k);
        return true;
    }).sort((a, b) => a.replace(ITEM, '').localeCompare(b.replace(ITEM, ''), 'tr'));
    const prose = [...dBody, ...sBody].filter(l => !ITEM.test(l) && l.trim());
    let trail = 0;
    while (trail < dBody.length && !dBody[dBody.length - 1 - trail].trim()) { trail++; }
    const merged = [lines[dst.start], ...prose, ...items, ...new Array<string>(trail).fill('')];
    const out: string[] = [];
    for (let i = 0; i < lines.length;) {
        if (i === src.start) { i = src.end; continue; }
        if (i === dst.start) { out.push(...merged); i = dst.end; continue; }
        out.push(lines[i]);
        i++;
    }
    // Dropping the LAST section takes the file's final newline with it.
    const joined = out.join(eol);
    return { text: text.endsWith('\n') && !joined.endsWith('\n') ? joined + eol : joined, did: 'merged' };
}

/** A mark's provenance path, moved with its folder: `Cat/Page.md`, or absolute under the root. */
function movePage(p: string, root: string, from: string, to: string): string {
    const parts = p.split(/[\\/]/);
    const at = parts.length - 2;
    if (at < 0 || !same(parts[at], from)) { return p; }
    const sep = p.includes('\\') && !p.includes('/') ? '\\' : '/';
    const under = at === 0 || same(path.resolve(parts.slice(0, at).join(sep) || sep), path.resolve(root));
    if (!under) { return p; }
    parts[at] = to;
    return parts.join(sep);
}

function moveFolder(root: string, from: string, to: string): void {
    const a = path.join(root, from);
    const b = path.join(root, to);
    if (!same(from, to)) { fs.renameSync(a, b); return; }
    // A case-only rename is the same path to a case-insensitive disk; the hop
    // through a name nobody uses is what makes it a rename at all.
    const hop = path.join(root, `${to}.rename-${process.pid}-${Date.now()}`);
    fs.renameSync(a, hop);
    fs.renameSync(hop, b);
}

function mergeFolder(root: string, from: string, to: string): { ok: true; moved: string[] } | { ok: false; error: string; clashes?: string[] } {
    const src = path.join(root, from);
    const dst = path.join(root, to);
    const entries = fs.readdirSync(src);
    const have = new Set(fs.readdirSync(dst).map(n => n.toLowerCase()));
    const clashes = entries.filter(n => have.has(n.toLowerCase()));
    if (clashes.length) {
        return {
            ok: false, clashes,
            error: `${clashes.length} name(s) exist in both "${from}" and "${to}": ${clashes.join(', ')}. `
                + 'Nothing was moved — rename or combine those pages first.'
        };
    }
    const moved: string[] = [];
    for (const n of entries) {
        try { fs.renameSync(path.join(src, n), path.join(dst, n)); moved.push(n); } catch (e) {
            for (const back of [...moved].reverse()) {
                try { fs.renameSync(path.join(dst, back), path.join(src, back)); } catch { /* reported below */ }
            }
            return {
                ok: false,
                error: `Moving "${n}" failed (${(e as Error).message}); the ${moved.length} entr(ies) already moved were put back.`
            };
        }
    }
    try { fs.rmdirSync(src); } catch { /* something new appeared in it — left for lint to show */ }
    return { ok: true, moved };
}

function appendLog(root: string, line: string, detail: string): boolean {
    const file = path.join(root, WIKI_LOG_REL);
    let text: string;
    try { text = fs.readFileSync(file, 'utf8'); } catch { return false; }
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const lead = !text || text.endsWith('\n') ? '' : eol;
    try {
        fs.appendFileSync(file, `${lead}${eol}## [${day}] ${line}${eol}- ${detail}${eol}`, 'utf8');
        return true;
    } catch { return false; }
}

export function renameWikiCategory(root: string, store: WikiStore, fromArg: unknown, toArg: unknown): CategoryRenameResult {
    if (!root || !fs.existsSync(root)) { return { ok: false, error: `The wiki root does not exist: ${root || '(not set)'}` }; }
    const asked = String(fromArg ?? '').trim();
    if (!asked) { return { ok: false, error: 'Name the category to rename.' }; }
    if (asked.startsWith('_')) { return { ok: false, error: 'A leading _ is the wiki\'s own folder, not a category.' }; }
    const checked = checkCategoryName(toArg);
    if (!checked.ok) { return checked; }

    const indexFile = path.join(root, WIKI_INDEX_REL);
    let indexText: string | undefined;
    try { indexText = fs.readFileSync(indexFile, 'utf8'); } catch { indexText = undefined; }
    const heads = indexText === undefined ? [] : sections(indexText.split(/\r?\n/)).map(s => s.name);
    const folders = readWikiCategories(root).map(c => c.name);
    const topics = store.topics().map(t => t.topic);
    const spelled = (key: string, except?: string) => [...folders, ...heads, ...topics]
        .find(n => same(n, key) && !(except !== undefined && same(n, except)));

    const from = spelled(asked);
    if (!from) {
        return { ok: false, error: `No category "${asked}" — not a folder under the wiki root, not a heading in index.md, not a topic in the pool.` };
    }
    const caseOnly = same(from, checked.name);
    if (caseOnly && from === checked.name) { return { ok: false, error: `"${from}" is already its name.` }; }
    // An existing category, however it is spelled, is that category — the
    // same rule `createWikiCategory` follows, so a merge never forks a spelling.
    const to = caseOnly ? checked.name : (spelled(checked.name, from) ?? checked.name);

    const srcFolder = folders.find(n => same(n, from));
    const dstFolder = caseOnly ? undefined : folders.find(n => same(n, to));
    let folder: CategoryRenamed['folder'] = 'none';
    let moved: string[] = [];
    if (srcFolder && dstFolder) {
        const m = mergeFolder(root, srcFolder, dstFolder);
        if (!m.ok) { return m; }
        folder = 'merged';
        moved = m.moved;
    } else if (srcFolder) {
        try { moveFolder(root, srcFolder, to); } catch (e) {
            return { ok: false, error: `The folder "${srcFolder}" could not be renamed: ${(e as Error).message}. Nothing else was changed.` };
        }
        folder = 'renamed';
        moved = [srcFolder];
    }

    let index: CategoryRenamed['index'] = indexText === undefined ? 'missing' : 'none';
    if (indexText !== undefined) {
        const r = renameIndexSection(indexText, from, to);
        index = r.did;
        if (r.did !== 'none') { fs.writeFileSync(indexFile, r.text, 'utf8'); }
    }

    let marks = 0;
    for (const c of store.candidates) {
        const before = JSON.stringify([c.topics, c.pages ?? null]);
        const next: string[] = [];
        for (const t of c.topics ?? []) {
            const v = same(t, from) ? to : t;
            if (!next.some(x => same(x, v))) { next.push(v); }
        }
        c.topics = next;
        if (Array.isArray(c.pages)) { c.pages = c.pages.map(p => movePage(p, root, from, to)); }
        if (JSON.stringify([c.topics, c.pages ?? null]) !== before) { marks++; }
    }
    if (marks) { store.save(); }

    const merged = folder === 'merged' || index === 'merged' || (!caseOnly && topics.some(t => same(t, to)));
    const logged = appendLog(root, `${merged ? 'merge' : 'rename'} | ${from} → ${to}`,
        `${folder === 'none' ? 'No folder' : `${moved.length} entr(ies) moved`}; index: ${index}; ${marks} mark(s) re-filed.`);
    return { ok: true, from, to, merged, folder, moved, index, marks, logged, lint: lintWiki(root) };
}

export function registerWikiCategoryOps(bridge: BridgeRegistry, deps: Pick<WikiDeps, 'root' | 'store'>): void {
    bridge.register([{
        op: 'wiki.category.rename',
        describe: 'U-125 — rename a wiki category, or merge it into one that already exists, in all three places it lives: the folder under the wiki root, its `## <Category>` section in index.md, and the topics (and page paths) of every mark in the pool. A target that exists in any spelling is a MERGE: every entry moves into its folder, but a name present in both refuses the whole move — with the list — before anything leaves, and the two index sections become one sorted list. Appends a line to log.md and answers with wiki.lint. args: from, to',
        handler: (args) => {
            const r = renameWikiCategory(deps.root(), deps.store(), argStr(args, 'from'), argStr(args, 'to'));
            need(r.ok, r.ok ? '' : r.error);
            return r;
        }
    }]);
}
