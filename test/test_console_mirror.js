// U-75 — the Antigravity Console mirror is a RECORD, and a read of it never
// shortens it (compiled core/cliTranscripts.js, pure).
//
// `external-console-transcripts/<id>.json` is the only transcript in the farm
// written as a whole file out of memory, and it was written from the card's own
// message list. Resuming rebuilt that list from the last ~150 messages of the
// file, so the next turn wrote the window back over the record and everything
// above it was gone — the reported symptom being a transcript whose "turn 1"
// was a turn from the middle, opening on a stray paragraph with no turn heading
// above it. A second resume cut what was left again. These checks pin the merge
// that replaced the overwrite.
'use strict';
const path = require('path');
const Module = require('module');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// core/cliTranscripts pulls in core/sessions, which reaches for `vscode`; the
// functions measured here are pure, so the host is stubbed rather than run.
class Emitter {
    constructor() { this.handlers = []; }
    get event() { return (fn) => { this.handlers.push(fn); return { dispose() { } }; }; }
    fire(v) { for (const h of this.handlers) { h(v); } }
    dispose() { }
}
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return {
            EventEmitter: Emitter,
            window: { showInformationMessage: () => Promise.resolve(undefined) },
            commands: { executeCommand: () => Promise.resolve(undefined) }
        };
    }
    return origLoad.apply(this, arguments);
};

const {
    isReadBackRow, isReadNoteRow, mergeFarmConsoleTranscript
} = require(path.join(__dirname, '..', 'out', 'core', 'cliTranscripts.js'));

const T0 = Date.parse('2026-08-01T09:00:00Z');
const live = (n, role, text) => ({ id: `cm${n}-abc`, ts: T0 + n * 1000, role, text });
const readBack = (n, role, text) => ({ id: `xh${n}`, ts: T0 + n * 1000, role, text });
const note = (id, text) => ({ id, ts: T0, role: 'system', text });

const snap = (messages, o) => Object.assign({
    format: 'agent-farm-console-v1', engine: 'agy', sessionId: 'conv-1',
    agentId: 'a', agentName: 'developer', cwd: 'D:\\repo',
    model: 'gemini-3.6-pro', effort: 'high', permissionMode: 'default',
    startedAt: T0, lastTs: T0, cost: 0, tokens: 0, wTokens: 0, turns: 0,
    contextTokens: 0, messages
}, o);

// ---------- which rows came from a read rather than from the conversation ----------
{
    ok('a re-rendered transcript row is read-back', isReadBackRow({ id: 'xh0' })
        && isReadBackRow({ id: 'xh412' }) && isReadBackRow({ id: 'h7' }));
    ok('…a sentence about the read is a note, not a row',
        isReadNoteRow({ id: 'xh-start' }) && isReadNoteRow({ id: 'xh-end' })
        && isReadNoteRow({ id: 'xh-note' }) && isReadNoteRow({ id: 'xh-settling' })
        && isReadNoteRow({ id: 'h-end' }));
    ok('…and neither claims a live row', ['cm3-k1', 'sys-k1', 'err-k1', 'perm-k1']
        .every(id => !isReadBackRow({ id }) && !isReadNoteRow({ id })));
    ok('the two never overlap',
        !isReadNoteRow({ id: 'xh0' }) && !isReadBackRow({ id: 'xh-start' }));
}

// ---------- the failure that was reported: a resume must not truncate ----------
{
    // 400 messages already on record; the card came back holding the last 3 of
    // them as read-back rows, then said something new.
    const record = [];
    for (let i = 0; i < 400; i++) { record.push(live(i, i % 2 ? 'agent' : 'user', `m${i}`)); }
    const card = snap([
        note('xh-start', '↑ 397 older message(s) are in the transcript'),
        readBack(397, 'user', 'm397'), readBack(398, 'agent', 'm398'), readBack(399, 'user', 'm399'),
        note('xh-end', '— read back from the transcript · snapshot 2.1 MB · resumed here —'),
        live(400, 'user', 'the new question'), live(401, 'agent', 'the new answer')
    ], { startedAt: T0 + 9_000_000, lastTs: T0 + 9_100_000 });

    const merged = mergeFarmConsoleTranscript({ messages: record, startedAt: T0 }, card);
    ok('nothing on record is lost to a resume', merged.messages.length === 402);
    ok('…the record still opens on the conversation\'s first message',
        merged.messages[0].id === 'cm0-abc' && merged.messages[0].text === 'm0');
    ok('…the windowed re-read is not written down a second time',
        merged.messages.filter(m => m.text === 'm399').length === 1);
    ok('…the new turn is on the end',
        merged.messages[400].text === 'the new question'
        && merged.messages[401].text === 'the new answer');
    ok('…no sentence about a read became part of the conversation',
        merged.messages.every(m => !isReadNoteRow(m) && !isReadBackRow(m)));
    ok('…and the conversation still says when it began, not when it was reopened',
        merged.startedAt === T0);
    ok('…while the last touch is the newest thing in it',
        merged.lastTs === T0 + 9_100_000);
}

// ---------- a second resume cuts nothing either ----------
{
    let record = [];
    for (let i = 0; i < 10; i++) { record.push(live(i, i % 2 ? 'agent' : 'user', `m${i}`)); }
    let startedAt = T0;
    for (let round = 1; round <= 3; round++) {
        const base = record.length;
        const card = snap([
            note('xh-start', '↑ older'),
            readBack(base - 1, 'agent', `m${base - 1}`),
            note('xh-end', '— resumed here —'),
            live(base, 'user', `r${round} ask`), live(base + 1, 'agent', `r${round} answer`)
        ], { startedAt: T0 + round * 100_000, lastTs: T0 + round * 100_500 });
        const merged = mergeFarmConsoleTranscript({ messages: record, startedAt }, card);
        record = merged.messages;
        startedAt = merged.startedAt;
    }
    ok('three resumes add six rows and remove none', record.length === 16);
    ok('…and the start is still the start', startedAt === T0
        && record[0].text === 'm0' && record[15].text === 'r3 answer');
}

// ---------- the ordinary write, several times a turn, is not an append loop ----------
{
    // What the caller hands in is the record as it last wrote it, and the card's
    // list only ever grows: the same rows must not land twice.
    const first = mergeFarmConsoleTranscript(undefined,
        snap([live(1, 'user', 'hello'), live(2, 'agent', 'hi')]));
    ok('a card with no record on disk writes exactly itself', first.messages.length === 2);

    const second = mergeFarmConsoleTranscript(first,
        snap([live(1, 'user', 'hello'), live(2, 'agent', 'hi'), live(3, 'tool', 'ran grep')]));
    ok('…and the next write of the same card adds only what is new',
        second.messages.length === 3 && second.messages[2].text === 'ran grep');

    const third = mergeFarmConsoleTranscript(second,
        snap([live(1, 'user', 'hello'), live(2, 'agent', 'hi'), live(3, 'tool', 'ran grep')]));
    ok('…and a write with nothing new changes nothing', third.messages.length === 3);
}

// ---------- a card that took over a seat keeps what that seat had shown ----------
{
    // "End session" then "Resume" reuses the card, and ConsoleHost.resumeMessages
    // hands the seat's OWN messages back when they are richer than the file's
    // window. Those rows are already on the record, by their own ids.
    const record = [live(1, 'user', 'a'), live(2, 'agent', 'b')];
    const merged = mergeFarmConsoleTranscript({ messages: record, startedAt: T0 },
        snap([live(1, 'user', 'a'), live(2, 'agent', 'b'), live(3, 'user', 'c')]));
    ok('a seat resume does not double the conversation it was showing',
        merged.messages.length === 3 && merged.messages.map(m => m.text).join('') === 'abc');
}

// ---------- no record to merge into: the read-back rows ARE the history ----------
{
    // A conversation first hosted from the CLI's own step log has no mirror yet,
    // so the scrollback the card rebuilt is the only past there is.
    const card = snap([
        note('xh-start', '↑ older'),
        readBack(0, 'user', 'from the CLI log'), readBack(1, 'agent', 'answered'),
        live(2, 'user', 'now in the Console')
    ]);
    const merged = mergeFarmConsoleTranscript(undefined, card);
    ok('with nothing on record the rebuilt scrollback is kept', merged.messages.length === 3
        && merged.messages[0].text === 'from the CLI log');
    ok('…but the sentence about the read still is not', merged.messages.every(m => !isReadNoteRow(m)));
}

// ---------- the wiring: the writer merges instead of replacing ----------
{
    const fs = require('fs');
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('the mirror is written through the merge',
        /mergeFarmConsoleTranscript\(carriedTranscriptFor\(id, file\), snap\)/.test(ext));
    ok('…and what was written is what the next write adds to',
        /carriedTranscripts\.set\(id, merged\)/.test(ext));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
