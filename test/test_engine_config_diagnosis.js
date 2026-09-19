// X-116 — THE ENGINES' OWN CONFIG FILES, DIAGNOSED READ-ONLY.
//
// The acceptance line: "Global/proje Claude veya OpenCode configini salt-okunur
// teşhis et ve hiçbir el ayarını otomatik rewrite etme." Pinned here:
//
//   1. A route answered a second time from a per-folder Claude settings file is
//      a PROBLEM that names the file and the agents it reaches.
//   2. OpenCode's default model: a bare id is left unknown (never guessed), a
//      provider the read catalog does not offer is refused, and with no catalog
//      read it is neither confirmed nor refused.
//   3. No secret-shaped value ever reaches the output (canary).
//   4. The module CANNOT write: it imports no file system and is handed a reader.
//   5. The verdict reaches `providers.status` / the Engines page through the
//      health report, on both of its return paths.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const D = require(path.join(ROOT, 'out', 'core', 'engineConfigDiagnosis.js'));
const H = require(path.join(ROOT, 'out', 'core', 'providerHealth.js'));

const file = (engine, scope, name, agents, obj) => ({
    engine, scope, file: name, agents,
    text: typeof obj === 'string' ? obj : JSON.stringify(obj)
});

// ---- 1. Claude: a per-folder route ----
{
    const r = D.diagnoseEngineConfig([
        file('claude', 'project', 'dev/.claude/settings.json', ['dev'],
            { env: { ANTHROPIC_BASE_URL: 'https://elsewhere', MAX_THINKING_TOKENS: '9' } }),
        file('claude', 'local', 'ops/.claude/settings.local.json', ['ops'],
            { model: 'opus', env: { MAX_THINKING_TOKENS: '9' } })
    ]);
    ok('1 route env in a project file is a problem', r.problems.length === 1
        && /ANTHROPIC_BASE_URL/.test(r.problems[0]) && /dev\/\.claude\/settings\.json/.test(r.problems[0])
        && /dev's runs/.test(r.problems[0]));
    ok('1 a non-route env name is not reported', !r.problems.join(' ').includes('MAX_THINKING'));
    ok('1 a model key alone is not a finding (agentDefaults owns it)', r.notes.length === 0);
    ok('1 both files are listed as read', r.files.length === 2 && r.files.every(f => f.state === 'read'));
    ok('1 the route VALUE is not repeated', !JSON.stringify(r).includes('elsewhere'));

    const h = D.diagnoseEngineConfig([file('claude', 'project', 'x/.claude/settings.json', ['x'],
        { apiKeyHelper: 'C:/scripts/key.cmd' })]);
    ok('1 apiKeyHelper is a problem', h.problems.length === 1 && /apiKeyHelper/.test(h.problems[0]));
    ok('1 the helper path is not repeated', !JSON.stringify(h).includes('key.cmd'));
}

// ---- 2. OpenCode: the default model ----
{
    const files = [
        file('opencode', 'global', 'g/opencode.json', [], { model: 'anthropic/claude-x', small_model: 'haiku' }),
        file('opencode', 'project', 'p/opencode.json', ['a', 'b'], { model: 'ghost/model-1' })
    ];
    const withCat = D.diagnoseEngineConfig(files, ['anthropic', 'openai']);
    ok('2 a bare id is a problem and is left unknown', withCat.problems.some(p =>
        /small model to "haiku", a bare model id/.test(p) && /left unknown rather than guessed/.test(p)));
    ok('2 a provider the catalog does not offer is refused', withCat.problems.some(p =>
        /"ghost" is not a provider/.test(p) && /the runs of a, b/.test(p)));
    ok('2 an offered provider is a note naming its reach', withCat.notes.some(n =>
        /default model to anthropic\/claude-x for every run on this machine/.test(n)));

    const noCat = D.diagnoseEngineConfig(files, undefined);
    ok('2 with no catalog read a provider is neither refused', !noCat.problems.some(p => /ghost/.test(p)));
    ok('2 … nor dropped', noCat.notes.some(n => /ghost\/model-1/.test(n)));
    ok('2 the bare id is still a problem with no catalog', noCat.problems.some(p => /bare model id/.test(p)));
}

// ---- 3. Secrets never leave ----
{
    const r = D.diagnoseEngineConfig([file('opencode', 'project', 'p/opencode.jsonc', ['a'], {
        provider: {
            mine: { options: { apiKey: 'sk-CANARY-1', baseURL: 'https://CANARY.example' }, headers: { Authorization: 'Bearer CANARY' } },
            safe: { options: { apiKey: '{env:MY_KEY}' } }
        },
        disabled_providers: ['openai']
    })]);
    const out = JSON.stringify(r);
    ok('3 no canary value in the output', !out.includes('CANARY'));
    ok('3 own providers are named', r.notes.some(n => /2 providers of its own \(mine, safe\)/.test(n)));
    ok('3 a plain key is flagged by provider name only', r.notes.some(n => /mine holds a key written into the file/.test(n)));
    ok('3 an {env:…} key is not flagged', !r.notes.some(n => /safe holds/.test(n)));
    ok('3 disabled providers are reported', r.notes.some(n => /switches off openai for a's runs/.test(n)));
}

// ---- 4. JSONC, broken files, absence ----
{
    const jsonc = '{\n  // a comment with // inside\n  "model": "anthropic/x", /* block */\n  "url": "https://a//b",\n}';
    const r = D.diagnoseEngineConfig([
        file('opencode', 'global', 'g.jsonc', [], jsonc),
        file('opencode', 'project', 'bad.json', ['z'], '{ "model": '),
        { engine: 'opencode', scope: 'project', file: 'absent.json', agents: ['z'] }
    ], ['anthropic']);
    ok('4 JSONC with comments and a trailing comma reads', r.files[0].state === 'read'
        && r.files[0].keys.join() === 'model,url');
    ok('4 a broken file is unreadable and a problem', r.files[1].state === 'unreadable'
        && r.problems.some(p => /bad\.json does not parse/.test(p)));
    ok('4 an absent file is not listed', r.files.length === 2);
}

// ---- 5. The collector: grouping, the worktree walk, scopes ----
{
    const P = p => path.resolve(p);
    const disk = {
        [P('/nest/opencode.jsonc')]: '{"model":"anthropic/x"}',
        [P('/opencode.json')]: '{"model":"above/worktree"}',
        [P('/home/.config/opencode/opencode.json')]: '{}',
        [P('/nest/a/.claude/settings.json')]: '{}',
        [P('/nest/b/.claude/settings.local.json')]: '{}'
    };
    const reads = [];
    const deps = {
        home: P('/home'),
        agents: [{ name: 'a', dir: P('/nest/a') }, { name: 'b', dir: P('/nest/b') }],
        read: f => { reads.push(f); return disk[P(f)]; },
        worktreeOf: () => P('/nest')
    };
    const oc = D.collectEngineConfigFiles('opencode', deps);
    const shared = oc.find(f => P(f.file) === P('/nest/opencode.jsonc'));
    ok('5 a nest-level file shared by two agents is ONE entry naming both',
        !!shared && shared.agents.join() === 'a,b' && shared.scope === 'project');
    ok('5 the walk stops at the worktree', !oc.some(f => P(f.file) === P('/opencode.json')));
    ok('5 the global config is read from home', oc.some(f => f.scope === 'global'));
    ok('5 an absent file is read once, not once per agent',
        reads.filter(f => P(f) === P('/nest/opencode.json')).length === 1);
    const cl = D.collectEngineConfigFiles('claude', deps);
    ok('5 claude: project and local files per agent', cl.length === 2
        && cl.some(f => f.scope === 'project' && f.agents[0] === 'a')
        && cl.some(f => f.scope === 'local' && f.agents[0] === 'b'));
    ok('5 an engine with no config files returns nothing', D.collectEngineConfigFiles('codex', deps).length === 0);
}

// ---- 6. Read-only by construction ----
{
    const src = fs.readFileSync(path.join(ROOT, 'src', 'core', 'engineConfigDiagnosis.ts'), 'utf8');
    ok('6 the module imports no file system', !/from ['"](fs|fs\/promises|node:fs)['"]/.test(src)
        && !/require\(['"](fs|node:fs)['"]\)/.test(src));
    ok('6 the module names no write call', !/write(File|Sync)|appendFile|rename|unlink|mkdir/.test(src));
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const at = ext.indexOf('collectEngineConfigFiles(engine');
    const call = at >= 0 ? ext.slice(at, at + 600) : '';
    ok('6 the host hands the collector a reader and nothing else', /readFileSync/.test(call)
        && !/write|unlink|rename|mkdir/i.test(call.replace(/opencodeWorktree/g, '')));
}

// ---- 7. It reaches the health report, on both return paths ----
{
    const adapter = (axis) => ({ engine: 'opencode', axis, preflight: () => [], catalog: () => undefined });
    const catalog = { source: 'engine-reported', providers: [{ providerId: 'anthropic', label: 'Anthropic', models: ['anthropic/x'] }], rows: [] };
    const configFiles = [file('opencode', 'project', 'p/opencode.json', ['a'], { model: 'ghost/y' })];
    const rep = H.providerHealth({ engine: 'opencode', adapter: adapter('provider'), catalog, configFiles, inheritedEnv: {} });
    ok('7 a config problem lands in the report problems', rep.problems.some(p => /"ghost" is not a provider/.test(p)));
    ok('7 the files read travel on the report', Array.isArray(rep.config) && rep.config.length === 1
        && rep.config[0].file === 'p/opencode.json');
    const na = H.providerHealth({ engine: 'codex', adapter: { ...adapter('not-applicable'), engine: 'codex' },
        catalog: undefined, configFiles: [], inheritedEnv: {} });
    ok('7 the not-applicable path carries config too', Array.isArray(na.config));
    const none = H.providerHealth({ engine: 'opencode', adapter: adapter('provider'), catalog, inheritedEnv: {} });
    ok('7 no config files → an empty list, no findings', none.config.length === 0
        && !none.problems.some(p => /parse|bare model|not a provider/.test(p)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
