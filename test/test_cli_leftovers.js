// S-59 — A PROGRAM-OWNED `claude` THAT NOBODY IS READING IS SEEN, AND ENDED ONLY
// WHERE IT IS OURS.
//
// A window reload kills the extension host and not the `claude -p` under it. The
// survivor holds its session in the CLI's registry, keeps working on a dead pipe,
// keeps spending — and until now showed on NO surface: the new host's seat map is
// empty, the task board's sweep has already re-queued its run, and the registry
// was read only when a resume happened to name that one id. X-266 made the
// resume=true revive reclaim its Console survivors; the headless survivor and the
// ordinary reload's survivors were left where they were.
//
// Pinned: (1) the one reading every door shares — `leftoversOf`; (2) that
// farm.health prints it; (3) that the two unattended doors (the S-19 task gate,
// `console.start resume=`) end a leftover of OURS and refuse every other holder.
const path = require('path');
const fs = require('fs');

const { leftoversOf, isSpareCliSession } = require(path.resolve(__dirname, '../out/core/cliSessions.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------- (1) the reading ----------
{
    const rec = (o) => Object.assign({ pid: 1, sessionId: 's', entrypoint: 'sdk-cli', kind: 'interactive' }, o);
    const records = [
        rec({ pid: 10, sessionId: 'hosted', startedAt: 5 }),
        rec({ pid: 11, sessionId: 'elsewhere', startedAt: 4 }),
        rec({ pid: 12, sessionId: 'console-orphan', startedAt: 3, cwd: '/a', name: 'dev-1a', status: 'idle' }),
        rec({ pid: 13, sessionId: 'task-orphan', startedAt: 2 }),
        rec({ pid: 14, sessionId: 'foreign-sdk', startedAt: 1 }),
        rec({ pid: 15, sessionId: 'terminal', entrypoint: 'cli' }),
        rec({ pid: 16, sessionId: 'spare', kind: 'bg', spare: true }),
        rec({ pid: 17, sessionId: 'daemon-worker', kind: 'bg' })
    ];
    const claims = {
        hostedHere: sid => sid === 'hosted',
        elsewhere: sid => sid === 'elsewhere',
        ours: sid => sid === 'console-orphan' ? 'console' : sid === 'task-orphan' ? 'task' : undefined
    };
    const got = leftoversOf(records, claims);
    const ids = got.map(l => l.sessionId);
    ok('‼️ a session this window hosts is not a leftover', !ids.includes('hosted'));
    ok('‼️ a session another window is reading is not a leftover', !ids.includes('elsewhere'));
    ok('a terminal is a person\'s, never a leftover', !ids.includes('terminal'));
    ok('the daemon\'s spare is not a leftover', !ids.includes('spare') && isSpareCliSession(records[6]));
    ok('…nor its background worker', !ids.includes('daemon-worker'));
    ok('‼️ a Console survivor IS one, marked ours:console',
        got.find(l => l.sessionId === 'console-orphan')?.ours === 'console');
    ok('‼️ a headless run\'s survivor IS one, marked ours:task — the reading consoleIds alone could not see',
        got.find(l => l.sessionId === 'task-orphan')?.ours === 'task');
    ok('‼️ somebody else\'s SDK session is REPORTED with no `ours` — seen, never touched',
        ids.includes('foreign-sdk') && got.find(l => l.sessionId === 'foreign-sdk').ours === undefined);
    ok('oldest first, so the longest-running survivor is read first',
        ids.join() === 'foreign-sdk,task-orphan,console-orphan');
    const c = got.find(l => l.sessionId === 'console-orphan');
    ok('the row carries what the registry knows: pid, cwd, name, status, startedAt',
        c.pid === 12 && c.cwd === '/a' && c.name === 'dev-1a' && c.status === 'idle' && c.startedAt === 3);
    ok('nothing on the registry is nothing to report', leftoversOf([], claims).length === 0);
}

// ---------- (2)+(3) the doors, pinned in the source ----------
{
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');

    ok('‼️ farm.health prints the leftovers beside the twins',
        /twins: twinsOf\(liveCliSessions\(\)\),[\s\S]{0,600}leftovers: leftovers\(\)/.test(src));
    ok('…and its describe names the field and its rule',
        /`sessions\.leftovers` — S-59/.test(src) && /only those are '\s*\+ 'ended by a resume door/.test(src));

    ok('‼️ one reading for every door: leftoverOwner is leftovers() asked about one id, ours only',
        /const leftoverOwner = \(sessionId: string\): \{ pid: number \} \| undefined => \{[\s\S]{0,300}leftovers\(\)\.find\(x => x\.sessionId === sessionId && x\.ours\)/.test(src));
    ok('‼️ ours includes a task run by the id the board wrote down',
        /const oursOf = [\s\S]{0,400}t\.runSessionId === sessionId \|\| t\.resumeSessionId === sessionId/.test(src));

    // the S-19 task gate
    ok('‼️ the task gate ends a leftover of ours before it reads the busy reason',
        /sessionBusy: \(sessionId: string\): string \| undefined =>\s*reclaimLeftover\(sessionId\) \?\? sessionBusyReason\(sessionId\)/.test(src));
    ok('…fired once per pid, asynchronously, and said on the row',
        /const endingLeftovers = new Set<number>\(\);/.test(src)
        && /if \(!endingLeftovers\.has\(l\.pid\)\) \{[\s\S]{0,200}void endLeftover\(sessionId, l\.pid\)\.finally\(\(\) => endingLeftovers\.delete\(l\.pid\)\);/.test(src)
        && /it is being ended; asked again on the next beat/.test(src));
    ok('a read path never kills: the picker still draws with sessionBusyReason alone',
        /busy: sessionBusyReason\(s\.sessionId as string\) \?\? ''/.test(src));

    // the bridge door
    const at = src.indexOf("op: 'console.start',");
    // the handler up to the next op — a fixed length broke when its describe grew
    const body = src.slice(at, src.indexOf("op: '", at + 20));
    ok('‼️ console.start settles a held Claude id BEFORE it spawns: a leftover of ours is reclaimed and waited out',
        /if \(resume && engine === 'claude'\) \{\s*const left = leftoverOwner\(resume\);\s*if \(left\) \{\s*const got = await consoleHost\.reclaim\(resume\);\s*need\(got\.free,/.test(body));
    ok('…and any other holder is refused by name rather than doubled',
        /const busy = sessionBusyReason\(resume\);\s*need\(!busy, `\$\{resume\} is open elsewhere — \$\{busy\}; a second process on one transcript is refused`\);/.test(body));
    ok('the handler became async for it', /handler: async \(args\) => \{\s*const agent = findAgent\(argStr\(args, 'agent'\)\);\s*const d = launchDefaults\(\);\s*const resume = optStr\(args, 'resume'\)/.test(body));
}

console.log(`test_cli_leftovers: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
