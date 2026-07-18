// Schedule missed-time policy (compiled core/tasks.js, pure functions):
// scheduleDue's catch-up branch — a daily/weekly occurrence that passed while
// no VS Code window was open fires at the first opportunity ('run'), is only
// offered ('ask'), or stays lost ('skip'/default = the old behavior) — and
// previousOccurrenceKey, the "settle the past at configuration time" stamp.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// load the compiled module in plain node by mocking the 'vscode' import
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return {
            Uri: {}, window: {}, EventEmitter: class { fire() {} get event() { return () => ({ dispose() {} }); } dispose() {} },
            workspace: { getConfiguration: () => ({ get: (_k, d) => d }) },
            ViewColumn: {}, ConfigurationTarget: {}, env: {}
        };
    }
    return origLoad.apply(this, arguments);
};
const { scheduleDue, previousOccurrenceKey } = require(path.join(__dirname, '..', 'out', 'core', 'tasks.js'));
Module._load = origLoad;

const key = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
// fixed clock: Wed 2026-07-15; target time 05:00
const at = (day, h, m) => new Date(2026, 6, day, h, m);
const daily = extra => Object.assign({
    id: 's1', agentId: 'a', agentName: 'dev', title: 't', prompt: 'p',
    mode: 'headless', kind: 'daily', hour: 5, minute: 0, enabled: true
}, extra);

// ---------- the old behavior is untouched ----------
{
    const r = scheduleDue(daily({}), at(15, 5, 0));
    ok('on time on the day: due with the day key', r.due && r.runKey === key(at(15, 0, 0)) && !r.missedKey);
    ok('late the same day still fires (any policy)', scheduleDue(daily({ missed: 'skip' }), at(15, 14, 0)).due);
    ok('already ran today: not due',
        !scheduleDue(daily({ lastRunKey: key(at(15, 0, 0)) }), at(15, 6, 0)).due);
    ok('before the time, no policy: not due, nothing missed', (() => {
        const r2 = scheduleDue(daily({}), at(15, 3, 0));
        return !r2.due && !r2.missedKey;
    })());
    ok('disabled schedules never fire', !scheduleDue(daily({ enabled: false, missed: 'run' }), at(15, 3, 0)).due);
    const once = { id: 'o', agentId: 'a', agentName: 'dev', title: 't', prompt: 'p', mode: 'headless', kind: 'once', hour: 0, minute: 0, onceAt: at(14, 12, 0).getTime(), enabled: true };
    ok('once in the past still catches up by design', scheduleDue(once, at(15, 3, 0)).due);
}

// ---------- 'run': a fully missed occurrence fires at the first opportunity ----------
{
    // yesterday 05:00 never ran (lastRunKey is older); now = today 03:00, before today's time
    const r = scheduleDue(daily({ missed: 'run', lastRunKey: key(at(13, 0, 0)) }), at(15, 3, 0));
    ok('missed yesterday fires now', r.due === true);
    ok('…with the missed day as runKey (today still fires at 05:00)', r.runKey === key(at(14, 0, 0)));
    ok('…and reports when it was scheduled', r.missedKey === key(at(14, 0, 0))
        && new Date(r.missedAt).getHours() === 5);
    ok('yesterday already ran: nothing to catch up',
        !scheduleDue(daily({ missed: 'run', lastRunKey: key(at(14, 0, 0)) }), at(15, 3, 0)).due);
}

// ---------- 'ask': the missed occurrence is flagged but not auto-fired ----------
{
    const r = scheduleDue(daily({ missed: 'ask', lastRunKey: key(at(13, 0, 0)) }), at(15, 3, 0));
    ok('ask: not due on its own', r.due === false);
    ok('ask: missed occurrence surfaced for the Run/Skip toast', r.missedKey === key(at(14, 0, 0)));
    ok('skip policy: same situation stays silent', (() => {
        const r2 = scheduleDue(daily({ missed: 'skip', lastRunKey: key(at(13, 0, 0)) }), at(15, 3, 0));
        return !r2.due && !r2.missedKey;
    })());
}

// ---------- weekly: the previous matching weekday is the missed occurrence ----------
{
    // dow=1 (Monday 2026-07-13); now = Wednesday 03:00
    const weekly = daily({ kind: 'weekly', dow: 1, missed: 'run', lastRunKey: '2026-7-6' });
    const r = scheduleDue(weekly, at(15, 3, 0));
    ok('weekly: missed Monday fires on Wednesday', r.due && r.runKey === '2026-7-13');
    ok('weekly: Monday already ran → silent',
        !scheduleDue(daily({ kind: 'weekly', dow: 1, missed: 'run', lastRunKey: '2026-7-13' }), at(15, 3, 0)).due);
    ok('weekly on its own day still fires normally', (() => {
        const r2 = scheduleDue(daily({ kind: 'weekly', dow: 3, missed: 'run' }), at(15, 6, 0)); // Wed
        return r2.due && r2.runKey === key(at(15, 0, 0)) && !r2.missedKey;
    })());
}

// ---------- previousOccurrenceKey: the "settle the past" stamp ----------
{
    ok('daily: yesterday', previousOccurrenceKey({ kind: 'daily' }, at(15, 3, 0)) === '2026-7-14');
    ok('weekly: previous matching weekday', previousOccurrenceKey({ kind: 'weekly', dow: 1 }, at(15, 3, 0)) === '2026-7-13');
    ok('weekly on the same weekday goes a full week back',
        previousOccurrenceKey({ kind: 'weekly', dow: 3 }, at(15, 3, 0)) === '2026-7-8');
    // the stamp makes a fresh catch-up schedule quiet until a REAL miss:
    const fresh = daily({ missed: 'run', lastRunKey: previousOccurrenceKey({ kind: 'daily' }, at(15, 3, 0)) });
    ok('stamped fresh schedule: quiet before its first time', !scheduleDue(fresh, at(15, 3, 0)).due);
    ok('stamped fresh schedule: fires normally at its time', scheduleDue(fresh, at(15, 5, 0)).due);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
