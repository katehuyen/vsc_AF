// X-265 — THE LIVE TIMELINE WENT DEAF THE DAY AN ACCOUNT BECAME A DIRECTORY.
//
// `CLAUDE_CONFIG_DIR` moves which `settings.json` the engine reads. Multi-account
// isolation set that variable and carried the sign-in across; nothing carried the
// hooks. Measured 2026-09-07: the last real Claude hook event in `live-events.jsonl`
// was 2026-09-06 20:01, and the slot directory on this machine held
// `.credentials.json`, `.claude.json`, `projects` — and no settings file at all,
// while the cockpit card went on reporting "every session on this machine is
// covered" in green.
//
// ‼️ WHAT THIS FILE PINS IS THE WHOLE CHAIN, not the fix at one end: the adapter
// says the file travels, the plan puts it in a list of its OWN (an empty `copies`
// is how a failed capture is recognised and a settings file must never make one
// look successful), the sync repairs slots captured before any of this existed,
// every door that installs a hook knows about them, and the verdict can go amber
// for the failure that actually happened.
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { adapterFor } = require(path.join(__dirname, '..', 'out', 'core', 'engineAccounts.js'));
const { planCapture } = require(path.join(__dirname, '..', 'out', 'core', 'accountStore.js'));
const {
    HOOK_MARKER, hookCommand, hasOurHooks, hooksAreCurrent, installHooksInto,
    removeHooksFrom, syncHooksToAccounts, userSettingsPath
} = require(path.join(__dirname, '..', 'out', 'core', 'hooksInstaller.js'));
const { registerInfraOps, hookTargets } =
    require(path.join(__dirname, '..', 'out', 'core', 'infraBridge.js'));
const { BridgeRegistry } = require(path.join(__dirname, '..', 'out', 'core', 'bridge.js'));
const { hooksStatus } = require(path.join(__dirname, '..', 'out', 'core', 'hooksCockpit.js'));

const NOW = Date.parse('2026-09-07T12:00:00Z');
const ready = (email) => ({
    email, subscriptionType: 'max', expiresAt: NOW + 3600_000,
    refreshExpiresAt: NOW + 30 * 86400_000, health: 'ready'
});

(async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-x265-'));

    // ---------- the adapter: an identity is not all a slot needs ----------
    {
        const a = adapterFor('claude');
        ok('‼️ the claude adapter says the settings file travels with a slot',
            (a.carryFiles || []).includes('settings.json'));
        ok('‼️ …and it is NOT one of the identity files, because an empty `ownFiles` '
            + 'copy is how a failed capture is recognised',
            !a.ownFiles.includes('settings.json'));
        ok('…nor a shared link: a junction needs no administrator, a FILE symlink does',
            !a.sharedPaths.includes('settings.json'));
    }

    // ---------- the plan: a list of its own ----------
    {
        const plan = planCapture({
            engine: 'claude', home: 'C:/Users/murat', root: 'C:/store/accounts',
            identity: ready('murat@example.com'), stored: [], label: '', now: NOW
        });
        const carries = plan.carries.map(c => c.from.replace(/\\/g, '/'));
        ok('the plan carries the settings file, read from ~/.claude/settings.json',
            carries.length === 1 && carries[0] === 'C:/Users/murat/.claude/settings.json');
        ok('…into the slot directory, beside the identity',
            plan.carries[0].to.replace(/\\/g, '/') === 'C:/store/accounts/claude-murat/settings.json');
        ok('‼️ and it is NOT in `copies` — the count of those is what tells a failed '
            + 'capture from a real one, and a settings file must never make a slot '
            + 'with no credentials in it look sealed',
            !plan.copies.some(c => /settings\.json$/.test(c.to)));
        const refused = planCapture({
            engine: 'claude', home: 'C:/Users/murat', root: 'C:/store/accounts',
            identity: { email: '', subscriptionType: '', expiresAt: 0, refreshExpiresAt: 0, health: 'none' },
            stored: [], now: NOW
        });
        ok('a refusal carries nothing at all — no slot, no copies, no carries',
            !!refused.refusal && refused.copies.length === 0 && refused.carries.length === 0);
    }

    // ---------- hooksAreCurrent: the sharper question a self-running sync needs ----------
    {
        const dir = path.join(root, 'current');
        fs.mkdirSync(dir, { recursive: true });
        const file = userSettingsPath(dir);
        ok('a file that does not exist carries nothing current', !hooksAreCurrent(file, 8377));
        installHooksInto(file, 8377);
        ok('…and one just written does', hooksAreCurrent(file, 8377));
        ok('‼️ a CHANGED PORT is not current — the marker is still there and the hook '
            + 'posts into the void, which `hasOurHooks` cannot tell apart',
            hasOurHooks(file) && !hooksAreCurrent(file, 9999));
        const j = JSON.parse(fs.readFileSync(file, 'utf8'));
        delete j.hooks.PreCompact;
        fs.writeFileSync(file, JSON.stringify(j, null, 2), 'utf8');
        ok('one event missing is not current either — the sync repairs a half file',
            hasOurHooks(file) && !hooksAreCurrent(file, 8377));
    }

    // ---------- the sync: three rules, each one reversible by accident ----------
    {
        const home = path.join(root, 'sync', 'home');
        const slotA = path.join(root, 'sync', 'accounts', 'claude-a');
        const slotB = path.join(root, 'sync', 'accounts', 'claude-b');
        fs.mkdirSync(home, { recursive: true });
        fs.mkdirSync(slotA, { recursive: true });
        const userFile = userSettingsPath(home);
        fs.writeFileSync(userFile, JSON.stringify({
            model: 'opus', permissions: { defaultMode: 'bypassPermissions' }
        }, null, 2), 'utf8');

        ok('‼️ THE USER FILE DECIDES: no hooks of ours there, nothing written anywhere '
            + '— somebody who removed them meant to',
            syncHooksToAccounts(userFile, [userSettingsPath(slotA)], 8377).length === 0
            && !fs.existsSync(userSettingsPath(slotA)));

        installHooksInto(userFile, 8377);
        const done = syncHooksToAccounts(
            userFile, [userSettingsPath(slotA), userSettingsPath(slotB)], 8377);
        ok('both slots are written once the user file carries the hooks', done.length === 2);
        ok('…including one whose directory did not exist yet', fs.existsSync(userSettingsPath(slotB)));
        const seeded = JSON.parse(fs.readFileSync(userSettingsPath(slotA), 'utf8'));
        ok('‼️ A SLOT IS SEEDED FROM THE USER\'S WHOLE FILE, not given a hooks-only stub: '
            + 'the isolation lost their model and their permission mode too, and an account '
            + 'that reports its work faithfully while doing it under different rules is worse '
            + 'than one that is silent',
            seeded.model === 'opus' && seeded.permissions.defaultMode === 'bypassPermissions');
        ok('…and it really carries the hook, with the port it was told',
            hooksAreCurrent(userSettingsPath(slotA), 8377)
            && JSON.stringify(seeded.hooks).includes(HOOK_MARKER));
        ok('IDEMPOTENT — a second call writes nothing, so this may run on every activation',
            syncHooksToAccounts(userFile, [userSettingsPath(slotA), userSettingsPath(slotB)], 8377)
                .length === 0);
        ok('…but a port change is picked up on the next pass',
            syncHooksToAccounts(userFile, [userSettingsPath(slotA)], 9001).length === 1
            && hooksAreCurrent(userSettingsPath(slotA), 9001));
        ok('a foreign hook in the slot survives being synced',
            true === (() => {
                const f = userSettingsPath(slotB);
                const j = JSON.parse(fs.readFileSync(f, 'utf8'));
                j.hooks.Stop.push({ hooks: [{ type: 'command', command: 'echo somebody-elses' }] });
                fs.writeFileSync(f, JSON.stringify(j, null, 2), 'utf8');
                syncHooksToAccounts(userFile, [f], 9001);
                return fs.readFileSync(f, 'utf8').includes('somebody-elses');
            })());
    }

    // ---------- the bridge: every door knows ----------
    {
        const home = path.join(root, 'bridge', 'home');
        const agentDir = path.join(root, 'bridge', 'agents', 'yazar');
        const slot = path.join(root, 'bridge', 'accounts', 'claude-work');
        fs.mkdirSync(home, { recursive: true });
        fs.mkdirSync(agentDir, { recursive: true });
        fs.mkdirSync(slot, { recursive: true });
        const userFile = userSettingsPath(home);
        fs.writeFileSync(userFile, JSON.stringify({ model: 'opus' }, null, 2), 'utf8');

        const reg = new BridgeRegistry();
        registerInfraOps(reg, {
            getAgents: () => [{ id: 'a1', name: 'yazar', dir: agentDir }],
            userSettingsFile: () => userFile,
            accountSettingsFiles: () => [{ id: 'claude-work', file: userSettingsPath(slot) }],
            livePort: () => 8377,
            storageDir: () => path.join(root, 'bridge', 'storage'),
            serviceSource: () => path.join(root, 'bridge', 'farmService.js'),
            writeServiceConfig: () => { },
            platform: () => 'win32',
            runSchtasks: async () => ({ code: 1, out: '', err: '' }),
            lapStart: () => 0,
            setLapStart: () => { },
            pricingRules: () => [],
            setPricingRules: () => { },
            seenModels: () => []
        });

        const st0 = await reg.dispatch('hooks.status', {});
        ok('‼️ hookTargets names the captured account as a file the hooks can live in',
            st0.ok && st0.result.targets.length === 3
            && st0.result.targets[2].scope === 'account'
            && st0.result.targets[2].account === 'claude-work');

        const dry = await reg.dispatch('hooks.install', { scope: 'user', dryRun: true });
        ok('‼️ a USER-scope dry run names the account file too — a dry run that hid it '
            + 'would be describing a different act from the one about to happen',
            dry.ok && dry.result.files.length === 2
            && dry.result.files.some(f => f.scope === 'account'));
        ok('…and nothing was written', !fs.existsSync(userSettingsPath(slot)));

        const ins = await reg.dispatch('hooks.install', { scope: 'user' });
        ok('‼️ USER SCOPE CARRIES THROUGH TO THE ACCOUNTS — "every session on this '
            + 'machine" is only true if the config directory the engine actually reads '
            + 'gets one',
            ins.ok && hooksAreCurrent(userSettingsPath(slot), 8377));
        ok('…and the user file itself, obviously', hooksAreCurrent(userFile, 8377));

        const st1 = await reg.dispatch('hooks.status', {});
        ok('hooks.status now counts three installed', st1.result.installed === 2
            && st1.result.targets.filter(t => t.installed).length === 2);

        const badScope = await reg.dispatch('hooks.install', { scope: 'everywhere' });
        ok('an unknown scope is refused by name, listing the ones that exist',
            !badScope.ok && String(badScope.error).includes('accounts'));

        const onlyAccts = await reg.dispatch('hooks.install', { scope: 'accounts', dryRun: true });
        ok('`accounts` is a scope of its own', onlyAccts.ok && onlyAccts.result.files.length === 1
            && onlyAccts.result.files[0].scope === 'account');
        const agentsOnly = await reg.dispatch('hooks.install', { scope: 'agents', dryRun: true });
        ok('‼️ `agents` DOES NOT TOUCH THE ACCOUNTS — the carry-through follows the '
            + 'USER FILE being written, not a scope word, and a per-agent install is '
            + 'deliberately narrow',
            agentsOnly.ok && agentsOnly.result.files.length === 1
            && agentsOnly.result.files[0].scope === 'agent');
        const both = await reg.dispatch('hooks.install', { scope: 'both', dryRun: true });
        ok('‼️ `both` NAMES user + agents and carries through to the accounts as well, '
            + 'because it writes the user file and that is where the promise lives',
            both.ok && both.result.files.length === 3
            && both.result.files.filter(f => f.scope === 'account').length === 1);
        const all = await reg.dispatch('hooks.install', { scope: 'all', dryRun: true });
        ok('`all` is the word that means everything', all.ok && all.result.files.length === 3);

        const rm = await reg.dispatch('hooks.remove', {});
        ok('‼️ what this extension wrote into a slot can be taken back out by the '
            + 'button that removes hooks — otherwise "removed" is a lie and the '
            + 'accounts go on posting',
            rm.ok && rm.result.files.some(f => f.file === userSettingsPath(slot))
            && !hasOurHooks(userSettingsPath(slot)));
        ok('…and the account keeps everything that was not ours',
            JSON.parse(fs.readFileSync(userSettingsPath(slot), 'utf8')).model === 'opus');
    }

    // ---------- the verdict: it can go amber for the failure that happened ----------
    {
        const covered = hooksStatus({
            listener: 'listening', port: 8377,
            targets: [
                { scope: 'user', file: 'C:/u/.claude/settings.json', installed: true },
                { scope: 'account', account: 'claude-work', file: 'C:/s/claude-work/settings.json', installed: true }
            ]
        });
        ok('user scope plus a hooked account is genuinely ok', covered.state === 'ok'
            && covered.accountsBlind === 0);

        const lying = hooksStatus({
            listener: 'listening', port: 8377,
            targets: [
                { scope: 'user', file: 'C:/u/.claude/settings.json', installed: true },
                { scope: 'account', account: 'claude-work', file: 'C:/s/claude-work/settings.json', installed: false }
            ]
        });
        ok('‼️ user scope installed and an account without hooks is NOT ok — this is '
            + 'exactly the machine that spent a day drawing a green card over an empty '
            + 'timeline',
            lying.state === 'partial' && lying.tone === 'warn' && lying.accountsBlind === 1);
        ok('…and the card must NOT go on claiming full coverage',
            !lying.detail.includes('every session on this machine is covered'));
        ok('…it names the account, because "some account" is not a thing to go and fix',
            lying.detail.includes('claude-work'));
        ok('‼️ a blind account never outranks a blocked port or an empty install: '
            + 'fixing the files first would change nothing a person can see',
            hooksStatus({
                listener: 'listening', port: 8377,
                targets: [
                    { scope: 'user', file: 'C:/u/.claude/settings.json', installed: false },
                    { scope: 'account', account: 'claude-work', file: 'C:/s/x/settings.json', installed: false }
                ]
            }).state === 'blind');
    }

    // the hook line itself, so a shell spelling can never drift from the marker
    ok('the hook command still carries the marker every install is found by',
        hookCommand(8377).includes(HOOK_MARKER)
        && hookCommand(8377, 'powershell').includes(HOOK_MARKER));

    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }

    console.log(`test_account_hooks: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
