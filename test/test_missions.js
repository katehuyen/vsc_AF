// Missions core: planner-decision parsing, wave planning (parallel-write rule),
// budget guards, and the engine loop end-to-end with a scripted fake planner —
// happy path, rejection re-plan, invalid-JSON retry, budget finish-only,
// duplicate-work lock, ask_user, resume-fallback, cancel, hard call cap, store.
const fs = require('fs');
const path = require('path');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const M = require(path.join(__dirname, '..', 'out', 'core', 'missions.js'));

const spec = (over = {}) => ({
    id: 'spec1', title: 'Fix parser', goal: 'Fix the parser bug and prove it with tests',
    leadAgentId: 'lead', leadAgentName: 'lead',
    team: [
        { agentId: 'a-coder', agentName: 'coder', role: 'implements' },
        { agentId: 'a-rev', agentName: 'reviewer', role: 'reviews' }
    ],
    limits: { maxRounds: 8, maxTasks: 12, maxCostUSD: 5, maxMinutes: 120, maxParallel: 2 },
    approvalMode: 'auto', createdAt: 1, workdir: undefined,
    ...over
});
const newRun = () => ({
    id: 'run1', specId: 'spec1', status: 'running', rounds: [], ledger: [],
    totalCostUSD: 0, startedAt: 1000
});

// ---------- parsePlannerDecision ----------
{
    const s = spec();
    const d1 = M.parsePlannerDecision(JSON.stringify({
        thought: 't', action: 'delegate',
        tasks: [{ agent: 'Coder', title: 'do', prompt: 'work', expect: 'passes', readonly: false }]
    }), s);
    ok('delegate parses; agent name case-folded to team spelling',
        d1.ok && d1.decision.tasks[0].agent === 'coder' && d1.decision.tasks[0].expect === 'passes');

    const d2 = M.parsePlannerDecision('Here you go:\n```json\n{"action":"finish","summary":"done it"}\n```', s);
    ok('fenced JSON accepted; missing verdict defaults to partial',
        d2.ok && d2.decision.action === 'finish' && d2.decision.verdict === 'partial' && d2.decision.summary === 'done it');

    ok('unknown agent rejected with the team list in the error',
        !M.parsePlannerDecision('{"action":"delegate","tasks":[{"agent":"ghost","title":"x","prompt":"y"}]}', s).ok);
    ok('empty tasks rejected', !M.parsePlannerDecision('{"action":"delegate","tasks":[]}', s).ok);
    ok('finish without summary rejected', !M.parsePlannerDecision('{"action":"finish"}', s).ok);
    ok('unknown action rejected', !M.parsePlannerDecision('{"action":"dance"}', s).ok);
    ok('non-JSON rejected', !M.parsePlannerDecision('let me think about this', s).ok);
    const dq = M.parsePlannerDecision('{"action":"ask_user","question":"which repo?"}', s);
    ok('ask_user parses', dq.ok && dq.decision.question === 'which repo?');
}

// ---------- planWaves ----------
{
    const t = (n, ro) => ({ agent: 'coder', title: n, prompt: n, readonly: ro });
    const w1 = M.planWaves([t('a'), t('b'), t('c')], false, 2);
    ok('no workdir: plain chunks of maxParallel', w1.length === 2 && w1[0].length === 2 && w1[1].length === 1);
    const w2 = M.planWaves([t('w1', false), t('w2', false), t('r1', true)], true, 3);
    ok('workdir: two writers never share a wave', w2.length === 2 && w2[0][0].title === 'w1'
        && w2[1].some(x => x.title === 'w2'));
    const w3 = M.planWaves([t('w1', false), t('r1', true), t('r2', true)], true, 3);
    ok('workdir: one writer + readonly fill one wave', w3.length === 1 && w3[0].length === 3);
}

// ---------- budget / guard / excerpt / dupKey ----------
{
    const s = spec();
    const run = newRun();
    run.totalCostUSD = 4.5;
    run.rounds = [{ n: 1, thought: '', action: 'delegate', steps: [{}, {}], plannerCostUSD: 0, at: 0 }];
    const rem = M.remainingBudget(s, run, 1000 + 30 * 60000);
    ok('remaining budget computed', rem.rounds === 7 && rem.tasks === 10 && rem.costUSD === 0.5 && rem.minutes === 90);
    ok('no guard while budget remains', M.guardReason(rem) === null);
    ok('guard fires on spent cost', M.guardReason({ ...rem, costUSD: 0 }) !== null);
    run.waitedMs = 20 * 60000;
    ok('user-wait time excluded from the wall clock',
        M.remainingBudget(s, run, 1000 + 30 * 60000).minutes === 110);

    const long = 'A'.repeat(3000) + 'MID' + 'B'.repeat(3000);
    const ex = M.outputExcerpt(long, 100, 50);
    ok('excerpt keeps head + tail with an omission marker',
        ex.startsWith('A'.repeat(100)) && ex.endsWith('B'.repeat(50)) && ex.includes('chars omitted'));
    ok('dupKey normalizes case and whitespace',
        M.dupKey('Coder', 'Fix   the\nparser') === M.dupKey('coder', 'fix the parser'));
}

// ---------- engine harness ----------
function makeDeps(replies, opts = {}) {
    const calls = [];
    let t = 100000;
    return {
        calls,
        deps: {
            runPlanner: async (prompt, resumeSessionId) => {
                calls.push({ prompt, resumeSessionId });
                const r = replies.shift();
                if (!r) { return { ok: false, error: 'script exhausted' }; }
                if (r.fail) { return { ok: false, error: r.fail }; }
                return { ok: true, raw: typeof r.raw === 'string' ? r.raw : JSON.stringify(r.raw), sessionId: r.sid ?? 'sess-1', costUSD: r.cost ?? 0.1 };
            },
            delegateWave: async (run, steps) => {
                for (const s of steps) {
                    if (opts.cancelDuringWave) { opts.cancelDuringWave(); }
                    s.taskId = 'task-' + s.title;
                    s.status = opts.stepStatus ?? 'done';
                    s.costUSD = 0.2;
                    s.outputFile = 'D:/out/' + s.title + '.md';
                }
            },
            readOutputBody: (file) => `output body of ${path.basename(file)}`,
            requestApproval: async (run, round) => {
                calls.push({ approval: round.n });
                return opts.approve ? opts.approve() : true;
            },
            askUser: async (run, q) => { calls.push({ asked: q }); t += 5 * 60000; return opts.answer ?? 'use repo X'; },
            onUpdate: () => { },
            now: () => (t += 1000)
        }
    };
}
const HINTS = [{ name: 'coder', role: 'implements', hint: 'writes code' }, { name: 'reviewer', role: 'reviews' }];

(async () => {
    // ---------- happy path: delegate → finish ----------
    {
        const { deps, calls } = makeDeps([
            { raw: { thought: 'split work', action: 'delegate', tasks: [{ agent: 'coder', title: 'fix', prompt: 'fix it', readonly: false }, { agent: 'reviewer', title: 'review', prompt: 'review it', readonly: true }] }, sid: 'S1' },
            { raw: { action: 'finish', verdict: 'success', summary: 'all green' }, sid: 'S1' }
        ]);
        const run = newRun();
        await new M.MissionEngine(spec(), run, HINTS, deps).execute();
        ok('mission finishes done with the planner verdict',
            run.status === 'done' && run.result.verdict === 'success' && run.result.summary === 'all green');
        ok('briefing sent first (goal + team + schema)',
            calls[0].prompt.includes('Fix the parser bug') && calls[0].prompt.includes('- coder (implements) — writes code')
            && calls[0].prompt.includes('"action"') && calls[0].resumeSessionId === undefined);
        ok('second call resumes the planner session', calls[1].resumeSessionId === 'S1');
        ok('round results carry status, cost and excerpt',
            calls[1].prompt.includes('DONE') && calls[1].prompt.includes('output body of fix.md')
            && calls[1].prompt.includes('Remaining budget'));
        ok('costs sum planner + steps', Math.abs(run.totalCostUSD - (0.1 + 0.1 + 0.2 + 0.2)) < 1e-9);
        ok('steps recorded with task ids', run.rounds[0].steps.length === 2 && run.rounds[0].steps.every(s => s.taskId));
        ok('ledger has one line per round', run.ledger.length === 2 && run.ledger[0].includes('delegate'));
    }

    // ---------- each-round approval: reject → re-plan ----------
    {
        let first = true;
        const { deps, calls } = makeDeps([
            { raw: { action: 'delegate', tasks: [{ agent: 'coder', title: 'risky', prompt: 'rm -rf' }] } },
            { raw: { action: 'finish', verdict: 'partial', summary: 'stopped' } }
        ], { approve: () => { const v = !first ? true : false; first = false; return v; } });
        const run = newRun();
        await new M.MissionEngine(spec({ approvalMode: 'each-round' }), run, HINTS, deps).execute();
        ok('rejected round is recorded and its steps cancelled',
            run.rounds[0].rejectedReason && run.rounds[0].steps[0].status === 'cancelled');
        ok('planner is told about the rejection', calls.some(c => c.prompt && c.prompt.includes('REJECTED')));
        ok('mission still ends via the planner', run.status === 'done' && run.result.verdict === 'partial');
    }

    // ---------- invalid JSON: one retry, then fail ----------
    {
        const { deps, calls } = makeDeps([
            { raw: 'gibberish, not json' },
            { raw: { action: 'finish', verdict: 'success', summary: 'ok now' } }
        ]);
        const run = newRun();
        await new M.MissionEngine(spec(), run, HINTS, deps).execute();
        ok('invalid reply retried once with the error fed back',
            run.status === 'done' && calls[1].prompt.includes('invalid'));

        const bad = makeDeps([{ raw: 'nope' }, { raw: 'still nope' }]);
        const run2 = newRun();
        await new M.MissionEngine(spec(), run2, HINTS, bad.deps).execute();
        ok('two invalid replies fail the mission honestly',
            run2.status === 'failed' && run2.note.includes('invalid'));
    }

    // ---------- budget guard: finish-only round ----------
    {
        const { deps, calls } = makeDeps([
            { raw: { action: 'finish', verdict: 'failed', summary: 'no budget to start' } }
        ]);
        const run = newRun();
        run.totalCostUSD = 99;
        await new M.MissionEngine(spec(), run, HINTS, deps).execute();
        ok('exhausted budget makes round 1 finish-only',
            calls[0].prompt.includes('no longer allowed') && run.status === 'done');

        // planner insists on delegating: one nudge, then forced end
        const stubborn = makeDeps([
            { raw: { action: 'delegate', tasks: [{ agent: 'coder', title: 'x', prompt: 'y' }] } },
            { raw: { action: 'delegate', tasks: [{ agent: 'coder', title: 'x2', prompt: 'y2' }] } }
        ]);
        const run2 = newRun();
        run2.totalCostUSD = 99;
        await new M.MissionEngine(spec(), run2, HINTS, stubborn.deps).execute();
        ok('planner that keeps delegating past the budget is stopped',
            run2.status === 'failed' && run2.note === 'budget exhausted');
    }

    // ---------- duplicate-work lock ----------
    {
        const sameTask = { agent: 'coder', title: 'fix', prompt: 'fix the parser' };
        const { deps, calls } = makeDeps([
            { raw: { action: 'delegate', tasks: [sameTask] } },
            { raw: { action: 'delegate', tasks: [sameTask] } },
            { raw: { action: 'finish', verdict: 'partial', summary: 'loop detected, stopping' } }
        ]);
        const run = newRun();
        await new M.MissionEngine(spec(), run, HINTS, deps).execute();
        ok('repeated identical delegation is dropped and reported',
            calls[2].prompt.includes('Nothing was run') && calls[2].prompt.includes('already delegated'));
        ok('mission ends by planner decision after the lock', run.status === 'done');
    }

    // ---------- ask_user ----------
    {
        const { deps, calls } = makeDeps([
            { raw: { action: 'ask_user', question: 'which repo?' } },
            { raw: { action: 'finish', verdict: 'success', summary: 'done with repo X' } }
        ]);
        const run = newRun();
        await new M.MissionEngine(spec(), run, HINTS, deps).execute();
        const plannerCalls = calls.filter(c => c.prompt);
        ok('question asked and answer fed back',
            calls.some(c => c.asked === 'which repo?') && plannerCalls[1].prompt.includes('use repo X'));
        ok('waiting time excluded from wall clock', (run.waitedMs ?? 0) >= 5 * 60000);
        ok('round records Q and A', run.rounds[0].question === 'which repo?' && run.rounds[0].answer === 'use repo X');
    }

    // ---------- resume-fallback: resume dies → fresh session with ledger ----------
    {
        const { deps, calls } = makeDeps([
            { raw: { action: 'delegate', tasks: [{ agent: 'coder', title: 'fix', prompt: 'fix it' }] }, sid: 'S9' },
            { fail: 'resume: session not found' },
            { raw: { action: 'finish', verdict: 'success', summary: 'recovered' }, sid: 'S10' }
        ]);
        const run = newRun();
        await new M.MissionEngine(spec(), run, HINTS, deps).execute();
        ok('failed resume falls back to a fresh briefing + ledger',
            run.status === 'done'
            && calls[2].resumeSessionId === undefined
            && calls[2].prompt.includes('History so far')
            && calls[2].prompt.includes('delegate'));
        ok('new session id adopted after fallback', run.plannerSessionId === 'S10');
    }

    // ---------- cancel during a wave ----------
    {
        let engine;
        const { deps } = makeDeps([
            { raw: { action: 'delegate', tasks: [{ agent: 'coder', title: 'slow', prompt: 'slow work' }] } }
        ], { cancelDuringWave: () => engine.cancel() });
        const run = newRun();
        engine = new M.MissionEngine(spec(), run, HINTS, deps);
        await engine.execute();
        ok('cancel during delegation ends the run as cancelled', run.status === 'cancelled');
    }

    // ---------- hard call cap ----------
    {
        const loopReplies = [];
        for (let i = 0; i < 40; i++) {
            loopReplies.push({ raw: { action: 'delegate', tasks: [{ agent: 'coder', title: 'w' + i, prompt: 'p' + i }] } });
        }
        const { deps } = makeDeps(loopReplies);
        const run = newRun();
        await new M.MissionEngine(spec({ limits: { maxRounds: 3, maxTasks: 100, maxCostUSD: 100, maxMinutes: 999, maxParallel: 2 } }), run, HINTS, deps).execute();
        ok('run can never spin past the hard planner-call cap',
            run.status === 'done' || run.status === 'failed');
        ok('round limit produced a finish-only ending, not an infinite loop', run.rounds.length <= 6);
    }

    // ---------- resume message builder ----------
    {
        const run = newRun();
        const step = { id: 's', round: 1, agentId: 'a-coder', agentName: 'coder', title: 'fix', prompt: 'p', status: 'failed', note: 'interrupted by reload', outputFile: '' };
        const msg = M.buildResumeMessage(run, [{ step, excerpt: 'partial output' }], { rounds: 5, tasks: 5, costUSD: 3, minutes: 60 });
        ok('resume message carries interruption context + results',
            msg.includes('interrupted') && msg.includes('FAILED') && msg.includes('partial output'));
    }

    // ---------- store ----------
    {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-missions-'));
        const file = path.join(tmp, 'missions.json');
        const store = new M.MissionStore(file);
        store.load(); // missing file = empty, no throw
        store.specs.push(spec());
        for (let i = 0; i < 50; i++) {
            store.runs.push({ ...newRun(), id: 'r' + i, startedAt: i, status: i < 45 ? 'done' : 'running' });
        }
        store.save();
        const store2 = new M.MissionStore(file);
        store2.load();
        ok('store round-trips through JSON', store2.specs.length === 1 && store2.spec('spec1').goal.includes('parser'));
        ok('finished runs pruned to the cap, live runs kept',
            store2.runs.length <= 40 && store2.runs.filter(r => r.status === 'running').length === 5);
        fs.rmSync(tmp, { recursive: true, force: true });
    }

    // ---------- planner envelope parsing ----------
    {
        const env = M.parsePlannerEnvelope(JSON.stringify({
            type: 'result', subtype: 'success', result: '{"action":"finish"}',
            session_id: 'abc', total_cost_usd: 0.42
        }));
        ok('envelope parsed: result + session + cost',
            env && env.result === '{"action":"finish"}' && env.sessionId === 'abc'
            && env.costUSD === 0.42 && env.isError === false);
        const noisy = 'some warning line\n' + JSON.stringify({ type: 'result', result: 'hi', session_id: 's' });
        ok('leading noise lines tolerated', M.parsePlannerEnvelope(noisy).result === 'hi');
        ok('error envelope flagged', M.parsePlannerEnvelope(JSON.stringify({
            type: 'result', subtype: 'error_during_execution', is_error: true, result: 'boom'
        })).isError === true);
        ok('garbage stdout → null (caller reports honestly)', M.parsePlannerEnvelope('not json at all') === null);
    }

    // ---------- Needs You integration: mission waits ----------
    {
        const N = require(path.join(__dirname, '..', 'out', 'core', 'needs.js'));
        const items = N.buildNeedsQueue({
            liveSessions: [], approvals: [], insights: [], deferredTasks: [],
            missionWaits: [
                { runId: 'r1', missionTitle: 'Fix parser', flavor: 'question', detail: 'which repo?', ts: 5 },
                { runId: 'r2', missionTitle: 'Docs pass', flavor: 'interrupted', detail: 'resume to continue', ts: 6 }
            ]
        });
        const q = items.find(i => i.kind === 'mission' && i.ref.missionRunId === 'r1');
        const it = items.find(i => i.kind === 'mission' && i.ref.missionRunId === 'r2');
        ok('mission question surfaces with Answer action',
            q && q.title.includes('has a question') && q.actions.some(a => a.id === 'mission-answer'));
        ok('interrupted mission surfaces with Resume/Dismiss',
            it && it.title.includes('interrupted') && it.actions.some(a => a.id === 'mission-resume')
            && it.actions.some(a => a.id === 'mission-dismiss'));
        ok('mission waits count as blocking', N.blockingCount(items) === 2);
    }

    // ---------- planner discipline in the briefing ----------
    {
        const b = M.buildBriefing(spec(), HINTS, { rounds: 8, tasks: 12, costUSD: 5, minutes: 120 });
        ok('briefing forbids the lead from doing the work itself',
            b.includes("NEVER do the mission's work yourself"));
        ok('briefing tells the lead to scale effort to the goal size',
            b.includes('Scale your effort') && b.includes('ONE round'));
    }

    // ---------- pause feedback: pending flag → park → flags cleared ----------
    {
        let engine;
        const seen = { pendingDuringRun: false, nowValues: [] };
        const h = makeDeps([
            { raw: { action: 'delegate', tasks: [{ agent: 'coder', title: 'slow', prompt: 'work' }] } },
            { raw: { action: 'finish', verdict: 'success', summary: 'never reached' } }
        ], { cancelDuringWave: () => engine.pause() });
        h.deps.onUpdate = (r) => {
            if (r.pausePending) { seen.pendingDuringRun = true; }
            if (r.now) { seen.nowValues.push(r.now.what); }
        };
        const run = newRun();
        engine = new M.MissionEngine(spec(), run, HINTS, h.deps);
        await engine.execute();
        ok('pause shows pausePending immediately and parks before the next round',
            seen.pendingDuringRun && run.status === 'paused' && run.pausePending === false);
        ok('live "now" cleared once parked', run.now === undefined);
        ok('live "now" reported the planning and running phases',
            seen.nowValues.some(w => w.includes('planning round 1'))
            && seen.nowValues.some(w => w.includes('running coder')));
    }

    // ---------- unpause withdraws a not-yet-effective pause ----------
    {
        let engine;
        const { deps } = makeDeps([
            { raw: { action: 'delegate', tasks: [{ agent: 'coder', title: 'w', prompt: 'p' }] } },
            { raw: { action: 'finish', verdict: 'success', summary: 'done' } }
        ], { cancelDuringWave: () => { engine.pause(); engine.unpause(); } });
        const run = newRun();
        engine = new M.MissionEngine(spec(), run, HINTS, deps);
        await engine.execute();
        ok('withdrawn pause keeps the mission running to the end',
            run.status === 'done' && run.pausePending === false);
    }

    // ---------- envelope subtype (max-turns recovery hook) ----------
    {
        const env = M.parsePlannerEnvelope(JSON.stringify({
            type: 'result', subtype: 'error_max_turns', is_error: true, result: '', session_id: 'sX'
        }));
        ok('envelope exposes the error subtype and session for the retry nudge',
            env && env.isError === true && env.subtype === 'error_max_turns' && env.sessionId === 'sX');
    }

    // ---------- resume message custom head (manual pause vs reload) ----------
    {
        const run = newRun();
        const msg = M.buildResumeMessage(run, [], { rounds: 5, tasks: 5, costUSD: 3, minutes: 60 },
            'The mission was paused by the user and has been resumed.');
        ok('resume message honours a custom head',
            msg.includes('paused by the user') && !msg.includes('window reload'));
    }

    // ---------- missionLiveSlice (mission-scoped live feed) ----------
    {
        const evs = [
            { ts: 100, agentId: 'a1', kind: 'prompt' },              // before the run
            { ts: 900, agentId: 'zz', kind: 'toolStart' },           // outsider agent
            { ts: 1000, agentId: 'a1', kind: 'toolStart', tool: 'Edit' },
            { ts: 1100, kind: 'notify' },                            // no agent — dropped
            { ts: 1200, agentId: 'a2', kind: 'stop' },
            { ts: 1300, agentId: 'a1', kind: 'toolEnd', tool: 'Edit' }
        ];
        const out = M.missionLiveSlice(evs, new Set(['a1', 'a2']), 500);
        ok('live slice keeps only team events since the run started',
            out.length === 3 && out[0].ts === 1000 && out[2].ts === 1300);
        const capped = M.missionLiveSlice(
            Array.from({ length: 10 }, (_, i) => ({ ts: 1000 + i, agentId: 'a1', kind: 'stop' })),
            new Set(['a1']), 0, 4);
        ok('live slice caps to the newest N events',
            capped.length === 4 && capped[0].ts === 1006 && capped[3].ts === 1009);
    }

    // ---------- envelope usage → tokens ----------
    {
        const env = M.parsePlannerEnvelope(JSON.stringify({
            type: 'result', result: '{}', session_id: 's1', total_cost_usd: 0.2,
            usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 1000, cache_creation_input_tokens: 10 }
        }));
        ok('envelope sums usage into total tokens', env && env.tokens === 1160);
        const none = M.parsePlannerEnvelope(JSON.stringify({ type: 'result', result: '{}' }));
        ok('missing usage → tokens undefined', none && none.tokens === undefined);
    }

    // ---------- remapStorageIds (publisher rename migration) ----------
    {
        const U = require(path.join(__dirname, '..', 'out', 'core', 'util.js'));
        const raw = '{"outputFile":"c:\\\\Users\\\\x\\\\globalStorage\\\\miropharm.agent-farm\\\\task-outputs\\\\t1.md"}';
        const fixed = U.remapStorageIds(raw, 'muvusoft.agent-farm');
        ok('storage-id remap rewrites old publisher paths',
            fixed.includes('muvusoft.agent-farm') && !fixed.includes('miropharm'));
        ok('remap leaves current-id text unchanged', U.remapStorageIds(fixed, 'muvusoft.agent-farm') === fixed);
    }

    // ---------- readFileTail (live output tail for the step accordion) ----------
    {
        const U = require(path.join(__dirname, '..', 'out', 'core', 'util.js'));
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-tail-'));
        const f = path.join(dir, 'out.md');
        fs.writeFileSync(f, 'short output', 'utf8');
        const small = U.readFileTail(f, 100);
        ok('tail of a small file is the whole file', small && small.text === 'short output' && small.size === 12);
        fs.writeFileSync(f, 'x'.repeat(500) + '\nline-A\nline-B tail-end', 'utf8');
        const big = U.readFileTail(f, 20);
        ok('tail of a big file keeps only the end and drops the partial first line',
            big && big.text.includes('tail-end') && !big.text.includes('xxxx') && big.text.indexOf('line-B') === 0);
        ok('unreadable file → undefined (fail-soft)', U.readFileTail(path.join(dir, 'missing.md')) === undefined);
        fs.rmSync(dir, { recursive: true, force: true });
    }

    // ---------- X-19: the ceiling that binds when the engine states no price --
    //
    // ‼️ THE HOLE THIS CLOSES. `maxCostUSD` is the only limit in a mission with
    // real teeth — rounds and tasks are coarse, minutes only bite on something
    // slow. A delegate running on a subscription engine reports NO price at all
    // (the adaptor emits no `total_cost_usd` rather than a zero), so
    // `totalCostUSD` never moves for it: a team of Codex delegates could burn a
    // whole plan window against a $5 ceiling it can never reach. That is not a
    // cap, it is the appearance of one.
    {
        const s = spec({ limits: { ...spec().limits, maxTokens: 100000 } });
        const run = { ...newRun(), totalCostUSD: 0, totalTokens: 0 };
        const rem0 = M.remainingBudget(s, run, 2000);
        ok('a fresh run has its whole token ceiling', rem0.tokens === 100000);
        ok('…and nothing stops it', M.guardReason(rem0) === null);

        // A wave of plan-billed delegates: tokens moved, dollars did not.
        const spent = { ...run, totalCostUSD: 0, totalTokens: 100000 };
        const rem1 = M.remainingBudget(s, spent, 2000);
        ok('‼️ tokens spent with no dollars spent still exhausts the budget',
            rem1.costUSD === 5 && rem1.tokens === 0
            && M.guardReason(rem1) === 'the token budget is spent');

        // …and a mission written before this existed behaves exactly as it did.
        const old = spec();                       // no maxTokens field at all
        const remOld = M.remainingBudget(old, { ...run, totalTokens: 9e9 }, 2000);
        ok('‼️ a spec with no token ceiling is never stopped by one',
            remOld.tokens === Infinity && M.guardReason(remOld) === null);
        ok('…and an explicit 0 means the same thing, deliberately',
            M.remainingBudget(spec({ limits: { ...spec().limits, maxTokens: 0 } }),
                { ...run, totalTokens: 9e9 }, 2000).tokens === Infinity);

        ok('the default limits carry a real token backstop',
            M.DEFAULT_MISSION_LIMITS.maxTokens === 2000000);

        // ‼️ …AND THE PLANNER IS TOLD. A lead that only ever sees "$5.00 left"
        // on a plan-billed team plans as if nothing had been spent.
        const brief = M.buildBriefing(s, [{ name: 'coder' }], rem1);
        ok('the briefing states the token budget when there is one',
            /0k tokens/.test(brief));
        ok('…and says nothing about tokens when there is no ceiling',
            !/tokens/.test(M.buildBriefing(old, [{ name: 'coder' }], remOld)));
    }

    // ---------- X-18: a delegation's engine ----------
    {
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'missions.ts'), 'utf8');
        const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        ok('a team member can name its own engine', /engine\?: string;/.test(src));
        ok('‼️ …and the PLANNER deliberately cannot, with the reason written down',
            /THE PLANNER IS NOT ON THIS AXIS, AND THAT IS A DECISION/.test(src)
            && /--disallowedTools/.test(src));
        ok('the delegation really carries it: member, then mission, then claude',
            /const wanted = \(member\?\.engine \|\| spec\.engine \|\| ''\)\.trim\(\);/.test(ext));
        ok('…and the run counts tokens as well as dollars, both halves',
            /run\.totalTokens = \(run\.totalTokens \?\? 0\) \+ \(pr\.tokens \?\? 0\);/.test(src)
            && /round\.steps\.reduce\(\(a, s\) => a \+ \(s\.tokens \?\? 0\), 0\)/.test(src));
        ok('…and a mission on an engine this machine cannot run is refused at CREATION',
            /const refused = engineRefusal\(engineMatrix\(\), missionEngine\);/.test(ext));
    }

    // ---------- M-14: a delegation's PERMISSIONS ----------
    // A delegation is a headless run. Every other unattended surface (task,
    // schedule, template, workflow step) spends `permissionMode` up front
    // because there is nobody in the run to answer a prompt; the mission
    // delegate was the one path that carried no such field at all, so it always
    // took the engine default. On Claude that degrades quietly. On OpenCode it
    // does not — `opencodePermissionFor('')` is `build` with no `--auto`, and
    // every tool call the config marks "ask" comes back `error=user rejected`
    // with the delegate reporting no reason.
    {
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'missions.ts'), 'utf8');
        const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        const media = fs.readFileSync(path.join(__dirname, '..', 'media', 'missions.js'), 'utf8');
        ok('a team member carries its own permission mode', /permissionMode\?: string;/.test(src));
        ok('‼️ …with the reason it is PER MEMBER, not one setting for the team',
            /Per MEMBER, on the same axis as `model` and `engine`/.test(src));
        // ‼️ The tidy version of this sentence is the one that was wrong, so the
        // test guards against it coming back: the field's reason may not be
        // stated as "an unattended OpenCode run cannot call a tool". Measured
        // four times on 2026-08-16 — a `build` delegate on a config that marks
        // nothing "ask" writes fine. What holds every run is the exit code.
        ok('‼️ …and the reason is the MEASURED one, with its own limits stated',
            /THE TIDY VERSION OF/.test(src)
            && /probe_opencode_contract\.js/.test(src)
            && /still exits 0/.test(src));
        ok('‼️ …and the overclaim it replaced cannot creep back in',
            !/error=user rejected/.test(src));
        ok('…and `plan` is named as the thing no config can supply',
            /plan agent calls no\s*\*?\s*tool at all/.test(src.replace(/\s*\*\s*/g, ' ')));
        ok('the delegation really carries it onto the task',
            /if \(member\?\.permissionMode\) \{ task\.permissionMode = member\.permissionMode; \}/.test(ext));
        ok('‼️ a typo is REFUSED at creation, not dropped like an unknown engine is',
            /const bad = validateLaunch\(\{ permissionMode: memberPerm \}\);/.test(ext)
            && /if \(bad\.length\) \{ return `\$\{a\.name\}: \$\{bad\[0\]\}`; \}/.test(ext));
        ok('…and empty stays empty — the engine default is still the default',
            /permissionMode: memberPerm \|\| undefined/.test(ext));
        ok('the form offers it from the ONE permission list, never a copy',
            /permissions: PERMISSION_CHOICES/.test(ext) && /DATA\.permissions \|\| \[\]/.test(media));
        ok('…and the run detail reads the chosen mode back',
            /m\.permissionMode \? ` \{\$\{m\.permissionMode\}\}` : ''/.test(media)
            && /delegation permissions/.test(media));
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
