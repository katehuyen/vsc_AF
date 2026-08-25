// X-46 — THE RELEASE GATE'S TWO REAL RUNS. Adaptive Missions, end to end,
// against a real CLI and a real filesystem — not a fixture, not a stubbed
// planner.
//
// Every other mission test drives the engine with a scripted planner: they
// prove the engine does what it is told, which is the only way to test a
// hundred branches, and they cannot prove the one thing this file is for —
// that a real model, given the real prompts this engine writes, answers in a
// shape the engine can actually read, and that an objective reaches its
// criteria because the WORK was done rather than because a fixture said so.
//
// ‼️ DISPOSABLE. Everything is built in a fresh temp folder and nothing here
// touches the user's sessions, tasks, projects or mission store. The two runs
// are the ones X-46 names:
//
//   1. a small objective finishes on its criteria without opening a council —
//      the case where the machinery must NOT fire;
//   2. work that FAILS, after which the lead changes its approach and has a
//      second agent check the result — strategy v2 and an independent reader.
//
// ‼️ COSTS REAL MONEY. haiku at the lowest effort, hard ceilings on rounds,
// tasks, cost and minutes, and both runs are bounded by the spec's own limits
// rather than by hope.
//
// Run: node test/smoke_mission_adaptive.mjs [--only 1|2]
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const out = (...p) => path.join(process.cwd(), 'out', ...p);
const M = require(out('core', 'missions.js'));

const MODEL = 'claude-haiku-4-5-20251001';
const EFFORT = 'low';
const only = (() => {
    const i = process.argv.indexOf('--only');
    return i >= 0 ? String(process.argv[i + 1] || '') : '';
})();

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
    if (cond) { pass++; console.log(`✅ ${label}`); }
    else { fail++; console.log(`❌ ${label}`); }
    if (detail) { console.log(`   ${String(detail).slice(0, 300).replace(/\s+/g, ' ')}`); }
};

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-mission-smoke-'));
console.log(`workspace: ${root}\n`);

/**
 * One headless call, the way the extension makes them: the prompt goes in on
 * stdin (a briefing is multi-line and the Windows shell would eat it) and the
 * envelope comes back as one JSON object.
 */
function claudeCall(prompt, opts = {}) {
    const args = [
        '--model', MODEL, '--effort', EFFORT,
        ...(opts.resume ? ['--resume', opts.resume] : []),
        ...(opts.disallow ? ['--disallowedTools', opts.disallow] : []),
        '--max-turns', String(opts.maxTurns ?? 20),
        '-p', '--output-format', 'json'
    ];
    return new Promise(resolve => {
        const child = cp.spawn('claude', args, {
            shell: true, windowsHide: true, cwd: opts.cwd ?? root,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        let stdout = '';
        const timer = setTimeout(() => {
            try {
                if (process.platform === 'win32' && child.pid) {
                    cp.execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => { });
                } else { child.kill(); }
            } catch { /* already gone */ }
        }, opts.timeoutMs ?? 5 * 60000);
        child.stdout.on('data', d => { stdout += d; });
        child.on('error', e => { clearTimeout(timer); resolve({ ok: false, error: String(e) }); });
        child.on('close', () => {
            clearTimeout(timer);
            let env;
            try { env = JSON.parse(stdout); } catch { /* not one object */ }
            if (!env) { return resolve({ ok: false, error: 'unreadable envelope', raw: stdout.slice(0, 400) }); }
            resolve({
                ok: !env.is_error,
                raw: typeof env.result === 'string' ? env.result : JSON.stringify(env.result ?? ''),
                sessionId: env.session_id,
                costUSD: Number(env.total_cost_usd ?? 0) || 0,
                tokens: Number(env.usage?.input_tokens ?? 0) + Number(env.usage?.output_tokens ?? 0),
                error: env.is_error ? String(env.result ?? 'error').slice(0, 200) : undefined
            });
        });
        child.stdin.write(prompt);
        child.stdin.end();
    });
}

/**
 * The deps a run needs, wired to the real CLI and the real disk.
 *
 * ‼️ The planner is the SAME shape the extension gives it — a call that returns
 * the model's own reply text and lets the engine do the parsing. Nothing here
 * interprets the answer, because the point of the exercise is whether the
 * engine's own reader can.
 */
function realDeps(workdir, spend) {
    return {
        runPlanner: async (prompt, resume) => {
            const r = await claudeCall(prompt, {
                cwd: workdir, resume,
                // the same fence the extension puts around a planner: it decides,
                // it does not do the work itself
                disallow: 'Write,Edit,MultiEdit,NotebookEdit,Task,Bash',
                maxTurns: 12, timeoutMs: 4 * 60000
            });
            spend.planner += r.costUSD ?? 0;
            return r;
        },
        delegateWave: async (run, steps) => {
            for (const step of steps) {
                const file = path.join(workdir, `.out-${step.id}.md`);
                const r = await claudeCall(step.prompt, { cwd: workdir, maxTurns: 30, timeoutMs: 5 * 60000 });
                spend.delegates += r.costUSD ?? 0;
                fs.writeFileSync(file, r.raw ?? '', 'utf8');
                step.taskId = 't-' + step.id;
                step.runSessionId = r.sessionId;
                step.costUSD = r.costUSD ?? 0;
                step.tokens = r.tokens ?? 0;
                step.outputFile = file;
                step.status = r.ok ? 'done' : 'failed';
                if (!r.ok) { step.note = r.error ?? 'the delegate exited with an error'; }
            }
        },
        readOutputBody: file => {
            try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
        },
        // Autonomy is the point of an objective: nobody is sitting here.
        requestApproval: async () => true,
        askUser: async () => undefined,
        onUpdate: () => { },
        trace: (type, payload) => { spend.events.push({ type, ...(payload ?? {}) }); },
        // The clock the ceilings are measured against — real here, because the
        // wall clock is one of the ceilings this run has to respect.
        now: () => Date.now()
    };
}

const LIMITS = {
    maxRounds: 4, maxTasks: 6, maxCostUSD: 1.5,
    maxTokens: 400000, maxMinutes: 12, maxParallel: 1
};

const POOL = [
    { agentId: 'a1', agentName: 'worker', role: 'does the work' },
    { agentId: 'a2', agentName: 'reader', role: 'checks the work independently' }
];

async function drive(spec, workdir) {
    const run = {
        id: spec.id + '-run', specId: spec.id, status: 'running',
        rounds: [], ledger: [], totalCostUSD: 0, startedAt: Date.now()
    };
    const spend = { planner: 0, delegates: 0, events: [] };
    const engine = new M.MissionEngine(spec, run, [], realDeps(workdir, spend));
    await engine.execute();
    return { run, spend };
}

// ============================================================ RUN 1
// A small objective that is reached, and a council that must not open. The
// work is real and checkable from outside the model: a file has to exist in
// the workdir with the right number in it.
if (!only || only === '1') {
    console.log('== 1. a small objective finishes on its criteria, no council ==\n');
    const dir = path.join(root, 'run1');
    fs.mkdirSync(dir, { recursive: true });
    // ‼️ UNAMBIGUOUS ON PURPOSE. The first version asked for a LINE count of a
    // file ending in a newline, and the model answered 5 where the criterion
    // said 4 — both readings defensible, so the run failed on the fixture's own
    // wording rather than on the product. A column of numbers has one sum.
    fs.writeFileSync(path.join(dir, 'data.txt'),
        'alpha,12\nbeta,30\ngamma,7\ndelta,51\n', 'utf8');

    const spec = {
        id: 'sm1', title: 'count the lines', leadAgentId: 'lead', leadAgentName: 'lead',
        team: [], mode: 'adaptive',
        goal: 'data.txt holds one record per line as name,amount. Write total.txt in the working '
            + 'folder containing nothing but the sum of the amount column — digits only, no words, '
            + 'no currency sign, no trailing text.',
        successCriteria: [
            { id: 'c1', text: 'total.txt exists in the working folder', required: true },
            { id: 'c2', text: 'total.txt contains 100 and nothing else', required: true }
        ],
        constraints: ['Do not modify data.txt.'],
        pool: POOL, autonomy: 'autonomous', workdir: dir,
        limits: LIMITS, approvalMode: 'auto', createdAt: Date.now()
    };

    const { run, spend } = await drive(spec, dir);
    const wrote = path.join(dir, 'total.txt');
    const body = fs.existsSync(wrote) ? fs.readFileSync(wrote, 'utf8').trim() : '(not written)';
    const spent = run.rounds.filter(r => (r.steps ?? []).length).length;

    console.log(`\nverdict=${run.result?.verdict} rounds=${run.rounds.length} (${spent} delegating) `
        + `cost=$${(spend.planner + spend.delegates).toFixed(4)} total.txt=${JSON.stringify(body)}\n`);

    check('the objective ended, and with a verdict rather than a crash',
        !!run.result?.verdict, run.result?.summary);
    // ‼️ THE WORK IS CHECKED FROM OUTSIDE THE MODEL. A run that says "success"
    // while the file is not there is exactly the failure this gate exists for.
    check('‼️ the work really happened — the file is on disk with the right number in it',
        body === '100', body);
    check('the run reached a success verdict', run.result?.verdict === 'success', run.result?.stopReason);
    check('‼️ every required criterion carries a pass with evidence behind it',
        spec.successCriteria.filter(c => c.required).every(c =>
            (run.evaluations ?? []).some(e =>
                (e.findings ?? []).some(v => v.criterionId === c.id && v.verdict === 'pass'))),
        JSON.stringify((run.evaluations ?? []).at(-1)?.findings ?? []));
    check('‼️ no council was opened — the machinery stays out of a job this small',
        !(run.councils ?? []).length);
    // ‼️ THE ROUND CEILING IS AN ALLOCATION, AND A RUN THAT REACHES ONE STILL
    // GETS TO END HONESTLY. When a ceiling fires the lead is handed one last,
    // finish-only decision; that round delegates nothing, so counting round
    // RECORDS against maxRounds reads an honest ending as an overrun. What the
    // ceiling bounds is the rounds that actually spent something.
    check('it stayed inside its own ceilings',
        spent <= LIMITS.maxRounds && (spend.planner + spend.delegates) <= LIMITS.maxCostUSD,
        `delegating=${spent}/${LIMITS.maxRounds} records=${run.rounds.length} `
        + `cost=${(spend.planner + spend.delegates).toFixed(4)}/${LIMITS.maxCostUSD}`);
    check('the journal recorded the run\'s own ending',
        spend.events.some(e => e.type === 'run.finished'));
}

// ============================================================ RUN 2
// Work that CANNOT succeed as first attempted, so the lead has to change its
// approach — and a second agent has to read the result rather than the first
// one marking its own homework.
if (!only || only === '2') {
    console.log('\n== 2. a failure, a change of approach, an independent reader ==\n');
    const dir = path.join(root, 'run2');
    fs.mkdirSync(dir, { recursive: true });
    // The trap: the obvious route is named and is a dead end. A lead that only
    // repeats itself never gets past this; one that revises does.
    fs.writeFileSync(path.join(dir, 'README.md'),
        'The totals live in totals.csv.\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'ledger.txt'),
        'sale 10\nsale 25\nrefund 5\nsale 7\n', 'utf8');

    const spec = {
        id: 'sm2', title: 'the total, from whatever is really there',
        leadAgentId: 'lead', leadAgentName: 'lead', team: [], mode: 'adaptive',
        // ‼️ THE TRAP IS NOT DISCLOSED. The first version of this goal SAID that
        // totals.csv was missing and that another approach would be needed — so
        // the lead planned around the obstacle in its very first strategy and
        // never had to revise anything. It behaved well and proved nothing: a
        // stated obstacle is not a dead end. The README is left to mislead it,
        // exactly as a real repository's stale documentation would.
        goal: 'Follow the README and write total.txt in the working folder containing the net '
            + 'total of the sales ledger — sales minus refunds, digits only.',
        successCriteria: [
            { id: 'c1', text: 'total.txt exists and contains 37', required: true },
            { id: 'c2', text: 'the figure was checked by an agent that did not compute it', required: true }
        ],
        constraints: ['Do not create totals.csv — work with what is actually on disk.'],
        pool: POOL, autonomy: 'autonomous', workdir: dir,
        limits: LIMITS, approvalMode: 'auto', createdAt: Date.now()
    };

    const { run, spend } = await drive(spec, dir);
    const wrote = path.join(dir, 'total.txt');
    const body = fs.existsSync(wrote) ? fs.readFileSync(wrote, 'utf8').trim() : '(not written)';
    const agentsWhoWorked = new Set(run.rounds.flatMap(r => r.steps.map(s => s.agentName)));

    console.log(`\nverdict=${run.result?.verdict} rounds=${run.rounds.length} `
        + `strategy=v${run.strategy?.version ?? 0} agents=${[...agentsWhoWorked].join(',')} `
        + `cost=$${(spend.planner + spend.delegates).toFixed(4)} total.txt=${JSON.stringify(body)}\n`);

    check('the objective ended with a verdict', !!run.result?.verdict, run.result?.summary);
    check('it did not claim success it had not reached',
        run.result?.verdict !== 'success' || body === '37', body);
    // ‼️ THE POINT OF THE RUN. A lead that answers a dead end by ordering the
    // same thing again is not adaptive; the record has to show it changed.
    check('‼️ the approach was REVISED rather than repeated — strategy reached v2',
        (run.strategy?.version ?? 1) >= 2, run.strategy?.text);
    check('‼️ more than one agent was put to work — somebody other than the author read it',
        agentsWhoWorked.size >= 2, [...agentsWhoWorked].join(', '));
    check('an evaluation was recorded, not just activity',
        (run.evaluations ?? []).length >= 1);
    check('‼️ a criterion it did not reach is NAMED rather than hedged in prose',
        run.result?.verdict === 'success'
        || (run.result?.unmet ?? []).length >= 1 || !!run.result?.stopReason,
        JSON.stringify(run.result?.unmet ?? run.result?.stopReason ?? ''));
    check('the journal recorded a strategy revision',
        spend.events.some(e => e.type === 'strategy.changed'),
        [...new Set(spend.events.map(e => e.type))].join(' '));
}

console.log(`\n${pass} passed, ${fail} failed`);
console.log(`disposable workspace left at ${root} — delete it when you have read it`);
process.exit(fail ? 1 : 0);
