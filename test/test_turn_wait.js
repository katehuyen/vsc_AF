// U-148 (in-turn) — a working turn blocked in a call that only waits (a sleep loop,
// TaskOutput) is marked when the call is made, and the Console card reads it as waiting.
'use strict';
const path = require('path');
const W = require(path.join(__dirname, '..', 'out', 'core', 'turnWait.js'));
const { reduceEvent, newSessionState } = require(path.join(__dirname, '..', 'out', 'core', 'consoleproto.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

/* ---------- which calls are waits ---------- */
const long = 'L="C:/Users/someone/AppData/Local/Temp/af-suite-with-a-long-name-for-the-log-file.log"; ';
ok('‼️ a shell until-sleep loop', W.isWaitCall('Bash', { command: 'until grep -q done x.log; do sleep 5; done; tail -3 x.log' }));
ok('‼️ …even when the loop starts past the 120 characters a message keeps', W.isWaitCall('Bash', { command: long + long + 'until test -f done; do sleep 5; done' }));
ok('a while loop in PowerShell', W.isWaitCall('PowerShell', { command: 'while (!(Test-Path done)) { Start-Sleep 5 }' }));
ok('a bare sleep', W.isWaitCall('Bash', { command: 'sleep 30' }));
ok('TaskOutput blocking (its default)', W.isWaitCall('TaskOutput', { task_id: 'b1' }));
ok('…not TaskOutput that only peeks', !W.isWaitCall('TaskOutput', { task_id: 'b1', block: false }));
ok('a command that works is not a wait', !W.isWaitCall('Bash', { command: 'npx tsc -p . && node test/run-all.js' }));
ok('a sleep inside real work is not a wait', !W.isWaitCall('Bash', { command: 'npm run build && sleep 1 && npm test' }));
ok('a backgrounded loop returns at once — not a wait', !W.isWaitCall('Bash', { command: 'until x; do sleep 1; done', run_in_background: true }));
ok('another tool', !W.isWaitCall('Read', { file_path: 'sleep.txt' }));

/* ---------- the mark rides on the call, and the turn reads it ---------- */
const NOW = 1785164000000;
let s = newSessionState({ id: 'c1', agentId: 'a', agentName: 'dev', cwd: 'D:/a', model: 'haiku', now: NOW });
const call = (name, input) => reduceEvent(s, {
    type: 'assistant', message: { id: 'm' + Math.random(), content: [{ type: 'tool_use', id: 't' + Math.random(), name, input }] }
}, NOW).state;
s = call('Bash', { command: 'until grep -q ok log; do sleep 5; done' });
const last = s.messages[s.messages.length - 1];
ok('‼️ the call is marked a wait when it is made', last.role === 'tool' && last.tool.wait === true);
ok('‼️ a working turn whose last call is that wait is waiting on it', s.status === 'working' && W.turnWaitingOn(s) !== '');
s = reduceEvent(s, { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] } }, NOW).state;
ok('…until the CLI answers the call', W.turnWaitingOn(s) === '');
s = call('Bash', { command: 'npm test' });
ok('an ordinary call is not marked', !s.messages[s.messages.length - 1].tool.wait && W.turnWaitingOn(s) === '');
ok('a resting session is never "in a turn wait"', W.turnWaitingOn({ status: 'idle', messages: [{ role: 'tool', tool: { name: 'Bash', detail: 'sleep 5', wait: true } }] }) === '');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
