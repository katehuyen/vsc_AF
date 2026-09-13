// X-295 — Codex's hook trust, reproduced: the hash Codex computes, the key it
// looks for, the ledger in config.toml, and the projection that signs a
// directory for itself. The seven hashes are what `codex app-server` →
// `hooks/list` reported on the real machine (codex-cli 0.149.0, 2026-09-13)
// for the user's own hooks.json; a drift in Codex's identity shape fails here
// before it fails on a slot nobody can hear.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('  FAIL ' + name); } };

const ch = require(path.join(ROOT, 'out/core/codexHooks.js'));
const sc = require(path.join(ROOT, 'out/core/slotCompleteness.js'));
const ss = require(path.join(ROOT, 'out/core/slotSettings.js'));
const { adapterFor, ENGINE_AUTH_ADAPTERS } = require(path.join(ROOT, 'out/core/engineAccounts.js'));

const CMD = 'curl.exe -s -m 3 -X POST "http://127.0.0.1:8377/event?src=agentfarm-live" -H "Content-Type: application/json" --data-binary \'@-\' ; exit 0';
const group = (matcher) => Object.assign({}, matcher !== undefined ? { matcher } : {}, { hooks: [{ type: 'command', command: CMD }] });
const HOOKS = {
    hooks: {
        PreToolUse: [group('*')], PostToolUse: [group('*')], PreCompact: [group()], SessionStart: [group()],
        UserPromptSubmit: [group()], SubagentStop: [group()], Stop: [group()]
    }
};
// ‼️ measured, not derived: the engine's own answers for the file above
const MEASURED = {
    pre_tool_use: 'sha256:8b59d0558ac0830e6775d1b7436913760861b9eb5887b2ef5b9a2758e575cb2c',
    post_tool_use: 'sha256:7dea2b5474c4264027a13c884d4582283178b9483fb42440a2073bb87d3065fe',
    pre_compact: 'sha256:68fd4aeb915cd64dd1e9873f937db1ee49c0750618427c3ecd831e61ee3888bd',
    session_start: 'sha256:4a4d7275c7da82475ca26252315d6a60d533068fcee28f174b1734e2e2e010eb',
    user_prompt_submit: 'sha256:d45fc214d19d77731c4c8891225f05743414e3c27fb9b34e0fad2e4ac2914e59',
    subagent_stop: 'sha256:c518a7be00423cbe554ff78f5f397cc77a9bb6e2beb82d020c521fc7e30cc714',
    stop: 'sha256:b5024ea0cd8daaf361d426f4ea387267679f5c1e7ac081c4044ccbd8d4f665f4'
};
const HOOKS_PATH = 'D:\\zone\\agent\\_run_folder_move\\codex\\hooks.json';

// ---------- 1. the hash is Codex's hash ----------
{
    const entries = ch.codexHookEntries(JSON.stringify(HOOKS), HOOKS_PATH, true);
    ok('seven command hooks → seven entries', entries.length === 7);
    for (const [ev, hash] of Object.entries(MEASURED)) {
        const e = entries.find(x => x.event === ev);
        ok('‼️ X-295: ' + ev + ' hashes exactly what codex app-server reported', e && e.hash === hash);
        ok(ev + ' is keyed by the resolved path, the label, group 0, handler 0', e && e.key === HOOKS_PATH + ':' + ev + ':0:0');
    }
    ok('the same command under two events is two hashes (the identity carries the event, not only the command)',
        MEASURED.pre_tool_use !== MEASURED.post_tool_use && MEASURED.stop !== MEASURED.session_start);
    ok('‼️ the path is NOT in the hash — a slot keyed elsewhere trusts the same value',
        ch.codexHookEntries(JSON.stringify(HOOKS), 'C:\\elsewhere\\hooks.json', true)[0].hash === entries[0].hash);
    // Codex's own normalization, pinned so a wrong guess cannot come back
    ok('stop drops its matcher whatever the file says',
        ch.codexHookHash('stop', '*', { command: 'x' }, true) === ch.codexHookHash('stop', undefined, { command: 'x' }, true));
    ok('pre_tool_use keeps its matcher',
        ch.codexHookHash('pre_tool_use', '*', { command: 'x' }, true) !== ch.codexHookHash('pre_tool_use', undefined, { command: 'x' }, true));
    ok('the default timeout (600) is part of the identity, so an explicit 600 hashes the same',
        ch.codexHookHash('stop', undefined, { command: 'x' }, true) === ch.codexHookHash('stop', undefined, { command: 'x', timeout: 600 }, true));
    ok('…and a different timeout is a different hook',
        ch.codexHookHash('stop', undefined, { command: 'x' }, true) !== ch.codexHookHash('stop', undefined, { command: 'x', timeout: 5 }, true));
    ok('session_end clamps its timeout to 1..3',
        ch.codexHookHash('session_end', undefined, { command: 'x', timeout: 60 }, true) === ch.codexHookHash('session_end', undefined, { command: 'x', timeout: 3 }, true));
    ok('additionalContextLimit at the default (2500) is dropped from the identity',
        ch.codexHookHash('pre_tool_use', undefined, { command: 'x', additionalContextLimit: 2500 }, true) === ch.codexHookHash('pre_tool_use', undefined, { command: 'x' }, true));
    ok('…and is ignored on an event that cannot emit context',
        ch.codexHookHash('stop', undefined, { command: 'x', additionalContextLimit: 10 }, true) === ch.codexHookHash('stop', undefined, { command: 'x' }, true));
    ok('commandWindows wins on Windows and is folded into `command`',
        ch.codexHookHash('stop', undefined, { command: 'a', commandWindows: 'b' }, true) === ch.codexHookHash('stop', undefined, { command: 'b' }, true));
    // indexes count what Codex counts
    const mixed = { hooks: { Stop: [{ hooks: [{ type: 'prompt' }, { type: 'command', command: '' }, { type: 'command', command: 'c' }] }, group()] } };
    const me = ch.codexHookEntries(JSON.stringify(mixed), 'p', true);
    ok('non-command and empty handlers are skipped but still numbered', me.length === 2 && me[0].key === 'p:stop:0:2' && me[1].key === 'p:stop:1:0');
    ok('an unparseable file names no hooks', ch.codexHookEntries('{', 'p').length === 0);
    ok('the live port is read off the command', ch.codexHookPort(CMD) === 8377 && ch.codexHookPort('echo hi') === undefined);
}

// ---------- 2. the ledger and the upsert ----------
{
    const toml = '[model]\nname = "gpt-5"\n\n[hooks.state]\n\n[hooks.state.\'C:\\Users\\x\\.codex\\hooks.json:stop:0:0\']\ntrusted_hash = "sha256:old"\n\n[mcp_servers.a]\nurl = "u"\n';
    const led = ch.codexTrustLedger(toml);
    ok('ledger reads the single-quoted key verbatim', led.get('C:\\Users\\x\\.codex\\hooks.json:stop:0:0') === 'sha256:old');
    ok('ledger reads a double-quoted, escaped key', ch.codexTrustLedger('[hooks.state."C:\\\\a\\"b:stop:0:0"]\ntrusted_hash = "sha256:q"\n').get('C:\\a"b:stop:0:0') === 'sha256:q');
    const up = ch.upsertCodexTrust(toml, [
        { key: 'C:\\Users\\x\\.codex\\hooks.json:stop:0:0', hash: 'sha256:new' },
        { key: 'D:\\slot\\hooks.json:stop:0:0', hash: 'sha256:s' }
    ]);
    ok('an existing block is put right IN PLACE', up.indexOf('trusted_hash = "sha256:new"') < up.indexOf('[mcp_servers.a]') && !up.includes('sha256:old'));
    ok('a new block is appended after the last line', up.endsWith('[mcp_servers.a]\nurl = "u"\n\n[hooks.state.\'D:\\slot\\hooks.json:stop:0:0\']\ntrusted_hash = "sha256:s"\n'));
    ok('nothing else changed a byte', up.startsWith('[model]\nname = "gpt-5"\n\n[hooks.state]\n\n'));
    ok('idempotent: a second upsert of the same entries is the same text', ch.upsertCodexTrust(up, [{ key: 'D:\\slot\\hooks.json:stop:0:0', hash: 'sha256:s' }]) === up);
    ok('‼️ a key with a quote in it is double-quoted and escaped, and reads back',
        ch.codexTrustLedger(ch.upsertCodexTrust('', [{ key: 'D:\\it\'s\\hooks.json:stop:0:0', hash: 'sha256:z' }])).get('D:\\it\'s\\hooks.json:stop:0:0') === 'sha256:z');
    const crlf = ch.upsertCodexTrust('[a]\r\nb = 1\r\n', [{ key: 'k', hash: 'sha256:1' }]);
    ok('CRLF is kept', crlf === '[a]\r\nb = 1\r\n\r\n[hooks.state.\'k\']\r\ntrusted_hash = "sha256:1"\r\n');
    ok('an empty file gets only the block', ch.upsertCodexTrust('', [{ key: 'k', hash: 'sha256:1' }]) === '[hooks.state.\'k\']\ntrusted_hash = "sha256:1"\n');
    ok('a file without a trailing newline gets one', ch.upsertCodexTrust('[a]\nb = 1', [{ key: 'k', hash: 'sha256:1' }]) === '[a]\nb = 1\n\n[hooks.state.\'k\']\ntrusted_hash = "sha256:1"\n');
    ok('no entries → the same text, byte for byte', ch.upsertCodexTrust(toml, []) === toml);
}

// ---------- 3. the projection: the fleet's text, signed for the directory, keeping the directory's own answers ----------
{
    const fleet = '[model]\nname = "m"\n\n[hooks.state.\'' + HOOKS_PATH + ':stop:0:0\']\ntrusted_hash = "' + MEASURED.stop + '"\n';
    const slotPath = 'D:\\slots\\codex-a\\hooks.json';
    const p1 = ch.codexTrustProjection(fleet, undefined, JSON.stringify(HOOKS), slotPath, true);
    const l1 = ch.codexTrustLedger(p1);
    ok('projection keeps the fleet\'s own record', l1.get(HOOKS_PATH + ':stop:0:0') === MEASURED.stop);
    ok('…and adds one per hook under the slot\'s path', Object.keys(MEASURED).every(ev => l1.get(slotPath + ':' + ev + ':0:0') === MEASURED[ev]));
    ok('the fleet\'s bytes are the base', p1.startsWith('[model]\nname = "m"\n'));
    // the slot trusted a project hook at the TUI: an answer, kept (X-291's rule)
    const have = p1 + '\n[hooks.state.\'D:\\proj\\.codex\\hooks.json:stop:0:0\']\ntrusted_hash = "sha256:proj"\n';
    const p2 = ch.codexTrustProjection(fleet, have, JSON.stringify(HOOKS), slotPath, true);
    ok('‼️ what the directory trusted on its own survives the projection', ch.codexTrustLedger(p2).get('D:\\proj\\.codex\\hooks.json:stop:0:0') === 'sha256:proj');
    ok('projection is idempotent against its own output', ch.codexTrustProjection(fleet, p2, JSON.stringify(HOOKS), slotPath, true) === p2);
    // the hook changed: the slot's old record for its OWN path is replaced, not kept beside
    const stale = p1.replace(MEASURED.stop + '"\n', 'sha256:stale"\n');
    const p3 = ch.codexTrustProjection(fleet, stale, JSON.stringify(HOOKS), slotPath, true);
    ok('a stale hash under the slot\'s own key is replaced', ch.codexTrustLedger(p3).get(slotPath + ':stop:0:0') === MEASURED.stop && !p3.includes('sha256:stale'));
    ok('no hooks.json → the fleet\'s text unchanged', ch.codexTrustProjection(fleet, undefined, undefined, slotPath) === fleet);
}

// ---------- 4. the adapter: the clause exists, reads honestly, repairs by the same primitive ----------
{
    const codex = adapterFor('codex');
    const ids = sc.slotClauses(codex).map(c => c.id);
    ok('‼️ X-295: Codex has a hooks clause — its wire is asked about, not assumed', ids.includes('hooks'));
    ok('…derived from liveWire, and last (after the carry that renders what it signs)', !!codex.liveWire && ids[ids.length - 1] === 'hooks');
    ok('…and config.toml is projected, not carried verbatim', !!(codex.carryProject && codex.carryProject['config.toml']) && !ss.carryMerges(codex, 'config.toml'));
    ok('the fleet\'s own Codex wire is this module\'s to sign', codex.liveWire.fleet === true);
    ok('Claude keeps its hooks clause, from its own liveWire', sc.slotClauses(adapterFor('claude')).map(c => c.id).includes('hooks') && !!adapterFor('claude').liveWire && !adapterFor('claude').liveWire.fleet);
    for (const a of ENGINE_AUTH_ADAPTERS) {
        ok(a.engine + ': a hooks clause exactly when the adapter declares a wire',
            sc.slotClauses(a).some(c => c.id === 'hooks') === !!a.liveWire);
    }
    ok('‼️ the engine-agnostic layers name no engine file', !/settings\.json|config\.toml|hooks\.json/.test(
        fs.readFileSync(path.join(ROOT, 'src/core/slotCompleteness.ts'), 'utf8').split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')));

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-codexw-'));
    try {
        const home = path.join(tmp, 'home');
        const live = path.join(home, '.codex');
        fs.mkdirSync(live, { recursive: true });
        for (const n of codex.sharedPaths) { fs.mkdirSync(path.join(live, n), { recursive: true }); }
        fs.writeFileSync(path.join(live, 'hooks.json'), JSON.stringify(HOOKS, null, 2), 'utf8');
        fs.writeFileSync(path.join(live, 'config.toml'), '[model]\nname = "m"\n', 'utf8');
        const slot = path.join(tmp, 'accounts', 'codex-test');
        fs.mkdirSync(slot, { recursive: true });
        fs.writeFileSync(path.join(slot, 'auth.json'), '{}', 'utf8');
        const repairLinks = () => ({ linked: codex.sharedPaths.map(n => { const to = path.join(slot, n); try { fs.symlinkSync(path.join(live, n), to, 'junction'); } catch { /* there */ } return to; }), failed: [] });
        const ctx = { fs, home, dir: slot, slotId: 'codex-test', engine: 'codex', hooksPort: 8377, repairLinks };
        const before = sc.slotCompleteness(ctx);
        ok('fresh slot: the wire is a gap', before.gaps.includes('hooks') && /missing/.test(before.rows.find(r => r.id === 'hooks').detail));
        ok('fresh slot: config.toml is a gap', before.gaps.includes('carry:config.toml'));
        const after = sc.completeSlot(ctx, false);
        const realSlot = fs.realpathSync.native(slot);
        const led = ch.codexTrustLedger(fs.readFileSync(path.join(slot, 'config.toml'), 'utf8'));
        ok('‼️ repair: config.toml is the fleet\'s text signed for the slot\'s RESOLVED path',
            fs.readFileSync(path.join(slot, 'config.toml'), 'utf8').startsWith('[model]\nname = "m"\n')
            && Object.keys(MEASURED).every(ev => led.get(path.join(realSlot, 'hooks.json') + ':' + ev + ':0:0') === MEASURED[ev]));
        ok('repair: hooks.json carried', fs.readFileSync(path.join(slot, 'hooks.json'), 'utf8') === JSON.stringify(HOOKS, null, 2));
        const links = after.rows.filter(r => r.kind === 'link').every(r => r.ok);
        if (links) {
            ok('repair: the slot is complete afterwards', after.complete === true && after.gaps.join(',') === '');
        } else {
            ok('repair: everything but the links (junctions unavailable here) is right', after.gaps.every(g => g.startsWith('link:')));
        }
        ok('the wire reads live, with the count and the port', /7 hooks trusted.*:8377/.test(after.rows.find(r => r.id === 'hooks').detail));
        ok('carry:config.toml says it is signed', /signed for this directory/.test(after.rows.find(r => r.id === 'carry:config.toml').detail));
        const again = sc.completeSlot(ctx, false);
        ok('idempotent: a second pass writes nothing', again.rows.every(r => !r.wrote));
        // a wire on the wrong port is reported and NOT rewritten
        const other = sc.slotCompleteness({ ...ctx, hooksPort: 9999 });
        const row = other.rows.find(r => r.id === 'hooks');
        ok('‼️ a wire on another port is a gap that names both ports', !row.ok && /:8377/.test(row.detail) && /:9999/.test(row.detail));
        sc.completeSlot({ ...ctx, hooksPort: 9999 }, false);
        ok('…and hooks.json is the user\'s: not rewritten to the live port', fs.readFileSync(path.join(slot, 'hooks.json'), 'utf8') === JSON.stringify(HOOKS, null, 2));
        // the fleet's own directory signed by the same read/repair
        const dctx = { fs, home, dir: live, realDir: fs.realpathSync.native(live), hooksPort: 8377 };
        ok('directory: unsigned before', !codex.liveWire.read(dctx).ok);
        ok('directory: repair writes', codex.liveWire.repair(dctx, false).wrote === true);
        ok('directory: signed after, under the resolved path', codex.liveWire.read(dctx).ok
            && ch.codexTrustLedger(fs.readFileSync(path.join(live, 'config.toml'), 'utf8')).get(path.join(fs.realpathSync.native(live), 'hooks.json') + ':stop:0:0') === MEASURED.stop);
        ok('directory: the model line survived', fs.readFileSync(path.join(live, 'config.toml'), 'utf8').startsWith('[model]\nname = "m"\n'));
        ok('directory: repair is idempotent', codex.liveWire.repair(dctx, false).wrote === false);
        // no hooks.json anywhere: nothing to trust, not a gap
        const bare = path.join(tmp, 'home2');
        fs.mkdirSync(path.join(bare, '.codex'), { recursive: true });
        const bctx = { fs, home: bare, dir: path.join(bare, '.codex'), realDir: path.join(bare, '.codex'), hooksPort: 8377 };
        ok('no hooks.json on either side reads ok and says so', codex.liveWire.read(bctx).ok && /no live wire/.test(codex.liveWire.read(bctx).detail));
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

// ---------- 6. X-298 — the fleet writes the file, not only its trust ----------
{
    const CUR = ch.codexHookCommand(8377, true);
    ok('the Windows spelling names curl.exe and forces the exit code',
        /^curl\.exe /.test(CUR) && / ; exit 0$/.test(CUR) && CUR.includes(':8377/event?src=agentfarm-live'));
    ok('the posix spelling is the other one', /^curl /.test(ch.codexHookCommand(8377, false))
        && ch.codexHookCommand(8377, false).includes('|| cd .'));
    ok('‼️ X-265: the command the fleet writes carries the two-number timeout, not -m 3',
        CUR.includes('--connect-timeout 2 -m 15') && !CUR.includes('-m 3 '));

    const fresh = ch.upsertCodexHooks('', CUR);
    const parsed = JSON.parse(fresh);
    ok('an empty file becomes every fleet event', ch.CODEX_FLEET_EVENTS.every(e => Array.isArray(parsed.hooks[e])));
    ok('…and reads back as current', ch.codexHooksCurrent(fresh, CUR));
    ok('only the two tool events carry a matcher',
        parsed.hooks.PreToolUse[0].matcher === '*' && parsed.hooks.PostToolUse[0].matcher === '*'
        && parsed.hooks.Stop[0].matcher === undefined && parsed.hooks.SessionStart[0].matcher === undefined);
    ok('a different port is not current', !ch.codexHooksCurrent(fresh, ch.codexHookCommand(9000, true)));
    ok('a file missing one event is not current',
        !ch.codexHooksCurrent(JSON.stringify({ hooks: Object.fromEntries(
            Object.entries(parsed.hooks).filter(([k]) => k !== 'Stop')) }), CUR));

    // ‼️ the user's own hooks are never read and never moved
    const mine = { type: 'command', command: 'echo not-ours' };
    const withForeign = JSON.stringify({
        hooks: { Stop: [{ hooks: [mine] }], PreCompact: [{ hooks: [mine] }] }, other: { kept: true }
    });
    const merged = JSON.parse(ch.upsertCodexHooks(withForeign, CUR));
    ok('a foreign group keeps its place at the head of the list',
        merged.hooks.Stop[0].hooks[0].command === 'echo not-ours' && merged.hooks.Stop.length === 2);
    ok('…and ours is appended beside it', merged.hooks.Stop[1].hooks[0].command === CUR);
    ok('a key that is not hooks survives', merged.other.kept === true);

    // the user's hand-written wire is RE-POINTED, never duplicated
    const handWritten = JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command',
        command: 'curl.exe -s -m 3 -X POST "http://127.0.0.1:8377/event?src=agentfarm-live" -H "h" --data-binary \'@-\' ; exit 0' }] }] } });
    const repointed = JSON.parse(ch.upsertCodexHooks(handWritten, ch.codexHookCommand(9000, true)));
    ok('‼️ a stale hook of ours is replaced in place, not doubled', repointed.hooks.Stop.length === 1
        && repointed.hooks.Stop[0].hooks[0].command === ch.codexHookCommand(9000, true));

    ok('text that will not parse is handed back byte for byte and refused',
        ch.upsertCodexHooks('{not json', CUR) === '{not json' && !ch.codexHooksReadable('{not json'));
    ok('an empty file is readable', ch.codexHooksReadable(''));
}

// ---------- 7. X-298 — the fleet directory writes its own wire ----------
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-x298-'));
    try {
        const codex = adapterFor('codex');
        const home = path.join(tmp, 'home');
        const live = path.join(home, '.codex');
        fs.mkdirSync(live, { recursive: true });
        const real = fs.realpathSync.native(live);
        const ctxAt = (port, fleet) => ({ fs, home, dir: live, realDir: real, hooksPort: port, fleet });
        const hooksFile = path.join(live, 'hooks.json');

        const f1 = ctxAt(8377, true);
        const before = codex.liveWire.read(f1);
        ok('fleet: a directory with no hooks.json is a GAP, not "no wire on this machine"',
            !before.ok && /has not written Codex a live wire/.test(before.detail));
        ok('fleet: dry run writes nothing but says it would',
            codex.liveWire.repair(f1, true).wrote === true && !fs.existsSync(hooksFile));
        ok('fleet: repair writes the file', codex.liveWire.repair(f1, false).wrote === true && fs.existsSync(hooksFile));
        ok('fleet: …and the wire it wrote is read back as live', codex.liveWire.read(f1).ok);
        ok('fleet: every fleet event is trusted under the resolved path', (() => {
            const ledger = ch.codexTrustLedger(fs.readFileSync(path.join(live, 'config.toml'), 'utf8'));
            const entries = ch.codexHookEntries(fs.readFileSync(hooksFile, 'utf8'), path.join(real, 'hooks.json'));
            return entries.length === ch.CODEX_FLEET_EVENTS.length && entries.every(e => ledger.get(e.key) === e.hash);
        })());
        ok('fleet: repair is idempotent', codex.liveWire.repair(f1, false).wrote === false);

        // ‼️ the port moving is now repaired, not merely reported
        const f2 = ctxAt(9000, true);
        const moved = codex.liveWire.read(f2);
        ok('‼️ X-298: a moved live port fails the fleet read', !moved.ok && /does not post every fleet event to :9000/.test(moved.detail));
        ok('…and the repair re-points the file and re-signs it',
            codex.liveWire.repair(f2, false).wrote === true && codex.liveWire.read(f2).ok);
        ok('…without leaving a second group behind',
            JSON.parse(fs.readFileSync(hooksFile, 'utf8')).hooks.Stop.length === 1);

        // a SLOT is never written here — it holds the fleet's bytes by carry
        const slot = path.join(tmp, 'slot');
        fs.mkdirSync(slot, { recursive: true });
        const sctx = { fs, home, dir: slot, realDir: fs.realpathSync.native(slot), hooksPort: 9000 };
        codex.liveWire.repair(sctx, false);
        ok('‼️ a slot never grows a hooks.json of its own', !fs.existsSync(path.join(slot, 'hooks.json')));

        // an unreadable file stops the writer rather than clobbering it
        fs.writeFileSync(hooksFile, '{ broken', 'utf8');
        const broke = codex.liveWire.read(f2);
        ok('fleet: a hooks.json that will not parse is named, not overwritten',
            !broke.ok && /not valid JSON/.test(broke.detail)
            && codex.liveWire.repair(f2, false).error !== undefined
            && fs.readFileSync(hooksFile, 'utf8') === '{ broken');
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

console.log(`test_codex_hooks: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
