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

    // ---------- §19.C: tasks board ops contract (rerun / runNext / clearFinished) ----------
    // Same handler shapes extension.ts registers, against a mock TaskManager —
    // proves the ops are catalogued and guard their status preconditions.
    {
        const tasks = [
            { id: 'q1', status: 'queued', title: 'queued job' },
            { id: 'r1', status: 'running', title: 'live job' },
            { id: 'f1', status: 'failed', title: 'broken job' },
            { id: 'd1', status: 'done', title: 'done job' }
        ];
        const mgr = {
            tasks,
            retried: [], bumped: [],
            retryTask(t) { this.retried.push(t.id); return { id: t.id + '-retry', status: 'queued' }; },
            runTaskNext(t) { this.bumped.push(t.id); },
            clearFinished() { return tasks.filter(t => t.status !== 'queued' && t.status !== 'running').length; }
        };
        reg.register([
            {
                op: 'tasks.rerun',
                describe: 'Re-run a finished task as a fresh copy (a workflow-step task resumes its chain). args: id',
                handler: (args) => {
                    const t = mgr.tasks.find(x => x.id === argStr(args, 'id'));
                    need(t, 'Task not found — tasks.list shows current ids.');
                    need(t.status !== 'queued' && t.status !== 'running',
                        'Only a finished task can be re-run — it is still queued/running.');
                    const copy = mgr.retryTask(t);
                    return copy ? { id: copy.id, status: copy.status } : { resumedWorkflow: true };
                }
            },
            {
                op: 'tasks.runNext',
                describe: 'Bump a queued task to the front of the queue and request an immediate start. args: id',
                handler: (args) => {
                    const t = mgr.tasks.find(x => x.id === argStr(args, 'id'));
                    need(t, 'Task not found — tasks.list shows current ids.');
                    need(t.status === 'queued', 'Only a queued task can be bumped.');
                    mgr.runTaskNext(t);
                    return { id: t.id, status: t.status };
                }
            },
            {
                op: 'tasks.clearFinished',
                describe: 'Clear all finished (done/failed/cancelled) tasks from the board — history is archived first, output files are deleted. args: none',
                handler: () => ({ removed: mgr.clearFinished() })
            }
        ]);
        ok('tasks board ops appear in the catalog', ['tasks.rerun', 'tasks.runNext', 'tasks.clearFinished']
            .every(op => reg.catalog().some(c => c.op === op)));

        const rr = await reg.dispatch('tasks.rerun', { id: 'f1' });
        ok('tasks.rerun re-runs a failed task', rr.ok && rr.result.id === 'f1-retry' && mgr.retried.includes('f1'));
        const rrLive = await reg.dispatch('tasks.rerun', { id: 'r1' });
        ok('tasks.rerun refuses a running task', !rrLive.ok && /still queued\/running/.test(rrLive.error));

        const rn = await reg.dispatch('tasks.runNext', { id: 'q1' });
        ok('tasks.runNext bumps a queued task', rn.ok && mgr.bumped.includes('q1'));
        const rnDone = await reg.dispatch('tasks.runNext', { id: 'd1' });
        ok('tasks.runNext refuses a finished task', !rnDone.ok && /Only a queued task/.test(rnDone.error));

        const cf = await reg.dispatch('tasks.clearFinished', {});
        ok('tasks.clearFinished reports the removed count', cf.ok && cf.result.removed === 2);
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
