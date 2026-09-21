// K-43 — A QUESTION NOBODY IS IN THE ROOM FOR MUST NOT HOLD THE TURN FOR EVER.
//
// An agent that asks `AskUserQuestion` parks its turn until somebody answers.
// On an attended card that is the point; on an unattended one it is a deadlock
// that reports nothing — the session is alive, spending nothing and doing
// nothing, and the only surface that would say so is a human looking at it.
//
// ‼️ THE PART THAT MUST NOT GO WRONG QUIETLY IS THE SCOPE, so it is pinned
// hardest here: a permission ask is never answered on a timer, and a question
// that reads as destructive is left for a person. Both of those failures would
// be silent — an unattended machine that allowed something, with a transcript
// saying only that it was allowed.
'use strict';
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    autoAnswerSettings, autoAnswerFor, autoAnswerClock, autoAnswerNote, destructiveWord,
    formatCountdown, recommendedOption,
    AUTO_ANSWER_DEFAULT_SECONDS, AUTO_ANSWER_MIN_SECONDS, AUTO_ANSWER_MAX_SECONDS,
    AUTO_ANSWER_ENABLED_KEY, AUTO_ANSWER_TIMEOUT_KEY
} = require(path.join(__dirname, '..', 'out', 'core', 'autoAnswer.js'));

const ON = autoAnswerSettings({});
const ask = (o) => Object.assign({
    requestId: 'req-1', interactive: true, ts: 1000, detail: 'choosing an approach',
    questions: [{
        question: 'Which approach?',
        options: [{ label: 'Incremental' }, { label: 'Rewrite' }]
    }]
}, o);

// ---------- the settings, and what an out-of-range one means ----------
{
    ok('the names are the contributed ones, so the manifest and the reader cannot drift',
        AUTO_ANSWER_ENABLED_KEY === 'agentFarm.console.autoAnswer.enabled'
        && AUTO_ANSWER_TIMEOUT_KEY === 'agentFarm.console.autoAnswer.timeoutSeconds');
    ok('‼️ an absent setting is the default, and the default is ON — a feature that only works '
        + 'once somebody finds the switch protects nobody on the night it is needed',
        ON.enabled === true && ON.timeoutSeconds === AUTO_ANSWER_DEFAULT_SECONDS);
    ok('only an explicit false turns it off',
        autoAnswerSettings({ enabled: false }).enabled === false
        && autoAnswerSettings({ enabled: undefined }).enabled === true);
    ok('a number is taken as given', autoAnswerSettings({ timeoutSeconds: 30 }).timeoutSeconds === 30);
    ok('‼️ …and an out-of-range one is CLAMPED, not refused — this is a wait, and somebody who '
        + 'typed 1 meant "as soon as possible", not "fail"',
        autoAnswerSettings({ timeoutSeconds: 1 }).timeoutSeconds === AUTO_ANSWER_MIN_SECONDS
        && autoAnswerSettings({ timeoutSeconds: 99999 }).timeoutSeconds === AUTO_ANSWER_MAX_SECONDS);
    ok('…but a value that is not a number falls back to the default rather than being guessed at',
        autoAnswerSettings({ timeoutSeconds: 'soon' }).timeoutSeconds === AUTO_ANSWER_DEFAULT_SECONDS
        && autoAnswerSettings(undefined).timeoutSeconds === AUTO_ANSWER_DEFAULT_SECONDS);
}

// ---------- which option, and why the mark beats the position ----------
{
    ok('with no mark the first option is the pick — which is the tool\'s own convention',
        recommendedOption({ options: [{ label: 'A' }, { label: 'B' }] }) === 'A');
    ok('‼️ …but a MARKED option wins wherever it sits: the mark is a statement, the position '
        + 'is only a convention',
        recommendedOption({ options: [{ label: 'A' }, { label: 'B (Recommended)' }] }) === 'B (Recommended)');
    ok('…and the fleet asks in two languages, so both marks are read',
        recommendedOption({ options: [{ label: 'A' }, { label: 'B (Önerilen)' }] }) === 'B (Önerilen)'
        && recommendedOption({ options: [{ label: 'A' }, { label: 'B (Tavsiye edilen)' }] }) === 'B (Tavsiye edilen)');
    ok('an empty label is not an option', recommendedOption({ options: [{ label: '  ' }, { label: 'B' }] }) === 'B');
    ok('nothing to pick is null, never a guess',
        recommendedOption({ options: [] }) === null && recommendedOption(undefined) === null);
}

// ---------- ‼️ THE SCOPE — the two refusals that would otherwise be silent ----------
{
    const perm = autoAnswerFor(ask({ interactive: false, questions: [] }), ON);
    ok('‼️ A PERMISSION ASK IS NEVER ANSWERED ON A TIMER — answering that on an unattended '
        + 'machine hands it to whatever asked',
        perm.armed === false && /permission is never answered on a timer/.test(perm.why));

    const kill = autoAnswerFor(ask({
        questions: [{
            question: 'Ready?',
            options: [{ label: 'Yes' }, { label: 'No' }]
        }],
        detail: 'delete the release branch'
    }), ON);
    ok('‼️ …and a destructive question is left for a person, with the word that stopped it named '
        + '— a silent refusal looks exactly like the feature being switched off',
        kill.armed === false && /"delete"/.test(kill.why));

    const hidden = autoAnswerFor(ask({
        questions: [{
            question: 'Proceed?',
            options: [
                { label: 'Yes', description: 'This overwrites the remote branch.' },
                { label: 'No' }
            ]
        }]
    }), ON);
    ok('‼️ …read over the DESCRIPTIONS too: a label reading "Yes" is safe until the line under it '
        + 'says what it does',
        hidden.armed === false && /overwrites/i.test(hidden.why));

    ok('…Turkish is read as well, because the fleet asks in both',
        autoAnswerFor(ask({
            questions: [{ question: 'Devam edilsin mi?', options: [{ label: 'Dosyaları sil' }, { label: 'Vazgeç' }] }]
        }), ON).armed === false);

    const off = autoAnswerFor(ask({}), autoAnswerSettings({ enabled: false }));
    ok('switched off, nothing is armed and the card says which setting did it',
        off.armed === false && off.why.indexOf(AUTO_ANSWER_ENABLED_KEY) > 0);

    ok('a question with no options has no deterministic answer, so the clock does not run',
        autoAnswerFor(ask({ questions: [{ question: 'Which?', options: [] }] }), ON).armed === false);
    ok('…and neither does an ask carrying no questions at all',
        autoAnswerFor(ask({ questions: [] }), ON).armed === false);
    ok('nothing pending is not an error', autoAnswerFor(undefined, ON).armed === false);
}

// ---------- what it actually answers ----------
{
    const one = autoAnswerFor(ask({}), ON);
    ok('the ordinary case is armed, and the answer is keyed by the question itself',
        one.armed === true && one.answers['Which approach?'] === 'Incremental' && one.why === '');

    const many = autoAnswerFor(ask({
        questions: [
            { question: 'Approach?', options: [{ label: 'A' }, { label: 'B (Recommended)' }] },
            { question: 'Scope?', multiSelect: true, options: [{ label: 'Core' }, { label: 'Docs' }] }
        ]
    }), ON);
    ok('‼️ every question is answered, not only the first — one arity is not the shape of the others',
        Object.keys(many.answers).length === 2 && many.answers['Approach?'] === 'B (Recommended)');
    ok('‼️ …and a multi-select answer is an ARRAY, which is the shape that side of the wire takes',
        Array.isArray(many.answers['Scope?']) && many.answers['Scope?'][0] === 'Core');
}

// ---------- the clock ----------
{
    const s = autoAnswerSettings({ timeoutSeconds: 60 });
    const a = ask({ ts: 1000 });
    ok('‼️ MEASURED FROM THE ASK, not from when the panel noticed it — otherwise reloading the '
        + 'window silently buys the question another wait',
        autoAnswerClock(a, s, 1000).remainingMs === 60000
        && autoAnswerClock(a, s, 31000).remainingMs === 30000);
    ok('…it expires at zero and never goes negative',
        autoAnswerClock(a, s, 61000).remainingMs === 0
        && autoAnswerClock(a, s, 999999).expired === true);
    ok('‼️ …and a HELD clock is frozen: the reader pressed the button, so the wait stops '
        + 'rather than merely being redrawn',
        autoAnswerClock(a, s, 50000, 31000).remainingMs === 30000
        && autoAnswerClock(a, s, 999999, 31000).expired === false);
    ok('nothing pending has no clock', autoAnswerClock(undefined, s, 1) === null);

    ok('the countdown is the shortest unambiguous form',
        formatCountdown(0) === '0:00' && formatCountdown(59000) === '0:59'
        && formatCountdown(300000) === '5:00' && formatCountdown(3661000) === '1:01:01');
    ok('…and it rounds UP, so it never shows 0:00 while there is still time to press Hold',
        formatCountdown(1) === '0:01' && formatCountdown(59001) === '1:00');
}

// ---------- the transcript keeps WHAT was chosen, not merely that something was ----------
{
    const note = autoAnswerNote({ 'Approach?': 'Incremental', 'Scope?': ['Core', 'Docs'] });
    ok('‼️ the note names the picks — a line saying only "answered" is the one thing nobody can '
        + 'reconstruct later',
        /Zaman aşımı/.test(note) && /Approach\? → Incremental/.test(note)
        && /Scope\? → Core, Docs/.test(note));
    ok('…and it still says what happened when there is nothing to list',
        /Zaman aşımı/.test(autoAnswerNote(undefined)));
}

console.log(`test_auto_answer.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
