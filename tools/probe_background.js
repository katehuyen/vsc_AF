// S-62 — WHAT DOES A BACKGROUND COMMAND LOOK LIKE ON THE WIRE, AND WHAT HAPPENS
// WHEN IT FINISHES AFTER THE TURN (OR AFTER A STOP)? A measurement against the
// REAL claude CLI, through the shipped protocol code (out/core/consoleproto.js),
// the way ConsoleHost drives it.
//
//   node tools/probe_background.js              → let the turn end, watch what the finished task sends
//   node tools/probe_background.js stop         → plain Stop while the task runs (the S-62 fault)
//   node tools/probe_background.js kill         → stop_task for the task FIRST, then Stop with cancel_queued
//   node tools/probe_background.js kill-after   → Stop first, then stop_task for the task
//
// ‼️ THIS SPAWNS A REAL CLAUDE SESSION (haiku, low effort, one short turn — the
// test-model policy). It asks for ONE Bash call with run_in_background:true,
// allows it, and then watches 25 s. Every raw line whose type is not the
// ordinary assistant/usage chatter is printed in full, so the shape of the
// notification — which event type, which field carries the text, whether a
// new system/init or a new turn follows — is read off the wire, not guessed.
// Read the last line: `inits=1` means no turn was opened behind the user's
// back; `inits=2` means the finished (or stopped) task opened one.
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const P = require(path.join(__dirname, '..', 'out', 'core', 'consoleproto.js'));

const mode = process.argv[2] || '';
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'af-probe-background-'));
const args = P.hostArgs({ permissionMode: 'acceptEdits', model: 'haiku', effort: 'low' });
const t0 = Date.now();
const log = (s) => console.log(`${String(Date.now() - t0).padStart(6)} ms  ${s}`);
const child = cp.spawn('claude', args, { cwd, shell: true, env: process.env, windowsHide: true });
const write = (line) => { log(`>> ${line.trim().slice(0, 160)}`); try { child.stdin.write(line); } catch { } };
let state = P.newSessionState({ agentId: 'probe', agentName: 'probe', cwd, engine: 'claude' });
let seq = 0, resultAt = 0, inits = 0, results = 0, buf = '', acted = false, bgSeen = 0, taskId = '';
const first = 'Use the Bash tool exactly once with run_in_background set to true to run this command: node -e "setTimeout(function(){console.log(77)},8000)" . Do not wait for it and do not call any other tool; just say "started" and end your reply.';
state = P.acceptUserText(state, first, Date.now(), false, [], crypto.randomUUID()).state;
write(P.userMessageLine(first));
const interrupt = () => {
    const rid = `int-${++seq}`;
    const canCancel = (state.capabilities || []).includes('interrupt_cancel_queued_v1');
    state = { ...state, pendingInterrupt: { requestId: rid } };
    write(P.controlLine(rid, 'interrupt', canCancel ? { cancel_queued: true } : {}));
};
const stopTask = () => write(P.controlLine(`stop-${++seq}`, 'stop_task', { task_id: taskId }));
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
        if (t === 'system' && st === 'init') { inits++; log(`<< system/init #${inits}`); }
        else if (t === 'system' && (st === 'thinking_tokens' || st === 'hook_started' || st === 'hook_response')) { /* chatter */ }
        else if (t === 'rate_limit_event') { /* chatter */ }
        else if (t === 'assistant') {
            const blocks = Array.isArray(o.message && o.message.content) ? o.message.content : [];
            for (const b of blocks) {
                if (b.type === 'tool_use') {
                    log(`<< assistant/tool_use ${b.name} input=${JSON.stringify(b.input).slice(0, 300)}`);
                    if (b.input && b.input.run_in_background === true) { bgSeen++; }
                } else if (b.type === 'text') { log(`<< assistant/text ${String(b.text).slice(0, 120)}`); }
            }
        }
        else if (t === 'user') {
            const c = o.message && o.message.content;
            const kind = typeof c === 'string' ? 'string' : Array.isArray(c) ? `array[${c.map(b => b.type).join(',')}]` : typeof c;
            log(`<< user content=${kind} :: ${JSON.stringify(o.message).slice(0, 300)}`);
        }
        else if (t === 'result') { results++; log(`<< result #${results} subtype=${st}`); resultAt = Date.now(); }
        else if (t === 'control_request' || t === 'control_response') {
            log(`<< ${t}/${st} ${t === 'control_response' ? JSON.stringify(o.response).slice(0, 400) : ''}`);
        }
        else { log(`<< RAW ${JSON.stringify(o).slice(0, 500)}`); }
        if (t === 'system' && st === 'task_started' && typeof o.task_id === 'string') { taskId = o.task_id; }
        if (mode && !acted && t === 'system' && st === 'task_started') {
            acted = true;
            setTimeout(() => {
                if (mode === 'stop') { interrupt(); }
                else if (mode === 'kill') { stopTask(); setTimeout(interrupt, 1200); }
                else if (mode === 'kill-after') { interrupt(); setTimeout(stopTask, 800); }
            }, 1500);
        }
        if (state.messages.length !== before.messages.length) {
            const m = state.messages[state.messages.length - 1];
            if (m.role === 'system' || m.role === 'result' || m.role === 'error') { log(`   card: [${m.role}] ${m.text.slice(0, 220)}`); }
        }
        if (t === 'control_request' && st === 'can_use_tool') {
            const a = P.answerAsk(state, { kind: 'allow' }, Date.now()); state = a.state; write(a.line);
        }
    }
});
child.stderr.on('data', (d) => log(`!! ${d.toString('utf8').trim().slice(0, 300)}`));
child.on('exit', (c) => log(`process exited ${c}`));
const stopper = setInterval(() => {
    if ((resultAt && Date.now() - resultAt > 25000) || Date.now() - t0 > 90000) {
        clearInterval(stopper);
        log(`-- end: mode=${mode || 'none'} bgCalls=${bgSeen} inits=${inits} results=${results} status=${state.status}`);
        try { child.kill(); } catch { }
        setTimeout(() => process.exit(0), 300);
    }
}, 500);
