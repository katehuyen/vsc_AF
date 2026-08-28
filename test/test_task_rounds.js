// M-27 — a task that goes several rounds deep (compiled core/taskRounds.js, pure).
//
// What is actually being defended here:
//   - a RETRY IS NOT A ROUND. It is the same round attempted again, and if the
//     two were ever counted together then "round 3 of 5" would be a lie on any
//     task that hit a usage limit, and a flaky network would silently eat the
//     rounds the user paid for.
//   - a round is a REPLY. Without a conversation to resume there is nothing to
//     reply to, and sending round 2 into a brand new session — which is what
//     "just run it anyway" would do — answers nothing and looks like it worked.
//   - the chain stops when the run does. A failure is the retry policy's
//     subject and a cancellation is a person saying stop.
//   - the denominator survives. By round 3 the list has been eaten down, so
//     what the user originally asked for is only knowable at creation.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const R = require(path.join(__dirname, '..', 'out', 'core', 'taskRounds.js'));

const NOW = new Date(2026, 7, 28, 11, 0).getTime();
const MIN = 60 * 1000;
const done = (over) => Object.assign({ status: 'done', runSessionId: 'sess-1' }, over);

// ---------------------------------------------------------------------------
// normalizeRounds — what a form, a bridge call and a stored task all hand in
// ---------------------------------------------------------------------------
{
    ok('a list that is not a list is no rounds at all',
        R.normalizeRounds(undefined).length === 0 && R.normalizeRounds('nope').length === 0
        && R.normalizeRounds(null).length === 0);

    const cleaned = R.normalizeRounds([
        { prompt: '  now the tests  ', delayMin: 5 },
        { prompt: '   ' },
        { prompt: 'and the changelog' },
        { prompt: '' }
    ]);
    ok('a blank row is DROPPED, not refused — that is what a half-filled form looks like',
        cleaned.length === 2);
    ok('…and the prompt is trimmed',
        cleaned[0].prompt === 'now the tests' && cleaned[1].prompt === 'and the changelog');
    ok('a wait of zero is not written down — absent already means "as soon as the answer lands"',
        cleaned[1].delayMin === undefined && cleaned[0].delayMin === 5);

    ok('a bare string is a round with no wait — the shorthand JSON by hand reaches for',
        R.normalizeRounds(['carry on']).length === 1
        && R.normalizeRounds(['carry on'])[0].prompt === 'carry on'
        && R.normalizeRounds(['carry on'])[0].delayMin === undefined);

    ok('‼️ a wait is CLAMPED, never trusted: an unbounded one is a task that never'
        + ' finishes and never says why',
        R.normalizeRounds([{ prompt: 'x', delayMin: 999999 }])[0].delayMin === R.ROUND_DELAY_MAX_MIN);
    ok('…and a negative or nonsense wait is no wait',
        R.normalizeRounds([{ prompt: 'x', delayMin: -30 }])[0].delayMin === undefined
        && R.normalizeRounds([{ prompt: 'x', delayMin: 'soon' }])[0].delayMin === undefined
        && R.normalizeRounds([{ prompt: 'x', delayMin: NaN }])[0].delayMin === undefined);
    ok('…and a fractional wait is floored rather than carried into the timer',
        R.normalizeRounds([{ prompt: 'x', delayMin: 2.9 }])[0].delayMin === 2);
}

// ---------------------------------------------------------------------------
// planNextRound — the four things that must all be true
// ---------------------------------------------------------------------------
{
    const task = done({ round: 1, rounds: [{ prompt: 'now the tests' }, { prompt: 'then commit', delayMin: 10 }] });
    const next = R.planNextRound(task, NOW);
    ok('the next round is the first thing still unsaid', next && next.prompt === 'now the tests');
    ok('…numbered exactly one higher', next.round === 2);
    ok('…resuming THIS run\'s own conversation, because a round is a reply',
        next.resumeSessionId === 'sess-1');
    ok('…startable at once when no wait was asked for', next.notBefore === NOW && next.delayMin === 0);
    ok('‼️ …and carrying what is LEFT, so the chain moves itself forward rather than'
        + ' being held in a closure that a reload would throw away',
        next.rest.length === 1 && next.rest[0].prompt === 'then commit');

    const second = R.planNextRound(done({ round: 2, rounds: next.rest }), NOW);
    ok('the round after that waits the minutes its own row asked for',
        second.round === 3 && second.delayMin === 10 && second.notBefore === NOW + 10 * MIN);
    ok('…and it is the last: nothing is left after it', second.rest.length === 0);

    ok('a chain with nothing left ends',
        R.planNextRound(done({ round: 3, rounds: [] }), NOW) === undefined);
    ok('…and a task that never asked for rounds is not a chain at all',
        R.planNextRound(done({}), NOW) === undefined);
}

// ---------------------------------------------------------------------------
// ‼️ the run has to have ENDED WELL
// ---------------------------------------------------------------------------
{
    const rounds = [{ prompt: 'now the tests' }];
    ok('‼️ a FAILED run opens no round — a round is a reply and there is no answer'
        + ' to reply to; failure is the retry policy\'s subject',
        R.planNextRound({ status: 'failed', runSessionId: 's', rounds }, NOW) === undefined);
    ok('‼️ a CANCELLED run opens no round — that is a person saying stop, and sending'
        + ' them the next prompt would be the opposite of it',
        R.planNextRound({ status: 'cancelled', runSessionId: 's', rounds }, NOW) === undefined);
    ok('a run still going opens nothing yet',
        R.planNextRound({ status: 'running', runSessionId: 's', rounds }, NOW) === undefined);
}

// ---------------------------------------------------------------------------
// ‼️ THE CONVERSATION IS NOT KNOWN YET, AND THAT IS A WAIT — NOT A REFUSAL
//
// This is the correction the feature most needed and the one that made it not
// work at all. Only opencode publishes its session id while the run is going;
// every other engine is bound to one AFTERWARDS, by matching a transcript the
// index found on disk. So at the exact moment a round is answered there is
// normally nothing to resume, and refusing there dropped the chain of every
// Claude task ever given one — silently, with a note nobody would read.
// ---------------------------------------------------------------------------
{
    const unbound = { status: 'done', round: 1, rounds: [{ prompt: 'a' }, { prompt: 'b' }] };
    const next = R.planNextRound(unbound, NOW);
    ok('‼️ a round is still PLANNED when the run is not bound to a session yet —'
        + ' that is the ordinary case for every engine but opencode',
        !!next && next.round === 2 && next.prompt === 'a');
    ok('…and it says so, rather than carrying an empty id that reads as "a new conversation"',
        !!next && next.awaitBinding === true && next.resumeSessionId === '');
    ok('…and the rest of the chain rides with it, so nothing is lost while it waits',
        !!next && next.rest.length === 1 && next.rest[0].prompt === 'b');
    ok('‼️ …and it is NOT narrated as a refusal: it is a row on the board that says'
        + ' what it is waiting for',
        R.refuseNextRound(unbound) === undefined);

    const bound = R.planNextRound(done({ round: 1, rounds: [{ prompt: 'a' }] }), NOW);
    ok('a run that IS bound resumes it at once, with nothing to wait for',
        !!bound && bound.awaitBinding === false && bound.resumeSessionId === 'sess-1');

    ok('a chain that simply ran out is NOT narrated — nothing happened is not news',
        R.refuseNextRound(done({ round: 3, rounds: [] })) === undefined);
    ok('…nor is a failure, which is already on the board as what it is',
        R.refuseNextRound({ status: 'failed', rounds: [{ prompt: 'a' }] }) === undefined);
    ok('…nor a chain that is about to run perfectly well',
        R.refuseNextRound(done({ rounds: [{ prompt: 'a' }] })) === undefined);
}

// ---------------------------------------------------------------------------
// ‼️ AN INTERACTIVE RUN IS THE ONE REAL REFUSAL
//
// A round RESUMES the conversation the round before it was answered in, and
// resuming is a headless argument (`launch()` refuses it by name). Left
// unsaid, the rounds someone typed became a row that failed at the spawn.
// ---------------------------------------------------------------------------
{
    const chat = { status: 'done', mode: 'interactive', runSessionId: 'sess-1', round: 1,
        rounds: [{ prompt: 'a' }, { prompt: 'b' }] };
    ok('‼️ an interactive task opens no round, however well bound it is',
        R.planNextRound(chat, NOW) === undefined);
    const why = R.refuseNextRound(chat);
    ok('…and THAT silence is broken, with the count that was dropped and the door'
        + ' the user should have used',
        typeof why === 'string' && /round 2/.test(why) && /2 round\(s\) dropped/.test(why)
        && /headless/.test(why));
    ok('…while an absent mode is headless, which is what every task the manager makes is',
        !!R.planNextRound(done({ rounds: [{ prompt: 'a' }] }), NOW)
        && !!R.planNextRound(done({ mode: 'headless', rounds: [{ prompt: 'a' }] }), NOW));
}

// ---------------------------------------------------------------------------
// what a chain IS, on the row of the thing that was set up with one
// ---------------------------------------------------------------------------
{
    ok('a one-prompt run says nothing about rounds, like every unstated dimension',
        R.describeRounds(undefined) === undefined && R.describeRounds([]) === undefined);
    const d = R.describeRounds([{ prompt: 'a' }, { prompt: 'b', delayMin: 30 }]);
    ok('…and a chain says how many turns it goes in all, counting the prompt itself',
        typeof d === 'string' && /^3 rounds/.test(d));
    ok('…and how many of them wait, which is the part a count cannot show',
        typeof d === 'string' && /1 after a stated wait/.test(d));
}

// ---------------------------------------------------------------------------
// ‼️ a workflow step's "what happens next" is the workflow's
// ---------------------------------------------------------------------------
{
    ok('‼️ a workflow step opens no round of its own — the workflow already owns'
        + ' branching, verification and handoff, and two mechanisms answering'
        + ' "what next" would race for the same task',
        R.planNextRound(done({ workflowId: 'w1', rounds: [{ prompt: 'a' }] }), NOW) === undefined);
    ok('…and that is not narrated as a refusal either',
        R.refuseNextRound(done({ workflowId: 'w1', rounds: [{ prompt: 'a' }] })) === undefined);
}

// ---------------------------------------------------------------------------
// ‼️ A RETRY IS NOT A ROUND — the distinction the whole file exists to keep
// ---------------------------------------------------------------------------
{
    // A retry carries the chain forward untouched: same round, same rounds left.
    // What is asserted is that nothing in this module MOVES the count except
    // planNextRound, so a retry that copies the fields lands on the same round.
    const attempt1 = { status: 'failed', round: 2, rounds: [{ prompt: 'c' }], runSessionId: 's' };
    const retry = { status: 'done', round: attempt1.round, rounds: attempt1.rounds, runSessionId: 's' };
    ok('‼️ the retry of round 2 is still round 2', R.roundOf(retry) === 2);
    const after = R.planNextRound(retry, NOW);
    ok('‼️ …and when it finally succeeds THAT run opens round 3, not round 4 —'
        + ' the failed attempt consumed nothing',
        after.round === 3 && after.prompt === 'c');
    ok('…and it consumed no prompt either: the chain is exactly where it was',
        after.rest.length === 0);

    ok('a task written before M-27 is round 1 by definition', R.roundOf({}) === 1);
    ok('…and so is one whose round is nonsense',
        R.roundOf({ round: 0 }) === 1 && R.roundOf({ round: -4 }) === 1 && R.roundOf({ round: 'two' }) === 1);
}

// ---------------------------------------------------------------------------
// what the board says about it
// ---------------------------------------------------------------------------
{
    ok('the denominator counts round 1, which is the task\'s own prompt',
        R.totalRounds([{ prompt: 'a' }, { prompt: 'b' }]) === 3 && R.totalRounds([]) === 1);

    ok('‼️ a plain one-round task gets NO badge — "1 of 1" is noise on every board',
        R.describeRound({ round: 1, roundsTotal: 1 }) === undefined
        && R.describeRound({}) === undefined);
    ok('…a chain says where it is, in the shortest unambiguous form',
        R.describeRound({ round: 2, roundsTotal: 4 }) === 'R2/4');

    const long = R.explainRound({ round: 2, roundsTotal: 4, rounds: [{ prompt: 'c', delayMin: 15 }] });
    ok('…and the panel opens with the long form of that shorthand',
        /^Round 2 of 4/.test(long));
    ok('‼️ …and says the thing the number cannot: that a retry does not move it',
        /retry is not a round/.test(long));
    ok('…and what the next one is waiting for', /waits 15 min/.test(long));
    ok('…or that it is not waiting at all',
        / as soon as this answer lands/.test(
            R.explainRound({ round: 2, roundsTotal: 4, rounds: [{ prompt: 'c' }] })));
    ok('…and the last round says it is the last',
        /This is the last one/.test(R.explainRound({ round: 4, roundsTotal: 4, rounds: [] })));
    ok('a one-round task has nothing to explain', R.explainRound({ round: 1 }) === undefined);
}

// ---------------------------------------------------------------------------
// the wiring, which lives in the manager and the page and has no unit seam
// ---------------------------------------------------------------------------
{
    const fs = require('fs');
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'tasks.ts'), 'utf8');

    const finish = src.slice(src.indexOf('private finish(task: FarmTask'),
        src.indexOf('private openNextRound'));
    ok('‼️ the next round is opened when a run ENDS WELL, from finish()',
        /if \(status === 'done'\) \{ this\.openNextRound\(task\); \}/.test(finish));

    const open = src.slice(src.indexOf('private openNextRound'),
        src.indexOf('private maybeScheduleRetry'));
    ok('‼️ the round is a ROW, not a setTimeout: a closure holding round 3 is thrown'
        + ' away when the window closes, cannot be seen and cannot be cancelled',
        /this\.addTask\(/.test(open) && !/setTimeout/.test(open));
    ok('…carrying the moment it may start, so the pump launches it like anything else held',
        /notBefore: next\.notBefore/.test(open));
    ok('…and resuming the conversation that was answered', /resumeSessionId: next\.resumeSessionId/.test(open));
    ok('‼️ …and the refusal is said on the record rather than passed over in silence',
        /refuseNextRound\(task\)/.test(open) && /no next round/.test(open));
    ok('…and a write the store would not keep is admitted, because a round may wait hours',
        /could not be saved/.test(open));
    ok('‼️ …and the retry policy rides with the chain — losing it would make round 2'
        + ' of a careful task more fragile than round 1',
        /task\.retry \? \{ retry: task\.retry \}/.test(open));

    const retry = src.slice(src.indexOf('const nextTitle = `${baseTitle}'),
        src.indexOf('// ‼️ M-10 — HELD BECAUSE NOBODY CAN SAY WHETHER WORK HAPPENED'));
    ok('‼️ A RETRY CARRIES THE CHAIN AND DOES NOT MOVE THE ROUND: dropping the rounds'
        + ' here would make a task that met a usage limit quietly lose everything'
        + ' the user still had to say',
        /round: task\.round,/.test(retry) && /roundsTotal: task\.roundsTotal,/.test(retry)
        && /rounds: task\.rounds/.test(retry));
    ok('…and nothing in that block increments it', !/round: \(?task\.round \?\? 1\)? \+ 1/.test(retry));

    const add = src.slice(src.indexOf('const chain = normalizeRounds(task.rounds)'),
        src.indexOf('// The first line of the task\'s own record'));
    ok('‼️ the list is cleaned at CREATION, so a blank form row and a delay read out of'
        + ' somebody\'s JSON can never reach a timer',
        /normalizeRounds\(task\.rounds\)/.test(add));
    ok('‼️ …and the denominator is stamped there, the only moment it is knowable',
        /task\.roundsTotal = totalRounds\(chain\)/.test(add));
    ok('…while a round the chain itself opens states all of it and is left alone',
        /task\.roundsTotal === undefined/.test(add) && /task\.round === undefined/.test(add));

    const page = fs.readFileSync(path.join(__dirname, '..', 'media', 'tasksPage.js'), 'utf8');
    ok('the form draws a row per round, with the round it is and the wait before it',
        /id="nt-round-\$\{i\}"/.test(page) && /id="nt-roundw-\$\{i\}"/.test(page));
    ok('‼️ …and adding or removing one acts on the DRAFT, so Cancel really cancels',
        /composer\.rounds\.push\(/.test(page) && /composer\.rounds\.splice\(i, 1\)/.test(page));
    ok('…the empty form is one line of prose and a button, not a stack of empty boxes',
        /One prompt, one turn\./.test(page));
    ok('‼️ …the row badge is drawn only for a real chain — "1 of 1" is noise on every board',
        /if \(total < 2\) \{ return ''; \}/.test(page));
    ok('…and its hover says the thing the number cannot',
        /A RETRY IS NOT A ROUND/.test(page));
    ok('…and the box refuses the same ceiling the core clamps to',
        /const ROUND_DELAY_MAX_MIN = 7 \* 24 \* 60;/.test(page));

    const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'tasksPanel.ts'), 'utf8');
    ok('the page\'s form and the bridge clean the list with the SAME function',
        /normalizeRounds\(t\.rounds\)/.test(panel));
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('‼️ …and so does tasks.add, or the two doors would build different objects',
        /normalizeRounds\(args\.rounds\)/.test(ext));
    ok('…and the op says what it takes and reads it back',
        /rounds\? \(‼️ M-27/.test(ext) && /roundsLeft: \(task\.rounds \?\? \[\]\)/.test(ext));
}

// ---------------------------------------------------------------------------
// ‼️ THE SEAM: a round WAITS for its conversation instead of being killed by it
// ---------------------------------------------------------------------------
{
    const fs2 = require('fs');
    const src = fs2.readFileSync(path.join(__dirname, '..', 'src', 'core', 'tasks.ts'), 'utf8');

    const open = src.slice(src.indexOf('private openNextRound'),
        src.indexOf('private releaseRounds'));
    ok('‼️ an unbound run still makes a ROW, naming the run it is waiting for',
        /roundAwaits: task\.id/.test(open));
    ok('‼️ …and the row is PARKED in the same write, never seen unparked for one pass',
        /row\.deferredCode = ROUND_BINDING_CODE/.test(open)
        && /noteTaskEvent\(row, 'parked'/.test(open));
    ok('…while a bound one resumes at once, exactly as before',
        /resumeSessionId: next\.resumeSessionId/.test(open));

    const rel = src.slice(src.indexOf('private releaseRounds'),
        src.indexOf('private maybeScheduleRetry'));
    ok('‼️ the release is RE-DERIVED from the store, so it is right after a restart'
        + ' and in a window that never saw the binding land',
        /t\.roundAwaits/.test(rel) && /prev\.runSessionId/.test(rel)
        && /t\.resumeSessionId = sid/.test(rel));
    ok('…and a round whose run is gone ENDS rather than waiting for ever',
        /the run this round replies to is gone/.test(rel));
    ok('…and it is asked from the pump as well as from the binding',
        /this\.releaseRounds\(\);/.test(src.slice(src.indexOf('private pump(): void'),
            src.indexOf('private launch(task: FarmTask)')))
        && /if \(p\.sessionId && this\.releaseRounds\(\)\)/.test(src));

    const block2 = src.slice(src.indexOf('private launchBlock'), src.indexOf('private recordBlock'));
    ok('‼️ …and until it lands the pump HOLDS it, under the same code the row was'
        + ' parked with — two spellings would announce a park every 30 seconds',
        /task\.roundAwaits && !task\.resumeSessionId/.test(block2)
        && /code: ROUND_BINDING_CODE/.test(block2));

    // ---- the automations, which is where the item's actual case lives -----
    ok('‼️ AN AUTOMATION CARRIES THE CHAIN. A schedule makes its run itself, at'
        + ' 09:00, with nobody here — so a chain is stated on IT or not at all,'
        + ' and it was drawn on the form and thrown away on the way to the store',
        /rounds\?: TaskRound\[\];/.test(src.slice(src.indexOf('export interface RunDimensions'),
            src.indexOf('export function runExtras'))));
    const extras = src.slice(src.indexOf('export function runExtras'), src.indexOf('export type ScheduleKind'));
    ok('…cleaned on the way through, by the same function the form and the bridge use',
        /const rounds = normalizeRounds\(d\.rounds\)/.test(extras)
        && /r\.rounds = rounds/.test(extras));

    const panel = fs2.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'tasksPanel.ts'), 'utf8');
    ok('‼️ …and the plan form SAVES it, which is the line whose absence made the'
        + ' whole feature unreachable from a schedule',
        /rounds: normalizeRounds\(item\.rounds\)\.length \? normalizeRounds\(item\.rounds\) : undefined/
            .test(panel));
    ok('…and gives it back when the schedule is opened again',
        /rounds: normalizeRounds\(s\.rounds\)/.test(panel)
        && /rounds: normalizeRounds\(dims\.rounds\)/.test(panel));
    ok('…and the row says how deep the run goes, beside the model and the retry policy',
        /label: 'Rounds', value: r/.test(panel));

    const bridge = fs2.readFileSync(path.join(__dirname, '..', 'src', 'core', 'bridge.js'
        .replace('.js', '.ts')), 'utf8');
    ok('‼️ …and so does the bridge, in one place, so every op that takes run'
        + ' dimensions takes a chain too',
        /out\.rounds = rounds;/.test(bridge) && /ROUNDS_NOTE/.test(bridge));
    ok('…refused on an interactive run rather than stored and quietly never used',
        /rounds are sent into the SAME conversation/.test(bridge));

    const page = fs2.readFileSync(path.join(__dirname, '..', 'media', 'tasksPage.js'), 'utf8');
    ok('‼️ …and the form says so where the boxes would be on an interactive run,'
        + ' the same treatment the Conversation picker already gets',
        /INTERACTIVE CANNOT HAVE ROUNDS/.test(page)
        && /More rounds <em>headless only<\/em>/.test(page));
    ok('…and the empty line names the kind it is sitting in, so a schedule reader'
        + ' connects it to the 09:00 job in front of them',
        /Every firing sends this one prompt and stops\./.test(page));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
