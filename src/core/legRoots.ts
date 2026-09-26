/**
 * ‼️ S-83 (reopened) — WHERE A RELAY LEG'S WORK LANDS: its folder AND the
 * code repositories of the project it runs in.
 *
 * A project session is started in the agent's own folder and commits in the
 * project's repositories. Measured 2026-09-26, chain chn_muibreo5001gr7: legs
 * 5 and 6 committed 62355f0, d1320da and 8fea0e9 to the project's repo while
 * the agent folder's HEAD never moved — the barren brake read "no new commit
 * in two legs" and stopped the failsafe's rescue, so the chain broke. The same
 * blindness hid a leg's uncommitted work from the failsafe.
 *
 * One root keeps the S-78 shapes exactly (a bare hash, a bare status), so a
 * session with no project reads as it always did.
 */
import type { BatonFrom } from './baton';

export type LegPlace = Pick<BatonFrom, 'cwd'> & { projectId?: string };
/** What a relay reads of a leg's place: its heads, its status, … */
export type FolderRead = (place: LegPlace) => Promise<string | undefined>;
type RootRead = (root: string) => Promise<string | undefined>;

const norm = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

/** The leg's folder first, then its project's repositories — each once. */
export function legRoots(place: LegPlace, reposOf?: (projectId: string) => readonly string[] | undefined): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (p: unknown) => {
        const s = String(p ?? '').trim();
        if (s && !seen.has(norm(s))) { seen.add(norm(s)); out.push(s); }
    };
    add(place?.cwd);
    const pid = String(place?.projectId ?? '').trim();
    if (pid && reposOf) {
        let repos: readonly string[] | undefined;
        try { repos = reposOf(pid); } catch { repos = undefined; }
        for (const r of repos ?? []) { add(r); }
    }
    return out;
}

const readAll = (roots: readonly string[], read: RootRead) =>
    Promise.all(roots.map(r => read(r).catch(() => undefined)));

/** Every root's HEAD as ONE fingerprint: the bare hash for one root, `<hash> <root>` lines for several. */
export async function headsOf(roots: readonly string[], head: RootRead): Promise<string | undefined> {
    const got = await readAll(roots, head);
    if (roots.length === 1) { return got[0]; }
    const lines = roots.map((r, i) => (got[i] ? `${got[i]} ${r}` : '')).filter(Boolean);
    return lines.length ? lines.join('\n') : undefined;
}

/** `git status --short` of every root; with several, each path carries its root so two repos never collide. */
export async function statusOf(roots: readonly string[], status: RootRead): Promise<string | undefined> {
    const got = await readAll(roots, status);
    if (roots.length === 1) { return got[0]; }
    if (got.every(g => g === undefined)) { return undefined; }
    return roots.flatMap((r, i) => String(got[i] ?? '').split(/\r?\n/).filter(l => l.trim())
        .map(l => `${l.slice(0, 3)}${r.replace(/[\\/]+$/, '')}/${l.slice(3)}`)).join('\n');
}

/** A fingerprint back into (root, hash) pairs; a bare hash belongs to the first root. */
export function headPairs(fp: string | undefined, roots: readonly string[]): { root: string; hash: string }[] {
    const t = String(fp ?? '').trim();
    if (!t) { return []; }
    if (!/\s/.test(t)) { return roots.length ? [{ root: roots[0], hash: t }] : []; }
    return t.split(/\r?\n/).map(l => /^([0-9a-f]{7,64}) (.+)$/i.exec(l.trim()))
        .filter((m): m is RegExpExecArray => !!m).map(m => ({ root: m[2], hash: m[1] }));
}

/** A fingerprint for a sentence: `2a5fce2c` for one root, `2a5fce2c developer · 8fea0e9a vsc_AgentFarm` for several. */
export function headsLabel(fp: string | undefined): string {
    const t = String(fp ?? '').trim();
    if (!/\s/.test(t)) { return t.slice(0, 8); }
    return headPairs(t, []).map(p => `${p.hash.slice(0, 8)} ${p.root.split(/[\\/]/).filter(Boolean).pop() ?? p.root}`).join(' · ');
}

/** The roots a fingerprint names, for a sentence; a bare hash names nothing. */
export function headsRoots(fp: string | undefined): string[] {
    return /\s/.test(String(fp ?? '').trim()) ? headPairs(fp, []).map(p => p.root) : [];
}

/** What each root committed since `openFp` (`git log --oneline` lines), or undefined when nothing was read. */
export async function commitsSince(
    openFp: string | undefined, roots: readonly string[], log: (root: string, since: string) => Promise<string | undefined>
): Promise<string | undefined> {
    const out: string[] = [];
    let read = false;
    for (const { root, hash } of headPairs(openFp, roots)) {
        const l = await log(root, hash).catch(() => undefined);
        if (l === undefined) { continue; }
        read = true;
        if (l.trim()) { out.push(roots.length > 1 ? `${root}:\n${l.trimEnd()}` : l.trimEnd()); }
    }
    return read ? out.join('\n') : undefined;
}

export interface LegGitDeps {
    reposOf: (projectId: string) => readonly string[] | undefined;
    head: RootRead;
    status: RootRead;
    log: (root: string, since: string) => Promise<string | undefined>;
}

/** The three readers a relay needs, each over the leg's roots — the host wires these and nothing per-door. */
export function legGitReaders(d: LegGitDeps): {
    headOf: FolderRead; dirtOf: FolderRead; commitsOf: (place: LegPlace, openFp: string | undefined) => Promise<string | undefined>;
} {
    const roots = (p: LegPlace) => legRoots(p, d.reposOf);
    return {
        headOf: p => headsOf(roots(p), d.head),
        dirtOf: p => statusOf(roots(p), d.status),
        commitsOf: (p, fp) => commitsSince(fp, roots(p), d.log)
    };
}
