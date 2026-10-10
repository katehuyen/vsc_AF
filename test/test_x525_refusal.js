'use strict';
// X-525 (4) — a launch landing on a route that cannot be run on is refused on every spawning door,
// never left to the shell's environment; a launch deliberately pinned to no route is untouched.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { launchSelection } = require('../out/core/launchSelection.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

/* ---------- which selection carries a route (pure) */
const resolve = sel => ({ identity: {}, ...(sel.providerId === 'live' ? { spawnEnv: { X: '1' } } : {}) });
const standingGone = () => ({ providerId: 'gone', tier: 'opus' });
ok('nothing named: the agent\'s own route is the selection, so it is what gets checked',
    launchSelection('claude', undefined, standingGone, resolve).sel.providerId === 'gone');
ok('‼️ pinned to no route (deliberately unrouted): no route is selected, so nothing can refuse it',
    !launchSelection('claude', { pinned: true }, standingGone, resolve).sel.providerId);
ok('a named route is the selection, whatever the agent stands on',
    launchSelection('claude', { providerId: 'live' }, standingGone, resolve).sel.providerId === 'live');

/* ---------- the host: one rule, every door */
const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
const r0 = ext.indexOf('const resolveLaunchRoute = (');
const resolver = ext.slice(r0, ext.indexOf('\n    };', r0));
ok('resolveLaunchRoute asks the one rule about the selection it lands on',
    /const why = sel\.providerId \? routeRefusalOf\(engine, sel\.providerId, sel\.tier \?\? '', sel\.modelId \?\? ''\) : undefined;/.test(resolver)
    && /\.\.\.\(refusal \? \{ refusal \} : \{\}\)/.test(resolver));
ok('…saying whether it was the launch\'s own route or the agent\'s', /the route this launch names cannot be run on/.test(resolver)
    && /own route for \$\{engine\} cannot be run on/.test(resolver));
const e0 = ext.indexOf('const engineRuntimeFor = (');
const runtime = ext.slice(e0, ext.indexOf('\n    };', e0));
ok('engineRuntimeFor hands the refusal on and no environment with it',
    /if \(r\?\.refusal\) \{ return \{ refusal: r\.refusal \}; \}/.test(runtime)
    && runtime.indexOf('r?.refusal') < runtime.indexOf('if (!r?.routed)'));
const s0 = ext.indexOf('const startClaudeSession = (');
const term = ext.slice(s0, ext.indexOf('launchClaudeTerminal(', s0));
ok('‼️ the terminal door refuses before the launch is recorded', term.includes('if (resolved?.refusal) {')
    && term.indexOf('resolved?.refusal') < term.indexOf('recordLaunch({'));
const p0 = ext.indexOf('const plannerRt = engineRuntimeFor(');
ok('the mission planner refuses before its command is built', p0 > 0
    && ext.indexOf('if (plannerRt?.refusal) { resolve({ ok: false, error: plannerRt.refusal }); return; }', p0)
        < ext.indexOf('const command = plannerCommand(', p0));
const con = fs.readFileSync(path.join(ROOT, 'src', 'core', 'consolehost.ts'), 'utf8');
const c0 = con.indexOf('const routeRt = this.engineRuntime?.(');
ok('the Console refuses before its spawn', c0 > 0 && con.indexOf('if (routeRt?.refusal) { return this.refuseStart(', c0)
    < con.indexOf('cp.spawn(this.exe(), args', c0));
const tasks = fs.readFileSync(path.join(ROOT, 'src', 'core', 'tasks.ts'), 'utf8');
ok('a task naming no route asks about its agent\'s own before the manifest',
    /const standing = !gone && this\.opts\.engineRuntime\?\.\(agent\.id, engineOf\(task\.engine\)\.id, this\.spawnRouteOf\(task\)\)\?\.refusal;/.test(tasks)
    && tasks.indexOf('const standing = !gone') < tasks.indexOf('task.launchId = this.opts.recordLaunch?.('));

console.log(`test_x525_refusal: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
