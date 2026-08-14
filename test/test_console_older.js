// K-23 — THE CONVERSATION ABOVE THE SCROLLBACK CEILING, READ FROM THE PANEL.
//
// A resume rebuilds the last 150 rows (600 at the outside) so a forty-megabyte
// transcript cannot stall the panel. Everything older was in the file and
// nowhere else: the Console had had the conversation and was the one surface
// that would not show it, and "Open transcript" meant leaving the panel's
// reading of it entirely.
//
// It is free to fix — the file is on this disk, no token is spent — so the only
// thing that can go wrong is drawing the same turn twice. That is what these
// checks are mostly about: every scrollback row is named by its POSITION in the
// file, so two reads of an append-only transcript agree on every row below the
// tail and an overlap is an id collision to skip rather than a duplicate.
'use strict';
const path = require('path');
const cp = require('child_process');
const { EventEmitter } = require('events');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    historyWindow, historyWindowIndices, transcriptHistory, transcriptMessages,
    HISTORY_MAX, OLDER_CHUNK
} = require(path.join(__dirname, '..', 'out', 'core', 'consolehistory.js'));
const { transcriptPos } = require(path.join(__dirname, '..', 'out', 'core', 'consoleproto.js'));

// ---------------------------------------------------------------------------
// positions: the window, as places in the file
// ---------------------------------------------------------------------------
{
    const turnStart = m => m.role === 'user';
    const rows = [];
    for (let i = 0; i < 900; i++) { rows.push({ role: i % 90 === 0 ? 'user' : 'tool', i }); }

    const at = historyWindowIndices(rows, turnStart);
    ok('the window is the same rows, whichever way it is asked for',
        JSON.stringify(at.map(i => rows[i])) === JSON.stringify(historyWindow(rows, turnStart)));
    ok('…and every one of them says where in the file it came from',
        at.every((v, k) => k === 0 || v > at[k - 1]));
    ok('…the last row of the window is the last row of the file',
        at[at.length - 1] === rows.length - 1);
    ok('…and the budget is the floor it always was', at.length >= HISTORY_MAX);

    // a short conversation is untouched, positions and all
    const few = rows.slice(0, 40);
    ok('a conversation under the budget is every position it has',
        historyWindowIndices(few, turnStart).join() === few.map((_, i) => i).join());
}

// ---------------------------------------------------------------------------
// the head row: the handle, and when it is NOT offered
// ---------------------------------------------------------------------------
{
    const line = (o) => JSON.stringify(o);
    const user = (t) => line({ type: 'user', message: { content: t }, timestamp: '2026-08-14T09:00:00Z' });
    const agent = (t) => line({
        type: 'assistant', message: { content: [{ type: 'text', text: t }] },
        timestamp: '2026-08-14T09:00:01Z'
    });
    const many = [];
    for (let i = 0; i < 300; i++) { many.push(user('soru ' + i), agent('cevap ' + i)); }

    const out = transcriptHistory(many);
    const head = out[0];
    ok('the head row still says how much is above it', /older message\(s\)/.test(head.text));
    ok('‼️ K-23 — …and now carries the handle to read it', !!head.more && head.more.older > 0);
    ok('…which knows how big a bite it takes', head.more.chunk === OLDER_CHUNK);
    ok('the count and the sentence are the same number',
        head.text.indexOf(String(head.more.older)) > 0);

    const all = transcriptMessages(many);
    ok('the rows are named by their absolute place in the file',
        all.rows.every((m, i) => transcriptPos(m.id) === i));
    ok('…and the window is drawn from the same list',
        out.slice(1, -1).every(m => transcriptPos(m.id) >= 0));
    ok('nothing is above a whole short session, so nothing is offered', (() => {
        const short = transcriptHistory([user('bir'), agent('iki')]);
        return !short[0].more && /the start of this session/.test(short[0].text);
    })());

    // ‼️ THE ONE CASE IT MUST REFUSE. Only the tail of a huge file is parsed, so
    // a row's position is its place in THAT tail — and the next read, of a file
    // that has grown, numbers the same message differently. Offering a load
    // there is offering a duplicated conversation.
    const huge = [];
    for (let i = 0; i < 5000; i++) { huge.push(user('q' + i)); }
    const cut = transcriptHistory(huge);
    ok('‼️ K-23 — a partial read offers no handle, because its positions would shift',
        !cut[0].more && /earlier messages are in the transcript/.test(cut[0].text));
    ok('…and it says so in the sentence it always said', transcriptMessages(huge).partial === true);
}

// ---------------------------------------------------------------------------
// decoding a position out of a row id — the two readers count differently
// ---------------------------------------------------------------------------
{
    ok('the parsed-CLI reader counts from zero', transcriptPos('xh0') === 0 && transcriptPos('xh417') === 417);
    ok('the native reader has always counted from one',
        transcriptPos('h1') === 0 && transcriptPos('h418') === 417);
    ok('and a row that is not scrollback says so, rather than guessing',
        transcriptPos('xh-start') === -1 && transcriptPos('h0') === -1
        && transcriptPos('m3') === -1 && transcriptPos('') === -1
        && transcriptPos(undefined) === -1);
}

// ---------------------------------------------------------------------------
// the card: a chunk goes in FRONT, and never twice
// ---------------------------------------------------------------------------
let spawned = 0;
function fakeChild() {
    spawned++;
    const child = new EventEmitter();
    const pipe = () => {
        const s = new EventEmitter();
        s.setEncoding = () => { };
        s.destroy = () => { };
        return s;
    };
    child.stdout = pipe();
    child.stderr = pipe();
    child.stdin = { write: () => true, end: () => { } };
    child.pid = 7000 + spawned;
    child.kill = () => { };
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

const { ConsoleHost } = require(path.join(__dirname, '..', 'out', 'core', 'consolehost.js'));

const init = (o) => Object.assign({
    agentId: 'dev', agentName: 'developer', cwd: process.cwd(),
    engine: 'codex', permissionMode: 'default'
}, o);
/** rows [from, to) as the parsed-CLI reader names them */
const chunk = (from, to) => {
    const out = [];
    for (let i = from; i < to; i++) {
        out.push({ id: `xh${i}`, ts: 1000 + i, role: i % 2 ? 'agent' : 'user', text: 'satir ' + i });
    }
    return out;
};
const headAt = (older) => ({
    id: 'xh-start', ts: 1, role: 'system',
    text: older ? `↑ ${older} older message(s) are in the transcript.` : '↑ the start of this session',
    ...(older ? { more: { older, stamp: '1.2 MB · 14 Aug 09:00', chunk: OLDER_CHUNK } } : {})
});

{
    const host = new ConsoleHost(() => 'claude');
    const id = host.start(init({ resume: 'K23-a', history: [headAt(600), ...chunk(600, 900)] }));
    const before = host.get(id).messages.length;
    ok('the card opens on the tail of a long session', before === 301);

    const added = host.prependHistory(id, headAt(400), chunk(400, 600));
    const now = host.get(id).messages;
    ok('‼️ K-23 — the older chunk arrives in front of what was there', added === 200
        && now.length === 501 && now[0].id === 'xh-start' && now[1].id === 'xh400');
    ok('…and the row the reader was on is still exactly where it was in the order',
        now[now.length - 1].id === 'xh899');
    ok('…with one head row, saying what is left', now.filter(m => m.id === 'xh-start').length === 1
        && now[0].more.older === 400);

    // ‼️ THE FAILURE THIS SCHEME EXISTS TO PREVENT. Ask twice — a double click, a
    // bridge call racing the button — and the second one must add nothing.
    const again = host.prependHistory(id, headAt(400), chunk(400, 600));
    ok('‼️ K-23 — the same chunk twice adds nothing and changes nothing',
        again === 0 && host.get(id).messages.length === 501);

    // an overlapping read (the file grew, the reader pressed again) keeps only
    // what is genuinely new
    const overlap = host.prependHistory(id, headAt(300), chunk(300, 450));
    ok('an overlapping chunk contributes only the part that is new', overlap === 100
        && host.get(id).messages.length === 601
        && host.get(id).messages[1].id === 'xh300');
    ok('…and no position is drawn twice', (() => {
        const ids = host.get(id).messages.map(m => m.id);
        return new Set(ids).size === ids.length;
    })());

    ok('walking all the way up ends with no handle at all', (() => {
        host.prependHistory(id, headAt(0), chunk(0, 300));
        const m = host.get(id).messages;
        return m[0].id === 'xh-start' && !m[0].more && m[1].id === 'xh0';
    })());
    ok('a card that does not exist is not a crash', host.prependHistory('nope', headAt(1), chunk(0, 1)) === 0);
}

// ---------------------------------------------------------------------------
// …and the same read is on the bridge, because that is the rule for every new
// thing a user can press (_REF/agentfarm-dev.md): the op calls the same
// function the panel calls, in the same commit.
// ---------------------------------------------------------------------------
{
    const fs = require('fs');
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    const media = fs.readFileSync(path.join(__dirname, '..', 'media', 'console.js'), 'utf8');
    const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'consolePanel.ts'), 'utf8');

    ok('the panel button asks for it by name', /type: 'loadOlder'/.test(media));
    ok('…the panel answers that message', /case 'loadOlder'/.test(panel));
    ok('‼️ …and an agent can do the same thing over the bridge',
        ext.includes("op: 'console.older'"));
    ok('…through the SAME reader the panel uses, not a second one',
        /consoleOlderHistory\(seat!\.sessionId!, have\)/.test(ext)
        && /olderHistory: consoleOlderHistory/.test(ext));
    ok('…and its description says what it answers with',
        /Answers \{ added, older \}/.test(ext));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
