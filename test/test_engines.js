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
    ok('…and a missing CLI is named as the first problem, not the key',
        list.every(e => /not on PATH/.test(e.next)));
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
    ok('the sign-in is a terminal command, not something the extension performs',
        /engineLogin: \(command: string\) => \{/.test(ext) && /createTerminal/.test(ext));
    ok('‼️ …and it is TYPED, not run — a browser login is the user\'s to start',
        /term\.sendText\(command, false\)/.test(ext));
    ok('the key route hands over to the vault\'s own form',
        /engineKey: \(name: string\) => \{ SecretsPanel\.compose\(secretsDeps, name\); \}/.test(ext));
    ok('‼️ the probe asks the vault for a NAME and never for a value',
        /hasSecret: \(name: string\): boolean => vault\.names\(\)\.includes\(name\)/.test(ext)
        && !/vault\.get\(/.test(panel));
    ok('a docs link can only be https', /\/\^https:\\\/\\\/\/\.test\(msg\.url\)/.test(panel));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
