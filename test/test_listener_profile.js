// X-482 — where a live event's time goes: every live listener timed under the place it
// subscribed from, handle() as a whole, read through the bridge op live.profile.
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const { ListenerProfile, callerSite } = require(path.join(ROOT, 'out', 'core', 'listenerProfile.js'));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const SKIP = /(^|[\\/])live\.[jt]s$/;
const stack = 'Error\n    at D:\\x\\out\\core\\listenerProfile.js:40:31\n    at LiveMonitor.wrapped (D:\\x\\out\\core\\live.js:510:12)\n'
    + '    at activate (D:\\x\\out\\extension.js:12345:9)\n    at more (D:\\x\\out\\other.js:1:1)';
ok('the site is the first frame outside the profiler and the live monitor', callerSite(stack, SKIP) === 'extension.js:12345');
ok('a frame without a function name is read too', callerSite('Error\n    at D:\\x\\out\\views\\statusBar.js:77:5', SKIP) === 'statusBar.js:77');
ok('no usable frame says so', callerSite('Error', SKIP) === 'unknown' && callerSite(undefined, SKIP) === 'unknown');

// A fake event of the vscode shape, and a clock the test moves.
let t = 0, wall = 1000;
const listeners = [];
const event = (fn, thisArgs, bag) => {
    listeners.push(fn);
    const d = { dispose: () => { listeners.splice(listeners.indexOf(fn), 1); } };
    if (Array.isArray(bag)) { bag.push(d); }
    return d;
};
const fire = (e) => [...listeners].forEach(f => f(e));
const p = new ListenerProfile(() => t, SKIP, () => wall);
const on = p.wrap('update', event);
const seen = [];
const bag = [];
const self = { name: 'me' };
on(function (e) { seen.push(this && this.name); t += 5; }, self, bag);
on(e => { t += 40; if (e === 'boom') { throw new Error('boom'); } });
ok('a wrapped subscription is still a subscription, its disposable in the bag', listeners.length === 2 && bag.length === 1);
fire('a');
fire('b');
let threw = false;
try { fire('boom'); } catch { threw = true; }
const r = p.report();
ok('a listener that throws still throws', threw);
ok('this is the one the subscriber asked for', seen.join() === 'me,me,me');
ok('two subscriptions, each named by where it subscribed', r.sites.length === 2 && r.sites.every(s => /^update test_listener_profile\.js:\d+$/.test(s.site)));
ok('‼️ heaviest first, its calls, total, average and worst counted (the throwing call included)',
    r.sites[0].calls === 3 && r.sites[0].totalMs === 120 && r.sites[0].avgMs === 40 && r.sites[0].maxMs === 40
    && r.sites[1].totalMs === 15 && r.sites[1].calls === 3);
bag[0].dispose();
fire('c');
ok('a disposed listener is gone and no longer counted', listeners.length === 1 && p.report().sites[1].calls === 3);
const v = p.time('handle', () => { t += 7; return 'out'; });
ok('time() passes the value through and records the span', v === 'out' && p.report().sites.some(s => s.site === 'handle' && s.totalMs === 7));
ok('since is when counting began', p.report().since === 1000);
wall = 5000;
p.reset();
ok('reset clears the figures and restarts the clock', p.report().sites.length === 0 && p.report().since === 5000);

// The wiring.
const live = fs.readFileSync(path.join(ROOT, 'src', 'core', 'live.ts'), 'utf8');
ok('‼️ the live monitor\'s two events are the profiled ones',
    /readonly onDidUpdate: vscode\.Event<void> = this\.profile\.wrap\('update', this\.onDidUpdateEmitter\.event\);/.test(live)
    && /readonly onEvent: vscode\.Event<LiveEvent> = this\.profile\.wrap\('event', this\.onEventEmitter\.event\);/.test(live)
    && !/readonly onDidUpdate = this\.onDidUpdateEmitter\.event/.test(live));
ok('handle() is timed as a whole', /handle\(payload: HookPayload\): void \{\s*this\.profile\.time\('handle \(whole, listeners included\)', \(\) => this\.handleNow\(payload\)\);/.test(live));
const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
ok('the bridge reads it: op live.profile, with top and reset', /op: 'live\.profile'/.test(ext) && /live\.profile\.report\(\)/.test(ext) && /live\.profile\.reset\(\)/.test(ext));

console.log(`\nlistener profile: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
