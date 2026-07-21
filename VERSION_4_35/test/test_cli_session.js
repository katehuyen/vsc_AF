// E1: buildCliCommand session-launch behavior (empty prompt) + last-used sort logic.
const Module = require('module');
const origLoad = Module._load;
Module._load = function (r) { if (r === 'vscode') { return { EventEmitter: class { get event() { return () => ({ dispose() {} }); } fire() {} dispose() {} }, window: { onDidCloseTerminal: () => ({ dispose() {} }) } }; } return origLoad.apply(this, arguments); };
const { buildCliCommand } = require(require('path').resolve(__dirname, '../out/core/tasks.js'));

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (got === want) { pass++; } else { fail++; console.log(`  FAIL ${n}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); } };

// interactive session launch = empty prompt/args
eq('bare launcher', buildCliCommand('gemini', '', ''), 'gemini');
eq('launcher w/ subcommand', buildCliCommand('gemini chat', '', ''), 'gemini chat');
eq('prompt placeholder collapses', buildCliCommand('gemini "{prompt}"', '', ''), 'gemini ""');
eq('args placeholder stripped', buildCliCommand('codex --interactive {args}', '', ''), 'codex --interactive');

// last-used sort (mirror of the command's inline logic)
const sortByLast = (ids, last) => ids.slice().sort((a, b) => (a === last ? -1 : 0) - (b === last ? -1 : 0));
eq('claude default first', sortByLast(['claude', 'gemini', 'codex'], 'claude').join(','), 'claude,gemini,codex');
eq('last-used profile floats up', sortByLast(['claude', 'gemini', 'codex'], 'codex').join(','), 'codex,claude,gemini');
eq('stable when last absent', sortByLast(['claude', 'gemini'], 'zzz').join(','), 'claude,gemini');

Module._load = origLoad;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
