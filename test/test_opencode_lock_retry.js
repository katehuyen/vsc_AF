// X-329 — OpenCode's first-use lock race is answered with ONE retry, on both
// doors that start an OpenCode process: a headless task (`opencode run`) and
// the Console's shared `opencode acp` runtime.
'use strict';
const fs = require('fs');
const path = require('path');
const R = require(path.join(__dirname, '..', 'out', 'core', 'opencodeLockRetry.js'));
const A = require(path.join(__dirname, '..', 'out', 'core', 'opencodeacp.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---- the decision -----------------------------------------------------------
{
    const d = o => R.opencodeLockRetryDelay(Object.assign({ exitCode: 1, ranMs: 1500, output: '', retried: false }, o));
    ok('‼️ "database is locked" at start-up is retried after 2 s', d({ output: 'Error: database is locked' }) === 2000);
    ok('the migration race\'s other face is retried too', d({ output: 'Failed query: CREATE TABLE workspace (' }) === 2000);
    ok('‼️ only ONCE — the retry itself is not retried', d({ output: 'database is locked', retried: true }) === 0);
    ok('a clean exit is never retried', d({ output: 'database is locked', exitCode: 0 }) === 0);
    ok('a death long after start is not the start-up race', d({ output: 'database is locked', ranMs: 60000 }) === 0);
    ok('any other failure is left as it is', d({ output: 'Error: model not found' }) === 0);
    ok('the retry says so in the run\'s own record',
        /X-329.*first-use lock \(database is locked\).*retried once after 2 s/.test(R.opencodeLockRetryNote('x database is locked y')));
}

// ---- the headless door: wired in the one close handler ----------------------
{
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'tasks.ts'), 'utf8');
    ok('the headless close handler asks the decision with both streams',
        /opencodeLockRetryDelay\(\{ exitCode: code, ranMs: Date\.now\(\) - spawnedAt,\s*output: seen \+ errSeen/.test(src));
    ok('…respawns the same task with the note, only while it is still running',
        /if \(task\.status !== 'running'\) \{ return; \}\s*this\.spawnHeadless\(task, agent, opencodeLockRetryNote\(seen \+ errSeen\)\)/.test(src));
    ok('…and the retry APPENDS, keeping the first attempt\'s record',
        /if \(retryNote\) \{ fs\.appendFileSync\(outFile, retryNote, 'utf8'\); \} else \{ fs\.writeFileSync\(outFile, header, 'utf8'\); \}/.test(src));
}

// ---- the Console door: the shared acp runtime --------------------------------
function child(onInit) {
    const c = {
        _out: [], _err: [], _exit: [], killed: 0, pid: 1,
        write(text) {
            let f; try { f = JSON.parse(text); } catch { return true; }
            if (f.method === 'initialize') { setImmediate(() => onInit(c, f)); }
            return true;
        },
        kill() { c.killed++; },
        onStdout(fn) { c._out.push(fn); }, onStderr(fn) { c._err.push(fn); }, onExit(fn) { c._exit.push(fn); },
        push(o) { for (const fn of c._out) { fn(Buffer.from(JSON.stringify(o) + '\n')); } },
        err(t) { for (const fn of c._err) { fn(t); } },
        die(code) { for (const fn of c._exit) { fn(code); } }
    };
    return c;
}
const INIT = { protocolVersion: 1, agentCapabilities: { loadSession: true, sessionCapabilities: { close: {}, list: {}, resume: {} } },
    authMethods: [], agentInfo: { name: 'OpenCode', version: '1.18.19' } };
const answer = (c, f) => c.push({ jsonrpc: '2.0', id: f.id, result: INIT });
const lockDeath = (c) => { c.err('Error: database is locked\n'); c.die(1); };

(async () => {
    {
        const kids = [];
        const io = { spawn() { const c = child(kids.length === 0 ? lockDeath : answer); kids.push(c); return c; } };
        const rt = new A.OpencodeRuntime(io);
        const p1 = rt.ready('D:/w');
        await new Promise(r => setTimeout(r, 300));
        const p2 = rt.ready('D:/w');          // a second card during the wait
        let caps, err;
        try { caps = await p1; } catch (e) { err = e; }
        await p2.catch(() => { });
        ok('‼️ the Console runtime comes up after a start-up lock death', !!caps && !err);
        ok('…in exactly two processes: the one that died and its retry', kids.length === 2);
        ok('…a card opened during the wait joined the retry instead of spawning a third', kids.length === 2);
        rt.dispose && rt.dispose();
    }
    {
        const kids = [];
        const io = { spawn() { const c = child(kids.length < 5 ? lockDeath : answer); kids.push(c); return c; } };
        const rt = new A.OpencodeRuntime(io);
        let err;
        try { await rt.ready('D:/w'); } catch (e) { err = e; }
        ok('a second lock death is shown as it is', !!err && /database is locked/.test(String(err.message)));
        ok('…after one retry, not more', kids.length === 2);
        rt.dispose && rt.dispose();
    }
    {
        const kids = [];
        const io = { spawn() { const c = child((cc) => { cc.err('Error: bad config\n'); cc.die(1); }); kids.push(c); return c; } };
        const rt = new A.OpencodeRuntime(io);
        let err;
        try { await rt.ready('D:/w'); } catch (e) { err = e; }
        ok('any other start-up death is not retried', !!err && kids.length === 1);
        rt.dispose && rt.dispose();
    }
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL harness: ' + e.stack); process.exit(1); });
