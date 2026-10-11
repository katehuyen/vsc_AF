// S-68 — "WHICH SESSION AM I?", ANSWERED FROM EVIDENCE.
//
// The baton needs its owner, and "the session working in this folder" is the
// guess this refuses: two sessions in one folder is the ordinary case. The
// order is pinned (arg → the engine's own variable → the CLI registry found by
// ancestry → refuse), the envelope is pinned to carry the parent pid, and the
// non-blocking tree reader is run for real against this machine.
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out', 'core');
const { whoami, registryMatch } = require(path.join(OUT, 'whoami.js'));
const { parseBridgeRequest } = require(path.join(OUT, 'bridge.js'));
const { readProcessTableAsync, ancestorsOf } = require(path.join(OUT, 'processTree.js'));

const records = [
    { pid: 500, sessionId: 'sess-claude', cwd: 'D:\\repo' },
    { pid: 700, sessionId: 'sess-other', cwd: 'D:\\repo' }
];

(async () => {
    // ---- the order ----------------------------------------------------------
    ok('an explicit session wins over everything',
        whoami({ arg: ' mine ', envSessionId: 'env', ppid: 9, records }).sessionId === 'mine'
        && whoami({ arg: 'mine', records }).source === 'arg');
    ok('then the engine\'s own variable',
        whoami({ envSessionId: 'env-1', ppid: 9, records }).source === 'env');
    const direct = whoami({ ppid: 500, records });
    ok('then the registry: the parent pid itself registered',
        direct.ok && direct.sessionId === 'sess-claude' && direct.source === 'registry' && direct.pid === 500 && direct.depth === 0);
    const climbed = whoami({ ppid: 42, ancestors: [42, 41, 700, 500], records });
    ok('‼️ …or the NEAREST registered ancestor — claude → shell → node af.js',
        climbed.ok && climbed.sessionId === 'sess-other' && climbed.depth === 2 && climbed.cwd === 'D:\\repo');
    const none = whoami({ ppid: 42, ancestors: [42, 41], records });
    ok('no registered ancestor is a refusal that names the pid', !none.ok && /pid 42/.test(none.why));
    const bare = whoami({ records });
    ok('‼️ nothing to go on is a refusal — and never a guess from the folder',
        !bare.ok && /Nothing is guessed from the folder/.test(bare.why) && /Nothing is guessed from the folder/.test(none.why));
    ok('a nonsense ppid is nothing to go on', !whoami({ ppid: 'x', records }).ok && !whoami({ ppid: -3, records }).ok);
    ok('registry rows without a session or with a bad pid are not matches',
        registryMatch([1, 2], [{ pid: 1, sessionId: '' }, { pid: 0, sessionId: 's' }, { pid: 2, sessionId: ' s2 ' }]).sessionId === 's2');
    ok('an empty chain matches nothing', registryMatch([], records) === undefined && registryMatch(undefined, records) === undefined);

    // ---- the envelope carries the parent pid ---------------------------------
    const both = parseBridgeRequest(JSON.stringify({ op: 'sessions.whoami', args: {}, from: { sessionId: 's1', ppid: 1234 } }));
    ok('the envelope keeps the session and the parent pid', both.from && both.from.sessionId === 's1' && both.from.ppid === 1234);
    const pidOnly = parseBridgeRequest(JSON.stringify({ op: 'x', args: {}, from: { ppid: 77 } }));
    ok('‼️ a caller with no variable still arrives with its pid', pidOnly.from && pidOnly.from.ppid === 77 && !('sessionId' in pidOnly.from));
    for (const bad of [0, -1, 1.5, 'abc', null]) {
        const r = parseBridgeRequest(JSON.stringify({ op: 'x', args: {}, from: { ppid: bad } }));
        ok(`a ppid of ${JSON.stringify(bad)} is dropped, not passed on`, !('from' in r));
    }
    ok('a ppid inside args is the op\'s business, never the envelope\'s',
        !('from' in parseBridgeRequest(JSON.stringify({ op: 'x', args: { ppid: 5 } }))));

    // ---- af.js sends it --------------------------------------------------------
    const af = fs.readFileSync(path.join(ROOT, 'src', 'service', 'af.ts'), 'utf8');
    const ident = af.slice(af.indexOf('function callerIdentity'), af.indexOf('function callerIdentity') + 700);
    ok('af.js puts its own parent pid on every request', /process\.ppid/.test(ident) && /\{ ppid \}/.test(ident));
    ok('…and af.ts still imports nothing but node built-ins (it is copied out alone)',
        (af.match(/^import\b[^;]*? from '([^']+)';/gm) || []).every(l => /from '(crypto|fs|os|path|util)'/.test(l)));

    // ---- the tree, read for real without blocking --------------------------------
    const t0 = Date.now();
    let ticked = false;
    const timer = setInterval(() => { ticked = true; }, 5);
    const table = await readProcessTableAsync();
    clearInterval(timer);
    ok('the async table has this very process with its real parent',
        table.some(p => p.pid === process.pid && p.ppid === process.ppid));
    ok('‼️ …and the event loop kept turning while it was read', ticked);
    const chain = [...ancestorsOf(process.pid, table)];
    ok('ancestry is nearest first, from this process up', chain[0] === process.pid && chain[1] === process.ppid);
    console.log(`    (table of ${table.length} processes in ${Date.now() - t0} ms)`);

    // ---- the op is wired -------------------------------------------------------------
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const op = ext.slice(ext.indexOf("op: 'sessions.whoami'"), ext.indexOf("op: 'sessions.whoami'") + 3200);
    ok('sessions.whoami is on the bridge', op.length > 100);
    const helper = ext.slice(ext.indexOf('const callerWhoami = async'), ext.indexOf('const callerWhoami = async') + 1400);
    ok('…it resolves through the one shared helper baton.pass uses too', /await callerWhoami\(/.test(op));
    ok('…which reads the CLI registry and walks the tree without blocking the host',
        /liveCliSessions\(\)/.test(helper) && /readProcessTableAsync\(\)/.test(helper) && !/readProcessTable\(\)/.test(helper));
    ok('…and refuses as data rather than guessing', /throw new BridgeRefusal\(r\.why/.test(op));

    console.log(`test_whoami.js: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
