// X-536 — THE MANUAL REACHES AN AGENT WITH NOTHING BUT A SHELL.
//
// Stages a real manual into a scratch "globalStorage" and a scratch home, then
// runs the launcher exactly as an agent would — `node "$HOME/.agentfarm/af.js" …` —
// with no extension listening. The manual's reads must answer anyway (they are
// local), the shorthands must work, and a live op must say plainly that
// Agent Farm is not running instead of hanging or pretending.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const B = require(path.join(ROOT, 'out', 'core', 'bridge.js'));
const S = require(path.join(ROOT, 'out', 'core', 'manualSource.js'));
const C = require(path.join(ROOT, 'out', 'core', 'manualBuild.js'));
const ST = require(path.join(ROOT, 'out', 'core', 'manualStage.js'));
const SC = require(path.join(ROOT, 'out', 'core', 'startCard.js'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-manual-'));
const storage = path.join(tmp, 'globalStorage');
const home = path.join(tmp, 'home');
fs.mkdirSync(home, { recursive: true });

// ---------------------------------------------------------------- stage
const staged = B.stageBridgeCli(ROOT, storage, '9.9.9');
ok('stageBridgeCli stages af.js and the manual reader it requires', staged.staged
    && fs.existsSync(path.join(storage, 'bridge', 'af.js')) && fs.existsSync(path.join(storage, 'bridge', 'manualQuery.js')));
fs.unlinkSync(path.join(storage, 'bridge', 'manualQuery.js'));
ok('…and stages again when one of them went missing, same version or not',
    B.stageBridgeCli(ROOT, storage, '9.9.9').staged && fs.existsSync(path.join(storage, 'bridge', 'manualQuery.js')));

const src = S.readManualSource(path.join(ROOT, 'manual'));
const catalog = Object.keys(src.meta).map(op => ({ op, describe: `${src.meta[op].summary} args: none` }));
const manual = C.compileManual(src, catalog, '9.9.9', 1000).manual;
const bridgeDir = path.join(storage, 'bridge');
const plan = { bridgeDir, afPath: path.join(bridgeDir, 'af.js'), homeDir: home, env: {}, manual, version: '9.9.9', appName: 'Test Code' };
const r1 = ST.stageManual(plan);
ok('stageManual writes manual.json, the launcher and bridge.json', r1.problems.length === 0
    && fs.existsSync(r1.manualPath) && fs.existsSync(path.join(home, '.agentfarm', 'af.js'))
    && fs.existsSync(path.join(home, '.agentfarm', 'bridge.json')));
ok('the command is the stable launcher, quoted, forward slashes',
    r1.command === `node "${path.join(home, '.agentfarm', 'af.js').replace(/\\/g, '/')}"`);
const r2 = ST.stageManual({ ...plan, manual: { ...manual, builtAt: 2000 } });
ok('a second start with the same content writes nothing', r2.wrote.length === 0);
const r3 = ST.stageManual({ ...plan, manual: { ...manual, version: '9.9.10' } });
ok('changed content is written again', r3.wrote.includes(r1.manualPath));
ok('AGENT_FARM_HOME moves the launcher', ST.launcherDir(home, { AGENT_FARM_HOME: '/x/y' }) === '/x/y');
const bj = JSON.parse(fs.readFileSync(path.join(home, '.agentfarm', 'bridge.json'), 'utf8'));
ok('bridge.json names the staged af.js, the bridge folder and the manual', bj.af === plan.afPath && bj.bridgeDir === bridgeDir && bj.manual === r1.manualPath);

// ---------------------------------------------------------------- run it like an agent
const launcher = path.join(home, '.agentfarm', 'af.js');
const run = (...args) => {
    const r = spawnSync(process.execPath, [launcher, ...args], {
        encoding: 'utf8', timeout: 20000,
        env: { ...process.env, AGENT_FARM_BRIDGE_TIMEOUT: '600', CLAUDE_CODE_SESSION_ID: '', AGENT_FARM_SESSION: '' }
    });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
const bare = run();
ok('a bare call prints the start card with this launcher as the command',
    bare.code === 0 && /farm\.guide/.test(bare.out) && bare.out.includes(launcher.replace(/\\/g, '/')));
const map = run('farm.guide');
ok('farm.guide answers the map offline, as text', map.code === 0 && /^# Agent Farm — map for agents/m.test(map.out) && !/"ok":/.test(map.out));
const pb = run('farm.guide', 'id=recurring-task');
ok('farm.guide id=<playbook> answers offline', pb.code === 0 && /# Playbook: Run something on a schedule/.test(pb.out));
const find = run('find', 'every', 'monday', 'at', '8', 'run', 'the', 'report');
ok('`find <words>` ranks the schedule playbook first', find.code === 0 && /1\. \[playbook\] recurring-task/.test(find.out));
const help = run('help', 'tasks.add');
ok('`help <op>` answers the op contract', help.code === 0 && /# tasks\.add \[run\]/.test(help.out));
const idx = run('farm.ops');
ok('farm.ops answers the compact index offline', idx.code === 0 && /bridge ops \(\d+\), by area/.test(idx.out));
const full = run('farm.ops', 'full=true', '--raw');
ok('farm.ops full=true --raw still gives the legacy JSON envelope', full.code === 0
    && Array.isArray(JSON.parse(full.out).result));
const typo = run('farm.ops', 'op=tasks.ad');
ok('a typo is refused with did-you-mean, and recorded as a gap', typo.code === 1 && /Did you mean tasks\.add/.test(typo.out)
    && fs.readFileSync(path.join(bridgeDir, 'manual-gaps.jsonl'), 'utf8').includes('"unknown-op"'));
const weak = run('find', 'banana', 'smoothie', 'recipe');
ok('a weak search says so and is recorded', /weak matches/.test(weak.out)
    && fs.readFileSync(path.join(bridgeDir, 'manual-gaps.jsonl'), 'utf8').includes('"weak-find"'));
const brief = run('farm.brief', '--timeout', '300');
ok('farm.brief with nobody listening says Agent Farm is not running, and that the manual still answers',
    brief.code === 1 && /not running/.test(brief.out) && /farm\.guide/.test(brief.out));
const live = run('tasks.list', '--timeout', '300');
ok('any other op with nobody listening is withdrawn and says so', live.code === 1 && /unclaimed/.test(live.out));

// ---------------------------------------------------------------- the start card
const card = SC.startCardText('card', src.card, 'node "/h/.agentfarm/af.js"', '9.9.9');
ok('the card names the command, the version and the first call', card.includes('node "/h/.agentfarm/af.js" <op>')
    && card.includes('9.9.9') && card.includes('farm.guide'));
ok('line mode is one line naming farm.guide', !/\n/.test(SC.startCardText('line', src.card, 'node "x"', '1')) && /farm\.guide/.test(SC.startCardText('line', src.card, 'node "x"', '1')));
ok('off mode says nothing', SC.startCardText('off', src.card, 'node "x"', '1') === '');
ok('an unknown mode is the card', SC.normalizeStartCardMode('weird') === 'card');
const live2 = e => e === 'claude';
ok('a launch on a hooked engine with its hook live carries no card (the hook does)', SC.startCardForLaunch('claude', card, live2) === '');
ok('…on a hooked engine whose hook is not installed it carries the card', SC.startCardForLaunch('codex', card, live2) === card);
ok('…and on an engine with no hook it always does', SC.startCardForLaunch('gemini', card, live2) === card
    && SC.startCardForLaunch('opencode', card, () => true) === card);
ok('the prompt prefix fences the card and is empty for nothing', SC.startCardPrefix(card).startsWith('<agent-farm>\n')
    && SC.startCardPrefix('') === '');

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
