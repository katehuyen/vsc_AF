import * as path from 'path';
import { AgentInfo } from './agents';
import { argStr, BridgeRegistry, need, optStr } from './bridge';
import {
    addMcpServer, copyMcpServerTo, McpServerDef, readAgentMcpServers, readServerRawDef,
    removeMcpServer, setServerDisabled, updateMcpServer
} from './mcp';
import { loadProbeCache, McpProbeResult, McpServerConfig, probeMcpServer, saveProbeCache } from './mcpProbe';
import { queryMatches } from './query';
import { copySkillTo, moveSkillScope, readAgentSkills, SkillDef } from './skills';
import {
    buildToolboxInventory, HookEntry, readUserMcpServerRaw, removeHookEntry, removeUserMcpServer,
    removeWithBackup, scaffoldItem, scanSlashSources, setPluginEnabled, ToolboxItem, ToolboxKind,
    TOOLBOX_KINDS, userClaudeDir
} from './toolbox';
import { BUILTIN_SLASH, getSlashCommands } from './slashCommands';

/**
 * Toolbox bridge ops (§ constitution 19.C) — everything the Toolbox page can
 * show, an agent can query through the farm bridge: the full extension
 * inventory at both scopes, one item in detail, and a live MCP tools/list
 * probe. Registration lives here (not inline in extension.ts) so tests can
 * dispatch against a fresh registry with fixture deps.
 */

export interface ToolboxBridgeDeps {
    getAgents(): AgentInfo[];
    home?: string;
    /** disk cache for probe results (shared with the Toolbox panel) */
    cacheFile: string;
    /**
     * ‼️ K-29 — the slash commands a RUNNING session reported at `system:init`.
     *
     * Optional, and the op works without it: a catalog assembled from the disk
     * and the shipped table is the honest answer for "what could this agent
     * type", while this is the answer for "what can THAT session type". They are
     * different questions and only the second needs a live process.
     */
    reportedSlash?(sessionId: string): string[] | undefined;
}

export function probeCacheKey(scope: string, agentId: string | undefined, server: string): string {
    return `${scope}:${agentId ?? ''}:${server}`;
}

/** Resolve a server's raw (unmasked) config for probing — user or agent scope. */
export function resolveServerConfig(
    server: string, agent: AgentInfo | undefined, home?: string
): McpServerConfig | undefined {
    if (!agent) { return readUserMcpServerRaw(server, home) as McpServerConfig | undefined; }
    const def = readAgentMcpServers(agent).find(s => s.name === server);
    return def ? readServerRawDef(def) as McpServerConfig | undefined : undefined;
}

// ---------------------------------------------------------------------------
// WRITING — the one implementation the page and the bridge both call
//
// ‼️ THE PANEL USED TO OWN ALL OF THIS AND THE BRIDGE HAD NONE OF IT (B-2).
// The Toolbox page can install a skill, a subagent, a command and an MCP server,
// copy one to another agent, remove one, and switch a plugin or a server off —
// and an agent asked to do any of it had to be told "open the page yourself".
// Both sides now go through the functions below, which is the rule
// (_REF/agentfarm-dev.md): the handler CALLS what the UI calls, so the two can
// never answer differently. Everything that touches the disk still lives in
// core/skills.ts, core/mcp.ts and core/toolbox.ts; this is the composition
// above them, and it was the part that was duplicated.
// ---------------------------------------------------------------------------

/** `KEY=value` lines ⇄ an object. The env block an MCP server needs is a handful
 *  of pairs; a JSON box for it would be a JSON box people get wrong. */
export function parseToolPairs(text: string): Record<string, string> | undefined {
    const out: Record<string, string> = {};
    let any = false;
    for (const line of String(text || '').split(/\r?\n/)) {
        const t = line.trim();
        if (!t) { continue; }
        const eq = t.indexOf('=');
        if (eq <= 0) { continue; }
        out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
        any = true;
    }
    return any ? out : undefined;
}

export function formatToolPairs(v: unknown): string {
    if (!v || typeof v !== 'object') { return ''; }
    return Object.entries(v as Record<string, unknown>)
        .map(([k, val]) => `${k}=${String(val)}`).join('\n');
}

/** What either side asks for. Every field is a string because both callers
 *  arrive with strings — a webview form and a bridge request. */
export interface ToolWriteSpec {
    kind: string;
    /** new · edit (mcp only) · copy */
    mode?: string;
    /** '' = user scope; otherwise the agent the item belongs to / is made on. */
    agentId?: string;
    name?: string;
    description?: string;
    /** copy destination agent id */
    target?: string;
    transport?: string;
    command?: string;
    args?: string;
    env?: string;
    url?: string;
    headers?: string;
}

/** ‼️ A REFUSAL IS A SENTENCE, not a thrown error: the page prints it inside the
 *  form next to the button that was pressed, and the bridge hands it back as the
 *  op's error. One wording, both places. */
export interface ToolWriteResult {
    ok: boolean;
    /** why not, said the way the reader can act on */
    error?: string;
    /** what happened, when it did */
    note?: string;
    /** the file that was written, when there is one to open */
    file?: string;
}

const byId = (agents: AgentInfo[], id: string): AgentInfo | undefined =>
    agents.find(a => a.id === id);

function skillNode(agents: AgentInfo[], agentId: string, name: string):
    { agent: AgentInfo; skill: SkillDef } | undefined {
    const agent = byId(agents, agentId);
    const skill = agent ? readAgentSkills(agent).find(s => s.name === name) : undefined;
    return agent && skill ? { agent, skill } : undefined;
}

function mcpNode(agents: AgentInfo[], agentId: string, name: string):
    { agent: AgentInfo; server: McpServerDef } | undefined {
    const agent = byId(agents, agentId);
    const server = agent ? readAgentMcpServers(agent).find(s => s.name === name) : undefined;
    return agent && server ? { agent, server } : undefined;
}

/**
 * Install, edit or copy one tool.
 *
 * Three kinds scaffold a markdown file (skill · subagent · command) and one
 * writes a JSON entry (mcp). What this can state that no chain of boxes could:
 * an MCP server's `args`, its `env` and its `headers` — the fields that decide
 * whether the server it just wrote can actually authenticate.
 */
export function saveToolboxItem(
    spec: ToolWriteSpec, agents: AgentInfo[], home?: string
): ToolWriteResult {
    const s = (k: keyof ToolWriteSpec): string => String(spec[k] ?? '').trim();
    const kind = s('kind');
    const mode = s('mode') || 'new';
    const name = s('name');
    if (!name) { return { ok: false, error: 'It needs a name — that is what claude loads it by.' }; }

    if (kind === 'skill' || kind === 'subagent' || kind === 'command') {
        if (mode === 'copy') {
            const from = skillNode(agents, s('agentId'), name);
            const target = byId(agents, s('target'));
            if (!from) { return { ok: false, error: 'That skill is no longer where it was — refresh the page.' }; }
            if (!target) { return { ok: false, error: 'Pick the agent it is copied to.' }; }
            try { copySkillTo(from.skill, target); } catch (e) {
                return { ok: false, error: (e as Error).message ?? String(e) };
            }
            return { ok: true, note: `Copied to ${target.name}.` };
        }
        const agent = s('agentId') ? byId(agents, s('agentId')) : undefined;
        if (s('agentId') && !agent) { return { ok: false, error: 'That agent is gone — pick another scope.' }; }
        try {
            const claudeDir = agent ? path.join(agent.dir, '.claude') : userClaudeDir(home);
            const file = scaffoldItem(kind, claudeDir, name, s('description'));
            return { ok: true, file, note: `Created — ${path.basename(file)} is open for the instructions.` };
        } catch (e) {
            return { ok: false, error: (e as Error).message ?? String(e) };
        }
    }

    if (kind !== 'mcp') {
        return { ok: false, error: `"${kind}" is not something this makes — skill, subagent, command or mcp.` };
    }

    if (mode === 'copy') {
        const from = mcpNode(agents, s('agentId'), name);
        const target = byId(agents, s('target'));
        if (!from) { return { ok: false, error: 'That server is no longer where it was — refresh the page.' }; }
        if (!target) { return { ok: false, error: 'Pick the agent it is copied to.' }; }
        const file = copyMcpServerTo(from.server, target);
        if (!file) { return { ok: false, error: 'Could not read the server definition to copy it.' }; }
        return { ok: true, file, note: `Copied to ${target.name} (${path.basename(file)}).` };
    }

    // ‼️ AN EDIT KEEPS EVERYTHING IT WAS NOT ASKED ABOUT. The old editor read the
    // definition, replaced `command`+`args` (or `url`) from one text box and
    // wrote the object back — so any key it had no question for survived by
    // luck. Here the untouched keys are carried over explicitly, and the ones
    // this owns are rewritten.
    const http = s('transport') === 'http';
    const def: Record<string, unknown> = {};
    if (mode === 'edit') {
        const from = mcpNode(agents, s('agentId'), name);
        if (!from) { return { ok: false, error: 'That server is no longer where it was — refresh the page.' }; }
        const prev = readServerRawDef(from.server) ?? {};
        for (const [k, v] of Object.entries(prev)) {
            if (['command', 'args', 'env', 'url', 'headers', 'type'].indexOf(k) < 0) { def[k] = v; }
        }
    }
    if (http) {
        if (!s('url')) { return { ok: false, error: 'An http server needs its URL.' }; }
        def.type = 'http';
        def.url = s('url');
        const headers = parseToolPairs(s('headers'));
        if (headers) { def.headers = headers; }
    } else {
        if (!s('command')) { return { ok: false, error: 'A stdio server needs the command that starts it.' }; }
        def.command = s('command');
        const list = s('args').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
        if (list.length) { def.args = list; }
        const env = parseToolPairs(s('env'));
        if (env) { def.env = env; }
    }

    if (mode === 'edit') {
        const from = mcpNode(agents, s('agentId'), name);
        if (!from) { return { ok: false, error: 'That server is no longer where it was — refresh the page.' }; }
        if (!updateMcpServer(from.server, def)) {
            return { ok: false, error: 'Could not update it — the source file is unreadable or the entry is gone.' };
        }
        return {
            ok: true,
            note: `"${name}" updated — a one-time .afbak backup is kept. Restart the agent's sessions to load it.`
        };
    }

    const agent = byId(agents, s('agentId'));
    if (!agent) { return { ok: false, error: 'An MCP server belongs to an agent — pick which one.' }; }
    if (readAgentMcpServers(agent).some(x => x.name === name)) {
        return { ok: false, error: `${agent.name} already has a server called "${name}".` };
    }
    const written = addMcpServer(agent, name, def);
    return written
        ? { ok: true, file: written, note: `"${name}" added to ${agent.name} (${path.basename(written)}).` }
        : { ok: false, error: `Could not write the server into ${agent.name}'s config.` };
}

/** Take one item out, keeping a `.afbak` beside it. The caller does the asking:
 *  the page shows a modal, the bridge makes the request itself the consent. */
export function removeToolboxItem(
    item: ToolboxItem | undefined, agents: AgentInfo[], home?: string
): ToolWriteResult {
    if (!item?.kind || !item.name) { return { ok: false, error: 'Nothing named to remove.' }; }
    let done = false;
    switch (item.kind) {
        case 'skill':
            done = !!item.dir && removeWithBackup(item.dir);
            break;
        case 'subagent':
        case 'command':
        case 'style':
            done = removeWithBackup(item.source);
            break;
        case 'mcp':
            if (item.scope === 'user') {
                done = removeUserMcpServer(item.name, home);
            } else {
                const agent = byId(agents, item.agentId ?? '');
                const def = agent ? readAgentMcpServers(agent).find(s => s.name === item.name) : undefined;
                done = !!def && removeMcpServer(def);
            }
            break;
        case 'hook': {
            const d = item.detail as { event?: string; matcher?: string; command?: string };
            done = !!d.event && !!d.command && removeHookEntry({
                event: d.event, matcher: d.matcher ?? '', command: d.command, source: item.source
            } as HookEntry);
            break;
        }
        default:
            return { ok: false, error: `${item.kind} entries are not removable from here.` };
    }
    return done
        ? { ok: true, note: `Removed "${item.name}" — a .afbak copy is kept beside it.` }
        : { ok: false, error: `Could not remove "${item.name}" — see its source file.` };
}

export function registerToolboxOps(bridge: BridgeRegistry, deps: ToolboxBridgeDeps): void {
    const findAgent = (ref: string): AgentInfo => {
        const agents = deps.getAgents();
        const a = agents.find(x => x.id === ref) ??
            agents.find(x => x.name.toLowerCase() === ref.toLowerCase());
        need(a, `Agent "${ref}" not found — agents.list shows the current farm.`);
        return a as AgentInfo;
    };

    bridge.register([
        {
            op: 'toolbox.list',
            describe: 'Installed Claude extensions inventory (skills, subagents, commands, MCP, hooks, plugins, output styles, settings files) at user + agent scope. USER scope applies to every agent on this machine; an AGENT-scope entry shadows a user one of the same name — so "which one will actually run" is a question about both, which is why one op answers for both. ‼️ THE FILTERS ARE ANDed AND ARE THE PAGE\'S OWN FACETS, so a question the Toolbox page can ask, this op can ask: `q` is the extension\'s query language (two words = both · OR · -word · "phrase" · wildcard*) searched against the name, description, agent and whole definition; `state` (enabled|disabled) covers MCP servers and plugins with one word whichever the row speaks; `event` is a hook\'s lifecycle event, `transport` an MCP server\'s, `author` and `marketplace` a plugin\'s, `model` a subagent\'s. args: kind? (' + TOOLBOX_KINDS.join('|') + '), scope? (user|agent), agent? (name|id — implies agent scope), q?, state?, event?, transport?, author?, marketplace?, model?, limit? (default 500)',
            handler: (args) => {
                const kind = optStr(args, 'kind');
                need(!kind || TOOLBOX_KINDS.includes(kind as ToolboxKind),
                    `Unknown kind "${kind}" — one of: ${TOOLBOX_KINDS.join(', ')}`);
                const scope = optStr(args, 'scope');
                const agentRef = optStr(args, 'agent');
                const agentId = agentRef ? findAgent(agentRef).id : '';
                const q = optStr(args, 'q');
                const state = optStr(args, 'state').toLowerCase();
                need(!state || state === 'enabled' || state === 'disabled',
                    `state is "enabled" or "disabled", not "${state}"`);
                const limit = Math.max(1, Number(optStr(args, 'limit') || 500));
                // Each of these names one `detail` field, compared case-blind
                // because the values are somebody else's JSON, not ours.
                const DETAIL_FILTERS: [string, string][] = [
                    ['event', 'event'], ['transport', 'transport'],
                    ['author', 'author'], ['marketplace', 'marketplace'], ['model', 'model']
                ];
                const wanted = DETAIL_FILTERS
                    .map(([arg, field]) => [field, optStr(args, arg)] as [string, string])
                    .filter(([, v]) => !!v);

                const inv = buildToolboxInventory(deps.getAgents(), deps.home);
                const items = inv.items.filter(it => {
                    if (kind && it.kind !== kind) { return false; }
                    if (scope && it.scope !== scope) { return false; }
                    if (agentId && it.agentId !== agentId) { return false; }
                    for (const [field, want] of wanted) {
                        if (String(it.detail[field] ?? '').toLowerCase() !== want.toLowerCase()) { return false; }
                    }
                    if (state) {
                        // A plugin says `enabled`, an MCP server says `disabled`
                        // — one word for the caller, whichever the row speaks.
                        const on = it.kind === 'plugin' ? it.detail.enabled === true : it.detail.disabled !== true;
                        if ((state === 'enabled') !== on) { return false; }
                    }
                    if (q && !queryMatches(
                        `${it.name} ${it.description} ${it.agentName ?? ''} ${JSON.stringify(it.detail ?? {})}`, q
                    )) { return false; }
                    return true;
                });
                return {
                    counts: inv.counts,
                    total: inv.items.length,
                    matched: items.length,
                    items: items.slice(0, limit).map(it => ({
                        kind: it.kind, name: it.name, scope: it.scope, agent: it.agentName,
                        description: it.description.slice(0, 200), source: it.source
                    }))
                };
            }
        },
        {
            op: 'toolbox.slashCommands',
            describe: 'K-29 — WHAT THIS PLACE COULD TYPE AFTER A "/". Three sources, and they do not carry the same authority: what is on DISK (.claude/commands/**\/*.md namespaced by folder, so commands/git/cleanup.md is /git:cleanup · skill folders · an engine\'s .agents/workflows), what the running SESSION reported at system:init (pass `session` — the only source that knows THIS install; measured, a real Claude init named 47 including the skills on that machine), and a short shipped table per engine for the moment before any session exists. ‼️ Precedence is one-way: disk beats the session\'s report beats the shipped table, because a file is the only source with a description somebody wrote on purpose. Each row says `scope` (engine|local|skill|workflow), whether the session `reported` it, its `args` hint, its `source` file, and `tui: true` for a command whose whole job is to open an interactive menu — those can only answer with text in a hosted session. Reads only; nothing is run. args: engine? (claude|codex|gemini|agy|opencode — default claude), agent? (name|id, adds that agent\'s own folders), session? (a hosted session id, adds what it reported), provider? (X-97, carried through), q? (narrows by name or description; a leading / is optional)',
            handler: (args) => {
                const engine = (optStr(args, 'engine') || 'claude').toLowerCase();
                const agentRef = optStr(args, 'agent');
                const agent = agentRef ? findAgent(agentRef) : undefined;
                const sessionId = optStr(args, 'session');
                const reported = sessionId ? deps.reportedSlash?.(sessionId) : undefined;
                need(!sessionId || reported !== undefined,
                    `No hosted session "${sessionId}" — sessions.list shows what is running here.`);
                const disk = scanSlashSources(agent?.dir, deps.home);
                const list = getSlashCommands({
                    engine,
                    ...(optStr(args, 'provider') ? { provider: optStr(args, 'provider') } : {}),
                    sources: { ...disk, ...(reported ? { reported } : {}) },
                    q: optStr(args, 'q')
                });
                return {
                    engine,
                    agent: agent?.name ?? null,
                    session: sessionId || null,
                    // What each layer contributed, so a surprising list can be
                    // explained without reading the merge: an empty `reported`
                    // on a live session means that engine names none.
                    sources: {
                        builtin: (BUILTIN_SLASH[engine] ?? []).length,
                        reported: reported?.length ?? 0,
                        commands: disk.commands.length,
                        skills: disk.skills.length,
                        workflows: disk.workflows.length
                    },
                    count: list.length,
                    commands: list
                };
            }
        },
        {
            op: 'toolbox.inspect',
            describe: 'One inventory item in full detail (frontmatter facts, masked definition, hook command…). args: kind, name, agent? (name|id — omit for user scope)',
            handler: (args) => {
                const kind = argStr(args, 'kind');
                const name = argStr(args, 'name');
                const agentRef = optStr(args, 'agent');
                const agentId = agentRef ? findAgent(agentRef).id : '';
                const inv = buildToolboxInventory(deps.getAgents(), deps.home);
                const matches = inv.items.filter(it =>
                    it.kind === kind && it.name === name &&
                    (agentId ? it.agentId === agentId : it.scope === 'user'));
                need(matches.length, `No ${kind} named "${name}" at ${agentId ? 'agent' : 'user'} scope — toolbox.list shows what exists.`);
                return matches;
            }
        },
        {
            op: 'toolbox.mcptools',
            describe: 'Connect to a configured MCP server and list its actual tools (name, description, params). Cached; pass refresh:true to re-probe. args: server, agent? (name|id — omit for user scope), refresh?',
            handler: async (args) => {
                const server = argStr(args, 'server');
                const agentRef = optStr(args, 'agent');
                const agent = agentRef ? findAgent(agentRef) : undefined;
                const key = probeCacheKey(agent ? 'agent' : 'user', agent?.id, server);
                const cache = loadProbeCache(deps.cacheFile);
                if (args.refresh !== true && cache[key]?.ok) { return { cached: true, ...cache[key] }; }
                const cfg = resolveServerConfig(server, agent, deps.home);
                need(cfg, `MCP server "${server}" not found at ${agent ? agent.name : 'user'} scope — toolbox.list kind:mcp shows what exists.`);
                const result: McpProbeResult = await probeMcpServer(cfg as McpServerConfig);
                cache[key] = result;
                saveProbeCache(deps.cacheFile, cache);
                return { cached: false, ...result };
            }
        },
        // ---- writing (B-2) — the same four gestures the page has -------------
        {
            op: 'toolbox.install',
            describe: 'Install a tool, or edit an MCP server that already exists. skill · subagent · command each scaffold their markdown file and are then written by hand or by an agent; the file comes back as `file`. `mcp` writes a JSON entry and is the one with a shape worth reading: `transport` stdio (then `command`, `args` one per line, `env` as KEY=value lines) or http (then `url` and `headers` as KEY=value lines) — those are the fields that decide whether the server can authenticate, and no other route to this can state them. ‼️ SCOPE IS `agent`: with one, the tool belongs to that agent alone; without one a skill/subagent/command goes to USER scope, where every agent on this machine gets it. An MCP server always belongs to an agent. `mode:"edit"` (mcp only) keeps every key it was not asked about and rewrites the ones here; a `.afbak` copy is kept once. Restart that agent\'s sessions to load it. args: kind (skill|subagent|command|mcp), name, description?, agent? (name|id), mode? (new|edit, default new), transport?, command?, args?, env?, url?, headers?',
            handler: (args) => {
                const kind = argStr(args, 'kind');
                const agentRef = optStr(args, 'agent');
                const agent = agentRef ? findAgent(agentRef) : undefined;
                const res = saveToolboxItem({
                    kind, mode: optStr(args, 'mode') || 'new',
                    agentId: agent?.id ?? '', name: argStr(args, 'name'),
                    description: optStr(args, 'description'),
                    transport: optStr(args, 'transport'), command: optStr(args, 'command'),
                    args: optStr(args, 'args'), env: optStr(args, 'env'),
                    url: optStr(args, 'url'), headers: optStr(args, 'headers')
                }, deps.getAgents(), deps.home);
                need(res.ok, res.error ?? 'could not write it');
                return {
                    kind, name: argStr(args, 'name'),
                    scope: agent ? 'agent' : 'user', agent: agent?.name ?? null,
                    file: res.file ?? null, note: res.note ?? null
                };
            }
        },
        {
            op: 'toolbox.copy',
            describe: 'Copy a skill or an MCP server from one agent to another, or SHARE a skill up to user scope where every agent gets it. `to` names the receiving agent; `to:"user"` is the share, and it MOVES the skill (a copy at both scopes is a shadow, and which one runs is then a question about load order — see toolbox.list). Copying an MCP server carries its whole definition including env and headers. args: kind (skill|mcp), name, from (agent name|id), to (agent name|id, or "user" for a skill)',
            handler: (args) => {
                const kind = argStr(args, 'kind');
                need(kind === 'skill' || kind === 'mcp', `copy takes a skill or an mcp, not "${kind}"`);
                const name = argStr(args, 'name');
                const from = findAgent(argStr(args, 'from'));
                const to = argStr(args, 'to');
                if (kind === 'skill' && to.toLowerCase() === 'user') {
                    const node = skillNode(deps.getAgents(), from.id, name);
                    need(node, `${from.name} has no skill called "${name}" at agent scope — a user-scope skill is already shared.`);
                    const file = moveSkillScope((node as { skill: SkillDef }).skill, from, deps.home);
                    return { kind, name, from: from.name, to: 'user', file, note: `"${name}" is now shared by every agent.` };
                }
                const target = findAgent(to);
                const res = saveToolboxItem(
                    { kind, mode: 'copy', agentId: from.id, name, target: target.id },
                    deps.getAgents(), deps.home);
                need(res.ok, res.error ?? 'could not copy it');
                return { kind, name, from: from.name, to: target.name, file: res.file ?? null, note: res.note ?? null };
            }
        },
        {
            op: 'toolbox.remove',
            describe: '‼️ TAKE A TOOL OUT — and it is not undone by an undo, so name it exactly. A `.afbak` copy is left beside whatever went, which is the only way back. skill · subagent · command · style · mcp · hook are removable; a plugin is switched off instead (toolbox.enable), because it belongs to a marketplace and not to this machine. Without `agent` this removes the USER-scope entry, which every agent on the machine loses at once. args: kind, name, agent? (name|id — omit for user scope)',
            handler: (args) => {
                const kind = argStr(args, 'kind');
                const name = argStr(args, 'name');
                const agentRef = optStr(args, 'agent');
                const agentId = agentRef ? findAgent(agentRef).id : '';
                const inv = buildToolboxInventory(deps.getAgents(), deps.home);
                const item = inv.items.find(it => it.kind === kind && it.name === name &&
                    (agentId ? it.agentId === agentId : it.scope === 'user'));
                need(item, `No ${kind} named "${name}" at ${agentId ? 'agent' : 'user'} scope — toolbox.list shows what exists.`);
                const res = removeToolboxItem(item, deps.getAgents(), deps.home);
                need(res.ok, res.error ?? 'could not remove it');
                return { kind, name, scope: agentId ? 'agent' : 'user', note: res.note ?? null };
            }
        },
        {
            op: 'toolbox.enable',
            describe: 'Switch one thing on or off without removing it. An MCP SERVER is switched per agent (`agent` + `name`) and the change lands in that agent\'s own config; a PLUGIN is switched in user settings.json by its `marketplace:plugin` key and applies to every new claude session on this machine. Either way the definition stays exactly where it is — this is the reversible half of toolbox.remove, and it is what to reach for when a server is suspected rather than unwanted. Restart the sessions that should feel it. args: kind (mcp|plugin), name (server name, or the plugin key), agent? (required for mcp), on (true|false)',
            handler: (args) => {
                const kind = argStr(args, 'kind');
                const name = argStr(args, 'name');
                const on = args.on !== false && args.on !== 'false';
                if (kind === 'plugin') {
                    need(setPluginEnabled(name, on, deps.home),
                        `Could not update enabledPlugins in user settings.json for "${name}".`);
                    return { kind, name, on, scope: 'user', note: `"${name}" ${on ? 'enabled' : 'disabled'} — applies to new claude sessions.` };
                }
                need(kind === 'mcp', `enable takes an mcp or a plugin, not "${kind}"`);
                const agent = findAgent(argStr(args, 'agent'));
                need(readAgentMcpServers(agent).some(s => s.name === name),
                    `${agent.name} has no MCP server called "${name}" — toolbox.list kind:mcp shows what it has.`);
                const file = setServerDisabled(agent, name, !on);
                return {
                    kind, name, on, agent: agent.name, file,
                    note: `"${name}" ${on ? 'enabled' : 'disabled'} for ${agent.name} — restart its sessions.`
                };
            }
        }
    ]);
}
