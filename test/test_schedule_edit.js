// M-21 — editing a schedule must not run it, and a save must be able to take a
// field back OFF.
//
// The report, verbatim in effect: a 05:00 daily backup was edited just before
// midnight to change its ENGINE only; it started running the moment the form
// closed, and did so again on every subsequent save. Then the engine was
// changed back, the row went on showing the old model as if the revert had
// taken, and reopening the editor offered the engine that was supposedly gone.
//
// Two independent defects, both in the same save:
//
//   1. `existing.lastRunKey = undefined` on EVERY save. `scheduleDue` decides on
//      nothing else, so both of its branches then said "due": past the time,
//      today looks unhandled; before it, a catch-up policy looks at yesterday
//      and finds nothing there either.
//   2. `Object.assign(existing, fields)` with a `fields` that OMITTED whatever
//      the user had cleared. A merge cannot express "this is gone", so the
//      engine stayed while the model beside it changed.
//
// Both are now behind `TaskManager.updateSchedule`, which the page and the
// bridge share, so neither door can grow its own opinion again.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');

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
            },
            workspace: { getConfiguration: () => ({ get: (_k, d) => d }) },
            Uri: {}, ViewColumn: {}, ConfigurationTarget: {}, env: {}
        };
    }
    return origLoad.call(this, request, parent, isMain);
};
const {
    TaskManager, scheduleDue, settledKeyAfterEdit, previousOccurrenceKey
} = require(path.join(ROOT, 'out/core/tasks.js'));
Module._load = origLoad;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const key = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
// a fixed clock: Wednesday 2026-07-15, and a schedule that fires at 05:00
const at = (day, h, m) => new Date(2026, 6, day, h, m);

// ---------- the stamp itself ----------
{
    const daily = { kind: 'daily', hour: 5, minute: 0 };
    ok('before the time: yesterday is what is settled, so today still fires',
        settledKeyAfterEdit(daily, at(15, 0, 30)) === previousOccurrenceKey(daily, at(15, 0, 30)));
    ok('after the time: today is settled, so the next run is tomorrow',
        settledKeyAfterEdit(daily, at(15, 14, 0)) === key(at(15, 0, 0)));
    ok('at the minute itself counts as passed',
        settledKeyAfterEdit(daily, at(15, 5, 0)) === key(at(15, 0, 0)));

    const weekly = { kind: 'weekly', dow: 1, hour: 5, minute: 0 };
    ok('weekly on a day that is not its own settles the previous matching day',
        settledKeyAfterEdit(weekly, at(15, 14, 0)) === '2026-7-13');
    ok('weekly on its own day, after the time, settles that day',
        settledKeyAfterEdit({ kind: 'weekly', dow: 3, hour: 5, minute: 0 }, at(15, 14, 0))
        === key(at(15, 0, 0)));
}

// ---------- the manager, on the reported case ----------
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-sched-'));
    const agentDir = path.join(tmp, 'agent');
    fs.mkdirSync(agentDir, { recursive: true });
    const agent = { id: 'a1', name: 'basit', dir: agentDir };
    const mgr = new TaskManager(path.join(tmp, 'farm-tasks.json'), () => [agent],
        () => false, () => '', { quotaCheck: () => 'test hold' });

    const made = mgr.addSchedule({
        agentId: agent.id, agentName: agent.name,
        title: 'Ajan reposu günlük yedek commit', prompt: 'commit it',
        mode: 'headless', kind: 'daily', hour: 5, minute: 0,
        enabled: true, missed: 'run', engine: 'claude', model: 'haiku'
    });

    // The user's own moment: 00:30, the 05:00 run still ahead, only the engine
    // touched. Before the fix this came back due, and started an agent.
    const beforeMidnightish = at(15, 0, 30);
    made.lastRunKey = previousOccurrenceKey(made, beforeMidnightish);   // settled, as created
    mgr.updateSchedule(made.id, { engine: 'agy', model: 'gemini-3.7-flash' }, true, beforeMidnightish);
    ok('‼️ changing only the engine before the time does NOT make it due',
        scheduleDue(mgr.schedules[0], beforeMidnightish).due === false);
    ok('…and it still fires at its own time',
        scheduleDue(mgr.schedules[0], at(15, 5, 0)).due === true);

    // Saving again, and again — the user pressed Save four or five times.
    for (let i = 0; i < 4; i++) {
        mgr.updateSchedule(made.id, { model: 'haiku' }, true, beforeMidnightish);
    }
    ok('…and no number of saves turns into a run',
        scheduleDue(mgr.schedules[0], beforeMidnightish).due === false);

    // ‼️ The revert. `engine: undefined` is the form's empty box, and it has to
    // REMOVE the field — this is the half that used to be silently ignored.
    mgr.updateSchedule(made.id, { engine: undefined, model: 'haiku' }, true, beforeMidnightish);
    ok('‼️ an empty field is cleared, not left at its old value',
        mgr.schedules[0].engine === undefined && mgr.schedules[0].model === 'haiku');
    ok('…and a key the patch never mentions survives untouched',
        mgr.schedules[0].prompt === 'commit it' && mgr.schedules[0].missed === 'run');

    // An edit made AFTER the time settles today instead: the change takes
    // effect tomorrow rather than starting a run on the way out of the form.
    mgr.updateSchedule(made.id, { model: 'opus' }, true, at(15, 14, 0));
    ok('‼️ an edit after the time does not fire it either',
        scheduleDue(mgr.schedules[0], at(15, 14, 0)).due === false);
    ok('…and it comes back at its own time the next day',
        scheduleDue(mgr.schedules[0], at(16, 5, 0)).due === true);

    // A patch that is NOT an edit of the plan leaves the stamp alone.
    mgr.schedules[0].lastRunKey = '2026-7-1';
    mgr.updateSchedule(made.id, { title: 'yeniden adlandırıldı' });
    ok('a patch that does not ask to settle leaves the stamp where it was',
        mgr.schedules[0].lastRunKey === '2026-7-1');

    // Switching one back ON settles whether or not the caller asked: it was
    // off, so it did not miss anything.
    mgr.schedules[0].enabled = false;
    mgr.schedules[0].lastRunKey = '2026-7-1';
    mgr.toggleSchedule(mgr.schedules[0], at(15, 14, 0));
    ok('‼️ switching a schedule back on is not a missed run',
        mgr.schedules[0].enabled === true
        && scheduleDue(mgr.schedules[0], at(15, 14, 0)).due === false);
    ok('…and switching one OFF changes nothing but the switch',
        (() => {
            mgr.schedules[0].lastRunKey = '2026-7-1';
            mgr.toggleSchedule(mgr.schedules[0], at(15, 14, 0));
            return mgr.schedules[0].enabled === false && mgr.schedules[0].lastRunKey === '2026-7-1';
        })());

    // A quiet-hours deferral of the occurrence just settled would otherwise
    // fire the very run the edit was meant to replace.
    mgr.schedules[0].enabled = true;
    mgr.schedules[0].pendingRunKey = '2026-7-15';
    mgr.updateSchedule(made.id, { model: 'sonnet' }, true, at(15, 14, 0));
    ok('‼️ a held-over occurrence is dropped by the edit that replaced it',
        mgr.schedules[0].pendingRunKey === undefined);

    // `once` has no recurring occurrence to be behind. Moving the appointment
    // is a new appointment; not moving it keeps whatever it had.
    const one = mgr.addSchedule({
        agentId: agent.id, agentName: agent.name, title: 'tek sefer', prompt: 'p',
        mode: 'headless', kind: 'once', hour: 0, minute: 0,
        onceAt: at(20, 9, 0).getTime(), enabled: true
    });
    one.lastRunKey = 'once';
    mgr.updateSchedule(one.id, { title: 'tek sefer, yeni ad' }, true);
    ok('a once schedule that did not move keeps its run stamp',
        mgr.schedules[1].lastRunKey === 'once');
    mgr.updateSchedule(one.id, { onceAt: at(21, 9, 0).getTime() }, true);
    ok('…and a once schedule whose appointment moved is a new appointment',
        mgr.schedules[1].lastRunKey === undefined);

    fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------- the two doors, and what the page stopped deciding ----------
{
    const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
    const panelTs = read('src', 'panels', 'tasksPanel.ts');
    const extTs = read('src', 'extension.ts');
    const pageJs = read('media', 'tasksPage.js');

    ok('‼️ the page no longer clears the day-stamp itself',
        !/existing\.lastRunKey = undefined/.test(panelTs));
    ok('…it goes through the one door, asking it to settle',
        /m\.updateSchedule\(existing\.id, fields, true\)/.test(panelTs));
    ok('…and so does the bridge, so the two cannot answer differently',
        /taskManager\.updateSchedule\(cur\.id, patch, true\)/.test(extTs));
    ok('the whole-form merge can empty a field',
        /function applyForm<T extends object>/.test(panelTs)
        && /if \(value === undefined\) \{ delete t\[key\]; \} else \{ t\[key\] = value; \}/.test(panelTs));
    ok('…and no edit path assigns the form straight onto the stored object',
        !/Object\.assign\(existing, fields\)/.test(panelTs));

    // Every dimension is STATED, so a cleared one arrives as undefined rather
    // than as an absence that reads like "no change".
    const dimsAt = panelTs.indexOf('const dims = (): RunDimensions => ({');
    const dims = panelTs.slice(dimsAt, panelTs.indexOf('});', dimsAt));
    for (const k of ['engine', 'model', 'effort', 'permissionMode', 'cli', 'workDir',
        'priority', 'projectId', 'ignoreBudget', 'retry']) {
        ok(`dims() states "${k}" even when it is empty`,
            new RegExp(`^\\s*${k}: `, 'm').test(dims));
    }
    ok('…and none of them is spread in conditionally any more',
        !/\.\.\.\(str\('engine'\)/.test(dims));

    // The save says what it did, because "saved." was true and useless.
    ok('the confirmation names the next firing and denies having run it',
        /function nextFireNote\(s: FarmSchedule\): string/.test(panelTs)
        && /Saving never runs it\./.test(panelTs));

    // And the row shows the engine, without which the revert could not be seen.
    ok('the plan row carries the engine, not the model alone',
        /engine: s\.engine \? engineOf\(s\.engine\)\.label : ''/.test(panelTs)
        && /function launchCell\(p\)/.test(pageJs));
    ok('…and a template says what it will launch with',
        /model: t\.model \?\? '',\s*\n\s*engine: t\.engine \? engineOf\(t\.engine\)\.label : ''/.test(panelTs));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
