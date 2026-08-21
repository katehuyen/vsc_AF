// M-26 — WHERE AN INTERACTIVE TASK OPENS, AND WHETHER IT CLOSES WHEN IT ANSWERS.
//
// ‼️ WHY THIS FILE EXISTS. Two of the three surfaces this item added are things
// the extension does NOT own: an OS terminal window outlives the extension host
// by design, and a Console conversation is the panel's process. Neither can be
// followed by `child.on('exit')`, so each grew its own way of saying "the run
// is over" — an exit file for the window, the panel's own report for the
// Console. Both of those answers pass through a shell or a panel and come back
// as TEXT, which is exactly the class of thing that reads as success when it is
// nothing at all. That is what is pinned here.
//
// The command line, in particular, was measured rather than reasoned about:
// `echo %ERRORLEVEL%> f` is TWO cmd.exe traps in one statement and both of them
// answer "0". See `src/core/extTerminal.ts` for what each one does.
'use strict';
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const B = require(path.join(ROOT, 'out', 'core', 'bridge.js'));
const L = require(path.join(ROOT, 'out', 'core', 'launch.js'));
const EXT = require(path.join(ROOT, 'out', 'core', 'extTerminal.js'));

const tasksTs = read('src', 'core', 'tasks.ts');
const pageJs = read('media', 'tasksPage.js');

/** Capture what `openExternalTerminal` hands to the OS, without launching one. */
function launched(cwd, command, title, opts) {
    const realSpawn = cp.spawn;
    const calls = [];
    cp.spawn = (cmd, args, o) => {
        calls.push({ cmd, args, o });
        return { on() { /* the wt fallback is not exercised */ }, unref() { } };
    };
    try { EXT.openExternalTerminal(cwd, command, title, opts); } finally { cp.spawn = realSpawn; }
    return calls;
}

// ---------- the two closed lists, and what an unknown value becomes ----------
{
    ok('the surfaces are a closed list',
        L.INTERACTIVE_TARGETS.join() === 'vscode,external,console');
    ok('…and so are the closing policies',
        L.INTERACTIVE_CLOSES.join() === 'stay-open,auto-close');
    // ‼️ The DEFAULTS are what every interactive task written before M-26 meant:
    // VS Code's own terminal, and a window that is yours until you close it.
    ok('an unset surface is the integrated terminal',
        L.normInteractiveTarget(undefined) === 'vscode' && L.normInteractiveTarget('') === 'vscode');
    ok('an unset policy stays open', L.normInteractiveClose(undefined) === 'stay-open');
    ok('a value from nowhere degrades to the default rather than throwing',
        L.normInteractiveTarget('wt.exe') === 'vscode' && L.normInteractiveClose('kill') === 'stay-open');
    ok('every choice the form offers is one of the closed values',
        L.TARGET_CHOICES.every(c => L.INTERACTIVE_TARGETS.includes(c.id))
        && L.CLOSE_CHOICES.every(c => L.INTERACTIVE_CLOSES.includes(c.id)));
}

// ---------- the bridge: a closed list is refused, not nearest-matched ----------
{
    const dims = (args, opts) => B.bridgeRunDimensions(args, opts);
    const refused = (args, opts) => {
        try { dims(args, opts); return ''; } catch (e) { return String(e.message); }
    };

    ok('a stated pair rides through on an interactive run',
        (() => {
            const d = dims({ mode: 'interactive', interactiveTarget: 'external', interactiveClose: 'auto-close' });
            return d.interactiveTarget === 'external' && d.interactiveClose === 'auto-close';
        })());
    ok('an unknown surface is refused BY NAME, with the list',
        /unknown interactiveTarget "wt"/.test(refused({ mode: 'interactive', interactiveTarget: 'wt' }))
        && /vscode, external, console/.test(refused({ mode: 'interactive', interactiveTarget: 'wt' })));
    ok('…and so is an unknown closing policy',
        /unknown interactiveClose "kill"/.test(refused({ mode: 'interactive', interactiveClose: 'kill' })));

    // ‼️ THE DEFECT THIS TEST WAS WRITTEN FOR. The refusal used to read
    // `mode === 'headless'`, and `mode` is not required: every door resolves it
    // as `mode === 'interactive' ? … : 'headless'`, so an OMITTED mode is a
    // headless run — and an omitted mode sailed straight past the check.
    ok('‼️ the pair is refused on a run whose mode was never stated',
        /headless \(no mode was stated/.test(refused({ interactiveTarget: 'external' })));
    ok('…and on one that says headless out loud',
        /"headless"/.test(refused({ mode: 'headless', interactiveClose: 'auto-close' })));
    ok('…while a run with neither field is untouched by any of this',
        !refused({ mode: 'headless' }) && !refused({}));

    // A trigger states its mode on the action and its dimensions outside it (or
    // the other way round); a rerun and a template run never restate it at all.
    ok('a caller that already knows the mode may say so',
        dims({ interactiveTarget: 'console' }, { mode: 'interactive' }).interactiveTarget === 'console');
    ok('…and that answer is the one that counts, not the args',
        /headless/.test(refused({ mode: 'interactive', interactiveTarget: 'console' }, { mode: 'headless' })));

    ok('the read-back names the defaults rather than leaving them empty', (() => {
        const out = B.bridgeDimsOut({});
        return out.interactiveTarget === 'vscode' && out.interactiveClose === 'stay-open';
    })());
}

// ---------- the OS terminal: a script, /k vs /c, and the exit file ---------
{
    const f = path.join(os.tmpdir(), 'af-m26-probe.exit');
    const last = calls => calls[0].args[calls[0].args.length - 1];

    if (process.platform === 'win32') {
        const stay = launched('C:\\tmp', 'claude "hi"', 'AF: x', { exitFile: f });
        const go = launched('C:\\tmp', 'claude "hi"', 'AF: x', { keepOpen: false, exitFile: f });
        ok('stay-open hands cmd /k — the window is the person\'s',
            stay[0].args.includes('/k') && !stay[0].args.includes('/c'));
        ok('auto-close hands cmd /c — the window goes when the command returns',
            go[0].args.includes('/c') && !go[0].args.includes('/k'));

        // ‼️ THE DEFECT THIS SECTION EXISTS FOR. What wt is handed is a FILE, not
        // a command line: node escapes an inner `"` the C runtime's way and cmd
        // has never understood that, so a launch carrying a prompt — which is to
        // say every launch — opened a window that ran nothing at all.
        ok('‼️ the command travels as a script, never as a command line',
            /\.cmd$/.test(last(stay)) && last(stay).indexOf('claude') < 0);

        const script = fs.readFileSync(last(stay), 'utf8');
        ok('the script names its own window, runs in the folder, and runs the command',
            /^@echo off/.test(script) && script.indexOf('\ntitle AF: x') >= 0
            && script.indexOf('\ncd /d "C:\\tmp"') >= 0 && script.indexOf('claude "hi"') >= 0);
        ok('‼️ the exit code is read on ITS OWN LINE, which is the only place it is real',
            /\n\(echo %ERRORLEVEL%\)> "/.test(script));
        ok('…and the launcher removes itself, so a window nobody watches leaves nothing',
            /\ndel \/q "%~f0"/.test(script));
        ok('a launch with nothing to report writes no exit line',
            fs.readFileSync(last(launched('C:\\tmp', 'claude "hi"', 'AF: x', {})), 'utf8')
                .indexOf('ERRORLEVEL') < 0);

        // ‼️ THE MEASUREMENT, not the reasoning: the generated script is RUN, for a
        // code that is zero and codes that are not. `echo %ERRORLEVEL%> f` wrote an
        // empty file for every one of them, and an empty file reads as 0.
        const roundTrip = code => {
            try { fs.rmSync(f, { force: true }); } catch { /* nothing to clear */ }
            const s = last(launched(undefined, `node -e "process.exit(${code})"`, 'AF: t',
                { keepOpen: false, exitFile: f }));
            cp.spawnSync('cmd', ['/c', s], { encoding: 'utf8' });
            try { return fs.readFileSync(f, 'utf8').trim(); } catch { return '(NO FILE)'; }
        };
        ok('‼️ a success really writes 0', roundTrip(0) === '0');
        ok('‼️ AND A FAILURE REALLY WRITES ITS CODE — the whole point of the file',
            roundTrip(3) === '3');
        ok('…including exit 1, which the digit-before-`>` trap turned into prose',
            roundTrip(1) === '1');

        // A prompt is text a person wrote; batch treats `%` as a variable.
        const arg = path.join(os.tmpdir(), 'af-m26-arg.txt');
        try { fs.rmSync(arg, { force: true }); } catch { /* nothing to clear */ }
        const PROMPT = '50% done, really! %USERNAME% & <ok>';
        cp.spawnSync('cmd', ['/c', last(launched(undefined,
            `node -e "require('fs').writeFileSync(process.argv[1], process.argv[2])" `
            + `"${arg}" "${PROMPT}"`, 'AF: t', { keepOpen: false }))], { encoding: 'utf8' });
        ok('‼️ a prompt carrying % and ! and & arrives INTACT',
            (() => { try { return fs.readFileSync(arg, 'utf8') === PROMPT; } catch { return false; } })());
        try { fs.rmSync(arg, { force: true }); } catch { /* nothing to clear */ }
        try { fs.rmSync(f, { force: true }); } catch { /* nothing to clear */ }
        for (const c of [stay, go]) { try { fs.rmSync(last(c), { force: true }); } catch { /* gone */ } }
    } else {
        const posix = launched('/tmp', 'claude "hi"', 'AF: x', { keepOpen: false, exitFile: f });
        ok('a POSIX launch writes `$?` to the same file', /\$\?/.test(JSON.stringify(posix[0].args)));
        ok('…and leaves when it is done', /exit|exec \$SHELL/.test(JSON.stringify(posix[0].args)));
    }

    // Pinned in the source too, so the rules survive on a machine that cannot
    // run the round trip above.
    const extTs = read('src', 'core', 'extTerminal.ts');
    ok('‼️ nothing builds the one-line `& echo %ERRORLEVEL%>` chain any more',
        !/\$\{command\} & .*ERRORLEVEL/.test(extTs));
    ok('every % in the command is doubled, because batch reads one as a variable',
        extTs.indexOf("s.split('%').join('%%')") >= 0);
    ok('‼️ the `start` fallback passes an EMPTY title — an unquoted one is read as a program',
        /'\/c', 'start', '',/.test(extTs));
}

// ---------- the manager: three surfaces, and how each one ends ----------
{
    ok('the Console surface is handed to the panel, not given a command line',
        /normInteractiveTarget\(task\.interactiveTarget\) === 'console'/.test(tasksTs)
        && /this\.opts\.startConsoleTask\(\{/.test(tasksTs));
    ok('…and a panel that refuses ends the task instead of leaving it running',
        /the Console could not start it/.test(tasksTs));
    ok('the OS window records the file its exit code will arrive in',
        /task\.exitFile = exitFile;/.test(tasksTs)
        && /keepOpen: close !== 'auto-close'/.test(tasksTs));
    ok('the integrated terminal closes itself with `exit` on its own line',
        /if \(close === 'auto-close'\) \{ terminal\.sendText\('exit', true\); \}/.test(tasksTs));

    // ‼️ auto-close is NOT "the TUI, killed when it looks finished" — nothing in
    // a TUI says the answer is over. The engine is asked in the form that
    // prints and exits, which is the same form the headless path spawns.
    ok('one turn means the engine\'s own print-and-exit form',
        /const oneShot = normInteractiveClose\(task\.interactiveClose\) === 'auto-close';/.test(tasksTs)
        && /oneShot \? runArgs\(engine\.id, dims\) : tuiArgs\(engine\.id, dims\)/.test(tasksTs)
        && /\$\{oneShot \? '-p ' : ''\}/.test(tasksTs));

    // ‼️ THE SECOND DEFECT THIS FILE WAS WRITTEN FOR. One timer drives both
    // followers, and it used to be started on the OS-terminal set alone — so a
    // reloaded window followed its windows and not its Console conversations.
    ok('‼️ a reloaded window picks BOTH kinds of interactive run back up',
        /if \(this\.externalWatch\.size\s*\n\s*\|\| this\.tasks\.some\(t => t\.status === 'running' && t\.consoleSessionId\)\) \{/
            .test(tasksTs));
    ok('…and the timer stops itself once neither kind is left',
        /if \(!this\.externalWatch\.size && !this\.tasks\.some\(/.test(tasksTs));

    // ‼️ THE THIRD. The shell CREATES the file on the redirection and writes a
    // moment later; `Number('')` is 0, so a tick landing in between would have
    // finished a running task as a success.
    ok('‼️ a half-written exit file is "not yet", never a zero',
        /if \(!raw\.trim\(\)\) \{ continue; \}/.test(tasksTs));
    ok('…and one that holds something unreadable fails rather than passes',
        /the OS terminal reported an exit this window could not read/.test(tasksTs)
        && /this\.finish\(task, code === 0 \? 'done' : 'failed'\);/.test(tasksTs));

    // A Console session is idle for the whole moment between being started and
    // being spoken to — ending the task there would end it before the agent
    // had said anything.
    ok('a Console auto-close waits for an ANSWER, not merely for idleness',
        /normInteractiveClose\(task\.interactiveClose\) === 'auto-close' && st\.answered/.test(tasksTs));
    ok('…and a session that ended or failed ends the task either way',
        /st\.state === 'ended'/.test(tasksTs) && /st\.state === 'error'/.test(tasksTs));

    ok('a retry carries the surface and the policy with it',
        /interactiveTarget/.test(tasksTs.slice(tasksTs.indexOf('retryTask'))));
}

// ---------- the form: two boxes that exist only where they mean something ----
{
    ok('the two boxes are drawn only for an interactive run',
        /wantsRun && c\.mode === 'interactive' \? `[\s\S]{0,80}choiceSel\('interactiveTarget'/.test(pageJs));
    ok('…and changing the mode repaints the form so they appear and go',
        /byId\('nt-mode', 'change', \(\) => \{ readComposer\(\); render\(\); \}\)/.test(pageJs));
    ok('…while the half-written draft keeps both values across the repaint',
        /v\('interactiveTarget', 'interactiveTarget'\); v\('interactiveClose', 'interactiveClose'\);/.test(pageJs));
    ok('a new composer opens on the defaults, not on empty',
        /interactiveTarget: 'vscode', interactiveClose: 'stay-open',/.test(pageJs));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
