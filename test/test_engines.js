// X-3 — the engine matrix (compiled core/engines.js, pure over an injected probe).
//
// What is pinned here is the thing the item was actually about: the extension
// used to describe every non-Claude engine as "a key in the vault", and TWO OF
// THE THREE ARE NOT PAID FOR WITH A KEY. Claude Code runs on a Pro/Max plan and
// Codex on a ChatGPT plan; both keep their own OAuth grant in their own file and
// never hand it to us. Gemini is the one that really is a key now — its Google
// sign-in was retired in June 2026 — and that is a fact the row has to state,
// because otherwise the user goes looking for a login that was taken away.
//
// The shapes below are the REAL ones, read off this machine on 2026-08-09:
// ~/.codex/auth.json carries `auth_mode: "chatgpt"` with `OPENAI_API_KEY: null`,
// and ~/.claude/.credentials.json carries `claudeAiOauth`.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { readEngines, enginesSummary, parseStamp } =
    require(path.join(__dirname, '..', 'out', 'core', 'engines.js'));

/** A probe built from plain maps — no home directory, no PATH, no keychain. */
const probe = (o) => ({
    readHome: (rel) => (o.files || {})[rel],
    existsHome: (rel) => Object.prototype.hasOwnProperty.call(o.files || {}, rel),
    which: (cmd) => ((o.path || []).indexOf(cmd) >= 0 ? `/usr/bin/${cmd}` : undefined),
    hasSecret: (name) => (o.vault || []).indexOf(name) >= 0,
    hasEnv: (name) => (o.env || []).indexOf(name) >= 0
});
const by = (list, id) => list.find(e => e.id === id);

// ---------- nothing installed: every row still says what to do ----------
{
    const list = readEngines(probe({}));
    ok('all five engines are always listed', list.length === 5
        && ['claude', 'codex', 'gemini', 'agy', 'opencode'].every(id => !!by(list, id)));
    ok('nothing is ready on an empty machine', list.every(e => !e.ready));
    // ‼️ The whole complaint in one assertion: a state is not an answer.
    ok('‼️ no row stops at naming a state — each one says what to do',
        list.every(e => /install|Sign in|sign in|vault|PATH/.test(e.next)));
    // ‼️ …and a missing CLI is named as the first problem, not the key — AND
    // the row carries the way to fix it. "Install it" with nothing to do is the
    // same dead end as "not configured": the user is told the state and left to
    // find the gesture.
    ok('…and a missing CLI is named as the first problem, with the install step on it',
        list.every(e => /not installed on this machine/.test(e.next))
        && ['claude', 'codex', 'gemini', 'agy', 'opencode']
            .every(id => /Install it with: \S+/.test(by(list, id).next)));
    // ‼️ …INCLUDING THE ONE THAT DOES NOT COME FROM A PACKAGE REGISTRY. `npm
    // install -g agy` would send the user to something that does not exist; the
    // vendor's own installer script does, and it is the same one the migration
    // system runs (`_setup\\Install-Engines.ps1`).
    ok('‼️ the engine that is not on a package registry gets its vendor script, not a guess',
        /antigravity\.google\/cli\/install/.test(by(list, 'agy').installCommand || '')
        && !/npm/.test(by(list, 'agy').installCommand || ''));
    ok('the summary counts what can run', JSON.stringify(enginesSummary(list))
        === JSON.stringify({ ready: 0, total: 5, onPlan: 0 }));
    // ‼️ X-38 — AND THE ONE ENGINE THAT NEEDS NO SIGN-IN IS STILL NOT READY WITH
    // NO CLI. `readyWithoutCredential` waives the credential, never the binary:
    // an OpenCode row on a machine without the command has to say "install it"
    // like every other row, or the waiver would turn into a claim that a session
    // can be started against nothing at all.
    ok('‼️ the credential-free engine still needs its CLI',
        !by(list, 'opencode').ready
        && /not installed on this machine/.test(by(list, 'opencode').next)
        && /npm install -g opencode-ai/.test(by(list, 'opencode').next));
}

// ---------- U-129: the command that is typed has to be the one that works ----
//
// ‼️ EVERY INSTALL BUTTON ON THIS PAGE FAILED ON A BARE MACHINE, and the reason
// is one the page could not see: `npm install -g …` needs Node, and a machine
// that has no engine on it usually has no Node either — so the terminal answered
// "npm is not recognized" for all of them. Three of the five engines ship an
// OFFICIAL installer script that needs nothing at all, and the user's own
// migration system (`_setup\Install-Engines.ps1`) already puts those first: the
// `Script` method is method #1 for claude, codex and agy, npm the fallback. This
// row copies that table rather than inventing a second answer to the same
// question. Measured on this machine: `claude` resolves to `~/.local/bin`,
// `codex` to `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin` — both native installs,
// neither from npm.
//
// The script is a PowerShell one-liner on Windows and a shell one on Unix, so
// the command is platform-picked; a machine question, asked of the probe like
// every other machine question this module asks.
{
    const win = readEngines(Object.assign(probe({}), { isWindows: true }));
    const nix = readEngines(Object.assign(probe({}), { isWindows: false }));
    const cmd = (list, id) => by(list, id).installCommand || '';

    ok('‼️ the three engines with a vendor installer offer THAT, not npm',
        ['claude', 'codex', 'agy'].every(id => !/npm/.test(cmd(win, id))));
    ok('…on Windows it is the PowerShell form',
        cmd(win, 'claude') === 'irm https://claude.ai/install.ps1 | iex'
        && cmd(win, 'codex') === 'irm https://chatgpt.com/codex/install.ps1 | iex'
        && cmd(win, 'agy') === 'irm https://antigravity.google/cli/install.ps1 | iex');
    ok('‼️ …and on macOS/Linux the SAME row says the shell form',
        cmd(nix, 'claude') === 'curl -fsSL https://claude.ai/install.sh | bash'
        && cmd(nix, 'codex') === 'curl -fsSL https://chatgpt.com/codex/install.sh | bash'
        && cmd(nix, 'agy') === 'curl -fsSL https://antigravity.google/cli/install.sh | bash');
    ok('the two that really do come from npm are unchanged, on either platform',
        cmd(win, 'gemini') === 'npm install -g @google/gemini-cli'
        && cmd(nix, 'gemini') === 'npm install -g @google/gemini-cli'
        && cmd(win, 'opencode') === 'npm install -g opencode-ai'
        && cmd(nix, 'opencode') === 'npm install -g opencode-ai');
    // ‼️ …AND THE NPM ONES SAY WHAT THEY NEED. "npm is not recognized" is not a
    // sentence a user can act on; "this one needs Node" is.
    ok('‼️ an npm route names its prerequisite instead of letting the shell say it',
        /Node/.test(by(win, 'gemini').next) && /Node/.test(by(win, 'opencode').next)
        && !/Node/.test(by(win, 'claude').next));

    // ‼️ AND THE SIGN-IN COMMAND WAS WRONG TOO, in the way that is hardest to
    // see: `claude /login` is not an error, it STARTS A SESSION with "/login" as
    // the prompt. Measured against the CLI's own help — `claude auth login` is
    // the subcommand, and it has been for a while.
    const on = readEngines(Object.assign(
        probe({ path: ['claude', 'codex', 'opencode'] }), { isWindows: true }));
    ok('‼️ the Claude sign-in is the SUBCOMMAND, not a slash command typed at a shell',
        by(on, 'claude').loginCommand === 'claude auth login');
    ok('…and the other two were already right, measured against their own help',
        by(on, 'codex').loginCommand === 'codex login'
        && by(on, 'opencode').loginCommand === 'opencode auth login');

    // A probe that does not answer the platform question still gets a command
    // rather than nothing — the older callers (two bridge fixtures) never asked.
    ok('an unasked platform still yields a runnable line',
        !!cmd(readEngines(probe({})), 'claude'));
}

// ---------- OpenCode: READY with an empty auth.json, which is measured ----------
{
    // ‼️ THE MEASUREMENT THIS WHOLE BRANCH EXISTS FOR (A-16, opencode 1.18.18):
    // `opencode providers list` printed "0 credentials" while `opencode models`
    // returned seven, and every one of them ran a real turn. Four engines answer
    // "can it run" with "is there a sign-in"; on this one that question returns
    // the wrong answer, and a row telling the user to fix something that is not
    // broken is the same dishonesty this module was written to end.
    const list = readEngines(probe({ path: ['opencode'] }));
    const row = by(list, 'opencode');
    // ‼️ U-59 — AND IT SAYS SO IN THE MODE, NOT ONLY IN THE SENTENCE. This used
    // to assert `mode === 'none'`, i.e. the same word the engine that CANNOT run
    // reports. `ready` was then true beside it and every reader with only the
    // mode to go on drew the row as broken — which is exactly what the Engines
    // page did. `builtin` is the state; `none` still means "nothing found".
    ok('‼️ OpenCode is READY with nothing signed in', row.ready && row.auth.mode === 'builtin');
    ok('…and "needs no credential" is NOT spelled the same as "has no credential"',
        row.auth.mode !== 'none');
    ok('…and its row says so instead of sending you to a login',
        /Ready, with nothing signed in/.test(row.next) && /free tier/.test(row.next));
    ok('…and the login is offered as the way to the PAID models, not as a fix',
        /opencode auth login/.test(row.next) && /paid models/.test(row.next));
    ok('…and the "no credential" detail refuses to read as "cannot run"',
        /does NOT mean it cannot run/.test(row.auth.detail));
    // …and a credential, when there IS one, is read for what it plainly says.
    const keyed = by(readEngines(probe({
        path: ['opencode'],
        files: { '.local/share/opencode/auth.json': '{"anthropic":{"type":"oauth"},"openai":{"type":"api"}}' }
    })), 'opencode');
    ok('an OAuth grant in auth.json reads as a sign-in',
        keyed.auth.mode === 'subscription' && /2 providers/.test(keyed.auth.detail));
    const apiOnly = by(readEngines(probe({
        path: ['opencode'],
        files: { '.local/share/opencode/auth.json': '{"openai":{"type":"api"}}' }
    })), 'opencode');
    ok('a stored key alone reads as a key', apiOnly.auth.mode === 'apikey');
    // ‼️ NO KEY BOX FOR THIS ENGINE. It reaches many providers and each has its
    // own variable; there is no single "the OpenCode key" to put in the vault,
    // and a surface drawing that box would offer a gesture leading nowhere.
    ok('‼️ it has no key route, so no surface may draw a key box',
        row.key.env === '' && row.key.inVault === false);
}

// ---------- Antigravity: signed in through an APP, with no key anywhere ----------
{
    // The measured shape (2026-08-10): the sign-in belongs to the Antigravity
    // desktop app and nothing on disk holds a token — what IS there is the CLI's
    // note that onboarding finished.
    const list = readEngines(probe({
        path: ['agy'],
        files: {
            '.gemini/antigravity-cli/cache/onboarding.json': JSON.stringify({
                consumerOnboardingComplete: true,
                enterpriseOnboardingComplete: false,
                onboardingComplete: true
            })
        }
    }));
    const agy = by(list, 'agy');
    ok('‼️ an app sign-in is read as a SUBSCRIPTION, not as a missing key',
        agy.auth.mode === 'subscription' && agy.ready);
    ok('…and it says WHERE the grant actually lives, instead of naming a file that has none',
        /Antigravity app/.test(agy.auth.detail) && /no credential file/.test(agy.auth.detail));
    ok('…naming the file the state was read from', agy.auth.file === '.gemini/antigravity-cli/cache/onboarding.json');
    // ‼️ THE POINT OF THE EMPTY `env`. Every other row offers a key as the other
    // route; this engine has none, and a row that named one would send the user
    // to store a secret nothing reads.
    ok('‼️ an engine with no key route reports an EMPTY key name, not a guessed one',
        agy.key.env === '' && agy.key.inVault === false);
    ok('…and no login command is invented for a CLI that has none',
        !agy.loginCommand);
    ok('the plan row reads as ready and says there is nothing to keep',
        /Ready, on a plan/.test(agy.next));
}

// ---------- Antigravity installed but never signed in ----------
{
    const list = readEngines(probe({ path: ['agy'], files: { '.gemini/antigravity-cli': '' } }));
    const agy = by(list, 'agy');
    ok('an unsigned Antigravity is not ready', !agy.ready && agy.auth.mode === 'none');
    // ‼️ The branch that would otherwise print "Put  in the vault" — a sentence
    // with a hole in it, which is exactly the "not configured" this module ends.
    ok('‼️ …and its next step is a real instruction, not a blank key name',
        !/Put\s+in the vault/.test(agy.next)
        && /Antigravity app/.test(agy.next) && /no key/.test(agy.next));
}

// ---------- Codex on a ChatGPT plan — the measured shape ----------
{
    const list = readEngines(probe({
        path: ['codex'],
        files: {
            '.codex/auth.json': JSON.stringify({
                auth_mode: 'chatgpt',
                OPENAI_API_KEY: null,
                tokens: { id_token: 'i', access_token: 'a', refresh_token: 'r', account_id: 'x' },
                last_refresh: '2026-08-09T10:31:36.731385700Z'
            })
        }
    }));
    const codex = by(list, 'codex');
    ok('‼️ a ChatGPT sign-in is read as a SUBSCRIPTION, not as a missing key',
        codex.auth.mode === 'subscription' && codex.ready);
    ok('…and it says so in words a person can act on',
        /No API key is involved/.test(codex.auth.detail) && /on a plan/.test(codex.next));
    ok('…naming the file it was read from', codex.auth.file === '.codex/auth.json');
    ok('‼️ the over-precise timestamp still parses — 7 decimals, not 3',
        codex.auth.refreshedAt === Date.parse('2026-08-09T10:31:36.731Z'));
    ok('the vault is not consulted for a value, only for the NAME',
        codex.key.env === 'OPENAI_API_KEY' && codex.key.inVault === false);
    // The row must not hide that a key route exists, nor push it.
    ok('a plan row still offers the key name for the other route',
        codex.key.env === 'OPENAI_API_KEY');
}

// ---------- Codex holding its own API key ----------
{
    const list = readEngines(probe({
        path: ['codex'],
        files: {
            '.codex/auth.json': JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: 'sk-x', tokens: null })
        }
    }));
    const codex = by(list, 'codex');
    ok('a key in the CLI\'s own file is a key, and is priced as one',
        codex.auth.mode === 'apikey' && /per token/.test(codex.auth.detail));
    ok('‼️ …and the row points at the cheaper route instead of leaving it at that',
        /codex login/.test(codex.next));
}

// ---------- Claude Code: the plan, the CI token, the key ----------
{
    const plan = by(readEngines(probe({
        path: ['claude'],
        files: { '.claude/.credentials.json': JSON.stringify({ claudeAiOauth: { expiresAt: 1786000000000 } }) }
    })), 'claude');
    ok('a Claude plan sign-in is a subscription',
        plan.auth.mode === 'subscription' && plan.ready && plan.auth.refreshedAt === 1786000000000);

    const ci = by(readEngines(probe({ path: ['claude'], vault: ['CLAUDE_CODE_OAUTH_TOKEN'] })), 'claude');
    ok('‼️ the long-lived CI token is the SAME subscription, not a key',
        ci.auth.mode === 'subscription' && /headless/.test(ci.auth.detail));

    const key = by(readEngines(probe({ path: ['claude'], env: ['ANTHROPIC_API_KEY'] })), 'claude');
    ok('…and an API key is read off the environment too, and priced as a key',
        key.auth.mode === 'apikey' && key.ready);
}

// ---------- Gemini: TWO routes, and neither is invented ----------
//
// ‼️ CORRECTED IN X-35, AGAINST THE SHIPPED CLI. This block used to assert that
// Gemini "offers no plan sign-in" and that the row says the Google login "was
// retired in June 2026". gemini-cli 0.55.1 still carries `oauth-personal`
// (Login with Google) as a first-class auth type and takes that path on
// startup — so the confident, dated claim sent users hunting for an API key
// they may not need. The absence of a `login` SUBCOMMAND is not the absence of
// a sign-in: this CLI opens a browser on its first run.
{
    const bare = by(readEngines(probe({ path: ['gemini'] })), 'gemini');
    ok('Gemini has no login SUBCOMMAND, so no row invents one to copy',
        !bare.loginCommand);
    ok('‼️ …but the next step is the real route, not "key only"',
        /Login with Google/.test(bare.next) && !/no plan sign-in/.test(bare.next));
    ok('…and the billing line names BOTH routes rather than asserting one',
        /Google account sign-in/.test(bare.billing) && /API key/.test(bare.billing));
    ok('‼️ …and states that a dollar figure here is derived, never quoted',
        /never quoted/.test(bare.billing));

    const keyed = by(readEngines(probe({ path: ['gemini'], vault: ['GEMINI_API_KEY'] })), 'gemini');
    ok('a key in the vault makes it ready', keyed.ready && keyed.key.inVault);
    const alt = by(readEngines(probe({ path: ['gemini'], env: ['GOOGLE_API_KEY'] })), 'gemini');
    ok('…and the other name that engine reads is accepted too', alt.auth.mode === 'apikey');
}

// ---------- a probe that throws must cost one row, never the page ----------
{
    const angry = {
        readHome: () => { throw new Error('locked'); },
        existsHome: () => { throw new Error('locked'); },
        which: () => { throw new Error('no PATH'); },
        hasSecret: () => { throw new Error('no keychain'); },
        hasEnv: () => false
    };
    let list = null;
    try { list = readEngines(angry); } catch { /* recorded below */ }
    ok('‼️ a machine that refuses every question still renders every row',
        // ‼️ …and `readyWithoutCredential` does not survive a machine that cannot
        // even be asked: `which` throws, so no CLI is found, so nothing is ready.
        !!list && list.length === 5 && list.every(e => !e.ready && !!e.next));
}

// ---------- the stamp parser, on its own ----------
{
    ok('an ordinary ISO stamp parses', parseStamp('2026-08-09T10:31:36.731Z') > 0);
    ok('an over-precise one parses to the same millisecond',
        parseStamp('2026-08-09T10:31:36.731999999Z') === parseStamp('2026-08-09T10:31:36.731Z'));
    ok('rubbish is undefined rather than NaN',
        parseStamp('') === undefined && parseStamp(null) === undefined
        && parseStamp('not a date') === undefined);
}

// ---------- the surfaces: a page, a bridge op, and no way to leak a value ----
{
    const fs = require('fs');
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    const js = require('./lib_settings_source').settingsPageSource();
    const panel = require('./lib_settings_source').settingsPanelSource();

    ok('the matrix reaches Farm Settings', /engines: \(\) => engineMatrix\(\)/.test(ext)
        && /function enginesSection\(\)/.test(js) && /id: 'cat-engines'/.test(js));
    // agentfarm-dev.md: a user-triggerable function reaches the bridge in the
    // same commit as the feature, never later.
    ok('…and the bridge, in the same commit', /op: 'engines\.status'/.test(ext));
    // ‼️ ONE function for both gestures, and both surfaces (the Settings
    // section and the Engines panel) go through it — two copies of "write a
    // command into a terminal" is how one of them quietly starts running it.
    ok('the install and the sign-in are terminal commands, not things the extension performs',
        /const engineTerminal = \(command: string\): void =>/.test(ext)
        && /createTerminal/.test(ext)
        && /engineCommand: \(command: string\) => engineTerminal\(command\)/.test(ext)
        && /command: \(command: string\) => engineTerminal\(command\)/.test(ext));
    ok('‼️ …and the line is TYPED, not run — the user reads it and presses Enter',
        /term\.sendText\(command, false\)/.test(ext));
    // ‼️ An engine that is not installed cannot be signed into. The row that
    // offered a login for a missing command is the case this guards: the two
    // buttons are mutually exclusive and keyed on `cli.found`.
    ok('a missing CLI offers Install, and only then a sign-in',
        /const install = !e\.cli\.found && e\.installCommand/.test(js)
        && /const login = e\.cli\.found && e\.loginCommand/.test(js));
    ok('the key route hands over to the vault\'s own form',
        /engineKey: \(name: string\) => \{ SecretsPanel\.compose\(secretsDeps, name\); \}/.test(ext));
    ok('‼️ the probe asks the vault for a NAME and never for a value',
        /hasSecret: \(name: string\): boolean => vault\.names\(\)\.includes\(name\)/.test(ext)
        && !/vault\.get\(/.test(panel));
    ok('a docs link can only be https', /\/\^https:\\\/\\\/\/\.test\(msg\.url\)/.test(panel));
}

// ---------------------------------------------------------------------------
// X-14 phase 2 — the health check. "Ready" and "actually works" are different
// questions, and this machine is why: ~/.codex/auth.json held a live ChatGPT
// grant while every Codex turn died at the socket (os error 10013). No amount
// of reading files finds that; only a call does. So what is pinned here is that
// the call is real, that a failure quotes the ENGINE rather than inventing a
// reason, and that nothing spends anything without being asked.
// ---------------------------------------------------------------------------
{
    const { testEngine, firstFault, verdictAge } =
        require(path.join(__dirname, '..', 'out', 'core', 'engineTest.js'));

    /** A runner that answers from a script — nothing is spawned, nothing spent. */
    const runner = (script) => {
        const calls = [];
        const fn = (command, args, timeoutMs) => {
            calls.push({ command, args, timeoutMs });
            if (script.throws) { return Promise.reject(new Error(script.throws)); }
            return Promise.resolve({
                code: script.code ?? 0, stdout: script.stdout ?? '', stderr: script.stderr ?? ''
            });
        };
        fn.calls = calls;
        return fn;
    };
    const clock = (start) => { let t = start; return () => (t += 1200); };

    (async () => {
        // ‼️ A Codex turn is proved by the stream saying so, not by exit code:
        // the CLI exits 0 on a turn it never completed, which is exactly the
        // shape this machine produced.
        const good = runner({ stdout: '{"type":"thread.started"}\n{"type":"turn.completed","usage":{}}\n' });
        const okRes = await testEngine('codex', good, clock(1000));
        ok('a completed turn reads as ok', okRes.ok === true && okRes.id === 'codex');
        ok('…and it is timed', okRes.ms > 0 && okRes.at > 0);
        ok('‼️ the call is READ-ONLY and does not depend on where the editor is',
            good.calls[0].args.includes('-s') && good.calls[0].args.includes('read-only')
            && good.calls[0].args.includes('--skip-git-repo-check'));
        ok('…and it is one non-interactive turn in JSONL',
            good.calls[0].args[0] === 'exec' && good.calls[0].args.includes('--json'));

        // ‼️ THE CASE THAT MADE THIS FILE: exit 0, a stream full of retries, and
        // a turn that failed. Calling that "ready" is the whole defect.
        const failed = runner({
            code: 0,
            stdout: '{"type":"turn.started"}\n'
                + '{"type":"turn.failed","error":{"message":"stream disconnected before completion"}}\n'
        });
        const bad = await testEngine('codex', failed, clock(1000));
        ok('‼️ exit 0 with a failed turn is NOT ok', bad.ok === false);

        // A failure quotes the engine. An invented reason is worse than none:
        // the whole point is that the user can act on what was actually said.
        ok('a failure carries the engine\'s own words', /stream disconnected/.test(bad.error || ''));
        ok('‼️ the socket refusal survives verbatim', /os error 10013/.test(firstFault(
            'ERROR codex_api: failed to connect to websocket: IO error: An attempt was made to '
            + 'access a socket in a way forbidden by its access permissions. (os error 10013)', '')));

        // A spawn that cannot start IS the finding, not a crash.
        const dead = await testEngine('claude', runner({ throws: 'ENOENT' }), clock(1000));
        ok('a command that cannot be run reports that, and does not throw',
            dead.ok === false && /could not be run/.test(dead.detail) && /ENOENT/.test(dead.error || ''));

        // Claude's check is one turn on the SMALLEST model — a health check that
        // costs a real turn must not also pick an expensive one.
        const claude = runner({ stdout: 'OK' });
        await testEngine('claude', claude, clock(1000));
        ok('the cheapest model is the one asked for',
            claude.calls[0].args.includes('--model') && claude.calls[0].args.includes('haiku'));

        // ---------- U-59: "no credential" is TWO states, not one ----------
        // ‼️ `none` used to carry both *nobody has signed in, so this cannot
        // run* and *this engine asks for nothing*. Opposite meanings, one word —
        // so the badge drew the second as the first: `not signed in` in the
        // warning colour, directly above a sentence saying the engine was ready,
        // with a "Sign in with a plan" button offered as the fix for a fault the
        // row did not have. Seen in one second in a picture and invisible to
        // every string test, because each string was correct on its own.
        {
            const fsx = require('fs');
            const pagejs = fsx.readFileSync(path.join(__dirname, '..', 'media', 'engines.js'), 'utf8');
            const eng = fsx.readFileSync(path.join(__dirname, '..', 'src', 'core', 'engines.js').replace(/\.js$/, '.ts'), 'utf8');

            ok('‼️ the type itself distinguishes "needs no credential" from "has none"',
                /\|\s*'builtin'/.test(eng) && /\|\s*'none'/.test(eng));
            ok('…and OpenCode reports the first, not the second',
                /mode: 'builtin',\s*\n\s*file: OPENCODE_AUTH_FILE/.test(eng));
            // ‼️ The rule moved to `afEngine.js` because BOTH the Engines page
            // and Farm Settings drew this badge, each from its own copy — which
            // is how one of them stayed on four states after a fifth arrived.
            const shared = fsx.readFileSync(path.join(__dirname, '..', 'media', 'afEngine.js'), 'utf8');
            ok('the badge reads as READY rather than as a warning',
                /mode === 'builtin'[\s\S]{0,80}tone: 'ok'/.test(shared)
                && /no sign-in needed/.test(shared));
            ok('‼️ …and BOTH surfaces ask the same component instead of each keeping a copy',
                /AFEngine\.authBadge\(/.test(pagejs)
                && /AFEngine\.authBadge\(/.test(require('./lib_settings_source').settingsPageSource()));
            ok('‼️ …and the button stops offering itself as the repair',
                /Add paid providers/.test(pagejs)
                && /builtin \? 'Add paid providers' : 'Sign in with a plan'/.test(pagejs));
            ok('…while still saying what signing in WOULD buy, since it buys something real',
                /adds the PAID providers beside/.test(pagejs));

            // The picture is the only place this was ever visible, so the
            // fixture that draws it is part of the guarantee.
            const fx = fsx.readFileSync(path.join(__dirname, 'fixtures', 'engines.js'), 'utf8');
            ok('the Engines fixture actually draws this row — it had four engines and never this one',
                /id: 'opencode'/.test(fx) && /mode: 'builtin'/.test(fx));
        }

        // ---------- U-59: OpenCode's check, worked out at press time ----------
        // ‼️ Every other engine's health check is a constant. OpenCode's cannot
        // be: its cheapest turn is a FREE model from whichever providers happen
        // to be connected on this machine, and a name pinned in the source would
        // become a PAID turn the day that model is retired — on the one engine
        // whose own provider gives free ones away. So the catalogue is read
        // first, and this is what holds that in place.
        {
            const { opencodeFreeModel } =
                require(path.join(__dirname, '..', 'out', 'core', 'opencode.js'));

            /** A runner that answers per call, and records the WHOLE contract —
             *  shell and stdin included, because both decide whether the call
             *  works at all. */
            const scripted = (replies) => {
                const calls = [];
                const fn = (command, args, timeoutMs, shell, stdin) => {
                    calls.push({ command, args, timeoutMs, shell, stdin });
                    const r = replies[calls.length - 1] || {};
                    return Promise.resolve({ code: r.code ?? 0, stdout: r.stdout ?? '', stderr: r.stderr ?? '' });
                };
                fn.calls = calls;
                return fn;
            };
            const CATALOG = [
                'opencode/nemotron-3.5-lightning-free',
                'opencode/deepseek-v4-flash-free',
                'anthropic/claude-opus-5',
                'openai/gpt-5'
            ].join('\n');

            const oc = scripted([
                { stdout: CATALOG },
                { stdout: '{"type":"step_start"}\n{"type":"text","part":{"text":"OK"}}\n{"type":"step_finish"}\n' }
            ]);
            const res = await testEngine('opencode', oc, clock(1000));
            ok('‼️ OpenCode HAS a health check at all — it used to answer "no health '
                + 'check is defined", so the Engines page showed a permanently untestable engine',
                res.ok === true && !/No health check/.test(res.detail));
            ok('…the catalogue is read FIRST, and that read is not a turn',
                oc.calls[0].args.join(' ') === 'models');
            ok('‼️ …and the model it then spends is a FREE one, off that list rather than out of the source',
                oc.calls[1].args.includes('-m')
                && /-free$/.test(oc.calls[1].args[oc.calls[1].args.indexOf('-m') + 1]));
            ok('‼️ …on the `plan` agent, which MEASURABLY calls no tool at all (M-14) — '
                + 'a stronger read-only guarantee than a permission mode, because it is the '
                + 'engine\'s own behaviour and not a setting the user\'s config could override',
                oc.calls[1].args.includes('--agent') && oc.calls[1].args.includes('plan'));
            ok('…and the prompt goes on STDIN, the channel this engine\'s run really uses',
                oc.calls[1].stdin === 'Reply with exactly: OK'
                && !oc.calls[1].args.some(a => /Reply with exactly/.test(a)));
            ok('…proved by a step really finishing, not by an exit code — M-14 measured '
                + 'a REFUSED tool call exiting 0',
                res.ok === true);

            // The same run, minus the finished step: exit 0 is not an answer here.
            const hollow = scripted([{ stdout: CATALOG }, { stdout: '{"type":"step_start"}\n' }]);
            const hollowRes = await testEngine('opencode', hollow, clock(1000));
            ok('‼️ a run that opened a step and never finished one is NOT ok, though it exited 0',
                hollowRes.ok === false);

            // ‼️ NOTHING IS BILLED BY DEFAULT. A catalogue with no free model is a
            // question for the user, not a licence to pick a paid one.
            const paidOnly = scripted([{ stdout: 'anthropic/claude-opus-5\nopenai/gpt-5\n' }]);
            const refused = await testEngine('opencode', paidOnly, clock(1000));
            ok('‼️ with no free model the check REFUSES rather than spending on a paid turn',
                refused.ok === false && /would spend money/.test(refused.detail)
                && paidOnly.calls.length === 1);
            ok('…and it says what the user can do about it, instead of only saying no',
                /pick a model yourself/.test(refused.detail));
            // ‼️ U-59 — AND "NOT ATTEMPTED" IS NOT "FAILED". `ok: false` carried
            // both, so the page drew a red ✗ over an engine whose own row two
            // lines above said "Ready, with no sign-in needed" — a broken engine
            // reported for the ordinary case of having no free model on offer.
            // The flag is what lets the row be a third thing.
            ok('‼️ a refusal is MARKED as one — nothing was called, so it is not a failure',
                refused.refused === true && refused.error === undefined);
            ok('…while a real failure is not marked that way',
                hollowRes.refused === undefined);
            {
                const fx = require('fs').readFileSync(path.join(__dirname, '..', 'media', 'engines.js'), 'utf8');
                ok('‼️ …and the page draws it as a third state, in its own colour, with its own mark',
                    /v\.refused \? 'held'/.test(fx) && /v\.refused \? '⊘ '/.test(fx)
                    && /\.engv\.held \{ color:var\(--af-ink-charts-yellow, var\(--vscode-charts-yellow/.test(fx));
                ok('…and its hover says the engine was never asked, rather than timing a failure',
                    /the engine was never asked/.test(fx));
            }

            // The picker itself: the engine's own naming is the signal, and the
            // choice is deterministic so a flaky result cannot be blamed on it.
            ok('the free-model picker reads the provider\'s own suffix',
                opencodeFreeModel(CATALOG) === 'opencode/deepseek-v4-flash-free');
            ok('…deterministically, so two runs of the check test the same thing',
                opencodeFreeModel(CATALOG) === opencodeFreeModel(CATALOG.split('\n').reverse().join('\n')));
            ok('…and prose in the output is not mistaken for a model',
                opencodeFreeModel('Models for connected providers:\nnot a model at all -free\n') === '');
            ok('…an empty catalogue is empty, not a guess', opencodeFreeModel('') === '');
        }

        // ‼️ The verdict's AGE is part of the claim: a tick from four hours ago
        // is not the same statement as one from four seconds ago.
        ok('a verdict says how old it is', verdictAge(1000, 1000) === '0s ago'
            && verdictAge(0, 3600000) === '1h ago' && verdictAge(0, 300000) === '5m ago');

        // ---------- X-219 (round 2): a SPENT PLAN is not a broken engine ------
        //
        // The user pressed Test on a sign-in with quota to spare; the turn went
        // out on whichever account this window had inherited, that one was
        // walled, and the card answered `✗ The command exited 1` — a red cross
        // against the CLI, the credential and the route, none of which had been
        // tested at all. A wall is the `refused` shape (U-59): nothing spent on
        // the question asked, nothing proved, so nothing claimed.
        {
            const walled = await testEngine('claude', runner({
                code: 1,
                stderr: 'Claude usage limit reached. Your limit will reset at 5am (Europe/Istanbul).'
            }), clock(1000));
            ok('‼️ X-219 — a plan wall is NOT TESTED, not failed',
                walled.ok === false && walled.refused === true);
            ok('…and it says so in words a person can act on, never a bare exit code',
                /Not tested/.test(walled.detail) && !/exited 1/.test(walled.detail));
            ok('‼️ …and it clears the engine rather than blaming it',
                /not a verdict on the CLI|Nothing here is a verdict/i.test(walled.detail));
            ok('…while the engine\'s own line, with the reset in it, still rides along',
                /reset at 5am/.test(walled.error || ''));
            // The two windows do not reset on the same calendar, so which one it
            // was is part of the answer (B-03.8).
            const weekly = await testEngine('claude', runner({
                code: 1, stderr: 'You have hit your weekly limit for this model.'
            }), clock(1000));
            ok('‼️ …and a WEEKLY wall says weekly, because that is days rather than hours',
                weekly.refused === true && /WEEKLY/.test(weekly.detail)
                && /days, not hours/.test(weekly.detail));
            // ‼️ AND IT MUST NOT SWALLOW THE ORDINARY FAILURE. An engine that
            // really is broken still reads as broken — the refusal is for the
            // quota sentence and nothing else.
            const broken = await testEngine('claude', runner({
                code: 1, stderr: 'error: failed to connect to api.anthropic.com'
            }), clock(1000));
            ok('‼️ …and a real failure is still a failure, with its exit code',
                broken.ok === false && !broken.refused && /exited 1/.test(broken.detail));

            // ‼️ AND THE TURN GOES OUT AS THE ACCOUNT THE PAGE DREW IT BESIDE.
            // The aim's environment is what binds it; a check that measures a
            // different sign-in than the row it sits on is a wrong answer with a
            // tick beside it.
            const envSeen = [];
            const envRunner = (command, args, timeoutMs, shell, stdin, runEnv) => {
                envSeen.push(runEnv);
                return Promise.resolve({ code: 0, stdout: 'OK', stderr: '' });
            };
            await testEngine('claude', envRunner, clock(1000),
                { providerId: '', spawnEnv: { CLAUDE_CONFIG_DIR: 'D:/slots/claude-b' } });
            ok('‼️ X-219 — the aimed sign-in reaches the spawn, so the test runs AS that account',
                (envSeen[0] || {}).set?.CLAUDE_CONFIG_DIR === 'D:/slots/claude-b');
            await testEngine('claude', envRunner, clock(1000),
                { providerId: '', clearEnv: ['CLAUDE_CONFIG_DIR'] });
            ok('…and the machine\'s own sign-in CLEARS the variable rather than blanking it (X-101)',
                (envSeen[1] || {}).clear?.[0] === 'CLAUDE_CONFIG_DIR'
                && (envSeen[1] || {}).set === undefined);
        }

        // ‼️ …AND BOTH DOORS ASK IT OF THE SAME ACCOUNT. The page's button and
        // the bridge op are one question; wiring the sign-in into one of them is
        // how the two come to disagree (`_REF/agentfarm-dev.md`).
        {
            const fsx = require('fs');
            const ext = fsx.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
            const aimed = (ext.match(/testEngine\(\s*id[^)]*engineTestAim\(id\)/g) || []).length;
            ok('‼️ X-219 — the page dep and the bridge op both aim the test at the standing sign-in',
                aimed === 2);
            ok('…and the aim is built from the SAME pair a launch resolves with',
                /const engineTestAim[\s\S]{0,700}accountResolution\([\s\S]{0,200}accountEnvFor\(/.test(ext));
        }

        // ---------- the panel: nothing spends anything on its own ----------
        const fs = require('fs');
        const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'enginesPanel.ts'), 'utf8');
        const ext2 = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        const page = fs.readFileSync(path.join(__dirname, '..', 'media', 'engines.js'), 'utf8');

        // ‼️ X-187 NARROWED THIS, AND ONLY IN THE DIRECTION OF BEING STRICTER.
        //
        // The rule was written as "no timer anywhere in this panel", which was a
        // proxy for the thing that actually matters: nothing may spend a TURN on
        // its own. A turn against an engine costs the user's plan; a usage
        // reading is a free GET already held behind `AccountUsageService`'s own
        // machine-wide floor and backoff, and refusing to make one is what left
        // the Accounts cards drawing an empty bar for ever.
        //
        // So the ban is now stated as what it means — no scheduled path may
        // reach `deps.test` — plus an ALLOW-LIST of exactly one thing a timer in
        // this file may call. A second entry here is a decision somebody has to
        // make on purpose, which is the point.
        const timerBodies = [...panel.matchAll(/set(?:Interval|Timeout)\(([\s\S]*?)\}, /g)].map(m => m[1]);
        ok('‼️ the test runs from the button and from nothing else',
            /case 'engineTest'/.test(panel)
            // refresh and open rebuild the page out of the CACHE, never by calling
            && !/refresh\(\)[\s\S]{0,200}this\.deps\.test\(/.test(panel)
            && !timerBodies.some(b => /this\.deps\.test\(|runTest\(/.test(b)));
        ok('…and the only thing this panel may schedule is a free usage reading',
            // ‼️ The COUNT is part of the claim: `every` over an empty list is
            // true, so without this the allow-list would go green on a build
            // that lost the reading altogether — a rule that passes by being
            // absent is not a rule.
            timerBodies.length === 1
            && timerBodies.every(b => /this\.live\(\)/.test(b))
            && /private live\(\)/.test(panel)
            && /this\.deps\.readAccounts\(\)/.test(panel));
        ok('…which is skipped while nobody is looking at the page',
            /this\.host\.visible/.test(panel));
        ok('…and stops when the page closes',
            /clearInterval\(this\.beat\)/.test(panel));
        ok('…and a second press does not buy a second turn',
            /this\.running\.has\(id\)/.test(panel) && /this\.running\.add\(id\)/.test(panel));
        ok('…and a missing CLI is refused rather than spent',
            /if \(!engine\.cli\.found\)/.test(panel));
        ok('the verdict is cached with its own timestamp, so looking twice is free',
            /private verdicts = new Map/.test(panel) && /verdicts: \[\.\.\.verdicts\.values\(\)\]/.test(panel));
        ok('the page says what the button costs before it is pressed',
            /costs a turn of your plan or key/.test(page));
        ok('a docs link can only be https, on this panel too',
            /\/\^https:\\\/\\\/\/\.test\(msg\.url\)/.test(panel));
        ok('no credential is read on this path', !/vault\.get\(/.test(panel) && !/vault\.get\(/.test(page));

        // agentfarm-dev.md: a user-triggerable function reaches the bridge in
        // the SAME commit as the feature.
        ok('‼️ the health check is on the bridge, in the same commit',
            /op: 'engines\.test'/.test(ext2) && /COSTS A TURN/.test(ext2));
        ok('…and the bridge refuses to spend on an engine that is not installed',
            /need\(engine!\.cli\.found,/.test(ext2));
        ok('the panel has a command and Settings is the summary that opens it',
            /agentfarm\.openEngines/.test(ext2) && /openEngines: \(\) => \{ EnginesPanel\.show/.test(ext2));

        // ---------- X-18: the axis every start surface shares ----------
        //
        // ‼️ ONE REFUSAL, WORDED ONCE. Five entry points can start a session
        // (the Console composer, the ▶ picker, the full launcher, a task, the
        // bridge) and each of them checking readiness in its own words is five
        // chances to word it wrong. `engineOptions` narrows the heavy answer;
        // `engineRefusal` is the one sentence.
        {
            const { engineOptions, engineRefusal } =
                require(path.join(__dirname, '..', 'out', 'core', 'engines.js'));
            const ready = readEngines(probe({
                path: ['claude', 'codex'],
                files: {
                    '.claude/.credentials.json': JSON.stringify({ claudeAiOauth: { expiresAt: 1 } }),
                    '.codex/auth.json': JSON.stringify({
                        auth_mode: 'chatgpt', tokens: { access_token: 'x' }
                    })
                }
            }));
            const opts = engineOptions(ready);
            ok('every engine becomes exactly one picker row', opts.length === ready.length);
            ok('…carrying the three things a picker needs and nothing heavier',
                opts.every(o => typeof o.label === 'string' && typeof o.ready === 'boolean'
                    && typeof o.next === 'string' && typeof o.billing === 'string'));
            ok('…and HOW it is paid for, which is the line under its name',
                by(opts, 'codex').auth === 'subscription');

            ok('an engine that can run is not refused', !engineRefusal(opts, 'codex'));
            ok('‼️ …and an empty engine is Claude, so nothing written before this '
                + 'axis existed starts being refused',
                !engineRefusal(opts, '') && !engineRefusal(opts, undefined));
            ok('…a name this build does not know is refused WITH the real list',
                /nonsense/.test(engineRefusal(opts, 'nonsense') || '')
                && /claude/.test(engineRefusal(opts, 'nonsense') || ''));

            // ‼️ The refusal is not "not configured" — that is the phrase this
            // whole item exists to delete. It carries the row's own `next`.
            const half = engineOptions(readEngines(probe({ path: ['claude'] })));
            const why = engineRefusal(half, 'codex') || '';
            ok('‼️ an engine that cannot run is refused with the ONE thing to do about it',
                /cannot run on this machine/.test(why)
                && /chatgpt\.com\/codex\/install/.test(why));
            ok('…named by its label, not by its id — the picker showed the label',
                /^Codex /.test(why));
        }

        console.log(`${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
    })();
}
