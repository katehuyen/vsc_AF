#!/usr/bin/env node
// X-117 — THE ONE LIVE SMOKE, RUN BY HAND AND ONLY WITH `--yes`.
//
// Everything the E2E files prove, they prove against local mock endpoints and
// spend no token. This is the deliberate exception: ONE short turn per engine
// against a REAL provider, through the same resolver the product launches with
// (`providerRegistry` → `spawnEnvironment` / `-m`), so that what the mocks
// certified is seen once on a real wire — the engine answers, the reported
// identity names what was asked for, the engine's own usage figure arrives, and
// the billing reader places the run where the design says it goes.
//
//   --claude    one `haiku` turn on the FIRST-PARTY route — nothing chosen,
//               nothing touched: the session's own sign-in (CLAUDE_CONFIG_DIR)
//               serves it, so it is a plan-window run at the cheapest tier.
//   --opencode  one turn on the engine's own free `opencode/*-free` model, in a
//               temp XDG home so the user's OpenCode store is never touched.
//   --model X   OpenCode model to use instead of the first free one found.
//   --yes       REQUIRED to spend anything. Without it the plan is printed and
//               nothing is spawned (exit 2).
//   --out F     write the measurement JSON to F.
//
// Not a test file (lives in tools/, no `test_` prefix): `run-all` never runs it
// and the suite stays token-free. Run it once per engine addition, after the
// mock E2E is green and with the user's approval — see
// docs/YENI-MOTOR-EKLEME-SOP.tr.md → "Sağlayıcı ekseni".
'use strict';

const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const R = require(path.join(ROOT, 'out', 'core', 'providerRegistry.js'));
const RT = require(path.join(ROOT, 'out', 'core', 'providerRuntime.js'));
const B = require(path.join(ROOT, 'out', 'core', 'billing.js'));

const argv = process.argv.slice(2);
const flag = n => argv.includes(n);
const opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const wantClaude = flag('--claude');
const wantOpenCode = flag('--opencode');
const yes = flag('--yes');
const outFile = opt('--out');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

function cliPresent(name) {
    try {
        cp.execSync(process.platform === 'win32' ? `where ${name}` : `command -v ${name}`, { stdio: 'ignore' });
        return true;
    } catch { return false; }
}

function run(cmd, env, cwd, timeout = 180000) {
    return new Promise(resolve => {
        const t0 = Date.now();
        const child = cp.spawn(cmd, { env, cwd, shell: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', err = '';
        child.stdout.on('data', d => { out += d; });
        child.stderr.on('data', d => { err += d; });
        const kill = setTimeout(() => child.kill(), timeout);
        child.on('close', code => { clearTimeout(kill); resolve({ code, out, err, ms: Date.now() - t0 }); });
    });
}

const jsonLines = text => text.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

async function claudeLeg(measure) {
    console.log('\n[claude] one haiku turn on the first-party route (the session\'s own sign-in)');
    if (!cliPresent('claude')) { ok('claude CLI on PATH', false); return; }
    // No profile chosen: the adapter must inject nothing and clear nothing.
    const adapter = R.adapterFor('claude', { profiles: [], secretFor: () => undefined, inheritedEnv: {} });
    const rt = adapter.resolveRuntime({ engine: 'claude', modelId: 'haiku' });
    ok('nothing chosen means nothing touched — no spawnEnv, no clearEnv, no args', !rt.spawnEnv && !rt.clearEnv && rt.args.length === 0);
    ok('…recorded as a run nobody routed', !rt.identity.providerId);
    const env = RT.spawnEnvironment(process.env, [{ DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }], rt);
    ok('the sign-in that serves it is the session\'s own config dir', !!env.CLAUDE_CONFIG_DIR);
    const r = await run('claude -p "say ping" --model haiku --output-format stream-json --verbose --max-turns 1', env, os.tmpdir());
    const events = jsonLines(r.out);
    const result = events.find(e => e.type === 'result') || {};
    ok(`the turn finished (exit ${r.code}, ${r.ms} ms)`, r.code === 0);
    if (r.code !== 0) { console.log('  stderr:', r.err.slice(0, 600)); }
    ok('one result event, and it is a success', events.filter(e => e.type === 'result').length === 1 && result.subtype === 'success');
    const reported = adapter.identityFromEvents(events) || {};
    const models = reported.reportedModels || [];
    ok(`the engine reports the model that answered: ${models.join(', ') || '(none)'}`, models.some(m => /haiku/i.test(m)));
    ok('‼️ the transcript names NO route (measured design: a route is what this engine cannot witness)',
        !(reported.reportedProviderIds || []).length);
    const usage = result.usage || {};
    ok(`the engine's own usage arrives: in=${usage.input_tokens} out=${usage.output_tokens}`,
        typeof usage.input_tokens === 'number' && usage.input_tokens > 0 && typeof usage.output_tokens === 'number' && usage.output_tokens > 0);
    ok(`…and its own cost figure: $${result.total_cost_usd}`, typeof result.total_cost_usd === 'number');
    const bill = B.billingOf({ engine: 'claude', providerId: rt.identity.providerId || '' });
    ok('the billing reader places a first-party run ON the plan window, cost API-equivalent',
        bill.mode === 'plan' && bill.planWindow === true && bill.dollar === 'equivalent');
    measure.claude = { exit: r.code, ms: r.ms, model: models, subtype: result.subtype, usage, cost: result.total_cost_usd,
        session: result.session_id, billing: bill.mode, planWindow: bill.planWindow, configDir: env.CLAUDE_CONFIG_DIR };
}

async function openCodeLeg(measure) {
    console.log('\n[opencode] one turn on the engine\'s own free provider (temp XDG home)');
    if (!cliPresent('opencode')) { ok('opencode CLI on PATH', false); return; }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-smoke-oc-'));
    const work = path.join(tmp, 'work');
    fs.mkdirSync(work);
    const env = { ...process.env, XDG_DATA_HOME: path.join(tmp, 'data'), XDG_CONFIG_HOME: path.join(tmp, 'config'),
        XDG_STATE_HOME: path.join(tmp, 'state') };
    try {
        const models = await run('opencode models --verbose', env, work);
        const adapter = R.adapterFor('opencode', { profiles: [], secretFor: () => undefined, inheritedEnv: {}, openCodeCatalogText: models.out });
        const cat = adapter.catalog();
        const rows = (cat.rows || []).filter(r => r.providerId === 'opencode');
        const free = rows.map(r => r.modelId || r.id).filter(id => /free$/.test(String(id)));
        ok(`the engine's catalog offers free models on its own provider: ${free.join(', ') || '(none)'}`, free.length > 0);
        // ‼️ THE PICK GOES THROUGH THE PRODUCT'S OWN GATE FIRST. Measured
        // 2026-09-19: the first free model in the list (`jev-1.13-free`)
        // publishes no tool calling, `preflight` refuses it by name, and the
        // live turn on it really did exit 1 after 80 s with no text — the
        // refusal is what a session would have met. So the smoke takes the
        // first free model the gate PASSES, and names the ones it dropped.
        const verdict = id => adapter.preflight({ engine: 'opencode', providerId: 'opencode', modelId: `opencode/${id}` });
        const refused = free.filter(id => verdict(id).length).map(id => `${id} (${verdict(id)[0]})`);
        if (refused.length) { console.log('  dropped by preflight: ' + refused.join('; ')); }
        const picked = opt('--model');
        const chosen = picked ? (picked.includes('/') ? picked.split('/')[1] : picked) : free.find(id => !verdict(id).length);
        if (!chosen) { ok('a free model passes the product\'s own preflight', false); return; }
        const modelId = `opencode/${chosen}`;
        ok(`the adapter passes the pick (${modelId})`, verdict(chosen).length === 0);
        const rt = adapter.resolveRuntime({ engine: 'opencode', providerId: 'opencode', modelId });
        ok('the selection becomes the engine\'s own -m, and no environment of ours', rt.args.join(' ') === `-m ${modelId}` && !rt.spawnEnv && !rt.clearEnv);
        const r = await run(`opencode run ${rt.args.join(' ')} --format json "say ping"`, env, work);
        ok(`the turn finished (exit ${r.code}, ${r.ms} ms)`, r.code === 0);
        if (r.code !== 0) { console.log('  stderr:', r.err.slice(0, 600)); }
        const ev = jsonLines(r.out);
        const ses = (ev.find(e => e.sessionID) || {}).sessionID || '';
        ok(`the run names its session (${ses})`, /^ses_/.test(ses));
        const text = ev.filter(e => e.type === 'text').map(e => (e.part || {}).text || '').join('');
        ok(`the model answered (${JSON.stringify(text.slice(0, 60))})`, text.trim().length > 0);
        const finish = ev.find(e => e.type === 'step_finish') || {};
        const tokens = (finish.part || {}).tokens || {};
        ok(`the engine publishes its own tokens and cost: total=${tokens.total} cost=${(finish.part || {}).cost}`,
            typeof tokens.total === 'number' && tokens.total > 0 && typeof (finish.part || {}).cost === 'number');
        let reported = {};
        if (ses) {
            const exp = await run(`opencode export ${ses}`, env, work);
            let doc = null;
            try { doc = JSON.parse(exp.out.slice(exp.out.indexOf('{'))); } catch { /* reported below */ }
            reported = adapter.identityFromEvents(doc ? [doc] : []) || {};
        }
        ok(`the export reports the provider that ran: ${(reported.reportedProviderIds || []).join(', ')}`,
            (reported.reportedProviderIds || []).includes('opencode'));
        ok(`…and the model: ${(reported.reportedModels || []).join(', ')}`,
            (reported.reportedModels || []).some(m => modelId.endsWith(String(m)) || String(m).endsWith(modelId.split('/')[1])));
        const bill = B.billingOf({ engine: 'opencode', providerId: 'opencode' });
        ok('the billing reader keeps it OFF the Claude plan window, engine-reported', bill.planWindow === false && bill.cost === 'engine-reported');
        ok('the user\'s own OpenCode home was not touched (session in the temp home)', fs.existsSync(path.join(tmp, 'data', 'opencode')));
        measure.opencode = { exit: r.code, ms: r.ms, model: modelId, free, refused, session: ses, answer: text.slice(0, 80), tokens,
            cost: (finish.part || {}).cost, reported: reported.reportedModels, billing: bill.cost, planWindow: bill.planWindow };
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
}

async function main() {
    if (!wantClaude && !wantOpenCode) {
        console.log('usage: node tools/smoke_live.js [--claude] [--opencode] [--model <id>] [--out <file>] --yes');
        process.exit(2);
    }
    if (!yes) {
        console.log('DRY: would spend real tokens on ' + [wantClaude && 'claude (haiku, first-party, plan window)', wantOpenCode && 'opencode (free provider)']
            .filter(Boolean).join(' + ') + '. Add --yes to run.');
        process.exit(2);
    }
    const measure = { at: new Date().toISOString(), host: os.hostname() };
    if (wantClaude) { await claudeLeg(measure); }
    if (wantOpenCode) { await openCodeLeg(measure); }
    measure.pass = pass; measure.fail = fail;
    if (outFile) { fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true }); fs.writeFileSync(outFile, JSON.stringify(measure, null, 2) + '\n', 'utf8'); }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
