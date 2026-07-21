import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AgentInfo } from './agents';
import { readAgentMcpServers, readDisabledServers } from './mcp';
import { estimateTokens, safeReadFile, safeStat } from './util';

/**
 * Toolbox — ONE inventory of everything that extends a claude installation,
 * at BOTH levels: user scope (~/.claude + ~/.claude.json, shared by every
 * agent) and agent scope (each agent folder's .claude / .mcp.json). The
 * Capability Matrix answers "who USES what"; the Toolbox answers "what is
 * INSTALLED where, what exactly is it, and how do I manage it".
 *
 * Everything is read from the same files Claude Code itself reads — there is
 * no separate registry to drift out of sync. Secrets (tokens, auth headers)
 * are masked before anything leaves this module.
 */

export type ToolboxKind =
    | 'skill'      // .claude/skills/<name>/SKILL.md folders
    | 'subagent'   // .claude/agents/*.md  (Claude Code subagent definitions)
    | 'command'    // .claude/commands/**/*.md  (/slash commands)
    | 'mcp'        // mcpServers from ~/.claude.json (user) / .mcp.json + settings (agent)
    | 'hook'       // hooks blocks inside settings.json / settings.local.json
    | 'plugin'     // plugin marketplaces + their catalogs under ~/.claude/plugins
    | 'style'      // .claude/output-styles/*.md
    | 'settings';  // the config files themselves (existence + top-level keys)

export interface ToolboxItem {
    kind: ToolboxKind;
    name: string;
    description: string;
    scope: 'user' | 'agent';
    agentId?: string;
    agentName?: string;
    /** File to open for this item. */
    source: string;
    /** Folder that holds the item when it is folder-shaped (skill, plugin marketplace). */
    dir?: string;
    /** Kind-specific facts, safe to display (secrets already masked). */
    detail: Record<string, unknown>;
}

export interface ToolboxInventory {
    generatedAt: number;
    items: ToolboxItem[];
    /** kind → how many at each scope (settings counts only existing files). */
    counts: Record<ToolboxKind, { user: number; agent: number }>;
}

export const TOOLBOX_KINDS: ToolboxKind[] = [
    'skill', 'subagent', 'command', 'mcp', 'hook', 'plugin', 'style', 'settings'
];

export const KIND_LABELS: Record<ToolboxKind, string> = {
    skill: 'Skills',
    subagent: 'Subagents',
    command: 'Commands',
    mcp: 'MCP Servers',
    hook: 'Hooks',
    plugin: 'Plugins',
    style: 'Output Styles',
    settings: 'Settings Files'
};

// ---------------------------------------------------------------- paths

export function userClaudeDir(home = os.homedir()): string {
    return path.join(home, '.claude');
}

/** The CLI's global state file — also where USER-scope MCP servers live. */
export function userConfigJson(home = os.homedir()): string {
    return path.join(home, '.claude.json');
}

// ---------------------------------------------------------------- helpers

function listDirs(dir: string): string[] {
    try {
        return fs.readdirSync(dir, { withFileTypes: true })
            .filter(e => e.isDirectory())
            .map(e => path.join(dir, e.name));
    } catch { return []; }
}

function listMdFiles(dir: string, depth = 3): string[] {
    if (depth < 0) { return []; }
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
    const out: string[] = [];
    for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { out.push(...listMdFiles(p, depth - 1)); }
        else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) { out.push(p); }
    }
    return out;
}

/** name/description/tools/model… from a markdown frontmatter block. */
export function parseFrontmatter(raw: string): Record<string, string> {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
    const out: Record<string, string> = {};
    if (!fm) { return out; }
    for (const line of fm[1].split('\n')) {
        const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line.trim());
        if (kv && kv[2] && out[kv[1]] === undefined) {
            out[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
        }
    }
    return out;
}

/** First non-frontmatter, non-heading text line — fallback description. */
function firstTextLine(raw: string): string {
    const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---/, '');
    for (const line of body.split('\n')) {
        const t = line.trim();
        if (t && !t.startsWith('#') && !t.startsWith('<!--')) { return t.slice(0, 200); }
    }
    return '';
}

const SECRET_KEY = /key|token|secret|password|credential|auth/i;

/**
 * Deep-copy a config object with secret-looking string values masked. Keys
 * matching key/token/secret/password/credential/auth keep only a 4-char tail
 * so the user can still tell WHICH credential is wired without exposing it.
 */
export function maskSecrets<T>(value: T, keyHint = ''): T {
    if (typeof value === 'string') {
        if (SECRET_KEY.test(keyHint) && value.length > 6) {
            return ('••••' + value.slice(-4)) as unknown as T;
        }
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(v => maskSecrets(v, keyHint)) as unknown as T;
    }
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = maskSecrets(v, k);
        }
        return out as unknown as T;
    }
    return value;
}

function readJson(file: string): Record<string, unknown> | undefined {
    const raw = safeReadFile(file);
    if (raw === undefined) { return undefined; }
    try {
        const v = JSON.parse(raw.replace(/^﻿/, ''));
        return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : undefined;
    } catch { return undefined; }
}

// ---------------------------------------------------------------- scanners (pure, dir-based)

export function scanSkillsDir(dir: string): { name: string; description: string; source: string; dir: string }[] {
    const out: { name: string; description: string; source: string; dir: string }[] = [];
    for (const skillDir of listDirs(dir)) {
        const source = path.join(skillDir, 'SKILL.md');
        const raw = safeReadFile(source);
        if (raw === undefined) { continue; }
        const meta = parseFrontmatter(raw);
        out.push({
            name: meta.name ?? path.basename(skillDir),
            description: meta.description ?? firstTextLine(raw),
            source,
            dir: skillDir
        });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function scanSubagentsDir(dir: string): {
    name: string; description: string; source: string; tools?: string; model?: string;
}[] {
    return listMdFiles(dir).map(file => {
        const raw = safeReadFile(file) ?? '';
        const meta = parseFrontmatter(raw);
        return {
            name: meta.name ?? path.basename(file, '.md'),
            description: meta.description ?? firstTextLine(raw),
            source: file,
            tools: meta.tools,
            model: meta.model
        };
    }).sort((a, b) => a.name.localeCompare(b.name));
}

/** Commands are namespaced by folder: commands/frontend/component.md → /frontend:component */
export function scanCommandsDir(dir: string): {
    name: string; description: string; source: string; argumentHint?: string; allowedTools?: string; model?: string;
}[] {
    return listMdFiles(dir).map(file => {
        const raw = safeReadFile(file) ?? '';
        const meta = parseFrontmatter(raw);
        const rel = path.relative(dir, file).replace(/\.md$/i, '');
        const name = '/' + rel.split(path.sep).join(':');
        return {
            name,
            description: meta.description ?? firstTextLine(raw),
            source: file,
            argumentHint: meta['argument-hint'],
            allowedTools: meta['allowed-tools'],
            model: meta.model
        };
    }).sort((a, b) => a.name.localeCompare(b.name));
}

export function scanStylesDir(dir: string): { name: string; description: string; source: string }[] {
    return listMdFiles(dir, 1).map(file => {
        const raw = safeReadFile(file) ?? '';
        const meta = parseFrontmatter(raw);
        return {
            name: meta.name ?? path.basename(file, '.md'),
            description: meta.description ?? firstTextLine(raw),
            source: file
        };
    }).sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- MCP (user scope)

export interface UserMcpServer {
    name: string;
    transport: string;
    commandOrUrl: string;
    source: string;
    /** full definition, secrets masked */
    def: Record<string, unknown>;
}

export function readUserMcpServers(home = os.homedir()): UserMcpServer[] {
    const file = userConfigJson(home);
    const json = readJson(file);
    const servers = json?.mcpServers;
    if (!servers || typeof servers !== 'object') { return []; }
    return Object.entries(servers as Record<string, Record<string, unknown>>).map(([name, def]) => {
        const url = typeof def.url === 'string' ? def.url : '';
        const command = typeof def.command === 'string' ? def.command : '';
        const args = Array.isArray(def.args) ? def.args.join(' ') : '';
        const transport = String(def.type ?? def.transport ?? (url ? 'http' : command ? 'stdio' : 'unknown'));
        return {
            name,
            transport,
            commandOrUrl: url || [command, args].filter(Boolean).join(' '),
            source: file,
            def: maskSecrets(def)
        };
    }).sort((a, b) => a.name.localeCompare(b.name));
}

/** Raw (UNMASKED) user-scope server definition — for probing only, never for display. */
export function readUserMcpServerRaw(name: string, home = os.homedir()): Record<string, unknown> | undefined {
    const json = readJson(userConfigJson(home));
    const servers = json?.mcpServers as Record<string, Record<string, unknown>> | undefined;
    return servers?.[name];
}

/**
 * Remove a user-scope MCP server from ~/.claude.json. The file is the CLI's
 * live state store, so the edit is surgical (parse → delete one key → write)
 * with a one-time .afbak backup next to it.
 */
export function removeUserMcpServer(name: string, home = os.homedir()): boolean {
    const file = userConfigJson(home);
    try {
        const raw = fs.readFileSync(file, 'utf8');
        const json = JSON.parse(raw) as Record<string, unknown>;
        const servers = json.mcpServers as Record<string, unknown> | undefined;
        if (!servers || !(name in servers)) { return false; }
        const backup = file + '.afbak';
        if (!fs.existsSync(backup)) { fs.copyFileSync(file, backup); }
        delete servers[name];
        fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf8');
        return true;
    } catch { return false; }
}

/** Add (or replace) a user-scope MCP server in ~/.claude.json. */
export function addUserMcpServer(name: string, def: Record<string, unknown>, home = os.homedir()): boolean {
    const file = userConfigJson(home);
    try {
        const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '{}';
        const json = JSON.parse(raw) as Record<string, unknown>;
        const backup = file + '.afbak';
        if (fs.existsSync(file) && !fs.existsSync(backup)) { fs.copyFileSync(file, backup); }
        const servers = (json.mcpServers && typeof json.mcpServers === 'object')
            ? json.mcpServers as Record<string, unknown> : {};
        servers[name] = def;
        json.mcpServers = servers;
        fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf8');
        return true;
    } catch { return false; }
}

// ---------------------------------------------------------------- hooks

export interface HookEntry {
    event: string;
    matcher: string;
    command: string;
    source: string;
}

interface HooksJson {
    hooks?: Record<string, { matcher?: string; hooks?: { type?: string; command?: string }[] }[]>;
}

export function readHooksFrom(file: string): HookEntry[] {
    const json = readJson(file) as HooksJson | undefined;
    if (!json?.hooks) { return []; }
    const out: HookEntry[] = [];
    for (const [event, groups] of Object.entries(json.hooks)) {
        if (!Array.isArray(groups)) { continue; }
        for (const group of groups) {
            for (const h of group.hooks ?? []) {
                if (h.command) {
                    out.push({ event, matcher: group.matcher ?? '', command: h.command, source: file });
                }
            }
        }
    }
    return out;
}

/**
 * Remove one hook command from its settings file (matched by event + matcher +
 * exact command). Empty matcher groups / events are pruned; .afbak backup.
 */
export function removeHookEntry(entry: HookEntry): boolean {
    try {
        const raw = fs.readFileSync(entry.source, 'utf8');
        const json = JSON.parse(raw) as HooksJson & Record<string, unknown>;
        const groups = json.hooks?.[entry.event];
        if (!groups) { return false; }
        let removed = false;
        for (const group of groups) {
            const before = group.hooks?.length ?? 0;
            group.hooks = (group.hooks ?? []).filter(h =>
                !(h.command === entry.command && (group.matcher ?? '') === entry.matcher));
            if ((group.hooks.length) !== before) { removed = true; }
        }
        if (!removed) { return false; }
        json.hooks![entry.event] = groups.filter(g => (g.hooks ?? []).length > 0);
        if (json.hooks![entry.event].length === 0) { delete json.hooks![entry.event]; }
        if (Object.keys(json.hooks!).length === 0) { delete (json as Record<string, unknown>).hooks; }
        const backup = entry.source + '.afbak';
        if (!fs.existsSync(backup)) { fs.copyFileSync(entry.source, backup); }
        fs.writeFileSync(entry.source, JSON.stringify(json, null, 2) + '\n', 'utf8');
        return true;
    } catch { return false; }
}

// ---------------------------------------------------------------- plugins

export interface PluginInfo {
    name: string;
    description: string;
    marketplace: string;
    category?: string;
    author?: string;
    homepage?: string;
    enabled: boolean;
    /** marketplace.json that lists it */
    source: string;
}

export interface MarketplaceInfo {
    name: string;
    installLocation: string;
    lastUpdated?: string;
    pluginCount: number;
    source: string;
}

/** enabledPlugins across the user's settings files: "plugin@marketplace" → bool. */
export function readEnabledPlugins(home = os.homedir()): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const f of [
        path.join(userClaudeDir(home), 'settings.json'),
        path.join(userClaudeDir(home), 'settings.local.json')
    ]) {
        const json = readJson(f);
        const ep = json?.enabledPlugins;
        if (ep && typeof ep === 'object') {
            for (const [k, v] of Object.entries(ep as Record<string, unknown>)) {
                out[k] = v === true;
            }
        }
    }
    return out;
}

export function readMarketplaces(home = os.homedir()): { marketplaces: MarketplaceInfo[]; plugins: PluginInfo[] } {
    const kmFile = path.join(userClaudeDir(home), 'plugins', 'known_marketplaces.json');
    const known = readJson(kmFile) ?? {};
    const enabled = readEnabledPlugins(home);
    const marketplaces: MarketplaceInfo[] = [];
    const plugins: PluginInfo[] = [];
    for (const [name, def] of Object.entries(known)) {
        const d = def as Record<string, unknown>;
        const loc = typeof d.installLocation === 'string' ? d.installLocation : '';
        const manifest = loc ? path.join(loc, '.claude-plugin', 'marketplace.json') : '';
        const mp = manifest ? readJson(manifest) : undefined;
        const list = Array.isArray(mp?.plugins) ? mp!.plugins as Record<string, unknown>[] : [];
        marketplaces.push({
            name,
            installLocation: loc,
            lastUpdated: typeof d.lastUpdated === 'string' ? d.lastUpdated : undefined,
            pluginCount: list.length,
            source: manifest || kmFile
        });
        for (const p of list) {
            const pname = typeof p.name === 'string' ? p.name : '';
            if (!pname) { continue; }
            const author = p.author && typeof p.author === 'object'
                ? String((p.author as Record<string, unknown>).name ?? '') : '';
            plugins.push({
                name: pname,
                description: typeof p.description === 'string' ? p.description : '',
                marketplace: name,
                category: typeof p.category === 'string' ? p.category : undefined,
                author: author || undefined,
                homepage: typeof p.homepage === 'string' ? p.homepage : undefined,
                enabled: enabled[`${pname}@${name}`] === true,
                source: manifest
            });
        }
    }
    return { marketplaces, plugins };
}

/**
 * Flip "plugin@marketplace" in the user settings.json enabledPlugins map —
 * the same key Claude Code honors; it applies on the next session start.
 */
export function setPluginEnabled(pluginKey: string, on: boolean, home = os.homedir()): boolean {
    const file = path.join(userClaudeDir(home), 'settings.json');
    try {
        const json = readJson(file) ?? {};
        const ep = (json.enabledPlugins && typeof json.enabledPlugins === 'object')
            ? json.enabledPlugins as Record<string, boolean> : {};
        if (on) { ep[pluginKey] = true; }
        else { delete ep[pluginKey]; }
        if (Object.keys(ep).length) { json.enabledPlugins = ep; }
        else { delete json.enabledPlugins; }
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf8');
        return true;
    } catch { return false; }
}

// ---------------------------------------------------------------- settings files

function settingsItem(file: string, label: string, scope: 'user' | 'agent', agent?: AgentInfo): ToolboxItem | undefined {
    const st = safeStat(file);
    if (!st || !st.isFile()) { return undefined; }
    const detail: Record<string, unknown> = { sizeBytes: st.size, mtime: st.mtimeMs };
    if (file.endsWith('.json')) {
        const json = readJson(file);
        if (json) { detail.keys = Object.keys(json).sort(); }
    } else if (file.toLowerCase().endsWith('.md')) {
        detail.tokens = estimateTokens(safeReadFile(file) ?? '');
    }
    return {
        kind: 'settings', name: label, description: file, scope,
        agentId: agent?.id, agentName: agent?.name, source: file, detail
    };
}

// ---------------------------------------------------------------- backup-remove for file/folder items

/**
 * Remove a file- or folder-shaped item (skill folder, command/subagent/style
 * file) with a one-time backup in a sibling <category>.afbak/ folder — outside
 * the scanned directory, so claude no longer discovers it but nothing is lost.
 */
export function removeWithBackup(target: string): boolean {
    try {
        const st = fs.statSync(target);
        const parent = path.dirname(target);
        const backupRoot = parent + '.afbak';
        const backup = path.join(backupRoot, path.basename(target));
        if (!fs.existsSync(backup)) {
            fs.mkdirSync(backupRoot, { recursive: true });
            fs.cpSync(target, backup, { recursive: st.isDirectory() });
        }
        fs.rmSync(target, { recursive: true, force: true });
        return true;
    } catch { return false; }
}

// ---------------------------------------------------------------- scaffolds

const SKILL_TEMPLATE = (name: string, description: string) => `---
name: ${name}
description: ${description}
---

Instructions the agent follows when this skill is invoked (as /${name} or via
the Skill tool). Describe the steps, the tools to use and the expected output;
keep it focused on one capability.
`;

const COMMAND_TEMPLATE = (name: string, description: string) => `---
description: ${description}
---

Instructions executed when the user types /${name}. Use $ARGUMENTS (or $1, $2…)
where the user's arguments should land.
`;

const SUBAGENT_TEMPLATE = (name: string, description: string) => `---
name: ${name}
description: ${description}
---

You are the "${name}" subagent. Define here: what this agent specializes in,
how it should approach tasks, and what its final report must contain.
`;

/**
 * Scaffold a new skill/command/subagent under a scope root (user's ~/.claude
 * or an agent folder's .claude). Returns the created file.
 */
export function scaffoldItem(
    kind: 'skill' | 'command' | 'subagent',
    claudeDir: string,
    name: string,
    description: string
): string {
    const safe = name.trim().replace(/^\//, '').replace(/[^\w:-]+/g, '-');
    if (!safe) { throw new Error('name is required'); }
    let file: string;
    let content: string;
    if (kind === 'skill') {
        file = path.join(claudeDir, 'skills', safe, 'SKILL.md');
        content = SKILL_TEMPLATE(safe, description);
    } else if (kind === 'command') {
        // ":"-namespaced names land in subfolders, mirroring how claude reads them
        file = path.join(claudeDir, 'commands', ...safe.split(':')) + '.md';
        content = COMMAND_TEMPLATE(safe.replace(/:/g, ':'), description);
    } else {
        file = path.join(claudeDir, 'agents', safe + '.md');
        content = SUBAGENT_TEMPLATE(safe, description);
    }
    if (fs.existsSync(file)) { throw new Error(`"${safe}" already exists (${file})`); }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
    return file;
}

// ---------------------------------------------------------------- the inventory

function pushDirKinds(items: ToolboxItem[], claudeDir: string, scope: 'user' | 'agent', agent?: AgentInfo): void {
    const tag = agent ? { agentId: agent.id, agentName: agent.name } : {};
    for (const s of scanSkillsDir(path.join(claudeDir, 'skills'))) {
        items.push({ kind: 'skill', scope, ...tag, name: s.name, description: s.description, source: s.source, dir: s.dir, detail: {} });
    }
    for (const a of scanSubagentsDir(path.join(claudeDir, 'agents'))) {
        items.push({
            kind: 'subagent', scope, ...tag, name: a.name, description: a.description, source: a.source,
            detail: { tools: a.tools, model: a.model }
        });
    }
    for (const c of scanCommandsDir(path.join(claudeDir, 'commands'))) {
        items.push({
            kind: 'command', scope, ...tag, name: c.name, description: c.description, source: c.source,
            detail: { argumentHint: c.argumentHint, allowedTools: c.allowedTools, model: c.model }
        });
    }
    for (const st of scanStylesDir(path.join(claudeDir, 'output-styles'))) {
        items.push({ kind: 'style', scope, ...tag, name: st.name, description: st.description, source: st.source, detail: {} });
    }
    for (const f of ['settings.json', 'settings.local.json']) {
        for (const h of readHooksFrom(path.join(claudeDir, f))) {
            items.push({
                kind: 'hook', scope, ...tag,
                name: h.event + (h.matcher ? ` · ${h.matcher}` : ''),
                description: h.command,
                source: h.source,
                detail: { event: h.event, matcher: h.matcher, command: h.command }
            });
        }
    }
}

export function buildToolboxInventory(agents: AgentInfo[], home = os.homedir()): ToolboxInventory {
    const items: ToolboxItem[] = [];
    const cDir = userClaudeDir(home);

    // ---- user scope
    pushDirKinds(items, cDir, 'user');
    for (const s of readUserMcpServers(home)) {
        items.push({
            kind: 'mcp', scope: 'user', name: s.name, description: s.commandOrUrl, source: s.source,
            detail: { transport: s.transport, def: s.def }
        });
    }
    const { marketplaces, plugins } = readMarketplaces(home);
    for (const m of marketplaces) {
        items.push({
            kind: 'plugin', scope: 'user', name: m.name,
            description: `marketplace · ${m.pluginCount} plugins`,
            source: m.source, dir: m.installLocation,
            detail: { isMarketplace: true, pluginCount: m.pluginCount, lastUpdated: m.lastUpdated }
        });
    }
    for (const p of plugins) {
        items.push({
            kind: 'plugin', scope: 'user', name: `${p.name}@${p.marketplace}`, description: p.description,
            source: p.source,
            detail: {
                plugin: p.name, marketplace: p.marketplace, category: p.category,
                author: p.author, homepage: p.homepage, enabled: p.enabled
            }
        });
    }
    for (const [file, label] of [
        [path.join(cDir, 'settings.json'), 'settings.json'],
        [path.join(cDir, 'settings.local.json'), 'settings.local.json'],
        [userConfigJson(home), '.claude.json (CLI state + user MCP)'],
        [path.join(cDir, 'keybindings.json'), 'keybindings.json'],
        [path.join(cDir, 'CLAUDE.md'), 'CLAUDE.md (user memory)']
    ] as const) {
        const it = settingsItem(file, label, 'user');
        if (it) { items.push(it); }
    }

    // ---- agent scope
    for (const agent of agents) {
        pushDirKinds(items, path.join(agent.dir, '.claude'), 'agent', agent);
        const disabled = readDisabledServers(agent);
        for (const s of readAgentMcpServers(agent)) {
            const raw = readJson(s.source);
            const servers = raw?.mcpServers as Record<string, unknown> | undefined;
            items.push({
                kind: 'mcp', scope: 'agent', agentId: agent.id, agentName: agent.name,
                name: s.name, description: s.commandOrUrl, source: s.source,
                detail: {
                    transport: s.transport,
                    disabled: disabled.has(s.name),
                    def: servers?.[s.name] ? maskSecrets(servers[s.name]) : undefined
                }
            });
        }
        for (const [file, label] of [
            [path.join(agent.dir, 'CLAUDE.md'), 'CLAUDE.md'],
            [path.join(agent.dir, '.claude', 'settings.json'), '.claude/settings.json'],
            [path.join(agent.dir, '.claude', 'settings.local.json'), '.claude/settings.local.json'],
            [path.join(agent.dir, '.mcp.json'), '.mcp.json']
        ] as const) {
            const it = settingsItem(file, label, 'agent', agent);
            if (it) { items.push(it); }
        }
    }

    const counts = Object.fromEntries(TOOLBOX_KINDS.map(k => [k, { user: 0, agent: 0 }])) as
        Record<ToolboxKind, { user: number; agent: number }>;
    for (const it of items) { counts[it.kind][it.scope]++; }
    return { generatedAt: Date.now(), items, counts };
}
