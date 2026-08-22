// ‼️ THE CEILINGS ON A MISSION BELONG TO WHOEVER PAYS FOR IT.
//
// This file exists because the extension once decided, on the user's behalf,
// that no mission may cost more than $500, run longer than 24 hours or plan
// more than 30 rounds — and clamped anything larger down silently, so a run
// asked for a five-day marathon and ended on the second day for a reason
// nobody had written down. A command centre hands out DEFAULTS; it does not
// hand out limits. So: no upper clamp on any axis, and `0` means UNLIMITED
// everywhere — the one word `maxTokens` already spoke (X-19), now spoken by
// all six, and held here so it cannot quietly grow a cap back.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const M = require(path.join(__dirname, '..', 'out', 'core', 'missions.js'));
const fs = require('fs');

const N = M.normalizeMissionLimits;

// ---------- defaults ----------
{
    const d = N({});
    ok('an empty request gets the documented defaults',
        d.maxRounds === 8 && d.maxTasks === 12 && d.maxCostUSD === 5
        && d.maxTokens === 2000000 && d.maxMinutes === 120 && d.maxParallel === 2);
    ok('a figure that is not a number falls back to the default, it is not zeroed',
        N({ maxMinutes: 'soon', maxCostUSD: null }).maxMinutes === 120
        && N({ maxCostUSD: 'lots' }).maxCostUSD === 5);
}

// ---------- ‼️ no upper clamp, on any axis ----------
{
    const big = N({
        maxRounds: 200, maxTasks: 500, maxCostUSD: 5000,
        maxTokens: 900000000, maxMinutes: 7200, maxParallel: 32
    });
    ok('a five-day mission is five days, not 24 hours', big.maxMinutes === 7200);
    ok('a $5000 budget is $5000, not $500', big.maxCostUSD === 5000);
    ok('200 rounds and 500 tasks survive verbatim', big.maxRounds === 200 && big.maxTasks === 500);
    ok('900M tokens and 32 parallel survive verbatim',
        big.maxTokens === 900000000 && big.maxParallel === 32);
}

// ---------- ‼️ 0 = unlimited, on every axis ----------
{
    const free = N({
        maxRounds: 0, maxTasks: 0, maxCostUSD: 0,
        maxTokens: 0, maxMinutes: 0, maxParallel: 0
    });
    ok('0 is kept as 0 on every axis — that is how "no ceiling" is spelled',
        Object.values(free).every(v => v === 0));
    ok('a negative figure means the same thing rather than a strange limit',
        Object.values(N({
            maxRounds: -1, maxTasks: -5, maxCostUSD: -0.5,
            maxTokens: -1, maxMinutes: -60, maxParallel: -2
        })).every(v => v === 0));
}

// ---------- the floor survives: a POSITIVE typo is still a typo ----------
{
    const tiny = N({ maxRounds: 0.4, maxTasks: 0.2, maxCostUSD: 0.001, maxMinutes: 0.3, maxParallel: 0.1 });
    ok('a positive figure below the smallest workable value is lifted, not zeroed',
        tiny.maxRounds === 1 && tiny.maxTasks === 1 && tiny.maxCostUSD === 0.01
        && tiny.maxMinutes === 1 && tiny.maxParallel === 1);
    ok('count axes stay whole numbers', N({ maxRounds: 7.6, maxMinutes: 45.4 }).maxRounds === 8
        && N({ maxMinutes: 45.4 }).maxMinutes === 45);
    ok('the cost axis keeps its cents', N({ maxCostUSD: 12.345 }).maxCostUSD === 12.35);
}

// ---------- what an unlimited ceiling does to the budget ----------
const spec = (limits) => ({
    id: 's', title: 't', goal: 'g', leadAgentId: 'l', leadAgentName: 'lead',
    team: [{ agentId: 'a', agentName: 'coder' }],
    limits, approvalMode: 'auto', createdAt: 1
});
const run = (over = {}) => ({
    id: 'r', specId: 's', status: 'running', rounds: [], ledger: [],
    totalCostUSD: 0, startedAt: 0, ...over
});

{
    const rem = M.remainingBudget(
        spec(N({ maxRounds: 0, maxTasks: 0, maxCostUSD: 0, maxTokens: 0, maxMinutes: 0, maxParallel: 0 })),
        run({ totalCostUSD: 999, totalTokens: 50000000, rounds: Array.from({ length: 40 }, () => ({ steps: [] })) }),
        10 * 24 * 60 * 60000);
    ok('every unlimited axis reads as Infinity, whatever has been spent',
        [rem.rounds, rem.tasks, rem.costUSD, rem.tokens, rem.minutes].every(v => v === Infinity));
    ok('…so nothing ever forces the planner to finish', M.guardReason(rem) === null);

    // and the guard still bites when a ceiling WAS set — the point is choice,
    // not the removal of the brake.
    const tight = M.remainingBudget(
        spec(N({ maxRounds: 8, maxTasks: 12, maxCostUSD: 5, maxTokens: 0, maxMinutes: 120, maxParallel: 2 })),
        run({ totalCostUSD: 6 }), 1000);
    ok('a ceiling that WAS set still stops the run', /cost budget is spent/.test(M.guardReason(tight) || ''));
}

// ---------- the lead is TOLD it is unlimited, not shown "Infinity round(s)" ----------
{
    const free = N({ maxRounds: 0, maxTasks: 0, maxCostUSD: 0, maxTokens: 0, maxMinutes: 0, maxParallel: 0 });
    const brief = M.buildBriefing(spec(free), [{ name: 'coder' }],
        M.remainingBudget(spec(free), run(), 1000));
    ok('the briefing says unlimited in words',
        brief.includes('unlimited rounds') && brief.includes('unlimited tasks')
        && brief.includes('no cost ceiling') && brief.includes('no time limit'));
    ok('…and never leaks the word Infinity into a planner prompt', !/Infinity/.test(brief));

    const capped = N({ maxRounds: 8, maxTasks: 12, maxCostUSD: 5, maxTokens: 0, maxMinutes: 120, maxParallel: 2 });
    const brief2 = M.buildBriefing(spec(capped), [{ name: 'coder' }],
        M.remainingBudget(spec(capped), run(), 1000));
    ok('a capped mission still reads exactly as it always did',
        /Remaining budget: 8 round\(s\), 12 task\(s\), \$5\.00, ~120 min\./.test(brief2));
}

// ---------- maxParallel 0 = one wave, and the one-writer rule still holds ----------
{
    const readers = Array.from({ length: 5 }, (_, i) => ({ agent: 'coder', title: 't' + i, prompt: 'p' + i, readonly: true }));
    ok('0 parallel puts a whole round in one wave', M.planWaves(readers, false, 0).length === 1);
    const writers = [
        { agent: 'coder', title: 'w1', prompt: 'p1' },
        { agent: 'coder', title: 'w2', prompt: 'p2' },
        { agent: 'coder', title: 'w3', prompt: 'p3' }
    ];
    ok('…but two writers never share a wave in a workdir, unlimited or not',
        M.planWaves(writers, true, 0).length === 3);
}

// ---------- ‼️ the leash that hid inside the round ceiling ----------
// hardCallCap used to be `maxRounds + 6`, so a mission that asked for NO round
// ceiling would have been cut off after six planner calls — the tightest limit
// in the file, produced by the field that says "run as long as it takes".
function makeDeps(replies) {
    const calls = [];
    let t = 100000;
    return {
        calls,
        deps: {
            runPlanner: async (prompt, resumeSessionId) => {
                calls.push({ prompt, resumeSessionId });
                const r = replies.shift();
                if (!r) { return { ok: false, error: 'script exhausted' }; }
                return { ok: true, raw: JSON.stringify(r.raw), sessionId: 'sess-1', costUSD: 0.1 };
            },
            delegateWave: async (_run, steps) => {
                for (const s of steps) {
                    s.taskId = 'task-' + s.title; s.status = 'done';
                    s.costUSD = 0.2; s.outputFile = 'D:/out/' + s.title + '.md';
                }
            },
            readOutputBody: (file) => `output body of ${path.basename(file)}`,
            requestApproval: async () => true,
            askUser: async () => 'yes',
            onUpdate: () => { },
            now: () => (t += 1000)
        }
    };
}

(async () => {
    const replies = [];
    for (let i = 0; i < 12; i++) {
        replies.push({ raw: { action: 'delegate', tasks: [{ agent: 'coder', title: 'w' + i, prompt: 'p' + i }] } });
    }
    replies.push({ raw: { action: 'finish', verdict: 'success', summary: 'twelve rounds later' } });
    const { deps } = makeDeps(replies);
    const r = run();
    const limits = N({ maxRounds: 0, maxTasks: 0, maxCostUSD: 0, maxTokens: 0, maxMinutes: 0, maxParallel: 1 });
    await new M.MissionEngine(spec(limits), r, [{ name: 'coder' }], deps).execute();
    // 13 = twelve delegating rounds plus the finishing one; the old cap would
    // have ended this run at 6.
    ok('a mission with no round ceiling is not cut off after six planner calls',
        r.rounds.length === 13 && r.status === 'done');
    ok('…and it ends because the planner said so, not because a cap fired',
        r.result && r.result.summary === 'twelve rounds later');

    // ---------- the surfaces say it too ----------
    {
        const media = fs.readFileSync(path.join(__dirname, '..', 'media', 'missions.js'), 'utf8');
        ok('the form fields carry no maximum and offer 0',
            /min="0"/.test(media) && /0 = UNLIMITED on this axis/.test(media));
        ok('the limits row tells the reader whose ceilings these are',
            /0 on any field = unlimited/.test(media));
        ok('a ceiling of 0 is drawn as ∞, never as a spent budget',
            /const capN = /.test(media) && /const capUsd = /.test(media)
            && /capN\(sp\.limits\.maxRounds\)/.test(media));
        const tree = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'missionsTree.ts'), 'utf8');
        ok('the tree row reads R3/∞ rather than R3/0', /maxRounds > 0 \? String\(spec\.limits\.maxRounds\) : '∞'/.test(tree));
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
