import * as fs from 'fs';
import * as path from 'path';
import { looksLikePlaintextSecret } from './secrets';
import { FarmSchedule, FarmTemplate, FarmTrigger, FarmWorkflow } from './tasks';

/**
 * E3 — Agent packs: template an agent for another machine or another person.
 * A pack is a single JSON file (.agentpack): identity + duties + tools +
 * the workflows/triggers/schedules/templates that reference the agent.
 * Secrets and personal memory NEVER enter a pack.
 */

export const PACK_FORMAT = 'agent-farm-pack';
export const PACK_VERSION = 1;
/** step/action agentId placeholder for "the exported agent itself". */
export const SELF_AGENT_MARKER = '{{self}}';

const agentMarker = (name: string) => `{{agent:${name}}}`;
const AGENT_MARKER_RE = /^\{\{agent:(.*)\}\}$/;

function packId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export interface AgentPackFileEntry {
    /** path relative to the agent folder, forward slashes. */
    path: string;
    content: string;
}

export interface AgentPack {
    format: string;
    version: number;
    name: string;
    exportedAt: number;
    files: AgentPackFileEntry[];
    workflows: FarmWorkflow[];
    triggers: FarmTrigger[];
    schedules: FarmSchedule[];
    templates: FarmTemplate[];
    notes: string[];
}

const FILE_CANDIDATES = [
    'CLAUDE.md',
    'DUTIES.md',
    '.agents/AGENTS.md',
    '.claude/settings.json',
    '.claude/settings.local.json',
    '.mcp.json'
];
const TEXT_EXTS = new Set([
    '.md', '.txt', '.json', '.js', '.ts', '.py', '.ps1', '.sh',
    '.bat', '.cmd', '.yaml', '.yml', '.toml', '.csv'
]);
const MAX_FILE_BYTES = 200_000;

function collectFile(agentDir: string, rel: string, files: AgentPackFileEntry[], warnings: string[]): void {
    const full = path.join(agentDir, rel);
    let st: fs.Stats;
    try { st = fs.statSync(full); } catch { return; }
    if (!st.isFile()) { return; }
    if (st.size > MAX_FILE_BYTES) {
        warnings.push(`skipped ${rel}: larger than ${Math.round(MAX_FILE_BYTES / 1000)} KB`);
        return;
    }
    if (!TEXT_EXTS.has(path.extname(rel).toLowerCase())) {
        warnings.push(`skipped ${rel}: not a known text format`);
        return;
    }
    let content: string;
    try { content = fs.readFileSync(full, 'utf8'); } catch { return; }
    const hit = looksLikePlaintextSecret(content);
    if (hit) {
        warnings.push(`skipped ${rel}: looks like it contains a credential (${hit})`);
        return;
    }
    files.push({ path: rel.replace(/\\/g, '/'), content });
}

export function buildAgentPack(
    agent: { id: string; name: string; dir: string },
    store: {
        workflows: FarmWorkflow[];
        triggers: FarmTrigger[];
        schedules: FarmSchedule[];
        templates: FarmTemplate[];
    }
): { pack: AgentPack; warnings: string[] } {
    const warnings: string[] = [];
    const files: AgentPackFileEntry[] = [];

    for (const rel of FILE_CANDIDATES) {
        collectFile(agent.dir, rel, files, warnings);
    }
    const toolsDir = path.join(agent.dir, 'tools');
    if (fs.existsSync(toolsDir)) {
        let entries: string[] = [];
        try { entries = fs.readdirSync(toolsDir); } catch { /* unreadable */ }
        for (const name of entries) {
            collectFile(agent.dir, path.join('tools', name), files, warnings);
        }
    }

    // Workflows that touch this agent, with machine-specific ids masked out.
    const workflows: FarmWorkflow[] = store.workflows
        .filter(w => w.steps.some(s => s.agentId === agent.id))
        .map(w => ({
            ...JSON.parse(JSON.stringify(w)) as FarmWorkflow,
            steps: (JSON.parse(JSON.stringify(w.steps)) as FarmWorkflow['steps']).map(s => ({
                ...s,
                agentId: s.agentId === agent.id ? SELF_AGENT_MARKER
                    : s.agentId ? agentMarker(s.agentName) : ''
            }))
        }));
    const workflowIds = new Set(workflows.map(w => w.id));

    const triggers: FarmTrigger[] = store.triggers
        .filter(t =>
            (t.action.kind === 'task' && t.action.agentId === agent.id) ||
            (t.action.kind === 'workflow' && workflowIds.has(t.action.workflowId)))
        .map(t => {
            const clone = JSON.parse(JSON.stringify(t)) as FarmTrigger;
            if (clone.action.kind === 'task') {
                clone.action.agentId = SELF_AGENT_MARKER;
            }
            // runtime state and the secret webhook token stay on this machine
            delete clone.lastFiredAt;
            delete clone.fireCount;
            delete clone.recentFirings;
            delete clone.token;
            return clone;
        });

    const schedules: FarmSchedule[] = store.schedules
        .filter(s => s.agentId === agent.id)
        .map(s => {
            const clone = JSON.parse(JSON.stringify(s)) as FarmSchedule;
            clone.agentId = SELF_AGENT_MARKER;
            delete clone.lastRunKey;
            return clone;
        });

    const templates: FarmTemplate[] = store.templates
        .filter(t => t.agentId === agent.id)
        .map(t => ({ ...t, agentId: SELF_AGENT_MARKER }));

    const pack: AgentPack = {
        format: PACK_FORMAT,
        version: PACK_VERSION,
        name: agent.name,
        exportedAt: Date.now(),
        files,
        workflows,
        triggers,
        schedules,
        templates,
        notes: [
            'memory/ is never exported — the agent starts with a fresh memory on import.',
            'Secrets are never exported. {secret:NAME} references keep working once the target machine stores the same secret names.',
            'Webhook trigger tokens are regenerated on import; triggers and schedules arrive disabled.'
        ]
    };
    return { pack, warnings };
}

export function writeAgentPack(file: string, pack: AgentPack): void {
    fs.writeFileSync(file, JSON.stringify(pack, null, 2), 'utf8');
}

export function readAgentPack(file: string): { pack?: AgentPack; error?: string } {
    let raw: string;
    try { raw = fs.readFileSync(file, 'utf8'); } catch (e) {
        return { error: 'cannot read file: ' + String((e as Error).message) };
    }
    let json: unknown;
    try { json = JSON.parse(raw); } catch { return { error: 'not valid JSON' }; }
    const p = json as Partial<AgentPack>;
    if (p.format !== PACK_FORMAT) { return { error: 'not an agent pack (format mismatch)' }; }
    if (typeof p.version !== 'number' || p.version > PACK_VERSION) {
        return { error: `pack version ${p.version} is newer than this extension understands` };
    }
    if (!p.name || !Array.isArray(p.files)) { return { error: 'pack is missing name/files' }; }
    return {
        pack: {
            format: PACK_FORMAT,
            version: p.version,
            name: p.name,
            exportedAt: p.exportedAt ?? 0,
            files: p.files.filter(f => f && typeof f.path === 'string' && typeof f.content === 'string'),
            workflows: Array.isArray(p.workflows) ? p.workflows : [],
            triggers: Array.isArray(p.triggers) ? p.triggers : [],
            schedules: Array.isArray(p.schedules) ? p.schedules : [],
            templates: Array.isArray(p.templates) ? p.templates : [],
            notes: Array.isArray(p.notes) ? p.notes : []
        }
    };
}

/** Write the pack's files into a (new) agent folder. Rejects path escapes. */
export function applyPackFiles(pack: AgentPack, targetDir: string): { written: string[]; skipped: string[] } {
    const written: string[] = [];
    const skipped: string[] = [];
    for (const f of pack.files) {
        const rel = f.path.replace(/\\/g, '/');
        if (rel.includes('..') || path.isAbsolute(rel)) { skipped.push(rel); continue; }
        const full = path.join(targetDir, rel);
        try {
            fs.mkdirSync(path.dirname(full), { recursive: true });
            fs.writeFileSync(full, f.content, 'utf8');
            written.push(rel);
        } catch { skipped.push(rel); }
    }
    return { written, skipped };
}

export interface ReboundPack {
    workflows: FarmWorkflow[];   // old ids preserved so trigger references can be remapped
    triggers: FarmTrigger[];     // fresh ids, disabled, new webhook tokens
    schedules: FarmSchedule[];   // fresh ids, disabled
    templates: FarmTemplate[];   // fresh ids
    warnings: string[];
}

/** Resolve {{self}} / {{agent:name}} markers against the importing machine's fleet. */
export function rebindPack(
    pack: AgentPack,
    self: { id: string; name: string },
    resolveByName: (name: string) => { id: string; name: string } | undefined
): ReboundPack {
    const warnings: string[] = [];
    const resolveAgent = (agentId: string, agentName: string): { id: string; name: string } | undefined => {
        if (agentId === SELF_AGENT_MARKER) { return self; }
        const m = AGENT_MARKER_RE.exec(agentId);
        if (m) {
            const found = resolveByName(m[1]);
            if (found) { return found; }
            warnings.push(`agent "${m[1] || agentName}" not found here — rebound to ${self.name}`);
            return self;
        }
        return undefined; // '' → webhook/media step, leave as-is
    };

    const workflows = pack.workflows.map(w => ({
        ...w,
        steps: w.steps.map(s => {
            const bound = resolveAgent(s.agentId, s.agentName);
            return bound ? { ...s, agentId: bound.id, agentName: bound.name } : { ...s };
        })
    }));

    const triggers = pack.triggers.map(t => {
        const clone = JSON.parse(JSON.stringify(t)) as FarmTrigger;
        clone.id = packId();
        clone.enabled = false;
        if (clone.type === 'webhook') { clone.token = packId() + packId(); }
        if (clone.action.kind === 'task') {
            const bound = resolveAgent(clone.action.agentId, clone.action.agentName);
            if (bound) {
                clone.action.agentId = bound.id;
                clone.action.agentName = bound.name;
            }
        }
        if (clone.type === 'watch' && clone.watchPath && !fs.existsSync(clone.watchPath)) {
            warnings.push(`trigger "${clone.title}": watch path does not exist here (${clone.watchPath}) — fix it before enabling`);
        }
        return clone;
    });

    const schedules = pack.schedules.map(s => {
        const clone = JSON.parse(JSON.stringify(s)) as FarmSchedule;
        clone.id = packId();
        clone.enabled = false;
        const bound = resolveAgent(clone.agentId, clone.agentName);
        if (bound) {
            clone.agentId = bound.id;
            clone.agentName = bound.name;
        }
        return clone;
    });

    const templates = pack.templates.map(t => {
        const clone = { ...t, id: packId() };
        const bound = clone.agentId ? resolveAgent(clone.agentId, clone.agentName ?? '') : undefined;
        if (bound) {
            clone.agentId = bound.id;
            clone.agentName = bound.name;
        }
        return clone;
    });

    return { workflows, triggers, schedules, templates, warnings };
}
