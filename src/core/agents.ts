import * as fs from 'fs';
import * as path from 'path';
import { Duty, readDuties } from './duties';
import { estimateTokens, expandEnvPath, normPath, safeReadFile, safeStat } from './util';

export interface FileMeta {
    path: string;
    name: string;
    size: number;
    mtime: number;
    tokens: number;
}

export interface ContextLoad {
    claudeMd: number;
    memoryIndex: number;
    agentsMd: number;
    total: number;
}

export interface AgentInfo {
    id: string;
    name: string;
    dir: string;
    normDir: string;
    claudeMdPath?: string;
    memoryDir?: string;
    memoryIndexPath?: string;
    agentsMdPath?: string;
    /** The nest root's own CLAUDE.md — shared instructions Claude Code loads
     *  for every child session. Set only when this agent sits in a nest. */
    constitutionPath?: string;
    settingsPath?: string;
    memoryFiles: FileMeta[];
    toolFiles: FileMeta[];
    contextLoad: ContextLoad;
    permissionSummary?: string;
    dutiesPath?: string;
    duties: Duty[];
}

function fileMeta(p: string): FileMeta | undefined {
    const st = safeStat(p);
    if (!st || !st.isFile()) { return undefined; }
    return {
        path: p,
        name: path.basename(p),
        size: st.size,
        mtime: st.mtimeMs,
        tokens: estimateTokens(safeReadFile(p) ?? '')
    };
}

function isAgentDir(dir: string): boolean {
    return fs.existsSync(path.join(dir, 'CLAUDE.md')) ||
        fs.existsSync(path.join(dir, '.claude')) ||
        fs.existsSync(path.join(dir, 'memory', 'MEMORY.md'));
}

function readAgent(dir: string, constitutionPath?: string): AgentInfo {
    const name = path.basename(dir);
    const agent: AgentInfo = {
        id: normPath(dir),
        name,
        dir,
        normDir: normPath(dir),
        constitutionPath,
        memoryFiles: [],
        toolFiles: [],
        contextLoad: { claudeMd: 0, memoryIndex: 0, agentsMd: 0, total: 0 },
        duties: []
    };

    const dutiesInfo = readDuties(dir);
    if (dutiesInfo) {
        agent.dutiesPath = dutiesInfo.file;
        agent.duties = dutiesInfo.duties;
    }

    const claudeMd = path.join(dir, 'CLAUDE.md');
    if (fs.existsSync(claudeMd)) {
        agent.claudeMdPath = claudeMd;
        agent.contextLoad.claudeMd = estimateTokens(safeReadFile(claudeMd) ?? '');
    }

    // The two cross-engine lanes: <dir>/AGENTS.md (Codex, cross-tool) and
    // .agents/AGENTS.md (Antigravity's workspace customization root). No engine
    // loads both, so the load an engine actually pays is the larger of the two.
    const agentsLanes = [path.join(dir, 'AGENTS.md'), path.join(dir, '.agents', 'AGENTS.md')]
        .filter(p => fs.existsSync(p));
    if (agentsLanes.length) {
        agent.agentsMdPath = agentsLanes[0];
        agent.contextLoad.agentsMd = Math.max(
            ...agentsLanes.map(p => estimateTokens(safeReadFile(p) ?? '')));
    }

    const memDir = path.join(dir, 'memory');
    if (fs.existsSync(memDir)) {
        agent.memoryDir = memDir;
        try {
            for (const f of fs.readdirSync(memDir)) {
                if (!f.toLowerCase().endsWith('.md')) { continue; }
                const meta = fileMeta(path.join(memDir, f));
                if (meta) { agent.memoryFiles.push(meta); }
            }
        } catch { /* unreadable memory dir */ }
        const idx = path.join(memDir, 'MEMORY.md');
        if (fs.existsSync(idx)) {
            agent.memoryIndexPath = idx;
            agent.contextLoad.memoryIndex = estimateTokens(safeReadFile(idx) ?? '');
        }
    }

    const toolsDir = path.join(dir, 'tools');
    if (fs.existsSync(toolsDir)) {
        try {
            for (const f of fs.readdirSync(toolsDir)) {
                const meta = fileMeta(path.join(toolsDir, f));
                if (meta) { agent.toolFiles.push(meta); }
            }
        } catch { /* unreadable tools dir */ }
    }

    for (const settingsName of ['settings.local.json', 'settings.json']) {
        const sp = path.join(dir, '.claude', settingsName);
        if (fs.existsSync(sp)) {
            agent.settingsPath = sp;
            const raw = safeReadFile(sp);
            if (raw) {
                try {
                    const json = JSON.parse(raw);
                    const allow = json?.permissions?.allow?.length ?? 0;
                    const deny = json?.permissions?.deny?.length ?? 0;
                    agent.permissionSummary = `${allow} allow / ${deny} deny rules`;
                } catch { agent.permissionSummary = 'unparseable settings'; }
            }
            break;
        }
    }

    agent.contextLoad.total =
        agent.contextLoad.claudeMd + agent.contextLoad.memoryIndex + agent.contextLoad.agentsMd;
    return agent;
}

/** One agent-like folder found under a root — kept even when excluded, so the
 *  settings page can show it greyed out with an "Include" way back. */
export interface AgentCandidate {
    dir: string;
    name: string;
    excluded: boolean;
}

/** What one configured root turned out to be. */
export interface RootScan {
    root: string;
    /** 'nest' = agent-like children are the agents; the root's own CLAUDE.md is
     *  shared instructions loaded by every child session, not an agent of its own.
     *  'single-agent' = the root itself is one agent (agent-like, no agent-like
     *  children). 'plain' = an ordinary folder whose children are the agents. */
    kind: 'nest' | 'single-agent' | 'plain' | 'missing';
    /** This entry repeats an earlier root (case/slash-insensitive) and was skipped. */
    duplicate: boolean;
    candidates: AgentCandidate[];
}

/** Scan the configured roots. Roots are deduped case/slash-insensitively (two
 *  spellings of one folder must not double-scan — that accident used to decide
 *  whether child agents were discovered at all). `excludes` folders are never
 *  agents, however agent-like they look. */
export function scanRoots(roots: string[], excludes: string[] = []): { agents: AgentInfo[]; reports: RootScan[] } {
    // %VAR% / ${env:VAR} / ~ in roots and excludes expand here — the single
    // choke point every discovery path goes through, so git-synced settings
    // can express machine-specific folders portably
    roots = roots.map(expandEnvPath);
    excludes = excludes.map(expandEnvPath);
    const excludeSet = new Set(excludes.map(normPath));
    const agents: AgentInfo[] = [];
    const reports: RootScan[] = [];
    const seenRoots = new Set<string>();
    const seenAgents = new Set<string>();

    const admit = (c: AgentCandidate, constitutionPath?: string) => {
        if (c.excluded || seenAgents.has(normPath(c.dir))) { return; }
        seenAgents.add(normPath(c.dir));
        agents.push(readAgent(c.dir, constitutionPath));
    };

    for (const root of roots) {
        if (!root) { continue; }
        const report: RootScan = { root, kind: 'plain', duplicate: false, candidates: [] };
        reports.push(report);
        if (seenRoots.has(normPath(root))) { report.duplicate = true; continue; }
        seenRoots.add(normPath(root));
        if (!fs.existsSync(root)) { report.kind = 'missing'; continue; }

        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { /* unreadable — treated as childless */ }
        for (const e of entries) {
            if (!e.isDirectory() || e.name.startsWith('.')) { continue; }
            const dir = path.join(root, e.name);
            if (isAgentDir(dir)) {
                report.candidates.push({ dir, name: e.name, excluded: excludeSet.has(normPath(dir)) });
            }
        }
        // Root-is-agent only without agent-like children: a root that HAS them is
        // a nest — its own CLAUDE.md is the children's shared config (that's how
        // Claude Code itself loads parent CLAUDE.md files), never a sibling agent.
        if (isAgentDir(root)) {
            if (report.candidates.length) {
                report.kind = 'nest';
            } else {
                report.kind = 'single-agent';
                report.candidates.push({
                    dir: root, name: path.basename(root),
                    excluded: excludeSet.has(normPath(root))
                });
            }
        }
        report.candidates.sort((a, b) => a.name.localeCompare(b.name));
        // In a nest, the root's own CLAUDE.md is every child's shared
        // constitution — the cross-engine sync has to carry it, since only
        // Claude Code loads a parent instruction file for free.
        const constitutionPath = report.kind === 'nest' && fs.existsSync(path.join(root, 'CLAUDE.md'))
            ? path.join(root, 'CLAUDE.md')
            : undefined;
        report.candidates.forEach(c => admit(c, constitutionPath));
    }
    agents.sort((a, b) => a.name.localeCompare(b.name));
    return { agents, reports };
}

/** Scan the configured root folders for agent directories. */
export function discoverAgents(roots: string[], excludes: string[] = []): AgentInfo[] {
    return scanRoots(roots, excludes).agents;
}
