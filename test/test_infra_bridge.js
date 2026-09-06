// B-8 — the working infrastructure over the bridge (compiled core/infraBridge.js).
//
// Four things the farm RUNS on that only a hand could touch: the Claude live
// hooks, the headless Windows service, the usage lap and the price of a model
// nobody priced. What these prove is the two rules that make them safe to hand
// to an agent — a machine change PLANS before it acts, and schtasks is an
// argument vector rather than a command line that a path with a space in it
// could break out of.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { registerInfraOps, hookTargets, serviceFiles, SERVICE_TASK_NAME } =
    require(path.join(__dirname, '..', 'out', 'core', 'infraBridge.js'));
const { BridgeRegistry } = require(path.join(__dirname, '..', 'out', 'core', 'bridge.js'));
const { HOOK_MARKER, hookCommand } = require(path.join(__dirname, '..', 'out', 'core', 'hooksInstaller.js'));

(async () => {
    const root = fs.mkdtempSync(path.join(__dirname, 'tmp-infra-'));
    const home = path.join(root, 'home', '.claude');
    const agentDir = path.join(root, 'agents', 'yazar');
    const storage = path.join(root, 'storage');
    const extDir = path.join(root, 'ext', 'out', 'service');
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(agentDir, { recursive: true });
    fs.mkdirSync(storage, { recursive: true });
    fs.mkdirSync(extDir, { recursive: true });
    fs.writeFileSync(path.join(extDir, 'farmService.js'), '// service\n');
    // A user settings file with a FOREIGN hook in it — removing ours must not
    // touch it, which is the one thing that would be unforgivable here.
    fs.writeFileSync(path.join(home, 'settings.json'), JSON.stringify({
        model: 'opus',
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo somebody-elses-hook' }] }] }
    }, null, 2));

    let platform = 'win32';
    let lap = 0;
    let rules = [{ match: 'opus', input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 }];
    let taskExists = false;
    const calls = [];
    let configWritten = 0;

    const reg = new BridgeRegistry();
    registerInfraOps(reg, {
        getAgents: () => [{ id: 'a1', name: 'yazar', dir: agentDir }],
        userSettingsFile: () => path.join(home, 'settings.json'),
        livePort: () => 8377,
        storageDir: () => storage,
        serviceSource: () => path.join(extDir, 'farmService.js'),
        writeServiceConfig: () => { configWritten++; },
        platform: () => platform,
        runSchtasks: async (argv) => {
            calls.push(argv);
            if (argv[0] === '/query') { return { code: taskExists ? 0 : 1, out: taskExists ? 'TaskName: \\AgentFarmService\nStatus: Ready' : '', err: taskExists ? '' : 'ERROR: cannot find the file specified.' }; }
            if (argv[0] === '/create') { taskExists = true; return { code: 0, out: 'SUCCESS', err: '' }; }
            if (argv[0] === '/delete') { taskExists = false; return { code: 0, out: 'SUCCESS', err: '' }; }
            return { code: 0, out: '', err: '' };
        },
        lapStart: () => lap,
        setLapStart: (ts) => { lap = ts; },
        pricingRules: () => rules,
        setPricingRules: (r) => { rules = r; },
        seenModels: () => ['claude-opus-5', 'gemini-3-pro', 'gpt-5-codex']
    });

    // ---------- the hooks: which file, and is it in it ----------
    {
        const st = await reg.dispatch('hooks.status', {});
        ok('hooks.status names every file the hooks can live in',
            st.ok && st.result.targets.length === 2
            && st.result.targets[0].scope === 'user' && st.result.targets[1].agent === 'yazar');
        ok('…with the port and the exact command it would write',
            st.result.port === 8377 && st.result.command.includes(HOOK_MARKER));
        ok('…and nothing is installed yet', st.result.installed === 0);

        const dry = await reg.dispatch('hooks.install', { dryRun: true });
        ok('‼️ hooks.install dryRun names the file and writes NOTHING',
            dry.ok && dry.result.files.length === 1
            && !fs.readFileSync(path.join(home, 'settings.json'), 'utf8').includes(HOOK_MARKER));

        const ins = await reg.dispatch('hooks.install', {});
        ok('hooks.install defaults to USER scope — one file, every session',
            ins.ok && ins.result.installed === 1 && ins.result.failed === 0);
        const written = JSON.parse(fs.readFileSync(path.join(home, 'settings.json'), 'utf8'));
        ok('…merged into the real settings file', JSON.stringify(written).includes(HOOK_MARKER));
        ok('‼️ …with the foreign hook and the other settings untouched',
            written.model === 'opus'
            && JSON.stringify(written.hooks.Stop).includes('somebody-elses-hook'));

        const insAgent = await reg.dispatch('hooks.install', { agent: 'yazar' });
        ok('hooks.install can name one agent', insAgent.ok && insAgent.result.installed === 1
            && fs.existsSync(path.join(agentDir, '.claude', 'settings.local.json')));
        const badAgent = await reg.dispatch('hooks.install', { agent: 'nobody' });
        ok('…and an agent that is not there is named, not written', !badAgent.ok && /not found/.test(badAgent.error));
        const badScope = await reg.dispatch('hooks.install', { scope: 'everywhere' });
        ok('…and an invented scope lists the real ones', !badScope.ok && /user, agents or both/.test(badScope.error));

        const st2 = await reg.dispatch('hooks.status', {});
        ok('hooks.status now reports both files installed', st2.result.installed === 2);

        const rm = await reg.dispatch('hooks.remove', {});
        ok('hooks.remove takes ours back out of every file', rm.ok && rm.result.removed === 2);
        const after = JSON.parse(fs.readFileSync(path.join(home, 'settings.json'), 'utf8'));
        ok('‼️ …and leaves the foreign hook exactly where it was',
            JSON.stringify(after.hooks.Stop).includes('somebody-elses-hook')
            && !JSON.stringify(after).includes(HOOK_MARKER));
        const rmAgain = await reg.dispatch('hooks.remove', {});
        ok('…a second call removes nothing and says so, rather than failing',
            rmAgain.ok && rmAgain.result.removed === 0 && /nothing to remove/i.test(rmAgain.result.note));
    }

    // ---------- the headless service: it PLANS before it acts ----------
    {
        const st = await reg.dispatch('service.status', {});
        ok('service.status says the task is not registered', st.ok && st.result.installed === false
            && st.result.taskName === SERVICE_TASK_NAME);

        const before = calls.length;
        const plan = await reg.dispatch('service.install', {});
        ok('‼️ service.install with no confirm returns the PLAN and changes nothing',
            plan.ok && plan.result.planned === true
            && !fs.existsSync(serviceFiles({ storageDir: () => storage }).cmd));
        ok('…naming the exact task and every file it would write',
            plan.result.taskName === SERVICE_TASK_NAME && plan.result.writes.length === 3);
        ok('‼️ …and the schtasks call is an ARGV, not a command line',
            Array.isArray(plan.result.schtasks) && plan.result.schtasks.includes('/create')
            && plan.result.schtasks.every(a => typeof a === 'string'));
        ok('…and only the read-back query was run', calls.length === before + 1 && calls[before][0] === '/query');

        const made = await reg.dispatch('service.install', { confirm: true, start: false });
        ok('service.install with confirm registers it and reads it back',
            made.ok && made.result.installed === true && made.result.started === false);
        ok('…writing the script, the cmd and the config',
            fs.existsSync(path.join(storage, 'farm-service.js'))
            && fs.existsSync(path.join(storage, 'farm-service.cmd')) && configWritten === 1);
        const create = calls.find(c => c[0] === '/create');
        ok('‼️ …with the task name as its OWN argument, so no path can become a second command',
            create[1] === '/tn' && create[2] === SERVICE_TASK_NAME && create.includes('/f'));

        const again = await reg.dispatch('service.install', { confirm: true, start: false });
        ok('…and a second install replaces rather than duplicates', again.ok && again.result.replaced === true);

        const rmPlan = await reg.dispatch('service.remove', {});
        ok('service.remove plans too', rmPlan.ok && rmPlan.result.planned === true && taskExists === true);
        const rm = await reg.dispatch('service.remove', { confirm: true });
        ok('…and with confirm it stops and unregisters', rm.ok && rm.result.removed === true && !taskExists);
        const rmAgain = await reg.dispatch('service.remove', { confirm: true });
        ok('…a task that is already gone is reported, not failed',
            rmAgain.ok && rmAgain.result.removed === false);

        platform = 'linux';
        const foreign = await reg.dispatch('service.status', {});
        ok('‼️ on a platform with no Scheduled Tasks the status says so plainly',
            foreign.ok && foreign.result.supported === false);
        const foreignInstall = await reg.dispatch('service.install', { confirm: true });
        ok('…and the install is REFUSED rather than half-done',
            !foreignInstall.ok && /Windows Scheduled Task/.test(foreignInstall.error));
        platform = 'win32';
    }

    // ---------- the usage lap ----------
    {
        const off = await reg.dispatch('usage.lap', {});
        ok('usage.lap with no lap says the figures are all-time', off.ok && off.result.running === false);
        const started = await reg.dispatch('usage.lap.reset', {});
        ok('usage.lap.reset starts counting from now', started.ok && lap > 0 && started.result.from === lap);
        const at = await reg.dispatch('usage.lap.reset', { at: 1700000000000 });
        ok('…or from a moment you name', at.ok && lap === 1700000000000 && at.result.previous > 0);
        const future = await reg.dispatch('usage.lap.reset', { at: Date.now() + 86400000 });
        ok('‼️ …but never from the future, which would leave nothing before it',
            !future.ok && /future/.test(future.error));
        const cleared = await reg.dispatch('usage.lap.clear', {});
        ok('usage.lap.clear ends it', cleared.ok && cleared.result.cleared === true && lap === 0);
        const clearAgain = await reg.dispatch('usage.lap.clear', {});
        ok('…and clearing nothing changes nothing', clearAgain.ok && clearAgain.result.cleared === false);
    }

    // ---------- what a model costs, and what costs nothing by accident ----------
    {
        const read = await reg.dispatch('pricing.rules', {});
        ok('‼️ pricing.rules names the models this farm ran that are billed at $0',
            read.ok && read.result.unpriced.length === 2
            && read.result.unpriced.includes('gemini-3-pro') && read.result.unpriced.includes('gpt-5-codex'));

        const add = await reg.dispatch('pricing.set',
            { match: 'gemini-3', input: 1.25, output: 10 });
        ok('pricing.set adds a rule for one of them', add.ok && add.result.added === true && rules.length === 2);
        const upd = await reg.dispatch('pricing.set', { match: 'gemini-3', input: 2, output: 12 });
        ok('…and the same match UPSERTS instead of piling up', upd.ok && upd.result.updated === true && rules.length === 2);
        ok('…with the omitted rates defaulting to 0, not to the old value',
            rules.find(r => r.match === 'gemini-3').cacheRead === 0);

        const read2 = await reg.dispatch('pricing.rules', {});
        ok('…so the unpriced list shrinks', read2.result.unpriced.length === 1);

        const bad = await reg.dispatch('pricing.set', { match: 'gpt-5(', input: 1 });
        ok('‼️ a regex that does not compile is refused, not saved to never match',
            !bad.ok && /not a valid regex/.test(bad.error) && rules.length === 2);
        const neg = await reg.dispatch('pricing.set', { match: 'gpt-5', input: -3 });
        ok('…and a negative rate is refused', !neg.ok && /non-negative/.test(neg.error));
        const noMatch = await reg.dispatch('pricing.set', { input: 1 });
        ok('…and a rule with nothing to match is refused', !noMatch.ok && /needs a `match`/.test(noMatch.error));

        const all = await reg.dispatch('pricing.set', { rules: [{ match: 'opus', input: 15, output: 75 }] });
        ok('pricing.set with `rules` replaces the whole table', all.ok && all.result.replaced === true && rules.length === 1);
        const empty = await reg.dispatch('pricing.set', { rules: [] });
        ok('‼️ …but an empty table, which would price everything at $0, is refused',
            !empty.ok && /at least one rule/.test(empty.error) && rules.length === 1);
    }

    // ---------- the catalog ----------
    ok('B-8 ops appear in the catalog',
        ['hooks.status', 'hooks.install', 'hooks.remove', 'service.status', 'service.install',
            'service.remove', 'usage.lap', 'usage.lap.reset', 'usage.lap.clear',
            'pricing.rules', 'pricing.set'].every(op => reg.catalog().some(c => c.op === op)));
    ok('…each with a describe that states its args',
        reg.catalog().filter(c => /^(hooks|service|usage\.lap|pricing)/.test(c.op))
            .every(c => /args:/.test(c.describe)));

    // hookTargets is the shared reading behind status/install/remove.
    ok('hookTargets is one reading for all three ops',
        hookTargets({ getAgents: () => [{ id: 'a1', name: 'yazar', dir: agentDir }], userSettingsFile: () => path.join(home, 'settings.json') }).length === 2);

    // ---- X-208: one hook, two spellings, because one string cannot do it ----
    //
    // ‼️ EVERY WAY THIS BREAKS IS SILENT, AND THERE ARE THREE OF THEM. The line
    // every hook file has carried works in sh, bash and cmd — measured. Under
    // Windows PowerShell 5.1, where Codex runs its hooks on this machine, it
    // fails three separate times and only the first was ever reported:
    //
    //   1. `||` is not a statement separator — a PARSE error, so nothing runs
    //      and the engine reports the hook as failed;
    //   2. `curl` is an ALIAS for Invoke-WebRequest — fixing (1) alone leaves
    //      the hook calling a different tool with curl's flags;
    //   3. an unquoted `@-` is the SPLATTING operator — measured, the process
    //      exits 1 and the body never arrives, which is the worst of the three
    //      because a shell reporting success while posting nothing looks
    //      exactly like a listener that has gone quiet.
    {
        const posix = hookCommand(8377);
        const pwsh = hookCommand(8377, 'powershell');

        // The working spelling does not move. Claude's hooks run on it today,
        // and this whole item is about the OTHER shell.
        ok('‼️ X-208: the sh/bash/cmd spelling is unchanged, to the character',
            posix === 'curl -s -m 3 -X POST "http://127.0.0.1:8377/event?src=agentfarm-live" '
            + '-H "Content-Type: application/json" --data-binary @- || cd .');
        ok('…and it is what a caller gets when it names no shell at all',
            hookCommand(8377, 'posix') === posix);

        ok('‼️ …the PowerShell spelling carries no `||`, which does not PARSE there',
            pwsh.indexOf('||') < 0);
        ok('‼️ …it names the EXECUTABLE, because bare curl is an alias for Invoke-WebRequest',
            /(^|\s)curl\.exe\s/.test(pwsh) && !/(^|\s)curl\s/.test(pwsh));
        ok('‼️ …and it QUOTES the dash, because @- unquoted is the splatting operator',
            pwsh.indexOf("--data-binary '@-'") >= 0 && !/--data-binary @-/.test(pwsh));
        ok('…while still forcing exit 0, which is the whole reason the other one has || cd .',
            /;\s*exit 0\s*$/.test(pwsh));

        // ‼️ AND THE OTHER WAY ROUND. `; exit 0` exits 0 under cmd and posts
        // NOTHING (measured) — cmd hands the semicolon to curl as an argument.
        // Standardising on it would have traded a loud failure for a quiet one.
        ok('‼️ …and the sh/cmd spelling does NOT borrow it: under cmd it posts nothing',
            posix.indexOf('exit 0') < 0);

        // The two are the SAME hook. A spelling that drifted in its port, its
        // marker or its timeout would be a second listener nobody asked for.
        const same = (s) => s.replace(/^curl(\.exe)? /, '').replace(/ (\|\| cd \.|; exit 0)$/, '')
            .replace(/'@-'/, '@-');
        ok('‼️ …and the two differ ONLY where a shell forces them to',
            same(posix) === same(pwsh) && same(posix).indexOf(HOOK_MARKER) >= 0
            && same(posix).indexOf('8377') >= 0);

        // The bridge publishes both, so nobody has to derive the second one —
        // deriving it is what produced the broken Codex hook in the first place.
        const st3 = await reg.dispatch('hooks.status', {});
        ok('‼️ …and hooks.status hands over BOTH, so the second is never guessed at',
            st3.ok && st3.result.command === hookCommand(st3.result.port)
            && st3.result.commandPowerShell === hookCommand(st3.result.port, 'powershell'));
    }

    fs.rmSync(root, { recursive: true, force: true });
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
