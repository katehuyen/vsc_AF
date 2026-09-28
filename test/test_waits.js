// X-231 — THE FLEET'S WAITS, READ IN ONE PLACE AND IN ONE SHAPE.
//
// The condition the user put on X-230's approval: "an autonomous process must
// also know that it is waiting for other reasons; whoever uses this function
// should HAVE that knowledge — let them give the command willing to wait, and
// if the command is making them wait, let them understand that with its reason."
//
// The root cause was not a missing figure, it was a missing VOCABULARY. There
// are at least five reasons the fleet stops moving and every one of them is
// reported correctly on its own surface: a parked run says which ceiling holds
// it, a mission says it is waiting for an approval, a sentry says when it
// wakes, an armed restart says which session it is behind. An agent asking
// "why am I not moving?" had to call five ops and read five different shapes —
// and when a sixth reason was added, nobody learned about it.
//
// What is pinned here:
//   * ONE shape, and every source TRANSLATED into it. A second wait dictionary
//     is the thing this file exists to prevent;
//   * the reason is the sentence the source ALREADY wrote — nothing is
//     paraphrased here, because two sentences about one wait is how the surface
//     and the op come to disagree;
//   * `clearedBy` answers the only question a caller actually has: will this
//     end by itself (a clock), when something else finishes (an event), or not
//     until a person acts (human);
//   * ‼️ AND THE VOCABULARY IS DERIVED FROM THE SOURCES, NOT DECLARED BESIDE
//     THEM. The two gates at the bottom read `launchBlock` out of tasks.ts and
//     the `MissionRunStatus` union out of missions.ts: a sixth block code or a
//     new `waiting-…` status that nothing here translates FAILS THE BUILD,
//     which is the only version of "it must not grow silently" that works.
'use strict';
const fs = require('fs');
const path = require('path');
const {
    fleetWaits, armedRestartWait, WAIT_KINDS, TASK_WAIT_RULES, MISSION_WAIT_RULES
} = require(path.join(__dirname, '..', 'out', 'core', 'waits.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const NOW = 1788700000000;
const MIN = 60 * 1000;
const world = (over = {}) => ({ now: NOW, tasks: [], missions: [], ...over });
const only = (w) => { const l = fleetWaits(w); return l.length === 1 ? l[0] : undefined; };

// ---- the empty answer is an answer -----------------------------------------
{
    const l = fleetWaits(world());
    ok('a fleet with nothing held up waits for nothing, and says so as a list',
        Array.isArray(l) && l.length === 0);
}

// ---- the shape, on every row -----------------------------------------------
{
    const l = fleetWaits(world({
        tasks: [
            { id: 't1', title: 'nightly sweep', agent: 'developer', status: 'queued',
                heldByCode: 'wait:' + (NOW + 20 * MIN), heldBy: 'waiting until 03:20', since: NOW - 5 * MIN },
            { id: 't2', title: 'second', agent: 'developer', status: 'queued',
                heldByCode: 'concurrency:fleet', heldBy: 'the fleet is full', since: NOW - MIN },
            { id: 't3', title: 'running one', agent: 'developer', status: 'running' }
        ],
        missions: [{ id: 'm1', name: 'audit', status: 'waiting-approval',
            now: 'waiting for your approval (round 2)', since: NOW - 9 * MIN }],
        sentry: { id: 's1', name: 'night watch', status: 'running', running: false,
            wakeAt: NOW + 90 * MIN, lastWhy: 'every account is over its ceiling', lastAt: NOW - 3 * MIN },
        armed: { kind: 'extensionHost', armedAt: NOW - 30 * 1000,
            reason: 'Waiting for 1 live console session(s) to finish',
            waitingFor: [{ kind: 'console', id: 'cs1', name: 'developer' }] }
    }));
    ok('every source reaches the one reading', l.length === 5);
    ok('‼️ …and every row carries the SAME seven answers, whatever produced it',
        l.every(x => typeof x.kind === 'string' && x.kind
            && x.subject && typeof x.subject.kind === 'string' && typeof x.subject.id === 'string'
            && typeof x.subject.name === 'string'
            && typeof x.reason === 'string' && x.reason
            && typeof x.since === 'number'
            && Array.isArray(x.blockedBy)
            && ['clock', 'event', 'human'].indexOf(x.clearedBy) >= 0));
    ok('…and every kind it produces is one this module admits to',
        l.every(x => WAIT_KINDS.indexOf(x.kind) >= 0));
    // ‼️ SOONEST RELIEF FIRST, and the ones with no clock at the end — a caller
    // deciding whether to wait is asking "how long until something changes",
    // and a wait with no `until` is the answer "not by itself".
    ok('‼️ …ordered by when relief comes, with the ones nothing will end last',
        l[0].kind === 'task-clock' && l[1].kind === 'sentry-wake'
        && l.slice(2).every(x => x.until === undefined));
    ok('…and a task that is RUNNING is not a task that is waiting',
        !l.some(x => x.subject.id === 't3'));
}

// ---- a run waiting on a clock ----------------------------------------------
{
    const w = only(world({ tasks: [{
        id: 't1', title: 'nightly sweep', agent: 'developer', status: 'queued',
        heldByCode: 'wait:' + (NOW + 20 * MIN),
        heldBy: 'waiting until 03:20 — retry 2 (account handover · no other claude account is '
            + 'captured on this machine, so there is nobody to hand the work to)',
        since: NOW - 5 * MIN
    }] }));
    ok('a parked retry is a wait on a CLOCK', w.kind === 'task-clock' && w.clearedBy === 'clock');
    ok('‼️ …and it says until WHEN, read off the code that carries the moment',
        w.until === NOW + 20 * MIN);
    ok('…since when, so "how long has this been stuck" has an answer', w.since === NOW - 5 * MIN);
    ok('‼️ …with the row\'s OWN sentence, not a second one written here',
        w.reason.indexOf('account handover') > 0 && w.reason.indexOf('retry 2') > 0);
    ok('…the task as its subject, by name rather than by id alone',
        w.subject.kind === 'task' && w.subject.id === 't1' && w.subject.name === 'nightly sweep');
    ok('…and the op that ends the hold, so the caller can act instead of poll',
        w.op === 'tasks.unpark');
    ok('…waiting on a clock, it is blocked by nothing that has a name', w.blockedBy.length === 0);
}

// ‼️ THE ACCOUNT HANDOVER IS NOT A SIXTH WAIT — MEASURED, not assumed. The item
// listed it as its own reason; `tasks.ts` writes `notBeforeWhy: 'account
// handover · ' + carry.why` and the row's sentence carries it. Surfacing it
// again as a separate row would be the same wait counted twice, and the second
// copy would be the one that goes stale.
{
    const w = only(world({ tasks: [{
        id: 't1', title: 'nightly', status: 'queued', heldByCode: 'wait:' + (NOW + MIN),
        heldBy: 'waiting until 03:01 (account handover · every other claude account is at or above '
            + '90% of its five-hour window too, so the wait stands)', since: NOW
    }] }));
    ok('‼️ a wait that could not be handed to another sign-in is ONE wait, with the reason on it',
        w.kind === 'task-clock' && /every other claude account/.test(w.reason));
}

// ---- the holds that end when something else finishes ------------------------
{
    const w = world({ tasks: [
        { id: 'r1', title: 'big one', agent: 'developer', status: 'running' },
        { id: 'r2', title: 'other agent\'s', agent: 'basit', status: 'running' },
        { id: 't1', title: 'queued behind them', agent: 'developer', status: 'queued',
            heldByCode: 'concurrency:fleet', heldBy: 'the fleet is at its weight limit', since: NOW - MIN }
    ] });
    const x = fleetWaits(w).find(v => v.subject.id === 't1');
    ok('a fleet ceiling is cleared by an EVENT, not by a clock',
        x.kind === 'task-fleet' && x.clearedBy === 'event' && x.until === undefined);
    ok('‼️ …and what it is behind is DERIVED from the board, never hand-listed',
        x.blockedBy.join(',') === 'task:r1,task:r2');
}
{
    const w = world({ tasks: [
        { id: 'r1', title: 'mine', agent: 'developer', status: 'running' },
        { id: 'r2', title: 'somebody else\'s', agent: 'basit', status: 'running' },
        { id: 't1', title: 'second turn for developer', agent: 'developer', status: 'queued',
            heldByCode: 'concurrency:agent:developer',
            heldBy: 'developer is already talking', since: NOW - MIN }
    ] });
    const x = fleetWaits(w).find(v => v.subject.id === 't1');
    ok('an agent ceiling is behind THAT agent\'s run alone, not the whole board',
        x.kind === 'task-agent' && x.blockedBy.join(',') === 'task:r1');
}
{
    const w = only(world({ tasks: [{
        id: 't1', title: 'next round', status: 'queued',
        heldByCode: 'session:busy:sess-9', heldBy: 'the conversation it resumes is still answering',
        since: NOW - 2 * MIN }] }));
    ok('‼️ a run waiting for a busy conversation names it, out of the code itself',
        w.kind === 'task-session' && w.blockedBy.join(',') === 'session:sess-9'
        && w.clearedBy === 'event');
}
{
    const w = only(world({ tasks: [{
        id: 't1', title: 'round 3', status: 'queued', heldByCode: 'round:binding',
        heldBy: 'the round before it has not been bound to a conversation yet', since: NOW - MIN }] }));
    ok('a round waiting to be bound is an event with nothing to name yet',
        w.kind === 'task-round' && w.clearedBy === 'event' && w.blockedBy.length === 0);
}

// ---- the two that only a person ends ----------------------------------------
{
    const l = fleetWaits(world({ missions: [
        { id: 'm1', name: 'audit', status: 'waiting-approval',
            now: 'waiting for your approval (round 2)', since: NOW - 9 * MIN },
        { id: 'm2', name: 'research', status: 'waiting-user',
            now: 'waiting for your answer', since: NOW - 40 * MIN },
        { id: 'm3', name: 'busy one', status: 'running', since: NOW - MIN }
    ] }));
    ok('only the runs that are actually waiting are waits', l.length === 2);
    const a = l.find(x => x.subject.id === 'm1'), q = l.find(x => x.subject.id === 'm2');
    ok('‼️ an approval is cleared by a HUMAN and says which op is the person\'s hand',
        a.kind === 'mission-approval' && a.clearedBy === 'human' && a.op === 'missions.approve');
    ok('…and a question is the other one, with its own op',
        q.kind === 'mission-answer' && q.clearedBy === 'human' && q.op === 'missions.answer');
    ok('…each with the run\'s own line as the reason, and the mission as subject',
        a.reason === 'waiting for your approval (round 2)' && a.subject.kind === 'mission'
        && a.subject.name === 'audit');
    ok('‼️ …and the longest wait is not buried under the newest one',
        fleetWaits(world({ missions: [
            { id: 'm1', name: 'a', status: 'waiting-approval', now: 'x', since: NOW - MIN },
            { id: 'm2', name: 'b', status: 'waiting-user', now: 'y', since: NOW - 40 * MIN }
        ] }))[0].subject.id === 'm2');
}

// ---- the sentry, asleep against a wall --------------------------------------
{
    const w = only(world({ sentry: {
        id: 's1', name: 'night watch', status: 'running', running: false,
        wakeAt: NOW + 90 * MIN, lastWhy: 'every account is over its ceiling until 05:30',
        lastAt: NOW - 3 * MIN } }));
    ok('a sleeping campaign is a wait on a clock, with the moment it wakes',
        w.kind === 'sentry-wake' && w.clearedBy === 'clock' && w.until === NOW + 90 * MIN);
    ok('…with its last plan\'s own words, which is where the reason already was',
        w.reason === 'every account is over its ceiling until 05:30' && w.since === NOW - 3 * MIN);
    ok('…and the campaign as the subject', w.subject.kind === 'sentry' && w.subject.name === 'night watch');
}
{
    ok('a campaign with a round ON the board is working, not waiting',
        fleetWaits(world({ sentry: { id: 's1', name: 'n', status: 'running', running: true,
            wakeAt: NOW + MIN } })).length === 0);
    ok('…and a stopped or paused one is not waiting either, it is off',
        fleetWaits(world({ sentry: { id: 's1', name: 'n', status: 'paused', running: false,
            wakeAt: NOW + MIN } })).length === 0);
}

// ---- the armed restart, which is where this shape was first needed ----------
{
    const armed = { kind: 'extensionHost', armedAt: NOW - 30 * 1000,
        reason: 'Waiting for 1 live console session(s) (developer) to finish',
        waitingFor: [{ kind: 'console', id: 'cs1-abc', name: 'developer' }] };
    const w = only(world({ armed }));
    ok('an armed restart is a wait like any other', w.kind === 'restart-armed'
        && w.clearedBy === 'event' && w.subject.kind === 'window');
    ok('‼️ …behind the sessions it will not kill, named', w.blockedBy.join(',') === 'session:cs1-abc');
    ok('…and it names the op that calls it off or forces it through',
        w.op === 'farm.restartExtensionHost');
    // ‼️ CONDITION (c) — THE OP THAT PRODUCES A WAIT ANSWERS IN THE SAME SHAPE.
    // X-230's `decision:"armed"` was the first example; it must not become a
    // second dialect, so the op builds its answer with THIS function.
    ok('‼️ the producing op and the reading op build the same object from one function',
        JSON.stringify(armedRestartWait(armed, NOW)) === JSON.stringify(w));
    ok('…and nothing armed is nothing to report', armedRestartWait(undefined, NOW) === undefined);
}

// ---- a wait nobody translated is not silently dropped -----------------------
{
    const l = fleetWaits(world({ tasks: [{
        id: 't1', title: 'held by something new', status: 'queued',
        heldByCode: 'something:nobody:mapped', heldBy: 'a ceiling this build does not know',
        since: NOW - MIN }] }));
    ok('‼️ an unmapped hold is REPORTED as unknown rather than vanishing',
        l.length === 1 && l[0].kind === 'task-unknown' && l[0].clearedBy === 'event'
        && /a ceiling this build does not know/.test(l[0].reason));
}

// ================= ‼️ THE TWO GATES THAT READ THE SOURCES ====================

// ---- gate 1: every hold `launchBlock` can produce is translated -------------
{
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'tasks.ts'), 'utf8');
    const at = src.indexOf('private launchBlock(');
    const end = src.indexOf('\n    private ', at + 10);
    const block = src.slice(at, end > at ? end : undefined);
    const rounds = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'taskRounds.ts'), 'utf8');
    const bindingCode = /ROUND_BINDING_CODE\s*=\s*'([^']+)'/.exec(rounds)[1];
    const codes = [...block.matchAll(/code: (?:`([^`]*)`|'([^']*)'|(\w+))/g)]
        .map(m => m[1] ?? m[2] ?? m[3])
        .map(c => (c === 'ROUND_BINDING_CODE' ? bindingCode : c))
        // a template's literal head is the stable part; `${…}` is the figure
        .map(c => c.replace(/\$\{[^}]*\}.*$/, ''));
    ok('the block codes were really read out of tasks.ts', codes.length >= 5
        && codes.indexOf('concurrency:fleet') >= 0 && codes.indexOf(bindingCode) >= 0);
    const unmapped = codes.filter(c => !TASK_WAIT_RULES.some(r => c.indexOf(r.prefix) === 0));
    ok('‼️ X-231 GATE: every hold `launchBlock` can produce has a translation here'
        + (unmapped.length ? ' — UNMAPPED: ' + unmapped.join(', ') : ''), unmapped.length === 0);
}

// ---- gate 2: every `waiting-…` a mission run can be in is translated ---------
{
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'missions.ts'), 'utf8');
    const at = src.indexOf('export type MissionRunStatus');
    const union = src.slice(at, src.indexOf(';', at));
    const waiting = [...union.matchAll(/'(waiting-[\w-]+)'/g)].map(m => m[1]);
    ok('the run statuses were really read out of missions.ts',
        waiting.length >= 2 && waiting.indexOf('waiting-approval') >= 0);
    const unmapped = waiting.filter(s => !MISSION_WAIT_RULES.some(r => r.status === s));
    ok('‼️ X-231 GATE: every `waiting-…` a mission run can be in is translated here'
        + (unmapped.length ? ' — UNMAPPED: ' + unmapped.join(', ') : ''), unmapped.length === 0);
    ok('…and nothing is translated that the union does not have',
        MISSION_WAIT_RULES.every(r => waiting.indexOf(r.status) >= 0));
}

// ---- the vocabulary is one list, and every rule is in it --------------------
{
    ok('every task rule\'s kind is in the vocabulary',
        TASK_WAIT_RULES.every(r => WAIT_KINDS.indexOf(r.kind) >= 0));
    ok('every mission rule\'s kind is in the vocabulary',
        MISSION_WAIT_RULES.every(r => WAIT_KINDS.indexOf(r.kind) >= 0));
    ok('…and no kind is declared that nothing produces',
        WAIT_KINDS.every(k => k === 'sentry-wake' || k === 'restart-armed' || k === 'task-unknown' || k === 'workflow-question' || k === 'human-answer'
            || TASK_WAIT_RULES.some(r => r.kind === k) || MISSION_WAIT_RULES.some(r => r.kind === k)));
}

// ---- M-55: a supervisor's open question is a wait a person ends -------------
{
    const l = fleetWaits({ now: 5000, questions: [{ id: 'wq1', runId: 'run9', workflowTitle: 'video hattı', question: 'Nasıl ilerleyelim?', askedAt: 4000 }] });
    const w = l[0];
    ok('‼️ an open workflow question is on the list — its checkpoint row said only "running"',
        l.length === 1 && w.kind === 'workflow-question' && w.clearedBy === 'human' && w.op === 'workflows.answer');
    ok('…naming the run and the question in its own words', w.subject.kind === 'workflow' && w.subject.id === 'run9'
        && w.subject.name === 'video hattı' && w.reason === 'its supervisor asks: Nasıl ilerleyelim?' && w.since === 4000);
}

// ---- S-108: a step awaiting a person's approval is a wait, in the row's own words
{
    const H = require(path.join(__dirname, '..', 'out', 'core', 'humanAsk.js'));
    const N = require(path.join(__dirname, '..', 'out', 'core', 'needs.js'));
    const up = { kind: 'upload', title: 'fal', goal: 'D:/clip.mp4' };
    const what = H.humanAskSentence(up);
    const l = fleetWaits({ now: 9000, humanAsks: [
        { runId: 'r1', workflowTitle: 'video', taskId: 't1', taskTitle: 'video 2/5: edit', kind: 'upload', what, since: 8000 },
        { runId: 'r2', workflowTitle: 'site', kind: 'browser', what: H.humanAskSentence({ kind: 'browser', title: 'login', url: 'https://x', goal: 'sign in' }), since: 8500 },
        { runId: 'r3', workflowTitle: 'pick', taskId: 't3', kind: 'selection', what: 'pick assets for "p"', since: 8700 }
    ] });
    ok('‼️ an open approval is on the list as a wait a person ends', l.length === 3 && l.every(w => w.kind === 'human-answer' && w.clearedBy === 'human'));
    const u = l.find(w => w.subject.id === 't1');
    ok('…on the task row that asked, in the sentence that row carries', !!u && u.subject.kind === 'task' && u.subject.name === 'video 2/5: edit'
        && u.reason === H.humanWaitLine(what) && u.since === 8000 && u.op === 'needs.act');
    const b = l.find(w => w.subject.id === 'r2');
    ok('…a browser step with no row yet is the run\'s wait', !!b && b.subject.kind === 'workflow' && b.subject.name === 'site');
    ok('…and a pick is answered by its own op', l.find(w => w.subject.id === 't3').op === 'workflows.select');
    const needs = N.buildNeedsQueue({ liveSessions: [], approvals: [{ id: 'ap1', title: 'fal', url: '', goal: 'D:/clip.mp4', createdAt: 1, kind: 'upload' }], insights: [], interruptedRuns: [], missionWaits: [] });
    const row = needs.find(i => i.ref.approvalId === 'ap1');
    ok('‼️ the Needs You row says the same sentence, and can be answered there', !!row && (row.detail + (row.body || '')).includes(what)
        && row.actions.map(a => a.label).join('|') === 'Upload|Stop the step');
    ok('the three approval kinds read differently', new Set(['browser', 'approval', 'upload', 'selection']
        .map(k => H.humanAskSentence({ kind: k, title: 'T', url: 'u', goal: 'g' }))).size === 4);
}

console.log(`test_waits: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
