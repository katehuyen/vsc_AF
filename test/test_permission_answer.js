// U-119 — ANSWERING A BLOCKED SESSION FROM THE PAGE, not from a hunt for a window.
//
// Agent Farm always KNEW: the live monitor puts a session that stops for
// permission into `waiting-permission` and Needs You draws a row for it. What
// the row then offered was "⌨ Terminal" — a signpost. So the farm's answer to
// "an agent is blocked on you" was to send the user looking, and on 2026-08-28
// a session sat blocked for an hour and a half with no alert of any kind.
//
// Esc had been typed into these terminals since the interrupt was built, so the
// channel existed; only the other half of it was missing.
//
// ‼️ AND WHAT IS CLAIMED IS EXACTLY WHAT IS KNOWN. Nothing here can see the
// prompt or read an answer back, so every path reports WHICH KEYS were sent and
// never that the tool was allowed — a "done" over a prompt that did not move
// would be the same false promise the signpost was, in a better font.
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const {
    describeKeys, INTERRUPT_KEY, PERMISSION_KEYS, permissionKeys, resolveInterrupt
} = require(path.join(ROOT, 'out/core/interrupt.js'));
const { buildNeedsQueue } = require(path.join(ROOT, 'out/core/needs.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ------------------------------------------------------------- which keys
{
    ok('allow is the first entry of the chooser', PERMISSION_KEYS.allow === '1');
    ok('“and stop asking” is a SEPARATE answer, not a faster one',
        PERMISSION_KEYS.allowAlways === '2' && PERMISSION_KEYS.allow !== PERMISSION_KEYS.allowAlways);
    ok('‼️ reject is ESC — the one answer here that is measured rather than'
        + ' reasoned, because it is what Interrupt has always sent',
        PERMISSION_KEYS.deny === INTERRUPT_KEY);

    ok('with no setting, the built-in is used and says so',
        permissionKeys('allow').keys === '1' && permissionKeys('allow').fromSetting === false);
    ok('a setting wins, and says THAT', (() => {
        const r = permissionKeys('allow', { allow: 'y\r' });
        return r.keys === 'y\r' && r.fromSetting === true;
    })());

    // ‼️ AN EMPTY FIELD MEANS "THE BUILT-IN", NEVER "SEND NOTHING". A control
    // that quietly sent an empty string would report success and answer
    // nothing — which is the exact failure this feature exists to end.
    ok('an empty setting falls back rather than sending nothing',
        permissionKeys('deny', { deny: '' }).keys === INTERRUPT_KEY);
    ok('…and so does one somebody typed a number into',
        permissionKeys('allow', { allow: 1 }).keys === '1'
        && permissionKeys('allow', { allow: 1 }).fromSetting === false);
    ok('…and an unrelated settings object changes nothing',
        permissionKeys('allow', { deny: 'q' }).keys === '1');

    // What the user is told. "sent ESC" is a byte, not an answer.
    ok('ESC reads back as ESC', describeKeys(INTERRUPT_KEY) === 'ESC');
    ok('Enter reads back as Enter', describeKeys('\r') === 'Enter');
    ok('a control byte is named rather than printed',
        describeKeys(String.fromCharCode(3)) === 'Ctrl-C');
    ok('an ordinary key is itself', describeKeys('1') === '1');
    ok('a sequence is spelled out in order', describeKeys('y\r') === 'y Enter');
}

// --------------------------------------------------- which terminal gets them
// The answer travels the SAME resolution the interrupt uses. Two answers to
// "which terminal is this session's?" is how they drift apart, and typing an
// allow into the wrong window is worse than typing an Esc into it.
{
    const term = (title, sessionId, i) => ({
        title, sessionId, hasTerminal: true, terminalIndex: i
    });
    const t = resolveInterrupt({
        sessionId: 's1', agentName: 'dev',
        bindings: [term('claude: dev', 's1', 0)],
        terminalNames: ['claude: dev']
    });
    ok('the session’s own terminal is the target', t.kind === 'integrated' && t.terminalIndex === 0);

    // ‼️ AN EXTERNAL WINDOW IS REFUSED BY NAME. It is not ours to type into, and
    // an Allow that silently went nowhere would be the worst of both worlds.
    const ext = resolveInterrupt({
        sessionId: 's1', agentName: 'dev',
        bindings: [{ title: 'claude: dev', sessionId: 's1', hasTerminal: false }],
        terminalNames: ['claude: dev']
    });
    ok('a session in an OS window is not typed into', ext.kind === 'external');

    // A session nothing can identify gets a "no" rather than a guess: focusing
    // a random claude window is harmless, allowing a tool in one is not.
    const anon = resolveInterrupt({ sessionId: 'x', bindings: [], terminalNames: ['claude: dev'] });
    ok('an unidentifiable session is refused, not guessed at', anon.kind === 'none');
}

// --------------------------------------------------------------- the row
{
    const [row] = buildNeedsQueue({
        liveSessions: [{
            sessionId: 's1', agentName: 'dev', status: 'waiting-permission',
            lastPrompt: 'rm -f something', lastEventTs: 1, transcriptPath: 'x'
        }],
        approvals: [], insights: []
    });
    const ids = row.actions.map(a => a.id);
    ok('a blocked row can be ANSWERED from the queue',
        ids.includes('permission-allow') && ids.includes('permission-deny'));
    ok('…and Allow comes first, because it is the common answer',
        ids.indexOf('permission-allow') === 0 && ids.indexOf('permission-deny') === 1);
    // ‼️ THE SIGNPOST STAYS, BEHIND THEM. An external terminal cannot be typed
    // into, and a prompt that does not take our keys still has to be answerable
    // by hand — removing the way out would trade one dead end for another.
    ok('the way to the terminal is still there', ids.includes('focus-terminal'));
    ok('…and it is no longer the first thing offered',
        ids.indexOf('focus-terminal') > ids.indexOf('permission-deny'));

    // A stalled session is not a blocked one: there is no prompt to answer, and
    // offering Allow over a session that is merely stuck would send a keystroke
    // into a running turn.
    const [stalled] = buildNeedsQueue({
        liveSessions: [{
            sessionId: 's2', agentName: 'dev', status: 'stalled', lastEventTs: 1
        }],
        approvals: [], insights: []
    });
    ok('a stalled row is not offered an answer to a prompt it has not got',
        !stalled.actions.some(a => a.id.startsWith('permission-')));
}

// ------------------------------------------------ the extension's own wiring
// Source-text checks: the host half cannot be loaded without VS Code, and the
// three things that would silently break this are all visible in it.
{
    const fs = require('fs');
    const ext = fs.readFileSync(path.join(ROOT, 'src/extension.ts'), 'utf8');

    ok('the answer goes through ONE terminal resolution, the interrupt’s',
        /const answerSessionPermission[\s\S]{0,2000}?resolveInterrupt\(\{/.test(ext));
    ok('‼️ a HOSTED conversation is answered properly instead — it has a real'
        + ' option id, and a terminal it does not have could not be typed into',
        /const answerSessionPermission[\s\S]{0,1200}?consoleHost\.answer\(hosted\.id/.test(ext));
    ok('the terminal is SHOWN before the keys go in, so the user watches it move',
        /term\.show\(\);\s*\n\s*term\.sendText\(keys, false\)/.test(ext));
    ok('keys are sent as keypresses, never as a line',
        /term\.sendText\(keys, false\)/.test(ext) && !/term\.sendText\(keys, true\)/.test(ext));
    ok('the message names the keys rather than claiming the tool was allowed',
        /typed \$\{describeKeys\(keys\)\}/.test(ext));
    ok('the bridge op says the same thing in the same words',
        /sessions\.answerPermission/.test(ext)
        && /whether the prompt accepted them is only visible in the terminal/.test(ext));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
