import type { SkeletonEntry } from './projectDocs';
import {
    PERSON_KINDS, PERSON_ROLES, PROJECT_KINDS, PROJECT_STATUSES,
    Project, ProjectKind, ProjectPerson, ProjectStatus
} from './projects';

/**
 * Project templates — "another one like that".
 *
 * ‼️ NOTHING IS SHIPPED. The list starts EMPTY and the only door in is **save
 * this project as a template**, because a template is a claim about how the
 * user works and we do not have one. A built-in "Client project" carrying
 * somebody's guess at five plan items is the sort of thing that gets the whole
 * feature deleted on first sight — the same reason the backlog skeleton seeds
 * one area and not a dictionary of ten.
 *
 * So a template is derived from a project that already exists and already
 * proved itself, and the user picks what travels: the identity fields, the
 * folder skeleton, the people, the plan lines, the backlog lines. What is not
 * ticked is not in the template — a template that silently carried a budget
 * would put a ceiling on work nobody set one for.
 *
 * ‼️ AND IT NEVER CARRIES THE ONE THING THAT MUST NOT BE COPIED. `id`, `folder`
 * and `parentId` are identity: an id is unique by definition, two projects
 * sharing a docs folder would each rewrite the other's plan, and a parent is a
 * statement about one specific project. They are dropped on the way in, not
 * "left to the caller" — a rule enforced at the boundary cannot be forgotten at
 * a call site.
 *
 * Pure: no vscode, no fs. The setting is read elsewhere, the folder is built
 * elsewhere, the documents are seeded elsewhere; everything here is a function
 * of its arguments.
 */

/** A plan line a new project starts with, in the user's own words. */
export interface TemplatePlanItem {
    text: string;
    /** which heading it goes under — unmatched falls to the end of the file */
    section?: string;
}

/** A backlog line a new project starts with. Fields mirror `AddBacklogInput`;
 *  anything absent simply is not written. */
export interface TemplateBacklogItem {
    text: string;
    area?: string;
    priority?: string;
    effort?: string;
    kinds?: string[];
}

export interface ProjectTemplate {
    /** the template's own name — how it is picked, and its identity in the list */
    name: string;
    /** one line, shown next to the name in the picker */
    description?: string;
    kind?: ProjectKind;
    status?: ProjectStatus;
    summary?: string;
    tags?: string[];
    repos?: string[];
    /** the agent rule (`match.agents`) */
    agents?: string[];
    budgetUSD?: number;
    budgetTotalUSD?: number;
    color?: string;
    icon?: string;
    people?: ProjectPerson[];
    plan?: TemplatePlanItem[];
    backlog?: TemplateBacklogItem[];
    /** folder skeleton override — absent means the configured default */
    skeleton?: SkeletonEntry[];
    /** when it was saved, so a list of eight can be ordered by recency */
    savedAt?: number;
    /** which project it was taken from — a template with no provenance is a
     *  guess six months later */
    fromProject?: string;
}

// ---------------------------------------------------------------------------
// coercion — the list is a SETTING, so every field arrived by hand
// ---------------------------------------------------------------------------

function optStr(v: unknown): string | undefined {
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function strList(v: unknown): string[] {
    return Array.isArray(v)
        ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim())
        : [];
}

function optNum(v: unknown): number | undefined {
    return typeof v === 'number' && isFinite(v) && v > 0 ? v : undefined;
}

function coercePlanItems(v: unknown): TemplatePlanItem[] {
    if (!Array.isArray(v)) { return []; }
    const out: TemplatePlanItem[] = [];
    for (const raw of v) {
        // a bare string is a valid item: the setting must be writable by hand
        const text = typeof raw === 'string'
            ? optStr(raw)
            : optStr((raw as Record<string, unknown> | null)?.text);
        if (!text) { continue; }
        const section = typeof raw === 'string'
            ? undefined : optStr((raw as Record<string, unknown>).section);
        out.push({ text, ...(section ? { section } : {}) });
    }
    return out;
}

function coerceBacklogItems(v: unknown): TemplateBacklogItem[] {
    if (!Array.isArray(v)) { return []; }
    const out: TemplateBacklogItem[] = [];
    for (const raw of v) {
        const o = typeof raw === 'string' ? { text: raw } : (raw as Record<string, unknown> | null);
        const text = optStr(o?.text);
        if (!text) { continue; }
        const item: TemplateBacklogItem = { text };
        const area = optStr(o?.area); if (area) { item.area = area.toUpperCase(); }
        const priority = optStr(o?.priority); if (priority) { item.priority = priority; }
        const effort = optStr(o?.effort); if (effort) { item.effort = effort.toUpperCase(); }
        const kinds = strList(o?.kinds); if (kinds.length) { item.kinds = kinds; }
        out.push(item);
    }
    return out;
}

function coercePeople(v: unknown): ProjectPerson[] {
    if (!Array.isArray(v)) { return []; }
    const out: ProjectPerson[] = [];
    for (const raw of v) {
        const o = raw as Record<string, unknown> | null;
        const name = optStr(o?.name);
        if (!name) { continue; }
        const person: ProjectPerson = {
            name,
            role: PERSON_ROLES.includes(o?.role as never) ? o?.role as ProjectPerson['role'] : 'contact',
            kind: PERSON_KINDS.includes(o?.kind as never) ? o?.kind as ProjectPerson['kind'] : 'person'
        };
        const contact = optStr(o?.contact); if (contact) { person.contact = contact; }
        const link = optStr(o?.link); if (link) { person.link = link; }
        const note = optStr(o?.note); if (note) { person.note = note; }
        out.push(person);
    }
    return out;
}

/** A skeleton inside a template is passed through as-is and normalised by
 *  `projectDocs.normalizeSkeleton` when it is used — one validator for the
 *  setting and for this, so a path that escapes the folder is refused in both
 *  places by the same code. */
function coerceSkeleton(v: unknown): SkeletonEntry[] | undefined {
    if (!Array.isArray(v) || !v.length) { return undefined; }
    const out: SkeletonEntry[] = [];
    for (const raw of v) {
        const o = typeof raw === 'string' ? { path: raw } : (raw as Record<string, unknown> | null);
        const p = optStr(o?.path);
        if (!p) { continue; }
        const entry: Record<string, unknown> = { path: p };
        if (typeof o?.role === 'string') { entry.role = o.role; }
        if (typeof o?.template === 'string') { entry.template = o.template; }
        if (o?.holds === 'decisions' || o?.holds === 'tracks') { entry.holds = o.holds; }
        out.push(entry as unknown as SkeletonEntry);
    }
    return out.length ? out : undefined;
}

/** One stored template → a usable one, or undefined if it has no name. */
export function coerceTemplate(raw: unknown): ProjectTemplate | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const o = raw as Record<string, unknown>;
    const name = optStr(o.name);
    if (!name) { return undefined; }

    const t: ProjectTemplate = { name };
    const description = optStr(o.description); if (description) { t.description = description; }
    if (PROJECT_KINDS.includes(o.kind as ProjectKind)) { t.kind = o.kind as ProjectKind; }
    if (PROJECT_STATUSES.includes(o.status as ProjectStatus)) { t.status = o.status as ProjectStatus; }
    const summary = optStr(o.summary); if (summary) { t.summary = summary; }
    const tags = strList(o.tags); if (tags.length) { t.tags = tags; }
    const repos = strList(o.repos); if (repos.length) { t.repos = repos; }
    const agents = strList(o.agents); if (agents.length) { t.agents = agents; }
    const budgetUSD = optNum(o.budgetUSD); if (budgetUSD) { t.budgetUSD = budgetUSD; }
    const budgetTotalUSD = optNum(o.budgetTotalUSD); if (budgetTotalUSD) { t.budgetTotalUSD = budgetTotalUSD; }
    const color = optStr(o.color); if (color) { t.color = color; }
    const icon = optStr(o.icon); if (icon) { t.icon = icon; }
    const people = coercePeople(o.people); if (people.length) { t.people = people; }
    const plan = coercePlanItems(o.plan); if (plan.length) { t.plan = plan; }
    const backlog = coerceBacklogItems(o.backlog); if (backlog.length) { t.backlog = backlog; }
    const skeleton = coerceSkeleton(o.skeleton); if (skeleton) { t.skeleton = skeleton; }
    if (typeof o.savedAt === 'number' && o.savedAt > 0) { t.savedAt = o.savedAt; }
    const fromProject = optStr(o.fromProject); if (fromProject) { t.fromProject = fromProject; }
    return t;
}

/** The stored list → a clean one. Two templates with the same name are the same
 *  template, so the first wins: the picker keys on the name and a duplicate
 *  would make "which one did I choose" unanswerable. */
export function coerceTemplates(raw: unknown): ProjectTemplate[] {
    if (!Array.isArray(raw)) { return []; }
    const out: ProjectTemplate[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
        const t = coerceTemplate(item);
        if (!t) { continue; }
        const key = t.name.toLocaleLowerCase();
        if (seen.has(key)) { continue; }
        seen.add(key);
        out.push(t);
    }
    return out;
}

export function findTemplate(list: ProjectTemplate[], name: string): ProjectTemplate | undefined {
    const key = String(name ?? '').trim().toLocaleLowerCase();
    if (!key) { return undefined; }
    return list.find(t => t.name.toLocaleLowerCase() === key);
}

/** Add or replace by name. Saving over a template is how you edit one, so this
 *  keeps the list's order and swaps in place rather than moving the entry to
 *  the end where the user would have to hunt for it. */
export function upsertTemplate(list: ProjectTemplate[], t: ProjectTemplate): ProjectTemplate[] {
    const key = t.name.toLocaleLowerCase();
    const at = list.findIndex(x => x.name.toLocaleLowerCase() === key);
    if (at < 0) { return [...list, t]; }
    const next = [...list];
    next[at] = t;
    return next;
}

export function removeTemplate(list: ProjectTemplate[], name: string): ProjectTemplate[] {
    const key = String(name ?? '').trim().toLocaleLowerCase();
    return list.filter(t => t.name.toLocaleLowerCase() !== key);
}

// ---------------------------------------------------------------------------
// deriving one from a project
// ---------------------------------------------------------------------------

/** What travels. Everything is opt-in: a template that carried fields nobody
 *  chose would surprise somebody two projects later, and the surprise would be
 *  a budget or a person. */
export interface TemplateFromOptions {
    /** kind, status, summary, tags, colour and icon */
    identity?: boolean;
    repos?: boolean;
    /** the agent rule */
    agents?: boolean;
    budgets?: boolean;
    people?: boolean;
    /** plan lines to carry — the caller reads the document and picks */
    plan?: TemplatePlanItem[];
    /** backlog lines to carry */
    backlog?: TemplateBacklogItem[];
    /** the skeleton in force for that project, when it is not the default */
    skeleton?: SkeletonEntry[];
    description?: string;
}

/**
 * Take a template off a project.
 *
 * The name is the caller's — the template is named for the SHAPE ("Client
 * project"), not for the project it came from, and defaulting it to the
 * project's own name would produce a list of templates called after one-off
 * jobs.
 */
export function templateFromProject(
    project: Project, name: string, opts: TemplateFromOptions = {}, now = Date.now()
): { template?: ProjectTemplate; error?: string } {
    const clean = String(name ?? '').trim();
    if (!clean) { return { error: 'a template needs a name' }; }

    const t: ProjectTemplate = { name: clean, savedAt: now, fromProject: project.name };
    if (opts.description?.trim()) { t.description = opts.description.trim(); }
    if (opts.identity) {
        if (project.kind) { t.kind = project.kind; }
        // ‼️ status is deliberately NOT carried from `identity`: a template taken
        // off a finished project would create every new one as `done`. A new
        // project is `active` unless the caller says otherwise — the store's own
        // default, so there is one answer to this and it is not here.
        if (project.summary) { t.summary = project.summary; }
        if (project.tags?.length) { t.tags = [...project.tags]; }
        if (project.color) { t.color = project.color; }
        if (project.icon) { t.icon = project.icon; }
    }
    if (opts.repos && project.repos?.length) { t.repos = [...project.repos]; }
    if (opts.agents && project.match?.agents?.length) { t.agents = [...project.match.agents]; }
    if (opts.budgets) {
        if (project.budgetUSD) { t.budgetUSD = project.budgetUSD; }
        if (project.budgetTotalUSD) { t.budgetTotalUSD = project.budgetTotalUSD; }
    }
    if (opts.people && project.people?.length) { t.people = project.people.map(p => ({ ...p })); }
    if (opts.plan?.length) { t.plan = coercePlanItems(opts.plan); }
    if (opts.backlog?.length) { t.backlog = coerceBacklogItems(opts.backlog); }
    if (opts.skeleton?.length) { t.skeleton = coerceSkeleton(opts.skeleton); }
    return { template: t };
}

// ---------------------------------------------------------------------------
// applying one
// ---------------------------------------------------------------------------

/** The registry fields a template contributes to a new project — never `id`,
 *  `folder` or `parentId`. */
export interface TemplateFields {
    kind?: ProjectKind;
    status?: ProjectStatus;
    summary?: string;
    tags?: string[];
    repos?: string[];
    match?: { agents: string[] };
    budgetUSD?: number;
    budgetTotalUSD?: number;
    color?: string;
    icon?: string;
    people?: ProjectPerson[];
}

/**
 * What a template contributes, merged under what the caller explicitly asked
 * for.
 *
 * ‼️ THE EXPLICIT ARGUMENT ALWAYS WINS. A form that offers both a template and
 * a kind must apply the kind the person is looking at, not the one the template
 * carries — otherwise the field they just set silently reverts and they learn
 * not to trust the form. `overrides` is checked with `!== undefined`, so an
 * explicit empty string clears a field the template would have set.
 */
export function applyTemplate(
    template: ProjectTemplate | undefined, overrides: Partial<TemplateFields> = {}
): TemplateFields {
    const out: TemplateFields = {};
    if (template) {
        if (template.kind) { out.kind = template.kind; }
        if (template.status) { out.status = template.status; }
        if (template.summary) { out.summary = template.summary; }
        if (template.tags?.length) { out.tags = [...template.tags]; }
        if (template.repos?.length) { out.repos = [...template.repos]; }
        if (template.agents?.length) { out.match = { agents: [...template.agents] }; }
        if (template.budgetUSD) { out.budgetUSD = template.budgetUSD; }
        if (template.budgetTotalUSD) { out.budgetTotalUSD = template.budgetTotalUSD; }
        if (template.color) { out.color = template.color; }
        if (template.icon) { out.icon = template.icon; }
        if (template.people?.length) { out.people = template.people.map(p => ({ ...p })); }
    }
    for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined) { continue; }
        if (value === '' || (Array.isArray(value) && !value.length)) {
            delete (out as Record<string, unknown>)[key];
            continue;
        }
        (out as Record<string, unknown>)[key] = value;
    }
    return out;
}

/** One line for a picker: what this template will actually do. Built here so
 *  the page and the quick pick cannot describe the same template differently. */
export function describeTemplate(t: ProjectTemplate): string {
    const bits: string[] = [];
    if (t.kind) { bits.push(t.kind); }
    if (t.repos?.length) { bits.push(`${t.repos.length} repo${t.repos.length === 1 ? '' : 's'}`); }
    if (t.agents?.length) { bits.push(`${t.agents.length} agent rule${t.agents.length === 1 ? '' : 's'}`); }
    if (t.people?.length) { bits.push(`${t.people.length} person/people`); }
    if (t.plan?.length) { bits.push(`${t.plan.length} plan item${t.plan.length === 1 ? '' : 's'}`); }
    if (t.backlog?.length) { bits.push(`${t.backlog.length} backlog item${t.backlog.length === 1 ? '' : 's'}`); }
    if (t.skeleton?.length) { bits.push('own folder skeleton'); }
    if (t.budgetUSD || t.budgetTotalUSD) { bits.push('a budget'); }
    return bits.length ? bits.join(' · ') : 'nothing but its name';
}
