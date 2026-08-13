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
    retryDecision, retryWaitMin, RETRY_MAX_ATTEMPTS, RETRY_MAX_DELAY_MIN, RETRY_MAX_WAIT_MIN
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

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
