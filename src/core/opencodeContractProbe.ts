/**
 * X-517 F — the probe's I/O half: a local server that records every request and answers 401, and the two
 * OpenCode subcommands per shape (opencodeContract.ts). Local only: no real key, no model is ever paid for.
 */
import * as cp from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import { AddressInfo } from 'net';
import { killTree } from './consolehost';
import { OPENCODE_EXE, OPENCODE_NEEDS_SHELL } from './opencode';
import {
    CONTRACT_SHAPES, ContractResult, PROBE_PROMPT, ProbeRequest, probeCommands, probeEnv, readContract, ShapeObservation
} from './opencodeContract';

export interface ProbeServer { url: string; requests: ProbeRequest[]; close: () => Promise<void> }

/** A server on a free 127.0.0.1 port: every request is recorded and answered 401, so no turn ever completes. */
export function startProbeServer(): Promise<ProbeServer> {
    return new Promise((resolve, reject) => {
        const requests: ProbeRequest[] = [];
        const server = http.createServer((req, res) => {
            const headers: Record<string, string | undefined> = {};
            for (const [k, v] of Object.entries(req.headers)) { headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v; }
            requests.push({ method: req.method ?? '', path: req.url ?? '', headers });
            req.resume();
            res.writeHead(401, { 'content-type': 'application/json' });
            res.end('{"type":"error","error":{"type":"authentication_error","message":"Agent Farm contract probe"}}');
        });
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const port = (server.address() as AddressInfo).port;
            // A killed client can leave a keep-alive socket open, and close() waits for every socket.
            const close = () => new Promise<void>(r => { server.close(() => r()); server.closeAllConnections(); });
            resolve({ url: `http://127.0.0.1:${port}`, requests, close });
        });
    });
}

export interface ProbeRun { code: number | null; stdout: string; stderr: string }
/** One OpenCode subcommand; `until` ends it early once what it was run for has happened. */
export type ProbeSpawn = (
    args: string[], env: Record<string, string>, cwd: string, stdin: string | undefined, timeoutMs: number, until?: () => boolean
) => Promise<ProbeRun>;

export const spawnOpencode: ProbeSpawn = (args, env, cwd, stdin, timeoutMs, until) => new Promise((resolve, reject) => {
    const child = cp.spawn(OPENCODE_EXE, args, { cwd, env: { ...process.env, ...env }, shell: OPENCODE_NEEDS_SHELL, windowsHide: true });
    let stdout = '', stderr = '', settled = false, seenAt = 0;
    child.stdout?.on('data', d => { stdout += String(d); });
    child.stderr?.on('data', d => { stderr += String(d); });
    // A 401 may be retried with backoff: a second after the request arrived is all the probe needs.
    const tick = setInterval(() => {
        if (!until || !until()) { return; }
        if (!seenAt) { seenAt = Date.now(); } else if (Date.now() - seenAt > 1500) { killTree(child); }
    }, 250);
    const timer = setTimeout(() => killTree(child), timeoutMs);
    const done = (fn: () => void) => { if (settled) { return; } settled = true; clearInterval(tick); clearTimeout(timer); fn(); };
    child.on('error', e => done(() => reject(e)));
    child.on('close', code => done(() => resolve({ code, stdout, stderr })));
    if (stdin !== undefined) { child.stdin?.end(stdin); } else { child.stdin?.end(); }
});

/** Both shapes, one after the other, against one server. Never throws: a probe that cannot run says `not-run`. */
export async function runContractProbe(o: {
    version: string; workDir: string; spawn?: ProbeSpawn; now?: () => number
}): Promise<ContractResult> {
    const runCmd = o.spawn ?? spawnOpencode;
    const now = o.now ?? Date.now;
    const seen: ShapeObservation[] = [];
    let server: ProbeServer | undefined;
    try {
        fs.mkdirSync(o.workDir, { recursive: true });
        server = await startProbeServer();
        const cmds = probeCommands();
        for (const shape of CONTRACT_SHAPES) {
            const env = probeEnv(shape, server.url);
            const before = server.requests.length;
            try {
                const listed = await runCmd(cmds.models, env, o.workDir, undefined, 30000);
                const srv = server;
                await runCmd(cmds.run, env, o.workDir, PROBE_PROMPT, 60000, () => srv.requests.length > before);
                seen.push({ shape, listed: listed.stdout, requests: server.requests.slice(before) });
            } catch (e) {
                seen.push({ shape, listed: '', requests: [], error: String((e as Error)?.message ?? e).slice(0, 200) });
            }
        }
    } catch (e) {
        for (const shape of CONTRACT_SHAPES) {
            if (!seen.some(s => s.shape === shape)) { seen.push({ shape, listed: '', requests: [], error: String((e as Error)?.message ?? e).slice(0, 200) }); }
        }
    } finally {
        await server?.close();
    }
    return readContract(o.version, now(), seen);
}
