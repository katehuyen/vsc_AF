import * as fs from 'fs';
import * as path from 'path';
import { Duty, readDuties } from './duties';
import { estimateTokens, normPath, safeReadFile, safeStat } from './util';

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

function readAgent(dir: string): AgentInfo {
    const name = path.basename(dir);
    const agent: AgentInfo = {
        id: normPath(dir),
        name,
        dir,
        normDir: normPath(dir),
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

    const agentsMd = path.join(dir, '.agents', 'AGENTS.md');
    if (fs.existsSync(agentsMd)) {
        agent.agentsMdPath = agentsMd;
        agent.contextLoad.agentsMd = estimateTokens(safeReadFile(agentsMd) ?? '');
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

/** Scan the configured root folders for agent directories. */
export function discoverAgents(roots: string[]): AgentInfo[] {
    const agents: AgentInfo[] = [];
    const seen = new Set<string>();
    for (const root of roots) {
        if (!root || !fs.existsSync(root)) { continue; }
        // The root itself may be a single agent folder.
        if (isAgentDir(root) && !seen.has(normPath(root))) {
            seen.add(normPath(root));
            agents.push(readAgent(root));
            continue;
        }
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
        for (const e of entries) {
            if (!e.isDirectory() || e.name.startsWith('.')) { continue; }
            const dir = path.join(root, e.name);
            if (isAgentDir(dir) && !seen.has(normPath(dir))) {
                seen.add(normPath(dir));
                agents.push(readAgent(dir));
            }
        }
    }
    agents.sort((a, b) => a.name.localeCompare(b.name));
    return agents;
}
