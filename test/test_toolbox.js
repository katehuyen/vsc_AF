// Toolbox (compiled core/toolbox.js + core/mcpProbe.js + core/toolboxBridge.js):
// the full extension inventory at user + agent scope — scanners, secret
// masking, management edits with backups, the MCP probe protocol helpers, a
// REAL stdio + HTTP probe against fixture servers, and the bridge ops.
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const T = require(path.join(__dirname, '..', 'out', 'core', 'toolbox.js'));
const P = require(path.join(__dirname, '..', 'out', 'core', 'mcpProbe.js'));
const { registerToolboxOps } = require(path.join(__dirname, '..', 'out', 'core', 'toolboxBridge.js'));
const { BridgeRegistry } = require(path.join(__dirname, '..', 'out', 'core', 'bridge.js'));

// ---------- fixture "home" + one fixture agent ----------
const root = fs.mkdtempSync(path.join(__dirname, 'tmp-toolbox-'));
const home = path.join(root, 'home');
const cdir = path.join(home, '.claude');
const agentDir = path.join(root, 'agents', 'dev');
const w = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s, 'utf8'); };

// user scope
w(path.join(cdir, 'skills', 'deploy', 'SKILL.md'), '---\nname: deploy\ndescription: ship it safely\n---\nSteps…\n');
w(path.join(cdir, 'skills', 'noname', 'SKILL.md'), 'No frontmatter here.\n\nFallback first line.\n');
w(path.join(cdir, 'agents', 'reviewer.md'), '---\nname: reviewer\ndescription: reviews code\ntools: Read, Grep\nmodel: haiku\n---\nBody\n');
w(path.join(cdir, 'commands', 'git', 'cleanup.md'), '---\ndescription: tidy branches\nargument-hint: [remote]\n---\nDo it\n');
w(path.join(cdir, 'commands', 'plain.md'), 'Just a prompt body, first line becomes the description.\n');
w(path.join(cdir, 'output-styles', 'terse.md'), '---\nname: terse\ndescription: short answers\n---\n');
w(path.join(cdir, 'settings.json'), JSON.stringify({
    model: 'haiku',
    hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pre' }] }],
        Stop: [{ hooks: [{ type: 'command', command: 'curl -s http://x' }] }]
    }
}, null, 2));
w(path.join(home, '.claude.json'), JSON.stringify({
    numStartups: 5,
    mcpServers: {
        obs: { type: 'http', url: 'http://127.0.0.1:1/mcp', headers: { Authorization: 'Bearer super-secret-token-12345678' } },
        tool: { type: 'stdio', command: 'npx', args: ['-y', 'some-mcp'] }
    }
}, null, 2));
// plugins: one marketplace with two catalog plugins
const mloc = path.join(cdir, 'plugins', 'marketplaces', 'mkt');
w(path.join(cdir, 'plugins', 'known_marketplaces.json'), JSON.stringify({
    mkt: { source: { source: 'github' }, installLocation: mloc, lastUpdated: '2026-07-18T00:00:00Z' }
}));
w(path.join(mloc, '.claude-plugin', 'marketplace.json'), JSON.stringify({
    name: 'mkt',
    plugins: [
        { name: 'alpha', description: 'first plugin', category: 'dev', author: { name: 'Ann' }, homepage: 'https://x' },
        { name: 'beta', description: 'second plugin' }
    ]
}));
// agent scope
w(path.join(agentDir, 'CLAUDE.md'), '# dev agent\n');
w(path.join(agentDir, '.claude', 'skills', 'local', 'SKILL.md'), '---\nname: local\ndescription: agent-only skill\n---\n');
w(path.join(agentDir, '.mcp.json'), JSON.stringify({ mcpServers: { localsrv: { command: 'node', args: ['x.js'] } } }));
w(path.join(agentDir, '.claude', 'settings.local.json'), JSON.stringify({ disabledMcpjsonServers: ['localsrv'] }));
const agent = { id: 'dev', name: 'dev', dir: agentDir };

// ---------- frontmatter + masking ----------
{
    const fm = T.parseFrontmatter('---\nname: x\ndescription: "quoted"\nargument-hint: [a]\n---\nrest');
    ok('frontmatter parses name/quoted/hyphenated keys',
        fm.name === 'x' && fm.description === 'quoted' && fm['argument-hint'] === '[a]');
    const masked = T.maskSecrets({ url: 'http://ok', headers: { Authorization: 'Bearer super-secret-token-12345678' }, env: { API_KEY: 'abcdef123456', PLAIN: 'visible' } });
    ok('auth header masked with tail', masked.headers.Authorization === '••••5678');
    ok('secret-looking env masked', masked.env.API_KEY === '••••3456');
    ok('plain values untouched', masked.url === 'http://ok' && masked.env.PLAIN === 'visible');
}

// ---------- scanners ----------
{
    const skills = T.scanSkillsDir(path.join(cdir, 'skills'));
    ok('skills scanned with frontmatter + fallback', skills.length === 2 &&
        skills[0].name === 'deploy' && skills[1].description === 'No frontmatter here.');
    const subs = T.scanSubagentsDir(path.join(cdir, 'agents'));
    ok('subagent frontmatter (tools/model) read', subs.length === 1 && subs[0].tools === 'Read, Grep' && subs[0].model === 'haiku');
    const cmds = T.scanCommandsDir(path.join(cdir, 'commands'));
    ok('commands namespaced by folder', cmds.some(c => c.name === '/git:cleanup' && c.argumentHint === '[remote]'));
    ok('command fallback description from body', cmds.some(c => c.name === '/plain' && /Just a prompt body/.test(c.description)));
    const hooks = T.readHooksFrom(path.join(cdir, 'settings.json'));
    ok('hooks flattened per event/matcher/command', hooks.length === 2 &&
        hooks.some(h => h.event === 'PreToolUse' && h.matcher === 'Bash' && h.command === 'echo pre'));
    const servers = T.readUserMcpServers(home);
    ok('user MCP servers from ~/.claude.json', servers.length === 2 && servers[0].name === 'obs' && servers[0].transport === 'http');
    ok('user MCP def is masked for display', servers[0].def.headers.Authorization === '••••5678');
    ok('raw def (for probing) is NOT masked', T.readUserMcpServerRaw('obs', home).headers.Authorization.startsWith('Bearer '));
    const { marketplaces, plugins } = T.readMarketplaces(home);
    ok('marketplace + catalog parsed', marketplaces.length === 1 && marketplaces[0].pluginCount === 2 && plugins.length === 2);
    ok('plugin enabled state defaults false', plugins.every(p => p.enabled === false));
}

// ---------- inventory ----------
{
    const inv = T.buildToolboxInventory([agent], home);
    const c = inv.counts;
    ok('counts: skills 2 user + 1 agent', c.skill.user === 2 && c.skill.agent === 1);
    ok('counts: mcp 2 user + 1 agent', c.mcp.user === 2 && c.mcp.agent === 1);
    ok('counts: hooks/subagents/commands/styles', c.hook.user === 2 && c.subagent.user === 1 && c.command.user === 2 && c.style.user === 1);
    ok('counts: plugins = marketplace + catalog entries', c.plugin.user === 3);
    ok('settings files discovered at both scopes', c.settings.user >= 2 && c.settings.agent >= 3);
    const localsrv = inv.items.find(i => i.kind === 'mcp' && i.name === 'localsrv');
    ok('agent MCP disabled flag honored', localsrv && localsrv.detail.disabled === true && localsrv.agentName === 'dev');
    const claudeJson = inv.items.find(i => i.kind === 'settings' && /CLI state/.test(i.name));
    ok('.claude.json listed with keys', claudeJson && claudeJson.detail.keys.includes('mcpServers'));
}

// ---------- management edits ----------
{
    ok('setPluginEnabled writes enabledPlugins', T.setPluginEnabled('alpha@mkt', true, home) &&
        T.readEnabledPlugins(home)['alpha@mkt'] === true);
    ok('setPluginEnabled off removes the key', T.setPluginEnabled('alpha@mkt', false, home) &&
        !('alpha@mkt' in T.readEnabledPlugins(home)));

    const hook = T.readHooksFrom(path.join(cdir, 'settings.json'))[0];
    ok('removeHookEntry deletes just that hook', T.removeHookEntry(hook) &&
        T.readHooksFrom(path.join(cdir, 'settings.json')).length === 1);
    ok('hook removal left a backup', fs.existsSync(path.join(cdir, 'settings.json.afbak')));
    ok('other settings keys survive hook removal',
        JSON.parse(fs.readFileSync(path.join(cdir, 'settings.json'), 'utf8')).model === 'haiku');

    ok('removeUserMcpServer edits ~/.claude.json', T.removeUserMcpServer('tool', home) &&
        T.readUserMcpServers(home).length === 1);
    ok('unrelated .claude.json keys survive',
        JSON.parse(fs.readFileSync(path.join(home, '.claude.json'), 'utf8')).numStartups === 5);
    ok('addUserMcpServer round-trips', T.addUserMcpServer('back', { command: 'x' }, home) &&
        T.readUserMcpServers(home).some(s => s.name === 'back'));

    const skillDir = path.join(cdir, 'skills', 'noname');
    ok('removeWithBackup moves folder to .afbak sibling', T.removeWithBackup(skillDir) &&
        !fs.existsSync(skillDir) && fs.existsSync(path.join(cdir, 'skills.afbak', 'noname', 'SKILL.md')));

    const f1 = T.scaffoldItem('command', cdir, 'ops:restart', 'restart things');
    ok('scaffold command nests ":" into folders', f1.endsWith(path.join('commands', 'ops', 'restart.md')) && fs.existsSync(f1));
    const f2 = T.scaffoldItem('subagent', cdir, 'tester', 'runs tests');
    ok('scaffold subagent lands in agents/', /agents[\\/]tester\.md$/.test(f2));
    let dup = '';
    try { T.scaffoldItem('subagent', cdir, 'tester', 'again'); } catch (e) { dup = e.message; }
    ok('duplicate scaffold refuses', /already exists/.test(dup));
}

// ---------- probe protocol helpers ----------
{
    const { messages, rest } = P.splitJsonRpcLines('banner line\n{"id":1,"result":{}}\n{"id":2,');
    ok('jsonrpc lines: noise skipped, partial kept', messages.length === 1 && messages[0].id === 1 && rest === '{"id":2,');
    const sse = P.extractSseJson('event: message\ndata: {"id":3,"result":{"ok":true}}\n\n');
    ok('sse data lines parsed', sse.length === 1 && sse[0].id === 3);
    const tool = P.summarizeTool({
        name: 'read', description: 'reads a file',
        inputSchema: { type: 'object', properties: { path: {}, limit: {} }, required: ['path'] }
    });
    ok('tool summary marks required params', tool.params.join(',') === 'path*,limit' && tool.name === 'read');
}

// ---------- REAL probes + bridge (async) ----------
const mcpServerScript = path.join(root, 'fixture-mcp.js');
w(mcpServerScript, `
console.log('fixture banner — non-JSON stdout noise');
const rl = require('readline').createInterface({ input: process.stdin });
rl.on('line', l => {
    let m; try { m = JSON.parse(l); } catch { return; }
    if (m.method === 'initialize') {
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: {
            protocolVersion: '2025-06-18', capabilities: { tools: {} },
            serverInfo: { name: 'fixture-server', version: '9.9' } } }) + '\\n');
    } else if (m.method === 'tools/list') {
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { tools: [
            { name: 'alpha', description: 'first tool', inputSchema: { type: 'object', properties: { p: {} }, required: ['p'] } },
            { name: 'beta', description: 'second tool' }
        ] } }) + '\\n');
    }
});
`);

(async () => {
    // stdio probe against a real child process (banner noise included)
    const r1 = await P.probeMcpServer({ command: 'node', args: [mcpServerScript] }, 20000);
    ok('stdio probe succeeds against fixture server', r1.ok === true);
    ok('stdio probe returns the tool list', r1.tools.length === 2 && r1.tools[0].name === 'alpha' && r1.tools[0].params[0] === 'p*');
    ok('stdio probe carries serverInfo', r1.serverName === 'fixture-server' && r1.serverVersion === '9.9');

    // HTTP probe against an in-process streamable server (SSE reply for tools/list)
    const httpSrv = http.createServer((req, res) => {
        let body = '';
        req.on('data', d => { body += d; });
        req.on('end', () => {
            let m; try { m = JSON.parse(body); } catch { m = {}; }
            if (m.method === 'initialize') {
                res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 'sess-1' });
                res.end(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: {
                    protocolVersion: '2025-06-18', serverInfo: { name: 'http-fixture', version: '1.0' } } }));
            } else if (m.method === 'tools/list') {
                if (req.headers['mcp-session-id'] !== 'sess-1') {
                    res.writeHead(400); res.end('missing session'); return;
                }
                res.writeHead(200, { 'content-type': 'text/event-stream' });
                res.end('event: message\ndata: ' + JSON.stringify({ jsonrpc: '2.0', id: m.id, result: {
                    tools: [{ name: 'gamma', description: 'http tool' }] } }) + '\n\n');
            } else { res.writeHead(202); res.end(); }
        });
    });
    await new Promise(r => httpSrv.listen(0, '127.0.0.1', r));
    const port = httpSrv.address().port;
    const r2 = await P.probeMcpServer({ url: `http://127.0.0.1:${port}/mcp` }, 20000);
    ok('http probe succeeds (json init + sse tools/list + session header)',
        r2.ok === true && r2.tools.length === 1 && r2.tools[0].name === 'gamma' && r2.serverName === 'http-fixture');
    httpSrv.close();

    const r3 = await P.probeMcpServer({}, 2000);
    ok('empty definition fails honestly', r3.ok === false && /neither url nor command/.test(r3.error));

    // bridge ops (§19.C): register with fixture deps, dispatch for real
    const reg = new BridgeRegistry();
    registerToolboxOps(reg, { getAgents: () => [agent], home, cacheFile: path.join(root, 'probe-cache.json') });
    const cat = reg.catalog().map(o => o.op);
    ok('farm.ops lists the toolbox ops', ['toolbox.inspect', 'toolbox.list', 'toolbox.mcptools'].every(o => cat.includes(o)));

    const list = await reg.dispatch('toolbox.list', { kind: 'mcp' });
    ok('toolbox.list filters by kind', list.ok && list.result.items.every(i => i.kind === 'mcp') && list.result.items.length >= 2);
    const listAgent = await reg.dispatch('toolbox.list', { agent: 'dev' });
    ok('toolbox.list filters by agent', listAgent.ok && listAgent.result.items.every(i => i.agent === 'dev'));
    const badKind = await reg.dispatch('toolbox.list', { kind: 'nope' });
    ok('toolbox.list rejects unknown kind', !badKind.ok && /Unknown kind/.test(badKind.error));

    // ---- S-15: the op asks the page's own questions, and ANDs them ----
    //
    // "the Anthropic ones that are actually enabled" is two axes. With one text
    // box it was not askable at all — on the page or here — and typing the word
    // returned every row that merely mentions it.
    const byTransport = await reg.dispatch('toolbox.list', { kind: 'mcp', transport: 'stdio' });
    ok('toolbox.list narrows MCP by transport',
        byTransport.ok && byTransport.result.items.length >= 1
        && byTransport.result.matched < byTransport.result.total);
    // (PreToolUse was removed by the removeHookEntry test above — `Stop` is the
    // one this fixture still has by the time the ops run.)
    const byEvent = await reg.dispatch('toolbox.list', { kind: 'hook', event: 'Stop' });
    ok('…hooks by their lifecycle event',
        byEvent.ok && byEvent.result.items.length === 1 && byEvent.result.items[0].name === 'Stop');
    ok('…and the event match is case-blind, because the value is somebody else\'s JSON',
        (await reg.dispatch('toolbox.list', { kind: 'hook', event: 'stop' })).result.items.length === 1);
    ok('…while an event nothing carries returns nothing rather than everything',
        (await reg.dispatch('toolbox.list', { kind: 'hook', event: 'PreToolUse' })).result.items.length === 0);
    const byModel = await reg.dispatch('toolbox.list', { kind: 'subagent', model: 'haiku' });
    ok('…subagents by model', byModel.ok && byModel.result.items.some(i => i.name === 'reviewer'));
    const anded = await reg.dispatch('toolbox.list', { kind: 'subagent', model: 'haiku', scope: 'agent' });
    ok('‼️ two axes are ANDed, not ORed — that is the whole point of having two',
        anded.ok && anded.result.items.every(i => i.scope === 'agent'));
    const byQuery = await reg.dispatch('toolbox.list', { kind: 'skill', q: 'ship -noname' });
    ok('…and `q` is the real query language, not a substring',
        byQuery.ok && byQuery.result.items.length === 1 && byQuery.result.items[0].name === 'deploy');
    const enabled = await reg.dispatch('toolbox.list', { kind: 'mcp', state: 'enabled' });
    ok('…one word for enabled/disabled, whichever the row itself speaks',
        enabled.ok && enabled.result.matched <= enabled.result.total);
    const badState = await reg.dispatch('toolbox.list', { state: 'sort of' });
    ok('…and a state that is neither is refused in words', !badState.ok && /enabled/.test(badState.error));
    const unfiltered = await reg.dispatch('toolbox.list', {});
    ok('an unfiltered call still says how many there are in total',
        unfiltered.ok && unfiltered.result.matched === unfiltered.result.total);

    const insp = await reg.dispatch('toolbox.inspect', { kind: 'skill', name: 'local', agent: 'dev' });
    ok('toolbox.inspect returns the item detail', insp.ok && insp.result[0].description === 'agent-only skill');
    const inspMiss = await reg.dispatch('toolbox.inspect', { kind: 'skill', name: 'ghost' });
    ok('toolbox.inspect misses honestly', !inspMiss.ok && /No skill named/.test(inspMiss.error));

    // mcptools through the bridge, served by the fixture stdio server + cached
    T.addUserMcpServer('fixture', { command: 'node', args: [mcpServerScript] }, home);
    const probe1 = await reg.dispatch('toolbox.mcptools', { server: 'fixture' });
    ok('toolbox.mcptools probes a real server', probe1.ok && probe1.result.ok && probe1.result.tools.length === 2 && probe1.result.cached === false);
    const probe2 = await reg.dispatch('toolbox.mcptools', { server: 'fixture' });
    ok('second call served from cache', probe2.ok && probe2.result.cached === true);
    const probeMiss = await reg.dispatch('toolbox.mcptools', { server: 'ghost' });
    ok('unknown server named honestly', !probeMiss.ok && /not found/.test(probeMiss.error));

    fs.rmSync(root, { recursive: true, force: true });
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
