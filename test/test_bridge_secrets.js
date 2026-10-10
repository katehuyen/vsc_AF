// B-31 — Farm Secrets bound BY NAME over the bridge: secrets.list (names and where each is bound, never a value),
// providers.bindSecret, kapici.bindSecret, mcp.servers.bindSecret, and providers.add / providers.set `secretRef`.
// The vault, routes, settings and board are stand-ins; the MCP config file is a real one in a temp folder.
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const { secretBindOps, envRef } = require(path.join(ROOT, 'out', 'core', 'secretBinds.js'));
const { BridgeRegistry } = require(path.join(ROOT, 'out', 'core', 'bridge.js'));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-b31-'));
const agentDir = path.join(dir, 'radar');
fs.mkdirSync(agentDir);
fs.writeFileSync(path.join(agentDir, '.mcp.json'), JSON.stringify({ mcpServers: { airtable: { command: 'npx', args: ['airtable-mcp'], env: { KEEP: '1' } } } }, null, 2));
const agents = [{ id: 'radar', name: 'Radar', dir: agentDir }, { id: 'dev', name: 'developer', dir: path.join(dir, 'none') }];

const VALUES = { OPENROUTER_API_KEY: 'sk-or-SECRET-1', AIRTABLE_API_KEY: 'pat-SECRET-2', FCM_KEY: 'fcm-SECRET-3', DEV_ONLY: 'dev-SECRET-4', 'OpenRouter-free': 'sk-or-SECRET-5' };
const meta = { FCM_KEY: { farmOnly: true }, DEV_ONLY: { agents: ['dev'] } };
const routeBinds = {};
let kapiciKey = '';
const said = [];
const deps = {
    secrets: () => Object.keys(VALUES).sort().map(name => ({ name, description: '', agents: (meta[name] || {}).agents || [], farmOnly: !!(meta[name] || {}).farmOnly, createdAt: 1, updatedAt: 2 })),
    routes: () => [{ id: 'or-free', label: 'OpenRouter free', baseUrl: 'https://openrouter.ai/api' }],
    routesUsing: name => Object.keys(routeBinds).filter(id => routeBinds[id] === name),
    readers: name => (name === kapiciKey ? ['Gatekeeper, the decision gate'] : []),
    kapiciKeyName: () => kapiciKey,
    workflows: () => [{ id: 'wf-post', title: 'Post', text: JSON.stringify({ steps: [{ prompt: 'use {secret:AIRTABLE_API_KEY}' }] }) }],
    getAgents: () => agents,
    bindRoute: async (id, name) => { routeBinds[id] = name; },
    setKapiciKey: async name => { kapiciKey = name; },
    announce: (title, body) => said.push(title + ' | ' + body)
};
const reg = new BridgeRegistry();
reg.register(secretBindOps(deps));
const run = (op, args, from) => reg.dispatch(op, args, from);
const leaks = r => Object.values(VALUES).some(v => JSON.stringify(r).includes(v));

(async () => {
    // ---- providers
    const miss = await run('providers.bindSecret', { id: 'or-free', secretName: 'NOPE' });
    ok('‼️ a name the vault does not hold is refused, in the agreed words', !miss.ok && /Secret 'NOPE' not found in Farm Secrets vault/.test(miss.error));
    const noRoute = await run('providers.bindSecret', { id: 'ghost', secretName: 'OPENROUTER_API_KEY' });
    ok('…and a route that is not there', !noRoute.ok && /no provider profile with the id "ghost"/.test(noRoute.error));
    const b = await run('providers.bindSecret', { id: 'OR-FREE', secretName: 'OpenRouter-free' }, { sessionId: 'abcdef1234567' });
    ok('a route signs in with a Farm Secret by name, at the endpoint it has now', b.ok && routeBinds['or-free'] === 'OpenRouter-free'
        && b.result.endpoint === 'https://openrouter.ai/api' && !leaks(b));
    ok('‼️ the bind is announced on Notices, with who made it and for which endpoint', said.length === 1
        && /OpenRouter free/.test(said[0]) && /session abcdef12/.test(said[0]) && /openrouter\.ai/.test(said[0]));

    // ---- Gatekeeper
    const k0 = await run('kapici.bindSecret', { secretName: 'NOPE' });
    ok('kapici.bindSecret refuses a name the vault does not hold', !k0.ok && /not found in Farm Secrets vault/.test(k0.error) && kapiciKey === '');
    const k = await run('kapici.bindSecret', { secretName: 'OPENROUTER_API_KEY' });
    ok('…and makes a held one Gatekeeper\'s key (agentFarm.kapici.keyName), announced', k.ok && kapiciKey === 'OPENROUTER_API_KEY' && said.length === 2);

    // ---- MCP servers
    const file = path.join(agentDir, '.mcp.json');
    const m = await run('mcp.servers.bindSecret', { agent: 'radar', server: 'airtable', envVar: 'AIRTABLE_TOKEN', secretName: 'AIRTABLE_API_KEY' });
    const env = JSON.parse(fs.readFileSync(file, 'utf8')).mcpServers.airtable.env;
    ok('an MCP server gets the secret as ${NAME} in its env, the rest of its env kept', m.ok && env.AIRTABLE_TOKEN === envRef('AIRTABLE_API_KEY') && env.KEEP === '1'
        && fs.existsSync(file + '.afbak') && !fs.readFileSync(file, 'utf8').includes('pat-SECRET-2'));
    const farmOnly = await run('mcp.servers.bindSecret', { agent: 'radar', server: 'airtable', envVar: 'X', secretName: 'FCM_KEY' });
    ok('‼️ a Farm-only secret is refused — no session would ever receive it', !farmOnly.ok && /Farm-only/.test(farmOnly.error));
    const scoped = await run('mcp.servers.bindSecret', { agent: 'radar', server: 'airtable', envVar: 'X', secretName: 'DEV_ONLY' });
    ok('…a secret scoped to other agents too', !scoped.ok && /given only to dev/.test(scoped.error));
    const dash = await run('mcp.servers.bindSecret', { agent: 'radar', server: 'airtable', envVar: 'X', secretName: 'OpenRouter-free' });
    ok('…a name that cannot be written as ${...}', !dash.ok && /cannot be written as/.test(dash.error));
    const badVar = await run('mcp.servers.bindSecret', { agent: 'radar', server: 'airtable', envVar: '1-BAD', secretName: 'AIRTABLE_API_KEY' });
    ok('…an envVar that is not a variable name', !badVar.ok && /not an environment variable name/.test(badVar.error));
    const noSrv = await run('mcp.servers.bindSecret', { agent: 'Radar', server: 'github', envVar: 'X', secretName: 'AIRTABLE_API_KEY' });
    ok('…a server the agent does not have, naming the ones it has', !noSrv.ok && /it has: airtable/.test(noSrv.error));

    // ---- secrets.list
    const l = await run('secrets.list', {});
    const row = n => l.result.secrets.find(s => s.name === n);
    ok('‼️ secrets.list names every secret and returns NO value', l.ok && l.result.count === 5 && !leaks(l));
    ok('…with where each is bound: route, Gatekeeper, MCP server, workflow', row('OpenRouter-free').boundTo.routes[0] === 'or-free'
        && row('OPENROUTER_API_KEY').boundTo.kapici === true && row('AIRTABLE_API_KEY').boundTo.mcpServers[0] === 'Radar/airtable'
        && row('AIRTABLE_API_KEY').boundTo.workflows[0] === 'wf-post' && row('FCM_KEY').farmOnly === true);
    const one = await run('secrets.list', { name: 'NOPE' });
    ok('…and one unknown name is refused the same way', !one.ok && /not found in Farm Secrets vault/.test(one.error));

    // ---- providers.add / providers.set take secretRef (extension.ts), checked before anything is written
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const guarded = ext.match(/const ref = optStr\(args, 'secretRef'\)\.trim\(\);\s*need\(!ref \|\| vault\.names\(\)\.includes\(ref\), secretMissing\(ref\)\);[\s\S]{0,720}?writeProviderProfiles\(w\.list\);\s*const bound = ref \? await bindRouteSecret\(secretBindDeps/g) || [];
    ok('providers.add and providers.set take secretRef: refused before the write, bound through the same path after', guarded.length === 2);
    ok('the four ops are registered beside the providers ops', /\.\.\.secretBindOps\(secretBindDeps\)/.test(ext));

    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
