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

    // ---------- §19.C: duties ops contract (the standing-vigilance system) ----------
    // Real compiled duties.js against a temp agent dir — proves the whole
    // watch→do lifecycle (add/list/update/togglePause/move/delete) is bridge-
    // manageable with the same guards extension.ts registers.
    {
        const {
            readDuties, addDuty, updateDuty, deleteDuty, togglePauseDuty, moveDuty,
            CADENCES, watchStatus, claudeMdReferencesDuties, CLAUDE_MD_SNIPPET
        } = require(path.join(__dirname, '..', 'out', 'core', 'duties.js'));
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-bridge-duties-'));
        const claudeMd = path.join(dir, 'CLAUDE.md');
        fs.writeFileSync(claudeMd, '# Ajan\n');
        const agent = { name: 'dev', dir, claudeMdPath: claudeMd };
        const findDuty = (title) => {
            const d = (readDuties(dir) || { duties: [] }).duties.find(x => x.title === title);
            need(d, `Duty "${title}" not found on ${agent.name} — duties.list shows current ones.`);
            return d;
        };
        reg.register([
            {
                op: 'duties.list',
                describe: 'Standing duties with live watch status. args: agent?',
                handler: () => {
                    const info = readDuties(dir);
                    return [{
                        agent: agent.name, file: info ? info.file : null,
                        duties: (info ? info.duties : []).map(d => ({
                            title: d.title, cadence: d.cadence, paused: d.paused,
                            watch: d.watch || null, do: d.action || null, note: d.note || null,
                            watchStatus: watchStatus(d.watch) || null
                        }))
                    }];
                }
            },
            {
                op: 'duties.add',
                describe: 'Add a standing duty. args: agent, title, cadence, watch?, do?, note?, paused?, ensureReference?',
                handler: (a) => {
                    const title = argStr(a, 'title');
                    const cadence = argStr(a, 'cadence');
                    need(CADENCES.includes(cadence), `Unknown cadence "${cadence}" — use one of: ${CADENCES.join(', ')}.`);
                    const cur = readDuties(dir);
                    need(!(cur && cur.duties.some(d => d.title === title)), `${agent.name} already has a duty titled "${title}".`);
                    const file = addDuty(dir, {
                        title, cadence, paused: a.paused === true,
                        watch: optStr(a, 'watch') || undefined,
                        action: optStr(a, 'do') || undefined,
                        note: optStr(a, 'note') || undefined
                    });
                    const md = fs.readFileSync(claudeMd, 'utf8');
                    let referenced = claudeMdReferencesDuties(md);
                    if (!referenced && a.ensureReference === true) {
                        fs.writeFileSync(claudeMd, md.replace(/\n*$/, '\n') + CLAUDE_MD_SNIPPET, 'utf8');
                        referenced = true;
                    }
                    return {
                        agent: agent.name, title, file, referenced,
                        ...(referenced ? {} : { warning: 'CLAUDE.md never mentions DUTIES.md — the agent will not obey this duty.' })
                    };
                }
            },
            {
                op: 'duties.update',
                describe: 'Patch a duty in place. args: agent, title, newTitle?, cadence?, watch?, do?, note?, paused?',
                handler: (a) => {
                    const title = argStr(a, 'title');
                    const cur = findDuty(title);
                    const cadence = optStr(a, 'cadence') || cur.cadence;
                    need(cadence === cur.cadence || CADENCES.includes(cadence), `Unknown cadence "${cadence}".`);
                    const pick = (key, old) => typeof a[key] === 'string' ? (a[key].trim() || undefined) : old;
                    const next = {
                        title: optStr(a, 'newTitle') || cur.title,
                        cadence,
                        paused: typeof a.paused === 'boolean' ? a.paused : cur.paused,
                        watch: pick('watch', cur.watch),
                        action: pick('do', cur.action),
                        note: pick('note', cur.note)
                    };
                    updateDuty(dir, title, next);
                    return { agent: agent.name, duty: next };
                }
            },
            {
                op: 'duties.delete',
                describe: 'Remove a duty. args: agent, title',
                handler: (a) => {
                    const title = argStr(a, 'title');
                    findDuty(title);
                    deleteDuty(dir, title);
                    return { agent: agent.name, deleted: title };
                }
            },
            {
                op: 'duties.togglePause',
                describe: 'Pause/resume a duty. args: agent, title',
                handler: (a) => {
                    const title = argStr(a, 'title');
                    const d = findDuty(title);
                    togglePauseDuty(dir, title);
                    return { agent: agent.name, title, paused: !d.paused };
                }
            },
            {
                op: 'duties.move',
                describe: 'Reorder a duty one slot. args: agent, title, direction (up|down)',
                handler: (a) => {
                    const title = argStr(a, 'title');
                    const direction = argStr(a, 'direction');
                    need(direction === 'up' || direction === 'down', 'direction must be "up" or "down".');
                    findDuty(title);
                    moveDuty(dir, title, direction === 'up' ? -1 : 1);
                    return { agent: agent.name, order: (readDuties(dir) || { duties: [] }).duties.map(d => d.title) };
                }
            }
        ]);
        ok('duties ops appear in the catalog',
            ['duties.list', 'duties.add', 'duties.update', 'duties.delete', 'duties.togglePause', 'duties.move']
                .every(op => reg.catalog().some(c => c.op === op)));

        const badCadence = await reg.dispatch('duties.add', { agent: 'dev', title: 'X', cadence: 'hourly' });
        ok('duties.add refuses an unknown cadence', !badCadence.ok && /Unknown cadence/.test(badCadence.error));

        const first = await reg.dispatch('duties.add',
            { agent: 'dev', title: 'Inbox tasnifi', cadence: 'every-turn', watch: dir, do: 'Tasnif et.' });
        ok('duties.add creates DUTIES.md and warns about the missing CLAUDE.md reference',
            first.ok && fs.existsSync(path.join(dir, 'DUTIES.md'))
            && first.result.referenced === false && /CLAUDE\.md/.test(first.result.warning));

        const dup = await reg.dispatch('duties.add', { agent: 'dev', title: 'Inbox tasnifi', cadence: 'daily' });
        ok('duties.add refuses a duplicate title', !dup.ok && /already has a duty/.test(dup.error));

        const second = await reg.dispatch('duties.add',
            { agent: 'dev', title: 'Haftalık bakım', cadence: 'weekly', note: 'küçük tut', ensureReference: true });
        ok('duties.add ensureReference appends the CLAUDE.md instruction',
            second.ok && second.result.referenced === true
            && /DUTIES\.md/i.test(fs.readFileSync(claudeMd, 'utf8')));

        const listed = await reg.dispatch('duties.list', {});
        const rows = listed.ok ? listed.result[0].duties : [];
        ok('duties.list returns both duties with fields intact',
            rows.length === 2 && rows[0].title === 'Inbox tasnifi' && rows[0].do === 'Tasnif et.'
            && rows[1].note === 'küçük tut');
        ok('duties.list inspects a real watch path (dir → pending status object)',
            rows[0].watchStatus && rows[0].watchStatus.kind === 'dir' && rows[1].watchStatus === null);

        const patched = await reg.dispatch('duties.update',
            { agent: 'dev', title: 'Haftalık bakım', cadence: 'daily', note: '' });
        ok('duties.update patches cadence and "" clears a field',
            patched.ok && patched.result.duty.cadence === 'daily'
            && findDuty('Haftalık bakım').cadence === 'daily' && findDuty('Haftalık bakım').note === undefined);

        const pausedR = await reg.dispatch('duties.togglePause', { agent: 'dev', title: 'Haftalık bakım' });
        ok('duties.togglePause flips the paused flag',
            pausedR.ok && pausedR.result.paused === true && findDuty('Haftalık bakım').paused === true);

        const moved = await reg.dispatch('duties.move', { agent: 'dev', title: 'Haftalık bakım', direction: 'up' });
        ok('duties.move reorders and returns the new order',
            moved.ok && moved.result.order[0] === 'Haftalık bakım');

        const gone = await reg.dispatch('duties.delete', { agent: 'dev', title: 'Inbox tasnifi' });
        ok('duties.delete removes the duty',
            gone.ok && (readDuties(dir) || { duties: [] }).duties.length === 1);
        const missing = await reg.dispatch('duties.delete', { agent: 'dev', title: 'Inbox tasnifi' });
        ok('duties ops refuse a missing duty', !missing.ok && /not found/.test(missing.error));

        try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    }

    // ---------- §19.C: schedules.edit contract (edit-in-place, id survives) ----------
    {
        const schedules = [
            { id: 'sc1', agentId: 'a1', agentName: 'dev', title: 'Sabah brifingi', prompt: 'p', mode: 'headless', kind: 'daily', hour: 5, minute: 0, enabled: true },
            { id: 'sc2', agentId: 'a1', agentName: 'dev', title: 'Öğlen', prompt: 'p', mode: 'headless', kind: 'daily', hour: 12, minute: 0, enabled: true }
        ];
        const mgr = {
            schedules,
            patched: null,
            updateSchedule(id, patch) { this.patched = { id, patch }; Object.assign(schedules.find(s => s.id === id), patch); }
        };
        reg.register({
            op: 'schedules.edit',
            describe: 'Edit a schedule in place. args: id or title + fields',
            handler: (args) => {
                const ref = optStr(args, 'id') || argStr(args, 'title');
                const cur = mgr.schedules.find(x => x.id === ref || x.title === ref);
                need(cur, 'Schedule not found — schedules.list shows current ones.');
                const patch = {};
                const newTitle = optStr(args, 'newTitle');
                if (newTitle) {
                    need(!mgr.schedules.some(x => x.id !== cur.id && x.title === newTitle),
                        `A schedule titled "${newTitle}" already exists.`);
                    patch.title = newTitle;
                }
                if (optStr(args, 'prompt')) { patch.prompt = optStr(args, 'prompt'); }
                const intArg = (key, min, max) => {
                    const v = args[key];
                    if (v === undefined) { return; }
                    need(typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max,
                        `${key} must be an integer ${min}-${max}.`);
                    patch[key] = v;
                };
                intArg('hour', 0, 23);
                intArg('minute', 0, 59);
                intArg('dow', 0, 6);
                const kind = optStr(args, 'kind');
                if (kind) {
                    need(kind === 'daily' || kind === 'weekly' || kind === 'once', 'kind must be daily | weekly | once.');
                    patch.kind = kind;
                }
                const missed = optStr(args, 'missed');
                if (missed) {
                    need(missed === 'skip' || missed === 'run' || missed === 'ask', 'missed must be skip | run | ask.');
                    patch.missed = missed;
                    if (missed !== (cur.missed || 'skip') && missed !== 'skip') { patch.lastRunKey = 'SETTLED'; }
                }
                if (typeof args.enabled === 'boolean') { patch.enabled = args.enabled; }
                need(Object.keys(patch).length, 'Nothing to edit — pass at least one documented field.');
                const kindAfter = patch.kind || cur.kind;
                need(kindAfter !== 'weekly' || (patch.dow !== undefined || cur.dow !== undefined),
                    'A weekly schedule needs dow (0=Sunday … 6=Saturday).');
                mgr.updateSchedule(cur.id, patch);
                return { id: cur.id, title: patch.title || cur.title, updated: Object.keys(patch) };
            }
        });

        const notFound = await reg.dispatch('schedules.edit', { title: 'Yok böyle', hour: 6 });
        ok('schedules.edit refuses an unknown schedule', !notFound.ok && /not found/i.test(notFound.error));
        const badHour = await reg.dispatch('schedules.edit', { id: 'sc1', hour: 24 });
        ok('schedules.edit validates hour range', !badHour.ok && /0-23/.test(badHour.error));
        const dupTitle = await reg.dispatch('schedules.edit', { id: 'sc1', newTitle: 'Öğlen' });
        ok('schedules.edit refuses a duplicate title', !dupTitle.ok && /already exists/.test(dupTitle.error));
        const empty = await reg.dispatch('schedules.edit', { id: 'sc1' });
        ok('schedules.edit refuses an empty patch', !empty.ok && /Nothing to edit/.test(empty.error));
        const noDow = await reg.dispatch('schedules.edit', { id: 'sc1', kind: 'weekly' });
        ok('schedules.edit demands dow when switching to weekly', !noDow.ok && /needs dow/.test(noDow.error));

        const edited = await reg.dispatch('schedules.edit', { id: 'sc1', hour: 6, minute: 30, missed: 'run' });
        ok('schedules.edit patches in place — id survives, fields land',
            edited.ok && mgr.patched.id === 'sc1' && schedules[0].hour === 6 && schedules[0].minute === 30);
        ok('schedules.edit settles the past when catch-up switches on',
            mgr.patched.patch.lastRunKey === 'SETTLED');
    }

    // ---------- §19.C: tasks.get / tasks.delete contract ----------
    {
        // compiled tasks.js needs a vscode shim in plain node (same trick as
        // test_schedule_missed.js) — archivedOutputBody is the real function
        const Module = require('module');
        const origLoad = Module._load;
        Module._load = function (request) {
            if (request === 'vscode') {
                return {
                    Uri: {}, window: {}, EventEmitter: class { fire() {} get event() { return () => ({ dispose() {} }); } dispose() {} },
                    workspace: { getConfiguration: () => ({ get: (_k, d) => d }) },
                    ViewColumn: {}, ConfigurationTarget: {}, env: {}
                };
            }
            return origLoad.apply(this, arguments);
        };
        const { archivedOutputBody } = require(path.join(__dirname, '..', 'out', 'core', 'tasks.js'));
        Module._load = origLoad;

        const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-bridge-taskout-'));
        const outFile = path.join(outDir, 'done.md');
        fs.writeFileSync(outFile, 'Görev tamam: rapor yazıldı.\n');
        const tasks = [
            { id: 't1', title: 'Rapor', agentName: 'dev', status: 'done', mode: 'headless', prompt: 'yaz', createdAt: 1, costUSD: 0.12, outputFile: outFile },
            { id: 't2', title: 'Canlı', agentName: 'dev', status: 'running', mode: 'headless', prompt: 'koş', createdAt: 2 }
        ];
        const mgr = {
            tasks,
            deleted: [],
            deleteTask(t) { this.deleted.push(t.id); this.tasks = this.tasks.filter(x => x.id !== t.id); }
        };
        reg.register([
            {
                op: 'tasks.get',
                describe: 'One task in detail, archived output included. args: id, tail?',
                handler: (args) => {
                    const t = mgr.tasks.find(x => x.id === argStr(args, 'id'));
                    need(t, 'Task not found — tasks.list shows current ids.');
                    const tail = typeof args.tail === 'number' && args.tail > 0 ? Math.floor(args.tail) : 4000;
                    let output = null;
                    if (t.outputFile && fs.existsSync(t.outputFile)) {
                        try { output = archivedOutputBody(fs.readFileSync(t.outputFile, 'utf8')).slice(-tail); } catch {}
                    }
                    return { id: t.id, title: t.title, status: t.status, prompt: t.prompt, costUSD: t.costUSD ?? null, output };
                }
            },
            {
                op: 'tasks.delete',
                describe: 'Delete one task row permanently. args: id',
                handler: (args) => {
                    const t = mgr.tasks.find(x => x.id === argStr(args, 'id'));
                    need(t, 'Task not found — tasks.list shows current ids.');
                    need(t.status !== 'running', 'Task is running — tasks.cancel it first.');
                    mgr.deleteTask(t);
                    return { deleted: t.id };
                }
            }
        ]);

        const got = await reg.dispatch('tasks.get', { id: 't1' });
        ok('tasks.get returns detail with the output body',
            got.ok && got.result.costUSD === 0.12 && /rapor yazıldı/.test(got.result.output));
        const tailed = await reg.dispatch('tasks.get', { id: 't1', tail: 8 });
        ok('tasks.get tail limits the output chars', tailed.ok && tailed.result.output.length <= 8);
        const noOut = await reg.dispatch('tasks.get', { id: 't2' });
        ok('tasks.get without an output file returns null output', noOut.ok && noOut.result.output === null);

        const delLive = await reg.dispatch('tasks.delete', { id: 't2' });
        ok('tasks.delete refuses a running task', !delLive.ok && /tasks\.cancel/.test(delLive.error));
        const delOk = await reg.dispatch('tasks.delete', { id: 't1' });
        ok('tasks.delete removes a finished task', delOk.ok && mgr.deleted.includes('t1'));

        try { fs.rmSync(outDir, { recursive: true, force: true }); } catch {}
    }

    // ---------- §19.C: triggers.add / edit / delete contract ----------
    {
        const watchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-bridge-trig-'));
        const agents = [{ id: 'a1', name: 'dev' }];
        const findAgent = (ref) => {
            const a = agents.find(x => x.id === ref || x.name === String(ref).toLowerCase());
            need(a, `Agent "${ref}" not found — agents.list shows the current farm.`);
            return a;
        };
        const mgr = {
            triggers: [],
            workflows: [{ id: 'w1', title: 'Zincir' }],
            saved: 0,
            addTrigger(t) { const trigger = { ...t, id: 'tr' + (this.triggers.length + 1) }; this.triggers.push(trigger); return trigger; },
            updateTrigger() { this.saved++; },
            deleteTrigger(t) { this.triggers = this.triggers.filter(x => x.id !== t.id); }
        };
        const newId = () => Math.random().toString(36).slice(2, 7);
        reg.register([
            {
                op: 'triggers.add',
                describe: 'Install a trigger. args: title, type, watch?, hookEvent?, action, timing…',
                handler: (args) => {
                    const title = argStr(args, 'title');
                    const type = argStr(args, 'type');
                    need(type === 'watch' || type === 'hook' || type === 'webhook', 'type must be watch | hook | webhook.');
                    let watchPath, hookEvent, token;
                    if (type === 'watch') {
                        watchPath = argStr(args, 'watch');
                        need(fs.existsSync(watchPath), `Watch path does not exist: ${watchPath}`);
                    } else if (type === 'hook') {
                        hookEvent = argStr(args, 'hookEvent');
                        const kinds = ['start', 'prompt', 'toolStart', 'toolEnd', 'permission', 'notify', 'stop', 'subagent', 'compact', 'end'];
                        need(kinds.includes(hookEvent), `Unknown hookEvent "${hookEvent}" — use one of: ${kinds.join(', ')}.`);
                    } else { token = newId() + newId(); }
                    const rec = args.action && typeof args.action === 'object' && !Array.isArray(args.action) ? args.action : undefined;
                    need(rec, 'action is required: {kind:"task"|"dispatch"|"workflow", ...}.');
                    let action;
                    if (rec.kind === 'task') {
                        const agent = findAgent(String(rec.agent || ''));
                        const prompt = String(rec.prompt || '').trim();
                        need(prompt, 'action.prompt is required for a task action.');
                        action = { kind: 'task', agentId: agent.id, agentName: agent.name, title: String(rec.title || '').trim() || title, prompt, mode: rec.mode === 'interactive' ? 'interactive' : 'headless' };
                    } else if (rec.kind === 'dispatch') {
                        const prompt = String(rec.prompt || '').trim();
                        need(prompt, 'action.prompt is required for a dispatch action.');
                        action = { kind: 'dispatch', title: String(rec.title || '').trim() || title, prompt, mode: 'headless' };
                    } else if (rec.kind === 'workflow') {
                        const w = mgr.workflows.find(x => x.id === rec.workflow || x.title === rec.workflow);
                        need(w, 'Workflow not found — workflows.list shows current ones.');
                        action = { kind: 'workflow', workflowId: w.id };
                    } else { throw new Error('action.kind must be task | dispatch | workflow.'); }
                    const numArg = (key, def, min) => {
                        const v = args[key];
                        if (v === undefined) { return def; }
                        need(typeof v === 'number' && Number.isFinite(v) && v >= min, `${key} must be a number ≥ ${min}.`);
                        return Math.floor(v);
                    };
                    const trigger = mgr.addTrigger({
                        title, type, watchPath, hookEvent, token, action,
                        debounceSec: numArg('debounceSec', type === 'watch' ? 10 : 1, 1),
                        cooldownSec: numArg('cooldownSec', 60, 0),
                        maxPerHour: numArg('maxPerHour', 6, 0),
                        enabled: args.enabled !== false
                    });
                    return { id: trigger.id, title: trigger.title, type, ...(token ? { url: `http://127.0.0.1:8377/trigger/${token}` } : {}) };
                }
            },
            {
                op: 'triggers.edit',
                describe: 'Edit a trigger in place. args: id or title + fields',
                handler: (args) => {
                    const ref = optStr(args, 'id') || argStr(args, 'title');
                    const tr = mgr.triggers.find(x => x.id === ref || x.title === ref);
                    need(tr, 'Trigger not found — triggers.list shows current ones.');
                    const updated = [];
                    const newTitle = optStr(args, 'newTitle');
                    if (newTitle) {
                        tr.title = newTitle;
                        if (tr.action.kind !== 'workflow') { tr.action.title = newTitle; }
                        updated.push('title');
                    }
                    if (optStr(args, 'prompt')) {
                        need(tr.action.kind !== 'workflow', 'A workflow trigger has no prompt — edit the workflow instead.');
                        tr.action.prompt = optStr(args, 'prompt');
                        updated.push('prompt');
                    }
                    const numPatch = (key, min) => {
                        const v = args[key];
                        if (v === undefined) { return; }
                        need(typeof v === 'number' && Number.isFinite(v) && v >= min, `${key} must be a number ≥ ${min}.`);
                        tr[key] = Math.floor(v);
                        updated.push(key);
                    };
                    numPatch('debounceSec', 1);
                    numPatch('cooldownSec', 0);
                    numPatch('maxPerHour', 0);
                    need(updated.length, 'Nothing to edit — pass at least one documented field.');
                    mgr.updateTrigger(tr);
                    return { id: tr.id, title: tr.title, updated };
                }
            },
            {
                op: 'triggers.delete',
                describe: 'Remove a trigger. args: id or title',
                handler: (args) => {
                    const ref = optStr(args, 'id') || argStr(args, 'title');
                    const tr = mgr.triggers.find(x => x.id === ref || x.title === ref);
                    need(tr, 'Trigger not found — triggers.list shows current ones.');
                    mgr.deleteTrigger(tr);
                    return { deleted: tr.title };
                }
            }
        ]);

        const badPath = await reg.dispatch('triggers.add',
            { title: 'W', type: 'watch', watch: path.join(watchDir, 'yok'), action: { kind: 'task', agent: 'dev', prompt: 'p' } });
        ok('triggers.add refuses a missing watch path', !badPath.ok && /does not exist/.test(badPath.error));
        const badEvent = await reg.dispatch('triggers.add',
            { title: 'H', type: 'hook', hookEvent: 'boom', action: { kind: 'dispatch', prompt: 'p' } });
        ok('triggers.add validates hookEvent kinds', !badEvent.ok && /Unknown hookEvent/.test(badEvent.error));
        const noAction = await reg.dispatch('triggers.add', { title: 'X', type: 'watch', watch: watchDir });
        ok('triggers.add demands an action', !noAction.ok && /action is required/.test(noAction.error));

        const watch = await reg.dispatch('triggers.add',
            { title: 'Inbox', type: 'watch', watch: watchDir, action: { kind: 'task', agent: 'dev', prompt: 'Tasnif: {watch}' } });
        ok('triggers.add installs a watch trigger with defaults',
            watch.ok && mgr.triggers[0].debounceSec === 10 && mgr.triggers[0].cooldownSec === 60
            && mgr.triggers[0].action.agentName === 'dev' && mgr.triggers[0].enabled === true);
        const hook = await reg.dispatch('triggers.add',
            { title: 'Bitti', type: 'webhook', action: { kind: 'workflow', workflow: 'Zincir' }, maxPerHour: 0 });
        ok('triggers.add webhook returns its POST url and resolves the workflow',
            hook.ok && /\/trigger\/\w+/.test(hook.result.url)
            && mgr.triggers[1].action.workflowId === 'w1' && mgr.triggers[1].maxPerHour === 0);

        const edited = await reg.dispatch('triggers.edit', { title: 'Inbox', newTitle: 'Inbox v2', debounceSec: 30 });
        ok('triggers.edit patches title (action title follows) and timing',
            edited.ok && mgr.triggers[0].title === 'Inbox v2' && mgr.triggers[0].action.title === 'Inbox v2'
            && mgr.triggers[0].debounceSec === 30 && mgr.saved === 1);
        const badDebounce = await reg.dispatch('triggers.edit', { title: 'Inbox v2', debounceSec: 0 });
        ok('triggers.edit enforces debounce ≥ 1', !badDebounce.ok && /≥ 1/.test(badDebounce.error));

        const removed = await reg.dispatch('triggers.delete', { title: 'Inbox v2' });
        ok('triggers.delete removes the trigger', removed.ok && mgr.triggers.length === 1);

        try { fs.rmSync(watchDir, { recursive: true, force: true }); } catch {}
    }

    // ---------- §19.C: workflows.add/delete + templates.add/delete contract ----------
    {
        const agents = [{ id: 'a1', name: 'dev' }];
        const findAgent = (ref) => {
            const a = agents.find(x => x.id === ref || x.name === String(ref).toLowerCase());
            need(a, `Agent "${ref}" not found.`);
            return a;
        };
        const mgr = {
            workflows: [], templates: [],
            addWorkflow(title, steps) { const w = { id: 'w' + (this.workflows.length + 1), title, steps }; this.workflows.push(w); return w; },
            deleteWorkflow(w) { this.workflows = this.workflows.filter(x => x.id !== w.id); },
            addTemplate(t) { const tpl = { ...t, id: 'tp' + (this.templates.length + 1) }; this.templates.push(tpl); return tpl; },
            deleteTemplate(t) { this.templates = this.templates.filter(x => x.id !== t.id); }
        };
        reg.register([
            {
                op: 'workflows.add',
                describe: 'Create a workflow. args: title, steps',
                handler: (args) => {
                    const title = argStr(args, 'title');
                    need(!mgr.workflows.some(w => w.title === title), `A workflow titled "${title}" already exists.`);
                    const stepsIn = Array.isArray(args.steps) ? args.steps : [];
                    need(stepsIn.length, 'steps is required — at least one step.');
                    const steps = stepsIn.map((raw, i) => {
                        const agent = findAgent(String(raw.agent || ''));
                        const stepTitle = String(raw.title || '').trim();
                        need(stepTitle, `Step ${i + 1}: title is required.`);
                        const prompt = String(raw.prompt || '').trim();
                        need(prompt || raw.webhook || raw.media, `Step ${i + 1}: prompt is required.`);
                        const { agent: _agentRef, ...passthrough } = raw;
                        return { ...passthrough, agentId: agent.id, agentName: agent.name, title: stepTitle, prompt, mode: raw.mode === 'interactive' ? 'interactive' : 'headless' };
                    });
                    const w = mgr.addWorkflow(title, steps);
                    return { id: w.id, title: w.title, steps: w.steps.length };
                }
            },
            {
                op: 'workflows.delete',
                describe: 'Remove a workflow. args: id or title',
                handler: (args) => {
                    const ref = optStr(args, 'id') || argStr(args, 'title');
                    const w = mgr.workflows.find(x => x.id === ref || x.title === ref);
                    need(w, 'Workflow not found — workflows.list shows current ones.');
                    mgr.deleteWorkflow(w);
                    return { deleted: w.title };
                }
            },
            {
                op: 'templates.add',
                describe: 'Save a task template. args: title, prompt, mode?, agent?',
                handler: (args) => {
                    const title = argStr(args, 'title');
                    need(!mgr.templates.some(t => t.title === title), `A template titled "${title}" already exists.`);
                    const agent = optStr(args, 'agent') ? findAgent(optStr(args, 'agent')) : undefined;
                    const tpl = mgr.addTemplate({
                        title, prompt: argStr(args, 'prompt'),
                        mode: optStr(args, 'mode') === 'interactive' ? 'interactive' : 'headless',
                        agentId: agent && agent.id, agentName: agent && agent.name
                    });
                    return { id: tpl.id, title: tpl.title };
                }
            },
            {
                op: 'templates.delete',
                describe: 'Remove a template. args: id or title',
                handler: (args) => {
                    const ref = optStr(args, 'id') || argStr(args, 'title');
                    const tpl = mgr.templates.find(x => x.id === ref || x.title === ref);
                    need(tpl, 'Template not found — templates.list shows current ones.');
                    mgr.deleteTemplate(tpl);
                    return { deleted: tpl.title };
                }
            }
        ]);

        const noSteps = await reg.dispatch('workflows.add', { title: 'Boş' });
        ok('workflows.add demands steps', !noSteps.ok && /at least one step/.test(noSteps.error));
        const badStep = await reg.dispatch('workflows.add',
            { title: 'Yarım', steps: [{ agent: 'dev', title: 'adım' }] });
        ok('workflows.add validates each step', !badStep.ok && /prompt is required/.test(badStep.error));
        const wf = await reg.dispatch('workflows.add', {
            title: 'Rapor zinciri',
            steps: [
                { agent: 'dev', title: 'Topla', prompt: 'topla', outputContract: 'json' },
                { agent: 'dev', title: 'Yaz', prompt: 'yaz', runIf: 'json:ok~true', onFail: 'continue' }
            ]
        });
        ok('workflows.add resolves agents and passes advanced fields through',
            wf.ok && wf.result.steps === 2 && mgr.workflows[0].steps[0].agentId === 'a1'
            && mgr.workflows[0].steps[0].outputContract === 'json' && mgr.workflows[0].steps[1].runIf === 'json:ok~true');
        const dupWf = await reg.dispatch('workflows.add', { title: 'Rapor zinciri', steps: [{ agent: 'dev', title: 't', prompt: 'p' }] });
        ok('workflows.add refuses a duplicate title', !dupWf.ok && /already exists/.test(dupWf.error));
        const wfGone = await reg.dispatch('workflows.delete', { title: 'Rapor zinciri' });
        ok('workflows.delete removes the workflow', wfGone.ok && mgr.workflows.length === 0);

        const tpl = await reg.dispatch('templates.add', { title: 'Günlük özet', prompt: 'özetle', agent: 'dev' });
        ok('templates.add saves a bound template', tpl.ok && mgr.templates[0].agentName === 'dev');
        const tplFree = await reg.dispatch('templates.add', { title: 'Serbest', prompt: 'yap' });
        ok('templates.add saves an unbound template', tplFree.ok && mgr.templates[1].agentId === undefined);
        const tplGone = await reg.dispatch('templates.delete', { title: 'Serbest' });
        ok('templates.delete removes the template', tplGone.ok && mgr.templates.length === 1);
    }

    // ---------- §19.C: mission-control ops contract (pause/resume/cancel/answer/approve) ----------
    {
        const runs = [
            { id: 'r-live', status: 'running' },
            { id: 'r-parked', status: 'paused' },
            { id: 'r-done', status: 'done' }
        ];
        const store = { run: (id) => runs.find(r => r.id === id) };
        const engine = { paused: false, unpaused: false, pause() { this.paused = true; }, unpause() { this.unpaused = true; } };
        const engines = new Map([['r-live', engine]]);
        const questions = new Map([['r-live', { question: 'Hangi klasör?', answer: undefined, answered: false, resolve(a) { this.answer = a; this.answered = true; } }]]);
        const approvals = new Map([['r-live', 'ap1']]);
        const settled = [];
        const queue = { settle: (id, okFlag) => settled.push({ id, ok: okFlag }) };
        let resumed = null, cancelled = null;
        const resumeMission = (id) => { resumed = id; runs.find(r => r.id === id).status = 'running'; };
        const cancelMission = (id) => { cancelled = id; runs.find(r => r.id === id).status = 'cancelled'; };
        let changed = 0;
        const missionChanged = () => changed++;
        reg.register([
            {
                op: 'missions.pause',
                describe: 'Pause a live mission run. args: id',
                handler: (args) => {
                    const runId = argStr(args, 'id');
                    const run = store.run(runId);
                    need(run, 'Run not found — missions.list shows current ids.');
                    const e = engines.get(runId);
                    if (e) { e.pause(); }
                    else {
                        need(run.status === 'running' || run.status === 'waiting-approval' || run.status === 'waiting-user',
                            `Run is ${run.status} — only a live run can be paused.`);
                        run.status = 'paused';
                    }
                    missionChanged();
                    return { id: runId, status: run.status };
                }
            },
            {
                op: 'missions.resume',
                describe: 'Resume a paused mission. args: id',
                handler: (args) => {
                    const runId = argStr(args, 'id');
                    const run = store.run(runId);
                    need(run, 'Run not found — missions.list shows current ids.');
                    const e = engines.get(runId);
                    if (e) { e.unpause(); missionChanged(); }
                    else {
                        need(run.status === 'paused', `Run is ${run.status} — only a paused run can be resumed.`);
                        resumeMission(runId);
                    }
                    return { id: runId, status: store.run(runId).status };
                }
            },
            {
                op: 'missions.cancel',
                describe: 'Cancel a mission run. args: id',
                handler: (args) => {
                    const runId = argStr(args, 'id');
                    const run = store.run(runId);
                    need(run, 'Run not found — missions.list shows current ids.');
                    need(run.status !== 'done' && run.status !== 'failed' && run.status !== 'cancelled',
                        `Run is already ${run.status}.`);
                    cancelMission(runId);
                    return { id: runId, status: store.run(runId).status };
                }
            },
            {
                op: 'missions.answer',
                describe: 'Answer the question a mission waits on. args: id, answer — or skip=true',
                handler: (args) => {
                    const runId = argStr(args, 'id');
                    need(questions.has(runId), 'No pending question on this run — missions.status shows what it is doing.');
                    if (args.skip === true) { questions.get(runId).resolve(undefined); return { id: runId, skipped: true }; }
                    questions.get(runId).resolve(argStr(args, 'answer'));
                    return { id: runId, answered: true };
                }
            },
            {
                op: 'missions.approve',
                describe: 'Settle a mission round waiting for approval. args: id, ok?',
                handler: (args) => {
                    const runId = argStr(args, 'id');
                    const apId = approvals.get(runId);
                    need(apId, 'No pending approval on this run — missions.status shows its state.');
                    queue.settle(apId, args.ok !== false);
                    return { id: runId, approved: args.ok !== false };
                }
            }
        ]);
        ok('mission-control ops appear in the catalog',
            ['missions.pause', 'missions.resume', 'missions.cancel', 'missions.answer', 'missions.approve']
                .every(op => reg.catalog().some(c => c.op === op)));

        const paused = await reg.dispatch('missions.pause', { id: 'r-live' });
        ok('missions.pause reaches the live engine', paused.ok && engine.paused === true && changed === 1);
        const pauseDone = await reg.dispatch('missions.pause', { id: 'r-done' });
        ok('missions.pause refuses a finished run', !pauseDone.ok && /only a live run/.test(pauseDone.error));

        const resumedLive = await reg.dispatch('missions.resume', { id: 'r-live' });
        ok('missions.resume unpauses a live engine in place', resumedLive.ok && engine.unpaused === true && resumed === null);
        const resumedParked = await reg.dispatch('missions.resume', { id: 'r-parked' });
        ok('missions.resume relaunches a parked run', resumedParked.ok && resumed === 'r-parked'
            && resumedParked.result.status === 'running');
        const resumeDone = await reg.dispatch('missions.resume', { id: 'r-done' });
        ok('missions.resume refuses a finished run', !resumeDone.ok && /only a paused run/.test(resumeDone.error));

        const noQuestion = await reg.dispatch('missions.answer', { id: 'r-parked', answer: 'x' });
        ok('missions.answer refuses when nothing is pending', !noQuestion.ok && /No pending question/.test(noQuestion.error));
        const answered = await reg.dispatch('missions.answer', { id: 'r-live', answer: 'D:\\inbox' });
        ok('missions.answer resolves the pending question with the text',
            answered.ok && questions.get('r-live').answer === 'D:\\inbox');

        const approvedNo = await reg.dispatch('missions.approve', { id: 'r-live', ok: false });
        ok('missions.approve can reject the round plan', approvedNo.ok && settled[0].id === 'ap1' && settled[0].ok === false);
        const noApproval = await reg.dispatch('missions.approve', { id: 'r-parked' });
        ok('missions.approve refuses when nothing is pending', !noApproval.ok && /No pending approval/.test(noApproval.error));

        const cancelledR = await reg.dispatch('missions.cancel', { id: 'r-live' });
        ok('missions.cancel cancels a live run', cancelledR.ok && cancelled === 'r-live'
            && cancelledR.result.status === 'cancelled');
        const cancelAgain = await reg.dispatch('missions.cancel', { id: 'r-done' });
        ok('missions.cancel refuses an already-finished run', !cancelAgain.ok && /already done/.test(cancelAgain.error));
    }

    // ---------- §19.C: sessions.recent origin scope ----------
    // The Sessions tables let the user separate their own dialogs from the
    // farm's automation runs; the same distinction has to be reachable as data,
    // or an agent asked "what did I work on yesterday?" answers with its own
    // scheduled sweeps. Same handler shape extension.ts registers.
    {
        const Module = require('module');
        const origLoad = Module._load;
        Module._load = function (request) {
            if (request === 'vscode') { return { Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) } }; }
            return origLoad.apply(this, arguments);
        };
        const { sessionOrigin } = require(path.join(__dirname, '..', 'out', 'core', 'sessions.js'));
        Module._load = origLoad;
        const all = [
            { agentName: 'dev', title: 'my dialog', lastTs: 300, mtime: 0, userTurns: 4, cost: 1, entrypoint: 'cli' },
            { agentName: 'dev', title: 'nightly sweep', lastTs: 200, mtime: 0, userTurns: 1, cost: 2, entrypoint: 'sdk-cli' },
            { agentName: 'psy', title: 'older dialog', lastTs: 100, mtime: 0, userTurns: 2, cost: 3 }
        ];
        reg.register({
            op: 'sessions.recent',
            describe: 'Most recent sessions farm-wide. args: origin? ("user" | "auto" | omit), limit? (default 10)',
            handler: (args) => {
                const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.floor(args.limit) : 10;
                const origin = optStr(args, 'origin').toLowerCase();
                return all
                    .filter(s => origin !== 'user' && origin !== 'auto' ? true : sessionOrigin(s) === origin)
                    .slice().sort((a, b) => (b.lastTs || b.mtime) - (a.lastTs || a.mtime))
                    .slice(0, limit)
                    .map(s => ({ agent: s.agentName, title: s.title, origin: sessionOrigin(s) }));
            }
        });
        ok('sessions.recent appears in the catalog', reg.catalog().some(c => c.op === 'sessions.recent'));
        const every = await reg.dispatch('sessions.recent', {});
        ok('no origin arg = every session, newest first',
            every.ok && every.result.length === 3 && every.result[0].title === 'my dialog');
        ok('every row states its origin', every.result.every(r => r.origin === 'user' || r.origin === 'auto'));
        const mine = await reg.dispatch('sessions.recent', { origin: 'user' });
        ok('origin=user drops the automation runs',
            mine.ok && mine.result.length === 2 && !mine.result.some(r => r.title === 'nightly sweep'));
        const auto = await reg.dispatch('sessions.recent', { origin: 'auto' });
        ok('origin=auto keeps only them', auto.ok && auto.result.length === 1 && auto.result[0].title === 'nightly sweep');
        const junk = await reg.dispatch('sessions.recent', { origin: 'whatever' });
        ok('an unrecognized origin means "both", never "nothing"', junk.ok && junk.result.length === 3);

        // the real registration must carry the same contract (this mirror can drift)
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        const block = src.slice(src.indexOf("op: 'sessions.recent'"), src.indexOf("op: 'sessions.recent'") + 1200);
        ok('extension.ts registers sessions.recent with the origin arg',
            /origin\?/.test(block) && /sessionOrigin\(s\) === origin/.test(block) && /origin: sessionOrigin\(s\)/.test(block));
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
