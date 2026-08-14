// ‼️ K-22 — "BYPASS" ON THE CARD HAS TO MEAN BYPASS IN THE PROCESS.
//
// The user's decision is a contract, not a preference: a Console session whose
// permission control says bypassPermissions — chosen outright, or Default
// resolving to it through Claude's own settings — must never open a permission
// window. It was not being kept, and the reason was one flag standing in for
// another: S-18 added `--allow-dangerously-skip-permissions`, which PERMITS
// bypass to be chosen later and does not APPLY it. Measured on the reported
// session (1963cc5a, Claude 2.1.232): settings, the first native user event and
// the Console state all said bypassPermissions, while the process argv held
// only `--permission-prompt-tool stdio --allow-dangerously-skip-permissions`,
// and ordinary Bridge Bash calls went on producing `can_use_tool`.
//
// These checks drive the real resolver, the real argument builder and the real
// reducer — not a grep for a flag name.
'use strict';
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    BYPASS, bypassVerdict, permissionFlags, permissionLayerPaths, resolveEffectivePermission
} = require(path.join(ROOT, 'out/core/permissionmode.js'));
const { hostArgs, newSessionState, reduceEvent } = require(path.join(ROOT, 'out/core/consoleproto.js'));

const layer = (id, file, json) => ({ id, file, text: json === undefined ? undefined : JSON.stringify(json) });
const MANAGED = 'C:\\ProgramData\\ClaudeCode\\managed-settings.json';
const USER = 'C:\\Users\\x\\.claude\\settings.json';
const PROJECT = 'D:\\repo\\.claude\\settings.json';
const LOCAL = 'D:\\repo\\.claude\\settings.local.json';

// ---------------------------------------------------------------------------
// 1. what the session will REALLY run in
// ---------------------------------------------------------------------------
{
    const none = resolveEffectivePermission('', [layer('user', USER, {})]);
    ok('Default with nothing configured stays Default', none.effective === '' && !none.bypass);
    ok('…and its flags only PERMIT bypass, never apply it',
        permissionFlags(none).launch.join(' ') === '--allow-dangerously-skip-permissions'
        && permissionFlags(none).mode.length === 0);

    const chosen = resolveEffectivePermission(BYPASS, [layer('user', USER, {})]);
    ok('‼️ K-22: bypass chosen in the launcher IS enforced',
        chosen.bypass === true && chosen.effective === BYPASS);
    ok('‼️ …with the flag that actually applies it, and no --permission-mode beside it',
        permissionFlags(chosen).launch.join(' ') === '--dangerously-skip-permissions'
        && permissionFlags(chosen).mode.length === 0);

    // the reported shape: the launcher says Default and Claude's own settings
    // resolve that to bypass. It is still bypass, and it is still enforced.
    const inherited = resolveEffectivePermission('', [
        layer('managed', MANAGED, undefined),
        layer('user', USER, { permissions: { defaultMode: BYPASS } })
    ]);
    ok('‼️ K-22: Default that RESOLVES to bypass is real bypass',
        inherited.bypass === true && inherited.effective === BYPASS);
    ok('…and it says where that came from', inherited.settingsFile === USER
        && /Default resolves to bypassPermissions/.test(inherited.why));
    ok('…enforced with the same flag as an explicit choice',
        permissionFlags(inherited).launch.join(' ') === '--dangerously-skip-permissions');

    // precedence: the nearer layer wins, in Claude's own order
    const layered = resolveEffectivePermission('', [
        layer('managed', MANAGED, undefined),
        layer('local', LOCAL, { permissions: { defaultMode: 'plan' } }),
        layer('project', PROJECT, { permissions: { defaultMode: BYPASS } }),
        layer('user', USER, { permissions: { defaultMode: BYPASS } })
    ]);
    ok('the nearest layer that states a mode wins',
        layered.effective === 'plan' && layered.settingsFile === LOCAL && !layered.bypass);

    const asked = resolveEffectivePermission('plan', [
        layer('user', USER, { permissions: { defaultMode: BYPASS } })
    ]);
    ok('an explicit choice beats the settings, because it becomes a flag',
        asked.effective === 'plan' && !asked.bypass);
    ok('…and is passed as --permission-mode, as it always was',
        permissionFlags(asked).mode.join(' ') === '--permission-mode plan');

    // ‼️ policy: bypass wanted, bypass forbidden → the session is NOT started.
    //
    // The key and its PATH are read out of the installed CLI, not out of
    // documentation: `n.permissions?.disableBypassPermissionsMode === "disable"`
    // over the MERGED settings. So it is nested under `permissions`, and it
    // counts from whichever layer states it.
    const blocked = resolveEffectivePermission(BYPASS, [
        layer('managed', MANAGED, { permissions: { disableBypassPermissionsMode: 'disable' } }),
        layer('user', USER, {})
    ]);
    ok('‼️ K-22: a policy that forbids bypass blocks it',
        blocked.blocked !== undefined && blocked.bypass === false);
    ok('…and names the file, so it is something a person can act on',
        blocked.blocked.file === MANAGED && /disableBypassPermissionsMode/.test(blocked.blocked.why));

    const projectPolicy = resolveEffectivePermission(BYPASS, [
        layer('managed', MANAGED, undefined),
        layer('project', PROJECT, { permissions: { disableBypassPermissionsMode: 'disable' } }),
        layer('user', USER, {})
    ]);
    ok('‼️ …from a non-managed layer too, because that is what the CLI does',
        projectPolicy.blocked !== undefined && projectPolicy.bypass === false);

    // …and the top-level spelling is NOT the key the CLI reads: honouring it
    // would refuse sessions the CLI would have run perfectly well.
    const wrongPath = resolveEffectivePermission(BYPASS, [
        layer('managed', MANAGED, { disableBypassPermissionsMode: 'disable' }),
        layer('user', USER, {})
    ]);
    ok('the top-level spelling is not the key — the CLI reads permissions.*',
        wrongPath.blocked === undefined && wrongPath.bypass === true);

    const broken = resolveEffectivePermission('', [
        { id: 'project', file: PROJECT, text: '{ this is not json' },
        layer('user', USER, { permissions: { defaultMode: 'acceptEdits' } })
    ]);
    ok('an unreadable layer is an absent layer, never a refusal to start',
        broken.effective === 'acceptEdits');

    const paths = permissionLayerPaths('D:\\repo', 'C:\\Users\\x', 'win32');
    ok('the layers are looked for in Claude\'s own order, managed first',
        paths.map(p => p.id).join(',') === 'managed,local,project,user');
}

// ---------------------------------------------------------------------------
// 2. hostArgs — the whole command line, not just the decision
// ---------------------------------------------------------------------------
{
    const decide = (requested, settings) => resolveEffectivePermission(requested,
        [layer('user', USER, settings ? { permissions: { defaultMode: settings } } : {})]);

    const bypass = hostArgs({ permission: decide(BYPASS), model: 'opus', resume: 'sid-9' });
    ok('‼️ K-22: a bypassed spawn carries --dangerously-skip-permissions',
        bypass.includes('--dangerously-skip-permissions'));
    ok('‼️ …and does NOT fall back to the flag that only permits it',
        !bypass.includes('--allow-dangerously-skip-permissions'));
    ok('…and never asks the CLI to reconcile two spellings of the same mode',
        !bypass.includes('--permission-mode'));
    ok('…while everything else about the line is unchanged',
        bypass.join(' ').includes('--permission-prompt-tool stdio')
        && bypass.join(' ').endsWith('--resume sid-9 --model opus'));

    const plain = hostArgs({ permissionMode: 'plan' });
    ok('a non-bypass spawn is exactly what it always was',
        plain.includes('--allow-dangerously-skip-permissions')
        && !plain.includes('--dangerously-skip-permissions')
        && plain.join(' ').endsWith('--permission-mode plan'));
}

// ---------------------------------------------------------------------------
// 3. the verdict a bypassed session reaches on its own
// ---------------------------------------------------------------------------
{
    // ‼️ THE EXACT SHAPE THAT WAS ASKING. From the report: a Git Bash variable
    // assignment, a redirect into %APPDATA%\…\bridge outside the cwd, then the
    // wait/read/remove chain. Ordinary work — it is approved, silently.
    const bridge = 'b="$APPDATA/Code/User/globalStorage/muvusoft.agent-farm/bridge"; '
        + 'printf \'{"op":"farm.ops"}\' > "$b/req.json"; while [ ! -f "$b/res.json" ]; do sleep 1; done; '
        + 'cat "$b/res.json"; rm "$b/res.json"';
    ok('‼️ K-22: the Bridge recipe that kept asking is approved without a window',
        bypassVerdict('Bash', { command: bridge }, false).kind === 'allow');
    ok('an ordinary read is approved too',
        bypassVerdict('Read', { file_path: 'D:/repo/src/a.ts' }, false).kind === 'allow');

    // ‼️ …and the one thing "never ask me" is NOT consent to.
    const denies = [
        ['rm -rf /', 'rm -rf /'],
        ['rm -rf ~', 'rm -rf ~'],
        ['rm -fr $HOME', 'rm -fr $HOME'],
        ['rm -rf C:/', 'a drive root'],
        ['Remove-Item -Recurse -Force C:\\', 'PowerShell recursive force delete'],
        ['format C:', 'disk format']
    ];
    for (const [command, what] of denies) {
        ok(`‼️ K-22: bypass REFUSES ${what}`,
            bypassVerdict('Bash', { command }, false).kind === 'deny');
    }
    ok('…and the refusal says why', /home directory|drive root|PowerShell|format/
        .test(bypassVerdict('Bash', { command: 'rm -rf ~' }, false).why || ''));

    // an AskUserQuestion is not a permission window and must still reach a human
    ok('‼️ a QUESTION for the user is not a permission prompt and still comes through',
        bypassVerdict('AskUserQuestion', {}, true).kind === 'ask');
}

// ---------------------------------------------------------------------------
// 4. the reducer: what the session DOES with a request that arrived anyway
// ---------------------------------------------------------------------------
{
    const NOW = Date.parse('2026-08-14T12:00:00Z');
    const base = (mode) => ({
        ...newSessionState({ id: 'c1', agentId: 'a', agentName: 'dev', cwd: 'D:/repo', now: NOW }),
        enforcedPermissionMode: mode
    });
    const request = (tool, input, extra) => ({
        type: 'control_request', request_id: 'rq-1',
        request: { subtype: 'can_use_tool', tool_name: tool, input, ...(extra || {}) }
    });

    const asked = reduceEvent(base('default'), request('Bash', { command: 'ls' }), NOW);
    ok('a session that is NOT in bypass still asks the user',
        asked.state.pendingAsk !== undefined && asked.state.autoAnswer === undefined);

    const auto = reduceEvent(base(BYPASS), request('Bash', { command: 'ls' }), NOW);
    ok('‼️ K-22: a bypassed session opens no window at all',
        auto.state.pendingAsk === undefined);
    ok('‼️ …and does not put a permission row in the conversation either',
        auto.state.messages.length === 0);
    ok('…it answers the request itself', auto.state.autoAnswer !== undefined
        && auto.state.autoAnswer.requestId === 'rq-1');
    const answer = JSON.parse(auto.state.autoAnswer.line);
    ok('…with a real control_response the CLI can act on',
        answer.type === 'control_response'
        && answer.response.request_id === 'rq-1'
        && answer.response.response.behavior === 'allow');
    ok('…and counts it, because a bypassed process should not have asked',
        auto.state.bypassAutoApproved === 1);

    const bad = reduceEvent(base(BYPASS), request('Bash', { command: 'rm -rf ~' }), NOW);
    ok('‼️ K-22: the catastrophic shape is DENIED, not approved',
        JSON.parse(bad.state.autoAnswer.line).response.response.behavior === 'deny');
    ok('…it is said out loud, because a refusal changes what the agent can do',
        bad.state.messages.some(m => m.role === 'error' && /refused automatically/.test(m.text || '')));
    ok('…and it is not counted as an approval', !bad.state.bypassAutoApproved);
    ok('…no window is opened for it either', bad.state.pendingAsk === undefined);

    const question = reduceEvent(base(BYPASS),
        request('AskUserQuestion', { questions: [{ question: 'which one?', options: [] }] }), NOW);
    ok('‼️ a question for the person survives bypass and reaches them',
        question.state.pendingAsk !== undefined && question.state.autoAnswer === undefined);
}

// ---------------------------------------------------------------------------
// 5. the real host: the argv it spawns, and the session it refuses to start
// ---------------------------------------------------------------------------
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-k22-'));
    const home = path.join(tmp, 'home');
    const repo = path.join(tmp, 'repo');
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.mkdirSync(path.join(repo, '.claude'), { recursive: true });
    const realHome = os.homedir;
    os.homedir = () => home;

    let lastArgs = null;
    const realSpawn = cp.spawn;
    cp.spawn = (_exe, args) => {
        lastArgs = args;
        const child = new EventEmitter();
        const pipe = () => { const s = new EventEmitter(); s.setEncoding = () => { }; s.destroy = () => { }; return s; };
        child.stdout = pipe(); child.stderr = pipe();
        child.stdin = { write: () => true, end: () => { } };
        child.pid = 4242; child.kill = () => { };
        return child;
    };
    const { ConsoleHost } = require(path.join(ROOT, 'out/core/consolehost.js'));
    const init = (o) => Object.assign({
        agentId: 'dev', agentName: 'developer', cwd: repo, engine: 'claude'
    }, o);

    let host = new ConsoleHost(() => 'claude');
    let id = host.start(init({ permissionMode: BYPASS }));
    ok('‼️ K-22 (host): a session started as bypass really spawns with the enforcing flag',
        lastArgs.includes('--dangerously-skip-permissions')
        && !lastArgs.includes('--allow-dangerously-skip-permissions'));
    ok('…and the card records what was ENFORCED, beside what was asked',
        host.get(id).enforcedPermissionMode === BYPASS
        && host.get(id).permissionMode === BYPASS);

    // Default, with the user's own settings resolving it to bypass — the
    // reported configuration
    fs.writeFileSync(path.join(home, '.claude', 'settings.json'),
        JSON.stringify({ permissions: { defaultMode: BYPASS } }), 'utf8');
    host = new ConsoleHost(() => 'claude');
    id = host.start(init({ permissionMode: '' }));
    ok('‼️ K-22 (host): Default that resolves to bypass spawns enforced too',
        lastArgs.includes('--dangerously-skip-permissions'));
    ok('…and the card says so rather than showing an empty Default',
        host.get(id).enforcedPermissionMode === BYPASS
        && /Default resolves to bypassPermissions/.test(host.get(id).permissionWhy || ''));

    // …and a managed policy that forbids it: nothing starts
    const managedDir = path.join(tmp, 'ProgramData');
    fs.mkdirSync(path.join(managedDir, 'ClaudeCode'), { recursive: true });
    fs.writeFileSync(path.join(managedDir, 'ClaudeCode', 'managed-settings.json'),
        JSON.stringify({ permissions: { disableBypassPermissionsMode: 'disable' } }), 'utf8');
    const realProgramData = process.env.PROGRAMDATA;
    process.env.PROGRAMDATA = managedDir;
    lastArgs = null;
    host = new ConsoleHost(() => 'claude');
    id = host.start(init({ permissionMode: BYPASS }));
    if (process.platform === 'win32') {
        ok('‼️ K-22 (host): bypass that cannot be enforced does not start a process',
            lastArgs === null);
        ok('…the session appears IN ERROR instead, saying which policy refused it',
            host.get(id).status === 'error'
            && /disableBypassPermissionsMode/.test((host.get(id).messages[0] || {}).text || ''));
        ok('…and it never claims to be in a mode it is not',
            host.get(id).enforcedPermissionMode === '');
    } else {
        // the managed path is platform-specific; the resolver is checked above
        pass += 3;
    }
    if (realProgramData === undefined) { delete process.env.PROGRAMDATA; }
    else { process.env.PROGRAMDATA = realProgramData; }
    cp.spawn = realSpawn;
    os.homedir = realHome;
    fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
