// X-532 — A ROUTE'S TEST NAMES THE SERVICE'S OWN REFUSAL. Measured: OpenRouter's daily free limit (HTTP 429)
// came back as "this sign-in's five-hour limit" on OpenCode, and on Claude as "The command exited 1" after ten
// silent retries had outlasted the check. The lines below are the real CLIs' own output, captured against a local
// service answering that status (OpenCode 1.18.35, Claude Code 2.1.295) — never a shape written from memory.
'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const S = require(path.join(ROOT, 'out', 'core', 'serviceRefusal.js'));
const E = require(path.join(ROOT, 'out', 'core', 'engineTest.js'));
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const SENTENCE = 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day';
const RESET = 1791590400000;
const OC_429 = '{"type":"error","timestamp":1791598093776,"sessionID":"ses_edc6fb827ffe4Y2E6FJKoNL16g","error":{"name":"APIError","data":{"message":"'
    + SENTENCE + '","statusCode":429,"isRetryable":true,"responseHeaders":{"connection":"keep-alive","content-type":"application/json",'
    + '"x-ratelimit-limit":"50","x-ratelimit-remaining":"0","x-ratelimit-reset":"1791590400000"},"responseBody":"{\\"error\\":{\\"message\\":\\"'
    + SENTENCE + '\\",\\"code\\":429,\\"metadata\\":{\\"headers\\":{\\"X-RateLimit-Limit\\":\\"50\\",\\"X-RateLimit-Remaining\\":\\"0\\",'
    + '\\"X-RateLimit-Reset\\":\\"1791590400000\\"},\\"provider_name\\":null}},\\"user_id\\":\\"user_TEST\\"}","metadata":{"url":"http://127.0.0.1:3242/v1/chat/completions"}}}}';
const OC_401 = '{"type":"error","timestamp":1791598102849,"sessionID":"ses_x","error":{"name":"APIError","data":{"message":"No auth credentials found",'
    + '"statusCode":401,"isRetryable":false,"responseHeaders":{"content-type":"application/json"},"responseBody":"{\\"error\\":{\\"message\\":\\"No auth credentials found\\",\\"code\\":401}}"}}}';
const CLAUDE_429 = 'API Error: Request rejected (429) · ' + SENTENCE + '\n';
const CLAUDE_401 = 'Failed to authenticate. API Error: 401 No auth credentials found\n';

// ---------- the reading, pure ----------
{
    const oc = S.serviceRefusal('\n' + OC_429);
    ok('‼️ OpenCode\'s error event: the status, the service\'s own sentence, its reset', !!oc && oc.status === 429 && oc.kind === 'limit'
        && oc.message === SENTENCE && oc.resetAt === RESET);
    const cl = S.serviceRefusal(CLAUDE_429);
    ok('‼️ Claude\'s printed line: the status and the sentence (it prints no reset)', !!cl && cl.status === 429 && cl.kind === 'limit'
        && cl.message === SENTENCE && cl.resetAt === undefined);
    ok('a refused key is told from a limit, on both', S.serviceRefusal(OC_401).kind === 'auth' && S.serviceRefusal(OC_401).message === 'No auth credentials found'
        && S.serviceRefusal(CLAUDE_401).kind === 'auth' && S.serviceRefusal(CLAUDE_401).status === 401
        && S.serviceRefusal(CLAUDE_401).message === 'No auth credentials found');
    ok('a reset stated in seconds is read as a moment too', S.serviceRefusal(OC_429.split('1791590400000').join('1791590400')).resetAt === RESET);
    ok('the SDK\'s own text (a status before a quoted body) gives the inner sentence, never "429 {"',
        S.serviceRefusal('API Error: 429 {"type":"error","error":{"type":"rate_limit_error","message":"' + SENTENCE + '"}}').message === SENTENCE);
    ok('‼️ nothing is read out of words alone: no HTTP status in the engine\'s error, no answer',
        S.serviceRefusal('You\'ve hit your session limit · resets 3pm') === undefined
        && S.serviceRefusal('rate limit exceeded, too many requests') === undefined
        && S.serviceRefusal('{"type":"error","error":{"name":"APIError","data":{"message":"Internal error","statusCode":500}}}') === undefined
        && S.serviceRefusal('') === undefined);
    ok('the moment is written as a moment, never a span that goes stale in a stored verdict',
        S.reopensAt(RESET) === new Date(RESET).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' && S.reopensAt(undefined) === '');
}

// ---------- the verdict, through the one function the button and the bridge op press ----------
(async () => {
    const runner = (stdout, seen) => async (cmd, args, timeout, shell, stdin, env) => { if (seen) { seen.env = env; } return { code: 1, stdout, stderr: '' }; };
    const ROUTE = { providerId: 'af-or-nemotron', modelRef: 'af-or-nemotron/nvidia/nemo:free', spawnEnv: { AF_ROUTE_KEY_OR_NEMOTRON: 'k' } };
    const oc = await E.testEngine('opencode', runner(OC_429), () => 5, ROUTE);
    ok('‼️ an OpenCode route at its service\'s limit is HELD, not failed, and not called a five-hour window',
        oc.ok === false && oc.refused === true && oc.reached === true && !/five-hour|sign-in's WEEKLY/.test(oc.detail)
        && /answered HTTP 429/.test(oc.detail) && /not this sign-in's plan window/.test(oc.detail));
    ok('…the service\'s own sentence is what is quoted, and its reset travels as a moment', oc.error === SENTENCE && oc.resetAt === RESET
        && oc.detail.includes('It reopens at ' + S.reopensAt(RESET) + '.'));
    ok('…and it never says the engine did nothing: the address and the key were accepted',
        !/before the engine did anything/.test(oc.detail) && /address and the key were accepted/.test(oc.detail));

    const seen = {};
    const CL_ROUTE = { providerId: 'or-nemotron', modelRef: 'nvidia/nemo:free', spawnEnv: { ANTHROPIC_BASE_URL: 'https://openrouter.ai/api' }, clearEnv: ['ANTHROPIC_AUTH_TOKEN'] };
    const cl = await E.testEngine('claude', runner(CLAUDE_429, seen), () => 5, CL_ROUTE);
    ok('‼️ a Claude route at its service\'s limit is held with the service\'s sentence', cl.refused === true && cl.reached === true && cl.error === SENTENCE
        && cl.resetAt === undefined && !/It reopens/.test(cl.detail));
    ok('‼️ a Claude route test gives up after two retries, beside the route\'s own environment',
        seen.env.set.CLAUDE_CODE_MAX_RETRIES === '2' && seen.env.set.ANTHROPIC_BASE_URL === 'https://openrouter.ai/api'
        && JSON.stringify(seen.env.clear) === '["ANTHROPIC_AUTH_TOKEN"]');
    const own = {};
    await E.testEngine('claude', runner('', own), () => 5, { ...CL_ROUTE, spawnEnv: { ...CL_ROUTE.spawnEnv, CLAUDE_CODE_MAX_RETRIES: '7' } });
    ok('…a route that names the variable itself keeps its value', own.env.set.CLAUDE_CODE_MAX_RETRIES === '7');

    const key = await E.testEngine('opencode', runner(OC_401), () => 5, ROUTE);
    ok('a refused key is a real failure of the route — a red cross, in the service\'s words',
        key.ok === false && !key.refused && key.reached === true && /answered HTTP 401/.test(key.detail) && key.error === 'No auth credentials found');

    // ‼️ Claude's own sign-in is untouched: the engine's check carries an ACCOUNT's environment and names no provider.
    const acct = {};
    const plain = await E.testEngine('claude', runner(CLAUDE_429, acct), () => 5, { providerId: '', spawnEnv: { CLAUDE_CONFIG_DIR: 'C:/slot' } });
    ok('‼️ the engine\'s own check on Claude is read exactly as before (no service verdict, no retries variable)',
        plain.reached === undefined && !('CLAUDE_CODE_MAX_RETRIES' in acct.env.set) && JSON.stringify(acct.env.set) === '{"CLAUDE_CONFIG_DIR":"C:/slot"}');
    const wall = await E.testEngine('claude', runner('You\'ve hit your session limit · resets 3pm'), () => 5, CL_ROUTE);
    ok('…and a plan window is still a plan window, on a route too', wall.refused === true && wall.reached === undefined && /five-hour/.test(wall.detail));
    let calls = 0;   // the engine's own check reads the catalogue first, then runs the turn
    const bare = await E.testEngine('opencode', async () => (calls++ === 0
        ? { code: 0, stdout: 'opencode/big-pickle\nopencode/nemotron-3-ultra-free\n', stderr: '' } : { code: 1, stdout: OC_429, stderr: '' }), () => 5);
    ok('an OpenCode turn with no route named is read the same way: that engine has no plan window at all',
        bare.refused === true && bare.reached === true && !/five-hour/.test(bare.detail));

    // ---------- the record and the page ----------
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the stored route verdict carries both facts', /\.\.\.\(r\.reached \? \{ reached: true \} : \{\}\),\s*\.\.\.\(r\.resetAt \? \{ resetAt: r\.resetAt \} : \{\}\)/.test(ext));
    const fixture = require(path.join(__dirname, 'fixtures', 'enginespanel.js'));
    const data = JSON.parse(JSON.stringify(fixture.variants().find(v => v.id === 'engineshealth').data));
    const rows = data.providerHealth.flatMap(e => e.rows || []);
    const held = rows.find(r => r.tested && r.tested.refused);
    ok('the fixture has a held route to draw on', !!held);
    const before = runPage('engines.js', data).html();
    ok('a refusal that called nothing still says so', /pohchip h-held">not attempted · /.test(before) && /Nothing was called · /.test(before));
    Object.assign(held.tested, { reached: true, resetAt: RESET, error: SENTENCE, detail: oc.detail });
    const html = runPage('engines.js', data).html();
    ok('‼️ a route held by its service wears "service limit" in the held colour, never a red cross and never "not attempted"',
        /pohchip h-held">service limit · /.test(html) && !/pohchip h-held">not attempted · /.test(html));
    ok('…its hover says who held it, quotes the service and gives the reopening',
        /Held by the service · /.test(html) && !/Nothing was called · /.test(html) && html.includes('The service said: ' + SENTENCE.slice(0, 40))
        && /Reopens: /.test(html));

    // the engine's own card (OpenCode's check with no route named) words it the same way
    const cards = fixture.variants().map(v => JSON.parse(JSON.stringify(v.data))).find(d => (d.verdicts || []).some(v => v.refused));
    ok('the fixture has a held engine verdict to draw on', !!cards);
    const card = cards.verdicts.find(v => v.refused);
    ok('a check that called nothing says so on the card', /Called: nothing — the engine was never asked/.test(runPage('engines.js', cards).html()));
    Object.assign(card, { reached: true, resetAt: RESET, error: SENTENCE });
    const cardHtml = runPage('engines.js', cards).html();
    ok('‼️ a card held by the service never says nothing was called',
        /Held by the service · /.test(cardHtml) && /Called: the service — it answered with a limit of its own/.test(cardHtml)
        && !/Called: nothing — the engine was never asked/.test(cardHtml) && /Reopens: /.test(cardHtml) && /The service said: Rate limit exceeded/.test(cardHtml));

    console.log(`test_service_refusal: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
