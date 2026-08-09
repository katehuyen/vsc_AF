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

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
