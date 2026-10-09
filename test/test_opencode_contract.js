// X-517 F — the engine-version contract probe. The interpreter is pure and is read against what OpenCode
// 1.18.35 really printed and sent on 2026-10-10 (the probe run by hand: both shapes listed, both reached
// their path with the key in the right header); the runner is driven with a stand-in for OpenCode that
// talks to the real local server.
'use strict';
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want));

const C = require(path.join(ROOT, 'out', 'core', 'opencodeContract.js'));
const P = require(path.join(ROOT, 'out', 'core', 'opencodeContractProbe.js'));

const KEY = C.PROBE_KEY;
// Recorded: `opencode models af-probe` stdout and the requests the local server saw, per shape (1.18.35).
const RECORDED = [
    { shape: 'anthropic', listed: 'af-probe/probe-model\r\n', requests: [
        { method: 'POST', path: '/v1/messages', headers: { 'x-api-key': KEY } },
        { method: 'POST', path: '/v1/messages', headers: { 'x-api-key': KEY } }] },
    { shape: 'openai-compatible', listed: 'af-probe/probe-model\r\n', requests: [
        { method: 'POST', path: '/chat/completions', headers: { authorization: `Bearer ${KEY}` } },
        { method: 'POST', path: '/chat/completions', headers: { authorization: `Bearer ${KEY}` } }] }
];

// ---------- F1 what the probe runs ----------
{
    const cmds = C.probeCommands();
    ok('‼️ never the bare TUI: both commands are subcommands', cmds.models[0] === 'models' && cmds.run[0] === 'run');
    eq('the catalog asks for the probe provider alone', cmds.models, ['models', 'af-probe']);
    ok('the turn names the probe model and the read-only agent', cmds.run.join(' ').includes('-m af-probe/probe-model') && cmds.run.join(' ').includes('--agent plan'));
    const env = C.probeEnv('anthropic', 'http://127.0.0.1:5');
    eq('no self-update while it runs', env.OPENCODE_DISABLE_AUTOUPDATE, '1');
    eq('the stand-in key goes in the route\'s own variable', env.AF_ROUTE_KEY_PROBE, KEY);
    const frag = JSON.parse(env.OPENCODE_CONFIG_CONTENT).provider['af-probe'];
    eq('the fragment is the one a launch writes (anthropic: endpoint + /v1, key by reference)',
        [frag.npm, frag.options.baseURL, frag.options.apiKey], ['@ai-sdk/anthropic', 'http://127.0.0.1:5/v1', '{env:AF_ROUTE_KEY_PROBE}']);
    const oai = JSON.parse(C.probeEnv('openai-compatible', 'http://127.0.0.1:5').OPENCODE_CONFIG_CONTENT).provider['af-probe'];
    eq('…and the other shape (OpenCode URL, OpenAI-style)', [oai.npm, oai.options.baseURL], ['@ai-sdk/openai-compatible', 'http://127.0.0.1:5']);
    ok('the stand-in is no key: nothing shaped like one', !/^sk-|^ey/.test(KEY));
}

// ---------- F2 reading what came back ----------
{
    const good = C.readContract('1.18.35', 7, RECORDED);
    eq('the recorded run: the contract holds', [good.status, good.problems], ['ok', []]);
    eq('…each shape listed, reached and keyed', good.shapes.map(s => [s.shape, s.listed, s.reached, s.keyed]),
        [['anthropic', true, true, true], ['openai-compatible', true, true, true]]);
    ok('‼️ no header value is kept in the verdict', !JSON.stringify(good).includes(KEY));

    const moved = C.readContract('1.19.0', 7, [RECORDED[0], { ...RECORDED[1], requests: [{ method: 'POST', path: '/v1/chat/completions', headers: { authorization: `Bearer ${KEY}` } }] }]);
    ok('a request that went elsewhere is a broken contract, naming where it went',
        moved.status === 'broken' && /openai-compatible: no request reached \/chat\/completions — it went to \/v1\/chat\/completions/.test(moved.problems[0]));
    const unkeyed = C.readContract('1.19.0', 7, [{ ...RECORDED[0], requests: [{ method: 'POST', path: '/v1/messages?beta=true', headers: { authorization: `Bearer ${KEY}` } }] }, RECORDED[1]]);
    ok('a request without the key in its header is broken (a query string does not hide the path)',
        unkeyed.status === 'broken' && /reached \/v1\/messages without the key in x-api-key/.test(unkeyed.problems[0]));
    const unlisted = C.readContract('1.19.0', 7, [{ ...RECORDED[0], listed: '' }, RECORDED[1]]);
    ok('a provider the catalog no longer lists is broken', unlisted.status === 'broken' && /does not list the provider/.test(unlisted.problems[0]));
    const silent = C.readContract('1.19.0', 7, [{ ...RECORDED[0], requests: [] }, RECORDED[1]]);
    ok('nothing reaching the server is said so', /nothing reached the local server/.test(silent.problems[0]));
    const notRun = C.readContract('1.19.0', 7, [{ shape: 'anthropic', listed: '', requests: [], error: 'spawn opencode ENOENT' }, RECORDED[1]]);
    ok('‼️ a probe that could not run concludes nothing — not-run, never broken', notRun.status === 'not-run' && /could not be run \(spawn opencode ENOENT\)/.test(notRun.problems[0]));

    ok('a version never probed is due', C.contractDue(undefined, '1.18.35'));
    ok('…a probed one is not, whatever it found', !C.contractDue(good, '1.18.35') && !C.contractDue(notRun, '1.19.0'));
    ok('…a new version is', C.contractDue(good, '1.19.0'));
    ok('…and no version read is no probe', !C.contractDue(undefined, ''));
    eq('a holding contract puts nothing on a row', C.contractProblem(good, '1.18.35'), '');
    ok('a broken one does, for THAT version', /^engine contract changed: OpenCode 1\.19\.0/.test(C.contractProblem(moved, '1.19.0')));
    eq('…and not once the CLI has moved on', C.contractProblem(moved, '1.19.1'), '');
}

// ---------- F3 the runner, with a stand-in OpenCode against the real local server ----------
async function runner() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-contract-'));
    const calls = [];
    // Behaves like the recorded OpenCode: lists the fragment's provider, then posts where the fragment says.
    const spawn = (args, env, cwd, stdin, timeoutMs, until) => {
        calls.push({ args, cwd, stdin, autoupdate: env.OPENCODE_DISABLE_AUTOUPDATE });
        const frag = JSON.parse(env.OPENCODE_CONFIG_CONTENT).provider['af-probe'];
        if (args[0] === 'models') { return Promise.resolve({ code: 0, stdout: 'af-probe/probe-model\r\n', stderr: '' }); }
        const anthropic = frag.npm === '@ai-sdk/anthropic';
        const key = env.AF_ROUTE_KEY_PROBE;
        const u = new URL(frag.options.baseURL + (anthropic ? '/messages' : '/chat/completions'));
        return new Promise(resolve => {
            const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: 'POST',
                headers: anthropic ? { 'x-api-key': key } : { authorization: `Bearer ${key}` } }, res => {
                res.resume();
                res.on('end', () => resolve({ code: 1, stdout: `{"statusCode":${res.statusCode}}`, stderr: '', until: until && until() }));
            });
            req.end('{}');
        });
    };
    const r = await P.runContractProbe({ version: '1.18.35', workDir: path.join(dir, 'probe'), spawn, now: () => 42 });
    eq('the stand-in OpenCode through the real server: the contract holds', [r.status, r.version, r.at], ['ok', '1.18.35', 42]);
    eq('two commands per shape, models before run', calls.map(c => c.args[0]), ['models', 'run', 'models', 'run']);
    ok('every command ran in the probe\'s own folder, with no self-update', calls.every(c => c.cwd === path.join(dir, 'probe') && c.autoupdate === '1') && fs.existsSync(path.join(dir, 'probe')));
    ok('the turn is given its prompt on stdin', calls[1].stdin === C.PROBE_PROMPT && calls[0].stdin === undefined);

    const broken = await P.runContractProbe({ version: '1.19.0', workDir: path.join(dir, 'probe'), spawn: () => Promise.reject(new Error('spawn opencode ENOENT')) });
    eq('a CLI that cannot be started is not-run, and the runner does not throw', broken.status, 'not-run');
    fs.rmSync(dir, { recursive: true, force: true });
}

// ---------- F4 the wiring ----------
function wiring() {
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8').replace(/\r\n/g, '\n');
    const at = ext.indexOf('const checkOpencodeContract = async');
    const body = ext.slice(at, ext.indexOf('\n    };', at));
    ok('the check exists', at > 0);
    ok('…it probes once per CLI version (contractDue), unless asked', /if \(!force && !contractDue\(last, version\)\)/.test(body));
    ok('…in a folder under the work area', /workDir: path\.join\(workArea\.path \|\| os\.tmpdir\(\), 'af-opencode-contract'\)/.test(body));
    ok('…and a broken contract is announced ONCE per version', /postNewsOnce\(`opencode-contract:\$\{version\}`/.test(body));
    ok('it starts in the background, off activation', /setTimeout\(\(\) => \{ void checkOpencodeContract\(\); \}, \d+\)/.test(ext));
    const hi = ext.indexOf('const providerHealthInput = async');
    ok('lent route rows carry the broken contract', /lentRouteProblem: contractProblem\(opencodeContract\(\), version\)/.test(ext.slice(hi, ext.indexOf('\n    };', hi))));
    const op = ext.indexOf("op: 'providers.contract'");
    ok('providers.contract is on the bridge', op > 0);
    const opBody = ext.slice(op, op + 3000);
    ok('…reads the last result, run=true probes again through the same check', /checkOpencodeContract\(true\)/.test(opBody) && /optBool\(args, 'run'\)/.test(opBody));
}

(async () => {
    await runner();
    wiring();
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
