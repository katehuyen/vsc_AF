// Farm Bridge core (compiled core/bridge.js, pure): request parsing, the op
// registry with its self-describing farm.ops catalog, dispatch outcomes and
// the arg helpers — the machinery that lets agents drive the farm through
// request files while future features plug in with one registration.
const path = require('path');
const fs = require('fs');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { BridgeRegistry, parseBridgeRequest, need, argStr, optStr, argSessionIds } =
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

    // ---------- one spelling of "which sessions" ----------
    // ‼️ Once a panel can do something to a SELECTION, the bridge has to be able
    // to do it to a set or the two surfaces have drifted (_REF/agentfarm-dev.md).
    // One helper, so no op invents its own plural key.
    ok('a single sessionId is a set of one', argSessionIds({ sessionId: ' a ' }).join() === 'a');
    ok('sessionIds is the plural', argSessionIds({ sessionIds: ['a', 'b'] }).join() === 'a,b');
    ok('both together are merged, singular first',
        argSessionIds({ sessionId: 'a', sessionIds: ['b'] }).join() === 'a,b');
    ok('‼️ the same session named twice is done ONCE',
        argSessionIds({ sessionId: 'a', sessionIds: ['a', 'b', 'a'] }).join() === 'a,b');
    ok('blanks and junk are dropped', argSessionIds({ sessionIds: ['', '  ', null] }).length === 0);
    ok('nothing given is an empty set, not a crash', argSessionIds({}).length === 0);

    // and the ops that can act on a set actually say so in their contract
    {
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        for (const op of ['sessions.pin', 'sessions.tag', 'sessions.end', 'sessions.dismiss']) {
            const block = src.slice(src.indexOf(`op: '${op}'`), src.indexOf(`op: '${op}'`) + 2000);
            ok(`${op} takes a set and its describe says so`,
                /argSessionIds\(args\)/.test(block) && /sessionIds/.test(block));
        }
        const pin = src.slice(src.indexOf("op: 'sessions.pin'"), src.indexOf("op: 'sessions.pin'") + 1400);
        ok('‼️ a bulk pin refuses to toggle — a set must be told which way to go',
            /pinned \(true\/false\) is required for a set/.test(pin));
    }

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

    // ---------- §19.C: constitution.sync op contract (the shared instructions) ----------
    // The nest root's own CLAUDE.md is what Claude Code loads for every child
    // agent; the op mirrors it to the files the other engines read, and never
    // writes the constitution itself.
    {
        const nest = fs.mkdtempSync(path.join(os.tmpdir(), 'af-bridge-const-'));
        fs.mkdirSync(path.join(nest, 'dev'));
        fs.writeFileSync(path.join(nest, 'CLAUDE.md'), '# Anayasa\n\nOrtak kurallar.\n');
        fs.writeFileSync(path.join(nest, 'dev', 'CLAUDE.md'), '# Dev\n');
        reg.register({
            op: 'constitution.sync',
            describe: 'Mirror the shared constitution to AGENTS.md (Codex) + .agents/AGENTS.md (Antigravity). args: root?, force?',
            handler: (a) => {
                const st = antigravityStatus(nest);
                if ((st.state === 'conflict' || st.state === 'foreign' || st.state === 'antigravity-ahead')
                    && a.force !== true) {
                    return { root: nest, state: st.state, synced: false };
                }
                const ag = syncToAntigravity(nest, [], { force: true });
                const cx = syncCodexExtras(nest);
                return { root: nest, state: 'in-sync', synced: true, written: [...ag.written, ...cx.written] };
            }
        });
        ok('constitution.sync appears in the catalog', reg.catalog().some(c => c.op === 'constitution.sync'));

        const first = await reg.dispatch('constitution.sync', {});
        ok('constitution.sync mirrors both engine lanes', first.ok && first.result.synced === true &&
            fs.existsSync(path.join(nest, 'AGENTS.md')) &&
            fs.existsSync(path.join(nest, '.agents', 'AGENTS.md')));
        ok('constitution.sync never writes CLAUDE.md',
            fs.readFileSync(path.join(nest, 'CLAUDE.md'), 'utf8') === '# Anayasa\n\nOrtak kurallar.\n');

        fs.appendFileSync(path.join(nest, 'AGENTS.md'), '\nElle eklenen satır.\n');
        const guarded = await reg.dispatch('constitution.sync', {});
        ok('constitution.sync is non-destructive on divergence (no force)',
            guarded.ok && guarded.result.synced === false && guarded.result.state === 'antigravity-ahead');

        try { fs.rmSync(nest, { recursive: true, force: true }); } catch {}
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

    // ---------- §19.C: usage.plan — the real subscription quota ----------
    // Every other figure the bridge exposes is derived from local transcripts.
    // This one is the plan's own rate-limit state, so an agent can answer
    // "have I got room to run this?" instead of guessing from cost.
    {
        const PU = require(path.join(__dirname, '..', 'out', 'core', 'planusage.js'));
        const payload = {
            five_hour: { utilization: 82.9, resets_at: '2026-07-26T14:40:00+00:00' },
            seven_day: { utilization: 88, resets_at: '2026-07-27T13:00:00+00:00' },
            seven_day_opus: null, seven_day_sonnet: null
        };
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-bridge-usage-'));
        const credFile = path.join(dir, '.credentials.json');
        fs.writeFileSync(credFile, JSON.stringify({
            claudeAiOauth: { accessToken: 'tok', expiresAt: 4102444800000, subscriptionType: 'pro' }
        }));
        let calls = 0;
        const planUsage = new PU.PlanUsageService({
            ttlMs: () => 600000,
            credentialsFile: () => credFile,
            fetchImpl: () => { calls++; return Promise.resolve({ status: 200, body: JSON.stringify(payload) }); }
        });
        // same handler shape extension.ts registers
        reg.register({
            op: 'usage.plan',
            describe: 'Your Claude SUBSCRIPTION rate-limit state as Anthropic reports it. args: force? (default false)',
            handler: async (args) => {
                const snap = await planUsage.get(args.force === true);
                return {
                    state: snap.state, plan: snap.plan, fetchedAt: snap.fetchedAt, note: snap.note,
                    bars: snap.bars.map(b => ({
                        id: b.id, title: b.title, percent: b.percent,
                        resetsAt: b.resetsAt ? new Date(b.resetsAt).toISOString() : null
                    }))
                };
            }
        });
        ok('usage.plan appears in the catalog', reg.catalog().some(c => c.op === 'usage.plan'));
        const r = await reg.dispatch('usage.plan', {});
        ok('dispatch returns the session and weekly bars',
            r.ok && r.result.state === 'ok' && r.result.plan === 'pro' && r.result.bars.length === 2);
        ok('percent is the floored utilization, reset an ISO string',
            r.result.bars[0].percent === 82 && r.result.bars[0].resetsAt === '2026-07-26T14:40:00.000Z');
        await reg.dispatch('usage.plan', {});
        ok('a second call inside the TTL is served from the shared cache', calls === 1);

        // the real registration must carry the same contract (this mirror can drift)
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        const block = src.slice(src.indexOf("op: 'usage.plan'"), src.indexOf("op: 'usage.plan'") + 2600);
        ok('extension.ts registers usage.plan against the shared service',
            /force\?/.test(block) && /resetsAt/.test(block));
        // ‼️ `force` from an AGENT is not a person clicking ⟳: it may skip the
        // cache, never a backoff, or a looping agent becomes a request storm
        ok('…and an agent\'s force takes the edge path, not the human one',
            /await planUsage\.readOnEdge\(\)/.test(block)
            && !/planUsage\.get\(true\)/.test(block));
    }

    // ---------- usage.window — the 5h window in BOTH units ----------
    // ‼️ The op exists because one unit was never enough. `tokens` is what the
    // transcripts add up to; `wTokens` is what the plan limit charges for it,
    // and the two are not proportional (measured 0.80x-3.86x over 32 days). An
    // agent asked "have I got room for this?" off the raw figure alone was
    // reading a number that moves with context size, not with the wall.
    {
        const reg = new BridgeRegistry();
        const win = { tokens: 121_400_000, wTokens: 72_100_000, cost: 180.5, msgs: 412, windowStart: Date.parse('2026-08-03T01:54:35Z') };
        reg.register({
            op: 'usage.window',
            describe: 'The rolling 5-hour window in both units: tokens (raw) and wTokens (weighted). args: none',
            handler: () => ({
                windowStart: new Date(win.windowStart).toISOString(),
                tokens: win.tokens, wTokens: win.wTokens,
                cost: win.cost, msgs: win.msgs,
                ratio: win.wTokens > 0 ? Math.round(100 * win.tokens / win.wTokens) / 100 : null,
                limit: null, weightedLimit: null, pct: null, lap: null
            })
        });
        ok('usage.window appears in the catalog', reg.catalog().some(c => c.op === 'usage.window'));
        const r = await reg.dispatch('usage.window', {});
        ok('dispatch returns BOTH figures, never one',
            r.ok && r.result.tokens === 121_400_000 && r.result.wTokens === 72_100_000);
        ok('…and the ratio between them, so the gap is readable without arithmetic',
            r.result.ratio === 1.68);
        ok('…with no ceiling configured it says so rather than inventing a percent',
            r.result.pct === null && r.result.limit === null && r.result.weightedLimit === null);

        // the real registration must carry the same contract (this mirror can drift)
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        const block = src.slice(src.indexOf("op: 'usage.window'"), src.indexOf("op: 'usage.window'") + 2600);
        ok('extension.ts registers usage.window off the index\'s own window',
            /index\.windowUsage\(\)/.test(block) && /wTokens: win\.wTokens/.test(block));
        ok('…and reads the percent through the shared brake, not its own arithmetic',
            /windowPct\(\)/.test(block));
        ok('…and its describe warns the two units are not interchangeable',
            /NOT INTERCHANGEABLE/.test(block));
    }

    // ---------- session ops (§19.C): start · pin · tag · shelf · interrupt ----------
    // Interaction and control reach the bridge with the feature, not after it:
    // an agent asked "start me a planning session on the dev agent" or "what am
    // I keeping on my shelf?" answers through the same code the UI clicks.
    {
        const reg = new BridgeRegistry();
        const { buildLaunchCommand, withDefaults, validateLaunch } =
            require(path.join(__dirname, '..', 'out', 'core', 'launch.js'));
        const { togglePin, setTags, parseTags, isPinned, tagsOf, normalizeMarks } =
            require(path.join(__dirname, '..', 'out', 'core', 'sessionmarks.js'));
        const { resolveInterrupt } = require(path.join(__dirname, '..', 'out', 'core', 'interrupt.js'));

        // stand-ins for the extension's live state
        let marks = {};
        const titles = {};
        const launched = [];
        const defaults = { model: 'sonnet' };
        const sessions = [
            { sessionId: 'sid1', title: 'zen release', agentName: 'dev', cwd: 'D:/a/dev', lastTs: 5, cost: 1.234 },
            { sessionId: 'sid2', title: 'other', agentName: 'dev', cwd: 'D:/a/dev', lastTs: 9, cost: 0 }
        ];
        const terminals = ['claude: dev #1'];

        reg.register([
            {
                op: 'sessions.start',
                describe: 'Start an INTERACTIVE claude session. args: agent, model?, effort?, permissionMode?, name?, prompt?, resume?, continue?',
                handler: (args) => {
                    const o = {
                        model: optStr(args, 'model'), effort: optStr(args, 'effort'),
                        permissionMode: optStr(args, 'permissionMode'), name: optStr(args, 'name'),
                        prompt: optStr(args, 'prompt'), resume: optStr(args, 'resume'),
                        continueLast: args.continue === true
                    };
                    const errors = validateLaunch(withDefaults(o, defaults));
                    need(!errors.length, errors.join(' · '));
                    const command = buildLaunchCommand('claude', withDefaults(o, defaults));
                    launched.push(command);
                    return { agent: argStr(args, 'agent'), command };
                }
            },
            {
                op: 'sessions.pin',
                describe: 'Put a session on the shelf. args: sessionId, pinned?',
                handler: (args) => {
                    const id = argStr(args, 'sessionId');
                    marks = togglePin(normalizeMarks(marks), id,
                        typeof args.pinned === 'boolean' ? args.pinned : undefined);
                    return { sessionId: id, pinned: isPinned(marks, id) };
                }
            },
            {
                op: 'sessions.rename',
                describe: 'Give a session the user\'s own name. args: sessionId, name',
                handler: (args) => {
                    const id = argStr(args, 'sessionId');
                    const name = optStr(args, 'name').trim();
                    if (name) { titles[id] = name; } else { delete titles[id]; }
                    return { sessionId: id, title: titles[id] || null };
                }
            },
            {
                op: 'sessions.tag',
                describe: 'Set the labels on a session. args: sessionId, tags',
                handler: (args) => {
                    const id = argStr(args, 'sessionId');
                    const raw = Array.isArray(args.tags) ? args.tags.join(', ') : optStr(args, 'tags');
                    marks = setTags(normalizeMarks(marks), id, parseTags(raw));
                    return { sessionId: id, tags: tagsOf(marks, id) };
                }
            },
            {
                op: 'sessions.shelf',
                describe: 'The pinned sessions with their labels. args: none',
                handler: () => sessions.filter(s => isPinned(marks, s.sessionId))
                    .map(s => ({ sessionId: s.sessionId, title: s.title, tags: tagsOf(marks, s.sessionId) }))
            },
            {
                op: 'sessions.interrupt',
                describe: 'Type Esc into a live session\'s terminal. args: sessionId',
                handler: (args) => {
                    const sessionId = argStr(args, 'sessionId');
                    // like the real handler: the agent is looked up, not assumed
                    const agentName = sessions.find(s => s.sessionId === sessionId)?.agentName;
                    const target = resolveInterrupt({
                        sessionId, agentName,
                        bindings: [{ title: 'claude: dev #1', sessionId: 'sid1', hasTerminal: true, terminalIndex: 0 }],
                        terminalNames: terminals
                    });
                    return target.kind === 'integrated'
                        ? { sessionId, interrupted: true, terminal: terminals[target.terminalIndex] }
                        : { sessionId, interrupted: false, reason: target.how };
                }
            }
        ]);

        const cat = reg.catalog().map(c => c.op);
        ok('every session op is in the catalog',
            ['sessions.start', 'sessions.pin', 'sessions.rename', 'sessions.tag', 'sessions.shelf',
                'sessions.interrupt'].every(op => cat.includes(op)));

        const start = await reg.dispatch('sessions.start',
            { agent: 'dev', effort: 'high', name: 'plan', prompt: 'read the report first' });
        ok('sessions.start builds the launch through the shared builder',
            start.ok && start.result.command
            === 'claude --model sonnet --effort high -n "plan" "read the report first"');
        const bad = await reg.dispatch('sessions.start', { agent: 'dev', effort: 'turbo' });
        ok('an invalid effort is refused with a readable error',
            !bad.ok && /effort "turbo"/.test(bad.error) && launched.length === 1);

        const pin = await reg.dispatch('sessions.pin', { sessionId: 'sid1' });
        ok('sessions.pin toggles on and reports the new state', pin.ok && pin.result.pinned === true);
        await reg.dispatch('sessions.tag', { sessionId: 'sid1', tags: ['zen', 'zen', 'release'] });
        const shelf = await reg.dispatch('sessions.shelf', {});
        ok('sessions.shelf lists the pinned session with de-duped labels',
            shelf.ok && shelf.result.length === 1 && shelf.result[0].sessionId === 'sid1'
            && shelf.result[0].tags.join('|') === 'zen|release');
        const tagStr = await reg.dispatch('sessions.tag', { sessionId: 'sid1', tags: 'a, b' });
        ok('tags accept a comma-separated string too', tagStr.ok && tagStr.result.tags.join('|') === 'a|b');
        const off = await reg.dispatch('sessions.pin', { sessionId: 'sid1', pinned: false });
        ok('an explicit pinned:false takes it off the shelf', off.ok && off.result.pinned === false);
        ok('…and the shelf is empty again', (await reg.dispatch('sessions.shelf', {})).result.length === 0);

        const named = await reg.dispatch('sessions.rename', { sessionId: 'sid1', name: '  Kalan eksikler  ' });
        ok('sessions.rename stores the trimmed name and reports it back',
            named.ok && named.result.title === 'Kalan eksikler');
        const unnamed = await reg.dispatch('sessions.rename', { sessionId: 'sid1', name: '' });
        ok('…and an empty name restores the automatic title',
            unnamed.ok && unnamed.result.title === null);

        const int = await reg.dispatch('sessions.interrupt', { sessionId: 'sid1' });
        ok('sessions.interrupt reports the terminal it typed Esc into',
            int.ok && int.result.interrupted === true && int.result.terminal === 'claude: dev #1');
        const noInt = await reg.dispatch('sessions.interrupt', { sessionId: 'nope' });
        ok('a session with no terminal is reported honestly, not silently "done"',
            noInt.ok && noInt.result.interrupted === false && noInt.result.reason);

        // the real registrations must exist and carry the same contracts
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        for (const op of ['sessions.start', 'sessions.pin', 'sessions.rename', 'sessions.tag',
            'sessions.shelf', 'sessions.interrupt']) {
            ok(`extension.ts registers ${op}`, src.includes(`op: '${op}'`));
        }
        const startBlock = src.slice(src.indexOf("op: 'sessions.start'"), src.indexOf("op: 'sessions.start'") + 3000);
        ok('sessions.start calls the shared launcher, not its own command builder',
            /startClaudeSession\(agent, o[,)]/.test(startBlock) && /validateLaunch/.test(startBlock));
        ok('sessions.start says it is interactive and points at tasks.add for headless work',
            /INTERACTIVE/.test(startBlock) && /tasks\.add/.test(startBlock));
        // an agent can reach BOTH places a session can live — and the same
        // shared starters the UI uses, not a second implementation
        ok('sessions.start can also start it in the Console',
            /startConsoleSession\(agent, o[,)]/.test(startBlock) && /surface/.test(startBlock));
        // ‼️ The project is a dimension of a launch on EVERY surface. The UI
        // grew the row (see test_run_surface.js); an agent gets the same choice
        // as an argument, or the two offers drift apart again.
        ok('sessions.start takes the project the session is filed under',
            /project\? \(id or name/.test(startBlock)
            && /resolveLaunchProject\(args\.project\)/.test(startBlock));
        const consoleStart = src.slice(src.indexOf("op: 'console.start'"), src.indexOf("op: 'console.start'") + 3000);
        ok('console.start takes it too, in the same words',
            /project\? \(id or name/.test(consoleStart)
            && /resolveLaunchProject\(args\.project\)/.test(consoleStart));
        // ‼️ …and it files ONE session rather than moving the window's active
        // project: a background agent must not change what the person sitting
        // in front of the window is working on.
        ok('…and neither writes the window\'s active project',
            !/af\.activeProject/.test(startBlock) && !/af\.activeProject/.test(consoleStart));
        ok('the three answers stay distinct: absent inherits, "" is none, a name is that one',
            /const resolveLaunchProject = \(raw: unknown\): string \| undefined =>/.test(src)
            && /if \(raw === undefined\) \{ return undefined; \}/.test(src)
            && /if \(!key\) \{ return ''; \}/.test(src));
        const intBlock = src.slice(src.indexOf("op: 'sessions.interrupt'"), src.indexOf("op: 'sessions.interrupt'") + 1600);
        ok('sessions.interrupt sends the Esc key with no newline',
            /sendText\(INTERRUPT_KEY, false\)/.test(intBlock));
        ok('…and states the external-terminal limit in its contract',
            /external/i.test(intBlock));
    }

    // ---------- live sessions: read, end, clear ----------
    // What the Live Timeline can do, an agent can do: see what is running,
    // stop one for real, and clear a card left behind by a claude that died
    // without a SessionEnd hook.
    {
        const reg = new BridgeRegistry();
        const N = Date.now();
        let tracked = [
            { sessionId: 'A', agentName: 'dev', status: 'tool', currentTool: 'Bash', startedAt: N - 3600e3, lastEventTs: N - 1000, prompts: 4, toolCalls: 9, compactions: 1, subagentStops: 0, cwd: 'D:/a/dev' },
            { sessionId: 'B', agentName: 'ops', status: 'waiting-input', startedAt: N - 7200e3, lastEventTs: N - 600e3, prompts: 1, toolCalls: 0, compactions: 0, subagentStops: 0 },
            { sessionId: 'C', source: 'gemini', agentName: 'dev', status: 'idle', startedAt: N - 7200e3, lastEventTs: N - 60e3, prompts: 0, toolCalls: 0, compactions: 0, subagentStops: 0 }
        ];
        // Only A still has a process: B is the ghost this feature exists for.
        const owners = [{ sessionId: 'A', pid: 4242, entrypoint: 'cli' }];
        const rows = new Map([['A', { title: 'the job', cost: 1.234, userTurns: 4, usage: {} }]]);
        const cleared = [];
        const liveStub = {
            sessions: () => tracked,
            labelOf: (s) => s.agentName,
            dismiss: (id) => {
                if (!tracked.some(s => s.sessionId === id)) { return false; }
                tracked = tracked.filter(s => s.sessionId !== id);
                cleared.push(id);
                return true;
            }
        };
        const registryReadable = () => true;
        reg.register([
            {
                op: 'sessions.live',
                describe: 'The sessions the live monitor is tracking right now — alive: false = over, null = unknowable. args: none',
                handler: () => liveStub.sessions().map(s => {
                    const row = rows.get(s.sessionId);
                    const owner = owners.find(o => o.sessionId === s.sessionId);
                    return {
                        sessionId: s.sessionId, label: liveStub.labelOf(s), status: s.status,
                        tool: s.currentTool ?? null, prompts: s.prompts, toolCalls: s.toolCalls,
                        title: row ? row.title : null, cost: row ? Math.round(row.cost * 100) / 100 : 0,
                        turns: row ? row.userTurns : 0,
                        alive: s.source ? null : (registryReadable() ? !!owner : null),
                        pid: owner ? owner.pid : null
                    };
                })
            },
            {
                op: 'sessions.dismiss',
                describe: 'Take a session off the Live Timeline without touching the session. args: sessionId | gone:true',
                handler: (args) => {
                    if (args.gone === true) {
                        if (!registryReadable()) { return { cleared: 0, reason: 'registry unreadable' }; }
                        const owned = new Set(owners.map(o => o.sessionId));
                        const dead = liveStub.sessions().filter(s => !s.source && !owned.has(s.sessionId) &&
                            Date.now() - s.startedAt > 60000);
                        for (const s of dead) { liveStub.dismiss(s.sessionId); }
                        return { cleared: dead.length, sessions: dead.map(s => s.sessionId) };
                    }
                    const sessionId = argStr(args, 'sessionId');
                    return { sessionId, cleared: liveStub.dismiss(sessionId) };
                }
            }
        ]);

        const listed = await reg.dispatch('sessions.live', {});
        ok('sessions.live reports every tracked session', listed.ok && listed.result.length === 3);
        const a = listed.result.find(r => r.sessionId === 'A');
        ok('…with its live state and the transcript\'s figures',
            a.status === 'tool' && a.tool === 'Bash' && a.cost === 1.23 && a.turns === 4);
        ok('…a session the OS still runs is alive, with its pid', a.alive === true && a.pid === 4242);
        ok('…one it does not is NOT alive', listed.result.find(r => r.sessionId === 'B').alive === false);
        ok('…and an external CLI is never judged (no registry of its own)',
            listed.result.find(r => r.sessionId === 'C').alive === null);

        const swept = await reg.dispatch('sessions.dismiss', { gone: true });
        ok('sessions.dismiss gone:true clears exactly the ghost',
            swept.ok && swept.result.cleared === 1 && swept.result.sessions[0] === 'B');
        ok('…and leaves the running one and the external CLI alone',
            tracked.map(s => s.sessionId).join(',') === 'A,C');
        const one = await reg.dispatch('sessions.dismiss', { sessionId: 'A' });
        ok('sessions.dismiss clears a named session', one.ok && one.result.cleared === true);
        const gone = await reg.dispatch('sessions.dismiss', { sessionId: 'A' });
        ok('…and says so plainly when there was nothing to clear', gone.ok && gone.result.cleared === false);

        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        for (const op of ['sessions.live', 'sessions.end', 'sessions.dismiss']) {
            ok(`extension.ts registers ${op}`, src.includes(`op: '${op}'`));
        }
        const endBlock = src.slice(src.indexOf("op: 'sessions.end'"), src.indexOf("op: 'sessions.end'") + 1200);
        ok('sessions.end goes through the same confirm-and-stop path the panel uses',
            /endLiveSession\(sessionId\)/.test(endBlock));
        ok('…and its contract points at sessions.interrupt for the lesser action',
            /sessions\.interrupt/.test(endBlock));
    }

    // ---------- the project document ops (Faz 4) ----------
    // The WRITE side of the project axis: what lets an agent finish a piece of
    // work by recording it, so the next session's brief is built out of what
    // happened rather than out of what somebody remembered to type. The pure
    // logic is proved in test_project_docs.js and test_project_plan.js; what is
    // checked here is that the ops dispatch, that they refuse the things they
    // promise to refuse, and that extension.ts actually registers all of them.
    {
        const {
            addDecision, addDeliverableRow, createSkeleton, insertLogEntry, readProjectDoc,
            scanProjectFolder, writeProjectDoc
        } = require(path.join(__dirname, '..', 'out', 'core', 'projectDocs.js'));
        const { addPlanItem, checkPlanItem, planSummary } =
            require(path.join(__dirname, '..', 'out', 'core', 'projectPlan.js'));
        const { addBacklogItem, nextBacklog, parseBacklog, setBacklogState } =
            require(path.join(__dirname, '..', 'out', 'core', 'projectBacklog.js'));

        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-bridge-docs-'));
        const project = {
            id: 'prj_docs0001', name: 'Agent Farm', status: 'active',
            folder: dir, createdAt: 1, updatedAt: 1
        };
        createSkeleton(dir, project);
        const roles = () => scanProjectFolder(dir).roles;
        fs.writeFileSync(roles().plan, '---\naf-role: plan\n---\n\n# Plan\n\n## Milestones\n'
            + '- [ ] Faz 4 — belgeler 🆔 afprj-04\n- [ ] Faz 5 — iş\n');

        // The same handler shapes extension.ts registers, over the same pure
        // functions — a second implementation here would prove nothing.
        const rel = f => path.relative(dir, f).replace(/\\/g, '/');
        const edit = (file, change) => {
            const read = readProjectDoc(dir, rel(file));
            need(read.ok, read.error || 'unreadable');
            const next = change(read.text || '');
            need(next.ok, next.error || 'nothing to write');
            const w = writeProjectDoc(dir, rel(file), next.text, read.mtimeMs);
            need(w.ok, w.error || 'write failed');
            return next;
        };
        const reg = new BridgeRegistry();
        reg.register([
            {
                op: 'projects.doc.read', describe: 'read one. args: project, path',
                handler: a => {
                    const r = readProjectDoc(dir, argStr(a, 'path'));
                    need(r.ok, r.error || 'could not read that document');
                    return { text: r.text, mtimeMs: r.mtimeMs };
                }
            },
            {
                op: 'projects.doc.write', describe: 'write one. args: project, path, content, expectMtime?, append?',
                handler: a => {
                    const p = argStr(a, 'path');
                    const existing = readProjectDoc(dir, p);
                    // ‼️ Everything below reads a failed read as "nothing to
                    // lose". That is only true when the file is genuinely NOT
                    // THERE — a file that exists but could not be read would
                    // otherwise take the create path and be replaced.
                    need(existing.ok || existing.missing === true,
                        `${p} is there but could not be read — refusing to write over it`);
                    need(!existing.ok || typeof a.expectMtime === 'number',
                        `${p} already exists — read it first and pass expectMtime, or use append:true`);
                    const w = writeProjectDoc(dir, p, String(a.content || ''),
                        typeof a.expectMtime === 'number' ? a.expectMtime : undefined);
                    need(w.ok, w.error || 'the write failed');
                    return { path: p, created: !existing.ok };
                }
            },
            {
                op: 'projects.log', describe: 'add a worklog line. args: project, entry',
                handler: a => {
                    const entry = argStr(a, 'entry').trim();
                    need(entry, 'an entry needs some text');
                    const line = /^-?\s*\d{4}-\d{2}-\d{2}/.test(entry) || entry.startsWith('-')
                        ? (entry.startsWith('-') ? entry : `- ${entry}`)
                        : `- 2026-08-03 — ${entry}`;
                    const r = insertLogEntry(roles().log, line);
                    need(r.ok, r.error || 'the worklog could not be written');
                    return { line };
                }
            },
            {
                op: 'projects.plan', describe: 'the plan as items. args: project, open?',
                handler: a => {
                    const sum = planSummary(readProjectDoc(dir, rel(roles().plan)).text || '');
                    return {
                        open: sum.open, done: sum.done,
                        items: (a.open === true ? sum.items.filter(i => !i.done) : sum.items)
                            .map(i => ({ line: i.line + 1, text: i.text, done: i.done, id: i.id || null }))
                    };
                }
            },
            {
                op: 'projects.plan.add', describe: 'add an item. args: project, item, section?',
                handler: a => {
                    edit(roles().plan, t => addPlanItem(t, argStr(a, 'item'),
                        optStr(a, 'section') ? { section: optStr(a, 'section') } : {}));
                    return { added: argStr(a, 'item') };
                }
            },
            {
                op: 'projects.plan.check', describe: 'tick one item. args: project, item?/id?/line?, done?',
                handler: a => {
                    const target = {
                        ...(optStr(a, 'id') ? { id: optStr(a, 'id') } : {}),
                        ...(typeof a.line === 'number' ? { line: a.line - 1 } : {}),
                        ...(optStr(a, 'item') ? { text: optStr(a, 'item') } : {})
                    };
                    need(target.id || target.line !== undefined || target.text,
                        'say which item: id, line or item (text)');
                    const out = edit(roles().plan, t => checkPlanItem(t, target, a.done !== false));
                    return { item: out.item.text, done: a.done !== false, note: out.note || null };
                }
            },
            {
                op: 'projects.decision.add', describe: 'record a decision. args: project, title, body?',
                handler: a => {
                    const r = addDecision(dir, { title: argStr(a, 'title'), body: optStr(a, 'body') });
                    need(r.ok, r.error || 'the decision could not be written');
                    return { file: rel(r.file), title: r.decision.title };
                }
            },
            {
                op: 'projects.deliver', describe: 'record a deliverable. args: project, what, version?, date?, where?',
                handler: a => {
                    const what = argStr(a, 'what').trim();
                    need(what, 'a deliverable needs a name');
                    edit(roles().deliverables, t => addDeliverableRow(t, {
                        what, version: optStr(a, 'version'),
                        date: optStr(a, 'date'), where: optStr(a, 'where')
                    }));
                    return { what };
                }
            }
        ]);

        const planBefore = await reg.dispatch('projects.plan', { project: 'Agent Farm' });
        ok('projects.plan returns the document\'s own checkboxes',
            planBefore.ok && planBefore.result.open === 2 && planBefore.result.items[0].id === 'afprj-04');

        const ticked = await reg.dispatch('projects.plan.check', { project: 'Agent Farm', id: 'afprj-04' });
        ok('projects.plan.check ticks the item it was pointed at',
            ticked.ok && ticked.result.item === 'Faz 4 — belgeler');
        ok('‼️ …and the line keeps its Tasks metadata, with no ✅ invented',
            fs.readFileSync(roles().plan, 'utf8').includes('- [x] Faz 4 — belgeler 🆔 afprj-04'));
        const ambiguous = await reg.dispatch('projects.plan.check',
            { project: 'Agent Farm', item: 'Faz' });
        ok('‼️ an ambiguous item is refused rather than guessed at',
            !ambiguous.ok && /be more specific/.test(ambiguous.error));
        const noTarget = await reg.dispatch('projects.plan.check', { project: 'Agent Farm' });
        ok('…and so is a check with nothing to aim at', !noTarget.ok && /which item/.test(noTarget.error));

        const added = await reg.dispatch('projects.plan.add',
            { project: 'Agent Farm', item: 'Faz 6 — zekâ', section: 'Milestones' });
        ok('projects.plan.add joins the section it names', added.ok
            && fs.readFileSync(roles().plan, 'utf8').includes('- [ ] Faz 6 — zekâ'));

        const logged = await reg.dispatch('projects.log',
            { project: 'Agent Farm', entry: 'Faz 4 shipped.' });
        ok('projects.log dates the entry and puts it at the anchor',
            logged.ok && /^- 2026-08-03 — Faz 4 shipped\.$/.test(logged.result.line));
        const logBody = fs.readFileSync(roles().log, 'utf8');
        ok('…newest first, directly below the anchor the user can move',
            logBody.indexOf('Faz 4 shipped') > logBody.indexOf('af:log-top'));
        ok('an empty entry is refused',
            !(await reg.dispatch('projects.log', { project: 'Agent Farm', entry: '  ' })).ok);

        const decided = await reg.dispatch('projects.decision.add',
            { project: 'Agent Farm', title: 'Ticking writes one character', body: 'And nothing else.' });
        ok('projects.decision.add writes its own file, found by frontmatter',
            decided.ok && /20_Decisions\//.test(decided.result.file)
            && /af-role: decision/.test(fs.readFileSync(path.join(dir, decided.result.file), 'utf8')));
        ok('a decision with no title is refused',
            !(await reg.dispatch('projects.decision.add', { project: 'Agent Farm', title: '' })).ok);

        const delivered = await reg.dispatch('projects.deliver',
            { project: 'Agent Farm', what: 'VSIX', version: '3.57.0', date: '2026-08-03', where: 'local' });
        ok('projects.deliver adds a row to the user\'s own table',
            delivered.ok && /\| VSIX \| 3\.57\.0 \| 2026-08-03 \| local \|/
                .test(fs.readFileSync(roles().deliverables, 'utf8')));

        // ‼️ the boundary, from the outside
        const escaped = await reg.dispatch('projects.doc.read',
            { project: 'Agent Farm', path: '../../anything' });
        ok('‼️ a path climbing out of the project folder is refused', !escaped.ok);
        const blind = await reg.dispatch('projects.doc.write',
            { project: 'Agent Farm', path: 'Plan.md', content: 'wiped' });
        ok('‼️ overwriting an existing document without expectMtime is refused — read it first',
            !blind.ok && /read it first/.test(blind.error));
        const read = await reg.dispatch('projects.doc.read', { project: 'Agent Farm', path: 'Plan.md' });
        const guarded = await reg.dispatch('projects.doc.write', {
            project: 'Agent Farm', path: 'Plan.md',
            content: read.result.text, expectMtime: read.result.mtimeMs
        });
        ok('…and it goes through once the caller has actually read it', guarded.ok);
        const created = await reg.dispatch('projects.doc.write',
            { project: 'Agent Farm', path: '10_Notes/new.md', content: '# new\n' });
        ok('a file that is not there yet needs no guard — nothing can be lost', created.ok);

        // ‼️ "not there" and "there but unreadable" are two answers, and the
        // guard above only holds for the first. A file that EXISTS but could
        // not be read used to look identical to one that is absent, so the
        // create path replaced it — the blind overwrite this op exists to make
        // impossible. A folder standing where a file is asked for is the same
        // failure and the one a test can produce anywhere.
        fs.mkdirSync(path.join(dir, '10_Notes', 'held.md'));
        const held = await reg.dispatch('projects.doc.write',
            { project: 'Agent Farm', path: '10_Notes/held.md', content: 'wiped' });
        ok('‼️ a document that is there but unreadable is NOT treated as absent', !held.ok);
        ok('…and the refusal says so rather than reporting a create',
            /could not be read/.test(held.error || ''));
        ok('…and what was there is still there',
            fs.statSync(path.join(dir, '10_Notes', 'held.md')).isDirectory());

        // ---- the backlog family, dispatched the same way ----
        // The ops themselves live in extension.ts (they need the project store);
        // what is exercised here is the CONTRACT an agent depends on — that the
        // handler shape works through the registry, and that a refusal comes
        // back as a refusal rather than a silent success.
        {
            const backlogFile = path.join(dir, 'Backlog.md');
            fs.writeFileSync(backlogFile, [
                '---', 'af-role: backlog', '---', '', '# Agent Farm — Backlog', '',
                '## 📥 Inbox', '', '- [ ] something I noticed', '',
                '## P — Projects', '',
                '- [ ] P-1 first thing #bug ⏫ [efor:: S]',
                '- [ ] P-2 second thing [efor:: XL]', ''
            ].join('\n'));
            const readBacklog = () => fs.readFileSync(backlogFile, 'utf8');
            const editBacklog = change => {
                const r = change(readBacklog());
                need(r.ok, r.error || 'nothing to write');
                fs.writeFileSync(backlogFile, r.text);
                return r;
            };
            reg.register([
                {
                    op: 'projects.backlog', describe: 'the backlog as items. args: project, open?',
                    handler: () => {
                        const s = parseBacklog(readBacklog());
                        return {
                            counts: { open: s.open, unclassified: s.unclassified },
                            areas: s.areas.map(a => a.code),
                            items: s.items.map(i => ({ code: i.code || null, text: i.text, state: i.state }))
                        };
                    }
                },
                {
                    op: 'projects.backlog.next',
                    describe: 'what to work on. args: project, limit?, maxEffort?',
                    handler: a => {
                        const r = nextBacklog(readBacklog(), {
                            ...(typeof a.limit === 'number' ? { limit: a.limit } : {}),
                            ...(optStr(a, 'maxEffort') ? { maxEffort: optStr(a, 'maxEffort') } : {})
                        });
                        return { items: r.items.map(i => i.code || null) };
                    }
                },
                {
                    op: 'projects.backlog.add', describe: 'add an item. args: project, text, area?',
                    handler: a => {
                        const body = argStr(a, 'text').trim();
                        need(body, 'an item needs some text');
                        const r = editBacklog(t => addBacklogItem(t, {
                            text: body,
                            ...(optStr(a, 'area') ? { area: optStr(a, 'area') } : {})
                        }));
                        return { code: r.code || null };
                    }
                },
                {
                    op: 'projects.backlog.check', describe: 'change state. args: project, code?, state?',
                    handler: a => {
                        const target = {
                            ...(optStr(a, 'code') ? { code: optStr(a, 'code') } : {}),
                            ...(optStr(a, 'item') ? { text: optStr(a, 'item') } : {})
                        };
                        need(target.code || target.text, 'say which item: code, line or item (text)');
                        const r = editBacklog(t => setBacklogState(t, target, optStr(a, 'state') || 'done'));
                        return { code: r.item.code || null, state: r.item.state };
                    }
                }
            ]);

            const listed = await reg.dispatch('projects.backlog', { project: 'Agent Farm' });
            ok('projects.backlog reads the file\'s own lines',
                listed.ok && listed.result.counts.open === 3
                && listed.result.counts.unclassified === 1
                && listed.result.areas.join() === 'P');

            const up = await reg.dispatch('projects.backlog.next', { project: 'Agent Farm', limit: 5 });
            ok('‼️ projects.backlog.next keeps an XL item out of a turn by default',
                up.ok && up.result.items.indexOf('P-2') < 0 && up.result.items.indexOf('P-1') >= 0);

            const wide = await reg.dispatch('projects.backlog.next',
                { project: 'Agent Farm', limit: 5, maxEffort: 'XL' });
            ok('…and lets it through when the caller raises the ceiling',
                wide.ok && wide.result.items.indexOf('P-2') >= 0);

            const capture = await reg.dispatch('projects.backlog.add',
                { project: 'Agent Farm', text: 'a passing thought' });
            ok('projects.backlog.add with no area captures without a code — friction-free',
                capture.ok && capture.result.code === null
                && /- \[ \] a passing thought/.test(readBacklog()));
            const filed = await reg.dispatch('projects.backlog.add',
                { project: 'Agent Farm', text: 'a real item', area: 'P' });
            ok('…and with an area it is given the next free code', filed.ok && filed.result.code === 'P-3');

            const closed = await reg.dispatch('projects.backlog.check',
                { project: 'Agent Farm', code: 'P-1' });
            ok('projects.backlog.check closes the item it was pointed at',
                closed.ok && closed.result.state === 'done');
            ok('‼️ …and the line keeps its code, its tag, its icon and its field',
                /- \[x\] P-1 first thing #bug ⏫ \[efor:: S\]/.test(readBacklog()));
            const noAim = await reg.dispatch('projects.backlog.check', { project: 'Agent Farm' });
            ok('…and a check with nothing to aim at is refused',
                !noAim.ok && /which item/.test(noAim.error));
        }

        // ---- and extension.ts really registers every one of them ----
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        for (const op of ['projects.doc.list', 'projects.doc.read', 'projects.doc.write',
            'projects.log', 'projects.plan', 'projects.plan.add', 'projects.plan.check',
            'projects.decision.add', 'projects.deliver', 'projects.people.set',
            'projects.backlog', 'projects.backlog.next', 'projects.backlog.add',
            'projects.backlog.check', 'projects.backlog.set', 'projects.backlog.code',
            'projects.backlog.move', 'projects.backlog.reorder', 'projects.backlog.archive',
            'projects.backlog.promote']) {
            ok(`extension.ts registers ${op}`, src.includes(`op: '${op}'`));
        }
        const nextBlock = src.slice(src.indexOf("op: 'projects.backlog.next'"),
            src.indexOf("op: 'projects.backlog.next'") + 2600);
        ok('‼️ backlog.next\'s contract explains the effort ceiling rather than hiding it',
            /maxEffort/.test(nextBlock) && /half done/.test(nextBlock));
        const blCheckBlock = src.slice(src.indexOf("op: 'projects.backlog.check'"),
            src.indexOf("op: 'projects.backlog.check'") + 2600);
        ok('‼️ backlog.check\'s contract states the one-character promise',
            /EXACTLY ONE CHARACTER/.test(blCheckBlock));
        const moveBlock = src.slice(src.indexOf("op: 'projects.backlog.move'"),
            src.indexOf("op: 'projects.backlog.move'") + 2600);
        ok('‼️ backlog.move\'s contract promises the code does not change',
            /THE CODE DOES NOT CHANGE/.test(moveBlock));
        ok('…and offers both ends, not just the two steps',
            /up\|down\|top\|bottom/.test(moveBlock));
        const reorderBlock = src.slice(src.indexOf("op: 'projects.backlog.reorder'"),
            src.indexOf("op: 'projects.backlog.reorder'") + 2600);
        ok('‼️ backlog.reorder states the two refusals, because both would be silent',
            /SAME SECTION/.test(reorderBlock) && /re-parent/.test(reorderBlock));
        const checkBlock = src.slice(src.indexOf("op: 'projects.plan.check'"),
            src.indexOf("op: 'projects.plan.check'") + 2600);
        ok('‼️ plan.check\'s contract states the one-character promise and the ✅ it will not write',
            /EXACTLY ONE CHARACTER/.test(checkBlock) && /done-date/.test(checkBlock));
        const writeBlock = src.slice(src.indexOf("op: 'projects.doc.write'"),
            src.indexOf("op: 'projects.doc.write'") + 2600);
        ok('…and doc.write\'s contract says how to replace a file safely',
            /expectMtime/.test(writeBlock) && /append/.test(writeBlock));
        ok('‼️ …and the real op tells an unreadable document apart from an absent one',
            /existing\.missing === true/.test(writeBlock));
        ok('‼️ plan.check\'s contract says a line and a text together are a CHECK',
            /goes stale/.test(checkBlock));
        ok('the ops call the shared guarded path rather than writing files themselves',
            /editProjectDoc\(folder,/.test(src) && !/fs\.writeFileSync\(.*roles\.plan/.test(src));

        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
