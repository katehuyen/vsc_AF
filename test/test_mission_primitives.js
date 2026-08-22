// ‼️ M-18 (X-32) — WHAT A LEAD CAN DO IS A LIST, NOT THREE FILES THAT AGREE.
//
// Every primitive used to cost three edits that had to match: a line in the
// prompt schema, an arm in the parser, a branch in the engine. Nothing checked
// that they matched — a primitive advertised but unparsed, or parsed but never
// executed, looks exactly like a working one until a run reaches it. So the
// list is data now, and these are the properties that make it worth being data:
//
//   * the MENU the lead is shown, the set the PARSER accepts and the set named
//     in the "unknown action" error are one list, filtered by mode;
//   * a classic run does not move by one character — its menu, its errors and
//     its behaviour are what they were before the registry existed;
//   * `review`, `compare` and `revise` are TYPED TASK INTENTS, not executors:
//     each becomes one ordinary delegation on the ordinary wave path, and the
//     ENGINE attaches the real output of the ids named, so a lead cannot hand a
//     delegate a paraphrase of work that was never produced;
//   * a `revise` inherits the criteria of what it revises — otherwise fixing an
//     artefact would leave the old pass looking current, which is the exact
//     hole M-17's staleness rule was built to close;
//   * `parallel` is a CLAIM the engine may refuse out loud. The one-writer rule
//     is not negotiable, and a lead whose claim was silently serialised would
//     believe a timing it never got.
'use strict';
const path = require('path');
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return { Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) } };
    }
    return origLoad.apply(this, arguments);
};
const M = require(path.join(__dirname, '..', 'out', 'core', 'missions.js'));
Module._load = origLoad;

let pass = 0, fail = 0;
const ok = (msg, cond) => { if (cond) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg); } };
const eq = (msg, got, want) => ok(msg + (got === want ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`), got === want);

const CRITERIA = [
    { id: 'c1', text: 'the page renders', required: true },
    { id: 'c2', text: 'the copy is short', required: false }
];
const LIMITS = { maxRounds: 8, maxTasks: 12, maxCostUSD: 5, maxTokens: 0, maxMinutes: 120, maxParallel: 3 };
const spec = (over = {}) => ({
    id: 'm', title: 'objective', goal: 'the page works',
    leadAgentId: 'lead', leadAgentName: 'Lead', mode: 'adaptive', team: [],
    pool: [{ agentId: 'a1', agentName: 'Ada' }, { agentId: 'a2', agentName: 'Rev' }],
    constraints: [], successCriteria: CRITERIA, autonomy: 'ask-when-unsure',
    limits: { ...LIMITS }, approvalMode: 'auto', createdAt: 1, ...over
});
const classicSpec = (over = {}) => ({
    id: 'm', title: 'mission', goal: 'ship it',
    leadAgentId: 'lead', leadAgentName: 'Lead', team: [{ agentId: 'a1', agentName: 'Ada' }],
    limits: { ...LIMITS }, approvalMode: 'auto', createdAt: 1, ...over
});
const newRun = (id = 'r') => ({
    id, specId: 'm', status: 'running', rounds: [], ledger: [], totalCostUSD: 0, startedAt: 0
});
const reflect = (over = {}) => ({
    rationale: 'r', currentPhase: 'p', strategy: 'build then check', basedOn: [], ...over
});

function scripted(replies) {
    let i = 0;
    const prompts = [];
    return {
        prompts,
        calls: () => i,
        runPlanner: async (prompt) => {
            prompts.push(prompt);
            const r = replies[Math.min(i, replies.length - 1)];
            i++;
            return { ok: true, costUSD: 0, tokens: 0, raw: typeof r === 'string' ? r : JSON.stringify(r) };
        }
    };
}

/** `outputs` maps an agent name to the body its work produced. */
function deps(planner, outputs = {}, over = {}) {
    const seen = [];
    const waves = [];
    let clock = 100;
    const trace = (type, payload) => seen.push({ type, ...payload });
    const bodies = {};
    return {
        seen, waves,
        d: {
            runPlanner: planner.runPlanner,
            delegateWave: async (_run, steps) => {
                waves.push(steps.map(s => s.title));
                for (const s of steps) {
                    trace('action.started', { actionId: s.id, kind: 'task', refId: 't-' + s.id });
                    s.status = 'done';
                    if (outputs[s.agentName] !== undefined) {
                        s.outputFile = '/out/' + s.id;
                        bodies[s.outputFile] = outputs[s.agentName];
                    }
                    trace('action.settled', { actionId: s.id, kind: 'task', outcome: 'done', refId: 't-' + s.id });
                }
            },
            readOutputBody: (f) => bodies[f] ?? '',
            requestApproval: async () => true,
            askUser: async () => 'ok',
            onUpdate: () => { },
            trace,
            now: () => clock++,
            ...over
        }
    };
}

const FINISH = { ...reflect(), thought: 'done', action: 'finish', verdict: 'partial', summary: 'as far as it goes', stopReason: 'sufficient-evidence' };
const run1 = () => ({ ...reflect(), thought: 'write', action: 'delegate', tasks: [{ agent: 'Ada', title: 'draft the page', prompt: 'write it', criteria: ['c1'] }] });

// ============================================ 1. the registry itself
{
    console.log('\n-- the list, and what it is filtered by');
    const classic = M.primitivesFor(false).map(p => p.name);
    const adaptive = M.primitivesFor(true).map(p => p.name);
    eq('‼️ a classic lead sees exactly what it always saw',
        classic.join(' | '), 'delegate | finish | ask_user | abort');
    eq('and the menu string is generated from that same list',
        M.primitiveMenu(false), 'delegate | finish | ask_user | abort');
    ok('an objective sees the whole set',
        ['delegate', 'parallel', 'review', 'compare', 'revise', 'evaluate', 'run_workflow', 'run_mission', 'message', 'council', 'replan', 'finish', 'ask_user', 'abort']
            .every(n => adaptive.includes(n)));
    ok('…and nothing else', adaptive.length === 14);
    ok('every classic primitive is in the adaptive set too',
        classic.every(n => adaptive.includes(n)));

    console.log('\n-- lookup answers "is that an action" and "may you use it" at once');
    ok('a shared primitive resolves in both modes',
        !!M.primitiveFor('delegate', false) && !!M.primitiveFor('delegate', true));
    ok('‼️ an adaptive-only one does NOT resolve for a classic lead',
        M.primitiveFor('revise', false) === undefined && !!M.primitiveFor('revise', true));
    ok('an invented one resolves nowhere', M.primitiveFor('summon', true) === undefined);
    ok('but the metadata is still readable off-mode, for surfaces reading a recorded run',
        M.primitiveNamed('revise')?.name === 'revise');

    console.log('\n-- every primitive declares what the engine does with it');
    const byName = Object.fromEntries(M.PRIMITIVES.map(p => [p.name, p]));
    eq('delegate is work', byName.delegate.shape, 'work');
    eq('replan records and asks again', byName.replan.shape, 'plan');
    eq('ask_user waits for a person', byName.ask_user.shape, 'human');
    eq('finish ends the run', byName.finish.shape, 'terminal');
    ok('‼️ every primitive becomes a REAL kind of work, never a new one',
        M.PRIMITIVES.every(p => ['task', 'workflow', 'mission', 'conversation'].includes(p.kind)));
    ok('and every one has a line a person can read',
        M.PRIMITIVES.every(p => typeof p.describe === 'string' && p.describe.length > 20));
    ok('the three typed intents are the ones carrying an intent contract',
        M.PRIMITIVES.filter(p => p.intent).map(p => p.name).join(',') === 'review,compare,revise');
    eq('compare is the one that needs two things to weigh', byName.compare.intent.minTargets, 2);
    ok('review and compare do not write; revise does',
        byName.review.intent.readonly && byName.compare.intent.readonly && !byName.revise.intent.readonly);
}

// ============================================ 2. the parser dispatches through it
{
    console.log('\n-- the unknown-action error names the same set the lead was offered');
    const c = M.parsePlannerDecision('{"action":"revise","thought":"t"}', classicSpec());
    ok('‼️ a classic lead inventing an adaptive action gets the classic menu, unchanged',
        !c.ok && c.error === 'unknown "action": "revise" (use delegate | finish | ask_user | abort)');
    const c2 = M.parsePlannerDecision('{"action":"replan","thought":"t"}', classicSpec());
    ok('…and so does the M-16 case that was already measured',
        !c2.ok && c2.error === 'unknown "action": "replan" (use delegate | finish | ask_user | abort)');
    const a = M.parseAdaptiveDecision(JSON.stringify({ ...reflect(), action: 'summon' }), spec());
    ok('an objective gets the full menu, including the ones added since',
        !a.ok && /use delegate \| parallel \| review \| compare \| revise \| evaluate \| run_workflow \| run_mission \| message \| council \| replan \| finish \| ask_user \| abort/.test(a.error));
    ok('‼️ and "evaluate" is in it — the hand-written list had forgotten it',
        !a.ok && /evaluate/.test(a.error));

    console.log('\n-- parallel parses as delegate does, and says which it was');
    const tasks = [{ agent: 'Ada', title: 't1', prompt: 'p1', readonly: true }, { agent: 'Rev', title: 't2', prompt: 'p2', readonly: true }];
    const p = M.parseAdaptiveDecision(JSON.stringify({ ...reflect(), action: 'parallel', tasks }), spec());
    ok('it parses', p.ok && p.decision.action === 'parallel');
    eq('with the same task contract', p.decision.tasks.length, 2);
    const bad = M.parseAdaptiveDecision(JSON.stringify({ ...reflect(), action: 'parallel', tasks: [] }), spec());
    ok('an empty one is refused in its own name', !bad.ok && /"parallel" needs a non-empty "tasks" array/.test(bad.error));
    const badAgent = M.parseAdaptiveDecision(JSON.stringify({ ...reflect(), action: 'parallel', tasks: [{ agent: 'Nobody', title: 't', prompt: 'p' }] }), spec());
    ok('and the roster rule is the shared one', !badAgent.ok && /unknown agent "Nobody"/.test(badAgent.error));

    console.log('\n-- a typed intent names ids, an agent and what it wants');
    const rev = M.parseAdaptiveDecision(JSON.stringify({
        ...reflect(), action: 'revise', agent: 'Ada', targets: ['s1'], ask: 'the footer is missing'
    }), spec());
    ok('a well-formed revise parses', rev.ok && rev.decision.action === 'revise');
    eq('with its agent resolved to the pool spelling', rev.decision.agent, 'Ada');
    const noAgent = M.parseAdaptiveDecision(JSON.stringify({ ...reflect(), action: 'review', targets: ['s1'], ask: 'look' }), spec());
    ok('no agent → refused, with the pool named', !noAgent.ok && /"review" needs an "agent" from the pool — the pool is: Ada, Rev/.test(noAgent.error));
    const noTargets = M.parseAdaptiveDecision(JSON.stringify({ ...reflect(), action: 'review', agent: 'Rev', targets: [], ask: 'look' }), spec());
    ok('‼️ no targets → refused: an intent with nothing to work on is a delegation pretending',
        !noTargets.ok && /needs at least 1 result id/.test(noTargets.error));
    const oneForCompare = M.parseAdaptiveDecision(JSON.stringify({ ...reflect(), action: 'compare', agent: 'Rev', targets: ['s1'], ask: 'which' }), spec());
    ok('compare with one target → refused: there is nothing to weigh it against',
        !oneForCompare.ok && /needs at least 2 result id/.test(oneForCompare.error));
    const noAsk = M.parseAdaptiveDecision(JSON.stringify({ ...reflect(), action: 'revise', agent: 'Ada', targets: ['s1'] }), spec());
    ok('‼️ a revise with no gap named → refused: "fix it" is not a gap',
        !noAsk.ok && /"revise" needs an "ask"/.test(noAsk.error));
    const reviewNoAsk = M.parseAdaptiveDecision(JSON.stringify({ ...reflect(), action: 'review', agent: 'Rev', targets: ['s1'] }), spec());
    ok('…but a review may be open-ended — "look at this" is a real request', reviewNoAsk.ok);
    const badCrit = M.parseAdaptiveDecision(JSON.stringify({
        ...reflect(), action: 'revise', agent: 'Ada', targets: ['s1'], ask: 'fix', criteria: ['c9']
    }), spec());
    ok('an invented criterion is refused by name here too', !badCrit.ok && /unknown criterion "c9"/.test(badCrit.error));

    console.log('\n-- run_workflow names a chain; the ENGINE decides whether it exists');
    const wf = M.parseAdaptiveDecision(JSON.stringify({ ...reflect(), action: 'run_workflow', workflow: 'Nightly build' }), spec());
    ok('a named chain parses', wf.ok && wf.decision.workflow === 'Nightly build');
    ok('‼️ the parser does not pretend to know what exists — only the run does', wf.ok);
    const wfNone = M.parseAdaptiveDecision(JSON.stringify({ ...reflect(), action: 'run_workflow' }), spec());
    ok('but a nameless one is refused', !wfNone.ok && /"run_workflow" needs a "workflow"/.test(wfNone.error));
    const wfClassic = M.parsePlannerDecision('{"action":"run_workflow","thought":"t","workflow":"x"}', classicSpec());
    ok('and a classic lead may not reach for it at all',
        !wfClassic.ok && /use delegate \| finish \| ask_user \| abort/.test(wfClassic.error));

    console.log('\n-- run_mission asks for an outcome, not a spec');
    const child = (over = {}) => JSON.stringify({
        ...reflect(), action: 'run_mission', goal: 'the API reference is complete',
        successCriteria: [{ text: 'every endpoint has an example', required: true }], ...over
    });
    const rm = M.parseAdaptiveDecision(child(), spec());
    ok('a well-formed child objective parses', rm.ok && rm.decision.goal === 'the API reference is complete');
    ok('‼️ the lead states TEXT, not ids — an id has to be unique inside its own run',
        rm.ok && rm.decision.successCriteria[0].id === undefined);
    const noGoal = M.parseAdaptiveDecision(child({ goal: '' }), spec());
    ok('no goal → refused', !noGoal.ok && /"run_mission" needs a "goal"/.test(noGoal.error));
    const noCrit = M.parseAdaptiveDecision(child({ successCriteria: [] }), spec());
    ok('‼️ no criteria → refused: a child returns a VERDICT, and a verdict needs a subject',
        !noCrit.ok && /needs at least one entry in "successCriteria"/.test(noCrit.error));
    ok('…and it says what to do instead', !noCrit.ok && /delegate it instead/.test(noCrit.error));
    const allOpt = M.parseAdaptiveDecision(child({ successCriteria: [{ text: 'nice to have', required: false }] }), spec());
    ok('all-optional criteria → refused: nothing would decide whether it succeeded',
        !allOpt.ok && /every criterion you gave the child is optional/.test(allOpt.error));

    console.log('\n-- the prompt the lead is shown is built from the list');
    const brief = M.protocolFor(spec()).briefing(spec(), [], { rounds: 8, tasks: 12, costUSD: 5, minutes: 120, tokens: Infinity });
    ok('the schema offers every adaptive primitive', /"action": "delegate" \| "parallel" \| "review" \| "compare" \| "revise" \| "evaluate" \| "run_workflow" \| "run_mission" \| "message" \| "council" \| "replan" \| "finish" \| "ask_user" \| "abort"/.test(brief));
    ok('and explains each of them in its own words', /- "compare" — ask a pool agent to weigh/.test(brief));
    ok('‼️ including the rule that makes parallel honest', /The engine still obeys the one-writer-per-folder rule/.test(brief));
    ok('and it says the ids are named, not pasted', /Do not paste the work into "ask" — name it/.test(brief));
    const cbrief = M.protocolFor(classicSpec()).briefing(classicSpec(), [], { rounds: 8, tasks: 12, costUSD: 5, minutes: 120, tokens: Infinity });
    ok('‼️ the classic briefing is not offered any of it',
        !/parallel|"revise"|"compare"/.test(cbrief) && /"action": "delegate" \| "finish" \| "ask_user" \| "abort"/.test(cbrief));
}

// ============================================ 3. the engine runs them as ordinary tasks
//
// The planner is scripted LAZILY here rather than from a fixed array: a typed
// intent names result ids, and those ids do not exist until the round before it
// has run. A fixture that hard-coded them would be testing a different engine.

async function reviseTest() {
    console.log('\n-- a revise carries the real output of what it revises');
    const run = newRun();
    let i = 0;
    const prompts = [];
    const planner = {
        prompts,
        runPlanner: async (prompt) => {
            prompts.push(prompt);
            i++;
            if (i === 1) { return { ok: true, raw: JSON.stringify(run1()) }; }
            if (i === 2) {
                const first = run.rounds[0].steps[0].id;
                return {
                    ok: true, raw: JSON.stringify({
                        ...reflect(), thought: 'fix it', action: 'revise', agent: 'Ada',
                        targets: [first], ask: 'the footer is missing'
                    })
                };
            }
            return { ok: true, raw: JSON.stringify(FINISH) };
        }
    };
    const { d, seen, waves } = deps(planner, { Ada: 'THE DRAFT BODY' });
    await new M.MissionEngine(spec(), run, [], d).execute();
    const step = run.rounds[1].steps[0];
    eq('the revise round ran exactly one task', run.rounds[1].steps.length, 1);
    eq('…as the agent the lead named', step.agentName, 'Ada');
    eq('and it is marked as the intent it was', step.intent, 'revise');
    ok('‼️ the ENGINE put the real output in the prompt — the lead named an id, not content',
        step.prompt.includes('THE DRAFT BODY'));
    ok('under a heading that says what the agent is doing', /You are revising work that already exists/.test(step.prompt));
    ok('with the gap the lead named', step.prompt.includes('the footer is missing'));
    ok('and the objective it serves', step.prompt.includes('the page works'));
    ok('a revise WRITES — it is not marked readonly', step.readonly === false);
    eq('‼️ and it inherits the criteria of the work it revises', (step.criteria || []).join(','), 'c1');
    eq('the sources are on the step, not only in the prose', (step.sources || []).join(','), run.rounds[0].steps[0].id);
    const created = seen.filter(e => e.type === 'action.created');
    const revNode = created[created.length - 1];
    eq('the graph node carries the intent', revNode.intent, 'revise');
    eq('…and its fan-in is the result it was built from', (revNode.inputRefs || []).join(','), run.rounds[0].steps[0].id);
    ok('it still hangs under the decision that ordered it', (revNode.parentRefs || []).length === 1);
    eq('it went down the ordinary wave path', waves.length, 2);
    ok('and the ledger names the primitive, not "delegate"', /R2 revise on /.test(run.ledger[1]));
}

async function reviewAndCompareTest() {
    console.log('\n-- review and compare read, they do not write');
    const run = newRun();
    let i = 0;
    const planner = {
        runPlanner: async () => {
            i++;
            if (i === 1) {
                return {
                    ok: true, raw: JSON.stringify({
                        ...reflect(), thought: 'two drafts', action: 'parallel', tasks: [
                            { agent: 'Ada', title: 'draft A', prompt: 'a', readonly: true },
                            { agent: 'Rev', title: 'draft B', prompt: 'b', readonly: true }
                        ]
                    })
                };
            }
            if (i === 2) {
                const ids = run.rounds[0].steps.map(s => s.id);
                return {
                    ok: true, raw: JSON.stringify({
                        ...reflect(), thought: 'which', action: 'compare', agent: 'Rev',
                        targets: ids, ask: 'which reads better'
                    })
                };
            }
            return { ok: true, raw: JSON.stringify(FINISH) };
        }
    };
    const { d, waves } = deps(planner, { Ada: 'BODY A', Rev: 'BODY B' });
    await new M.MissionEngine(spec(), run, [], d).execute();
    const step = run.rounds[1].steps[0];
    eq('the compare is one task', run.rounds[1].steps.length, 1);
    ok('holding BOTH bodies', step.prompt.includes('BODY A') && step.prompt.includes('BODY B'));
    ok('‼️ and it is readonly — weighing work does not modify it', step.readonly === true);
    ok('the two independent drafts really did go out together', waves[0].length === 2);
    ok('and it is told not to merge them', /Do not merge them/.test(step.prompt));
}

async function parallelWithWritersTest() {
    console.log('\n-- parallel is a claim the engine may refuse, out loud');
    const run = newRun();
    let i = 0;
    const prompts = [];
    const planner = {
        prompts,
        runPlanner: async (prompt) => {
            prompts.push(prompt);
            i++;
            if (i === 1) {
                return {
                    ok: true, raw: JSON.stringify({
                        ...reflect(), thought: 'both', action: 'parallel', tasks: [
                            { agent: 'Ada', title: 'write the page', prompt: 'a', readonly: false },
                            { agent: 'Rev', title: 'write the styles', prompt: 'b', readonly: false }
                        ]
                    })
                };
            }
            return { ok: true, raw: JSON.stringify(FINISH) };
        }
    };
    const { d, waves } = deps(planner, {}, {});
    await new M.MissionEngine(spec({ workdir: 'C:/work' }), run, [], d).execute();
    eq('‼️ two writers in one folder are still serialised — the rule does not bend', waves.length, 2);
    ok('and the lead is TOLD its claim could not be honoured',
        /you asked for these 2 tasks in parallel, but they ran in 2 waves/.test(prompts[1]));
    ok('…with the reason and the fix, not just the fact',
        /one writer at a time/.test(prompts[1]) && /"readonly": true/.test(prompts[1]));
}

async function parallelReadersTest() {
    console.log('\n-- …and says nothing when it could honour it');
    const run = newRun();
    let i = 0;
    const prompts = [];
    const planner = {
        prompts,
        runPlanner: async (prompt) => {
            prompts.push(prompt);
            i++;
            if (i === 1) {
                return {
                    ok: true, raw: JSON.stringify({
                        ...reflect(), thought: 'both', action: 'parallel', tasks: [
                            { agent: 'Ada', title: 'read the page', prompt: 'a', readonly: true },
                            { agent: 'Rev', title: 'read the styles', prompt: 'b', readonly: true }
                        ]
                    })
                };
            }
            return { ok: true, raw: JSON.stringify(FINISH) };
        }
    };
    const { d, waves } = deps(planner, {}, {});
    await new M.MissionEngine(spec({ workdir: 'C:/work' }), run, [], d).execute();
    eq('two readers go out in one wave', waves.length, 1);
    ok('and no apology is manufactured', !/could not be honoured|ran in/.test(prompts[1]));
}

async function unknownTargetTest() {
    console.log('\n-- an id that never existed is a rejection, not an empty quotation');
    const run = newRun();
    let i = 0;
    const prompts = [];
    const planner = {
        prompts,
        runPlanner: async (prompt) => {
            prompts.push(prompt);
            i++;
            if (i === 1) { return { ok: true, raw: JSON.stringify(run1()) }; }
            if (i === 2) {
                return {
                    ok: true, raw: JSON.stringify({
                        ...reflect(), thought: 'fix', action: 'revise', agent: 'Ada',
                        targets: ['nope'], ask: 'fix it'
                    })
                };
            }
            return { ok: true, raw: JSON.stringify(FINISH) };
        }
    };
    const { d, waves } = deps(planner, { Ada: 'DRAFT' });
    await new M.MissionEngine(spec(), run, [], d).execute();
    eq('‼️ nothing was delegated on a made-up id', waves.length, 1);
    ok('the lead is told which id does not exist', /No result of this run carries the id "nope"/.test(prompts[2]));
    ok('…and which ones do', prompts[2].includes(run.rounds[0].steps[0].id));
    ok('and the refusal is in the ledger, so a resumed lead sees it too',
        run.ledger.some(l => /revise rejected — no settled result with id nope/.test(l)));
}

async function staleAfterReviseTest() {
    console.log('\n-- ‼️ a revise expires the pass that was about the old version');
    const run = newRun();
    let i = 0;
    const prompts = [];
    const planner = {
        prompts,
        runPlanner: async (prompt) => {
            prompts.push(prompt);
            i++;
            if (i === 1) { return { ok: true, raw: JSON.stringify(run1()) }; }
            if (i === 2) {
                return {
                    ok: true, raw: JSON.stringify({
                        ...reflect(), thought: 'judge', action: 'evaluate', targets: [],
                        findings: [{ criterion: 'c1', verdict: 'pass', evidence: 'it rendered' }], advice: 'finish'
                    })
                };
            }
            if (i === 3) {
                return {
                    ok: true, raw: JSON.stringify({
                        ...reflect(), thought: 'one more thing', action: 'revise', agent: 'Ada',
                        targets: [run.rounds[0].steps[0].id], ask: 'the footer is missing'
                    })
                };
            }
            if (i === 4) {
                return {
                    ok: true, raw: JSON.stringify({
                        ...reflect(), thought: 'ship', action: 'finish', verdict: 'success',
                        summary: 'done', stopReason: 'criteria-satisfied'
                    })
                };
            }
            return { ok: true, raw: JSON.stringify(FINISH) };
        }
    };
    const { d } = deps(planner, { Ada: 'DRAFT' });
    await new M.MissionEngine(spec(), run, [], d).execute();
    ok('the gate refused the success that rested on the pre-revise pass',
        /Not accepted: "success" needs a CURRENT pass/.test(prompts[4] || ''));
    ok('…naming the criterion the revise touched', /\[c1\]/.test(prompts[4] || ''));
}

async function runWorkflowTest() {
    console.log('\n-- a workflow is a unit of work, run on the ordinary wave');
    const run = newRun();
    let i = 0;
    const prompts = [];
    const started = [];
    const planner = {
        prompts,
        runPlanner: async (prompt) => {
            prompts.push(prompt);
            i++;
            if (i === 1) {
                return {
                    ok: true, raw: JSON.stringify({
                        ...reflect(), thought: 'chain it', action: 'run_workflow',
                        workflow: 'Nightly build', ask: 'the release branch', criteria: ['c1']
                    })
                };
            }
            return { ok: true, raw: JSON.stringify(FINISH) };
        }
    };
    const { d, seen, waves } = deps(planner, {}, {
        workflows: () => [{ id: 'w1', title: 'Nightly build', steps: 3 }],
        delegateWave: async (_run, steps) => {
            waves.push(steps.map(s => s.title));
            for (const s of steps) {
                started.push({ kind: s.kind, workflowId: s.workflowId });
                s.status = 'done';
                s.costUSD = 0.42;
            }
        }
    });
    // `waves` is the array the harness closes over; re-point it for this dep
    await new M.MissionEngine(spec(), run, [], d).execute();
    const step = run.rounds[0].steps[0];
    eq('the round ran one unit', run.rounds[0].steps.length, 1);
    eq('‼️ and it is a WORKFLOW unit, not a task pretending to be one', step.kind, 'workflow');
    eq('naming the chain by id, resolved from the title the lead used', step.workflowId, 'w1');
    eq('the criteria it serves ride along', (step.criteria || []).join(','), 'c1');
    ok('it went down the same wave path as any delegation', started.length === 1 && started[0].kind === 'workflow');
    const created = seen.filter(e => e.type === 'action.created');
    eq('‼️ the graph node says what kind of thing it is', created[0].kind, 'workflow');
    ok('and the ledger names it', /R1 run_workflow — /.test(run.ledger[0]));
    ok('the lead was told which chains exist before it named one',
        /## Workflows you may run/.test(prompts[0]) && /- Nightly build \(3 steps\)/.test(prompts[0]));
    ok('…before the answer schema, not after it',
        prompts[0].indexOf('## Workflows you may run') < prompts[0].indexOf('## How to answer'));
}

async function unknownWorkflowTest() {
    console.log('\n-- naming a chain that does not exist is a rejection with the real list');
    const run = newRun();
    let i = 0;
    const prompts = [];
    const planner = {
        prompts,
        runPlanner: async (prompt) => {
            prompts.push(prompt);
            i++;
            if (i === 1) {
                return {
                    ok: true, raw: JSON.stringify({
                        ...reflect(), thought: 'chain', action: 'run_workflow', workflow: 'Deploy'
                    })
                };
            }
            return { ok: true, raw: JSON.stringify(FINISH) };
        }
    };
    const { d, waves } = deps(planner, {}, { workflows: () => [{ id: 'w1', title: 'Nightly build', steps: 3 }] });
    await new M.MissionEngine(spec(), run, [], d).execute();
    eq('nothing ran', waves.length, 0);
    ok('the lead is told the name is wrong', /There is no workflow called "Deploy"/.test(prompts[1]));
    ok('…and what this window actually has', /This window has: "Nightly build"/.test(prompts[1]));
    ok('the refusal is in the ledger too', run.ledger.some(l => /run_workflow rejected/.test(l)));
}

async function noWorkflowsTest() {
    console.log('\n-- a window with no chains does not advertise any');
    const run = newRun();
    const prompts = [];
    const planner = { prompts, runPlanner: async (p) => { prompts.push(p); return { ok: true, raw: JSON.stringify(FINISH) }; } };
    const { d } = deps(planner, {}, { workflows: () => [] });
    await new M.MissionEngine(spec(), run, [], d).execute();
    ok('‼️ no section, rather than an empty one the lead would guess into',
        !/## Workflows you may run/.test(prompts[0]));
    ok('but the primitive is still in the menu — it exists, this window just has nothing to run',
        /"run_workflow"/.test(prompts[0]));
}

async function nestedMissionTest() {
    console.log('\n-- a child objective is a real run, and its verdict is what comes back');
    const run = newRun();
    let i = 0;
    const prompts = [];
    const planner = {
        prompts,
        runPlanner: async (prompt) => {
            prompts.push(prompt);
            i++;
            if (i === 1) {
                return {
                    ok: true, raw: JSON.stringify({
                        ...reflect(), thought: 'split it', action: 'run_mission',
                        title: 'Reference pass', goal: 'the API reference is complete',
                        successCriteria: [{ text: 'every endpoint has an example', required: true }],
                        constraints: ['do not touch the changelog'], criteria: ['c1']
                    })
                };
            }
            return { ok: true, raw: JSON.stringify(FINISH) };
        }
    };
    const { d, seen, waves } = deps(planner, {}, {
        delegateWave: async (_run, steps) => {
            waves.push(steps.map(s => s.title));
            for (const s of steps) {
                // what the extension does for a settled child, in miniature
                s.status = 'done';
                s.costUSD = 1.5;
                s.resultText = 'Child objective success (criteria-satisfied): every endpoint documented.';
            }
        }
    });
    await new M.MissionEngine(spec(), run, [], d).execute();
    const step = run.rounds[0].steps[0];
    eq('the round ran one unit', run.rounds[0].steps.length, 1);
    eq('‼️ and it is a MISSION unit', step.kind, 'mission');
    eq('carrying the goal the lead stated', step.child.goal, 'the API reference is complete');
    eq('and the child\'s own criteria, still as text', step.child.successCriteria[0].text, 'every endpoint has an example');
    eq('the child sits one level below this run', step.child.depth, 1);
    eq('the PARENT criteria it serves ride along, for staleness', (step.criteria || []).join(','), 'c1');
    const created = seen.filter(e => e.type === 'action.created');
    eq('the graph node says what kind of thing it is', created[0].kind, 'mission');
    ok('‼️ the lead is shown the child\'s VERDICT, not an empty excerpt',
        /Child objective success/.test(prompts[1]));
    eq('and the child\'s spend is charged to this run once', run.totalCostUSD, 1.5);
    ok('the ledger names the primitive', /R1 run_mission — /.test(run.ledger[0]));
}

async function nestingCapsTest() {
    console.log('\n-- ‼️ the two things that stop nesting being a fork bomb');
    const deep = newRun();
    deep.depth = 3;
    let i = 0;
    const prompts = [];
    const req = {
        ...reflect(), thought: 'go deeper', action: 'run_mission', goal: 'another layer',
        successCriteria: [{ text: 'it is done', required: true }]
    };
    const planner = {
        prompts,
        runPlanner: async (prompt) => {
            prompts.push(prompt);
            i++;
            return { ok: true, raw: JSON.stringify(i === 1 ? req : FINISH) };
        }
    };
    const { d, waves } = deps(planner, {});
    await new M.MissionEngine(spec(), deep, [], d).execute();
    eq('a run already at the cap starts no child', waves.length, 0);
    ok('and is told the cap by number', /this run is already 3 level\(s\) deep and the cap is 3/.test(prompts[1]));
    ok('…with the thing to do instead', /Do this work with delegations/.test(prompts[1]));

    const cyc = newRun('r2');
    let j = 0;
    const p2 = [];
    const planner2 = {
        runPlanner: async (prompt) => {
            p2.push(prompt);
            j++;
            return {
                ok: true, raw: JSON.stringify(j === 1
                    ? { ...reflect(), thought: 'again', action: 'run_mission', goal: 'The page   WORKS.', successCriteria: [{ text: 'x', required: true }] }
                    : FINISH)
            };
        }
    };
    const { d: d2, waves: w2 } = deps(planner2, {}, {
        ancestry: () => [{ runId: 'up', goal: 'the page works' }]
    });
    await new M.MissionEngine(spec(), cyc, [], d2).execute();
    eq('an objective that is already its own ancestor starts nothing', w2.length, 0);
    ok('‼️ and the match is on the NORMALISED goal — punctuation and spacing are not a new objective',
        /already running above this one/.test(p2[1]));
    ok('it says why that would never end', /asking itself for the same thing/.test(p2[1]));
}

async function classicUntouchedTest() {
    console.log('\n-- classic is where it was, to the character');
    const run = newRun();
    let i = 0;
    const prompts = [];
    const planner = {
        prompts,
        runPlanner: async (prompt) => {
            prompts.push(prompt);
            i++;
            if (i === 1) {
                return {
                    ok: true, raw: JSON.stringify({
                        thought: 'go', action: 'delegate',
                        tasks: [{ agent: 'Ada', title: 'do it', prompt: 'p' }]
                    })
                };
            }
            return { ok: true, raw: JSON.stringify({ thought: 'done', action: 'finish', verdict: 'success', summary: 's' }) };
        }
    };
    const { d, waves } = deps(planner, {});
    await new M.MissionEngine(classicSpec(), run, [], d).execute();
    eq('a classic delegation still runs', waves.length, 1);
    eq('the round is still recorded as a delegate', run.rounds[0].action, 'delegate');
    eq('and the ledger line is the one it always was',
        run.ledger[0], `R1 delegate — Ada:"do it"(done)`);
    eq('classic success is not gated', run.result.verdict, 'success');
    ok('no intent is invented for a plain delegation', run.rounds[0].steps[0].intent === undefined);
}

(async () => {
    await reviseTest();
    await reviewAndCompareTest();
    await parallelWithWritersTest();
    await parallelReadersTest();
    await unknownTargetTest();
    await staleAfterReviseTest();
    await runWorkflowTest();
    await unknownWorkflowTest();
    await noWorkflowsTest();
    await nestedMissionTest();
    await nestingCapsTest();
    await classicUntouchedTest();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
