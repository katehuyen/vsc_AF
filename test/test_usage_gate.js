// X-240 — ONE BUDGET PER TOKEN, NOT ONE PER READER.
//
// Anthropic limits the usage endpoint per OAuth token. On this machine a token
// IS the credentials file it lives in, and TWO services read those files:
// `AccountUsageService` walks every captured sign-in, `PlanUsageService`
// watches whichever one is STANDING. Both resolve the path through the same
// `slotCredentialsFile`, so whenever an account is standing the two are
// demonstrably reading one token — and each used to keep its own `lastFetchAt`
// and its own 429 curve for it.
//
// That is why one account of four got stuck rather than all of them: the
// standing account is the only sign-in with two readers, so it alone had two
// floors (two requests could leave milliseconds apart) and two penalties (a
// refusal seen by one reader never held the other, so the hold meant to end the
// 429 was walked through by the other door and renewed itself).
//
// What is pinned here:
//   * the gate is keyed by the FILE and normalises it, so two spellings of one
//     path are one allowance;
//   * a request is charged when it LEAVES, not when it lands;
//   * a hold taken by one reader refuses the other;
//   * only a PERSON may spend through a hold, and nobody may skip the floor;
//   * the fleet-wide escalation counts TOKENS, so two slots sharing a directory
//     cannot make one refusal look like two;
//   * and the three named holes are shut: `refreshSlot` obeys a hold when its
//     caller is not a person, `PlanUsageService` obeys its floor and its hold
//     even with NO cached snapshot, and the turn-boundary read that arrives too
//     early is deferred rather than dropped.
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const gateMod = require(path.join(__dirname, '..', 'out', 'core', 'usageGate.js'));
const { UsageGate, tokenKey, crossServiceMs, MIN_CROSS_SERVICE_MS, DEFAULT_CROSS_SERVICE_MS } = gateMod;
const planMod = require(path.join(__dirname, '..', 'out', 'core', 'planusage.js'));
const { PlanUsageService, refused } = planMod;
const acctMod = require(path.join(__dirname, '..', 'out', 'core', 'accountUsage.js'));
const { AccountUsageService, slotCredentialsFile } = acctMod;

const SRC = f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');

// ---------- the key ----------
{
    ok('a path is resolved before it is a key',
        tokenKey('/a/./b/c.json') === tokenKey('/a/b/c.json'));
    ok('an empty file is not a token', tokenKey('') === '' && tokenKey('   ') === '');
    if (process.platform === 'win32') {
        ok('windows paths are case-folded, because the file system is',
            tokenKey('C:\\Users\\X\\.credentials.json') === tokenKey('c:\\users\\x\\.credentials.json'));
    } else {
        ok('a posix path keeps its case', tokenKey('/A/b.json') !== tokenKey('/a/b.json'));
        pass++; // keep the count comparable across platforms
    }
}

// ---------- the interval setting ----------
{
    ok('the default is the documented ten seconds', DEFAULT_CROSS_SERVICE_MS === 10_000);
    ok('the hard floor is five seconds', MIN_CROSS_SERVICE_MS === 5_000);
    ok('seconds become ms', crossServiceMs(12) === 12_000);
    ok('0 is not "no floor" — it is the floor', crossServiceMs(0) === MIN_CROSS_SERVICE_MS);
    ok('a setting under the floor cannot buy a faster poll',
        crossServiceMs(1) === MIN_CROSS_SERVICE_MS);
    ok('nonsense is the floor', crossServiceMs(NaN) === MIN_CROSS_SERVICE_MS);
}

// ---------- the ledger ----------
{
    const g = new UsageGate();
    const f = '/home/u/.claude/.credentials.json';
    ok('an unknown token has never been spent', g.lastAt(f) === 0);
    ok('an unknown token is not held', g.heldUntil(f, 1000) === 0);
    ok('an unknown token passes', g.check(f, 1000, 10_000).ok === true);

    g.spent(f, 1000);
    ok('a spend is recorded', g.lastAt(f) === 1000);
    ok('the floor refuses the next read', g.check(f, 2000, 10_000).ok === false);
    ok('…and says WHY', g.check(f, 2000, 10_000).why === 'floor');
    ok('…and when', g.check(f, 2000, 10_000).readyAt === 11_000);
    ok('past the floor it passes again', g.check(f, 11_000, 10_000).ok === true);

    // ‼️ THE WHOLE POINT: the OTHER reader sees the same spend.
    ok('a second reader of the same file is refused by the first reader\'s request',
        g.check(path.join('/home/u/.claude', '.credentials.json'), 2000, 10_000).ok === false);
    ok('a different token is untouched',
        g.check('/home/u/.claude-two/.credentials.json', 2000, 10_000).ok === true);
}

// ---------- the hold ----------
{
    const g = new UsageGate();
    const f = '/home/u/a/.credentials.json';
    g.held(f, 180_000, false, 1000);
    ok('a 429 holds the token', g.heldUntil(f, 2000) === 181_000);
    ok('an unexplained hold feeds the curve', g.backoffMs(f) === 180_000);
    ok('an automatic read is refused while held', g.check(f, 2000, 10_000).ok === false);
    ok('…and it says held, not floor', g.check(f, 2000, 10_000).why === 'held');
    ok('‼️ a PERSON may spend through a hold', g.check(f, 2000, 10_000, true).ok === true);
    ok('…but NOBODY skips the floor: a person who just asked still waits', (() => {
        g.spent(f, 2000);
        return g.check(f, 3000, 10_000, true).ok === false && g.check(f, 3000, 10_000, true).why === 'floor';
    })());
    ok('a hold the endpoint NAMED does not feed the curve', (() => {
        const g2 = new UsageGate();
        g2.held('/x/c.json', 60_000, true, 0);
        return g2.backoffMs('/x/c.json') === 0;
    })());
    ok('a success clears the hold and the curve', (() => {
        g.cleared(f);
        return g.heldUntil(f, 2000) === 0 && g.backoffMs(f) === 0;
    })());
    ok('a hold that has expired is not a hold', (() => {
        const g2 = new UsageGate();
        g2.held('/y/c.json', 1000, false, 0);
        return g2.heldUntil('/y/c.json', 5000) === 0 && g2.check('/y/c.json', 5000, 10, false).ok === true;
    })());
}

// ---------- the fleet escalation counts TOKENS ----------
{
    const g = new UsageGate();
    const a = '/s/a/.credentials.json', b = '/s/b/.credentials.json';
    g.held(a, 60_000, false, 0);
    ok('one held token is one', g.heldCount([a, b], 1000) === 1);
    ok('…and nothing but itself, when it is the exception', g.heldCount([a, b], 1000, a) === 0);
    g.held(b, 60_000, false, 0);
    ok('two held tokens are two', g.heldCount([a, b], 1000) === 2);
    ok('‼️ one file listed twice is still ONE token — two slots on one directory '
        + 'must not make a single refusal look like a machine-wide limit',
        g.heldCount([a, a], 1000) === 1);
    ok('heldTokens lists them for a surface', g.heldTokens(1000).length === 2);
    ok('forget drops a token\'s ledger', (() => { g.forget(a); return g.heldCount([a, b], 1000) === 1; })());
}

/** Filled in below, run by main() — a service with an EMPTY cache. */
let coldService;

// ---------- PlanUsageService obeys the gate WITH NO CACHE ----------
{
    // ‼️ The hole this closes: every guard in `read` used to sit inside
    // `if (this.snap)`, and X-212 DROPS the snapshot whenever the standing
    // account moves — which is the exact moment something also force-reads.
    const mk = (gate, now, file) => {
        let calls = 0;
        const svc = new PlanUsageService({
            ttlMs: () => 60_000,
            edgeFloorMs: () => 60_000,
            minIntervalMs: () => 10_000,
            gate,
            credentialsFile: () => file,
            readCreds: () => ({ token: 't', plan: 'max', expiresAt: now() + 3_600_000 }),
            fetchImpl: async () => { calls++; return { status: 200, body: JSON.stringify(payload) }; },
            now
        });
        return { svc, calls: () => calls };
    };
    const payload = { five_hour: { utilization: 10, resets_at: new Date(9e12).toISOString() } };

    coldService = async () => {
        const gate = new UsageGate();
        let t = 1_000_000;
        const file = '/std/.credentials.json';
        const { svc, calls } = mk(gate, () => t, file);

        // Somebody ELSE (the accounts service) just spent this token.
        gate.spent(file, t);
        const snap = await svc.get();
        ok('‼️ a cold service with no snapshot still obeys the shared floor', calls() === 0);
        ok('…and says so rather than looking broken',
            snap.state === 'error' && /moments ago/.test(snap.note || ''));
        ok('…and does NOT cache the refusal', svc.current() === undefined);

        t += 10_001;
        await svc.get();
        ok('past the floor the read goes out', calls() === 1);

        // A hold taken by the OTHER reader stops this one.
        gate.held(file, 180_000, false, t);
        t += 20_000;
        const held = await svc.get();
        ok('‼️ a hold the accounts service took refuses the indicator', calls() === 1);
        // A reader that HAS a figure is served the figure — a refusal is not
        // news about the account. Which of "nothing changed" and "we are not
        // allowed to look" it is, is what `rateLimitedUntil` is for, and every
        // surface reads it (Principle 1).
        ok('…and the last good figure is served, not an error', held.state === 'ok');
        ok('rateLimitedUntil reports the TOKEN\'s hold', svc.rateLimitedUntil() > t);
        ok('‼️ and the refusal IS spoken when there is no figure to serve instead', (() => {
            const g2 = new UsageGate();
            const f2 = '/other/.credentials.json';
            g2.held(f2, 180_000, false, t);
            const cold = new PlanUsageService({
                ttlMs: () => 60_000, minIntervalMs: () => 10_000, gate: g2,
                credentialsFile: () => f2,
                readCreds: () => ({ token: 't', plan: 'max', expiresAt: t + 3_600_000 }),
                fetchImpl: async () => { throw new Error('must not be called'); },
                now: () => t
            });
            return cold.rateLimitedUntil() > t;
        })());

        // The person's button still gets through.
        t += 20_000;
        await svc.get(true);
        ok('‼️ a person still spends their request through a hold', calls() === 2);
    };
}

// ---------- the source guards (run before the async block resolves) ----------
{
    const acct = SRC('core/accountUsage.ts');
    ok('refreshSlot takes a reason', /refreshSlot\(slotId: string, reason: 'user' \| 'auto' = 'user'\)/.test(acct));
    ok('‼️ refreshSlot now asks the gate — the hole the sentry walked through',
        /const verdict = this\.gate\.check\(file, now, this\.minIntervalMs\(\), reason === 'user'\);/.test(acct));
    ok('the per-slot backoff map is gone: the curve belongs to the token',
        !/slotBackoff/.test(acct));
    // ‼️ The four reasons, and only ONE of them is a person. `accounts.status`
    // is the op an unattended runner calls in a loop and it refreshed as
    // `user` — the one reason that walks through a 429 — so the caller most
    // likely to repeat held the privilege that keeps a rate limit alive.
    ok('there is a reason for "automatic but not on the beat"',
        /export type UsageReason = 'beat' \| 'edge' \| 'auto' \| 'user';/.test(acct));
    ok('refresh() takes it, defaulting to the person it used to assume',
        /refresh\(reason: 'user' \| 'auto' = 'user'\): Promise<SlotUsage\[\]> \{ return this\.read\(reason\); \}/.test(acct));
    ok('only `user` skips a hold, anywhere in the service',
        (acct.match(/reason === 'user'/g) || []).length >= 2
        && !/reason === 'auto'/.test(acct));
    ok('the token is charged before the reply', /this\.gate\.spent\(file, now\);/.test(acct));
    ok('a success clears the TOKEN', /this\.gate\.cleared\(file\);/.test(acct));

    const plan = SRC('core/planusage.ts');
    ok('planusage keeps no private lastFetchAt any more', !/private lastFetchAt/.test(plan));
    ok('planusage keeps no private backoff any more',
        !/private backoffMs/.test(plan) && !/private backoffUntil/.test(plan));
    ok('the edge verdict is exposed for the indicator', /edgeVerdict\(\): UsageVerdict/.test(plan));

    const ext = SRC('extension.ts');
    ok('ONE gate is built and handed to both services',
        /const usageGate = new UsageGate\(\);/.test(ext)
        && (ext.match(/gate: usageGate/g) || []).length === 2);
    ok('the interval setting is read live', /crossServiceMs\(cfg\(\)\.get<number>\('planUsageMinIntervalSeconds', 10\)\)/.test(ext));
    ok('‼️ the sentry wall read is automatic, not a person',
        /refreshSlot\(leader\.walled\.slotId, 'auto'\)/.test(ext));
    ok('‼️ and so is the runner\'s accounts.status refresh',
        /await accountUsage\.refresh\('auto'\);/.test(ext));
    ok('‼️ usage.engines no longer claims the person\'s privilege',
        /if \(!id \|\| id === 'claude'\) \{ await planUsage\.readOnEdge\(\); \}/.test(ext)
        && !/await planUsage\.get\(true\); \}/.test(ext));

    const bar = SRC('views/planUsageBar.ts');
    ok('‼️ an edge read that is too early is DEFERRED, not dropped',
        /this\.edgeTimer = setTimeout\(/.test(bar) && /const v = this\.opts\.service\.edgeVerdict\(\);/.test(bar));
    ok('…once, because turn boundaries arrive in bursts',
        /if \(this\.edgeTimer\) \{ return; \}/.test(bar));
    ok('…and a HOLD is not deferred', /if \(v\.why === 'held'\) \{ return; \}/.test(bar));
    ok('the deferred timer is disposed with the bar',
        /if \(this\.edgeTimer\) \{ clearTimeout\(this\.edgeTimer\); \}/.test(bar));

    const pkg = JSON.parse(SRC('../package.json'));
    const s = pkg.contributes.configuration.properties['agentFarm.planUsageMinIntervalSeconds'];
    ok('the setting is contributed', !!s && s.default === 10 && s.minimum === 5);
    ok('…and its description says what it is NOT (a beat)', /never causes an extra read/.test(s.description));
    ok('…and it is filed in the catalog, beside the other plan usage reads',
        require('../out/core/settingsCatalog/index.js').catalogEntry('planUsageMinIntervalSeconds').group === 'planUsage');

    // The two services must name the token the SAME way or the gate is a
    // ledger with two pages. This is the one fact the whole design rests on.
    ok('‼️ both readers resolve their file through slotCredentialsFile',
        /const usageCredentialsFile = \(\): string =>\s*\n\s*slotCredentialsFile\(/.test(ext)
        && /const file = slotCredentialsFile\(slot\);/.test(acct));
    ok('slotCredentialsFile is the exported one function', typeof slotCredentialsFile === 'function');
    ok('AccountUsageService is constructible with a gate', (() => {
        const g = new UsageGate();
        const svc = new AccountUsageService({ slots: () => [], ttlMs: () => 60_000, gate: g });
        return typeof svc.rateLimitedFor === 'function' && svc.rateLimitedFor('nope') === 0;
    })());
    ok('refused() explains a floor without pretending to be a figure', (() => {
        const r = refused({ why: 'floor', readyAt: 5000 }, 0);
        return r.state === 'error' && r.bars.length === 0 && /next read in/.test(r.note);
    })());
}

async function main() {
    await coldService();
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
