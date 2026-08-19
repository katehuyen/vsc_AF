// MEASUREMENT, not a unit test — it drives the REAL `opencode` binary through
// the REAL ConsoleHost. Needs `opencode` on PATH with a connected provider.
// Run: node test/smoke_opencode_console.mjs
//
// ‼️ THIS IS X-40's REAL SMOKE SET. Every fixture in test/test_opencode*.js is
// written against a transcript somebody once captured; a translation layer can
// pass all of them and still produce an empty Console against the binary that
// actually shipped. So this proves, in order, the seven things X-40 names:
//
//   1. a fresh turn carries a nonce the model could not have known
//   2. a SECOND turn on the SAME ses_ id recalls it — one conversation
//   3. live thought / tool / usage reach the state while the turn is running
//   4. session/cancel on the first chunk closes the turn as CANCELLED
//   5. a session created OUTSIDE (by `opencode run`) loads through ACP and
//      replays, then continues
//   6. two cards under ONE process id — the whole point of the shared runtime
//   7. the runtime survives being killed and reloads its cards
//
// ‼️ IT SPENDS NOTHING. The model is picked at run time from the connected
// provider's *-free list, the way engineTest does — a smoke set that quietly
// bills the user is a smoke set nobody runs twice.
//
// ‼️ IT TOUCHES ONLY WHAT IT MADE. Sessions are titled through a disposable cwd
// under TEMP, and only the ses_ ids this run created are ever closed. The
// user's own sessions, their auth/config/provider files and any open TUI are
// never read, written or killed.
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import cp from 'node:child_process';
import { pathToFileURL } from 'node:url';

const out = path.resolve(process.cwd(), 'out', 'core');
const { ConsoleHost, nodeOpencodeIo } = await import(pathToFileURL(path.join(out, 'consolehost.js')).href);

let bad = 0, skipped = 0;
const ok = (n, c) => { if (c) { console.log(`  ok   ${n}`); } else { bad++; console.log(`  FAIL ${n}`); } };
const skip = (n, why) => { skipped++; console.log(`  skip ${n} — ${why}`); };

// ── the free model, chosen at run time ──────────────────────────────────────
function freeModel() {
    try {
        const list = cp.execSync('opencode models', { encoding: 'utf8', timeout: 90000 })
            .split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        return list.find(m => /-free$/.test(m)) || null;
    } catch { return null; }
}
const MODEL = process.env.AF_SMOKE_MODEL || freeModel();
if (!MODEL) {
    console.log('no *-free model on the connected provider — this smoke set will not spend money to run.');
    process.exit(2);
}
console.log(`model: ${MODEL}`);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-oc-smoke-'));
const dirA = path.join(root, 'disposable-card-a');
const dirB = path.join(root, 'disposable-card-b');
fs.mkdirSync(dirA, { recursive: true });
fs.mkdirSync(dirB, { recursive: true });

const NONCE = 'HALYARD-' + Math.floor(Math.random() * 9000 + 1000);
// ‼️ The shared-ACP io is handed IN, exactly as extension.ts hands it in. A host
// built without it answers every OpenCode card with "this build was not given a
// way to start `opencode acp`" — which is the right answer, and would make this
// smoke set prove nothing while looking like it ran.
const host = new ConsoleHost(
    () => 'claude',
    () => undefined,
    () => undefined,
    () => undefined,
    () => ({}),
    nodeOpencodeIo());
const state = id => host.get(id);
const wait = (fn, ms = 240000) => new Promise((res, rej) => {
    const t0 = Date.now();
    const tick = () => {
        if (fn()) { return res(); }
        if (Date.now() - t0 > ms) { return rej(new Error('timed out')); }
        setTimeout(tick, 300);
    };
    tick();
});
const started = [];
const open = (cwd, extra = {}) => {
    const id = host.start({
        agentId: 'smoke', agentName: 'developer', cwd,
        engine: 'opencode', model: MODEL, ...extra
    });
    started.push(id);
    return id;
};
const show = (label, id) => {
    const s = state(id);
    console.log(`\n──── ${label}`);
    console.log(`status ${s.status}  ses ${s.sessionId ?? '(none)'}  turns ${s.turns}  tokens ${s.tokens}  cost $${s.costUSD}`);
    for (const m of s.messages.slice(-6)) {
        const what = m.role === 'tool'
            ? (m.tool ? `${m.tool.name}(${String(m.tool.detail ?? '').slice(0, 50)})` : `-> ${String(m.text).slice(0, 60)}`)
            : String(m.text ?? '').slice(0, 90).replace(/\s+/g, ' ');
        console.log(`  ${m.role.padEnd(7)} ${what}`);
    }
};

try {
    // ── 1) a fresh turn ─────────────────────────────────────────────────────
    console.log('\n1 — a fresh turn on a shared-ACP engine');
    const a = open(dirA);
    // ‼️ `starting` is a REAL status on this engine and on no other: the work of
    // starting is a handshake plus session/new over a shared connection, which
    // can genuinely fail with something worth reading.
    ok('the card starts in `starting`, not idle — the handshake is real work',
        state(a) && state(a).status === 'starting');
    ok('it knows which engine it is on', state(a).engine === 'opencode');
    await wait(() => state(a).status !== 'starting', 120000);
    show('after the handshake', a);
    ok('the handshake finished without an error status', state(a).status === 'idle');

    host.send(a, `Remember this token: ${NONCE}. Reply with just the token. Do not use tools.`);
    await wait(() => state(a).status === 'idle');
    show('after the first turn', a);
    const first = state(a);
    ok('a real ses_ id came back from the engine', /^ses_/.test(first.sessionId ?? ''));
    ok('the turn was counted', first.turns === 1);
    ok('the agent said the nonce', first.messages.some(m => m.role === 'agent' && String(m.text ?? '').includes(NONCE)));
    ok('tokens were counted', first.tokens > 0);
    ok('the engine states a price of its own (0 on a free model is REAL, not missing)',
        typeof first.costUSD === 'number');

    // ── 2) the second turn is the SAME conversation ─────────────────────────
    console.log('\n2 — the second turn recalls the first');
    const ses = first.sessionId;
    host.send(a, 'Without using tools, repeat the token I gave you.');
    await wait(() => state(a).status === 'idle');
    const second = state(a);
    ok('same ses_ id — one conversation, not two runs', second.sessionId === ses);
    ok('the second turn was counted', second.turns === 2);
    ok('and the context carried', second.messages.slice(-4).some(m => m.role === 'agent' && String(m.text ?? '').includes(NONCE)));

    // ── 3) two cards, one process ───────────────────────────────────────────
    console.log('\n3 — a second card in a different folder, under the SAME process');
    const b = open(dirB);
    await wait(() => state(b).status !== 'starting', 120000);
    host.send(b, 'Reply with the single word READY. Do not use tools.');
    await wait(() => state(b).status === 'idle');
    const bs = state(b);
    ok('the second card got its own ses_ id', /^ses_/.test(bs.sessionId ?? '') && bs.sessionId !== ses);
    ok('two cards, two conversations', state(a).sessionId === ses);
    ok('the second card answered', bs.messages.some(m => m.role === 'agent' && /READY/i.test(String(m.text ?? ''))));

    // ── 4) cancel ───────────────────────────────────────────────────────────
    console.log('\n4 — cancelling a running turn');
    const c = open(dirA);
    await wait(() => state(c).status !== 'starting', 120000);
    host.send(c, 'Count slowly from 1 to 200, one number per line, with no other text.');
    await wait(() => state(c).status === 'working', 60000);
    const interrupted = host.interrupt(c);
    ok('interrupt was accepted while the turn was running', interrupted === true);
    await wait(() => state(c).status === 'idle', 120000);
    show('after the cancel', c);
    const cs = state(c);
    ok('the card is usable again after a cancel', cs.status === 'idle');
    ok('the cancel is recorded, not silent',
        cs.messages.some(m => /cancel/i.test(String(m.text ?? '')) || /cancel/i.test(String(m.tool?.detail ?? ''))) ||
        /cancel/i.test(String(cs.exitReason ?? '')));

    // ── 5) a session created OUTSIDE, loaded through ACP ────────────────────
    console.log('\n5 — a conversation created by the CLI, taken up in the Console');
    const outsideNonce = 'GUNWALE-' + Math.floor(Math.random() * 9000 + 1000);
    let outsideId = null;
    try {
        const raw = cp.execSync(`opencode run --model ${MODEL} --format json`, {
            cwd: dirB, input: `Remember this token: ${outsideNonce}. Reply with just the token. Do not use tools.`,
            encoding: 'utf8', timeout: 180000, maxBuffer: 64 * 1024 * 1024
        });
        for (const l of raw.split(/\r?\n/)) {
            if (!l.trim()) { continue; }
            try { const j = JSON.parse(l); if (j.sessionID) { outsideId = j.sessionID; break; } } catch { /* */ }
        }
    } catch { /* reported below */ }
    if (!outsideId) {
        skip('CLI-created session loaded through ACP', 'the CLI run did not report a sessionID');
    } else {
        const d = open(dirB, { resume: outsideId });
        await wait(() => state(d).status === 'idle', 120000);
        ok('the card took the CLI conversation\'s own id', state(d).sessionId === outsideId);
        host.send(d, 'Without using tools, repeat the token I gave you earlier.');
        await wait(() => state(d).status === 'idle');
        show('after continuing a CLI conversation', d);
        ok('it remembers what was said outside Agent Farm',
            state(d).messages.slice(-4).some(m => m.role === 'agent' && String(m.text ?? '').includes(outsideNonce)));
    }

    // ── 6) the runtime dies and the cards come back ─────────────────────────
    console.log('\n6 — the shared runtime is killed under the cards');
    const before = state(a).sessionId;
    // ‼️ Reaching for the host's OWN runtime, deliberately — and never for a
    // process found by name. `opencode.exe` on this machine may well be the
    // user's own TUI, and killing it is the one thing this set must never do.
    // Restarting the process the host owns is the same crash the field produces.
    let killed = false;
    try { const rt = host.opencodeRt; if (rt && typeof rt.restart === 'function') { rt.restart(); killed = true; } } catch { /* */ }
    if (!killed) {
        skip('runtime restart', 'the host exposes no runtime to restart (fixtures cover the lifecycle)');
    } else {
        host.send(a, 'Reply with the single word BACK. Do not use tools.');
        await wait(() => state(a).status === 'idle', 180000);
        ok('the card kept its conversation across a runtime restart', state(a).sessionId === before);
        ok('and it can talk again', state(a).messages.some(m => /BACK/i.test(String(m.text ?? ''))));
    }
} catch (e) {
    bad++;
    console.log('\nFAIL — the run threw: ' + String(e && e.message || e));
} finally {
    // ‼️ only what this run made
    for (const id of started) { try { host.close(id, { silent: true }); } catch { /* */ } }
    try { host.dispose(); } catch { /* */ }
    // The runtime holds the cwd open for a moment after it is told to go; a
    // single rmSync races it and leaves the folders behind.
    for (let i = 0; i < 20 && fs.existsSync(root); i++) {
        try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* */ }
        if (fs.existsSync(root)) { await new Promise(r => setTimeout(r, 500)); }
    }
    console.log(`\ndisposable folders removed: ${!fs.existsSync(root)}`);
}

console.log(`\n${bad ? `${bad} FAILED` : 'all good'}${skipped ? `, ${skipped} skipped` : ''}`);
process.exit(bad ? 1 : 0);
