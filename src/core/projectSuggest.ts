import {
    normalizePath, Project, ProjectLinks, ProjectSessionRef, emptyLinks,
    matchRoots, resolveSessionProject
} from './projects';

/**
 * Backfilling — which project does this loose session belong to?
 *
 * A farm that has been running for months before projects existed has hundreds
 * of sessions in the `Unassigned` bucket, and filing them one at a time is work
 * nobody does. This module proposes; a person approves. It never writes.
 *
 * ‼️ FOUR RULES, AND EACH ONE IS THE ANSWER TO A WAY THIS COULD GO WRONG.
 *
 * **1. It proposes only for sessions NOBODY has decided about.** A session the
 * membership order already places is not a candidate — the rules got there
 * first and a suggestion would be a second opinion on a settled question. A
 * session explicitly taken OFF every project (`explicit-none`) is not a
 * candidate either, and that one matters most: the user said no, and an
 * engine that keeps proposing what a person has already refused is an engine
 * they switch off.
 *
 * **2. Every proposal carries the EVIDENCE, not a score.** "84% confident" is
 * a number a reader cannot check. "wrote 14 files under D:\…\vsc_AgentFarm" is
 * a fact they can agree or disagree with in one second, which is the whole
 * difference between a list somebody approves in bulk and a list they abandon.
 * The score exists — it decides the order — but it is never the argument.
 *
 * **3. A contested session is REPORTED, never guessed.** When two projects
 * are within a hair of each other the honest output is "these two, and here is
 * why each"; picking the higher one by a rounding error is exactly the silent
 * misattribution the whole project axis was rebuilt to stop. Contested rows
 * are excluded from "approve all" by default.
 *
 * **4. It reads NOTHING.** Pure: the caller collects the sessions, their
 * working directories and the files they wrote, and hands them over. Same
 * reason `projectFeed.ts` is pure — the membership judgment stays in
 * `projects.ts` and this module may not grow a second one.
 */

// ---------------------------------------------------------------------------
// input
// ---------------------------------------------------------------------------

export interface SuggestSession extends ProjectSessionRef {
    sessionId: string;
    /** what the session called itself — a title often names the product */
    title?: string;
    /** the paths this session WROTE, as the index already counts them */
    filesEdited?: string[];
    firstTs?: number;
    lastTs?: number;
    cost?: number;
}

export interface SuggestOptions {
    /** Below this the proposal is not worth a person's attention. */
    floor?: number;
    /**
     * How close a runner-up has to be before the row is called contested.
     * A ratio rather than a difference: two weak signals one point apart is a
     * coin toss, two strong ones one point apart is not.
     */
    contestRatio?: number;
    /** Rows returned, best first. 0 = everything. */
    limit?: number;
}

/** One reason a session might belong somewhere, in the words a person reads. */
export interface SuggestSignal {
    kind: 'files' | 'cwd-cohort' | 'agent' | 'name';
    weight: number;
    /** The fact itself. Never a category, never a percentage. */
    detail: string;
}

export interface Suggestion {
    sessionId: string;
    title?: string;
    agentName?: string;
    cwd?: string;
    firstTs?: number;
    lastTs?: number;
    cost?: number;
    projectId: string;
    projectName: string;
    score: number;
    signals: SuggestSignal[];
    /** The runner-up, when there is one worth naming. */
    alsoId?: string;
    alsoName?: string;
    alsoScore?: number;
    /**
     * ‼️ Two projects too close to choose between. The row still appears — the
     * reader is the one who knows — but it is left out of "approve all",
     * because a bulk gesture must never resolve a question the engine itself
     * could not.
     */
    contested?: boolean;
}

export interface SuggestReport {
    generatedAt: number;
    /** Loose sessions looked at — the denominator for "how much is left". */
    scanned: number;
    /** Sessions with no signal at all. Named, because a proposal list that is
     *  shorter than the unassigned count needs to say where the rest went. */
    noEvidence: number;
    /** Sessions the user explicitly took off every project — never proposed
     *  for, and counted separately so the number is not mistaken for a gap. */
    refused: number;
    suggestions: Suggestion[];
}

// ---------------------------------------------------------------------------
// the signals
// ---------------------------------------------------------------------------

/**
 * WEIGHTS, and why these numbers.
 *
 * They are an ORDER, not a measurement, and the code says so rather than
 * dressing them up: writing files inside a project's own code root is close to
 * proof; agreeing with a dozen sessions already filed from the same folder is
 * strong; an agent's habit is a tendency; a name in a title is a hint that is
 * wrong often enough to need company. Nothing is proposed on a hint alone —
 * `FLOOR` is above `NAME`, deliberately.
 */
const W = { files: 60, cohort: 45, agent: 25, name: 15 };
const FLOOR = 25;
const CONTEST_RATIO = 0.8;

/** The last segment of a path — what a person calls the folder. */
function leaf(p: string): string {
    const parts = normalizePath(p).split('/');
    return parts[parts.length - 1] ?? '';
}

/** Is `file` inside `root` (or is it the root)? Both already normalised. */
function under(file: string, root: string): boolean {
    return !!root && (file === root || file.startsWith(root + '/'));
}

/**
 * Signal 1 — the session WROTE inside this project's declared roots.
 *
 * The strongest thing available, and the one a `cwd` rule cannot see: an agent
 * started in its own home folder and edited a repo three directories away is
 * the ordinary case, and it is invisible to every path rule in `projects.ts`
 * because those look at where the session STOOD, not at what it touched.
 */
function filesSignal(s: SuggestSession, p: Project): SuggestSignal | undefined {
    const roots = matchRoots(p);
    if (!roots.length) { return undefined; }
    const hits = (s.filesEdited ?? [])
        .map(f => normalizePath(f))
        .filter(f => roots.some(r => under(f, r)));
    if (!hits.length) { return undefined; }
    // The root that actually matched, so the sentence names a place the reader
    // recognises rather than the project's whole list of roots.
    const matched = roots.find(r => hits.some(h => under(h, r))) ?? roots[0];
    const total = (s.filesEdited ?? []).length;
    const all = hits.length === total;
    return {
        kind: 'files',
        // A session that wrote ONLY here is a different claim from one that
        // wrote here among other places, and the share is the honest way to
        // say which — a bare count reads as certainty it has not earned.
        weight: all ? W.files : Math.round(W.files * (hits.length / total)),
        detail: `wrote ${hits.length} of ${total} file${total === 1 ? '' : 's'} under ${matched}`
    };
}

/**
 * Signal 2 — other sessions from the SAME working directory are already filed
 * under this project, by hand.
 *
 * This is a decision a person already made, generalised one step. It is the
 * only signal here that is evidence about the USER rather than about the data,
 * which is why it outweighs everything but the files — and why unanimity
 * matters: a folder whose sessions are split across two projects says the
 * folder does not decide, and it is reported as such instead of being resolved
 * by majority.
 */
function cohortSignal(
    s: SuggestSession, p: Project, cohorts: Map<string, Map<string, number>>
): SuggestSignal | undefined {
    const cwd = normalizePath(s.cwd ?? '');
    if (!cwd) { return undefined; }
    const byProject = cohorts.get(cwd);
    if (!byProject) { return undefined; }
    const mine = byProject.get(p.id) ?? 0;
    if (!mine) { return undefined; }
    const total = [...byProject.values()].reduce((a, b) => a + b, 0);
    const unanimous = mine === total;
    return {
        kind: 'cwd-cohort',
        weight: Math.round(W.cohort * (mine / total)),
        detail: unanimous
            ? `${mine} other session${mine === 1 ? '' : 's'} from this exact folder ${mine === 1 ? 'is' : 'are'} filed here`
            : `${mine} of ${total} sessions from this exact folder are filed here — the folder is split`
    };
}

/**
 * Signal 3 — this agent's own habit.
 *
 * A tendency, not a fact, and weighted like one. It is here because it is the
 * only signal a session with no cwd and no writes can produce, and a proposal
 * list that silently skips those is a list that never finishes the job.
 */
function agentSignal(
    s: SuggestSession, p: Project, byAgent: Map<string, Map<string, number>>
): SuggestSignal | undefined {
    const key = (s.agentName ?? '').toLocaleLowerCase();
    if (!key) { return undefined; }
    const spread = byAgent.get(key);
    if (!spread) { return undefined; }
    const mine = spread.get(p.id) ?? 0;
    if (!mine) { return undefined; }
    const total = [...spread.values()].reduce((a, b) => a + b, 0);
    const share = mine / total;
    // Below half it is not a habit, it is noise — and a sentence saying
    // "30% of this agent's sessions" is an argument against the proposal.
    if (share < 0.5) { return undefined; }
    return {
        kind: 'agent',
        weight: Math.round(W.agent * share),
        detail: `${Math.round(share * 100)}% of ${s.agentName}'s filed sessions are in this project`
    };
}

/**
 * Signal 4 — the project's name, or its folder's, in what the session called
 * itself.
 *
 * The weakest, and below the floor on its own on purpose: a title mentioning
 * "Agent Farm" is as likely to be a session ABOUT it as one FOR it. It earns
 * its place by breaking ties, not by making claims.
 */
function nameSignal(s: SuggestSession, p: Project): SuggestSignal | undefined {
    const hay = String(s.title ?? '').toLocaleLowerCase();
    if (!hay) { return undefined; }
    const needles = [p.name, leaf(p.folder ?? ''), ...(p.repos ?? []).map(leaf)]
        .map(x => String(x ?? '').trim().toLocaleLowerCase())
        // A two-character folder name matches everything; a name that short is
        // not evidence of anything.
        .filter(x => x.length >= 4);
    const hit = needles.find(x => hay.includes(x));
    if (!hit) { return undefined; }
    return { kind: 'name', weight: W.name, detail: `its title mentions "${hit}"` };
}

// ---------------------------------------------------------------------------
// the report
// ---------------------------------------------------------------------------

/** cwd → projectId → how many sessions somebody filed there from that folder. */
function buildCohorts(
    sessions: SuggestSession[], projects: Project[], links: ProjectLinks
): Map<string, Map<string, number>> {
    const out = new Map<string, Map<string, number>>();
    for (const s of sessions) {
        const cwd = normalizePath(s.cwd ?? '');
        if (!cwd) { continue; }
        const r = resolveSessionProject(s, projects, links);
        // ‼️ EXPLICIT ONLY. A session the path rule placed here would make this
        // signal an echo of the rule that already ran — it would agree with
        // itself and call that evidence.
        if (r.via !== 'explicit' || !r.projectId) { continue; }
        const m = out.get(cwd) ?? new Map<string, number>();
        m.set(r.projectId, (m.get(r.projectId) ?? 0) + 1);
        out.set(cwd, m);
    }
    return out;
}

/** agent → projectId → how many of that agent's sessions are filed there. */
function buildAgentSpread(
    sessions: SuggestSession[], projects: Project[], links: ProjectLinks
): Map<string, Map<string, number>> {
    const out = new Map<string, Map<string, number>>();
    for (const s of sessions) {
        const key = (s.agentName ?? '').toLocaleLowerCase();
        if (!key) { continue; }
        const r = resolveSessionProject(s, projects, links);
        // Any settled membership counts here, rule-placed included: "where does
        // this agent's work end up" is a fact about the fleet, and the agent
        // rule is not what is being proposed.
        if (!r.projectId) { continue; }
        const m = out.get(key) ?? new Map<string, number>();
        m.set(r.projectId, (m.get(r.projectId) ?? 0) + 1);
        out.set(key, m);
    }
    return out;
}

/**
 * Which loose sessions belong where, with the evidence for each.
 *
 * `candidates` are the projects a session may be proposed FOR; `sessions` is
 * everything the caller has, because the signals are built out of the sessions
 * that are already filed. Handing over only the loose ones would leave the
 * engine with nothing to learn from.
 */
export function suggestProjects(
    sessions: SuggestSession[],
    projects: Project[],
    links: ProjectLinks = emptyLinks(),
    opts: SuggestOptions = {}
): SuggestReport {
    const floor = opts.floor ?? FLOOR;
    const ratio = opts.contestRatio ?? CONTEST_RATIO;
    const cohorts = buildCohorts(sessions, projects, links);
    const spread = buildAgentSpread(sessions, projects, links);

    let scanned = 0;
    let refused = 0;
    let noEvidence = 0;
    const out: Suggestion[] = [];

    for (const s of sessions) {
        const r = resolveSessionProject(s, projects, links);
        if (r.via === 'explicit-none') { refused++; continue; }
        if (r.projectId) { continue; }
        scanned++;

        const scored = projects.map(p => {
            const signals = [
                filesSignal(s, p),
                cohortSignal(s, p, cohorts),
                agentSignal(s, p, spread),
                nameSignal(s, p)
            ].filter((x): x is SuggestSignal => !!x);
            return {
                p, signals,
                score: signals.reduce((a, x) => a + x.weight, 0)
            };
        }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

        if (!scored.length || scored[0].score < floor) { noEvidence++; continue; }
        const best = scored[0];
        const next = scored[1];
        const row: Suggestion = {
            sessionId: s.sessionId,
            ...(s.title ? { title: s.title } : {}),
            ...(s.agentName ? { agentName: s.agentName } : {}),
            ...(s.cwd ? { cwd: s.cwd } : {}),
            ...(s.firstTs ? { firstTs: s.firstTs } : {}),
            ...(s.lastTs ? { lastTs: s.lastTs } : {}),
            ...(s.cost ? { cost: s.cost } : {}),
            projectId: best.p.id,
            projectName: best.p.name,
            score: best.score,
            // Strongest evidence first — the sentence a reader checks is the
            // one that decided it, and burying it under a weak one is how a
            // good proposal gets refused.
            signals: best.signals.slice().sort((a, b) => b.weight - a.weight)
        };
        if (next && next.score >= best.score * ratio) {
            row.alsoId = next.p.id;
            row.alsoName = next.p.name;
            row.alsoScore = next.score;
            row.contested = true;
        }
        out.push(row);
    }

    out.sort((a, b) => b.score - a.score
        || (b.lastTs ?? 0) - (a.lastTs ?? 0)
        || a.sessionId.localeCompare(b.sessionId));
    const limit = opts.limit ?? 0;
    return {
        generatedAt: Date.now(),
        scanned, refused, noEvidence,
        suggestions: limit > 0 ? out.slice(0, limit) : out
    };
}

/**
 * The rows an "approve all" is allowed to touch.
 *
 * ‼️ A CONTESTED ROW IS NEVER IN IT. The bulk gesture exists because filing two
 * hundred sessions one at a time is work nobody does — but a gesture that also
 * resolves the questions the engine could not answer is a gesture that files
 * things wrong at two hundred times the speed.
 */
export function approvable(report: SuggestReport): Suggestion[] {
    return report.suggestions.filter(s => !s.contested);
}

/** Proposals grouped by the project they point at — what a bulk approval is
 *  about to do, said in one line per project before it is done. */
export function byProject(rows: Suggestion[]): { projectId: string; projectName: string; count: number }[] {
    const m = new Map<string, { projectId: string; projectName: string; count: number }>();
    for (const s of rows) {
        const cur = m.get(s.projectId) ?? { projectId: s.projectId, projectName: s.projectName, count: 0 };
        cur.count++;
        m.set(s.projectId, cur);
    }
    return [...m.values()].sort((a, b) => b.count - a.count || a.projectName.localeCompare(b.projectName));
}
