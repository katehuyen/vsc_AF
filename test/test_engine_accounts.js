// X-168 — ACCOUNT SLOTS: an identity is a DIRECTORY, not a file you overwrite.
//
// ‼️ THE MEASUREMENT THIS WHOLE MODULE RESTS ON (2026-09-03, this machine):
// `CLAUDE_CONFIG_DIR` fully isolates a Claude Code identity. Pointed at an empty
// directory, `claude auth status --json` answered `loggedIn: false`, reported
// `projectsDirectory` INSIDE that directory, and wrote a fresh `.claude.json`
// there. So switching accounts is not "copy this file over the live one" — that
// would clobber the identity of the session the user is talking to right now,
// and it could never run two accounts at once. It is one environment variable,
// decided before the process starts.
//
// Which is exactly the shape X-105 already established for a Claude ROUTE: base
// URL, auth and tier are injected before the spawn and cannot change inside a
// running session. An account is a second dimension on that same axis, so this
// module answers only the pure questions — who is this identity, is it usable,
// what environment does it need, and what does a slot directory share with the
// main one. Everything that touches disk or vscode lives above it.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    readClaudeIdentity, readCodexIdentity, readGeminiIdentity, accountEnv, slotDir,
    mintSlotId, slotHealth, describeSlotLayout, adapterFor, ENGINE_AUTH_ADAPTERS,
    accountCapableEngines, captureRefusal, readSlotIdentity, slotQuotaSource
} = require(path.join(__dirname, '..', 'out', 'core', 'engineAccounts.js'));
// X-219 — a slot's own decisions live with the slots, beside accountRefusal.
const { planReauth } = require(path.join(__dirname, '..', 'out', 'core', 'accountStore.js'));

/** A reader built from a plain map — no home directory, no disk. */
const fsOf = (files) => ({
    read: (f) => files[f.replace(/\\/g, '/')],
    exists: (f) => Object.prototype.hasOwnProperty.call(files, f.replace(/\\/g, '/'))
});

const NOW = Date.parse('2026-09-03T20:00:00Z');
const creds = (o) => JSON.stringify({
    claudeAiOauth: Object.assign({
        accessToken: 'sk-ant-oat-REDACTED', refreshToken: 'sk-ant-ort-REDACTED',
        expiresAt: NOW + 3600_000, refreshTokenExpiresAt: NOW + 30 * 86400_000,
        scopes: ['user:inference'], subscriptionType: 'pro', rateLimitTier: 'default_claude_pro'
    }, o)
});
const config = (email) => JSON.stringify({
    oauthAccount: { accountUuid: 'u-1', emailAddress: email, organizationUuid: 'o-1' },
    projects: { 'D:/zone/dev': { allowedTools: [] } }
});

// ---------- reading an identity out of a config directory ----------
{
    const dir = 'D:/slots/claude-1';
    const id = readClaudeIdentity(fsOf({
        [dir + '/.credentials.json']: creds({}),
        [dir + '/.claude.json']: config('murat@example.com')
    }), dir, NOW);

    ok('the identity is read from the directory, not guessed',
        id.email === 'murat@example.com' && id.subscriptionType === 'pro');
    ok('‼️ …and it is usable, because both tokens are still in date', id.health === 'ready');
    // ‼️ THE VALUE NEVER LEAVES. Every surface above this asks "is there an
    // identity and whose", never "what is the token" — the same boundary the
    // Secrets vault draws, for the same reason.
    ok('‼️ no token, access or refresh, is anywhere in what comes back',
        !JSON.stringify(id).includes('REDACTED'));
    ok('the expiries come back as numbers a countdown can use',
        id.expiresAt === NOW + 3600_000 && id.refreshExpiresAt === NOW + 30 * 86400_000);
}

// ---------- the three states a slot can be in ----------
{
    const dir = 'D:/slots/claude-2';
    const at = (o) => readClaudeIdentity(fsOf({
        [dir + '/.credentials.json']: creds(o), [dir + '/.claude.json']: config('b@example.com')
    }), dir, NOW).health;

    // ‼️ AN EXPIRED ACCESS TOKEN IS NOT A BROKEN ACCOUNT. Claude Code refreshes
    // it silently over HTTP and never opens a browser to do it — which is the
    // whole reason a captured slot keeps working for weeks. A row that called
    // this "signed out" would send the user to a login they do not need.
    ok('‼️ an expired ACCESS token is still ready — the CLI refreshes it silently',
        at({ expiresAt: NOW - 60_000 }) === 'ready');
    // The refresh token is the one that matters: when it goes, only a real
    // sign-in brings the account back, and the loop must say so rather than
    // starting sessions that die on their first turn.
    ok('‼️ a dead REFRESH token is the one that needs a person',
        at({ refreshTokenExpiresAt: NOW - 60_000 }) === 'needs-signin');
    ok('…and so does a directory with no credentials in it at all',
        readClaudeIdentity(fsOf({}), 'D:/slots/empty', NOW).health === 'needs-signin');
    // Unreadable is not the same as absent, and saying "signed out" for a
    // locked or half-written file would send somebody to fix the wrong thing.
    ok('‼️ a credentials file that will not parse says so instead of lying',
        readClaudeIdentity(fsOf({ 'D:/slots/x/.credentials.json': '{ not json' }), 'D:/slots/x', NOW)
            .health === 'unreadable');
}

// ---------- what activating a slot actually IS ----------
{
    const slot = { id: 'claude-murat', engine: 'claude', dir: 'D:/slots/claude-murat' };
    const env = accountEnv(slot);
    ok('‼️ activating a slot is ONE environment variable, not a file copy',
        Object.keys(env).length === 1 && env.CLAUDE_CONFIG_DIR === 'D:/slots/claude-murat');
    // ‼️ THE MAIN ACCOUNT IS THE ABSENCE OF THE VARIABLE, not a slot pointing at
    // `~/.claude`. Naming the default directory explicitly would mean every
    // session Agent Farm starts carries a variable no session carried before —
    // a behaviour change dressed up as a default.
    ok('‼️ …and no slot means no variable, so today\'s behaviour is untouched',
        Object.keys(accountEnv(undefined)).length === 0);
    ok('a slot with no directory cannot be activated by accident',
        Object.keys(accountEnv({ id: 'x', engine: 'claude', dir: '' })).length === 0);
}

// ---------- ids: stable, filename-safe, and never colliding ----------
{
    ok('an id is minted from the address, so it reads as the account it is',
        mintSlotId('claude', 'Murat.Vural@Example.com', []) === 'claude-murat-vural');
    ok('‼️ …lower-cased with the INVARIANT rules — a Turkish locale maps i to İ',
        mintSlotId('claude', 'IRIS@example.com', []) === 'claude-iris');
    ok('a second account on the same address gets a number, never a silent overwrite',
        mintSlotId('claude', 'murat@example.com', ['claude-murat']) === 'claude-murat-2'
        && mintSlotId('claude', 'murat@example.com', ['claude-murat', 'claude-murat-2'])
            === 'claude-murat-3');
    ok('an address we could not read still yields a usable id',
        /^claude-account(-\d+)?$/.test(mintSlotId('claude', '', [])));
    ok('‼️ nothing that is not a path character survives — the id IS a folder name',
        !/[^a-z0-9-]/.test(mintSlotId('claude', 'a b/c\\d:e@example.com', [])));
}

// ---------- the slot directory, and the one thing it must NOT isolate ----------
{
    ok('a slot lives under the root it was given, by its own id',
        slotDir('D:/store/accounts', 'claude-murat') === path.join('D:/store/accounts', 'claude-murat'));
    // ‼️ THE TRAP THIS DECLARATION EXISTS FOR. `CLAUDE_CONFIG_DIR` moves the
    // TRANSCRIPTS too — measured: `projectsDirectory` pointed inside the probe
    // directory. Agent Farm indexes ONE root (`claudeDir()`), so a session run
    // under an isolated slot would be invisible in the panel: no history, no
    // resume, no cost. The identity is the only thing that may be per-slot.
    const claude = adapterFor('claude');
    ok('‼️ the identity files are the slot\'s own',
        claude.ownFiles.includes('.credentials.json') && claude.ownFiles.includes('.claude.json'));
    ok('‼️ …and `projects` is SHARED, or the panel loses every session it starts',
        claude.sharedPaths.includes('projects'));
    ok('the layout says why, in the same place it says what',
        /transcript|session records|projects/i.test(describeSlotLayout('claude'))
        && /junction|link/i.test(describeSlotLayout('claude')));
}

// ---------- X-167: THE SEAM, because this is not a Claude feature ----------
//
// ‼️ The umbrella item is not "let the user switch between three Claude plans";
// it is "let this extension command every browser-authenticated subscription it
// can drive, on every engine". The difference is not ambition, it is where the
// engine-specific facts LIVE: one adapter row each, or a `=== 'claude'` in the
// launcher, the page, the bridge and the runner that has to be found four times
// when Codex is added. These tests hold that line.
{
    ok('‼️ every engine the extension knows has an account answer, even if it is no',
        ['claude', 'codex', 'gemini', 'opencode', 'agy']
            .every(e => ENGINE_AUTH_ADAPTERS.some(a => a.engine === e)));
    // An engine nobody has written a row for must not throw: engines arrive in
    // this codebase faster than adapters do, and a page that crashes on a new
    // one is worse than a row saying "not mapped yet".
    const unknown = adapterFor('some-engine-from-2027');
    ok('an engine with no adapter answers `unmapped` instead of crashing',
        unknown.support === 'unmapped' && unknown.configEnv === '');
    ok('…and says which engine it could not map, so the message is actionable',
        unknown.evidence.includes('some-engine-from-2027'));

    // ‼️ THE HONESTY RULE. A captured slot that does not actually isolate is
    // worse than no slot, because nothing errors — the sessions just quietly
    // burn one plan. So the certainty is data, and only proven or documented
    // isolation may be captured.
    ok('‼️ Claude is the MEASURED one, and the evidence is stored beside the claim',
        adapterFor('claude').support === 'measured'
        && /2026-09-03|loggedIn/.test(adapterFor('claude').evidence));
    ok('‼️ an unmapped engine refuses capture in the same words every surface will print',
        captureRefusal('agy').length > 20 && captureRefusal('claude') === '');
    ok('capture is offered exactly for the engines that can isolate',
        accountCapableEngines().includes('claude')
        && !accountCapableEngines().includes('agy'));
    ok('every adapter states its evidence — a support level with no reason is a guess',
        ENGINE_AUTH_ADAPTERS.every(a => a.evidence.length > 40));
    // ---------- ‼️ X-219 — AND WHERE THE OFFER MAY BE MADE AT ALL ----------
    //
    // The command is half the answer; the other half is refusing to offer it
    // where it would do damage. `planReauth` is that half, and it refuses more
    // often than it agrees:
    //
    //   · never over the LIVE directory — X-168's rule. Renewing the sign-in the
    //     machine itself is logged in as is not a slot's business, and the
    //     session being talked to right now runs as it;
    //   · never for an engine that cannot keep two identities apart, because the
    //     login would land in the one directory both of them read;
    //   · never for a slot that is not there.
    //
    // ‼️ AND IT NEVER SAYS "READY". A plan hands back the command and the way to
    // MEASURE the result; nothing here may declare a sign-in fixed, because the
    // browser flow it starts can be abandoned halfway and the card would then be
    // lying about the one fact it exists to state.
    {
        const slots = [
            { id: 'work-1', engine: 'claude', dir: 'D:/slots/work-1' },
            { id: 'codex-1', engine: 'codex', dir: 'D:/slots/codex-1' },
            { id: 'agy-1', engine: 'agy', dir: 'D:/slots/agy-1' }
        ];
        const ok1 = planReauth('work-1', slots);
        ok('‼️ X-219: a stored slot of an isolatable engine may be signed in again',
            !ok1.refusal && ok1.command === 'claude' && ok1.args.join(' ') === 'auth login');
        ok('‼️ …in ITS OWN directory, through the one seam every launch goes through',
            ok1.env.CLAUDE_CONFIG_DIR === 'D:/slots/work-1');
        ok('…and the plan carries how to READ THE RESULT BACK, so nothing has to assume it',
            ok1.statusArgs.join(' ') === 'auth status' && ok1.dir === 'D:/slots/work-1');
        ok('‼️ …and it never declares the outcome itself',
            !('health' in ok1) && !('ready' in ok1));
        ok('each engine gets its own command and its own variable',
            planReauth('codex-1', slots).command === 'codex'
            && planReauth('codex-1', slots).env.CODEX_HOME === 'D:/slots/codex-1');

        ok('‼️ the MAIN sign-in is refused by name — it is the absence of a slot, not one',
            /main sign-in|machine/i.test(planReauth('@machine', slots).refusal || ''));
        ok('‼️ …an engine that cannot keep two identities apart is refused, and says why',
            (planReauth('agy-1', slots).refusal || '').length > 30);
        ok('…and a slot that is not stored is refused rather than guessed at',
            /no account|not stored|forgotten/i.test(planReauth('ghost', slots).refusal || ''));
        ok('…every refusal comes with no command at all, so a caller cannot run one anyway',
            [planReauth('@machine', slots), planReauth('agy-1', slots), planReauth('ghost', slots)]
                .every(r => !!r.refusal && !r.command));
    }

    // ---------- ‼️ X-219 — THE CARD SAYS "ONLY A PERSON CAN FIX IT", AND MEANS IT ----------
    //
    // A dead sign-in reads "sign in again in a terminal and capture it once more.
    // Nothing here can renew it" — true, and the reason the debt on one account
    // has stood for seven sessions. Renewing it is a BROWSER flow: an agent may
    // not drive the user's browser and may not open a debug connection to it, so
    // what the extension can honestly do is open the right command in the right
    // isolated directory and then MEASURE the result.
    //
    // ‼️ THE COMMAND IS THE ENGINE'S OWN, AND IT IS NOT GUESSED. Measured on this
    // machine 2026-09-06 from the CLIs' own --help: Claude Code signs in with
    // `claude auth login` (there is NO `claude login` — the item asked for one),
    // and Codex with `codex login`. Each also has a status command, which is what
    // makes the card's return to "ready" a measurement rather than a hope.
    {
        const sign = a => (typeof a.signIn === 'function' ? a.signIn() : undefined);
        ok('‼️ X-219: an engine that can hold a second sign-in says HOW one is renewed',
            ENGINE_AUTH_ADAPTERS.filter(a => a.support !== 'unmapped')
                .every(a => { const s2 = sign(a); return !!s2 && !!s2.command && Array.isArray(s2.args); }));
        ok('…and one that cannot isolate offers no command rather than a wrong one',
            ENGINE_AUTH_ADAPTERS.filter(a => a.support === 'unmapped').every(a => !sign(a)));
        ok('‼️ …the Claude command is the one the CLI really has',
            sign(adapterFor('claude')).command === 'claude'
            && sign(adapterFor('claude')).args.join(' ') === 'auth login');
        ok('‼️ …and Codex\'s is its own, not Claude\'s spelt differently',
            sign(adapterFor('codex')).command === 'codex'
            && sign(adapterFor('codex')).args.join(' ') === 'login');
        ok('‼️ …each carrying the STATUS command, so "ready" can be measured rather than assumed',
            ENGINE_AUTH_ADAPTERS.filter(a => a.support !== 'unmapped')
                .every(a => Array.isArray(sign(a).statusArgs) && sign(a).statusArgs.length > 0));
        // ‼️ THE VARIABLE IS NEVER SPELT OUT AT A NEW DOOR (X-168). The command
        // is run in the slot's own directory through the SAME seam every launch
        // uses, so an engine whose variable changes changes in one place.
        ok('‼️ …and the isolation comes from accountEnv, not from a second copy of the name',
            ENGINE_AUTH_ADAPTERS.filter(a => a.support !== 'unmapped')
                .every(a => !JSON.stringify(sign(a)).includes(a.configEnv)));
    }

    ok('‼️ …and no adapter claims a variable it has not verified',
        ENGINE_AUTH_ADAPTERS.every(a => (a.support === 'unmapped') === (a.configEnv === '')));

    // ‼️ THE POINT OF THE SEAM, in one assertion: the variable NAME is the
    // engine's, not Claude's. When Codex is measured, this is already true and
    // nothing downstream is touched.
    ok('‼️ the environment variable comes from the engine, not from a constant',
        accountEnv({ engine: 'codex', dir: 'D:/slots/codex-1' }).CODEX_HOME === 'D:/slots/codex-1');
    ok('‼️ …and an engine that cannot isolate gets NO variable rather than a wrong one',
        Object.keys(accountEnv({ engine: 'agy', dir: 'D:/slots/agy-1' })).length === 0);
}

// ---------- reading a foreign identity through the same door ----------
{
    // Codex records no address at all — OpenAI keeps it inside the id_token —
    // so an empty email is the NORMAL case here, not a fault to report.
    const cx = readCodexIdentity(fsOf({
        'D:/slots/codex-1/auth.json': JSON.stringify({
            auth_mode: 'chatgpt', last_refresh: '2026-09-01T10:00:00Z',
            tokens: { access_token: 'REDACTED', account_id: 'acc-1' }
        })
    }), 'D:/slots/codex-1');
    ok('a ChatGPT sign-in reads as ready, with its mode as the subscription',
        cx.health === 'ready' && cx.subscriptionType === 'chatgpt');
    ok('‼️ …with no email, and that is not an error', cx.email === '');
    ok('‼️ and no token value comes back from a foreign engine either',
        !JSON.stringify(cx).includes('REDACTED'));
    ok('an empty codex directory needs a sign-in like any other',
        readCodexIdentity(fsOf({}), 'D:/slots/codex-2').health === 'needs-signin');

    // ‼️ READING IS NOT CAPTURING. Gemini cannot hold a second slot yet, but the
    // Engines page can still say whose sign-in is on this machine — support
    // governs capture, not reading, and conflating the two would blank a row
    // that has a perfectly readable answer.
    const gm = readGeminiIdentity(fsOf({
        'D:/gem/oauth_creds.json': JSON.stringify({ refresh_token: 'r', expiry_date: NOW + 3600_000 })
    }), 'D:/gem');
    ok('‼️ an unmapped engine\'s identity is still readable where it lives',
        gm.health === 'ready' && adapterFor('gemini').support === 'unmapped');

    // The dispatcher is what every surface above actually calls.
    ok('readSlotIdentity routes by the slot\'s own engine',
        readSlotIdentity({ engine: 'codex', dir: 'D:/slots/codex-1' }, fsOf({
            'D:/slots/codex-1/auth.json': JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 't' } })
        })).subscriptionType === 'chatgpt');
    ok('slotHealth is the verdict, unchanged, for a caller that already read it',
        slotHealth(cx) === 'ready');
}

// ---------- quota: where it comes from, or WHY there is none ----------
{
    // ‼️ "No bar" is not an answer a user can do anything with. Every engine
    // that cannot report a per-account allowance says why in one sentence, so
    // the card prints a reason instead of an empty rectangle.
    const q = slotQuotaSource({ engine: 'claude' });
    ok('Claude\'s quota is read from the slot\'s own credentials file',
        q.kind === 'oauth-credentials' && q.file === '.credentials.json');
    /**
     * ‼️ X-215 — AND CODEX IS NOT ONE OF THEM ANY MORE. This asserted that every
     * engine but Claude publishes nothing, which was never true of Codex: it
     * writes `rate_limits.primary` into its own rollout and the status bar has
     * drawn that figure since U-27. The stamped sentence saying otherwise is
     * exactly what kept the account cards blank, so the rule is now the one that
     * matters — every engine either NAMES where its figure is read from, or says
     * in a full sentence why there is none. Nobody gets to blank a card.
     */
    ok('‼️ X-215 — Codex names its own transcripts as the source',
        (() => { const s = slotQuotaSource({ engine: 'codex' }); return s.kind === 'session-tail' && s.dir === 'sessions'; })());
    ok('‼️ an engine with no readable allowance says so, in words, not by blanking',
        ENGINE_AUTH_ADAPTERS.filter(a => a.engine !== 'claude' && a.engine !== 'codex')
            .every(a => { const s = a.quotaSource(); return s.kind === 'none' && s.reason.length > 30; }));
    ok('an unknown engine is a reason too, never an exception',
        slotQuotaSource({ engine: 'nope' }).kind === 'none' && slotQuotaSource(undefined).kind === 'none');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
