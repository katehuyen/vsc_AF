#!/usr/bin/env node
/**
 * Agent Farm Bridge CLI Helper — af.js
 *
 * Standalone CLI tool executed by agents (or external processes/scripts) to
 * interact with Agent Farm's bridge operations safely, reliably, and without
 * shell quote-escaping errors.
 *
 * Usage:
 *   node af.js <op> [key=value ... | args-json | @args-file.json | -] [--stdin-base64] [--timeout <ms>] [--bridge-dir <dir>]
 *
 * Examples:
 *   node af.js farm.ops
 *   node af.js tasks.list
 *   node af.js notices.list handled=false
 *   node af.js notices.post @notice.json
 *   node af.js tasks.add @task.json
 *   node af.js farm.ops --out catalog.json
 *
 * `--out` exists because the obvious alternative is a trap: `node af.js <op> > file`
 * hands the bytes to the SHELL, and Windows PowerShell 5.1 re-encodes them on the way
 * out (UTF-16LE, or the ANSI codepage, or UTF-8 with a BOM depending on the operator).
 * The catalog dump that reaches disk that way is mojibake the repo's own encoding gate
 * then rejects. Writing the file here keeps it UTF-8 without a BOM, whatever shell
 * invoked us.
 *
 * `--stdin-base64` closes the same trap in the other direction. Windows PowerShell
 * 5.1 converts strings sent to a native process through `|` with its legacy output
 * encoding before Node can see them; characters outside that codepage have already
 * become `?` by the time stdin arrives and no JavaScript decoder can recover them.
 * Base64 is ASCII on the pipe and decoded back to UTF-8 here, so a long Turkish or
 * markdown payload remains byte-for-byte intact without a temporary file.
 *
 * Zero external dependencies: Node.js standard library only (fs, path, os, crypto).
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDecoder } from 'util';

export interface CliOptions {
    op?: string;
    rawArgs?: string;
    keyValueArgs?: string[];
    argsFile?: string;
    fromStdin?: boolean;
    stdinBase64?: boolean;
    timeoutMs: number;
    bridgeDir?: string;
    rawOutput: boolean;
    outFile?: string;
    help: boolean;
}

export function defaultBridgeDir(): string {
    // 1. If placed inside <globalStorage>/bridge/, __dirname is already the bridge directory
    if (path.basename(__dirname).toLowerCase() === 'bridge') {
        return __dirname;
    }
    // 2. If environment variable is explicitly set
    if (process.env.AGENT_FARM_BRIDGE_DIR && fs.existsSync(process.env.AGENT_FARM_BRIDGE_DIR)) {
        return process.env.AGENT_FARM_BRIDGE_DIR;
    }
    // 3. Platform-specific default VS Code globalStorage locations
    const home = os.homedir();
    if (process.platform === 'win32') {
        const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
        return path.join(appData, 'Code', 'User', 'globalStorage', 'muvusoft.agent-farm', 'bridge');
    }
    if (process.platform === 'darwin') {
        return path.join(home, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'muvusoft.agent-farm', 'bridge');
    }
    // Linux / other
    const configHome = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    return path.join(configHome, 'Code', 'User', 'globalStorage', 'muvusoft.agent-farm', 'bridge');
}

export function parseCliArgs(argv: string[]): CliOptions {
    const opts: CliOptions = {
        timeoutMs: Number(process.env.AGENT_FARM_BRIDGE_TIMEOUT) || 20_000,
        rawOutput: false,
        help: false
    };

    const positional: string[] = [];
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--help' || arg === '-h') {
            opts.help = true;
        } else if (arg === '--raw' || arg === '-r') {
            opts.rawOutput = true;
        } else if (arg === '--timeout' || arg === '-t') {
            const next = argv[++i];
            const ms = Number(next);
            if (Number.isFinite(ms) && ms > 0) {
                opts.timeoutMs = ms;
            }
        } else if (arg.startsWith('--timeout=')) {
            const ms = Number(arg.slice('--timeout='.length));
            if (Number.isFinite(ms) && ms > 0) {
                opts.timeoutMs = ms;
            }
        } else if (arg === '--bridge-dir' || arg === '-b') {
            opts.bridgeDir = argv[++i];
        } else if (arg.startsWith('--bridge-dir=')) {
            opts.bridgeDir = arg.slice('--bridge-dir='.length);
        } else if (arg === '--out' || arg === '-o') {
            opts.outFile = argv[++i];
        } else if (arg.startsWith('--out=')) {
            opts.outFile = arg.slice('--out='.length);
        } else if (arg === '--stdin-base64' || arg === '--stdin-b64') {
            opts.fromStdin = true;
            opts.stdinBase64 = true;
        } else if (arg === '-') {
            opts.fromStdin = true;
        } else {
            positional.push(arg);
        }
    }

    if (positional.length > 0) {
        opts.op = positional[0];
    }
    if (positional.length > 1) {
        const values = positional.slice(1);
        const keyValuePattern = /^[A-Za-z_][A-Za-z0-9_.-]*=/;
        if (values.every(value => keyValuePattern.test(value))) {
            opts.keyValueArgs = values;
        } else if (values.length === 1 && values[0].startsWith('@')) {
            opts.argsFile = values[0].slice(1);
        } else if (values.length === 1 && values[0].endsWith('.json') && fs.existsSync(values[0])) {
            opts.argsFile = values[0];
        } else {
            opts.rawArgs = values.join(' ');
        }
    }

    return opts;
}

export function resolvePayload(opts: CliOptions): Record<string, unknown> {
    if (opts.argsFile) {
        const absPath = path.resolve(opts.argsFile);
        if (!fs.existsSync(absPath)) {
            throw new Error(`Args file not found: ${absPath}`);
        }
        const content = fs.readFileSync(absPath, 'utf8').replace(/^\uFEFF/, '').trim();
        if (!content) { return {}; }
        const parsed = JSON.parse(content) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error(`Args in file ${opts.argsFile} must be a JSON object.`);
        }
        return parsed as Record<string, unknown>;
    }

    if (opts.fromStdin) {
        const raw = fs.readFileSync(0);
        const content = opts.stdinBase64
            ? decodeBase64Stdin(raw.toString('ascii'))
            : raw.toString('utf8');
        return parsePayloadText(content, 'stdin');
    }

    if (opts.keyValueArgs) {
        const payload: Record<string, unknown> = {};
        for (const arg of opts.keyValueArgs) {
            const separator = arg.indexOf('=');
            const key = arg.slice(0, separator);
            const rawValue = arg.slice(separator + 1);
            if (Object.prototype.hasOwnProperty.call(payload, key)) {
                throw new Error(`Duplicate inline argument: ${key}`);
            }
            if (rawValue === 'true') {
                payload[key] = true;
            } else if (rawValue === 'false') {
                payload[key] = false;
            } else if (rawValue === 'null') {
                payload[key] = null;
            } else if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(rawValue)) {
                payload[key] = Number(rawValue);
            } else {
                payload[key] = rawValue;
            }
        }
        return payload;
    }

    if (opts.rawArgs) {
        return parsePayloadText(opts.rawArgs, 'inline args');
    }

    return {};
}

/** Parse one JSON-object payload after the transport has preserved its bytes. */
export function parsePayloadText(raw: string, source: string): Record<string, unknown> {
    const content = raw.replace(/^\uFEFF/, '').trim();
    if (!content) { return {}; }
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`${source} must contain a JSON object.`);
    }
    return parsed as Record<string, unknown>;
}

/** Decode the ASCII-safe form PowerShell 5.1 can pipe without codepage loss. */
export function decodeBase64Stdin(raw: string): string {
    const encoded = raw.trim();
    if (!encoded) { return ''; }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
        throw new Error('Base64 stdin is malformed. Encode the UTF-8 JSON bytes before piping them.');
    }
    const bytes = Buffer.from(encoded, 'base64');
    const canonical = bytes.toString('base64').replace(/=+$/, '');
    if (canonical !== encoded.replace(/=+$/, '')) {
        throw new Error('Base64 stdin is malformed. Encode the UTF-8 JSON bytes before piping them.');
    }
    try {
        // `Buffer.toString('utf8')` replaces malformed byte sequences with U+FFFD,
        // but U+FFFD may also be legitimate text already present in a document.
        // A fatal decoder distinguishes those two cases instead of rejecting a
        // perfectly valid 500 KB payload because one real replacement glyph is in it.
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        throw new Error('Base64 stdin did not decode to valid UTF-8 JSON.');
    }
}

export function printHelp(): void {
    console.log(`Agent Farm Bridge CLI Helper (af.js)

Usage:
  node af.js <op> [key=value ... | args-json | @file.json | -] [options]

Arguments:
  <op>                  Bridge operation name (e.g. farm.ops, tasks.list, notices.post)
  [args]                Shell-safe key=value pairs, JSON string, @file.json path,
                        or - for stdin. Use @file.json for nested or long payloads.

Options:
  -t, --timeout <ms>    How long to wait for the answer (default: 20000). A timeout
                        says one of two things and the reply's detail.state names
                        it: "running" — the extension TOOK the op and is still on
                        it (likely a confirmation dialog); it is not a failure, do
                        not repeat it, its answer lands in detail.response.
                        "unclaimed" — nobody is listening; nothing ran.
  -b, --bridge-dir <p>  Custom bridge directory path
  -r, --raw             Output compact raw JSON instead of pretty-printed JSON
  -o, --out <file>      Write the response to <file> as UTF-8 (no BOM) and print a
                        one-line summary. Use this instead of a shell redirection:
                        "> file" is re-encoded by the shell and corrupts the bytes.
  --stdin-base64        Read a Base64-encoded UTF-8 JSON object from stdin. Use this
                        for piped non-ASCII text in Windows PowerShell 5.1, whose
                        native-process pipe replaces unsupported characters before
                        Node can read them. Alias: --stdin-b64.
  -h, --help            Show this help message

Examples:
  node af.js farm.ops
  node af.js tasks.list
  node af.js notices.list handled=false limit=5
  node af.js notices.post @report.json
  cat payload.json | node af.js tasks.add -
  $b64 | node af.js notices.post --stdin-base64
  node af.js farm.ops --out docs/farm_ops_catalog.json
`);
}

/**
 * What the bridge writes back. Declared here rather than imported: this file is
 * staged as a STANDALONE script, so it may not pull `core/bridge` (and the whole
 * extension behind it) in after itself.
 *
 * ‼️ `detail` is the decision behind a deliberate refusal (`BridgeRefusal`,
 * audit A-02.11) — the escalated `kind`, the `build` reading, a `retryInMs`. It
 * was passing through this helper untyped and therefore invisible to anyone
 * reading the contract here; it is printed either way, because the parsed reply
 * is resolved whole.
 */
interface BridgeReply {
    ok: boolean;
    result?: unknown;
    error?: string;
    detail?: unknown;
}

/**
 * ‼️ X-310 — WHO IS WRITING THIS REQUEST, when the environment already says so.
 *
 * `farm.restartExtensionHost` has to tell the turn that ASKED to be restarted
 * from the turns that merely happen to be running: the first consented to
 * dying, the others did not, and without a name for the asker the op can only
 * kill everyone or wait for everyone. Both were shipped, and the first one cost
 * a session its work mid file-write.
 *
 * The name is free — every CLI this runs under publishes its session id to its
 * own children, so a Bash tool call the agent makes inherits it. Nothing is
 * spawned, injected or remembered to produce it. `CLAUDE_CODE_SESSION_ID` is
 * Claude Code's; `AGENT_FARM_SESSION` is the one Agent Farm sets on the
 * terminals it opens itself. An engine that publishes neither states nothing,
 * which is exactly what an unknown asker must look like from the other side.
 *
 * It is a CLAIM, never a credential: no op may grant anything on it, and every
 * op must still be correct when it is absent.
 */
function callerIdentity(): { sessionId?: string; ppid?: number } | undefined {
    const sid = String(process.env.CLAUDE_CODE_SESSION_ID
        || process.env.AGENT_FARM_SESSION || '').trim();
    // S-68 — the parent pid travels too: an engine that sets no variable can
    // still be found, because its CLI registers its own pid and we sit under it.
    const ppid = process.ppid > 0 ? process.ppid : undefined;
    return sid || ppid ? { ...(sid ? { sessionId: sid } : {}), ...(ppid ? { ppid } : {}) } : undefined;
}

export async function executeBridgeRequest(
    op: string,
    args: Record<string, unknown>,
    bridgeDir: string,
    timeoutMs: number
): Promise<BridgeReply> {
    fs.mkdirSync(bridgeDir, { recursive: true });

    const reqId = `af_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
    const reqFile = path.join(bridgeDir, `${reqId}.request.json`);
    const resFile = path.join(bridgeDir, `${reqId}.response.json`);
    /**
     * ‼️ X-268 — the runner's marker that it TOOK this request and is still on
     * it. A timeout with the marker present is not a failure and must not be
     * reported as one: the op is running (very possibly waiting on a person —
     * a confirmation dialog), it WILL still complete, and repeating a mutating
     * op on the strength of "timed out" is exactly how one request became two
     * conversations. A timeout with no marker means nobody picked it up.
     */
    const pendingFile = path.join(bridgeDir, `${reqId}.pending.json`);

    const cleanup = () => {
        try { if (fs.existsSync(reqFile)) { fs.unlinkSync(reqFile); } } catch { /* ignore */ }
        try { if (fs.existsSync(resFile)) { fs.unlinkSync(resFile); } } catch { /* ignore */ }
    };
    const takenMark = (): { op?: string; takenAt?: number } | undefined => {
        try { return JSON.parse(fs.readFileSync(pendingFile, 'utf8')) as { op?: string; takenAt?: number }; }
        catch { return undefined; }
    };

    // Write request file
    const from = callerIdentity();
    const requestData = JSON.stringify({ op, args, ...(from ? { from } : {}) }, null, 2);
    fs.writeFileSync(reqFile, requestData, 'utf8');

    const start = Date.now();
    return new Promise((resolve) => {
        const interval = setInterval(() => {
            if (fs.existsSync(resFile)) {
                clearInterval(interval);
                try {
                    const resContent = fs.readFileSync(resFile, 'utf8').replace(/^\uFEFF/, '').trim();
                    const parsed = JSON.parse(resContent) as BridgeReply;
                    cleanup();
                    resolve(parsed);
                } catch (e) {
                    cleanup();
                    resolve({
                        ok: false,
                        error: `Failed to parse bridge response: ${String((e as Error)?.message ?? e)}`
                    });
                }
                return;
            }

            if (Date.now() - start > timeoutMs) {
                clearInterval(interval);
                const taken = takenMark();
                if (taken) {
                    // Nothing is withdrawn: the request is already off the disk and
                    // running, and its answer will land in `resFile` when it is done.
                    resolve({
                        ok: false,
                        error: `Agent Farm took "${taken.op ?? op}"`
                            + (taken.takenAt ? ` at ${new Date(taken.takenAt).toISOString()}` : '')
                            + ` and is still working on it after ${timeoutMs}ms. This is NOT a failure and the `
                            + 'op will still complete — it is most likely waiting on a person (a confirmation '
                            + 'dialog in VS Code) or on a long operation. Do NOT repeat a mutating op. Read the '
                            + `answer from ${resFile} when it appears (it is kept for 24h), or call again with a `
                            + 'longer --timeout.',
                        detail: { state: 'running', op: taken.op ?? op, takenAt: taken.takenAt ?? null, response: resFile, pending: pendingFile }
                    });
                    return;
                }
                cleanup();
                resolve({
                    ok: false,
                    error: `Bridge request was not picked up within ${timeoutMs}ms — no Agent Farm extension is `
                        + 'listening on this bridge (VS Code closed, the extension not active, or the wrong '
                        + '--bridge-dir). The request was withdrawn; nothing ran.',
                    detail: { state: 'unclaimed', op, bridgeDir }
                });
            }
        }, 50);
    });
}

/**
 * Write the response where the shell cannot touch the bytes. Returns the summary line
 * the caller prints in place of the payload — with `--out` the payload is on disk, so
 * echoing it to stdout as well would only make the reader pay for it twice.
 */
export function writeResponseFile(
    outFile: string,
    body: string
): { path: string; bytes: number } {
    const absPath = path.resolve(outFile);
    const dir = path.dirname(absPath);
    if (dir && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const text = body.endsWith('\n') ? body : `${body}\n`;
    fs.writeFileSync(absPath, Buffer.from(text, 'utf8'));
    return { path: absPath, bytes: Buffer.byteLength(text, 'utf8') };
}

export async function main(): Promise<void> {
    const opts = parseCliArgs(process.argv);

    if (opts.help || !opts.op) {
        printHelp();
        process.exit(opts.help ? 0 : 1);
    }

    const bridgeDirectory = opts.bridgeDir || defaultBridgeDir();

    let payload: Record<string, unknown>;
    try {
        payload = resolvePayload(opts);
    } catch (e) {
        const errObj = { ok: false, error: String((e as Error)?.message ?? e) };
        console.error(JSON.stringify(errObj, null, opts.rawOutput ? 0 : 2));
        process.exit(1);
    }

    try {
        const response = await executeBridgeRequest(opts.op, payload, bridgeDirectory, opts.timeoutMs);
        const body = opts.rawOutput ? JSON.stringify(response) : JSON.stringify(response, null, 2);
        if (opts.outFile) {
            const written = writeResponseFile(opts.outFile, body);
            console.log(`${response.ok ? 'ok' : 'error'} ${opts.op} -> ${written.path} (${written.bytes} bytes, utf8)`);
            if (!response.ok && response.error) {
                console.error(response.error);
            }
        } else {
            console.log(body);
        }
        process.exit(response.ok ? 0 : 1);
    } catch (e) {
        const errObj = { ok: false, error: String((e as Error)?.message ?? e) };
        console.error(JSON.stringify(errObj, null, opts.rawOutput ? 0 : 2));
        process.exit(1);
    }
}

if (require.main === module) {
    void main();
}
