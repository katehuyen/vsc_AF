// U-78: HALF THE CONVERSATION WAS MISSING FROM THE LIVE TIMELINE.
//
// The page already knew how to draw it — `media/timeline.js` has quoted the
// body of a `say` or a `stop` since U-67, and the legend is derived from the
// same table. What it never received was the text: `Stop` was pushed with no
// detail at all, and an agent's reply had no event kind to arrive as, so it
// fell into the `notify` box or was dropped. A reader could see what was ASKED
// and never what came back.
//
// Two sources, because there are two kinds of session and only one of them
// tells us anything:
//   · a HOSTED conversation is Agent Farm's own, so its replies are mirrored in
//     as they arrive and the turn's last one rides on `Stop`;
//   · CLAUDE fires its own hooks and none of them carries the assistant's text,
//     so the reply is read from the tail of the transcript the hook already
//     names — which is exactly what a turn boundary has just finished writing.
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

class Emitter {
    constructor() { this.handlers = []; }
    get event() { return (fn) => { this.handlers.push(fn); return { dispose() { } }; }; }
    fire(v) { for (const h of this.handlers) { h(v); } }
    dispose() { }
}
const fakeVscode = {
    EventEmitter: Emitter,
    window: { showInformationMessage: () => Promise.resolve(undefined), showWarningMessage: () => Promise.resolve(undefined) },
    commands: { executeCommand: () => Promise.resolve(undefined) }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return fakeVscode; }
    return origLoad.apply(this, arguments);
};
const { LiveMonitor, lastSaid } = require(path.resolve(__dirname, '../out/core/live.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const cfg = () => ({
    enabled: false, port: 0, stuckThresholdMs: 240000,
    notifyPermission: false, notifyStuck: false, notifyTurnEnd: false
});
const mk = (tail) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-say-'));
    return new LiveMonitor(cfg, () => ({ agentName: 'dev' }), undefined,
        path.join(dir, 'live-events.jsonl'), '3.182.0', () => tail);
};
const kinds = lm => lm.events(3600000).map(e => e.kind);
const detailOf = (lm, kind) => (lm.events(3600000).filter(e => e.kind === kind).pop() || {}).detail;

// ---- reading the reply out of a Claude transcript --------------------------
// The shape is the real one: one JSON object per line, `content` an array of
// blocks whose `type` says what each is. A turn ends with `text`; everything
// before it is `thinking` and `tool_use`, and tool RESULTS come back as `user`
// lines, which is why a plain "stop at the first user line" would find nothing.
const line = o => JSON.stringify(o);
const assistant = (blocks, extra) => line(Object.assign({ type: 'assistant', message: { role: 'assistant', content: blocks } }, extra || {}));
const userPrompt = t => line({ type: 'user', message: { role: 'user', content: t } });
const toolResult = () => line({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } });
const read = text => (f, n) => text;

{
    const t = [
        'PARTIAL LINE THE TAIL CUT IN HALF {"type":"assistant"',
        userPrompt('do the thing'),
        assistant([{ type: 'thinking', thinking: 'hmm' }]),
        assistant([{ type: 'tool_use', name: 'Read' }]),
        toolResult(),
        assistant([{ type: 'text', text: 'Done — three files changed.' }])
    ].join('\n');
    ok('‼️ the last thing the agent actually said',
        lastSaid('t.jsonl', read(t)) === 'Done — three files changed.');
}
{
    // A subagent's line is the subagent talking to itself, not this session
    // answering — and it is the LAST line, so nothing but the flag separates it.
    const t = [
        userPrompt('go'),
        assistant([{ type: 'text', text: 'the real answer' }]),
        assistant([{ type: 'text', text: 'a subagent thinking out loud' }], { isSidechain: true })
    ].join('\n');
    ok('‼️ a sidechain is a subagent, not the session',
        lastSaid('t.jsonl', read(t)) === 'the real answer');
}
{
    // The boundary: a real user prompt ends the turn being looked back through,
    // or a fresh turn that has said nothing yet would show the PREVIOUS answer.
    const t = [
        assistant([{ type: 'text', text: 'the previous turn answer' }]),
        userPrompt('and now do this'),
        assistant([{ type: 'tool_use', name: 'Bash' }])
    ].join('\n');
    ok('‼️ a turn that has not answered yet claims nothing',
        lastSaid('t.jsonl', read(t)) === '');
}
{
    ok('a transcript that cannot be read is silence, not a crash',
        lastSaid('t.jsonl', () => undefined) === ''
        && lastSaid('t.jsonl', () => { throw new Error('gone'); }) === '');
    ok('…and so is a file with nothing in it', lastSaid('t.jsonl', read('')) === '');
    ok('a line that is not JSON is skipped rather than fatal',
        lastSaid('t.jsonl', read('x\nnot json at all\n' + assistant([{ type: 'text', text: 'still found' }]))) === 'still found');
}

// ---- the events the page receives ------------------------------------------
{
    const lm = mk('');
    lm.handle({ session_id: 'S1', hook_event_name: 'SessionStart', cwd: '/w' });
    lm.handle({ session_id: 'S1', hook_event_name: 'UserPromptSubmit', prompt: 'go' });
    lm.handle({ session_id: 'S1', hook_event_name: 'AssistantMessage', message: 'working on it' });
    ok('‼️ an agent reply arrives as its own kind, not as a notification',
        kinds(lm).includes('say') && !kinds(lm).includes('notify'));
    ok('…carrying what was said', detailOf(lm, 'say') === 'working on it');

    lm.handle({ session_id: 'S1', hook_event_name: 'AssistantMessage', message: '   ' });
    ok('‼️ an empty reply draws no point — a dot with nothing to say is worse than none',
        kinds(lm).filter(k => k === 'say').length === 1);
    lm.dispose();
}
{
    // The hosted path: the mirror hands the turn's last reply to Stop.
    const lm = mk('');
    lm.handle({ session_id: 'S2', hook_event_name: 'SessionStart', cwd: '/w', engine: 'opencode' });
    lm.handle({ session_id: 'S2', hook_event_name: 'Stop', message: 'Finished: the build is green.' });
    ok('‼️ the turn end says what the turn ANSWERED, not only that it ended',
        detailOf(lm, 'stop') === 'Finished: the build is green.');
    lm.dispose();
}
{
    // The Claude path: no hook carries the text, so the transcript is read.
    const t = [userPrompt('go'), assistant([{ type: 'text', text: 'Read from the transcript.' }])].join('\n');
    const lm = mk(t);
    lm.handle({ session_id: 'S3', hook_event_name: 'SessionStart', cwd: '/w', transcript_path: '/w/s3.jsonl' });
    lm.handle({ session_id: 'S3', hook_event_name: 'Stop', transcript_path: '/w/s3.jsonl' });
    ok('‼️ Claude has no hook for it, so the turn end reads the transcript',
        detailOf(lm, 'stop') === 'Read from the transcript.');
    lm.dispose();
}
{
    // …and when there is nothing to read, the point is exactly what it was
    // before this item: a turn end with its duration and nothing invented.
    const lm = mk('');
    lm.handle({ session_id: 'S4', hook_event_name: 'SessionStart', cwd: '/w' });
    lm.handle({ session_id: 'S4', hook_event_name: 'Stop' });
    ok('a turn end with nothing to quote invents nothing',
        detailOf(lm, 'stop') === undefined);
    lm.dispose();
}

// ---- the page half: the kind has to mean something -------------------------
{
    const tl = fs.readFileSync(path.resolve(__dirname, '..', 'media', 'timeline.js'), 'utf8');
    ok('the timeline names the reply in words', /say:\s*'The agent replied'/.test(tl));
    const style = /say:\s*\{([^}]*)\}/.exec(tl);
    ok('…draws it as a mark of its own', !!style && /label:\s*'agent reply'/.test(style[1]));
    // ‼️ AND NOT IN THE TOOL'S COLOUR. Green is what a tool is on this page —
    // the bars, the badge, the running segment — so a green dot for a reply put
    // two subjects in one colour and gave the legend two entries nobody could
    // tell apart. It is the PROMPT's blue, hollow: one conversation, two
    // directions, and it needs no tenth hue the theme does not have.
    ok('‼️ a reply is not drawn in the tool\'s green', !!style && !/charts-green/.test(style[1]));
    ok('‼️ …it is the prompt\'s own colour, unfilled',
        !!style && /charts-blue/.test(style[1]) && /shape:\s*'ring'/.test(style[1]));
    ok('…and the drawing knows that shape', /st\.shape === 'ring'/.test(tl) && /fill="none"/.test(tl));
    ok('…as does the legend', /v\.shape === 'ring'/.test(tl));
    ok('‼️ …and quotes it as speech, the way a prompt is quoted',
        /m\.kind === 'say'/.test(tl) && /m\.kind === 'stop'/.test(tl));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
