// X-449 — the phone reaches the farm while VS Code is closed: the headless service takes the phone's
// port (src/service/serviceRemote.ts), answers farm.ping / farm.away / farm.open and refuses the rest,
// and lets go when VS Code is back (the extension retries meanwhile). And the installed service
// actually runs: its copy is a launcher (src/core/serviceLauncher.ts) — a copied farmService.js died
// on `Cannot find module '../core/aftime'`.
'use strict';
const cp = require('child_process');
const fs = require('fs');
const https = require('https');
const net = require('net');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'out');
const L = require(path.join(OUT, 'core', 'serviceLauncher.js'));
const RL = require(path.join(OUT, 'core', 'remoteListen.js'));
const S = require(path.join(OUT, 'service', 'serviceRemote.js'));
const { requiredScope, scopeAllows } = require(path.join(OUT, 'remote', 'scopes.js'));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'af-x449-'));
const dirs = [];
const mk = () => { const d = tmp(); dirs.push(d); return d; };

console.log('\n== the installed service is a launcher that runs the build\'s own script ==');
{
    const d = mk();
    const marker = path.join(d, 'ran.txt');
    const fake = path.join(d, 'fake-service.js');
    fs.writeFileSync(fake, `require('fs').writeFileSync(${JSON.stringify(marker)}, process.argv.slice(2).join(' '));`, 'utf8');
    fs.writeFileSync(path.join(d, 'farm-service.js'), L.serviceLauncher(), 'utf8');
    fs.writeFileSync(path.join(d, 'service-config.json'), JSON.stringify({ serviceScript: fake }), 'utf8');
    cp.execFileSync(process.execPath, [path.join(d, 'farm-service.js'), '--storage', d], { stdio: 'pipe' });
    ok('‼️ the launcher runs the script service-config.json names, with the same arguments', fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === `--storage ${d}`);
    fs.writeFileSync(path.join(d, 'service-config.json'), JSON.stringify({ serviceScript: path.join(d, 'gone.js') }), 'utf8');
    let code = 0, err = '';
    try { cp.execFileSync(process.execPath, [path.join(d, 'farm-service.js'), '--storage', d], { stdio: 'pipe' }); } catch (e) { code = e.status; err = String(e.stderr); }
    ok('a script that is not there ends it with a line saying what to do', code === 1 && /start VS Code once/.test(err));
    const real = mk();
    fs.writeFileSync(path.join(real, 'farm-service.js'), L.serviceLauncher(), 'utf8');
    fs.writeFileSync(path.join(real, 'service-config.json'), JSON.stringify({ agents: [], serviceScript: path.join(OUT, 'service', 'farmService.js') }), 'utf8');
    fs.writeFileSync(path.join(real, 'live.heartbeat'), String(Date.now()), 'utf8');
    const out = cp.spawnSync(process.execPath, [path.join(real, 'farm-service.js'), '--storage', real], { timeout: 4000, encoding: 'utf8' });
    ok('‼️ the REAL service starts from an installed copy (it used to die on ../core/aftime)', /headless service up/.test(String(out.stdout) + String(out.stderr)) && !/Cannot find module/.test(String(out.stderr)));
    const inst = mk();
    const file = path.join(inst, 'farm-service.js');
    ok('repair leaves a machine with no service alone', L.repairLauncher(file) === false && !fs.existsSync(file));
    fs.writeFileSync(file, 'const aftime_1 = require("../core/aftime");', 'utf8');
    ok('‼️ an installed old copy is replaced by the launcher', L.repairLauncher(file) === true && fs.readFileSync(file, 'utf8') === L.serviceLauncher());
    ok('…and today\'s launcher is not rewritten', L.repairLauncher(file) === false);
    const ib = fs.readFileSync(path.join(ROOT, 'src', 'core', 'infraBridge.ts'), 'utf8');
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('install writes the launcher, never a copy of the script', /fs\.writeFileSync\(files\.script, serviceLauncher\(\), 'utf8'\);/.test(ib) && !/copyFileSync\(deps\.serviceSource\(\)/.test(ib));
    ok('every activation names this build\'s script for it', /serviceScript: path\.join\(context\.extensionPath, 'out', 'service', 'farmService\.js'\),/.test(ext));
    ok('…and repairs an installed old copy', /if \(repairLauncher\(serviceFiles\(infraDeps\)\.script\)\)/.test(ext));
}

console.log('\n== where the away host listens ==');
{
    const lo = { lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }] };
    const cfg = { mode: 'local', port: 7443, codeExe: 'C:/x/Code.exe' };
    ok('VS Code running: the service does not host', 'why' in S.awayTarget(cfg, true, lo));
    ok('no config written yet: does not host, says why', /remote-config\.json/.test(S.awayTarget(undefined, false, lo).why));
    ok('the phone turned off: does not host', 'why' in S.awayTarget({ ...cfg, mode: 'off' }, false, lo));
    const t = S.awayTarget(cfg, false, lo);
    ok('‼️ VS Code away, phone on: the same port the extension used', t.at && t.at.host === '127.0.0.1' && t.at.port === 7443);
    const d = mk();
    fs.writeFileSync(path.join(d, RL.REMOTE_CONFIG_FILE), JSON.stringify({ mode: 'lan', port: 9000, codeExe: 'C:/Code.exe' }), 'utf8');
    const r = S.readRemoteConfig(path.join(d, RL.REMOTE_CONFIG_FILE));
    ok('the config the extension writes is read back', r.mode === 'lan' && r.port === 9000 && r.codeExe === 'C:/Code.exe');
    fs.writeFileSync(path.join(d, RL.REMOTE_CONFIG_FILE), JSON.stringify({ mode: 'everywhere', port: 9000 }), 'utf8');
    ok('a mode it does not know is no config', S.readRemoteConfig(path.join(d, RL.REMOTE_CONFIG_FILE)) === undefined);
}

console.log('\n== the away ops ==');
{
    const d = mk();
    const exe = path.join(d, 'Code.exe');
    fs.writeFileSync(exe, '', 'utf8');
    const launched = [];
    let now = 1_000_000;
    const deps = {
        farm: () => ({ id: 'farm_1', name: 'Masaustu' }),
        config: () => ({ mode: 'lan', port: 7443, codeExe: exe }),
        lastSeen: () => 999_000,
        snapshot: () => ({ ts: 940_000, writer: 'extension', agents: [] }),
        launch: (e, env) => launched.push({ e, env }),
        now: () => now,
        log: () => { }
    };
    const opened = {};
    ok('farm.ping answers, saying it is away', S.awayCall('farm.ping', deps, opened).result.away === true);
    const a = S.awayCall('farm.away', deps, opened).result;
    ok('‼️ farm.away: away, since VS Code was last seen, the last snapshot and its age', a.away === true && a.since === 999_000 && a.snapshot.ts === 940_000 && a.age.seconds === 60 && a.age.stale === true && /VS Code is closed/.test(a.age.note));
    const refused = S.awayCall('tasks.list', deps, opened);
    ok('‼️ every other op is refused with the away sentence, naming the farm', !refused.ok && /VS Code is closed on Masaustu/.test(refused.error) && /farm\.open starts it/.test(refused.error));
    process.env.ELECTRON_RUN_AS_NODE = '1';
    process.env.VSCODE_IPC_HOOK = 'x';
    const o = S.awayCall('farm.open', deps, opened);
    ok('‼️ farm.open starts VS Code once', o.ok && o.result.opening === true && launched.length === 1 && launched[0].e === exe);
    ok('…without what would make Code.exe run as node or join a dead window', !('ELECTRON_RUN_AS_NODE' in launched[0].env) && !('VSCODE_IPC_HOOK' in launched[0].env) && Object.keys(launched[0].env).some(k => k.toUpperCase() === 'PATH'));
    delete process.env.ELECTRON_RUN_AS_NODE; delete process.env.VSCODE_IPC_HOOK;
    now += 10_000;
    const again = S.awayCall('farm.open', deps, opened);
    ok('a second tap while it starts is answered, not launched twice', again.ok && again.result.again === true && launched.length === 1);
    ok('farm.away says when it was asked to open', S.awayCall('farm.away', deps, opened).result.openedAt === 1_000_000);
    now += S.OPEN_AGAIN_MS;
    S.awayCall('farm.open', deps, opened);
    ok('after the window a new tap launches again', launched.length === 2);
    const noExe = S.awayCall('farm.open', { ...deps, config: () => ({ mode: 'lan', port: 1, codeExe: '' }) }, {});
    ok('no executable known: refused, saying so', !noExe.ok && /cannot be started from here/.test(noExe.error));
    const goneExe = S.awayCall('farm.open', { ...deps, config: () => ({ mode: 'lan', port: 1, codeExe: path.join(d, 'nope.exe') }) }, {});
    ok('an executable that moved: refused by name', !goneExe.ok && /is not there any more/.test(goneExe.error));
    ok('no snapshot yet: farm.away still answers', S.awayCall('farm.away', { ...deps, snapshot: () => undefined }, {}).result.snapshot === null);
}

console.log('\n== scopes ==');
{
    ok('farm.away is a look a phone makes at read', requiredScope('farm.away') === 'read' && scopeAllows('read', 'farm.away'));
    ok('‼️ farm.open needs manage (the phone\'s own default), not admin', requiredScope('farm.open') === 'manage' && scopeAllows('manage', 'farm.open') && !scopeAllows('answer', 'farm.open'));
    ok('the rest of farm stays admin', requiredScope('farm.restartExtensionHost') === 'admin');
}

console.log('\n== the extension retries while the service lets go ==');
{
    ok('a taken port is asked for again, quietly, a few times', RL.retryPort('port 7443 is already in use - pick another agentFarm.remote.port', 0)
        && RL.retryPort('port 7443 is already in use', RL.PORT_RETRIES - 1) && !RL.retryPort('port 7443 is already in use', RL.PORT_RETRIES));
    ok('another failure is not retried', !RL.retryPort('address 10.0.0.5 is not on this machine any more', 0) && !RL.retryPort(undefined, 0));
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('‼️ applyRemote writes the service its mode, port and VS Code\'s own executable',
        /fs\.writeFileSync\(path\.join\(context\.globalStorageUri\.fsPath, REMOTE_CONFIG_FILE\), JSON\.stringify\(\{ mode: c\.mode, port: c\.port, codeExe: process\.execPath \}\), 'utf8'\);/.test(ext));
    ok('…retries on a held port and warns only after the last try',
        /const held = taskRunner && plan\.listen && !st\.listening && retryPort\(st\.reason, attempt\);\s*if \(held\) \{ remoteRetry = setTimeout\(\(\) => \{ void applyRemote\(warn, attempt \+ 1\); \}, PORT_RETRY_MS\); \}\s*if \(warn && !held && taskRunner/.test(ext));
    ok('the snapshot is kept while the phone host is on, not only for the web view', /if \(!w\.enabled && cfg\(\)\.get<string>\('remote\.listen', 'off'\) === 'off'\) \{ return; \}/.test(ext));
    const svc = fs.readFileSync(path.join(ROOT, 'src', 'service', 'farmService.ts'), 'utf8');
    ok('‼️ the service syncs the phone host on every tick', /function tick\(\): void \{\s*syncWebServer\(\);\s*void phoneHost\.sync\(vscodeAlive\(\)\);/.test(svc));
}

const freePort = () => new Promise(resolve => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const health = port => new Promise(resolve => {
    https.get({ host: '127.0.0.1', port, path: '/health', rejectUnauthorized: false, agent: false }, res => {
        let s = ''; res.on('data', c => { s += c; }); res.on('end', () => { try { resolve(JSON.parse(s)); } catch { resolve({ raw: s }); } });
    }).on('error', e => resolve({ error: e.code }));
});

(async () => {
    console.log('\n== the real host: taken while VS Code is away, given back when it returns ==');
    const d = mk();
    const port = await freePort();
    fs.writeFileSync(path.join(d, RL.REMOTE_CONFIG_FILE), JSON.stringify({ mode: 'local', port, codeExe: '' }), 'utf8');
    const logs = [];
    const host = S.serviceRemoteFor(d, path.join(d, 'live.heartbeat'), path.join(d, 'web-snapshot.json'), l => logs.push(l));
    await host.sync(true);
    ok('VS Code alive: nothing listens', !host.listening && (await health(port)).error);
    await host.sync(false);
    const h = await health(port);
    ok('‼️ VS Code away: the service answers on the phone\'s port, as the same kind of host', host.listening && !h.error && logs.some(l => /hosts the phone on 127\.0\.0\.1:/.test(l)));
    ok('…from the farm\'s own remote folder (certificate and devices shared with the extension)', fs.existsSync(path.join(d, 'remote')));
    await host.sync(false);
    ok('a second tick keeps the one host', host.listening && logs.filter(l => /hosts the phone/.test(l)).length === 1);
    await host.sync(true);
    ok('‼️ VS Code back: the port is handed back', !host.listening && (await health(port)).error && logs.some(l => /handed back to VS Code/.test(l)));

    console.log('\n== the away port as the server sees it ==');
    let seen;
    const fakeHost = new S.ServiceRemote({ storageDir: d, heartbeatFile: path.join(d, 'hb'), snapshotFile: path.join(d, 'none.json'), resourceDir: d, log: () => { },
        start: async (p, at) => { seen = { p, at }; return { stop: async () => { } }; }, farm: () => ({ id: 'f', name: 'Ev' }) });
    await fakeHost.sync(false);
    const p = seen.p;
    ok('it serves from <storage>/remote', p.storageDir() === path.join(d, 'remote'));
    ok('a phone may connect (remote.access) and is told control waits for VS Code', p.can('remote.access').allowed && !p.can('remote.control').allowed && /VS Code is closed/.test(p.can('remote.control').reason));
    ok('no events while away', typeof p.subscribe(() => { }) === 'function');
    ok('calls go to the away ops', (await p.callOp('farm.ping', {}, { device: 'd', scope: 'manage' })).ok && !(await p.callOp('console.send', {}, { device: 'd', scope: 'manage' })).ok);
    const starts = [], stops = [];
    const moving = new S.ServiceRemote({ storageDir: d, heartbeatFile: 'x', snapshotFile: 'x', resourceDir: d, log: () => { },
        start: async (pp, at) => { starts.push(at.port); return { stop: async () => { stops.push(at.port); } }; }, farm: () => ({ id: 'f', name: 'Ev' }) });
    await moving.sync(false);
    fs.writeFileSync(path.join(d, RL.REMOTE_CONFIG_FILE), JSON.stringify({ mode: 'local', port: port + 1, codeExe: '' }), 'utf8');
    await moving.sync(false);
    ok('‼️ a new port (or address) while away: the old host stops and one starts where the settings now say',
        starts.join() === `${port},${port + 1}` && stops.join() === `${port}` && moving.listening);
    const failing = new S.ServiceRemote({ storageDir: d, heartbeatFile: 'x', snapshotFile: 'x', resourceDir: d, log: l => logs.push(l),
        start: async () => { throw new Error('EADDRINUSE'); }, farm: () => ({ id: 'f', name: 'Ev' }) });
    const before = logs.length;
    await failing.sync(false); await failing.sync(false);
    ok('a host that cannot start says so once, not every tick', logs.length === before + 1 && /could not host the phone/.test(logs[logs.length - 1]));

    for (const x of dirs) { try { fs.rmSync(x, { recursive: true, force: true }); } catch { /* best effort */ } }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
