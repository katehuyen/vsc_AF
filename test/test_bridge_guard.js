// B-23 — THE BRIDGE RULE, HELD BY CODE: a session id is not searched for on disk.
//
// ‼️ WHAT THIS SUITE IS WATCHING. Agent Farm's own data is asked of the bridge;
// that is written down and it is quietly broken. Measured 2026-09-17: two runs
// went hunting for a session id through the file system, one for over ten
// minutes, while `af.js sessions.find q=<id>` answers in one call.
//
// This guard sits in front of EVERY tool call every agent on this machine
// makes, so the failure to fear is not "it missed one" — it is "it fired on
// something ordinary". Six ways that happens, each held here:
//   1. IT REFUSES A TOOL THAT IS NOT A SEARCH. An Edit, a Write, a Read of a
//      named path, `node build.js` — none of them is hunting for anything.
//   2. IT REFUSES A GIT HASH. An 8-character hex string is every abbreviated
//      commit there is; the SHORT form is only an id when this machine says so.
//   3. IT REFUSES THE CALL THAT OBEYS IT. `af.js sessions.find q=<id>` carries
//      an id by definition and must go through.
//   4. IT HAS NO WAY OUT. A legitimate file operation on a transcript exists;
//      a refusal with no escape teaches an agent to fight the guard.
//   5. IT ANSWERS THE WRONG SHAPE. Only PreToolUse can be denied, and the CLI
//      reads `permissionDecision` / `permissionDecisionReason` and nothing else.
//   6. IT SAYS "NO" AND NOTHING MORE. The refusal has to carry the call that
//      answers the question, or the agent just tries a different search.
//
//   node test/test_bridge_guard.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want));

const B = require(path.join(ROOT, 'out', 'core', 'bridgeGuard.js'));

const FULL = '019fe7bc-545c-70d2-9a11-0b1c2d3e4f50';
const SHORT = '019fe7bc';
const KNOWN = [FULL, 'b19bd67f-c086-436a-8261-db239491084b'];
const ask = (tool, input, known) => B.bridgeGuardVerdict({ tool, input, known: known ?? KNOWN });

console.log('\n== what is a search — and what is merely a command that mentions a path ==');
{
    ok('Grep is always a search', B.isSearchCall('Grep', 'anything'));
    ok('Glob too', B.isSearchCall('Glob', 'anything'));
    ok('a shell `grep` is', B.isSearchCall('Bash', 'grep -r foo .'));
    ok('…and `rg`, `find`, `ls`, `dir`',
        B.isSearchCall('Bash', 'rg foo') && B.isSearchCall('Bash', 'find . -name x')
        && B.isSearchCall('Bash', 'ls -la') && B.isSearchCall('Bash', 'dir /s'));
    ok('…and PowerShell\'s own', B.isSearchCall('PowerShell', 'Get-ChildItem -Recurse')
        && B.isSearchCall('PowerShell', 'Select-String -Pattern x'));
    ok('‼️ a shell command that is not a search is not one', !B.isSearchCall('Bash', 'node build.js --out dir/x'));
    ok('‼️ nor is a word that merely CONTAINS one', !B.isSearchCall('Bash', 'npm run findall'));
    ok('‼️ Edit, Write and Read are never searches',
        !B.isSearchCall('Edit', 'grep') && !B.isSearchCall('Write', 'find') && !B.isSearchCall('Read', 'ls'));
}

console.log('\n== the refusal — a full id in a search, and almost nothing else ==');
{
    const v = ask('Grep', { pattern: FULL });
    eq('a full session id in a Grep is refused, by the id itself', [v && v.how, v && v.id], ['full', FULL]);
    ok('…and the tool is named on the verdict', v.tool === 'Grep');
    ok('a full id in a shell search is refused too',
        (ask('Bash', { command: `rg ${FULL} ~/.claude` }) || {}).how === 'full');
    ok('‼️ a full id that this machine has never heard of is STILL an id — nothing else takes that shape',
        (ask('Grep', { pattern: '11111111-2222-3333-4444-555555555555' }, []) || {}).how === 'full');

    const s = ask('Bash', { command: `grep -rl ${SHORT} .` });
    eq('a SHORT id this machine knows is refused', [s && s.how, s && s.id], ['known', SHORT]);
    ok('‼️ …and an 8-hex string it does NOT know goes through — that is every git hash there is',
        ask('Bash', { command: 'git log --oneline deadbeef' }) === undefined);
    ok('‼️ …including when nothing is known at all', ask('Grep', { pattern: SHORT }, []) === undefined);
    ok('the short form is matched however the host wrote the known id (dashes, case)',
        (ask('Grep', { pattern: '019FE7BC' }, ['019FE7BC-545C-70D2-9A11-0B1C2D3E4F50']) || {}).how === 'known');
}

console.log('\n== what is never refused ==');
{
    ok('‼️ the call that OBEYS the rule', ask('Bash', { command: `node af.js sessions.find q=${FULL}` }) === undefined);
    ok('…by any of its names', ask('Bash', { command: `rg "sessions.read id=${FULL}"` }) === undefined);
    ok('‼️ the escape hatch always runs, and it is stated in the refusal itself',
        ask('Bash', { command: `rg ${FULL} . # ${B.BRIDGE_GUARD_ESCAPE}` }) === undefined
        && B.refusalFor(FULL, 'full').includes(B.BRIDGE_GUARD_ESCAPE));
    ok('a tool that only WRITES is untouched, id or no id',
        ask('Write', { file_path: `notes/${FULL}.md` }) === undefined);
    ok('an Edit on the transcript itself is untouched', ask('Edit', { file_path: `${FULL}.jsonl` }) === undefined);
    ok('an empty input is nothing to judge', ask('Grep', {}) === undefined && ask('Grep', undefined) === undefined);
    ok('a search with no id in it is an ordinary search',
        ask('Grep', { pattern: 'contextSignalView' }) === undefined);
}

console.log('\n== the sentence — a refusal that does not say what to run instead is just a wall ==');
{
    const r = B.refusalFor(FULL, 'full');
    ok('it names the string as a session id', r.includes(FULL) && /session id/.test(r));
    ok('it carries the call that answers the question', r.includes(B.BRIDGE_FIND_HINT));
    ok('…and the one that hands over the conversation', /sessions\.read id=/.test(r));
    ok('it says WHY, not just no', /layout is the engine's and it changes/.test(r));
    ok('the known-short wording says the machine is the authority',
        /the id of a session this machine knows/.test(B.refusalFor(SHORT, 'known')));
    ok('it is one paragraph, not an essay', r.length < 700);
}

console.log('\n== the wire — the CLI\'s deny shape, on the one event that can carry it ==');
{
    const v = ask('Grep', { pattern: FULL });
    const body = JSON.parse(B.denyResponseBody('PreToolUse', v));
    eq('PreToolUse is answered with the CLI\'s own deny fields',
        [body.hookSpecificOutput.hookEventName, body.hookSpecificOutput.permissionDecision],
        ['PreToolUse', 'deny']);
    ok('…and the reason is the sentence the agent reads',
        body.hookSpecificOutput.permissionDecisionReason === v.reason);
    eq('PostToolUse cannot deny anything — the call already ran', B.denyResponseBody('PostToolUse', v), undefined);
    eq('nothing to refuse is no answer at all, so the ordinary one stands',
        B.denyResponseBody('PreToolUse', undefined), undefined);
}

console.log('\n== the wiring — the listener, the setting and the bridge op ==');
{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const live = fs.readFileSync(path.join(ROOT, 'src', 'core', 'live.ts'), 'utf8');
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const props = pkg.contributes.configuration.properties || (pkg.contributes.configuration[0] || {}).properties || {};
    eq('the guard is a setting, on by default', props['agentFarm.bridgeGuard'].default, true);
    ok('‼️ the refusal OUTRANKS the context signal on PreToolUse — a call that will not run has no next step',
        /cfg\.toolGuard\?\.\(payload\)\s*\?\?\s*hookResponseBody\(/.test(live));
    ok('the host asks the guard only on PreToolUse, and only while the setting is on',
        /get<boolean>\('bridgeGuard', true\)/.test(ext) && /p\.hook_event_name !== 'PreToolUse'/.test(ext));
    ok('‼️ the known ids are CACHED — this runs on every tool call of every agent here',
        /knownIdCache/.test(ext) && /30_000/.test(ext));
    ok('…and they are the SHORT forms, which is what a hex match can be compared against',
        /slice\(0, 8\)/.test(ext.slice(ext.indexOf('const knownSessionIds'), ext.indexOf('const bridgeGuardCatches'))));
    const opBlock = ext.slice(ext.indexOf("op: 'sessions.bridgeGuard'"), ext.indexOf("op: 'sessions.recent'"));
    ok('every refusal is counted and readable, so the rule is visible rather than trusted',
        /bridgeGuardCatches/.test(opBlock) && /catches:/.test(opBlock) && /on: cfg\(\)\.get<boolean>\('bridgeGuard'/.test(opBlock));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
