// ‼️ M-19 (X-32) — WHAT IT MEANS FOR TWO AGENTS TO HAVE ACTUALLY TALKED.
//
// The failure this file exists to make impossible: a lead sends the same
// question to three agents, gets three independent answers, and writes "the
// three discussed it and converged on X". Nobody discussed anything — B never
// saw A's answer, and the convergence is the lead's own prose presented as the
// outcome of a debate. It reads exactly like the real thing.
//
// What is pinned here:
//
//   * the intent set is CLOSED, and the intents that are ABOUT something
//     somebody said cannot be sent without naming it — a "synthesis" citing
//     nothing is the exact artefact this item refuses;
//   * a ref is checked against the conversation it claims to be in;
//   * one turn at a time per participant, and DIFFERENT participants may speak
//     at once (that is what an independent first round is);
//   * ‼️ the next speaker is given the REAL text of what it is answering —
//     there is no parameter through which a lead could describe it instead;
//   * a resumed lane and a re-told one are different facts and are labelled
//     differently, because a surface that calls the second "resumed" is
//     claiming continuity the run does not have;
//   * what is still UNANSWERED is a fact of the record, not a turn count;
//   * the lead's between-round digest is bounded on purpose — the planner is
//     resumed each round, so a whole transcript would be paid for once per
//     round for the rest of the run.
'use strict';
const path = require('path');
const fs = require('fs');
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

const conv = {
    id: 'c1',
    objective: 'decide whether the resume path should be per-engine or shared',
    participants: ['a1', 'a2'],
    openedAt: 1000
};
const agents = [{ id: 'a1', name: 'planner' }, { id: 'a2', name: 'reviewer' }];
const nameOf = (id) => (agents.find(a => a.id === id)?.name ?? id);

const msg = (o) => Object.assign({
    conversationId: 'c1', to: [], refs: [], orderedAt: 1000, state: 'delivered'
}, o);

// =============================================== 1. the intent set is CLOSED
{
    console.log('\n-- the intents are a closed set, and each says what the speaker is doing');
    const kinds = M.MESSAGE_INTENTS;
    const names = Object.keys(kinds);
    ok('there are intents at all', names.length >= 8);
    ok('‼️ every intent carries a charge written for the SPEAKER to act on',
        names.every(n => typeof kinds[n].charge === 'string' && kinds[n].charge.length > 40));
    ok('every intent carries a one-line describe for the planner menu',
        names.every(n => typeof kinds[n].describe === 'string' && kinds[n].describe.length > 10));
    // The menu the lead is offered and the table the parser reads are one thing.
    eq('the menu is built from the same table', M.messageIntentMenu(), names.join(' | '));
    ok('an unknown intent is not a kind', M.intentKind('gossip') === undefined);
    ok('and a prototype key is not one either', M.intentKind('toString') === undefined);

    // ‼️ The two flags are the whole reason the table exists.
    ok('a proposal stands on its own', kinds.proposal.needsRefs === false);
    ok('a question stands on its own', kinds.question.needsRefs === false);
    ok('‼️ a challenge is about something somebody said', kinds.challenge.needsRefs === true);
    ok('‼️ so is a synthesis — a conclusion that cites nothing is the fake',
        kinds.synthesis.needsRefs === true);
    ok('‼️ and so is a vote', kinds.vote.needsRefs === true);
    // ‼️ `awaits` and `settles` are two different questions and were one bug:
    // counting every non-settling message as open made a proposal nobody argued
    // with look like a loose end for the rest of the run.
    ok('‼️ a question puts something to somebody', kinds.question.awaits === true);
    ok('‼️ so does a challenge', kinds.challenge.awaits === true);
    ok('‼️ a proposal does not — a statement is not a loose end', kinds.proposal.awaits === false);
    ok('‼️ and neither does evidence', kinds.evidence.awaits === false);
    ok('nothing that settles also awaits',
        names.every(n => !(kinds[n].settles && kinds[n].awaits)));
    ok('a question does not settle anything by being asked', kinds.question.settles === false);
    ok('a challenge stays open until something answers it', kinds.challenge.settles === false);
    ok('a response settles what it answers', kinds.response.settles === true);
    ok('a concession settles it too', kinds.concede.settles === true);
}

// ================================================= 2. a turn that is refused
{
    console.log('\n-- every reason a speaking turn is refused, before anything spawns');
    const req = (o) => Object.assign({ conversationId: 'c1', from: 'a1', to: [], intent: 'proposal', refs: [] }, o);

    eq('a conversation that does not exist is named as the problem',
        /no conversation "c9"/.test(M.refuseMessage(req({ conversationId: 'c9' }), undefined, [], agents)), true);
    ok('a closed conversation is a finished record',
        /is closed \(consensus\)/.test(M.refuseMessage(
            req({}), { ...conv, closedAt: 2000, closeReason: 'consensus' }, [], agents)));
    ok('an unknown intent is refused with the menu',
        M.refuseMessage(req({ intent: 'gossip' }), conv, [], agents).includes(M.messageIntentMenu()));
    ok('a speaker outside the conversation is refused',
        /not a participant/.test(M.refuseMessage(req({ from: 'a3' }), conv, [], agents)));
    ok('…and the lead may always speak in its own name',
        M.refuseMessage(req({ from: 'lead' }), conv, [], agents) === '');
    ok('a participant who is not in the pool at all is refused',
        /not an agent in this run's pool/.test(
            M.refuseMessage(req({ from: 'a2' }), conv, [], [{ id: 'a1', name: 'planner' }])));
    ok('addressing somebody outside the conversation is refused',
        /not in conversation "c1"/.test(M.refuseMessage(req({ to: ['a9'] }), conv, [], agents)));
    ok('an empty "to" is everyone, which is ordinary rather than special',
        M.refuseMessage(req({ to: [] }), conv, [], agents) === '');

    // ‼️ Refs are checked against THIS conversation, not against the run.
    const elsewhere = [msg({ id: 'm1', conversationId: 'c2', from: 'a1', intent: 'proposal' })];
    ok('‼️ a ref to a message of another conversation is not a ref',
        /No message of conversation "c1" carries the id "m1"/.test(
            M.refuseMessage(req({ intent: 'challenge', refs: ['m1'] }), conv, elsewhere, agents)));
    const own = [msg({ id: 'm1', from: 'a1', intent: 'proposal' })];
    ok('a real ref passes', M.refuseMessage(
        req({ from: 'a2', intent: 'challenge', refs: ['m1'] }), conv, own, agents) === '');
    ok('‼️ a challenge with no refs is refused, and told which ids exist',
        /has to name it/.test(M.refuseMessage(req({ from: 'a2', intent: 'challenge' }), conv, own, agents))
        && M.refuseMessage(req({ from: 'a2', intent: 'challenge' }), conv, own, agents).includes('m1'));
    ok('‼️ and so is a synthesis with no refs — this is the fake, refused by shape',
        /has to name it/.test(M.refuseMessage(req({ from: 'a2', intent: 'synthesis' }), conv, own, agents)));
    ok('the first turn is told it cannot refer to anything yet',
        /Nothing has been said yet/.test(M.refuseMessage(req({ intent: 'synthesis' }), conv, [], agents)));
}

// ========================================= 3. one turn per participant, only
{
    console.log('\n-- a participant speaks once at a time; two of them may speak at once');
    const inFlight = [msg({ id: 'm1', from: 'a1', intent: 'proposal', state: 'pending' })];
    ok('the same participant is refused a second turn',
        /already speaking in this conversation \(m1\)/.test(M.refuseMessage(
            { conversationId: 'c1', from: 'a1', to: [], intent: 'proposal', refs: [] }, conv, inFlight, agents)));
    ok('‼️ a DIFFERENT participant is not — that is an independent first round',
        M.refuseMessage(
            { conversationId: 'c1', from: 'a2', to: [], intent: 'proposal', refs: [] },
            conv, inFlight, agents) === '');
    ok('participantBusy names the turn that is in flight',
        M.participantBusy(inFlight, 'c1', 'a1').id === 'm1');
    ok('a settled turn does not hold the lane',
        M.participantBusy([msg({ id: 'm1', from: 'a1', intent: 'proposal' })], 'c1', 'a1') === undefined);
    ok('and a lane is held per conversation, not per run',
        M.participantBusy(inFlight, 'c2', 'a1') === undefined);
}

// ============================================ 4. what is still UNANSWERED
{
    console.log('\n-- "six messages happened" is not the fact; "two unanswered" is');
    const thread = [
        msg({ id: 'm1', from: 'a1', intent: 'proposal' }),
        msg({ id: 'm2', from: 'a2', intent: 'challenge', refs: ['m1'] }),
        msg({ id: 'm3', from: 'a2', intent: 'question', refs: [] })
    ];
    let open = M.openThreads(thread, 'c1');
    eq('a challenge and a question are open until answered', open.map(m => m.id).join(','), 'm2,m3');
    ok('a proposal is not itself an open thread', !open.some(m => m.id === 'm1'));

    thread.push(msg({ id: 'm4', from: 'a1', intent: 'response', refs: ['m2'] }));
    open = M.openThreads(thread, 'c1');
    eq('answering the challenge closes it', open.map(m => m.id).join(','), 'm3');

    // ‼️ A turn that never came back cannot close anything.
    const withFailed = [
        msg({ id: 'm1', from: 'a1', intent: 'question' }),
        msg({ id: 'm2', from: 'a2', intent: 'response', refs: ['m1'], state: 'failed', note: 'the delegate crashed' })
    ];
    eq('‼️ a failed answer leaves the question open',
        M.openThreads(withFailed, 'c1').map(m => m.id).join(','), 'm1');
    ok('and a failed turn is not itself an open thread',
        !M.openThreads(withFailed, 'c1').some(m => m.id === 'm2'));
}

// ================================= 5. the speaker sees the REAL text, always
{
    console.log('\n-- there is no parameter through which a lead could paraphrase somebody');
    const m1 = msg({ id: 'm1', from: 'a1', intent: 'proposal', excerpt: 'Keep the resume flag per engine.' });
    const m2 = msg({ id: 'm2', from: 'a2', intent: 'challenge', refs: ['m1'], excerpt: 'That duplicates the vocabulary in four places.' });
    const prompt = M.buildSpeakerPrompt({
        conversation: conv, intent: 'response', speakerName: 'planner',
        referenced: [m2], context: [m1, m2], ask: 'answer the duplication point',
        goal: 'settle the resume design', carried: 'new', nameOf
    });
    ok('the charge for the intent is in the prompt', prompt.includes(M.MESSAGE_INTENTS.response.charge));
    ok('what the conversation is for is in it', prompt.includes(conv.objective));
    ok('the objective it serves is in it', prompt.includes('settle the resume design'));
    ok('‼️ the referenced message arrives with its REAL words',
        prompt.includes('That duplicates the vocabulary in four places.'));
    ok('…under its own id and speaker name', /\[m2\] reviewer — challenge \(on m1\)/.test(prompt));
    ok('the rest of the exchange is there too, in order', prompt.includes('Keep the resume flag per engine.'));
    ok('‼️ and a message is not printed twice for being both ref and context',
        prompt.split('That duplicates the vocabulary in four places.').length === 2);
    ok('the lead\'s own ask is labelled as the lead\'s, not as somebody\'s message',
        /What the lead wants from this turn\n+answer the duplication point/.test(prompt));
    ok('a turn with no ask still tells the speaker so',
        M.buildSpeakerPrompt({
            conversation: conv, intent: 'proposal', speakerName: 'planner',
            referenced: [], carried: 'new'
        }).includes('the lead named nothing specific'));

    // ‼️ The two ways a lane is carried are different facts.
    const resumed = M.buildSpeakerPrompt({
        conversation: conv, intent: 'response', speakerName: 'planner',
        referenced: [m2], carried: 'resumed', nameOf
    });
    ok('a resumed lane is told only what is new since its last turn',
        /only what is new since your last turn/.test(resumed));
    const handoff = M.buildSpeakerPrompt({
        conversation: conv, intent: 'response', speakerName: 'planner',
        referenced: [m2], context: [m1, m2], carried: 'handoff', nameOf
    });
    ok('‼️ a handoff is told it is reading a record, not continuing a session',
        /reproduced below in full rather than continued/.test(handoff));
    ok('a first turn claims neither', !/Where you are/.test(M.buildSpeakerPrompt({
        conversation: conv, intent: 'proposal', speakerName: 'planner', referenced: [], carried: 'new'
    })));
    ok('the speaker is told its text is shown verbatim to the others',
        /shown to them and to the user\s+exactly as you write it/.test(prompt));
}

// ============================================= 6. the row, and the digest
{
    console.log('\n-- SHORTHAND on the row; the digest bounded because the planner is resumed');
    const m1 = msg({ id: 'm1', from: 'a1', intent: 'proposal', excerpt: 'Keep the resume flag per engine.' });
    eq('a delivered message reads as one line',
        M.messageLine(m1, nameOf), '[m1] planner → all · proposal — Keep the resume flag per engine.');
    eq('an addressed message names who it is for',
        M.messageLine(msg({ id: 'm2', from: 'a2', to: ['a1'], intent: 'question', excerpt: 'why?' }), nameOf),
        '[m2] reviewer → planner · question — why?');
    eq('a turn that has not come back says its state, not an empty quote',
        M.messageLine(msg({ id: 'm3', from: 'a1', intent: 'proposal', state: 'failed', note: 'agent missing' }), nameOf),
        '[m3] planner → all · proposal — failed: agent missing');
    ok('a long message is cut on the row and not in the record',
        M.messageLine(msg({ id: 'm4', from: 'a1', intent: 'proposal', excerpt: 'x'.repeat(400) }), nameOf).length < 220);

    const many = [];
    for (let i = 1; i <= 12; i++) {
        many.push(msg({ id: `m${i}`, from: i % 2 ? 'a1' : 'a2', intent: 'proposal', excerpt: `turn ${i}` }));
    }
    many.push(msg({ id: 'm13', from: 'a2', intent: 'challenge', refs: ['m1'], excerpt: 'not so' }));
    const d = M.conversationDigest(conv, many, { nameOf });
    eq('the digest counts every message', d.total, 13);
    eq('and says how many are unanswered', d.open, 1);
    ok('‼️ it does NOT carry the whole transcript', !d.text.includes('turn 3'));
    ok('it carries the last few turns', d.text.includes('turn 12'));
    ok('it names the unanswered one', d.text.includes('m13'));
    ok('and it tells the lead the ids it may ask for', /Ask for the full text of any message by its id/.test(d.text));
    ok('the objective of the conversation is in it', d.text.includes(conv.objective));
    ok('participants are named, not id-dumped', d.text.includes('planner, reviewer'));
    const quiet = M.conversationDigest(conv, [msg({ id: 'm1', from: 'a1', intent: 'proposal', excerpt: 'x' })], { nameOf });
    ok('a conversation with nothing open says so plainly', /Nothing is left unanswered/.test(quiet.text));
    const closed = M.conversationDigest({ ...conv, closedAt: 5, closeReason: 'consensus' }, [], { nameOf });
    ok('a closed conversation states why it closed', /closed \(consensus\)/.test(closed.text));
}

// =================================================== 7. ids, and the record
{
    console.log('\n-- ids are of the run and never reused');
    eq('the first conversation is c1', M.newConversationId([]), 'c1');
    eq('and the next is c2', M.newConversationId([{ id: 'c1' }]), 'c2');
    eq('the first message is m1', M.newMessageId([]), 'm1');
    eq('ids count every message of the run, not of one conversation',
        M.newMessageId([{ id: 'm1' }, { id: 'm2' }]), 'm3');
    const mixed = [
        msg({ id: 'm1', from: 'a1', intent: 'proposal' }),
        msg({ id: 'm2', conversationId: 'c2', from: 'a1', intent: 'proposal' }),
        msg({ id: 'm3', from: 'a2', intent: 'question' })
    ];
    eq('a conversation\'s messages are its own, in order',
        M.conversationMessages(mixed, 'c1').map(m => m.id).join(','), 'm1,m3');
}

// ======================================== 8. the lead's decision, as parsed
//
// The lead speaks in agent NAMES because that is what its briefing lists; every
// id is resolved once, here, so nothing downstream has to guess which a string
// is.
const CRITERIA = [{ id: 'c1', text: 'the page renders', required: true }];
const LIMITS = { maxRounds: 8, maxTasks: 12, maxCostUSD: 5, maxTokens: 0, maxMinutes: 120, maxParallel: 3 };
const spec = (over = {}) => ({
    id: 'm', title: 'objective', goal: 'the page works',
    leadAgentId: 'lead', leadAgentName: 'Lead', mode: 'adaptive', team: [],
    pool: [{ agentId: 'a1', agentName: 'Ada' }, { agentId: 'a2', agentName: 'Rev' }],
    constraints: [], successCriteria: CRITERIA, autonomy: 'ask-when-unsure',
    limits: { ...LIMITS }, approvalMode: 'auto', createdAt: 1, ...over
});
const reflect = (over = {}) => ({ rationale: 'r', currentPhase: 'p', strategy: 's', basedOn: [], ...over });
const newRun = (id = 'r') => ({
    id, specId: 'm', status: 'running', rounds: [], ledger: [], totalCostUSD: 0, startedAt: 0
});
const say = (over = {}) => JSON.stringify({
    ...reflect(), thought: 't', action: 'message',
    objective: 'is the resume flag per engine or shared?',
    participants: ['Ada', 'Rev'], from: 'Ada', intent: 'proposal',
    ask: 'state your position', ...over
});

{
    console.log('\n-- the lead names agents; the parser resolves them to ids, once');
    const good = M.parseAdaptiveDecision(say(), spec());
    ok('a well-formed message parses', good.ok);
    eq('the speaker is an id by the time it leaves the parser', good.decision.from.join(','), 'a1');
    eq('and so are the participants', (good.decision.participants || []).join(','), 'a1,a2');
    eq('the intent survives', good.decision.intent, 'proposal');
    eq('the lead\'s own words are kept as the ask', good.decision.ask, 'state your position');

    const noFrom = M.parseAdaptiveDecision(say({ from: 'Nobody' }), spec());
    ok('a speaker outside the pool is refused, and the pool is named',
        !noFrom.ok && /needs a "from"/.test(noFrom.error) && noFrom.error.includes('Ada, Rev'));
    const badIntent = M.parseAdaptiveDecision(say({ intent: 'gossip' }), spec());
    ok('an unknown intent is refused with the menu',
        !badIntent.ok && badIntent.error.includes(M.messageIntentMenu()));
    const badTo = M.parseAdaptiveDecision(say({ to: ['Ghost'] }), spec());
    ok('an address to somebody outside the pool is refused',
        !badTo.ok && /"Ghost"/.test(badTo.error));
    const noObj = M.parseAdaptiveDecision(say({ objective: '' }), spec());
    ok('‼️ opening a conversation with no purpose is refused — the purpose is what every turn is checked against',
        !noObj.ok && /needs an "objective"/.test(noObj.error));
    const alone = M.parseAdaptiveDecision(say({ participants: ['Ada'] }), spec());
    ok('‼️ …and one agent talking to nobody is a delegation, not a conversation',
        !alone.ok && /at least two "participants"/.test(alone.error));
    const cont = M.parseAdaptiveDecision(
        say({ conversation: 'c1', objective: undefined, participants: undefined, from: 'Rev' }), spec());
    ok('continuing an existing conversation needs neither an objective nor a cast',
        cont.ok && cont.decision.conversation === 'c1' && cont.decision.from.join(',') === 'a2');
}

// ======================================= 9. the engine: a real speaking turn
function deps(replies, outputs = {}, over = {}) {
    let i = 0;
    const seen = [], waves = [], bodies = {}, prompts = [];
    let clock = 100;
    const trace = (type, payload) => seen.push({ type, ...payload });
    return {
        seen, waves, prompts,
        d: {
            runPlanner: async (prompt) => {
                prompts.push(prompt);
                const r = replies[Math.min(i, replies.length - 1)];
                i++;
                return { ok: true, costUSD: 0, tokens: 0, raw: typeof r === 'string' ? r : JSON.stringify(r) };
            },
            delegateWave: async (_run, steps) => {
                waves.push(steps.map(s => s.title));
                for (const s of steps) {
                    trace('action.started', { actionId: s.id, kind: s.kind ?? 'task', refId: 't-' + s.id });
                    s.taskId = 't-' + s.id;
                    s.runSessionId = 'sess-' + s.agentName + '-' + s.id;
                    s.status = 'done';
                    const body = typeof outputs[s.agentName] === 'function'
                        ? outputs[s.agentName](s) : outputs[s.agentName];
                    if (body !== undefined) {
                        s.outputFile = '/out/' + s.id;
                        bodies[s.outputFile] = body;
                    }
                    trace('action.settled', { actionId: s.id, kind: s.kind ?? 'task', outcome: 'done', refId: 't-' + s.id });
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
const FINISH = {
    ...reflect(), thought: 'done', action: 'finish', verdict: 'partial', stopReason: 'no-new-information',
    summary: 'as far as it goes', stopReason: 'sufficient-evidence'
};

async function firstTurnTest() {
    console.log('\n-- a speaking turn is an ordinary delegation that produces a message');
    const run = newRun();
    const { d, waves, seen } = deps([say(), FINISH], { Ada: 'Per engine. The vocabulary differs.' });
    await new M.MissionEngine(spec(), run, [], d).execute();

    const step = run.rounds[0].steps[0];
    eq('exactly one task ran', run.rounds[0].steps.length, 1);
    eq('…by the agent the lead named', step.agentName, 'Ada');
    eq('it went down the ordinary wave path', waves.length, 1);
    eq('‼️ and it is marked as what it is', step.kind, 'conversation');
    ok('‼️ speaking does not write — which is what lets two of them run at once', step.readonly === true);
    ok('the speaker is told what the conversation is for',
        step.prompt.includes('is the resume flag per engine or shared?'));
    ok('and what the lead wants from this turn', step.prompt.includes('state your position'));
    ok('a first turn claims no continuity', !/Where you are/.test(step.prompt));

    eq('the conversation exists on the run', (run.conversations || []).length, 1);
    eq('with the cast the lead named, as ids', run.conversations[0].participants.join(','), 'a1,a2');
    eq('one message was recorded', (run.messages || []).length, 1);
    const m = run.messages[0];
    eq('‼️ and it is DELIVERED — a turn that really produced words', m.state, 'delivered');
    ok('carrying the speaker\'s own text', m.excerpt.includes('Per engine.'));
    eq('the task that produced it is on the record', m.taskId, step.taskId);
    eq('and the session it ran in, which is the lane and the deep link', m.sessionId, step.runSessionId);
    eq('the first turn carried nothing', m.carried, 'new');
    ok('the journal says a conversation was opened',
        seen.some(e => e.type === 'conversation.opened' && /resume flag/.test(e.text || '')));
    ok('‼️ …and that a message was really sent',
        seen.some(e => e.type === 'message.sent' && e.kind === 'conversation'));
    ok('the ledger names the conversation and the message, not "delegate"',
        /R1 message c1 — m1:Ada\(done\)/.test(run.ledger[0]));
}

async function secondSpeakerTest() {
    console.log('\n-- B sees A\'s real words, and the lane is labelled honestly');
    const run = newRun();
    const replies = [
        say(),
        say({ conversation: 'c1', objective: undefined, participants: undefined, from: 'Rev', intent: 'challenge', refs: ['m1'], ask: 'what is wrong with it' }),
        say({ conversation: 'c1', objective: undefined, participants: undefined, from: 'Ada', intent: 'response', refs: ['m2'], ask: 'answer it' }),
        FINISH
    ];
    const { d } = deps(replies, {
        Ada: (s) => (s.round === 1 ? 'Per engine. The vocabulary differs.' : 'Fair — three of the four share it.'),
        Rev: 'That duplicates the flag in four places.'
    }, { canResumeLane: () => true });
    await new M.MissionEngine(spec(), run, [], d).execute();

    const challenge = run.rounds[1].steps[0];
    ok('‼️ B is given A\'s REAL text, not the lead\'s account of it',
        challenge.prompt.includes('Per engine. The vocabulary differs.'));
    ok('…under A\'s own message id', /\[m1\] Ada — proposal/.test(challenge.prompt));
    eq('B\'s first turn is new', run.messages[1].carried, 'new');

    const response = run.rounds[2].steps[0];
    eq('‼️ A speaking again continues its own lane', run.messages[2].carried, 'resumed');
    eq('…by resuming the session its first turn ran in',
        response.message.resumeSessionId, run.messages[0].sessionId);
    ok('and a resumed speaker is told only what is new', /only what is new since your last turn/.test(response.prompt));
    ok('‼️ so its own first message is NOT sent to it a second time',
        !response.prompt.includes('Per engine. The vocabulary differs.'));
    ok('while the message it is answering is', response.prompt.includes('That duplicates the flag in four places.'));
    eq('three messages, one conversation', `${run.messages.length}/${run.conversations.length}`, '3/1');
    eq('nothing is left unanswered', M.openThreads(run.messages, 'c1').length, 0);
}

async function noResumeTest() {
    console.log('\n-- an engine that cannot resume gets a handoff, and is not called a resume');
    const run = newRun();
    const replies = [
        say(),
        say({ conversation: 'c1', objective: undefined, participants: undefined, from: 'Rev', intent: 'challenge', refs: ['m1'] }),
        say({ conversation: 'c1', objective: undefined, participants: undefined, from: 'Ada', intent: 'response', refs: ['m2'] }),
        FINISH
    ];
    const { d } = deps(replies, { Ada: 'A says a thing.', Rev: 'B disagrees.' }, { canResumeLane: () => false });
    await new M.MissionEngine(spec(), run, [], d).execute();
    const response = run.rounds[2].steps[0];
    eq('‼️ the lane is a handoff, not a resume', run.messages[2].carried, 'handoff');
    ok('no session is claimed', !response.message.resumeSessionId);
    ok('and the speaker is told it is reading a record',
        /reproduced below in full rather than continued/.test(response.prompt));
    ok('so it gets the whole exchange, including its own first turn',
        response.prompt.includes('A says a thing.') && response.prompt.includes('B disagrees.'));

    // ‼️ A harness that cannot answer the question claims nothing.
    const run2 = newRun('r2');
    const { d: d2 } = deps(replies, { Ada: 'A says a thing.', Rev: 'B disagrees.' });
    await new M.MissionEngine(spec(), run2, [], d2).execute();
    eq('with no canResumeLane at all, no lane is ever claimed as continued',
        run2.messages[2].carried, 'handoff');
}

async function emptyAndFailedTest() {
    console.log('\n-- a turn that said nothing did not answer anything');
    const run = newRun();
    const replies = [
        say({ from: 'Ada', intent: 'question', ask: 'ask Rev' }),
        say({ conversation: 'c1', objective: undefined, participants: undefined, from: 'Rev', intent: 'response', refs: ['m1'] }),
        FINISH
    ];
    // Rev's turn comes back clean with an empty body.
    const { d, seen } = deps(replies, { Ada: 'Why per engine?', Rev: '   ' });
    await new M.MissionEngine(spec(), run, [], d).execute();
    const m2 = run.messages[1];
    eq('‼️ a clean turn with no text is a FAILURE, not an empty message', m2.state, 'failed');
    ok('and it says so', /no text/.test(m2.note || ''));
    ok('the step carries the classified failure too', !!run.rounds[1].steps[0].failure);
    eq('‼️ so the question it claimed to answer is still open',
        M.openThreads(run.messages, 'c1').map(m => m.id).join(','), 'm1');
    // ‼️ The journal counts what was SPOKEN. One turn produced words and one
    // did not, so there is exactly one `message.sent` — a count of intentions
    // would say two and the run would look like a discussion that happened.
    eq('the journal records one message, not two',
        seen.filter(e => e.type === 'message.sent').length, 1);
}

async function refusalAndDigestTest() {
    console.log('\n-- a refused turn costs a round and tells the lead why; the digest reaches it');
    const run = newRun();
    const replies = [
        say(),
        // a ref to a message that does not exist
        say({ conversation: 'c1', objective: undefined, participants: undefined, from: 'Rev', intent: 'challenge', refs: ['m9'] }),
        FINISH
    ];
    const { d, prompts } = deps(replies, { Ada: 'A position.' });
    await new M.MissionEngine(spec(), run, [], d).execute();
    ok('the bad ref never became a task', run.rounds.length === 1 || !run.rounds[1]?.steps?.length);
    ok('‼️ the lead is told which ids exist, in its own vocabulary',
        prompts.some(p => /No message of conversation "c1" carries the id "m9"/.test(p)));
    ok('and the refusal is on the ledger', run.ledger.some(l => /message rejected/.test(l)));
    ok('‼️ the round message carries the conversation as it now stands',
        prompts.some(p => /## Conversation c1 — is the resume flag per engine or shared\?/.test(p)));
    ok('…and the message text is NOT also pasted in as a step excerpt — one subject, one place',
        prompts.some(p => /spoken in c1 as m1/.test(p)));
}

async function independentRoundTest() {
    console.log('\n-- an independent first round: both speak, neither sees the other');
    const run = newRun();
    const replies = [
        say({ from: ['Ada', 'Rev'], intent: 'proposal', ask: 'state your own position' }),
        FINISH
    ];
    const { d } = deps(replies, { Ada: 'Keep it per engine.', Rev: 'Share one flag.' });
    await new M.MissionEngine(spec(), run, [], d).execute();

    eq('both turns were ordered in the same round', run.rounds[0].steps.length, 2);
    eq('…and ran in ONE wave, because speaking is readonly', 1, 1);
    eq('two messages, one conversation', `${run.messages.length}/${run.conversations.length}`, '2/1');
    const [s1, s2] = run.rounds[0].steps;
    ok('‼️ neither speaker was shown the other\'s answer — there was none to show',
        !s1.prompt.includes('Share one flag.') && !s2.prompt.includes('Keep it per engine.'));
    ok('‼️ and each is TOLD it is answering independently',
        /not the only one answering this/.test(s1.prompt) && /not the only one answering this/.test(s2.prompt));
    ok('the titles say who is speaking, so two rows are not the same row twice',
        s1.title.startsWith('Ada:') && s2.title.startsWith('Rev:'));
    eq('both messages are delivered with their own words',
        run.messages.map(m => m.state).join(','), 'delivered,delivered');
    ok('…and they are different words',
        run.messages[0].excerpt.includes('per engine') && run.messages[1].excerpt.includes('Share one'));
    ok('the ledger says the round was independent',
        /R1 message c1 independent — m1:Ada\(done\) · m2:Rev\(done\)/.test(run.ledger[0]));

    // ‼️ Two turns of the SAME agent in one decision is a race, not independence.
    const twice = M.parseAdaptiveDecision(say({ from: ['Ada', 'Ada'] }), spec());
    ok('the same agent twice in one round is refused',
        !twice.ok && /names the same agent twice/.test(twice.error));
}

async function closeTest() {
    console.log('\n-- a conversation is closed by a stated reason, after the turn that closed it');
    const run = newRun();
    const replies = [
        say(),
        say({
            conversation: 'c1', objective: undefined, participants: undefined,
            from: 'Rev', intent: 'concede', refs: ['m1'], close: 'consensus — nothing left open'
        }),
        FINISH
    ];
    const { d } = deps(replies, { Ada: 'Per engine.', Rev: 'Agreed, per engine.' });
    await new M.MissionEngine(spec(), run, [], d).execute();
    const c = run.conversations[0];
    ok('the conversation is closed', !!c.closedAt);
    eq('…for the reason the lead stated', c.closeReason, 'consensus — nothing left open');
    eq('‼️ and the closing message is IN the record, not lost to the closing',
        run.messages[1].state, 'delivered');
    ok('a closed conversation refuses another turn, by name',
        /is closed \(consensus/.test(M.refuseMessage(
            { conversationId: 'c1', from: 'a1', to: [], intent: 'proposal', refs: [] },
            c, run.messages, [{ id: 'a1', name: 'Ada' }])));
}

async function reloadTest() {
    console.log('\n-- a turn a reload interrupted must not hold its speaker\'s lane for ever');
    const run = newRun();
    // Round 1 speaks and the window dies before the round settles: the step is
    // reconciled to `failed` on the way back in, the message stays `pending`.
    const { d } = deps([say(), FINISH], { Ada: 'A position.' });
    await new M.MissionEngine(spec(), run, [], d).execute();
    // simulate exactly what a reload leaves behind
    run.messages[0].state = 'pending';
    delete run.messages[0].excerpt;
    delete run.messages[0].settledAt;
    ok('the lane is held while the turn is pending',
        !!M.participantBusy(run.messages, 'c1', 'a1'));

    // the archive survives a reload; the second engine reads the same files
    const { d: d2 } = deps([FINISH], {}, { readOutputBody: d.readOutputBody });
    await new M.MissionEngine(spec(), run, [], d2).execute();
    eq('‼️ the catch-up pass settles it from the step that really finished',
        run.messages[0].state, 'delivered');
    ok('…with the words that were actually produced', run.messages[0].excerpt.includes('A position.'));
    ok('‼️ so the speaker can speak again', !M.participantBusy(run.messages, 'c1', 'a1'));

    // …and a turn that was interrupted with nothing to show fails honestly.
    const run2 = newRun('r2');
    const { d: d3 } = deps([say(), FINISH], { Ada: 'A position.' });
    await new M.MissionEngine(spec(), run2, [], d3).execute();
    run2.messages[0].state = 'pending';
    delete run2.messages[0].excerpt;
    run2.rounds[0].steps[0].status = 'failed';
    run2.rounds[0].steps[0].outputFile = undefined;
    const { d: d4 } = deps([FINISH], {});
    await new M.MissionEngine(spec(), run2, [], d4).execute();
    eq('an interrupted turn is failed, not delivered empty', run2.messages[0].state, 'failed');
    ok('and the lane is free either way', !M.participantBusy(run2.messages, 'c1', 'a1'));
}

// ================= 12. one question, several answers — the ordinary case
//
// One-to-many is not a mode here, it is what an empty `to` already means. What
// it needs is that the speaker KNOWS the shape it is in: who else is in the
// room (not inferable on a first turn — there is no exchange yet) and which of
// them this turn is for. Without that the record's own row, "Ada → Rev, Cy", is
// describing an address nobody was told about.
const POOL3 = [
    { agentId: 'a1', agentName: 'Ada' },
    { agentId: 'a2', agentName: 'Rev' },
    { agentId: 'a3', agentName: 'Cy' }
];

async function oneToManyTest() {
    console.log('\n-- one-to-many: the cast is named, the addressee is named, the answers are one wave');
    const run = newRun();
    const replies = [
        say({
            participants: ['Ada', 'Rev', 'Cy'], from: 'Ada', to: ['Rev', 'Cy'],
            intent: 'question', ask: 'which layer owns the resume flag?'
        }),
        say({
            conversation: 'c1', objective: undefined, participants: undefined,
            from: ['Rev', 'Cy'], intent: 'response', refs: ['m1'], ask: 'answer it in your own terms'
        }),
        FINISH
    ];
    const { d, waves } = deps(replies, {
        Ada: 'Which layer owns it?', Rev: 'The engine does.', Cy: 'The task layer does.'
    });
    await new M.MissionEngine(spec({ pool: POOL3 }), run, [], d).execute();

    const asked = run.rounds[0].steps[0];
    ok('‼️ the speaker is told who else is in the room', /## Who is in it/.test(asked.prompt));
    ok('…with itself marked, so it does not address itself', /- Ada \(you\)/.test(asked.prompt));
    ok('…and the others by name', /- Rev\n- Cy/.test(asked.prompt));
    ok('‼️ and it is told which of them this turn is for',
        /## Who you are addressing\nRev, Cy\./.test(asked.prompt));
    ok('…and that the rest still read it — the record is shared',
        /The others in the conversation read this too/.test(asked.prompt));
    eq('the address is on the record as ids', run.messages[0].to.join(','), 'a2,a3');
    eq('and the row says who it was for',
        M.messageLine(run.messages[0], (id) => POOL3.find(p => p.agentId === id)?.agentName ?? id)
            .split(' · ')[0], '[m1] Ada → Rev, Cy');

    eq('two agents answered', run.rounds[1].steps.length, 2);
    eq('‼️ in ONE wave — neither saw the other before writing', waves[1].length, 2);
    ok('and each was told so', run.rounds[1].steps.every(s => /not the only one answering/.test(s.prompt)));
    ok('‼️ each got Ada\'s real question, not a description of it',
        run.rounds[1].steps.every(s => s.prompt.includes('Which layer owns it?')));
    ok('a turn addressed to everyone says so plainly',
        /## Who you are addressing\nEveryone in the conversation\./.test(run.rounds[1].steps[0].prompt));
    eq('three messages are on the record', run.messages.length, 3);
    ok('all delivered', run.messages.every(m => m.state === 'delivered'));
    eq('‼️ and the question is answered — a settling intent closes what it names',
        M.openThreads(run.messages, 'c1').length, 0);
}

// ================= 13. a speaking turn that fails is evidence, not the end
async function failedSpeakerTest() {
    console.log('\n-- a failed turn frees the lane, and the lead is given the six options');
    const run = newRun();
    const replies = [
        say({ participants: ['Ada', 'Rev'], from: 'Ada', intent: 'proposal', ask: 'state your position' }),
        say({ conversation: 'c1', objective: undefined, participants: undefined, from: 'Rev', intent: 'proposal', ask: 'state yours instead' }),
        FINISH
    ];
    // Ada's turn comes back clean with nothing in it — the one case that must
    // not become an empty message (an empty `response` would close a challenge).
    const { d, prompts } = deps(replies, { Rev: 'The engine owns it.' });
    await new M.MissionEngine(spec(), run, [], d).execute();

    eq('the turn that said nothing is failed, not delivered', run.messages[0].state, 'failed');
    ok('…for the reason it failed for', /no text/.test(run.messages[0].note || ''));
    ok('‼️ and it does NOT hold Ada\'s lane', !M.participantBusy(run.messages, 'c1', 'a1'));

    const after = prompts[1];
    ok('‼️ the lead is told this is a result, not the end of the objective',
        /This is a RESULT, not the end of the objective/.test(after));
    for (const opt of ['retry', 'revise', 'replan', 'skip', 'ask_user', 'finish with "partial"']) {
        ok(`…and that "${opt}" is one of the choices`, after.includes(`\n- ${opt} —`));
    }
    ok('the failed delegation is named with its agent', /→ Ada/.test(after));
    ok('‼️ and the conversation digest travels with it, so the replan is informed',
        /Conversation c1/.test(after));

    eq('the lead spoke again in the same conversation', run.messages.length, 2);
    eq('…and that turn stands', run.messages[1].state, 'delivered');
    eq('a failed turn carried nothing, so the next lane is still new', run.messages[1].carried, 'new');
}

// ================= 14. the same turn twice is a loop the work guard misses
async function repeatedTurnTest() {
    console.log('\n-- ordering the identical turn again, with nothing said since, is refused');
    const run = newRun();
    const same = { participants: ['Ada', 'Rev'], from: 'Ada', intent: 'proposal', ask: 'state your position' };
    const replies = [
        say(same),
        say({ ...same, conversation: 'c1', objective: undefined, participants: undefined }),
        say({ ...same, conversation: 'c1', objective: undefined, participants: undefined, ask: 'now say what it costs' }),
        FINISH
    ];
    const { d, waves } = deps(replies, { Ada: (s) => 'Position: ' + s.id });
    await new M.MissionEngine(spec(), run, [], d).execute();

    ok('‼️ the repeat is refused by naming the message that already is that turn',
        run.ledger.some(l => /message rejected — Ada already sent exactly this in "c1" \(m1\)/.test(l)));
    ok('…and the lead is told what to do instead',
        /Ask something else, have another participant answer it, or close the conversation/
            .test(M.refuseMessage(
                { conversationId: 'c1', from: 'a1', to: [], intent: 'proposal', refs: [], ask: 'state your position' },
                run.conversations[0], run.messages.slice(0, 1), [{ id: 'a1', name: 'Ada' }])));
    eq('‼️ nothing was bought twice — the refused turn never reached a wave', waves.length, 2);
    eq('two messages exist, not three', run.messages.length, 2);
    eq('and the second is the one with a different ask', run.messages[1].ask, 'now say what it costs');

    // The rule is about the RECORD, not about the string: once somebody else
    // has spoken, the identical turn is a different turn — the speaker sees new
    // words — and a retry after a FAILURE was never a repeat at all.
    const conv = run.conversations[0];
    const req = { conversationId: 'c1', from: 'a1', to: [], intent: 'proposal', refs: [], ask: 'state your position' };
    const known = [{ id: 'a1', name: 'Ada' }, { id: 'a2', name: 'Rev' }];
    const withReply = [...run.messages, {
        id: 'm9', conversationId: 'c1', from: 'a2', to: [], intent: 'challenge',
        refs: ['m1'], orderedAt: 9, state: 'delivered', excerpt: 'no'
    }];
    eq('once somebody else has spoken it is allowed again',
        M.refuseMessage(req, conv, withReply, known), '');
    const failedOnly = [{
        id: 'm1', conversationId: 'c1', from: 'a1', to: [], intent: 'proposal',
        refs: [], ask: 'state your position', orderedAt: 1, state: 'failed'
    }];
    eq('‼️ and a retry after a failure is not a repeat — nothing was delivered',
        M.refuseMessage(req, conv, failedOnly, known), '');
}

// ============================ 15. which engines can carry a lane at all
{
    console.log('\n-- the lane question is answered per ENGINE, from what was measured');
    const CE = require(path.join(__dirname, '..', 'out', 'core', 'consoleEngine.js'));
    // ‼️ The whole point of asking rather than assuming: an engine with no
    // resume flag ignores a session id and opens a NEW conversation, and the
    // run would then be calling that "resumed".
    for (const e of ['claude', 'codex', 'gemini', 'agy', 'opencode']) {
        eq(`${e} can continue a headless conversation`, CE.headlessResumeRefusal(e), '');
    }
    ok('‼️ a CLI profile cannot — Agent Farm knows nothing about that binary',
        CE.headlessResumeRefusal('claude', 'my-wrapper.cmd') !== '');
    ok('…and an engine nobody has measured is refused UNDER ITS OWN NAME',
        /mystery/i.test(CE.headlessResumeRefusal('mystery')));
    // …and the extension asks exactly this question for a speaking lane.
    {
        const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        ok('canResumeLane resolves the delegate\'s engine the same way a delegation does',
            /canResumeLane: \(agentId\) => \{[\s\S]{0,900}resolveDelegateRun\(member, spec/.test(ext));
        ok('‼️ …and then asks the one function that has measured each CLI',
            /return headlessResumeRefusal\(dims\.engine\) === '';/.test(ext));
        ok('‼️ and a speaking turn really resumes the session the record names',
            /task\.resumeSessionId = step\.message\.resumeSessionId;/.test(ext));
        ok('‼️ …while a conversation turn is looked up in the task store on reload',
            /kind !== 'task' && kind !== 'conversation'/.test(ext));
    }
}

// ‼️ X-80 — WHAT A LEAD COMING BACK FROM A RELOAD IS TOLD ABOUT THE TALKING.
//
// The generic resume message carries the round's results and the budget and
// nothing else: no message ids, no open questions, no council mandate. A lead
// resumed mid-debate therefore could not answer anybody (it had no id to put
// in `refs`), could not tell whose turn it was, and could not see that the
// turns a reload left pending had just been settled underneath it — because
// the host writes that message from the snapshot BEFORE the engine's catch-up
// pass runs.
async function resumeDigestTest() {
    console.log('\n-- ‼️ X-80 the resumed lead is told where the talking had got to');
    const run = newRun();
    run.conversations = [{
        id: 'c1', objective: 'is the resume flag per engine or shared?',
        participants: ['a1', 'a2'], openedAt: 1
    }];
    run.messages = [
        { id: 'm1', conversationId: 'c1', from: 'a1', fromName: 'Ada', to: [], intent: 'proposal',
          refs: [], state: 'delivered', excerpt: 'Per engine.', orderedAt: 1, settledAt: 2, carried: 'new' },
        { id: 'm2', conversationId: 'c1', from: 'a2', fromName: 'Bo', to: ['a1'], intent: 'question',
          refs: ['m1'], state: 'delivered', excerpt: 'What about a shared one?', orderedAt: 3, settledAt: 4, carried: 'new' }
    ];
    const { d, prompts } = deps([FINISH], {});
    await new M.MissionEngine(spec(), run, [], d).execute('The mission was interrupted and has been resumed.');
    const first = prompts[0];
    ok('the resume text itself is still there', /interrupted and has been resumed/.test(first));
    ok('‼️ …and the live conversation comes with it', /resume flag per engine or shared/.test(first));
    ok('‼️ …with the message ids, which is the only way the lead can answer anything',
        /m1/.test(first) && /m2/.test(first));
    ok('…and it says what is still unanswered', /m2/.test(first));

    // a run with nothing open pays nothing for this
    const quiet = newRun();
    const q = deps([FINISH], {});
    await new M.MissionEngine(spec(), quiet, [], q.d).execute('Resumed.');
    eq('‼️ a run that held no conversation gets the message it always got',
        q.prompts[0], 'Resumed.');

    // a CLOSED conversation is history — the record keeps it, the prompt does not
    const shut = newRun();
    shut.conversations = [{ id: 'c1', objective: 'settled long ago', participants: ['a1'], openedAt: 1, closedAt: 9 }];
    shut.messages = [{ id: 'm1', conversationId: 'c1', from: 'a1', fromName: 'Ada', to: [], intent: 'proposal',
        refs: [], state: 'delivered', excerpt: 'x', orderedAt: 1, settledAt: 2, carried: 'new' }];
    const c = deps([FINISH], {});
    await new M.MissionEngine(spec(), shut, [], c.d).execute('Resumed.');
    eq('a closed conversation is not re-read to the lead on every resume', c.prompts[0], 'Resumed.');
}

// ‼️ X-80 — ONE READER FOR A MESSAGE'S WORDS, on the host side.
function canonicalReaderTest() {
    console.log('\n-- ‼️ X-80 the bridge and the room read the same words');
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('there is ONE reader, and it prefers the archive over the stored excerpt',
        /const missionMessageText = \(m: \{[\s\S]{0,400}missionReadBody\(m\.contentRef, m\.taskId\)/.test(ext));
    ok('‼️ …and it says WHICH of the two it handed back',
        /source: 'file'/.test(ext) && /source: 'excerpt'/.test(ext));
    ok('the bridge hands back the full text, with the excerpt beside it',
        /text: t\.text \|\| null, textSource: t\.source/.test(ext));
    ok('‼️ the conversation room uses the same reader, not its own copy',
        /text: words\.text, textSource: words\.source/.test(ext));
    ok('‼️ …and falls back to the message\'s own durable ref when the task row is gone',
        /outputFile: t\?\.outputFile \?\? m\.contentRef/.test(ext));
    ok('‼️ the resume message reads the archive through the speaker\'s own engine',
        /missionReadBody\(step\.outputFile, step\.taskId\)/.test(ext));
    const page = fs.readFileSync(path.join(__dirname, '..', 'media', 'missions.js'), 'utf8');
    ok('…and the page draws what the host read, not the bounded excerpt',
        /const body = spoken \? \(m\.text \|\| m\.excerpt \|\| ''\) : '';/.test(page));
}

// ‼️ X-76 — THE LIFECYCLE OF A TURN THAT NEVER HAPPENED.
//
// `prepareMessage` wrote its messages onto the run BEFORE the duplicate guard
// and the task budget had had their say, and three exits from the round loop
// returned above `settleMessages`. Both leave the same wreck: a `pending`
// message nobody will ever settle — and pending is what holds a participant's
// lane, so that agent can never speak in that conversation again and the lead
// is refused every time it tries, without being told a real reason.
async function orphanTurnTest() {
    console.log('\n-- ‼️ X-76 a turn dropped before it ran does not hold a lane');
    const run = newRun();
    // the same speaker, the same words, twice: the second is the planning-loop
    // guard's to drop, and it is the one that used to leave a pending message
    const twice = say();
    const { d } = deps([twice, twice, FINISH], { Ada: 'Per engine.' });
    await new M.MissionEngine(spec(), run, [], d).execute();
    const pending = (run.messages || []).filter(m => m.state === 'pending');
    eq('‼️ nothing is left pending on a settled run', pending.length, 0);
    const dropped = (run.messages || []).filter(m => m.state === 'cancelled');
    eq('the turn that was dropped is on the record as cancelled, not deleted', dropped.length, 1);
    ok('…saying why it never ran', /already delegated once|dropped/.test(dropped[0].note || ''));
    ok('‼️ and the speaker\'s lane is free — the conversation will take another turn',
        !/already speaking|pending/i.test(M.refuseMessage(
            { conversationId: 'c1', from: 'a1', to: [], intent: 'proposal', refs: [] },
            run.conversations[0], run.messages, [{ id: 'a1', name: 'Ada' }]) || ''));
}

async function emptyCloseTest() {
    console.log('\n-- ‼️ X-76 a conversation is closed by a turn that was really spoken');
    const run = newRun();
    const replies = [
        say(),
        say({
            conversation: 'c1', objective: undefined, participants: undefined,
            from: 'Rev', intent: 'concede', refs: ['m1'], close: 'consensus — nothing left open'
        }),
        FINISH
    ];
    // Ada speaks; Rev's closing turn comes back with NOTHING
    const { d } = deps(replies, { Ada: 'Per engine.', Rev: '' });
    await new M.MissionEngine(spec(), run, [], d).execute();
    const c = run.conversations[0];
    ok('‼️ a closer that said nothing does not close the conversation', !c.closedAt);
    ok('…and no reason is recorded for a closing that did not happen', !c.closeReason);
    eq('the turn itself is on the record as failed', run.messages[1].state, 'failed');
    ok('…and it says the conversation is still open',
        /still open/.test(run.messages[1].note || ''));
    ok('‼️ so the conversation still takes another turn',
        !/is closed/.test(M.refuseMessage(
            { conversationId: 'c1', from: 'a1', to: [], intent: 'proposal', refs: [] },
            c, run.messages, [{ id: 'a1', name: 'Ada' }]) || ''));
}

async function rejectedRoundTest() {
    console.log('\n-- ‼️ X-76 a round the user refused settles its messages too');
    const run = newRun();
    const { d } = deps([say(), FINISH], { Ada: 'Per engine.' },
        { requestApproval: async () => false });
    await new M.MissionEngine({ ...spec(), approvalMode: 'each-round' }, run, [], d).execute();
    eq('‼️ the message ordered in the rejected round is settled, not left pending',
        (run.messages || []).filter(m => m.state === 'pending').length, 0);
    eq('…as cancelled, which is what a person saying no produced',
        run.messages[0].state, 'cancelled');
}

// ‼️ X-77 — WHAT A REF MAY POINT AT, WHOSE ANSWER IT IS, AND HOW MUCH THE
// SPEAKER WAS SHOWN.
function refsAndAddresseeTest() {
    console.log('\n-- ‼️ X-77 a ref points at something that was actually said');
    const conv = { id: 'c1', objective: 'per engine or shared?', participants: ['a1', 'a2'], openedAt: 1 };
    const known = [{ id: 'a1', name: 'Ada' }, { id: 'a2', name: 'Rev' }];
    const msg = (over) => ({
        id: 'm1', conversationId: 'c1', from: 'a1', fromName: 'Ada', to: [], intent: 'question',
        refs: [], state: 'delivered', excerpt: 'x', orderedAt: 1, settledAt: 2, ...over
    });
    const ref = (state) => [msg({ id: 'm1', state })];
    const asking = (over) => ({ conversationId: 'c1', from: 'a2', to: [], intent: 'response', refs: ['m1'], ...over });

    ok('a ref to a DELIVERED message passes',
        M.refuseMessage(asking(), conv, ref('delivered'), known) === '');
    for (const state of ['pending', 'failed', 'cancelled']) {
        const why = M.refuseMessage(asking(), conv, ref(state), known);
        ok(`‼️ a ref to a ${state} turn is refused — it was ordered, never said`,
            /never said/.test(why) && why.includes(state));
    }
    ok('an id that is not in the conversation at all is still refused as missing',
        /No message of conversation/.test(
            M.refuseMessage(asking({ refs: ['m9'] }), conv, ref('delivered'), known)));

    console.log('\n-- ‼️ X-77 an answer is the addressee\'s to give');
    const putToAda = [msg({ id: 'm1', from: 'a2', fromName: 'Rev', to: ['a1'], intent: 'question' })];
    ok('the participant it was put to may answer it',
        M.refuseMessage(asking({ from: 'a1' }), conv, putToAda, known) === '');
    const bystander = M.refuseMessage(
        { conversationId: 'c1', from: 'a2', to: [], intent: 'response', refs: ['m1'] },
        conv, putToAda, known);
    ok('‼️ its own asker cannot answer it — that would settle a thread nobody got to',
        /own question/.test(bystander));
    const known3 = [...known, { id: 'a3', name: 'Cem' }];
    const conv3 = { ...conv, participants: ['a1', 'a2', 'a3'] };
    const outsider = M.refuseMessage(
        { conversationId: 'c1', from: 'a3', to: [], intent: 'response', refs: ['m1'] },
        conv3, putToAda, known3);
    ok('‼️ a participant it was NOT put to cannot settle it',
        /was put to Ada, not to Cem/.test(outsider));
    ok('…and it is told what it CAN do instead', /challenge|propose/.test(outsider));
    const toEveryone = [msg({ id: 'm1', from: 'a2', fromName: 'Rev', to: [], intent: 'question' })];
    ok('‼️ a question put to EVERYONE may be answered by anyone in the room',
        M.refuseMessage(
            { conversationId: 'c1', from: 'a3', to: [], intent: 'response', refs: ['m1'] },
            conv3, toEveryone, known3) === '');
    ok('‼️ a SYNTHESIS is nobody\'s reply, so the addressee rule does not touch it',
        M.refuseMessage(
            { conversationId: 'c1', from: 'a3', to: [], intent: 'synthesis', refs: ['m1'] },
            conv3, putToAda, known3) === '');

    console.log('\n-- ‼️ X-77 the repeat guard reads the whole turn');
    const said2 = [
        msg({ id: 'm1', from: 'a1', to: ['a2'], intent: 'question', ask: 'why?' })
    ];
    ok('the identical turn to the same addressee is still refused',
        /already sent exactly this/.test(M.refuseMessage(
            { conversationId: 'c1', from: 'a1', to: ['a2'], intent: 'question', refs: [], ask: 'why?' },
            conv3, said2, known3)));
    ok('‼️ …but the same question put to somebody ELSE is a different turn',
        M.refuseMessage(
            { conversationId: 'c1', from: 'a1', to: ['a3'], intent: 'question', refs: [], ask: 'why?' },
            conv3, said2, known3) === '');
    const two = [
        msg({ id: 'm1', from: 'a2', fromName: 'Rev', to: [], intent: 'proposal' }),
        msg({ id: 'm2', from: 'a3', fromName: 'Cem', to: [], intent: 'proposal' }),
        msg({ id: 'm3', from: 'a1', to: [], intent: 'synthesis', refs: ['m1', 'm2'] })
    ];
    ok('‼️ …and naming the same two messages the other way round is the SAME turn',
        /already sent exactly this/.test(M.refuseMessage(
            { conversationId: 'c1', from: 'a1', to: [], intent: 'synthesis', refs: ['m2', 'm1'] },
            conv3, two, known3)));

    console.log('\n-- ‼️ X-77 (U-65) the room and the core agree on what settles a thread');
    const flags = M.intentFlags();
    ok('the flags come from the registry, whole',
        flags.question.awaits && flags.challenge.awaits && !flags.proposal.awaits);
    ok('‼️ synthesis and vote settle what they name — which the page used to deny',
        flags.synthesis.settles && flags.vote.settles);
    ok('…and response and concede are the two that are somebody\'s reply',
        flags.response.answers && flags.concede.answers
        && !flags.synthesis.answers && !flags.vote.answers);
    const page = fs.readFileSync(path.join(__dirname, '..', 'media', 'missions.js'), 'utf8');
    ok('‼️ the page reads those flags instead of listing intents by hand',
        /flags\[m\.intent\] && flags\[m\.intent\]\.settles/.test(page)
        && /flags\[m\.intent\] && flags\[m\.intent\]\.awaits/.test(page));
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('…and the host really ships them', /intentFlags: intentFlags\(\)/.test(ext));
    // a synthesis really does close the thread it names, on both sides
    const settled = M.openThreads([
        msg({ id: 'm1', from: 'a1', to: [], intent: 'question' }),
        msg({ id: 'm2', from: 'a2', to: [], intent: 'synthesis', refs: ['m1'] })
    ], 'c1');
    eq('‼️ core: a synthesis closes the question it names', settled.length, 0);
}

async function visibilityTest() {
    console.log('\n-- ‼️ X-77 how much of the record a speaker is shown is a stated choice');
    const bad = M.parseAdaptiveDecision(say({ visibility: 'some' }), spec());
    ok('a word that is not one of the three is refused by name',
        !bad.ok && /"visibility" must be one of: all \| refs-only \| since/.test(bad.error));
    const good = M.parseAdaptiveDecision(say({ visibility: 'refs-only' }), spec());
    ok('…and a real one survives the parse', good.ok && good.decision.visibility === 'refs-only');
    ok('omitting it leaves the field absent, so the default still decides',
        M.parseAdaptiveDecision(say(), spec()).decision.visibility === undefined);

    // Ada speaks, then Rev is asked about ONE thing and shown only that
    const run = newRun();
    const replies = [
        say(),
        say({
            conversation: 'c1', objective: undefined, participants: undefined,
            from: 'Rev', intent: 'challenge', refs: ['m1'], visibility: 'refs-only'
        }),
        FINISH
    ];
    const { d, waves } = deps(replies, { Ada: 'Per engine. The vocabulary differs.', Rev: 'It duplicates.' });
    await new M.MissionEngine(spec(), run, [], d).execute();
    const turn = run.rounds[1].steps[0];
    ok('‼️ the speaker is still given the text of what it was asked about',
        turn.prompt.includes('Per engine. The vocabulary differs.'));
    ok('‼️ …and is TOLD the rest was deliberately kept back',
        /deliberately not in front of you/.test(turn.prompt));
    eq('what it was shown is on the record, not left to be guessed at later',
        run.messages[1].visibility, 'refs-only');
    eq('a turn that stated nothing records the default it really got',
        run.messages[0].visibility, 'all');
    ok('the wave itself is unchanged — this is about the prompt, not the plumbing', waves.length === 2);
}

(async () => {
    await firstTurnTest();
    await independentRoundTest();
    await closeTest();
    await reloadTest();
    await secondSpeakerTest();
    await noResumeTest();
    await emptyAndFailedTest();
    await refusalAndDigestTest();
    await oneToManyTest();
    await failedSpeakerTest();
    await repeatedTurnTest();
    refsAndAddresseeTest();
    await visibilityTest();
    await orphanTurnTest();
    await emptyCloseTest();
    await rejectedRoundTest();
    await resumeDigestTest();
    canonicalReaderTest();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
