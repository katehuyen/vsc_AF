// M-14 — the concurrency governor counts WEIGHT, not runs.
//
// Counting runs assumes every run costs the same machine. Measured 2026-08-16,
// twice, with `tools/measure_opencode_run.js`: one `opencode run --format json`
// peaks at 615 MB and 596 MB working set over its own process tree — heavier
// than the shared ACP server (383 MB), which at least serves every hosted card
// at once. Two of those together is 1.2 GB of transient memory on a machine
// that has none spare, and the flat count started them both without a word.
//
// ‼️ The rule these tests hold is as much about RESTRAINT as about the limit:
// only an engine somebody has actually weighed carries a number, so every other
// engine behaves exactly as it did before.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => ok(n + (JSON.stringify(a) === JSON.stringify(b) ? '' :
    `: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`), JSON.stringify(a) === JSON.stringify(b));

const Module = require('module');
const origLoad = Module._load;
Module._load = function (r) {
    if (r === 'vscode') {
        return {
            Uri: {}, window: {},
            EventEmitter: class { get event() { return () => ({ dispose() { } }); } fire() { } },
            workspace: { getConfiguration: () => ({ get: (_k, d) => d }) },
            ViewColumn: {}, ConfigurationTarget: {}, env: {}
        };
    }
    return origLoad.apply(this, arguments);
};
const E = require(path.join(__dirname, '..', 'out', 'core', 'engines.js'));
Module._load = origLoad;

// ---------- the weight itself ----------
{
    eq('‼️ the one engine that was measured carries its measurement',
        E.engineConcurrencyWeight('opencode'), 2);
    for (const id of ['claude', 'codex', 'gemini', 'agy']) {
        eq(`${id} is one slot — nobody has weighed it and nothing is claimed`,
            E.engineConcurrencyWeight(id), 1);
    }
    eq('an absent engine is Claude, and Claude is one slot',
        [E.engineConcurrencyWeight(undefined), E.engineConcurrencyWeight('')], [1, 1]);
    eq('an engine this build has never heard of is one slot, not zero',
        E.engineConcurrencyWeight('something-new'), 1);
}

// ---------- the governor, as `launchBlock` applies it ----------
// The gate is private, so the arithmetic it performs is stated here against the
// same helper it uses. What is being held is the DECISION, not the plumbing:
// a task may start when the weight already running plus its own fits the limit.
{
    const fits = (running, engine, max) =>
        running.reduce((s, e) => s + E.engineConcurrencyWeight(e), 0)
        + E.engineConcurrencyWeight(engine) <= max;

    ok('with the default limit of 2, two ordinary runs still fit',
        fits(['claude'], 'codex', 2));
    ok('…and a third does not, exactly as before',
        !fits(['claude', 'codex'], 'agy', 2));

    ok('‼️ ONE OpenCode run fills the default fleet allowance on its own',
        fits([], 'opencode', 2) && !fits(['opencode'], 'claude', 2));
    ok('…so two OpenCode runs never start together',
        !fits(['opencode'], 'opencode', 2));
    ok('…and one cannot squeeze in beside an ordinary run either',
        !fits(['claude'], 'opencode', 2));

    // The weight scales with the user's own setting; it does not overrule it.
    ok('a user who raises the limit to 4 gets two OpenCode runs',
        fits(['opencode'], 'opencode', 4));
    ok('…and still not three', !fits(['opencode', 'opencode'], 'opencode', 4));
}

// ---------- the code says what it did, where a reader will look ----------
{
    const fs = require('fs');
    const engines = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'engines.ts'), 'utf8');
    const tasks = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'tasks.ts'), 'utf8');
    ok('‼️ the number is written down beside the measurement that justifies it',
        /615 MB and 596 MB/.test(engines) && /measure_opencode_run\.js/.test(engines));
    ok('…including the wrong measurement it replaced, so nobody repeats it',
        /175 MB/.test(engines) || /Chrome/.test(engines));
    ok('the governor reads the weight rather than counting rows',
        /runningWeight\(\)/.test(tasks) && /engineConcurrencyWeight\(t\.engine\)/.test(tasks));
    ok('…and the asking run\'s own weight is part of the sum',
        /this\.runningWeight\(\) \+ mine > maxGlobal/.test(tasks));
    ok('the PER-AGENT limit stays a plain count, and says why',
        // S-129: the rows counted are the agent's running rows that hold this one (relaySeat.ts) — still rows, never weight
        /seatHolders\(task, this\.tasks\.filter\(t => t\.status === 'running' && t\.agentId === task\.agentId\)\)/.test(tasks)
        && /holders\.length >= maxAgent/.test(tasks)
        && /not about memory/.test(tasks));
    ok('the hold sentence explains a number the user cannot see',
        /slots, \$\{this\.runningWeight\(\)\} in use/.test(tasks));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
