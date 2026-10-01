/**
 * B-28 — Kapıcı for any agent, as an MCP server (src/mcp/kapici). It is staged
 * beside the bridge helper on every activation, like af.js, so a registration
 * survives an update; it is REGISTERED only when asked (Farm Settings ▸ Kapıcı,
 * or kapici.mcp.register) — an add-on nobody gets by default. Registration is
 * user scope in ~/.claude.json, which every Claude Code session reads.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { BridgeRegistry } from './bridge';
import { expandClaudeVars, tokenizeForClaude } from './airtable';
import { addUserMcpServer, readUserMcpServerRaw, removeUserMcpServer, userConfigJson } from './toolbox';

export const KAPICI_MCP_NAME = 'kapici';

export const kapiciMcpIndex = (storageDir: string): string => path.join(storageDir, 'mcp', 'kapici', 'index.js');

/** Copy out/mcp/kapici/*.js to <globalStorage>/mcp/kapici when the version changed; true when it copied. */
export function stageKapiciMcp(extensionPath: string, storageDir: string, version: string): boolean {
    const src = path.join(extensionPath, 'out', 'mcp', 'kapici');
    const index = kapiciMcpIndex(storageDir);
    const stamp = path.join(path.dirname(index), '.version');
    let current = '';
    try { current = fs.readFileSync(stamp, 'utf8').trim(); } catch { /* not staged yet */ }
    if (!fs.existsSync(src) || (current === version && fs.existsSync(index))) { return false; }
    fs.mkdirSync(path.dirname(index), { recursive: true });
    for (const f of fs.readdirSync(src).filter(n => n.endsWith('.js'))) { fs.copyFileSync(path.join(src, f), path.join(path.dirname(index), f)); }
    fs.writeFileSync(stamp, version, 'utf8');
    return true;
}

export interface KapiciMcpState {
    /** the server is on disk where a registration points */
    staged: boolean;
    /** that place, machine-independent (${APPDATA}…) */
    path: string;
    registered: boolean;
    /** the registration points at the staged copy */
    upToDate: boolean;
    configFile: string;
}

export function kapiciMcpState(storageDir: string, home = os.homedir()): KapiciMcpState {
    const index = kapiciMcpIndex(storageDir);
    const cur = readUserMcpServerRaw(KAPICI_MCP_NAME, home);
    const args = cur && Array.isArray(cur.args) ? cur.args.map(String) : [];
    const norm = (s: string) => s.replace(/\\/g, '/').toLowerCase();
    return {
        staged: fs.existsSync(index), path: tokenizeForClaude(index), registered: !!cur,
        upToDate: args.length > 0 && norm(expandClaudeVars(args[args.length - 1])) === norm(index),
        configFile: userConfigJson(home)
    };
}

/** Give every Claude Code session on this machine the kapici_* tools, or take them back. */
export function setKapiciMcp(storageDir: string, on: boolean, home = os.homedir()): KapiciMcpState {
    const index = kapiciMcpIndex(storageDir);
    if (on && !fs.existsSync(index)) { throw new Error('The Gatekeeper MCP server is not staged yet — reload the window once after installing Agent Farm, then ask again.'); }
    const done = on
        ? addUserMcpServer(KAPICI_MCP_NAME, { command: 'node', args: [tokenizeForClaude(index)], env: {} }, home)
        : removeUserMcpServer(KAPICI_MCP_NAME, home) || !readUserMcpServerRaw(KAPICI_MCP_NAME, home);
    if (!done) { throw new Error(`Could not write ${userConfigJson(home)}.`); }
    return kapiciMcpState(storageDir, home);
}

export function registerKapiciMcpOps(bridge: BridgeRegistry, storageDir: string, home = os.homedir()): void {
    const shape = '{staged, path, registered, upToDate, configFile}';
    bridge.register([
        {
            op: 'kapici.mcp',
            describe: `Whether the Gatekeeper MCP server (tools kapici_eval, kapici_ask, kapici_rules — each carried to Agent Farm over the bridge, so the key never leaves it) is staged and registered for Claude Code: ${shape}.`,
            handler: async () => kapiciMcpState(storageDir, home)
        },
        {
            op: 'kapici.mcp.register',
            describe: `Register the Gatekeeper MCP server user-wide in ~/.claude.json so every Claude Code session gets the kapici_* tools (a session started after this). Answers ${shape}.`,
            handler: async () => setKapiciMcp(storageDir, true, home)
        },
        {
            op: 'kapici.mcp.unregister',
            describe: `Take the Gatekeeper MCP server out of ~/.claude.json. Answers ${shape}.`,
            handler: async () => setKapiciMcp(storageDir, false, home)
        }
    ]);
}
