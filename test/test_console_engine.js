// The engine axis: what a per-turn engine's command line is, and what a
// permission mode MEANS on an engine that cannot stop and ask.
//
// ‼️ EVERY NUMBER AND FLAG HERE WAS MEASURED AGAINST codex-cli 0.147.0 ON THIS
// MACHINE (2026-08-10), and the measurements are the reason the file exists:
//
//   · `codex exec resume <id>` REFUSES `-s` and `-C` — exit code 2. They are
//     not optional there, they are rejected. So the two shapes do NOT share a
//     flag vocabulary, and a resume built like a first turn simply fails.
//   · The sandbox survives a resume as `-c sandbox_mode=…`, which resume does
//     accept (verified with `--strict-config`, which errors on any key it does
//     not recognise — so the key is real, not tolerated).
//   · The prompt travels on STDIN with an explicit `-`: given as an argument
//     the CLI still drains stdin when stdin is a pipe and waits for a second
//     copy of the message that never comes.
const path = require('path');
const E = require(path.join(__dirname, '..', 'out', 'core', 'consoleEngine.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------- which engine ----------
{
    ok('an unknown engine is Claude — every caller written before engines existed meant that',
        E.engineOf(undefined).id === 'claude' && E.engineOf('').id === 'claude'
        && E.engineOf('nonsense').id === 'claude');
    ok('Claude is one process for the session', E.engineOf('claude').shape === 'persistent');
    ok('Codex is one process per turn', E.engineOf('codex').shape === 'perTurn');
    ok('‼️ and a per-turn engine has no live controls — there is no process '
        + 'between turns to send a control request to',
        E.engineOf('codex').liveControls === false && E.engineOf('claude').liveControls === true);
    ok('‼️ a subscription engine reports no cost, and the surfaces have to know that '
        + 'before they print a dollar sign',
        E.engineOf('codex').reportsCost === false && E.engineOf('claude').reportsCost === true);
}

// ---------- the first turn ----------
{
    const a = E.codexArgs({ cwd: 'D:\\work\\repo', permissionMode: 'default' });
    ok('it is a non-interactive exec that streams JSONL',
        a[0] === 'exec' && a.includes('--json'));
    ok('the working folder is given', a.includes('-C') && a.includes('"D:\\work\\repo"'));
    ok('‼️ the prompt is read from stdin — an argument would leave the CLI waiting '
        + 'for a second copy of the message', a[a.length - 1] === '-');
    ok('a mode that means "ask me" becomes the only honest thing an engine that '
        + 'cannot ask can do: read-only',
        a.join(' ').includes('sandbox_mode="read-only"'));

    const m = E.codexArgs({ model: 'gpt-5-codex', effort: 'low' });
    ok('the model is a flag', m.includes('-m') && m.includes('gpt-5-codex'));
    ok('…and the effort is a config key, because that is what survives a resume',
        m.join(' ').includes('model_reasoning_effort="low"'));
    const img = E.codexArgs({ images: ['D:\\a.png', 'D:\\b.png'] });
    ok('an image is attached the only way this engine can SEE one',
        img.filter(x => x === '-i').length === 2 && img.includes('D:\\a.png'));
}

// ---------- the resume, which is NOT the first turn with an id bolted on ----------
{
    const r = E.codexArgs({
        thread: '019fe7bc-545c', cwd: 'D:\\work\\repo',
        permissionMode: 'acceptEdits', effort: 'high'
    });
    ok('it resumes the thread by id', r[0] === 'exec' && r[1] === 'resume' && r[2] === '019fe7bc-545c');
    ok('‼️ and it carries NONE of the flags resume refuses — measured: `-s` and '
        + '`-C` exit 2 there, so a resume built like a first turn simply fails',
        E.CODEX_RESUME_REFUSES.every(flag => !r.includes(flag)));
    ok('…while the sandbox still gets through, as the config key resume DOES take',
        r.join(' ').includes('sandbox_mode="workspace-write"'));
    ok('the effort survives it too', r.join(' ').includes('model_reasoning_effort="high"'));
    ok('and the prompt still comes on stdin', r[r.length - 1] === '-');
}

// ---------- what a mode MEANS here ----------
{
    ok('"ask me" cannot be honoured, so it becomes read-only',
        E.codexSandboxFor('default') === 'read-only' && E.codexSandboxFor('plan') === 'read-only');
    ok('accepting edits is writing inside the workspace',
        E.codexSandboxFor('acceptEdits') === 'workspace-write');
    ok('bypassing permissions is no sandbox at all',
        E.codexSandboxFor('bypassPermissions') === 'danger-full-access');
    ok('‼️ an unknown mode is the SAFE one, not the last one in the table — the '
        + 'reading that costs nothing if it is wrong',
        E.codexSandboxFor('something-new') === 'read-only' && E.codexSandboxFor(undefined) === 'read-only');
    ok('and each one says what it means here rather than letting the word carry '
        + 'an assumption it cannot keep',
        /cannot stop and ask/.test(E.codexModeNote('default'))
        && /without asking/.test(E.codexModeNote('acceptEdits'))
        && /no sandbox/.test(E.codexModeNote('bypassPermissions')));
}

// ---------- the prompt, with files hung on it ----------
{
    ok('nothing attached is nothing added', E.codexPromptText('hello') === 'hello');
    const p = E.codexPromptText('look at these', [
        { kind: 'path', path: 'D:\\a.log' }, { kind: 'image', path: 'D:\\b.png' }
    ]);
    ok('a file travels as a PATH the agent can open itself', p.includes('D:\\a.log'));
    ok('‼️ an image does NOT — it cannot be described, it has to be seen, and it '
        + 'rides as `-i` instead', !p.includes('b.png'));
    ok('the wording matches the other engine, so the same instruction behaves the same',
        /open with Read/.test(p));
}

// ---------- X-18: the SAME engine, on the surfaces that are not the Console --
//
// ‼️ MEASURED AGAINST `codex --help` / `codex exec --help` (0.147.0), and one
// real run: `codex exec --skip-git-repo-check -c sandbox_mode="read-only" -o
// <file> -` with the prompt on stdin returned exit 0, printed its own header
// (workdir · model · provider · approval · sandbox · reasoning effort · session
// id) followed by the conversation and `tokens used`, and wrote the final
// message alone into the `-o` file. That output shape is why a TASK does not ask
// for `--json`: nobody is translating it and a person reads the archive.
{
    const r = E.codexRunArgs({ cwd: 'D:\\work', permissionMode: 'acceptEdits', model: 'gpt-5.6' });
    ok('an unattended run is `exec`, and does NOT ask for JSONL',
        r[0] === 'exec' && !r.includes('--json'));
    ok('…it still skips the git check, because an agent folder is often not a repo',
        r.includes('--skip-git-repo-check'));
    ok('…the sandbox rides as -c, the one spelling both shapes accept',
        r.join(' ').includes('-c sandbox_mode="workspace-write"'));
    ok('…and the prompt still comes from stdin', r[r.length - 1] === '-');
    ok('…with the working folder as -C, which the first shape does accept',
        r.join(' ').includes('-C "D:\\work"'));
    const o = E.codexRunArgs({ lastMessageFile: 'D:\\out\\last.txt' });
    ok('‼️ a caller that wants the ANSWER without the transcript can have it (-o)',
        o.join(' ').includes('-o "D:\\out\\last.txt"'));

    const t = E.codexTuiArgs({ permissionMode: 'plan', model: 'gpt-5.6', effort: 'low' });
    ok('the interactive shape spells the sandbox out as -s, because it accepts it '
        + 'and a person reading the line should see it in words',
        t.includes('-s') && t.includes('read-only'));
    ok('…and takes the model the same way', t.includes('-m') && t.includes('gpt-5.6'));
    ok('…with the effort through -c, which has no flag of its own',
        t.join(' ').includes('model_reasoning_effort="low"'));
}

// ---------- the brief, on an engine with no system-prompt channel ----------
//
// ‼️ THE GAP THAT MADE A BADGE LIE. Claude takes the project brief as an extra
// system prompt on the command line. `codex` has no equivalent — prompt,
// AGENTS.md, config, nothing else — so a Codex session started under a project
// was FILED under it, showed the badge, and had never been told. The brief now
// rides inside the first prompt instead.
{
    ok('an engine with no system-prompt flag is a named fact, not a comment',
        E.CODEX_HAS_NO_SYSTEM_PROMPT_FLAG === true);
    ok('no brief is no prefix at all', E.codexContextPrefix('') === ''
        && E.codexContextPrefix('   ') === '');
    const p = E.codexContextPrefix('PROJECT X\nstatus: active');
    ok('…and a brief is FENCED, so the agent can tell it from the instruction',
        p.startsWith('<project-context>') && p.includes('</project-context>'));
    ok('…and separated from what follows it', p.endsWith('\n\n'));
}

// ---------- one line every picker prints ----------
{
    ok('the default engine is described as one steerable process',
        /steers that turn/.test(E.engineNote('claude'))
        && /reports what each turn cost/.test(E.engineNote('claude')));
    ok('‼️ …and the other one names the three things that differ, before a message '
        + 'is lost discovering them',
        /HELD/.test(E.engineNote('codex'))
        && /NEXT turn/.test(E.engineNote('codex'))
        && /sandbox/.test(E.engineNote('codex'))
        && /no price/.test(E.engineNote('codex')));
    ok('…and an unknown engine reads as the default rather than as nothing',
        E.engineNote('nonsense') === E.engineNote('claude'));
}

{
    // ‼️ X-259 — `runArgs('claude', …)` USED TO HAND BACK CODEX'S COMMAND LINE.
    //
    // Measured before the fix: it returned ["exec","--skip-git-repo-check",
    // "-c","sandbox_mode=…","-m","haiku","-"] — another engine's vocabulary
    // wearing Claude's name, because `case 'claude'` fell through to
    // `codexRunArgs`. Nothing broke, and that is the danger: Claude is the
    // persistent engine, so `spawnHeadless` builds its line as a string and no
    // live caller ever reached the branch. `engineFlagFor` even guards against
    // it BY NAME. The next caller to take an engine as a parameter — the sentry
    // leader runner is exactly that — would have got a plausible, working,
    // wrong command line instead of an error.
    //
    // The function's own doctrine, written at `unknownEngine`: "it must never
    // fall through to another engine's". Claude was the one exception to it.
    let threw = '';
    try { E.runArgs('claude', { model: 'haiku' }); } catch (e) { threw = String(e && e.message); }
    ok('‼️ runArgs refuses claude rather than answering as another engine', !!threw);
    ok('‼️ …and a refusal is prose: it names the engine and where the line IS built',
        /claude/i.test(threw) && /spawnHeadless|persistent/i.test(threw));
    ok('…while the per-turn engines still answer', E.runArgs('codex', { model: 'x' }).includes('exec'));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
