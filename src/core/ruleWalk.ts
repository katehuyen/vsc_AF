import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * X-476 — WHAT AN ENGINE THAT WALKS UP FOR ITS RULES ACTUALLY REACHES.
 *
 * Codex, OpenCode and Antigravity all collect instruction files from the
 * working folder up to the repository root (the nearest `.git`). Whether the
 * shared constitution one level up reaches an agent is therefore a fact about
 * the disk, asked here by every lane rather than assumed by each.
 */

/** The nearest ancestor holding a `.git` (a FILE for a submodule), or '' when there is none. */
export function gitRootOf(dir: string, exists: (p: string) => boolean = fs.existsSync): string {
    let cur = path.resolve(dir);
    for (; ;) {
        if (exists(path.join(cur, '.git'))) { return cur; }
        const parent = path.dirname(cur);
        if (parent === cur) { return ''; }
        cur = parent;
    }
}

/** Case-insensitive on Windows, where the same folder has two spellings. */
export function samePath(a: string, b: string): boolean {
    const n = (p: string) => path.resolve(p).replace(/[\\/]+$/, '').toLowerCase();
    return n(a) === n(b);
}

/** Is `inner` at or below `outer`? */
export function isWithin(outer: string, inner: string): boolean {
    if (samePath(outer, inner)) { return true; }
    const rel = path.relative(path.resolve(outer), path.resolve(inner));
    return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * ‼️ X-476 — DOES ANTIGRAVITY'S OWN WALK CARRY THE SHARED CONSTITUTION INTO A
 * SESSION STARTED IN THIS FOLDER? Its documented walk runs from the cwd to the
 * repository root, so yes when the nest's `AGENTS.md` mirror exists inside the
 * agent's repository. With no repository at all the end of the walk is not
 * documented, so the answer is no and the constitution stays embedded: a copy
 * read twice costs budget, a copy never read costs the rules.
 */
export function antigravityReachesConstitution(
    agentDir: string,
    constitutionPath: string | undefined,
    exists: (p: string) => boolean = fs.existsSync
): boolean {
    if (!constitutionPath) { return true; }
    const nest = path.dirname(constitutionPath);
    if (!exists(path.join(nest, 'AGENTS.md'))) { return false; }
    const root = gitRootOf(agentDir, exists);
    return !!root && isWithin(root, nest);
}

/** Antigravity truncates a rules file past this many bytes (its own docs: "24 KB / 24,000 bytes"). */
export const ANTIGRAVITY_FILE_CAP_BYTES = 24000;

export interface RuleLoad {
    /** where the walk ends: the repository root, or the folder itself when there is none */
    walkEnd: string;
    files: { path: string; bytes: number }[];
    totalBytes: number;
    /** a file whose text another file on the walk already carries whole — loaded twice */
    duplicates: { file: string; repeats: string }[];
    /** files past the per-file cap, which the engine cuts */
    overFileCap: string[];
}

const RULE_NAMES = ['AGENTS.md', 'GEMINI.md', path.join('.agents', 'AGENTS.md')];

/** The text without Agent Farm's own marker lines, so a mirror and an embedded copy compare equal. */
function ruleBody(text: string): string {
    return text.split(/\r?\n/)
        .filter(l => !/^<!-- \/?agent-farm:/.test(l))
        .join('\n').trim();
}

/**
 * ‼️ X-476 — THE RULE FILES ANTIGRAVITY'S WALK FINDS FOR A SESSION IN THIS
 * FOLDER, read off the disk: every `AGENTS.md`, `GEMINI.md` and
 * `.agents/AGENTS.md` from the folder up to the repository root, then its two
 * global files. It de-duplicates by PATH, so one text in two files is loaded
 * twice — which is what `duplicates` names. Bytes, never a token estimate.
 */
export function antigravityRuleLoad(
    agentDir: string,
    opts: { home?: string; read?: (p: string) => string | undefined; exists?: (p: string) => boolean } = {}
): RuleLoad {
    const read = opts.read ?? ((p: string) => { try { return fs.readFileSync(p, 'utf8'); } catch { return undefined; } });
    const root = gitRootOf(agentDir, opts.exists);
    const dirs: string[] = [];
    for (let cur = path.resolve(agentDir); ; cur = path.dirname(cur)) {
        dirs.push(cur);
        if (!root || samePath(cur, root) || path.dirname(cur) === cur) { break; }
    }
    const gemini = path.join(opts.home ?? os.homedir(), '.gemini');
    const candidates = [
        ...dirs.flatMap(d => RULE_NAMES.map(n => path.join(d, n))),
        path.join(gemini, 'GEMINI.md'), path.join(gemini, 'AGENTS.md')
    ];
    const found = candidates
        .map(p => ({ path: p, text: read(p) }))
        .filter((f): f is { path: string; text: string } => f.text !== undefined);
    const bodies = found.map(f => ruleBody(f.text));
    const duplicates: RuleLoad['duplicates'] = [];
    found.forEach((f, i) => {
        const j = bodies.findIndex((b, k) => k !== i && b.length >= 200 && bodies[i].includes(b)
            && (bodies[i] !== b || k < i));
        if (j >= 0) { duplicates.push({ file: f.path, repeats: found[j].path }); }
    });
    const files = found.map(f => ({ path: f.path, bytes: Buffer.byteLength(f.text, 'utf8') }));
    return {
        walkEnd: root || path.resolve(agentDir),
        files,
        totalBytes: files.reduce((s, f) => s + f.bytes, 0),
        duplicates,
        overFileCap: files.filter(f => f.bytes > ANTIGRAVITY_FILE_CAP_BYTES).map(f => f.path)
    };
}

/** What `agents.sync` answers about the Antigravity lane: does its walk reach the constitution, and what does it load. */
export function antigravityFacts(agentDir: string, constitutionPath?: string): { reachesConstitution: boolean; load: RuleLoad } {
    return {
        reachesConstitution: antigravityReachesConstitution(agentDir, constitutionPath),
        load: antigravityRuleLoad(agentDir)
    };
}
