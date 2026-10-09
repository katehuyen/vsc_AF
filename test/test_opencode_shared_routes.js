// X-519 — the ONE shared `opencode acp` process takes every lendable route, remembers each
// card's model across a reload, and restarts itself when the routes change — never under a
// running turn or an open permission question. Driven with a fake process; no binary.
const path = require('path');
const fs = require('fs');
const os = require('os');
const OUT = path.join(__dirname, '..', 'out', 'core');
const A = require(path.join(OUT, 'opencodeacp.js'));
const S = require(path.join(OUT, 'opencodeSharedRoutes.js'));
const R = require(path.join(OUT, 'opencodeReload.js'));
const { ConsoleHost, nodeOpencodeIo } = require(path.join(OUT, 'consolehost.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const settle = async (n = 15) => { for (let i = 0; i < n; i++) { await new Promise(r => setTimeout(r, 1)); } };

const INIT = {
    protocolVersion: 1,
    agentCapabilities: {
        loadSession: true, mcpCapabilities: { http: true, sse: true },
        promptCapabilities: { embeddedContext: true, image: true },
        sessionCapabilities: { close: {}, fork: {}, list: {}, resume: {} }
    },
    authMethods: [], agentInfo: { name: 'OpenCode', version: '1.18.18' }
};
const MODELS = [{ value: 'opencode/big-pickle', name: 'Big Pickle' }, { value: 'af-kimi/k2', name: 'Kimi' }];
const config = (model = 'opencode/big-pickle', models = MODELS) => [
    { id: 'model', name: 'Model', category: 'model', currentValue: model, options: models },
    { id: 'mode', name: 'Mode', category: 'mode', currentValue: 'build', options: [{ value: 'build', name: 'build' }, { value: 'plan', name: 'plan' }] }
];

/** A fake engine: answers initialize, session/new and set_config_option itself; session/load when `st.autoLoad`. */
function fakeIo(st) {
    const io = {
        children: [], sessions: 0,
        print: () => st.print,
        spawn(cwd) {
            const c = {
                cwd, written: [], killed: 0, pid: 7000 + io.children.length, _out: [], _exit: [],
                write(text) { c.written.push(text); c._auto(text); return true; },
                kill() { c.killed++; for (const f of c._exit) { f(null); } },
                onStdout(f) { c._out.push(f); }, onStderr() { }, onExit(f) { c._exit.push(f); },
                frames() { return c.written.map(l => JSON.parse(l)); },
                sent(m) { return c.frames().filter(f => f.method === m); },
                push(o) { for (const f of c._out) { f(Buffer.from(JSON.stringify(o) + '\n', 'utf8')); } },
                answer(method, result) { const f = c.sent(method).pop(); c.push({ jsonrpc: '2.0', id: f.id, result }); return f; },
                _auto(text) {
                    const f = JSON.parse(text);
                    const reply = result => setImmediate(() => c.push({ jsonrpc: '2.0', id: f.id, result }));
                    if (f.method === 'initialize') { reply(INIT); }
                    if (f.method === 'session/new') { reply({ sessionId: `ses_${++io.sessions}`, configOptions: config() }); }
                    if (f.method === 'session/set_config_option') {
                        reply({ configOptions: f.params.configId === 'model' ? config(f.params.value, st.models) : config(undefined, st.models) });
                    }
                    if (f.method === 'session/load' && st.autoLoad) { reply({ configOptions: config(st.loadModel, st.models) }); }
                }
            };
            io.children.push(c);
            return c;
        },
        readTextFile: () => '', writeTextFile: () => { }
    };
    return io;
}

function fakeCard(log) {
    const card = {
        reloads: [], notes: [], lists: [],
        update: () => { }, permission: () => { },
        reloaded: (ok2, why, planned) => { card.reloads.push({ ok: ok2, why, planned }); log && log.push('reloaded'); },
        note: t => card.notes.push(t),
        options: o => { card.lists.push(o); log && log.push('options'); }
    };
    return card;
}

async function opened(st) {
    const io = fakeIo(st);
    const rt = new A.OpencodeRuntime(io);
    const made = await rt.newSession('D:\\repo');
    return { io, rt, sid: made.sessionId };
}

(async () => {
    // ---------- (1) the environment the shared process is given ----------
    {
        const routes = [
            { id: 'kimi', label: 'Kimi', engines: ['opencode'], baseUrl: 'https://api.kimi.example', authKind: 'api-key', tiers: { opus: 'k2' }, revision: 3 },
            { id: 'nokey', label: 'No key', engines: ['opencode'], baseUrl: 'https://nokey.example', tiers: { opus: 'm1' }, revision: 1 },
            { id: 'claudeonly', label: 'Claude only', engines: ['claude'], baseUrl: 'https://c.example', tiers: { opus: 'z' }, revision: 1 }
        ];
        let secret = 'sk-kimi-123';
        const keyOf = id => (id === 'kimi' ? secret : undefined);
        const env = S.sharedRouteEnv(undefined, routes, keyOf);
        const cfg = JSON.parse(env.OPENCODE_CONFIG_CONTENT);
        ok('every lendable route with a key is one provider in ONE fragment', Object.keys(cfg.provider).join() === 'af-kimi');
        ok('…its key in its own variable', env.AF_ROUTE_KEY_KIMI === 'sk-kimi-123');
        ok('a route with no usable key (none, or held for an old address) is not given', !('AF_ROUTE_KEY_NOKEY' in env) && !cfg.provider['af-nokey']);
        ok('the fragment names the variable, never the key', !env.OPENCODE_CONFIG_CONTENT.includes('sk-kimi-123'));
        const joined = JSON.parse(S.sharedRouteEnv('{"instructions":["D:/rules.md"]}', routes, keyOf).OPENCODE_CONFIG_CONTENT);
        ok('…and it JOINS the window\'s own OPENCODE_CONFIG_CONTENT', joined.instructions[0] === 'D:/rules.md' && !!joined.provider['af-kimi']);
        ok('no lendable route adds nothing at all', Object.keys(S.sharedRouteEnv(undefined, routes, () => undefined)).length === 0);
        const p1 = S.sharedRoutePrint(routes, keyOf);
        ok('the print never carries the key', !!p1 && !p1.includes('sk-kimi'));
        ok('the same routes and key give the same print', S.sharedRoutePrint(routes, keyOf) === p1);
        secret = 'sk-kimi-456';
        ok('a Farm Secret given a new value is a new print', S.sharedRoutePrint(routes, keyOf) !== p1);
        ok('no route, no print', S.sharedRoutePrint(routes, () => undefined) === '');
    }

    // ---------- (1b) the real spawn carries it (node stands in for opencode) ----------
    {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-x519-'));
        const script = path.join(dir, 'env.js');
        fs.writeFileSync(script, 'process.stdout.write(JSON.stringify({ k: process.env.AF_ROUTE_KEY_T || null }));');
        const run = io => new Promise(resolve => {
            const c = io.spawn(dir);
            let out = '';
            c.onStdout(ch => { out += String(ch); });
            c.onExit(() => resolve(out));
        });
        const withRoutes = nodeOpencodeIo(() => 'node', () => [script], { env: () => ({ AF_ROUTE_KEY_T: 'v1' }), print: () => 'pp' });
        ok('the io hands the runtime the print it was given', withRoutes.print() === 'pp');
        ok('‼️ a spawn with a lendable route carries its key variable', JSON.parse(await run(withRoutes)).k === 'v1');
        const plain = nodeOpencodeIo(() => 'node', () => [script]);
        ok('…and one with none is exactly the old spawn (no print, the window\'s environment)',
            plain.print === undefined && JSON.parse(await run(plain)).k === (process.env.AF_ROUTE_KEY_T || null));
        fs.rmSync(dir, { recursive: true, force: true });
    }

    // ---------- (2) a model chosen is put back after a reload, before the card is told ----------
    {
        const st = { print: 'p1', autoLoad: true, loadModel: 'opencode/big-pickle' };
        const { io, rt, sid } = await opened(st);
        const log = [];
        const card = fakeCard(log);
        rt.attach(sid, 'D:\\repo', card);
        await rt.setConfig(sid, 'model', 'af-kimi/k2');
        io.children[0].kill();
        await settle();
        const again = io.children[1].sent('session/set_config_option');
        ok('‼️ the model the reloaded session lost is set again on the new process',
            again.length === 1 && again[0].params.value === 'af-kimi/k2' && again[0].params.sessionId === sid);
        ok('…the card gets the session\'s own list with it, before it is told it is back',
            card.lists.pop().find(o => o.id === 'model').currentValue === 'af-kimi/k2' && log.join() === 'options,reloaded');
        rt.dispose();
    }
    {
        const st = { print: 'p1', autoLoad: true, loadModel: 'af-kimi/k2' };
        const { io, rt, sid } = await opened(st);
        const card = fakeCard();
        rt.attach(sid, 'D:\\repo', card);
        await rt.setConfig(sid, 'model', 'af-kimi/k2');
        io.children[0].kill();
        await settle();
        ok('a model the reloaded session still has is not sent again', io.children[1].sent('session/set_config_option').length === 0);
        rt.dispose();
    }
    {
        const st = { print: 'p1', autoLoad: true, loadModel: 'opencode/big-pickle' };
        const { io, rt, sid } = await opened(st);
        const card = fakeCard();
        rt.attach(sid, 'D:\\repo', card);
        await rt.setConfig(sid, 'model', 'af-kimi/k2');
        st.models = [MODELS[0]];
        io.children[0].kill();
        await settle();
        ok('‼️ a model no longer offered (its route removed) is SAID on the card, never sent',
            io.children[1].sent('session/set_config_option').length === 0
            && card.notes.some(n => /no longer offers "af-kimi\/k2"/.test(n) && /opencode\/big-pickle/.test(n)));
        rt.dispose();
    }

    // ---------- (3) refresh: the four states ----------
    {
        const st = { print: 'p1', autoLoad: true };
        const io = fakeIo(st);
        const rt = new A.OpencodeRuntime(io);
        ok('no process: nothing (the next spawn reads the routes afresh)', rt.refresh() === 'none' && io.children.length === 0);
        await rt.newSession('D:\\repo');
        const sid = 'ses_1';
        const card = fakeCard();
        rt.attach(sid, 'D:\\repo', card);
        ok('the print it started with: nothing', rt.refresh() === 'same' && io.children.length === 1);
        st.print = 'p2';
        ok('‼️ every card idle: it restarts now', rt.refresh() === 'restart' && io.children[0].killed === 1);
        await settle();
        ok('…ONE new process, the card re-opened on it', io.children.length === 2 && io.children[1].sent('session/load').length === 1);
        ok('…and told in the planned words, not as a crash',
            card.reloads.length === 1 && card.reloads[0].ok && card.reloads[0].planned === true && card.reloads[0].why === R.PLANNED_RESTART);
        ok('…and the new process holds the new print', rt.refresh() === 'same');

        // a turn is running: due, and nothing is cut
        const turn = rt.prompt(sid, A.opencodePromptBlocks('uzun iş'));
        let cut = '';
        turn.catch(e => { cut = e.message; });
        st.print = 'p3';
        ok('‼️ a running turn: marked due, the process untouched', rt.refresh() === 'due' && io.children[1].killed === 0 && rt.refreshDueSince > 0);
        await settle();
        ok('…still untouched while the turn runs', io.children[1].killed === 0 && io.children.length === 2);
        io.children[1].answer('session/prompt', { stopReason: 'end_turn' });
        await settle();
        ok('‼️ the turn finished whole, THEN the process restarted once',
            !cut && io.children[1].killed === 1 && io.children.length === 3 && rt.refreshDueSince === 0);

        // a permission question is open: due until it is answered
        await settle();
        io.children[2].push({ jsonrpc: '2.0', id: 77, method: 'session/request_permission', params: { sessionId: sid, toolCall: {}, options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }] } });
        await settle();
        st.print = 'p4';
        ok('‼️ an open permission question: due, never cut', rt.refresh() === 'due' && io.children[2].killed === 0);
        rt.answerPermission('ocp-77', 'allow');
        await settle();
        ok('…answered, it restarts', io.children[2].killed === 1 && io.children.length === 4);
        rt.dispose();
    }

    // ---------- (3b) a card opened during the reload waits for it ----------
    {
        const st = { print: 'p1', autoLoad: true };
        const { io, rt, sid } = await opened(st);
        rt.attach(sid, 'D:\\repo', fakeCard());
        st.print = 'p2';
        rt.refresh();
        ok('a card waiting to come back is said to be awaiting its reload', rt.reloading && rt.awaitsReload(sid));
        const late = rt.newSession('D:\\other');
        await settle();
        await late;
        ok('‼️ a card opened during the reload waits and lands on the NEW process',
            io.children[0].sent('session/new').length === 1 && io.children[1].sent('session/new').length === 1 && io.children.length === 2);
        ok('…and the gate is open again', !rt.reloading && !rt.awaitsReload(sid));
        rt.dispose();
    }

    // ---------- (4) the host: route default, held message, the one line ----------
    {
        const st = { print: 'p1', autoLoad: true, loadModel: 'opencode/big-pickle' };
        const io = fakeIo(st);
        const engineRuntime = (agentId, engine) => (engine === 'opencode'
            ? { modelRule: { refs: ['af-kimi/k2'], defaultRef: 'af-kimi/k2' } } : undefined);
        const host = new ConsoleHost(() => 'claude', undefined, undefined, undefined, undefined, io, engineRuntime);
        const id = host.start({ agentId: 'dev', agentName: 'developer', cwd: 'D:\\repo', engine: 'opencode', permissionMode: 'default' });
        await settle();
        ok('‼️ a card on a lent route with no model gets the route\'s default after session/new',
            io.children[0].sent('session/set_config_option').some(f => f.params.value === 'af-kimi/k2') && host.get(id).model === 'af-kimi/k2');
        st.print = 'p2';
        ok('the host passes a route change to the runtime', host.refreshOpencodeRoutes() === 'restart');
        const r = host.send(id, 'merhaba');
        ok('‼️ a message sent while the card waits for its reload is HELD', !!r && r.queued === true && io.children.length === 1);
        await settle(25);
        const prompts = io.children[1].sent('session/prompt');
        ok('…the reload puts the model back and then sends it, on the new process',
            io.children[1].sent('session/set_config_option').some(f => f.params.value === 'af-kimi/k2')
            && prompts.length === 1 && JSON.stringify(prompts[0].params.prompt).includes('merhaba'));
        const sys = host.get(id).messages.filter(m => m.role === 'system').map(m => m.text);
        ok('…and the card reads the one planned line', sys.includes('OpenCode restarted with the new route settings'));
        ok('the model box still says the route\'s model', host.get(id).model === 'af-kimi/k2');
        const state = host.opencodeRuntimeState();
        ok('the runtime state names reloading and refreshDue', state.reloading === false && state.refreshDue === false && state.cards === 1);
        host.dispose();
    }

    // ---------- (5) the wiring in the extension, and the bridge op ----------
    {
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        const call = src.slice(src.indexOf('nodeOpencodeIo(() => ENGINES.opencode.exe'), src.indexOf('nodeOpencodeIo(() => ENGINES.opencode.exe') + 400);
        ok('‼️ the shared process is given every lendable route and its print, at each spawn',
            /env: \(\) => sharedRouteEnv\(process\.env\.OPENCODE_CONFIG_CONTENT, providerProfiles\(\), routeKeyValue\)/.test(call)
            && /print: \(\) => sharedRoutePrint\(providerProfiles\(\), routeKeyValue\)/.test(call));
        ok('a route usable for it is one whose key may go to its address now (routeKeyOf.value)',
            /const routeKeyValue = [\s\S]{0,200}return p \? routeKeyOf\(p\)\.value : undefined;/.test(src));
        const hook = src.slice(src.indexOf('let opencodeRouteTimer'), src.indexOf('let opencodeRouteTimer') + 900);
        ok('‼️ a route or key change (the setting) and a Farm Secret change (the keychain) both ask for a refresh',
            /affectsConfiguration\('agentFarm\.providerProfiles'\)\) \{ refreshOpencodeRoutes\(\); \}/.test(hook)
            && /context\.secrets\.onDidChange\(\(\) => refreshOpencodeRoutes\(\)\)/.test(hook)
            && /consoleHost\.refreshOpencodeRoutes\(\)/.test(hook));
        const op = src.slice(src.indexOf("op: 'console.runtime'"), src.indexOf("op: 'console.runtime'") + 1200);
        ok('the bridge reads the runtime through the one host method, and names every field',
            /consoleHost\.opencodeRuntimeState\(\)/.test(op)
            && ['phase', 'pid', 'cards', 'reloading', 'refreshDue', 'refreshDueSince'].every(w => op.includes(w))
            && /nothing forces a restart/.test(op));
    }

    console.log(`test_opencode_shared_routes: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
