// K-43 — THE CLOCK, AND THE HOST THAT OWNS IT.
//
// test_auto_answer.js pins the decision; this pins what is done with it: one
// timer per card, re-reading the ask at expiry so a timer can only ever answer
// the question it was armed for, a Stop that belongs to ONE question, and —
// through a real ConsoleHost on a fake pipe — that the answer goes out on the
// wire the user's own click uses, tells the agent it was not the user, and
// leaves a transcript row naming the picks.
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

const q = (requestId, ts, extra) => Object.assign({
    requestId, interactive: true, ts, detail: '',
    questions: [{ question: 'Which?', options: [{ label: 'A' }, { label: 'B (Recommended)' }] }]
}, extra);

async function timers() {
    const now = 1000000000;
    const asks = new Map();
    const fired = [];
    let settings = autoAnswerSettings({ timeoutSeconds: 300 });
    const t = new AutoAnswerTimers({
        settings: () => settings, askOf: id => asks.get(id),
        expire: (id, answers) => fired.push({ id, answers }), now: () => now
    });

    asks.set('c1', q('r1', now));
    t.sync('c1');
    const v = t.view('c1');
    ok('a fresh question arms a clock', t.running('c1'));
    ok('…and the view says when and what: due at ts + timeout, the recommended label',
        v.state === 'armed' && v.dueAt === now + 300000 && v.picks[0] === 'B (Recommended)');

    ok('‼️ Stop holds it — no clock runs and the view says held',
        t.hold('c1') === true && !t.running('c1') && t.view('c1').state === 'held');
    ok('a second Stop has nothing to stop', t.hold('c1') === false);
    t.sync('c1');
    ok('a repaint does not re-arm a held question', !t.running('c1'));
    t.sync('c1', true);
    ok('…nor does a settings change', !t.running('c1') && t.view('c1').state === 'held');

    asks.set('c1', q('r2', now));
    t.sync('c1');
    ok('‼️ the NEXT question gets its own clock — a Stop belongs to one question',
        t.running('c1') && t.view('c1').state === 'armed');

    asks.set('c2', q('r3', now - 301000));
    t.sync('c2');
    await tick();
    ok('an expired clock answers with the recommended pick',
        fired.length === 1 && fired[0].id === 'c2' && fired[0].answers['Which?'] === 'B (Recommended)');

    asks.set('c3', q('r4', now - 301000));
    t.sync('c3');
    asks.set('c3', q('r5', now + 1));
    await tick();
    ok('‼️ a timer whose question was replaced never answers the new one', fired.length === 1);

    asks.set('c4', q('r6', now - 301000));
    t.sync('c4');
    asks.delete('c4');
    await tick();
    ok('…nor one that was answered in the meantime', fired.length === 1 && !t.running('c4'));

    asks.set('c5', q('r7', now - 301000));
    t.sync('c5');
    settings = autoAnswerSettings({ timeoutSeconds: 600 });
    await tick();
    ok('a wait lengthened while it ran is honoured rather than fired',
        fired.length === 1 && t.running('c5'));

    settings = autoAnswerSettings({ enabled: false });
    asks.set('c6', q('r8', now));
    t.sync('c6');
    ok('switched off: no clock, and the view says why',
        !t.running('c6') && t.view('c6').state === 'waiting' && t.view('c6').reason === 'off');

    settings = autoAnswerSettings({});
    asks.set('c7', q('r9', now, { interactive: false }));
    t.sync('c7');
    ok('‼️ a permission ask never gets a clock', !t.running('c7') && t.view('c7').reason === 'permission');
    ok('…and cannot be "stopped" into looking like one', t.hold('c7') === true && t.view('c7').state === 'waiting');

    asks.delete('c1');
    t.sync('c1');
    ok('a card with nothing pending drops its clock', !t.running('c1') && t.view('c1') === null);
    t.dispose();
    ok('dispose clears every clock', !t.running('c5'));
}

async function host() {
    let lastChild = null;
    const fakeChild = () => {
        const child = new EventEmitter();
        const pipe = () => { const s = new EventEmitter(); s.setEncoding = () => { }; s.destroy = () => { }; return s; };
        child.stdout = pipe(); child.stderr = pipe();
        child.written = [];
        child.stdin = { write: (s) => { child.written.push(String(s)); return true; }, end: () => { } };
        child.pid = 4900; child.kill = () => { };
        lastChild = child;
        return child;
    };
    const real = { spawn: cp.spawn, exec: cp.exec, execSync: cp.execSync, execFile: cp.execFile };
    cp.spawn = () => fakeChild();
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
        const init = { agentId: 'dev', agentName: 'developer', cwd: process.cwd(), engine: 'claude', permissionMode: 'default' };
        const askLine = (id, input) => JSON.stringify({
            type: 'control_request', request_id: id,
            request: { subtype: 'can_use_tool', tool_name: 'AskUserQuestion', requires_user_interaction: true, input }
        }) + '\n';
        const input = {
            questions: [{
                question: 'Which approach?', header: 'Approach', multiSelect: false,
                options: [{ label: 'Small' }, { label: 'Big (Recommended)', description: 'the whole thing' }]
            }]
        };

        // a host nobody configured never answers anything
        {
            const h = new ConsoleHost(() => 'claude');
            const id = h.start(init);
            lastChild.stdout.emit('data', askLine('q0', input));
            ok('a host with no auto-answer settings stays OFF (every other test relies on it)',
                !!h.get(id).pendingAsk && h.autoAnswerView(id).reason === 'off');
            h.dispose();
        }

        const h = new ConsoleHost(() => 'claude');
        h.autoAnswerConfig = () => autoAnswerSettings({ timeoutSeconds: 300 });
        const id = h.start(init);
        const child = lastChild;
        child.stdout.emit('data', askLine('q1', input));
        ok('the question parks the turn and its view counts down',
            !!h.get(id).pendingAsk && h.autoAnswerView(id).state === 'armed');

        // time passes: move the clock past the wait and let the host re-arm
        const t0 = realNow();
        Date.now = () => t0 + 301000;
        const wroteBefore = child.written.length;
        h.resyncAutoAnswers();
        await tick();
        const s = h.get(id);
        const line = child.written.slice(wroteBefore).map(x => { try { return JSON.parse(x); } catch { return null; } })
            .find(x => x && x.type === 'control_response');
        const upd = line && line.response && line.response.response && line.response.response.updatedInput;
        ok('‼️ the clock ran out: the question is answered and nothing is pending', !s.pendingAsk);
        ok('…on the wire the click uses, with the recommended option',
            !!upd && upd.answers && upd.answers['Which approach?'] === 'Big (Recommended)');
        ok('‼️ …and the AGENT is told it was chosen for the user, not by them',
            !!upd && /Agent Farm chose the recommended option automatically/.test(upd.response || '')
            && /Which approach\? → Big \(Recommended\)/.test(upd.response || ''));
        const row = s.messages[s.messages.length - 1];
        ok('the transcript row names the pick under the timeout mark',
            row && row.role === 'ask' && /Zaman aşımı/.test(row.answer) && /Big \(Recommended\)/.test(row.answer));

        // a held question is never answered, however long it waits
        Date.now = realNow;
        child.stdout.emit('data', askLine('q2', input));
        ok('Stop on the host holds it', h.holdAutoAnswer(id) === true && h.autoAnswerView(id).state === 'held');
        Date.now = () => t0 + 999000;
        h.resyncAutoAnswers();
        await tick();
        ok('‼️ …and a held question is still waiting after the wait has long passed',
            !!h.get(id).pendingAsk && h.get(id).pendingAsk.requestId === 'q2');

        // a destructive question is left alone, and the view says the word
        Date.now = realNow;
        h.answer(id, { kind: 'deny', message: 'x' });
        child.stdout.emit('data', askLine('q3', {
            questions: [{ question: 'Clean up?', options: [{ label: 'Delete the branch (Recommended)' }, { label: 'Keep it' }] }]
        }));
        Date.now = () => t0 + 999000;
        h.resyncAutoAnswers();
        await tick();
        ok('‼️ a destructive-looking question is never answered on a timer',
            !!h.get(id).pendingAsk && h.autoAnswerView(id).reason === 'destructive');
        h.dispose();
    } finally {
        Date.now = realNow;
        Object.assign(cp, real);
    }
}

// The wire from the setting to the button: every link named, because each one
// failing alone leaves a feature that tests green and never runs.
function wiring() {
    const fs = require('fs');
    const ROOT = path.join(__dirname, '..');
    const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
    const ext = read('src/extension.ts');
    ok('‼️ K-45: no agent can stop a question\'s clock — console.autoAnswer.hold is not on the bridge',
        ext.indexOf("op: 'console.autoAnswer.hold'") < 0);
    const parity = JSON.parse(read('parity.manifest.json'));
    const entry = (parity.entries || parity.capabilities || parity).find
        ? (parity.entries || parity.capabilities || parity).find(e => e.capability === 'consolePanel.ts#askHold') : null;
    ok('…and the card\'s Stop is recorded as the person\'s own (human-only)', !!entry && entry.exempt && entry.exempt.kind === 'human-only');
    ok('console.sessions says whether a timer will answer the question',
        /autoAnswer: consoleHost\.autoAnswerView\(s\.id\)/.test(ext));
    ok('‼️ the host is handed the settings reader — without it the feature is OFF for everyone',
        /autoAnswerSettings\(\{\s*enabled: cfg\(\)\.get\(AUTO_ANSWER_ENABLED_KEY/.test(ext));
    ok('‼️ console.sessions shows what an ask row asked or answered — measured live as null before',
        /text: m\.text \?\? m\.answer \?\? m\.ask\?\.detail \?\? null/.test(ext));
    ok('a changed setting re-arms the questions already waiting',
        /affectsConfiguration\('agentFarm\.console\.autoAnswer'\)\) \{ consoleHost\.resyncAutoAnswers\(\)/.test(ext));
    const panel = read('src/panels/consolePanel.ts');
    ok('the panel hands the view to the page and answers its Stop',
        /autoAnswer: s\.pendingAsk \? this\.deps\.host\.autoAnswerView\(s\.id\)/.test(panel)
        && /case 'askHold':\s*host\.holdAutoAnswer\(str\('id'\)\)/.test(panel));
    const js = read('media/console.js');
    ok('the card draws the countdown and posts Stop',
        /id="c-ask-hold"/.test(js) && /type: 'askHold'/.test(js) && /data-aa-due/.test(js));
    ok('‼️ a pick or a keystroke stops the timer — a half-made choice is never overwritten',
        /addEventListener\('input', hold\)/.test(js) && /return; \}\s*hold\(\);/.test(js));
    const pkg = JSON.parse(read('package.json')).contributes.configuration;
    const props = Object.assign({}, ...(Array.isArray(pkg) ? pkg : [pkg]).map(c => c.properties || {}));
    ok('both settings are contributed with the backlog\'s defaults (on, 300 s)',
        props['agentFarm.console.autoAnswer.enabled']?.default === true
        && props['agentFarm.console.autoAnswer.timeoutSeconds']?.default === 300);
}

(async () => {
    await timers();
    await host();
    wiring();
    console.log(`test_auto_answer_timers.js: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
