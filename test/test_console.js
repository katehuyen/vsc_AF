// DALGA 1 — the Console's protocol (compiled core/consoleproto.js, pure).
//
// Everything asserted here was FIRST measured against the real CLI (see
// test/smoke_console_live.js, which drives actual claude processes); these
// checks pin the behaviour down so a refactor cannot quietly break it without
// spending money to find out.
//
// The two rules that cost the most to get wrong:
//   1. the first message must be SENT, not queued — the CLI emits nothing at
//      all until it receives stdin, so "wait until the session looks ready"
//      deadlocks forever;
//   2. a permission refusal is an errored tool_result, not a control request —
//      so the panel must never render a dialog it cannot answer.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    hostArgs, userMessageLine, controlLine, detectPermissionDenial, reduceEvent,
    newSessionState, acceptUserText, shiftQueued, PERMISSION_GRANTS, resetIds
} = require(path.join(__dirname, '..', 'out', 'core', 'consoleproto.js'));

const NOW = 1785164000000;
const fresh = () => newSessionState({
    id: 'c1', agentId: 'a', agentName: 'dev', cwd: 'D:/a/dev', model: 'haiku', now: NOW
});
const reduce = (s, ev, now = NOW) => reduceEvent(s, ev, now).state;

// ---------- the command line ----------
{
    const args = hostArgs({});
    ok('the streaming transport flags are always there',
        args.join(' ') === '-p --input-format stream-json --output-format stream-json --verbose');
    ok('model / effort / permission mode are appended when set',
        hostArgs({ model: 'opus', effort: 'high', permissionMode: 'plan' }).join(' ')
            .endsWith('--model opus --effort high --permission-mode plan'));
    ok('resume comes right after the transport flags, before the tuning ones',
        hostArgs({ resume: 'sid-1', model: 'opus' }).join(' ')
            .endsWith('--verbose --resume sid-1 --model opus'));
    ok('empty values add nothing', hostArgs({ model: '  ', effort: '' }).length === 6);

    const line = JSON.parse(userMessageLine('hello'));
    ok('a user message is one JSON line of the expected shape',
        line.type === 'user' && line.message.content[0].text === 'hello'
        && userMessageLine('x').endsWith('\n'));
    const ctl = JSON.parse(controlLine('r1', 'interrupt'));
    ok('a control request carries its id and subtype',
        ctl.type === 'control_request' && ctl.request_id === 'r1' && ctl.request.subtype === 'interrupt');
    ok('control requests take extra fields (set_permission_mode)',
        JSON.parse(controlLine('r2', 'set_permission_mode', { mode: 'acceptEdits' })).request.mode === 'acceptEdits');
}

// ---------- rule 1: the first message must go out ----------
{
    resetIds();
    const s = fresh();
    ok('a brand new session is "starting"', s.status === 'starting');
    const first = acceptUserText(s, 'hi', NOW);
    ok('…and its first message is SENT, not queued (the CLI is silent until stdin)',
        first.send === true && first.state.queued.length === 0);
    ok('…which puts the session to work', first.state.status === 'working');
    const second = acceptUserText(first.state, 'and this', NOW + 1);
    ok('a message typed mid-turn IS queued', second.send === false && second.state.queued.length === 1);
    ok('…and still shows in the conversation right away',
        second.state.messages.filter(m => m.role === 'user').length === 2);
    ok('empty input is ignored', acceptUserText(second.state, '   ', NOW).state === second.state);

    const idle = { ...second.state, status: 'idle' };
    const shifted = shiftQueued(idle);
    ok('a finished turn releases the queued message', shifted.text === 'and this');
    ok('…exactly once', shiftQueued(shifted.state).text === undefined);
    ok('…and marks the session working again', shifted.state.status === 'working');
    ok('nothing is released while a turn runs', shiftQueued(second.state).text === undefined);
}

// ---------- the event stream ----------
{
    resetIds();
    let s = fresh();
    s = reduce(s, {
        type: 'system', subtype: 'init', session_id: 'sid-9', model: 'claude-haiku-4-5',
        permissionMode: 'manual', cwd: 'D:/a/dev'
    });
    ok('init adopts claude\'s own session id', s.sessionId === 'sid-9');
    ok('…the model and the permission mode it really started in',
        s.model === 'claude-haiku-4-5' && s.permissionMode === 'manual');
    ok('…and the session becomes usable', s.status === 'idle');

    s = reduce(s, { type: 'system', subtype: 'thinking_tokens', estimated_tokens: 5120 });
    ok('the CLI\'s own context estimate is kept', s.contextTokens === 5120);
    const before = s.messages.length;
    s = reduce(s, { type: 'system', subtype: 'hook_started', hook_name: 'SessionStart' });
    ok('hook chatter is NOT rendered as conversation', s.messages.length === before);
    s = reduce(s, { type: 'rate_limit_event', rate_limit_info: {} });
    ok('rate-limit notes are not conversation either', s.messages.length === before);

    s = reduce(s, {
        type: 'assistant',
        message: {
            content: [
                { type: 'thinking', thinking: 'internal monologue' },
                { type: 'text', text: 'Working on it.' },
                { type: 'tool_use', id: 't1', name: 'Write', input: { file_path: 'D:/a/dev/note.txt', content: 'x' } },
                { type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'git status' } }
            ]
        }
    });
    const msgs = s.messages;
    ok('thinking blocks are never shown as the agent talking',
        !msgs.some(m => /internal monologue/.test(m.text || '')));
    ok('agent text is shown', msgs.some(m => m.role === 'agent' && m.text === 'Working on it.'));
    ok('a write tool carries its file (the ✎ chips need it)',
        msgs.some(m => m.tool && m.tool.name === 'Write' && m.tool.file === 'D:/a/dev/note.txt'));
    ok('a non-writing tool carries a readable argument but no file',
        msgs.some(m => m.tool && m.tool.name === 'Bash' && m.tool.detail === 'git status' && !m.tool.file));
    ok('tool traffic puts the session in "working"', s.status === 'working');

    s = reduce(s, {
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: 't2', content: 'ok', is_error: false }] }
    });
    ok('a tool result is shown as a tool line', s.messages[s.messages.length - 1].role === 'tool');

    s = reduce(s, {
        type: 'result', subtype: 'success', is_error: false,
        num_turns: 2, total_cost_usd: 0.0123, session_id: 'sid-9'
    });
    ok('a finished turn returns the session to idle', s.status === 'idle');
    ok('…and bills it', s.costUSD === 0.0123 && s.turns === 1);
    s = reduce(s, { type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.01 });
    ok('cost accumulates across turns', Math.abs(s.costUSD - 0.0223) < 1e-9 && s.turns === 2);
}

// ---------- rule 2: permission refusals ----------
{
    const real = "Claude requested permissions to write to C:\\tmp\\note.txt, but you haven't granted it yet.";
    ok('the CLI\'s real refusal wording is detected', !!detectPermissionDenial(real));
    ok('…and carried as detail', /requested permissions/.test(detectPermissionDenial(real).detail));
    ok('an ordinary tool failure is NOT read as a permission problem',
        !detectPermissionDenial('Error: file not found') &&
        !detectPermissionDenial('permission denied by the operating system'));
    ok('half a match is not a match',
        !detectPermissionDenial('Claude requested permissions to write') &&
        !detectPermissionDenial("you haven't granted it yet"));

    resetIds();
    let s = { ...fresh(), status: 'working' };
    s = reduce(s, {
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: real, is_error: true }] }
    });
    ok('a refusal becomes a pending permission the panel can act on', !!s.pendingPermission);
    ok('…and the message row is marked as one',
        !!s.messages[s.messages.length - 1].permission && s.messages[s.messages.length - 1].isError === true);

    // the honest grant: the mode really changed, so the flag clears
    s = reduce(s, {
        type: 'control_response',
        response: { subtype: 'success', request_id: 'mode-1', response: { mode: 'acceptEdits' } }
    });
    ok('a live mode change is adopted', s.permissionMode === 'acceptEdits');
    ok('…clears the pending refusal', !s.pendingPermission);
    ok('…and says so in the conversation',
        /permission mode is now "acceptEdits"/.test(s.messages[s.messages.length - 1].text || ''));

    const interrupted = reduce({ ...fresh(), status: 'working' }, {
        type: 'result', subtype: 'error_during_execution', is_error: true, total_cost_usd: 0
    });
    ok('an interrupted turn is labelled as interrupted, not failed',
        /interrupted/.test(interrupted.messages[interrupted.messages.length - 1].text || ''));
    ok('…and the session stays usable', interrupted.status === 'idle');

    ok('the offered grants are all real permission modes',
        PERMISSION_GRANTS.every(g => ['acceptEdits', 'auto', 'bypassPermissions', 'plan'].includes(g.mode)));
    ok('…and the dangerous one is marked', PERMISSION_GRANTS.some(g => g.mode === 'bypassPermissions' && /⚠/.test(g.label)));
}

// ---------- junk in, nothing out ----------
{
    const s = fresh();
    ok('unknown lines change nothing',
        reduceEvent(s, { type: 'nonsense' }, NOW).changed === false
        && reduceEvent(s, null, NOW).changed === false
        && reduceEvent(s, 'not an object', NOW).changed === false);
}

// ---------- ‼️ two processes must never share one session ----------
// `claude --resume <id>` on a session a process already owns starts a SECOND
// process on the same transcript: both write to it, neither sees the other's
// turns, and the session list then shows one conversation nobody had. Measured
// on the real registry (two pids, one sessionId, entrypoints cli + sdk-cli).
{
    const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'consolePanel.ts'), 'utf8');
    ok('the Console asks who owns a session before resuming it',
        /liveOwners\(\)\.find\(o => o\.sessionId === sessionId\)/.test(panel));
    ok('…and refuses by default, explaining what a second process would mean',
        /SECOND process on the same transcript/.test(panel));
    ok('…offering the two things that DO work: jump there, or a new session',
        /Jump to that terminal/.test(panel) && /New session in the same folder/.test(panel));

    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('resuming into a TERMINAL carries the same warning',
        /ownerOf\(readCliSessions\(claudeDir\(\)\), s\.sessionId\)/.test(ext));
    ok('…and lets it happen only as a deliberate choice',
        /Open a second process anyway/.test(ext));

    const js = fs.readFileSync(path.join(__dirname, '..', 'media', 'console.js'), 'utf8');
    ok('the resume list marks sessions that are open elsewhere',
        /owned\.has\(r\.sessionId\)/.test(js));
}

// ---------- the composer shows what each mode can actually change ----------
{
    const js = fs.readFileSync(path.join(__dirname, '..', 'media', 'console.js'), 'utf8');
    const liveRow = js.slice(js.indexOf('const liveRow'), js.indexOf('const placeholder'));
    ok('a running session gets NO agent/model/effort boxes at all (they were dead)',
        liveRow.length > 100 && !/c-agent|c-model|c-effort/.test(liveRow));
    ok('…it shows them as a plain status line instead', /class="fixed"/.test(js));
    ok('…and keeps the one control that really works mid-session',
        /The one thing that CAN change mid-session/.test(js));
    ok('new-session mode is the only place the agent is picked',
        /const newRow = /.test(js) && /choose an agent…/.test(js));
    ok('starting without an agent focuses the picker instead of swallowing the message',
        /if \(!st\.agentId\)/.test(js));
    ok('an agent row can open the Console with that agent preselected',
        /presetAgent/.test(js));
}

// ---------- the fleet line on the portfolio ----------
{
    const js = fs.readFileSync(path.join(__dirname, '..', 'media', 'portfolio.js'), 'utf8');
    ok('the portfolio has a totals row', /totalsRow/.test(js));
    ok('…that sums the fixed context load the user asked for',
        /contextLoad \+= r\.contextLoad/.test(js));
    ok('…and sums every other column too',
        /tokens30 \+= r\.tokens30/.test(js) && /memoryFiles \+= r\.memoryFiles/.test(js)
        && /errors \+= r\.errors/.test(js));
    ok('…rendered outside the sort so it never moves',
        /never re-ordered by a sort/.test(js));
}

// ---------- wiring ----------
{
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    for (const op of ['console.start', 'console.send', 'console.sessions', 'console.interrupt',
        'console.permissionMode', 'console.close']) {
        ok(`${op} is on the bridge`, ext.includes(`op: '${op}'`));
    }
    ok('the host outlives the panel, and dies with the window',
        /consoleHost\.dispose\(\)/.test(ext));
    const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'consolePanel.ts'), 'utf8');
    ok('the panel does not kill sessions when its tab closes',
        /deliberately OUTLIVE the panel/.test(panel));
    const js = fs.readFileSync(path.join(__dirname, '..', 'media', 'console.js'), 'utf8');
    ok('the permission box says what it can really do, not "allow once"',
        /does not ask the panel for a one-off approval/.test(js));
    ok('the composer carries agent · model · effort · permission mode',
        /c-agent/.test(js) && /c-model/.test(js) && /c-effort/.test(js) && /c-perm/.test(js));
    ok('interrupt and the queue are in the composer', /c-int/.test(js) && /c-clearq/.test(js));
    ok('file writes offer open + diff', /data-open=/.test(js) && /data-diff=/.test(js));
    const nav = fs.readFileSync(path.join(__dirname, '..', 'media', 'pageHeader.js'), 'utf8');
    ok('Console is the first thing in the global nav', /\{ id: 'console'/.test(nav));
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    ok('it has a command', pkg.contributes.commands.some(c => c.command === 'agentfarm.openConsole'));
    ok('…and a key', pkg.contributes.keybindings.some(k => k.command === 'agentfarm.openConsole'));
    ok('a live smoke exists for the parts unit tests cannot prove',
        fs.existsSync(path.join(__dirname, 'smoke_console_live.js')));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
