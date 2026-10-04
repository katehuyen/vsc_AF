// U-4: the status bar counted AGENTS and called them "active".
//
// ‼️ TWO CONSOLE TABS ON ONE AGENT ARE TWO SESSIONS. Two turns, two costs, two
// things that can be waiting for you — and `activeAgentIds()` folds them into
// one, so a fleet running three sessions on one agent read "1 active" and the
// indicator was blind to two thirds of what was happening. This proves the
// index can answer the SESSION question, that the bar asks that one, and that
// the places where the question really is about agents were left alone.
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------- the index: sessions and agents are two different counts ----------
{
    const origLoad = Module._load;
    Module._load = function (request) {
        if (request === 'vscode') {
            return {
                EventEmitter: class { constructor() { this.event = () => ({ dispose() { } }); } fire() { } dispose() { } },
                Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) },
                ViewColumn: {}, ConfigurationTarget: {}, env: {}
            };
        }
        return origLoad.apply(this, arguments);
    };
    const { SessionIndex } = require(path.join(__dirname, '..', 'out', 'core', 'sessions.js'));
    Module._load = origLoad;

    const index = new SessionIndex('/nowhere', () => [], {}, () => [], () => false, () => 60000);
    const now = Date.now();
    // three live sessions: two on `dev`, one on `ops` — plus one that went
    // quiet an hour ago, and one whose folder matches no registered agent.
    const rows = [
        { file: 'a', sessionId: 's1', agentId: 'dev', mtime: now - 1000 },
        { file: 'b', sessionId: 's2', agentId: 'dev', mtime: now - 2000 },
        { file: 'c', sessionId: 's3', agentId: 'ops', mtime: now - 3000 },
        { file: 'd', sessionId: 's4', agentId: 'dev', mtime: now - 3600_000 },
        { file: 'e', sessionId: 's5', agentId: undefined, mtime: now - 1500 }
    ];
    // the map is private; seed it the way scanAll would
    const map = new Map(rows.map(r => [r.file, r]));
    Object.defineProperty(index, 'sessions', { value: map, writable: true });

    ok('the agent count is two — that much was always true',
        index.activeAgentIds(now).size === 2);
    ok('‼️ …but FOUR sessions are running, and that is what "active" means',
        index.activeSessions(now).length === 4);
    ok('…the quiet one is not among them',
        !index.activeSessions(now).some(s => s.sessionId === 's4'));
    ok('‼️ …and a session with no registered agent counts: it burns the same quota',
        index.activeSessions(now).some(s => s.sessionId === 's5'));

    // X-482 — the threshold is a whole-configuration read: measured at ~1300
    // reads per bar update (one per session), 160 ms on every live event.
    let reads = 0;
    const counted = new SessionIndex('/nowhere', () => [], {}, () => [], () => false, () => { reads++; return 60000; });
    const many = Array.from({ length: 500 }, (_, i) => ({
        file: 'f' + i, sessionId: 'x' + i, agentId: i % 2 ? 'dev' : undefined, mtime: now - (i % 3 ? 1000 : 3600_000)
    }));
    Object.defineProperty(counted, 'sessions', { value: new Map(many.map(r => [r.file, r])), writable: true });
    reads = 0;
    const act = counted.activeSessions(now).length;
    ok('‼️ activeSessions reads the threshold ONCE, not once per session', reads === 1 && act === 333);
    reads = 0;
    const agentsOn = counted.activeAgentIds(now);
    ok('…activeAgentIds too', reads === 1 && agentsOn.size === 1 && agentsOn.has('dev'));
    reads = 0;
    ok('…and isAgentActive', counted.isAgentActive('dev', now) === true && reads === 1);
    reads = 0;
    ok('a single question still reads the setting itself', counted.isSessionActive(many[1], now) === true && reads === 1);
    reads = 0;
    ok('a limit handed in is the one used, unread',
        counted.isSessionActive({ mtime: now - 5000 }, now, 4000) === false
        && counted.isSessionActive({ mtime: now - 5000 }, now, 6000) === true && reads === 0);
}

// ---------- the bar asks the session question ----------
{
    const bar = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'statusBar.ts'), 'utf8');
    ok('the live half counts turns, not the agents running them',
        /this\.live\?\.activeTurns\(\) \?\? 0/.test(bar)
        && !/this\.live\?\.workingAgentIds\(\)/.test(bar));
    ok('…and the index half counts sessions',
        /this\.index\.activeSessions\(\)\.length/.test(bar));
    ok('‼️ the tooltip says which of the two numbers it is',
        /Active sessions: \$\{active\}/.test(bar) && /across \$\{activeAgents\} agent/.test(bar));
}

// ---------- and where the question IS about agents, nothing changed ----------
// The daily digest's `activeAgents` and the chat /status line both SAY agents.
// Changing those would have been the same bug in the other direction.
{
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('the daily digest still counts agents, because that is what it says',
        /activeAgents: index\.activeAgentIds\(now\)\.size/.test(ext));
    // U-116 moved the RENDERING to telegramCommands.ts; the rule is unchanged
    // and now has two halves — what extension.ts feeds in, and what the pure
    // renderer calls it. Both are pinned, because either one drifting alone is
    // the same bug: a session count under the word "agents".
    ok('…and so does the chat status line, on the side that gathers it',
        /agents: agents\.length, activeAgents: index\.activeAgentIds\(\)\.size/.test(ext));
    const cmds = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'telegramCommands.ts'), 'utf8');
    ok('…and on the side that words it',
        /\$\{i\.agents\} agents · \$\{i\.activeAgents\} active/.test(cmds));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
