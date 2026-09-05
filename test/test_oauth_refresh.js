// X-204 — AN EXPIRED ACCESS TOKEN IS NOT A SIGNED-OUT ACCOUNT.
//
// ‼️ The bug this suite exists to prevent is an INVERSION, not a crash: the
// usage reader saw HTTP 401, wrote `expired`, and `slotIsUsable` then refused
// to start a session on a perfectly healthy account whose access token had
// simply aged out of its few hours. The user was sent to a browser to fix
// nothing, and the sentry lost an account it was entitled to switch to.
//
// The two halves of the grant are the whole subject: `accessToken` dies hourly
// and costs one HTTP call, `refreshToken` dies in weeks and costs a person.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    grantOf, planRefresh, applyRefresh, ensureAccessToken,
    CLIENT_ID, TOKEN_HOST, TOKEN_PATH, EXPIRY_SKEW_MS
} = require(path.join(__dirname, '..', 'out', 'core', 'oauthRefresh.js'));

const NOW = Date.parse('2026-09-05T12:00:00Z');
const HOUR = 3600_000;
const DAY = 86400_000;

/** The file Claude Code writes, with whatever needs overriding. */
const creds = (o = {}) => ({
    claudeAiOauth: {
        accessToken: 'sk-ant-oat-old',
        refreshToken: 'sk-ant-ort-live',
        expiresAt: NOW + HOUR,
        refreshTokenExpiresAt: NOW + 28 * DAY,
        scopes: ['user:inference', 'user:profile'],
        subscriptionType: 'pro',
        rateLimitTier: 'default_claude_ai',
        ...o
    }
});

// ---------- the plan, decided before anything is spent ----------
{
    ok('a live access token is used as it stands — no exchange, no request',
        planRefresh(grantOf(creds()), NOW).kind === 'live');

    ok('an aged-out access token with a live refresh token is exchanged',
        planRefresh(grantOf(creds({ expiresAt: NOW - 1 })), NOW).kind === 'exchange');

    // ‼️ The skew is not decoration: a request that takes a couple of seconds
    // must not be started with one second of token life in hand.
    ok('‼️ a token expiring inside the skew window is treated as already gone',
        planRefresh(grantOf(creds({ expiresAt: NOW + EXPIRY_SKEW_MS - 1000 })), NOW).kind === 'exchange');

    ok('a dead refresh token is the one verdict a person has to act on',
        planRefresh(grantOf(creds({ expiresAt: NOW - 1, refreshTokenExpiresAt: NOW - 1 })), NOW).kind === 'dead');

    ok('…and so is a stored sign-in with no refresh token at all',
        planRefresh(grantOf(creds({ expiresAt: NOW - 1, refreshToken: '' })), NOW).kind === 'dead');

    // ‼️ Matching readClaudeIdentity: some grants carry no refresh expiry, and
    // refusing an account because a field is absent invents a fault.
    const noExpiry = creds({ expiresAt: NOW - 1 });
    delete noExpiry.claudeAiOauth.refreshTokenExpiresAt;
    ok('‼️ a MISSING refresh expiry means "still good", not "expired"',
        planRefresh(grantOf(noExpiry), NOW).kind === 'exchange');

    ok('an empty file is no grant at all, not a dead one',
        planRefresh(grantOf({}), NOW).kind === 'no-grant');
    ok('…and the scopes travel with the exchange, so the new token is not narrower',
        planRefresh(grantOf(creds({ expiresAt: NOW - 1 })), NOW).scopes.join(' ') === 'user:inference user:profile');
}

// ---------- folding the answer back into the file ----------
{
    const merged = applyRefresh(creds(), {
        access_token: 'sk-ant-oat-new', expires_in: 28800,
        refresh_token_expires_in: 30 * 86400, scope: 'user:inference user:profile'
    }, NOW);
    const o = merged.file.claudeAiOauth;
    ok('the new access token replaces the old one', o.accessToken === 'sk-ant-oat-new');
    ok('expiry is expires_in seconds from now, in ms', o.expiresAt === NOW + 28800_000);
    ok('the refresh expiry moves too when the server states one',
        o.refreshTokenExpiresAt === NOW + 30 * DAY);

    // ‼️ Silence is not deletion. The server rotates the refresh token only
    // sometimes; treating an absent field as "throw it away" would destroy the
    // one credential a machine cannot re-mint on its own.
    ok('‼️ an absent refresh_token in the answer KEEPS the stored one',
        o.refreshToken === 'sk-ant-ort-live');

    // ‼️ The file belongs to Claude Code; we replace four values in it.
    ok('‼️ fields this side does not understand survive the write',
        o.subscriptionType === 'pro' && o.rateLimitTier === 'default_claude_ai');

    const rotated = applyRefresh(creds(), {
        access_token: 'a', refresh_token: 'sk-ant-ort-rotated', expires_in: 60
    }, NOW);
    ok('…and a rotated refresh token is stored when the server does send one',
        rotated.file.claudeAiOauth.refreshToken === 'sk-ant-ort-rotated');

    ok('an answer with no access token is refused rather than half-applied',
        applyRefresh(creds(), { expires_in: 60 }, NOW) === undefined);
}

// ---------- the whole operation ----------
async function run(file, opts = {}) {
    const disk = { text: JSON.stringify(file), writes: 0 };
    const side = {
        text: opts.sidecarRaw !== undefined ? opts.sidecarRaw
            : (opts.sidecar ? JSON.stringify(opts.sidecar) : undefined),
        writes: 0, removed: 0
    };
    const posts = [];
    const out = await ensureAccessToken('D:/slot/.credentials.json', {
        now: () => NOW,
        readFile: (f) => {
            if (opts.unreadable) { throw new Error('EBUSY'); }
            if (f.endsWith('.rotated.json')) {
                if (side.text === undefined) { throw new Error('ENOENT'); }
                return side.text;
            }
            return disk.text;
        },
        exists: (f) => (f.endsWith('.rotated.json') ? side.text !== undefined : true),
        writePlain: (f, c) => { side.writes++; side.text = c; },
        remove: (f) => { if (f.endsWith('.rotated.json')) { side.removed++; side.text = undefined; } },
        writeFile: (f, c) => {
            disk.writes++; disk.text = c;
            return opts.writeFails ? { ok: false, error: 'EPERM' } : { ok: true };
        },
        post: async (rt, scopes) => {
            posts.push({ rt, scopes });
            if (opts.throws) { throw new Error('getaddrinfo ENOTFOUND'); }
            return opts.reply ?? { status: 200, body: JSON.stringify({ access_token: 'sk-ant-oat-new', expires_in: 28800 }) };
        }
    });
    return { out, disk, posts, side };
}

async function main() {
    {
        const { out, posts, disk } = await run(creds());
        ok('a live token short-circuits: no exchange is attempted at all',
            out.kind === 'live' && out.token === 'sk-ant-oat-old' && posts.length === 0 && disk.writes === 0);
    }
    {
        const { out, posts, disk } = await run(creds({ expiresAt: NOW - 1 }));
        ok('an aged-out token is exchanged for a new one', out.kind === 'refreshed' && out.token === 'sk-ant-oat-new');
        ok('…the stored refresh token is what was sent', posts.length === 1 && posts[0].rt === 'sk-ant-ort-live');
        ok('…and the file was written back exactly once',
            disk.writes === 1 && JSON.parse(disk.text).claudeAiOauth.accessToken === 'sk-ant-oat-new');
    }
    {
        // ‼️ THE RACE THIS DESIGN EXISTS TO AVOID. A CLI session in the same
        // slot refreshed a second ago; the file already holds a live token, so
        // we spend no request and — the part that matters — we do not rotate a
        // refresh token that a running process is still holding.
        const { out, posts } = await run(creds({ expiresAt: NOW + 4 * HOUR }));
        ok('‼️ a grant another process just refreshed is read, not exchanged again',
            out.kind === 'live' && posts.length === 0);
    }
    {
        const { out, posts } = await run(creds({ expiresAt: NOW - 1, refreshTokenExpiresAt: NOW - DAY }));
        ok('a dead refresh token is rejected WITHOUT asking the endpoint',
            out.kind === 'rejected' && posts.length === 0 && /expired on 2026-09-04/.test(out.reason));
    }
    {
        const { out } = await run(creds({ expiresAt: NOW - 1 }), { reply: { status: 400, body: '{}' } });
        ok('HTTP 400 from the token endpoint is the grant being thrown away — rejected',
            out.kind === 'rejected' && /refused the stored refresh token/.test(out.reason));
    }
    {
        const { out } = await run(creds({ expiresAt: NOW - 1 }), { reply: { status: 401, body: '{}' } });
        ok('…and so is 401', out.kind === 'rejected');
    }
    // ‼️ EVERYTHING ELSE IS WEATHER, and weather must never be reported as a
    // signed-out account — that is the exact inversion X-204 undoes.
    {
        const { out } = await run(creds({ expiresAt: NOW - 1 }), { reply: { status: 500, body: '' } });
        ok('‼️ HTTP 500 is this machine\'s problem, not the account\'s — unavailable, never rejected',
            out.kind === 'unavailable' && /HTTP 500/.test(out.reason));
    }
    {
        const { out } = await run(creds({ expiresAt: NOW - 1 }), { throws: true });
        ok('‼️ an unreachable endpoint is unavailable, never rejected', out.kind === 'unavailable');
    }
    {
        const { out } = await run(creds({ expiresAt: NOW - 1 }), { reply: { status: 200, body: 'not json' } });
        ok('a 200 that is not JSON is unavailable, not a sign-out', out.kind === 'unavailable');
    }
    {
        const { out } = await run(creds(), { unreadable: true });
        ok('a credentials file that cannot be read is unavailable, not a sign-out',
            out.kind === 'unavailable');
    }
    // ---------- ‼️ the rotation protocol — measured, and it cost an account ----------
    //
    // Anthropic rotates the refresh token on every exchange and revokes the
    // access token that was in force. A rotation whose answer is not stored
    // therefore leaves the directory holding a credential the server has
    // already thrown away: `invalid_grant`, and only a browser can undo it.
    // That is not a hypothetical — it happened on 2026-09-05 to the account
    // this item was opened for, during the very test that proved the exchange
    // works. Every assertion in this block is about never repeating it.
    {
        const { out, side, disk } = await run(creds({ expiresAt: NOW - 1 }));
        ok('‼️ the rotated grant is parked in a sidecar BEFORE the real file is replaced',
            side.writes === 1 && out.kind === 'refreshed');
        ok('…and the sidecar is cleared once the real file really took it',
            side.removed === 1 && JSON.parse(disk.text).claudeAiOauth.accessToken === 'sk-ant-oat-new');
    }
    {
        // ‼️ A locked file must not cost the account. The window between "the
        // server rotated" and "the file says so" is the whole danger, and the
        // sidecar is what survives it.
        const { out, side } = await run(creds({ expiresAt: NOW - 1 }), { writeFails: true });
        ok('‼️ a token that could not be SAVED is still returned and used',
            out.kind === 'refreshed' && out.token === 'sk-ant-oat-new');
        ok('‼️ …and it SURVIVES on disk in the sidecar rather than being lost with the process',
            side.text !== undefined && side.removed === 0
            && JSON.parse(side.text).claudeAiOauth.accessToken === 'sk-ant-oat-new');
    }
    {
        // The next read finds the sidecar. It is strictly newer than the file
        // beside it — the file's grant is already dead — so it is adopted.
        const dead = creds({ accessToken: 'sk-ant-oat-dead', refreshToken: 'sk-ant-ort-dead', expiresAt: NOW - 99 });
        const rotated = creds({ accessToken: 'sk-ant-oat-rotated', refreshToken: 'sk-ant-ort-rotated', expiresAt: NOW + HOUR });
        const { out, posts, disk, side } = await run(dead, { sidecar: rotated });
        ok('‼️ a sidecar left by a failed write is ADOPTED on the next read, not ignored',
            out.kind === 'live' && out.token === 'sk-ant-oat-rotated');
        ok('…without asking the endpoint for anything', posts.length === 0);
        ok('…and it is promoted into the real file and then cleared',
            JSON.parse(disk.text).claudeAiOauth.refreshToken === 'sk-ant-ort-rotated' && side.removed === 1);
    }
    {
        // Litter that is not a credential must not be mistaken for one, and
        // must not be deleted either — a file we could not parse may still be
        // the only copy of something.
        const { out, side } = await run(creds(), { sidecarRaw: '{ half a file' });
        ok('an unparseable sidecar is stepped over, not adopted and NOT deleted',
            out.kind === 'live' && out.token === 'sk-ant-oat-old' && side.removed === 0);

        // One that parses and holds no grant is litter with nothing to lose.
        const empty = await run(creds(), { sidecarRaw: '{"stray":true}' });
        ok('…while a sidecar that parses and carries no grant is swept up',
            empty.out.token === 'sk-ant-oat-old' && empty.side.removed === 1);
    }

    // ---------- the constants were read out of the CLI, not invented ----------
    ok('the token endpoint is the CLI\'s own',
        TOKEN_HOST === 'platform.claude.com' && TOKEN_PATH === '/v1/oauth/token');
    ok('the client id is Claude Code\'s public one',
        CLIENT_ID === '9d1c250a-e61b-44d9-88ed-5944d1962f5e');

    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}

main();
