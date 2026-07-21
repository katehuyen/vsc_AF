// Farm Bridge core (compiled core/bridge.js, pure): request parsing, the op
// registry with its self-describing farm.ops catalog, dispatch outcomes and
// the arg helpers — the machinery that lets agents drive the farm through
// request files while future features plug in with one registration.
const path = require('path');
const fs = require('fs');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { BridgeRegistry, parseBridgeRequest, need, argStr, optStr } =
    require(path.join(__dirname, '..', 'out', 'core', 'bridge.js'));
const { antigravityStatus, syncToAntigravity } =
    require(path.join(__dirname, '..', 'out', 'core', 'antigravity.js'));
const { syncCodexExtras } = require(path.join(__dirname, '..', 'out', 'core', 'codex.js'));

// ---------- parseBridgeRequest ----------
{
    const good = parseBridgeRequest('{"op":"tasks.add","args":{"agent":"dev"}}');
    ok('valid request parsed', good.op === 'tasks.add' && good.args.agent === 'dev');
    ok('missing args defaults to {}', (() => {
        const r = parseBridgeRequest('{"op":"farm.ops"}');
        return r.op === 'farm.ops' && typeof r.args === 'object' && Object.keys(r.args).length === 0;
    })());
    ok('broken JSON yields a helpful error', /valid JSON/.test(parseBridgeRequest('{nope').error));
    ok('non-object rejected', /JSON object/.test(parseBridgeRequest('[1,2]').error));
    ok('missing op points at the catalog', /farm\.ops/.test(parseBridgeRequest('{"args":{}}').error));
    // a Windows agent writing with PowerShell's `Set-Content -Encoding utf8`
    // prepends a UTF-8 BOM — the bridge must accept it, not reject it
    ok('UTF-8 BOM tolerated (PowerShell utf8 output)',
        parseBridgeRequest('﻿{"op":"farm.ops"}').op === 'farm.ops');
    ok('surrounding whitespace tolerated',
        parseBridgeRequest('\n  {"op":"tasks.list"}  \n').op === 'tasks.list');
}

// ---------- registry: register, catalog, dispatch ----------
(async () => {
    const reg = new BridgeRegistry();
    let got = null;
    reg.register([
        { op: 'x.echo', describe: 'echo args back. args: any', handler: a => ({ echoed: a }) },
        { op: 'x.boom', describe: 'always throws', handler: () => { throw new Error('kaboom'); } },
        {
            op: 'x.strict', describe: 'needs name', handler: a => {
                const name = argStr(a, 'name');
                need(name !== 'no', 'name must not be "no"');
                got = optStr(a, 'extra');
                return { name };
            }
        }
    ]);

    const cat = reg.catalog();
    ok('farm.ops is built in and catalog is sorted',
        cat[0].op === 'farm.ops' && cat.some(c => c.op === 'x.echo') && cat.every(c => c.describe.length > 0));
    const viaOp = await reg.dispatch('farm.ops', {});
    ok('farm.ops dispatch returns the catalog', viaOp.ok && viaOp.result.length === cat.length);

    const echo = await reg.dispatch('x.echo', { a: 1 });
    ok('dispatch returns the handler result', echo.ok && echo.result.echoed.a === 1);

    const unknown = await reg.dispatch('nope.op', {});
    ok('unknown op fails and mentions the catalog', !unknown.ok && /farm\.ops/.test(unknown.error));

    const boom = await reg.dispatch('x.boom', {});
    ok('a throwing handler becomes a clean error', !boom.ok && boom.error === 'kaboom');

    const missing = await reg.dispatch('x.strict', {});
    ok('argStr enforces required args', !missing.ok && /required string arg "name"/.test(missing.error));

    const refused = await reg.dispatch('x.strict', { name: 'no' });
    ok('need() turns into an error outcome', !refused.ok && /must not be/.test(refused.error));

    const fine = await reg.dispatch('x.strict', { name: ' ali ', extra: 7 });
    ok('argStr trims; optStr ignores non-strings', fine.ok && fine.result.name === 'ali' && got === '');

    // ---------- §19.C: agents.sync op contract (cross-engine forward sync) ----------
    // Registers the real handler shape (backed by the compiled antigravity + codex
    // functions) and dispatches it, proving the op is catalogued and honours its
    // non-destructive contract — the same wiring extension.ts registers at activate().
    {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-bridge-sync-'));
        fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Ajan\n\nBkz. CLAUDE.md.\n');
        const agent = { name: 'dev', dir, duties: [] };
        reg.register({
            op: 'agents.sync',
            describe: 'Cross-engine sync: CLAUDE.md → AGENTS.md + Codex MCP snippet. args: agent, force?',
            handler: (a) => {
                const st = antigravityStatus(agent.dir);
                if ((st.state === 'conflict' || st.state === 'foreign' || st.state === 'antigravity-ahead')
                    && a.force !== true) {
                    return { agent: agent.name, state: st.state, synced: false };
                }
                const ag = syncToAntigravity(agent.dir, agent.duties, { force: true });
                const cx = syncCodexExtras(agent.dir);
                return { agent: agent.name, state: 'in-sync', synced: true, written: [...ag.written, ...cx.written] };
            }
        });
        ok('agents.sync appears in the catalog', reg.catalog().some(c => c.op === 'agents.sync'));

        const first = await reg.dispatch('agents.sync', { agent: 'dev' });
        ok('agents.sync forward-syncs a fresh agent', first.ok && first.result.synced === true &&
            fs.existsSync(path.join(dir, 'AGENTS.md')));

        // Hand-edit AGENTS.md → antigravity-ahead → guard refuses without force.
        fs.appendFileSync(path.join(dir, 'AGENTS.md'), '\nElle eklenen satır.\n');
        const guarded = await reg.dispatch('agents.sync', { agent: 'dev' });
        ok('agents.sync is non-destructive on divergence (no force)',
            guarded.ok && guarded.result.synced === false && guarded.result.state === 'antigravity-ahead');

        const forced = await reg.dispatch('agents.sync', { agent: 'dev', force: true });
        ok('agents.sync with force overwrites from CLAUDE.md', forced.ok && forced.result.synced === true);

        try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
