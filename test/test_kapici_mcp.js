// B-28 — Kapıcı as an MCP server for any agent: staged beside the bridge
// helper, registered only when asked, and every tool carried to Agent Farm
// over the bridge — answered, taken-and-still-running, or nobody listening.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.join(__dirname, '..');
const M = require(path.join(ROOT, 'out/core/kapiciMcp.js'));
const { BridgeRegistry } = require(path.join(ROOT, 'out/core/bridge.js'));
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-kapici-mcp-'));
const storage = path.join(tmp, 'storage');
const home = path.join(tmp, 'home');
const work = path.join(tmp, 'work');
[storage, home, work].forEach(d => fs.mkdirSync(d, { recursive: true }));
const bridgeDir = path.join(storage, 'bridge');

/** A stand-in for Agent Farm's side of the bridge: take each request and answer it, now or late. */
function farm(mode) {
    let on = true;
    const seen = [];
    (async () => {
        while (on) {
            for (const f of (() => { try { return fs.readdirSync(bridgeDir); } catch { return []; } })()) {
                if (!f.endsWith('.request.json')) { continue; }
                const id = f.slice(0, -'.request.json'.length);
                const req = JSON.parse(fs.readFileSync(path.join(bridgeDir, f), 'utf8'));
                fs.unlinkSync(path.join(bridgeDir, f));
                seen.push(req);
                const answer = () => fs.writeFileSync(path.join(bridgeDir, id + '.response.json'), JSON.stringify({ ok: true, result: { op: req.op, args: req.args } }), 'utf8');
                if (mode === 'late') {
                    fs.writeFileSync(path.join(bridgeDir, id + '.pending.json'), JSON.stringify({ op: req.op, takenAt: Date.now() }), 'utf8');
                    setTimeout(answer, 700);
                } else { answer(); }
            }
            await sleep(40);
        }
    })();
    return { seen, stop: () => { on = false; } };
}

/** Start the STAGED server, send lines, collect the answers by id. */
function server(env) {
    const p = spawn(process.execPath, [M.kapiciMcpIndex(storage)], { cwd: work, env: Object.assign({}, process.env, env), stdio: ['pipe', 'pipe', 'pipe'] });
    const got = {};
    let buf = '';
    p.stdout.on('data', d => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l.trim()) { const m = JSON.parse(l); got[m.id] = m; } }
    });
    return {
        send: m => p.stdin.write(JSON.stringify(Object.assign({ jsonrpc: '2.0' }, m)) + '\n'),
        wait: async (id, ms) => { const t = Date.now() + (ms || 8000); while (!got[id] && Date.now() < t) { await sleep(20); } return got[id]; },
        end: () => new Promise(r => { p.on('exit', r); p.stdin.end(); })
    };
}
const text = m => m && m.result && m.result.content && m.result.content[0].text;

(async () => {
    console.log('\n== staged beside the bridge helper, once per version ==');
    ok('staged on the first activation', M.stageKapiciMcp(ROOT, storage, '9.9.9') === true && fs.existsSync(M.kapiciMcpIndex(storage)));
    ok('…and not again for the same version', M.stageKapiciMcp(ROOT, storage, '9.9.9') === false);
    ok('both files travel', ['index.js', 'tools.js'].every(f => fs.existsSync(path.join(storage, 'mcp', 'kapici', f))));
    fs.mkdirSync(bridgeDir, { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'out/service/af.js'), path.join(bridgeDir, 'af.js'));
    ok('the extension stages it where it stages af.js', /stageKapiciMcp\(context\.extensionPath, context\.globalStorageUri\.fsPath, extVersion\)/.test(read('src/extension.ts')));

    console.log('\n== registered only when asked, and taken back ==');
    {
        const reg = new BridgeRegistry();
        M.registerKapiciMcpOps(reg, storage, home);
        const run = (op, a) => reg.dispatch(op, a || {});
        const cat = (await run('farm.ops')).result.map(c => c.op);
        ok('three ops on the bridge', ['kapici.mcp', 'kapici.mcp.register', 'kapici.mcp.unregister'].every(o => cat.includes(o)));
        let r = await run('kapici.mcp');
        ok('off by default: staged, not registered', r.ok && r.result.staged === true && r.result.registered === false);
        r = await run('kapici.mcp.register');
        const cfg = JSON.parse(fs.readFileSync(path.join(home, '.claude.json'), 'utf8'));
        ok('registered user-wide, node + the staged script', r.ok && r.result.registered && r.result.upToDate && cfg.mcpServers.kapici.command === 'node'
            && /mcp[\\/]kapici[\\/]index\.js$/.test(cfg.mcpServers.kapici.args[0]));
        ok('the path is written machine-independent where it can be', !/^[A-Za-z]:/.test(cfg.mcpServers.kapici.args[0]) || !process.env.LOCALAPPDATA);
        r = await run('kapici.mcp.unregister');
        ok('taken back', r.ok && r.result.registered === false && !JSON.parse(fs.readFileSync(path.join(home, '.claude.json'), 'utf8')).mcpServers.kapici);
        r = await run('kapici.mcp.unregister');
        ok('taking back twice is not an error', r.ok && r.result.registered === false);
        const ext = read('src/extension.ts');
        ok('wired in the extension', /registerKapiciMcpOps\(bridge, context\.globalStorageUri\.fsPath\)/.test(ext));
    }

    console.log('\n== the protocol, and a tool answered through the bridge ==');
    {
        const f = farm('now');
        const s = server({ KAPICI_MCP_CLAIM_MS: '3000' });
        s.send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
        const init = await s.wait(1);
        ok('initialize names the server and its tools capability', init && init.result.serverInfo.name === 'kapici' && init.result.capabilities.tools);
        s.send({ id: 2, method: 'tools/list' });
        const list = await s.wait(2);
        ok('three tools', list && list.result.tools.map(t => t.name).join() === 'kapici_eval,kapici_ask,kapici_rules');
        ok('eval needs a rule', list.result.tools[0].inputSchema.required.join() === 'rule');
        fs.writeFileSync(path.join(work, 'state.json'), '{"text":"x"}', 'utf8');
        s.send({ id: 3, method: 'tools/call', params: { name: 'kapici_eval', arguments: { rule: 'trigger.has-work', statePath: 'state.json', noCache: true } } });
        const ev = await s.wait(3);
        const back = ev && JSON.parse(text(ev));
        ok('carried as kapici.eval, audited as mcp', back && back.op === 'kapici.eval' && back.args.rule === 'trigger.has-work' && back.args.consumer === 'mcp' && back.args.noCache === true);
        ok('a relative statePath arrives absolute, from where the agent works', back && back.args.statePath === path.join(work, 'state.json'));
        s.send({ id: 4, method: 'tools/call', params: { name: 'kapici_rules', arguments: {} } });
        ok('rules: kapici.rules', JSON.parse(text(await s.wait(4))).op === 'kapici.rules');
        s.send({ id: 5, method: 'tools/call', params: { name: 'kapici_ask', arguments: { state: 'abc', questions: { q: { type: 'noul', instructions: 'is it?' } } } } });
        const ask = JSON.parse(text(await s.wait(5)));
        ok('ask: kapici.ask with the state inline', ask.op === 'kapici.ask' && ask.args.state === 'abc' && ask.args.questions.q.type === 'noul');
        s.send({ id: 6, method: 'tools/call', params: { name: 'nope' } });
        ok('an unknown tool is a protocol error', (await s.wait(6)).error.code === -32602);
        s.send({ id: 7, method: 'nope' });
        ok('an unknown method is a protocol error', (await s.wait(7)).error.code === -32601);
        await s.end();
        f.stop();
    }

    console.log('\n== taken and still running: the answer is waited for ==');
    {
        const f = farm('late');
        const s = server({ KAPICI_MCP_CLAIM_MS: '250' });
        s.send({ id: 1, method: 'tools/call', params: { name: 'kapici_rules', arguments: {} } });
        const r = await s.wait(1, 6000);
        ok('answered after the claim window, not refused', r && !r.result.isError && JSON.parse(text(r)).op === 'kapici.rules');
        await s.end();
        f.stop();
    }

    console.log('\n== VS Code closed: a clear error, nothing ran ==');
    {
        const s = server({ KAPICI_MCP_CLAIM_MS: '250' });
        s.send({ id: 1, method: 'tools/call', params: { name: 'kapici_eval', arguments: { rule: 'trigger.has-work', state: 'x' } } });
        const r = await s.wait(1, 6000);
        ok('isError, and says why and what to do', r && r.result.isError === true && /VS Code is closed/.test(text(r)) && /Nothing ran/.test(text(r)));
        ok('the request was withdrawn', !fs.readdirSync(bridgeDir).some(n => n.endsWith('.request.json')));
        await s.end();
        // stdin closed with a call still in flight: the answer is still written before the process leaves
        const f = farm('late');
        const s2 = server({ KAPICI_MCP_CLAIM_MS: '250' });
        s2.send({ id: 9, method: 'tools/call', params: { name: 'kapici_rules', arguments: {} } });
        const gone = s2.end();
        await gone;
        ok('a call in flight when stdin closes is still answered', !!(await s2.wait(9, 100)));
        f.stop();
    }

    console.log('\n== the server stays an add-on: no key, no rule, nothing of its own ==');
    {
        const src = read('src/mcp/kapici/tools.ts') + read('src/mcp/kapici/index.ts');
        ok('it never reads a key or calls a provider', !/API_KEY|fetch\(|https?:\/\//.test(src));
        ok('it loads the staged bridge helper rather than a copy of it', /'bridge', 'af\.js'/.test(src) && !/writeFileSync/.test(src));
    }

    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } process.exit(1); });
