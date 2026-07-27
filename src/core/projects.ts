/**
 * Projects — the missing axis.
 *
 * The farm was a flat list of agents, and sessions were tied to agents by cwd.
 * That answers "what did the developer agent cost" and nothing else. The
 * questions a person with more than one job actually asks — *what did I spend
 * on this customer this month · show me everything that happened on this
 * project · these three agents are one team* — had no data model to stand on.
 *
 * A project is a **name over a set of agents and/or folders**. Nothing is
 * duplicated: membership is declared once in `agentFarm.projects` and every
 * surface resolves through the two functions here.
 *
 * One rule makes the cost arithmetic trustworthy: **an agent belongs to at
 * most one project — the first that claims it.** Overlapping membership would
 * make "spent on this customer" double-count, and a number you cannot add up
 * is worse than no number.
 *
 * Pure: no vscode, no fs.
 */

export interface ProjectDef {
    name: string;
    /** agent names (or ids) that belong to this project */
    agents?: string[];
    /** folder prefixes; a session whose cwd sits under one belongs here */
    paths?: string[];
    /** optional daily budget in USD for the whole project */
    budgetUSD?: number;
    /** free note — customer, contract, whatever the name does not say */
    note?: string;
}

/** Lower-cased, slash-normalised, trailing slash removed — path comparison
 *  has to survive `D:\a\B` vs `d:/a/b/`. Mirrors util.normPath deliberately
 *  (this module stays dependency-free so the service side can use it too). */
export function normalizePath(p: string): string {
    return String(p ?? '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/** Accept whatever settings.json holds and return a clean, usable list. */
export function normalizeProjects(raw: unknown): ProjectDef[] {
    if (!Array.isArray(raw)) { return []; }
    const out: ProjectDef[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
        if (!item || typeof item !== 'object') { continue; }
        const o = item as Record<string, unknown>;
        const name = typeof o.name === 'string' ? o.name.trim() : '';
        if (!name || seen.has(name.toLowerCase())) { continue; }
        seen.add(name.toLowerCase());
        const def: ProjectDef = { name };
        const list = (v: unknown) => Array.isArray(v)
            ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim())
            : [];
        const agents = list(o.agents);
        const paths = list(o.paths);
        if (agents.length) { def.agents = agents; }
        if (paths.length) { def.paths = paths; }
        if (typeof o.budgetUSD === 'number' && o.budgetUSD > 0) { def.budgetUSD = o.budgetUSD; }
        if (typeof o.note === 'string' && o.note.trim()) { def.note = o.note.trim(); }
        out.push(def);
    }
    return out;
}

export interface AgentRef {
    id?: string;
    name?: string;
    dir?: string;
}

/** Which project owns this agent? First match wins — see the one rule above. */
export function projectOfAgent(agent: AgentRef, projects: ProjectDef[]): string | undefined {
    const id = (agent.id ?? '').toLowerCase();
    const name = (agent.name ?? '').toLowerCase();
    const dir = normalizePath(agent.dir ?? '');
    for (const p of projects) {
        for (const a of p.agents ?? []) {
            const key = a.toLowerCase();
            if (key && (key === id || key === name)) { return p.name; }
        }
        if (dir) {
            for (const root of p.paths ?? []) {
                const r = normalizePath(root);
                if (r && (dir === r || dir.startsWith(r + '/'))) { return p.name; }
            }
        }
    }
    return undefined;
}

export interface SessionRef {
    agentId?: string;
    agentName?: string;
    cwd?: string;
}

/**
 * Which project does this session belong to? Its agent decides first (that is
 * the declared membership); a session outside every known agent still lands in
 * a project when its working directory sits under one of the project's paths.
 */
export function projectOfSession(s: SessionRef, projects: ProjectDef[]): string | undefined {
    const viaAgent = projectOfAgent({ id: s.agentId, name: s.agentName }, projects);
    if (viaAgent) { return viaAgent; }
    const dir = normalizePath(s.cwd ?? '');
    if (!dir) { return undefined; }
    for (const p of projects) {
        for (const root of p.paths ?? []) {
            const r = normalizePath(root);
            if (r && (dir === r || dir.startsWith(r + '/'))) { return p.name; }
        }
    }
    return undefined;
}

/** agent name → project name, for shipping one small map to a webview. */
export function agentProjectMap(agents: AgentRef[], projects: ProjectDef[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (const a of agents) {
        const p = projectOfAgent(a, projects);
        if (p && a.name) { map[a.name] = p; }
    }
    return map;
}

export const UNASSIGNED = 'Unassigned';

/** Project names in declaration order, plus the honest bucket for the rest. */
export function projectNames(projects: ProjectDef[], includeUnassigned = true): string[] {
    const names = projects.map(p => p.name);
    return includeUnassigned ? [...names, UNASSIGNED] : names;
}

/** Add or remove one agent from one project, keeping the single-owner rule:
 *  assigning an agent removes it from every other project. Returns a new list. */
export function assignAgent(
    projects: ProjectDef[], projectName: string, agentName: string, on: boolean
): ProjectDef[] {
    const key = agentName.trim().toLowerCase();
    if (!key) { return projects; }
    return projects.map(p => {
        const isTarget = p.name.toLowerCase() === projectName.trim().toLowerCase();
        const others = (p.agents ?? []).filter(a => a.toLowerCase() !== key);
        // removed from everywhere; added back only to the target
        const agents = isTarget && on ? [...others, agentName.trim()] : others;
        const next: ProjectDef = { ...p };
        if (agents.length) { next.agents = agents; } else { delete next.agents; }
        return next;
    });
}

export interface ProjectRollup {
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

export interface RollupSession {
    agentId?: string;
    agentName?: string;
    cwd?: string;
    cost: number;
    tokens: number;
    todayCost: number;
    lastTs: number;
}

/**
 * Fold sessions into per-project totals. Every session lands in exactly one
 * bucket — a named project or `Unassigned` — so the buckets sum to the fleet
 * total and the dashboard's figures stay addable.
 */
export function rollupProjects(
    projects: ProjectDef[],
    sessions: RollupSession[],
    agents: AgentRef[] = []
): ProjectRollup[] {
    const buckets = new Map<string, ProjectRollup>();
    const bucket = (name: string): ProjectRollup => {
        const found = buckets.get(name);
        if (found) { return found; }
        const def = projects.find(p => p.name === name);
        const fresh: ProjectRollup = {
            name, agents: [], sessions: 0, cost: 0, tokens: 0, todayCost: 0, lastTs: 0,
            ...(def?.budgetUSD ? { budgetUSD: def.budgetUSD } : {}),
            ...(def?.note ? { note: def.note } : {})
        };
        buckets.set(name, fresh);
        return fresh;
    };
    for (const p of projects) { bucket(p.name); }
    for (const a of agents) {
        const name = projectOfAgent(a, projects) ?? UNASSIGNED;
        const b = bucket(name);
        if (a.name && !b.agents.includes(a.name)) { b.agents.push(a.name); }
    }
    for (const s of sessions) {
        const b = bucket(projectOfSession(s, projects) ?? UNASSIGNED);
        b.sessions++;
        b.cost += s.cost;
        b.tokens += s.tokens;
        b.todayCost += s.todayCost;
        b.lastTs = Math.max(b.lastTs, s.lastTs);
        if (s.agentName && !b.agents.includes(s.agentName)) { b.agents.push(s.agentName); }
    }
    const out = [...buckets.values()];
    out.forEach(b => { b.cost = Math.round(b.cost * 10000) / 10000; b.todayCost = Math.round(b.todayCost * 10000) / 10000; });
    // named projects in declaration order, Unassigned last — it is a leftover,
    // not a project, and should never head the list
    return out.sort((a, b) => {
        if (a.name === UNASSIGNED) { return 1; }
        if (b.name === UNASSIGNED) { return -1; }
        return projects.findIndex(p => p.name === a.name) - projects.findIndex(p => p.name === b.name);
    });
}
