// X-482 — which function the extension host's time goes to: a sampling CPU profile
// taken in-process (bridge op farm.cpuProfile), read into self and inclusive lists.
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const { summarizeCpuProfile, placeOf } = require(path.join(ROOT, 'out', 'core', 'cpuProfile.js'));
const { captureCpuProfile, cpuProfileRunning } = require(path.join(ROOT, 'out', 'service', 'cpuProfiler.js'));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// Where a frame is.
const ext = 'C:\\Users\\u\\.vscode\\extensions\\muvusoft.agent-farm-3.0.0';
ok('a file url under the extension is relative to it and ours',
    JSON.stringify(placeOf('file:///c%3A/Users/u/.vscode/extensions/muvusoft.agent-farm-3.0.0/out/views/statusBar.js', ext))
    === JSON.stringify({ file: 'out/views/statusBar.js', ours: true }));
ok('a plain Windows path under the extension too',
    placeOf('C:\\Users\\u\\.vscode\\extensions\\muvusoft.agent-farm-3.0.0\\out\\extension.js', ext).file === 'out/extension.js');
ok('another extension is its last two segments, not ours',
    JSON.stringify(placeOf('file:///c:/Users/u/.vscode/extensions/other.ext-1.0.0/dist/main.js', ext)) === JSON.stringify({ file: 'dist/main.js', ours: false }));
ok('a sibling folder that only shares the prefix is not ours',
    placeOf('C:/Users/u/.vscode/extensions/muvusoft.agent-farm-3.0.0-old/out/a.js', ext).ours === false);
ok('a native frame has no place', placeOf('', ext).file === '');

// A profile built by hand: root -> (program), (idle), (garbage collector), outer -> inner -> outer (recursion).
const f = (id, functionName, url, lineNumber, children) => ({ id, callFrame: { functionName, url, lineNumber }, children });
const u = 'C:/Users/u/.vscode/extensions/muvusoft.agent-farm-3.0.0/out/views/statusBar.js';
const prof = {
    nodes: [f(1, '(root)', '', -1, [2, 3, 4, 5]), f(2, '(program)', '', -1), f(3, '(idle)', '', -1),
        f(4, '(garbage collector)', '', -1), f(5, 'update', u, 79, [6]), f(6, 'buildNeeds', u, 10, [7]), f(7, 'update', u, 79)],
    startTime: 0, endTime: 100000,
    // each sample stands until the next: deltas[i+1] is sample i's time (microseconds)
    samples: [3, 5, 6, 7, 2, 4, 3],
    timeDeltas: [0, 40000, 10000, 20000, 5000, 3000, 2000]
};
const s = summarizeCpuProfile(prof, ext, 10);
const self = Object.fromEntries(s.self.map(r => [r.fn, r]));
ok('idle, gc and program are split out of the function lists',
    s.idleMs === 40 && s.gcMs === 2 && s.programMs === 3 && !s.self.some(r => r.fn.startsWith('(')));
ok('busy is everything but idle (program and gc included)', s.busyMs === 10 + 20 + 5 + 3 + 2);
ok('self time per function, both recursion frames of update summed', self.update && self.update.ms === 10 + 5 && self.buildNeeds.ms === 20);
ok('a row carries its place and ours', self.update.at === 'out/views/statusBar.js:80' && self.update.ours === true);
ok('self is heaviest first', s.self[0].fn === 'buildNeeds');
const inc = Object.fromEntries(s.inclusive.map(r => [r.fn, r]));
ok('inclusive counts a recursing function once per stack', inc.update.ms === 35 && inc.buildNeeds.ms === 25);
ok('percent is of the busy time', inc.update.pct === 87.5 && self.buildNeeds.pct === 50);
ok('duration and sample count', s.ms === 100 && s.samples === 7);
ok('top cuts the lists', summarizeCpuProfile(prof, ext, 1).self.length === 1);
const noDeltas = { nodes: [f(1, '(root)', '', -1, [2]), { ...f(2, 'work', u, 1), hitCount: 4 }], startTime: 0, endTime: 8000 };
ok('without deltas the hit counts share the span', summarizeCpuProfile(noDeltas, ext).self[0].ms === 8);

// A real profile of this process: a function known to burn the thread must be named.
function burnTheThread(ms) { const end = Date.now() + ms; let x = 0; while (Date.now() < end) { x += Math.sqrt(x + 1); } return x; }
(async () => {
    setTimeout(() => burnTheThread(250), 30);
    const p = captureCpuProfile(600);
    ok('it reports itself running while it samples', cpuProfileRunning() === true);
    let refused = '';
    try { await captureCpuProfile(10); } catch (e) { refused = String(e && e.message); }
    ok('a second profile at the same time is refused by name', /already being taken/.test(refused));
    const real = summarizeCpuProfile(await p, ROOT, 15);
    const burn = real.self.find(r => r.fn === 'burnTheThread');
    const line = fs.readFileSync(__filename, 'utf8').split(/\r?\n/).findIndex(l => l.startsWith('function burnTheThread')) + 1;
    ok('the burning function is named with its place, from a real in-process profile',
        !!burn && burn.ms >= 150 && burn.at === `test/test_cpu_profile.js:${line}` && burn.ours === true);
    if (!burn || burn.at !== `test/test_cpu_profile.js:${line}`) { console.log('  burn row', JSON.stringify(burn), 'line', line); }
    ok('the profiler is free again afterwards', cpuProfileRunning() === false);
    ok('and it can be taken again', (await captureCpuProfile(20)).nodes.length > 0);

    // The wiring.
    const src = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the bridge takes it: op farm.cpuProfile summarizes a captured profile and saves the .cpuprofile',
        /op: 'farm\.cpuProfile'/.test(src) && /await captureCpuProfile\(seconds \* 1000\)/.test(src)
        && /summarizeCpuProfile\(profile, context\.extensionPath, top\)/.test(src) && /\.cpuprofile`\)/.test(src));
    const svc = fs.readFileSync(path.join(ROOT, 'src', 'service', 'cpuProfiler.ts'), 'utf8');
    ok('‼️ in-process only: no inspector port is ever opened', !/inspector\.open|--inspect/.test(svc) && /new inspector\.Session\(\)/.test(svc));

    console.log(`\ncpu profile: ${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('  FAIL threw ' + (e && e.stack)); process.exitCode = 1; });
