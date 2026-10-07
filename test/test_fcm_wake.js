// X-451 — THE FCM WAKE, without a real key: a service account made here, Google faked.
//
// fcm.ts: the key in Secrets is read or refused in a sentence; the JWT is RS256 over
// the claims Google asks for and verifies with the key's own public half; the access
// token is traded once and kept, a 401 trades again once, a dead token says `gone`;
// only https leaves the machine. phoneWake.ts: an event the farm would ring for wakes
// each phone with no socket open, once per gap, with nothing but the farm id.
'use strict';
const crypto = require('crypto');
const http = require('http');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const F = require(path.join(OUT, 'fcm.js'));
const { PhoneWaker, wakes, WAKE_GAP_MS } = require(path.join(OUT, 'phoneWake.js'));
const { secretReaders } = require(path.join(OUT, 'secretReaders.js'));

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const keyText = uri => JSON.stringify({ type: 'service_account', project_id: 'agent-farm-f0701', client_email: 'wake@agent-farm-f0701.iam.gserviceaccount.com',
    private_key: pem, ...(uri ? { token_uri: uri } : {}) }, null, 2);
const b64json = s => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

(async () => {
    // ---------- the key ----------
    const sa = F.parseServiceAccount(keyText());
    ok('a key file is read, Google\'s token endpoint when it names none', sa.projectId === 'agent-farm-f0701' && sa.tokenUri === 'https://oauth2.googleapis.com/token');
    ok('a pasted key whose line breaks the input dropped still reads', !('error' in F.parseServiceAccount(keyText().replace(/\n/g, ''))));
    ok('no key: the sentence names the secret to add', /add FCM_SERVICE_ACCOUNT_JSON in Secrets/.test(F.parseServiceAccount(undefined).error)
        && /add FCM_SERVICE_ACCOUNT_JSON/.test(F.parseServiceAccount('  ').error));
    ok('not JSON is said', /not JSON/.test(F.parseServiceAccount('{oops').error));
    ok('another kind of key is said', /authorized_user key/.test(F.parseServiceAccount('{"type":"authorized_user"}').error));
    ok('missing fields are named', /no project_id, client_email, private_key/.test(F.parseServiceAccount('{"type":"service_account"}').error));
    ok('a private key that is not one is said', /not a PEM private key/.test(F.parseServiceAccount(JSON.stringify({ project_id: 'p', client_email: 'e', private_key: 'nope' })).error));
    ok('the vault name is the one the Secrets page starts farm-only (test_secrets_rename_panel)', F.FCM_SECRET === 'FCM_SERVICE_ACCOUNT_JSON');
    ok('the Secrets page says who reads it', secretReaders('FCM_SERVICE_ACCOUNT_JSON', { telegram: 'T', wake: F.FCM_SECRET, kapici: [], media: '', replicate: '', engines: [] })
        .join() === 'the phone wake (Firebase service account key)');

    // ---------- the JWT ----------
    const jwt = F.signedAssertion(sa, 1_800_000_000).split('.');
    const claims = b64json(jwt[1]);
    ok('‼️ the assertion is RS256 and verifies with the key\'s own public half', b64json(jwt[0]).alg === 'RS256'
        && crypto.verify('RSA-SHA256', Buffer.from(jwt[0] + '.' + jwt[1]), publicKey, Buffer.from(jwt[2], 'base64url')));
    ok('its claims are the ones Google asks for: issuer, the messaging scope, the endpoint, an hour',
        claims.iss === sa.clientEmail && claims.scope === 'https://www.googleapis.com/auth/firebase.messaging' && claims.aud === sa.tokenUri
        && claims.iat === 1_800_000_000 && claims.exp === claims.iat + 3600);

    // ---------- the client, against a fake Google ----------
    let now = 1_000_000;
    const seen = [];
    let answers = [];
    const post = async (url, headers, body) => { seen.push({ url, headers, body }); const a = answers.shift(); if (a instanceof Error) { throw a; } return a; };
    const tokenOk = (t, life = 3600) => ({ status: 200, body: JSON.stringify({ access_token: t, expires_in: life }) });
    const c = new F.FcmClient(sa, { post, now: () => now });
    answers = [tokenOk('at-1'), { status: 200, body: '{"name":"m1"}' }];
    let r = await c.send('tok-A', { wake: '1', farm: 'farm_x' });
    ok('a wake is sent', r.ok === true && seen.length === 2);
    const form = new URLSearchParams(seen[0].body);
    ok('the token is traded at the key\'s endpoint with the JWT bearer grant', seen[0].url === sa.tokenUri
        && form.get('grant_type') === 'urn:ietf:params:oauth:grant-type:jwt-bearer' && form.get('assertion').split('.').length === 3);
    const msg = JSON.parse(seen[1].body).message;
    ok('‼️ the message goes to the project\'s v1 endpoint with the access token', seen[1].url === 'https://fcm.googleapis.com/v1/projects/agent-farm-f0701/messages:send'
        && seen[1].headers.Authorization === 'Bearer at-1');
    ok('‼️ it is a data message only — no notification Google could read — high priority, one kept in the queue',
        msg.token === 'tok-A' && JSON.stringify(msg.data) === '{"wake":"1","farm":"farm_x"}' && msg.notification === undefined
        && msg.android.priority === 'HIGH' && msg.android.collapse_key === 'agentfarm-wake' && /^\d+s$/.test(msg.android.ttl));
    answers = [{ status: 200, body: '{}' }];
    r = await c.send('tok-B', { wake: '1', farm: 'f' });
    ok('the access token is kept: a second wake trades nothing', r.ok && seen.length === 3 && seen[2].headers.Authorization === 'Bearer at-1');
    now += 3600 * 1000;
    answers = [tokenOk('at-2'), { status: 200, body: '{}' }];
    await c.send('tok-B', { wake: '1', farm: 'f' });
    ok('an hour on it is traded again before it runs out', seen[3].url === sa.tokenUri && seen[4].headers.Authorization === 'Bearer at-2');
    answers = [{ status: 401, body: '{}' }, tokenOk('at-3'), { status: 200, body: '{}' }];
    r = await c.send('tok-B', { wake: '1', farm: 'f' });
    ok('a 401 trades a fresh token once and sends again', r.ok && seen[6].url === sa.tokenUri && seen[7].headers.Authorization === 'Bearer at-3');
    answers = [{ status: 401, body: '{}' }, tokenOk('at-4'), { status: 401, body: '{"error":{"message":"nope"}}' }];
    r = await c.send('tok-B', { wake: '1', farm: 'f' });
    ok('a second 401 is an error, not a loop', !r.ok && /401/.test(r.error) && answers.length === 0);
    const dead = JSON.stringify({ error: { status: 'NOT_FOUND', message: 'Requested entity was not found.', details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }] } });
    answers = [{ status: 404, body: dead }];
    r = await c.send('tok-old', { wake: '1', farm: 'f' });
    ok('‼️ a dead token is `gone`, with FCM\'s own code', !r.ok && r.gone === true && /404 UNREGISTERED/.test(r.error));
    answers = [{ status: 403, body: JSON.stringify({ error: { status: 'PERMISSION_DENIED', details: [{ errorCode: 'SENDER_ID_MISMATCH' }] } }) }];
    r = await c.send('tok-B', { wake: '1', farm: 'f' });
    ok('a token of another Firebase project is an error but not gone: the right key would reach it', !r.ok && !r.gone && /SENDER_ID_MISMATCH/.test(r.error));
    answers = [new Error('ECONNRESET')];
    r = await c.send('tok-B', { wake: '1', farm: 'f' });
    ok('a network failure is an answer, never a throw', !r.ok && /ECONNRESET/.test(r.error));
    const c2 = new F.FcmClient(sa, { post, now: () => now });
    answers = [{ status: 400, body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid JWT Signature.' }) }];
    r = await c2.send('tok-B', { wake: '1', farm: 'f' });
    ok('a key Google refuses says so in Google\'s words', !r.ok && /did not accept the service account key \(400: Invalid JWT Signature\.\)/.test(r.error));

    // ---------- the real transport, to a fake Google on this machine ----------
    const got = [];
    const srv = http.createServer((req, res) => {
        let b = ''; req.on('data', d => { b += d; });
        req.on('end', () => {
            got.push({ url: req.url, auth: req.headers.authorization, b });
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(req.url === '/token' ? JSON.stringify({ access_token: 'live-1', expires_in: 3599 }) : '{"name":"projects/p/messages/1"}');
        });
    });
    await new Promise(res => srv.listen(0, '127.0.0.1', res));
    const base = `http://127.0.0.1:${srv.address().port}`;
    const sender = F.fcmSenderFrom(() => keyText(base + '/token'), { base });
    const s1 = sender();
    r = await s1('tok-live', { wake: '1', farm: 'farm_live' });
    ok('‼️ end to end over http on this machine: token traded, message delivered', r.ok && got.length === 2 && got[1].url === '/v1/projects/agent-farm-f0701/messages:send'
        && got[1].auth === 'Bearer live-1' && JSON.parse(got[1].b).message.data.farm === 'farm_live');
    ok('the sender is kept while the key is the same, so its access token is too', sender() === s1);
    srv.close();
    let refused = '';
    await F.httpPost('http://example.com/x', {}, '').catch(e => { refused = e.message; });
    ok('‼️ plain http anywhere but this machine is refused', /only https/.test(refused));
    let key = '';
    const s2 = F.fcmSenderFrom(() => key);
    ok('no key: the sender is the reason', /add FCM_SERVICE_ACCOUNT_JSON/.test(s2().error));
    key = keyText();
    ok('a key added later is picked up at once', typeof s2() === 'function');

    // ---------- the waker ----------
    ok('an alerting event wakes; one the farm silences or one that never rings does not', wakes({ type: 'ask.opened', data: {} })
        && !wakes({ type: 'ask.opened', data: { quiet: { reasons: ['fleet'] } } }) && !wakes({ type: 'session.ended', data: {} }) && !wakes({ type: 'needs.changed', data: {} }));
    let t = 0;
    const sent = [], forgot = [], logs = [];
    let targets = [{ device: 'd1', name: 'Pixel', token: 'k1' }, { device: 'd2', name: 'Tab', token: 'k2' }];
    let sendAnswer = () => ({ ok: true });
    let senderOf = () => async (token, data) => { sent.push({ token, data }); return sendAnswer(token); };
    const w = new PhoneWaker({
        targets: all => (all ? [...targets, { device: 'd3', name: 'Open', token: 'k3' }] : targets),
        sender: () => senderOf(), forget: (d, k) => forgot.push(d + ':' + k), farmId: () => 'farm_w', now: () => t, log: l => logs.push(l),
    });
    let o = await w.onEvent({ type: 'turn.finished', data: { session: 's', summary: 'secret words' } });
    ok('‼️ every phone with no socket open is woken, with the farm id and nothing of the event', o.length === 2 && o.every(x => x.ok)
        && sent.every(s => JSON.stringify(s.data) === '{"wake":"1","farm":"farm_w"}') && !JSON.stringify(sent).includes('secret words'));
    o = await w.onEvent({ type: 'notice.posted', data: {} });
    ok('‼️ inside the gap a phone is not woken again: one connection reads everything it missed', o.length === 0 && sent.length === 2);
    t += WAKE_GAP_MS;
    o = await w.onEvent({ type: 'notice.posted', data: {} });
    ok('after the gap it is', o.length === 2 && sent.length === 4);
    t += WAKE_GAP_MS;
    o = await w.onEvent({ type: 'ask.opened', data: { quiet: { reasons: ['quiet-hours'] } } });
    ok('an event the farm keeps quiet wakes no one', o.length === 0 && sent.length === 4);
    const burst = await Promise.all([w.onEvent({ type: 'ask.opened', data: {} }), w.onEvent({ type: 'permission.opened', data: {} })]);
    ok('a burst in flight wakes each phone once', burst[0].length + burst[1].length === 2 && sent.length === 6);
    t += WAKE_GAP_MS;
    sendAnswer = token => (token === 'k1' ? { ok: false, error: 'FCM refused the wake (404 UNREGISTERED)', gone: true } : { ok: true });
    o = await w.onEvent({ type: 'ask.opened', data: {} });
    ok('‼️ a dead token is dropped from the device and said', forgot.join() === 'd1:k1' && o.find(x => x.device === 'd1').gone === true
        && logs.some(l => /wake to Pixel failed/.test(l)));
    senderOf = () => ({ error: 'no key here' });
    t += WAKE_GAP_MS;
    o = await w.onEvent({ type: 'ask.opened', data: {} });
    await w.onEvent({ type: 'notice.posted', data: {} });
    ok('without a key nothing is sent, and the reason is logged once, not per event', o.length === 0
        && logs.filter(l => /no phone wake - no key here/.test(l)).length === 1);
    senderOf = () => async (token, data) => { sent.push({ token, data }); return { ok: true }; };
    const before = sent.length;
    o = await w.test();
    ok('a test wake reaches every phone holding a token, open socket or not, inside the gap', o.length === 3 && sent.length === before + 3);
    o = await w.test('d2');
    ok('…or the one named', o.length === 1 && o[0].device === 'd2');
    senderOf = () => ({ error: 'no key here' });
    ok('a test wake without a key is the reason', (await w.test()).error === 'no key here');
    targets = [];
    senderOf = () => { throw new Error('the sender must not be built when no phone needs a wake'); };
    t += WAKE_GAP_MS;
    ok('with no phone to wake the key is not even read', (await w.onEvent({ type: 'ask.opened', data: {} })).length === 0);

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw ' + (e && e.stack)); process.exit(1); });
