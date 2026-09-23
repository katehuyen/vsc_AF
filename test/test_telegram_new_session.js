// U-138 — THE PHONE OPENS A REAL CONSOLE SESSION: `/new <agent> [prompt]`.
//
// ‼️ WHAT THIS FILE IS THE PROOF OF. `/agent <name> <prompt>` stays a headless
// run; `/new` is the eleventh launch door, and a door here has four duties
// every other door already has: it seeds from and records into the last-used
// layer (S-34) rather than inventing a setup, it refuses a spent budget BEFORE
// anything spawns, it bills the conversation against the phone's cap for as
// long as it lives (the cost mark is set the moment it opens), and it focuses
// the chat on it — which is what makes the turn card (U-114) come here and a
// message typed while it works wait in the queue (U-115). The pure half is
// driven; the wiring is read where it lives.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const L = require(path.join(ROOT, 'out', 'core', 'telegramLaunch.js'));
const M = require(path.join(ROOT, 'out', 'core', 'messaging.js'));

const NAMES = ['developer', 'dev ops', 'manager'];
const DAY = '2026-09-23';
const base = { names: NAMES, ledger: { day: DAY, usd: 0.5 }, capUSD: 2, day: DAY, spent: '$0.50', cap: '$2.00' };
const v = (arg, over = {}) => L.phoneLaunchVerdict({ ...base, arg, ...over });

// ================================================================ the command
ok('/new is its own command', M.parseCommand('/new developer fix it').kind === 'new'
    && M.parseCommand('/new developer fix it').agent === 'developer fix it');
ok('/new@botname works in a group', M.parseCommand('/new@farmbot manager').agent === 'manager');
ok('a bare /new carries no agent', M.parseCommand('/new').kind === 'new' && M.parseCommand('/new').agent === '');
ok('/agent is still the headless door', M.parseCommand('/agent developer go').kind === 'use');
ok('the help names the new door beside the old one',
    /\/new <agent> \[prompt\]/.test(M.HELP_TEXT) && /\/agent <name> <prompt>/.test(M.HELP_TEXT));

// ================================================================ the verdict
{
    const r = v('developer run the tests');
    ok('a name and a prompt start that agent with that prompt', r.do === 'start' && r.agent === 'developer' && r.prompt === 'run the tests');
    const spaced = v('Dev Ops check the logs');
    ok('the longest name wins, in any case — a folder name can carry a space',
        spaced.do === 'start' && spaced.agent === 'dev ops' && spaced.prompt === 'check the logs');
    const bare = v('manager');
    ok('a name alone opens a session waiting for its first message', bare.do === 'start' && bare.prompt === '');
}
{
    const typo = v('develper run the tests', { bound: 'developer' });
    ok('‼️ a name nobody has is refused, never run on the bound agent', typo.do === 'refuse' && /No agent called "develper"/.test(typo.text));
    const bound = v('', { bound: 'Manager' });
    ok('a bare /new means the agent this chat is bound to', bound.do === 'start' && bound.agent === 'manager' && bound.prompt === '');
    ok('…and with nothing bound it asks which', v('').do === 'refuse' && /Which agent\?/.test(v('').text));
}
{
    const spent = v('developer go', { ledger: { day: DAY, usd: 2 } });
    ok('‼️ a spent budget refuses the door before anything spawns', spent.do === 'refuse' && /budget is used up \(\$0\.50 of \$2\.00\)/.test(spent.text));
    ok('a cap of 0 means no chat-started session at all', v('developer go', { capUSD: 0 }).do === 'refuse');
    ok('yesterday\'s spend does not count today', v('developer go', { ledger: { day: '2026-09-22', usd: 9 } }).do === 'start');
}
{
    const t = L.phoneOpenedText('developer · Agent Farm', 3, 'run the tests');
    ok('the answer names the number /focus takes and that the chat is focused', /#3 in \/sessions/.test(t) && /focused on it/.test(t));
    ok('…says the first turn is running when there was a prompt', /first turn is running/.test(t));
    ok('…and that it waits for a message when there was none', /waiting for its first message/.test(L.phoneOpenedText('x', 1, '')));
    ok('…and that a message written while it works waits', /waits for the turn to end/.test(t));
}

// ================================================================ the wiring
{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const at = ext.indexOf('const chatOpenSession = async (');
    const door = at >= 0 ? ext.slice(at, at + 2600) : '';
    ok('the phone door exists', !!door);
    ok('‼️ it asks the verdict first — name, bound agent, budget', /phoneLaunchVerdict\(\{/.test(door));
    ok('‼️ it seeds from the last-used layer (S-34)', /seedLastLaunch\(agent\.id, \{ prompt: v\.prompt \}\)/.test(door));
    ok('…starts through the one Console start every door uses', /startConsoleSession\(agent, o\)/.test(door));
    ok('…and records what it ran, as a console launch', /rememberLaunch\(agent\.id, o, 'console'\)/.test(door));
    ok('‼️ a refusal at the start reaches the phone, not only the window', /'refused' in started/.test(door));
    ok('‼️ the budget covers the whole conversation: its cost mark is set as it opens',
        /chargeTurn\(st\.seen, started\.id, 0\)\.seen/.test(door));
    ok('‼️ the chat is focused on it, so its card comes here and busy messages queue',
        /setFocus\(st\.routing, chatId, started\.id\)/.test(door));
    ok('…and the answer is sent FOR the session, so a reply to it routes there',
        /phoneOpenedText\([^)]*\), started\.id\)/.test(door));
    ok('the dispatcher sends /new to it', /if \(cmd\.kind === 'new'\) \{ await chatOpenSession\(msg\.chatId, cmd\.agent, bound\); return; \}/.test(ext));
    const start = ext.slice(ext.indexOf('const startConsoleSession = ('), ext.indexOf('const consoleRowId = ('));
    ok('startConsoleSession says what happened instead of answering void',
        /\): \{ id: string \} \| \{ refused: string \} => \{/.test(start) && /return \{ id \};/.test(start));
    ok('…and its refusals are returned as well as shown', (start.match(/return \{ refused[ :}]/g) || []).length === 2);
    ok('telegram.commands names the op /new stands on', /\/new → console\.start/.test(ext));
}

console.log(`test_telegram_new_session: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
