// X-437 — Antigravity's quota read runs on its own two settings, apart from Claude's.
'use strict';
const path = require('path');
const { agyUsageBeatMs } = require(path.join(__dirname, '..', 'out', 'core', 'agyUsageBeat.js'));
const pkg = require(path.join(__dirname, '..', 'package.json'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

ok('idle: the minutes setting decides', agyUsageBeatMs(false, 240, 60) === 240 * 60_000);
ok('‼️ idle 0 = never read while idle', agyUsageBeatMs(false, 0, 60) === 0);
ok('‼️ …but idle 0 does not stop the active beat', agyUsageBeatMs(true, 0, 60) === 60_000);
ok('active: the seconds setting decides', agyUsageBeatMs(true, 240, 90) === 90_000);
ok('active: the 30 s floor holds', agyUsageBeatMs(true, 240, 5) === 30_000);

const props = pkg.contributes.configuration.reduce
    ? Object.assign({}, ...[].concat(pkg.contributes.configuration).map(c => c.properties || {}))
    : pkg.contributes.configuration.properties;
const idle = props['agentFarm.agyUsageRefreshMinutes'];
const act = props['agentFarm.agyUsageActiveRefreshSeconds'];
ok('setting: idle minutes, default 240, 0 allowed', idle && idle.type === 'number' && idle.default === 240 && idle.minimum === 0);
ok('setting: active seconds, default 60, floor 30', act && act.type === 'number' && act.default === 60 && act.minimum === 30);
ok('‼️ Claude\'s settings are unchanged', props['agentFarm.planUsageRefreshMinutes'].default === 5
    && props['agentFarm.planUsageActiveRefreshSeconds'].default === 60);

console.log(`test_agy_usage_beat: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
