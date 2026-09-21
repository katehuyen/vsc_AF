import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AgentInfo } from './agents';
import { SessionIndex } from './sessions';

/**
 * Skills inventory: Agent Skills (SKILL.md folders) an agent can load,
 * read from the same directories Claude Code reads — the agent's
 * .claude/skills (agent scope) and ~/.claude/skills (user scope, shared by
 * every agent) — plus REAL usage counts aggregated from transcripts
 * (Skill tool calls and typed /slash-command invocations).
 */

export interface SkillDef {
    name: string;
    description: string;
    /** SKILL.md path */
    source: string;
    /** folder the skill lives in (what gets removed) */
    dir: string;
    scope: 'agent' | 'user';
}

function parseSkillMd(file: string): { name?: string; description?: string } {
    try {
        const raw = fs.readFileSync(file, 'utf8');
        const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
        if (!fm) { return {}; }
        const out: { name?: string; description?: string } = {};
        for (const line of fm[1].split('\n')) {
            const kv = /^(name|description):\s*(.+)$/.exec(line.trim());
            if (kv && !out[kv[1] as 'name' | 'description']) {
                out[kv[1] as 'name' | 'description'] = kv[2].trim().replace(/^["']|["']$/g, '');
            }
        }
        return out;
    } catch {
        return {};
    }
}

/** Directories that can hold skills for an agent, in shadowing order. */
export function skillsDirsFor(agent: AgentInfo): { dir: string; scope: 'agent' | 'user' }[] {
    return [
        { dir: path.join(agent.dir, '.claude', 'skills'), scope: 'agent' },
        { dir: path.join(os.homedir(), '.claude', 'skills'), scope: 'user' }
    ];
}

export function readAgentSkills(agent: AgentInfo): SkillDef[] {
    const out: SkillDef[] = [];
    const seen = new Set<string>();
    for (const { dir, scope } of skillsDirsFor(agent)) {
        let entries: string[] = [];
        try { entries = fs.readdirSync(dir); } catch { continue; }
        for (const entry of entries) {
            const skillDir = path.join(dir, entry);
            const source = path.join(skillDir, 'SKILL.md');
            try {
                if (!fs.statSync(skillDir).isDirectory() || !fs.existsSync(source)) { continue; }
            } catch { continue; }
            const meta = parseSkillMd(source);
            const name = meta.name ?? entry;
            if (seen.has(name)) { continue; } // agent scope shadows user scope
            seen.add(name);
            out.push({ name, description: meta.description ?? '', source, dir: skillDir, scope });
        }
    }
    return out.sort((a, b) =>
        a.scope === b.scope ? a.name.localeCompare(b.name) : a.scope === 'agent' ? -1 : 1);
}

/** Real usage: Skill tool calls + typed /commands from an agent's sessions. */
export function skillUsage(index: SessionIndex, agentId: string, sinceMs: number): Map<string, number> {
    const cutoff = Date.now() - sinceMs;
    const usage = new Map<string, number>();
    for (const session of index.forAgent(agentId)) {
        if (session.lastTs < cutoff) { continue; }
        for (const [skill, count] of Object.entries(session.skillCalls)) {
            usage.set(skill, (usage.get(skill) ?? 0) + count);
        }
    }
    return usage;
}

/** Approximate last-used time per skill: newest session that invoked it. */
export function skillLastUsed(index: SessionIndex, agentId: string): Map<string, number> {
    const last = new Map<string, number>();
    for (const session of index.forAgent(agentId)) {
        for (const skill of Object.keys(session.skillCalls)) {
            last.set(skill, Math.max(last.get(skill) ?? 0, session.lastTs));
        }
    }
    return last;
}

/** Copy a skill folder into another agent's .claude/skills (fleet management). */
export function copySkillTo(skill: SkillDef, target: AgentInfo): string {
    const destDir = path.join(target.dir, '.claude', 'skills', path.basename(skill.dir));
    if (fs.existsSync(destDir)) { throw new Error(`"${skill.name}" already exists on ${target.name}`); }
    fs.mkdirSync(path.dirname(destDir), { recursive: true });
    fs.cpSync(skill.dir, destDir, { recursive: true });
    return destDir;
}

/**
 * Move a skill between scopes: agent → ~/.claude/skills (share with every
 * agent) or user → this agent's .claude/skills (make it private).
 *
 * `home` overrides where "user scope" is — the same override every other reader
 * in core/toolbox.ts takes. Without it this reached for the real `os.homedir()`
 * unconditionally, which meant a test of the share could only be written by
 * writing into the machine's own `~/.claude`.
 */
export function moveSkillScope(skill: SkillDef, agent: AgentInfo, home?: string): string {
    const destRoot = skill.scope === 'agent'
        ? path.join(home || os.homedir(), '.claude', 'skills')
        : path.join(agent.dir, '.claude', 'skills');
    const destDir = path.join(destRoot, path.basename(skill.dir));
    if (fs.existsSync(destDir)) {
        throw new Error(`"${skill.name}" already exists in the ${skill.scope === 'agent' ? 'user' : 'agent'} scope`);
    }
    fs.mkdirSync(destRoot, { recursive: true });
    try {
        fs.renameSync(skill.dir, destDir);
    } catch {
        // Cross-device or locked file: copy + delete.
        fs.cpSync(skill.dir, destDir, { recursive: true });
        fs.rmSync(skill.dir, { recursive: true, force: true });
    }
    return destDir;
}

const skillMdTemplate = (name: string, description: string) => `---
name: ${name}
description: ${description}
---

Instructions the agent follows when this skill is invoked (as /${name} or via
the Skill tool). Describe the steps, the tools to use and the expected output;
keep it focused on one capability.
`;

/** Scaffold .claude/skills/<name>/SKILL.md inside the agent's folder. */
export function addSkill(agent: AgentInfo, name: string, description: string): string {
    const dir = path.join(agent.dir, '.claude', 'skills', name);
    const file = path.join(dir, 'SKILL.md');
    if (fs.existsSync(file)) { throw new Error(`skill "${name}" already exists (${file})`); }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, skillMdTemplate(name, description), 'utf8');
    return file;
}

