// The Console's two-way half: a session that asks YOU something mid-turn, and
// the effort switch that goes with it.
//
// Everything asserted here was measured against the real CLI first (claude
// 2.1.220, 2026-07-30) — these checks only stop a refactor from quietly undoing
// it. The three findings that cost the most to establish:
//
//   1. `--permission-prompt-tool stdio` is what makes the channel two-way. With
//      it the CLI sends a `control_request` of subtype `can_use_tool` and HOLDS
//      THE TURN OPEN; without it the same question resolves itself as "the user
//      did not answer" and the turn ends. No `initialize` handshake is needed.
//   2. an AskUserQuestion is answered by handing its own input back with
//      `answers["<question text>"] = "<option label>"` — allow alone is NOT an
//      answer, and produces "The user did not answer the questions".
//   3. `/effort` is an `apply_flag_settings` control request, and it really
//      moves: get_settings.applied.effort went low → high → xhigh.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    answerAsk, askAnswerLine, askQuestions, describeAnswer, hostArgs, newSessionState,
    reduceEvent, resetIds
} = require(path.join(__dirname, '..', 'out', 'core', 'consoleproto.js'));

const NOW = 1785164000000;
const fresh = () => newSessionState({
    id: 'c1', agentId: 'a', agentName: 'dev', cwd: 'D:/a/dev', model: 'haiku', effort: 'low', now: NOW
});
const reduce = (s, ev, now = NOW) => reduceEvent(s, ev, now).state;

/** A `can_use_tool` exactly as the CLI sends it (captured from a live run). */
const ASK_QUESTION = {
    type: 'control_request',
    request_id: '2e7c5a3f-7b26-4ac4-8f0d-6df85ae069bc',
    request: {
        subtype: 'can_use_tool',
        tool_name: 'AskUserQuestion',
        display_name: 'AskUserQuestion',
        tool_use_id: 'toolu_01FRo5WXUkiqrxCfNQ7xgMEg',
        requires_user_interaction: true,
        input: {
            questions: [{
                question: 'Tea or coffee?',
                header: 'Drink',
                multiSelect: false,
                options: [
                    { label: 'Tea', description: 'hot tea' },
                    { label: 'Coffee', description: 'hot coffee' }
                ]
            }]
        }
    }
};

const ASK_PERMISSION = {
    type: 'control_request',
    request_id: 'perm-1',
    request: {
        subtype: 'can_use_tool',
        tool_name: 'Write',
        display_name: 'Write',
        tool_use_id: 'toolu_write_1',
        requires_user_interaction: false,
        input: { file_path: 'D:/a/dev/notes.md', content: 'hello' }
    }
};

// ---------- the flag that makes any of this possible ----------
{
    ok('the two-way flag is on every hosted command line',
        hostArgs({}).join(' ').includes('--permission-prompt-tool stdio'));
    ok('…and it is not something a caller can turn off by accident',
        hostArgs({ model: 'opus', resume: 'x' }).join(' ').includes('--permission-prompt-tool stdio'));
}

// ---------- a question parks the turn ----------
{
    resetIds();
    const s = reduce(fresh(), ASK_QUESTION);
    ok('a can_use_tool becomes the session\'s pending ask', !!s.pendingAsk);
    ok('…carrying the id the answer has to come back under',
        s.pendingAsk.requestId === ASK_QUESTION.request_id);
    ok('…and the CLI\'s own word on whether this tool IS the question',
        s.pendingAsk.interactive === true && s.pendingAsk.tool === 'AskUserQuestion');
    ok('…with the questions parsed out for the card',
        s.pendingAsk.questions.length === 1
        && s.pendingAsk.questions[0].options.map(o => o.label).join('/') === 'Tea/Coffee');
    ok('…and a one-line summary for the row', /Tea or coffee/.test(s.pendingAsk.detail));
    ok('the conversation records that it was asked',
        s.messages.length === 1 && s.messages[0].role === 'ask' && !!s.messages[0].ask);

    // A permission ask is the same wire, different shape — and the difference
    // is the CLI's flag, never a guess about the tool's name.
    const p = reduce(fresh(), ASK_PERMISSION);
    ok('a plain permission ask is marked as NOT interactive',
        p.pendingAsk.interactive === false && p.pendingAsk.questions.length === 0);
    ok('…and describes itself by what it would do',
        p.pendingAsk.detail === 'D:/a/dev/notes.md');

    // Anything else on the control_request channel is ignored rather than shown
    ok('an unknown control request changes nothing',
        !reduce(fresh(), { type: 'control_request', request_id: 'x', request: { subtype: 'mcp_message' } }).pendingAsk);
    ok('…and so does one with no request id',
        !reduce(fresh(), { type: 'control_request', request: { subtype: 'can_use_tool', tool_name: 'X' } }).pendingAsk);
}

// ---------- answering it ----------
{
    resetIds();
    const asked = reduce(fresh(), ASK_QUESTION);
    const r = answerAsk(asked, { kind: 'answer', answers: { 'Tea or coffee?': 'Coffee' } }, NOW);
    const line = JSON.parse(r.line);
    ok('the answer travels as a control RESPONSE, under the asked id',
        line.type === 'control_response' && line.response.request_id === ASK_QUESTION.request_id
        && line.response.subtype === 'success');
    // ‼️ THE WHOLE CONTRACT: the chosen label rides back inside the tool's own
    // input, keyed by the question TEXT. Allow with an untouched input is what
    // produced "The user did not answer the questions" against the real CLI.
    ok('…as allow, with the answer folded into the tool\'s own input',
        line.response.response.behavior === 'allow'
        && line.response.response.updatedInput.answers['Tea or coffee?'] === 'Coffee'
        && line.response.response.updatedInput.questions.length === 1);
    ok('the turn is no longer parked', !r.state.pendingAsk);
    ok('…and the conversation says what you chose',
        r.state.messages[r.state.messages.length - 1].answer === 'Tea or coffee? → Coffee');

    // free text is the way out of a list that does not contain your answer
    const free = answerAsk(asked, { kind: 'answer', response: 'neither — just start' }, NOW);
    ok('free text rides back as `response`',
        JSON.parse(free.line).response.response.updatedInput.response === 'neither — just start');

    // multi-select keeps the list a list
    const multi = answerAsk(asked, { kind: 'answer', answers: { 'Tea or coffee?': ['Tea', 'Coffee'] } }, NOW);
    ok('a multi-select answer stays an array',
        Array.isArray(JSON.parse(multi.line).response.response.updatedInput.answers['Tea or coffee?']));

    // a permission is allowed or denied — the input is handed back untouched
    const perm = reduce(fresh(), ASK_PERMISSION);
    const allowed = JSON.parse(answerAsk(perm, { kind: 'allow' }, NOW).line);
    ok('allowing a tool hands its input back verbatim',
        allowed.response.response.behavior === 'allow'
        && allowed.response.response.updatedInput.file_path === 'D:/a/dev/notes.md');
    const denied = JSON.parse(answerAsk(perm, { kind: 'deny', message: 'not that file' }, NOW).line);
    ok('denying carries the reason the agent will be told',
        denied.response.response.behavior === 'deny'
        && denied.response.response.message === 'not that file');
    ok('…and a deny with no words still says something',
        JSON.parse(answerAsk(perm, { kind: 'deny' }, NOW).line).response.response.message.length > 0);

    // ‼️ A stale click from a repainted panel must not write a response for a
    // request the CLI has already taken back — that id means nothing to it.
    ok('answering when nothing is pending writes no line at all',
        answerAsk(fresh(), { kind: 'allow' }, NOW).line === undefined);
    ok('…and answering twice only answers once',
        answerAsk(answerAsk(asked, { kind: 'allow' }, NOW).state, { kind: 'allow' }, NOW).line === undefined);
}

// ---------- the CLI taking the question back ----------
{
    resetIds();
    const asked = reduce(fresh(), ASK_QUESTION);
    const gone = reduce(asked, { type: 'control_cancel_request', request_id: ASK_QUESTION.request_id });
    ok('a cancelled request stops waiting', !gone.pendingAsk);
    ok('…and says so in the conversation rather than vanishing',
        /withdrawn/.test(gone.messages[gone.messages.length - 1].answer));
    ok('a cancel for some other request is ignored',
        !!reduce(asked, { type: 'control_cancel_request', request_id: 'someone-else' }).pendingAsk);
}

// ---------- what the panel renders ----------
{
    const askText = askQuestions({
        questions: [
            { question: 'A?', options: [{ label: 'x' }, { label: '' }] },
            { question: '', options: [] },
            { question: 'B?', multiSelect: true, options: [{ label: 'y', description: 'why' }] }
        ]
    });
    ok('questions with no text are dropped, options with no label too',
        askText.length === 2 && askText[0].options.length === 1);
    ok('multiSelect survives the parse', askText[1].multiSelect === true);
    ok('a shape we cannot parse yields no questions — the card falls back to allow/deny',
        askQuestions({ questions: 'nope' }).length === 0 && askQuestions(undefined).length === 0);

    ok('the answer summary reads as a sentence',
        describeAnswer({ tool: 'Write' }, { kind: 'allow' }) === 'allowed Write'
        && describeAnswer({ tool: 'X' }, { kind: 'deny', message: 'no' }) === 'declined — no');
}

// ---------- effort, live ----------
{
    resetIds();
    const host = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'consolehost.ts'), 'utf8');
    ok('the host asks for effort the way /effort does',
        /apply_flag_settings/.test(host) && /effortLevel: want \|\| null/.test(host));
    ok('…and records it as pending until the CLI agrees',
        /pendingEffort: \{ requestId, effort: want \}/.test(host));

    // the CLI's answer carries no payload, so the request id is the only link
    const asked = { ...fresh(), pendingEffort: { requestId: 'effort-1', effort: 'high' } };
    const done = reduce(asked, {
        type: 'control_response', response: { subtype: 'success', request_id: 'effort-1' }
    });
    ok('an accepted effort switch becomes the session\'s effort',
        done.effort === 'high' && !done.pendingEffort);
    ok('…and is said out loud, with when it applies',
        /effort is now high/.test(done.messages[done.messages.length - 1].text));

    const refused = reduce(asked, {
        type: 'control_response',
        response: { subtype: 'error', request_id: 'effort-1', error: 'nope' }
    });
    ok('a refused switch leaves the effort exactly where it was',
        refused.effort === 'low' && !refused.pendingEffort);
    ok('…and says so as an error, not a success', refused.messages[0].role === 'error');

    // "back to the CLI's own default" is a real value and must travel as null:
    // leaving the key out would change nothing at all.
    const cleared = reduce(
        { ...fresh(), pendingEffort: { requestId: 'e2', effort: '' } },
        { type: 'control_response', response: { subtype: 'success', request_id: 'e2' } });
    ok('clearing the effort clears it', cleared.effort === '');
}

// ---------- nothing is left waiting on a dead pipe ----------
{
    const host = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'consolehost.ts'), 'utf8');
    const body = f => {
        const at = host.indexOf(`    ${f}(id: string`);
        return at < 0 ? '' : host.slice(at, host.indexOf('\n    }', at));
    };
    // ‼️ Esc and End both have to settle a parked question first: the CLI is
    // holding a request open, and a process waiting for a response nobody will
    // ever send looks exactly like a hung session.
    ok('interrupt answers a parked question before it stops the turn',
        /pendingAsk/.test(body('interrupt')) && /kind: 'deny'/.test(body('interrupt')));
    ok('closing a session does the same before the pipe goes',
        /pendingAsk/.test(body('close')) && /kind: 'deny'/.test(body('close')));
}

// ---------- the panel and the bridge tell the same story ----------
{
    const page = fs.readFileSync(path.join(__dirname, '..', 'media', 'console.js'), 'utf8');
    ok('the card sits between the conversation and the composer, not inside the scroller',
        page.indexOf('id="c-ask"') > 0
        && page.indexOf('id="c-ask"') < page.indexOf('<div class="working" id="c-working">'));
    ok('a session waiting on an answer says so on its card, not "working"',
        /pendingAsk[\s\S]{0,220}asking you/.test(page));
    ok('the answer is sent as one message the host validates',
        /type: 'askAnswer'/.test(page) && /kind: 'allow'/.test(page) && /kind: 'deny'/.test(page));
    ok('a single-select question sends on the click, without a second press',
        /every\(x => \(askPick\.by\[x\.question\] \|\| \[\]\)\.length\)/.test(page));
    ok('free text typed into the card survives a repaint',
        /kept/.test(page) && /setSelectionRange/.test(page));

    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('the bridge can answer a QUESTION', /op: 'console\.answer'/.test(ext));
    ok('…and can switch effort', /op: 'console\.setEffort'/.test(ext));
    // ‼️ …but never grants a tool permission. Same call the general Needs-You
    // queue makes: an op that could approve a tool would put an agent in charge
    // of its own permissions.
    ok('…and refuses to grant a tool permission on the user\'s behalf',
        /asking for PERMISSION, not for an answer/.test(ext));
    ok('console.sessions reports what a session is waiting on', /asking: s\.pendingAsk/.test(ext));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
