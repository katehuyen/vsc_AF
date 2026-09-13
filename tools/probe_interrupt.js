// S-54 — DOES INTERRUPT REALLY STOP THE TURN, INCLUDING THE WORDS ALREADY ON
// THEIR WAY? A measurement against the REAL claude CLI, through the shipped
// protocol code (out/core/consoleproto.js), the way ConsoleHost drives it.
//
//   node tools/probe_interrupt.js            → the fix: interrupt with cancel_queued when advertised
//   node tools/probe_interrupt.js plain      → the fault: a plain interrupt (expect a NEW turn ~1 s later)
//
// ‼️ THIS SPAWNS A REAL CLAUDE SESSION (haiku, low effort, one short turn — the
// test-model policy). It steers a second message into the running turn, denies
// the parked permission ask and interrupts, then watches 12 s for a new turn.
// Read the last line: `inits=1` means the stop held; `inits=2` means the queued
// message started a new turn — the S-54 fault. Run it again whenever the CLI is
// upgraded: the cure is a capability the CLI advertises, not a version number.
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const P = require(path.join(__dirname, '..', 'out', 'core', 'consoleproto.js'));

const plain = process.argv[2] === 'plain';
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'af-probe-interrupt-'));
const args = P.hostArgs({ permissionMode: 'acceptEdits', model: 'haiku', effort: 'low' });
const t0 = Date.now();
const log = (s) => console.log(`${String(Date.now() - t0).padStart(6)} ms  ${s}`);
const child = cp.spawn('claude', args, { cwd, shell: true, env: process.env, windowsHide: true });
// On the fault path the CLI is still mid-turn when the watch ends and the child
// is killed; a line already in flight would then write to a dead pipe.
const write = (line) => { log(`>> ${line.trim().slice(0, 140)}`); try { child.stdin.write(line); } catch { } };
let state = P.newSessionState({ agentId: 'probe', agentName: 'probe', cwd, engine: 'claude' });
let seq = 0, resultAt = 0, inits = 0, buf = '';
const first = 'Use the Bash tool to run exactly this command: node -e "console.log(11)" . After it returns, use the Bash tool again to run: node -e "console.log(22)" . Then report both outputs in one line.';
state = P.acceptUserText(state, first, Date.now(), false, [], crypto.randomUUID()).state;
write(P.userMessageLine(first));
child.stdout.on('data', (d) => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.trim()) { continue; }
        let o; try { o = JSON.parse(line); } catch { continue; }
        const before = state;
        state = P.reduceEvent(state, o, Date.now()).state;
        const t = o.type, st = o.subtype || (o.request && o.request.subtype) || '';
        if (t === 'system' && st === 'init') { inits++; log(`<< system/init #${inits} capabilities=${JSON.stringify(state.capabilities)}`); }
        else if (t === 'control_request' || t === 'control_response' || t === 'result') {
            log(`<< ${t}/${st} ${t === 'control_response' ? JSON.stringify(o.response).slice(0, 200) : ''}`);
        }
        if (t === 'result') { resultAt = Date.now(); }
        if (state.messages.length !== before.messages.length) {
            const m = state.messages[state.messages.length - 1];
            if (m.role === 'system' || m.role === 'result' || m.role === 'error') { log(`   card: [${m.role}] ${m.text.slice(0, 220)}`); }
        }
        if (t === 'control_request' && st === 'can_use_tool' && state.pendingAsk && seq === 0) {
            setTimeout(() => {
                // the user types into the running turn — as ConsoleHost.send does
                const uuid = crypto.randomUUID();
                const steer = 'Also, afterwards run: node -e "console.log(33)"';
                state = P.acceptUserText(state, steer, Date.now(), false, [], uuid).state;
                write(P.userMessageLine(steer, [], uuid));
                setTimeout(() => {
                    // …then presses Interrupt — as ConsoleHost.interrupt does
                    const a = P.answerAsk(state, { kind: 'deny', message: 'The user interrupted the turn.' }, Date.now());
                    state = a.state; write(a.line);
                    const rid = `int-${++seq}`;
                    const canCancel = !plain && (state.capabilities || []).includes('interrupt_cancel_queued_v1');
                    state = { ...state, pendingInterrupt: { requestId: rid } };
                    write(P.controlLine(rid, 'interrupt', canCancel ? { cancel_queued: true } : {}));
                }, 400);
            }, 300);
        } else if (t === 'control_request' && st === 'can_use_tool') {
            const a = P.answerAsk(state, { kind: 'allow' }, Date.now()); state = a.state; write(a.line);
        }
    }
});
child.on('exit', (c) => log(`process exited ${c}`));
const stopper = setInterval(() => {
    if ((resultAt && Date.now() - resultAt > 12000) || Date.now() - t0 > 70000) {
        clearInterval(stopper);
        log(`-- end: inits=${inits} (1 = the stop held · 2 = the queued message started a new turn) status=${state.status}`);
        try { cp.execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' }); } catch { }
        try { fs.rmSync(cwd, { recursive: true, force: true }); } catch { }
        setTimeout(() => process.exit(inits === 1 ? 0 : 1), 500);
    }
}, 250);
