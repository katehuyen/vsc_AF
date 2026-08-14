// B-7 — fleet and settings management over the bridge (compiled
// core/settingsBridge.js against the real settingsops/claudesettings cores).
//
// The settings page was the last place where "set it up" meant "sit in front of
// it". What these prove is the three rules that make it safe to hand over: the
// SCHEMA is the allowlist, a credential-shaped value is never read back, and
// anything that changes more than one value can be asked what it would do.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { registerSettingsOps, isSensitiveKey, maskIfSensitive, needsReload } =
    require(path.join(__dirname, '..', 'out', 'core', 'settingsBridge.js'));
const { buildSettingsModel, profileApplyPlan } =
    require(path.join(__dirname, '..', 'out', 'core', 'settingsops.js'));
const { CC_CATALOG, coerceClaudeValue, patchClaudeSettings, readPath } =
    require(path.join(__dirname, '..', 'out', 'core', 'claudesettings.js'));
const { BridgeRegistry } = require(path.join(__dirname, '..', 'out', 'core', 'bridge.js'));

// ---------- the three little rules, on their own ----------
{
    ok('a credential-shaped key is recognised',
        isSensitiveKey('agentFarm.notifyWebhookToken') && isSensitiveKey('agentFarm.falApiKey'));
    ok('‼️ …but a key that names a secret rather than holding one is NOT masked',
        !isSensitiveKey('agentFarm.mediaAuthSecret'));
    ok('masking replaces the value, and leaves an empty one alone',
        maskIfSensitive('agentFarm.someToken', 'abc123') === '••••••••'
        && maskIfSensitive('agentFarm.someToken', '') === ''
        && maskIfSensitive('agentFarm.livePort', 8377) === 8377);
    ok('‼️ "needs a reload" is read from the setting\'s OWN description, not a hand-kept list',
        needsReload('Port for the live listener (restart required).')
        && needsReload('Reload the window after changing this.')
        && !needsReload('Days of history to keep.'));
}

(async () => {
    const root = fs.mkdtempSync(path.join(__dirname, 'tmp-settings-'));
    const claudeFile = path.join(root, '.claude', 'settings.json');
    const rootA = path.join(root, 'agentsA');
    const agentDir = path.join(rootA, 'yazar');
    fs.mkdirSync(agentDir, { recursive: true });
    fs.mkdirSync(path.dirname(claudeFile), { recursive: true });
    fs.writeFileSync(claudeFile, JSON.stringify({ model: 'opus', env: { KEEP_ME: '1' } }, null, 2));

    const schema = {
        'agentFarm.livePort': { type: 'number', default: 8377, description: 'Hook listener port (restart required).' },
        'agentFarm.guideLanguage': { type: 'string', enum: ['en', 'tr'], default: 'en', description: 'Guide language.' },
        'agentFarm.agentRoots': { type: 'array', default: [], description: 'Folders scanned for agents.' },
        'agentFarm.excludeAgentDirs': { type: 'array', default: [], description: 'Folders to hide.' },
        'agentFarm.notifyWebhookToken': { type: 'string', default: '', description: 'Token for the webhook.' }
    };
    const values = {
        'agentFarm.livePort': 8377,
        'agentFarm.guideLanguage': 'tr',
        'agentFarm.agentRoots': [rootA, rootA.replace(/\\/g, '/')],
        'agentFarm.excludeAgentDirs': [],
        'agentFarm.notifyWebhookToken': 'super-secret-value'
    };
    let profiles = [];
    const written = [];
    const packed = [];
    const norm = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    const cats = () => buildSettingsModel(schema, (k) => values[k]);

    const reg = new BridgeRegistry();
    registerSettingsOps(reg, {
        getAgents: () => [{ id: 'a1', name: 'yazar', dir: agentDir }],
        categories: cats,
        writeSetting: async (key, value) => {
            written.push({ key, value });
            if (value === undefined) { values[key] = schema[key].default; } else { values[key] = value; }
        },
        readSetting: (key, fb) => (key in values ? values[key] : fb),
        getProfiles: () => profiles,
        setProfiles: async (list) => { profiles = list; },
        applyPlan: (p) => profileApplyPlan(p, cats()),
        claudeCatalog: () => CC_CATALOG,
        claudeSettingsFile: () => claudeFile,
        readClaude: () => {
            try { return { json: JSON.parse(fs.readFileSync(claudeFile, 'utf8')) }; }
            catch (e) { return { json: {}, parseError: String(e.message) }; }
        },
        writeClaude: (json) => {
            try { fs.writeFileSync(claudeFile, JSON.stringify(json, null, 2), 'utf8'); return undefined; }
            catch (e) { return String(e.message); }
        },
        claudePatch: (json, p, v) => patchClaudeSettings(json, p, v),
        claudeCoerce: (item, v) => coerceClaudeValue(item, v),
        claudeRead: (json, p) => readPath(json, p),
        agentFolders: () => [{ root: rootA, candidates: [{ dir: agentDir, name: 'yazar', excluded: false }] }],
        engineIds: () => ['claude', 'codex', 'gemini', 'agy'],
        writeAgentDefault: async (dir, engine, patch) => { written.push({ key: 'agentDefault', dir, engine, patch }); },
        exportPack: (a, file) => { fs.writeFileSync(file, '{}'); packed.push(file); return { warnings: ['memory not included'], files: 4 }; },
        normPath: norm
    });

    // ---- reading, and the one thing that never comes back ----
    {
        const list = await reg.dispatch('settings.list', {});
        ok('settings.list draws the whole schema', list.ok && list.result.total === 5);
        const secret = list.result.categories.flatMap(c => c.items)
            .find(i => i.key === 'agentFarm.notifyWebhookToken');
        ok('‼️ …and a credential-shaped value NEVER comes back over the bridge',
            secret.masked === true && secret.value === '••••••••');
        const port = list.result.categories.flatMap(c => c.items)
            .find(i => i.key === 'agentFarm.livePort');
        ok('…while an ordinary value does, with its reload flag',
            port.value === 8377 && port.reloadRequired === true && port.modified === false);

        const mod = await reg.dispatch('settings.list', { modified: true });
        ok('modified:true is the "what has somebody changed here" read',
            mod.ok && mod.result.total === 3);

        const one = await reg.dispatch('settings.get', { key: 'guideLanguage' });
        ok('settings.get takes the key with or without the prefix',
            one.ok && one.result.key === 'agentFarm.guideLanguage' && one.result.enum.join() === 'en,tr');
        const ghost = await reg.dispatch('settings.get', { key: 'notAThing' });
        ok('‼️ …and a key the manifest does not declare is refused — the schema IS the allowlist',
            !ghost.ok && /not an Agent Farm setting/.test(ghost.error));
    }

    // ---- writing, through the page's own validation ----
    {
        const dry = await reg.dispatch('settings.set', { key: 'livePort', value: 9000, dryRun: true });
        ok('settings.set dryRun says what it would do and writes nothing',
            dry.ok && dry.result.to === 9000 && values['agentFarm.livePort'] === 8377);
        const set = await reg.dispatch('settings.set', { key: 'livePort', value: '9000' });
        ok('…and the value goes through the schema type, so "9000" becomes 9000',
            set.ok && values['agentFarm.livePort'] === 9000);
        ok('…with the reload sentence attached', /window reload/.test(set.result.note));

        const badNum = await reg.dispatch('settings.set', { key: 'livePort', value: 'lots' });
        ok('a number that is not a number is refused', !badNum.ok && /not a number/.test(badNum.error));
        const badEnum = await reg.dispatch('settings.set', { key: 'guideLanguage', value: 'de' });
        ok('…and a string outside the enum lists the real ones', !badEnum.ok && /en, tr/.test(badEnum.error));
        const badJson = await reg.dispatch('settings.set', { key: 'agentRoots', value: '{nope' });
        ok('…and malformed JSON for an array is refused, not written',
            !badJson.ok && /invalid JSON/.test(badJson.error));
        const noValue = await reg.dispatch('settings.set', { key: 'livePort' });
        ok('…and an omitted value points at settings.reset', !noValue.ok && /settings\.reset/.test(noValue.error));

        const setSecret = await reg.dispatch('settings.set', { key: 'notifyWebhookToken', value: 'new-secret' });
        ok('‼️ a credential can be SET but is still masked in the answer',
            setSecret.ok && values['agentFarm.notifyWebhookToken'] === 'new-secret'
            && setSecret.result.value === '••••••••');

        const reset = await reg.dispatch('settings.reset', { key: 'livePort' });
        ok('settings.reset puts it back to the schema default',
            reset.ok && reset.result.changed === true && values['agentFarm.livePort'] === 8377);
        const resetAgain = await reg.dispatch('settings.reset', { key: 'livePort' });
        ok('…and a setting already at its default is reported, not written again',
            resetAgain.ok && resetAgain.result.changed === false);
    }

    // ---- setting sets: a complete state, not an overlay ----
    {
        const save = await reg.dispatch('settings.sets.save', { name: 'my laptop' });
        ok('settings.sets.save snapshots only what is non-default',
            save.ok && save.result.values === 3);
        const list = await reg.dispatch('settings.sets', {});
        ok('settings.sets lists them with their keys', list.ok && list.result.sets[0].name === 'my laptop');

        // Move away from the snapshot, then ask what coming back would do.
        await reg.dispatch('settings.set', { key: 'livePort', value: 9999 });
        await reg.dispatch('settings.set', { key: 'guideLanguage', value: 'en' });
        const plan = await reg.dispatch('settings.sets.apply', { name: 'my laptop', dryRun: true });
        ok('settings.sets.apply dryRun names every step', plan.ok && plan.result.plan.length >= 3);
        ok('‼️ …including the RESETS — a set is a complete state, so a stray modified key goes back to default',
            plan.result.resets >= 1 && plan.result.plan.some(s => s.action === 'reset' && s.key === 'agentFarm.livePort'));
        ok('…and nothing was written by the plan', values['agentFarm.livePort'] === 9999);

        const applied = await reg.dispatch('settings.sets.apply', { name: 'my laptop' });
        ok('…applying it really does put the snapshot back',
            applied.ok && values['agentFarm.guideLanguage'] === 'tr' && values['agentFarm.livePort'] === 8377);

        const exp = await reg.dispatch('settings.sets.export', {});
        ok('settings.sets.export hands the JSON back when no file is named',
            exp.ok && JSON.parse(exp.result.content)[0].name === 'my laptop');
        const expFile = path.join(root, 'sets.json');
        ok('…or writes it', (await reg.dispatch('settings.sets.export', { file: expFile })).ok && fs.existsSync(expFile));

        profiles = [];
        const impDry = await reg.dispatch('settings.sets.import', { file: expFile, dryRun: true });
        ok('settings.sets.import dryRun names what would come in',
            impDry.ok && impDry.result.would.join() === 'my laptop' && profiles.length === 0);
        const imp = await reg.dispatch('settings.sets.import', { file: expFile });
        ok('…and importing keeps them without changing a single setting',
            imp.ok && profiles.length === 1);
        const impJunk = await reg.dispatch('settings.sets.import', { json: '[{"nope":1}]' });
        ok('…while an input with nothing valid in it is refused', !impJunk.ok && /every entry was malformed/.test(impJunk.error));
        const missSet = await reg.dispatch('settings.sets.apply', { name: 'nowhere' });
        ok('…and an unknown set points at the list', !missSet.ok && /settings\.sets/.test(missSet.error));
    }

    // ---- Claude Code's own settings.json: the catalogue is the allowlist ----
    {
        const cc = await reg.dispatch('claude.settings', {});
        ok('claude.settings reads the catalogued lines with their values',
            cc.ok && cc.result.parseError === null && cc.result.items.length === CC_CATALOG.length);

        const line = CC_CATALOG.find(i => i.kind === 'string' || i.kind === 'enum');
        const setCc = await reg.dispatch('claude.settings.set',
            { id: line.id, value: line.enum ? line.enum[0] : 'sonnet' });
        ok('claude.settings.set writes one catalogued line', setCc.ok);
        ok('‼️ …and everything else in the file survives',
            JSON.parse(fs.readFileSync(claudeFile, 'utf8')).env.KEEP_ME === '1');
        const ghostLine = await reg.dispatch('claude.settings.set', { id: 'whatever', value: 1 });
        ok('‼️ …an uncatalogued line is refused — there is deliberately NO raw overwrite op',
            !ghostLine.ok && /claude\.settings lists/.test(ghostLine.error));

        const cleared = await reg.dispatch('claude.settings.clear', { id: line.id });
        ok('claude.settings.clear removes it so the CLI default applies', cleared.ok && cleared.result.cleared === true);
        const clearAgain = await reg.dispatch('claude.settings.clear', { id: line.id });
        ok('…and clearing an unset line is reported, not failed', clearAgain.ok && clearAgain.result.cleared === false);

        fs.writeFileSync(claudeFile, '{ this is not json');
        const broken = await reg.dispatch('claude.settings.set', { id: line.id, value: 'sonnet' });
        ok('‼️ a settings.json that is not valid JSON is REFUSED, never clobbered',
            !broken.ok && /not valid JSON/.test(broken.error)
            && fs.readFileSync(claudeFile, 'utf8') === '{ this is not json');
        const readBroken = await reg.dispatch('claude.settings', {});
        ok('…and the read says so plainly', readBroken.ok && !!readBroken.result.parseError);
    }

    // ---- the fleet: roots, exclusions, defaults, packs ----
    {
        const dupes = await reg.dispatch('agents.roots.clean', { dryRun: true });
        ok('agents.roots.clean finds two spellings of one folder',
            dupes.ok && dupes.result.would.length === 1);
        const cleaned = await reg.dispatch('agents.roots.clean', {});
        ok('…and removing them leaves one', cleaned.ok && values['agentFarm.agentRoots'].length === 1);
        const nothing = await reg.dispatch('agents.roots.clean', {});
        ok('…with nothing to clean being an answer, not an error', nothing.ok && nothing.result.removed === 0);

        const ghostRoot = await reg.dispatch('agents.roots.add', { path: path.join(root, 'nowhere') });
        ok('‼️ agents.roots.add refuses a folder that is not there — it would discover nothing',
            !ghostRoot.ok && /No folder at/.test(ghostRoot.error));
        const rootB = path.join(root, 'agentsB');
        fs.mkdirSync(rootB);
        const added = await reg.dispatch('agents.roots.add', { path: rootB });
        ok('…and adds a real one', added.ok && values['agentFarm.agentRoots'].length === 2);
        const twice = await reg.dispatch('agents.roots.add', { path: rootB });
        ok('…once', twice.ok && twice.result.added === false && values['agentFarm.agentRoots'].length === 2);

        const rm = await reg.dispatch('agents.roots.remove', { path: rootA });
        ok('‼️ agents.roots.remove says how many agents leave the view, and that the folder stays',
            rm.ok && rm.result.agentsLeaving === 1 && /folder itself is untouched/.test(rm.result.note)
            && fs.existsSync(agentDir));
        const rmGhost = await reg.dispatch('agents.roots.remove', { path: rootB + 'x' });
        ok('…and a path that is not a root is named', !rmGhost.ok && /not an agent root/.test(rmGhost.error));

        const exc = await reg.dispatch('agents.exclude', { dir: agentDir });
        ok('agents.exclude hides one discovered folder', exc.ok && values['agentFarm.excludeAgentDirs'].length === 1);
        const excAgain = await reg.dispatch('agents.exclude', { dir: agentDir });
        ok('…idempotently', excAgain.ok && excAgain.result.excluded === false);
        const excGhost = await reg.dispatch('agents.exclude', { dir: path.join(root, 'not-scanned') });
        ok('…and a folder discovery never saw is refused', !excGhost.ok && /not a discovered agent folder/.test(excGhost.error));
        const inc = await reg.dispatch('agents.include', { dir: agentDir });
        ok('agents.include brings it back', inc.ok && values['agentFarm.excludeAgentDirs'].length === 0);
        const incAgain = await reg.dispatch('agents.include', { dir: agentDir });
        ok('…and one that was not excluded is reported', incAgain.ok && incAgain.result.included === false);

        const def = await reg.dispatch('agents.defaults.set', { agent: 'yazar', engine: 'gemini', model: 'gemini-3-pro' });
        ok('agents.defaults.set writes the per-agent engine default', def.ok && def.result.engine === 'gemini');
        const defBadEngine = await reg.dispatch('agents.defaults.set', { agent: 'yazar', engine: 'gpt', model: 'x' });
        ok('…an engine this build does not know lists the real ones',
            !defBadEngine.ok && /claude, codex, gemini, agy/.test(defBadEngine.error));
        const defNothing = await reg.dispatch('agents.defaults.set', { agent: 'yazar', engine: 'claude' });
        ok('…and saying neither model nor effort is refused', !defNothing.ok && /model.*effort/.test(defNothing.error));

        const packFile = path.join(root, 'out', 'yazar.agentpack');
        const pack = await reg.dispatch('agents.pack.export', { agent: 'yazar', file: packFile });
        ok('agents.pack.export writes the pack and passes the warnings through',
            pack.ok && fs.existsSync(packFile) && pack.result.warnings[0] === 'memory not included');
    }

    ok('B-7 ops appear in the catalog',
        ['settings.list', 'settings.get', 'settings.set', 'settings.reset', 'settings.sets',
            'settings.sets.save', 'settings.sets.apply', 'settings.sets.delete',
            'settings.sets.export', 'settings.sets.import', 'claude.settings',
            'claude.settings.set', 'claude.settings.clear', 'agents.roots.add',
            'agents.roots.remove', 'agents.roots.clean', 'agents.exclude', 'agents.include',
            'agents.defaults.set', 'agents.pack.export']
            .every(op => reg.catalog().some(c => c.op === op)));

    fs.rmSync(root, { recursive: true, force: true });
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
