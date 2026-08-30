// U-86 — THE LIVE HOOKS CARD, AND THE PORT IT CLAIMS TO KNOW ABOUT.
//
// ‼️ WHAT THIS SUITE IS ACTUALLY WATCHING. Two different kinds of lie:
//
//   1. A card that says the farm is being watched when no settings file carries
//      the hooks. Without them the extension is BLIND, and "nothing shows up"
//      has never once been a bug — it is this.
//   2. A repair button that stops the wrong process. The port holder on the
//      machine this was written on is THIS VERY EXTENSION HOST, so the naive
//      version of "Clear the port" kills the window it is drawn in.
//
// The netstat block below is not invented. It is what `netstat -ano` really
// printed for 127.0.0.1:8377 on 2026-08-30, TIME_WAIT rows and all — every one
// of those rows carries pid 0 and mentions the port, which is exactly the trap.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));

const H = require(path.join(ROOT, 'out', 'core', 'hooksCockpit.js'));

// ---------- WHO HAS THE PORT: measured output, not an imagined one ----------
{
    const REAL = [
        '  TCP    127.0.0.1:5496         127.0.0.1:8377         TIME_WAIT       0',
        '  TCP    127.0.0.1:5497         127.0.0.1:8377         TIME_WAIT       0',
        '  TCP    127.0.0.1:5498         127.0.0.1:8377         TIME_WAIT       0',
        '  TCP    127.0.0.1:8377         0.0.0.0:0              LISTENING       387884',
        '  TCP    127.0.0.1:8377         127.0.0.1:5496         TIME_WAIT       0'
    ].join('\r\n');

    eq('the LISTENING row is the owner, not the ten TIME_WAIT rows around it',
        H.listeningPidWindows(REAL, 8377), 387884);

    // ‼️ THE TRAP, NAMED. Every TIME_WAIT row mentions the port and carries pid
    // 0; a parser that matched on the port would offer to stop process 0.
    const onlyWaits = REAL.split('\r\n').filter(l => /TIME_WAIT/.test(l)).join('\r\n');
    eq('a port with only closing sockets has no owner',
        H.listeningPidWindows(onlyWaits, 8377), undefined);

    eq('nothing listening means nothing found', H.listeningPidWindows('', 8377), undefined);

    // A longer port number must not match on a suffix.
    eq('port 8377 is not port 83770',
        H.listeningPidWindows('  TCP    0.0.0.0:83770          0.0.0.0:0              LISTENING       9', 8377),
        undefined);
    eq('a wildcard bind is still this port',
        H.listeningPidWindows('  TCP    0.0.0.0:8377           0.0.0.0:0              LISTENING       4242', 8377),
        4242);
    eq('…and so is an IPv6 one',
        H.listeningPidWindows('  TCP    [::]:8377              [::]:0                 LISTENING       77', 8377),
        77);

    // posix
    eq('lsof: the first data row is the owner',
        H.listeningPidPosix('COMMAND   PID  USER   FD   TYPE\nnode    12345 murat   23u  IPv4'), 12345);
    eq('lsof: a header on its own is not an owner',
        H.listeningPidPosix('COMMAND   PID  USER   FD   TYPE'), undefined);
}

// ---------- ‼️ AND WHOSE PROCESS IT IS DECIDES WHAT MAY BE OFFERED ----------
{
    const c = o => H.classifyHolder(Object.assign({ ownPid: 100, port: 8377 }, o));

    // MEASURED: on this machine the holder of 8377 is the extension host itself.
    const ours = c({ pid: 100, name: 'Code.exe' });
    eq('our own process is not a conflict', ours.kind, 'ours');
    ok('‼️ …and stopping it is NEVER offered — that is this window', ours.canStop === false);

    const parent = c({ pid: 87, name: 'Code.exe', ownAncestors: [87, 4] });
    eq('a process above us is still us', parent.kind, 'ours');
    ok('…and still not stoppable', parent.canStop === false);

    // ‼️ TWO WINDOWS, ONE PORT is a setup, not a fault.
    const other = c({ pid: 555, name: 'Code.exe' });
    eq('another VS Code window is named as such', other.kind, 'other-window');
    ok('‼️ …and killing another editor is not offered', other.canStop === false);
    ok('…and the card says where the hooks are actually going',
        /reporting to that one/.test(other.detail));
    ok('…and offers the setting that fixes it without closing anything',
        /livePort/.test(other.detail));

    const stray = c({ pid: 999, name: 'node.exe' });
    eq('anything else is a stranger', stray.kind, 'stranger');
    ok('…which is the one case a stop is honest in', stray.canStop === true);
    ok('…and it is named before it is stopped',
        /node\.exe/.test(stray.detail) && /999/.test(stray.detail));

    eq('nothing listening is its own answer', c({}).kind, 'none');

    // ‼️ A SCAN THAT COULD NOT RUN SAYS SO. Reporting "free" here would send
    // somebody to restart a listener that is about to fail the same way.
    const blind = c({ scanFailed: true });
    eq('a scan that failed is not a free port', blind.kind, 'unknown');
    ok('…and nothing is offered on a guess', blind.canStop === false);
}

// ---------- THE BADGE: what a person is actually being told ----------
{
    const files = (userOn, agentsOn) => ([
        { scope: 'user', file: 'C:/u/.claude/settings.json', installed: userOn },
        { scope: 'agent', agent: 'developer', file: 'D:/a/developer/.claude/settings.local.json', installed: agentsOn },
        { scope: 'agent', agent: 'asistan', file: 'D:/a/asistan/.claude/settings.local.json', installed: agentsOn }
    ]);
    const st = o => H.hooksStatus(Object.assign(
        { listener: 'listening', port: 8377, targets: files(true, true) }, o));

    eq('installed everywhere and listening is the healthy state', st({}).state, 'ok');

    // ‼️ THE FAILURE THIS CARD EXISTS FOR.
    const blind = st({ targets: files(false, false) });
    eq('no file carries the hooks: the farm is blind', blind.state, 'blind');
    ok('…and the card says what that costs', /timeline/.test(blind.detail));
    ok('…and names the one install worth doing', /user scope/i.test(blind.next || ''));

    // ‼️ AGENT-ONLY IS THE SILENT ONE: some sessions report, the rest vanish.
    const partial = st({ targets: files(false, true) });
    eq('agent-only is a warning, not a pass', partial.state, 'partial');
    ok('…and says which sessions are being dropped',
        /outside those agents/.test(partial.detail));

    eq('a switched-off listener is its own state', st({ listener: 'disabled' }).state, 'listener-off');
    eq('a listener that failed is an error', st({ listener: 'error' }).state, 'listener-error');

    // ‼️ PRECEDENCE. A blocked port outranks a missing file: fixing the files
    // under a port that is taken changes nothing anybody can see.
    const taken = st({ listener: 'port-in-use', targets: files(false, false) });
    eq('a blocked port outranks every hook file complaint', taken.state, 'port-in-use');
    // …and it repeats what the holder said, rather than inventing a second story.
    const withHolder = st({
        listener: 'port-in-use', targets: files(true, true),
        holder: { kind: 'stranger', pid: 9, name: 'node.exe', detail: 'node.exe (pid 9) holds it.', canStop: true }
    });
    ok('the card repeats the holder sentence rather than writing a second one',
        withHolder.detail === 'node.exe (pid 9) holds it.');
    ok('…and every state carries a tone the page can paint',
        ['blind', 'partial', 'port-in-use', 'listener-off', 'listener-error', 'ok']
            .every(s => ['ok', 'bad', 'warn', 'off'].indexOf(H.HOOKS_TONE[s]) >= 0));

    // The counts the card prints are counted here, not on the page.
    eq('the card is told how many of how many', [st({}).installed, st({}).total], [3, 3]);
    ok('…and whether the one that matters on its own is in', st({}).userInstalled === true);
}

// ---------- ‼️ IT IS PURE, SO IT CAN BE TESTED AT ALL ----------
{
    const src = fs.readFileSync(path.join(ROOT, 'src', 'core', 'hooksCockpit.ts'), 'utf8');
    ok('no vscode in the core', !/from 'vscode'/.test(src));
    ok('no child_process in the core — it is handed the output, never the shell',
        !/^import .*child_process/m.test(src) && !/require\('child_process'\)/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
