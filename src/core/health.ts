import { AgentInfo } from './agents';
import { SessionIndex } from './sessions';
import { hashString, safeReadFile } from './util';

export type Severity = 'error' | 'warning' | 'info';

export interface Insight {
    severity: Severity;
    agentId?: string;
    agentName: string;
    category: string;
    message: string;
    filePath?: string;
    guideAnchor: string;
}

export interface HealthConfig {
    staleMemoryDays: number;
    contextBudgetTokens: number;
}

const SHARED_CANDIDATE_EXCLUDES = new Set(['memory.md']);

export function buildInsights(
    agents: AgentInfo[],
    index: SessionIndex,
    cfg: HealthConfig
): Insight[] {
    const insights: Insight[] = [];
    const now = Date.now();

    for (const agent of agents) {
        // 1) Fixed context load budget
        if (agent.contextLoad.total > cfg.contextBudgetTokens) {
            insights.push({
                severity: 'warning',
                agentId: agent.id,
                agentName: agent.name,
                category: 'context-load',
                message: `Fixed context load ~${agent.contextLoad.total.toLocaleString()} tokens exceeds budget of ${cfg.contextBudgetTokens.toLocaleString()} (paid every session).`,
                filePath: agent.claudeMdPath,
                guideAnchor: 'saglik-baglam-yuku'
            });
        }

        // 2) Memory index consistency
        if (agent.memoryIndexPath) {
            const idxContent = safeReadFile(agent.memoryIndexPath) ?? '';
            const referenced = new Set<string>();
            for (const m of idxContent.matchAll(/\]\(([^)]+\.md)\)/gi)) {
                referenced.add(m[1].toLowerCase().split('/').pop() ?? '');
            }
            for (const m of idxContent.matchAll(/\[\[([^\]]+)\]\]/g)) {
                referenced.add(m[1].toLowerCase() + '.md');
            }
            const onDisk = new Set(agent.memoryFiles.map(f => f.name.toLowerCase()));
            for (const ref of referenced) {
                if (ref && !onDisk.has(ref)) {
                    insights.push({
                        severity: 'warning',
                        agentId: agent.id,
                        agentName: agent.name,
                        category: 'memory-index',
                        message: `MEMORY.md references "${ref}" but the file does not exist.`,
                        filePath: agent.memoryIndexPath,
                        guideAnchor: 'saglik-hafiza-indeksi'
                    });
                }
            }
            for (const f of agent.memoryFiles) {
                const n = f.name.toLowerCase();
                if (n !== 'memory.md' && !referenced.has(n)) {
                    insights.push({
                        severity: 'info',
                        agentId: agent.id,
                        agentName: agent.name,
                        category: 'memory-index',
                        message: `Memory file "${f.name}" is not referenced in MEMORY.md (orphan — the agent may never recall it).`,
                        filePath: f.path,
                        guideAnchor: 'saglik-hafiza-indeksi'
                    });
                }
            }
        } else if (agent.memoryFiles.length > 0) {
            insights.push({
                severity: 'warning',
                agentId: agent.id,
                agentName: agent.name,
                category: 'memory-index',
                message: 'Agent has memory files but no MEMORY.md index.',
                filePath: agent.memoryDir,
                guideAnchor: 'saglik-hafiza-indeksi'
            });
        }

        // 3) Stale memory files
        const staleMs = cfg.staleMemoryDays * 24 * 3600 * 1000;
        for (const f of agent.memoryFiles) {
            if (now - f.mtime > staleMs) {
                insights.push({
                    severity: 'info',
                    agentId: agent.id,
                    agentName: agent.name,
                    category: 'stale-memory',
                    message: `"${f.name}" untouched for ${Math.round((now - f.mtime) / 86400000)} days — review or archive.`,
                    filePath: f.path,
                    guideAnchor: 'saglik-bayat-hafiza'
                });
            }
        }

        // 4) Oversized memory files
        for (const f of agent.memoryFiles) {
            if (f.size > 20_000) {
                insights.push({
                    severity: 'warning',
                    agentId: agent.id,
                    agentName: agent.name,
                    category: 'large-memory',
                    message: `"${f.name}" is ${(f.size / 1024).toFixed(0)} KB (~${f.tokens.toLocaleString()} tokens) — consider splitting.`,
                    filePath: f.path,
                    guideAnchor: 'saglik-buyuk-dosya'
                });
            }
        }

        // 5) Missing CLAUDE.md
        if (!agent.claudeMdPath) {
            insights.push({
                severity: 'error',
                agentId: agent.id,
                agentName: agent.name,
                category: 'identity',
                message: 'Agent folder has no CLAUDE.md identity file.',
                filePath: agent.dir,
                guideAnchor: 'saglik-kimlik'
            });
        }

        // 6) Session-based signals (last 7 days)
        const weekAgo = now - 7 * 24 * 3600 * 1000;
        const recent = index.forAgent(agent.id).filter(s => s.lastTs >= weekAgo);
        const toolCalls = recent.reduce((a, s) => a + s.toolCalls, 0);
        const errors = recent.reduce((a, s) => a + s.errors, 0);
        if (toolCalls >= 20 && errors / toolCalls > 0.1) {
            insights.push({
                severity: 'warning',
                agentId: agent.id,
                agentName: agent.name,
                category: 'error-rate',
                message: `High tool error rate over last 7 days: ${errors}/${toolCalls} (${Math.round(100 * errors / toolCalls)}%).`,
                guideAnchor: 'saglik-hata-orani'
            });
        }
    }

    // 7) Duplicate / shared memory files across agents
    const byName = new Map<string, { agent: AgentInfo; path: string; hash: number }[]>();
    for (const agent of agents) {
        for (const f of agent.memoryFiles) {
            const key = f.name.toLowerCase();
            if (SHARED_CANDIDATE_EXCLUDES.has(key)) { continue; }
            const list = byName.get(key) ?? [];
            list.push({ agent, path: f.path, hash: hashString(safeReadFile(f.path) ?? '') });
            byName.set(key, list);
        }
    }
    for (const [name, copies] of byName) {
        if (copies.length < 2) { continue; }
        const identical = copies.every(c => c.hash === copies[0].hash);
        const agentNames = copies.map(c => c.agent.name).join(', ');
        insights.push({
            severity: identical ? 'info' : 'warning',
            agentName: 'fleet',
            category: 'duplicate-memory',
            message: identical
                ? `"${name}" is duplicated identically across: ${agentNames}. Consider a single shared source.`
                : `"${name}" exists in ${agentNames} but the copies have DIVERGED — they may contradict each other.`,
            filePath: copies[0].path,
            guideAnchor: 'saglik-kopya-hafiza'
        });
    }

    const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
    insights.sort((a, b) => order[a.severity] - order[b.severity] || a.agentName.localeCompare(b.agentName));
    return insights;
}
