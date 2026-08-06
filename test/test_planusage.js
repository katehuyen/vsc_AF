// Plan usage — the dashboard card that reports your Claude SUBSCRIPTION limits
// as Anthropic states them (what /usage prints), not as the farm estimates them.
// Two halves: the core module (credentials reading, payload projection, the
// cache and every unavailable path) and the webview card (bars, severity, reset
// wording, the ⟳ button, the self-refresh beat, its place beside Farm status).
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const PU = require(path.join(__dirname, '..', 'out', 'core', 'planusage.js'));

// A real response body, trimmed to the fields the card uses.
const LIVE_PAYLOAD = {
    five_hour: { utilization: 82.6, resets_at: '2026-07-26T14:40:00.403512+00:00' },
    seven_day: { utilization: 88, resets_at: '2026-07-27T13:00:00.403533+00:00' },
    seven_day_oauth_apps: null, seven_day_opus: null, seven_day_sonnet: null,
    cinder_cove: null, extra_usage: { is_enabled: false, utilization: 100 },
    limits: [{ kind: 'session', percent: 82 }]
};

// ---------- credentials ----------
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-planusage-'));
    const file = path.join(dir, '.credentials.json');

    ok('a missing credentials file is not an error, just "no credentials"',
        PU.readOauthCredentials(path.join(dir, 'nope.json')) === undefined);

    fs.writeFileSync(file, '{ not json');
    ok('a corrupt credentials file yields no credentials', PU.readOauthCredentials(file) === undefined);

    // API-key / gateway auth: the file exists but carries no OAuth session
    fs.writeFileSync(file, JSON.stringify({ somethingElse: { token: 'x' } }));
    ok('a file without claudeAiOauth yields no credentials', PU.readOauthCredentials(file) === undefined);

    fs.writeFileSync(file, JSON.stringify({
        claudeAiOauth: { accessToken: '  sk-ant-oat01-abc  ', expiresAt: 1785088065800, subscriptionType: 'pro' }
    }));
    const c = PU.readOauthCredentials(file);
    ok('token/expiry/plan read and trimmed',
        c.token === 'sk-ant-oat01-abc' && c.expiresAt === 1785088065800 && c.plan === 'pro');

    // PowerShell's utf8 output prepends a BOM — the same tolerance the bridge has
    fs.writeFileSync(file, '﻿' + JSON.stringify({ claudeAiOauth: { accessToken: 't' } }));
    const bom = PU.readOauthCredentials(file);
    ok('UTF-8 BOM tolerated; absent expiry/plan default to 0/""',
        bom && bom.token === 't' && bom.expiresAt === 0 && bom.plan === '');

    ok('the default path is ~/.claude/.credentials.json',
        PU.credentialsPath('/home/x') === path.join('/home/x', '.claude', '.credentials.json'));
}

// ---------- parseResetsAt: ISO strings and unix seconds ----------
{
    ok('ISO string with a +00:00 offset parsed',
        PU.parseResetsAt('2026-07-26T14:40:00.403512+00:00') === Date.parse('2026-07-26T14:40:00.403Z'));
    ok('unix SECONDS scaled to ms', PU.parseResetsAt(1785088065) === 1785088065000);
    ok('unix MILLISECONDS left alone', PU.parseResetsAt(1785088065800) === 1785088065800);
    ok('null/garbage/negative all mean "unknown" (0)',
        PU.parseResetsAt(null) === 0 && PU.parseResetsAt('soon') === 0 && PU.parseResetsAt(-5) === 0
        && PU.parseResetsAt(undefined) === 0);
}

// ---------- buildBars: the projection onto drawable rows ----------
{
    const bars = PU.buildBars(LIVE_PAYLOAD);
    ok('only the non-null limits become bars', bars.length === 2);
    ok('wording matches /usage exactly',
        bars[0].title === 'Current session' && bars[1].title === 'Current week (all models)');
    ok('session bar first, weekly second (the /usage order)',
        bars[0].id === 'five_hour' && bars[1].id === 'seven_day');
    ok('utilization is FLOORED like /usage floors it (82.6 → 82)', bars[0].percent === 82);
    ok('reset time carried as epoch ms', bars[0].resetsAt === Date.parse('2026-07-26T14:40:00.403Z'));
    ok('extra_usage/limits are NOT drawn as limit bars',
        !bars.some(b => b.id === 'extra_usage' || b.id === 'limits'));

    const max = PU.buildBars({
        five_hour: { utilization: 10, resets_at: null },
        seven_day: { utilization: 20, resets_at: null },
        seven_day_opus: { utilization: 30, resets_at: null },
        seven_day_sonnet: { utilization: 40, resets_at: null }
    });
    ok('a Max plan draws its per-model weekly bars too', max.length === 4
        && max[2].title === 'Current week (Opus only)' && max[3].title === 'Current week (Sonnet only)');
    ok('a null resets_at is tolerated (0 = unknown)', max[0].resetsAt === 0);

    ok('a limit without a numeric utilization is skipped',
        PU.buildBars({ five_hour: { utilization: null, resets_at: 'x' }, seven_day: { utilization: 5 } }).length === 1);
    ok('percent clamped into 0–100', PU.buildBars({ five_hour: { utilization: 140 } })[0].percent === 100
        && PU.buildBars({ seven_day: { utilization: -3 } })[0].percent === 0);
    ok('a junk payload yields no bars, not a throw',
        PU.buildBars(null).length === 0 && PU.buildBars('nope').length === 0 && PU.buildBars({}).length === 0);
}

// ---------- the service: cache, force, and every unavailable path ----------
(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-planusage-svc-'));
    const credFile = path.join(dir, '.credentials.json');
    const writeCred = (over) => fs.writeFileSync(credFile, JSON.stringify({
        claudeAiOauth: Object.assign(
            { accessToken: 'tok', expiresAt: 4102444800000, subscriptionType: 'pro' }, over)
    }));

    let calls = 0, reply = { status: 200, body: JSON.stringify(LIVE_PAYLOAD) }, sentToken = '', sentUA = '';
    let clock = 1_000_000;
    let cliVersion = '2.1.220';
    const svc = (ttl) => new PU.PlanUsageService({
        ttlMs: () => ttl,
        credentialsFile: () => credFile,
        now: () => clock,
        cliVersion: () => cliVersion,
        fetchImpl: (t, ua) => { calls++; sentToken = t; sentUA = ua; return Promise.resolve(reply); }
    });

    // --- happy path + cache ---
    writeCred();
    calls = 0; clock = 1_000_000;
    const s = svc(60_000);
    ok('nothing is cached before the first ask', s.current() === undefined);
    const first = await s.get();
    ok('a good response is state:ok with bars and the plan name',
        first.state === 'ok' && first.bars.length === 2 && first.plan === 'pro' && !first.note);
    ok('the stored token is what gets sent', sentToken === 'tok');
    ok('…and so is the CLI-shaped User-Agent that decides the rate-limit bucket',
        sentUA === 'claude-cli/2.1.220 (external, cli)');
    ok('the snapshot is now the cache', s.current() === first);

    clock += 30_000;
    await s.get();
    ok('inside the TTL the endpoint is not hit again', calls === 1);
    clock += 40_000;
    await s.get();
    ok('past the TTL it refetches', calls === 2);

    // force bypasses the TTL, but never the hard floor
    clock += 1_000;
    await s.get(true);
    ok('a mashed ⟳ inside the floor is served from cache', calls === 2);
    clock += PU.MIN_FETCH_INTERVAL_MS + 1;
    await s.get(true);
    ok('force past the floor refetches even though the TTL is fresh', calls === 3);

    // one in-flight request is shared, not duplicated
    calls = 0; clock += 1_000_000;
    let release;
    const gate = new Promise(r => { release = r; });
    const shared = new PU.PlanUsageService({
        ttlMs: () => 0, credentialsFile: () => credFile, now: () => clock,
        fetchImpl: () => { calls++; return gate; }
    });
    const a = shared.get(), b = shared.get();
    release({ status: 200, body: JSON.stringify(LIVE_PAYLOAD) });
    const [ra, rb] = await Promise.all([a, b]);
    ok('concurrent asks share one request', calls === 1 && ra === rb && ra.state === 'ok');

    // --- unavailable paths: each says what it knows, none of them throws ---
    const one = async (over, mutate) => {
        if (mutate) { mutate(); } else { writeCred(over); }
        clock += 10_000_000;
        return svc(0).get();
    };

    fs.rmSync(credFile);
    let r = await one(null, () => { });
    ok('no credentials file → no-auth, with a note that explains where it looks',
        r.state === 'no-auth' && r.bars.length === 0 && /Claude Code/.test(r.note));

    r = await one({ expiresAt: 5 });
    ok('a locally expired token → expired, telling you to start a session',
        r.state === 'expired' && /refresh it/.test(r.note));

    writeCred();
    reply = { status: 401, body: '' };
    r = await one();
    ok('a 401 → expired (never a silent token rewrite)', r.state === 'expired' && /refresh it/.test(r.note));

    reply = { status: 429, body: '' };
    r = await one();
    ok('a 429 → error that says "rate limited", not a wrong number', r.state === 'error' && /rate limited/.test(r.note));

    reply = { status: 500, body: '' };
    r = await one();
    ok('any other status → error naming the status', r.state === 'error' && /HTTP 500/.test(r.note));

    reply = { status: 200, body: '{oops' };
    r = await one();
    ok('an unparseable body → error, not a crash', r.state === 'error');

    reply = { status: 200, body: JSON.stringify({ five_hour: null, seven_day: null }) };
    r = await one();
    ok('200 with no limits at all → honest "no limits reported"',
        r.state === 'error' && /no limits/.test(r.note));

    const offline = new PU.PlanUsageService({
        ttlMs: () => 0, credentialsFile: () => credFile, now: () => clock,
        fetchImpl: () => Promise.reject(new Error('getaddrinfo ENOTFOUND'))
    });
    r = await offline.get();
    ok('an offline machine → error carrying the transport reason',
        r.state === 'error' && /ENOTFOUND/.test(r.note) && r.plan === 'pro');

    // ---------- the User-Agent: which bucket the endpoint puts us in ----------
    // ‼️ THE HEADER, NOT THE INTERVAL, IS WHAT EARNED THE PERSISTENT 429s. A
    // request with none (Node's default) lands in a punitive bucket whatever the
    // interval, so this string is load-bearing, not decoration.
    {
        ok('the agent is shaped exactly like the CLI\'s own',
            PU.usageUserAgent('2.1.220') === 'claude-cli/2.1.220 (external, cli)');
        ok('…a version buried in a longer string is still found',
            PU.usageUserAgent('claude-code 2.0.9 (win32)') === 'claude-cli/2.0.9 (external, cli)');
        ok('…and a machine with no transcript yet still sends a version, never a blank',
            PU.usageUserAgent() === `claude-cli/${PU.CLI_UA_FALLBACK_VERSION} (external, cli)`
            && PU.usageUserAgent('') === PU.usageUserAgent()
            && /^claude-cli\/\d+\.\d+\.\d+ \(external, cli\)$/.test(PU.usageUserAgent('nonsense')));
    }

    // ---------- a 429 is answered by backing off, not by asking again ----------
    // The endpoint sends no Retry-After, so doubling is the only safe reading —
    // and the state has to be VISIBLE, or the card just looks frozen.
    {
        calls = 0; clock += 10_000_000;
        reply = { status: 429, body: '' };
        const bo = svc(1_000);
        const hit = await bo.get();
        ok('a 429 says it is backing off and when it will try again',
            hit.state === 'error' && /rate limited/.test(hit.note) && /3 min/.test(hit.note));
        ok('…and the backoff is readable from outside, not just felt',
            bo.rateLimitedUntil() === clock + PU.RATE_LIMIT_BACKOFF_START_MS);

        clock += 60_000;                       // TTL long past, backoff not
        await bo.get();
        ok('the beat is refused while the backoff runs', calls === 1);

        clock += PU.RATE_LIMIT_BACKOFF_START_MS;
        await bo.get();
        ok('once it expires the beat is let through again', calls === 2);
        ok('…and a second 429 doubles the wait',
            bo.rateLimitedUntil() === clock + 2 * PU.RATE_LIMIT_BACKOFF_START_MS);

        // ‼️ the button is not the beat: a person clicking ⟳ has decided to
        // spend the request, and a control that refuses for 15 minutes is a
        // control that has taught you it is broken
        clock += PU.MIN_FETCH_INTERVAL_MS + 1;
        await bo.get(true);
        ok('⟳ asks anyway, mid-backoff', calls === 3);

        reply = { status: 200, body: JSON.stringify(LIVE_PAYLOAD) };
        clock += 10_000_000;
        const good = await bo.get(true);
        ok('one success clears the backoff completely',
            good.state === 'ok' && bo.rateLimitedUntil() === 0);

        // and the doubling has a ceiling
        reply = { status: 429, body: '' };
        let last = 0;
        for (let i = 0; i < 12; i++) {
            clock += 10_000_000;
            await bo.get();
            last = bo.rateLimitedUntil() - clock;
        }
        ok('the doubling stops at the cap instead of running to hours',
            last === PU.RATE_LIMIT_BACKOFF_MAX_MS);
        reply = { status: 200, body: JSON.stringify(LIVE_PAYLOAD) };
    }

    // ---------- the turn-boundary edge, which is where the 429s really came from ----------
    // ‼️ THE EDGE USED TO CLAIM THE BUTTON'S PRIVILEGES. It called `get(true)`, so
    // it skipped the TTL *and* the backoff with only the 5-second hard floor
    // underneath — and a working fleet crosses this edge a couple of hundred
    // times an hour, in bursts. So the endpoint saw a request every few seconds
    // however politely the BEAT was configured, and the backoff meant to rescue
    // us was being walked through on the very events that caused it.
    {
        calls = 0; clock += 10_000_000;
        reply = { status: 200, body: JSON.stringify(LIVE_PAYLOAD) };
        const e = svc(60_000);
        await e.get();
        ok('the first read happens', calls === 1);

        // the edge's whole point: skip a fresh TTL
        clock += PU.EDGE_READ_FLOOR_MS + 1;
        await e.readOnEdge();
        ok('an edge read skips a TTL that is still fresh', calls === 2);

        // …but it has a floor of its own, well above the button's
        clock += 1_000;
        await e.readOnEdge();
        ok('a burst of edges collapses to one read', calls === 2);
        ok('…because the edge floor is far above the hard floor',
            PU.EDGE_READ_FLOOR_MS > PU.MIN_FETCH_INTERVAL_MS);

        // ‼️ …and the floor is the USER'S interval, not a constant of ours: the
        // edge must change WHEN a read happens, never HOW MANY. Set 60 s and no
        // two automatic reads may be closer than 60 s, whoever asked.
        {
            let c2 = 0, k = 5_000_000;
            const own = new PU.PlanUsageService({
                ttlMs: () => 60_000, edgeFloorMs: () => 60_000,
                credentialsFile: () => credFile, now: () => k,
                cliVersion: () => '2.1.220',
                fetchImpl: () => { c2++; return Promise.resolve({ status: 200, body: JSON.stringify(LIVE_PAYLOAD) }); }
            });
            await own.get();
            k += 45_000;                       // a turn ends 45s in — inside the interval
            await own.readOnEdge();
            ok('an edge inside the configured interval does NOT buy a second read', c2 === 1);
            k += 16_000;                       // now past 60s
            await own.readOnEdge();
            ok('…and is let through the moment the interval is up', c2 === 2);
        }

        // ‼️ and it NEVER walks through a backoff — the regression that made the
        // backoff decorative
        reply = { status: 429, body: '' };
        clock += PU.EDGE_READ_FLOOR_MS + 1;
        await e.readOnEdge();
        ok('an edge read can be the one that gets rate limited', calls === 3
            && e.rateLimitedUntil() === clock + PU.RATE_LIMIT_BACKOFF_START_MS);
        reply = { status: 200, body: JSON.stringify(LIVE_PAYLOAD) };
        // 200 turn boundaries in the next 100 seconds — a real burst, all of it
        // inside the 3-minute backoff
        for (let i = 0; i < 200; i++) {
            clock += 500;
            await e.readOnEdge();
        }
        ok('…and two hundred turn boundaries during a backoff cost ZERO requests', calls === 3);
        clock += PU.RATE_LIMIT_BACKOFF_START_MS;
        await e.readOnEdge();
        ok('…then the edge is let through again once it expires', calls === 4);
    }

    // ---------- only the FALLING edge is news ----------
    {
        const barSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'planUsageBar.ts'), 'utf8');
        // a turn STARTING has spent nothing yet, so the answer is necessarily the
        // one the last read already gave — it was a request to learn nothing
        ok('a turn ending earns a read; a turn starting does not',
            /if \(!active\) \{ void this\.tick\('edge'\); \}/.test(barSrc));
        ok('…but both directions are still RECORDED, or the next fall is a no-op',
            /this\.lastActive = active;/.test(barSrc));
        ok('…and nothing automatic calls get(true) any more',
            !/tick\(true\)/.test(barSrc) && !/service\.get\(force\)/.test(barSrc));

        // an agent forcing is not a person clicking
        const extTs = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        ok('an agent\'s usage.plan force cannot spend a request through a backoff',
            /\? await planUsage\.readOnEdge\(\)/.test(extTs)
            && /force skips the cache but NOT a backoff/.test(extTs));
        // the edge floor is wired to the SAME setting the beat reads, live
        ok('the edge floor is the user\'s own active interval, read live',
            /const planEdgeFloorMs = \(\) => refreshMs\(/.test(extTs)
            && /edgeFloorMs: planEdgeFloorMs/.test(extTs));
    }

    // ---------- the indicator says which of the two it is doing ----------
    {
        const barSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'planUsageBar.ts'), 'utf8');
        ok('a backoff outranks the beat in the tooltip — "why is it not moving?" has an answer',
            /rateLimitedUntil\(\)/.test(barSrc) && /Rate limited — backing off/.test(barSrc));

        // ---------- …and a click on it lands where its number is drawn ----------
        // ‼️ The Dashboard is retained when hidden, so REVEALING it is not the
        // same as OPENING it: it comes back where the reader last left it, which
        // is usually deep in the sessions table — three screens below the card
        // the indicator was clicked for.
        const sbSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'statusBar.ts'), 'utf8');
        ok('there is ONE contract for "a click on the plan-usage indicator opens the Dashboard at the top"',
            /export const OPEN_DASHBOARD_AT_TOP: vscode\.Command = \{/.test(sbSrc)
            && /arguments: \[\{ scrollTo: 'top' \}\]/.test(sbSrc));
        ok('…and the plan-usage indicator obeys it',
            /this\.item\.command = OPEN_DASHBOARD_AT_TOP;/.test(barSrc));
        ok('…while the "N active • cost" indicator opens Live Timeline instead — a deliberate divergence',
            /export const OPEN_LIVE_TIMELINE: vscode\.Command = \{/.test(sbSrc)
            && (sbSrc.match(/this\.item\.command = OPEN_LIVE_TIMELINE;/g) || []).length === 2);
        ok('…while the warning state still goes to Needs You instead',
            /this\.item\.command = 'agentfarm\.openNeeds';/.test(sbSrc));

        const dashSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'dashboard.ts'), 'utf8');
        const extSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        // The command carries two independent arrival instructions now (the
        // other one scopes the sessions table to a project), so it builds an
        // options object instead of a ternary — and the palette, which passes
        // neither, must still open a plain dashboard.
        ok('the command forwards it, and the palette (which passes nothing) still works',
            /registerCommand\('agentfarm\.openDashboard',\s*\n?\s*\(arg\?: \{ scrollTo\?: 'top'; projectFilter\?: string \}\)/.test(extSrc)
            && /if \(arg\?\.scrollTo === 'top'\) \{ opts\.scrollTo = 'top'; \}/.test(extSrc)
            && /Object\.keys\(opts\)\.length \? opts : undefined/.test(extSrc));
        ok('…the panel only tells an ALREADY-OPEN page (a fresh one is at the top anyway)',
            /if \(opts\?\.scrollTo === 'top'\) \{[\s\S]{0,140}postMessage\(\{ type: 'scrollTo', target: 'top' \}\)/
                .test(dashSrc));
        const dashJs = fs.readFileSync(path.join(__dirname, '..', 'media', 'dashboard.js'), 'utf8');
        ok('…and the page acts on it before anything else can swallow the message',
            /addEventListener\('message', ev => \{\s*\n\s*if \(ev\.data\.type === 'scrollTo'\)/.test(dashJs)
            && /function scrollToTop\(\)/.test(dashJs));
        ok('…instantly, because this is the page opening and not the reader scrolling',
            !/scrollTo\(\{[\s\S]{0,60}smooth/.test(dashJs));
    }

    // ---------- the webview card ----------
    {
        // The shared scripts htmlShell ships to every page, from ONE list.
        const headerCode = require(path.join(__dirname, 'lib_shared_media.js')).sharedMedia();
        const sessCode = fs.readFileSync(path.resolve(__dirname, '../media/sessionsTable.js'), 'utf8');
        const code = fs.readFileSync(path.resolve(__dirname, '../media/dashboard.js'), 'utf8');

        // ‼️ A LIST: the page listens twice — its own host messages, and the
        // right-click relay wired at module scope. Last-one-wins drops one.
        let posted = [], lastHtml = '', intervals = [];
        const msgHandlers = [];
        const msgHandler = (ev) => msgHandlers.forEach(fn => fn(ev));
        const els = {};
        const getEl = (id) => (els[id] || (els[id] = {
            id, listeners: {}, style: {}, value: '', _html: '',
            addEventListener(ev, fn) { this.listeners[ev] = fn; },
            set innerHTML(v) { if (id === 'app') { lastHtml = v; } this._html = v; },
            get innerHTML() { return this._html; },
            // permissive element stub: this suite is about the usage card, so the
            // sessions component only needs something to wire itself against
            querySelector: () => ({ addEventListener() { }, dataset: {}, style: {}, value: '', checked: false }),
            querySelectorAll: () => []
        }));
        // the relative part of the reset line is computed against the real clock,
        // so the fixtures are anchored to it rather than to a frozen date
        const now = Date.now();
        const nextDay = now + 30 * 3600e3;
        const snapshot = {
            state: 'ok', plan: 'pro', fetchedAt: now,
            bars: [
                { id: 'five_hour', title: 'Current session', percent: 82, resetsAt: now + 2 * 3600e3 + 20 * 60e3 },
                { id: 'seven_day', title: 'Current week (all models)', percent: 92, resetsAt: nextDay },
                { id: 'seven_day_sonnet', title: 'Current week (Sonnet only)', percent: 12, resetsAt: 0 }
            ]
        };
        const DATA = {
            generatedAt: now, today: '2026-07-26', agents: [],
            modelTotals: {}, tokenTypes: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
            heat: new Array(168).fill(0), sessionRows: [], sessionTableN: 20,
            window: { tokens: 0, msgs: 0, cost: 0, limit: 0 },
            fleetBudget: 0, mediaCost: { today: 0, month: 0 },
            insightTotals: { error: 0, warning: 0, info: 0 },
            unknownModels: [], externalSessions: {},
            farmStatus: [{ id: 'live', label: 'Live monitoring', state: 'active', detail: '4200 events' }],
            planUsage: undefined, planUsageBeat: { ms: 5 * 60000, active: false }
        };
        const sandbox = {
            acquireVsCodeApi: () => ({ postMessage: (m) => posted.push(m), getState: () => null, setState: () => { } }),
            window: {
                AFCharts: {
                    esc: (s) => String(s === undefined || s === null ? '' : s),
                    fmtTok: (n) => String(n || 0),
            fmtTokW(n, w) { return this.fmtTok(n || 0) + (w > 0 ? ' [w' + this.fmtTok(Math.round(w)) + ']' : ''); },
            fmtTokWText(n, w) { return this.fmtTok(n || 0) + (w > 0 ? ' (w' + this.fmtTok(Math.round(w)) + ')' : ''); },
            WEIGHTED_TIP: 'weighted', fmtUSD: (n) => '$' + (n || 0),
                    stackedBars: () => '', donut: () => '', hbars: () => '', heatmap: () => '', sparkline: () => ''
                },
                __DATA__: DATA,
                addEventListener: (ev, fn) => { if (ev === 'message') { msgHandlers.push(fn); } }
            },
            document: { getElementById: getEl, querySelectorAll: () => [] },
            setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; },
            clearInterval: (h) => { intervals[h - 1] = null; },
            console
        };
        sandbox.globalThis = sandbox;
        vm.createContext(sandbox);
        vm.runInContext(headerCode, sandbox);
        vm.runInContext(sessCode, sandbox);
        vm.runInContext(code, sandbox);

        // just the usage card, so an assertion can never be satisfied by some
        // other part of the dashboard that happens to contain the same text
        const card = () => lastHtml.slice(lastHtml.indexOf('class="card pucard"'), lastHtml.indexOf('<h2>Agents</h2>'));

        ok('the card sits in the same row as Farm status, to its RIGHT',
            /Farm status[\s\S]*?<div class="card pucard"/.test(lastHtml)
            && lastHtml.indexOf('Farm status') < lastHtml.indexOf('class="card pucard"'));
        ok('before any answer it says it is reading, not "0%"',
            card().includes('Reading your subscription limits') && !card().includes('%'));
        ok('the page asks the host for the figures on load',
            posted.some(p => p.type === 'planUsage' && p.force === false));
        ok('the self-refresh beat is armed from the host\'s beat (5 min idle)',
            intervals.length === 1 && intervals[0].ms === 5 * 60000);

        posted = [];
        intervals[0].fn();
        ok('the beat asks WITHOUT force (a cached answer is fine on a tick)',
            posted.length === 1 && posted[0].type === 'planUsage' && posted[0].force === false);

        msgHandler({ data: { type: 'planUsage', usage: snapshot } });
        ok('every bar drawn with its title and floored percent',
            lastHtml.includes('Current session') && lastHtml.includes('>82%<')
            && lastHtml.includes('Current week (all models)') && lastHtml.includes('>92%<')
            && lastHtml.includes('Current week (Sonnet only)'));
        ok('bar widths follow the percentages', lastHtml.includes('style="width:82%"') && lastHtml.includes('style="width:92%"'));
        ok('severity colouring: 92% is hot, 82% warns, 12% is plain',
            /class="hot" style="width:92%"/.test(lastHtml)
            && /class="warn" style="width:82%"/.test(lastHtml)
            && /class="" style="width:12%"/.test(lastHtml));
        ok('reset line answers "when" and "how long" together', /Resets .* · in 2h 20m/.test(card()));
        ok('a reset on another day carries the date',
            card().includes('Resets ' + new Date(nextDay).toLocaleDateString([], { month: 'short', day: 'numeric' }) + ','));
        ok('an unknown reset prints nothing rather than a wrong time',
            !lastHtml.includes('Resets Invalid') && !/Resets\s*·/.test(lastHtml));
        ok('the footer states plan, freshness and the beat',
            /pro plan · updated .* · auto every 5 min/.test(lastHtml));

        posted = [];
        getEl('pu-refresh').listeners.click();
        ok('⟳ asks with force — "now", not "if stale"',
            posted.length === 1 && posted[0].type === 'planUsage' && posted[0].force === true);
        ok('⟳ shows it is working while the answer is out', lastHtml.includes('>…</button>'));
        getEl('pu-refresh').listeners.click();
        ok('a second click while busy is ignored', posted.length === 1);
        msgHandler({ data: { type: 'planUsage', usage: snapshot } });
        ok('the button comes back when the answer lands', lastHtml.includes('>⟳</button>'));

        // an unavailable snapshot prints its note verbatim — no fake bars
        msgHandler({ data: { type: 'planUsage', usage: { state: 'expired', plan: 'pro', fetchedAt: now, bars: [], note: 'Your Claude Code login token has expired — start a Claude Code session to refresh it.' } } });
        ok('an unavailable state prints the honest note and draws no bars',
            lastHtml.includes('login token has expired') && !lastHtml.includes('class="progress"><div class="hot"'));

        // a dashboard data refresh must not blank the card or re-arm the beat
        msgHandler({ data: { type: 'data', data: Object.assign({}, DATA, { planUsage: snapshot }) } });
        ok('a routine dashboard refresh keeps the figures on screen', lastHtml.includes('>82%<'));
        ok('the beat is not re-armed when it did not change', intervals.length === 1);

        // ‼️ the fast window: the host pushes what the indicator just read, and
        // the card MOVES TO THAT BEAT — a card sitting on a 5-minute timer
        // through the turn it is meant to report is the bug being fixed here
        posted = [];
        msgHandler({ data: { type: 'planUsage', usage: snapshot, beat: { ms: 15000, active: true }, push: true } });
        ok('an agent starting work re-arms the card to the fast beat',
            intervals.length === 2 && intervals[1].ms === 15000 && intervals[0] === null);
        ok('…and the card says which window it is in',
            /updated .* · live · every 15 s while an agent works/.test(lastHtml));
        ok('a host push costs the card no request of its own', posted.length === 0);

        // …and back, when every agent is waiting for a prompt again
        msgHandler({ data: { type: 'planUsage', usage: snapshot, beat: { ms: 300000, active: false }, push: true } });
        ok('the turn ending puts the card back on the idle beat',
            intervals.length === 3 && intervals[2].ms === 300000 && intervals[1] === null
            && /auto every 5 min/.test(lastHtml));

        // an unsolicited push must not steal the ⟳'s spinner
        getEl('pu-refresh').listeners.click();
        msgHandler({ data: { type: 'planUsage', usage: snapshot, beat: { ms: 300000, active: false }, push: true } });
        ok('a push while ⟳ is out leaves it spinning for its own answer',
            lastHtml.includes('>…</button>'));
        msgHandler({ data: { type: 'planUsage', usage: snapshot, beat: { ms: 300000, active: false } } });
        ok('…and the answer to the click is what clears it', lastHtml.includes('>⟳</button>'));

        // beat = 0 → manual only
        msgHandler({ data: { type: 'data', data: Object.assign({}, DATA, { planUsage: snapshot, planUsageBeat: { ms: 0, active: false } }) } });
        ok('a 0 beat disarms the timer and says so', intervals[2] === null
            && lastHtml.includes('manual refresh only'));
    }

    // ---------- the status-bar indicator: the same figures, without opening anything ----------
    // ‼️ The question these two numbers answer ("can I afford the next long
    // turn?") is asked BEFORE you spend, and the only place that answered it was
    // a card behind a page you had to open — so in practice you read it after.
    {
        // the projection lives in core/, with no `vscode` import, precisely so
        // it can be checked here — the view is only the plumbing around it
        const BAR = PU;
        const now = Date.now();
        const snap = (state, bars, extra) => Object.assign(
            { state, bars, plan: 'max', fetchedAt: now }, extra || {});
        const okSnap = snap('ok', [
            { id: 'five_hour', title: 'Current session', percent: 42, resetsAt: now + 2 * 3600_000 },
            { id: 'seven_day', title: 'Current week (all models)', percent: 67, resetsAt: now + 3 * 86400_000 }
        ]);

        // ‼️ The first field is the TIME LEFT in the session window, not a
        // label: a fixed "5h" is a constant (no information) that reads as a
        // duration — so the one number the bar seemed to give about time was
        // the one thing it could not tell you.
        ok('the session window shows how long is left, then how much is gone',
            BAR.barText(okSnap, now) === '$(dashboard) 2h - 42% / wk 67%');
        ok('…to the minute, like the tooltip countdown',
            BAR.barText(snap('ok', [
                { id: 'five_hour', title: 's', percent: 86, resetsAt: now + (3 * 60 + 49) * 60_000 },
                { id: 'seven_day', title: 'w', percent: 41, resetsAt: now + 4 * 86400_000 }
            ]), now) === '$(dashboard) 3h 49m - 86% / wk 41%');
        // a plan that reports no plain weekly bar still gets a week figure
        ok('a per-model weekly limit stands in for the missing all-models one',
            BAR.barText(snap('ok', [
                { id: 'five_hour', title: 's', percent: 10, resetsAt: now + 60 * 60_000 },
                { id: 'seven_day_opus', title: 'w', percent: 55, resetsAt: 0 }
            ]), now) === '$(dashboard) 1h - 10% / wk 55%');
        ok('one bar alone is shown alone, not padded with a made-up second',
            BAR.barText(snap('ok', [{ id: 'five_hour', title: 's', percent: 10, resetsAt: now + 600_000 }]), now)
            === '$(dashboard) 10m - 10%');
        // ‼️ an unknown reset never becomes an invented span
        ok('a session window with no reset time says "session", not a made-up countdown',
            BAR.barText(snap('ok', [
                { id: 'five_hour', title: 's', percent: 10, resetsAt: 0 },
                { id: 'seven_day', title: 'w', percent: 55, resetsAt: 0 }
            ]), now) === '$(dashboard) session 10% / wk 55%');
        ok('a week-only plan is still readable', BAR.barText(snap('ok', [
            { id: 'seven_day', title: 'w', percent: 55, resetsAt: 0 }]), now) === '$(dashboard) wk 55%');

        // ‼️ A machine with no subscription login has no figure and never will —
        // an indicator that says "unknown" forever is noise, not information.
        ok('no subscription login = no indicator at all',
            BAR.barText(snap('no-auth', [])) === undefined);
        ok('nothing fetched yet = no indicator yet', BAR.barText(undefined) === undefined);
        // …but a login that WILL come back says so instead of disappearing
        ok('an expired login is visible as a question, not a silence',
            BAR.barText(snap('expired', [])) === '$(dashboard) usage ?');
        ok('a transient endpoint failure the same way',
            BAR.barText(snap('error', [])) === '$(dashboard) usage ?');
        ok('…and so does an "ok" that somehow carries no bars',
            BAR.barText(snap('ok', [])) === '$(dashboard) usage ?');

        // colour is driven by the WORST limit, including ones not on the bar
        ok('the peak is what decides the colour', BAR.peakPercent(okSnap) === 67);
        ok('…even when the peak is a limit the bar does not print',
            BAR.peakPercent(snap('ok', [
                { id: 'five_hour', title: 's', percent: 3, resetsAt: 0 },
                { id: 'seven_day_opus', title: 'o', percent: 99, resetsAt: 0 }
            ])) === 99);
        ok('an unreadable snapshot is never coloured as if it were full',
            BAR.peakPercent(snap('error', [])) === 0 && BAR.peakPercent(undefined) === 0);

        // the reset countdown in the tooltip
        ok('a reset within the hour reads in minutes', BAR.untilText(now + 6 * 60_000, now) === 'in 6m');
        ok('…hours and minutes above that', BAR.untilText(now + 134 * 60_000, now) === 'in 2h 14m');
        ok('…a whole number of hours drops the minutes', BAR.untilText(now + 3 * 3600_000, now) === 'in 3h');
        ok('…and days beyond a day', BAR.untilText(now + 50 * 3600_000, now) === 'in 2d 2h');
        ok('an unknown or past reset says nothing rather than "in 0m"',
            BAR.untilText(0, now) === '' && BAR.untilText(now - 1000, now) === '');
        ok('the bar and the tooltip word ONE span — "in" is all that differs',
            BAR.remainingText(now + 134 * 60_000, now) === '2h 14m'
            && BAR.untilText(now + 134 * 60_000, now) === 'in ' + BAR.remainingText(now + 134 * 60_000, now)
            && BAR.remainingText(0, now) === '');
    }

    // ---------- the beat: two windows, one decision ----------
    // ‼️ The figures move only while a turn is actually RUNNING. A session that
    // is open but waiting for the next prompt spends nothing, so it is idle —
    // "sessions are open" is NOT the same question as "an agent is working".
    {
        const B = (active, mins, secs) => PU.refreshMs(active, mins, secs);
        ok('idle: the user\'s minutes', B(false, 5, 15) === 300_000);
        ok('active: seconds, because that is when the numbers are moving',
            B(true, 5, 60) === 60_000);
        // ‼️ the endpoint punishes a fast poller with a PERSISTENT 429, so this
        // floor is not a nicety — a few-second setting is a broken indicator
        ok('a fast beat can never outrun the automatic-beat floor',
            B(true, 5, 1) === PU.MIN_ACTIVE_BEAT_MS
            && B(true, 5, 15) === PU.MIN_ACTIVE_BEAT_MS
            && PU.MIN_ACTIVE_BEAT_MS > PU.MIN_FETCH_INTERVAL_MS);
        // ‼️ "off" must mean off in BOTH windows, or the setting is a lie
        ok('automatic refresh off stays off even while an agent works',
            B(false, 0, 15) === 0 && B(true, 0, 15) === 0);
        ok('a nonsense minutes value is treated as off, not as a busy loop',
            B(true, -3, 15) === 0 && B(false, NaN, 15) === 0);
        ok('fractional minutes are honoured (30s idle beat)', B(false, 0.5, 15) === 30_000);
    }

    // ---------- one request budget, not two ----------
    {
        const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        ok('the indicator shares the dashboard card\'s service, not a second one',
            /new PlanUsageBar\(\{\s*\n\s*service: planUsage,/.test(ext)
            && (ext.match(/new PlanUsageService\(/g) || []).length === 1);
        ok('the card\'s refresh repaints the indicator, so the two never disagree',
            /refreshPlanUsage: async \(force: boolean\) => \{[\s\S]{0,160}planUsageBar\.paint\(\);/.test(ext));
        ok('"Check now" is the same forced read, not a second implementation',
            /registerCommand\('agentfarm\.planUsageRefresh'/.test(ext)
            && /planUsage\.get\(true\)/.test(ext));
        ok('…and it says why when there is nothing to show', /snap\.state !== 'ok'/.test(ext));
        ok('turning it off in settings takes effect without a reload',
            /affectsConfiguration\('agentFarm\.planUsage'\)\) \{ planUsageBar\.refresh\(\)/.test(ext));

        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
        const props = pkg.contributes.configuration.properties;
        ok('a permanently visible indicator can be switched off',
            props['agentFarm.planUsageStatusBar'].type === 'boolean'
            && props['agentFarm.planUsageStatusBar'].default === true);
        ok('…and its two thresholds are yours',
            props['agentFarm.planUsageWarnPercent'].default === 80
            && props['agentFarm.planUsageDangerPercent'].default === 95);
        ok('the refresh command is in the palette',
            pkg.contributes.commands.some(c => c.command === 'agentfarm.planUsageRefresh'));
        // the shared beat is one beat — the setting says so out loud now
        ok('the refresh setting states that one beat serves every surface',
            /status-bar indicator, the Dashboard/.test(props['agentFarm.planUsageRefreshMinutes'].description));

        // ---------- two windows, one decision, every surface ----------
        ok('the fast window has its own setting, floored where the endpoint allows',
            props['agentFarm.planUsageActiveRefreshSeconds'].type === 'number'
            && props['agentFarm.planUsageActiveRefreshSeconds'].default === 60
            && props['agentFarm.planUsageActiveRefreshSeconds'].minimum === 30);
        ok('…and it warns that the limit, not taste, is what sets the floor',
            /persistent HTTP 429/.test(props['agentFarm.planUsageActiveRefreshSeconds'].description)
            && /backoff/.test(props['agentFarm.planUsageActiveRefreshSeconds'].description));
        ok('…and it belongs to the cost category like its siblings',
            /planUsageActiveRefreshSeconds: 'cost'/.test(
                fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'settingsops.ts'), 'utf8')));
        // ‼️ ONE function decides the beat; a second opinion is how two
        // surfaces end up showing figures read minutes apart
        ok('the TTL, the indicator and the card all read the one beat function',
            /const planBeatMs = \(\) => refreshMs\(/.test(ext)
            && /ttlMs: planBeatMs, edgeFloorMs: planEdgeFloorMs, cliVersion: installedCliVersion/.test(ext)
            && /beatMs: planBeatMs,/.test(ext)
            && /planUsageBeat: planBeat,/.test(ext));
        // ‼️ the User-Agent is read off a transcript, not off a spawned process:
        // every Claude Code line carries the version that wrote it
        ok('the CLI version comes from the newest transcript, with no process spawned',
            /const installedCliVersion = \(\)/.test(ext)
            && /s\.lastTs \|\| s\.mtime/.test(ext)
            && !/--version/.test(ext.slice(ext.indexOf('installedCliVersion'), ext.indexOf('installedCliVersion') + 500)));
        ok('the fast window is "a turn is RUNNING", not "a session is open"',
            /const fleetActive = \(\) => live\.activeTurns\(\) > 0;/.test(ext));
        ok('a live event can flip the window without waiting for the next tick',
            /live\.onDidUpdate\(\(\) => planUsageBar\.fleetChanged\(\)\)/.test(ext));
        ok('what the indicator reads is pushed to an open card in the same step',
            /onRefresh: snap => DashboardPanel\.pushPlanUsage\(snap, planBeat\(\)\)/.test(ext));
        ok('an agent asking usage.plan is told how live the answer is',
            /beat: planBeat\(\),/.test(ext));
        // ‼️ "nothing changed" and "we are not allowed to look" read identically
        // from a cached snapshot, so the op has to distinguish them
        ok('…and whether the staleness is a backoff rather than just age',
            /rateLimitedUntil: until > Date\.now\(\)/.test(ext)
            && /rateLimitedUntil` \(ISO, or null\)/.test(ext));

        // the fleet-activity source itself
        const liveSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'live.ts'), 'utf8');
        ok('mid-turn means working or running a tool — nothing else counts',
            /activeTurns\(\): number \{[\s\S]{0,220}s\.status === 'working' \|\| s\.status === 'tool'/.test(liveSrc));

        // the indicator's own scheduler: the beat drives the wake-up, but the
        // countdown it prints still has to move between reads
        const barSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'planUsageBar.ts'), 'utf8');
        ok('the wake-up follows the beat, capped so the countdown keeps moving',
            /Math\.min\(beat, PAINT_INTERVAL_MS\)/.test(barSrc)
            && /const PAINT_INTERVAL_MS = 60_000;/.test(barSrc));
        // ‼️ this used to assert `tick(true)` on the edge, which is exactly the
        // regression that kept the 429s coming: an automatic read with the
        // button's privileges. The edge now reads on the edge PATH, and only
        // when a turn has actually ended (see the falling-edge block above).
        ok('only the edge reads at all — not every live event',
            /if \(active === this\.lastActive\) \{ return; \}[\s\S]{0,600}this\.tick\('edge'\)/.test(barSrc));
        ok('the tooltip states which beat is running, so a still figure is explainable',
            /an agent is working — re-read every/.test(barSrc) && /Automatic refresh is off/.test(barSrc));
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
