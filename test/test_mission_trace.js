// ‼️ X-45 (X-32) — THE JOURNAL, THE ATOMIC SNAPSHOT, AND WHAT A RELOAD IS
// ALLOWED TO CONCLUDE.
//
// A mission used to keep one file, written whole, best-effort, on every state
// change. Three failures were waiting in that single line: it grows without
// bound, a crash truncates the only copy, and a window reload loses everything
// the snapshot had not caught up to. This item splits the two jobs — a small
// ATOMIC snapshot for what the engine is doing now, an append-only JOURNAL for
// what the run did — and the tests below are about the seam between them.
//
// The contract being pinned, in one sentence each:
//
//   * append FIRST, snapshot second, so the only state a crash can produce is
//     "the trace knows more than the snapshot" — which is replayable;
//   * a broken LAST line is a crash mid-append and is dropped; a broken line
//     anywhere else is real loss and SAYS so;
//   * a repeated seq is a replay, and the first copy wins, because it is the
//     one every earlier reader already saw;
//   * finished work is never lost (recovered from the task record) and
//     unfinished work is never assumed (marked interrupted, never re-run);
//   * a resume is refused EXACTLY when the run cannot say what it already set
//     in motion — rubble alone is survivable, rubble plus in-flight work is not;
//   * and a classic mission notices none of this: no trace, no field, no
//     behaviour change, byte-for-byte the same record it always was.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return { Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) } };
    }
    return origLoad.apply(this, arguments);
};
const M = require(path.join(__dirname, '..', 'out', 'core', 'missions.js'));
const T = require(path.join(__dirname, '..', 'out', 'core', 'missionTrace.js'));
Module._load = origLoad;

let pass = 0, fail = 0;
const ok = (msg, cond) => { if (cond) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg); } };
const eq = (msg, a, b) => ok(msg + ` (${JSON.stringify(a)} === ${JSON.stringify(b)})`, a === b);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-trace-'));
const f = name => path.join(tmp, name);
/** Write a journal by hand — the way a crash or an older build would leave it. */
const writeLines = (file, lines) => fs.writeFileSync(file, lines.join('\n'), 'utf8');
const line = (seq, type, extra = {}) => JSON.stringify({ v: 1, seq, ts: seq * 1000, type, ...extra });

// ============================================ 1. an old missions.json is untouched
{
    console.log('\n-- an old store loads, round-trips and grows no fields');
    const file = f('missions-old.json');
    const original = {
        specs: [{
            id: 's1', title: 'ship it', goal: 'ship it', leadAgentId: 'a1', leadAgentName: 'lead',
            team: [{ agentId: 'a2', agentName: 'coder' }],
            limits: { maxRounds: 5, maxTasks: 10, maxCostUSD: 5, maxTokens: 0, maxMinutes: 60, maxParallel: 2 },
            approvalMode: 'auto', createdAt: 1
        }],
        runs: [{ id: 'r1', specId: 's1', status: 'done', rounds: [], ledger: [], totalCostUSD: 0.5, startedAt: 1 }]
    };
    fs.writeFileSync(file, JSON.stringify(original, null, 2), 'utf8');
    const store = new M.MissionStore(file);
    store.load();
    ok('a classic run has no trace pointer', store.runs[0].trace === undefined);
    ok('and no degraded note', store.runs[0].traceDegraded === undefined);
    store.save();
    const after = JSON.parse(fs.readFileSync(file, 'utf8'));
    ok('the record round-trips byte-for-value — nothing was defaulted in',
        JSON.stringify(after) === JSON.stringify(original));
    ok('missions.trace on a run with no trace is answerable from the record alone',
        store.run('r1').trace === undefined);
}

// ============================================ 2. the save is atomic
{
    console.log('\n-- the snapshot is written through temp + rename');
    const file = f('missions-atomic.json');
    const store = new M.MissionStore(file);
    store.specs = [];
    store.runs = [{ id: 'r', specId: 's', status: 'running', rounds: [], ledger: [], totalCostUSD: 0, startedAt: 1 }];
    store.save();
    ok('the store exists after a save', fs.existsSync(file));
    ok('and no temp file is left behind', !fs.existsSync(file + '.tmp'));

    // two saves in a row (the "two concurrent updates" case a single-threaded
    // extension host can actually produce): the second must leave a COMPLETE
    // file, never a truncation of the first
    store.runs.push({ id: 'r2', specId: 's', status: 'done', rounds: [], ledger: [], totalCostUSD: 0, startedAt: 2 });
    store.save();
    store.runs.push({ id: 'r3', specId: 's', status: 'done', rounds: [], ledger: [], totalCostUSD: 0, startedAt: 3 });
    store.save();
    const back = JSON.parse(fs.readFileSync(file, 'utf8'));
    eq('the last writer wins whole, not in half', back.runs.length, 3);
    ok('still no temp file', !fs.existsSync(file + '.tmp'));

    // a stale temp file from a crashed earlier save must not block the next one
    fs.writeFileSync(file + '.tmp', '{ broken', 'utf8');
    store.save();
    ok('a leftover temp from a crash is simply overwritten',
        JSON.parse(fs.readFileSync(file, 'utf8')).runs.length === 3);
}

// ============================================ 3. writing and reading a journal
{
    console.log('\n-- append-only, sequence-numbered, schema-versioned');
    const file = f('r-write.jsonl');
    const w = T.MissionTraceWriter.open(file);
    eq('a fresh journal starts at seq 0', w.lastSeq, 0);
    const e1 = w.append('strategy.changed', { version: 1, strategy: 'split the work' });
    eq('the first event is seq 1', e1.seq, 1);
    eq('and carries the schema version', e1.v, T.MISSION_TRACE_SCHEMA);
    w.append('action.created', { actionId: 'st1', kind: 'task', agentName: 'coder', title: 'write it' });
    w.append('action.started', { actionId: 'st1', refId: 'task-9' });
    eq('the writer knows how far it got', w.lastSeq, 3);

    const read = T.readTrace(file);
    eq('every line reads back', read.events.length, 3);
    eq('health is ok', read.health, 'ok');
    eq('lastSeq comes from the file', read.lastSeq, 3);

    // ‼️ THE SEQ COMES FROM THE FILE, NEVER FROM THE SNAPSHOT — a second writer
    // that trusted a lagging snapshot would hand out a number already on disk
    const w2 = T.MissionTraceWriter.open(file);
    eq('a re-opened writer continues the file', w2.append('message.sent', { from: 'lead', to: 'coder' }).seq, 4);
    eq('and nothing was overwritten', T.readTrace(file).events.length, 4);
}

// ============================================ 4. a corrupt LAST line is a crash
{
    console.log('\n-- half a line at the end is a crash mid-append, not damage');
    const file = f('r-truncated.jsonl');
    writeLines(file, [line(1, 'strategy.changed', { strategy: 'a' }), line(2, 'message.sent'), '{"v":1,"seq":3,"ts":3,"ty']);
    const read = T.readTrace(file);
    eq('the readable events survive', read.events.length, 2);
    ok('the tail is reported as truncated', read.truncatedTail);
    eq('health says truncated, not damaged', read.health, 'truncated');
    eq('lastSeq is what actually landed', read.lastSeq, 2);

    const rec = T.reconcileRun(read, 2);
    eq('a truncated tail alone still resumes', rec.resume, 'ok');
    ok('and says so honestly', rec.degraded.includes('cut off'));

    // and the next writer continues from the last GOOD seq — the half line is
    // never counted as an event that happened
    eq('the writer resumes after the last complete event',
        T.MissionTraceWriter.open(file).lastSeq, 2);
}

// ============================================ 5. a corrupt MIDDLE line is loss
{
    console.log('\n-- a broken line anywhere else is real loss and says so');
    const file = f('r-damaged.jsonl');
    writeLines(file, [line(1, 'strategy.changed'), 'not json at all', line(3, 'run.finished', { status: 'done' }), '']);
    const read = T.readTrace(file);
    // ‼️ X-63 — the bad line WAS a seq, so what follows it is not "the rest of
    // the history", it is the history after a hole. This used to return both
    // survivors and call the run readable; a projection built that way shows a
    // run that jumped from its first strategy straight to finished.
    eq('the chain stops at the hole', read.events.length, 1);
    eq('and says how much is missing', read.gaps, 1);
    eq('what was readable past it is counted, not applied', read.beyondPrefix, 1);
    eq('the bad line is counted', read.badLines, 1);
    eq('health is damaged', read.health, 'damaged');
    ok('reading never throws — the run list has to open', true);

    const clean = T.reconcileRun(read, 3);
    eq('damage with nothing in flight can be re-briefed', clean.resume, 'rebrief');
    eq('and no phantom catch-up is promised', clean.snapshotBehind, 0);
}

// =================================== 5b. X-61 the tail is repaired, not stepped over
{
    console.log('\n-- ‼️ X-61 a half-written tail is REPAIRED before anything appends to it');
    const file = f('r-halftail.jsonl');
    // a crash mid-append: two whole events, then half of a third, no newline
    fs.writeFileSync(file,
        line(1, 'strategy.changed', { strategy: 'first' }) + '\n'
        + line(2, 'action.created', { actionId: 'st1', kind: 'task' }) + '\n'
        + '{"v":2,"seq":3,"ts":3000,"type":"acti', 'utf8');

    const before = T.readTrace(file);
    eq('the reader still calls it truncated', before.health, 'truncated');

    const w = T.MissionTraceWriter.open(file);
    ok('the writer opens', !w.blocked);
    eq('continuing after the last complete event', w.lastSeq, 2);
    ok('having cut the half line off', !!(w.repair && w.repair.repaired));
    ok('and kept it rather than destroyed it', fs.existsSync(file + '.broken'));
    ok('the quarantined bytes are the half line',
        fs.readFileSync(file + '.broken', 'utf8').indexOf('"seq":3') >= 0);

    w.append('action.settled', { actionId: 'st1', outcome: 'done' });
    const after = T.readTrace(file);
    // ‼️ WITHOUT THE REPAIR this is where the damage happened: the new JSON
    // landed flush against the half line and BOTH became one unreadable line.
    eq('the new event is a whole line of its own', after.events.length, 3);
    eq('numbered next, never reusing the lost one', after.lastSeq, 3);
    eq('nothing broken is left behind it', after.badLines, 0);
    eq('and the journal is healthy again', after.health, 'ok');
}

// ================= 5c. X-61 a COMPLETE last line with no newline is terminated
{
    console.log('\n-- ‼️ X-61 a crash on the newline byte loses no event either');
    const file = f('r-noeol.jsonl');
    // both lines are whole; only the final newline never made it to disk
    fs.writeFileSync(file,
        line(1, 'strategy.changed', { strategy: 'first' }) + '\n'
        + line(2, 'action.created', { actionId: 'st1', kind: 'task' }), 'utf8');

    const before = T.readTrace(file);
    eq('the reader sees no damage at all', before.health, 'ok');
    eq('both events are there', before.events.length, 2);

    const w = T.MissionTraceWriter.open(file);
    ok('the writer opens', !w.blocked);
    ok('and the missing byte was added, not the line cut', !!(w.repair && w.repair.terminated));
    eq('nothing was removed', w.repair.removedBytes, 0);
    ok('so nothing was quarantined', !fs.existsSync(file + '.broken'));

    w.append('action.settled', { actionId: 'st1', outcome: 'done' });
    const after = T.readTrace(file);
    eq('the good event survived the append', after.events.length, 3);
    eq('health is still clean', after.health, 'ok');
}

// ============================================ 5d. X-63 a hole is loss, not order
{
    console.log('\n-- ‼️ X-63 a gap, a backwards seq and an unusable seq are damage');

    const gap = f('r-gap.jsonl');
    writeLines(gap, [line(1, 'strategy.changed'), line(3, 'run.finished', { status: 'done' }), '']);
    const g = T.readTrace(gap);
    eq('the chain is only as long as it is provable', g.events.length, 1);
    eq('the last seq is the prefix, not the maximum', g.lastSeq, 1);
    eq('the physical maximum is remembered separately', g.physicalLastSeq, 3);
    eq('one seq is missing', g.gaps, 1);
    eq('health is damaged', g.health, 'damaged');
    // ‼️ and the catch-up figure follows the prefix, so the snapshot is never
    // told to wait for events that are not coming
    eq('snapshotBehind is honest', T.reconcileRun(g, 1).snapshotBehind, 0);
    ok('and the sentence names the loss',
        T.reconcileRun(g, 1).degraded.indexOf('1 event(s) missing') >= 0);

    // ‼️ AND THE WRITER CONTINUES FROM WHAT THE FILE SPENT, not from what this
    // build can apply — filling the hole would put a new event physically after
    // seq 3 while claiming to be seq 2.
    eq('the writer never reuses a spent number', T.MissionTraceWriter.open(gap).lastSeq, 3);

    // ============================================ ‼️ X-86 the prefix is PHYSICAL
    // X-63 stops at the first break in the SEQUENCE. A line that could not be
    // read carries no seq for a hole to show up in, so a chain assembled only
    // out of the lines that parsed read as unbroken straight across the damage:
    // `seq1 · garbage · seq2` answered "two events, up to seq 2" and handed the
    // event AFTER the damage to the projection as if nothing had happened.
    {
        console.log('\n-- ‼️ X-86 the proven prefix comes from the physical chain');

        const middles = [
            ['garbage', 'not json at all', 'badLines'],
            ['a blank line', '', 'badLines'],
            ['a line with an impossible seq', line(0, 'strategy.changed'), 'invalidSeq']
        ];
        for (const [name, junk, counter] of middles) {
            const p = f('r-x86-' + name.replace(/\W+/g, '-') + '.jsonl');
            writeLines(p, [
                line(1, 'strategy.changed', { strategy: 'first', version: 1 }),
                junk,
                line(2, 'action.created', { actionId: 'a2', title: 'after the damage' }),
                ''
            ]);
            const r = T.readTrace(p);
            eq(`${name} in the middle: the chain stops there`, r.events.length, 1);
            eq(`…the last seq is the prefix, not the maximum`, r.lastSeq, 1);
            eq(`…the physical maximum is still remembered`, r.physicalLastSeq, 2);
            eq(`…the damage is counted by name`, r[counter], 1);
            eq(`…the event beyond the break is counted, not applied`, r.beyondPrefix, 1);
            eq(`…and health says damaged`, r.health, 'damaged');
            // and the PROJECTION never sees it either — that is where a run's
            // history is rebuilt, and one invented action is one too many
            ok(`…the projection has no action from after the damage`,
                T.projectTrace(r.events).actions.length === 0);
            ok(`…and the reconciliation says the event beyond it was not applied`,
                /after the break were not applied/.test(T.reconcileRun(r, 1).degraded || ''));

            // ‼️ AND THE FILE IS CLOSED TO WRITING. A tail is repairable because
            // everything before it is intact; a break further up is not, and
            // appending past it buries the loss under history that looks whole.
            const before = fs.readFileSync(p, 'utf8');
            const w = T.MissionTraceWriter.open(p);
            ok(`…the writer refuses to append to it`, !!w.blocked);
            eq(`…by name`, w.blocked.reason, 'damaged');
            ok(`…and says so on the run`, /damaged/.test(w.degraded || ''));
            w.append('strategy.changed', { strategy: 'second', version: 2 });
            eq(`…the bytes are left exactly as they were`, fs.readFileSync(p, 'utf8'), before);
            eq(`…and lastSeq never claims a line the file does not have`, w.lastSeq, 2);
        }

        // …while the honest case still opens: a clean chain is appended to as
        // it always was, and a half-written TAIL is still repaired, not blocked.
        {
            const p = f('r-x86-clean.jsonl');
            writeLines(p, [line(1, 'strategy.changed'), line(2, 'action.created', { actionId: 'a' }), '']);
            const w = T.MissionTraceWriter.open(p);
            ok('a clean journal is still writable', !w.blocked && w.lastSeq === 2);
            w.append('run.finished', { status: 'done' });
            eq('…and the append lands', T.readTrace(p).events.length, 3);
        }
    }

    const back = f('r-backwards.jsonl');
    writeLines(back, [line(2, 'action.created', { actionId: 'a' }), line(1, 'strategy.changed'), '']);
    const b = T.readTrace(back);
    eq('order is evidence, not something to sort away', b.outOfOrder, 1);
    eq('nothing is applied from a file whose order is wrong', b.events.length, 0);
    eq('health is damaged', b.health, 'damaged');

    const bad = f('r-badseq.jsonl');
    writeLines(bad, [
        line(0, 'strategy.changed'), line(-1, 'strategy.changed'),
        JSON.stringify({ v: 2, seq: 1.5, ts: 1, type: 'strategy.changed' }),
        line(1, 'strategy.changed'), ''
    ]);
    const x = T.readTrace(bad);
    eq('a seq that cannot be ordered is never in the chain', x.invalidSeq, 3);
    eq('the one real event still reads', x.events.length, 1);
    eq('health is damaged', x.health, 'damaged');

    // ‼️ AND A HOLE OVER WORK IN FLIGHT IS NOT RE-BRIEFABLE — the run cannot
    // say what it already set in motion, which is the one case resume refuses.
    const lost = f('r-gap-inflight.jsonl');
    writeLines(lost, [
        line(1, 'action.created', { actionId: 'st1', kind: 'task', title: 'work' }),
        line(2, 'action.started', { actionId: 'st1', refId: 't1' }),
        line(4, 'decision.made', { nodeId: 'd2' }), ''
    ]);
    const rec = T.reconcileRun(T.readTrace(lost), 2);
    eq('one action of unknown fate', rec.interrupted, 1);
    eq('so the resume is refused', rec.resume, 'refuse');
}

// ============================================ 5e. X-64 a future journal is read-only
{
    console.log('\n-- ‼️ X-64 a journal from a newer build is never mutated');
    const file = f('r-future.jsonl');
    writeLines(file, [
        line(1, 'strategy.changed', { strategy: 'first' }),
        JSON.stringify({ v: T.MISSION_TRACE_SCHEMA + 7, seq: 2, ts: 2000, type: 'something.new' }),
        ''
    ]);
    const bytes = fs.readFileSync(file);

    const read = T.readTrace(file);
    eq('the future line is counted, not applied', read.fromFuture, 1);
    eq('health is future', read.health, 'future');
    eq('and the number it spent is remembered', read.physicalLastSeq, 2);

    const w = T.MissionTraceWriter.open(file);
    ok('the writer refuses to write', !!w.blocked);
    eq('by name', w.blocked.reason, 'future');
    ok('saying what the user has to do',
        w.blocked.message.indexOf('newer version of Agent Farm') >= 0);
    eq('and it never hands out a number the newer build used', w.lastSeq, 2);

    w.append('run.finished', { status: 'done', verdict: 'success' });
    eq('an append moves nothing', w.lastSeq, 2);
    ok('and the file is byte-identical', fs.readFileSync(file).equals(bytes));

    // ‼️ THE OTHER HALF OF THE SAME RULE. This used to answer \'rebrief\'
    // whenever nothing was in flight — and a rebrief RUNS the mission, so an
    // old build would then append its own events into a file a newer one had
    // already numbered.
    const rec = T.reconcileRun(read, 1);
    eq('a resume is refused outright, in-flight work or not', rec.resume, 'refuse');
    ok('and the sentence says to update', rec.degraded.indexOf('update Agent Farm') >= 0);
}

// ============================ 5f. X-62 the snapshot's own persistence contract
{
    console.log('\n-- ‼️ X-62 missing is not corrupt, and a failed swap never writes over the target');

    // ---- a store that was never there is not damage
    {
        const st = new M.MissionStore(f('missions-none.json'));
        st.load();
        eq('a store that never existed comes up empty', st.health, 'empty');
        ok('with nothing to report', !st.degraded);
        ok('and saving it is allowed', st.save().saved);
    }

    // ---- ‼️ a store whose BYTES went bad is evidence, not an empty list
    {
        const p = f('missions-corrupt.json');
        fs.writeFileSync(p, '{"specs": [ this is not json', 'utf8');
        const st = new M.MissionStore(p);
        st.load();
        eq('the fleet starts from an empty list', st.runs.length, 0);
        ok('but the bytes were set aside, not overwritten', !!st.quarantine);
        ok('and the kept copy is the original', fs.readFileSync(st.quarantine, 'utf8').indexOf('not json') >= 0);
        ok('the sentence names the file', st.degraded.indexOf(path.basename(st.quarantine)) >= 0);
        ok('saving is allowed once nothing can be lost by it', st.save().saved);

        // ‼️ WITHOUT THIS the very next save wrote the empty list straight over
        // the fleet's whole mission history, and the only sign was a Missions
        // page that looked like a fresh install.
        const st2 = new M.MissionStore(p);
        st2.load();
        eq('and the store re-reads clean afterwards', st2.health, 'ok');
    }

    // ---- ‼️ X-87: VALID JSON THAT IS NOT A STORE is corrupt too
    // X-62 asked only whether the bytes parsed. A file that parses perfectly and
    // is nothing like a store opened as `health: 'ok'` with an empty list — and
    // the next save wrote that emptiness over the fleet's whole history. Same
    // failure, different door.
    {
        const cases = [
            ['a root that is a list', '[]', /root is a list/],
            ['a root that is a number', '42', /root is number/],
            ['a store holding neither specs nor runs', '{}', /neither specs nor runs/],
            ['specs sent as a string', '{"specs":"broken","runs":"broken"}', /"specs" is string, not a list/],
            ['runs sent as null', '{"specs":[],"runs":null}', /"runs" is null, not a list/],
            ['a spec that is a bare string', '{"specs":["s1"],"runs":[]}', /specs\[0\] is string, not an object/],
            ['a spec with no id', '{"specs":[{"title":"t"}],"runs":[]}', /specs\[0\] has no id/],
            ['a run that names no spec', '{"specs":[],"runs":[{"id":"r1"}]}', /runs\[0\] has no specId/]
        ];
        for (const [name, body, rx] of cases) {
            const p = f('missions-schema-' + name.replace(/\W+/g, '-') + '.json');
            fs.writeFileSync(p, body, 'utf8');
            const st = new M.MissionStore(p);
            st.load();
            ok(`${name} is quarantined, not opened as an empty store`,
                !!st.quarantine && st.health === 'empty' && st.specs.length === 0);
            ok(`…and the sentence says what was wrong with it`, rx.test(st.degraded || ''));
            ok(`…and the original bytes are the ones that were kept`,
                !!st.quarantine && fs.readFileSync(st.quarantine, 'utf8') === body);
        }

        // ‼️ AND THE OLDER VERSION STILL OPENS WITHOUT LOSING A THING. Every
        // mission written before M-15 has no `mode`, no objective and no trace
        // pointer — that is migration, not damage, and the whole point of
        // checking IDENTITY only.
        {
            const p = f('missions-legacy.json');
            const legacy = {
                specs: [{
                    id: 's1', title: 'old one', goal: 'g', leadAgentId: 'a', leadAgentName: 'A',
                    team: [{ agentId: 'a', agentName: 'A' }],
                    limits: { maxRounds: 8, maxTasks: 12, maxCostUSD: 5, maxMinutes: 120, maxParallel: 2 },
                    approvalMode: 'auto', createdAt: 1
                }],
                runs: [{ id: 'r1', specId: 's1', status: 'done', rounds: [], ledger: [], totalCostUSD: 0.5, startedAt: 1 }]
            };
            fs.writeFileSync(p, JSON.stringify(legacy), 'utf8');
            const st = new M.MissionStore(p);
            st.load();
            eq('a store written before adaptive missions opens clean', st.health, 'ok');
            ok('…with nothing set aside', !st.quarantine && !st.degraded);
            ok('…and nothing lost or invented',
                st.specs.length === 1 && st.runs.length === 1
                && st.specs[0].id === 's1' && !('mode' in st.specs[0])
                && st.runs[0].totalCostUSD === 0.5);
        }
    }

    // ---- a corrupt store that CANNOT be set aside is never written over
    {
        const p = f('missions-locked.json');
        fs.writeFileSync(p, 'not json either', 'utf8');
        const st = new M.MissionStore(p);
        const realRename = fs.renameSync, realWrite = fs.writeFileSync;
        fs.renameSync = () => { throw new Error('EPERM'); };
        fs.writeFileSync = (dest, ...rest) => {
            if (String(dest).indexOf('.corrupt-') >= 0) { throw new Error('EPERM'); }
            return realWrite(dest, ...rest);
        };
        try { st.load(); } finally { fs.renameSync = realRename; fs.writeFileSync = realWrite; }
        eq('the store is unreadable', st.health, 'unreadable');
        ok('recovery is required of a person', st.recoveryRequired);

        const before = fs.readFileSync(p, "utf8");
        const res = st.save();
        ok('and the save REFUSES', !res.saved);
        eq('by name', res.stage, 'refused');
        eq('leaving the bytes exactly as they were', fs.readFileSync(p, 'utf8'), before);
    }

    // ---- ‼️ a failed rename leaves the last good store ALONE
    {
        const p = f('missions-swap.json');
        const st = new M.MissionStore(p);
        st.load();
        st.specs.push({ id: 's1', title: 'first', goal: 'g', leadAgentId: 'a', leadAgentName: 'a', team: [], limits: {}, approvalMode: 'auto', createdAt: 1 });
        ok('a first save lands', st.save().saved);
        const good = fs.readFileSync(p, 'utf8');

        st.specs.push({ id: 's2', title: 'second', goal: 'g', leadAgentId: 'a', leadAgentName: 'a', team: [], limits: {}, approvalMode: 'auto', createdAt: 2 });
        const realRename = fs.renameSync;
        fs.renameSync = () => { throw new Error('EPERM: the file is in use'); };
        let res;
        try { res = st.save(); } finally { fs.renameSync = realRename; }

        ok('the save reports its failure', !res.saved);
        eq('naming the step that failed', res.stage, 'rename');
        // ‼️ THIS IS THE WHOLE ITEM. The old code answered a failed rename with
        // a DIRECT write over the target — the truncation the atomic swap
        // exists to prevent, reintroduced at the moment the machine is already
        // in trouble.
        eq('the last good store is untouched', fs.readFileSync(p, 'utf8'), good);
        ok('and the state that could not land is kept in the temp file', fs.existsSync(p + '.tmp'));
        ok('the sentence says where it is', st.degraded.indexOf('.tmp') >= 0);

        ok('a later good save clears the warning and lands', st.save().saved);
        ok('with nothing left to report', !st.degraded);
        ok('and the second spec is really on disk', fs.readFileSync(p, 'utf8').indexOf('second') >= 0);
    }

    // ---- a failed TEMP write never touches the target either
    {
        const p = f('missions-temp.json');
        const st = new M.MissionStore(p);
        st.load();
        st.specs.push({ id: 's1', title: 'first', goal: 'g', leadAgentId: 'a', leadAgentName: 'a', team: [], limits: {}, approvalMode: 'auto', createdAt: 1 });
        st.save();
        const good = fs.readFileSync(p, 'utf8');
        const realWrite = fs.writeFileSync;
        fs.writeFileSync = () => { throw new Error('ENOSPC'); };
        let res;
        try { res = st.save(); } finally { fs.writeFileSync = realWrite; }
        eq('the temp copy is where it failed', res.stage, 'temp');
        eq('and the target is untouched', fs.readFileSync(p, 'utf8'), good);
    }

    // ---- ‼️ a journal append that fails is not silent
    {
        const p = f('r-append-fail.jsonl');
        const w = T.MissionTraceWriter.create(p);
        w.append('decision.made', { nodeId: 'd1' });
        eq('a good append moves the sequence', w.lastSeq, 1);
        ok('with nothing to report', !w.degraded);

        const realAppend = fs.appendFileSync;
        fs.appendFileSync = () => { throw new Error('EACCES'); };
        try { w.append('decision.made', { nodeId: 'd2' }); } finally { fs.appendFileSync = realAppend; }

        eq('a failed append moves nothing', w.lastSeq, 1);
        eq('it is counted', w.appendFailures, 1);
        ok('and the run can say why its journal stopped', /snapshot-only/.test(w.degraded));
    }
}

// ============================================ 6. duplicate seq is a replay
{
    console.log('\n-- a repeated seq is idempotent: the first copy wins');
    const file = f('r-dupe.jsonl');
    writeLines(file, [
        line(1, 'strategy.changed', { strategy: 'first' }),
        line(2, 'action.created', { actionId: 'st1', kind: 'task', title: 'original' }),
        line(2, 'action.created', { actionId: 'st1', kind: 'task', title: 'REPLAYED' }),
        line(3, 'action.settled', { actionId: 'st1', outcome: 'done', costUSD: 1 }),
        line(3, 'action.settled', { actionId: 'st1', outcome: 'failed', costUSD: 99 }),
        ''
    ]);
    const read = T.readTrace(file);
    eq('the duplicates are dropped', read.events.length, 3);
    eq('and counted', read.duplicates, 2);
    const p = T.projectTrace(read.events);
    eq('the FIRST copy is the one that stands', p.actions[0].title, 'original');
    eq('a replayed settle does not flip the outcome', p.actions[0].outcome, 'done');
    eq('nor double the cost', p.actions[0].costUSD, 1);
    eq('applying the same event twice lands on the same value',
        JSON.stringify(T.projectTrace(read.events)), JSON.stringify(T.projectTrace(read.events.concat(read.events))));
}

// ============================================ 7. a missing trace
{
    console.log('\n-- a run whose journal is gone still opens');
    const read = T.readTrace(f('never-written.jsonl'));
    eq('health is missing', read.health, 'missing');
    eq('with no events and no throw', read.events.length, 0);
    const rec = T.reconcileRun(read, 0);
    eq('nothing is claimed as interrupted', rec.interrupted, 0);
    eq('and the safe move is to brief the lead again', rec.resume, 'rebrief');
    ok('the detail surface gets an honest sentence', rec.degraded.includes('no trace'));
}

// ============================================ 8. the crash BETWEEN append and save
{
    console.log('\n-- the snapshot lagging the journal is the recoverable state');
    const file = f('r-behind.jsonl');
    writeLines(file, [
        line(1, 'strategy.changed', { strategy: 'go' }),
        line(2, 'action.created', { actionId: 'st1', kind: 'task', title: 'build' }),
        line(3, 'action.started', { actionId: 'st1', refId: 'task-7' }),
        line(4, 'action.settled', { actionId: 'st1', outcome: 'done', costUSD: 0.4, tokens: 1200 }),
        ''
    ]);
    // the snapshot only ever got as far as seq 2
    const rec = T.reconcileRun(T.readTrace(file), 2);
    eq('the gap is measured', rec.snapshotBehind, 2);
    eq('the settle is recovered from the journal itself', rec.actions[0].outcome, 'done');
    eq('on the journal\'s word, not the task store\'s', rec.actions[0].from, 'trace');
    eq('with its cost', rec.actions[0].costUSD, 0.4);
    eq('nothing is interrupted', rec.interrupted, 0);
    eq('and it resumes cleanly', rec.resume, 'ok');

    // ‼️ THE REVERSE IS THE UNRECOVERABLE ONE and is treated as such: a snapshot
    // claiming events the journal never recorded means the order was broken.
    const backwards = T.reconcileRun(T.readTrace(file), 9);
    ok('a snapshot ahead of its journal is flagged',
        backwards.degraded.includes('the snapshot claims events'));
    eq('with nothing in flight, it can still be re-briefed', backwards.resume, 'rebrief');
}

// ============================================ 9. reload during a delegation
{
    console.log('\n-- work in flight when the window died');
    const file = f('r-inflight.jsonl');
    writeLines(file, [
        line(1, 'strategy.changed', { strategy: 'delegate' }),
        line(2, 'action.created', { actionId: 'st1', kind: 'task', title: 'one' }),
        line(3, 'action.started', { actionId: 'st1', refId: 'task-1' }),
        line(4, 'action.created', { actionId: 'st2', kind: 'task', title: 'two' }),
        line(5, 'action.started', { actionId: 'st2', refId: 'task-2' }),
        ''
    ]);
    const read = T.readTrace(file);

    // task-1 finished while we were gone; task-2 is nowhere to be found
    const store = { 'task-1': { status: 'done', costUSD: 0.9, tokens: 400, outputFile: 'out-1.md' } };
    const rec = T.reconcileRun(read, 5, (kind, id) => (kind === 'task' ? store[id] : undefined));
    eq('the finished one is recovered', rec.recovered, 1);
    eq('on the TASK record\'s word', rec.actions[0].from, 'task');
    eq('with the cost it actually spent', rec.actions[0].costUSD, 0.9);
    eq('and its output', rec.actions[0].outputFile, 'out-1.md');
    eq('the missing one is interrupted', rec.actions[1].outcome, 'interrupted');
    eq('nobody claims to know what happened to it', rec.actions[1].from, 'unknown');
    eq('it is counted', rec.interrupted, 1);
    ok('and named in the degraded sentence', rec.degraded.includes('1 action(s) interrupted'));
    eq('a healthy journal with in-flight work still resumes — it KNOWS what it lost',
        rec.resume, 'ok');

    // a task still claiming to run with no process behind it is NOT a result
    const stillRunning = T.reconcileRun(read, 5, () => ({ status: 'running' }));
    eq('a "running" record is not a settle', stillRunning.interrupted, 2);
    eq('nothing is silently restarted', stillRunning.recovered, 0);

    // ‼️ AND THE REFUSAL: rubble PLUS work of unknown fate
    writeLines(f('r-both.jsonl'), [
        line(1, 'action.created', { actionId: 'st1', kind: 'task' }),
        'garbage in the middle',
        line(3, 'action.started', { actionId: 'st1', refId: 'task-x' }),
        ''
    ]);
    eq('a damaged journal with in-flight work cannot be safely resumed',
        T.reconcileRun(T.readTrace(f('r-both.jsonl')), 3).resume, 'refuse');
}

// ============================================ 10. reload during a question
{
    console.log('\n-- an ask that was never answered, and one that was');
    const open = f('r-asking.jsonl');
    writeLines(open, [
        line(1, 'strategy.changed', { strategy: 'ask first' }),
        line(2, 'human.asked', { askId: 'q1', flavor: 'question', text: 'which repo?' }),
        ''
    ]);
    const p = T.projectTrace(T.readTrace(open).events);
    ok('the pending ask survives the reload', !!p.pending);
    eq('with its text', p.pending.text, 'which repo?');
    eq('and its flavor', p.pending.flavor, 'question');
    eq('the reconciliation hands it back for Needs You',
        T.reconcileRun(T.readTrace(open), 2).pending.text, 'which repo?');

    const answered = f('r-answered.jsonl');
    writeLines(answered, [
        line(1, 'human.asked', { askId: 'q1', flavor: 'question', text: 'which repo?' }),
        line(2, 'human.answered', { askId: 'q1', text: 'the extension one' }),
        ''
    ]);
    const p2 = T.projectTrace(T.readTrace(answered).events);
    ok('an answered ask is no longer pending', p2.pending === undefined);
    eq('‼️ and the ANSWER is kept — a snapshot that never saved it is not a reason to ask again',
        p2.answers['q1'], 'the extension one');

    const approval = f('r-approval.jsonl');
    writeLines(approval, [
        line(1, 'human.asked', { askId: 'a1', flavor: 'approval', text: 'round 1 — 2 delegation(s)' }),
        ''
    ]);
    eq('an approval waits the same way a question does',
        T.projectTrace(T.readTrace(approval).events).pending.flavor, 'approval');

    const guided = f('r-guided.jsonl');
    writeLines(guided, [
        line(1, 'human.asked', { askId: 'q1', flavor: 'question', text: 'stuck' }),
        line(2, 'human.guided', { text: 'try the other repo' }),
        ''
    ]);
    ok('guidance nobody asked for closes nothing — the question is still open',
        T.projectTrace(T.readTrace(guided).events).pending.askId === 'q1');

    // two open asks: the OLDEST is the one the run is actually stuck on
    const two = f('r-two-asks.jsonl');
    writeLines(two, [
        line(1, 'human.asked', { askId: 'q1', flavor: 'question', text: 'first' }),
        line(2, 'human.asked', { askId: 'q2', flavor: 'question', text: 'second' }),
        ''
    ]);
    eq('the oldest unanswered ask is the blocker',
        T.projectTrace(T.readTrace(two).events).pending.text, 'first');

    // a finished run is not waiting on anybody, whatever the asks say
    const done = f('r-asked-then-done.jsonl');
    writeLines(done, [
        line(1, 'human.asked', { askId: 'q1', flavor: 'question', text: 'anything?' }),
        line(2, 'run.finished', { status: 'cancelled' }),
        ''
    ]);
    ok('a finished run has no pending ask', T.projectTrace(T.readTrace(done).events).pending === undefined);
}

// ============================================ 11. the projection
{
    console.log('\n-- what the journal folds up into');
    const file = f('r-project.jsonl');
    writeLines(file, [
        line(1, 'strategy.changed', { version: 1, strategy: 'first plan' }),
        line(2, 'evaluation.recorded', { criterionId: 'c1', met: false, text: 'not yet' }),
        line(3, 'strategy.changed', { version: 2, strategy: 'revised plan' }),
        line(4, 'evaluation.recorded', { criterionId: 'c1', met: true, text: 'now it is' }),
        line(5, 'evaluation.recorded', { criterionId: 'c2', met: true }),
        line(6, 'message.sent', { from: 'lead', to: 'coder' }),
        line(7, 'message.sent', { from: 'coder', to: 'lead' }),
        line(8, 'run.finished', { status: 'done', verdict: 'success', text: 'shipped' }),
        ''
    ]);
    const p = T.projectTrace(T.readTrace(file).events);
    eq('the CURRENT strategy is the latest one', p.strategy.text, 'revised plan');
    eq('and it knows which revision it is', p.strategy.version, 2);
    eq('a criterion keeps ONE verdict — the latest', p.evaluations.length, 2);
    const c1 = p.evaluations.find(e => e.criterionId === 'c1');
    eq('which is the newest one', c1.met, true);
    eq('‼️ a revised verdict is not a new criterion — it is counted, not duplicated', c1.revisions, 2);
    eq('messages are counted, not stored twice', p.messages, 2);
    eq('the ending is projected', p.finished.verdict, 'success');
    eq('with its summary', p.finished.text, 'shipped');
    eq('and the sequence high-water mark', p.lastSeq, 8);

    // an event about an action nobody created is ignored rather than inventing one
    eq('a settle for an unknown action creates nothing',
        T.projectTrace([{ v: 1, seq: 1, ts: 1, type: 'action.settled', actionId: 'ghost', outcome: 'done' }]).actions.length, 0);
}

// ============================================ 12. a line from the future
{
    console.log('\n-- a journal written by a newer build is not guessed at');
    const file = f('r-future.jsonl');
    writeLines(file, [line(1, 'strategy.changed', { strategy: 'ours' }), JSON.stringify({ v: 99, seq: 2, ts: 2, type: 'whatever' }), '']);
    const read = T.readTrace(file);
    eq('the future line is not applied', read.events.length, 1);
    eq('it is counted', read.fromFuture, 1);
    eq('and health says so', read.health, 'future');
    ok('the reader names the version problem',
        T.reconcileRun(read, 1).degraded.includes('newer version'));
}

// ============================================ 13. retention
{
    console.log('\n-- deleting a run takes its journal, and orphans are swept');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-orphan-'));
    for (const n of ['run-a.jsonl', 'run-b.jsonl', 'run-c.jsonl']) {
        fs.writeFileSync(path.join(dir, n), line(1, 'strategy.changed') + '\n', 'utf8');
    }
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not ours', 'utf8');
    // ‼️ X-61 — a quarantined tail belongs to its run and is swept with it; a
    // suffix the sweep did not know would grow the folder for ever, which is
    // the one thing splitting the journal out was meant to stop.
    fs.writeFileSync(path.join(dir, 'run-b.jsonl.broken'), 'half a line', 'utf8');
    fs.writeFileSync(path.join(dir, 'run-a.jsonl.broken'), 'half a line', 'utf8');
    const orphans = T.orphanTraceFiles(fs.readdirSync(dir), ['run-a']);
    eq('two runs are gone, so two journals are orphans', orphans.length, 3);
    ok('including the tail quarantined out of one', orphans.includes('run-b.jsonl.broken'));
    ok('the live run keeps its journal', !orphans.includes('run-a.jsonl'));
    ok('and its quarantine with it', !orphans.includes('run-a.jsonl.broken'));
    ok('‼️ a file that is not ours by name is never touched', !orphans.includes('notes.txt'));

    T.deleteTrace(path.join(dir, 'run-b.jsonl'));
    ok('a deleted run\'s journal is gone', !fs.existsSync(path.join(dir, 'run-b.jsonl')));
    ok('and takes its quarantine with it', !fs.existsSync(path.join(dir, 'run-b.jsonl.broken')));
    T.deleteTrace(path.join(dir, 'run-b.jsonl'));
    ok('deleting one twice is not an error', true);

    eq('the run id is read back off the file name', T.runIdOfTraceFile('run-a.jsonl'), 'run-a');
    eq('and the name is derived from the id', path.basename(T.traceFileFor(dir, 'xyz')), 'xyz.jsonl');
}

// ============================================ 14. the path stays portable
{
    console.log('\n-- the trace pointer travels with the store');
    const file = f('missions-portable.json');
    const home = os.homedir();
    const roots = () => [{ token: '${home}', path: home }];
    const store = new M.MissionStore(file, roots);
    store.specs = [];
    store.runs = [{
        id: 'r1', specId: 's1', status: 'done', rounds: [], ledger: [], totalCostUSD: 0, startedAt: 1,
        trace: { file: path.join(home, 'mission-trace', 'r1.jsonl'), lastSeq: 4, v: 1 }
    }];
    store.save();
    const raw = fs.readFileSync(file, 'utf8');
    ok('‼️ the machine path is tokenized like every other path in the store',
        raw.includes('${home}') && !raw.includes(path.join(home, 'mission-trace')));
    const back = new M.MissionStore(file, roots);
    back.load();
    eq('and expands back on load', back.runs[0].trace.file, path.join(home, 'mission-trace', 'r1.jsonl'));
    eq('with the snapshot\'s own sequence intact', back.runs[0].trace.lastSeq, 4);
}

// ============================================ 15. the engine writes the journal
{
    console.log('\n-- the engine traces without asking which kind of mission it is');
    const seen = [];
    const spec = {
        id: 's', title: 't', goal: 'g', leadAgentId: 'a1', leadAgentName: 'lead',
        team: [{ agentId: 'a2', agentName: 'coder' }],
        limits: { maxRounds: 3, maxTasks: 5, maxCostUSD: 5, maxTokens: 0, maxMinutes: 60, maxParallel: 2 },
        approvalMode: 'auto', createdAt: 1
    };
    const run = { id: 'r', specId: 's', status: 'running', rounds: [], ledger: [], totalCostUSD: 0, startedAt: 0 };
    const deps = {
        runPlanner: async () => ({
            ok: true, costUSD: 0,
            raw: JSON.stringify({ action: 'finish', thought: 'the plan', verdict: 'success', stopReason: 'criteria-satisfied', summary: 'done here' })
        }),
        delegateWave: async () => { },
        readOutputBody: () => '',
        requestApproval: async () => true,
        askUser: async () => undefined,
        onUpdate: () => { },
        trace: (type, payload) => seen.push({ type, payload }),
        now: () => 0
    };
    return new M.MissionEngine(spec, run, [], deps).execute().then(() => {
        // ‼️ M-16 — the DECISION node comes first and the revision points back
        // at it, so `sourceAction` is always a line already on disk.
        eq('every round opens a decision node', seen[0].type, 'decision.made');
        eq('in the lead\'s own words', seen[0].payload.text, 'the plan');
        eq('carrying the strategy version in force', seen[0].payload.version, 1);
        eq('and the revision follows it', seen[1].type, 'strategy.changed');
        eq('numbered by revisions, not by rounds', seen[1].payload.version, 1);
        eq('pointing back at the decision it came out of', seen[1].payload.sourceAction, 'd1');
        eq('and the ending is the last line', seen[seen.length - 1].type, 'run.finished');
        eq('with the verdict', seen[seen.length - 1].payload.verdict, 'success');

        // ‼️ AND WITHOUT THE DEP, NOTHING CHANGES. A caller written before this
        // item — or a classic run, which is handed no writer — runs identically.
        const bare = { ...deps, trace: undefined };
        const run2 = { id: 'r2', specId: 's', status: 'running', rounds: [], ledger: [], totalCostUSD: 0, startedAt: 0 };
        return new M.MissionEngine(spec, run2, [], bare).execute().then(() => {
            eq('a mission with no journal still finishes', run2.status, 'done');
            ok('and grows no trace pointer', run2.trace === undefined);
            console.log(`\n${pass} passed, ${fail} failed`);
            process.exit(fail ? 1 : 0);
        });
    });
}
