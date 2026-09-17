// M-3 — what happens when a run FAILS (compiled core/retry.js, pure).
//
// The extension always retried some failures. The problem the item names is
// that nobody could see or change any of it: six attempts and forty minutes
// were written into the manager, only ONE kind of failure qualified (the Claude
// session limit, matched against the output with a regex), and the attempt
// number was parsed back out of the task's TITLE. So the two things pinned
// hardest here are (a) every question the item asks has a field, and (b) the
// shipped default is EXACTLY the old behaviour — a settings item that changes
// what unconfigured work does on its way in is the one mistake to avoid.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    DEFAULT_RETRY, describeRetry, isLimitFailure, normalizeRetry, resolveRetry,
    retryDecision, retryWaitMin, RETRY_MAX_ATTEMPTS, RETRY_MAX_DELAY_MIN, RETRY_MAX_WAIT_MIN,
    compileRetryFormula, retryFormulaError, retryRefusal, parseLimitReset, planLimitReset,
    RETRY_DEFAULT_SAFETY_MIN, limitWindow
} = require(path.join(__dirname, '..', 'out', 'core', 'retry.js'));

const LIMIT = 'Claude usage limit reached. You have hit your session limit · resets 6:50pm';
const BROKE = 'Error: ENOENT: no such file or directory';

// ---------- the default IS the old behaviour ----------
{
    ok('‼️ the shipped default is what the extension always did — 6 × 40 min, limit only',
        DEFAULT_RETRY.max === 6 && DEFAULT_RETRY.delayMin === 40
        && DEFAULT_RETRY.when === 'limit' && DEFAULT_RETRY.backoff === 'same');

    const d = retryDecision(undefined, { attempt: 0, output: LIMIT });
    ok('an unconfigured run still retries a session limit, 40 minutes later',
        d.retry && d.delayMs === 40 * 60_000 && d.attempt === 1);
    ok('‼️ …and still does NOT retry a real failure, which is the whole point of the old rule',
        !retryDecision(undefined, { attempt: 0, output: BROKE }).retry);
    ok('…and it says WHY it did not, because that is what somebody comes looking for',
        /not a session limit/.test(retryDecision(undefined, { attempt: 0, output: BROKE }).why));
    ok('the sixth retry is the last one',
        retryDecision(undefined, { attempt: 5, output: LIMIT }).retry
        && !retryDecision(undefined, { attempt: 6, output: LIMIT }).retry);
    ok('…and running out is said in those words',
        /out of retries/.test(retryDecision(undefined, { attempt: 6, output: LIMIT }).why));
}

// ---------- every question the item asks has a field ----------
{
    ok('‼️ "should it retry at all" — 0 means never, whatever the failure was',
        !retryDecision({ max: 0 }, { attempt: 0, output: LIMIT }).retry);
    ok('…and that is not the same statement as saying nothing',
        retryDecision(undefined, { attempt: 0, output: LIMIT }).retry);

    const any = { max: 2, delayMin: 5, when: 'any' };
    ok('‼️ "for which failures" — `any` retries a real failure, which nothing could before',
        retryDecision(any, { attempt: 0, output: BROKE }).retry);
    ok('…and "how many" is honoured',
        retryDecision(any, { attempt: 1, output: BROKE }).retry
        && !retryDecision(any, { attempt: 2, output: BROKE }).retry);
    ok('…and "how long before the first one"',
        retryDecision(any, { attempt: 0, output: BROKE }).delayMs === 5 * 60_000);

    // ‼️ "and the ones after that" — the item asks this as a separate question
    // from the first wait, and it is: a fixed interval against something that is
    // rate-limiting you is how a retry policy becomes the problem.
    ok('"and the ones after that" — `same` keeps the interval',
        retryWaitMin({ delayMin: 10, backoff: 'same' }, 4) === 10);
    ok('‼️ …`double` doubles it: 10 · 20 · 40 · 80',
        [1, 2, 3, 4].map(n => retryWaitMin({ delayMin: 10, backoff: 'double' }, n)).join()
        === '10,20,40,80');
    ok('…and a doubled wait is capped, so "set and forget" is safe',
        retryWaitMin({ delayMin: 60, backoff: 'double' }, 12) === RETRY_MAX_WAIT_MIN);

    ok('"with the original prompt or a new one" — a policy can carry its own',
        resolveRetry({ prompt: 'read the output and fix what you got wrong' }).prompt
        === 'read the output and fix what you got wrong');
    ok('…and no prompt means the original is sent again',
        resolveRetry({ max: 2 }).prompt === undefined);
}

// ---------- what a form / a settings file / the bridge may say ----------
{
    ok('a typo cannot make a run that retries forever',
        normalizeRetry({ max: 9999 }).max === RETRY_MAX_ATTEMPTS);
    ok('…nor one that waits a month', normalizeRetry({ delayMin: 99999 }).delayMin === RETRY_MAX_DELAY_MIN);
    ok('…nor one that waits no time at all', normalizeRetry({ delayMin: 0 }).delayMin === 1);
    ok('‼️ max 0 SURVIVES normalising — it is a decision, not an empty field',
        normalizeRetry({ max: 0 }).max === 0);
    ok('a word this build does not know is dropped rather than stored',
        normalizeRetry({ max: 2, backoff: 'fibonacci', when: 'sometimes' }).backoff === undefined);
    ok('an empty object says nothing, so the default stays in charge',
        normalizeRetry({}) === undefined && normalizeRetry(null) === undefined);
    ok('a blank prompt is not a prompt', normalizeRetry({ prompt: '   ' }) === undefined);
}

// ---------- a policy over a fallback ----------
{
    const fallback = { max: 2, delayMin: 5, when: 'any' };
    ok('a run with no policy of its own follows the user\'s default',
        retryDecision(undefined, { attempt: 0, output: BROKE, fallback }).retry);
    ok('‼️ …and one that states something overrides only what it states',
        resolveRetry({ delayMin: 90 }, fallback).delayMin === 90
        && resolveRetry({ delayMin: 90 }, fallback).when === 'any');
    ok('…falling through both lands on the shipped default',
        resolveRetry({ delayMin: 90 }, {}).when === 'limit');
}

// ---------- the limit test itself ----------
{
    ok('the session-limit wording is recognised', isLimitFailure(LIMIT));
    ok('…in its other shapes too',
        isLimitFailure('You have hit your session limit, resets at 3pm')
        && isLimitFailure('usage limit reached'));
    ok('and an ordinary crash is not one', !isLimitFailure(BROKE) && !isLimitFailure(''));
}

// ---------- B-03.8: the WEEKLY wall, measured off a real run ----------
{
    // ‼️ VERBATIM. This is what the CLI actually printed into the output file of
    // the headless run that was supposed to test surviving a restart
    // (task mts68fy13zrrk, 2026-09-08). The run died in 25 seconds and its own
    // record said "no retry — the failure was not a session limit, and this run
    // only retries those": the wall was real, the classifier had never been
    // shown this wording, and so nothing retried it and — worse — the account
    // handover (X-226) never fired either, because it asks the SAME question.
    const WEEKLY = "You've hit your weekly limit · resets 7pm (Asia/Bangkok)";
    ok('‼️ the weekly wall is a limit failure — the run that proved it was called something else',
        isLimitFailure(WEEKLY));
    ok('…and it names itself as the weekly window', limitWindow(WEEKLY) === 'weekly');
    ok('…while the session wording still names itself as the session window',
        limitWindow(LIMIT) === 'session');
    ok('…and a crash names no window at all', limitWindow(BROKE) === undefined);
    // ‼️ A BILLING CEILING IS NOT A WINDOW. Nothing reopens it but a person
    // raising it, so a run that waits for it waits for ever.
    ok('…and a monthly SPEND ceiling is still not a limit failure',
        !isLimitFailure('hit your monthly spend limit · raise it at claude.ai/settings/usage'));

    // The reset reading: "7pm" with no day is not an answer for a weekly window.
    const now = new Date('2026-09-08T11:30:00+07:00').getTime();
    const asSession = planLimitReset({ now, output: WEEKLY, safetyBufferMin: 0, fallbackMin: 40 });
    ok('‼️ read WITHOUT the window, the clock is taken at face value — the old behaviour',
        asSession.source === 'output');
    const asWeekly = planLimitReset({
        now, output: WEEKLY, safetyBufferMin: 0, fallbackMin: 40, window: 'weekly'
    });
    ok('‼️ but a weekly window will NOT wake at a 7pm nobody said was today',
        asWeekly.source === 'none' && asWeekly.at === now + 40 * 60_000);
    ok('…and it says exactly why, rather than reporting "nothing was printed"',
        /no day/.test(asWeekly.why) && /7pm/.test(asWeekly.why));
    // A calendar the sentence actually carries is trusted for either window.
    const stamped = planLimitReset({
        now, output: 'resets at 2026-09-12T19:00:00+07:00', safetyBufferMin: 0,
        fallbackMin: 40, window: 'weekly'
    });
    ok('…while an absolute stamp is trusted, because it carries its own calendar',
        stamped.source === 'output');
    ok('…and so is a duration', planLimitReset({
        now, output: 'resets in 2h 15m', safetyBufferMin: 0, fallbackMin: 40, window: 'weekly'
    }).source === 'output');
    // The branch tag the judgement rests on.
    ok('the parser says which branch produced the number',
        parseLimitReset(WEEKLY, now).kind === 'clock'
        && parseLimitReset('resets in 30 minutes', now).kind === 'relative'
        && parseLimitReset('resets at 2026-09-12T19:00:00Z', now).kind === 'absolute');
}

// ---------- what it says about itself ----------
{
    ok('‼️ the one-liner states the WHOLE policy, not just that there is one',
        describeRetry({ max: 3, delayMin: 20, backoff: 'double', when: 'any' })
        === '3× · first after 20 min, then doubling · on any failure');
    ok('…a fixed interval says so', /every 20 min/.test(describeRetry({ max: 3, delayMin: 20 })));
    ok('…a different prompt is part of the policy and is mentioned',
        /different prompt/.test(describeRetry({ max: 1, prompt: 'try again properly' })));
    ok('…and "off" is a sentence, not an empty string',
        describeRetry({ max: 0 }) === 'no retry — one attempt and it is done');
}

// ===========================================================================
// M-10 — the three free intervals, the formula for 4+, and the limit reset
//
// The item's own acceptance list, one block per line of it. The compatibility
// test comes first and is the one that matters most: a policy that states none
// of the new fields has to compute EXACTLY what it computed before they
// existed, or this release quietly rewrites every automation the user has.
// ===========================================================================

// ---------- 1) the first three, each on its own ----------
{
    const p = { max: 6, delayMin: 5, delay2Min: 20, delay3Min: 60, backoff: 'same', when: 'any' };
    ok('‼️ retry 1, 2 and 3 wait what the user said, one by one',
        retryWaitMin(p, 1) === 5 && retryWaitMin(p, 2) === 20 && retryWaitMin(p, 3) === 60);
    ok('…and retry 4 falls to the strategy, not to the third number',
        retryWaitMin(p, 4) === 5);
    ok('…the decision carries the same minutes',
        retryDecision(p, { attempt: 1, output: BROKE }).delayMs === 20 * 60_000);

    // ‼️ THE COMPATIBILITY TEST. Nothing new stated → the old arithmetic.
    const old = { max: 6, delayMin: 40, backoff: 'same' };
    ok('‼️ a policy that states none of the new fields is unchanged, every attempt',
        [1, 2, 3, 4, 5, 6].every(n => retryWaitMin(old, n) === 40));
    const dbl = { max: 6, delayMin: 30, backoff: 'double' };
    ok('…and so is a doubling one, cap included',
        retryWaitMin(dbl, 1) === 30 && retryWaitMin(dbl, 2) === 60 && retryWaitMin(dbl, 3) === 120
        && retryWaitMin(dbl, 10) === RETRY_MAX_WAIT_MIN);
    ok('…a second wait stated on a doubling policy overrides only that one',
        retryWaitMin({ ...dbl, delay2Min: 7 }, 2) === 7
        && retryWaitMin({ ...dbl, delay2Min: 7 }, 3) === 120);
}

// ---------- 2) the strategies for retry 4+ ----------
{
    ok('linear is base × n', retryWaitMin({ delayMin: 10, backoff: 'linear' }, 4) === 40);
    const f = { delayMin: 10, backoff: 'formula', formula: 'prev * 2 + 5' };
    ok('a formula reads `prev` as the wait actually used before it',
        // 1:10 · 2:25 · 3:55 · 4:115
        retryWaitMin(f, 2) === 25 && retryWaitMin(f, 3) === 55 && retryWaitMin(f, 4) === 115);
    ok('…and it can use n and base', retryWaitMin({ delayMin: 6, backoff: 'formula', formula: 'base * n' }, 4) === 24);
    ok('…min()/max() and ^ are part of the language',
        retryWaitMin({ delayMin: 2, backoff: 'formula', formula: 'min(2 ^ n, 500)' }, 5) === 32
        && retryWaitMin({ delayMin: 2, backoff: 'formula', formula: 'max(base, 45)' }, 4) === 45);
    ok('‼️ the user cap holds whatever the arithmetic says',
        retryWaitMin({ delayMin: 60, backoff: 'formula', formula: 'base * n * n', capMin: 90 }, 6) === 90);
    ok('…and the built-in 12-hour ceiling holds above the user cap',
        retryWaitMin({ delayMin: 600, backoff: 'double', capMin: 9999 }, 8) === RETRY_MAX_WAIT_MIN);
    ok('…a formula that cannot be read falls back to the base wait rather than to nothing',
        retryWaitMin({ delayMin: 12, backoff: 'formula', formula: 'prev * rand()' }, 4) === 12);
}

// ---------- 3) a dangerous or broken formula is REFUSED, never evaluated ----------
{
    ok('‼️ nothing is eval\'d: a function call outside the allowlist is refused BY NAME',
        /rand/.test(retryFormulaError('rand() * 5')));
    ok('…and so is a property walk', !!retryFormulaError('constructor.constructor'));
    ok('…and a statement', !!retryFormulaError('process.exit(1)'));
    ok('…and a stray character', /\$/.test(retryFormulaError('base $ 2')));
    ok('…an unclosed bracket is named as one', /bracket/.test(retryFormulaError('min(prev, 5')));
    ok('…and an expression that stops mid-air', /missing/.test(retryFormulaError('prev *')));
    ok('…an empty one is refused rather than treated as zero', !!retryFormulaError('   '));
    ok('…and a novel is refused before it is parsed',
        /longer than/.test(retryFormulaError('base+'.repeat(40) + '1')));
    ok('a good one compiles and computes', (() => {
        const c = compileRetryFormula('min(prev * 1.5, 120)');
        return c.ok && c.formula.value({ n: 4, prev: 100, base: 10 }) === 120;
    })());
    ok('‼️ the loud refusal is one call every surface can make',
        /refused/.test(retryRefusal({ backoff: 'formula', formula: 'rand()' }))
        && retryRefusal({ backoff: 'formula', formula: 'prev + 1' }) === ''
        && retryRefusal(undefined) === '');
    ok('…and an unknown strategy is refused there too',
        /not a retry strategy/.test(retryRefusal({ backoff: 'fibonacci' })));
    ok('normalizeRetry never throws on a bad formula — it is called on stored policies',
        (() => { normalizeRetry({ backoff: 'formula', formula: 'rand()' }); return true; })());
    ok('…and keeps the words the user typed rather than dropping them',
        normalizeRetry({ backoff: 'formula', formula: 'rand()' }).formula === 'rand()');
    ok('…while the one-liner says out loud that it will not be used',
        /could not be read/.test(describeRetry({ max: 5, backoff: 'formula', formula: 'rand()' })));
}

// ---------- 4) reading "resets …" out of what the CLI printed ----------
{
    const noon = new Date('2026-08-14T12:00:00').getTime();   // local noon
    const hh = ts => new Date(ts).getHours() + ':' + String(new Date(ts).getMinutes()).padStart(2, '0');

    ok('12-hour with minutes', hh(parseLimitReset('limit reached · resets at 5:30pm', noon).at) === '17:30');
    ok('12-hour without minutes', hh(parseLimitReset('resets 5pm', noon).at) === '17:00');
    ok('24-hour', hh(parseLimitReset('your limit will reset at 17:30', noon).at) === '17:30');
    ok('‼️ 12am is MIDNIGHT, not noon — and it is tomorrow',
        (() => {
            const r = parseLimitReset('resets at 12:00am', noon);
            return hh(r.at) === '0:00' && r.at > noon;
        })());
    ok('‼️ a clock time already past today means the NEXT one, i.e. tomorrow',
        (() => {
            const r = parseLimitReset('resets at 9:00am', noon);
            return r.at > noon && r.at - noon > 20 * 3600_000;
        })());
    ok('…but one that has only just passed is now, not tomorrow (clock skew)',
        (() => {
            const r = parseLimitReset('resets at 11:59', noon);
            return r.at - noon < 2 * 3600_000;
        })());
    ok('an explicit UTC offset is honoured',
        (() => {
            const r = parseLimitReset('resets at 15:30 +03:00', noon);
            return r.at === Date.parse('2026-08-14T15:30:00+03:00');
        })());
    ok('…and so is a named zone',
        (() => {
            const r = parseLimitReset('resets at 5:30pm (Europe/Istanbul)', noon);
            return r.at === Date.parse('2026-08-14T17:30:00+03:00');
        })());
    ok('an absolute stamp needs no interpretation at all',
        parseLimitReset('resets at 2026-08-14T14:30:00Z', noon).at
        === Date.parse('2026-08-14T14:30:00Z'));
    ok('…and Codex\'s own seconds field is read as seconds',
        parseLimitReset('"resets_at": 1786800000', noon).at === 1786800000000);
    ok('a duration is a duration', parseLimitReset('resets in 45 minutes', noon).at === noon + 45 * 60_000);
    ok('…including hours and minutes together',
        parseLimitReset('resets in 2h 15m', noon).at === noon + (135 * 60_000));
    ok('‼️ an ambiguous bare number is refused rather than guessed at',
        parseLimitReset('resets 5', noon) === undefined);
    ok('…and a line that says nothing about a reset yields nothing',
        parseLimitReset('the build failed at 5pm', noon) === undefined);
    // Written against `noon` rather than against a fixed zone: this suite runs
    // on whatever clock the machine has, and an absolute stamp is the one shape
    // where "already passed" can be stated without one.
    ok('…and a reset already in the past is reported as past, not rolled forward',
        parseLimitReset('resets at ' + new Date(noon - 3600_000).toISOString(), noon).past === true);
}

// ---------- 5) the plan: engine data beats output beats the ordinary wait ----------
{
    const now = Date.parse('2026-08-14T12:00:00Z');
    const engineAt = now + 90 * 60_000;
    const a = planLimitReset({
        now, engineResetAt: engineAt, output: 'resets at 23:00', safetyBufferMin: 3, fallbackMin: 40
    });
    ok('‼️ the engine\'s own figure wins over the printed sentence',
        a.source === 'engine' && a.at === engineAt + 3 * 60_000);
    const b = planLimitReset({ now, output: 'resets in 30 minutes', safetyBufferMin: 3, fallbackMin: 40 });
    ok('…the printed sentence is used when the engine published nothing',
        b.source === 'output' && b.at === now + 33 * 60_000);
    const c = planLimitReset({ now, output: 'it just broke', safetyBufferMin: 3, fallbackMin: 40 });
    ok('‼️ …and with neither, the ordinary wait is used AND SAID, never guessed silently',
        c.source === 'none' && c.at === now + 40 * 60_000 && /no reset time/.test(c.why));
    ok('the buffer is the user\'s and its default is stated once',
        planLimitReset({ now, engineResetAt: engineAt, fallbackMin: 40 }).at
        === engineAt + RETRY_DEFAULT_SAFETY_MIN * 60_000);
    ok('‼️ a reset that already passed does not wait until tomorrow — the buffer is the whole wait',
        planLimitReset({ now, engineResetAt: now - 3600_000, safetyBufferMin: 5, fallbackMin: 40 }).at
        === now + 5 * 60_000);
    ok('…and the line a person reads names the reset, the buffer and the result',
        /limit reset .* \+ 3 min → retry /.test(a.why));
}

// ---------- 6) reset-aware overrides the FIRST retry, and only that ----------
{
    const now = Date.parse('2026-08-14T12:00:00Z');
    const p = {
        max: 5, delayMin: 40, delay2Min: 10, delay3Min: 15,
        when: 'limit', resetAware: true, safetyBufferMin: 3
    };
    const first = retryDecision(p, { attempt: 0, output: LIMIT, now, engineResetAt: now + 60 * 60_000 });
    ok('‼️ the first retry is an ABSOLUTE moment, so a restart cannot re-derive it',
        first.retry && first.notBefore === now + 63 * 60_000 && first.resetSource === 'engine');
    ok('…and its words carry the source', /engine's own usage data/.test(first.why));
    const second = retryDecision(p, { attempt: 1, output: LIMIT, now, engineResetAt: now + 60 * 60_000 });
    ok('‼️ the SECOND retry keeps its own stated interval — the window question is answered',
        second.retry && second.notBefore === undefined && second.delayMs === 10 * 60_000);
    const notLimit = retryDecision({ ...p, when: 'any' },
        { attempt: 0, output: BROKE, now, engineResetAt: now + 60 * 60_000 });
    ok('‼️ …and a failure that is NOT a limit never uses the reset path',
        notLimit.retry && notLimit.notBefore === undefined && notLimit.delayMs === 40 * 60_000);
    const noSource = retryDecision(p, { attempt: 0, output: 'You have hit your session limit.', now });
    ok('with no reset time anywhere, the ordinary wait is used and the record says so',
        noSource.resetSource === 'none' && noSource.notBefore === now + 40 * 60_000
        && /no reset time/.test(noSource.why));
    ok('reset-aware is OFF unless asked for — nothing changes for an existing policy',
        retryDecision({ max: 3, delayMin: 40, when: 'limit' },
            { attempt: 0, output: LIMIT, now, engineResetAt: now + 60 * 60_000 }).notBefore === undefined);
    ok('…and the other three engines\' limit sentences are recognised too',
        isLimitFailure('429 Too Many Requests') && isLimitFailure('RESOURCE_EXHAUSTED')
        && isLimitFailure('rate limit exceeded'));
}

// ---------- 7) the model reads, clamps and describes itself ----------
{
    const n = normalizeRetry({
        max: 4, delayMin: '5', delay2Min: 20, delay3Min: 0, capMin: 5000,
        backoff: 'formula', formula: '  prev + base  ', resetAware: 'true', safetyBufferMin: 999
    });
    ok('the new fields are read and clamped by the same reader as the old ones',
        n.delayMin === 5 && n.delay2Min === 20 && n.capMin === RETRY_MAX_WAIT_MIN
        && n.formula === 'prev + base' && n.resetAware === true && n.safetyBufferMin === 240);
    ok('‼️ a zero minute field is silence, not "wait no time"', n.delay3Min === undefined);
    ok('the fallback fills one field at a time, so a partial policy keeps the default\'s formula',
        (() => {
            const r = resolveRetry({ delayMin: 5 },
                { max: 4, backoff: 'formula', formula: 'base * n', resetAware: true });
            return r.delayMin === 5 && r.formula === 'base * n' && r.resetAware === true;
        })());
    ok('the one-liner states the staged waits when there are any',
        describeRetry({ max: 5, delayMin: 5, delay2Min: 20, delay3Min: 60, backoff: 'double' })
            .indexOf('5 → 20 → 60 min') > 0);
    ok('…and the reset-aware first retry, with its buffer',
        /limit reset \+ 3 min/.test(describeRetry({ max: 2, resetAware: true, safetyBufferMin: 3 })));
    ok('…and the cap, when the user set one',
        /capped at 90 min/.test(describeRetry({ max: 5, delayMin: 10, backoff: 'double', capMin: 90 })));
}

// ---------- ‼️ X-227 — THE RETRY RUNS THE WAY THE ORIGINAL RAN ----------------
//
// There are two retries in this product and only one of them was holding to
// that rule. `TaskManager.retryTask` — the one a person presses — carries every
// dimension across by hand and says why beside each: "a retry that quietly moved
// to the agent's standing endpoint is a different run wearing the same name."
// `maybeScheduleRetry` — the one that fires BY ITSELF when a run fails, at 03:00,
// with nobody at a window — hand-copied its own shorter list and dropped seven.
//
// Measured before the fix: account, providerId, tier, finishSound, superpowers,
// interactiveTarget and interactiveClose. Each has its own cost, and the first
// is the worst of them: a reset-aware retry WAITS for one account's window to
// reopen and then ran the work on whichever account happened to be standing.
//
// The list is `RunDimensions`, read out of the source, so this cannot shrink
// again quietly — the next dimension somebody adds fails here until the
// unattended retry carries it too.
{
    const fs = require('fs');
    const ROOT = path.join(__dirname, '..');
    const tasksTs = fs.readFileSync(path.join(ROOT, 'src', 'core', 'tasks.ts'), 'utf8');
    const at = tasksTs.indexOf('export interface RunDimensions');
    const fields = [...tasksTs.slice(at, tasksTs.indexOf('\n}', at))
        .matchAll(/^ {4}([a-zA-Z][\w]*)\??:/gm)].map(m => m[1]);
    ok('RunDimensions was found and has fields', at > 0 && fields.length >= 10);

    const anchor = 'const t = this.addTask(agent, nextTitle, prompt, mode, {';
    const i = tasksTs.indexOf(anchor);
    let body = '';
    if (i >= 0) {
        let depth = 0;
        for (let j = i + anchor.length - 1; j < tasksTs.length; j++) {
            if (tasksTs[j] === '{') { depth++; }
            else if (tasksTs[j] === '}') { depth--; if (!depth) { body = tasksTs.slice(i, j + 1); break; } }
        }
    }
    ok('the unattended retry\'s own reading of the failed run was found',
        body.length > 200 && /\bpermissionMode\b/.test(body));
    ok('‼️ X-227 — the retry nobody is watching carries EVERY dimension of the run '
        + 'it repeats (missing: '
        + fields.filter(f => !new RegExp(`\\b${f}\\b`).test(body)).join(', ') + ')',
        fields.every(f => new RegExp(`\\b${f}\\b`).test(body)));
    // ‼️ Named on its own, because a list that is merely "not empty" does not say
    // which plan the night was billed to.
    ok('‼️ X-227 — and the ACCOUNT above all, or the wait and the run disagree '
        + 'about whose window was being waited for',
        /\baccount\b/.test(body));

    /**
     * ‼️ X-229 — AND THE ROUND BOUNDARY, WHICH IS THE SAME DEFECT AND WORSE.
     *
     * A round is not a new run: it is a REPLY, and it goes back into the same
     * conversation by `resumeSessionId`. So a round that changes account resumes
     * a transcript on a sign-in that never had it — the exact mid-run drift the
     * X-211 family was built to end, arriving through the front door.
     *
     * The third hand-copied dimension list in this file. Measured before the
     * fix, round two was dropping account, providerId, tier, finishSound and
     * superpowers, and its list looked complete enough that nobody read it
     * against `RunDimensions`. Which is the argument for reading it here.
     */
    const rAnchor = 'const row = this.addTask(agent, `${baseTitle} · R${next.round}`, prompt, task.mode, {';
    const ri = tasksTs.indexOf(rAnchor);
    let round = '';
    if (ri >= 0) {
        let depth = 0;
        for (let j = ri + rAnchor.length - 1; j < tasksTs.length; j++) {
            if (tasksTs[j] === '{') { depth++; }
            else if (tasksTs[j] === '}') { depth--; if (!depth) { round = tasksTs.slice(ri, j + 1); break; } }
        }
    }
    ok('the round boundary\'s own reading of the round before it was found',
        round.length > 200 && /\bpermissionMode\b/.test(round));
    ok('‼️ X-229 — a round carries EVERY dimension of the round it answers (missing: '
        + fields.filter(f => !new RegExp(`\\b${f}\\b`).test(round)).join(', ') + ')',
        fields.every(f => new RegExp(`\\b${f}\\b`).test(round)));
    ok('‼️ X-229 — and the ACCOUNT above all: a round resumes a conversation, and '
        + 'resuming one on a sign-in that never had it is the drift X-211 ended',
        /\baccount\b/.test(round));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
