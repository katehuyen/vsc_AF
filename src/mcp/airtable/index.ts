// Airtable Engine MCP server — stdio entry point.
//
// Runs standalone from the STAGED copy under the extension's globalStorage
// (a version-independent path, so an extension update never breaks the
// registration in ~/.claude.json). Zero runtime dependencies: the MCP stdio
// protocol is newline-delimited JSON-RPC 2.0, implemented directly.
//
// Protocol rules that matter here: stdout is the PROTOCOL channel (nothing
// else may be written to it — diagnostics go to stderr); requests carry an id
// and get exactly one response; notifications (no id) get none.

import * as readline from 'readline';
import { TOOLS } from './tools';

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'airtable-engine', version: '3.0.0' };

type Dict = Record<string, unknown>;

function send(msg: Dict): void {
    process.stdout.write(JSON.stringify(msg) + '\n');
}

function reply(id: unknown, result: Dict): void {
    send({ jsonrpc: '2.0', id, result });
}

function replyError(id: unknown, code: number, message: string): void {
    send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handleToolCall(id: unknown, params: Dict): Promise<void> {
    const name = String(params.name ?? '');
    const tool = TOOLS.find(t => t.name === name);
    if (!tool) {
        replyError(id, -32602, `Unknown tool "${name}"`);
        return;
    }
    const args = (params.arguments ?? {}) as Dict;
    try {
        const result = await tool.handler(args);
        reply(id, {
            content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }]
        });
    } catch (e) {
        // Tool-level failure: isError content (the model sees and can react),
        // not a protocol error.
        reply(id, {
            content: [{ type: 'text', text: String((e as Error)?.message ?? e) }],
            isError: true
        });
    }
}

function handleMessage(msg: Dict): void {
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
            break; // notifications — no response
        case 'tools/list':
            reply(id, {
                tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }))
            });
            break;
        case 'tools/call':
            void handleToolCall(id, params);
            break;
        case 'ping':
            reply(id, {});
            break;
        default:
            if (id !== undefined) { replyError(id, -32601, `Method not found: ${method}`); }
    }
}

function main(): void {
    const rl = readline.createInterface({ input: process.stdin, terminal: false });
    rl.on('line', line => {
        const t = line.trim();
        if (!t) { return; }
        let msg: Dict;
        try { msg = JSON.parse(t) as Dict; } catch {
            process.stderr.write(`airtable-mcp: unparseable line: ${t.slice(0, 120)}\n`);
            return;
        }
        try { handleMessage(msg); } catch (e) {
            process.stderr.write(`airtable-mcp: handler crashed: ${String((e as Error)?.stack ?? e)}\n`);
        }
    });
    rl.on('close', () => process.exit(0));
}

main();
