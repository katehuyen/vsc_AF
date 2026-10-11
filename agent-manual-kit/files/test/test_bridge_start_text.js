// X-505 · X-536 — every session is told, at its start, how to reach Agent Farm: the Agent Manual's start card.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const SC = require(path.join(ROOT, 'out', 'core', 'startCard.js'));
const W = require(path.join(ROOT, 'out', 'core', 'workArea.js'));

const template = fs.readFileSync(path.join(ROOT, 'manual', 'card.md'), 'utf8');
const af = 'node "C:/Users/u/.agentfarm/af.js"';
const card = SC.startCardText('card', template, af, '3.999.0');
ok('the card names the command, quoted, with its argument forms', card.includes(`${af} <op> [key=value ...] [@args.json]`));
ok('…its first call and the two that follow', card.includes(`${af} farm.guide`) && /farm\.find/.test(card) && /farm\.ops op=/.test(card));
ok('…says it acts rather than describes, never edits Agent Farm\'s files, and asks before paid runs',
    /do it through this command/.test(card) && /Never edit Agent Farm's files/.test(card) && /\[run\]/.test(card));
ok('…and stays under 1600 characters', card.length < 1600);
const line = SC.startCardText('line', template, af, '3.999.0');
ok('line mode is one line: the command, not an MCP tool, and farm.guide', !/\n/.test(line) && /not an MCP tool/.test(line) && line.includes(`${af} farm.guide`));
const body = JSON.parse(W.startContextBody('SessionStart', card));
ok('it travels as SessionStart additional context', body.hookSpecificOutput.additionalContext === card);

const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
ok('‼️ the host hands every start the start card', /startCardNow\(\)\s*\]\.filter\(Boolean\)\.join\('\\n'\)\)/.test(ext));
ok('…beside the work-area line, which still needs SessionStart and the folder', /p\.hook_event_name === 'SessionStart' && ensureWorkArea\(\) \? workAreaStartText\(workArea\.path\) : ''/.test(ext));
ok('…and the per-turn engines carry it in front of their first prompt (tasks and Console)',
    /startCardFor: \(engine\) => startCardForEngine\(engine\)/.test(ext) && /consoleHost\.setStartCard\(startCardForEngine\)/.test(ext));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
