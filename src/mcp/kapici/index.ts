// Kapıcı MCP server — stdio entry point (B-28).
//
// Any MCP client (any agent, any engine) can put a question to Kapıcı through
// this. It never calls a classifier itself: every tool is carried to Agent
// Farm over the bridge, so the key never leaves Agent Farm, the rules and the
// audit are the ones the farm uses, and a closed VS Code is a clear error
// rather than a silent default.
//
// Zero runtime dependencies: newline-delimited JSON-RPC 2.0 on stdio. stdout
// is the PROTOCOL channel — diagnostics go to stderr; a request gets exactly
// one response, a notification none.

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { TOOLS } from './tools';

const PROTOCOL_VERSION = '2025-06-18';
function serverVersion(): string {
    try { return fs.readFileSync(path.join(__dirname, '.version'), 'utf8').trim() || '0'; } catch { return '0'; }
}
const SERVER_INFO = { name: 'kapici', version: serverVersion() };

type Dict = Record<string, unknown>;

const send = (msg: Dict): void => { process.stdout.write(JSON.stringify(msg) + '\n'); };
const reply = (id: unknown, result: Dict): void => send({ jsonrpc: '2.0', id, result });
const replyError = (id: unknown, code: number, message: string): void => send({ jsonrpc: '2.0', id, error: { code, message } });

// A call can outlive stdin (a client that writes its last request and closes):
// the answer is still owed, so the process leaves only when none is in flight.
let inFlight = 0;
let closed = false;
const leaveIfDone = (): void => { if (closed && inFlight === 0) { process.exit(0); } };

async function callTool(id: unknown, params: Dict): Promise<void> {
    const name = String(params.name ?? '');
    const tool = TOOLS.find(t => t.name === name);
    if (!tool) { replyError(id, -32602, `Unknown tool "${name}"`); return; }
    inFlight++;
    try {
        const result = await tool.handler((params.arguments ?? {}) as Dict);
        reply(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
    } catch (e) {
        // A tool-level failure is content the model can read and act on, not a protocol error.
        reply(id, { content: [{ type: 'text', text: String((e as Error)?.message ?? e) }], isError: true });
    } finally {
        inFlight--;
        leaveIfDone();
    }
}

function handle(msg: Dict): void {
    const { id, method } = msg as { id?: unknown; method?: string };
    const params = (msg.params ?? {}) as Dict;
    switch (method) {
        case 'initialize':
            reply(id, {
                protocolVersion: typeof params.protocolVersion === 'string' ? params.protocolVersion : PROTOCOL_VERSION,
                capabilities: { tools: {} },
                serverInfo: SERVER_INFO
            });
            break;
        case 'notifications/initialized':
        case 'notifications/cancelled':
            break;
        case 'tools/list':
            reply(id, { tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
            break;
        case 'tools/call':
            void callTool(id, params);
            break;
        case 'ping':
            reply(id, {});
            break;
        default:
            if (id !== undefined) { replyError(id, -32601, `Method not found: ${method}`); }
    }
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', line => {
    const t = line.trim();
    if (!t) { return; }
    let msg: Dict;
    try { msg = JSON.parse(t) as Dict; } catch { process.stderr.write(`kapici-mcp: unparseable line: ${t.slice(0, 120)}\n`); return; }
    try { handle(msg); } catch (e) { process.stderr.write(`kapici-mcp: handler crashed: ${String((e as Error)?.stack ?? e)}\n`); }
});
rl.on('close', () => { closed = true; leaveIfDone(); });
