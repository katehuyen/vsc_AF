import { AgentInfo } from './agents';
import { dailyCostHistory, detectCostAnomaly, todayCost } from './anomaly';
import { antigravityStatus } from './antigravity';
import { claudeMdReferencesDuties, watchStatus } from './duties';
import { agentMcpConfigFiles, mcpUsage, readAgentMcpServers } from './mcp';
import { readMemoryFrontmatter } from './memusage';
import { readAgentSkills, skillUsage } from './skills';
import { lintPermissions } from './permlint';
import { looksLikePlaintextSecret } from './secrets';
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
    /** D2: clicking a suggestion insight opens the review flow for this suggestion. */
    suggestionId?: string;
}

export interface HealthConfig {
    staleMemoryDays: number;
    contextBudgetTokens: number;
    /** Daily USD budgets by agent name; "*" applies to the whole fleet. */
    budgets?: Record<string, number>;
    /** Warn when this week's cost is >= factor × last week's. 0 disables. */
    trendFactor?: number;
    /** G2: statistical cost-anomaly floor in USD (0 disables the detector). */
    anomalyMinUsd?: number;
    /** D1: judge quality scores (stamped with the scored session's activity time). */
    qualityScores?: { agentId?: string; sessionTs: number; score: number }[];
    /** D2: open instruction suggestions, surfaced as clickable insights. */
    suggestions?: { id: string; agentId: string; agentName: string; rule: string }[];
    /** H1: skip the permission audit when false (default on). */
    permissionLint?: boolean;
    /** H2: trigger reliability alerts, computed by the extension from task records. */
    triggerAlerts?: { severity: 'warning' | 'info'; title: string; message: string }[];
    /** Task reliability alerts (taskstats): fail-heavy agents, always-failing task families. */
    taskAlerts?: { severity: 'warning' | 'info'; agentId?: string; agentName: string; message: string }[];
    /** H3: latest failed pulse per agent. */
    pulseFailures?: { agentId: string; agentName: string; reason: string; ts: number }[];
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

        // 3b) Memory files without a frontmatter description — the description
        // is what recall (index line + semantic search) keys on.
        for (const f of agent.memoryFiles) {
            if (f.name.toLowerCase() === 'memory.md') { continue; }
            if (!readMemoryFrontmatter(f.path).description) {
                insights.push({
                    severity: 'info',
                    agentId: agent.id,
                    agentName: agent.name,
                    category: 'memory-frontmatter',
                    message: `"${f.name}" has no frontmatter description — index lines and recall quality depend on it.`,
                    filePath: f.path,
                    guideAnchor: 'hafiza-yonetimi'
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

        // 5d) Antigravity sync drift (only for agents that opted into the compat layer)
        {
            const ag = antigravityStatus(agent.dir);
            if (ag.state === 'conflict') {
                insights.push({
                    severity: 'warning',
                    agentId: agent.id,
                    agentName: agent.name,
                    category: 'antigravity',
                    message: 'CLAUDE.md and AGENTS.md have BOTH changed since the last Antigravity sync — reconcile before they contradict each other.',
                    filePath: agent.claudeMdPath,
                    guideAnchor: 'antigravity-uyumlulugu'
                });
            } else if (ag.state === 'claude-ahead' || ag.state === 'antigravity-ahead') {
                insights.push({
                    severity: 'info',
                    agentId: agent.id,
                    agentName: agent.name,
                    category: 'antigravity',
                    message: ag.state === 'claude-ahead'
                        ? 'CLAUDE.md changed since the last Antigravity sync — run "Sync Agent with Antigravity…" to update AGENTS.md.'
                        : 'AGENTS.md was edited (Antigravity side) — run "Sync Agent with Antigravity…" to carry the changes back to CLAUDE.md.',
                    filePath: agent.claudeMdPath,
                    guideAnchor: 'antigravity-uyumlulugu'
                });
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

    // 5e) Guardrail audit (H1): permission rules that grant too much
    if (cfg.permissionLint !== false) {
        for (const agent of agents) {
            if (!agent.settingsPath) { continue; }
            const raw = safeReadFile(agent.settingsPath);
            if (!raw) { continue; }
            const monthAgo = now - 30 * 24 * 3600 * 1000;
            const usage = new Map<string, number>();
            for (const s of index.forAgent(agent.id)) {
                if (s.lastTs < monthAgo) { continue; }
                for (const [tool, count] of Object.entries(s.tools)) {
                    usage.set(tool, (usage.get(tool) ?? 0) + count);
                }
            }
            for (const f of lintPermissions(raw, usage)) {
                insights.push({
                    severity: f.severity,
                    agentId: agent.id,
                    agentName: agent.name,
                    category: 'guardrail',
                    message: f.message,
                    filePath: agent.settingsPath,
                    guideAnchor: 'guardrail-denetcisi'
                });
            }
        }
    }

    // H2) Trigger reliability alerts (computed extension-side from task records)
    for (const a of cfg.triggerAlerts ?? []) {
        insights.push({
            severity: a.severity,
            agentName: 'fleet',
            category: 'trigger',
            message: a.message,
            guideAnchor: 'tetik-karnesi'
        });
    }

    for (const a of cfg.taskAlerts ?? []) {
        insights.push({
            severity: a.severity,
            agentId: a.agentId,
            agentName: a.agentName,
            category: 'task',
            message: a.message,
            guideAnchor: 'gorev-sagligi'
        });
    }

    // H3) Failed pulse checks: the agent's basic loop is broken
    for (const p of cfg.pulseFailures ?? []) {
        insights.push({
            severity: 'error',
            agentId: p.agentId,
            agentName: p.agentName,
            category: 'pulse',
            message: `Pulse check FAILED (${new Date(p.ts).toLocaleString()}): ${p.reason}`,
            guideAnchor: 'nabiz-kontrolu'
        });
    }

    // 5c) MCP hygiene: defined-but-unused servers, plaintext credentials in config
    for (const agent of agents) {
        const servers = readAgentMcpServers(agent);
        if (servers.length) {
            const monthAgo = now - 30 * 24 * 3600 * 1000;
            const hadSessions = index.forAgent(agent.id).some(s => s.lastTs >= monthAgo);
            if (hadSessions) {
                const usage = mcpUsage(index, agent.id, 30 * 24 * 3600 * 1000);
                for (const server of servers) {
                    if (!usage.get(server.name)) {
                        insights.push({
                            severity: 'info',
                            agentId: agent.id,
                            agentName: agent.name,
                            category: 'mcp',
                            message: `MCP server "${server.name}" is defined but unused in the last 30 days — consider removing it (it may still cost startup time/context).`,
                            filePath: server.source,
                            guideAnchor: 'mcp-yonetimi'
                        });
                    }
                }
            }
        }
        // Skill hygiene: agent-scope skills nobody used + skills claude can't pick well.
        const skills = readAgentSkills(agent);
        if (skills.length) {
            const monthAgo = now - 30 * 24 * 3600 * 1000;
            const hadSessions = index.forAgent(agent.id).some(s => s.lastTs >= monthAgo);
            const usage = hadSessions ? skillUsage(index, agent.id, 30 * 24 * 3600 * 1000) : undefined;
            for (const skill of skills) {
                // User-scope skills appear under every agent — report those once (first agent).
                if (!skill.description && (skill.scope === 'agent' || agent === agents[0])) {
                    insights.push({
                        severity: 'warning',
                        agentId: agent.id,
                        agentName: agent.name,
                        category: 'skills',
                        message: `Skill "${skill.name}" has no description in its SKILL.md frontmatter — claude uses the description to decide when to load a skill, so it will rarely fire.`,
                        filePath: skill.source,
                        guideAnchor: 'skill-yonetimi'
                    });
                }
                // Unused user-scope skills are reported per agent too noisily; flag agent scope only.
                if (usage && skill.scope === 'agent' && !usage.get(skill.name)) {
                    insights.push({
                        severity: 'info',
                        agentId: agent.id,
                        agentName: agent.name,
                        category: 'skills',
                        message: `Skill "${skill.name}" was not invoked in the last 30 days — its description still rides along in every session; remove or merge it if it earns nothing.`,
                        filePath: skill.source,
                        guideAnchor: 'skill-yonetimi'
                    });
                }
            }
        }
        for (const file of agentMcpConfigFiles(agent)) {
            const content = safeReadFile(file);
            if (!content) { continue; }
            const hit = looksLikePlaintextSecret(content);
            if (hit) {
                insights.push({
                    severity: 'warning',
                    agentId: agent.id,
                    agentName: agent.name,
                    category: 'secrets',
                    message: `Possible plaintext credential (${hit}) in ${file.split(/[\\/]/).pop()} — move it to the secrets vault.`,
                    filePath: file,
                    guideAnchor: 'sir-kasasi'
                });
            }
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

    // 6f) Statistical cost anomaly (G2): today far above the robust median band
    const anomalyMinUsd = cfg.anomalyMinUsd ?? 1;
    if (anomalyMinUsd > 0) {
        const checkAnomaly = (label: string, agentId: string | undefined,
            sessions: { daily: Record<string, { cost: number }> }[]) => {
            const anomaly = detectCostAnomaly(
                dailyCostHistory(sessions, 14, now),
                todayCost(sessions, now),
                { minUsd: anomalyMinUsd });
            if (anomaly) {
                insights.push({
                    severity: 'warning',
                    agentId,
                    agentName: label,
                    category: 'cost-anomaly',
                    message: `Cost anomaly: ${fmtUSD(anomaly.todayCost)} today is ${anomaly.factor.toFixed(1)}x the 14-day median (${fmtUSD(anomaly.median)}) — see the Cost Anomaly Report.`,
                    guideAnchor: 'maliyet-anomalisi'
                });
            }
        };
        for (const agent of agents) {
            checkAnomaly(agent.name, agent.id, index.forAgent(agent.id));
        }
        checkAnomaly('fleet', undefined, index.all());
    }

    // 6d) Quality scorecard (D1): declining or low judge scores per agent
    if (cfg.qualityScores?.length) {
        const week = 7 * 24 * 3600 * 1000;
        const avgIn = (agentId: string, from: number, to: number) => {
            const list = cfg.qualityScores!.filter(q =>
                q.agentId === agentId && q.sessionTs >= from && q.sessionTs < to);
            return {
                avg: list.length ? list.reduce((a, q) => a + q.score, 0) / list.length : undefined,
                count: list.length
            };
        };
        for (const agent of agents) {
            const cur = avgIn(agent.id, now - week, now + 24 * 3600 * 1000);
            const prev = avgIn(agent.id, now - 2 * week, now - week);
            if (cur.count >= 2 && prev.count >= 2 &&
                cur.avg !== undefined && prev.avg !== undefined &&
                cur.avg <= prev.avg - 0.8) {
                insights.push({
                    severity: 'warning',
                    agentId: agent.id,
                    agentName: agent.name,
                    category: 'quality',
                    message: `Quality trend declining: ${cur.avg.toFixed(1)}/5 this week vs ${prev.avg.toFixed(1)}/5 last week (${cur.count} samples).`,
                    guideAnchor: 'kalite-karnesi'
                });
                continue;
            }
            const recent = avgIn(agent.id, now - 2 * week, now + 24 * 3600 * 1000);
            if (recent.count >= 3 && recent.avg !== undefined && recent.avg < 3) {
                insights.push({
                    severity: 'warning',
                    agentId: agent.id,
                    agentName: agent.name,
                    category: 'quality',
                    message: `Low output quality: ${recent.avg.toFixed(1)}/5 average over ${recent.count} sampled sessions — review the agent's instructions.`,
                    guideAnchor: 'kalite-karnesi'
                });
            }
        }
    }

    // 6e) Instruction suggestions (D2): pending CLAUDE.md rule proposals
    for (const s of cfg.suggestions ?? []) {
        insights.push({
            severity: 'info',
            agentId: s.agentId,
            agentName: s.agentName,
            category: 'suggestion',
            message: `Suggested CLAUDE.md rule: "${s.rule}" — click to review.`,
            guideAnchor: 'talimat-onerileri',
            suggestionId: s.id
        });
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
