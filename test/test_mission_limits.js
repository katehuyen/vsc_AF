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

// ---------- ‼️ X-82: ONLY AN EXACT 0 LIFTS A CEILING ----------
// The normaliser read `n <= 0` through `Number(v)`, so null, false, "", a limit
// box the user CLEARED and every negative figure removed the ceiling as loudly
// as a typed zero. A malformed request must fall back to the DEFAULT, never to
// unbounded spend — and be refused by name before it gets this far.
{
    const FIELDS = ['maxRounds', 'maxTasks', 'maxCostUSD', 'maxTokens', 'maxMinutes', 'maxParallel'];
    ok('the six axes are one list, not six per-surface lists',
        Array.isArray(M.MISSION_LIMIT_FIELDS) && M.MISSION_LIMIT_FIELDS.join() === FIELDS.join());

    for (const junk of [null, false, true, '', '   ', -1, -0.5, 'soon', NaN, {}, []]) {
        const shown = typeof junk === 'string' ? `"${junk}"` : String(junk);
        const got = FIELDS.map(k => N({ [k]: junk })[k]);
        ok(`${shown} on any axis falls back to that axis's default, it does not remove the ceiling`,
            got.every((v, i) => v === M.DEFAULT_MISSION_LIMITS[FIELDS[i]]));
        // …and it never reaches the normaliser silently: the raw boundary names it.
        const bad = FIELDS.map(k => M.validateMissionLimitsInput({ [k]: junk }));
        ok(`…and the raw boundary refuses ${shown} on all six, by field name`,
            bad.every((errs, i) => errs.length === 1 && errs[0].includes(`"${FIELDS[i]}"`)));
    }
    ok('an OMITTED field is not a bad one — it asks for the default',
        M.validateMissionLimitsInput({ goal: 'g' }).length === 0);
    ok('undefined is omitted, whether the key is there or not',
        M.validateMissionLimitsInput({ maxCostUSD: undefined }).length === 0);
    ok('‼️ an exact 0 is accepted on every axis — that is how "no ceiling" is spelled',
        FIELDS.every(k => M.validateMissionLimitsInput({ [k]: 0 }).length === 0)
        && FIELDS.every(k => N({ [k]: 0 })[k] === 0));
    ok('…and so is the panel\'s "0", which arrives as a string from an HTML input',
        FIELDS.every(k => M.validateMissionLimitsInput({ [k]: '0' }).length === 0)
        && FIELDS.every(k => N({ [k]: '0' })[k] === 0));
    ok('a positive figure passes, as a number or as the form\'s string',
        M.validateMissionLimitsInput({ maxRounds: 40, maxCostUSD: '12.5' }).length === 0
        && N({ maxRounds: 40, maxCostUSD: '12.5' }).maxCostUSD === 12.5);
    ok('a figure larger than this build can count exactly is refused, not accepted blind',
        M.validateMissionLimitsInput({ maxTokens: 1e30 }).length === 1
        && N({ maxTokens: 1e30 }).maxTokens === 2000000);
    ok('every fault in one request is reported at once, not one per attempt',
        M.validateMissionLimitsInput({ maxRounds: -1, maxTasks: null, maxCostUSD: '' }).length === 3);
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
    // ‼️ X-82 — a negative figure used to mean the same thing. It does not: it is
    // a typo, and a typo must not be able to hand out an unlimited budget.
    ok('a negative figure is a typo, not a request for no ceiling',
        Object.values(N({
            maxRounds: -1, maxTasks: -5, maxCostUSD: -0.5,
            maxTokens: -1, maxMinutes: -60, maxParallel: -2
        })).every(v => v !== 0));
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
    replies.push({ raw: { action: 'finish', verdict: 'success', stopReason: 'criteria-satisfied', summary: 'twelve rounds later' } });
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

    // ---------- ‼️ X-46b: THE CEILING REACHES A WAVE THAT STOPPED ANSWERING ----------
    // Measured on a real run: one delegate sat 45+ minutes without answering, the
    // run went past its 50-minute ceiling, was still `running` at minute 70 and
    // had to be stopped by hand. Every limit was checked at the planner boundary,
    // which is the one moment a hung wave never reaches.
    {
        let cancelled = null;
        let releaseWave = null;
        let t = 0;
        const deps = {
            runPlanner: async () => ({
                ok: true,
                raw: JSON.stringify({
                    action: 'delegate',
                    tasks: [{ agent: 'coder', title: 'hangs', prompt: 'sit there and never answer' }]
                }),
                sessionId: 's', costUSD: 0.1
            }),
            // A delegate that never comes back on its own — it settles only when
            // something actually cancels it, which is the whole of the item.
            delegateWave: (_run, steps) => new Promise(res => {
                releaseWave = () => {
                    for (const st of steps) { st.status = 'cancelled'; st.costUSD = 0.2; }
                    res();
                };
            }),
            cancelWave: (_run, steps, reason) => { cancelled = { n: steps.length, reason }; releaseWave(); },
            waveGuardMs: 5,
            readOutputBody: () => '',
            requestApproval: async () => true,
            askUser: async () => 'yes',
            onUpdate: () => { },
            now: () => (t += 30_000)
        };
        const r = run();
        const limits = N({ maxRounds: 0, maxTasks: 0, maxCostUSD: 0, maxTokens: 0, maxMinutes: 10, maxParallel: 1 });
        await new M.MissionEngine(spec(limits), r, [{ name: 'coder' }], deps).execute();
        ok('a wave that stopped answering is cut by the wall clock', !!cancelled);
        ok('…and the cancel is ASKED FOR — the promise is never dropped on the floor',
            !!cancelled && cancelled.n === 1 && /time limit/.test(cancelled.reason || ''));
        ok('the run ends as a hard limit, not as a cancel somebody made',
            r.status === 'failed' && !!r.result
            && r.result.stopReason === 'hard-limit' && r.result.verdict === 'partial');
        ok('…and the run names the ceiling that cut it', /time limit/.test(r.note || ''));
        ok('the step says which ceiling stopped it, on the row the reader looks at',
            r.rounds[0].steps.some(st => /stopped by the mission ceiling/.test(st.note || '')));
    }

    // ---------- ‼️ X-82: THE SAME REFUSAL ON THE BRIDGE AND IN THE PANEL ----------
    // The form's `type="number" min="0"` is a convenience; `missions.start`
    // reaches the identical function with no HTML in front of it, so the guard
    // that matters is the one both go through. Shaped like the real handler.
    {
        const { BridgeRegistry, need } = require(path.join(__dirname, '..', 'out', 'core', 'bridge.js'));
        const reg = new BridgeRegistry();
        reg.register([{
            op: 'missions.start',
            describe: 'Start a mission. args: goal, maxCostUSD?, maxTokens?, …',
            handler: (args) => {
                const bad = [
                    ...M.validateMissionInput(args, { agentIds: ['a1'], engines: ['claude'] }),
                    ...M.validateMissionLimitsInput(args)
                ];
                need(!bad.length, 'This mission cannot start — ' + bad.join('; ') + '.');
                return { limits: N(args) };
            }
        }]);
        const cleared = await reg.dispatch('missions.start', { goal: 'g', maxCostUSD: '' });
        ok('‼️ a CLEARED limit box is refused, not read as an unlimited budget',
            !cleared.ok && /"maxCostUSD" was left blank/.test(cleared.error));
        const nulled = await reg.dispatch('missions.start', { goal: 'g', maxTokens: null });
        ok('…a null from a script is refused, not read as no token ceiling',
            !nulled.ok && /"maxTokens" was sent as null/.test(nulled.error));
        const neg = await reg.dispatch('missions.start', { goal: 'g', maxMinutes: -60 });
        ok('…a negative figure is refused, not read as no time limit',
            !neg.ok && /"maxMinutes" is negative/.test(neg.error));
        const bool = await reg.dispatch('missions.start', { goal: 'g', maxRounds: false });
        ok('…and a false, which coerced to 0 and removed the round ceiling',
            !bool.ok && /"maxRounds" was sent as a true\/false/.test(bool.error));
        const zero = await reg.dispatch('missions.start', { goal: 'g', maxCostUSD: 0, maxTokens: 0 });
        ok('‼️ while an EXPLICIT 0 still lifts the ceiling — the decision survives',
            zero.ok && zero.result.limits.maxCostUSD === 0 && zero.result.limits.maxTokens === 0);
        const plain = await reg.dispatch('missions.start', { goal: 'g' });
        ok('…and a start that names no ceiling at all gets the documented defaults',
            plain.ok && plain.result.limits.maxCostUSD === 5 && plain.result.limits.maxRounds === 8);

        // …and the real create path runs it in the ORDER that makes it a guard:
        // after the normaliser it would only ever judge the normaliser's output.
        const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        const at = ext.indexOf('const createMission = ');
        const create = ext.slice(at, at + 12000);
        ok('‼️ createMission judges the raw ceilings before it normalises them',
            create.indexOf('validateMissionLimitsInput(') > 0
            && create.indexOf('validateMissionLimitsInput(') < create.indexOf('normalizeMissionLimits('));
    }

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
        const core = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'missions.ts'), 'utf8');
        ok('‼️ every wave in the engine is measured while it is still flying',
            (core.split('await deps.delegateWave(').length - 1) === 1
            && /private async runWave\(/.test(core));
        const tree = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'missionsTree.ts'), 'utf8');
        ok('the tree row reads R3/∞ rather than R3/0', /maxRounds > 0 \? String\(spec\.limits\.maxRounds\) : '∞'/.test(tree));
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
