// X-505 — every session is told, at its start, how to reach Agent Farm: a shell command, not an MCP tool.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const T = require(path.join(ROOT, 'out', 'core', 'bridgeStartText.js'));
const W = require(path.join(ROOT, 'out', 'core', 'workArea.js'));

const af = 'C:\\Users\\u\\AppData\\Roaming\\Code\\User\\globalStorage\\muvusoft.agent-farm\\bridge\\af.js';
const t = T.bridgeStartText(af);
ok('the line names the command with the staged script, quoted', t.includes(`node "${af}" <op> [@args.json]`));
ok('…says it is not an MCP tool and is the same for every engine and account',
    /not an MCP tool/.test(t) && /every engine and account/.test(t));
ok('…and names the op that lists the rest', t.includes(`node "${af}" farm.ops lists every op`));
ok('one line, no newline inside it', !/\n/.test(t));
const body = JSON.parse(W.startContextBody('SessionStart', t));
ok('it travels as SessionStart additional context', body.hookSpecificOutput.additionalContext === t);

const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
ok('‼️ the host hands every start the bridge line, from the staged script\'s own path',
    /bridgeStartText\(stagedBridgeCliPath\(context\.globalStorageUri\.fsPath\)\)\s*\]\.filter\(Boolean\)\.join\('\\n'\)\)/.test(ext));
ok('…beside the work-area line, which still needs SessionStart and the folder', /p\.hook_event_name === 'SessionStart' && ensureWorkArea\(\) \? workAreaStartText\(workArea\.path\) : ''/.test(ext));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
