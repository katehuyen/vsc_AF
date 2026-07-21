// Airtable engine MCP server (stdio, JSON-RPC 2.0, newline-delimited).
//
// Implemented directly against the MCP wire protocol (no SDK) to stay dependency-
// light and portable — it ships inside the Agent Farm VSIX (out/mcp/airtable/) with
// no node_modules. The protocol channel is stdout; all diagnostics go to stderr so
// they never corrupt the stream.
//
// Run modes:
//   node out/mcp/airtable/index.js            -> MCP stdio server (Claude Code / Agent Farm agents)
//   node out/mcp/airtable/index.js --doctor   -> human-readable self-test (discovery + stats), then exit

import { loadEngineConfig, EngineRegistry } from './engine';
import { buildTools, ToolDef } from './tools';

const SERVER_INFO = { name: 'airtable', version: '1.0.0' };
const DEFAULT_PROTOCOL = '2024-11-05';
const log = (...a: unknown[]) => process.stderr.write('[airtable-mcp] ' + a.map(String).join(' ') + '\n');

interface RpcMsg { jsonrpc?: string; id?: number | string | null; method?: string; params?: Record<string, unknown>; }

function toTextResult(obj: unknown, isError = false): { content: { type: string; text: string }[]; isError: boolean } {
    const text = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
    return { content: [{ type: 'text', text }], isError };
}

async function runDoctor(cfg: ReturnType<typeof loadEngineConfig>, registry: EngineRegistry): Promise<void> {
    process.stdout.write(`airtable-mcp doctor\nconfig source: ${cfg.__source}\nroots: ${cfg.roots.join(', ')}\n\n`);
    const list = await registry.instances({ force: true });
    if (!list.length) { process.stdout.write('No instances found. Check "roots" in config.\n'); return; }
    process.stdout.write('Instances:\n');
    for (const i of list) { process.stdout.write(`  - ${i.name}  port ${i.port}  ${i.live ? 'LIVE' : 'offline'}  ${i.title}\n`); }
    const liveOne = list.find((i) => i.live);
    if (liveOne) {
        try { process.stdout.write(`\nStats for '${liveOne.name}': ${JSON.stringify(await registry.stats(liveOne))}\n`); }
        catch (e) { process.stdout.write(`\nStats for '${liveOne.name}' failed: ${(e as Error).message}\n`); }
    } else {
        process.stdout.write('\nNo live instance to query (start one with start_admin.bat).\n');
    }
}

function startServer(registry: EngineRegistry): void {
    const tools: ToolDef[] = buildTools({ registry });
    const toolMap = new Map(tools.map((t) => [t.name, t]));

    const send = (msg: unknown) => process.stdout.write(JSON.stringify(msg) + '\n');
    const reply = (id: unknown, result: unknown) => send({ jsonrpc: '2.0', id, result });
    const replyErr = (id: unknown, code: number, message: string) => send({ jsonrpc: '2.0', id, error: { code, message } });

    async function handleRequest(msg: RpcMsg): Promise<void> {
        const { id, method, params } = msg;
        switch (method) {
            case 'initialize':
                reply(id, { protocolVersion: (params?.protocolVersion as string) || DEFAULT_PROTOCOL, capabilities: { tools: {} }, serverInfo: SERVER_INFO });
                return;
            case 'ping':
                reply(id, {});
                return;
            case 'tools/list':
                reply(id, { tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
                return;
            case 'tools/call': {
                const name = params?.name as string;
                const args = (params?.arguments as Record<string, unknown>) || {};
                const tool = toolMap.get(name);
                if (!tool) { reply(id, toTextResult(`Unknown tool: ${name}`, true)); return; }
                try { reply(id, toTextResult(await tool.handler(args, { registry }))); }
                catch (e) { log(`tool ${name} error: ${(e as Error).message}`); reply(id, toTextResult({ error: (e as Error).message }, true)); }
                return;
            }
            default:
                if (id !== undefined && id !== null) { replyErr(id, -32601, `Method not found: ${method}`); }
        }
    }

    function dispatch(msg: RpcMsg): void {
        if (!msg || msg.jsonrpc !== '2.0') { return; }
        if (msg.method) {
            handleRequest(msg).catch((e) => {
                log(`handler crash: ${(e as Error).message}`);
                if (msg.id !== undefined && msg.id !== null) { replyErr(msg.id, -32603, `Internal error: ${(e as Error).message}`); }
            });
        }
    }

    let buffer = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk: string) => {
        buffer += chunk;
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, nl).replace(/\r$/, '');
            buffer = buffer.slice(nl + 1);
            if (line.trim()) {
                try { dispatch(JSON.parse(line) as RpcMsg); }
                catch { log('dropping non-JSON line'); }
            }
        }
    });
    process.stdin.on('end', () => { setTimeout(() => process.exit(0), 1500).unref(); });
    log(`ready — ${tools.length} tools`);
}

async function main(): Promise<void> {
    const cfg = loadEngineConfig();
    const registry = new EngineRegistry(cfg);
    if (process.argv.includes('--doctor')) {
        await runDoctor(cfg, registry);
        process.exitCode = 0;
        setTimeout(() => process.exit(0), 400).unref();
        return;
    }
    startServer(registry);
}

// Only run as a standalone process; importing this module must not start a server.
if (require.main === module) {
    main().catch((e) => { process.stderr.write(`[airtable-mcp] fatal: ${(e as Error).stack || (e as Error).message}\n`); process.exit(1); });
}
