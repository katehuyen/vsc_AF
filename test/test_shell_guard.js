// X-439 — the shell rule held by code: a payload never travels inside a command.
// Every refusal below is a measured way the shell damaged a payload silently;
// every pass below is a command an agent legitimately runs all day, and a guard
// that refused it would be switched off within a week.
'use strict';
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.join(__dirname, '..');
const G = require(path.join(ROOT, 'out', 'core', 'shellGuard.js'));
const { denyResponseBody } = require(path.join(ROOT, 'out', 'core', 'bridgeGuard.js'));
const ask = (command, engine) => G.shellGuardVerdict({ tool: 'Bash', input: { command }, engine });
const ruleOf = (command, engine) => (ask(command, engine) || {}).rule;

// ---------- refused ----------
ok('‼️ a Turkish letter in a payload', ruleOf('node x.js "g\u00f6r\u00fcn\u00fcm"') === 'non-ascii');
ok('…and in a path (Bash cannot open it either)', ruleOf('cat "/d/zone/BEN\u0130 OKU.md"') === 'non-ascii');
ok('…the reason names the code point, not the byte soup', /U\+00F6/.test(ask('echo \u00f6').what));
ok('an em dash or a section sign counts too', ruleOf('echo "a \u2014 b"') === 'non-ascii' && ruleOf('grep "\u00a7" f') === 'non-ascii');
ok('‼️ a backtick on Claude (Git Bash: a substitution, eaten silently)', ruleOf('node -e "console.log(`x`)"', 'claude') === 'backtick');
ok('…the default engine is Claude\'s rules', ruleOf('echo `date`') === 'backtick');
ok('‼️ a heredoc carrying a backslash', ruleOf("cat > f.js <<'EOF'\nconst p = 'D:\\\\zone';\nEOF") === 'heredoc');
ok('‼️ a heredoc carrying ${...} (measured: bad substitution inside a quoted heredoc)',
    ruleOf("cat > p.js <<'EOF'\nout.push(`x ${p.folder}`);\nEOF", 'codex') === 'heredoc');
const tall = "cat > big.txt <<'EOF'\n" + Array.from({ length: G.HEREDOC_MAX_LINES + 1 }, (_, i) => 'line ' + i).join('\n') + '\nEOF';
ok('a heredoc past the line budget is a payload', ruleOf(tall) === 'heredoc' && /21 lines/.test(ask(tall).what));
ok('‼️ one quoted literal past the budget (an inline script / a message)',
    ruleOf('node -e "' + 'x;'.repeat(G.LITERAL_MAX) + '"') === 'long-literal');
ok('…single quotes count the same', ruleOf("git commit -m '" + 'a'.repeat(G.LITERAL_MAX + 1) + "'") === 'long-literal');

// ---------- let through ----------
ok('‼️ a Windows path with backslashes (a path is not a payload)', ask('ls "D:\\zone\\dev\\git" && cd D:\\zone') === undefined);
const commit = 'git commit -m "$(cat <<\'EOF\'\nv1.2 - fix the thing\n\nFull suite 10 files / 20 passed / 0 failed\nEOF\n)"';
ok('‼️ a short ASCII heredoc — the commit-message form the CLI itself recommends', ask(commit) === undefined);
ok('a one-line node -e', ask('node -e "console.log(require(\'./package.json\').version)"') === undefined);
ok('redirections and a here-string are not heredocs', ask('node t.js 2>&1 | tail -3; cat <<< "hi"') === undefined);
ok('an apostrophe inside a # comment opens no quote',
    ask("ls # it's fine\nnode a.js --flag 'x' # don't worry\n" + 'echo ' + 'b '.repeat(400)) === undefined);
ok('a long command made of short words is not "inline text"', ask('node t.js ' + 'arg '.repeat(300)) === undefined);
ok('‼️ Codex: a backtick is PowerShell\'s escape character there, not a trap',
    ask('Get-ChildItem | ForEach-Object { "$_`n" }', 'codex') === undefined);
ok('…but a non-ASCII letter is refused on Codex too (PowerShell 5.1 re-encodes it)', ruleOf('Write-Output "\u015f"', 'codex') === 'non-ascii');
ok('only the shell tool is guarded — Write carries payloads by design',
    G.shellGuardVerdict({ tool: 'Write', input: { command: 'echo `\u00f6`' } }) === undefined
    && G.shellGuardVerdict({ tool: 'PowerShell', input: { command: 'echo \u00f6' } }) === undefined);
ok('an argv-shaped command is read the same', G.shellGuardVerdict({ tool: 'Bash', input: { command: ['echo', '\u00e7'] } }).rule === 'non-ascii');

// ---------- the way out ----------
ok('‼️ the escape word always runs', ask('echo "\u00f6 `x`" # ' + G.SHELL_GUARD_ESCAPE) === undefined);
const v = ask('echo \u00fc');
ok('the refusal says what to do: Write a file, name it', /Write tool/.test(v.reason) && /NAME the file/.test(v.reason));
ok('…and names the way out', v.reason.includes(G.SHELL_GUARD_ESCAPE));
ok('…in ASCII, so the refusal cannot be damaged the same way', !/[^\x00-\x7F]/.test(v.reason));
const body = JSON.parse(denyResponseBody('PreToolUse', v));
ok('the deny shape is the bridge guard\'s — the CLI never runs the call',
    body.hookSpecificOutput.permissionDecision === 'deny' && body.hookSpecificOutput.permissionDecisionReason === v.reason);

// ---------- engines ----------
ok('a Codex payload is known by its rollout transcript',
    G.hookEngineOf('C:/Users/u/.codex/sessions/2026/09/30/rollout-2026-09-30T10-00-00-abc.jsonl') === 'codex'
    && G.hookEngineOf('C:/Users/u/.claude/projects/x/abc.jsonl') === 'claude' && G.hookEngineOf(undefined) === 'claude');
ok('which rules stand where', G.shellGuardRules('claude').length === 4
    && !G.shellGuardRules('codex').includes('backtick') && G.shellGuardRules('gemini').length === 0);

// ---------- the wiring ----------
{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8').replace(/\r\n/g, '\n');
    const guard = ext.slice(ext.indexOf('toolGuard: (p) => {'), ext.indexOf('stuckThresholdMs:', ext.indexOf('toolGuard: (p) => {')));
    ok('‼️ the hook asks the shell guard, with the engine read off the payload',
        /shellGuardVerdict\(\{[\s\S]*engine: hookEngineOf\(p\.transcript_path\)/.test(guard));
    ok('…after the bridge guard, which keeps its own switch', guard.indexOf('bridgeGuardVerdict') < guard.indexOf('shellGuardVerdict')
        && /get<boolean>\('bridgeGuard', true\)/.test(guard) && /get<boolean>\('shellGuard', true\)/.test(guard));
    ok('…and every refusal is kept, across reloads',
        /shellGuardLog\.add\(/.test(guard) && /new BridgeGuardLog<ShellGuardCatch>\(path\.join\(context\.globalStorageUri\.fsPath, 'shell-guard\.json'\)\)/.test(ext)
        && /shellGuardLog\.flush\(\)/.test(ext));
    const opBlock = ext.slice(ext.indexOf("op: 'sessions.shellGuard'"), ext.indexOf("op: 'sessions.recent'"));
    ok('the bridge op reports on/off, the escape, per-engine rules and the catches',
        /on: cfg\(\)\.get<boolean>\('shellGuard'/.test(opBlock) && /escape: SHELL_GUARD_ESCAPE/.test(opBlock)
        && /shellGuardRules\(e\)/.test(opBlock) && /catches:/.test(opBlock) && /forSession\(session\)/.test(opBlock));
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const props = pkg.contributes.configuration.properties || (pkg.contributes.configuration[0] || {}).properties || {};
    ok('the guard is a setting, on by default, beside the bridge guard',
        props['agentFarm.shellGuard'] && props['agentFarm.shellGuard'].default === true
        && require('../out/core/settingsCatalog/index.js').catalogEntry('shellGuard').group === require('../out/core/settingsCatalog/index.js').catalogEntry('bridgeGuard').group);
    ok('the payload type carries the transcript path the engine is read from',
        /transcript_path\?: string;\s*\n?\s*\}\) => string \| undefined;/.test(fs.readFileSync(path.join(ROOT, 'src', 'core', 'live.ts'), 'utf8')));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
