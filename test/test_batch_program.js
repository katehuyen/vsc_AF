// WHICH KIND OF PROGRAM A COMMAND LINE STARTS — a batch file never hands control back to the
// script that ran it, so the OS-window launcher has to know before it writes its script
// (src/core/batchProgram.ts; the real round trip through a shim is in test_interactive_targets.js).
// The search is cmd's own, measured against a stand-in disk so it holds on every machine.
'use strict';
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BP = require(path.join(ROOT, 'out', 'core', 'batchProgram.js'));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const has = files => f => files.includes(String(f).toLowerCase());
const env = { PATH: 'C:\\a;C:\\b', PATHEXT: '.COM;.EXE;.BAT;.CMD' };

ok('the program is the first quoted string, else the first word',
    BP.programOf('  "C:\\a b\\c.cmd" x') === 'C:\\a b\\c.cmd' && BP.programOf('opencode run "hi there"') === 'opencode'
    && BP.programOf('') === '');
ok('‼️ a name that resolves to a .cmd or a .bat starts a batch file',
    BP.startsBatchFile('tool run', 'C:\\w', env, has(['c:\\b\\tool.cmd']))
    && BP.startsBatchFile('tool run', 'C:\\w', env, has(['c:\\b\\tool.bat'])));
ok('…and one that resolves to an executable does not',
    !BP.startsBatchFile('tool run', 'C:\\w', env, has(['c:\\b\\tool.exe'])));
ok('an .exe beside a .cmd wins, as cmd itself decides',
    !BP.startsBatchFile('tool run', 'C:\\w', env, has(['c:\\a\\tool.exe', 'c:\\a\\tool.cmd'])));
ok('…a shim in an earlier PATH folder wins over a program in a later one',
    BP.startsBatchFile('tool run', 'C:\\w', env, has(['c:\\a\\tool.cmd', 'c:\\b\\tool.exe'])));
ok('…and the folder the run starts in is searched before PATH',
    BP.startsBatchFile('tool', 'C:\\w', env, has(['c:\\w\\tool.bat', 'c:\\a\\tool.exe'])));
ok('a quoted path with spaces is read whole, and is not looked for on PATH',
    BP.startsBatchFile('"C:\\Program Files\\x\\run.bat" a b', 'C:\\w', env, has(['c:\\program files\\x\\run.bat']))
    && !BP.startsBatchFile('sub\\run a', 'C:\\w', env, has(['c:\\a\\sub\\run.cmd']))
    && BP.startsBatchFile('sub\\run a', 'C:\\w', env, has(['c:\\w\\sub\\run.cmd'])));
ok('a name carrying its own extension is taken as given',
    BP.startsBatchFile('opencode.cmd run', 'C:\\w', env, has(['c:\\b\\opencode.cmd']))
    && !BP.startsBatchFile('opencode.exe run', 'C:\\w', env, has(['c:\\b\\opencode.cmd', 'c:\\b\\opencode.exe'])));
ok('a program nobody can find is left exactly as it was',
    !BP.startsBatchFile('ghost x', 'C:\\w', env, has([])) && !BP.startsBatchFile('', 'C:\\w', env, has([])));
ok('with no PATHEXT stated the machine\'s usual list is assumed',
    BP.startsBatchFile('tool', 'C:\\w', { PATH: 'C:\\a' }, has(['c:\\a\\tool.cmd'])));

console.log(`test_batch_program: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
