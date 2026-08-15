/**
 * A-16 — RAW ACP MEASUREMENT FOR OPENCODE, kept in the repo because the SOP
 * (`docs/YENI-MOTOR-EKLEME-SOP.tr.md` → "Güvenli gerçek ölçüm protokolü") wants
 * every contract line backed by `CLI version + command/event + observed result`
 * and NOT by a documentation page.
 *
 * It is a TOOL, not a test: it spawns the real `opencode acp` process and spends
 * a real turn, so it never runs inside `npm test`. Run it by hand:
 *
 *   node tools/opencode_acp_probe.js [--model opencode/<free-model>] [--turns 2]
 *
 * Every frame that crosses the wire is written to `dist/measure/opencode-acp-*.jsonl`
 * so a parser fixture can be cut from real bytes instead of from memory.
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { StringDecoder } = require('string_decoder');

const args = process.argv.slice(2);
function flag(name, fallback) {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const MODEL = flag('model', 'opencode/nemotron-3.5-lightning-free');
const TURNS = Number(flag('turns', '2'));
const NONCE = flag('nonce', `af-${Date.now().toString(36)}`);
const CWD = flag('cwd', process.cwd());

const outDir = path.join(__dirname, '..', 'dist', 'measure');
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const wire = path.join(outDir, `opencode-acp-${stamp}.jsonl`);
const wireFd = fs.openSync(wire, 'w');

function record(dir, obj) {
    fs.writeSync(wireFd, JSON.stringify({ t: Date.now(), dir, msg: obj }) + '\n');
}

// ‼️ `opencode` is a `.cmd` shim on Windows, so this one needs a shell — the
// prompt does NOT travel on the command line here (it goes inside a JSON-RPC
// frame on stdin), so nothing user-typed is exposed to `cmd.exe`.
const child = spawn('opencode', ['acp'], {
    cwd: CWD,
    shell: process.platform === 'win32',
    stdio: ['pipe', 'pipe', 'pipe']
});

let nextId = 1;
const pending = new Map();

function send(method, params) {
    const id = nextId++;
    const frame = { jsonrpc: '2.0', id, method, params };
    record('out', frame);
    child.stdin.write(JSON.stringify(frame) + '\n');
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function reply(id, result) {
    const frame = { jsonrpc: '2.0', id, result };
    record('out', frame);
    child.stdin.write(JSON.stringify(frame) + '\n');
}

// ‼️ STATEFUL DECODER, not `String(chunk)` — the SOP names this as a proven
// failure mode: a Turkish multi-byte character split across a chunk boundary.
const decoder = new StringDecoder('utf8');
let buf = '';
const updateKinds = new Map();

child.stdout.on('data', chunk => {
    buf += decoder.write(chunk);
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) { continue; }
        let msg;
        try { msg = JSON.parse(line); } catch { record('in-unparsed', line); continue; }
        record('in', msg);
        if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
            const p = pending.get(msg.id);
            pending.delete(msg.id);
            if (p) { msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); }
            continue;
        }
        if (msg.method === 'session/update') {
            const kind = msg.params?.update?.sessionUpdate ?? '(none)';
            updateKinds.set(kind, (updateKinds.get(kind) ?? 0) + 1);
            continue;
        }
        // A REQUEST from the agent — permission, fs read/write. Answer it, or the
        // turn hangs for ever and the measurement says "timeout" for the wrong reason.
        if (msg.method && msg.id !== undefined) {
            if (msg.method === 'session/request_permission') {
                const opts = msg.params?.options ?? [];
                const allow = opts.find(o => /allow/i.test(o.optionId ?? '') || o.kind === 'allow_once') ?? opts[0];
                reply(msg.id, { outcome: { outcome: 'selected', optionId: allow?.optionId } });
            } else if (msg.method === 'fs/read_text_file') {
                try {
                    reply(msg.id, { content: fs.readFileSync(msg.params.path, 'utf8') });
                } catch (e) { reply(msg.id, { content: '' }); }
            } else if (msg.method === 'fs/write_text_file') {
                reply(msg.id, null);
            } else {
                reply(msg.id, null);
            }
        }
    }
});

const stderrChunks = [];
child.stderr.on('data', c => stderrChunks.push(c));

(async () => {
    const t0 = Date.now();
    const init = await send('initialize', {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false }
    });
    console.log('--- initialize (%dms) ---', Date.now() - t0);
    console.log(JSON.stringify(init, null, 2));

    const made = await send('session/new', { cwd: CWD, mcpServers: [] });
    console.log('--- session/new ---');
    console.log(JSON.stringify(made, null, 2));
    const sessionId = made.sessionId;

    // ‼️ THE PARAMETER IS `configId`, NOT `id` — measured: `id` is refused with
    // -32602 and a zod error naming `configId` as the missing string.
    try {
        const cfg = await send('session/set_config_option', { sessionId, configId: 'model', value: MODEL });
        console.log('--- set model ---', JSON.stringify(cfg));
    } catch (e) { console.log('--- set model FAILED ---', e.message); }

    const MODE = flag('mode', 'nonce');
    if (MODE === 'tools') {
        const tStart = Date.now();
        const res = await send('session/prompt', {
            sessionId, prompt: [{ type: 'text', text: flag('prompt', 'package.json dosyasini oku ve yalnizca "version" alanini yaz.') }]
        });
        console.log('--- tool turn (%dms) --- %s', Date.now() - tStart, JSON.stringify(res));
    } else if (MODE === 'cancel') {
        const p = send('session/prompt', {
            sessionId, prompt: [{ type: 'text', text: flag('prompt', 'Bir ile yuz arasindaki her sayiyi tek tek, ayri satirlarda yaz.') }]
        });
        await new Promise(r => setTimeout(r, Number(flag('after', '4000'))));
        console.log('--- sending session/cancel ---');
        const frame = { jsonrpc: '2.0', method: 'session/cancel', params: { sessionId } };
        record('out', frame);
        child.stdin.write(JSON.stringify(frame) + '\n');
        console.log('--- prompt settled --- %s', JSON.stringify(await p));
    } else if (MODE === 'load') {
        const loaded = await send('session/load', { sessionId: flag('session', sessionId), cwd: CWD, mcpServers: [] });
        console.log('--- session/load --- %s', JSON.stringify(loaded).slice(0, 1200));
    } else if (MODE === 'list') {
        console.log('--- session/list --- %s', JSON.stringify(await send('session/list', {})).slice(0, 1500));
    } else {
        for (let turn = 1; turn <= TURNS; turn++) {
            const text = turn === 1
                ? `Sadece şunu yaz ve başka hiçbir şey yazma: NONCE=${NONCE}`
                : 'Az önce yazdığın NONCE değerini tekrar yaz, başka hiçbir şey yazma.';
            const tStart = Date.now();
            const res = await send('session/prompt', {
                sessionId, prompt: [{ type: 'text', text }]
            });
            console.log('--- turn %d (%dms) --- %s', turn, Date.now() - tStart, JSON.stringify(res));
        }
    }

    console.log('--- session/update kinds seen ---');
    for (const [k, n] of [...updateKinds].sort((a, b) => b[1] - a[1])) { console.log('  %s ×%d', k, n); }
    console.log('--- sessionId --- %s', sessionId);
    console.log('--- wire log --- %s', wire);

    child.stdin.end();
    setTimeout(() => {
        const err = Buffer.concat(stderrChunks).toString('utf8').trim();
        if (err) { console.log('--- stderr (first 800) ---\n%s', err.slice(0, 800)); }
        child.kill();
        process.exit(0);
    }, 500);
})().catch(e => {
    console.error('PROBE FAILED:', e.message);
    console.error(Buffer.concat(stderrChunks).toString('utf8').slice(0, 1200));
    child.kill();
    process.exit(1);
});
