// X-481 — THE CONSOLE MIRROR PICKS UP BY IDENTITY, AND NEVER REPORTS THE PAST.
//
// Measured 2026-10-02 on two revives of one session (19:24 and 19:59 UTC): the
// revive swapped its scrollback placeholder for the transcript read back, the
// mirror's COUNT cursor stood in front of the inserted rows, and 23 / 25 old
// replies went to the Live Timeline as new events at ~300 ms each — the
// extension host was unresponsive for their whole run (VS Code renderer.log)
// and the revive nudge's 30 s fallback fired 7-9 s late behind it.
//
// Pinned here, against the real ConsoleHost (no process is reached):
// (1) the read-back verdict is K-23's id decoding, markers and live rows are not the past;
// (2) a revive's rebuildHistory adds nothing fresh — the count cursor would have;
// (3) a row said after the rebuild is the one fresh row;
// (4) "load earlier" (prependHistory) adds nothing fresh either;
// (5) the mirror in extension.ts reads its rows through the cursor.
const Module = require('module');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const { EventEmitter } = require('events');

class Emitter {
    constructor() { this.handlers = []; }
    get event() { return (fn) => { this.handlers.push(fn); return { dispose() { } }; }; }
    fire(v) { for (const h of this.handlers) h(v); }
    dispose() { }
}
const fakeVscode = {
    EventEmitter: Emitter,
    window: {
        showInformationMessage: () => Promise.resolve(undefined),
        showWarningMessage: () => Promise.resolve(undefined)
    },
    commands: { executeCommand: () => Promise.resolve(undefined) }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return fakeVscode; }
    return origLoad.apply(this, arguments);
};
function fakeChild() {
    const child = new EventEmitter();
    const pipe = () => { const s = new EventEmitter(); s.setEncoding = () => { }; s.destroy = () => { }; return s; };
    child.stdout = pipe(); child.stderr = pipe();
    child.stdin = { write: () => true, end: () => { } };
    child.pid = 4321; child.kill = () => { };
    return child;
}
cp.spawn = () => fakeChild();
cp.exec = (_c, cb) => { if (typeof cb === 'function') { cb(null, '', ''); } };
cp.execSync = () => '';
cp.execFile = (_c, _a, _o, cb) => {
    const done = typeof _o === 'function' ? _o : cb;
    if (typeof done === 'function') { done(null, '', ''); }
    return new EventEmitter();
};

const out = (f) => path.resolve(__dirname, '../out/core', f);
const { ConsoleHost } = require(out('consolehost.js'));
const { cursorAt, freshRows, readBack } = require(out('mirrorCursor.js'));
const { REVIVE_PLACEHOLDER_ID } = require(out('consoleRevive.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------- (1) the read-back verdict ----------
ok('a native scrollback row (h<n>, from one) is the past', readBack('h1') && readBack('h25'));
ok('a parsed-CLI scrollback row (xh<n>, from zero) is the past', readBack('xh0') && readBack('xh7'));
ok('the markers are not rows of the past: h0 · h-end · xh-start · the revive placeholder',
    !readBack('h0') && !readBack('h-end') && !readBack('xh-start') && !readBack(REVIVE_PLACEHOLDER_ID));
ok('a live row and the revive note are not the past', !readBack('cm3-abc') && !readBack('xr-revived'));

// What a revive reads back: head marker, the conversation, tail marker.
const scrollback = (n, from = 1) => [
    { id: 'h0', ts: 1, role: 'system', text: 'earlier messages are in the transcript' },
    ...Array.from({ length: n }, (_, i) => ({ id: `h${from + i}`, ts: 2 + i, role: i % 2 ? 'agent' : 'tool', text: `old ${from + i}` })),
    { id: 'h-end', ts: 99, role: 'system', text: 'read back from the transcript' }
];

// ---------- (2)-(4) against the real host ----------
{
    const host = new ConsoleHost(() => 'codex');
    const id = host.start({
        agentId: 'dev', agentName: 'developer', cwd: process.cwd(),
        engine: 'codex', permissionMode: 'default', resume: '52af8a2d-revived',
        history: [
            { id: REVIVE_PLACEHOLDER_ID, ts: 1, role: 'system', text: 'not in the index yet' },
            { id: 'xr-revived', ts: 2, role: 'system', text: 'Agent Farm restarted and took this session up' }
        ]
    });
    const before = host.get(id).messages;
    ok('the revived seat holds the placeholder and the revive note', before.length === 2);
    const cursor = cursorAt(before);
    ok('the cursor is anchored on the revive note', cursor.anchor === 'xr-revived' && cursor.count === 2);

    ok('the scrollback is swapped in where the placeholder stood', host.rebuildHistory(id, scrollback(25)));
    const rebuilt = host.get(id).messages;
    ok('‼️ the defect, as it was: a COUNT cursor reads the inserted transcript as new',
        rebuilt.slice(cursor.count).filter(m => m.role === 'agent').length > 10);
    ok('‼️ the identity cursor reports nothing — a revive replays no reply (X-481)',
        freshRows(rebuilt, cursor).length === 0);

    const after = cursorAt(rebuilt);
    host.send(id, 'carry on');
    const said = freshRows(host.get(id).messages, after);
    ok('‼️ the row said after the rebuild is the one fresh row',
        said.length === 1 && said[0].role === 'user' && said[0].text === 'carry on');

    const settled = cursorAt(host.get(id).messages);
    const added = host.prependHistory(id, { id: 'h0', ts: 0, role: 'system', text: 'the start of this session' },
        Array.from({ length: 12 }, (_, i) => ({ id: `h${100 + i}`, ts: 0, role: 'agent', text: `older ${i}` })));
    ok('"load earlier" put older rows in front', added === 12);
    ok('‼️ … and the mirror reports none of them', freshRows(host.get(id).messages, settled).length === 0);
}

// ---------- the fallback: an anchor that is gone ----------
{
    const list = [{ id: 'cm1' }, { id: 'cm2' }, { id: 'h4' }, { id: 'cm3' }];
    ok('an anchor no longer on the card falls back to the count',
        freshRows(list, { count: 1, anchor: 'gone' }).map(m => m.id).join() === 'cm2,cm3');
    ok('… and even then a read-back row is never reported', !freshRows(list, { count: 0 }).some(m => m.id === 'h4'));
    ok('a fresh lane (no anchor, count 0) reports every live row', freshRows(list, { count: 0 }).length === 3);
}

// ---------- (5) the mirror reads through the cursor ----------
{
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    const at = src.indexOf('const mirrorConsoleToLive = (id: string): void => {');
    const body = src.slice(at, src.indexOf('const sweptAfterEnd = new Set<string>();', at));
    ok('the mirror is where it was', at > 0 && body.length > 1000);
    ok('‼️ its rows come from freshRows(s.messages, seen.cursor)', /for \(const m of freshRows\(s\.messages, seen\.cursor\)\)/.test(body));
    ok('‼️ a resumed lane opens at cursorAt(s.messages)', /cursor: s\.resumed \? cursorAt\(s\.messages\) : \{ count: 0 \}/.test(body));
    ok('‼️ every pass leaves the cursor at cursorAt(s.messages)', /seen\.cursor = cursorAt\(s\.messages\);/.test(body));
    ok('no count slice of the messages is left in the mirror', !/s\.messages\.slice\(/.test(body));
}

Module._load = origLoad;
console.log(`test_live_mirror_cursor: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
