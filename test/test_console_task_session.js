// X-360 — A CONSOLE TASK'S CARD ID IS NOT A SESSION ID, OUTSIDE THE RELAY TOO.
//
// `consoleSessionId` is the Console CARD's id (cs…); no transcript, no index
// row and no turnAlerts entry is keyed on it. S-85 gave the row the engine's
// own id (`hostedSessionId`) and moved the relay onto it; the three other
// readers below still declared the card id as the session: the launch
// binding (the origin hover went empty AND the clock-and-folder path stood
// down, because the row counted as declared), the finish-sound / mute hop
// (the mute was written onto an id nothing plays for), and the origin map.
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
const body = (from, len) => { const i = ext.indexOf(from); return i < 0 ? '' : ext.slice(i, i + len); };

const bind = body('const publishLaunchBindings = (): void => {', 12000);
// X-533 — the chain is one rule now, src/core/runDeclaredSession.ts
const declared = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'runDeclaredSession.ts'), 'utf8');
ok('the launch binding declares the engine\'s id — never the card\'s',
    /sessionId: runDeclaredSession\(t\),/.test(bind)
    && /return t\.resumeSessionId \|\| t\.hostedSessionId \|\| t\.spawnSessionId \|\| published \|\| undefined;/.test(declared)
    && !/consoleSessionId/.test(declared) && !/sessionId: [^\n]*consoleSessionId/.test(bind));

const sound = body('const applyFinishSounds = (): void => {', 1500);
ok('the finish sound and the mute are written onto the engine\'s id',
    /const sid = t\.hostedSessionId \|\| t\.resumeSessionId \|\| t\.runSessionId \|\| '';/.test(sound)
    && !/const sid = [^\n]*consoleSessionId/.test(sound));

ok('the origin map declares the engine\'s id',
    /const declared = t\.resumeSessionId \|\| t\.hostedSessionId;/.test(ext)
    && !/const declared = [^\n]*consoleSessionId/.test(ext));

ok('…and the row names it itself once the card knows it (tasks.ts)',
    /task\.hostedSessionId = st\.sessionId/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'tasks.ts'), 'utf8')));

console.log(`\ntest_console_task_session: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
