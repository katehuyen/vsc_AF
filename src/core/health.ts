import { AgentInfo } from './agents';
import { claudeMdReferencesDuties, watchStatus } from './duties';
import { SessionIndex } from './sessions';
import { dayKey, fmtUSD, hashString, safeReadFile } from './util';

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
    /** Daily USD budgets by agent name; "*" applies to the whole fleet. */
    budgets?: Record<string, number>;
    /** Warn when this week's cost is >= factor × last week's. 0 disables. */
    trendFactor?: number;
}

const TREND_MIN_PREV_USD = 0.5;
const TREND_MIN_CURR_USD = 1;

function costBetween(sessions: { daily: Record<string, { cost: number }> }[], from: number, to: number): number {
    let total = 0;
    for (const s of sessions) {
        for (const [day, bucket] of Object.entries(s.daily)) {
            const ts = new Date(day + 'T12:00:00').getTime();
            if (ts >= from && ts < to) { total += bucket.cost; }
        }
    }
    return total;
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

        // 5b) Standing duties health
        if (agent.duties.length) {
            if (agent.claudeMdPath &&
                !claudeMdReferencesDuties(safeReadFile(agent.claudeMdPath) ?? '')) {
                insights.push({
                    severity: 'warning',
                    agentId: agent.id,
                    agentName: agent.name,
                    category: 'duties',
                    message: 'DUTIES.md exists but CLAUDE.md never references it — the agent may not follow its standing duties.',
                    filePath: agent.claudeMdPath,
                    guideAnchor: 'nobet-gorevleri'
                });
            }
            for (const duty of agent.duties) {
                if (duty.paused || !duty.watch) { continue; }
                const ws = watchStatus(duty.watch);
                if (ws && !ws.exists) {
                    insights.push({
                        severity: 'warning',
                        agentId: agent.id,
                        agentName: agent.name,
                        category: 'duties',
                        message: `Duty "${duty.title}" watches a missing path: ${duty.watch}`,
                        filePath: agent.dutiesPath,
                        guideAnchor: 'nobet-gorevleri'
                    });
                }
                if (!duty.action) {
                    insights.push({
                        severity: 'info',
                        agentId: agent.id,
                        agentName: agent.name,
                        category: 'duties',
                        message: `Duty "${duty.title}" has no Do: line — the agent knows where to look but not what to do.`,
                        filePath: agent.dutiesPath,
                        guideAnchor: 'nobet-gorevleri'
                    });
                }
            }
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

    // 6b) Duty compliance: agent had sessions this week but never touched DUTIES.md
    for (const agent of agents) {
        const activeDuties = agent.duties.filter(d => !d.paused);
        if (!activeDuties.length || !agent.dutiesPath) { continue; }
        const weekAgo = now - 7 * 24 * 3600 * 1000;
        const recent = index.forAgent(agent.id).filter(s => s.lastTs >= weekAgo);
        if (!recent.length) { continue; }
        const lastRead = Math.max(0, ...recent.map(s => s.dutiesReadTs ?? 0));
        if (!lastRead) {
            insights.push({
                severity: 'warning',
                agentId: agent.id,
                agentName: agent.name,
                category: 'duties',
                message: `Agent had ${recent.length} session(s) this week but never read DUTIES.md — its ${activeDuties.length} standing duties may be ignored.`,
                filePath: agent.claudeMdPath ?? agent.dutiesPath,
                guideAnchor: 'nobet-gorevleri'
            });
        }
    }

    // 6c) Weekly cost trend (per agent and fleet)
    const trendFactor = cfg.trendFactor ?? 2;
    if (trendFactor > 0) {
        const week = 7 * 24 * 3600 * 1000;
        const checkTrend = (label: string, agentId: string | undefined,
            sessions: { daily: Record<string, { cost: number }> }[]) => {
            const current = costBetween(sessions, now - week, now + 24 * 3600 * 1000);
            const previous = costBetween(sessions, now - 2 * week, now - week);
            if (previous >= TREND_MIN_PREV_USD && current >= TREND_MIN_CURR_USD &&
                current >= trendFactor * previous) {
                insights.push({
                    severity: 'warning',
                    agentId,
                    agentName: label,
                    category: 'trend',
                    message: `Weekly cost trend: ${fmtUSD(current)} this week vs ${fmtUSD(previous)} last week (${(current / previous).toFixed(1)}x).`,
                    guideAnchor: 'trend-uyarilari'
                });
            }
        };
        for (const agent of agents) {
            checkTrend(agent.name, agent.id, index.forAgent(agent.id));
        }
        checkTrend('fleet', undefined, index.all());
    }

    // 7) Daily budget checks (per agent and fleet-wide "*")
    if (cfg.budgets && Object.keys(cfg.budgets).length) {
        const today = dayKey(now);
        const todayCostOf = (agentId?: string): number => {
            const sessions = agentId ? index.forAgent(agentId) : index.all();
            return sessions.reduce((sum, s) => sum + (s.daily[today]?.cost ?? 0), 0);
        };
        for (const [name, limit] of Object.entries(cfg.budgets)) {
            if (!limit || limit <= 0) { continue; }
            const agent = name === '*' ? undefined : agents.find(a => a.name === name);
            if (name !== '*' && !agent) { continue; }
            const cost = todayCostOf(agent?.id);
            const label = name === '*' ? 'fleet' : name;
            if (cost >= limit) {
                insights.push({
                    severity: 'error',
                    agentId: agent?.id,
                    agentName: label,
                    category: 'budget',
                    message: `Daily budget exceeded: ${fmtUSD(cost)} of ${fmtUSD(limit)} (${Math.round(100 * cost / limit)}%).`,
                    guideAnchor: 'butce-uyarilari'
                });
            } else if (cost >= 0.8 * limit) {
                insights.push({
                    severity: 'warning',
                    agentId: agent?.id,
                    agentName: label,
                    category: 'budget',
                    message: `Approaching daily budget: ${fmtUSD(cost)} of ${fmtUSD(limit)} (${Math.round(100 * cost / limit)}%).`,
                    guideAnchor: 'butce-uyarilari'
                });
            }
        }
    }

    // 8) Duplicate / shared memory files across agents
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
