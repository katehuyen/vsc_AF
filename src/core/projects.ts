/**
 * Projects — the umbrella entity.
 *
 * A project used to be a name over a set of agents: enough to ask "what did
 * this customer cost", and nothing else. It is now the thing everything else
 * hangs off — a folder of its own, owners, a plan, decisions, a history, and
 * a future — while owning almost no data itself. Sessions, tasks, missions,
 * notices, queue items, commits and files all keep living where they already
 * live; the project is the **join** over them.
 *
 * Two rules carry the whole design.
 *
 * **1. A session belongs to exactly one project; an agent belongs to as many
 * as it works on.** Cost has to be addable, so it hangs off the SESSION — the
 * atom that already has a working directory, a time and a dollar figure. The
 * old constraint ("an agent belongs to at most one project") kept the
 * arithmetic honest by breaking the truth: one agent really does work on
 * several projects. Membership is resolved in a fixed order, first match wins,
 * so every session still lands in exactly one bucket:
 *
 *     explicit assignment → explicit NONE → path (longest root wins)
 *                         → agent rule    → unassigned
 *
 * The second step is not decoration. Without a way to say "this session is
 * deliberately in no project", the path/agent rules would silently reclaim
 * anything the user detached, and the user would never learn why.
 *
 * **2. The id is immutable, the name is not.** Every link hangs off `id`, so
 * renaming a project — in the extension or by renaming its folder in Obsidian —
 * costs nothing and breaks nothing.
 *
 * Pure: no vscode, no fs. The store, the folder skeleton and the UI are
 * elsewhere; everything here is a function of its arguments so the rules can
 * be tested without a farm.
 */

// ---------------------------------------------------------------------------
// the entity
// ---------------------------------------------------------------------------

/** Where a project is in its life. A list without this becomes a graveyard:
 *  finished work stays at the top forever and nobody dares delete it. */
export type ProjectStatus = 'planned' | 'active' | 'paused' | 'done' | 'archived';
export const PROJECT_STATUSES: ProjectStatus[] =
    ['planned', 'active', 'paused', 'done', 'archived'];

/** Statuses that mean "this is behind us" — collapsed by default in the UI. */
export const CLOSED_STATUSES: ProjectStatus[] = ['done', 'archived'];

export type ProjectKind =
    | 'product' | 'customer' | 'internal' | 'research' | 'personal' | 'ops';
export const PROJECT_KINDS: ProjectKind[] =
    ['product', 'customer', 'internal', 'research', 'personal', 'ops'];

/**
 * Who the project is for and with. "Owner" is not one word: the person who
 * DECIDES, the one who PAYS, the one who DOES the work and the one you ASK are
 * four different questions, and six months later nobody remembers which was
 * which unless it was written down as a role.
 */
export type PersonRole =
    | 'owner' | 'client' | 'sponsor' | 'contributor' | 'contact' | 'vendor';
export const PERSON_ROLES: PersonRole[] =
    ['owner', 'client', 'sponsor', 'contributor', 'contact', 'vendor'];

export type PersonKind = 'person' | 'company' | 'self';
export const PERSON_KINDS: PersonKind[] = ['person', 'company', 'self'];

export interface ProjectPerson {
    name: string;
    role: PersonRole;
    kind: PersonKind;
    /** free text — email, phone, whatever the user keeps */
    contact?: string;
    /** vault wikilink target, so people join the note graph: `[[Company X]]` */
    link?: string;
    note?: string;
}

/** Rule-based membership. Paths are not here on purpose: a project's path
 *  roots ARE its `folder` and `repos` — one place to state them, one place
 *  to get them wrong. */
export interface ProjectMatch {
    /** agent names or ids whose sessions fall to this project by default */
    agents?: string[];
}

export interface Project {
    /** `prj_<8>` — IMMUTABLE. Every link in the system hangs off this. */
    id: string;
    /** display name — the user's, freely chosen, renameable */
    name: string;
    status: ProjectStatus;
    kind?: ProjectKind;
    /** one visual identity carried by every surface, so a project is
     *  recognisable at a glance in a table of forty rows */
    color?: string;
    icon?: string;

    /** docs home. Stored TOKENISED (portablePaths) by the store layer; empty
     *  or missing means "not configured yet", which the UI shows as a warning
     *  rather than inventing a folder. */
    folder?: string;
    /** code roots — separate from `folder` because docs and code are different
     *  places and conflating them (the old `paths`) breaks both */
    repos?: string[];
    /** one level of sub-project (a product with two apps). Deeper nesting is a
     *  tree nobody maintains. */
    parentId?: string;

    people?: ProjectPerson[];
    match?: ProjectMatch;

    startedAt?: number;
    dueAt?: number;
    closedAt?: number;
    /** daily ceiling */
    budgetUSD?: number;
    /** whole-project ceiling — a daily cap says nothing on fixed-price work */
    budgetTotalUSD?: number;
    /** one line; the long form lives in the project's own charter file */
    summary?: string;
    tags?: string[];

    createdAt: number;
    updatedAt: number;
}

/**
 * The explicit side of membership.
 *
 * `sessions[id]` holds a project id — or the EMPTY STRING, which means "the
 * user said this session belongs to no project". That distinction is the whole
 * reason this is a map and not a set: `undefined` = nobody decided, so the
 * rules may speak; `''` = somebody decided, so they may not.
 */
export interface ProjectLinks {
    sessions: Record<string, string>;
}

export function emptyLinks(): ProjectLinks {
    return { sessions: {} };
}

/** The bucket everything unclaimed falls into. Not a project — a leftover, and
 *  named so the rows still add up to the fleet total. */
export const UNASSIGNED_ID = '(unassigned)';

// ---------------------------------------------------------------------------
// identity helpers
// ---------------------------------------------------------------------------

/** A fresh id that no existing project holds. Local and short — this never
 *  leaves the machine, so a uuid would be ceremony. */
export function newProjectId(existing: Iterable<string> = [], rand: () => number = Math.random): string {
    const taken = new Set(existing);
    const chars = 'abcdefghijkmnopqrstuvwxyz23456789';   // no l/1/0/o — ids get read aloud
    for (let attempt = 0; attempt < 1000; attempt++) {
        let s = '';
        for (let i = 0; i < 8; i++) { s += chars.charAt(Math.floor(rand() * chars.length)); }
        const id = `prj_${s}`;
        if (!taken.has(id)) { return id; }
    }
    return `prj_${Date.now().toString(36)}`;
}

/**
 * The folder name a project name asks for.
 *
 * No numeric prefix and no naming scheme: whatever the user typed is what the
 * folder is called. Only the characters Windows genuinely refuses are removed,
 * and non-ASCII letters are left ALONE — a Turkish, German or Arabic project
 * name must survive intact or the folder stops matching its own project.
 */
export function folderNameFor(name: string): string {
    const cleaned = String(name ?? '')
        .replace(/[\\/:*?"<>|]/g, ' ')     // illegal on Windows
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x1f]/g, ' ')  // control characters
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/, '');            // Windows drops trailing dots/spaces
    return cleaned;
}

/** Two names are "the same name" if they differ only in case or padding. */
export function sameName(a: string, b: string): boolean {
    return String(a ?? '').trim().toLocaleLowerCase() === String(b ?? '').trim().toLocaleLowerCase();
}

export function projectById(projects: Project[], id: string): Project | undefined {
    return projects.find(p => p.id === id);
}

export function projectByName(projects: Project[], name: string): Project | undefined {
    return projects.find(p => sameName(p.name, name));
}

/** Accept an id OR a name — every op that takes a project takes either, so an
 *  agent writing a bridge call never has to look an id up first. */
export function findProject(projects: Project[], key: string): Project | undefined {
    const k = String(key ?? '').trim();
    if (!k) { return undefined; }
    return projectById(projects, k) ?? projectByName(projects, k);
}

// ---------------------------------------------------------------------------
// coercion — anything on disk may have been hand-edited
// ---------------------------------------------------------------------------

function strList(v: unknown): string[] {
    return Array.isArray(v)
        ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim())
        : [];
}

function optStr(v: unknown): string | undefined {
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function optNum(v: unknown): number | undefined {
    return typeof v === 'number' && isFinite(v) && v > 0 ? v : undefined;
}

export function coerceStatus(v: unknown): ProjectStatus {
    return PROJECT_STATUSES.includes(v as ProjectStatus) ? v as ProjectStatus : 'active';
}

export function coercePerson(raw: unknown): ProjectPerson | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const o = raw as Record<string, unknown>;
    const name = optStr(o.name);
    if (!name) { return undefined; }
    const person: ProjectPerson = {
        name,
        role: PERSON_ROLES.includes(o.role as PersonRole) ? o.role as PersonRole : 'contact',
        kind: PERSON_KINDS.includes(o.kind as PersonKind) ? o.kind as PersonKind : 'person'
    };
    const contact = optStr(o.contact); if (contact) { person.contact = contact; }
    const link = optStr(o.link); if (link) { person.link = link; }
    const note = optStr(o.note); if (note) { person.note = note; }
    return person;
}

/** One stored project → a usable one, or undefined if it is not even a project
 *  (no id, no name). Never throws: a corrupt row is dropped, not fatal. */
export function coerceProject(raw: unknown, now = Date.now()): Project | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const o = raw as Record<string, unknown>;
    const id = optStr(o.id);
    const name = optStr(o.name);
    if (!id || !name) { return undefined; }

    const p: Project = {
        id, name,
        status: coerceStatus(o.status),
        createdAt: typeof o.createdAt === 'number' ? o.createdAt : now,
        updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : now
    };
    if (PROJECT_KINDS.includes(o.kind as ProjectKind)) { p.kind = o.kind as ProjectKind; }
    const color = optStr(o.color); if (color) { p.color = color; }
    const icon = optStr(o.icon); if (icon) { p.icon = icon; }
    const folder = optStr(o.folder); if (folder) { p.folder = folder; }
    const repos = strList(o.repos); if (repos.length) { p.repos = repos; }
    const parentId = optStr(o.parentId); if (parentId && parentId !== id) { p.parentId = parentId; }

    const people = Array.isArray(o.people)
        ? o.people.map(x => coercePerson(x)).filter((x): x is ProjectPerson => !!x)
        : [];
    if (people.length) { p.people = people; }

    const agents = strList((o.match as Record<string, unknown> | undefined)?.agents);
    if (agents.length) { p.match = { agents }; }

    if (typeof o.startedAt === 'number') { p.startedAt = o.startedAt; }
    if (typeof o.dueAt === 'number') { p.dueAt = o.dueAt; }
    if (typeof o.closedAt === 'number') { p.closedAt = o.closedAt; }
    p.budgetUSD = optNum(o.budgetUSD);
    p.budgetTotalUSD = optNum(o.budgetTotalUSD);
    if (p.budgetUSD === undefined) { delete p.budgetUSD; }
    if (p.budgetTotalUSD === undefined) { delete p.budgetTotalUSD; }
    const summary = optStr(o.summary); if (summary) { p.summary = summary; }
    const tags = strList(o.tags); if (tags.length) { p.tags = tags; }
    return p;
}

/** A stored list → a clean one. Duplicate ids and duplicate names are dropped
 *  (first wins): both would make "which project is this" ambiguous forever. */
export function coerceProjects(raw: unknown, now = Date.now()): Project[] {
    if (!Array.isArray(raw)) { return []; }
    const out: Project[] = [];
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const item of raw) {
        const p = coerceProject(item, now);
        if (!p) { continue; }
        const nameKey = p.name.trim().toLocaleLowerCase();
        if (ids.has(p.id) || names.has(nameKey)) { continue; }
        ids.add(p.id);
        names.add(nameKey);
        out.push(p);
    }
    return out;
}

/** Stored links → clean links. Values stay verbatim, including `''` — the
 *  "explicitly no project" marker is data, not an empty field to tidy away. */
export function coerceLinks(raw: unknown): ProjectLinks {
    const links = emptyLinks();
    if (!raw || typeof raw !== 'object') { return links; }
    const sessions = (raw as { sessions?: unknown }).sessions;
    if (!sessions || typeof sessions !== 'object') { return links; }
    for (const [id, value] of Object.entries(sessions as Record<string, unknown>)) {
        if (!id.trim() || typeof value !== 'string') { continue; }
        links.sessions[id.trim()] = value.trim();
    }
    return links;
}

// ---------------------------------------------------------------------------
// membership
// ---------------------------------------------------------------------------

export interface ProjectSessionRef {
    sessionId?: string;
    agentId?: string;
    agentName?: string;
    cwd?: string;
}

/** Why a session ended up where it did. The UI needs this: "you assigned this"
 *  and "it matched a folder" are different facts, and the backfill screen has
 *  to be able to explain every row it proposes. */
export type ResolutionVia = 'explicit' | 'explicit-none' | 'path' | 'agent' | 'none';

export interface Resolution {
    /** undefined = no project (unassigned) */
    projectId?: string;
    via: ResolutionVia;
    /** for `via:'path'` — the root that matched, so the UI can say which */
    matchedRoot?: string;
}

/** Lower-cased, slash-normalised, trailing slash removed — path comparison
 *  has to survive `D:\a\B` vs `d:/a/b/`. Mirrors util.normPath deliberately
 *  (this module stays dependency-free so the service side can use it too). */
export function normalizePath(p: string): string {
    return String(p ?? '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/** The bucket for everything no project claims. A NAME, not an id — it is what
 *  the surfaces print; `UNASSIGNED_ID` is what the rollup keys on. */
export const UNASSIGNED = 'Unassigned';

/** Every path a project claims: its docs folder and its code roots. */
export function matchRoots(p: Project): string[] {
    const roots: string[] = [];
    if (p.folder) { roots.push(p.folder); }
    for (const r of p.repos ?? []) { roots.push(r); }
    return roots.map(normalizePath).filter(Boolean);
}

/**
 * Which project owns this session — the one function every surface goes
 * through. See the header for why the order is what it is.
 *
 * The path step takes the LONGEST matching root, not the first. With
 * `…/miropharm` and `…/miropharm/muvu_talkScribe/ZEN` both declared, first-match
 * hands every ZEN session to the wrong project — and the wrongness is invisible,
 * because both answers look plausible.
 */
export function resolveSessionProject(
    s: ProjectSessionRef, projects: Project[], links: ProjectLinks = emptyLinks()
): Resolution {
    // 1-2. what somebody decided, including the decision to belong nowhere
    const linked = s.sessionId ? links.sessions[s.sessionId] : undefined;
    if (linked !== undefined) {
        if (linked === '') { return { via: 'explicit-none' }; }
        // a link to a project that has since been deleted is stale, not a
        // decision — fall through rather than pointing at nothing
        if (projectById(projects, linked)) { return { projectId: linked, via: 'explicit' }; }
    }

    // 3. path — longest root wins
    const cwd = normalizePath(s.cwd ?? '');
    if (cwd) {
        let best: { id: string; root: string } | undefined;
        for (const p of projects) {
            for (const root of matchRoots(p)) {
                if (cwd !== root && !cwd.startsWith(root + '/')) { continue; }
                if (!best || root.length > best.root.length) { best = { id: p.id, root }; }
            }
        }
        if (best) { return { projectId: best.id, via: 'path', matchedRoot: best.root }; }
    }

    // 4. agent rule — declaration order
    const agentId = (s.agentId ?? '').toLocaleLowerCase();
    const agentName = (s.agentName ?? '').toLocaleLowerCase();
    if (agentId || agentName) {
        for (const p of projects) {
            for (const a of p.match?.agents ?? []) {
                const key = a.trim().toLocaleLowerCase();
                if (key && (key === agentId || key === agentName)) {
                    return { projectId: p.id, via: 'agent' };
                }
            }
        }
    }

    return { via: 'none' };
}

export interface AgentRef {
    id?: string;
    name?: string;
    dir?: string;
}

/**
 * Which project claims this AGENT.
 *
 * An agent is not a session, but the question is the same one and it must not
 * get a second answer: the surfaces that group by agent (the portfolio, the
 * dashboard's per-agent map) would otherwise disagree with the cost table
 * sitting next to them, and there is no way for a reader to tell which of the
 * two is lying. So it goes through `resolveSessionProject` with the agent's own
 * folder as the working directory — the same order, the same longest-root rule,
 * one implementation.
 */
export function agentProject(agent: AgentRef, projects: Project[]): Project | undefined {
    const r = resolveSessionProject(
        { agentId: agent.id, agentName: agent.name, cwd: agent.dir }, projects);
    return r.projectId ? projectById(projects, r.projectId) : undefined;
}

/** agent name → project name, for shipping one small map to a webview. */
export function agentProjectNames(agents: AgentRef[], projects: Project[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (const a of agents) {
        const p = agentProject(a, projects);
        if (p && a.name) { map[a.name] = p.name; }
    }
    return map;
}

/**
 * Attach, detach or transfer — one operation, because a session holds one
 * project and all three are just different values of it.
 *   a project id/name → attached (transfer is the same thing)
 *   `''`              → explicitly detached; rules may not reclaim it
 *   undefined         → forget the decision entirely; rules speak again
 */
export function setSessionProject(
    links: ProjectLinks, sessionId: string, value: string | undefined
): ProjectLinks {
    const id = String(sessionId ?? '').trim();
    if (!id) { return links; }
    const next: ProjectLinks = { sessions: { ...links.sessions } };
    if (value === undefined) { delete next.sessions[id]; } else { next.sessions[id] = value.trim(); }
    return next;
}

/** Drop links to projects that no longer exist. Called after a delete so the
 *  store does not quietly grow a tail of pointers to nothing. */
export function pruneLinks(links: ProjectLinks, projects: Project[]): ProjectLinks {
    const alive = new Set(projects.map(p => p.id));
    const next = emptyLinks();
    for (const [sid, pid] of Object.entries(links.sessions)) {
        if (pid === '' || alive.has(pid)) { next.sessions[sid] = pid; }
    }
    return next;
}

// ---------------------------------------------------------------------------
// rollup
// ---------------------------------------------------------------------------

export interface ProjectRollupSession extends ProjectSessionRef {
    cost: number;
    tokens: number;
    /** cost inside the caller's "today" window — budget comparisons use this */
    todayCost: number;
    lastTs: number;
}

export interface ProjectRollup {
    id: string;
    name: string;
    status?: ProjectStatus;
    sessions: number;
    cost: number;
    tokens: number;
    todayCost: number;
    /** agents seen working on it — evidence, not membership */
    agents: string[];
    lastTs: number;
    budgetUSD?: number;
    budgetTotalUSD?: number;
}

/**
 * Fold sessions into per-project totals.
 *
 * Every session lands in exactly ONE bucket — a project or `UNASSIGNED_ID` —
 * so the rows always sum to the fleet total. That property is the reason the
 * resolution order exists at all, and `test_projects.js` asserts it directly:
 * a figure you cannot add up is worse than no figure.
 */
export function rollupProjectSessions(
    projects: Project[],
    sessions: ProjectRollupSession[],
    links: ProjectLinks = emptyLinks()
): ProjectRollup[] {
    const buckets = new Map<string, ProjectRollup>();
    const bucket = (id: string): ProjectRollup => {
        const found = buckets.get(id);
        if (found) { return found; }
        const def = projectById(projects, id);
        const fresh: ProjectRollup = {
            id,
            name: def?.name ?? UNASSIGNED,
            sessions: 0, cost: 0, tokens: 0, todayCost: 0, agents: [], lastTs: 0
        };
        if (def) {
            fresh.status = def.status;
            if (def.budgetUSD) { fresh.budgetUSD = def.budgetUSD; }
            if (def.budgetTotalUSD) { fresh.budgetTotalUSD = def.budgetTotalUSD; }
        }
        buckets.set(id, fresh);
        return fresh;
    };
    // declared projects appear even with nothing on them — a project with no
    // sessions yet is a project, not an absence
    for (const p of projects) { bucket(p.id); }

    for (const s of sessions) {
        const b = bucket(resolveSessionProject(s, projects, links).projectId ?? UNASSIGNED_ID);
        b.sessions++;
        b.cost += s.cost;
        b.tokens += s.tokens;
        b.todayCost += s.todayCost;
        b.lastTs = Math.max(b.lastTs, s.lastTs);
        if (s.agentName && !b.agents.includes(s.agentName)) { b.agents.push(s.agentName); }
    }

    const out = [...buckets.values()];
    for (const b of out) {
        b.cost = Math.round(b.cost * 10000) / 10000;
        b.todayCost = Math.round(b.todayCost * 10000) / 10000;
    }
    // declaration order; the leftover bucket is never allowed to head the list
    return out.sort((a, b) => {
        if (a.id === UNASSIGNED_ID) { return 1; }
        if (b.id === UNASSIGNED_ID) { return -1; }
        return projects.findIndex(p => p.id === a.id) - projects.findIndex(p => p.id === b.id);
    });
}

// ---------------------------------------------------------------------------
// folder state · rename · migration
// ---------------------------------------------------------------------------

/** `unset` = no folder was ever chosen · `missing` = one was, and it is gone.
 *  The two get different words on screen because they need different answers:
 *  one asks you to pick a folder, the other asks whether you moved it. */
export type FolderState = 'ok' | 'unset' | 'missing';

export function folderState(p: Project, exists: (dir: string) => boolean): FolderState {
    if (!p.folder) { return 'unset'; }
    return exists(p.folder) ? 'ok' : 'missing';
}

export interface RenameResult {
    projects: Project[];
    error?: string;
}

/**
 * Rename a project. Only the name moves — `id` is immutable, so every session,
 * task, notice and queue item stays attached without being touched. The folder
 * is the caller's business (it needs fs); this settles whether the new name is
 * allowed at all.
 */
export function renameProject(
    projects: Project[], id: string, newName: string, now = Date.now()
): RenameResult {
    const name = String(newName ?? '').trim();
    if (!name) { return { projects, error: 'a project needs a name' }; }
    const target = projectById(projects, id);
    if (!target) { return { projects, error: `no project with id ${id}` }; }
    const clash = projects.find(p => p.id !== id && sameName(p.name, name));
    if (clash) { return { projects, error: `"${name}" is already taken` }; }
    if (!folderNameFor(name)) { return { projects, error: 'that name has no usable characters for a folder' }; }
    return {
        projects: projects.map(p => p.id === id ? { ...p, name, updatedAt: now } : p)
    };
}

/**
 * One project's figures, keyed by NAME rather than by id.
 *
 * The shape the cost surfaces read — the dashboard's project card, the sessions
 * tables' Project column, the web snapshot. It is not a second rollup: it is
 * `rollupProjectSessions` output flattened to what a display needs, and the one
 * place that builds it (`projectRollup` in extension.ts) is the only place
 * allowed to. Kept by name because that is what those surfaces group and filter
 * on, and the leftover bucket has a name (`UNASSIGNED`) and no id.
 */
export interface ProjectCostRow {
    name: string;
    agents: string[];
    sessions: number;
    cost: number;
    tokens: number;
    /** cost inside the caller's "today" window — budget comparisons use this */
    todayCost: number;
    budgetUSD?: number;
    note?: string;
    lastTs: number;
}
