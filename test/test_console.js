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
//   2. the session CAN ask you something mid-turn — but only if the command
//      line invites it to (`--permission-prompt-tool stdio`). Drop that flag and
//      every question resolves itself as "nobody answered". See
//      test_console_ask.js for the whole of that contract.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    hostArgs, userMessageLine, controlLine, detectPermissionDenial, reduceEvent,
    newSessionState, acceptUserText, shiftQueued, editQueued, takeQueued,
    PERMISSION_GRANTS, resetIds, carriedTotals
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
        args.join(' ') === '-p --input-format stream-json --output-format stream-json --verbose '
            + '--permission-prompt-tool stdio --allow-dangerously-skip-permissions');
    // ‼️ It ENABLES the choice, it does not make it. Without it the CLI refuses
    // a live switch to bypassPermissions outright ("the session was not
    // launched with --dangerously-skip-permissions", measured 2026-08-09), so
    // the panel's own ⚠ picker row and its "Allow everything" button were
    // controls that could never work. Note which flag it is: the `--allow-`
    // one, whose whole purpose is to leave the decision with the user.
    ok('…and the one that makes the panel\'s own bypass control possible',
        args.includes('--allow-dangerously-skip-permissions')
        && !args.includes('--dangerously-skip-permissions'));
    // ‼️ The flag that makes the channel two-way. Drop it and the CLI answers
    // its own permission prompts and its own AskUserQuestion calls (with
    // "nobody answered"), the tool fails, and the turn ends on a question the
    // panel was never given the chance to hear. Measured, 2026-07-30.
    ok('…including the one that lets the session ASK us something',
        hostArgs({}).join(' ').includes('--permission-prompt-tool stdio'));
    ok('model / effort / permission mode are appended when set',
        hostArgs({ model: 'opus', effort: 'high', permissionMode: 'plan' }).join(' ')
            .endsWith('--model opus --effort high --permission-mode plan'));
    ok('resume comes right after the transport flags, before the tuning ones',
        hostArgs({ resume: 'sid-1', model: 'opus' }).join(' ')
            .endsWith('--allow-dangerously-skip-permissions --resume sid-1 --model opus'));
    ok('empty values add nothing', hostArgs({ model: '  ', effort: '' }).length === args.length);

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
    // ‼️ Measured against the real CLI: a line written to stdin mid-turn is
    // delivered to the model at that turn's next step. So the default is to
    // say it, not to sit on it until the turn is over.
    const steer = acceptUserText(first.state, 'no, do it the other way', NOW + 1);
    ok('a message typed mid-turn IS sent, into the running turn',
        steer.send === true && steer.state.queued.length === 0);
    ok('…and joins the conversation, marked as steering',
        steer.state.messages[steer.state.messages.length - 1].steer === true);
    ok('…without restarting the turn\'s own clock',
        steer.state.turnStartedAt === first.state.turnStartedAt && steer.state.status === 'working');

    const second = acceptUserText(first.state, 'and this', NOW + 1, true);
    ok('holding it back is the OTHER choice, and it queues',
        second.send === false && second.state.queued.length === 1);
    // Held is not said: writing it into the conversation the moment it was
    // typed would put it ABOVE the reply it was asked after.
    ok('…and does NOT join the conversation while it waits',
        second.state.messages.filter(m => m.role === 'user').length === 1);
    ok('empty input is ignored', acceptUserText(second.state, '   ', NOW).state === second.state);
    ok('holding while nothing runs just says it',
        acceptUserText({ ...first.state, status: 'idle' }, 'now', NOW + 2, true).send === true);

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
    const q2 = acceptUserText(acceptUserText(first.state, 'one', NOW + 1, true).state, 'two', NOW + 2, true);
    const r1 = shiftQueued({ ...q2.state, status: 'idle' }, NOW + 3);
    const r2 = shiftQueued({ ...r1.state, status: 'idle' }, NOW + 4);
    ok('a queue keeps its order', r1.text === 'one' && r2.text === 'two');

    // ---------- a held message is still yours ----------
    const held = q2.state;   // ['one', 'two']
    ok('a held message can be rewritten before it is ever said',
        editQueued(held, 0, 'ONE instead').state.queued.join('|') === 'ONE instead|two');
    ok('…emptying it drops the line', editQueued(held, 1, '   ').state.queued.join('|') === 'one');
    ok('…rewriting it to what it already says changes nothing',
        editQueued(held, 0, 'one').changed === false);
    ok('…and an index that is not there is a no-op, not the wrong message',
        editQueued(held, 7, 'x').changed === false && editQueued(held, -1, 'x').changed === false);
    const taken = takeQueued(held, 0);
    ok('taking one out returns its words and leaves the rest',
        taken.text === 'one' && taken.state.queued.join('|') === 'two');
    ok('…and taking one that is not there returns nothing',
        takeQueued(held, 9).text === undefined);
    ok('a turn records when it started, and what the meter read then',
        first.state.turnStartedAt === NOW && first.state.turnTokensAt === 0);
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

        // The active project rides on the state because the stamp cannot be
        // written until the id arrives, and by then the status bar may say
        // something else. The host reads it ITSELF rather than trusting six
        // call sites to attach it — a stamp that depends on every caller
        // remembering is one that stops being applied the day a seventh
        // appears.
        const started = newSessionState({
            id: 'c10', agentId: 'a', agentName: 'dev', cwd: 'D:/a/dev', now: NOW,
            projectId: 'prj_abc'
        });
        ok('a session remembers the project it was started in', started.projectId === 'prj_abc');
        ok('…and one started without an active project claims none', fresh().projectId === undefined);
        ok('‼️ the host fills it from the active project itself, not from its callers',
            /const projectId = init\.projectId \?\? this\.activeProjectId\(\);/.test(host));
        // ‼️ And the project context goes on EVERY spawn built here — first
        // start and resume alike, because it is not inherited across --resume
        // (measured: test/smoke_project_context.mjs).
        ok('…and the same spawn asks for that project\'s context file',
            /hostArgs\(\{[\s\S]{0,160}projectContextFile: this\.projectContextFile\(projectId, superpowers\)[\s\S]{0,20}\}\)/.test(host));
        // ‼️ K-22 — and the SAME spawn carries the resolved permission decision,
        // not the raw picker value: the flag that enforces bypass is chosen
        // from this, and choosing it anywhere else is how a card came to say
        // bypass while the process asked on every tool call.
        ok('‼️ K-22: the spawn is given the RESOLVED permission, not the request',
            /const permission = this\.resolvePermission\(init\.permissionMode \?\? '', init\.cwd\)/.test(host)
            && /hostArgs\(\{[\s\S]{0,120}permission,/.test(host));
    }
    ok('…the model and the permission mode it really started in',
        s.model === 'claude-haiku-4-5' && s.permissionMode === 'manual');
    ok('…and the session becomes usable', s.status === 'idle');

    // ‼️ `thinking_tokens` IS NOT A CONTEXT ESTIMATE — it was read as one, and
    // that is why the ctx figure collapsed mid-turn. The CLI's own words for the
    // event (out of the 2.1.220 binary): "Live thinking-token estimate …
    // estimated_tokens is the running total for the current thinking block". It
    // restarts near zero on every block and is emitted constantly — twelve times
    // in one short measured turn — so a session truly holding 225k was shown
    // dropping to ~100 and climbing 100 → 200 → 500, over and over.
    s = { ...s, contextTokens: 225000 };
    s = reduce(s, { type: 'system', subtype: 'thinking_tokens', estimated_tokens: 100 });
    ok('a thinking-token estimate never touches the context figure', s.contextTokens === 225000);
    s = reduce(s, { type: 'system', subtype: 'thinking_tokens', estimated_tokens: 512 });
    ok('…however many of them arrive', s.contextTokens === 225000);
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
    // A turn is the unit you think in, so it closes with its own numbers:
    // how long it took, what it spent, what it cost.
    {
        const started = { ...fresh(), status: 'working', turnStartedAt: NOW, turnTokensAt: 1000, tokens: 5200 };
        const done = reduce(started, {
            type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.031
        }, NOW + 12400);
        const line = done.messages[done.messages.length - 1];
        ok('the turn closes with its duration, tokens and cost',
            line.role === 'result' && line.ms === 12400 && line.tokens === 4200 && line.cost === 0.031);
        ok('…and the next turn starts its own count',
            done.turnStartedAt === undefined && done.turnTokensAt === undefined);
        const noMeter = reduce({ ...fresh(), status: 'working' }, {
            type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0
        }, NOW + 5);
        const bare = noMeter.messages[noMeter.messages.length - 1];
        ok('…a turn nobody timed reports nothing rather than a made-up zero',
            bare.ms === undefined && bare.tokens === undefined);

        // ‼️ …and the figures OUTLIVE the turn. The strip above the composer went
        // blank the instant the numbers became final, which is the one moment
        // they were worth reading: lastTurn keeps them until the next prompt.
        ok('the finished turn is kept, with the CLI\'s own cost',
            done.lastTurn && done.lastTurn.ms === 12400 && done.lastTurn.tokens === 4200
            && done.lastTurn.cost === 0.031 && done.lastTurn.outcome === 'done'
            && done.lastTurn.endedAt === NOW + 12400);
        ok('an interrupted turn says so instead of reading as finished',
            reduce({ ...fresh(), status: 'working', turnStartedAt: NOW }, {
                type: 'result', subtype: 'error_during_execution', is_error: true, total_cost_usd: 0.002
            }, NOW + 900).lastTurn.outcome === 'interrupted');
        ok('a failed turn says that',
            reduce({ ...fresh(), status: 'working', turnStartedAt: NOW }, {
                type: 'result', subtype: 'error_max_turns', is_error: true, total_cost_usd: 0
            }, NOW + 900).lastTurn.outcome === 'failed');
        // ‼️ X-26 — AND IT PRINTS THE ENGINE'S OWN WORDS WHEN IT SAID ANY.
        // This line used to hardcode "turn interrupted" and drop `error` on the
        // floor, so a turn that died on a refusal reached the reader as three
        // words naming a cause that had not happened — measured, verbatim:
        //   invalid model selection (--model "gemini-3.5-flash" --effort ""):
        //   --model gemini-3.5-flash requires --effort (available: low, …)
        // The fix for that trap is elsewhere (core/agy.ts, core/models.ts); what
        // is pinned here is that a refusal can never be silent again, whichever
        // engine refuses and for whatever reason nobody has met yet.
        const refused = reduce({ ...fresh(), status: 'working', turnStartedAt: NOW }, {
            type: 'result', subtype: 'error_during_execution', is_error: true,
            error: 'invalid model selection (--model "gemini-3.5-flash" --effort "")',
            result: 'invalid model selection (--model "gemini-3.5-flash" --effort "")'
        }, NOW + 7400);
        const said = refused.messages[refused.messages.length - 1];
        ok('‼️ a refusal reaches the reader in the engine\'s own words',
            /requires|invalid model selection/.test(said.text) && said.isError === true);
        ok('…and the outcome is still the one the subtype states',
            refused.lastTurn.outcome === 'interrupted');
        // The fixed words stay as the FALLBACK — for the engines and the cases
        // that genuinely say nothing, a bare row would be worse.
        ok('an engine that says nothing still gets the honest fallback',
            reduce({ ...fresh(), status: 'working', turnStartedAt: NOW }, {
                type: 'result', subtype: 'error_during_execution', is_error: true, total_cost_usd: 0
            }, NOW + 900).messages.slice(-1)[0].text === 'turn interrupted');
        // your next prompt is what retires it — the strip is about the PREVIOUS
        // turn only while the ball is yours
        ok('the next prompt clears the finished turn',
            acceptUserText(done, 'and now this', NOW + 20000).state.lastTurn === undefined);
        // a message steered INTO a running turn is not a new turn
        const steered = acceptUserText({ ...done, status: 'working' }, 'also', NOW + 21000).state;
        ok('steering a running turn does not touch it', steered.lastTurn === done.lastTurn);
    }
    // ---------- what the running turn is thinking WITH ----------
    // ‼️ `model` AND `effort` DESCRIBE THE NEXT TURN, NOT THIS ONE. Both switches
    // are accepted mid-conversation and both take effect one turn later, so a
    // strip that says "this turn" cannot read the live pickers — it would
    // mislabel the turn you are watching the moment you touch either.
    {
        const base = { ...fresh(), model: 'claude-sonnet-4-5', effort: 'medium' };
        const started = acceptUserText(base, 'go', NOW).state;
        ok('a turn remembers the model and effort it STARTED on',
            started.turnModel === 'claude-sonnet-4-5' && started.turnEffort === 'medium');

        // a confirmed switch mid-turn moves the picker and leaves the turn alone
        const switched = { ...started, model: 'claude-opus-5', effort: 'xhigh' };
        ok('…and a switch made while it runs does not rewrite it',
            switched.turnModel === 'claude-sonnet-4-5' && switched.turnEffort === 'medium');

        // …but system:init is a CORRECTION, not a switch: it is the CLI naming
        // the model we only had an alias (or nothing) for
        const aliased = acceptUserText({ ...fresh(), model: 'sonnet' }, 'go', NOW).state;
        const named = reduce(aliased, {
            type: 'system', subtype: 'init', model: 'claude-sonnet-4-5-20250929'
        }, NOW + 20);
        ok('system:init names the model for the turn already running',
            named.turnModel === 'claude-sonnet-4-5-20250929' && named.model === 'claude-sonnet-4-5-20250929');
        const idleInit = reduce(fresh(), {
            type: 'system', subtype: 'init', model: 'claude-sonnet-4-5-20250929'
        }, NOW + 20);
        ok('…and invents no turn to attach it to when none is running',
            idleInit.turnModel === undefined);

        // the finished turn keeps it too, so the strip does not lose it the
        // instant the turn ends (and a later switch cannot backdate it)
        const closed = reduce(switched, {
            type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.01
        }, NOW + 3000);
        ok('the finished turn is remembered with what IT ran on',
            closed.lastTurn.model === 'claude-sonnet-4-5' && closed.lastTurn.effort === 'medium'
            && closed.turnModel === undefined && closed.turnEffort === undefined);

        // a HELD message becomes a turn of its own, so it takes its own snapshot
        const held = acceptUserText({ ...closed, status: 'working' }, 'next', NOW + 3100, true).state;
        const released = shiftQueued({ ...held, status: 'idle', model: 'claude-opus-5', effort: 'xhigh' }, NOW + 4000).state;
        ok('a released held message starts a turn on the CURRENT model, not the old one',
            released.turnModel === 'claude-opus-5' && released.turnEffort === 'xhigh');
    }
    // ---------- …and where that pair really comes from: the CLI ----------
    // ‼️ THE PICKERS CANNOT ANSWER IT. Left on "Default" — the normal way to
    // start a session — model and effort are empty strings, because "Default"
    // means "pass no flag"; the turn still runs on a real model at a real
    // effort, resolved from the settings chain. So the strip asked the CLI:
    // `get_settings` answers `applied:{model, effort}`, and effort is null on a
    // model that has no effort levels. Measured against the real CLI on
    // 2026-07-31 (2.1.220): no flags → "xhigh" (from ~/.claude/settings.json),
    // --effort low → "low", haiku → null.
    {
        resetIds();
        // nothing chosen anywhere — exactly the case that used to show nothing
        const blank = newSessionState({
            id: 'c2', agentId: 'a', agentName: 'dev', cwd: 'D:/a/dev', now: NOW
        });
        const running = { ...acceptUserText(blank, 'go', NOW).state,
            pendingSettings: { requestId: 'settings-1', turnStartedAt: NOW } };
        ok('a turn with nothing chosen starts out saying nothing',
            !running.turnModel && !running.turnEffort);
        const answered = reduce(running, {
            type: 'control_response',
            response: {
                subtype: 'success', request_id: 'settings-1',
                response: { applied: { model: 'claude-opus-5', effort: 'xhigh' } }
            }
        }, NOW + 30);
        ok('…and the CLI\'s own answer names it, with no choice ever made',
            answered.turnModel === 'claude-opus-5' && answered.turnEffort === 'xhigh');
        ok('…which is remembered as what is IN FORCE, for the next turn to start from',
            answered.applied.model === 'claude-opus-5' && answered.applied.effort === 'xhigh'
            && answered.pendingSettings === undefined);
        ok('…and it is bookkeeping, not conversation',
            answered.messages.length === running.messages.length);
        const next = acceptUserText(
            reduce(answered, { type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.01 },
                NOW + 100),
            'again', NOW + 200).state;
        ok('the next turn starts from what the CLI last said, not from an empty picker',
            next.turnModel === 'claude-opus-5' && next.turnEffort === 'xhigh');

        // a model with no effort levels: the CLI answers null, and null is not
        // "unknown" — it is the answer, so the strip shows a model and no effort
        const haiku = reduce(
            { ...running, pendingSettings: { requestId: 'settings-2', turnStartedAt: NOW } },
            {
                type: 'control_response',
                response: {
                    subtype: 'success', request_id: 'settings-2',
                    response: { applied: { model: 'claude-haiku-4-5-20251001', effort: null } }
                }
            }, NOW + 30);
        ok('a model with no effort levels reports one honestly: none',
            haiku.turnModel === 'claude-haiku-4-5-20251001' && haiku.turnEffort === ''
            && haiku.applied.effort === '');

        // the probe is tagged with the turn it was asked for: a late answer
        // must not relabel the turn that has started since
        const late = reduce(
            { ...answered, turnStartedAt: NOW + 5000,
                pendingSettings: { requestId: 'settings-3', turnStartedAt: NOW } },
            {
                type: 'control_response',
                response: {
                    subtype: 'success', request_id: 'settings-3',
                    response: { applied: { model: 'claude-sonnet-5', effort: 'low' } }
                }
            }, NOW + 5100);
        ok('an answer about an older turn does not relabel the one running now',
            late.turnModel === 'claude-opus-5' && late.turnEffort === 'xhigh'
            && late.applied.model === 'claude-sonnet-5');

        // an older CLI does not know the subtype: it says so, and nothing here
        // may change or be shown for a question the user never asked
        const refused = reduce(
            { ...answered, pendingSettings: { requestId: 'settings-4', turnStartedAt: NOW } },
            {
                type: 'control_response',
                response: { subtype: 'error', request_id: 'settings-4', error: 'unknown subtype' }
            }, NOW + 40);
        ok('a CLI that cannot answer changes nothing and says nothing',
            refused.pendingSettings === undefined
            && refused.turnModel === 'claude-opus-5' && refused.turnEffort === 'xhigh'
            && refused.messages.length === answered.messages.length);

        // …and the host is what asks, at the two moments it can be asked for
        const host = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'consolehost.ts'), 'utf8');
        ok('the host asks the CLI what is in force, as a control request',
            /controlLine\(requestId, 'get_settings'\)/.test(host));
        ok('…at the start of the session and at the start of every turn',
            /this\.askSettings\(id\);/.test(host)
            && /this\.askSettings\(id, h\.state\.turnStartedAt\)/.test(host));
    }
    // ---------- what the RUNNING turn is spending ----------
    // The CLI says what a turn cost only when the turn ends, so a strip that
    // wants to answer "what is this one costing me?" while you watch it has to
    // price the tokens itself — which means the turn keeps its usage by KIND,
    // not just a total (cache reads are a tenth of the price of fresh input).
    {
        const started = acceptUserText(fresh(), 'go', NOW).state;
        ok('a turn starts its own meter at zero',
            started.turnUsage && started.turnUsage.input === 0 && started.turnUsage.cacheRead === 0);
        const one = reduce(started, {
            type: 'assistant',
            message: {
                content: [{ type: 'text', text: 'ok' }],
                usage: {
                    input_tokens: 100, output_tokens: 40,
                    cache_read_input_tokens: 9000, cache_creation_input_tokens: 800
                }
            }
        });
        ok('…and keeps the breakdown, not just the total',
            one.turnUsage.input === 100 && one.turnUsage.output === 40
            && one.turnUsage.cacheRead === 9000 && one.turnUsage.cacheWrite === 800);
        ok('…while the session total still counts every token once',
            one.tokens === 9940 && one.contextTokens === 9940);
        const two = reduce(one, {
            type: 'assistant',
            message: { content: [{ type: 'text', text: 'more' }], usage: { input_tokens: 60, output_tokens: 10 } }
        });
        ok('…a second reply adds to the same turn', two.turnUsage.input === 160 && two.turnUsage.output === 50);
        const closed = reduce(two, { type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.02 });
        ok('…and the estimate is dropped the moment the CLI reports the real figure',
            closed.turnUsage === undefined);
        const next = shiftQueued({ ...closed, status: 'idle', queued: ['again'] }, NOW + 9);
        ok('…the next turn starts from zero again, not from the last one',
            next.state.turnUsage.input === 0 && next.state.turnUsage.cacheRead === 0);
    }

    // ---------- ‼️ ONE MESSAGE, SEVERAL LINES, ONE USAGE ----------
    //
    // The CLI emits a line per CONTENT BLOCK and repeats the whole message's
    // usage on each of them. Measured against the real binary (haiku,
    // 2026-08-01): one reply arrived as a `thinking` line and a `tool_use` line,
    // both carrying in=10 out=3 cr=15642 cw=6961. Counting each line inflated
    // the session total — on a real transcript 55.1M against a true 27.99M
    // (1.97×), while the sessions table showed the honest figure for the very
    // same conversation. The repeats are always consecutive (403 assistant lines
    // / 194 messages, zero exceptions), which is why one remembered key is
    // enough. ‼️ The stream spells it `request_id`; the written transcript
    // spells the same field `requestId`.
    {
        const usage = {
            input_tokens: 10, output_tokens: 3,
            cache_read_input_tokens: 15642, cache_creation_input_tokens: 6961
        };
        const line = (blocks) => ({
            type: 'assistant', request_id: 'req_1',
            message: { id: 'msg_A', content: blocks, usage }
        });
        let m = acceptUserText(fresh(), 'go', NOW).state;
        m = reduce(m, line([{ type: 'thinking', thinking: '…' }]));
        const afterFirst = m.tokens;
        ok('the first line of a message is counted', afterFirst === 22616);
        m = reduce(m, line([{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'a.ts' } }]));
        ok('‼️ the same usage arriving again is NOT counted twice', m.tokens === afterFirst);
        ok('…but the line itself still joins the conversation — it is a real tool call',
            m.messages.some(x => x.role === 'tool' && x.tool && x.tool.name === 'Read'));
        // A genuinely new message pays again, even with an identical usage block.
        m = reduce(m, {
            type: 'assistant', request_id: 'req_2',
            message: { id: 'msg_B', content: [{ type: 'text', text: 'done' }], usage }
        });
        ok('…and the next message is counted on its own', m.tokens === afterFirst * 2);
        // Older CLIs, and any line without the pair, must not be silently
        // dropped: unidentifiable is not the same as duplicate.
        const anon = { type: 'assistant', message: { content: [{ type: 'text', text: 'x' }], usage } };
        const a1 = reduce(m, anon);
        ok('…a line carrying no id is counted rather than guessed at',
            reduce(a1, anon).tokens === m.tokens + 22616 * 2);
    }

    // ---------- ctx is the WINDOW, and only a real measurement moves it ----------
    {
        const base = acceptUserText(fresh(), 'go', NOW).state;
        const ctx = reduce(base, {
            type: 'assistant', request_id: 'r1',
            message: {
                id: 'm1', content: [{ type: 'text', text: 'hi' }],
                usage: {
                    input_tokens: 100, output_tokens: 40,
                    cache_read_input_tokens: 200000, cache_creation_input_tokens: 800
                }
            }
        });
        ok('ctx is what the window held — the same contextAfter() the sessions tables use',
            ctx.contextTokens === 200940);
        // ‼️ A SUB-AGENT'S WINDOW IS NOT THIS CONVERSATION'S. Its messages come
        // down the same pipe marked with `parent_tool_use_id`, and they start a
        // context of their own at a few hundred tokens. Its cost is real and is
        // counted; letting it write the ctx figure is what made a 200k session
        // read ~300 for the length of the sub-agent and snap back afterwards.
        const sub = reduce(ctx, {
            type: 'assistant', request_id: 'r2', parent_tool_use_id: 'toolu_9',
            message: {
                id: 'm2', content: [{ type: 'text', text: 'working' }],
                usage: { input_tokens: 300, output_tokens: 20 }
            }
        });
        ok('a sub-agent never overwrites the context figure', sub.contextTokens === 200940);
        ok('…but what it spends is still spent', sub.tokens === ctx.tokens + 320);
        // A synthetic row (an interrupt notice, a cancelled turn) carries a
        // usage block of all zeros. Zero means "not measured", not "empty".
        const zero = reduce(sub, {
            type: 'assistant', request_id: 'r3',
            message: {
                id: 'm3', content: [{ type: 'text', text: 'x' }],
                usage: { input_tokens: 0, output_tokens: 0 }
            }
        });
        ok('…and a zero-usage row leaves the last real figure standing',
            zero.contextTokens === 200940);
    }
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
    // S-30 — what goes in is `carriedMessages`: the transcript read OR what the
    // card was already showing, whichever is richer (ConsoleHost.resumeMessages,
    // driven for real in test_console_history.js). Still messages, still never
    // stdin — that half of the contract is what this line guards.
    ok('the history is seeded as MESSAGES, never written to stdin (it costs nothing)',
        /messages: carriedMessages/.test(host) && !/write\(id, [^)]*history/.test(host));
    const panel2 = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'consolePanel.ts'), 'utf8');
    const ext2 = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('both ways of resuming into the Console carry it',
        /history: this\.deps\.history\(sessionId\)/.test(panel2)
        && /history: consoleHistory\(s\.sessionId\)/.test(ext2));
    ok('external sessions are resolved and their real transcript is backfilled too',
        /\[\.\.\.index\.all\(\), \.\.\.index\.external\(\)\]/.test(ext2)
        && /parseCliViewer\(raw, file, pricing\)/.test(ext2));
    ok('a resume uses the transcript engine instead of forcing Claude',
        /const engine = \(s\.source/.test(ext2)
        && /engine,\s*\n\s*model: s\.models/.test(ext2)
        && !/every row this command can reach is a Claude session/.test(ext2));
    ok('Console-hosted Antigravity dialogue is persisted in a readable transcript',
        /farmConsoleTranscript\(s\)/.test(ext2)
        && /external-console-transcripts/.test(ext2)
        && /scheduleExternalConsoleTranscript\(id\)/.test(ext2));
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
    // the new-session branch opens with the pinned-agent name OR the picker
    const split = controls.indexOf(': `${pinnedAgentHtml()');
    const liveRow = split > 0 ? controls.slice(0, split) : '';
    // A running session shows only the controls that DO something — and the ONE
    // thing that genuinely cannot change is the agent, because that is the
    // folder the process was started in.
    ok('a running session gets no agent box (the folder is genuinely fixed)',
        liveRow.length > 100 && !/c-agent"/.test(liveRow));
    ok('…it shows the agent as a plain status line instead', /class="fixed"/.test(js));
    // ‼️ THE OTHER THREE ARE ALL LIVE, and the parity is the point: a session
    // opened from an agent row must not be able to change LESS than one opened
    // from the composer. `/model`, `/effort` and the permission mode are all
    // control requests the CLI really accepts mid-conversation (measured).
    ok('…but the model is a live picker, because the CLI takes set_model',
        /c-model-live/.test(liveRow) && /type: 'setModel'/.test(js));
    ok('…and so is the effort, because /effort is apply_flag_settings',
        /c-effort-live/.test(liveRow) && /type: 'setEffort'/.test(js));
    ok('…alongside the permission mode', /id="c-perm"/.test(liveRow));
    // The composer's two modes offer the same three dimensions, so nothing is
    // reachable from one entry point and missing from the other.
    {
        const newRow = split > 0 ? controls.slice(split) : '';
        const dims = row => ['model', 'effort', 'perm'].filter(d => new RegExp(`c-${d}`).test(row)).join(',');
        ok('both composer modes offer model · effort · permissions',
            dims(liveRow) === 'model,effort,perm' && dims(newRow) === 'model,effort,perm');
    }
    ok('new-session mode is the only place the agent is picked',
        split > 0 && controls.indexOf('Choose an agent…') > split);
    ok('starting without an agent focuses the picker instead of swallowing the message',
        /if \(!st\.agentId\)/.test(js));
    ok('an agent row can open the Console with that agent preselected',
        /presetAgent/.test(js));
    // ‼️ …and PINNED, which is a different thing: preselected is a picker with a
    // value in it, pinned is the name and no picker. ▶ → In the Console used to
    // spawn on the spot, so the composer went straight to its running shape —
    // agent fixed (right) and no project box at all (wrong: the project can only
    // be chosen before the first prompt). Nothing is spawned now.
    ok('a composer opened from an agent fixes it instead of offering a picker',
        /function pinnedAgentHtml\(\)/.test(js)
        && /const id = DATA\.pinnedAgent \|\| ''/.test(js));
    ok('…and the pin is never a trap — it can be handed back',
        /id="c-unpin"/.test(js) && /type: 'unpinAgent'/.test(js));
    ok('…and it rebuilds the shell, because it decides which markup is drawn',
        /\$\{DATA\.pinnedAgent \|\| ''\}\$\{composerShape\}`;/.test(js));
    ok('…while the project box stays, which is the point of not spawning',
        (() => {
            const c = js.slice(js.indexOf('const controls = s'), js.indexOf("getElementById('app').innerHTML"));
            const newRow = c.slice(c.indexOf(': `${pinnedAgentHtml()'));
            return /id="c-proj"/.test(newRow) && /pinnedAgentHtml\(\) \|\|/.test(newRow);
        })());
    ok('a new session starts under NO project until it is chosen',
        /It starts at No project every time/.test(js));
    ok('a session row carries its own title, not just the agent name',
        /class="t2"/.test(js));
    // Right-click must reach VS Code's OWN menu (Copy/Paste and the session's
    // actions together) — a `contextmenu` listener that opened a rename box
    // straight away is exactly what this forbids.
    //
    // ‼️ NOT ONE listener is allowed in this file any more. The saved prompts
    // used to hang their right-click off the SEND buttons from here; since M-24
    // the gesture belongs to the shared picker (media/afSnippets.js) and this
    // page only names the trigger. So the count is back to zero — and the one
    // allowed listener is checked where it now lives, below.
    const ctxHooks = (js.match(/addEventListener\('contextmenu'/g) || []).length;
    ok('…and right-click hands the row to VS Code\'s context menu, not to a rename box',
        /data-vscode-context/.test(js) && !/type: 'rename'/.test(js)
        && ctxHooks === 0);
    ok('…keeping the default Copy/Paste items in it',
        /preventDefaultContextMenuItems: false/.test(js));

    // ---- S-11 · M-24: the saved prompts, hung off the buttons that send ----
    // ‼️ THE PICKER IS SHARED NOW. The window, its filter, its file dialog and
    // the paste rule live in media/afSnippets.js, because the Tasks form asks
    // the same question in four more boxes and a second copy would be a second
    // thing to get wrong. What stays this page's own business is WHICH triggers
    // it hangs off and whether they say so — everything below that is checked
    // against the component.
    const snip = fs.readFileSync(path.join(__dirname, '..', 'media', 'afSnippets.js'), 'utf8');
    ok('the picker is on EVERY sending button, not just one of them',
        /wireSnipMenu\('c-send'\)/.test(js) && /wireSnipMenu\('c-hold'\)/.test(js));
    ok('…and each of them lands its pick in the composer\'s own box',
        /wireSnipMenu = id => window\.AFSnippets\.bind\(id, 'c-text'\)/.test(js));
    ok('‼️ …and both of them say so, or the menu is a feature nobody finds',
        /const HINT = 'right-click for your saved prompts'/.test(snip)
        && /const SNIP_HINT = window\.AFSnippets\.HINT/.test(js)
        && (js.match(/SNIP_HINT/g) || []).length >= 3);
    // ‼️ …and exactly ONE contextmenu listener in the whole feature, in the
    // component's bind(). Those triggers are buttons and boxes, not rows — they
    // publish no `data-vscode-context`, so nothing is taken from VS Code's menu.
    ok('‼️ the right-click itself is the component\'s, and there is one of it',
        (snip.match(/addEventListener\('contextmenu'/g) || []).length === 1
        && /function bind\(trigger, into\)/.test(snip));
    ok('‼️ choosing a snippet PASTES it — nothing is sent behind your back',
        /function use\(text\)/.test(snip)
        && /window\.AFTextTools\.insert\(box, text\)/.test(snip)
        && !/function use\(text\)[\s\S]{0,600}postMessage\(\{ type: 'send'/.test(snip));
    // …and the page hears about it the way it hears about a keystroke, so no
    // page needs a callback to keep its own draft in step.
    ok('…and the box is told, with the event every listener already watches',
        /dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/.test(snip));
    ok('the list is read when the menu opens, never carried on the payload',
        /function open\(where\) \{[\s\S]{0,300}post\(\{ type: 'promptSnippets' \}\)/.test(snip)
        && !/DATA\.snippets/.test(js));
    // ‼️ U-54: the rows in this picker carry NO hover. The window is already
    // open — the reader asked for it — so a panel opening again on every row
    // swept past covers the neighbouring prompts being compared against. The
    // hover rule in docs/CONVENTIONS.md is about a row you merely pass over.
    ok('‼️ a prompt row in the open picker carries no hover, rich or native',
        /class="af-snipitem" data-snip=/.test(snip)
        && !/AFTip\.wrap\([\s\S]{0,120}af-snipitem/.test(snip)
        && !/class="af-snipitem"[^>]*title=/.test(snip));
    ok('an empty list and a missing file are two different sentences',
        /No blocks in that file yet/.test(snip) && /state\.error/.test(snip));
    ok('…and either way the file itself is one click away',
        /type: 'openPromptSnippets'/.test(snip));
    ok('‼️ choosing the file is the OS file dialog, not a trip to a settings page',
        /type: 'pickPromptSnippets'/.test(snip)
        && /Choose a file…/.test(snip) && /Change file…/.test(snip));
    // ‼️ THE WINDOW DOES NOT LIVE IN THE PAGE. It hangs off <body>, because
    // every page redraws its own app div — a host push repainting the Tasks
    // form under an open picker is exactly the case that made this shared.
    ok('‼️ the picker outlives the page render that happens under it',
        /const body = document\.body;[\s\S]{0,240}body\.appendChild\(host\)/.test(snip)
        && !/id="c-snip"/.test(js));
    ok('…on the hosted rows and the resumable ones alike',
        /webviewSection: 'afConsoleSession'/.test(js) && /webviewSection: 'afConsoleResumable'/.test(js));
}

// ---------- the card's own menu: end it where you are looking at it ----------
// With eight sessions in the left panel, ending one meant selecting it first
// (which changes the conversation you are reading) and then finding the button
// under the box. The card carries the same three actions — and carries its
// STATE with them, so the menu can grey out what cannot be done to it yet.
{
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const cmd = id => pkg.contributes.commands.find(c => c.command === id);
    const web = pkg.contributes.menus['webview/context'] || [];
    const onCard = id => web.some(m => m.command === id && m.when === "webviewSection == 'afConsoleSession'");
    const js = fs.readFileSync(path.join(__dirname, '..', 'media', 'console.js'), 'utf8');
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');

    ok('a card can end its session from the right-click menu',
        !!cmd('agentfarm.consoleEndSession') && onCard('agentfarm.consoleEndSession'));
    ok('…interrupt the turn it is in the middle of',
        !!cmd('agentfarm.consoleInterruptTurn') && onCard('agentfarm.consoleInterruptTurn'));
    ok('…and be removed from the list once it has ended',
        !!cmd('agentfarm.consoleForgetSession') && onCard('agentfarm.consoleForgetSession'));
    // Greyed, not hidden: an item that appears only after the session ends
    // changes the menu's shape under the pointer, and never teaches you that
    // removing is what comes AFTER ending.
    ok('Remove from list is greyed until the session has really ended',
        cmd('agentfarm.consoleForgetSession').enablement === 'afConsoleEnded');
    ok('…End session is greyed once it has', cmd('agentfarm.consoleEndSession').enablement === 'afConsoleLive');
    ok('…and Interrupt only while a turn is running',
        cmd('agentfarm.consoleInterruptTurn').enablement === 'afConsoleWorking');
    ok('the state those clauses read comes from the card itself',
        /afConsoleLive: !dead/.test(js) && /afConsoleEnded: dead/.test(js)
        && /afConsoleWorking: s\.status === 'working'/.test(js));
    ok('…as does the process they act on', /hostId: s\.id/.test(js));
    // ‼️ S-29 — the fifth is Continue This Session Here, and it is the reason
    // the card is kept at all: an ended session stays so it can be READ and so
    // it is under your hand when you want it back, and only the reading half was
    // reachable from the card. It sits FIRST because it is the one thing you do
    // to a dead card; the rest apply to a live one.
    ok('the actions sit in their own group, under the naming ones',
        web.filter(m => /^2_run@/.test(m.group || '')).length === 5);
    ok('‼️ an ended card can be continued from its own menu',
        !!cmd('agentfarm.consoleResumeSession')
        && onCard('agentfarm.consoleResumeSession')
        && cmd('agentfarm.consoleResumeSession').enablement === 'afConsoleEnded');
    ok('…and it is the first thing offered on a card that has ended',
        web.some(m => m.command === 'agentfarm.consoleResumeSession' && m.group === '2_run@0'));
    ok('…and it resumes rather than starting something new',
        /registerCommand\('agentfarm\.consoleResumeSession'[\s\S]{0,1600}resume: s\.sessionId/.test(ext));
    // ‼️ End and Remove are separate on purpose — ending leaves the card
    // readable — but the ordinary case is both, and it used to cost two
    // right-clicks with a repaint between them that moves the card you are
    // pointing at.
    ok('…and one of them does both halves at once',
        web.some(m => m.command === 'agentfarm.consoleEndAndRemove'));
    // The shelf is what the filter is FOR: pinning is how a session gets onto
    // it, so it belongs on the card you are looking at — running or ended, in
    // the hosted list or the resumable one.
    ok('any card can be put on the shelf from its own menu',
        web.some(m => m.command === 'agentfarm.pinSession'
            && /afConsole\(Session\|Resumable\)/.test(m.when)));
    // The whole point of a right-click menu is not having to go anywhere else.
    ok('…labelled from it', web.some(m => m.command === 'agentfarm.tagSession'
        && /afConsole\(Session\|Resumable\)/.test(m.when)));
    ok('…and its id copied, which is what the filter searches',
        web.some(m => m.command === 'agentfarm.copySessionId'
            && /afConsole\(Session\|Resumable\)/.test(m.when))
        && ext.includes("registerCommand('agentfarm.copySessionId'"));
    // A lane row and a live card are sessions too — same menu, same reach.
    for (const c of ['agentfarm.pinSession', 'agentfarm.tagSession',
        'agentfarm.copySessionId', 'agentfarm.resumeInConsole']) {
        ok(`the Live Timeline offers ${c.replace('agentfarm.', '')} as well`,
            web.some(m => m.command === c && m.when === "webviewSection == 'afTimelineSession'"));
    }
    // ‼️ Pinning WORKED and showed nothing: the trees were told, the pages
    // were not, so the star appeared only when something else forced a
    // repaint — which reads as "sometimes it works".
    ok('a mark repaints every open surface, not just the trees',
        /const saveMarks = [\s\S]{0,1400}ConsolePanel\.refreshIfOpen\(\)/.test(ext)
        && /const saveMarks = [\s\S]{0,1400}TimelinePanel\.refreshIfOpen\(\)/.test(ext));
    ok('…and the timeline can be redrawn without being opened',
        /static refreshIfOpen\(\): void \{\s*TimelinePanel\.current\?\.refresh\(\);/.test(
            fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'timeline.ts'), 'utf8')));
    // `enablement` disables a MENU ITEM; it does not stop the command being run
    // another way, so the handler still refuses to remove a live session.
    ok('removing a session that is still running is refused, with the order to follow',
        /still running — end it first/.test(ext));
    ok('…and each action names the row it was invoked on', /const consoleRowId = /.test(ext));
    for (const c of ['consoleEndSession', 'consoleForgetSession', 'consoleInterruptTurn']) {
        ok(`agentfarm.${c} is registered`, ext.includes(`registerCommand('agentfarm.${c}'`));
    }
    // The bridge already carries these as ops — the menu is a new way in, not a
    // new capability, so nothing new has to be registered there.
    ok('…and an agent can already do all three over the bridge',
        ext.includes("op: 'console.close'") && ext.includes("op: 'console.interrupt'")
        && /args\.forget === true/.test(ext));
}

// ---------- ‼️ a conversation that is running, ours, and unreachable ----------
// An extension reload is not the clean shutdown `dispose()` assumes: the new
// extension host starts with an empty session map while the old `claude` is
// still alive, still holding its entry in the CLI registry. Everything
// downstream then behaves correctly and traps you — the timeline draws it as
// running (it is), the resume is refused (it must be), and the shelf keeps
// offering "continue" on a conversation that can never be continued.
{
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'consolePanel.ts'), 'utf8');
    const host = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'consolehost.ts'), 'utf8');

    ok('a leftover of our own is recognised as such', /const leftoverOwner = /.test(ext));
    ok('…only for a session THIS extension\'s Console started',
        /consoleIds\.includes\(sessionId\)/.test(ext));
    ok('…only when this window is not the one hosting it', /hostedHere/.test(ext));
    // ‼️ "A leftover of ours" and "the conversation the OTHER window is in"
    // look identical from here — both sdk-cli, both ours, neither hosted here.
    // Offering to end the second would kill a conversation somebody is having,
    // so each window writes down what it is reading, under its own pid.
    ok('…and never a session another live window is reading',
        /const readElsewhere = /.test(ext) && /if \(readElsewhere\(sessionId\)\) \{ return undefined; \}/.test(ext));
    ok('…a claim that dies with the window that made it',
        /console-hosting\.json/.test(ext) && /if \(k !== me && !pidAlive\(Number\(k\)\)\) \{ delete map\[k\]; \}/.test(ext));
    ok('…and only when a program holds it, never somebody\'s terminal',
        /owner\.entrypoint !== 'sdk-cli'/.test(ext));
    ok('the way out is offered, never taken silently — it stops a real process',
        /End it and continue here/.test(panel) && /End it and continue here/.test(ext));
    ok('…from the panel AND from the side-panel resume',
        /leftoverOwner\(s\.sessionId\)/.test(ext) && /this\.deps\.leftoverOwner\(sessionId\)/.test(panel));
    // Resuming into a process that is still dying would put two of them on one
    // transcript — the very thing the ownership rule exists to prevent.
    ok('ending it waits until the session is really free',
        /const endLeftover = /.test(ext) && /if \(!ownerOf\(readCliSessions\(claudeDir\(\)\), sessionId\)\) \{ return true; \}/.test(ext));
    ok('…and says so plainly when it is not', /still holding that session/.test(panel));
    // The child we hold is the shell wrapper; the CLI's registry names the
    // process the session is actually about.
    // ‼️ `h.child?.pid` — the `?` is the second engine, not sloppiness. A
    // per-turn engine has NO process between turns and is perfectly alive
    // (see Hosted.child), so every step of ending a session has to tolerate
    // there being nothing to end.
    // ‼️ S-29 (reopened) — the lookup and the two kills moved INTO `reap`, which
    // runs a tick after the card has already turned (spawning is what the user
    // was waiting on). What must still be true is that the registered process is
    // ended and not only our shell wrapper.
    ok('End session ends the process the CLI itself registered, not just our shell',
        /private ownerPid:/.test(host)
        && /const reap = \(\): void => \{[\s\S]{0,400}killTree\(child\);/.test(host)
        && /if \(pid && pid !== child\?\.pid\) \{ killPid\(pid\); \}/.test(host));
    ok('…and the extension gives it that lookup',
        /sid => ownerOf\(readCliSessions\(claudeDir\(\)\), sid\)\?\.pid/.test(ext));
}

// ---------- ‼️ the model can change mid-conversation ----------
// A terminal has always been able to: `/model` switches mid-session and the
// next turn answers with the new one. The panel used to say a running session
// "cannot change" its model — that was never a structural limit, only one we
// had not looked up. `set_model` is in the installed CLI's own set of handled
// control subtypes; it validates that `model` is a string and answers
// success/error. So the Console offers it, and the state machine below is
// built around the one awkward part of that reply: success carries NO payload.
{
    resetIds();
    const started = { ...fresh(), model: 'claude-opus-5' };
    const asked = { ...started, pendingModel: { requestId: 'model-1', model: 'claude-haiku-4-5' } };

    // the switch is NOT applied on the request — only when the CLI agrees
    ok('a model switch is pending until the CLI answers', asked.model === 'claude-opus-5');

    const ok1 = reduce(asked, {
        type: 'control_response',
        response: { subtype: 'success', request_id: 'model-1' }
    });
    ok('…an accepted switch becomes the session\'s model', ok1.model === 'claude-haiku-4-5');
    ok('…and stops being pending', ok1.pendingModel === undefined);
    ok('…and says so in the conversation, with when it applies',
        /model is now "claude-haiku-4-5" — from the next turn on/
            .test(ok1.messages[ok1.messages.length - 1].text));

    const bad = reduce(asked, {
        type: 'control_response',
        response: { subtype: 'error', request_id: 'model-1', error: 'unknown model' }
    });
    ok('a refused switch leaves the model alone', bad.model === 'claude-opus-5'
        && bad.pendingModel === undefined);
    ok('…and says why, as an error', bad.messages[bad.messages.length - 1].role === 'error'
        && /unknown model/.test(bad.messages[bad.messages.length - 1].text));

    // a reply to something else must not be mistaken for ours
    const other = reduce(asked, {
        type: 'control_response',
        response: { subtype: 'success', request_id: 'int-7' }
    });
    ok('another request\'s reply is not our switch',
        other.model === 'claude-opus-5' && !!other.pendingModel);

    const host = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'consolehost.ts'), 'utf8');
    ok('the host sends it as the CLI\'s own control request',
        /controlLine\(requestId, 'set_model', \{ model: model\.trim\(\) \}\)/.test(host));
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('…and an agent can do it too, over the bridge', ext.includes("op: 'console.setModel'"));

    // Everything the panel can do to a held message, an agent can do too
    // (_REF/agentfarm-dev.md: the bridge is part of the feature, not a follow-up)
    // ‼️ 2600, not 900 (B-12). `console.send`'s contract grew when it stopped
    // printing Claude's steering sentence for every engine and started naming
    // which ones can be spoken into mid-turn; a window that no longer reaches
    // `hold?` is an assertion that passes by not looking.
    ok('holding, and acting on what is held, reach the bridge in the same commit',
        ext.includes("op: 'console.queue'")
        && /console\.send[\s\S]{0,2600}hold\?/.test(ext)
        && /consoleHost\.send\(id, argStr\(args, 'text'\), args\.hold === true/.test(ext));
    // Attachments went the same way in the same commit — an agent can hand a
    // screenshot to a console session, not just the person at the keyboard.
    ok('attaching files reaches the bridge too',
        /console\.send[\s\S]{0,3000}attach\?/.test(ext)
        && /consoleHost\.send\(id, argStr\(args, 'text'\), args\.hold === true, attach\)/.test(ext));
    ok('…and console.send no longer promises the old "sent when the turn ends"',
        !/QUEUED and sent when that turn ends/.test(ext));
    // ‼️ B-12 — …NOR THE OPPOSITE PROMISE, WHICH IS THE ONE IT WAS MAKING. "While
    // a turn is running this goes INTO that turn" is true of a persistent engine
    // and false of the other four: their message is HELD, which the host has
    // always done correctly and the contract described as steering. A caller
    // reading it waited for a redirect that could never arrive.
    ok('‼️ …and says WHICH engines can be steered rather than claiming all of them can',
        /filter\(e => e\.liveControls\)/.test(ext)
        && /heldBecause/.test(ext)
        && !/While a turn is running this goes INTO that turn/.test(ext));
    const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'consolePanel.ts'), 'utf8');
    ok('the panel carries the same three verbs to the host',
        /case 'queueTake'/.test(panel) && /case 'queueSend'/.test(panel)
        && /host\.send\(str\('id'\), str\('text'\), msg\.hold === true, attachmentsOf\(msg\)\)/.test(panel));
}

// ---------- ‼️ a resumed session keeps what it spent ----------
// The composer's own line says "this session"; the strip above it says "this
// turn". Started empty, a resume made the first of those describe the PROCESS
// — so on the first turn back both printed the same growing number, and the
// conversation's real total was nowhere on the page.
{
    resetIds();
    const past = carriedTotals({
        cost: 0.42,
        usage: { input: 900, output: 4100, cacheWrite: 15000, cacheRead: 480000 },
        userTurns: 6,
        lastCtxTokens: 132000
    });
    ok('the totals are read off the index row the resume list already uses',
        past.tokens === 500000 && past.costUSD === 0.42 && past.turns === 6
        && past.contextTokens === 132000);
    ok('…and a row that spent nothing carries nothing, not undefined',
        carriedTotals({}).tokens === 0 && carriedTotals({}).turns === 0);

    const back = newSessionState({
        id: 'c9', agentId: 'a', agentName: 'dev', cwd: 'D:/a/dev', now: NOW,
        sessionId: 'sid-7', carried: past
    });
    ok('a resumed session opens on the conversation\'s figures, not on zero',
        back.tokens === 500000 && back.costUSD === 0.42 && back.turns === 6
        && back.contextTokens === 132000);
    ok('…while a brand new one still starts at zero, with no ctx to claim',
        fresh().tokens === 0 && fresh().turns === 0 && fresh().contextTokens === undefined);

    // the turn is the DIFFERENCE — which is exactly what stopped being true
    const turn = acceptUserText(back, 'go on then', NOW + 1000).state;
    ok('the first turn back starts counting from what was already there',
        turn.turnTokensAt === 500000);
    const spoke = reduce(turn, {
        type: 'assistant',
        message: {
            content: [{ type: 'text', text: 'right' }],
            usage: {
                input_tokens: 10, output_tokens: 190,
                cache_creation_input_tokens: 800, cache_read_input_tokens: 129000
            }
        }
    }, NOW + 2000);
    const turnTokens = spoke.tokens - spoke.turnTokensAt;
    ok('…so the turn shows the turn', turnTokens === 130000);
    ok('…and the session shows the session', spoke.tokens === 630000);
    ok('‼️ the two are no longer the same number', turnTokens !== spoke.tokens);

    // every door into a resume carries them
    const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'consolePanel.ts'), 'utf8');
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('the Console\'s own resume carries them', /carried: carriedTotals\(row\)/.test(panel));
    ok('…so does Resume in Console', /carried: carriedTotals\(s\)/.test(ext));
    ok('…and so does an agent\'s console.start', /carried: past \? carriedTotals\(past\) : undefined/.test(ext));
    const host = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'consolehost.ts'), 'utf8');
    ok('a session that is NOT a resume can never carry someone else\'s totals',
        /carried: init\.resume \? init\.carried : undefined/.test(host));
    ok('the bridge reports both figures, so an agent reads what the panel shows',
        /turnTokens: s\.turnTokensAt !== undefined/.test(ext));
}

// ---------- the resume list: asked, answered by the host ----------
{
    const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'consolePanel.ts'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '..', 'media', 'console.js'), 'utf8');
    ok('the page asks, the host answers — the page cannot filter what it was never sent',
        /case 'resumeQuery'/.test(panel) && /type: 'resumeQuery'/.test(js));
    // The Console re-sends its whole state on every event of every session; a
    // list nobody is looking at must not be built at all, let alone shipped.
    ok('a closed list costs nothing', /if \(!this\.resumeOpen\)/.test(panel));
    ok('…and the shelf still comes first, exempt from the row count',
        /the shelf is never cut/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'consoleresume.ts'), 'utf8')));
    ok('the filter is the Sessions tables\' vocabulary, not a second language',
        /same vocabulary the Sessions tables filter with/.test(
            fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'consoleresume.ts'), 'utf8')));
    ok('a page carries no nav button the global nav already has',
        !/related: \[\{ nav: 'timeline'/.test(js));
}

// ---------- the turn above the box, the session below it ----------
{
    const js = fs.readFileSync(path.join(__dirname, '..', 'media', 'console.js'), 'utf8');
    const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'consolePanel.ts'), 'utf8');
    ok('cost is never written without the tokens it bought', /const spend = /.test(js));
    ok('the running turn is priced while it runs, not guessed at',
        /estimateCost\(/.test(panel)
        && /s\.turnUsage && engineOf\(s\.engine\)\.reportsCost\s*\n?\s*\? this\.deps\.estimateCost/.test(panel));
    // …at the model IT is running on. `model` is the picker plus whatever a
    // switch has since moved it to, i.e. possibly the NEXT turn's model.
    ok('…and priced at the model the turn itself is running on',
        /estimateCost\(s\.turnModel \|\| s\.model \|\| ''/.test(panel));
    // ‼️ X-19 — and NOT priced at all on an engine that states no price. Our
    // rate card is Anthropic's; running it over a ChatGPT plan's tokens is wrong
    // twice, and the number it produces reads as authoritative.
    ok('…and not priced at all on an engine that reports no cost',
        /NOT ESTIMATED AT ALL on an engine that states no price/.test(panel));
    ok('…and the panel says out loud that the live figure is an estimate',
        /is an estimate/.test(panel) || /an estimate/.test(panel));
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
    // The "your turn" notice is the one signal that travels off the page — so
    // it is deliberately narrow, or it becomes the thing you turn off.
    ok('a finished turn is announced only when you are NOT watching it',
        /ConsolePanel\.isWatching\(s\.id\)/.test(extSrc)
        && /const isWatching/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'consolePanel.ts'), 'utf8').replace('static isWatching', 'const isWatching')));
    ok('…never for a turn that failed or you interrupted', /last\?\.isError/.test(extSrc));
    ok('…once per turn, on the working→idle edge',
        /prevConsoleStatus/.test(extSrc) && /was !== 'working' \|\| s\.status !== 'idle'/.test(extSrc));
    ok('…carrying what the turn cost, and a way in', /Open the Console/.test(extSrc));
    ok('…and it can be switched off',
        /notifyConsoleTurnEnd/.test(extSrc)
        && !!pkg.contributes.configuration.properties['agentFarm.notifyConsoleTurnEnd']);
    ok('the tab itself carries the count, for when the Console is in the background',
        /Console \(\$\{waiting\}\)/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'consolePanel.ts'), 'utf8')));
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
    // ‼️ Matched on `id: 'x', label:` rather than on the opening brace: U-68 gave
    // every entry a `tip` and broke them onto their own lines, and a test that
    // reads a list by its indentation is a test that fails on formatting.
    const order = (nav.match(/id: '([a-z]+)', label:/g) || []).map(s => s.replace(/.*'([a-z]+)'.*/, '$1'));
    ok('Dashboard leads', order[0] === 'dashboard');
    // Projects sits second on purpose: it is the umbrella the rest of the work
    // hangs under, so it comes before the places that work happens.
    ok('Projects is the umbrella, so it comes next', order[1] === 'projects');
    ok('Console follows it', order[2] === 'console');
    ok('the vital signs come next', order.slice(3, 6).join(',') === 'living,notices,queue');
    ok('then what is happening right now', order[6] === 'timeline');
    ok('then who does the work, then the work', order.slice(7, 9).join(',') === 'portfolio,tasks');
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const title = pkg.contributes.menus['view/title']
        .filter(m => m.when === 'view == agentfarm.agents')
        .map(m => ({ cmd: m.command, at: Number(m.group.replace('navigation@', '')) }))
        .sort((a, b) => a.at - b.at).map(x => x.cmd);
    // Start a session · talk in one · read the sessions · read the turns inside
    // them. S-7 put Sessions between Console and Turns because that is where it
    // falls in that sentence: the whole conversation before its parts.
    ok('in the side panel Console follows Start Session',
        title.indexOf('agentfarm.openConsole') === title.indexOf('agentfarm.launchSession') + 1);
    ok('…then Sessions, then the Turns inside them',
        title.indexOf('agentfarm.openSessions') === title.indexOf('agentfarm.openConsole') + 1
        && title.indexOf('agentfarm.openTurns') === title.indexOf('agentfarm.openSessions') + 1);
    // The reading row ends where the writing row begins: everything above opens
    // something to look at, and the LAST thing on the strip is the one button
    // that creates. P-11 put the Backlog at the end of the reading row — what
    // the fleet is FOR comes after what it is made of — so the matrix is no
    // longer the last read, but the shape of the strip is unchanged: reads,
    // then "+".
    ok('the Backlog closes the reading row, between the matrix and the +',
        title.indexOf('agentfarm.openBacklog') === title.indexOf('agentfarm.openCapabilities') + 1
        && title.indexOf('agentfarm.openBacklog') === title.indexOf('agentfarm.newAgent') - 1);
    ok('…and + closes the strip', title[title.length - 1] === 'agentfarm.newAgent');
    // A title strip is not a menu: what does not belong to THIS view's subject
    // is taken off it. The Timeline is the Live Feed's own title button and the
    // Guide is reachable from the welcome view, the walkthrough and the palette.
    ok('the Live Timeline is not on the Agents strip', !title.includes('agentfarm.openTimeline'));
    ok('the Guide is not on the Agents strip', !title.includes('agentfarm.openGuide'));
    // Two buttons a centimetre apart carrying the same glyph are one button as
    // far as the eye is concerned. Console talks to an agent, Sessions reads
    // what was said — and `openSession` (one) to `openSessions` (all) is book
    // to library.
    const iconOf = c => (pkg.contributes.commands.find(x => x.command === c) || {}).icon;
    ok('Sessions does not wear the Console glyph',
        iconOf('agentfarm.openSessions') && iconOf('agentfarm.openSessions') !== iconOf('agentfarm.openConsole'));
    ok('…every icon on the Agents strip is distinct',
        new Set(title.map(iconOf)).size === title.length);
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
        'console.permissionMode', 'console.setEffort', 'console.answer', 'console.close']) {
        ok(`${op} is on the bridge`, ext.includes(`op: '${op}'`));
    }
    ok('the host outlives the panel, and dies with the window',
        /consoleHost\.dispose\(\)/.test(ext));
    const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'consolePanel.ts'), 'utf8');
    ok('the panel does not kill sessions when its tab closes',
        /deliberately OUTLIVE the panel/.test(panel));
    const js = fs.readFileSync(path.join(__dirname, '..', 'media', 'console.js'), 'utf8');
    // The box is now the LEFTOVER case — a refusal nobody was asked about — and
    // it has to say which case it is, or it reads as a contradiction of the
    // question card two centimetres below it.
    ok('the permission box says what it can really do, and why nothing was asked',
        /settled before it ever reached you/.test(js) && /change this session's rule/.test(js));
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
    ok('Console is the first thing in the global nav', /id: 'console', label:/.test(nav));
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    ok('it has a command', pkg.contributes.commands.some(c => c.command === 'agentfarm.openConsole'));
    ok('…and a key', pkg.contributes.keybindings.some(k => k.command === 'agentfarm.openConsole'));
    ok('a live smoke exists for the parts unit tests cannot prove',
        fs.existsSync(path.join(__dirname, 'smoke_console_live.js')));
}

// ---------- K-12: "End session" that ended nothing ----------
// The button was pressed, the card flipped to ended, and seconds later the
// agent was still writing — so it was pressed again, and again. Two faults,
// one visible symptom.
{
    const { killTree } = require(path.join(__dirname, '..', 'out', 'core', 'consolehost.js'));
    // FAULT 1 — the kill order. `child.kill()` ended the shell wrapper on the
    // spot; `taskkill /PID p /T` was still only a queued spawn, and it resolves
    // p BEFORE walking the tree, so a p that just died is "process not found"
    // and the real claude underneath was never touched. The property is
    // synchronously observable: on Windows killTree must not have killed
    // anything by the time it returns.
    let killed = 0;
    // A pid nothing owns: taskkill errors, and only then may the fallback run.
    killTree({ pid: 0x7ffffffe, kill() { killed++; } });
    ok(process.platform === 'win32'
        ? 'killTree lets taskkill walk the tree BEFORE the shell is killed'
        : 'off Windows killTree is the plain kill',
        process.platform === 'win32' ? killed === 0 : killed === 1);

    // FAULT 2 — the drain undid the end. Killing is not instant, and what the
    // CLI had already written was still in the pipe: those lines went through
    // the reducer, which put the status back to 'working'.
    const host = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'consolehost.ts'), 'utf8');
    ok('an ended session is marked as ended by the USER, not just by the process',
        /closed\?: boolean;/.test(host) && /h\.closed = true;/.test(host));
    ok('…and nothing is reduced off the pipe after that',
        /if \(!h \|\| h\.closed\) \{ return; \}/.test(host));
    ok('…nor written to it', /if \(!h \|\| h\.closed\) \{ return false; \}/.test(host));
    ok('…not even a stderr complaint about being killed',
        /if \(this\.sessions\.get\(id\)\?\.closed\) \{ return; \}/.test(host));
    // …and pressing it AGAIN still kills. The one thing this fix must not do is
    // turn the user's last resort into a dead button: a second press means "that
    // did not take", and killing a pid that is already gone costs nothing. Only
    // what must happen once — denying the parked question — is skipped.
    ok('a second press re-issues the kill instead of being swallowed',
        /const again = h\.closed === true;/.test(host)
        && /if \(!again && h\.state\.pendingAsk\)/.test(host)
        && /h\.closed = true;[\s\S]{0,1400}killTree\(child\);/.test(host));
    // ‼️ S-29 (reopened) — and the pipe is STILL shut before the kill, which is
    // the ordering the fault above was about. What moved is only the spawning.
    ok('…and the pipe is shut before anything is killed, still',
        /stdin\?\.end\(\);[\s\S]{0,900}const reap = /.test(host));
    // Every route that ends a hosted session goes through the one close().
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'consolePanel.ts'), 'utf8');
    ok('the composer button and the right-click item end it the same way',
        /host\.close\(str\('id'\)\)/.test(panel) && /consoleHost\.close\(id\)/.test(ext));
}

// ---------- K-11: the project a session was running under, lost ----------
// Two faults again, and the same symptom both times: the strip above the box
// said "No project" about a session that had one.
{
    const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'consolePanel.ts'), 'utf8');
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '..', 'media', 'console.js'), 'utf8');

    // FAULT 1 — the panel's OWN resume was the one resume route that passed no
    // project, so ConsoleHost.start fell back to the window's active one (which
    // is normally none). The session came back filed nowhere and was re-told
    // the wrong brief, or none.
    ok('the panel can ask what project a session already belongs to',
        /sessionProject\(s: \{ sessionId\?: string; agentId\?: string; agentName\?: string; cwd\?: string \}\): string;/.test(panel));
    ok('…answered by the one membership order every other route uses',
        /sessionProject: \(s: \{[^}]*\}\) =>\s*sessionOwnProject\(s\)/.test(ext));
    ok('…and the Console\'s own resume passes it',
        /resume: sessionId,[\s\S]{0,900}projectId: this\.deps\.sessionProject\(\{/.test(panel));
    ok('…as does "new session in the same folder", which is the same work',
        (panel.match(/projectId: this\.deps\.sessionProject\(\{/g) || []).length === 2);

    // FAULT 2 — the chip and the picker were one field. `start` clears the
    // picker on purpose (the next session picks its own project), so the chip
    // flipped to "No project" the instant the button was pressed.
    ok('the picker and the chip are two fields, not one',
        /activeProjectId: this\.composerProject,/.test(panel)
        && /chipProjectId: chipProject,/.test(panel));
    ok('…the chip follows the SELECTED session, the picker only the composer',
        /const chipProject = this\.selected[\s\S]{0,160}: this\.composerProject;/.test(panel));
    ok('…and the verbatim context is read for the project the chip is about',
        /projectContext: this\.deps\.projectContextText\(chipProject\)/.test(panel));
    ok('the page reads the chip\'s field, not the picker\'s',
        /const id = DATA\.chipProjectId \|\| '';/.test(js)
        && !/const id = DATA\.activeProjectId \|\| '';/.test(js));
    // The picker's list is open projects only; a session outlives that.
    ok('a session under a finished project is still named, off its own row',
        /s\.projectId === id && s\.projectName/.test(js));
    ok('…and the picker still answers for the new session it is about',
        /<option value=""\$\{DATA\.activeProjectId \? '' : ' selected'\}>/.test(js));
}

// ---------- X-18/X-19: which engine is answering, on the surface ----------
//
// ‼️ THE COMPOSER STARTED EVERY SESSION ON `claude` WITHOUT SAYING SO. A second
// engine existed, was measured, was wired end to end — and the one page you talk
// to an agent from had no box for it. Worse, the two engines are NOT two
// spellings of the same thing: on one a message typed mid-turn steers that turn,
// on the other it is held; on one the pickers are live controls, on the other
// they are the next turn's flags; one reports a price per turn and the other
// runs on a plan and does not. All of that has to be readable at a glance from
// the card, or a person will discover it by losing a message.
{
    const js = fs.readFileSync(path.join(__dirname, '..', 'media', 'console.js'), 'utf8');
    const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'consolePanel.ts'), 'utf8');
    ok('the composer has an engine box, and only when starting a session',
        /<select id="c-engine"/.test(js) && /type: 'setEngine'/.test(js));
    ok('‼️ …offering an engine that cannot run here as DISABLED rather than hiding it',
        /\$\{e\.ready \? '' : ' disabled'\}/.test(js));
    ok('…with the one thing to do about it on the row itself',
        /title="\$\{C\.esc\(e\.next\)\}"/.test(js));
    ok('the panel checks it again on its own side of the webview wall',
        /const refused = engineRefusal\(this\.engineList\(\), engine\)/.test(panel));
    ok('…and passes the engine to the host', /engine: engine as EngineId,/.test(panel));
    ok('…while the matrix is held for a few seconds, not walked per streamed line',
        /ENGINE_TTL_MS/.test(panel) && /private engineList\(\)/.test(panel));

    ok('‼️ a running session wears its engine on the CARD, at a glance',
        /function engineBadge\(s\)/.test(js) && /\$\{engineBadge\(s\)\}/.test(js));
    // ‼️ U-26 — THE RULE FLIPPED, AND THE OLD ONE IS WHY. "The default wears
    // nothing" left an unbadged row meaning either "Claude" or "this surface
    // never learned about engines", with nothing on the row to tell them apart.
    ok('‼️ …and CLAUDE wears one too, so no row is silent about its engine',
        !/s\.engine === 'claude'\) \{ return ''; \}/.test(js)
        && /window\.AFEngine\.badge\(s\.engine/.test(js));
    ok('…drawn by the shared component, not by a colour this page invented',
        !/\.ebadge \{/.test(js));
    ok('…and its hover is FIGURES, the way a cell hover has to be',
        /'Shape: ' \+ \(s\.turnShape === 'perTurn' \? 'one process per turn'/.test(js)
        && /'Mid-turn message: '/.test(js));
    // U-30 — the same text, no longer printed at the reader. It was three
    // lines under the composer, in the narrowest strip on the page; it is a
    // one-character trigger opening the rich panel now.
    ok('‼️ …and the composer offers that as a HOVER, not as a paragraph',
        /function engineHintHtml\(id\)/.test(js)
        && /window\.AFTip\.wrap\(/.test(js)
        && !/c-enote/.test(js) && !/class="enote"/.test(js));
    ok('…offered for EVERY engine, so "no note" cannot be mistaken for "none written"',
        /Nothing about this engine changes how the composer behaves/.test(js));
    ok('…and an engine that cannot run marks its own trigger',
        /ehint\$\{e\.ready \? '' : ' bad'\}/.test(js));

    // U-28 — the row is a row: declared widths, a chosen shrink order, no wrap.
    ok('‼️ the composer row cannot wrap its buttons onto a second line',
        /\.crow \{ display:flex; gap:6px; align-items:center; flex-wrap:nowrap;/.test(js));
    ok('…every box has a declared width instead of its longest option',
        /#c-agent \{ flex:1 1 120px/.test(js) && /#c-engine \{ flex:2 1 118px/.test(js)
        && /#c-perm \{ flex:3 1 104px/.test(js) && /#c-proj \{ flex:3 1 104px/.test(js));
    ok('…and the right-hand buttons never give up a pixel',
        /\.crow #c-live, \.crow #c-send, \.crow button \{ flex:none; \}/.test(js));
    ok('‼️ …and the tail is re-pinned AFTER the live strip has taken its height',
        /if \(pinned && talkEl\) \{ talkEl\.scrollTop = talkEl\.scrollHeight; \}/.test(js));
    ok('the live controls stop promising "applied live" on an engine that has none',
        /const live = !s \|\| s\.steerable !== false;/.test(js)
        && /There is no running process to ask\./.test(js));
    ok('…and the permission list is the START vocabulary there, not the live one',
        /opts\(live \? \(DATA\.livePermissions \|\| DATA\.permissions\) : DATA\.permissions, s\.permissionMode\)/.test(js));

    // X-19 — the money half.
    ok('‼️ a plan-billed session shows TOKENS where the dollars would be',
        /function engineSpend\(s, cost, tokens, wTokens\)/.test(js)
        // ‼️ "no price stated" — NOT "on a plan" (X-35). The chip was asserting a
        // billing arrangement off a capability flag; Codex and Gemini each sign
        // in with either a subscription or an API key, and on a key these turns
        // are invoiced. What is true here is only that the CLI printed no price.
        && /no price stated/.test(js) && !/on a plan, no price/.test(js));
    ok('…and says why there is no figure rather than printing a zero',
        /would read as "free", which is why nothing is invented/.test(js));
    ok('…the running turn too, with no "~": the tokens are exact',
        /tokens this turn/.test(js));
    ok('…and the session line and the card hover follow the same rule',
        /const tokTip = \(s, cost\)/.test(js)
        && /states no per-turn price/.test(js));
    ok('‼️ …and the tooltip sends the user to where the billing arrangement IS known',
        /Engines page reads that from its own credentials/.test(js));
    ok('the payload carries the engine and what it means, per session',
        /engine: s\.engine \?\? 'claude',/.test(panel)
        && /reportsCost: engineOf\(s\.engine\)\.reportsCost/.test(panel));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
