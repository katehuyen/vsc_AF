// C1 + C3 — reaching the farm from outside this VS Code window.
//
// C1: the read-only web surface. This does NOT stub the server — it starts the
// real compiled one over a real snapshot file and speaks HTTP to it, because
// the only interesting questions here are "does the token actually stop
// anyone" and "does the page really carry no external requests".
// C3: the inbound chat channel — the rules half (allowlist, budget, command
// parsing), which is where a mistake costs money.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const out = path.join(__dirname, '..', 'out');
const { buildSnapshot, snapshotAge, SNAPSHOT_VERSION } = require(path.join(out, 'core', 'websnapshot.js'));
const { routeOf, authorize, generateToken, startWebServer } = require(path.join(out, 'core', 'webserver.js'));
const { renderPage } = require(path.join(out, 'core', 'webpage.js'));
const {
    parseUpdates, parseCommand, isAllowed, addSpend, withinBudget, clipForChat, HELP_TEXT
} = require(path.join(out, 'core', 'messaging.js'));

// ---------- the snapshot ----------
{
    const agents = [
        { name: 'dev', project: 'Acme', status: 'tool', active: true, lastActivity: 5, costToday: 2, cost30: 9, quietDays: 0 },
        { name: 'old', project: 'Unassigned', status: 'idle', active: false, lastActivity: 1, costToday: 0, cost30: 0, quietDays: 40 },
        { name: 'never', project: 'Unassigned', status: 'idle', active: false, lastActivity: 0, costToday: 0, cost30: 0, quietDays: -1 }
    ];
    const snap = buildSnapshot({
        host: 'box', agents, tokensToday: 500,
        needs: [{ kind: 'permission', agent: 'dev', title: 'waiting', detail: '', ts: 1 }],
        notices: [{ title: 'a', type: 'result', level: 2, agent: 'dev', ts: 1, unread: true },
            { title: 'b', type: 'update', level: 1, agent: 'dev', ts: 1, unread: false }],
        live: [], sessions: [], tasks: [{ title: 't', agent: 'dev', status: 'running', ts: 1 }],
        projects: [{ name: 'Acme', agents: 1, sessions: 2, costToday: 2, cost: 9 }]
    }, 1000);
    ok('the snapshot is versioned', snap.v === SNAPSHOT_VERSION);
    ok('totals are computed, not trusted', snap.totals.costToday === 2 && snap.totals.cost30 === 9);
    ok('active agents counted', snap.totals.activeAgents === 1);
    ok('dormant = quiet too long OR never ran', snap.totals.dormantAgents === 2);
    ok('unread notices counted', snap.totals.unreadNotices === 1);
    ok('running tasks counted', snap.totals.runningTasks === 1);
    ok('the writer defaults to the extension', snap.writer === 'extension');

    const fresh = snapshotAge({ ts: Date.now(), writer: 'extension' });
    ok('a fresh extension snapshot reads as live', !fresh.stale && fresh.note === 'live');
    const old = snapshotAge({ ts: Date.now() - 5 * 60_000, writer: 'extension' });
    ok('a snapshot that stopped updating is called out', old.stale && /VS Code/.test(old.note));
    const svc = snapshotAge({ ts: Date.now(), writer: 'service' });
    ok('a service-served snapshot says VS Code is closed',
        svc.stale && /headless service/.test(svc.note));
}

// ---------- routing + auth (pure) ----------
{
    ok('/ is the page', routeOf('/') === 'page' && routeOf('/index.html') === 'page');
    ok('query strings do not change the route', routeOf('/?t=abc') === 'page');
    ok('the snapshot has its own route', routeOf('/snapshot.json?x=1') === 'snapshot');
    ok('health is its own route', routeOf('/health') === 'health');
    ok('anything else is 404', routeOf('/../etc/passwd') === 'notfound' && routeOf('/admin') === 'notfound');

    const T = 'a'.repeat(32);
    ok('query token authorises', authorize('/?t=' + T, {}, T));
    ok('bearer authorises', authorize('/', { authorization: 'Bearer ' + T }, T));
    ok('cookie authorises', authorize('/', { cookie: 'x=1; af_token=' + T }, T));
    ok('a wrong token does not', !authorize('/?t=' + 'b'.repeat(32), {}, T));
    ok('a shorter token does not', !authorize('/?t=' + 'a'.repeat(31), {}, T));
    ok('no token configured = nobody gets in', !authorize('/?t=', {}, ''));
    ok('generated tokens are 32 hex chars and differ',
        /^[0-9a-f]{32}$/.test(generateToken()) && generateToken() !== generateToken());
}

// ---------- the page itself ----------
{
    const html = renderPage();
    ok('the page is a complete document', /^<!doctype html>/i.test(html) && /<\/html>/.test(html));
    ok('it polls the snapshot route', /snapshot\.json/.test(html));
    ok('it fetches nothing from the internet', !/src="http|href="http/i.test(html));
    ok('it states that it is read-only', /read-only|Read-only/i.test(html));
    ok('it renders on a phone', /viewport/.test(html));
}

// ---------- the inbound channel: rules ----------
{
    ok('an empty allowlist means nobody', !isAllowed(123, []));
    ok('a listed chat is allowed', isAllowed(123, [1, 123]));
    ok('an unlisted chat is not', !isAllowed(999, [1, 123]));

    const day = '2026-07-27';
    let ledger = { day, usd: 0 };
    ok('a zero cap means no chat-started runs at all', !withinBudget(ledger, 0, day));
    ok('room under the cap', withinBudget(ledger, 1, day));
    ledger = addSpend(ledger, 0.4, day);
    ledger = addSpend(ledger, 0.4, day);
    ok('spend accumulates', Math.abs(ledger.usd - 0.8) < 1e-9);
    ok('still under the cap', withinBudget(ledger, 1, day));
    ledger = addSpend(ledger, 0.3, day);
    ok('over the cap now', !withinBudget(ledger, 1, day));
    const rolled = addSpend(ledger, 0.1, '2026-07-28');
    ok('the ledger rolls over at midnight', rolled.day === '2026-07-28' && rolled.usd === 0.1);
    ok('…and yesterday\'s overrun does not block today', withinBudget(rolled, 1, '2026-07-28'));
}

// ---------- the inbound channel: parsing ----------
{
    const msgs = parseUpdates({
        ok: true,
        result: [
            { update_id: 5, message: { text: ' hello ', date: 100, chat: { id: 42 }, from: { username: 'mir' } } },
            { update_id: 6, message: { text: 'no chat id', date: 100, from: {} } },   // dropped
            { update_id: 7, message: { photo: [], date: 100, chat: { id: 42 } } },     // not text
            { update_id: 8 }
        ]
    });
    ok('only usable text messages survive', msgs.length === 1);
    ok('the message is trimmed and identified',
        msgs[0].text === 'hello' && msgs[0].chatId === 42 && msgs[0].from === 'mir' && msgs[0].updateId === 5);
    ok('a failed payload yields nothing',
        parseUpdates({ ok: false }).length === 0 && parseUpdates(null).length === 0);

    ok('plain text is work', parseCommand('what broke the build?').kind === 'prompt');
    ok('/agent binds', parseCommand('/agent developer').kind === 'use'
        && parseCommand('/agent developer').agent === 'developer');
    ok('/agent@botname works too (groups)', parseCommand('/agent@farmbot dev').agent === 'dev');
    ok('/status, /agents, /cancel, /help are commands',
        parseCommand('/status').kind === 'status' && parseCommand('/agents').kind === 'agents'
        && parseCommand('/cancel').kind === 'cancel' && parseCommand('/help').kind === 'help');
    ok('/stop is an alias for cancel', parseCommand('/stop').kind === 'cancel');
    ok('an UNKNOWN slash command is never run as a prompt',
        parseCommand('/deploy production').kind === 'help');
    ok('the help text explains the rails', /daily budget/.test(HELP_TEXT) && /\/agent/.test(HELP_TEXT));
    ok('long output is cut with an honest marker',
        /cut — /.test(clipForChat('x'.repeat(5000))) && clipForChat('x'.repeat(5000)).length < 4096);
    ok('empty output says so', clipForChat('') === '(no output)');
}

// ---------- the real server, over HTTP ----------
(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-web-'));
    const snapFile = path.join(dir, 'web-snapshot.json');
    fs.writeFileSync(snapFile, JSON.stringify(buildSnapshot({
        host: 'testbox', tokensToday: 10,
        agents: [{ name: 'dev', project: 'Acme', status: 'tool', active: true, lastActivity: 1, costToday: 1, cost30: 2, quietDays: 0 }],
        needs: [{ kind: 'permission', agent: 'dev', title: 'dev is waiting', detail: 'Bash', ts: 1 }],
        notices: [], live: [], sessions: [], tasks: [], projects: []
    })));
    const TOKEN = generateToken();
    const PORT = 8399;
    const srv = startWebServer(
        { port: PORT, bind: 'local', token: TOKEN, snapshotFile: snapFile, writer: 'extension' },
        () => { });
    ok('the server starts', !!srv);
    const get = (p, headers) => new Promise(res => {
        http.get({ host: '127.0.0.1', port: PORT, path: p, headers: headers || {} }, r => {
            let body = '';
            r.on('data', d => { body += d; });
            r.on('end', () => res({ status: r.statusCode, body, headers: r.headers }));
        }).on('error', e => res({ status: 0, body: String(e) }));
    });
    if (srv) {
        ok('the page without a token is refused', (await get('/')).status === 401);
        ok('the snapshot without a token is refused', (await get('/snapshot.json')).status === 401);
        const health = await get('/health');
        ok('health answers without a token', health.status === 200 && /"ok":true/.test(health.body));
        const page = await get('/?t=' + TOKEN);
        ok('the page loads with the token', page.status === 200 && /Agent Farm/.test(page.body));
        ok('…and sets the bookmark cookie', /af_token=/.test(String(page.headers['set-cookie'])));
        const snap = await get('/snapshot.json', { cookie: 'af_token=' + TOKEN });
        ok('the cookie alone is enough afterwards', snap.status === 200);
        ok('the snapshot carries the real data', JSON.parse(snap.body).totals.needs === 1);
        ok('an unknown path is 404', (await get('/admin?t=' + TOKEN)).status === 404);
        srv.close();
    }
    const noToken = startWebServer(
        { port: 8398, bind: 'local', token: '', snapshotFile: snapFile, writer: 'extension' }, () => { });
    ok('without a token the server REFUSES to start', noToken === undefined);
    fs.rmSync(dir, { recursive: true, force: true });

    // ---------- the wiring ----------
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const props = pkg.contributes.configuration.properties;
    ok('the web view is off by default', props['agentFarm.web.enabled'].default === false);
    ok('…and local-only by default', props['agentFarm.web.bind'].default === 'local');
    ok('…with an empty token by default', props['agentFarm.web.token'].default === '');
    ok('the chat bridge is off by default', props['agentFarm.telegram.enabled'].default === false);
    ok('…with an empty allowlist', props['agentFarm.telegram.allowedChats'].default.length === 0);
    ok('…and a daily cap', props['agentFarm.telegram.maxDailyUSD'].default === 1);
    const ids = new Set(pkg.contributes.commands.map(c => c.command));
    ok('Open Web View… exists', ids.has('agentfarm.openWebView'));
    ok('Connect Telegram… exists', ids.has('agentfarm.connectTelegram'));
    const svc = fs.readFileSync(path.join(__dirname, '..', 'src', 'service', 'farmService.ts'), 'utf8');
    ok('the headless service takes the port over when VS Code is away',
        /syncWebServer/.test(svc) && /vscodeAlive\(\)/.test(svc));
    ok('…and hands it back', /handed back to VS Code/.test(svc));
    ok('…marking the snapshot as its own so the page can say so', /stampSnapshotWriter/.test(svc));
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('the bot token lives in the secret vault, not settings',
        /vault\.set\(TELEGRAM_SECRET/.test(ext) && !/telegram\.token/.test(ext));
    ok('an unknown chat is told its own id instead of being served',
        /Chat id: \$\{msg\.chatId\}/.test(ext));

    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
