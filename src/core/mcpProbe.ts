import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';

/**
 * MCP probe — actually connects to a configured MCP server (the same way
 * claude does) and asks it what it offers: initialize → tools/list over
 * stdio (newline-delimited JSON-RPC) or streamable HTTP. This is what lets
 * the Toolbox answer "this server says 29 tools — WHICH 29, and what do they
 * do?" without the user leaving the editor.
 *
 * Results are cached on disk (probes spawn real processes / hit real
 * endpoints), and re-probed only on demand.
 */

export interface McpToolInfo {
    name: string;
    description: string;
    /** parameter names from inputSchema.properties; required ones marked with "*" */
    params: string[];
}

export interface McpProbeResult {
    ok: boolean;
    error?: string;
    serverName?: string;
    serverVersion?: string;
    protocolVersion?: string;
    tools: McpToolInfo[];
    probedAt: number;
    ms?: number;
}

export interface McpServerConfig {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
    type?: string;
}

const PROTOCOL_VERSION = '2025-06-18';
const MAX_TOOLS = 300;

/**
 * Expand environment tokens in a server definition before launching it —
 * ${VAR} (the syntax claude itself expands in MCP configs, used by our
 * machine-independent registrations), plus the settings syntaxes ${env:VAR}
 * and %VAR%. Without this the probe would try to spawn a literal
 * "${APPDATA}\…\index.js" and report a failure claude never sees.
 * Unknown variables stay as written (visible, not silently dropped).
 */
export function expandMcpConfig(cfg: McpServerConfig, env: NodeJS.ProcessEnv = process.env): McpServerConfig {
    const ex = (s: string): string => s
        .replace(/\$\{env:([^}]+)\}/gi, (m, v) => env[String(v)] ?? m)
        .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, v) => env[String(v)] ?? m)
        .replace(/%([^%]+)%/g, (m, v) => env[String(v)] ?? m);
    const exRecord = (r?: Record<string, string>): Record<string, string> | undefined =>
        r ? Object.fromEntries(Object.entries(r).map(([k, v]) => [k, ex(v)])) : undefined;
    return {
        ...cfg,
        command: cfg.command !== undefined ? ex(cfg.command) : undefined,
        args: cfg.args?.map(ex),
        env: exRecord(cfg.env),
        url: cfg.url !== undefined ? ex(cfg.url) : undefined,
        headers: exRecord(cfg.headers)
    };
}

// ---------------------------------------------------------------- pure helpers (unit-tested)

/** Split a stdout buffer into complete JSON-RPC messages + the unfinished rest. */
export function splitJsonRpcLines(buffer: string): { messages: Record<string, unknown>[]; rest: string } {
    const lines = buffer.split('\n');
    const rest = lines.pop() ?? '';
    const messages: Record<string, unknown>[] = [];
    for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('{')) { continue; } // servers may log banners to stdout
        try {
            const v = JSON.parse(t);
            if (v && typeof v === 'object') { messages.push(v as Record<string, unknown>); }
        } catch { /* partial or noise line */ }
    }
    return { messages, rest };
}

/** JSON payloads of `data:` lines in an SSE body (streamable-HTTP responses). */
export function extractSseJson(text: string): Record<string, unknown>[] {
    const out: Record<string, unknown>[] = [];
    for (const line of text.split(/\r?\n/)) {
        if (!line.startsWith('data:')) { continue; }
        try {
            const v = JSON.parse(line.slice(5).trim());
            if (v && typeof v === 'object') { out.push(v as Record<string, unknown>); }
        } catch { /* keep scanning */ }
    }
    return out;
}

/** Compress a tools/list entry to what the UI shows. */
export function summarizeTool(raw: Record<string, unknown>): McpToolInfo {
    const schema = raw.inputSchema as Record<string, unknown> | undefined;
    const props = schema?.properties && typeof schema.properties === 'object'
        ? Object.keys(schema.properties as Record<string, unknown>) : [];
    const required = new Set(Array.isArray(schema?.required) ? schema!.required as string[] : []);
    return {
        name: String(raw.name ?? ''),
        description: String(raw.description ?? '').trim().slice(0, 400),
        params: props.map(p => required.has(p) ? p + '*' : p)
    };
}

// ---------------------------------------------------------------- stdio transport

function killTree(pid: number | undefined): void {
    if (!pid) { return; }
    try {
        if (process.platform === 'win32') {
            // shell:true wraps the real server in cmd — take the whole tree down
            spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
        } else {
            process.kill(pid, 'SIGTERM');
        }
    } catch { /* already gone */ }
}

async function probeStdio(cfg: McpServerConfig, timeoutMs: number): Promise<McpProbeResult> {
    const t0 = Date.now();
    return await new Promise<McpProbeResult>(resolve => {
        let settled = false;
        let buffer = '';
        let stderrTail = '';
        const pending = new Map<number, (msg: Record<string, unknown>) => void>();
        let nextId = 1;

        const child = spawn(cfg.command ?? '', cfg.args ?? [], {
            env: { ...process.env, ...(cfg.env ?? {}) },
            shell: process.platform === 'win32', // npx & friends are .cmd shims on Windows
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        const finish = (r: Omit<McpProbeResult, 'probedAt' | 'ms'>) => {
            if (settled) { return; }
            settled = true;
            clearTimeout(watchdog);
            killTree(child.pid);
            resolve({ ...r, probedAt: Date.now(), ms: Date.now() - t0 });
        };
        const watchdog = setTimeout(() => finish({
            ok: false, tools: [],
            error: `no response in ${Math.round(timeoutMs / 1000)}s` + (stderrTail ? ` — stderr: ${stderrTail.slice(-300)}` : '')
        }), timeoutMs);

        const send = (msg: Record<string, unknown>) => {
            try { child.stdin.write(JSON.stringify(msg) + '\n'); } catch { /* pipe closed → error/exit paths report */ }
        };
        const request = (method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> => {
            const id = nextId++;
            return new Promise(res => {
                pending.set(id, res);
                send({ jsonrpc: '2.0', id, method, params });
            });
        };

        child.on('error', e => finish({ ok: false, tools: [], error: `spawn failed: ${e.message}` }));
        child.on('exit', code => {
            if (!settled) {
                finish({
                    ok: false, tools: [],
                    error: `server exited (code ${code}) before answering` + (stderrTail ? ` — stderr: ${stderrTail.slice(-300)}` : '')
                });
            }
        });
        child.stderr.on('data', (d: Buffer) => { stderrTail = (stderrTail + d.toString()).slice(-2000); });
        child.stdout.on('data', (d: Buffer) => {
            buffer += d.toString();
            const { messages, rest } = splitJsonRpcLines(buffer);
            buffer = rest;
            for (const msg of messages) {
                const id = typeof msg.id === 'number' ? msg.id : undefined;
                if (id !== undefined && pending.has(id)) {
                    const cb = pending.get(id)!;
                    pending.delete(id);
                    cb(msg);
                }
            }
        });

        void (async () => {
            const init = await request('initialize', {
                protocolVersion: PROTOCOL_VERSION,
                capabilities: {},
                clientInfo: { name: 'agent-farm-toolbox', version: '1.0' }
            });
            if (init.error) {
                return finish({ ok: false, tools: [], error: 'initialize rejected: ' + JSON.stringify(init.error).slice(0, 300) });
            }
            const initRes = (init.result ?? {}) as Record<string, unknown>;
            const serverInfo = (initRes.serverInfo ?? {}) as Record<string, unknown>;
            send({ jsonrpc: '2.0', method: 'notifications/initialized' });

            const tools: McpToolInfo[] = [];
            let cursor: string | undefined;
            do {
                const res = await request('tools/list', cursor ? { cursor } : {});
                if (res.error) {
                    return finish({ ok: false, tools: [], error: 'tools/list rejected: ' + JSON.stringify(res.error).slice(0, 300) });
                }
                const r = (res.result ?? {}) as Record<string, unknown>;
                for (const t of Array.isArray(r.tools) ? r.tools as Record<string, unknown>[] : []) {
                    tools.push(summarizeTool(t));
                }
                cursor = typeof r.nextCursor === 'string' && r.nextCursor ? r.nextCursor : undefined;
            } while (cursor && tools.length < MAX_TOOLS);

            finish({
                ok: true, tools,
                serverName: typeof serverInfo.name === 'string' ? serverInfo.name : undefined,
                serverVersion: typeof serverInfo.version === 'string' ? serverInfo.version : undefined,
                protocolVersion: typeof initRes.protocolVersion === 'string' ? initRes.protocolVersion : undefined
            });
        })();
    });
}

// ---------------------------------------------------------------- streamable HTTP transport

interface HttpReply { status: number; headers: http.IncomingHttpHeaders; text: string }

function postJson(url: string, body: unknown, headers: Record<string, string>, timeoutMs: number): Promise<HttpReply> {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const lib = url.startsWith('https') ? https : http;
        const req = lib.request(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'accept': 'application/json, text/event-stream',
                'content-length': Buffer.byteLength(payload),
                ...headers
            },
            timeout: timeoutMs
        }, res => {
            let text = '';
            res.on('data', (d: Buffer) => {
                text += d.toString();
                // SSE responses stay open — stop once a full data: message arrived
                if ((res.headers['content-type'] ?? '').includes('event-stream') && /\ndata:.*\n\n/.test('\n' + text)) {
                    req.destroy();
                    resolve({ status: res.statusCode ?? 0, headers: res.headers, text });
                }
            });
            res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text }));
        });
        req.on('timeout', () => { req.destroy(new Error('HTTP timeout')); });
        req.on('error', e => reject(e));
        req.end(payload);
    });
}

function parseRpcReply(reply: HttpReply): Record<string, unknown> | undefined {
    const ct = String(reply.headers['content-type'] ?? '');
    if (ct.includes('event-stream')) {
        const msgs = extractSseJson(reply.text);
        return msgs.find(m => 'result' in m || 'error' in m) ?? msgs[0];
    }
    try { return JSON.parse(reply.text) as Record<string, unknown>; } catch { return undefined; }
}

async function probeHttp(cfg: McpServerConfig, timeoutMs: number): Promise<McpProbeResult> {
    const t0 = Date.now();
    const url = cfg.url ?? '';
    const base = { ...(cfg.headers ?? {}) };
    try {
        const initReply = await postJson(url, {
            jsonrpc: '2.0', id: 1, method: 'initialize',
            params: {
                protocolVersion: PROTOCOL_VERSION,
                capabilities: {},
                clientInfo: { name: 'agent-farm-toolbox', version: '1.0' }
            }
        }, base, timeoutMs);
        if (initReply.status >= 400) {
            return {
                ok: false, tools: [], probedAt: Date.now(), ms: Date.now() - t0,
                error: `HTTP ${initReply.status} on initialize — ${initReply.text.slice(0, 200) || 'no body'}`
            };
        }
        const init = parseRpcReply(initReply);
        if (!init || init.error) {
            return {
                ok: false, tools: [], probedAt: Date.now(), ms: Date.now() - t0,
                error: init?.error ? 'initialize rejected: ' + JSON.stringify(init.error).slice(0, 300) : 'unreadable initialize response'
            };
        }
        const sessionId = String(initReply.headers['mcp-session-id'] ?? '');
        const withSession = sessionId ? { ...base, 'mcp-session-id': sessionId } : base;
        const initRes = (init.result ?? {}) as Record<string, unknown>;
        const serverInfo = (initRes.serverInfo ?? {}) as Record<string, unknown>;

        // best-effort per spec; some servers answer 202 with no body
        await postJson(url, { jsonrpc: '2.0', method: 'notifications/initialized' }, withSession, timeoutMs).catch(() => undefined);

        const tools: McpToolInfo[] = [];
        let cursor: string | undefined;
        let id = 2;
        do {
            const reply = await postJson(url, {
                jsonrpc: '2.0', id: id++, method: 'tools/list', params: cursor ? { cursor } : {}
            }, withSession, timeoutMs);
            const msg = parseRpcReply(reply);
            if (!msg || msg.error) {
                return {
                    ok: false, tools: [], probedAt: Date.now(), ms: Date.now() - t0,
                    error: msg?.error ? 'tools/list rejected: ' + JSON.stringify(msg.error).slice(0, 300) : `unreadable tools/list response (HTTP ${reply.status})`
                };
            }
            const r = (msg.result ?? {}) as Record<string, unknown>;
            for (const t of Array.isArray(r.tools) ? r.tools as Record<string, unknown>[] : []) {
                tools.push(summarizeTool(t));
            }
            cursor = typeof r.nextCursor === 'string' && r.nextCursor ? r.nextCursor : undefined;
        } while (cursor && tools.length < MAX_TOOLS);

        return {
            ok: true, tools, probedAt: Date.now(), ms: Date.now() - t0,
            serverName: typeof serverInfo.name === 'string' ? serverInfo.name : undefined,
            serverVersion: typeof serverInfo.version === 'string' ? serverInfo.version : undefined,
            protocolVersion: typeof initRes.protocolVersion === 'string' ? initRes.protocolVersion : undefined
        };
    } catch (e) {
        return {
            ok: false, tools: [], probedAt: Date.now(), ms: Date.now() - t0,
            error: `connection failed: ${(e as Error).message}`
        };
    }
}

// ---------------------------------------------------------------- entry + cache

export async function probeMcpServer(rawCfg: McpServerConfig, timeoutMs = 15000): Promise<McpProbeResult> {
    const cfg = expandMcpConfig(rawCfg);
    if (cfg.url) { return probeHttp(cfg, timeoutMs); }
    if (cfg.command) { return probeStdio(cfg, timeoutMs); }
    return { ok: false, tools: [], probedAt: Date.now(), error: 'server definition has neither url nor command' };
}

export function loadProbeCache(file: string): Record<string, McpProbeResult> {
    try {
        const v = JSON.parse(fs.readFileSync(file, 'utf8'));
        return v && typeof v === 'object' ? v as Record<string, McpProbeResult> : {};
    } catch { return {}; }
}

export function saveProbeCache(file: string, cache: Record<string, McpProbeResult>): void {
    try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(cache, null, 1), 'utf8');
    } catch { /* cache is best-effort */ }
}
