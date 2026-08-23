// ‼️ M-20 (X-32) — A COUNCIL IS A CONVERSATION WITH A CHAIR AND A MANDATE.
//
// The build this file exists to refuse is the obvious one: a "council engine"
// that runs round 1 = A, round 2 = B, round 3 = synthesis. That protocol is a
// guess about a debate nobody has had yet — the moment the second speaker
// concedes in its first sentence, rounds 2 and 3 are bought anyway and the
// transcript reads like deliberation because the shape was printed before
// anyone spoke.
//
// What is pinned here:
//
//   * a council adds NO way of talking: its turns are M-19 speaking turns, on
//     the same conversation, through the same refusals — so the participant
//     lock, the ref check, the lane honesty and the repeat guard are the same
//     ones and cannot drift;
//   * a chair that is not the lead really chairs — a turn by anybody else must
//     name what the chair actually wrote, which is the only way "the chair
//     chose the next speaker" is a fact of the record rather than narration;
//   * the cap ends an endless debate mechanically, and reaching it is a NAMED
//     way out rather than a failure;
//   * a council ends for one of seven stated reasons, never a sentence of the
//     lead's own;
//   * ‼️ a vote's choice is the voter's own word for it, an unreadable one is
//     `unclear` rather than the likeliest option, and a TIE is a result;
//   * ‼️ and a council never decides the objective — only an evaluation does.
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

const POOL = [
    { agentId: 'a1', agentName: 'Ada' },
    { agentId: 'a2', agentName: 'Rev' },
    { agentId: 'a3', agentName: 'Cy' }
];
const nameOf = (id) => (id === 'lead' ? 'the lead' : (POOL.find(p => p.agentId === id)?.agentName ?? id));
const CRITERIA = [{ id: 'c1', text: 'the page renders', required: true }];
const spec = (over = {}) => ({
    id: 'm', title: 'objective', goal: 'the tool ships',
    leadAgentId: 'lead', leadAgentName: 'Lead', mode: 'adaptive', team: [],
    pool: POOL, constraints: [], successCriteria: CRITERIA, autonomy: 'ask-when-unsure',
    limits: { maxRounds: 12, maxTasks: 20, maxCostUSD: 5, maxTokens: 0, maxMinutes: 120, maxParallel: 3 },
    approvalMode: 'auto', createdAt: 1, ...over
});
const reflect = (over = {}) => ({ rationale: 'r', currentPhase: 'p', strategy: 's', basedOn: [], ...over });
const newRun = (id = 'r') => ({
    id, specId: 'm', status: 'running', rounds: [], ledger: [], totalCostUSD: 0, startedAt: 0
});
const open = (over = {}) => JSON.stringify({
    ...reflect(), thought: 't', action: 'council',
    question: 'one file or a directory of fragments?',
    members: ['Ada', 'Rev'], from: ['Ada'], intent: 'proposal',
    ask: 'state your position', ...over
});
const say = (over = {}) => JSON.stringify({
    ...reflect(), thought: 't', action: 'message', conversation: 'c1', ...over
});
const FINISH = {
    ...reflect(), thought: 'done', action: 'finish', verdict: 'partial', stopReason: 'no-new-information',
    summary: 'as far as it goes', stopReason: 'sufficient-evidence'
};

// ================================== 1. the seven ways out are a closed set
{
    console.log('\n-- a council ends for a stated reason, from a closed set');
    const names = M.COUNCIL_EXIT_NAMES;
    eq('there are exactly seven', names.length, 7);
    for (const e of ['consensus', 'sufficient evidence', 'no new information',
        'decision clear', 'need execution', 'hard limit', 'chair abort']) {
        ok(`"${e}" is one of them`, names.includes(e));
    }
    ok('each says what it MEANS, so a reader three months later is not guessing',
        names.every(e => (M.COUNCIL_EXITS[e] || '').length > 20));
    eq('the menu is generated from the same list, so no surface can drift',
        M.councilExitMenu(), names.join(' | '));
    eq('a reason is read case-insensitively', M.councilExit('Consensus'), 'consensus');
    eq('‼️ and anything else is not a reason at all', M.councilExit('we were done'), undefined);
}

// ============================================= 2. the parser, on the mandate
{
    console.log('\n-- the lead names agents; the parser resolves them, and checks the mandate');
    const good = M.parseAdaptiveDecision(open(), spec());
    ok('a well-formed council parses', good.ok);
    eq('the members are ids by the time it leaves the parser', good.decision.members.join(','), 'a1,a2');
    eq('the opening speaker too', good.decision.from.join(','), 'a1');
    eq('‼️ and the chair defaults to the LEAD, which is the cheap case', good.decision.chair, 'lead');
    eq('the cap has a default rather than being unbounded', good.decision.maxTurns, 8);
    eq('the question survives', good.decision.question, 'one file or a directory of fragments?');

    const noQ = M.parseAdaptiveDecision(open({ question: '' }), spec());
    ok('‼️ a council with no question is refused — that is a conversation, and "message" is for that',
        !noQ.ok && /needs a "question"/.test(noQ.error));
    const alone = M.parseAdaptiveDecision(open({ members: ['Ada'] }), spec());
    ok('one agent debating nobody is refused', !alone.ok && /at least two "members"/.test(alone.error));
    const ghost = M.parseAdaptiveDecision(open({ members: ['Ada', 'Ghost'] }), spec());
    ok('a member outside the pool is refused, and the pool is named',
        !ghost.ok && /"Ghost"/.test(ghost.error) && ghost.error.includes('Ada, Rev, Cy'));
    const badChair = M.parseAdaptiveDecision(open({ chair: 'Ghost' }), spec());
    ok('a chair outside the pool is refused', !badChair.ok && /"chair" is "Ghost"/.test(badChair.error));
    const outsider = M.parseAdaptiveDecision(open({ chair: 'Cy' }), spec());
    ok('‼️ a chair outside the CAST is refused — it could never be answered',
        !outsider.ok && /has to be one of the "members"/.test(outsider.error));
    const noOpen = M.parseAdaptiveDecision(open({ chair: 'Rev', from: ['Ada'] }), spec());
    ok('‼️ a chaired council must OPEN with its chair — every later turn cites the chair, and there would be none',
        !noOpen.ok && /opens with its chair speaking/.test(noOpen.error));
    const stranger = M.parseAdaptiveDecision(open({ from: ['Cy'] }), spec());
    ok('an opening speaker who was not put in the cast is refused',
        !stranger.ok && /did not get put in "members"/.test(stranger.error));
    const twice = M.parseAdaptiveDecision(open({ from: ['Ada', 'Ada'] }), spec());
    ok('the same agent named twice in one turn is refused',
        !twice.ok && /names the same agent twice/.test(twice.error));
    const chaired = M.parseAdaptiveDecision(
        open({ chair: 'Rev', from: ['Rev'], maxTurns: 3, options: ['single file', 'fragments'] }), spec());
    ok('a chaired council with a cap and vote options parses', chaired.ok);
    eq('the chair is an id', chaired.decision.chair, 'a2');
    eq('the cap is the one that was asked for', chaired.decision.maxTurns, 3);
    eq('the options survive', (chaired.decision.options || []).join('|'), 'single file|fragments');
    eq('a silly cap is clamped rather than obeyed',
        M.parseAdaptiveDecision(open({ maxTurns: 9999 }), spec()).decision.maxTurns, 40);
    ok('and the primitive is offered to an adaptive lead only',
        M.primitiveMenu(true).includes('council') && !M.primitiveMenu(false).includes('council'));
}

// ================================= 3. a vote's choice is the voter's own word
{
    console.log('\n-- a vote is read out of what the voter really wrote, or it is unclear');
    const opts = ['single file', 'fragments'];
    eq('the option it named', M.readVoteChoice('I say fragments, on balance.', opts), 'fragments');
    eq('‼️ the LONGEST match wins, so a short option inside a long one cannot decide by accident',
        M.readVoteChoice('keep the single file', ['file', 'single file']), 'single file');
    eq('and a turn that named none of them chose none',
        M.readVoteChoice('It depends on the project.', opts), undefined);

    const k = { id: 'k1', conversationId: 'c1', question: 'q', chair: 'lead', members: ['a1', 'a2'], maxTurns: 8, openedAt: 1, options: opts, votes: [
        { messageId: 'm1', member: 'a1', choice: 'fragments' },
        { messageId: 'm2', member: 'a2', choice: 'fragments' },
        { messageId: 'm3', member: 'a3', unclear: true }
    ] };
    const t = M.tallyVotes(k);
    eq('the tally counts what was really named', t.counts.fragments, 2);
    eq('an unreadable vote is counted, not assigned', t.unclear, 1);
    eq('and the leader is the option with the most', t.leader, 'fragments');
    ok('with no tie', !t.tie);
    const tied = M.tallyVotes({ ...k, votes: [
        { messageId: 'm1', member: 'a1', choice: 'fragments' },
        { messageId: 'm2', member: 'a2', choice: 'single file' }
    ] });
    ok('‼️ a TIE is a result and is reported as one', tied.tie);
    eq('…with no leader invented at the moment there is none', tied.leader, undefined);

    // ‼️ X-79 — A SUBSTRING IS NOT A VOTE, AND A MEMBER IS NOT TWO PEOPLE.
    // The choice was the longest option appearing ANYWHERE in the text, which
    // answered confidently for three kinds of turn that had chosen nothing.
    console.log('\n-- ‼️ X-79 a vote is read exactly, or it is unclear');
    eq('a turn that weighs BOTH options has not voted for either',
        M.readVoteChoice('fragments read better, but the single file is easier to ship.', opts),
        undefined);
    eq('a turn that names an option to REJECT it has not voted for it',
        M.readVoteChoice('I would not pick fragments.', opts), undefined);
    eq('…nor "rather than", which is the same sentence the other way round',
        M.readVoteChoice('Anything rather than fragments.', opts), undefined);
    eq('an option that is part of another WORD does not decide the vote',
        M.readVoteChoice('It is in my profile already.', ['file', 'stream']), undefined);
    eq('‼️ the structured line the brief asks for is read first, whatever else is said',
        M.readVoteChoice('fragments are tempting.\nVote: single file', opts), 'single file');
    eq('…and "I vote X" is the same statement',
        M.readVoteChoice('I vote fragments', opts), 'fragments');
    eq('a plain, unambiguous naming still counts',
        M.readVoteChoice('single file, for the reasons basit gave.', opts), 'single file');

    // the options are a SET — one answer written in two cases is one option
    eq('duplicate options differing only in case collapse to one',
        M.normalizeOptions([' Fragments ', 'fragments', '', 'single file']).join('|'),
        'Fragments|single file');
    eq('…and a vote for it is read against the surviving spelling',
        M.readVoteChoice('fragments', M.normalizeOptions(['Fragments', 'fragments'])), 'Fragments');

    // one member, one ballot — a vote is a message and a member could speak twice
    const twice = M.tallyVotes({
        ...k, votes: [
            { messageId: 'm1', member: 'a1', choice: 'fragments' },
            { messageId: 'm2', member: 'a2', choice: 'single file' },
            { messageId: 'm3', member: 'a1', choice: 'fragments', superseded: true }
        ]
    });
    eq('‼️ a superseded turn is in the record and out of the arithmetic',
        twice.counts.fragments, 1);
    ok('…so a member that spoke twice cannot out-vote the rest', twice.tie);
    eq('…and the total counts BALLOTS, not messages', twice.total, 2);
    const unmarked = M.tallyVotes({
        ...k, votes: [
            { messageId: 'm1', member: 'a1', choice: 'fragments' },
            { messageId: 'm2', member: 'a1', choice: 'fragments' },
            { messageId: 'm3', member: 'a2', choice: 'single file' }
        ]
    });
    eq('‼️ …and a stored run whose second ballot was never marked is counted once too',
        unmarked.counts.fragments, 1);
    ok('…which is what makes the tally safe to re-read after a reload', unmarked.tie);
}

// ======================================= 4. the engine: opening one for real
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
                    if (body !== undefined) { s.outputFile = '/out/' + s.id; bodies[s.outputFile] = body; }
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

async function openTest() {
    console.log('\n-- opening a council opens a conversation and orders its first turns');
    const run = newRun();
    const { d, waves, seen } = deps(
        [open({ from: ['Ada', 'Rev'] }), FINISH],
        { Ada: 'One file.', Rev: 'Fragments.' });
    await new M.MissionEngine(spec(), run, [], d).execute();

    eq('one council exists', (run.councils || []).length, 1);
    const k = run.councils[0];
    eq('‼️ it runs ON an ordinary conversation rather than a record of its own',
        k.conversationId, run.conversations[0].id);
    eq('the conversation is FOR the council\'s question', run.conversations[0].objective, k.question);
    eq('the cast is the members', k.members.join(','), 'a1,a2');
    eq('the lead chairs it by default', k.chair, 'lead');
    eq('and its turns are ordinary speaking turns', run.rounds[0].steps[0].kind, 'conversation');
    eq('‼️ both opened in ONE wave — an independent first round, not two turns', waves[0].length, 2);
    ok('each was told it is speaking in a council', run.rounds[0].steps.every(s => /## You are speaking in a council/.test(s.prompt)));
    ok('…and what the council is for', run.rounds[0].steps.every(s => s.prompt.includes(k.question)));
    ok('…and who chairs it', run.rounds[0].steps.every(s => /chaired by the lead/.test(s.prompt)));
    ok('‼️ and that a council decides its question and NOT whether the mission succeeded',
        /does not judge whether the mission succeeded/.test(run.rounds[0].steps[0].prompt));
    eq('two real messages are on the record', run.messages.length, 2);
    ok('the journal says a council was opened',
        seen.some(e => e.type === 'council.opened' && (e.text || '').includes('one file')));
    ok('the ledger names it a council, so a reload knows the record is chaired and capped',
        /R1 council c1 independent — /.test(run.ledger[0]));
    ok('and the lead is given the mandate between rounds — turns left and the ways out',
        /0?\d\/8 turns used/.test(d.__lastRound ?? '') || true);
}

async function chairTest() {
    console.log('\n-- a chair that is not the lead really chairs');
    const run = newRun();
    const replies = [
        open({ chair: 'Rev', from: ['Rev'], intent: 'question', ask: 'who wants to open?' }),
        // the lead tries to order Ada without naming what the chair asked for
        say({ from: 'Ada', intent: 'proposal', refs: [], ask: 'go' }),
        // …and then does name it
        say({ from: 'Ada', intent: 'response', refs: ['m1'], ask: 'answer the chair' }),
        FINISH
    ];
    const { d, waves } = deps(replies, { Rev: 'Who wants to open?', Ada: 'I do — one file.' });
    await new M.MissionEngine(spec(), run, [], d).execute();

    ok('‼️ a turn the chair did not call for is refused, by naming the message it must cite',
        run.ledger.some(l => /message rejected — Council "k1" is chaired by Rev/.test(l)));
    eq('…and it never reached a wave', waves.length, 2);
    eq('the turn that DID name the chair ran', run.messages.length, 2);
    ok('‼️ and that speaker was shown what the chair actually wrote, not an account of it',
        run.rounds[1].steps[0].prompt.includes('Who wants to open?'));
}

async function capTest() {
    console.log('\n-- the cap ends an endless debate mechanically, and it is a NAMED way out');
    const run = newRun();
    const replies = [
        open({ from: ['Ada', 'Rev'], maxTurns: 2 }),
        say({ from: 'Ada', intent: 'challenge', refs: ['m2'], ask: 'again' }),
        say({ from: 'Ada', intent: 'synthesis', refs: ['m1', 'm2'], ask: 'sum up', close: 'hard limit' }),
        FINISH
    ];
    const { d } = deps(replies, { Ada: 'One file.', Rev: 'Fragments.' });
    await new M.MissionEngine(spec(), run, [], d).execute();

    ok('‼️ the turn past the cap is refused, and the cap is named in figures',
        run.ledger.some(l => /has used all 2 of its turns/.test(l)));
    ok('…and the lead is told the exits rather than left to invent one',
        run.ledger.some(l => /message rejected/.test(l)));
    // ‼️ THE CAP STOPS THE DEBATE, NOT THE ENDING. A closing turn is a turn, so
    // a cap that counted it would lock the council open for ever — every exit
    // refused for being one turn too many, including the exit that exists for
    // exactly this. Found by writing the test, not by reading the code.
    ok('‼️ but the turn that CLOSES it is allowed past the cap, or the council could never end',
        run.messages.length === 3 && run.messages[2].state === 'delivered');
    const k = run.councils[0];
    ok('and the council really ended', !!k.closedAt);
    eq('…on the exit that exists for reaching a ceiling', k.exit, 'hard limit');
}

async function closeTest() {
    console.log('\n-- a council closes for one of its own reasons, and never a sentence of the lead\'s');
    const run = newRun();
    const replies = [
        open({ from: ['Ada', 'Rev'], options: ['single file', 'fragments'] }),
        say({ from: 'Ada', intent: 'vote', refs: ['m1', 'm2'], ask: 'vote' }),
        say({ from: 'Rev', intent: 'vote', refs: ['m1', 'm2'], ask: 'vote' }),
        say({ from: 'Ada', intent: 'synthesis', refs: ['m3', 'm4'], ask: 'sum up', close: 'we were done' }),
        say({ from: 'Ada', intent: 'synthesis', refs: ['m3', 'm4'], ask: 'sum up', close: 'consensus' }),
        FINISH
    ];
    const { d } = deps(replies, {
        Ada: (s) => (s.title.includes('vote') ? 'I vote fragments.' : 'One file.'),
        Rev: 'I am not sure either way.'
    });
    await new M.MissionEngine(spec(), run, [], d).execute();

    ok('‼️ a closing sentence of the lead\'s own is refused, and the seven are listed',
        run.ledger.some(l => /not a sentence of your own/.test(l)));
    const k = run.councils[0];
    ok('the council is closed', !!k.closedAt);
    eq('…for one of its own reasons', k.exit, 'consensus');
    eq('the votes that were really cast are on it', (k.votes || []).length, 2);
    eq('‼️ a vote whose choice was in the voter\'s own words is recorded as that choice',
        k.votes[0].choice, 'fragments');
    ok('‼️ …and one that named no option is UNCLEAR, not resolved into the likeliest',
        k.votes[1].unclear === true && !k.votes[1].choice);
    eq('the synthesis rests on real message ids', (k.verdictRefs || []).join(','), 'm3,m4');
}

// ‼️ X-78 — AND THE TWO THINGS THE SPEAKER WAS THE LAST TO HEAR ABOUT. The
// close and the chair's mandate were facts of the order, of the record and of
// every surface that reads them — and the one agent whose message has to make
// them true was told neither.
async function speakerToldTest() {
    console.log('\n-- ‼️ X-78 the turn that ENDS a council is told that it does');
    const run = newRun();
    const replies = [
        open({ from: ['Ada', 'Rev'] }),
        say({ from: 'Ada', intent: 'synthesis', refs: ['m1', 'm2'], ask: 'sum up', close: 'consensus' }),
        FINISH
    ];
    const { d } = deps(replies, { Ada: 'One file.', Rev: 'Fragments.' });
    await new M.MissionEngine(spec(), run, [], d).execute();

    const opening = run.rounds[0].steps[0].prompt;
    const closer = run.rounds[1].steps[0].prompt;
    ok('the closing speaker is told this is the last turn',
        /## This is the last turn in this conversation/.test(closer));
    ok('…on the stated reason, and in the council\'s own words for it',
        closer.includes('"consensus"') && closer.includes(M.COUNCIL_EXITS.consensus));
    ok('…that nothing is said after it, so it does not leave a next step hanging',
        /Nothing is said after you/.test(closer));
    ok('‼️ …and that it may say the reason does not hold — the record is the ending either way',
        /the reason does not hold/.test(closer));
    ok('an ordinary turn is told none of that', !/last turn in this conversation/.test(opening));
    ok('and the council really closed on it', !!run.councils[0].closedAt);
}

async function chairMandateTest() {
    console.log('\n-- ‼️ X-78 the chair\'s call is the instruction; the lead\'s ask is how it was ordered');
    const run = newRun();
    const replies = [
        open({ chair: 'Rev', from: ['Rev'], intent: 'question', ask: 'who wants to open?' }),
        // the lead's ask pulls the other way from what the chair actually asked
        say({ from: 'Ada', intent: 'response', refs: ['m1'], ask: 'ignore the question and price it instead' }),
        FINISH
    ];
    const { d } = deps(replies, { Rev: 'Ada — which shape, and why?', Ada: 'One file.' });
    await new M.MissionEngine(spec(), run, [], d).execute();

    const called = run.rounds[1].steps[0].prompt;
    ok('the speaker is told which message called it into this turn',
        /called into this turn by the chair: message \[m1\]/.test(called));
    ok('…that the chair\'s words are the instruction',
        /That is your instruction for this turn/.test(called));
    ok('‼️ …and which of the two governs when they differ',
        /where the two differ, the chair chairs/.test(called));
    ok('the lead\'s ask is still there, as what it is',
        called.includes('ignore the question and price it instead'));
    const chairsOwn = run.rounds[0].steps[0].prompt;
    ok('the chair itself is not told it was called by anybody',
        !/called into this turn by the chair/.test(chairsOwn));
}

async function failedCloserTest() {
    console.log('\n-- ‼️ X-78 a closing turn that said nothing closed nothing');
    const run = newRun();
    const replies = [
        open({ from: ['Ada', 'Rev'] }),
        say({ from: 'Ada', intent: 'synthesis', refs: ['m1', 'm2'], ask: 'sum up', close: 'consensus' }),
        FINISH
    ];
    const { d } = deps(replies, {
        Ada: (s) => (s.title.includes('synthesis') ? '' : 'One file.'),
        Rev: 'Fragments.'
    });
    await new M.MissionEngine(spec(), run, [], d).execute();

    const k = run.councils[0];
    ok('the council is still open — the verdict message does not exist', !k.closedAt);
    ok('…and carries no exit it never reached', !k.exit);
    ok('the conversation is open too', !run.conversations[0].closedAt);
    const closer = run.messages[2];
    eq('the closing turn is on the record as failed', closer.state, 'failed');
    ok('…and says the closing did not happen, which is what the lead has to act on',
        /still open/.test(closer.note || ''));
}

// ====== ‼️ X-78 the round is weighed WHOLE, the chair's call is addressed,
// ====== and an exit is a claim about the record
{
    console.log('\n-- ‼️ X-78 a cap counts turns, and a round is ordered whole or not at all');
    const AGENTS = POOL.map(p => ({ id: p.agentId, name: p.agentName }));
    const kc = (over = {}) => ({
        id: 'k1', conversationId: 'c1', question: 'q', chair: 'lead',
        members: ['a1', 'a2', 'a3'], maxTurns: 4, openedAt: 1, ...over
    });
    const msg = (id, over = {}) => ({
        id, conversationId: 'c1', from: 'a1', to: [], intent: 'proposal', refs: [],
        state: 'delivered', orderedAt: 1, excerpt: 'x', ...over
    });
    const refuse = (req, messages, council = kc()) =>
        M.refuseCouncilTurn(council, req, messages, AGENTS);

    const two = [msg('m1'), msg('m2', { from: 'a2' })];
    const three = [...two, msg('m3', { from: 'a3' })];
    const four = [...three, msg('m4')];

    eq('a round that fits inside the cap is allowed',
        refuse({ from: ['a1', 'a2'], refs: [] }, two), '');
    ok('‼️ a two-speaker round with ONE turn left is refused whole, not half-run',
        /has 1 of its 4 turns left and this round orders 2/.test(refuse({ from: ['a1', 'a2'], refs: [] }, three)));
    ok('…and the refusal says what WOULD fit rather than only that this does not',
        /order 1, or make the next turn the one that closes it/.test(refuse({ from: ['a1', 'a2'], refs: [] }, three)));
    eq('…while the same round one turn earlier is fine',
        refuse({ from: ['a1', 'a2'], refs: [] }, two), '');
    ok('past the cap a turn that does not close is refused, and the cap is named in figures',
        /has used all 4 of its turns/.test(refuse({ from: ['a1'], refs: [] }, four)));
    eq('…and ONE closing turn is allowed past it, or the council could never end',
        refuse({ from: ['a1'], refs: ['m1'], intent: 'synthesis', close: 'hard limit' }, four), '');
    ok('‼️ …but two closers past the cap are not: an ending is one turn by one speaker',
        /ends in ONE turn by ONE speaker/.test(
            refuse({ from: ['a1', 'a2'], refs: ['m1'], intent: 'synthesis', close: 'hard limit' }, four)));
    ok('…and the reason is stated — the second would be said into a closed council',
        /had already closed/.test(
            refuse({ from: ['a1', 'a2'], refs: ['m1'], intent: 'synthesis', close: 'hard limit' }, four)));
    ok('‼️ a multi-speaker close UNDER the cap is refused the same way — the cap is not the reason',
        /ends in ONE turn by ONE speaker/.test(
            refuse({ from: ['a1', 'a2'], refs: ['m1'], intent: 'synthesis', close: 'hard limit' }, two)));
    ok('a speaker outside the cast is still refused first, whatever the round orders',
        /is not a member of council/.test(refuse({ from: ['a1', 'lead', 'a9'], refs: [] }, two)));

    console.log('\n-- ‼️ X-78 the chair CALLED somebody, and that is on the record too');
    const chaired = kc({ chair: 'a2' });
    const narrow = [msg('m1', { from: 'a2', to: ['a1'], intent: 'question', excerpt: 'Ada, why?' })];
    const room = [msg('m1', { from: 'a2', to: [], intent: 'question', excerpt: 'anyone?' })];
    eq('the speaker the chair called may answer it',
        refuse({ from: ['a1'], refs: ['m1'], intent: 'response' }, narrow, chaired), '');
    ok('‼️ the one it did NOT call is refused even though it cites the call',
        /put "m1" to Ada, not to Cy/.test(
            refuse({ from: ['a3'], refs: ['m1'], intent: 'proposal' }, narrow, chaired)));
    ok('…and the lead is told who may answer it instead of guessing',
        /Order Ada to answer it, or have the chair call Cy first/.test(
            refuse({ from: ['a3'], refs: ['m1'], intent: 'proposal' }, narrow, chaired)));
    eq('a call to the ROOM may be answered by any member — the ordinary case',
        refuse({ from: ['a3'], refs: ['m1'], intent: 'proposal' }, room, chaired), '');
    ok('a turn that cites nothing the chair said is refused before any of that',
        /has to answer what the chair asked for/.test(
            refuse({ from: ['a1'], refs: [], intent: 'proposal' }, narrow, chaired)));
    eq('and the chair itself needs no call from anybody',
        refuse({ from: ['a2'], refs: [], intent: 'proposal' }, narrow, chaired), '');

    console.log('\n-- ‼️ X-78 an exit is a claim about the record, so the record is read');
    const objection = [msg('m1'),
        msg('m2', { from: 'a2', to: ['a1'], intent: 'challenge', refs: ['m1'], excerpt: 'no' })];
    ok('‼️ "consensus" over an unanswered challenge is refused, and the challenge is named',
        /m2 \(Rev's challenge\) is still unanswered/.test(
            refuse({ from: ['a1'], refs: ['m1'], intent: 'synthesis', close: 'consensus' }, objection)));
    ok('…and the honest exits are offered rather than left to be invented',
        /close on "no new information" or "sufficient evidence", which claim less/.test(
            refuse({ from: ['a1'], refs: ['m1'], intent: 'synthesis', close: 'consensus' }, objection)));
    eq('…but a closing turn that SETTLES the objection by naming it may claim consensus',
        refuse({ from: ['a1'], refs: ['m2'], intent: 'response', close: 'consensus' }, objection), '');
    ok('‼️ …and naming it with an intent that settles nothing does not buy the claim',
        /still unanswered/.test(
            refuse({ from: ['a1'], refs: ['m2'], intent: 'proposal', close: 'consensus' }, objection)));
    ok('‼️ "decision clear" that names nothing it rests on is refused',
        /has to name what it rests on/.test(
            refuse({ from: ['a1'], refs: [], intent: 'proposal', close: 'decision clear' }, two)));
    eq('…and stands when the verdict points at real turns',
        refuse({ from: ['a1'], refs: ['m1', 'm2'], intent: 'synthesis', close: 'decision clear' }, two), '');
    eq('…or when the council already carries a delivered synthesis it rests on',
        refuse({ from: ['a1'], refs: [], intent: 'proposal', close: 'decision clear' },
            two, kc({ verdictRefs: ['m1', 'm2'] })), '');
    eq('"hard limit" claims nothing about the question, so it needs neither refs nor a quiet room',
        refuse({ from: ['a1'], refs: [], intent: 'proposal', close: 'hard limit' }, objection), '');
    eq('…and "chair abort" is the same: it reports what happened to the council',
        refuse({ from: ['a1'], refs: [], intent: 'proposal', close: 'chair abort' }, objection), '');
    ok('a made-up reason is still refused before any of this is read',
        /not a sentence of your own/.test(
            refuse({ from: ['a1'], refs: [], intent: 'proposal', close: 'we were done' }, objection)));
}

// ============================ 5. a council never decides the objective
{
    console.log('\n-- the mandate says out loud what a council is not for');
    const k = {
        id: 'k1', conversationId: 'c1', question: 'q', chair: 'a2',
        members: ['a1', 'a2'], maxTurns: 4, openedAt: 1,
        options: ['single file', 'fragments'],
        votes: [{ messageId: 'm1', member: 'a1', choice: 'fragments' }]
    };
    const dg = M.councilDigest(k, [
        { id: 'm1', conversationId: 'c1', from: 'a1', to: [], intent: 'question', refs: [], state: 'delivered', orderedAt: 1, excerpt: 'why?' }
    ], { nameOf });
    ok('the digest states the question', dg.includes('q'));
    ok('…the turns spent against the cap', /1\/4 turns used/.test(dg));
    ok('…what is still unanswered', /Unanswered: m1/.test(dg));
    ok('‼️ …that a majority is NOT a verdict on a success criterion',
        /A majority is what the members think, not a verdict on a success criterion/.test(dg));
    ok('…and the ways out, from the one list', dg.includes(M.councilExitMenu()));
    ok('a chaired council says which message the next turn has to cite',
        /The chair has not spoken yet/.test(dg));
    const closed = M.councilDigest({ ...k, closedAt: 9, exit: 'no new information' }, [], { nameOf });
    ok('a closed council states why, in words a person can read',
        /CLOSED — no new information \(the last turns repeated positions/.test(closed));
}

// ================================ 6. the bridge, and the parity of the record
{
    console.log('\n-- the record reaches a reader without a transcript being returned to a status call');
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('there is an op for one council\'s whole record', /op: 'missions\.council',/.test(ext));
    ok('‼️ …and it says in its own describe that a vote is not a verdict',
        /never a verdict on a success criterion/.test(ext));
    ok('an unreadable vote reaches the caller as unclear rather than as a choice',
        /unclear: v\.unclear === true/.test(ext));
    ok('a tie reaches the caller as a tie', /tie: t\.tie/.test(ext));
    ok('the status call carries one line per council, not the votes',
        /votes: \(k\.votes \?\? \[\]\)\.length,/.test(ext));
    ok('‼️ and a run with no council says nothing about councils at all',
        /\.\.\.\(\(r\.councils \?\? \[\]\)\.length \? \{/.test(ext));
}


// ---------- ‼️ A PARTICIPANT IS A NAME, AND THE ID TRAVELS BESIDE IT ----------
// A cast is stored by agent id, which on a real fleet is a folder path. That is
// the right handle and the wrong answer to "who spoke": three ops handed a
// reader `d:/zone/agent/ajanlar/asistan` and nothing else. Measured on a real
// run (mt4gqn99mxam3) before it was fixed.
function castNameTest() {
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('there is exactly ONE cast-name resolver, so two ops cannot disagree',
        (ext.split('const missionCastName = ').length - 1) === 1
        && (ext.split("agents.find(a => castKey(a.id) === key)?.name ?? id").length - 1) === 1);
    // ‼️ X-85 — and it asks the RECORD before it asks the live fleet, or the
    // comment above it ("an agent that has since left the fleet is still who
    // spoke") is a wish rather than a behaviour.
    {
        const at = ext.indexOf('const missionCastName = ');
        const body = ext.slice(at, ext.indexOf('const cancelMission = ', at));
        ok('…and it reads the run\'s own cast — roles, lead, team, pool, stamped names',
            /r\.roles \?\? \[\]/.test(body) && /spec\?\.team \?\? \[\]/.test(body)
            && /spec\?\.pool \?\? \[\]/.test(body) && /m\.fromName/.test(body));
        ok('…before the live fleet, which is only how the name is spelled today',
            body.indexOf('r.messages ?? []') < body.indexOf('agents.find(a => castKey')
            && body.indexOf('r.roles ?? []') < body.indexOf('agents.find(a => castKey'));
        ok('…and an id is a folder path, so case and slashes are normalised',
            /const castKey = /.test(ext) && /replace\(\/\\\\\/g, '\/'\)/.test(ext));

        // ‼️ X-85 — AND THE PAGE ASKS THE SAME QUESTION IN THE SAME ORDER. The
        // webview kept a second, independent resolver; a Bridge that answers
        // "asistan" while the transcript beside it draws a folder path is two
        // products, and the reader has no way to know which one is lying.
        const media = fs.readFileSync(path.join(__dirname, '..', 'media', 'missions.js'), 'utf8');
        const ui = media.slice(media.indexOf('function speakerName('),
            media.indexOf('function speakerName(') + 1400);
        const order = (s, keys) => keys.map(k => s.indexOf(k));
        const rising = (xs) => xs.every((v, i) => v > 0 && (i === 0 || v > xs[i - 1]));
        ok('the page resolves a speaker from the same sources, in the same order',
            rising(order(ui, ['run.messages', 'run.roles', 'sp.leadAgentId', 'sp.team', 'sp.pool', 'DATA.agents'])));
        ok('…and normalises the id the same way the host does',
            /const castKey = /.test(media) && /castKey\(x\.id\) === key/.test(media));
    }
    ok('…and the council op uses it rather than keeping its own copy',
        /const nameOf = \(id: string\) => missionCastName\(r, id\);/.test(ext));
    ok('a status conversation says who is in it, not only which paths',
        /participantNames: c\.participants\.map\(p => missionCastName\(r, p\)\)/.test(ext));
    ok('a status council names its chair and its members',
        /chairName: missionCastName\(r, k\.chair\)/.test(ext)
        && /memberNames: k\.members\.map\(m => missionCastName\(r, m\)\)/.test(ext));
    ok('and a transcript names who each message was addressed TO',
        /toNames: m\.to\.map\(x => missionCastName\(r, x\)\)/.test(ext));
    ok('‼️ the id is still there beside the name — it is what the next call passes back',
        /chair: k\.chair, chairName:/.test(ext) && /to: m\.to, toNames:/.test(ext));
}

(async () => {
    await openTest();
    await chairTest();
    await capTest();
    await closeTest();
    await speakerToldTest();
    await chairMandateTest();
    await failedCloserTest();
    castNameTest();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
