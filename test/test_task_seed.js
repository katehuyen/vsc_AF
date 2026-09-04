// M-32 — A SAVED TASK REOPENED IN THE FORM IS THE SAME TASK.
//
// ‼️ THE DEFECT, AND WHY IT KEPT COMING BACK. Every door that reopens a run —
// "like this one, but…", the retry form, a clone — draws the New-task form off
// ONE reading of the stored object (`taskSeed`). A dimension added to the form
// and to the store but not to that reading is invisible: the box draws its
// default, the person saves, and the default is written over what was there.
// Silently, and only for the fields nobody happened to look at.
//
// So the rule pinned here is not "rounds are seeded" (that is one symptom). It
// is: **every field of `RunDimensions` is a box on this form, so every one of
// them comes back out of the stored task.** `RunDimensions` is read out of the
// source, so the next dimension somebody adds fails this test until it is
// seeded — which is the only way this class of bug stops recurring.
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(`${n} (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));

const ROOT = path.resolve(__dirname, '..');

// Mock the vscode import so the compiled panel module loads in plain node.
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return {
            Uri: {}, window: {}, ViewColumn: {}, ConfigurationTarget: { Global: 1 }, env: {},
            EventEmitter: class { constructor() { this.event = () => ({ dispose() { } }); } },
            QuickPickItemKind: { Separator: -1 },
            commands: { executeCommand: () => { } },
            workspace: { getConfiguration: () => ({ get: (_k, d) => d, update: async () => { } }) }
        };
    }
    return origLoad.apply(this, arguments);
};

const P = require(path.join(ROOT, 'out', 'panels', 'tasksPanel.js'));

// ---------- the sweep: every run dimension comes back ----------------------
//
// The names on the left are `RunDimensions`; the names on the right are the
// form's own vocabulary for the same thing (the form is a flat set of boxes,
// the model is not). A dimension with no entry here is a dimension nobody
// decided about, and the test says so by name.
const DIMENSION_BOX = {
    engine: 'engine', model: 'model', effort: 'effort',
    permissionMode: 'permissionMode', cli: 'cli',
    // ‼️ X-106 — the route and the tier under it. The tier is its own box
    // rather than part of the route's, because `opus` is a different model on
    // two routes: folding them would make one stored value mean two things.
    providerId: 'providerId', tier: 'tier',
    // ‼️ X-169 — and WHOSE PLAN pays for it. Its own box rather than part of the
    // route's: a route is an endpoint and an account is a sign-in, and a run may
    // legitimately name either one alone.
    account: 'account',
    interactiveTarget: 'interactiveTarget', interactiveClose: 'interactiveClose',
    finishSound: 'finishSound', superpowers: 'superpowers',
    workDir: 'workDir', priority: 'priority',
    rounds: 'rounds', ignoreBudget: 'ignoreBudget', projectId: 'project',
    // The policy is three states and a dozen numbers, so its box is a MODE
    // plus the numbers under it (`retrySeed`) — pinned separately below.
    retry: 'retryMode'
};

{
    const src = fs.readFileSync(path.join(ROOT, 'src', 'core', 'tasks.ts'), 'utf8');
    const at = src.indexOf('export interface RunDimensions');
    const body = src.slice(at, src.indexOf('\n}', at));
    // Field lines only: `name?: type;` at one level of indentation.
    const fields = [...body.matchAll(/^ {4}([a-zA-Z][\w]*)\??:/gm)].map(m => m[1]);
    ok('RunDimensions was found and has fields', at > 0 && fields.length >= 10);
    eq('‼️ every run dimension has a box on the form, by name',
        fields.filter(f => !(f in DIMENSION_BOX)), []);

    const seeded = Object.keys(P.taskSeed({
        agentName: 'dev', title: 't', prompt: 'p', mode: 'headless'
    }));
    eq('‼️ …and the form\'s reading of a stored task produces every one of them',
        fields.map(f => DIMENSION_BOX[f]).filter(box => !seeded.includes(box)), []);
}

// ---------- and the round trip, on a task with every dimension set ---------
{
    const rounds = [{ prompt: 'and then this', delayMin: 5 }];
    const retry = { max: 4, delayMin: 15, backoff: 'double', when: 'any', prompt: 'try harder' };
    const seed = P.taskSeed({
        agentName: 'dev', title: 'nightly', prompt: 'do the thing', mode: 'headless',
        engine: 'codex', model: 'opus', effort: 'high', permissionMode: 'acceptEdits',
        cli: 'gemini', interactiveTarget: 'console', interactiveClose: 'auto-close',
        finishSound: 'chime', superpowers: false, projectId: 'prj_1', workDir: 'D:/x',
        priority: 3, ignoreBudget: true, rounds, retry,
        resumeSessionId: 'ses_abc', resumedEngine: 'opencode', resumedFrom: 'yesterday'
    });
    eq('the engine, the model and the effort come back',
        [seed.engine, seed.model, seed.effort], ['codex', 'opus', 'high']);
    eq('‼️ M-32 — the round chain comes back, whole', seed.rounds, rounds);
    eq('‼️ M-32 — and so does the conversation it was set to continue',
        [seed.conversation, seed.resumeSessionId], ['resume', 'ses_abc']);
    eq('a task that opens its own session says so',
        P.taskSeed({ agentName: 'a', title: 't', prompt: 'p', mode: 'headless' }).conversation, 'new');
    // ‼️ M-30 — three states, and the third is not `off`.
    eq('the discipline switch keeps its third state', seed.superpowers, 'off');
    eq('…and an unstated one is the agent\'s own answer, not "off"',
        P.taskSeed({ agentName: 'a', title: 't', prompt: 'p', mode: 'headless' }).superpowers, '');
    eq('the budget waiver and the priority come back', [seed.ignoreBudget, seed.priority], [true, 3]);
    eq('the project comes back on its own box', seed.project, 'prj_1');
}

// ---------- the retry policy's three states ------------------------------
//
// ‼️ M-3 — `{max: 0}` is "never retry this one" and an ABSENT policy is "follow
// my default". Collapsing them would turn every edit of an unconfigured run
// into a decision the user never made.
{
    eq('no policy reads as "use my default"', P.retrySeed(undefined), { retryMode: 'default' });
    eq('max 0 reads as "never", not as "default"', P.retrySeed({ max: 0 }), { retryMode: 'off' });
    const custom = P.retrySeed({ max: 4, delayMin: 15, backoff: 'double', when: 'any', prompt: 'x' });
    eq('a real policy comes back in full',
        [custom.retryMode, custom.retryMax, custom.retryDelayMin, custom.retryBackoff,
            custom.retryWhen, custom.retryPrompt],
        ['custom', 4, 15, 'double', 'any', 'x']);
    // ‼️ M-10 — the three "the strategy decides" boxes come back EMPTY, not as
    // plausible numbers: a value here is a decision, and seeding one would put
    // words in the mouth of a policy that never touched them.
    eq('…and the boxes it never touched come back empty',
        [custom.retryDelay2Min, custom.retryDelay3Min, custom.retryFormula, custom.retryCapMin],
        ['', '', '', '']);
}

Module._load = origLoad;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
