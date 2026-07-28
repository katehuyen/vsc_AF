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
    // Waiting is not said. Writing it into the conversation the moment it was
    // typed put it ABOVE the reply it was asked after and pushed the running
    // turn up the page — a terminal keeps it on the line until it goes.
    ok('…and does NOT join the conversation while it waits',
        second.state.messages.filter(m => m.role === 'user').length === 1);
    ok('empty input is ignored', acceptUserText(second.state, '   ', NOW).state === second.state);

    const idle = { ...second.state, status: 'idle' };
    const shifted = shiftQueued(idle, NOW + 2);
    ok('a finished turn releases the queued message', shifted.text === 'and this');
    ok('…and THAT is when it becomes part of the conversation',
        shifted.state.messages.filter(m => m.role === 'user').length === 2
        && shifted.state.messages[shifted.state.messages.length - 1].text === 'and this');
    ok('…exactly once', shiftQueued(shifted.state).text === undefined);
    ok('…and marks the session working again', shifted.state.status === 'working');
    ok('nothing is released while a turn runs', shiftQueued(second.state).text === undefined);
    // order is the order you typed them in
    const q2 = acceptUserText(acceptUserText(first.state, 'one', NOW + 1).state, 'two', NOW + 2);
    const r1 = shiftQueued({ ...q2.state, status: 'idle' }, NOW + 3);
    const r2 = shiftQueued({ ...r1.state, status: 'idle' }, NOW + 4);
    ok('a queue keeps its order', r1.text === 'one' && r2.text === 'two');
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
    // A RESUMED session's id is ours before the process even spawns, and the
    // row's name, its rename and its transcript all hang off that id. Waiting
    // for init to report it back left the row nameless — and "this session has
    // not reported its id yet" was the answer to a right-click on it.
    {
        const resumed = newSessionState({
            id: 'c9', agentId: 'a', agentName: 'dev', cwd: 'D:/a/dev', now: NOW, sessionId: 'sid-1'
        });
        ok('a resumed session knows its id before the CLI says a word', resumed.sessionId === 'sid-1');
        ok('…a brand new one honestly has none', fresh().sessionId === undefined);
        ok('…and the id the CLI reports still wins',
            reduce(resumed, { type: 'system', subtype: 'init', session_id: 'sid-2' }).sessionId === 'sid-2');
        const host = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'consolehost.ts'), 'utf8');
        ok('…the host seeds it from --resume', /sessionId: init\.resume/.test(host));
    }
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

    // …but a session the CONSOLE holds is ours to close. "You can't" is the
    // wrong answer when the thing in the way is our own process: offer to move
    // it, and wait for the pid to really die before the terminal starts.
    ok('a session held by the Console offers to MOVE to a terminal instead of refusing',
        /End it in the Console and continue here/.test(ext)
        && /consoleHost\.close\(hosted\.id\)/.test(ext));
    ok('…and does not launch until the process is really gone',
        /if \(!ownerOf\(readCliSessions\(claudeDir\(\)\), s\.sessionId\)\) \{ break; \}/.test(ext));
    ok('…the other choice shows it where it is running',
        /'Show it in the Console'/.test(ext));
}

// ---------- a resume that means CONTINUE ----------
// `--resume` restores the model's context; the panel used to show nothing until
// the next turn, so the one thing a resume is for was missing from the surface
// that exists to show conversations. The rows come off disk — no token is spent.
{
    const { transcriptHistory, HISTORY_MAX } =
        require(path.join(__dirname, '..', 'out', 'core', 'consolehistory.js'));
    const L = (o) => JSON.stringify(o);
    const lines = [
        L({ type: 'user', timestamp: '2026-07-28T10:00:00.000Z', message: { content: 'read the report' } }),
        L({ type: 'assistant', timestamp: '2026-07-28T10:00:05.000Z', message: { content: [{ type: 'thinking', text: 'hmm' }, { type: 'text', text: 'on it' }] } }),
        L({ type: 'assistant', timestamp: '2026-07-28T10:00:06.000Z', message: { content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'D:/a/b.md' } }] } }),
        L({ type: 'user', timestamp: '2026-07-28T10:00:07.000Z', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'file body' }] } }),
        L({ type: 'user', isMeta: true, message: { content: 'harness noise' } }),
        L({ type: 'assistant', isSidechain: true, message: { content: [{ type: 'text', text: 'a subagent said this' }] } }),
        L({ type: 'summary', summary: 'not conversation' }),
        'not json at all',
        ''
    ];
    const h = transcriptHistory(lines);
    const body = h.slice(1, -1);   // between the two system markers
    ok('the earlier conversation comes back in order',
        body.map(m => m.role).join(',') === 'user,agent,tool,tool');
    ok('…with the words that were actually said', body[0].text === 'read the report' && body[1].text === 'on it');
    ok('…a tool call keeps its file, so the ✎ chips still work',
        body[2].tool.name === 'Read' && body[2].tool.detail === 'D:/a/b.md');
    ok('…thinking blocks, meta lines and sub-agent runs stay out',
        !h.some(m => /hmm|harness noise|a subagent said this|not conversation/.test(m.text || '')));
    ok('…timestamps come from the transcript', body[0].ts === Date.parse('2026-07-28T10:00:00.000Z'));
    ok('…and it says where it came from', /read back from the transcript/.test(h[h.length - 1].text));
    ok('a transcript with no conversation yields nothing at all', transcriptHistory(['', 'junk']).length === 0);

    const many = [];
    for (let i = 0; i < HISTORY_MAX + 40; i++) {
        many.push(L({ type: 'user', timestamp: '2026-07-28T10:00:00.000Z', message: { content: 'm' + i } }));
    }
    const big = transcriptHistory(many);
    ok('a long session keeps the END — where you left off is what you came back for',
        big.length === HISTORY_MAX + 2
        && big[big.length - 2].text === 'm' + (HISTORY_MAX + 39));
    ok('…and says how many it left in the transcript', /^↑ 40 older message/.test(big[0].text));

    // A transcript can be tens of megabytes: only its tail is parsed, so the
    // cost of a resume does not grow with the length of the session.
    const huge = [];
    for (let i = 0; i < 5000; i++) {
        huge.push(L({ type: 'user', timestamp: '2026-07-28T10:00:00.000Z', message: { content: 'x' + i } }));
    }
    const tail = transcriptHistory(huge);
    ok('only the tail of a huge transcript is parsed',
        tail[tail.length - 2].text === 'x4999' && tail.length === HISTORY_MAX + 2);
    ok('…and it does not pretend to know how many it skipped',
        /^↑ earlier messages are in the transcript/.test(tail[0].text));

    const host = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'consolehost.ts'), 'utf8');
    ok('the history is seeded as MESSAGES, never written to stdin (it costs nothing)',
        /messages: init\.history/.test(host) && !/write\(id, [^)]*history/.test(host));
    const panel2 = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'consolePanel.ts'), 'utf8');
    const ext2 = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('both ways of resuming into the Console carry it',
        /history: this\.deps\.history\(sessionId\)/.test(panel2)
        && /history: consoleHistory\(s\.sessionId\)/.test(ext2));
}

// ---------- the leak that made closed sessions un-resumable ----------
// `shell: true` means the child we hold is the shell, not claude: killing it
// left claude.exe running for hours, holding its registry entry, so the panel
// kept reporting the session as open. Measured: five orphaned claude.exe trees.
{
    const host = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'consolehost.ts'), 'utf8');
    ok('closing a Console session kills the whole process TREE', /killTree\(h\.child\)/.test(host));
    ok('…with taskkill /T on Windows, like the task runner does',
        /taskkill.*\/T.*\/F|'\/T', '\/F'/.test(host) || /'\/PID', String\(pid\), '\/T', '\/F'/.test(host));
    ok('…and the reason is written down, not just the code',
        /orphaned, holding its/.test(host) && /session registry/.test(host));
    const cli = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'cliSessions.ts'), 'utf8');
    ok('a registry file whose process is gone is ignored',
        /if \(!pidAlive\(rec\.pid\)\) \{ continue; \}/.test(cli));
}

// ---------- the composer shows what each mode can actually change ----------
{
    const js = fs.readFileSync(path.join(__dirname, '..', 'media', 'console.js'), 'utf8');
    // The composer row is one ternary in buildShell: the live branch first, the
    // new-session branch after the `:`.
    const controls = js.slice(js.indexOf('const controls = s'), js.indexOf("getElementById('app').innerHTML"));
    const split = controls.indexOf(": `<select id=\"c-agent\"");
    const liveRow = split > 0 ? controls.slice(0, split) : '';
    ok('a running session gets NO agent/model/effort boxes at all (they were dead)',
        liveRow.length > 100 && !/c-agent|c-model|c-effort/.test(liveRow));
    ok('…it shows them as a plain status line instead', /class="fixed"/.test(js));
    ok('…and keeps the one control that really works mid-session',
        /The one thing that CAN change mid-session/.test(js));
    ok('new-session mode is the only place the agent is picked',
        split > 0 && controls.indexOf('Choose an agent…') > split);
    ok('starting without an agent focuses the picker instead of swallowing the message',
        /if \(!st\.agentId\)/.test(js));
    ok('an agent row can open the Console with that agent preselected',
        /presetAgent/.test(js));
    ok('a session row carries its own title, not just the agent name',
        /class="t2"/.test(js));
    // Right-click must reach VS Code's OWN menu (Copy/Paste and the session's
    // actions together) — a `contextmenu` listener that opened a rename box
    // straight away is exactly what this forbids.
    ok('…and right-click hands the row to VS Code\'s context menu, not to a rename box',
        /data-vscode-context/.test(js)
        && !/addEventListener\('contextmenu'/.test(js) && !/type: 'rename'/.test(js));
    ok('…keeping the default Copy/Paste items in it',
        /preventDefaultContextMenuItems: false/.test(js));
    ok('…on the hosted rows and the resumable ones alike',
        /webviewSection: 'afConsoleSession'/.test(js) && /webviewSection: 'afConsoleResumable'/.test(js));
}

// ---------- one name, three places to set it ----------
{
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const menus = [].concat(...Object.values(pkg.contributes.menus));
    ok('1. the side panel still renames a session',
        menus.some(m => m.command === 'agentfarm.renameSession'));
    const cjs = fs.readFileSync(path.join(__dirname, '..', 'media', 'console.js'), 'utf8');
    const web = pkg.contributes.menus['webview/context'] || [];
    ok('2. the Console renames from a row — through the same command',
        /data-vscode-context/.test(cjs)
        && web.some(m => m.command === 'agentfarm.renameSession'
            && /afConsole\(Session\|Resumable\)/.test(m.when)));
    const vjs = fs.readFileSync(path.join(__dirname, '..', 'media', 'sessionViewer.js'), 'utf8');
    ok('3. the session\'s own page has a rename button', /id="renamesess"/.test(vjs));
    const extSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('a renamed session is renamed everywhere at once (trees, Console rows, open tabs)',
        /const applySessionTitle/.test(extSrc)
        && /ConsolePanel\.refreshIfOpen\(\);\s*\n\s*SessionViewerPanel\.refreshOpen\(\);/.test(extSrc));
    // ‼️ A new session, a new turn: the TREES were told and the PAGES were not,
    // so a Dashboard or an agent page left open showed the farm as it was when
    // it was opened — while you were talking in the Console and watching it.
    ok('an open page follows the index, not the Refresh button',
        /const refreshOpenPages = /.test(extSrc)
        && /index\.onDidUpdate\(\(\) => \{[\s\S]{0,400}refreshOpenPages\(\);/.test(extSrc));
    for (const p of ['DashboardPanel', 'AgentDetailPanel', 'PortfolioPanel', 'TurnsPanel', 'LivingPanel']) {
        ok(`…${p} among them`, new RegExp(`${p}\\.refreshIfOpen\\(\\);`).test(extSrc));
    }
    ok('…debounced, because a streaming session updates the index many times a second',
        /pagePulse/.test(extSrc) && /\}, 1000\);/.test(extSrc));
    // The Console row's menu is a real menu: resume and the transcript are on it
    // too, so a right-click is a place to work from, not a single shortcut.
    ok('a resumable row can be resumed from that menu',
        web.some(m => m.command === 'agentfarm.resumeInConsole' && m.when.includes('afConsoleResumable')));
    ok('…and any row can open its transcript from it',
        web.some(m => m.command === 'agentfarm.openSession'));
    // The two pages that HAVE a subject claim the Console nav button for it,
    // instead of carrying a second button that means almost the same thing.
    ok('a session page claims the Console nav button for "resume THIS session"',
        /navActions:/.test(vjs) && /label: 'Resume Session'/.test(vjs));
    const ajs = fs.readFileSync(path.join(__dirname, '..', 'media', 'agentDetail.js'), 'utf8');
    ok('an agent page claims it for "talk to THIS agent"',
        /navActions:/.test(ajs) && /label: 'Talk to Agent'/.test(ajs));
    const hdr = fs.readFileSync(path.join(__dirname, '..', 'media', 'pageHeader.js'), 'utf8');
    // A menu is a list of choices, not a place to explain them: two or three
    // words per item, and no prose under them.
    ok('…and neither writes an explanation into the menu',
        !/hint:/.test(vjs) && !/hint:/.test(ajs) && !/af-claim-hint/.test(hdr));
    // ONE button, two meanings in a menu under it — the pair of buttons it
    // replaced ate a quarter of the toolbar's width.
    ok('…and a claimed button stays ONE button with a menu, not two buttons',
        /data-afclaim=/.test(hdr) && /af-claim-menu/.test(hdr) && !/af-nav-plain/.test(hdr));
    ok('…whose menu still offers the plain page',
        /data-afclaimmenu[\s\S]{0,400}data-afnav="\$\{n\.id\}"/.test(hdr));
    ok('a session row can be resumed into the Console from the side panel',
        menus.some(m => m.command === 'agentfarm.resumeInConsole'));
    // A webview tab has ONE string (VS Code gives it no tooltip of its own), so
    // the id leads and the name follows — under a hard ceiling, because tabs are
    // sized to fit their label and a long name made one tab as wide as three.
    const Module = require('module');
    const origLoad = Module._load;
    Module._load = function (request) {
        if (request === 'vscode') { return { Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }, ViewColumn: {}, env: {} }; }
        return origLoad.apply(this, arguments);
    };
    const { tabCaption } = require(path.join(__dirname, '..', 'out', 'panels', 'sessionViewer.js'));
    Module._load = origLoad;
    ok('the tab leads with the session id',
        tabCaption('3f2a91b8-c629-49c0', 'Kalan eksikler').startsWith('Session #3f2a91b8'));
    ok('…the name follows it', tabCaption('3f2a91b8', 'Kalan').endsWith('· Kalan'));
    ok('…an unnamed session is the id alone',
        tabCaption('3f2a91b8') === 'Session #3f2a91b8'
        && tabCaption('3f2a91b8', '(untitled session)') === 'Session #3f2a91b8');
    const long = tabCaption('3f2a91b8', 'a session name far longer than any tab could ever be');
    ok('…and a long name is cut, never the tab', long.length === 30 && long.endsWith('…'));
    ok('the Files box starts closed and stays as the user left it',
        /let filesOpen = false;/.test(vjs)
        && /filesOpen = savedState\.filesOpen === true;/.test(vjs)
        && /keepState\(\{ filesOpen \}\)/.test(vjs));
}

// ---------- the nav is ordered by meaning ----------
{
    const nav = fs.readFileSync(path.join(__dirname, '..', 'media', 'pageHeader.js'), 'utf8');
    const order = (nav.match(/\{ id: '([a-z]+)'/g) || []).map(s => s.replace(/.*'([a-z]+)'.*/, '$1'));
    ok('Dashboard leads', order[0] === 'dashboard');
    ok('Console follows it', order[1] === 'console');
    ok('the vital signs come next', order.slice(2, 5).join(',') === 'living,notices,queue');
    ok('then what is happening right now', order[5] === 'timeline');
    ok('then who does the work, then the work', order.slice(6, 8).join(',') === 'portfolio,tasks');
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const title = pkg.contributes.menus['view/title']
        .filter(m => m.when === 'view == agentfarm.agents')
        .map(m => ({ cmd: m.command, at: Number(m.group.replace('navigation@', '')) }))
        .sort((a, b) => a.at - b.at).map(x => x.cmd);
    ok('in the side panel Console sits between Start Session and Turns',
        title.indexOf('agentfarm.openConsole') === title.indexOf('agentfarm.launchSession') + 1
        && title.indexOf('agentfarm.openTurns') === title.indexOf('agentfarm.openConsole') + 1);
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
    // "Talk to Agent" must differ from "Open Console" by exactly one thing: the
    // agent is already chosen. The shell is not rebuilt when the composer is
    // already up, so the picker is mirrored on every pass, not only at build.
    ok('an agent chosen for us reaches the picker even when the composer is already up',
        /agentSel\.value = st\.agentId/.test(js));
    ok('…and the picker asks for it as a sentence, capital first',
        /Choose an agent…/.test(js) && !/choose an agent/.test(js));
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
