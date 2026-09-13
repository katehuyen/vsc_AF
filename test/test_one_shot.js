// X-260 — THE ONE-SHOT TURN'S ENVIRONMENT.
//
// The fleet runs a dozen short turns of its own: the judge behind A/B, evals,
// pulse, quality, suggest, summary, distill, dispatch and the command bar. Every
// one of them was written as `cp.exec("claude …")` with NO `env`, which means
// two things at once, and both were measured (X-260):
//
//   - they run as whatever sign-in the MACHINE happens to hold, outside the
//     pool the user allowed and invisible to `pickAccount` — a sweep running at
//     3 a.m. can eat the window the user was saving for the morning, and no
//     surface can say that it did;
//   - the engine is nailed into a template string, so the axis every other
//     launch in the extension has cannot even be stated here.
//
// The fix is ONE seam, not a dozen copies of the resolution rules: `core` states
// what it wants (engine, account) and the extension — the side that owns the
// slots, the adapters and the routes — hands in how to answer it. Nothing
// installed is the DOCUMENTED ABSENT CASE: the environment is inherited exactly
// as it always was, so a service or a test that never wires the seam is byte for
// byte what it was before.
const path = require('path');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const one = require(path.join(__dirname, '..', 'out', 'core', 'oneShot.js'));

// ---------- the absent case: no caps, no environment ----------
{
    one.installOneShotCaps(undefined);
    ok('‼️ nothing installed hands the spawn NO environment, so it inherits as it always did',
        one.oneShotEnv({ engine: 'claude' }) === undefined);
    ok('…and that is true for every engine, not only the one it was written for',
        one.oneShotEnv({ engine: 'codex', account: 'slot-1' }) === undefined);
}

// ---------- the seam is ASKED, and asked with what the caller stated ----------
{
    const seen = [];
    one.installOneShotCaps({
        accountLayer: (engine, account) => { seen.push([engine, account]); return { AF_ACC: engine + ':' + (account || '') }; }
    });
    const env = one.oneShotEnv({ cwd: os.tmpdir() });
    ok('an unstated engine is claude — the engine these turns have always run on',
        seen.length === 1 && seen[0][0] === 'claude');
    ok('…and an unstated account is passed through as unstated, so the resolver decides',
        seen[0][1] === undefined);
    ok('the layer really reaches the environment', env && env.AF_ACC === 'claude:');
    const pathKey = Object.keys(process.env).find(k => k.toUpperCase() === 'PATH');
    ok('…on top of the inherited one rather than instead of it',
        env && !!pathKey && env[pathKey] === process.env[pathKey]);
    one.oneShotEnv({ engine: 'codex', account: 'work' });
    ok('a stated engine and account reach the seam verbatim',
        seen[1][0] === 'codex' && seen[1][1] === 'work');
}

// ---------- X-211: a layer may REMOVE a name, and null is how it says so ----------
{
    process.env.AF_ONESHOT_PROBE = 'inherited';
    one.installOneShotCaps({ accountLayer: () => ({ AF_ONESHOT_PROBE: null }) });
    const env = one.oneShotEnv({});
    ok('‼️ a null layer DELETES an inherited name rather than blanking it',
        env && !('AF_ONESHOT_PROBE' in env));
    delete process.env.AF_ONESHOT_PROBE;
}

// ---------- the route is the same authority it is on every other launch ----------
{
    process.env.AF_ONESHOT_KEY = 'from-the-window';
    one.installOneShotCaps({
        accountLayer: () => ({ AF_ONESHOT_KEY: 'from-the-account' }),
        runtime: engine => (engine === 'claude'
            ? { clearEnv: ['AF_ONESHOT_KEY'], spawnEnv: { AF_ONESHOT_URL: 'route' } }
            : undefined)
    });
    const env = one.oneShotEnv({});
    ok('‼️ the route CLEARS what the account and the window both wrote — one order, one reader',
        env && !('AF_ONESHOT_KEY' in env) && env.AF_ONESHOT_URL === 'route');
    const other = one.oneShotEnv({ engine: 'codex' });
    ok('…and an engine with no route keeps everything it had',
        other && other.AF_ONESHOT_KEY === 'from-the-account');
    delete process.env.AF_ONESHOT_KEY;
    one.installOneShotCaps(undefined);
}

// ---------- the command line: one place, and it states its engine ----------
{
    ok('the exec line is built once and carries the flags and the prompt',
        one.oneShotLine({ engine: 'claude', args: ' --model haiku ', prompt: 'merhaba' })
        === 'claude --model haiku -p "merhaba"');
    ok('…with no flags it does not leave a double space behind',
        one.oneShotLine({ args: '', prompt: 'x' }) === 'claude -p "x"');
    ok('‼️ an engine that is not claude is REFUSED here rather than spawned as claude',
        one.oneShotLine({ engine: 'gemini', args: '', prompt: 'x' }) === undefined);
}

// ---------- the LIVE WIRE, which is the half that has been forgotten before --
// X-169 closed green against mocks with its wire never connected, so the seam
// being right is not the claim: what is measured here is that the extension
// really installs it, that it hands in the ACCOUNT resolver rather than a
// hand-written variable name, and that not one of the migrated turns still
// spawns an engine behind the seam's back.
{
    const fs = require('fs');
    const src = f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
    const ext = src('extension.ts');
    ok('‼️ extension.ts really installs the seam', /installOneShotCaps\(\{/.test(ext));
    ok('…and hands in the account layer every other launch resolves through',
        /accountLayer: \(engine, account\) => launchAccountEnv\(\{ engine, account \}\)/.test(ext));

    const migrated = ['abtest', 'commandbar', 'dispatch', 'distill', 'evals',
        'pulse', 'quality', 'suggest', 'summary', 'tasks'];
    const behindTheBack = migrated.filter(m =>
        /cp\.(exec|execSync|spawn|spawnSync)\(\s*[`'"](claude|codex|gemini|opencode)/.test(src('core/' + m + '.ts')));
    ok('‼️ no migrated module spawns an engine behind the seam: ' + (behindTheBack.join(', ') || 'none'),
        behindTheBack.length === 0);
    ok('…and every one of them asks the seam instead',
        migrated.every(m => /execOneShot\(/.test(src('core/' + m + '.ts'))));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
