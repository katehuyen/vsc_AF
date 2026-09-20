// U-116 — WHAT THE FARM LOOKS LIKE ON A PHONE SCREEN, and the two places one
// word has to be read as more than one thing.
//
// What is pinned here:
//   * ‼️ A MISSING FIGURE IS SAID TO BE MISSING. An engine that publishes no
//     plan is never rendered as 0% — that is the one mistake that turns
//     telemetry into a lie somebody acts on from a bus stop;
//   * /agent <name> splits against the REAL names, longest first, because an
//     agent's name is a folder name and a folder name can carry a space —
//     counting words would bind "developer" and throw the prompt away;
//   * /cancel is one command with two meanings, and which one is decided by
//     whether there is an argument at all;
//   * /sessions draws buttons two to a row, marks the focus, and stops before
//     a keyboard longer than the list it sits under;
//   * every callback_data parses back through the one tap door, under 64 bytes;
//   * the allowlist: the chat id is offered only while there is nobody to
//     protect, and a stranger learns nothing once the bridge is configured.
'use strict';
const path = require('path');
const C = require(path.join(__dirname, '..', 'out', 'core', 'telegramCommands.js'));
const D = require(path.join(__dirname, '..', 'out', 'core', 'telegramDigest.js'));
const { parseCommand, HELP_TEXT } = require(path.join(__dirname, '..', 'out', 'core', 'messaging.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---- the plans, and the ones with nothing to say ----
const engines = [
    { id: 'claude', label: 'Claude Code', state: 'ok', bars: [
        { id: 'five_hour', title: 'Session', percent: 37.4 },
        { id: 'seven_day', title: 'Week', percent: 3 }
    ] },
    { id: 'codex', label: 'Codex', state: 'not-published', bars: [] },
    { id: 'gemini', label: 'Gemini', state: 'no-plan', bars: [] }
];
const q = C.quotaLines(engines);
ok('the readable plan is one line with both windows',
    q.some(l => /Claude Code: Session 37% · Week 3%/.test(l)));
ok('‼️ an engine with no published figure is NAMED, never drawn as 0%',
    q.join('\n').includes('No figure:') && /Codex \(keeps a quota/.test(q.join('\n'))
    && !/Codex.*0%/.test(q.join('\n')));
ok('…and a per-token engine says WHY it has no percentage',
    /Gemini \(billed per token/.test(q.join('\n')));
ok('a bar with a null percent is not a percentage either',
    !/null|NaN/.test(C.quotaLines([{ id: 'x', label: 'X', state: 'ok', bars: [{ id: 'b', title: 'B', percent: null }] }]).join('\n')));
ok('…and that engine falls in with the quiet ones',
    /X \(/.test(C.quotaLines([{ id: 'x', label: 'X', state: 'ok', bars: [{ id: 'b', title: 'B', percent: null }] }]).join('\n')));
ok('no engines at all is no block, not an empty heading', C.quotaLines([]).length === 0);

// ---- /status, the whole farm on one screen ----
const statusIn = {
    agents: 7, activeAgents: 2, todayUSD: 4.213, chatUSD: 0.4, capUSD: 1,
    needs: { count: 1, first: 'X-153 needs a decision' },
    runningTasks: { count: 0 }, conversations: 2, focus: 'developer · AgentFarm',
    queued: 0, bound: 'developer', engines
};
const status = C.farmStatusText(statusIn);
ok('money is rounded to cents, both figures', /Today: \$4\.21 · chat runs \$0\.40 of \$1\.00/.test(status));
ok('what needs you names the first one', /Needs you: 1 — X-153 needs a decision/.test(status));
ok('nothing running says so without a dangling dash', /Running tasks: 0$/m.test(status));
ok('the focus is on the conversations line', /Conversations: 2 · focus developer · AgentFarm/.test(status));
ok('no queue is no line', !/Queued from here/.test(status));
ok('…and a queue is one', /Queued from here: 3 messages/.test(C.farmStatusText({ ...statusIn, queued: 3 })));
ok('…singular when it is one', /Queued from here: 1 message$/m.test(C.farmStatusText({ ...statusIn, queued: 1 })));
ok('an unbound chat is told how to bind', /not bound to an agent yet \(\/agent <name>\)/.test(
    C.farmStatusText({ ...statusIn, bound: undefined })));
ok('an empty farm does not offer a focus', !/focus/.test(
    C.farmStatusText({ ...statusIn, conversations: 0 })));
ok('…and no focus chosen says it will ask', /focus none — I will ask/.test(
    C.farmStatusText({ ...statusIn, focus: undefined })));
ok('the plans are the last block', /Plans:\n {2}Claude Code: Session 37%/.test(status));

// ---- /agents ----
const list = C.agentsText([{ name: 'developer', model: 'opus' }, { name: 'psikolog' }], 'developer');
ok('each agent says what it thinks with', /developer — opus/.test(list));
ok('…and one with nothing chosen says only its name', /\n {2}psikolog$/m.test(list));
ok('the bound agent is marked', /developer — opus {2}← this chat/.test(list));
ok('…and the two forms of /agent are on the card', /\/agent <name> <prompt>/.test(list));
ok('an empty farm says so', C.agentsText([]) === 'No agents found.');

// ---- ‼️ one word, two readings ----
const names = ['developer', 'psikolog', 'data scientist'];
ok('a bare name binds', JSON.stringify(C.splitAgentPrompt('developer', names))
    === JSON.stringify({ agent: 'developer', prompt: '' }));
ok('a name and words runs', JSON.stringify(C.splitAgentPrompt('developer run the tests', names))
    === JSON.stringify({ agent: 'developer', prompt: 'run the tests' }));
ok('‼️ a name WITH A SPACE is not split into name + prompt',
    JSON.stringify(C.splitAgentPrompt('data scientist', names))
    === JSON.stringify({ agent: 'data scientist', prompt: '' }));
ok('…and still takes a prompt after it',
    JSON.stringify(C.splitAgentPrompt('data scientist plot the costs', names))
    === JSON.stringify({ agent: 'data scientist', prompt: 'plot the costs' }));
ok('the LONGEST matching name wins',
    C.splitAgentPrompt('data scientist x', ['data', 'data scientist']).agent === 'data scientist');
ok('case does not matter but the real name comes back',
    C.splitAgentPrompt('DEVELOPER go', names).agent === 'developer');
ok('a name nobody has is neither form', C.splitAgentPrompt('nobody do this', names) === undefined);
ok('nothing at all is neither form', C.splitAgentPrompt('   ', names) === undefined);
ok('a prefix that is not a whole word does not match',
    C.splitAgentPrompt('developerx go', names) === undefined);

// ---- /cancel, one command, two meanings ----
ok('no argument means the run this chat started', C.cancelTarget('') === 'own-run');
ok('…and whitespace is no argument', C.cancelTarget('   ') === 'own-run');
ok('an argument means a live conversation', C.cancelTarget('2') === 'session');
ok('the command carries its argument now', parseCommand('/cancel 2').arg === '2');
ok('…and /stop is still the same command', parseCommand('/stop').kind === 'cancel');
ok('an unknown slash command is answered with help, never run',
    parseCommand('/deploy everything').kind === 'help');

// ---- /sessions as buttons ----
const live = n => Array.from({ length: n }, (_, i) => ({
    id: 'cs' + i, agentId: 'a', agentName: 'agent' + i, project: '', status: 'idle'
}));
const kb = C.sessionsKeyboard(live(5), 'cs2');
ok('two buttons to a row', kb.length === 3 && kb[0].length === 2 && kb[2].length === 1);
ok('the numbers match the list the reader is looking at', kb[0][0].text === '1. agent0');
ok('the focus is marked on its own button', kb[1][0].text === '🎯 3. agent2');
ok('every callback_data is under the 64-byte ceiling',
    kb.flat().every(b => Buffer.byteLength(b.data) <= D.CALLBACK_LIMIT));
const tap = D.parseTap(kb[0][0].data);
ok('a row taps back through the one door', tap.kind === 'focus' && tap.id === 'cs0');
ok('the keyboard stops before it is longer than the list',
    C.sessionsKeyboard(live(30)).flat().length === C.SESSION_BUTTON_LIMIT);
ok('no conversations is no keyboard', C.sessionsKeyboard([]).length === 0);

// ---- the list a reader scans ----
const R = require(path.join(__dirname, '..', 'out', 'core', 'telegramRouting.js'));
const rows = R.sessionList([
    { id: 'cs1', agentId: 'a', agentName: 'developer', project: 'AgentFarm', status: 'working', turns: 4 },
    { id: 'cs2', agentId: 'b', agentName: 'psikolog', status: 'idle', turns: 2, waiting: 'your answer' },
    { id: 'cs3', agentId: 'c', agentName: 'wiki', status: 'idle' }
], 'cs2');
ok('a row says how far the conversation got', /1\. developer · AgentFarm · working · turn 4/.test(rows));
ok('‼️ and what it has STOPPED for — the reason to open a laptop',
    /2\. psikolog · turn 2 · ⏳ your answer/.test(rows));
ok('…marked as the focus on the same row', /⏳ your answer {2}← focus/.test(rows));
ok('a conversation with nothing to add stays one word', /3\. wiki$/m.test(rows));
ok('a permission is not called a question',
    /⏳ permission: Bash/.test(R.sessionList([{ id: 'x', agentId: 'a', agentName: 'd', waiting: 'permission: Bash' }])));
ok('an empty farm still points somewhere', /No live conversations/.test(R.sessionList([])));

// ---- the wiring, read off the source ----
const fs = require('fs');
const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
ok('/status is gathered once and rendered by the function tested above',
    /const chatStatusText = \(/.test(ext) && /engines: engineUsageMatrix\(\)/.test(ext)
    && /chatSend\(msg\.chatId, chatStatusText\(st, live, focused, bound\)\)/.test(ext));
ok('the bridge shows the SAME screen the phone gets, not a second copy of it',
    /op: 'telegram\.commands'/.test(ext)
    && /status: chatStatusText\(st, live, focused, bound\)/.test(ext)
    && /agents: chatAgentsText\(bound\)/.test(ext));
ok('/cancel <n> really interrupts the turn',
    /cancelTarget\(cmd\.arg\) === 'session'/.test(ext) && /consoleHost\.interrupt\(pick\.session\.id\)/.test(ext));
ok('…and an ambiguous name is asked about rather than guessed',
    /if \(pick\.kind === 'ambiguous'\) \{ await chatSend\(msg\.chatId, askWhich\(pick\.candidates\)\); return; \}/.test(ext));
ok('/sessions ships its keyboard', /sessionsKeyboard\(live, focused\)/.test(ext));
ok('a tapped row becomes the focus', /case 'focus': \{/.test(ext) && /setFocus\(st\.routing, msg\.chatId, tap\.id\)/.test(ext));
ok('/agent <name> <prompt> reaches the run door, budget shield and all',
    /if \(split\.prompt\) \{ await chatRunPrompt\(msg\.chatId, split\.prompt, split\.agent\); return; \}/.test(ext));
ok('‼️ the chat id is offered ONLY while the allowlist is empty',
    /if \(!c\.allow\.length\) \{\s*\n\s*await chatSend\(msg\.chatId,\s*\n\s*`This chat is not allowed/.test(ext));
ok('the two forms of /cancel are in the help', /\/cancel <number> stops a live turn/.test(HELP_TEXT));
ok('…and both forms of /agent', /\/agent <name> <prompt>/.test(HELP_TEXT));
ok('…and that /status now carries the plans', /what is left on each plan/.test(HELP_TEXT));
ok('the list is fed what each conversation is waiting on',
    /waiting: s\.pendingAsk\.questions\.length/.test(ext) && /turns: s\.turns,/.test(ext));

console.log(`test_telegram_commands: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
