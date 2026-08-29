// M-30 — "⚡ Superpowers" as a RUN dimension, on a task, a schedule and a trigger.
//
// ‼️ WHY THIS FILE EXISTS. X-133 put the engineering discipline behind ONE
// switch per agent. That answers "how does `developer` work" and cannot answer
// "…except for this job" — and a nightly lint sweep and a feature build are the
// same agent doing work of two different kinds. The Console composer's ⚡ chip
// could say so for a session somebody was watching; an automation that fires at
// 03:00 had no way to say it at all, which is precisely the run nobody is there
// to correct.
//
// THE WHOLE SUITE IS ABOUT ONE THING: THERE ARE THREE STATES, NOT TWO.
//
//   absent  → the agent's own default decides. This is what every task written
//             before the field existed said, and it must keep meaning it.
//   true    → this job works to the discipline, whatever the agent's default is
//   false   → this job does NOT, whatever the agent's default is
//
// A boolean that collapsed `absent` into `false` would have switched the
// discipline off on every existing automation the day it shipped — silently,
// because nothing about those tasks changed. So every layer here is measured
// for the difference between "said no" and "said nothing": the normalizer, the
// bridge in both directions, the form's three words, and the applier.
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

// `core/tasks.js` reaches for vscode at load time; `runExtras` is a pure
// function inside it, so the module is given just enough to exist.
class FakeEmitter {
    constructor() { this._cbs = []; }
    get event() { return cb => { this._cbs.push(cb); return { dispose() { } }; }; }
    fire(v) { for (const cb of this._cbs) { cb(v); } }
    dispose() { }
}
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
        return {
            EventEmitter: FakeEmitter,
            Disposable: { from: () => ({ dispose() { } }) },
            window: {
                showInformationMessage: () => Promise.resolve(undefined),
                showWarningMessage: () => Promise.resolve(undefined),
                createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }),
                onDidCloseTerminal: () => ({ dispose() { } })
            }
        };
    }
    return origLoad.call(this, request, parent, isMain);
};

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const B = require(path.join(ROOT, 'out', 'core', 'bridge.js'));
const R = require(path.join(ROOT, 'out', 'core', 'tasks.js'));

const pageJs = read('media', 'tasksPage.js');
const panelTs = read('src', 'panels', 'tasksPanel.ts');
const extTs = read('src', 'extension.ts');
const tasksTs = read('src', 'core', 'tasks.ts');
const fixtureJs = read('test', 'fixtures', 'tasks.js');

// ---------- the normalizer: `false` is an ANSWER, not an absence ----------
{
    eq('a run told yes carries yes', R.runExtras({ superpowers: true }).superpowers, true);
    // ‼️ THE ONE THAT A TRUTHINESS TEST WOULD HAVE EATEN. `if (d.superpowers)`
    // reads identically on the day it is written and drops every "not on this
    // one" for ever — handing the job straight back to the agent's default,
    // which is the exact opposite of what was asked.
    eq('a run told NO carries no', R.runExtras({ superpowers: false }).superpowers, false);
    ok('a run told nothing says nothing',
        !('superpowers' in R.runExtras({})));
    ok('…and an undefined is an absence, not a third value',
        !('superpowers' in R.runExtras({ superpowers: undefined })));
    ok('every object that runs carries the field',
        /superpowers\?: boolean;/.test(tasksTs));
    // ‼️ A RETRY WORKS THE WAY THE ORIGINAL WORKED. The engine, the model and
    // the finish sound each had this defect once: a rerun that quietly fell
    // back to a default is a different job from the one being retried.
    ok('a retry inherits the original\'s answer',
        /copy\.superpowers = over\?\.superpowers \?\? task\.superpowers;/.test(tasksTs));
    ok('…and both doors take it explicitly rather than by accident',
        (tasksTs.match(/'finishSound' \| 'superpowers'/g) || []).length === 2);
}

// ---------- the bridge in: an agent can say it, and is refused by name ----------
{
    const dims = args => B.bridgeRunDimensions(args);
    const refused = args => {
        try { dims(args); return ''; } catch (e) { return String(e.message); }
    };
    eq('a stated yes rides through', dims({ superpowers: true }).superpowers, true);
    eq('a stated no rides through too', dims({ superpowers: false }).superpowers, false);
    ok('an unstated field is left out entirely, not written as false',
        !('superpowers' in dims({})));
    // ‼️ REFUSED WHERE IT IS WRITTEN DOWN. A schedule is a run that has not
    // happened yet, and a string that reads as "on" to a person is not a
    // boolean — storing it happily tonight is a discipline that is not applied
    // at 03:00, with nobody there to see it was not.
    const why = refused({ superpowers: 'on' });
    ok('a value that is not a boolean is refused by name',
        /superpowers/.test(why) && /true or false/.test(why));
    ok('…and the refusal NAMES the third answer, so the caller learns it exists',
        /omit/i.test(why) && /default/i.test(why));
}

// ---------- the bridge out: null is a different answer from false ----------
{
    const out = o => B.bridgeDimsOut(o);
    // ‼️ THE ROUND TRIP IS WHERE THE THIRD STATE DIES IF IT IS GOING TO. Read a
    // schedule back as `false`, write it away again, and a run that never chose
    // has now frozen today's default onto itself — permanently, and with no
    // event anywhere saying so.
    eq('a run that says nothing about it reads back as null', out({}).superpowers, null);
    eq('a yes reads back as true', out({ superpowers: true }).superpowers, true);
    eq('and a no reads back as false, NOT as null', out({ superpowers: false }).superpowers, false);
}

// ---------- the form: one row, three words, and the empty one is not "off" ----------
{
    // ‼️ THREE OPTIONS AND THE FIRST IS THE DEFAULT. A checkbox has two states;
    // this question has three, and a checkbox would have had to invent an
    // answer for every task ever written.
    ok('the panel offers exactly three choices',
        /superpowersChoices: \[/.test(panelTs)
        && /id: '', label: 'Agent default'/.test(panelTs)
        && /id: 'on'/.test(panelTs) && /id: 'off'/.test(panelTs));
    ok('the row is drawn beside the other dimensions',
        /choiceSel\('superpowers'/.test(pageJs));
    ok('the draft starts on the default, not on off',
        /superpowers: '',/.test(pageJs));
    ok('the box is read back into the draft',
        /v\('superpowers', 'superpowers'\)/.test(pageJs));
    // ‼️ M-21's DEFECT, WHICH THIS FIELD WOULD HAVE REPEATED. A control that is
    // not in the change list is read by `readComposer()` and never CALLS it:
    // the pick is made, the page repaints, and the box goes back to the default
    // in silence because the draft was never told.
    ok('…and changing it tells the draft',
        /'finishSound', 'superpowers',/.test(pageJs));
    // The photograph is taken from the fixture, so a fixture without the list
    // photographs a form with no such box — which is what happened first.
    ok('the fixture carries the list, or the render shows no box at all',
        /superpowersChoices: \[/.test(fixtureJs));
}

// ---------- the translation: three words in, three states out ----------
{
    // One function, four call sites. Four inline ternaries would part company
    // the first time a fourth word was added.
    ok('the page\'s words become the run\'s states in ONE place',
        /function superpowersChoice\(v: string\): boolean \| undefined/.test(panelTs));
    ok('…and anything unreadable falls back to the DEFAULT, never to off',
        /w === 'on' \? true : w === 'off' \? false : undefined/.test(panelTs));
    ok('the form omits it entirely when the box says "agent default"',
        /superpowersChoice\(str\('superpowers'\)\) !== undefined/.test(panelTs));
    // Reopening a form must show what the object actually says, including the
    // difference between "off" and "never chose".
    ok('reopening an object shows the answer it was saved with',
        (panelTs.match(/superpowers: \w+\.superpowers === undefined \? '' : \(\w+\.superpowers \? 'on' : 'off'\)/g) || []).length === 3);
}

// ---------- the hop that is the whole feature ----------
{
    // ‼️ THE EXPLICIT PICK BEATS BOTH RULES ABOVE IT — the agent's default AND
    // the delegation exclusion. A person who ticked the box on THIS job has
    // answered the question the default exists to answer in their absence, and
    // silently dropping their answer is the one outcome neither rule was
    // written for. `??` and not `||`: `false` is an answer.
    ok('an explicit pick on the run beats the agent default',
        /task\.superpowers \?\? \(!task\.missionId && superpowersOnFor\(task\.agentName\)\)/.test(extTs));
    // …and when nothing was picked, the line is exactly what it was before.
    ok('…and saying nothing leaves the old behaviour untouched',
        /!task\.missionId && superpowersOnFor\(task\.agentName\)/.test(extTs));
    // ‼️ `null` IS THE CLEAR, because a tri-state boolean has no `""`. The
    // string dimensions beside it clear on an empty string; collapsing the two
    // conventions would make it impossible to hand the answer back.
    ok('an automation can be edited back to the agent default',
        (extTs.match(/\? undefined : args\.superpowers === true/g) || []).length === 2);
    ok('…and both editors say so in their own words',
        (extTs.match(/superpowers\? \(true\|false/g) || []).length === 2);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
