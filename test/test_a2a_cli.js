// N-9 — THE A2A OPS THROUGH THE REAL CLI (out/service/af.js), end to end.
//
// Everything else in the A2A suite dispatches on a BridgeRegistry in-process.
// This spawns the actual `af.js` against a temp bridge folder, with a runner
// in this process standing in for the extension (parseBridgeRequest → the
// same registry → the response file), so what is proven is the whole road an
// agent's shell command travels:
//   * ‼️ the session id the CLI publishes (CLAUDE_CODE_SESSION_ID) reaches the
//     op as `from.sessionId` and names the caller — nothing typed;
//   * `@args.json` carries Turkish and backticks intact;
//   * `--stdin-base64` carries Turkish intact from a PowerShell-shaped pipe;
//   * the shell-safe `key=value` form coerces the way the ops expect;
//   * `--out` writes UTF-8 without a BOM;
//   * a refusal comes back with `ok:false` and its `detail` as data;
//   * and the lease · progress · result-note loop works over the wire.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const root = path.join(__dirname, '..');
const out = path.join(root, 'out', 'core');
const AF = path.join(root, 'out', 'service', 'af.js');
const { registerA2AOps } = require(path.join(out, 'a2aBridge.js'));
const { BridgeRegistry, parseBridgeRequest } = require(path.join(out, 'bridge.js'));
const { A2ANotesStore } = require(path.join(out, 'a2aNotes.js'));
const { A2ATasksStore } = require(path.join(out, 'a2aTasks.js'));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-a2a-cli-'));
const bridgeDir = path.join(dir, 'bridge');
fs.mkdirSync(bridgeDir);

(async () => {
    const reg = new BridgeRegistry();
    registerA2AOps(reg, {
        notes: new A2ANotesStore(path.join(dir, 'notes.json')),
        tasks: new A2ATasksStore(path.join(dir, 'tasks.json')),
        agentOfSession: (sid) => sid === 'sess-cli-dev' ? 'developer' : undefined,
        inferProject: (agent) => agent === 'developer' ? 'prj_cli' : undefined,
        resolveProject: (k) => k === 'prj_cli' ? 'prj_cli' : undefined
    });

    // the runner: what the extension does with a request file
    const served = [];
    const runner = setInterval(() => {
        for (const f of fs.readdirSync(bridgeDir)) {
            if (!f.endsWith('.request.json')) { continue; }
            const reqFile = path.join(bridgeDir, f);
            let text;
            try { text = fs.readFileSync(reqFile, 'utf8'); fs.unlinkSync(reqFile); } catch { continue; }
            const parsed = parseBridgeRequest(text);
            const resFile = reqFile.replace(/\.request\.json$/, '.response.json');
            (async () => {
                const reply = 'error' in parsed ? { ok: false, error: parsed.error }
                    : await reg.dispatch(parsed.op, parsed.args, parsed.from);
                served.push({ op: parsed.op, from: parsed.from });
                fs.writeFileSync(resFile, JSON.stringify(reply), 'utf8');
            })();
        }
    }, 25);

    const cli = (args, opts = {}) => new Promise((resolve) => {
        const p = spawn(process.execPath, [AF, ...args, '--bridge-dir', bridgeDir, '--raw', '-t', '10000'], {
            env: { ...process.env, CLAUDE_CODE_SESSION_ID: opts.session ?? 'sess-cli-dev', AGENT_FARM_BRIDGE_DIR: '' },
            stdio: ['pipe', 'pipe', 'pipe']
        });
        let so = '', se = '';
        p.stdout.on('data', d => { so += d; });
        p.stderr.on('data', d => { se += d; });
        p.on('close', code => {
            let json = null;
            try { json = JSON.parse(so); } catch { /* not json */ }
            resolve({ code, so, se, json });
        });
        if (opts.stdin !== undefined) { p.stdin.end(opts.stdin); } else { p.stdin.end(); }
    });

    try {
        // ---------- @args.json — Turkish and backticks intact, the session names the caller ----------
        const argsFile = path.join(dir, 'post.json');
        fs.writeFileSync(argsFile, JSON.stringify({
            title: 'CLI üzerinden — ğüşıöç ĞÜŞİÖÇ',
            body: 'Run `node test/test_a2a_cli.js` and read "the answer".',
            topic: 'cli', targetRole: 'developer'
        }), 'utf8');
        const posted = await cli(['a2a.notes.post', '@' + argsFile]);
        ok('af.js posts a note through the bridge', posted.code === 0 && posted.json && posted.json.ok);
        const note = posted.json && posted.json.result;
        ok('‼️ the session the CLI publishes names the caller — nothing was typed', note && note.fromAgent === 'developer' && note.fromSessionId === 'sess-cli-dev');
        ok('…and the project came from that session', note && note.project === 'prj_cli' && /session/.test(note.projectFrom));
        ok('Turkish survives @args.json', note && note.title === 'CLI üzerinden — ğüşıöç ĞÜŞİÖÇ');
        ok('backticks and quotes survive @args.json', note && note.body === 'Run `node test/test_a2a_cli.js` and read "the answer".');
        ok('the runner saw the caller on the request', served.some(s => s.op === 'a2a.notes.post' && s.from && s.from.sessionId === 'sess-cli-dev'));

        // ---------- --stdin-base64 — the PowerShell-safe pipe ----------
        const b64 = Buffer.from(JSON.stringify({ title: 'Base64 ile Türkçe başlık', agent: 'manager', project: 'prj_cli', topic: 'cli' }), 'utf8').toString('base64');
        const piped = await cli(['a2a.notes.post', '--stdin-base64'], { stdin: b64 });
        ok('--stdin-base64 posts with Turkish intact', piped.json && piped.json.ok && piped.json.result.title === 'Base64 ile Türkçe başlık' && piped.json.result.fromAgent === 'manager');

        // ---------- key=value — the shell-safe form, coerced ----------
        const added = await cli(['a2a.tasks.add', 'title=CLI task', 'agent=manager', 'project=prj_cli', 'targetRole=developer', 'requires=browser,shell', 'maxTurns=5']);
        ok('key=value adds a task, with csv requires and a numeric maxTurns', added.json && added.json.ok
            && added.json.result.requires.join() === 'browser,shell' && added.json.result.maxTurns === 5);
        const tid = added.json.result.id;

        // ---------- a refusal is ok:false with detail as data ----------
        const refused = await cli(['a2a.tasks.claim', 'id=' + tid, 'role=developer', 'capabilities=browser']);
        ok('‼️ a claim without every required capability is refused, and the reason is data', refused.json && refused.json.ok === false
            && /missing a required capability/.test(refused.json.error) && refused.json.detail && refused.json.detail.refused === 'missing a required capability');
        const unnamed = await cli(['a2a.tasks.claim', 'id=' + tid, 'capabilities=browser,shell'], { session: 'sess-nobody' });
        ok('a session the host cannot name is refused for writing ops', unnamed.json && unnamed.json.ok === false && /agent=<name>/.test(unnamed.json.error));

        // ---------- the lease · progress · result-note loop over the wire ----------
        const claimed = await cli(['a2a.tasks.claim', 'id=' + tid, 'role=developer', 'capabilities=browser,shell', 'leaseMinutes=1']);
        ok('claim by session over the CLI', claimed.json && claimed.json.ok && claimed.json.result.claimedBy.agent === 'developer'
            && claimed.json.result.claimedBy.sessionId === 'sess-cli-dev');
        const beat = await cli(['a2a.tasks.heartbeat', 'id=' + tid, 'progress=halfway, tests green']);
        ok('heartbeat records progress', beat.json && beat.json.ok && beat.json.result.state === 'running' && beat.json.result.claimedBy.progress === 'halfway, tests green');
        const done = await cli(['a2a.tasks.finish', 'id=' + tid, 'result=shipped in 3.596.0']);
        ok('finish closes it and leaves the result note for the poster', done.json && done.json.ok && done.json.result.task.state === 'done'
            && done.json.result.resultNote.targetRole === 'manager');
        const woke = await cli(['a2a.notes.list', 'agent=manager', 'role=manager', 'unreadOnly=true', 'category=result']);
        ok('…which the poster finds on its own unread list', woke.json && woke.json.ok && woke.json.result.rows.some(n => n.id === done.json.result.resultNote.id));

        // ---------- --out writes UTF-8 without a BOM ----------
        const outFile = path.join(dir, 'status.json');
        const st = await cli(['a2a.status', 'role=developer', '--out', outFile]);
        const bytes = fs.readFileSync(outFile);
        ok('--out writes the answer as a file and prints one line', st.code === 0 && !st.so.includes('"unreadNotes"') && /a2a\.status/.test(st.so));
        ok('…UTF-8 without a BOM', !(bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF));
        const parsed = JSON.parse(bytes.toString('utf8'));
        ok('…and it is the status for the session\'s agent', parsed.ok && parsed.result.agent === 'developer' && parsed.result.unreadNotes >= 1);

        ok('no request or response file is left behind', fs.readdirSync(bridgeDir).filter(f => /\.(request|response)\.json$/.test(f)).length === 0);
    } finally {
        clearInterval(runner);
        fs.rmSync(dir, { recursive: true, force: true });
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
