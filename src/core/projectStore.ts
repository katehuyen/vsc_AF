import * as fs from 'fs';
import { expandDeep, PortableRoot, tokenizeDeep } from './portablePaths';
import {
    coerceLinks, coerceProject, coerceProjects, coerceStatus, emptyLinks, findProject,
    folderNameFor, migrateLegacyProjects, newProjectId, Project, ProjectLinks,
    ProjectSessionRef, ProjectStatus, pruneLinks, renameProject, Resolution,
    resolveSessionProject, sameName, setSessionProject
} from './projects';

/**
 * Where projects live on this machine.
 *
 * The store holds two things and deliberately not a third: the **registry**
 * (what projects exist and what they are) and the **link table** (which
 * sessions the user explicitly put where). Everything a human writes about a
 * project — its charter, plan, decisions, notes — lives in the project's own
 * folder, because that is the copy that survives losing this file, travels in
 * git and can be read in Obsidian without Agent Farm running at all.
 *
 * So this file is a rebuildable index, with one exception that has to be said
 * out loud: **the link table cannot be rebuilt.** "Which sessions did I put on
 * this project" is a decision, not a derivation — nothing on disk implies it.
 * That is why saving is atomic (write a temp file, then rename): a half-written
 * store after a crash would lose assignments the user cannot get back, and a
 * rename either happens or does not.
 *
 * Paths are tokenised on save through the same portable roots the other stores
 * use, so a project folder under the home directory survives moving machines.
 * A folder on a fixed volume simply stays absolute, which is already portable.
 *
 * Pure node (fs only) — no vscode — so the whole lifecycle is unit-testable.
 */

const STORE_VERSION = 1;

interface StoreFile {
    version?: number;
    projects?: unknown;
    links?: unknown;
    /** the one-time import from the old agentFarm.projects setting has run */
    migrated?: boolean;
}

/** Everything a new project may be given; `name` is the only requirement. */
export type ProjectInput = { name: string } &
    Partial<Omit<Project, 'id' | 'name' | 'createdAt' | 'updatedAt'>>;

/** Any field may be patched except the two that must never move. */
export type ProjectPatch = Partial<Omit<Project, 'id' | 'createdAt'>>;

export interface ProjectResult {
    project?: Project;
    error?: string;
}

export class ProjectStore {
    private projects: Project[] = [];
    private linkTable: ProjectLinks = emptyLinks();
    private migrated = false;
    /** mtime of the file as of our last read or write — see syncFromDisk. */
    private lastMtimeMs = 0;

    constructor(
        private file: string,
        private portableRoots: () => PortableRoot[] = () => []
    ) { }

    // ---- persistence ----

    private statMtime(): number {
        try { return fs.statSync(this.file).mtimeMs; } catch { return 0; }
    }

    /**
     * Pick up another window's writes before making one of our own.
     *
     * Two VS Code windows each hold their own store in memory. Without this, a
     * second window that has been open since before a project was created would
     * write its stale copy back over it — and the casualty is the link table,
     * the one thing in this file that cannot be rebuilt from anything on disk.
     * A stat per MUTATION is cheap; reads deliberately do not sync, because
     * `resolve()` runs once per session in a rollup and a stat per call there
     * would be hundreds of syscalls to answer one screen.
     *
     * Honest limit: two windows writing inside the same millisecond can leave
     * mtime unchanged and slip past this. That is not the failure mode this
     * guards — the real one is a window that has been open for minutes with a
     * stale copy — and closing it properly would mean a lease and a watcher for
     * a race nobody has ever hit.
     */
    private syncFromDisk(): void {
        if (this.statMtime() !== this.lastMtimeMs) { this.load(); }
    }

    load(): void {
        try {
            const raw = expandDeep(
                JSON.parse(fs.readFileSync(this.file, 'utf8')) as StoreFile,
                this.portableRoots());
            this.projects = coerceProjects(raw.projects);
            this.linkTable = coerceLinks(raw.links);
            this.migrated = raw.migrated === true;
            // a link to a project the file no longer holds is dead weight
            this.linkTable = pruneLinks(this.linkTable, this.projects);
        } catch {
            // first run, or a file we cannot read — start clean rather than
            // half-loaded; a partial registry would resolve sessions wrongly
            this.projects = [];
            this.linkTable = emptyLinks();
            this.migrated = false;
        }
        this.lastMtimeMs = this.statMtime();
    }

    /**
     * Atomic save. `fs.renameSync` over an existing file is atomic on both
     * Windows and POSIX, so a reader never sees a truncated store and a crash
     * mid-write leaves the previous good copy in place.
     */
    save(): void {
        const payload: StoreFile = {
            version: STORE_VERSION,
            projects: this.projects,
            links: this.linkTable,
            migrated: this.migrated
        };
        const body = JSON.stringify(tokenizeDeep(payload, this.portableRoots()), null, 2);
        const tmp = `${this.file}.tmp`;
        try {
            fs.writeFileSync(tmp, body, 'utf8');
            fs.renameSync(tmp, this.file);
        } catch {
            // the rename failed (or the temp write did) — fall back to a direct
            // write so a save is never silently skipped, then clean up
            try { fs.writeFileSync(this.file, body, 'utf8'); } catch { /* best effort */ }
            try { if (fs.existsSync(tmp)) { fs.unlinkSync(tmp); } } catch { /* best effort */ }
        }
        // our own write must not look like somebody else's on the next mutation
        this.lastMtimeMs = this.statMtime();
    }

    // ---- reading ----

    /** A copy: callers get a list they can sort and filter without reaching
     *  into the store's own state. */
    all(): Project[] {
        return [...this.projects];
    }

    /** By id or by name — every op that names a project accepts either, so a
     *  bridge call never has to look an id up first. */
    get(key: string): Project | undefined {
        return findProject(this.projects, key);
    }

    links(): ProjectLinks {
        return this.linkTable;
    }

    /** Direct children of a project (one level — see Project.parentId). */
    childrenOf(id: string): Project[] {
        return this.projects.filter(p => p.parentId === id);
    }

    resolve(session: ProjectSessionRef): Resolution {
        return resolveSessionProject(session, this.projects, this.linkTable);
    }

    // ---- writing ----

    private validateName(name: string, exceptId?: string): string | undefined {
        const n = String(name ?? '').trim();
        if (!n) { return 'a project needs a name'; }
        if (this.projects.some(p => p.id !== exceptId && sameName(p.name, n))) {
            return `"${n}" is already taken`;
        }
        if (!folderNameFor(n)) { return 'that name has no usable characters for a folder'; }
        return undefined;
    }

    /** A parent must exist and must not itself have one: the model allows a
     *  project and its components, not an unbounded tree nobody prunes. */
    private validateParent(parentId: string | undefined, selfId?: string): string | undefined {
        if (!parentId) { return undefined; }
        if (parentId === selfId) { return 'a project cannot be its own parent'; }
        const parent = this.projects.find(p => p.id === parentId);
        if (!parent) { return `no project with id ${parentId}`; }
        if (parent.parentId) { return 'sub-projects go one level deep only'; }
        if (selfId && this.childrenOf(selfId).length) {
            return 'a project that has sub-projects cannot become one';
        }
        return undefined;
    }

    create(input: ProjectInput, now = Date.now()): ProjectResult {
        this.syncFromDisk();
        const nameError = this.validateName(input.name);
        if (nameError) { return { error: nameError }; }
        const parentError = this.validateParent(input.parentId);
        if (parentError) { return { error: parentError }; }

        const { name, ...rest } = input;
        // built, then coerced: a bridge call can hand us any shape, and the
        // registry must only ever hold fields the model actually declares
        const project = coerceProject({
            ...rest,
            id: newProjectId(this.projects.map(p => p.id)),
            name: name.trim(),
            status: input.status ?? 'active',
            createdAt: now,
            updatedAt: now
        }, now);
        if (!project) { return { error: 'could not build a project from that input' }; }
        this.projects.push(project);
        this.save();
        return { project };
    }

    /**
     * Patch a project. `name` goes through the same uniqueness check a rename
     * does — a form that submits every field must not be able to smuggle a
     * duplicate name past the validation a dedicated rename would apply.
     */
    update(id: string, patch: ProjectPatch, now = Date.now()): ProjectResult {
        this.syncFromDisk();
        const current = this.projects.find(p => p.id === id);
        if (!current) { return { error: `no project with id ${id}` }; }

        if (patch.name !== undefined && !sameName(patch.name, current.name)) {
            const res = renameProject(this.projects, id, patch.name, now);
            if (res.error) { return { error: res.error }; }
            this.projects = res.projects;
        }
        if (patch.parentId !== undefined) {
            const parentError = this.validateParent(patch.parentId || undefined, id);
            if (parentError) { return { error: parentError }; }
        }

        const index = this.projects.findIndex(p => p.id === id);
        const merged: Record<string, unknown> = { ...this.projects[index], updatedAt: now };
        for (const [key, value] of Object.entries(patch)) {
            // id and createdAt never move; name was settled above
            if (key === 'id' || key === 'createdAt' || key === 'name') { continue; }
            // status is required — it can be CHANGED but never cleared away,
            // or an edit form submitting a blank field would leave a project
            // with no status at all
            if (key === 'status') {
                if (value) { merged.status = coerceStatus(value); }
                continue;
            }
            // for everything else an explicit empty clears the field, which is
            // how the UI says "no folder / no parent / no budget" without
            // needing a separate command per field
            if (value === undefined || value === null || value === '') {
                delete merged[key];
            } else {
                merged[key] = value;
            }
        }
        if (patch.name !== undefined && String(patch.name).trim()) {
            merged.name = String(patch.name).trim();
        }
        const clean = coerceProject(merged, now);
        if (!clean) { return { error: 'that patch would leave an unusable project' }; }
        this.projects[index] = clean;
        this.save();
        return { project: clean };
    }

    setStatus(id: string, status: ProjectStatus, now = Date.now()): ProjectResult {
        const patch: ProjectPatch = { status };
        // closing a project stamps when — "when did this end" is a question
        // the timeline asks and nothing else records
        if (status === 'done' || status === 'archived') { patch.closedAt = now; }
        return this.update(id, patch, now);
    }

    /**
     * Forget a project. Its FOLDER is never touched: those are the user's own
     * files, and a delete button in a project list must not be able to remove
     * a year of notes. Sub-projects are orphaned rather than deleted for the
     * same reason — removing a parent must not take its children with it.
     */
    remove(id: string, now = Date.now()): boolean {
        this.syncFromDisk();
        if (!this.projects.some(p => p.id === id)) { return false; }
        this.projects = this.projects
            .filter(p => p.id !== id)
            .map(p => p.parentId === id ? { ...p, parentId: undefined, updatedAt: now } : p);
        this.linkTable = pruneLinks(this.linkTable, this.projects);
        this.save();
        return true;
    }

    // ---- session membership ----

    /**
     * Attach, detach or transfer one session.
     *   a project id or name → attached (transfer is the same call)
     *   `''`                 → explicitly no project; the rules may not reclaim it
     *   undefined            → forget the decision; the rules speak again
     */
    assignSession(sessionId: string, value: string | undefined): boolean {
        this.syncFromDisk();
        const id = String(sessionId ?? '').trim();
        if (!id) { return false; }
        let resolved: string | undefined;
        if (value === undefined) {
            resolved = undefined;
        } else if (value.trim() === '') {
            resolved = '';
        } else {
            const project = this.get(value);
            if (!project) { return false; }
            resolved = project.id;
        }
        const had = id in this.linkTable.sessions;
        const before = this.linkTable.sessions[id];
        const next = setSessionProject(this.linkTable, id, resolved);
        // already exactly where it was asked to be — success, but no write
        if (had === (id in next.sessions) && before === next.sessions[id]) { return true; }
        this.linkTable = next;
        this.save();
        return true;
    }

    /** The same, for a selection. One save for the whole batch: assigning
     *  ninety sessions must not write the store ninety times. Returns how many
     *  rows actually changed — and 0 if `value` names a project that does not
     *  exist, so callers validate the target before offering the action. */
    assignSessions(sessionIds: string[], value: string | undefined): number {
        this.syncFromDisk();
        let resolved: string | undefined;
        if (value === undefined) {
            resolved = undefined;
        } else if (value.trim() === '') {
            resolved = '';
        } else {
            const project = this.get(value);
            if (!project) { return 0; }
            resolved = project.id;
        }
        let changed = 0;
        let next = this.linkTable;
        for (const raw of sessionIds) {
            const id = String(raw ?? '').trim();
            if (!id) { continue; }
            const had = id in next.sessions;
            const before = next.sessions[id];
            next = setSessionProject(next, id, resolved);
            const has = id in next.sessions;
            if (had !== has || before !== next.sessions[id]) { changed++; }
        }
        if (changed) {
            this.linkTable = next;
            this.save();
        }
        return changed;
    }

    // ---- migration · rebuild ----

    /**
     * Import the old `agentFarm.projects` setting, once.
     *
     * The marker is set as soon as the setting is seen to HOLD something — not
     * when rows are actually added. Two failure modes meet here and only this
     * rule avoids both:
     *
     *  - Mark it whenever the import runs, and an empty read marks us done. But
     *    an empty read is not proof of an empty setting: VS Code Settings Sync
     *    can land AFTER activation, so the first window of a fresh machine may
     *    genuinely see nothing and would then bury the user's projects forever.
     *  - Mark it only when rows were added, and deleting a migrated project
     *    brings it back on the next window — an import that keeps re-importing
     *    is not a migration, it is a haunting.
     *
     * Seeing content is the honest signal for "there was something here and we
     * have now dealt with it", so that is what the marker records.
     */
    migrateLegacy(legacyRaw: unknown, now = Date.now()): number {
        this.syncFromDisk();
        if (this.migrated) { return 0; }
        const candidates = migrateLegacyProjects(legacyRaw, now);
        if (!candidates.length) { return 0; }   // nothing there yet — look again next window
        this.migrated = true;
        const imported = candidates.filter(p => !this.projects.some(x => sameName(x.name, p.name)));
        this.projects.push(...imported);
        this.save();
        return imported.length;
    }

    /** Has the one-time import already happened? */
    get hasMigrated(): boolean {
        return this.migrated;
    }

    /**
     * Replace the registry wholesale — what a folder rescan produces. The link
     * table is kept and pruned, never rebuilt: it is the one thing scanning
     * cannot recover, so a rescan must not be able to throw it away.
     */
    replaceAll(projects: Project[], now = Date.now()): void {
        this.syncFromDisk();
        this.projects = coerceProjects(projects, now);
        this.linkTable = pruneLinks(this.linkTable, this.projects);
        this.save();
    }
}
