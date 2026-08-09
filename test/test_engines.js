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
    ok('all three engines are always listed', list.length === 3
        && ['claude', 'codex', 'gemini'].every(id => !!by(list, id)));
    ok('nothing is ready on an empty machine', list.every(e => !e.ready));
    // ‼️ The whole complaint in one assertion: a state is not an answer.
    ok('‼️ no row stops at naming a state — each one says what to do',
        list.every(e => /install|Sign in|sign in|vault|PATH/.test(e.next)));
    // ‼️ …and a missing CLI is named as the first problem, not the key — AND
    // the row carries the command that fixes it. "Install it" with no line to
    // run is the same dead end as "not configured": the user is told the state
    // and left to find the gesture.
    ok('…and a missing CLI is named as the first problem, with the install line on it',
        list.every(e => /not installed on this machine/.test(e.next)
            && /Install it with: npm install -g \S+/.test(e.next)));
    ok('the summary counts what can run', JSON.stringify(enginesSummary(list))
        === JSON.stringify({ ready: 0, total: 3, onPlan: 0 }));
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

// ---------- Gemini: the login that was taken away ----------
{
    const bare = by(readEngines(probe({ path: ['gemini'] })), 'gemini');
    ok('Gemini offers no plan sign-in, so no row pretends there is one',
        !bare.loginCommand && /no plan sign-in/.test(bare.next));
    ok('‼️ …and the reason is dated, so nobody hunts for a retired login',
        /retired in June 2026/.test(bare.billing));

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
    ok('‼️ a machine that refuses every question still renders three rows',
        !!list && list.length === 3 && list.every(e => !e.ready && !!e.next));
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
    const js = fs.readFileSync(path.join(__dirname, '..', 'media', 'settings.js'), 'utf8');
    const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'settingsPanel.ts'), 'utf8');

    ok('the matrix reaches Farm Settings', /engines: \(\) => engineMatrix\(\)/.test(ext)
        && /function enginesSection\(\)/.test(js) && /id="cat-engines"/.test(js));
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

        // ‼️ The verdict's AGE is part of the claim: a tick from four hours ago
        // is not the same statement as one from four seconds ago.
        ok('a verdict says how old it is', verdictAge(1000, 1000) === '0s ago'
            && verdictAge(0, 3600000) === '1h ago' && verdictAge(0, 300000) === '5m ago');

        // ---------- the panel: nothing spends anything on its own ----------
        const fs = require('fs');
        const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'enginesPanel.ts'), 'utf8');
        const ext2 = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        const page = fs.readFileSync(path.join(__dirname, '..', 'media', 'engines.js'), 'utf8');

        ok('‼️ the test runs from the button and from nothing else',
            /case 'engineTest'/.test(panel)
            // refresh and open rebuild the page out of the CACHE, never by calling
            && !/refresh\(\)[\s\S]{0,200}this\.deps\.test\(/.test(panel)
            && !/setInterval|setTimeout/.test(panel));
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

        console.log(`${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
    })();
}
