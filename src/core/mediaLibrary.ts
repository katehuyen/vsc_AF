/**
 * X-417 — THE MEDIA LIBRARY: where a produced file lives in the user's local Airtable.
 *
 * Every base (an engine instance under the module's databaseRoots) has its own
 * media folder under a media root: `<root>\media_<base>\<type>\<stage>\`. The
 * stages, in the user's words (2026-09-26):
 *   source — input material · raw — unclassified but kept (nothing is thrown away)
 *   semi — half done · final — truly succeeded · asset — the reusable treasure
 * and `media_<base>\all_in\` — the user's waiting area for files nobody has
 * processed yet. Agents never file into it; it is refused here by name.
 * The stage is written into the record's `workflow.stage` too (_REF/agent-area.md §E).
 *
 * Pure except `fileInto`, which moves one file and never overwrites.
 */
import * as fs from 'fs';
import * as path from 'path';
import { guessMediaType } from '../mcp/airtable/media';

export const LIBRARY_STAGES = ['source', 'raw', 'semi', 'final', 'asset'] as const;
export type LibraryStage = typeof LIBRARY_STAGES[number];
export const LIBRARY_INBOX = 'all_in';
export type LibraryType = 'image' | 'video' | 'audio';

export const STAGE_MEANING: Readonly<Record<LibraryStage, string>> = {
    source: 'input material',
    raw: 'unclassified but kept — nothing is thrown away',
    semi: 'half done',
    final: 'truly succeeded',
    asset: 'the reusable treasure — reached only by an explicit promotion'
};

/** What a file is to the run that made it — the key its default stage is read by. */
export const MEDIA_ROLES = ['input', 'candidate', 'intermediate', 'failed', 'rejected', 'final', 'unknown'] as const;
export type MediaRole = typeof MEDIA_ROLES[number];

/** The user's default mapping (decision 2026-09-26). No role reaches `asset`: that is a promotion. */
export const DEFAULT_STAGE: Readonly<Record<MediaRole, LibraryStage>> = {
    input: 'source', candidate: 'semi', intermediate: 'semi',
    failed: 'raw', rejected: 'raw', final: 'final', unknown: 'raw'
};

/** The roles a workflow can map to its own stages (flex points library.stages.*); a candidate follows `intermediate`. */
export const MAPPED_ROLES = ['input', 'intermediate', 'failed', 'rejected', 'final'] as const;
export type MappedRole = typeof MAPPED_ROLES[number];
export type StageMap = Partial<Record<MappedRole, LibraryStage>>;

/** The stage a workflow's own mapping gives this role — undefined when it states none. */
export function mappedStage(map: StageMap | undefined, role: unknown): LibraryStage | undefined {
    const r = String(role ?? '');
    return map?.[(r === 'candidate' ? 'intermediate' : r) as MappedRole];
}

export const isStage = (s: unknown): s is LibraryStage => (LIBRARY_STAGES as readonly string[]).includes(String(s));
export const isRole = (r: unknown): r is MediaRole => (MEDIA_ROLES as readonly string[]).includes(String(r));

/** image · video · audio by extension (the engine's own table); anything else has no place in the library. */
export function libraryType(file: string): LibraryType | undefined {
    const t = guessMediaType(path.extname(String(file || '')).slice(1));
    return t === 'image' || t === 'video' || t === 'audio' ? t : undefined;
}

/** A stage asked for by name, refused with its reason — the waiting area included. */
export function stageRefusal(stage: unknown): string {
    const s = String(stage ?? '').trim();
    if (s.toLowerCase() === LIBRARY_INBOX) {
        return `${LIBRARY_INBOX} is the user's waiting area for unprocessed files — agents never file into it; pick ${LIBRARY_STAGES.join(' | ')}`;
    }
    return isStage(s) ? '' : `there is no stage "${s}" — ${LIBRARY_STAGES.join(' | ')}`;
}

/** The stage a file goes to: one asked for by name wins, else its role's default. */
export function stageFor(role: unknown, asked?: unknown): { stage: LibraryStage; from: string } | { error: string } {
    if (asked !== undefined && String(asked).trim() !== '') {
        const no = stageRefusal(asked);
        return no ? { error: no } : { stage: String(asked).trim() as LibraryStage, from: 'asked by name' };
    }
    const r = String(role ?? '').trim() || 'unknown';
    if (!isRole(r)) { return { error: `there is no role "${r}" — ${MEDIA_ROLES.join(' | ')}` }; }
    return { stage: DEFAULT_STAGE[r], from: `the default for a ${r} file` };
}

/** A base name is a folder name: `media_<base>` sits under the root. */
export function baseRefusal(base: unknown): string {
    const b = String(base ?? '').trim();
    if (!b) { return 'no base — name the Airtable database (an engine instance), or set the module\'s default'; }
    return /[\\/:*?"<>|]/.test(b) || b === '.' || b === '..' ? `"${b}" is not a base name (a folder name)` : '';
}

/** The media root holding this base: the first one that already has `media_<base>`, else the first root. */
export function libraryRoot(roots: readonly string[], base: string, exists: (p: string) => boolean): string | undefined {
    const list = roots.map(r => String(r || '').trim()).filter(Boolean);
    return list.find(r => exists(path.join(r, 'media_' + base))) ?? list[0];
}

export const libraryDir = (root: string, base: string, type: LibraryType, stage: LibraryStage): string =>
    path.join(root, 'media_' + base, type, stage);

const samePath = (a: string, b: string): boolean => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/** Its own name in the stage folder; a name already taken gets -2, -3… — nothing is ever overwritten. */
export function libraryTarget(dir: string, file: string, exists: (p: string) => boolean): string {
    const name = path.basename(file);
    const first = path.join(dir, name);
    if (samePath(first, file) || !exists(first)) { return first; }
    const ext = path.extname(name);
    const stem = name.slice(0, name.length - ext.length);
    for (let i = 2; ; i++) {
        const f = path.join(dir, `${stem}-${i}${ext}`);
        if (!exists(f)) { return f; }
    }
}

export interface LibraryPlanArgs {
    roots: readonly string[];
    base: string;
    file: string;
    stage?: unknown;
    role?: unknown;
    exists: (p: string) => boolean;
}
export interface LibraryPlan {
    root: string; base: string; type: LibraryType; stage: LibraryStage;
    dir: string; target: string; inPlace: boolean;
    /** one line per decision, in words */
    why: string[];
}

/** Where one file goes, and why — or the reason it cannot go. */
export function planLibrary(a: LibraryPlanArgs): LibraryPlan | { error: string } {
    const base = String(a.base ?? '').trim();
    const noBase = baseRefusal(base);
    if (noBase) { return { error: noBase }; }
    const type = libraryType(a.file);
    if (!type) { return { error: `${path.basename(a.file)} is not image, video or audio — the library holds media only` }; }
    const st = stageFor(a.role, a.stage);
    if ('error' in st) { return st; }
    const root = libraryRoot(a.roots, base, a.exists);
    if (!root) { return { error: 'no media root — add one on the Airtable page (mediaRoots)' }; }
    const dir = libraryDir(root, base, type, st.stage);
    const target = libraryTarget(dir, a.file, a.exists);
    const inPlace = samePath(target, a.file);
    return {
        root, base, type, stage: st.stage, dir, target, inPlace,
        why: [
            `base ${base} → ${path.join(root, 'media_' + base)}`,
            `type ${type} — from the extension`,
            `stage ${st.stage} (${STAGE_MEANING[st.stage]}) — ${st.from}`,
            inPlace ? 'already in place' : path.basename(target) === path.basename(a.file) ? 'its own name' : `renamed ${path.basename(target)} — the name was taken`
        ]
    };
}

/** The library at a glance: its roots, the bases that have a folder, the stages and the default mapping. */
export function libraryInfo(roots: readonly string[], defaultBase: string, list: (dir: string) => string[]): Record<string, unknown> {
    const bases = roots.flatMap(root => {
        let names: string[] = [];
        try { names = list(root); } catch { /* a root that is not there lists nothing */ }
        return names.filter(n => /^media_./.test(n)).map(n => ({ base: n.slice('media_'.length), dir: path.join(root, n) }));
    });
    return {
        roots, defaultBase, bases,
        layout: '<root>\\media_<base>\\<image|video|audio>\\<stage>\\',
        stages: LIBRARY_STAGES, meanings: STAGE_MEANING,
        inbox: `${LIBRARY_INBOX} — the user's waiting area for unprocessed files; agents never file into it`,
        roles: MEDIA_ROLES, defaultStages: DEFAULT_STAGE,
        recordField: 'workflow.stage'
    };
}

/** Move the file to the plan's target (a copy across drives, then the source removed). Returns the path it now has. */
export function fileInto(file: string, plan: LibraryPlan): string {
    if (plan.inPlace) { return plan.target; }
    if (fs.existsSync(plan.target)) { throw new Error(`${plan.target} appeared meanwhile — nothing was overwritten`); }
    fs.mkdirSync(plan.dir, { recursive: true });
    try {
        fs.renameSync(file, plan.target);
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EXDEV') { throw e; }
        fs.copyFileSync(file, plan.target, fs.constants.COPYFILE_EXCL);
        fs.unlinkSync(file);
    }
    return plan.target;
}
