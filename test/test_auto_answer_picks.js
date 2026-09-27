// K-45 — A TOUCH ON THE CARD NEVER STOPS THE CLOCK.
//
// The person's picks are kept while the clock runs; at 0:00 they are sent and
// only the questions left open get the recommended option. Pinned three ways:
// the pure merge, the timers that hold the picks, and a real ConsoleHost on a
// fake pipe so the answer on the wire and the transcript row say whose pick
// each one was.
'use strict';
const path = require('path');
const cp = require('child_process');
const { EventEmitter } = require('events');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const tick = () => new Promise(r => setTimeout(r, 10));

const OUT = path.join(__dirname, '..', 'out', 'core');
const { AutoAnswerTimers } = require(path.join(OUT, 'autoAnswerTimers.js'));
const { autoAnswerSettings } = require(path.join(OUT, 'autoAnswer.js'));
const { ownPicks, mergeOwn, ownNote, ownResponse } = require(path.join(OUT, 'autoAnswerPicks.js'));

const QS = [
    { question: 'Which?', options: [{ label: 'A' }, { label: 'B (Recommended)' }] },
    { question: 'Where?', multiSelect: true, options: [{ label: 'Here (Recommended)' }, { label: 'There' }, { label: 'Both' }] }
];
const ask = (requestId, ts) => ({ requestId, interactive: true, ts, detail: '', questions: QS });

function pure() {
    const a = ask('r1', 0);
    const own = ownPicks(a, { 'Which?': 'A', 'Where?': ['There', 'Nope'], 'Other?': 'x' });
    ok('own picks keep only this ask\'s questions and options',
        own['Which?'] === 'A' && own['Where?'].length === 1 && own['Where?'][0] === 'There' && !('Other?' in own));
    ok('a single-select pick sent as a list is read as its one label', ownPicks(a, { 'Which?': ['A'] })['Which?'] === 'A');
    ok('an empty or foreign pick is dropped', Object.keys(ownPicks(a, { 'Which?': 'Z', 'Where?': [] })).length === 0);
    ok('garbage is nothing', Object.keys(ownPicks(a, 'junk')).length === 0 && Object.keys(ownPicks(undefined, {})).length === 0);

    const rec = { 'Which?': 'B (Recommended)', 'Where?': ['Here (Recommended)'] };
    const t = mergeOwn(rec, { 'Which?': 'A' });
    ok('‼️ the person\'s pick wins, the open question gets the recommended one',
        t.answers['Which?'] === 'A' && t.answers['Where?'][0] === 'Here (Recommended)'
        && t.own.join() === 'Which?' && t.filled.join() === 'Where?');
    ok('question order is kept', Object.keys(t.answers).join('|') === 'Which?|Where?');

    const note = ownNote(t);
    ok('the transcript says whose pick each answer was',
        /seçtiklerin gönderildi, boş kalanlara önerilen seçildi/.test(note)
        && /Which\? → A \(senin seçimin\)/.test(note) && /Where\? → Here \(Recommended\) \(önerilen\)/.test(note));
    ok('with nothing picked the note is the plain timeout note',
        /önerilen seçenekler seçildi/.test(ownNote(mergeOwn(rec, {}))));

    const r = ownResponse(300, t, '  use the small one  ');
    ok('‼️ the agent is told which were the user\'s and which the timer\'s',
        /sent the options the user had picked without pressing Send/.test(r)
        && /For "Where\?" the user picked nothing/.test(r) && /within 5:00/.test(r));
    ok('…and what the user had typed but not sent', /typed this but did not send it: "use the small one"/.test(r));
    const all = ownResponse(300, mergeOwn(rec, rec));
    ok('everything picked: nothing is said to be the timer\'s', !/picked nothing/.test(all));
    const none = ownResponse(300, mergeOwn(rec, {}), 'hm');
    ok('nothing picked: the plain response, with the typed words folded in',
        /Agent Farm chose the recommended option automatically/.test(none) && /did not send it: "hm"\. If the choice/.test(none));
}

async function timers() {
    const now = 1000000000;
    const asks = new Map();
    const fired = [];
    const t = new AutoAnswerTimers({
        settings: () => autoAnswerSettings({ timeoutSeconds: 300 }), askOf: id => asks.get(id),
        expire: (id, answer, _s, typed) => fired.push({ id, answer, typed }), now: () => now
    });
    asks.set('c1', ask('r1', now));
    t.sync('c1');
    ok('picks are kept and the answer is "changed"', t.note('c1', 'r1', { 'Which?': 'A' }, '') === true);
    ok('‼️ …and the clock is still running', t.running('c1') && t.view('c1').state === 'armed');
    ok('the card\'s line names the person\'s pick', t.view('c1').picks.join('|') === 'A|Here (Recommended)');
    ok('a keystroke alone is not a change (no repaint per key)', t.note('c1', 'r1', { 'Which?': 'A' }, 'wo') === false);
    ok('a stale request id is ignored', t.note('c1', 'old', { 'Which?': 'B (Recommended)' }, '') === false
        && t.view('c1').picks[0] === 'A');

    asks.set('c2', ask('r2', now - 301000));
    t.note('c2', 'r2', { 'Where?': ['There', 'Both'] }, 'words');
    await tick();
    const f = fired.find(x => x.id === 'c2');
    ok('‼️ at expiry the picks survive and only the open question is filled',
        !!f && f.answer.answers['Which?'] === 'B (Recommended)' && f.answer.answers['Where?'].join() === 'There,Both'
        && f.answer.own.join() === 'Where?' && f.answer.filled.join() === 'Which?' && f.typed === 'words');

    t.sync('c1', true);
    ok('a settings change keeps the picks', t.view('c1').picks[0] === 'A');
    asks.set('c1', ask('r3', now));
    t.sync('c1');
    ok('the next question starts with no picks', t.view('c1').picks[0] === 'B (Recommended)');
    t.dispose();
}

async function host() {
    let lastChild = null;
    const real = { spawn: cp.spawn, exec: cp.exec, execSync: cp.execSync, execFile: cp.execFile };
    cp.spawn = () => {
        const child = new EventEmitter();
        const pipe = () => { const s = new EventEmitter(); s.setEncoding = () => { }; s.destroy = () => { }; return s; };
        child.stdout = pipe(); child.stderr = pipe(); child.written = [];
        child.stdin = { write: s => { child.written.push(String(s)); return true; }, end: () => { } };
        child.pid = 4901; child.kill = () => { };
        return (lastChild = child);
    };
    cp.exec = (_c, cb) => { if (typeof cb === 'function') { cb(null, '', ''); } };
    cp.execSync = () => '';
    cp.execFile = (_c, _a, _o, cb) => {
        const done = typeof _o === 'function' ? _o : cb;
        if (typeof done === 'function') { done(null, '', ''); }
        return new EventEmitter();
    };
    const realNow = Date.now;
    try {
        const { ConsoleHost } = require(path.join(OUT, 'consolehost.js'));
        const h = new ConsoleHost(() => 'claude');
        h.autoAnswerConfig = () => autoAnswerSettings({ timeoutSeconds: 300 });
        const id = h.start({ agentId: 'dev', agentName: 'developer', cwd: process.cwd(), engine: 'claude', permissionMode: 'default' });
        const child = lastChild;
        child.stdout.emit('data', JSON.stringify({
            type: 'control_request', request_id: 'q1',
            request: { subtype: 'can_use_tool', tool_name: 'AskUserQuestion', requires_user_interaction: true, input: { questions: QS } }
        }) + '\n');
        h.noteAskPicks(id, 'q1', { 'Which?': 'A' }, 'go small');
        ok('a pick on the card leaves the clock running', h.autoAnswerView(id).state === 'armed');
        const t0 = realNow();
        Date.now = () => t0 + 301000;
        const before = child.written.length;
        h.resyncAutoAnswers();
        await tick();
        const line = child.written.slice(before).map(x => { try { return JSON.parse(x); } catch { return null; } })
            .find(x => x && x.type === 'control_response');
        const upd = line && line.response && line.response.response && line.response.response.updatedInput;
        ok('‼️ on the wire: the person\'s pick and the recommended one for the open question',
            !!upd && upd.answers['Which?'] === 'A' && [].concat(upd.answers['Where?']).join() === 'Here (Recommended)');
        ok('…and the agent is told which was whose, typed words included',
            !!upd && /For "Where\?" the user picked nothing/.test(upd.response || '') && /"go small"/.test(upd.response || ''));
        const s = h.get(id);
        const row = s.messages[s.messages.length - 1];
        ok('the transcript row marks the person\'s pick', !s.pendingAsk && row && /\(senin seçimin\)/.test(row.answer));
        h.dispose();
    } finally {
        Date.now = realNow;
        Object.assign(cp, real);
    }
}

(async () => {
    pure();
    await timers();
    await host();
    console.log(`test_auto_answer_picks.js: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
