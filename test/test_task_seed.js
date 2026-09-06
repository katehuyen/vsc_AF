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

// ---------- ‼️ X-221 — AND THE RETURN LEG, WHICH NOBODY WAS MEASURING -------
//
// The sweep above is one direction: a stored task comes back into the form. The
// bug it could never see is the other one — the form is drawn, the person picks
// an answer, the page posts it, and the HOST never reads the field. The box is
// alive, the value travels, and it is dropped one line before the store.
//
// That is not hypothetical. X-169 put an account box on this form, seeded it
// above, tested it against mock doors, and closed — while `task-new`, the retry
// branch and `dims()` all went on building their objects without ever reading
// `account`. Every task written from this page for four months billed whichever
// sign-in happened to be standing, and said nothing.
//
// So the rule is the mirror of the one above: **a dimension the form is seeded
// with is a dimension the form can be SAVED with**, on all three save paths. The
// list is `RunDimensions` again, read out of the source, so the next dimension
// somebody draws a box for fails this test until its wire is connected too.
{
    const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'tasksPanel.ts'), 'utf8');
    const src = fs.readFileSync(path.join(ROOT, 'src', 'core', 'tasks.ts'), 'utf8');
    const at = src.indexOf('export interface RunDimensions');
    const fields = [...src.slice(at, src.indexOf('\n}', at))
        .matchAll(/^ {4}([a-zA-Z][\w]*)\??:/gm)].map(m => m[1]);

    /** The object literal that starts at `anchor`, by brace balance. */
    const region = anchor => {
        const i = panel.indexOf(anchor);
        if (i < 0) { return ''; }
        let depth = 0;
        for (let j = i + anchor.length - 1; j < panel.length; j++) {
            if (panel[j] === '{') { depth++; }
            else if (panel[j] === '}') { depth--; if (!depth) { return panel.slice(i, j + 1); } }
        }
        return '';
    };
    // The three doors out of this one form. A run written now, a run written
    // again after a failure, and a run written for later — the last is the one
    // that matters most, because there is nobody at the window when it fires.
    const SAVES = [
        ['a new task', region('const task = m.addTask(agent, title, prompt, mode, {')],
        ['a retry', region('const copy = m.retryTask(original, prompt, {')],
        ['an automation', region('const dims = (): RunDimensions => ({')]
    ];
    for (const [what, body] of SAVES) {
        ok(`the save path for ${what} was found`,
            body.length > 200 && /\bpermissionMode\b/.test(body));
    }
    // A dimension counts as READ when the save names it — by its own name or by
    // the form's name for it (`projectId` is the `project` box, `retry` is the
    // `retryMode` box plus the numbers under it).
    const named = (body, f) =>
        new RegExp(`\\b${f}\\b`).test(body) || new RegExp(`\\b${DIMENSION_BOX[f]}\\b`).test(body);
    for (const [what, body] of SAVES) {
        eq(`‼️ every dimension the form seeds is read back when saving ${what}`,
            fields.filter(f => !named(body, f)), []);
    }
    // ‼️ And the one that was actually dropped, named on its own so the failure
    // says what it is rather than only that a list is not empty.
    for (const [what, body] of SAVES) {
        ok(`‼️ X-221 — the account reaches the store when saving ${what}`,
            /\baccount\b/.test(body));
    }

    // ‼️ X-222 — AND AN AUTOMATION IS REOPENED THE SAME WAY A TASK IS.
    //
    // `taskSeed` is swept above; the other two readings of a stored object were
    // never held to the same rule, so a schedule saved on the second account
    // drew an empty account box when it was edited — and saving that form wrote
    // the emptiness back over a decision somebody had made on purpose.
    const SEEDS = [
        ['a schedule', region('function scheduleSeed(s: FarmSchedule): Record<string, unknown> {')],
        ['a trigger', region('function triggerSeed(t: FarmTrigger, fallbackAgent: string): Record<string, unknown> {')]
    ];
    for (const [what, body] of SEEDS) {
        ok(`the reading of ${what} was found`,
            body.length > 200 && /\bpermissionMode\b/.test(body));
        eq(`‼️ every dimension comes back out of ${what} too`,
            fields.filter(f => !named(body, f)), []);
    }

    // ‼️ X-224 — AND A WORKFLOW STEP IS A RUN THAT CAN BE BILLED TO SOMEBODY.
    //
    // A chain is the shape that needs this most: three steps on one sign-in eat
    // one plan and hit the wall in the middle, and "step 1 plans on A, step 2
    // codes on B, step 3 writes up on the machine's own" is the whole reason a
    // step carries its own dimensions at all. `WorkflowStep extends
    // RunDimensions`, so the field has always been on the type and `runExtras`
    // has always carried it to the run — it was the step's own two readings
    // that could not say it.
    const stepBody = region('function stepSeed(s: WorkflowStep): Record<string, unknown> {');
    ok('the reading of a workflow step was found',
        stepBody.length > 200 && /\bsmodel\b/.test(stepBody));
    ok('‼️ X-224 — a step\'s stored account comes back into its card',
        /\bsaccount\b/.test(stepBody) && /\baccount\b/.test(stepBody));
    const built = P.stepFromDraft(
        {
            stype: 'agent', title: 'write it up', agent: 'dev', prompt: 'do the thing',
            smode: 'headless', saccount: 'personal', sengine: 'claude'
        },
        [{ id: 'dev', name: 'dev' }], 1);
    eq('‼️ X-224 — …and a card that names one produces a step that carries it',
        [built.error, built.step && built.step.account], [undefined, 'personal']);
    const bare = P.stepFromDraft(
        { stype: 'agent', title: 't', agent: 'dev', prompt: 'p', smode: 'headless' },
        [{ id: 'dev', name: 'dev' }], 1);
    eq('…and a card that names none states nothing, so the chain inherits',
        bare.step && bare.step.account, undefined);

    /**
     * ‼️ X-228 — AND THE REST OF WHAT RUNS A STEP, WHICH THE CARD COULD NOT SAY.
     *
     * `stepSeed` published `sengine`/`smodel`/`seffort`/`spermissionMode` and
     * `stepFromDraft` read them back, but the card drew no box for any of them —
     * a setting that survived every round trip and was invisible on the one page
     * that edits it. The route was not even seeded, so a chain step could not be
     * pointed at an endpoint from anywhere but the bridge.
     */
    ok('‼️ X-228 — a step\'s stored route and tier come back into its card too',
        /\bsproviderId\b/.test(stepBody) && /\bstier\b/.test(stepBody));
    const routed = P.stepFromDraft(
        {
            stype: 'agent', title: 'plan it', agent: 'dev', prompt: 'p', smode: 'headless',
            sengine: 'claude', smodel: 'opus', seffort: 'xhigh', spermissionMode: 'acceptEdits',
            sproviderId: 'kimi', stier: 'opus'
        },
        [{ id: 'dev', name: 'dev' }], 1);
    eq('‼️ X-228 — …and a card that names them produces a step that carries them',
        routed.step && [routed.step.engine, routed.step.model, routed.step.effort,
            routed.step.permissionMode, routed.step.providerId, routed.step.tier],
        ['claude', 'opus', 'xhigh', 'acceptEdits', 'kimi', 'opus']);
    // ‼️ A TIER WITHOUT A ROUTE IS DROPPED, which is the same refusal
    // `runExtras` makes one layer down: `opus` is a different model on every
    // route, so the word answers nothing until a route answers it.
    eq('…and a tier with no route under it is not stored at all',
        P.stepFromDraft(
            { stype: 'agent', title: 't', agent: 'dev', prompt: 'p', smode: 'headless', stier: 'opus' },
            [{ id: 'dev', name: 'dev' }], 1).step.tier, undefined);
}

Module._load = origLoad;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
