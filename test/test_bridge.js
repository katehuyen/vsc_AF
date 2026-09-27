// Farm Bridge core (compiled core/bridge.js, pure): request parsing, the op
// registry with its self-describing farm.ops catalog, dispatch outcomes and
// the arg helpers — the machinery that lets agents drive the farm through
// request files while future features plug in with one registration.
const path = require('path');
const fs = require('fs');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { BridgeRefusal, BridgeRegistry, parseBridgeRequest, need, argStr, optStr, optNum, argSessionIds, stageBridgeCli, stagedBridgeCliPath } =
    require(path.join(__dirname, '..', 'out', 'core', 'bridge.js'));
const { antigravityStatus, syncToAntigravity } =
    require(path.join(__dirname, '..', 'out', 'core', 'antigravity.js'));
const { syncCodexExtras } = require(path.join(__dirname, '..', 'out', 'core', 'codex.js'));
const { opencodeStatus, syncToOpencode } =
    require(path.join(__dirname, '..', 'out', 'core', 'opencodesync.js'));

// ---------- parseBridgeRequest ----------
{
    const good = parseBridgeRequest('{"op":"tasks.add","args":{"agent":"dev"}}');
    ok('valid request parsed', good.op === 'tasks.add' && good.args.agent === 'dev');
    ok('missing args defaults to {}', (() => {
        const r = parseBridgeRequest('{"op":"farm.ops"}');
        return r.op === 'farm.ops' && typeof r.args === 'object' && Object.keys(r.args).length === 0;
    })());
    ok('broken JSON yields a helpful error', /valid JSON/.test(parseBridgeRequest('{nope').error));
    ok('non-object rejected', /JSON object/.test(parseBridgeRequest('[1,2]').error));
    ok('missing op points at the catalog', /farm\.ops/.test(parseBridgeRequest('{"args":{}}').error));
    // a Windows agent writing with PowerShell's `Set-Content -Encoding utf8`
    // prepends a UTF-8 BOM — the bridge must accept it, not reject it
    ok('UTF-8 BOM tolerated (PowerShell utf8 output)',
        parseBridgeRequest('﻿{"op":"farm.ops"}').op === 'farm.ops');
    ok('surrounding whitespace tolerated',
        parseBridgeRequest('\n  {"op":"tasks.list"}  \n').op === 'tasks.list');
    // PowerShell's `Get-Content -Raw` returns a DECORATED string (PSPath,
    // ReadCount…), so ConvertTo-Json emits an object instead of a string and the
    // long arg — a report body, a document — silently arrives as nothing.
    // Measured 2026-08-10: a 14 KB report vanished under an `ok: true`.
    {
        const psShaped = JSON.stringify({
            op: 'notices.post',
            args: {
                title: 'kept as-is',
                report: { value: '# rapor\n\ngövde', Length: 15, PSPath: 'C:\\x\\y.md', ReadCount: 1 },
                sections: [{ title: 't', body: 'b' }]
            }
        });
        const r = parseBridgeRequest(psShaped);
        ok('PowerShell-mangled string unwrapped', r.args.report === '# rapor\n\ngövde');
        ok('plain string args untouched', r.args.title === 'kept as-is');
        ok('legitimate object/array args untouched',
            Array.isArray(r.args.sections) && r.args.sections[0].body === 'b');
    }
    ok('an object with value but no PowerShell markers is left alone', (() => {
        const r = parseBridgeRequest('{"op":"x","args":{"a":{"value":"v","other":1}}}');
        return r.args.a && r.args.a.value === 'v';
    })());
}

// ---------- registry: register, catalog, dispatch ----------
(async () => {
    const reg = new BridgeRegistry();
    let got = null;
    reg.register([
        { op: 'x.echo', describe: 'echo args back. args: any', handler: a => ({ echoed: a }) },
        { op: 'x.boom', describe: 'always throws', handler: () => { throw new Error('kaboom'); } },
        {
            op: 'x.strict', describe: 'needs name', handler: a => {
                const name = argStr(a, 'name');
                need(name !== 'no', 'name must not be "no"');
                got = optStr(a, 'extra');
                return { name };
            }
        }
    ]);

    const cat = reg.catalog();
    ok('farm.ops is built in and catalog is sorted',
        cat[0].op === 'farm.ops' && cat.some(c => c.op === 'x.echo') && cat.every(c => c.describe.length > 0));
    const viaOp = await reg.dispatch('farm.ops', {});
    ok('farm.ops dispatch returns the catalog', viaOp.ok && viaOp.result.length === cat.length);

    const echo = await reg.dispatch('x.echo', { a: 1 });
    ok('dispatch returns the handler result', echo.ok && echo.result.echoed.a === 1);

    const unknown = await reg.dispatch('nope.op', {});
    ok('unknown op fails and mentions the catalog', !unknown.ok && /farm\.ops/.test(unknown.error));

    const boom = await reg.dispatch('x.boom', {});
    ok('a throwing handler becomes a clean error', !boom.ok && boom.error === 'kaboom');

    const missing = await reg.dispatch('x.strict', {});
    ok('argStr enforces required args', !missing.ok && /required string arg "name"/.test(missing.error));

    const refused = await reg.dispatch('x.strict', { name: 'no' });
    ok('need() turns into an error outcome', !refused.ok && /must not be/.test(refused.error));

    const fine = await reg.dispatch('x.strict', { name: ' ali ', extra: 7 });
    ok('argStr trims; optStr ignores non-strings', fine.ok && fine.result.name === 'ali' && got === '');

    // ---------- one spelling of "which sessions" ----------
    // ‼️ Once a panel can do something to a SELECTION, the bridge has to be able
    // to do it to a set or the two surfaces have drifted (_REF/agentfarm-dev.md).
    // One helper, so no op invents its own plural key.
    ok('a single sessionId is a set of one', argSessionIds({ sessionId: ' a ' }).join() === 'a');
    ok('sessionIds is the plural', argSessionIds({ sessionIds: ['a', 'b'] }).join() === 'a,b');
    ok('both together are merged, singular first',
        argSessionIds({ sessionId: 'a', sessionIds: ['b'] }).join() === 'a,b');
    ok('‼️ the same session named twice is done ONCE',
        argSessionIds({ sessionId: 'a', sessionIds: ['a', 'b', 'a'] }).join() === 'a,b');
    ok('blanks and junk are dropped', argSessionIds({ sessionIds: ['', '  ', null] }).length === 0);
    ok('nothing given is an empty set, not a crash', argSessionIds({}).length === 0);

    // and the ops that can act on a set actually say so in their contract
    {
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        for (const op of ['sessions.pin', 'sessions.tag', 'sessions.color', 'sessions.end', 'sessions.dismiss']) {
            const block = src.slice(src.indexOf(`op: '${op}'`), src.indexOf(`op: '${op}'`) + 2000);
            ok(`${op} takes a set and its describe says so`,
                /argSessionIds\(args\)/.test(block) && /sessionIds/.test(block));
        }
        const pin = src.slice(src.indexOf("op: 'sessions.pin'"), src.indexOf("op: 'sessions.pin'") + 1400);
        ok('‼️ a bulk pin refuses to toggle — a set must be told which way to go',
            /pinned \(true\/false\) is required for a set/.test(pin));
        // ‼️ K-35 — the colour reaches a `style` attribute in a webview, so the
        // op must not be the place a raw string gets through. It normalises
        // with the store's own function, which is the SAME one the page's
        // message and a hand-edited globalState go through.
        const col = src.slice(src.indexOf("op: 'sessions.color'"), src.indexOf("op: 'sessions.color'") + 1400);
        ok('‼️ sessions.color validates through the store rather than trusting its caller',
            /normalizeColor\(args\.color\)/.test(col) && /setColor\(next, id, want\)/.test(col));
        ok('…and its describe names the swatches the card offers, from the same list',
            /SESSION_COLORS\.join/.test(col));
    }

    // ---------- X-3: engines.status, registered the way the extension does ----------
    // ‼️ The one op in the catalogue that is ABOUT credentials and must never
    // carry one. It is dispatched here with the real matrix behind it, and the
    // result is checked for the shape a caller reads — plus checked for the
    // absence of anything that looks like a token.
    {
        const { readEngines, enginesSummary } =
            require(path.join(__dirname, '..', 'out', 'core', 'engines.js'));
        const probe = {
            readHome: rel => (rel === '.codex/auth.json'
                ? JSON.stringify({
                    auth_mode: 'chatgpt', OPENAI_API_KEY: null,
                    tokens: { access_token: 'sk-secret-do-not-leak', refresh_token: 'rt-secret' },
                    last_refresh: '2026-08-09T10:31:36.731385700Z'
                })
                : undefined),
            existsHome: () => false,
            which: cmd => (cmd === 'codex' ? '/usr/bin/codex' : undefined),
            hasSecret: () => false,
            hasEnv: () => false
        };
        const r2 = new BridgeRegistry();
        r2.register([{
            op: 'engines.status',
            describe: 'Which agent CLIs this machine can run and how each is paid for. args: id?',
            handler: (args) => {
                const id = String((args && args.id) || '').trim().toLowerCase();
                const all = readEngines(probe);
                const list = id ? all.filter(e => e.id === id) : all;
                return { ...enginesSummary(all), engines: list };
            }
        }]);
        ok('engines.status is in the catalogue',
            (await r2.dispatch('farm.ops', {})).result.some(c => c.op === 'engines.status'));

        const all = await r2.dispatch('engines.status', {});
        ok('it dispatches and counts what can run',
            all.ok && all.result.total === 5 && all.result.ready === 1 && all.result.onPlan === 1);
        const one = await r2.dispatch('engines.status', { id: 'codex' });
        ok('…and answers about one engine when asked',
            one.ok && one.result.engines.length === 1 && one.result.engines[0].id === 'codex');
        ok('‼️ the answer says HOW it is paid for, which is the point of the op',
            one.result.engines[0].auth.mode === 'subscription'
            && /plan/.test(one.result.engines[0].next));
        // The bridge is a plaintext file channel (core/secrets.ts, the security
        // exception). A token reaching it would be the one unrecoverable bug.
        const wire = JSON.stringify(all.result);
        ok('‼️ NO CREDENTIAL CROSSES THE BRIDGE — not the access token, not the refresh token',
            !wire.includes('sk-secret-do-not-leak') && !wire.includes('rt-secret')
            && !/access_token|refresh_token/.test(wire));
    }

    // ---------- S-20: engines.models, registered the way the extension does ----------
    // ‼️ The op exists so an agent told "run this on Codex with the fast model"
    // can find out what Codex actually calls its models. Without it the only
    // available names are Claude's aliases, and passing one is a --model the CLI
    // rejects — on an unattended task, hours later, in a file nobody reads.
    {
        const { readEngineModels } = require(path.join(__dirname, '..', 'out', 'core', 'models.js'));
        const probe = {
            readHome: rel => (rel === '.codex/models_cache.json'
                ? JSON.stringify({
                    fetched_at: '2026-08-10T06:57:08.834Z',
                    models: [{
                        slug: 'gpt-5.6-sol', display_name: 'GPT-5.6-Sol', priority: 1, visibility: 'list',
                        description: 'Latest frontier agentic coding model.',
                        default_reasoning_level: 'low',
                        supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }]
                    }]
                })
                : undefined),
            existsHome: () => false, which: () => undefined, hasSecret: () => false, hasEnv: () => false
        };
        const r3 = new BridgeRegistry();
        r3.register([{
            op: 'engines.models',
            describe: 'Which models an engine offers right now. args: id?',
            handler: (args) => {
                const id = String((args && args.id) || '').trim().toLowerCase();
                const all = readEngineModels(probe, ['sonnet', 'opus']);
                need(!id || !!all[id], `no engine called "${id}"`);
                return id ? { [id]: all[id] } : all;
            }
        }]);
        ok('engines.models is in the catalogue',
            (await r3.dispatch('farm.ops', {})).result.some(c => c.op === 'engines.models'));
        const one = await r3.dispatch('engines.models', { id: 'codex' });
        ok('‼️ it answers with the ENGINE\'s models, not the alias list',
            one.ok && one.result.codex.models.map(m => m.id).join() === ',gpt-5.6-sol');
        ok('…and with the efforts that model supports',
            one.result.codex.efforts['gpt-5.6-sol'].map(e => e.id).join() === ',low,high');
        ok('…and says the answer came from the engine itself', one.result.codex.source === 'catalog');
        const claude = await r3.dispatch('engines.models', { id: 'claude' });
        ok('a different engine gets a different list',
            claude.ok && claude.result.claude.models.map(m => m.id).includes('sonnet'));
        const bad = await r3.dispatch('engines.models', { id: 'nope' });
        ok('an unknown engine is refused by name', !bad.ok && /no engine called "nope"/.test(bad.error));
    }

    // ---------- A-11: launch profiles, from the bridge as well as the picker ----
    //
    // The launcher grew edit / replace / delete on its rows; the rule
    // (_REF/agentfarm-dev.md) is that a function the user can trigger reaches
    // the bridge in the same commit, so an agent asked to "clean up my profiles"
    // is not left telling the user to do it by hand. Registered here the way the
    // extension registers it — over the SAME core functions and the same one
    // write path, because two implementations of "one name, one profile" is how
    // the picker and the bridge came to disagree in the first place.
    {
        const { profileFrom, saveProfile, renameProfile, deleteProfile, describeProfile } =
            require(path.join(__dirname, '..', 'out', 'core', 'launchProfiles.js'));
        let stored = [{ name: 'gece', model: 'haiku', effort: 'low', permissionMode: '' }];
        const write = async (next) => { stored = next; return true; };
        const r4 = new BridgeRegistry();
        r4.register([
            { op: 'launch.profiles', describe: 'the saved launch setups', handler: () => stored },
            {
                op: 'launch.profile.set', describe: 'create or replace one. args: name, engine',
                handler: async (a) => {
                    const name = String(a.name || '').trim();
                    need(!!name, 'a profile needs a name');
                    const p = profileFrom({
                        engine: String(a.engine || ''), model: String(a.model || ''),
                        effort: String(a.effort || ''), permissionMode: String(a.permissionMode || ''),
                        prompt: String(a.prompt || '')
                    }, name);
                    await write(saveProfile(stored, p));
                    return { name, stored: describeProfile(p), profiles: stored.length };
                }
            },
            {
                op: 'launch.profile.rename', describe: 'rename one. args: name, to',
                handler: async (a) => {
                    need(stored.some(p => p.name === a.name), `no launch profile called "${a.name}"`);
                    await write(renameProfile(stored, String(a.name), String(a.to || '')));
                    return { name: a.to };
                }
            },
            {
                op: 'launch.profile.delete', describe: 'delete one. args: name',
                handler: async (a) => {
                    need(stored.some(p => p.name === a.name), `no launch profile called "${a.name}"`);
                    await write(deleteProfile(stored, String(a.name)));
                    return { name: a.name, profiles: stored.length };
                }
            }
        ]);
        const cat = (await r4.dispatch('farm.ops', {})).result.map(c => c.op);
        ok('all four launch-profile ops are catalogued',
            ['launch.profiles', 'launch.profile.set', 'launch.profile.rename', 'launch.profile.delete']
                .every(op => cat.includes(op)));
        ok('the list is what the launcher would offer',
            (await r4.dispatch('launch.profiles', {})).result[0].name === 'gece');
        await r4.dispatch('launch.profile.set', { name: 'derin', model: 'opus', effort: 'xhigh' });
        ok('a profile can be made without opening the launcher', stored.length === 2);
        await r4.dispatch('launch.profile.set', { name: 'derin', model: 'fable', effort: 'high' });
        ok('‼️ …and saving the same name REPLACES it — two rows with one name is an unusable picker',
            stored.length === 2 && stored.find(p => p.name === 'derin').model === 'fable');
        // ‼️ A-11 — the dimension the whole item turned on. A bridge that could
        // not store an engine could only write profiles that load wrong.
        const eng = await r4.dispatch('launch.profile.set',
            { name: 'kodex', engine: 'codex', model: 'gpt-5.1-codex-max' });
        ok('‼️ a profile made from the bridge carries its ENGINE',
            stored.find(p => p.name === 'kodex').engine === 'codex');
        ok('…and the op says back what it stored, in the launcher\'s words',
            /^Codex/.test(eng.result.stored));
        await r4.dispatch('launch.profile.rename', { name: 'derin', to: 'derin düşünme' });
        ok('rename keeps what it stores',
            stored.some(p => p.name === 'derin düşünme' && p.model === 'fable'));
        ok('…and its place in the list, which is the user\'s order',
            stored.map(p => p.name).join(',') === 'gece,derin düşünme,kodex');
        const ghost = await r4.dispatch('launch.profile.delete', { name: 'yok' });
        ok('‼️ deleting one that was never there is an ERROR, not a quiet success',
            !ghost.ok && /no launch profile called "yok"/.test(ghost.error));
        await r4.dispatch('launch.profile.delete', { name: 'gece' });
        ok('…and deleting a real one leaves the rest alone',
            stored.length === 2 && stored[0].name === 'derin düşünme');
        const unnamed = await r4.dispatch('launch.profile.set', { model: 'opus' });
        ok('a profile with no name is refused', !unnamed.ok && /needs a name/.test(unnamed.error));
    }

    // ---------- U-27: usage.engines, registered the way the extension does ----------
    // ‼️ The op exists so an agent asking "how much is left" cannot be handed
    // Claude's percentage for a Codex run. Its sharpest contract is what it does
    // NOT do: an engine whose figure has not arrived comes back as `unknown`
    // with no bars, never as 0%.
    {
        const EU = require(path.join(__dirname, '..', 'out', 'core', 'engineUsage.js'));
        const LINE = JSON.stringify({
            type: 'event_msg',
            payload: {
                type: 'token_count',
                rate_limits: {
                    primary: { used_percent: 7, window_minutes: 10080, resets_at: 1786903688 },
                    secondary: null, plan_type: 'plus'
                }
            }
        });
        const probe = { newestFiles: () => ['a.jsonl'], readTail: () => LINE };
        const r4 = new BridgeRegistry();
        r4.register([{
            op: 'usage.engines',
            describe: 'What is left on every engine\'s plan. args: id?',
            handler: (args) => {
                const id = String((args && args.id) || '').trim().toLowerCase();
                const all = EU.readEngineUsage(probe, () => 1786903000000, {
                    state: 'ok', plan: 'max', fetchedAt: 1, note: 'from the endpoint',
                    bars: [{ id: 'five_hour', title: 'Current session', percent: 86, resetsAt: 0 }]
                });
                need(!id || all.some(e => e.id === id), `no engine called "${id}"`);
                return { shown: 'claude', engines: (id ? all.filter(e => e.id === id) : all) };
            }
        }]);
        ok('usage.engines is in the catalogue',
            (await r4.dispatch('farm.ops', {})).result.some(c => c.op === 'usage.engines'));
        const all = await r4.dispatch('usage.engines', {});
        // ‼️ U-59 — FIVE, AND THE NUMBER IS THE ASSERTION. An engine absent from
        // this matrix is absent from the status bar, the Dashboard card and this
        // op at once, and a caller then reads the farm as having one fewer
        // engine than it has.
        ok('every engine answers', all.ok && all.result.engines.length === 5);
        const by = Object.fromEntries(all.result.engines.map(e => [e.id, e]));
        ok('Codex\'s own transcript is a real quota reading',
            by.codex.state === 'ok' && by.codex.bars[0].percent === 7);
        // X-306 — Antigravity has a source now (its own /usage, run by the
        // extension in the background); with nothing handed in it is `unknown`.
        ok('‼️ an engine whose figure has not arrived says so, and shows NO bar',
            by.agy.state === 'unknown' && by.agy.bars.length === 0);
        ok('‼️ …and a per-token engine is not a plan at 0% either',
            by.gemini.state === 'no-plan' && by.gemini.bars.length === 0);
        ok('the op says which engine the indicator is showing', all.result.shown === 'claude');
        const badU = await r4.dispatch('usage.engines', { id: 'nope' });
        ok('an unknown engine is refused by name', !badU.ok && /no engine called "nope"/.test(badU.error));
    }

    // ---------- U-29: agents.defaults, registered the way the extension does ----------
    // ‼️ The op answers the question the item was filed for: an agent set to
    // `sonnet` for Claude is set to NOTHING for Codex, and the old single default
    // made those two look identical.
    {
        const AD = require(path.join(__dirname, '..', 'out', 'core', 'agentDefaults.js'));
        const store = AD.withAgentDefault({}, 'D:/agents/dev', 'codex', { model: 'gpt-5.6-terra' });
        const ENG = [{ id: 'claude', label: 'Claude Code' }, { id: 'codex', label: 'Codex' }];
        const r5 = new BridgeRegistry();
        r5.register([{
            op: 'agents.defaults',
            describe: 'What "Default" means for an agent on an engine. args: agent?, engine?',
            handler: (args) => {
                const want = String((args && args.engine) || '').trim().toLowerCase();
                need(!want || ENG.some(e => e.id === want), `no engine called "${want}"`);
                return [{
                    agent: 'dev', dir: 'D:/agents/dev',
                    engines: ENG.filter(e => !want || e.id === want).map(e => ({
                        id: e.id, label: e.label,
                        model: AD.resolveDefault(e.id, 'model', {
                            agentFile: e.id === 'claude' ? 'sonnet' : '',
                            farm: AD.storedDefault(store, 'D:/agents/dev', e.id).model,
                            launch: '', engineLabel: e.label
                        })
                    }))
                }];
            }
        }]);
        ok('agents.defaults is in the catalogue',
            (await r5.dispatch('farm.ops', {})).result.some(c => c.op === 'agents.defaults'));
        const res = await r5.dispatch('agents.defaults', {});
        const eng = Object.fromEntries(res.result[0].engines.map(e => [e.id, e]));
        ok('Claude resolves from the agent\'s own settings file',
            eng.claude.model.value === 'sonnet' && eng.claude.model.origin === 'agent-file');
        ok('‼️ …and Codex does NOT inherit that file',
            eng.codex.model.value === 'gpt-5.6-terra' && eng.codex.model.origin === 'farm');
        // ‼️ U-59 — `-m`, not `--model`: the sentence named a flag Codex does not
        // take, and did so for three engines out of four.
        ok('…and every answer says which layer decided it',
            /passes it as -m /.test(eng.codex.model.note));
        const badD = await r5.dispatch('agents.defaults', { engine: 'nope' });
        ok('an unknown engine is refused by name', !badD.ok && /no engine called "nope"/.test(badD.error));
    }

    // ---------- §19.C: agents.sync op contract (cross-engine forward sync) ----------
    // Registers the real handler shape (backed by the compiled antigravity + codex
    // functions) and dispatches it, proving the op is catalogued and honours its
    // non-destructive contract — the same wiring extension.ts registers at activate().
    {
        const base = fs.mkdtempSync(path.join(os.tmpdir(), 'af-bridge-sync-'));
        // A nest: the shared constitution one level up, the agent below it, and
        // the agent folder as its OWN git worktree — the one layout where
        // OpenCode's instruction walk cannot reach the constitution. That is the
        // state the reply has to be able to say out loud.
        fs.writeFileSync(path.join(base, 'CLAUDE.md'), '# Anayasa\n');
        fs.writeFileSync(path.join(base, 'AGENTS.md'), '# Anayasa aynasi\n');
        const dir = path.join(base, 'dev');
        fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Ajan\n\nBkz. CLAUDE.md.\n');
        const agent = { name: 'dev', dir, duties: [], constitutionPath: path.join(base, 'CLAUDE.md') };
        reg.register({
            op: 'agents.sync',
            describe: 'Cross-engine sync: CLAUDE.md → AGENTS.md + Codex MCP snippet + the OpenCode lane. args: agent, force?',
            handler: (a) => {
                const st = antigravityStatus(agent.dir, agent.constitutionPath);
                if ((st.state === 'conflict' || st.state === 'foreign' || st.state === 'antigravity-ahead')
                    && a.force !== true) {
                    return {
                        agent: agent.name, state: st.state, synced: false,
                        opencode: opencodeStatus(agent.dir, agent.constitutionPath)
                    };
                }
                const ag = syncToAntigravity(agent.dir, agent.duties, { force: true, constitutionPath: agent.constitutionPath });
                const cx = syncCodexExtras(agent.dir);
                const oc = syncToOpencode(agent.dir, agent.duties, { force: true, constitutionPath: agent.constitutionPath });
                return {
                    agent: agent.name, state: 'in-sync', synced: true,
                    written: [...ag.written, ...cx.written, ...oc.written],
                    opencode: opencodeStatus(agent.dir, agent.constitutionPath)
                };
            }
        });
        ok('agents.sync appears in the catalog', reg.catalog().some(c => c.op === 'agents.sync'));

        const first = await reg.dispatch('agents.sync', { agent: 'dev' });
        ok('agents.sync forward-syncs a fresh agent', first.ok && first.result.synced === true &&
            fs.existsSync(path.join(dir, 'AGENTS.md')));
        // ‼️ The reply says where the fifth engine stands, or an agent asking why
        // a rule was ignored has nothing to read.
        ok('agents.sync reports the OpenCode lane', !!first.result.opencode &&
            typeof first.result.opencode.reachesConstitution === 'boolean' &&
            typeof first.result.opencode.worktree === 'string');
        ok('agents.sync repaired the out-of-reach constitution',
            first.result.opencode.configState === 'ours' &&
            first.result.written.includes('opencode.json'));

        // Hand-edit AGENTS.md → antigravity-ahead → guard refuses without force.
        fs.appendFileSync(path.join(dir, 'AGENTS.md'), '\nElle eklenen satır.\n');
        const guarded = await reg.dispatch('agents.sync', { agent: 'dev' });
        ok('agents.sync is non-destructive on divergence (no force)',
            guarded.ok && guarded.result.synced === false && guarded.result.state === 'antigravity-ahead');
        ok('the OpenCode state is still reported when another lane is in conflict',
            !!guarded.result.opencode && guarded.result.opencode.identity === 'AGENTS.md');

        const forced = await reg.dispatch('agents.sync', { agent: 'dev', force: true });
        ok('agents.sync with force overwrites from CLAUDE.md', forced.ok && forced.result.synced === true);

        try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
    }

    // ---------- §19.C: constitution.sync op contract (the shared instructions) ----------
    // The nest root's own CLAUDE.md is what Claude Code loads for every child
    // agent; the op mirrors it to the files the other engines read, and never
    // writes the constitution itself.
    {
        const nest = fs.mkdtempSync(path.join(os.tmpdir(), 'af-bridge-const-'));
        fs.mkdirSync(path.join(nest, 'dev'));
        fs.writeFileSync(path.join(nest, 'CLAUDE.md'), '# Anayasa\n\nOrtak kurallar.\n');
        fs.writeFileSync(path.join(nest, 'dev', 'CLAUDE.md'), '# Dev\n');
        reg.register({
            op: 'constitution.sync',
            describe: 'Mirror the shared constitution to AGENTS.md (Codex) + .agents/AGENTS.md (Antigravity). args: root?, force?',
            handler: (a) => {
                const st = antigravityStatus(nest);
                if ((st.state === 'conflict' || st.state === 'foreign' || st.state === 'antigravity-ahead')
                    && a.force !== true) {
                    return { root: nest, state: st.state, synced: false };
                }
                const ag = syncToAntigravity(nest, [], { force: true });
                const cx = syncCodexExtras(nest);
                return { root: nest, state: 'in-sync', synced: true, written: [...ag.written, ...cx.written] };
            }
        });
        ok('constitution.sync appears in the catalog', reg.catalog().some(c => c.op === 'constitution.sync'));

        const first = await reg.dispatch('constitution.sync', {});
        ok('constitution.sync mirrors both engine lanes', first.ok && first.result.synced === true &&
            fs.existsSync(path.join(nest, 'AGENTS.md')) &&
            fs.existsSync(path.join(nest, '.agents', 'AGENTS.md')));
        ok('constitution.sync never writes CLAUDE.md',
            fs.readFileSync(path.join(nest, 'CLAUDE.md'), 'utf8') === '# Anayasa\n\nOrtak kurallar.\n');

        fs.appendFileSync(path.join(nest, 'AGENTS.md'), '\nElle eklenen satır.\n');
        const guarded = await reg.dispatch('constitution.sync', {});
        ok('constitution.sync is non-destructive on divergence (no force)',
            guarded.ok && guarded.result.synced === false && guarded.result.state === 'antigravity-ahead');

        try { fs.rmSync(nest, { recursive: true, force: true }); } catch {}
    }

    // ---------- §19.C: tasks board ops contract (rerun / runNext / clearFinished) ----------
    // Same handler shapes extension.ts registers, against a mock TaskManager —
    // proves the ops are catalogued and guard their status preconditions.
    {
        const tasks = [
            { id: 'q1', status: 'queued', title: 'queued job' },
            { id: 'r1', status: 'running', title: 'live job' },
            { id: 'f1', status: 'failed', title: 'broken job' },
            { id: 'd1', status: 'done', title: 'done job' }
        ];
        const mgr = {
            tasks,
            retried: [], bumped: [],
            retryTask(t) { this.retried.push(t.id); return { id: t.id + '-retry', status: 'queued' }; },
            runTaskNext(t) { this.bumped.push(t.id); },
            clearFinished() { return tasks.filter(t => t.status !== 'queued' && t.status !== 'running').length; }
        };
        reg.register([
            {
                op: 'tasks.rerun',
                describe: 'Re-run a finished task as a fresh copy (a workflow-step task resumes its chain). args: id',
                handler: (args) => {
                    const t = mgr.tasks.find(x => x.id === argStr(args, 'id'));
                    need(t, 'Task not found — tasks.list shows current ids.');
                    need(t.status !== 'queued' && t.status !== 'running',
                        'Only a finished task can be re-run — it is still queued/running.');
                    const copy = mgr.retryTask(t);
                    return copy ? { id: copy.id, status: copy.status } : { resumedWorkflow: true };
                }
            },
            {
                op: 'tasks.runNext',
                describe: 'Bump a queued task to the front of the queue and request an immediate start. args: id',
                handler: (args) => {
                    const t = mgr.tasks.find(x => x.id === argStr(args, 'id'));
                    need(t, 'Task not found — tasks.list shows current ids.');
                    need(t.status === 'queued', 'Only a queued task can be bumped.');
                    mgr.runTaskNext(t);
                    return { id: t.id, status: t.status };
                }
            },
            {
                op: 'tasks.clearFinished',
                describe: 'Clear all finished (done/failed/cancelled) tasks from the board — history is archived first, output files are deleted. args: none',
                handler: () => ({ removed: mgr.clearFinished() })
            }
        ]);
        ok('tasks board ops appear in the catalog', ['tasks.rerun', 'tasks.runNext', 'tasks.clearFinished']
            .every(op => reg.catalog().some(c => c.op === op)));

        const rr = await reg.dispatch('tasks.rerun', { id: 'f1' });
        ok('tasks.rerun re-runs a failed task', rr.ok && rr.result.id === 'f1-retry' && mgr.retried.includes('f1'));
        const rrLive = await reg.dispatch('tasks.rerun', { id: 'r1' });
        ok('tasks.rerun refuses a running task', !rrLive.ok && /still queued\/running/.test(rrLive.error));

        const rn = await reg.dispatch('tasks.runNext', { id: 'q1' });
        ok('tasks.runNext bumps a queued task', rn.ok && mgr.bumped.includes('q1'));
        const rnDone = await reg.dispatch('tasks.runNext', { id: 'd1' });
        ok('tasks.runNext refuses a finished task', !rnDone.ok && /Only a queued task/.test(rnDone.error));

        const cf = await reg.dispatch('tasks.clearFinished', {});
        ok('tasks.clearFinished reports the removed count', cf.ok && cf.result.removed === 2);
    }

    // ---------- B-4: task and mission LIFECYCLE parity ----------
    // Everything the tree and the page could do to a run that the bridge could
    // not: start it where it stands (runNext reorders, which is a different
    // gesture), release a run a ceiling is holding, finish a live one by hand,
    // reorder the queue, put a deleted row back, pick a cut chain up, and start
    // a finished mission over or drop it from the history. Same handler shapes
    // extension.ts registers — the guards are what these prove.
    {
        const board = [
            { id: 'q1', status: 'queued', title: 'first', agentId: 'a1', agentName: 'dev' },
            { id: 'q2', status: 'queued', title: 'second', agentId: 'a1', agentName: 'dev' },
            { id: 'q3', status: 'queued', title: 'third', agentId: 'a1', agentName: 'dev', autoStart: true, deferredReason: 'over budget ($12 of $10)' },
            { id: 'q4', status: 'queued', title: 'fourth', agentId: 'a1', agentName: 'dev' },
            { id: 'r1', status: 'running', title: 'live', agentId: 'a1', agentName: 'dev' },
            { id: 'f1', status: 'failed', title: 'step 2/3', agentId: 'a1', agentName: 'dev', workflowId: 'w1', stepIndex: 1, workflowRunId: 'run1' },
            { id: 'f2', status: 'failed', title: 'standalone', agentId: 'a1', agentName: 'dev' }
        ];
        const archived = [{ id: 'gone1', status: 'done', title: 'the deleted one' }];
        const m2 = {
            tasks: board,
            workflows: [{ id: 'w1', title: 'the chain', steps: [{}, {}, {}] }],
            archivedMonths: ['2026-07', '2026-08'],
            archivedTasks: () => archived,
            restored: [], resumed: [], moved: null, launch: true,
            startTask(t) { if (this.launch) { t.status = 'running'; return true; } t.autoStart = true; t.deferredReason = 'over budget ($12 of $10)'; return false; },
            unparkTask(t) { t.deferredReason = undefined; return this.startTask(t); },
            completeTask(t) { t.status = 'done'; t.endedAt = 1234; },
            moveTaskTo(t, i) { this.moved = { id: t.id, i }; return Math.max(0, Math.min(2, i)); },
            restoreTasks(list) { this.restored.push(...list.map(t => t.id)); return list.length; },
            resumeWorkflowFromTask(t) { this.resumed.push(t.id); }
        };
        const specs = [{ id: 's1', title: 'the mission', limits: { maxCostUSD: 5 } }];
        let runs = [
            { id: 'm1', specId: 's1', status: 'done' },
            { id: 'm2', specId: 's1', status: 'running' },
            { id: 'm3', specId: 's2', status: 'failed' }
        ];
        const store = {
            get runs() { return runs; }, set runs(v) { runs = v; },
            specs, spec: (id) => specs.find(s => s.id === id) || (id === 's2' ? { id: 's2', title: 'the lonely one', limits: { maxCostUSD: 2 } } : undefined),
            run: (id) => runs.find(r => r.id === id)
        };
        const started = [];
        const findTask = (args) => {
            const t = m2.tasks.find(x => x.id === argStr(args, 'id'));
            need(t, 'Task not found — tasks.list shows current ids.');
            return t;
        };
        reg.register([
            {
                op: 'tasks.start',
                describe: 'Start this queued task where it is (not tasks.runNext, which reorders the queue). A ceiling parks it instead: started:false with heldBy. args: id',
                handler: (args) => {
                    const t = findTask(args);
                    need(t.status === 'queued', `Task is ${t.status} — only a queued task can be started.`);
                    const s = m2.startTask(t);
                    return { id: t.id, status: t.status, started: s, heldBy: s ? null : (t.deferredReason ?? 'a launch ceiling') };
                }
            },
            {
                op: 'tasks.unpark',
                describe: 'Release a run a ceiling is holding and ask for the launch again. args: id',
                handler: (args) => {
                    const t = findTask(args);
                    need(t.status === 'queued', `Task is ${t.status} — only a queued task can be held.`);
                    need(t.autoStart, 'That task is not held by anything — tasks.start starts it.');
                    const wasHeldBy = t.deferredReason ?? null;
                    const s = m2.unparkTask(t);
                    return { id: t.id, wasHeldBy, started: s, heldBy: s ? null : (t.deferredReason ?? 'a launch ceiling') };
                }
            },
            {
                op: 'tasks.complete',
                describe: 'Mark a RUNNING task done by hand. args: id',
                handler: (args) => {
                    const t = findTask(args);
                    need(t.status === 'running', `Task is ${t.status} — only a running task can be completed by hand.`);
                    m2.completeTask(t);
                    return { id: t.id, status: t.status, endedAt: t.endedAt ?? null };
                }
            },
            {
                op: 'tasks.move',
                describe: 'Reorder the queue: `to` (0-based) or `dir` ("up"|"down"). args: id, to?, dir?',
                handler: (args) => {
                    const t = findTask(args);
                    need(t.status === 'queued', `Task is ${t.status} — only a queued task has a place in the queue.`);
                    const dir = optStr(args, 'dir').toLowerCase();
                    const hasTo = args.to !== undefined && args.to !== null && args.to !== '';
                    need(hasTo || dir, 'Say where: `to` (0-based place) or `dir` ("up"|"down").');
                    need(!(hasTo && dir), 'Pass `to` or `dir`, not both.');
                    const siblings = m2.tasks.filter(x => x.agentId === t.agentId && x.status === 'queued');
                    const from = siblings.indexOf(t);
                    let target;
                    if (hasTo) {
                        need(Number.isFinite(Number(args.to)), '`to` is a number — 0 is next up.');
                        target = Math.trunc(Number(args.to));
                    } else {
                        need(dir === 'up' || dir === 'down', `dir is "up" or "down" — not "${dir}"`);
                        target = from + (dir === 'up' ? -1 : 1);
                        need(target >= 0 && target < siblings.length,
                            dir === 'up' ? 'It is already first in its queue.' : 'It is already last in its queue.');
                    }
                    return { id: t.id, from, to: m2.moveTaskTo(t, target), queued: siblings.length };
                }
            },
            {
                op: 'tasks.restore',
                describe: 'Put a deleted run back on the board from the month archive (its output file does not come back). args: id, month?',
                handler: (args) => {
                    const id = argStr(args, 'id');
                    need(!m2.tasks.some(t => t.id === id), 'That run is already on the board — tasks.list shows it.');
                    const month = optStr(args, 'month');
                    need(!month || /^\d{4}-\d{2}$/.test(month), 'month is "YYYY-MM" — omit it to search all of them.');
                    const months = month ? [month] : m2.archivedMonths.slice().reverse();
                    need(months.length, 'Nothing has been archived yet — there is no run to restore.');
                    const row = m2.archivedTasks(months).find(t => t.id === id);
                    need(row, `No run "${id}" in any archived month — tasks.history lists what is there.`);
                    return { restored: m2.restoreTasks([row]), id, title: row.title, outputFile: null };
                }
            },
            {
                op: 'workflows.resume',
                describe: 'Pick a cut chain back up at the step that broke, in the same run. args: taskId',
                handler: (args) => {
                    const t = m2.tasks.find(x => x.id === argStr(args, 'taskId'));
                    need(t, 'Task not found — tasks.list shows current ids.');
                    need(t.workflowId && t.stepIndex !== undefined,
                        `"${t.title}" is not a workflow step — it belongs to no chain to resume.`);
                    const w = m2.workflows.find(x => x.id === t.workflowId);
                    need(w, `The workflow "${t.title}" belonged to no longer exists.`);
                    need(t.stepIndex < w.steps.length,
                        `Step ${t.stepIndex + 1} no longer exists in "${w.title}" — the workflow was edited since this run.`);
                    m2.resumeWorkflowFromTask(t);
                    return { workflow: w.title, step: t.stepIndex + 1, steps: w.steps.length, fromTask: t.id };
                }
            },
            {
                op: 'missions.rerun',
                describe: 'Run a FINISHED mission again — same goal, team and limits, as a new run. COST-BEARING. args: id',
                handler: (args) => {
                    const r = store.run(argStr(args, 'id'));
                    need(r, 'Run not found — missions.list shows current ids.');
                    need(['done', 'failed', 'cancelled'].includes(r.status),
                        `Run is ${r.status} — only a finished run can be started over (missions.resume continues a live one).`);
                    const spec = store.spec(r.specId);
                    need(spec, 'The mission spec this run came from no longer exists — there is nothing to repeat.');
                    const fresh = { id: 'new-' + r.id, specId: spec.id, status: 'running' };
                    store.runs = [...store.runs, fresh];
                    started.push(fresh.id);
                    return { id: fresh.id, from: r.id, title: spec.title, maxCostUSD: spec.limits.maxCostUSD };
                }
            },
            {
                op: 'missions.run.delete',
                describe: 'Drop a FINISHED mission run from the history; the spec goes with its last run. args: id',
                handler: (args) => {
                    const r = store.run(argStr(args, 'id'));
                    need(r, 'Run not found — missions.list shows current ids.');
                    need(['done', 'failed', 'cancelled'].includes(r.status),
                        `Run is ${r.status} — cancel it first (missions.cancel); a live run is not deleted out from under itself.`);
                    const spec = store.spec(r.specId);
                    store.runs = store.runs.filter(x => x.id !== r.id);
                    const specDeleted = !!spec && !store.runs.some(x => x.specId === spec.id);
                    return { id: r.id, title: spec?.title ?? r.id, specDeleted };
                }
            }
        ]);
        ok('B-4 lifecycle ops appear in the catalog',
            ['tasks.start', 'tasks.unpark', 'tasks.complete', 'tasks.move', 'tasks.restore',
                'workflows.resume', 'missions.rerun', 'missions.run.delete']
                .every(op => reg.catalog().some(c => c.op === op)));

        const st = await reg.dispatch('tasks.start', { id: 'q1' });
        ok('tasks.start starts a queued task where it stands', st.ok && st.result.started === true);
        const stDone = await reg.dispatch('tasks.start', { id: 'f2' });
        ok('…and refuses anything that is not queued', !stDone.ok && /only a queued task/i.test(stDone.error));
        m2.launch = false;
        const stHeld = await reg.dispatch('tasks.start', { id: 'q2' });
        ok('‼️ a ceiling means started:false with the reason, never a silent "started"',
            stHeld.ok && stHeld.result.started === false && /over budget/.test(stHeld.result.heldBy));

        const up = await reg.dispatch('tasks.unpark', { id: 'q3' });
        ok('tasks.unpark reports what WAS holding it and whether it got away',
            up.ok && /over budget/.test(up.result.wasHeldBy) && up.result.started === false);
        const upFree = await reg.dispatch('tasks.unpark', { id: 'q4' });
        ok('…and a task nothing is holding is refused, not "unparked"',
            !upFree.ok && /not held by anything/.test(upFree.error));

        const done = await reg.dispatch('tasks.complete', { id: 'r1' });
        ok('tasks.complete finishes a running task by hand', done.ok && done.result.status === 'done');
        const doneAgain = await reg.dispatch('tasks.complete', { id: 'r1' });
        ok('…and a finished one cannot be completed twice', !doneAgain.ok && /only a running task/i.test(doneAgain.error));

        const mv = await reg.dispatch('tasks.move', { id: 'q3', to: 0 });
        ok('tasks.move takes an exact place', mv.ok && m2.moved.i === 0 && mv.result.to === 0);
        const mvDir = await reg.dispatch('tasks.move', { id: 'q3', dir: 'up' });
        ok('…or one step', mvDir.ok);
        const mvTop = await reg.dispatch('tasks.move', { id: 'q2', dir: 'up' });
        ok('…which says so at the top instead of pretending', !mvTop.ok && /already first/.test(mvTop.error));
        const mvBoth = await reg.dispatch('tasks.move', { id: 'q3', to: 1, dir: 'up' });
        ok('…and "to" with "dir" is a contradiction, not a guess', !mvBoth.ok && /not both/.test(mvBoth.error));
        const mvNone = await reg.dispatch('tasks.move', { id: 'q3' });
        ok('…and saying neither is refused', !mvNone.ok && /Say where/.test(mvNone.error));

        const rest = await reg.dispatch('tasks.restore', { id: 'gone1' });
        ok('tasks.restore brings a deleted run back from the archive',
            rest.ok && rest.result.restored === 1 && m2.restored.includes('gone1'));
        ok('‼️ …and never claims the output file came back too', rest.result.outputFile === null);
        const restLive = await reg.dispatch('tasks.restore', { id: 'q1' });
        ok('…a row already on the board is refused, not duplicated',
            !restLive.ok && /already on the board/.test(restLive.error));
        const restNone = await reg.dispatch('tasks.restore', { id: 'never' });
        ok('…and an id in no archive is named honestly', !restNone.ok && /in any archived month/.test(restNone.error));

        const res = await reg.dispatch('workflows.resume', { taskId: 'f1' });
        ok('workflows.resume re-enters the chain at the step that broke',
            res.ok && res.result.step === 2 && m2.resumed.includes('f1'));
        const resPlain = await reg.dispatch('workflows.resume', { taskId: 'f2' });
        ok('…and a task belonging to no chain is refused', !resPlain.ok && /not a workflow step/.test(resPlain.error));

        const rr2 = await reg.dispatch('missions.rerun', { id: 'm1' });
        ok('missions.rerun starts the same spec as a NEW run',
            rr2.ok && rr2.result.id !== 'm1' && rr2.result.maxCostUSD === 5 && started.length === 1);
        const rrLive2 = await reg.dispatch('missions.rerun', { id: 'm2' });
        ok('…and a live run is resumed, not re-run', !rrLive2.ok && /missions\.resume/.test(rrLive2.error));

        const del = await reg.dispatch('missions.run.delete', { id: 'm1' });
        ok('missions.run.delete drops a finished run', del.ok && !store.run('m1'));
        ok('…and says the spec SURVIVED while another run of it does', del.result.specDeleted === false);
        const delLast = await reg.dispatch('missions.run.delete', { id: 'm3' });
        ok('‼️ …but says so when the last run took the mission with it', delLast.ok && delLast.result.specDeleted === true);
        const delLive = await reg.dispatch('missions.run.delete', { id: 'm2' });
        ok('…and a live run is not deleted out from under itself', !delLive.ok && /cancel it first/.test(delLive.error));

        // ‼️ X-45 — THE JOURNAL IS READABLE FROM THE BRIDGE, and a classic run
        // says it keeps none rather than returning an empty one. An agent that
        // cannot tell "nothing happened" from "nothing was recorded" will treat
        // a silent run as a finished one.
        const T = require(path.join(__dirname, '..', 'out', 'core', 'missionTrace.js'));
        const traceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-bridge-trace-'));
        const traced = { id: 'm9', specId: 's1', status: 'done', trace: { file: T.traceFileFor(traceDir, 'm9'), lastSeq: 1, v: 1 } };
        store.runs = [...store.runs, traced, { id: 'm10', specId: 's1', status: 'done' }];
        const w = T.MissionTraceWriter.open(traced.trace.file);
        w.append('strategy.changed', { version: 1, strategy: 'work it out' });
        w.append('action.created', { actionId: 'a1', kind: 'task', title: 'do it', agentName: 'coder' });
        w.append('action.started', { actionId: 'a1', refId: 'task-1' });
        reg.register([{
            op: 'missions.trace',
            describe: 'The append-only journal of an ADAPTIVE run. `health` is ok / missing / truncated / '
                + 'damaged / future and `resume` says ok / rebrief / refuse. args: id, events?, limit?',
            handler: (args) => {
                const r = store.run(argStr(args, 'id'));
                need(r, 'Run not found — missions.list shows current ids.');
                if (!r.trace) { return { id: r.id, mode: 'classic', trace: null, note: 'This run keeps no trace' }; }
                const read = T.readTrace(r.trace.file);
                const rec = T.reconcileRun(read, r.trace.lastSeq);
                return {
                    id: r.id, mode: 'adaptive', health: read.health, resume: rec.resume,
                    lastSeq: rec.projection.lastSeq, snapshotBehind: rec.snapshotBehind,
                    strategy: rec.projection.strategy ?? null,
                    actions: rec.actions,
                    ...(args.events === true ? { events: read.events } : {})
                };
            }
        }]);
        const tr = await reg.dispatch('missions.trace', { id: 'm9' });
        ok('missions.trace folds the journal up', tr.ok && tr.result.strategy.text === 'work it out');
        ok('‼️ …and reports the gap the snapshot never caught up to', tr.result.snapshotBehind === 2);
        ok('…in-flight work is interrupted, never assumed done',
            tr.result.actions[0].outcome === 'interrupted' && tr.result.actions[0].from === 'unknown');
        ok('…and the raw events are opt-in, so a long run is not dumped by default',
            !tr.result.events && (await reg.dispatch('missions.trace', { id: 'm9', events: true })).result.events.length === 3);
        const trClassic = await reg.dispatch('missions.trace', { id: 'm10' });
        ok('‼️ a classic run says it keeps no journal rather than looking like an empty one',
            trClassic.ok && trClassic.result.trace === null && trClassic.result.mode === 'classic');
        const trGone = await reg.dispatch('missions.trace', { id: 'nope' });
        ok('…and an unknown run is refused by name', !trGone.ok && /missions\.list/.test(trGone.error));

        // ‼️ X-62 — AND THE SNAPSHOT'S OWN HEALTH IS ASKABLE. An empty
        // missions.list means one of two very different things — a fleet that
        // has run nothing, or a store that could not be read — and until this
        // op there was no way for a caller to tell them apart.
        const MS = require(path.join(__dirname, '..', 'out', 'core', 'missions.js'));
        const badStore = path.join(traceDir, 'missions.json');
        fs.writeFileSync(badStore, '{ specs: [ not json', 'utf8');
        const ms = new MS.MissionStore(badStore);
        ms.load();
        reg.register([{
            op: 'missions.store',
            describe: "The mission SNAPSHOT's own health — whether missions.json could be read, "
                + 'whether the last save landed, and where an unreadable copy was set aside. args: none',
            handler: () => ({
                file: ms.storeFile, health: ms.health,
                recoveryRequired: ms.recoveryRequired,
                degraded: ms.degraded ?? null, quarantine: ms.quarantine ?? null,
                specs: ms.specs.length, runs: ms.runs.length
            })
        }]);
        const storeHealth = await reg.dispatch('missions.store', {});
        ok('missions.store answers with the store\'s own health', storeHealth.ok && storeHealth.result.runs === 0);
        ok('‼️ …and an unreadable store is not reported as an empty one',
            !!storeHealth.result.quarantine && /kept as/.test(storeHealth.result.degraded));
        ok('…naming the file it set aside', fs.existsSync(storeHealth.result.quarantine));
        ok('…and it is in the catalog',
            (await reg.dispatch('farm.ops', {})).result.some(c => c.op === 'missions.store'));

        // ‼️ M-19 — THE CONVERSATION IS READABLE FROM THE BRIDGE, in full. The
        // planner is deliberately given a bounded digest between rounds; an
        // agent (or the user, through a surface) asking what was actually said
        // gets the real messages, because "did they really talk?" is a question
        // a summary cannot answer.
        const MC = require(path.join(__dirname, '..', 'out', 'core', 'missions.js'));
        const talked = {
            id: 'm12', specId: 's1', status: 'done',
            conversations: [{ id: 'c1', objective: 'per engine or shared?', participants: ['a1', 'a2'], openedAt: 1 }],
            messages: [
                { id: 'm1', conversationId: 'c1', from: 'a1', fromName: 'Ada', to: [], intent: 'proposal', refs: [], state: 'delivered', excerpt: 'Per engine.', orderedAt: 1, settledAt: 2, taskId: 't1', sessionId: 's-ada', carried: 'new' },
                { id: 'm2', conversationId: 'c1', from: 'a2', fromName: 'Rev', to: ['a1'], intent: 'challenge', refs: ['m1'], state: 'delivered', excerpt: 'That duplicates it.', orderedAt: 3, settledAt: 4, carried: 'new' }
            ]
        };
        store.runs = [...store.runs, talked];
        reg.register([{
            op: 'missions.conversation',
            describe: `The real transcript. intents: ${MC.messageIntentMenu()}. args: id, conversation?`,
            handler: (args) => {
                const r = store.run(argStr(args, 'id'));
                need(r, 'Run not found — missions.list shows current ids.');
                const wanted = optStr(args, 'conversation');
                const list = (r.conversations ?? []).filter(c => !wanted || c.id === wanted);
                need(list.length, wanted ? `No conversation "${wanted}" in this run.` : 'This run has held no conversations.');
                return list.map(c => ({
                    id: c.id, objective: c.objective, participants: c.participants,
                    open: MC.openThreads(r.messages ?? [], c.id).map(m => m.id),
                    messages: MC.conversationMessages(r.messages ?? [], c.id).map(m => ({
                        id: m.id, from: m.from, fromName: m.fromName ?? null, to: m.to,
                        intent: m.intent, refs: m.refs, state: m.state, carried: m.carried ?? null,
                        text: m.excerpt ?? null, taskId: m.taskId ?? null, sessionId: m.sessionId ?? null
                    }))
                }));
            }
        }]);
        const cv = await reg.dispatch('missions.conversation', { id: 'm12' });
        ok('missions.conversation returns the real messages in order',
            cv.ok && cv.result[0].messages.map(m => m.id).join(',') === 'm1,m2');
        ok('‼️ …with the full text, not a count', cv.result[0].messages[0].text === 'Per engine.');
        ok('…and what each message ANSWERS, by id', cv.result[0].messages[1].refs.join(',') === 'm1');
        ok('…and the deep links a reader opens',
            cv.result[0].messages[0].taskId === 't1' && cv.result[0].messages[0].sessionId === 's-ada');
        ok('‼️ …and what nothing has answered yet', cv.result[0].open.join(',') === 'm2');
        ok('the intents are named from the one registry, never a copy in the describe',
            reg.catalog().find(o => o.op === 'missions.conversation').describe.includes(MC.messageIntentMenu()));
        const cvOne = await reg.dispatch('missions.conversation', { id: 'm12', conversation: 'c9' });
        ok('a conversation that is not there is refused by name', !cvOne.ok && /No conversation "c9"/.test(cvOne.error));
        const cvNone = await reg.dispatch('missions.conversation', { id: 'm10' });
        ok('‼️ …and a run that never spoke says so, rather than returning an empty transcript',
            !cvNone.ok && /held no conversations/.test(cvNone.error));

        // …and the REAL op exists in the extension, with the same contract.
        {
            const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
            ok('the extension registers missions.conversation', /op: 'missions\.conversation'/.test(ext));
            ok('…and its describe names the intents from the registry, not a copy',
                /\+ messageIntentMenu\(\)/.test(ext));
            ok('‼️ …and missions.status carries the conversation summary, not the transcript',
                /conversations: \(r\.conversations \?\? \[\]\)\.map/.test(ext));
            ok('‼️ …and a speaking step says which message it became',
                /spoke: \{\s*conversation: s\.message\.conversationId/.test(ext));
        }

        // ‼️ M-16 — A STEER IS RECORDED, NOT DELIVERED. The one thing this op
        // must never do is imply it reached the delegate that is running right
        // now: a task's prompt is fixed when it starts. So the answer states
        // WHEN it lands, and a run with no next planner boundary — classic, or
        // already ended — is refused by name rather than silently accepted.
        const M2 = require(path.join(__dirname, '..', 'out', 'core', 'missions.js'));
        const live = { id: 'm11', specId: 's1', status: 'running' };
        store.runs = [...store.runs, live];
        const engines = new Set(['m11']);
        reg.register([{
            op: 'missions.guide',
            describe: 'Steer an ADAPTIVE run: the text is shown to the lead ONCE, at its next planner '
                + 'boundary, and is NOT delivered to work already in flight. `appliesAt` is next-round '
                + 'or on-resume. args: id, text',
            handler: (args) => {
                const r = store.run(argStr(args, 'id'));
                need(r, 'Run not found — missions.list shows current ids.');
                need(r.id !== 'm10', 'That is a classic mission: it has no strategy to steer.');
                need(r.status !== 'done', `That run has already ended (${r.status}) — there is no next planner boundary.`);
                const g = M2.addGuidance(r, argStr(args, 'text'), 1000);
                return {
                    id: r.id, guidanceId: g.id,
                    appliesAt: engines.has(r.id) ? 'next-round' : 'on-resume',
                    pending: M2.pendingGuidance(r).length
                };
            }
        }]);
        const gd = await reg.dispatch('missions.guide', { id: 'm11', text: 'prefer the shorter form' });
        ok('missions.guide records the steer and says when it lands',
            gd.ok && gd.result.appliesAt === 'next-round' && gd.result.pending === 1);
        ok('…and it is on the run, waiting, not delivered anywhere',
            live.guidance.length === 1 && live.guidance[0].appliedAt === undefined);
        const gd2 = await reg.dispatch('missions.guide', { id: 'm11', text: 'and cite the file' });
        ok('…a second one queues behind the first rather than replacing it', gd2.result.pending === 2);
        const gdClassic = await reg.dispatch('missions.guide', { id: 'm10', text: 'x' });
        ok('‼️ a classic run is refused by name — it follows a recipe, not a strategy',
            !gdClassic.ok && /no strategy to steer/.test(gdClassic.error));
        const gdDone = await reg.dispatch('missions.guide', { id: 'm9', text: 'x' });
        ok('…and so is a run that has already ended', !gdDone.ok && /already ended/.test(gdDone.error));
    }

    // ---------- B-5: insights, suggestions, quality and eval cases ----------
    // A finding is RE-DERIVED on every scan, so its wording is not a handle —
    // `insightKey` is, and every op here is aimed with it. The three that run a
    // model or start a run refuse without confirm; the rest cost nothing.
    {
        const { insightKey } = require(path.join(__dirname, '..', 'out', 'core', 'insightops.js'));
        const findings = [
            { severity: 'warning', category: 'bigfile', agentId: 'a1', agentName: 'yazar', message: 'CLAUDE.md is 40 KB' },
            { severity: 'info', category: 'unusedmcp', agentId: 'a1', agentName: 'yazar', message: 'MCP server "x" is unused' }
        ];
        const keys = findings.map(insightKey);
        let hidden = {};
        const delegated = [];
        let scanned = 0, sampled = 0, pulsed = 0;
        let suggestions = [
            { id: 's1', agentId: 'a1', agentName: 'yazar', rule: 'Always answer in Turkish.', evidence: 'said 3x', status: 'open', createdAt: 1 },
            { id: 's2', agentId: 'a1', agentName: 'yazar', rule: 'Never reformat the vault.', evidence: 'said 2x', status: 'applied', createdAt: 2 }
        ];
        let cases = [
            { id: 'c1', agentId: 'a1', agentName: 'yazar', title: 'greets' },
            { id: 'c2', agentId: 'a2', agentName: 'basit', title: 'other agent' }
        ];
        const byId = (id) => suggestions.find(s => s.id === id);

        reg.register([
            {
                op: 'insights.dismiss',
                describe: 'Hide a finding for a while, by its key. args: key, days? (default 7), forever?',
                handler: (args) => {
                    const key = argStr(args, 'key');
                    const t = findings.find(i => insightKey(i) === key);
                    need(t, `No current finding with key "${key}" — insights.list shows them with their keys.`);
                    const forever = args.forever === true;
                    const raw = args.days;
                    const days = forever ? 0
                        : (raw === undefined || raw === null || raw === '' ? 7 : Number(raw));
                    need(forever || (Number.isFinite(days) && days > 0),
                        '`days` is a positive number of days — or pass forever:true.');
                    hidden[key] = { until: forever ? 0 : Date.now() + days * 86400000, label: t.message };
                    return { key, forever, until: forever ? null : hidden[key].until };
                }
            },
            {
                op: 'insights.restore',
                describe: 'Un-hide dismissed findings. args: key? · keys? · all?',
                handler: (args) => {
                    let wanted;
                    if (args.all === true) { wanted = Object.keys(hidden); }
                    else if (Array.isArray(args.keys)) { wanted = args.keys.map(String); }
                    else { wanted = [argStr(args, 'key')]; }
                    need(wanted.length, 'Nothing to restore — pass `key`, `keys` or all:true.');
                    const restored = wanted.filter(k => k in hidden);
                    const unknown = wanted.filter(k => !(k in hidden));
                    for (const k of restored) { delete hidden[k]; }
                    return { restored: restored.length, keys: restored, notDismissed: unknown, stillHidden: Object.keys(hidden).length };
                }
            },
            {
                op: 'insights.delegate',
                describe: 'COST-BEARING — hand findings to an agent as one headless run. args: key?/keys?/all?, agent?, confirm',
                handler: (args) => {
                    need(args.confirm === true,
                        'Delegating starts a real run, which costs money — pass confirm:true if that is meant.');
                    let list;
                    if (args.all === true) { list = findings.slice(); }
                    else {
                        const ks = Array.isArray(args.keys) ? args.keys.map(String) : [argStr(args, 'key')];
                        list = ks.map(k => {
                            const f = findings.find(i => insightKey(i) === k);
                            need(f, `No current finding with key "${k}" — insights.list shows them.`);
                            return f;
                        });
                    }
                    delegated.push(list.length);
                    return { taskId: 't-' + delegated.length, findings: list.length, keys: list.map(insightKey) };
                }
            },
            {
                op: 'suggestions.list',
                describe: 'Instruction suggestions. args: agent?, state? (open|applied|dismissed, default open)',
                handler: (args) => {
                    const state = (optStr(args, 'state') || 'open').toLowerCase();
                    need(['open', 'applied', 'dismissed'].includes(state),
                        `state is open, applied or dismissed — not "${state}"`);
                    const rows = suggestions.filter(s => s.status === state);
                    return { state, total: rows.length, suggestions: rows };
                }
            },
            {
                op: 'suggestions.scan',
                describe: 'COST-BEARING — a cheap model looks for repeated corrections. args: agent, confirm',
                handler: (args) => {
                    need(args.confirm === true,
                        'Scanning runs a model, which costs money — pass confirm:true if that is meant.');
                    scanned++;
                    return { agent: argStr(args, 'agent'), added: 1 };
                }
            },
            {
                op: 'suggestions.apply',
                describe: 'Append the rule to the agent\'s CLAUDE.md. args: id',
                handler: (args) => {
                    const s = byId(argStr(args, 'id'));
                    need(s, `No suggestion "${argStr(args, 'id')}" — suggestions.list shows the open ones.`);
                    need(s.status === 'open', `That suggestion is already ${s.status}.`);
                    s.status = 'applied';
                    return { id: s.id, rule: s.rule };
                }
            },
            {
                op: 'suggestions.dismiss',
                describe: 'Turn a suggestion down; nothing is written. args: id',
                handler: (args) => {
                    const s = byId(argStr(args, 'id'));
                    need(s, `No suggestion "${argStr(args, 'id')}" — suggestions.list shows the open ones.`);
                    need(s.status === 'open', `That suggestion is already ${s.status}.`);
                    s.status = 'dismissed';
                    return { id: s.id };
                }
            },
            {
                op: 'quality.sample',
                describe: 'COST-BEARING — score a sample of recent outputs now. args: confirm',
                handler: (args) => {
                    need(args.confirm === true,
                        'Sampling runs a model, which costs money — pass confirm:true if that is meant.');
                    sampled++;
                    return { scores: sampled };
                }
            },
            {
                op: 'living.pulse',
                describe: 'Run the Living checks now; costs nothing. args: none',
                handler: () => { pulsed++; return { ran: true }; }
            },
            {
                op: 'evals.delete',
                describe: 'Remove a regression case; past run verdicts are untouched. args: id, agent?',
                handler: (args) => {
                    const id = argStr(args, 'id');
                    const c = cases.find(x => x.id === id);
                    need(c, `No eval case "${id}" — evals.list shows the current ones.`);
                    if (optStr(args, 'agent')) {
                        need(c.agentName === optStr(args, 'agent'),
                            `Case "${id}" belongs to ${c.agentName}, not ${optStr(args, 'agent')}.`);
                    }
                    cases = cases.filter(x => x.id !== id);
                    return { id, title: c.title, agent: c.agentName };
                }
            }
        ]);
        ok('B-5 ops appear in the catalog',
            ['insights.dismiss', 'insights.restore', 'insights.delegate', 'suggestions.list',
                'suggestions.scan', 'suggestions.apply', 'suggestions.dismiss', 'quality.sample',
                'living.pulse', 'evals.delete'].every(op => reg.catalog().some(c => c.op === op)));

        const d = await reg.dispatch('insights.dismiss', { key: keys[0], days: 1 });
        ok('insights.dismiss hides a finding for a stated time',
            d.ok && d.result.forever === false && d.result.until > Date.now());
        ok('‼️ …and an omitted "forever" can never silently mean forever', d.result.until !== null);
        const dForever = await reg.dispatch('insights.dismiss', { key: keys[1], forever: true });
        ok('…while forever:true says so in the answer', dForever.ok && dForever.result.until === null);
        const dGhost = await reg.dispatch('insights.dismiss', { key: 'made-up' });
        ok('‼️ …and a key that names no current finding is refused — the wording is not an identity',
            !dGhost.ok && /insights\.list/.test(dGhost.error));
        const dBad = await reg.dispatch('insights.dismiss', { key: keys[0], days: 0 });
        ok('…and a zero-day dismissal is refused rather than read as forever',
            !dBad.ok && /positive number of days/.test(dBad.error));

        const r1 = await reg.dispatch('insights.restore', { key: keys[0] });
        ok('insights.restore brings one back', r1.ok && r1.result.restored === 1 && r1.result.stillHidden === 1);
        const r2 = await reg.dispatch('insights.restore', { key: keys[0] });
        ok('…and a key that was not hidden is reported, not failed',
            r2.ok && r2.result.restored === 0 && r2.result.notDismissed.length === 1);
        const rAll = await reg.dispatch('insights.restore', { all: true });
        ok('…all:true clears the lot', rAll.ok && rAll.result.stillHidden === 0);

        const delRefused = await reg.dispatch('insights.delegate', { key: keys[0] });
        ok('‼️ insights.delegate starts a REAL run, so it refuses without confirm',
            !delRefused.ok && /costs money/.test(delRefused.error));
        const del = await reg.dispatch('insights.delegate', { all: true, confirm: true });
        ok('‼️ …and several findings become ONE run, not one run each',
            del.ok && del.result.findings === 2 && delegated.length === 1);

        const sl = await reg.dispatch('suggestions.list', {});
        ok('suggestions.list defaults to the open pile', sl.ok && sl.result.total === 1);
        const slApplied = await reg.dispatch('suggestions.list', { state: 'applied' });
        ok('…and can be asked for the settled ones', slApplied.ok && slApplied.result.total === 1);
        const slBad = await reg.dispatch('suggestions.list', { state: 'maybe' });
        ok('…an invented state lists the real ones', !slBad.ok && /open, applied or dismissed/.test(slBad.error));

        const scanRefused = await reg.dispatch('suggestions.scan', { agent: 'yazar' });
        ok('suggestions.scan runs a model, so it refuses without confirm',
            !scanRefused.ok && /costs money/.test(scanRefused.error) && scanned === 0);
        ok('…and with confirm it runs', (await reg.dispatch('suggestions.scan', { agent: 'yazar', confirm: true })).ok && scanned === 1);

        const ap = await reg.dispatch('suggestions.apply', { id: 's1' });
        ok('suggestions.apply writes the rule and settles it', ap.ok && byId('s1').status === 'applied');
        const apTwice = await reg.dispatch('suggestions.apply', { id: 's1' });
        ok('‼️ …and a rule cannot be applied twice', !apTwice.ok && /already applied/.test(apTwice.error));
        const disSettled = await reg.dispatch('suggestions.dismiss', { id: 's2' });
        ok('…nor a settled one dismissed', !disSettled.ok && /already applied/.test(disSettled.error));

        const qRefused = await reg.dispatch('quality.sample', {});
        ok('quality.sample refuses without confirm', !qRefused.ok && sampled === 0);
        ok('…and scores when asked properly', (await reg.dispatch('quality.sample', { confirm: true })).ok && sampled === 1);
        const pulse = await reg.dispatch('living.pulse', {});
        ok('living.pulse costs nothing and needs no confirm', pulse.ok && pulsed === 1);

        const ed = await reg.dispatch('evals.delete', { id: 'c1' });
        ok('evals.delete removes a case', ed.ok && !cases.some(c => c.id === 'c1'));
        const edGone = await reg.dispatch('evals.delete', { id: 'c1' });
        ok('…an id that is not there is refused, not silently nothing', !edGone.ok && /No eval case/.test(edGone.error));
        const edWrong = await reg.dispatch('evals.delete', { id: 'c2', agent: 'yazar' });
        ok('‼️ …and a case belonging to another agent is named, not deleted',
            !edWrong.ok && /belongs to basit/.test(edWrong.error) && cases.some(c => c.id === 'c2'));
    }

    // ---------- §19.C: duties ops contract (the standing-vigilance system) ----------
    // Real compiled duties.js against a temp agent dir — proves the whole
    // watch→do lifecycle (add/list/update/togglePause/move/delete) is bridge-
    // manageable with the same guards extension.ts registers.
    {
        const {
            readDuties, addDuty, updateDuty, deleteDuty, togglePauseDuty, moveDuty,
            CADENCES, watchStatus, claudeMdReferencesDuties, CLAUDE_MD_SNIPPET
        } = require(path.join(__dirname, '..', 'out', 'core', 'duties.js'));
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-bridge-duties-'));
        const claudeMd = path.join(dir, 'CLAUDE.md');
        fs.writeFileSync(claudeMd, '# Ajan\n');
        const agent = { name: 'dev', dir, claudeMdPath: claudeMd };
        const findDuty = (title) => {
            const d = (readDuties(dir) || { duties: [] }).duties.find(x => x.title === title);
            need(d, `Duty "${title}" not found on ${agent.name} — duties.list shows current ones.`);
            return d;
        };
        reg.register([
            {
                op: 'duties.list',
                describe: 'Standing duties with live watch status. args: agent?',
                handler: () => {
                    const info = readDuties(dir);
                    return [{
                        agent: agent.name, file: info ? info.file : null,
                        duties: (info ? info.duties : []).map(d => ({
                            title: d.title, cadence: d.cadence, paused: d.paused,
                            watch: d.watch || null, do: d.action || null, note: d.note || null,
                            watchStatus: watchStatus(d.watch) || null
                        }))
                    }];
                }
            },
            {
                op: 'duties.add',
                describe: 'Add a standing duty. args: agent, title, cadence, watch?, do?, note?, paused?, ensureReference?',
                handler: (a) => {
                    const title = argStr(a, 'title');
                    const cadence = argStr(a, 'cadence');
                    need(CADENCES.includes(cadence), `Unknown cadence "${cadence}" — use one of: ${CADENCES.join(', ')}.`);
                    const cur = readDuties(dir);
                    need(!(cur && cur.duties.some(d => d.title === title)), `${agent.name} already has a duty titled "${title}".`);
                    const file = addDuty(dir, {
                        title, cadence, paused: a.paused === true,
                        watch: optStr(a, 'watch') || undefined,
                        action: optStr(a, 'do') || undefined,
                        note: optStr(a, 'note') || undefined
                    });
                    const md = fs.readFileSync(claudeMd, 'utf8');
                    let referenced = claudeMdReferencesDuties(md);
                    if (!referenced && a.ensureReference === true) {
                        fs.writeFileSync(claudeMd, md.replace(/\n*$/, '\n') + CLAUDE_MD_SNIPPET, 'utf8');
                        referenced = true;
                    }
                    return {
                        agent: agent.name, title, file, referenced,
                        ...(referenced ? {} : { warning: 'CLAUDE.md never mentions DUTIES.md — the agent will not obey this duty.' })
                    };
                }
            },
            {
                op: 'duties.update',
                describe: 'Patch a duty in place. args: agent, title, newTitle?, cadence?, watch?, do?, note?, paused?',
                handler: (a) => {
                    const title = argStr(a, 'title');
                    const cur = findDuty(title);
                    const cadence = optStr(a, 'cadence') || cur.cadence;
                    need(cadence === cur.cadence || CADENCES.includes(cadence), `Unknown cadence "${cadence}".`);
                    const pick = (key, old) => typeof a[key] === 'string' ? (a[key].trim() || undefined) : old;
                    const next = {
                        title: optStr(a, 'newTitle') || cur.title,
                        cadence,
                        paused: typeof a.paused === 'boolean' ? a.paused : cur.paused,
                        watch: pick('watch', cur.watch),
                        action: pick('do', cur.action),
                        note: pick('note', cur.note)
                    };
                    updateDuty(dir, title, next);
                    return { agent: agent.name, duty: next };
                }
            },
            {
                op: 'duties.delete',
                describe: 'Remove a duty. args: agent, title',
                handler: (a) => {
                    const title = argStr(a, 'title');
                    findDuty(title);
                    deleteDuty(dir, title);
                    return { agent: agent.name, deleted: title };
                }
            },
            {
                op: 'duties.togglePause',
                describe: 'Pause/resume a duty. args: agent, title',
                handler: (a) => {
                    const title = argStr(a, 'title');
                    const d = findDuty(title);
                    togglePauseDuty(dir, title);
                    return { agent: agent.name, title, paused: !d.paused };
                }
            },
            {
                op: 'duties.move',
                describe: 'Reorder a duty one slot. args: agent, title, direction (up|down)',
                handler: (a) => {
                    const title = argStr(a, 'title');
                    const direction = argStr(a, 'direction');
                    need(direction === 'up' || direction === 'down', 'direction must be "up" or "down".');
                    findDuty(title);
                    moveDuty(dir, title, direction === 'up' ? -1 : 1);
                    return { agent: agent.name, order: (readDuties(dir) || { duties: [] }).duties.map(d => d.title) };
                }
            }
        ]);
        ok('duties ops appear in the catalog',
            ['duties.list', 'duties.add', 'duties.update', 'duties.delete', 'duties.togglePause', 'duties.move']
                .every(op => reg.catalog().some(c => c.op === op)));

        const badCadence = await reg.dispatch('duties.add', { agent: 'dev', title: 'X', cadence: 'hourly' });
        ok('duties.add refuses an unknown cadence', !badCadence.ok && /Unknown cadence/.test(badCadence.error));

        const first = await reg.dispatch('duties.add',
            { agent: 'dev', title: 'Inbox tasnifi', cadence: 'every-turn', watch: dir, do: 'Tasnif et.' });
        ok('duties.add creates DUTIES.md and warns about the missing CLAUDE.md reference',
            first.ok && fs.existsSync(path.join(dir, 'DUTIES.md'))
            && first.result.referenced === false && /CLAUDE\.md/.test(first.result.warning));

        const dup = await reg.dispatch('duties.add', { agent: 'dev', title: 'Inbox tasnifi', cadence: 'daily' });
        ok('duties.add refuses a duplicate title', !dup.ok && /already has a duty/.test(dup.error));

        const second = await reg.dispatch('duties.add',
            { agent: 'dev', title: 'Haftalık bakım', cadence: 'weekly', note: 'küçük tut', ensureReference: true });
        ok('duties.add ensureReference appends the CLAUDE.md instruction',
            second.ok && second.result.referenced === true
            && /DUTIES\.md/i.test(fs.readFileSync(claudeMd, 'utf8')));

        const listed = await reg.dispatch('duties.list', {});
        const rows = listed.ok ? listed.result[0].duties : [];
        ok('duties.list returns both duties with fields intact',
            rows.length === 2 && rows[0].title === 'Inbox tasnifi' && rows[0].do === 'Tasnif et.'
            && rows[1].note === 'küçük tut');
        ok('duties.list inspects a real watch path (dir → pending status object)',
            rows[0].watchStatus && rows[0].watchStatus.kind === 'dir' && rows[1].watchStatus === null);

        const patched = await reg.dispatch('duties.update',
            { agent: 'dev', title: 'Haftalık bakım', cadence: 'daily', note: '' });
        ok('duties.update patches cadence and "" clears a field',
            patched.ok && patched.result.duty.cadence === 'daily'
            && findDuty('Haftalık bakım').cadence === 'daily' && findDuty('Haftalık bakım').note === undefined);

        const pausedR = await reg.dispatch('duties.togglePause', { agent: 'dev', title: 'Haftalık bakım' });
        ok('duties.togglePause flips the paused flag',
            pausedR.ok && pausedR.result.paused === true && findDuty('Haftalık bakım').paused === true);

        const moved = await reg.dispatch('duties.move', { agent: 'dev', title: 'Haftalık bakım', direction: 'up' });
        ok('duties.move reorders and returns the new order',
            moved.ok && moved.result.order[0] === 'Haftalık bakım');

        const gone = await reg.dispatch('duties.delete', { agent: 'dev', title: 'Inbox tasnifi' });
        ok('duties.delete removes the duty',
            gone.ok && (readDuties(dir) || { duties: [] }).duties.length === 1);
        const missing = await reg.dispatch('duties.delete', { agent: 'dev', title: 'Inbox tasnifi' });
        ok('duties ops refuse a missing duty', !missing.ok && /not found/.test(missing.error));

        try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    }

    // ---------- §19.C: schedules.edit contract (edit-in-place, id survives) ----------
    {
        const schedules = [
            { id: 'sc1', agentId: 'a1', agentName: 'dev', title: 'Sabah brifingi', prompt: 'p', mode: 'headless', kind: 'daily', hour: 5, minute: 0, enabled: true },
            { id: 'sc2', agentId: 'a1', agentName: 'dev', title: 'Öğlen', prompt: 'p', mode: 'headless', kind: 'daily', hour: 12, minute: 0, enabled: true }
        ];
        const mgr = {
            schedules,
            patched: null,
            updateSchedule(id, patch) { this.patched = { id, patch }; Object.assign(schedules.find(s => s.id === id), patch); }
        };
        reg.register({
            op: 'schedules.edit',
            describe: 'Edit a schedule in place. args: id or title + fields',
            handler: (args) => {
                const ref = optStr(args, 'id') || argStr(args, 'title');
                const cur = mgr.schedules.find(x => x.id === ref || x.title === ref);
                need(cur, 'Schedule not found — schedules.list shows current ones.');
                const patch = {};
                const newTitle = optStr(args, 'newTitle');
                if (newTitle) {
                    need(!mgr.schedules.some(x => x.id !== cur.id && x.title === newTitle),
                        `A schedule titled "${newTitle}" already exists.`);
                    patch.title = newTitle;
                }
                if (optStr(args, 'prompt')) { patch.prompt = optStr(args, 'prompt'); }
                const intArg = (key, min, max) => {
                    const v = args[key];
                    if (v === undefined) { return; }
                    need(typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max,
                        `${key} must be an integer ${min}-${max}.`);
                    patch[key] = v;
                };
                intArg('hour', 0, 23);
                intArg('minute', 0, 59);
                intArg('dow', 0, 6);
                const kind = optStr(args, 'kind');
                if (kind) {
                    need(kind === 'daily' || kind === 'weekly' || kind === 'once', 'kind must be daily | weekly | once.');
                    patch.kind = kind;
                }
                const missed = optStr(args, 'missed');
                if (missed) {
                    need(missed === 'skip' || missed === 'run' || missed === 'ask', 'missed must be skip | run | ask.');
                    patch.missed = missed;
                    if (missed !== (cur.missed || 'skip') && missed !== 'skip') { patch.lastRunKey = 'SETTLED'; }
                }
                if (typeof args.enabled === 'boolean') { patch.enabled = args.enabled; }
                need(Object.keys(patch).length, 'Nothing to edit — pass at least one documented field.');
                const kindAfter = patch.kind || cur.kind;
                need(kindAfter !== 'weekly' || (patch.dow !== undefined || cur.dow !== undefined),
                    'A weekly schedule needs dow (0=Sunday … 6=Saturday).');
                mgr.updateSchedule(cur.id, patch);
                return { id: cur.id, title: patch.title || cur.title, updated: Object.keys(patch) };
            }
        });

        const notFound = await reg.dispatch('schedules.edit', { title: 'Yok böyle', hour: 6 });
        ok('schedules.edit refuses an unknown schedule', !notFound.ok && /not found/i.test(notFound.error));
        const badHour = await reg.dispatch('schedules.edit', { id: 'sc1', hour: 24 });
        ok('schedules.edit validates hour range', !badHour.ok && /0-23/.test(badHour.error));
        const dupTitle = await reg.dispatch('schedules.edit', { id: 'sc1', newTitle: 'Öğlen' });
        ok('schedules.edit refuses a duplicate title', !dupTitle.ok && /already exists/.test(dupTitle.error));
        const empty = await reg.dispatch('schedules.edit', { id: 'sc1' });
        ok('schedules.edit refuses an empty patch', !empty.ok && /Nothing to edit/.test(empty.error));
        const noDow = await reg.dispatch('schedules.edit', { id: 'sc1', kind: 'weekly' });
        ok('schedules.edit demands dow when switching to weekly', !noDow.ok && /needs dow/.test(noDow.error));

        const edited = await reg.dispatch('schedules.edit', { id: 'sc1', hour: 6, minute: 30, missed: 'run' });
        ok('schedules.edit patches in place — id survives, fields land',
            edited.ok && mgr.patched.id === 'sc1' && schedules[0].hour === 6 && schedules[0].minute === 30);
        ok('schedules.edit settles the past when catch-up switches on',
            mgr.patched.patch.lastRunKey === 'SETTLED');
    }

    // ---------- §19.C: tasks.get / tasks.delete contract ----------
    {
        // compiled tasks.js needs a vscode shim in plain node (same trick as
        // test_schedule_missed.js) — archivedOutputBody is the real function
        const Module = require('module');
        const origLoad = Module._load;
        Module._load = function (request) {
            if (request === 'vscode') {
                return {
                    Uri: {}, window: {}, EventEmitter: class { fire() {} get event() { return () => ({ dispose() {} }); } dispose() {} },
                    workspace: { getConfiguration: () => ({ get: (_k, d) => d }) },
                    ViewColumn: {}, ConfigurationTarget: {}, env: {}
                };
            }
            return origLoad.apply(this, arguments);
        };
        const { archivedOutputBody } = require(path.join(__dirname, '..', 'out', 'core', 'tasks.js'));
        Module._load = origLoad;

        const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-bridge-taskout-'));
        const outFile = path.join(outDir, 'done.md');
        fs.writeFileSync(outFile, 'Görev tamam: rapor yazıldı.\n');
        const tasks = [
            { id: 't1', title: 'Rapor', agentName: 'dev', status: 'done', mode: 'headless', prompt: 'yaz', createdAt: 1, costUSD: 0.12, outputFile: outFile },
            { id: 't2', title: 'Canlı', agentName: 'dev', status: 'running', mode: 'headless', prompt: 'koş', createdAt: 2 }
        ];
        const mgr = {
            tasks,
            deleted: [],
            deleteTask(t) { this.deleted.push(t.id); this.tasks = this.tasks.filter(x => x.id !== t.id); }
        };
        reg.register([
            {
                op: 'tasks.get',
                describe: 'One task in detail, archived output included. args: id, tail?',
                handler: (args) => {
                    const t = mgr.tasks.find(x => x.id === argStr(args, 'id'));
                    need(t, 'Task not found — tasks.list shows current ids.');
                    const tail = typeof args.tail === 'number' && args.tail > 0 ? Math.floor(args.tail) : 4000;
                    let output = null;
                    if (t.outputFile && fs.existsSync(t.outputFile)) {
                        try { output = archivedOutputBody(fs.readFileSync(t.outputFile, 'utf8')).slice(-tail); } catch {}
                    }
                    return { id: t.id, title: t.title, status: t.status, prompt: t.prompt, costUSD: t.costUSD ?? null, output };
                }
            },
            {
                op: 'tasks.delete',
                describe: 'Delete one task row permanently. args: id',
                handler: (args) => {
                    const t = mgr.tasks.find(x => x.id === argStr(args, 'id'));
                    need(t, 'Task not found — tasks.list shows current ids.');
                    need(t.status !== 'running', 'Task is running — tasks.cancel it first.');
                    mgr.deleteTask(t);
                    return { deleted: t.id };
                }
            }
        ]);

        const got = await reg.dispatch('tasks.get', { id: 't1' });
        ok('tasks.get returns detail with the output body',
            got.ok && got.result.costUSD === 0.12 && /rapor yazıldı/.test(got.result.output));
        const tailed = await reg.dispatch('tasks.get', { id: 't1', tail: 8 });
        ok('tasks.get tail limits the output chars', tailed.ok && tailed.result.output.length <= 8);
        const noOut = await reg.dispatch('tasks.get', { id: 't2' });
        ok('tasks.get without an output file returns null output', noOut.ok && noOut.result.output === null);

        const delLive = await reg.dispatch('tasks.delete', { id: 't2' });
        ok('tasks.delete refuses a running task', !delLive.ok && /tasks\.cancel/.test(delLive.error));
        const delOk = await reg.dispatch('tasks.delete', { id: 't1' });
        ok('tasks.delete removes a finished task', delOk.ok && mgr.deleted.includes('t1'));

        try { fs.rmSync(outDir, { recursive: true, force: true }); } catch {}
    }

    // ---------- §19.C: triggers.add / edit / delete contract ----------
    {
        const watchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-bridge-trig-'));
        const agents = [{ id: 'a1', name: 'dev' }];
        const findAgent = (ref) => {
            const a = agents.find(x => x.id === ref || x.name === String(ref).toLowerCase());
            need(a, `Agent "${ref}" not found — agents.list shows the current farm.`);
            return a;
        };
        const mgr = {
            triggers: [],
            workflows: [{ id: 'w1', title: 'Zincir' }],
            saved: 0,
            addTrigger(t) { const trigger = { ...t, id: 'tr' + (this.triggers.length + 1) }; this.triggers.push(trigger); return trigger; },
            updateTrigger() { this.saved++; },
            deleteTrigger(t) { this.triggers = this.triggers.filter(x => x.id !== t.id); }
        };
        const newId = () => Math.random().toString(36).slice(2, 7);
        reg.register([
            {
                op: 'triggers.add',
                describe: 'Install a trigger. args: title, type, watch?, hookEvent?, action, timing…',
                handler: (args) => {
                    const title = argStr(args, 'title');
                    const type = argStr(args, 'type');
                    need(type === 'watch' || type === 'hook' || type === 'webhook', 'type must be watch | hook | webhook.');
                    let watchPath, hookEvent, token;
                    if (type === 'watch') {
                        watchPath = argStr(args, 'watch');
                        need(fs.existsSync(watchPath), `Watch path does not exist: ${watchPath}`);
                    } else if (type === 'hook') {
                        hookEvent = argStr(args, 'hookEvent');
                        const kinds = ['start', 'prompt', 'toolStart', 'toolEnd', 'permission', 'notify', 'stop', 'subagent', 'compact', 'end'];
                        need(kinds.includes(hookEvent), `Unknown hookEvent "${hookEvent}" — use one of: ${kinds.join(', ')}.`);
                    } else { token = newId() + newId(); }
                    const rec = args.action && typeof args.action === 'object' && !Array.isArray(args.action) ? args.action : undefined;
                    need(rec, 'action is required: {kind:"task"|"dispatch"|"workflow", ...}.');
                    let action;
                    if (rec.kind === 'task') {
                        const agent = findAgent(String(rec.agent || ''));
                        const prompt = String(rec.prompt || '').trim();
                        need(prompt, 'action.prompt is required for a task action.');
                        action = { kind: 'task', agentId: agent.id, agentName: agent.name, title: String(rec.title || '').trim() || title, prompt, mode: rec.mode === 'interactive' ? 'interactive' : 'headless' };
                    } else if (rec.kind === 'dispatch') {
                        const prompt = String(rec.prompt || '').trim();
                        need(prompt, 'action.prompt is required for a dispatch action.');
                        action = { kind: 'dispatch', title: String(rec.title || '').trim() || title, prompt, mode: 'headless' };
                    } else if (rec.kind === 'workflow') {
                        const w = mgr.workflows.find(x => x.id === rec.workflow || x.title === rec.workflow);
                        need(w, 'Workflow not found — workflows.list shows current ones.');
                        action = { kind: 'workflow', workflowId: w.id };
                    } else { throw new Error('action.kind must be task | dispatch | workflow.'); }
                    const numArg = (key, def, min) => {
                        const v = args[key];
                        if (v === undefined) { return def; }
                        need(typeof v === 'number' && Number.isFinite(v) && v >= min, `${key} must be a number ≥ ${min}.`);
                        return Math.floor(v);
                    };
                    const trigger = mgr.addTrigger({
                        title, type, watchPath, hookEvent, token, action,
                        debounceSec: numArg('debounceSec', type === 'watch' ? 10 : 1, 1),
                        cooldownSec: numArg('cooldownSec', 60, 0),
                        maxPerHour: numArg('maxPerHour', 6, 0),
                        enabled: args.enabled !== false
                    });
                    return { id: trigger.id, title: trigger.title, type, ...(token ? { url: `http://127.0.0.1:8377/trigger/${token}` } : {}) };
                }
            },
            {
                op: 'triggers.edit',
                describe: 'Edit a trigger in place. args: id or title + fields',
                handler: (args) => {
                    const ref = optStr(args, 'id') || argStr(args, 'title');
                    const tr = mgr.triggers.find(x => x.id === ref || x.title === ref);
                    need(tr, 'Trigger not found — triggers.list shows current ones.');
                    const updated = [];
                    const newTitle = optStr(args, 'newTitle');
                    if (newTitle) {
                        tr.title = newTitle;
                        if (tr.action.kind !== 'workflow') { tr.action.title = newTitle; }
                        updated.push('title');
                    }
                    if (optStr(args, 'prompt')) {
                        need(tr.action.kind !== 'workflow', 'A workflow trigger has no prompt — edit the workflow instead.');
                        tr.action.prompt = optStr(args, 'prompt');
                        updated.push('prompt');
                    }
                    const numPatch = (key, min) => {
                        const v = args[key];
                        if (v === undefined) { return; }
                        need(typeof v === 'number' && Number.isFinite(v) && v >= min, `${key} must be a number ≥ ${min}.`);
                        tr[key] = Math.floor(v);
                        updated.push(key);
                    };
                    numPatch('debounceSec', 1);
                    numPatch('cooldownSec', 0);
                    numPatch('maxPerHour', 0);
                    need(updated.length, 'Nothing to edit — pass at least one documented field.');
                    mgr.updateTrigger(tr);
                    return { id: tr.id, title: tr.title, updated };
                }
            },
            {
                op: 'triggers.delete',
                describe: 'Remove a trigger. args: id or title',
                handler: (args) => {
                    const ref = optStr(args, 'id') || argStr(args, 'title');
                    const tr = mgr.triggers.find(x => x.id === ref || x.title === ref);
                    need(tr, 'Trigger not found — triggers.list shows current ones.');
                    mgr.deleteTrigger(tr);
                    return { deleted: tr.title };
                }
            }
        ]);

        const badPath = await reg.dispatch('triggers.add',
            { title: 'W', type: 'watch', watch: path.join(watchDir, 'yok'), action: { kind: 'task', agent: 'dev', prompt: 'p' } });
        ok('triggers.add refuses a missing watch path', !badPath.ok && /does not exist/.test(badPath.error));
        const badEvent = await reg.dispatch('triggers.add',
            { title: 'H', type: 'hook', hookEvent: 'boom', action: { kind: 'dispatch', prompt: 'p' } });
        ok('triggers.add validates hookEvent kinds', !badEvent.ok && /Unknown hookEvent/.test(badEvent.error));
        const noAction = await reg.dispatch('triggers.add', { title: 'X', type: 'watch', watch: watchDir });
        ok('triggers.add demands an action', !noAction.ok && /action is required/.test(noAction.error));

        const watch = await reg.dispatch('triggers.add',
            { title: 'Inbox', type: 'watch', watch: watchDir, action: { kind: 'task', agent: 'dev', prompt: 'Tasnif: {watch}' } });
        ok('triggers.add installs a watch trigger with defaults',
            watch.ok && mgr.triggers[0].debounceSec === 10 && mgr.triggers[0].cooldownSec === 60
            && mgr.triggers[0].action.agentName === 'dev' && mgr.triggers[0].enabled === true);
        const hook = await reg.dispatch('triggers.add',
            { title: 'Bitti', type: 'webhook', action: { kind: 'workflow', workflow: 'Zincir' }, maxPerHour: 0 });
        ok('triggers.add webhook returns its POST url and resolves the workflow',
            hook.ok && /\/trigger\/\w+/.test(hook.result.url)
            && mgr.triggers[1].action.workflowId === 'w1' && mgr.triggers[1].maxPerHour === 0);

        const edited = await reg.dispatch('triggers.edit', { title: 'Inbox', newTitle: 'Inbox v2', debounceSec: 30 });
        ok('triggers.edit patches title (action title follows) and timing',
            edited.ok && mgr.triggers[0].title === 'Inbox v2' && mgr.triggers[0].action.title === 'Inbox v2'
            && mgr.triggers[0].debounceSec === 30 && mgr.saved === 1);
        const badDebounce = await reg.dispatch('triggers.edit', { title: 'Inbox v2', debounceSec: 0 });
        ok('triggers.edit enforces debounce ≥ 1', !badDebounce.ok && /≥ 1/.test(badDebounce.error));

        const removed = await reg.dispatch('triggers.delete', { title: 'Inbox v2' });
        ok('triggers.delete removes the trigger', removed.ok && mgr.triggers.length === 1);

        try { fs.rmSync(watchDir, { recursive: true, force: true }); } catch {}
    }

    // ---------- M-18: workflows.run answers, workflows.status reads the run ----------
    {
        const runs = {};
        const mgr = {
            workflows: [{ id: 'w1', title: 'Nightly build', steps: [{}, {}] }, { id: 'w2', title: 'Empty', steps: [] }],
            runWorkflow(w) {
                if (!w.steps.length) { return undefined; }
                const id = 'r' + (Object.keys(runs).length + 1);
                runs[id] = {
                    runId: id, workflowId: w.id, title: w.title, status: 'running',
                    steps: [{ index: 0, title: 'one', agentName: 'dev', status: 'running', taskId: 't1' }],
                    costUSD: 0, tokens: 0
                };
                return id;
            },
            workflowRunState(id) { return runs[id]; }
        };
        reg.register([
            {
                op: 'workflows.run',
                describe: 'Run a workflow now. Returns the RUN id. args: id or title',
                handler: (args) => {
                    const ref = optStr(args, 'id') || argStr(args, 'title');
                    const w = mgr.workflows.find(x => x.id === ref || x.title === ref);
                    need(w, 'Workflow not found — workflows.list shows current ones.');
                    const runId = mgr.runWorkflow(w);
                    need(runId, `"${w.title}" has no steps — there was nothing to start.`);
                    return { started: w.title, runId };
                }
            },
            {
                op: 'workflows.status',
                describe: 'Where one workflow run got to, and what it produced. args: runId',
                handler: (args) => {
                    const st = mgr.workflowRunState(argStr(args, 'runId'));
                    need(st, 'No workflow run with that id — its tasks may have been purged, or it never started.');
                    return st;
                }
            }
        ]);
        const started = await reg.dispatch('workflows.run', { title: 'Nightly build' });
        ok('‼️ workflows.run hands back the RUN id, not just a title — without it the run is unfindable',
            started.ok && typeof started.result.runId === 'string' && started.result.runId.length > 0);
        const st = await reg.dispatch('workflows.status', { runId: started.result.runId });
        ok('…and that id reads the run back', st.ok && st.result.status === 'running' && st.result.title === 'Nightly build');
        const missing = await reg.dispatch('workflows.status', { runId: 'nope' });
        ok('an id that ran nothing is refused by name, not answered with an empty shell',
            !missing.ok && /No workflow run with that id/.test(missing.error));
        const emptyRun = await reg.dispatch('workflows.run', { title: 'Empty' });
        ok('a chain with no steps refuses rather than returning a run nobody can name',
            !emptyRun.ok && /has no steps/.test(emptyRun.error));
    }

    // ---------- §19.C: workflows.add/delete + templates.add/delete contract ----------
    {
        const agents = [{ id: 'a1', name: 'dev' }];
        const findAgent = (ref) => {
            const a = agents.find(x => x.id === ref || x.name === String(ref).toLowerCase());
            need(a, `Agent "${ref}" not found.`);
            return a;
        };
        const mgr = {
            workflows: [], templates: [],
            addWorkflow(title, steps) { const w = { id: 'w' + (this.workflows.length + 1), title, steps }; this.workflows.push(w); return w; },
            deleteWorkflow(w) { this.workflows = this.workflows.filter(x => x.id !== w.id); },
            addTemplate(t) { const tpl = { ...t, id: 'tp' + (this.templates.length + 1) }; this.templates.push(tpl); return tpl; },
            deleteTemplate(t) { this.templates = this.templates.filter(x => x.id !== t.id); }
        };
        reg.register([
            {
                op: 'workflows.add',
                describe: 'Create a workflow. args: title, steps',
                handler: (args) => {
                    const title = argStr(args, 'title');
                    need(!mgr.workflows.some(w => w.title === title), `A workflow titled "${title}" already exists.`);
                    const stepsIn = Array.isArray(args.steps) ? args.steps : [];
                    need(stepsIn.length, 'steps is required — at least one step.');
                    const steps = stepsIn.map((raw, i) => {
                        const agent = findAgent(String(raw.agent || ''));
                        const stepTitle = String(raw.title || '').trim();
                        need(stepTitle, `Step ${i + 1}: title is required.`);
                        const prompt = String(raw.prompt || '').trim();
                        need(prompt || raw.webhook || raw.media, `Step ${i + 1}: prompt is required.`);
                        const { agent: _agentRef, ...passthrough } = raw;
                        return { ...passthrough, agentId: agent.id, agentName: agent.name, title: stepTitle, prompt, mode: raw.mode === 'interactive' ? 'interactive' : 'headless' };
                    });
                    const w = mgr.addWorkflow(title, steps);
                    return { id: w.id, title: w.title, steps: w.steps.length };
                }
            },
            {
                op: 'workflows.delete',
                describe: 'Remove a workflow. args: id or title',
                handler: (args) => {
                    const ref = optStr(args, 'id') || argStr(args, 'title');
                    const w = mgr.workflows.find(x => x.id === ref || x.title === ref);
                    need(w, 'Workflow not found — workflows.list shows current ones.');
                    mgr.deleteWorkflow(w);
                    return { deleted: w.title };
                }
            },
            {
                op: 'templates.add',
                describe: 'Save a task template. args: title, prompt, mode?, agent?',
                handler: (args) => {
                    const title = argStr(args, 'title');
                    need(!mgr.templates.some(t => t.title === title), `A template titled "${title}" already exists.`);
                    const agent = optStr(args, 'agent') ? findAgent(optStr(args, 'agent')) : undefined;
                    const tpl = mgr.addTemplate({
                        title, prompt: argStr(args, 'prompt'),
                        mode: optStr(args, 'mode') === 'interactive' ? 'interactive' : 'headless',
                        agentId: agent && agent.id, agentName: agent && agent.name
                    });
                    return { id: tpl.id, title: tpl.title };
                }
            },
            {
                op: 'templates.delete',
                describe: 'Remove a template. args: id or title',
                handler: (args) => {
                    const ref = optStr(args, 'id') || argStr(args, 'title');
                    const tpl = mgr.templates.find(x => x.id === ref || x.title === ref);
                    need(tpl, 'Template not found — templates.list shows current ones.');
                    mgr.deleteTemplate(tpl);
                    return { deleted: tpl.title };
                }
            }
        ]);

        const noSteps = await reg.dispatch('workflows.add', { title: 'Boş' });
        ok('workflows.add demands steps', !noSteps.ok && /at least one step/.test(noSteps.error));
        const badStep = await reg.dispatch('workflows.add',
            { title: 'Yarım', steps: [{ agent: 'dev', title: 'adım' }] });
        ok('workflows.add validates each step', !badStep.ok && /prompt is required/.test(badStep.error));
        const wf = await reg.dispatch('workflows.add', {
            title: 'Rapor zinciri',
            steps: [
                { agent: 'dev', title: 'Topla', prompt: 'topla', outputContract: 'json' },
                { agent: 'dev', title: 'Yaz', prompt: 'yaz', runIf: 'json:ok~true', onFail: 'continue' }
            ]
        });
        ok('workflows.add resolves agents and passes advanced fields through',
            wf.ok && wf.result.steps === 2 && mgr.workflows[0].steps[0].agentId === 'a1'
            && mgr.workflows[0].steps[0].outputContract === 'json' && mgr.workflows[0].steps[1].runIf === 'json:ok~true');
        const dupWf = await reg.dispatch('workflows.add', { title: 'Rapor zinciri', steps: [{ agent: 'dev', title: 't', prompt: 'p' }] });
        ok('workflows.add refuses a duplicate title', !dupWf.ok && /already exists/.test(dupWf.error));
        const wfGone = await reg.dispatch('workflows.delete', { title: 'Rapor zinciri' });
        ok('workflows.delete removes the workflow', wfGone.ok && mgr.workflows.length === 0);

        const tpl = await reg.dispatch('templates.add', { title: 'Günlük özet', prompt: 'özetle', agent: 'dev' });
        ok('templates.add saves a bound template', tpl.ok && mgr.templates[0].agentName === 'dev');
        const tplFree = await reg.dispatch('templates.add', { title: 'Serbest', prompt: 'yap' });
        ok('templates.add saves an unbound template', tplFree.ok && mgr.templates[1].agentId === undefined);
        const tplGone = await reg.dispatch('templates.delete', { title: 'Serbest' });
        ok('templates.delete removes the template', tplGone.ok && mgr.templates.length === 1);
    }

    // ---------- §19.C: U-9 Faz 2 — the workflow CHAIN is bridge-manageable ----------
    // ‼️ WHATEVER THE PAGE CAN DO, AN AGENT CAN ASK FOR. The workflow form now
    // builds, reorders and edits a chain; the same acts have to exist as ops or
    // the surfaces have drifted the day the form shipped. Same handler shapes
    // extension.ts registers, over a mock manager.
    {
        const agents = [{ id: 'a1', name: 'dev' }, { id: 'a2', name: 'genel' }];
        const findAgent = (ref) => {
            const a = agents.find(x => x.id === ref || x.name === String(ref).toLowerCase());
            need(a, `Agent "${ref}" not found.`);
            return a;
        };
        const bridgeStep = (raw, i) => {
            need(raw && typeof raw === 'object' && !Array.isArray(raw), `Step ${i + 1} must be an object.`);
            const stepTitle = String(raw.title || '').trim();
            need(stepTitle, `Step ${i + 1}: title is required.`);
            const prompt = String(raw.prompt || '').trim();
            const label = raw.webhook ? 'webhook' : raw.media ? 'media'
                : raw.approval ? 'approval' : raw.select ? 'select' : '';
            need(prompt || label || raw.browser, `Step ${i + 1}: prompt is required.`);
            const { agent: agentRef, ...passthrough } = raw;
            const who = label && !String(agentRef || '').trim()
                ? { id: '', name: label }
                : findAgent(String(agentRef || ''));
            return {
                ...passthrough, agentId: who.id, agentName: who.name,
                title: stepTitle, prompt,
                mode: raw.mode === 'interactive' ? 'interactive' : 'headless'
            };
        };
        const mgr = {
            persisted: 0,
            workflows: [{
                id: 'w1', title: 'zincir', steps: [
                    { agentId: 'a1', agentName: 'dev', title: 'bir', prompt: 'p1', mode: 'headless' },
                    { agentId: 'a1', agentName: 'dev', title: 'iki', prompt: 'p2', mode: 'headless' }
                ]
            }],
            persist() { this.persisted++; },
            addWorkflowStep(w, s) { w.steps.push(s); this.persist(); },
            updateWorkflowStep(w, i, patch) { w.steps[i] = { ...w.steps[i], ...patch }; this.persist(); },
            moveWorkflowStep(w, i, d) { const s = w.steps[i]; w.steps[i] = w.steps[i + d]; w.steps[i + d] = s; this.persist(); },
            deleteWorkflowStep(w, i) { w.steps.splice(i, 1); this.persist(); }
        };
        const bridgeWorkflow = (ref) => {
            const w = mgr.workflows.find(x => x.id === ref || x.title === ref);
            need(w, 'Workflow not found — workflows.list shows current ones.');
            return w;
        };
        const bridgeStepAt = (w, at) => {
            const n = Number(at);
            need(Number.isInteger(n) && n >= 1 && n <= w.steps.length,
                `at must be a step number between 1 and ${w.steps.length}.`);
            return n - 1;
        };
        reg.register([
            {
                op: 'workflows.update',
                describe: 'Rename a workflow and/or replace its whole step chain. args: id or title, newTitle?, steps?',
                handler: (args) => {
                    const w = bridgeWorkflow(optStr(args, 'id') || argStr(args, 'title'));
                    const newTitle = optStr(args, 'newTitle');
                    if (newTitle) {
                        need(!mgr.workflows.some(x => x.id !== w.id && x.title === newTitle),
                            `A workflow titled "${newTitle}" already exists.`);
                        w.title = newTitle;
                    }
                    if (Array.isArray(args.steps)) { w.steps = args.steps.map(bridgeStep); }
                    mgr.persist();
                    return { id: w.id, title: w.title, steps: w.steps.length };
                }
            },
            {
                op: 'workflows.step.add',
                describe: 'Append one step to a workflow. args: workflow (id or title), step',
                handler: (args) => {
                    const w = bridgeWorkflow(optStr(args, 'workflow') || argStr(args, 'id'));
                    need(args.step && typeof args.step === 'object', 'step is required.');
                    mgr.addWorkflowStep(w, bridgeStep(args.step, w.steps.length));
                    return { id: w.id, title: w.title, steps: w.steps.length };
                }
            },
            {
                op: 'workflows.step.update',
                describe: 'Replace one step of a workflow by its 1-based place. args: workflow, at, step',
                handler: (args) => {
                    const w = bridgeWorkflow(optStr(args, 'workflow') || argStr(args, 'id'));
                    const i = bridgeStepAt(w, args.at);
                    need(args.step && typeof args.step === 'object', 'step is required.');
                    const cleared = {
                        webhook: undefined, media: undefined, browser: undefined,
                        approval: undefined, select: undefined,
                        onFail: undefined, runIf: undefined, outputContract: undefined,
                        verify: undefined, parallel: undefined
                    };
                    mgr.updateWorkflowStep(w, i, { ...cleared, ...bridgeStep(args.step, i) });
                    return { id: w.id, at: i + 1, title: w.steps[i].title };
                }
            },
            {
                op: 'workflows.step.move',
                describe: 'Move one step up or down the chain. args: workflow, at, dir (up|down)',
                handler: (args) => {
                    const w = bridgeWorkflow(optStr(args, 'workflow') || argStr(args, 'id'));
                    const i = bridgeStepAt(w, args.at);
                    const dir = optStr(args, 'dir') === 'up' ? -1 : 1;
                    need(i + dir >= 0 && i + dir < w.steps.length,
                        'That step is already at the end it is being moved to.');
                    mgr.moveWorkflowStep(w, i, dir);
                    return { id: w.id, at: i + 1 + dir, steps: w.steps.map(s => s.title) };
                }
            },
            {
                op: 'workflows.step.delete',
                describe: 'Remove one step from a workflow by its 1-based place. args: workflow, at',
                handler: (args) => {
                    const w = bridgeWorkflow(optStr(args, 'workflow') || argStr(args, 'id'));
                    const i = bridgeStepAt(w, args.at);
                    const gone = w.steps[i].title;
                    mgr.deleteWorkflowStep(w, i);
                    return { id: w.id, deleted: gone, steps: w.steps.length };
                }
            }
        ]);

        ok('the chain ops are in the catalog',
            ['workflows.update', 'workflows.step.add', 'workflows.step.update',
                'workflows.step.move', 'workflows.step.delete']
                .every(op => reg.catalog().some(c => c.op === op)));

        const added = await reg.dispatch('workflows.step.add', {
            workflow: 'zincir',
            step: { agent: 'genel', title: 'üç', prompt: 'p3', onFail: 'continue', parallel: true }
        });
        ok('workflows.step.add appends a step with its chain behaviour',
            added.ok && added.result.steps === 3
            && mgr.workflows[0].steps[2].agentId === 'a2'
            && mgr.workflows[0].steps[2].onFail === 'continue'
            && mgr.workflows[0].steps[2].parallel === true);

        // ‼️ A step that is NOT an agent does not need one — its agentName is
        // the label its run is filed under. The old mapper demanded an agent
        // for every step, so an approval gate could not be added at all.
        const gate = await reg.dispatch('workflows.step.add', {
            workflow: 'zincir', step: { title: 'onay', approval: { message: 'bak' } }
        });
        ok('workflows.step.add takes an approval gate with no agent and no prompt',
            gate.ok && mgr.workflows[0].steps[3].agentName === 'approval');
        const nameless = await reg.dispatch('workflows.step.add', { workflow: 'zincir', step: { prompt: 'p' } });
        ok('…but it still demands a title', !nameless.ok && /title is required/.test(nameless.error));

        const moved = await reg.dispatch('workflows.step.move', { workflow: 'zincir', at: 1, dir: 'down' });
        ok('workflows.step.move swaps two steps', moved.ok && mgr.workflows[0].steps[0].title === 'iki');
        const offEnd = await reg.dispatch('workflows.step.move', { workflow: 'zincir', at: 1, dir: 'up' });
        ok('…and refuses to move the first step up', !offEnd.ok && /already at the end/.test(offEnd.error));
        const badAt = await reg.dispatch('workflows.step.delete', { workflow: 'zincir', at: 99 });
        ok('a place off the end is refused with the range', !badAt.ok && /between 1 and 4/.test(badAt.error));

        // Switching a step's KIND has to take the old kind off it, or the runner
        // still sees the webhook it was told to stop being.
        await reg.dispatch('workflows.step.update', {
            workflow: 'zincir', at: 1, step: { title: 'çağır', webhook: { url: 'https://x/y' } }
        });
        ok('workflows.step.update can turn a step into a webhook',
            mgr.workflows[0].steps[0].webhook && mgr.workflows[0].steps[0].agentName === 'webhook');
        await reg.dispatch('workflows.step.update', {
            workflow: 'zincir', at: 1, step: { agent: 'dev', title: 'geri', prompt: 'p' }
        });
        ok('‼️ …and turning it back drops the webhook rather than merging over it',
            mgr.workflows[0].steps[0].webhook === undefined
            && mgr.workflows[0].steps[0].agentName === 'dev');

        const whole = await reg.dispatch('workflows.update', {
            id: 'w1', newTitle: 'yeni zincir',
            steps: [{ agent: 'dev', title: 'tek', prompt: 'p' }]
        });
        ok('workflows.update saves the name and the whole chain in one call',
            whole.ok && mgr.workflows[0].title === 'yeni zincir' && mgr.workflows[0].steps.length === 1);
        const emptied = await reg.dispatch('workflows.update', { id: 'w1', steps: [] });
        ok('…and an empty list really empties it', emptied.ok && mgr.workflows[0].steps.length === 0);
        const noWf = await reg.dispatch('workflows.update', { title: 'yok' });
        ok('an unknown workflow is refused by name', !noWf.ok && /Workflow not found/.test(noWf.error));
    }

    // ---------- §19.C: U-9 — extension.ts really registers the new ops ----------
    {
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        for (const op of ['workflows.update', 'workflows.step.add', 'workflows.step.update',
            'workflows.step.move', 'workflows.step.delete', 'tasks.history']) {
            ok(`extension.ts registers ${op}`, src.includes(`op: '${op}'`));
        }
        const at = src.indexOf("op: 'tasks.rerun'");
        // ‼️ TO THE NEXT OP, not a fixed number of characters — a window that has
        // to be widened every time the contract gains a sentence fails for the
        // wrong reason, and this one just did.
        const block = src.slice(at, src.indexOf("op: 'tasks.history'", at));
        ok('‼️ tasks.rerun takes the retry\'s edits, the way the page\'s retry form does',
            /prompt\?/.test(block) && /model\?/.test(block) && /effort\?/.test(block)
            && /permissionMode\?/.test(block));
        ok('…and it CALLS retryTask rather than rebuilding the lineage',
            /taskManager\.retryTask\(/.test(block));
        // ‼️ M-14 — THE ONE FIELD "EVERYTHING OMITTED IS THE ORIGINAL'S" DID NOT
        // COVER. `optStr` returns '' for an absent arg and `retryTask` merges
        // with `??`, which keeps '', so every bridge retry that did not restate
        // the prompt ran with an empty one — against this op's own contract, and
        // silently on any engine that tolerates an empty prompt. It also made the
        // workflow-step branch (`newPrompt === undefined`) unreachable from here.
        // Caught by a real run on OpenCode, which refuses an empty prompt.
        ok('‼️ …and it does not hand `optStr`\'s empty string to it as if it were a prompt',
            !/retryTask\(t as FarmTask, optStr\(args, 'prompt'\)/.test(block)
            && /optStr\(args, 'prompt'\) \|\| undefined/.test(block));
    }

    // ---------- §19.C: mission-control ops contract (pause/resume/cancel/answer/approve) ----------
    {
        const runs = [
            { id: 'r-live', status: 'running' },
            { id: 'r-parked', status: 'paused' },
            { id: 'r-done', status: 'done' }
        ];
        const store = { run: (id) => runs.find(r => r.id === id) };
        const engine = { paused: false, unpaused: false, pause() { this.paused = true; }, unpause() { this.unpaused = true; } };
        const engines = new Map([['r-live', engine]]);
        const questions = new Map([['r-live', { question: 'Hangi klasör?', answer: undefined, answered: false, resolve(a) { this.answer = a; this.answered = true; } }]]);
        const approvals = new Map([['r-live', 'ap1']]);
        const settled = [];
        const queue = { settle: (id, okFlag) => settled.push({ id, ok: okFlag }) };
        let resumed = null, cancelled = null;
        const resumeMission = (id) => { resumed = id; runs.find(r => r.id === id).status = 'running'; };
        const cancelMission = (id) => { cancelled = id; runs.find(r => r.id === id).status = 'cancelled'; };
        let changed = 0;
        const missionChanged = () => changed++;
        reg.register([
            {
                op: 'missions.pause',
                describe: 'Pause a live mission run. args: id',
                handler: (args) => {
                    const runId = argStr(args, 'id');
                    const run = store.run(runId);
                    need(run, 'Run not found — missions.list shows current ids.');
                    const e = engines.get(runId);
                    if (e) { e.pause(); }
                    else {
                        need(run.status === 'running' || run.status === 'waiting-approval' || run.status === 'waiting-user',
                            `Run is ${run.status} — only a live run can be paused.`);
                        run.status = 'paused';
                    }
                    missionChanged();
                    return { id: runId, status: run.status };
                }
            },
            {
                op: 'missions.resume',
                describe: 'Resume a paused mission. args: id',
                handler: (args) => {
                    const runId = argStr(args, 'id');
                    const run = store.run(runId);
                    need(run, 'Run not found — missions.list shows current ids.');
                    const e = engines.get(runId);
                    if (e) { e.unpause(); missionChanged(); }
                    else {
                        need(run.status === 'paused', `Run is ${run.status} — only a paused run can be resumed.`);
                        resumeMission(runId);
                    }
                    return { id: runId, status: store.run(runId).status };
                }
            },
            {
                op: 'missions.cancel',
                describe: 'Cancel a mission run. args: id',
                handler: (args) => {
                    const runId = argStr(args, 'id');
                    const run = store.run(runId);
                    need(run, 'Run not found — missions.list shows current ids.');
                    need(run.status !== 'done' && run.status !== 'failed' && run.status !== 'cancelled',
                        `Run is already ${run.status}.`);
                    cancelMission(runId);
                    return { id: runId, status: store.run(runId).status };
                }
            },
            {
                op: 'missions.answer',
                describe: 'Answer the question a mission waits on. args: id, answer — or skip=true',
                handler: (args) => {
                    const runId = argStr(args, 'id');
                    need(questions.has(runId), 'No pending question on this run — missions.status shows what it is doing.');
                    if (args.skip === true) { questions.get(runId).resolve(undefined); return { id: runId, skipped: true }; }
                    questions.get(runId).resolve(argStr(args, 'answer'));
                    return { id: runId, answered: true };
                }
            },
            {
                op: 'missions.approve',
                describe: 'Settle a mission round waiting for approval. args: id, ok?',
                handler: (args) => {
                    const runId = argStr(args, 'id');
                    const apId = approvals.get(runId);
                    need(apId, 'No pending approval on this run — missions.status shows its state.');
                    queue.settle(apId, args.ok !== false);
                    return { id: runId, approved: args.ok !== false };
                }
            }
        ]);
        ok('mission-control ops appear in the catalog',
            ['missions.pause', 'missions.resume', 'missions.cancel', 'missions.answer', 'missions.approve']
                .every(op => reg.catalog().some(c => c.op === op)));

        const paused = await reg.dispatch('missions.pause', { id: 'r-live' });
        ok('missions.pause reaches the live engine', paused.ok && engine.paused === true && changed === 1);
        const pauseDone = await reg.dispatch('missions.pause', { id: 'r-done' });
        ok('missions.pause refuses a finished run', !pauseDone.ok && /only a live run/.test(pauseDone.error));

        const resumedLive = await reg.dispatch('missions.resume', { id: 'r-live' });
        ok('missions.resume unpauses a live engine in place', resumedLive.ok && engine.unpaused === true && resumed === null);
        const resumedParked = await reg.dispatch('missions.resume', { id: 'r-parked' });
        ok('missions.resume relaunches a parked run', resumedParked.ok && resumed === 'r-parked'
            && resumedParked.result.status === 'running');
        const resumeDone = await reg.dispatch('missions.resume', { id: 'r-done' });
        ok('missions.resume refuses a finished run', !resumeDone.ok && /only a paused run/.test(resumeDone.error));

        const noQuestion = await reg.dispatch('missions.answer', { id: 'r-parked', answer: 'x' });
        ok('missions.answer refuses when nothing is pending', !noQuestion.ok && /No pending question/.test(noQuestion.error));
        const answered = await reg.dispatch('missions.answer', { id: 'r-live', answer: 'D:\\inbox' });
        ok('missions.answer resolves the pending question with the text',
            answered.ok && questions.get('r-live').answer === 'D:\\inbox');

        const approvedNo = await reg.dispatch('missions.approve', { id: 'r-live', ok: false });
        ok('missions.approve can reject the round plan', approvedNo.ok && settled[0].id === 'ap1' && settled[0].ok === false);
        const noApproval = await reg.dispatch('missions.approve', { id: 'r-parked' });
        ok('missions.approve refuses when nothing is pending', !noApproval.ok && /No pending approval/.test(noApproval.error));

        const cancelledR = await reg.dispatch('missions.cancel', { id: 'r-live' });
        ok('missions.cancel cancels a live run', cancelledR.ok && cancelled === 'r-live'
            && cancelledR.result.status === 'cancelled');
        const cancelAgain = await reg.dispatch('missions.cancel', { id: 'r-done' });
        ok('missions.cancel refuses an already-finished run', !cancelAgain.ok && /already done/.test(cancelAgain.error));
    }

    // ---------- S-33: the two OpenCode history ops, and the one that is absent ----------
    // ‼️ THIS ENGINE'S HISTORY IS THE ONLY ONE THAT COSTS A PROCESS. Every other
    // source reads a file the engine left behind; OpenCode keeps its
    // conversations in SQLite and publishes `session list` / `export`, so an
    // agent asked "what did I do in OpenCode yesterday?" needs a way to say
    // "read it NOW" rather than waiting for a deliberately slow beat.
    {
        let harvested = 0;
        reg.register({
            op: 'sessions.opencodeSync',
            describe: 'Read OpenCode\'s own history back into the sessions tables. args: force? (default true)',
            handler: (args) => {
                const force = typeof args.force === 'boolean' ? args.force : true;
                harvested++;
                return { ran: force || harvested === 1, roots: 2, listed: 6, exported: force ? 1 : 0, failed: 0 };
            }
        });
        ok('sessions.opencodeSync is in the catalog', reg.catalog().some(c => c.op === 'sessions.opencodeSync'));
        const r = await reg.dispatch('sessions.opencodeSync', {});
        ok('an agent asking for it gets a real harvest by default',
            r.ok && r.result.ran === true && r.result.exported === 1);
        const soft = await reg.dispatch('sessions.opencodeSync', { force: false });
        ok('…and can ask for the polite version, which the quiet floor may refuse',
            soft.ok && soft.result.exported === 0);

        reg.register({
            op: 'sessions.opencodeExport',
            describe: 'One OpenCode conversation as the engine\'s own export document. args: sessionId, sanitize?, fresh?',
            handler: (args) => {
                const id = argStr(args, 'sessionId');
                need(/^ses_[0-9a-zA-Z]+$/.test(id), 'sessionId must be an OpenCode conversation id (ses_…)');
                return { sessionId: id, sanitized: args.sanitize === true, source: args.fresh ? 'cli' : 'cache' };
            }
        });
        const bad = await reg.dispatch('sessions.opencodeExport', { sessionId: 'rollout-2026' });
        ok('‼️ an id from another engine is refused by name, not exported as nothing',
            !bad.ok && /ses_/.test(bad.error));
        const cached = await reg.dispatch('sessions.opencodeExport', { sessionId: 'ses_abc' });
        ok('the cached read is the default — no spawn for a document already on disk',
            cached.ok && cached.result.source === 'cache' && cached.result.sanitized === false);
        const clean = await reg.dispatch('sessions.opencodeExport', { sessionId: 'ses_abc', sanitize: true });
        ok('…and the redacted form says so on the row it returns', clean.ok && clean.result.sanitized === true);

        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        const sync = src.slice(src.indexOf("op: 'sessions.opencodeSync'"), src.indexOf("op: 'sessions.opencodeExport'"));
        ok('extension.ts registers the sync op and says why it is not automatic',
            /force\?/.test(sync) && /cwd-scoped/.test(sync) && /harvestOpencode\(force\)/.test(sync));
        const exp = src.slice(src.indexOf("op: 'sessions.opencodeExport'"), src.indexOf("op: 'sessions.pin'"));
        ok('…and the export op states the sanitize contract in the engine\'s own terms',
            /--sanitize/.test(exp) && /OPENCODE_SESSION_ID\.test/.test(exp));
        ok('‼️ …and says out loud that deleting a conversation is NOT on the bridge',
            /no delete op/.test(exp) && /human-only/.test(exp));
        // The rule the parity gate enforces, asserted here too because it is a
        // SECURITY boundary and not a bookkeeping one: an agent must not be able
        // to destroy the user's conversations through a request file.
        ok('no bridge op deletes an OpenCode conversation',
            !/op: 'sessions\.opencodeDelete/.test(src));
    }

    // ---------- §19.C: sessions.recent origin scope ----------
    // The Sessions tables let the user separate their own dialogs from the
    // farm's automation runs; the same distinction has to be reachable as data,
    // or an agent asked "what did I work on yesterday?" answers with its own
    // scheduled sweeps. Same handler shape extension.ts registers.
    {
        const Module = require('module');
        const origLoad = Module._load;
        Module._load = function (request) {
            if (request === 'vscode') { return { Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) } }; }
            return origLoad.apply(this, arguments);
        };
        const { sessionOrigin } = require(path.join(__dirname, '..', 'out', 'core', 'sessions.js'));
        Module._load = origLoad;
        const all = [
            { agentName: 'dev', title: 'my dialog', lastTs: 300, mtime: 0, userTurns: 4, cost: 1, entrypoint: 'cli' },
            { agentName: 'dev', title: 'nightly sweep', lastTs: 200, mtime: 0, userTurns: 1, cost: 2, entrypoint: 'sdk-cli' },
            { agentName: 'psy', title: 'older dialog', lastTs: 100, mtime: 0, userTurns: 2, cost: 3 }
        ];
        reg.register({
            op: 'sessions.recent',
            describe: 'Most recent sessions farm-wide. args: origin? ("user" | "auto" | omit), limit? (default 10)',
            handler: (args) => {
                const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.floor(args.limit) : 10;
                const origin = optStr(args, 'origin').toLowerCase();
                return all
                    .filter(s => origin !== 'user' && origin !== 'auto' ? true : sessionOrigin(s) === origin)
                    .slice().sort((a, b) => (b.lastTs || b.mtime) - (a.lastTs || a.mtime))
                    .slice(0, limit)
                    .map(s => ({ agent: s.agentName, title: s.title, origin: sessionOrigin(s) }));
            }
        });
        ok('sessions.recent appears in the catalog', reg.catalog().some(c => c.op === 'sessions.recent'));
        const every = await reg.dispatch('sessions.recent', {});
        ok('no origin arg = every session, newest first',
            every.ok && every.result.length === 3 && every.result[0].title === 'my dialog');
        ok('every row states its origin', every.result.every(r => r.origin === 'user' || r.origin === 'auto'));
        const mine = await reg.dispatch('sessions.recent', { origin: 'user' });
        ok('origin=user drops the automation runs',
            mine.ok && mine.result.length === 2 && !mine.result.some(r => r.title === 'nightly sweep'));
        const auto = await reg.dispatch('sessions.recent', { origin: 'auto' });
        ok('origin=auto keeps only them', auto.ok && auto.result.length === 1 && auto.result[0].title === 'nightly sweep');
        const junk = await reg.dispatch('sessions.recent', { origin: 'whatever' });
        ok('an unrecognized origin means "both", never "nothing"', junk.ok && junk.result.length === 3);

        // the real registration must carry the same contract (this mirror can drift)
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        // Wide enough to hold the whole registration, describe included — a
        // window sized to yesterday's describe fails the day one grows.
        const block = src.slice(src.indexOf("op: 'sessions.recent'"), src.indexOf("op: 'sessions.start'"));
        ok('extension.ts registers sessions.recent with the origin arg',
            /origin\?/.test(block) && /sessionOrigin\(s\) === origin/.test(block) && /origin: sessionOrigin\(s\)/.test(block));
        // …and says WHICH mechanism started an automation run, by name — the
        // fact origin is now decided from (core/sessions.ts sessionOrigin).
        ok('…and carries the launcher and the session id an agent needs to act',
            /launchedBy: s\.launchedBy/.test(block) && /id: s\.sessionId/.test(block));
        // ‼️ S-35 — the tables' 🌙 chip, reachable as data. An agent asked "did
        // that run have anybody at it" must not have to infer it from the
        // entrypoint, and the field is on every row whether or not it is
        // filtered on — a filter you have to know about to see a fact is a
        // fact that stays hidden.
        ok('…and splits the robots the way the tables do (S-35)',
            /headless\?/.test(block) && /sessionHeadless\(s\) === wantHeadless/.test(block)
            && /headless: sessionHeadless\(s\)/.test(block));
    }

    // ---------- U-3: search.transcripts — the Search page's own question ------
    //
    // ‼️ AN AGENT'S COMMONEST RESEARCH QUESTION HAD NO ANSWER ON THE BRIDGE.
    // "Where did we discuss this, and what was said" was reachable only by
    // reading transcripts by hand, while the panel that answers it in a second
    // sat behind a webview. Same engine as the panel (core/search.ts), so there
    // is one behaviour rather than a second implementation that drifts.
    {
        const Module = require('module');
        const origLoad = Module._load;
        Module._load = function (request) {
            if (request === 'vscode') { return { Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) } }; }
            return origLoad.apply(this, arguments);
        };
        const S = require(path.join(__dirname, '..', 'out', 'core', 'search.js'));
        Module._load = origLoad;

        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-bridge-search-'));
        const f = path.join(dir, 'sess.jsonl');
        const at = (d) => new Date(d).toISOString();
        fs.writeFileSync(f, [
            JSON.stringify({ type: 'user', timestamp: at('2026-08-01T10:00:00Z'), message: { content: 'the parser is wrong' } }),
            JSON.stringify({ type: 'assistant', timestamp: at('2026-08-01T10:00:05Z'), message: { content: [{ type: 'text', text: 'I will fix the parser' }] } }),
            JSON.stringify({ type: 'user', timestamp: at('2026-08-09T09:00:00Z'), message: { content: 'the parser again' } }),
            // X-25: written by an AGENT handing work over, not by a person
            JSON.stringify({ type: 'user', isSidechain: true, timestamp: at('2026-08-09T09:01:00Z'), message: { content: 'take the parser from here' } })
        ].join('\n'), 'utf8');
        const sessions = [{ file: f, agentName: 'dev', title: 'parser work', mtime: Date.now() }];

        const roleOf = v => Array.isArray(v) ? v.filter(S.isSearchRole) : undefined;
        const when = (v, end) => {
            if (typeof v === 'number' && v > 0) { return v; }
            if (typeof v !== 'string' || !v.trim()) { return undefined; }
            const bare = /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
            const t = Date.parse(bare ? `${v.trim()}T${end ? '23:59:59.999' : '00:00:00.000'}` : v);
            return Number.isFinite(t) ? t : undefined;
        };
        reg.register({
            op: 'search.transcripts',
            describe: 'Search the fleet\'s transcripts. args: query, roles?, from?/to?, agents?, limit?',
            handler: (args) => {
                const roles = roleOf(args.roles);
                const r = S.searchTranscripts(sessions, String(args.query || ''), {
                    roles: roles && roles.length ? roles : undefined,
                    tsFrom: when(args.from, false),
                    tsTo: when(args.to, true),
                    maxHits: 150, maxPerFile: 400
                });
                return {
                    scanned: r.filesScanned,
                    partial: r.truncated || r.timedOut === true,
                    hits: r.hits.map(h => ({ role: h.role, ts: h.ts, match: h.match, after: h.after, kind: h.kind }))
                };
            }
        });

        // ‼️ X-147 — the session is titled "parser work", so every query for
        // `parser` below also gets ONE title hit (kind: 'title'), whatever the
        // roles: the title is the session's own name, not a message. The
        // message assertions look past it; the hit itself is asserted once.
        const said = r => r.result.hits.filter(h => h.kind !== 'title');
        const named = r => r.result.hits.filter(h => h.kind === 'title');

        ok('search.transcripts appears in the catalog',
            reg.catalog().some(c => c.op === 'search.transcripts'));
        const all = await reg.dispatch('search.transcripts', { query: 'parser' });
        ok('a query finds what was said, both sides of the conversation',
            all.ok && said(all).length === 3);
        ok('X-147: …and the session named after the word, as a title hit',
            all.ok && named(all).length === 1 && named(all)[0].role === 'title' && named(all)[0].match === 'parser');
        ok('…and says whether the answer is complete', all.ok && all.result.partial === false);

        // ‼️ The two questions the roles arg exists for, and the reason the
        // Search page's chips were rebuilt: "only what I asked" and "only what
        // it answered" are different questions from "the conversation".
        const mine = await reg.dispatch('search.transcripts', { query: 'parser', roles: ['user'] });
        ok('‼️ roles=["user"] searches only what a person asked',
            mine.ok && said(mine).length === 2 && said(mine).every(h => h.role === 'user'));
        const theirs = await reg.dispatch('search.transcripts', { query: 'parser', roles: ['assistant'] });
        ok('‼️ …and roles=["assistant"] only what an agent answered',
            theirs.ok && said(theirs).length === 1 && said(theirs)[0].role === 'assistant');
        ok('X-147: the title is matched under any conversation role',
            named(mine).length === 1 && named(theirs).length === 1);

        // The window is the MESSAGE's own time, not the session's mtime — this
        // transcript was written today and still has nothing from the 1st in a
        // window that ends on the 1st… and everything, in one that includes it.
        const day = await reg.dispatch('search.transcripts', { query: 'parser', from: '2026-08-01', to: '2026-08-01' });
        ok('‼️ a date window filters what was SAID, not when the file was touched',
            day.ok && day.result.hits.length === 2);
        ok('X-147: …and the title, dated by the session\'s activity, is outside that window',
            day.ok && named(day).length === 0);
        ok('…and "to" covers the whole of its day, or a one-day window finds nothing',
            day.ok && day.result.hits.some(h => h.ts === Date.parse('2026-08-01T10:00:05Z')));
        const late = await reg.dispatch('search.transcripts', { query: 'parser', from: '2026-08-05' });
        ok('…an open-ended window is honoured too', late.ok && said(late).length === 1 && named(late).length === 1);

        // ‼️ X-25 — the two kinds that used to hide inside `user`. A delegation
        // is an agent writing to an agent; asking for what a PERSON said and
        // being handed that text is the defect the roles were split over.
        const dele = await reg.dispatch('search.transcripts', { query: 'parser', roles: ['delegator'] });
        ok('‼️ roles=["delegator"] finds one agent\'s handover to another',
            dele.ok && said(dele).length === 1 && said(dele)[0].role === 'delegator');
        ok('…and it is NOT in what a person asked',
            said(mine).every(h => h.role === 'user'));

        // the real registration must carry the same contract
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        const block = src.slice(src.indexOf("op: 'search.transcripts'"), src.indexOf("op: 'sessions.find'"));
        // ‼️ X-42 — the same SERVICE INSTANCE the page uses, not merely the same
        // function. Two instances would index the same transcripts twice and
        // disagree about which shard is current.
        ok('extension.ts registers it against the panel\'s own engine, not a copy',
            /textSearch\.search\(/.test(block) && /searchMemory\(/.test(block) && /searchLiveEvents\(/.test(block));
        ok('…and that one corpus service is what the Search panel is handed too',
            /new TextSearchService\(\{/.test(src) && /SearchPanel\.show\(\{[\s\S]{0,1400}?\n\s+textSearch,/.test(src));
        ok('…with the roles, the window and the sources on the wire',
            /roles\?/.test(block) && /from\?\/to\?/.test(block)
            && /tsFrom: when\(args\.from, false\)/.test(block) && /tsTo: when\(args\.to, true\)/.test(block));
        ok('‼️ …and it says out loud when the scan was cut short',
            /partial: result\.truncated \|\| result\.timedOut === true/.test(block));
        ok('…handing back what the viewer needs to land on the moment',
            /sessionId: h\.sessionId \?\? null/.test(block) && /engine: h\.engine \?\? null/.test(block));

        // ‼️ X-24 — the session axis reaches the bridge in the SAME words, and
        // through the panel's own scope function rather than a second copy of
        // the rules: an agent told "only Codex sessions with errors" must get
        // the set the person who types it into the panel gets.
        ok('‼️ every filter the panel offers is on the wire too',
            ['engines\\?', 'projects\\?', 'models\\?', 'origin\\?', 'lane\\?',
                'pinnedOnly\\?', 'errorsOnly\\?', 'sessionId\\?', 'wholeWord\\?']
                .every(a => new RegExp(a).test(block)));
        ok('…and they narrow the SCAN through the panel\'s own function',
            /scopeSessions\(index\.allWithExternal\(\)/.test(block)
            && /searchableSessions\(scoped, sessionProjectName\)/.test(block)
            && /}, sessionProjectName\)/.test(block));
        ok('‼️ X-35 — and the other three engines are read, not skipped',
            /parseForeign: \(raw: string, f: string\) => parseCliViewer\(/.test(block));
        ok('…the delegation kinds are documented where an agent will read them',
            /delegator\|handler/.test(block) && /subagent lane/.test(block));

        // ---------- X-284: accounts.complete — the birth contract on the bridge ----------
        const completeBlock = src.slice(src.indexOf("op: 'accounts.complete'"), src.indexOf("op: 'sentry.templates'"));
        ok('‼️ X-284 — the bridge can ask whether an account is complete',
            completeBlock.includes("op: 'accounts.complete'") && /completeSlots\(/.test(completeBlock));
        ok('…and it is a QUESTION first: dryRun defaults to true',
            /optBool\(args, 'dryRun', true\)/.test(completeBlock));
        const helper = src.slice(src.indexOf('const slotCtx = '), src.indexOf('// ‼️ X-284 — THE CONTRACT IS ASKED OF EVERY SLOT'));
        ok('‼️ …and the CARD reads the slot through the same context as the repair',
            /const slotCtx = /.test(src) && /slotCompleteness\(slotCtx\(slot\)\)/.test(src));
        ok('…repairing through the gates\' own primitives, never a second implementation',
            /repairSharedLinks\(dryRun, id\)/.test(helper) && /completeSlot\(ctx, false\)/.test(helper) && /slotCompleteness\(ctx\)/.test(helper));
        ok('…with the live port handed in so the hooks clause is really asked', /hooksPort/.test(helper) && /'livePort'/.test(helper));

        // ---------- X-292: accounts.repairs — what the contract keeps having to put back ----------
        const repairsBlock = src.slice(src.indexOf("op: 'accounts.repairs'"), src.indexOf("op: 'sentry.templates'"));
        ok('‼️ X-292 — the bridge can ask what the contract keeps repairing',
            repairsBlock.includes("op: 'accounts.repairs'") && /repairJournal\.all\(\)/.test(repairsBlock));
        ok('…and it answers the DERIVED correlation, not a declared cause',
            /repairPattern\(all\)/.test(repairsBlock) && /afterHousekeeping/.test(repairsBlock));
        // ‼️ A journal nobody writes to is a describe. Every gate that repairs
        // has to record, and the gate has to be NAMED - a row that cannot say
        // which door ran it cannot show a slot broken between two gates.
        // ‼️ X-301 — four of the five now go through `runContractGate`, which
        // still cannot fail its caller but no longer swallows the reason: a
        // throw is journalled as `clause: 'contract'`. The NAME is what this
        // line is about and it travels either way; `press` is a person standing
        // at the button and reports to them directly.
        ok('‼️ X-292 — every gate that runs the contract names itself',
            /runContractGate\('start'\)/.test(src)
            && /runContractGate\('capture', slot\.id\)/.test(src)
            && /runContractGate\('launch', slot\.id\)/.test(src)
            && /completeSlots\(false, id, 'press'\)/.test(src));
        ok('‼️ X-301 — …and a gate that may not fail its caller may not fail silently',
            /const runContractGate = \(gate: string, slotId\?: string\): void => \{/.test(src)
            && /clause: 'contract',/.test(src));
        ok('…and the repair path records through the one journal',
            /repairJournal\.record\(repairEvents\(/.test(src));
        // ‼️ The stamp is evidence about the state BEFORE the repair. Read it
        // after and it is the repair's own timestamp, proving nothing.
        ok('‼️ X-292 — the housekeeping stamp is read BEFORE the repair runs',
            src.indexOf('const keptAt = housekeepingAt(') < src.indexOf('const after = completeSlot(ctx, false);'));

        // ---------- X-291: accounts.promotions — what the slot taught the fleet ----------
        const promBlock = src.slice(src.indexOf("op: 'accounts.promotions'"), src.indexOf("op: 'accounts.portable'"));
        ok('‼️ X-291 — the bridge can ask what a slot session taught the fleet',
            promBlock.includes("op: 'accounts.promotions'") && /promotionJournal\.all\(\)/.test(promBlock));
        ok('…and it answers the derived pattern beside the rows', /promotionPattern\(all\)/.test(promBlock));
        ok('‼️ …and the describe states the LIMITS, because a promotion writes the user\'s own file',
            promBlock.includes('MCP server definition, never the sign-in')
            && promBlock.includes('only inside entries the fleet already')
            && promBlock.includes('A revocation the user makes in the main directory'));
        // ‼️ THE ORDER IS LOAD-BEARING. The projection reads the OLD base and is
        // the only step that can tell a fleet-side revocation from a slot-side
        // approval; promoting first would overwrite that base and every
        // revocation the user had just made would come straight back.
        ok('‼️ X-291 — the return leg runs AFTER the projection, in the same gate',
            src.indexOf('const after = completeSlot(ctx, false);') < src.indexOf('promoteSlot(slot, gate, false)'));
        ok('…through the one journal, at whichever gate ran', /promotionJournal\.record\(promotionEvents\(/.test(src));
        ok('‼️ X-291 — and the base never outlives the slot it describes',
            /keyBaseStore\.forget\(clean\)/.test(src));
        ok('…and the contract reads that same base, so the two cannot disagree',
            /keyBase: \(file: string\) => keyBaseStore\.get\(slot\.id, file\)/.test(src));

        // ---------- X-276: accounts.portable — the slot dir is stored as a token ----------
        const portableBlock = src.slice(src.indexOf("op: 'accounts.portable'"), src.indexOf("op: 'migration.verify'"));
        ok('‼️ X-276 — the bridge can ask whether the account dirs name a machine, and rewrite them',
            portableBlock.includes("op: 'accounts.portable'") && /unportableDirs\(/.test(portableBlock) && /writeAccounts\(storedAccounts\(\)\)/.test(portableBlock));
        ok('…and it is a QUESTION first: dryRun defaults to true', /optBool\(args, 'dryRun', true\)/.test(portableBlock));
        ok('‼️ X-276 — the store is OPENED through the roots and WRITTEN as tokens, at the one reader and the one writer',
            /normalizeSlots\(cfg\(\)\.get<unknown\[\]>\('accounts', \[\]\), portableRoots\(\)\)/.test(src)
            && /cfg\(\)\.update\('accounts', portableSlots\(list, portableRoots\(\)\)/.test(src));

        // ---------- X-283: migration.verify — one pass/fail out of the checks that exist ----------
        const gateBlock = src.slice(src.indexOf("op: 'migration.verify'"), src.indexOf("op: 'sentry.templates'"));
        ok('‼️ X-283 — the bridge can ask whether the migration worked',
            gateBlock.includes("op: 'migration.verify'") && /migrationGate\(\{/.test(gateBlock));
        ok('…and the gate CALLS the real checks rather than rewriting them: the birth contract, the twins, the tokenizer, the S-61 stores',
            /completeSlots\(true\)/.test(gateBlock) && /duplicateSlots\(/.test(gateBlock)
            && /unportableDirs\(/.test(gateBlock) && /mergeMissing\(held, legacy\)/.test(gateBlock));
        ok('…on the two roots without which nothing else means anything',
            /name: 'claudeDir', path: claudeDir\(\)/.test(gateBlock) && /name: 'globalStorage', path: context\.globalStorageUri\.fsPath/.test(gateBlock));
        ok('‼️ X-286 — the agent repo is measured before the gate runs and handed to it',
            /await measureAgentRepo\(claudeDir\(\)\)/.test(gateBlock) && /repo: \(\) => repo/.test(gateBlock));

        // ---------- X-290: sessions.rescan — the disk outran the watcher ----------
        const rescanBlock = src.slice(src.indexOf("op: 'sessions.rescan'"), src.indexOf("op: 'sessions.find'"));
        ok('‼️ X-290 — the bridge can bring the index up to the disk',
            rescanBlock.includes("op: 'sessions.rescan'") && /index\.sweep\(\)/.test(rescanBlock));
        ok('…and full:true is the palette\'s own Refresh, not a second implementation',
            /index\.scanAll\(\)/.test(rescanBlock) && /index\.reassignAgents\(\)/.test(rescanBlock));
        ok('…answering before/after so a caller can see whether anything moved',
            /before/.test(rescanBlock) && /after: index\.all\(\)\.length/.test(rescanBlock));

        // ---------- X-34: sessions.find — the id you already have ----------
        const findBlock = src.slice(src.indexOf("op: 'sessions.find'"), src.indexOf("op: 'sessions.recent'"));
        ok('‼️ X-34 — the bridge can take an id back to its session',
            findBlock.includes("op: 'sessions.find'") && /findSessions\(index\.allWithExternal\(\)/.test(findBlock));
        ok('…over the whole index and every engine, not the recent ten',
            /engine: s\.source \?\? 'claude'/.test(findBlock) && /file: s\.file/.test(findBlock));
        ok('…and an id prefix is named as the form that works',
            /id prefix/.test(findBlock) && /eight-character prefix/.test(findBlock));

        // the ranking itself is the panel's, and it is what makes a prefix useful
        // (the panel imports `vscode`, so it is loaded behind the same stub)
        Module._load = function (request) {
            if (request === 'vscode') { return { Uri: {}, window: {}, ViewColumn: {}, commands: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) } }; }
            return origLoad.apply(this, arguments);
        };
        const SP = require(path.join(__dirname, '..', 'out', 'panels', 'searchPanel.js'));
        Module._load = origLoad;
        // ‼️ DERIVED, NOT TYPED OUT — which is the whole assertion. The fifth
        // engine appeared here without this file being edited for it; the list
        // is checked so that a facet set that stops following the registry is a
        // failed test rather than a filter nobody can pick.
        ok('Search engine facets come from the one engine registry',
            SP.BUILTIN_SEARCH_ENGINES.join(',') === 'claude,codex,gemini,agy,opencode');
        const pool = [
            { sessionId: '4d361981-aaaa', file: 'a.jsonl', title: 'nothing', agentName: 'dev', lastTs: 1, mtime: 1, tags: [] },
            { sessionId: 'ffffffff-bbbb', file: 'b.jsonl', title: 'about 4d361981', agentName: 'dev', lastTs: 9, mtime: 9, tags: [] },
            { sessionId: 'cccccccc-cccc', file: 'c.jsonl', title: 'other', agentName: 'ops', lastTs: 5, mtime: 5, tags: ['4d361981'] }
        ];
        const found = SP.findSessions(pool, '4d361981', 10);
        ok('‼️ an exact id prefix outranks a session that merely mentions it',
            found.length === 3 && found[0].sessionId === '4d361981-aaaa');
        ok('…a title match comes before a label match', found[1].file === 'b.jsonl');
        ok('…and no query at all means the most recent, newest first',
            SP.findSessions(pool, '', 2).map(s => s.file).join(',') === 'b.jsonl,c.jsonl');
    }

    // ---------- §19.C: usage.plan — the real subscription quota ----------
    // Every other figure the bridge exposes is derived from local transcripts.
    // This one is the plan's own rate-limit state, so an agent can answer
    // "have I got room to run this?" instead of guessing from cost.
    {
        const PU = require(path.join(__dirname, '..', 'out', 'core', 'planusage.js'));
        const payload = {
            five_hour: { utilization: 82.9, resets_at: '2026-07-26T14:40:00+00:00' },
            seven_day: { utilization: 88, resets_at: '2026-07-27T13:00:00+00:00' },
            seven_day_opus: null, seven_day_sonnet: null
        };
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-bridge-usage-'));
        const credFile = path.join(dir, '.credentials.json');
        fs.writeFileSync(credFile, JSON.stringify({
            claudeAiOauth: { accessToken: 'tok', expiresAt: 4102444800000, subscriptionType: 'pro' }
        }));
        let calls = 0;
        const planUsage = new PU.PlanUsageService({
            ttlMs: () => 600000,
            credentialsFile: () => credFile,
            fetchImpl: () => { calls++; return Promise.resolve({ status: 200, body: JSON.stringify(payload) }); }
        });
        // same handler shape extension.ts registers
        reg.register({
            op: 'usage.plan',
            describe: 'Your Claude SUBSCRIPTION rate-limit state as Anthropic reports it. args: force? (default false)',
            handler: async (args) => {
                const snap = await planUsage.get(args.force === true);
                return {
                    state: snap.state, plan: snap.plan, fetchedAt: snap.fetchedAt, note: snap.note,
                    bars: snap.bars.map(b => ({
                        id: b.id, title: b.title, percent: b.percent,
                        resetsAt: b.resetsAt ? new Date(b.resetsAt).toISOString() : null
                    }))
                };
            }
        });
        ok('usage.plan appears in the catalog', reg.catalog().some(c => c.op === 'usage.plan'));
        const r = await reg.dispatch('usage.plan', {});
        ok('dispatch returns the session and weekly bars',
            r.ok && r.result.state === 'ok' && r.result.plan === 'pro' && r.result.bars.length === 2);
        ok('percent is the floored utilization, reset an ISO string',
            r.result.bars[0].percent === 82 && r.result.bars[0].resetsAt === '2026-07-26T14:40:00.000Z');
        await reg.dispatch('usage.plan', {});
        ok('a second call inside the TTL is served from the shared cache', calls === 1);

        // the real registration must carry the same contract (this mirror can drift)
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        const block = src.slice(src.indexOf("op: 'usage.plan'"), src.indexOf("op: 'usage.plan'") + 2600);
        ok('extension.ts registers usage.plan against the shared service',
            /force\?/.test(block) && /resetsAt/.test(block));

        // ---------- B-17: dispatch.test — the dispatcher's answer, on the bridge ----------
        // The same question the "Test Dispatch" command asks from an input box;
        // both doors go through ONE closure (dispatchFor), so an agent gets the
        // rules, the classifier and the candidate hints the person gets.
        {
            const D = require(path.join(__dirname, '..', 'out', 'core', 'dispatch.js'));
            const rules = [{ match: 'uyku|kaygı', agent: 'psikolog' }];
            const dispatchFor = text => D.dispatchText(os.tmpdir(), '', text, rules, [{ name: 'psikolog', hint: '' }], false);
            reg.register({
                op: 'dispatch.test',
                describe: 'B-17 — ask the dispatcher where a piece of work would go. args: text',
                handler: async (args) => {
                    const text = String(args.text || '');
                    if (!text.trim()) { throw new Error('text is required'); }
                    return dispatchFor(text);
                }
            });
            ok('B-17: dispatch.test appears in the catalog', reg.catalog().some(c => c.op === 'dispatch.test'));
            const hit = await reg.dispatch('dispatch.test', { text: 'dün gece uyku tutmadı' });
            ok('B-17: a rule match names the agent and the method',
                hit.ok && hit.result.agent === 'psikolog' && hit.result.method === 'rule');
            const miss = await reg.dispatch('dispatch.test', { text: 'parser refactor' });
            ok('B-17: no rule and no classifier is an honest none', miss.ok && !miss.result.agent && miss.result.method === 'none');
            const empty = await reg.dispatch('dispatch.test', {});
            ok('B-17: an empty text is refused, not dispatched', empty.ok === false);
            const dblock = src.slice(src.indexOf("op: 'dispatch.test'"), src.indexOf("op: 'dispatch.test'") + 1200);
            ok('B-17: extension.ts registers dispatch.test through the command\'s own closure',
                /return dispatchFor\(text\)/.test(dblock) && /args: text/.test(dblock));
            const cmd = src.slice(src.indexOf("registerCommand('agentfarm.testDispatch'"), src.indexOf("registerCommand('agentfarm.testDispatch'") + 900);
            ok('B-17: …and the command palette door uses the same closure, not a second reading of the settings',
                /dispatchFor\(text\)/.test(cmd) && !/dispatchText\(/.test(cmd));
            const man = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'parity.manifest.json'), 'utf8'));
            const cap = man.entries.find(e => e.capability === 'testDispatch');
            ok('B-17: the parity manifest names the op and no longer a gap',
                cap && Array.isArray(cap.ops) && cap.ops.includes('dispatch.test') && !cap.gap);
        }
        // ---------- B-17: parallel.run — the parallel worktree launch, on the bridge ----------
        // The same launch the "Run Parallel…" command makes from its input box;
        // both doors go through core/parallelRuns (planParallel + launchParallel),
        // so the op's dry run IS the plan the command decides on. The core is
        // exercised for real here — a temp git repo, real `git worktree add` —
        // with only the task launch stood in.
        {
            const P = require(path.join(__dirname, '..', 'out', 'core', 'parallelRuns.js'));
            const W = require(path.join(__dirname, '..', 'out', 'core', 'worktree.js'));
            const cp = require('child_process');
            const root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-b17-'));
            const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
            const plain = path.join(root, 'plain'); fs.mkdirSync(plain);
            const g = (a) => cp.execSync('git ' + a, { cwd: repo, stdio: 'pipe', windowsHide: true });
            g('init -q'); g('config user.email t@t'); g('config user.name t'); g('config commit.gpgsign false');
            fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n'); g('add a.txt'); g('commit -q -m base');
            const agentsHere = [{ id: 'gitty', name: 'gitty', dir: repo }, { id: 'plain', name: 'plain', dir: plain }];
            const launches = [];
            let maxConc = 1;
            const parallelPlanFor = (agent, prompts) => P.planParallel({ maxConcurrent: () => maxConc }, agent, prompts);
            const runParallelFor = (agent, prompts) => P.launchParallel({
                launch: (who, title, prompt, workDir) => {
                    launches.push({ who: who.name, title, prompt, workDir });
                    return { id: 't' + launches.length, title };
                }
            }, agent, prompts);
            reg.register({
                op: 'parallel.run',
                describe: 'B-17 — fan prompts out over git worktrees. args: agent, prompts, dryRun? (default true)',
                handler: async (args) => {
                    const agent = agentsHere.find(a => a.name === String(args.agent || ''));
                    if (!agent) { throw new Error('Agent not found'); }
                    const { prompts, dropped } = P.parallelPrompts(args.prompts);
                    if (!prompts.length) { throw new Error('prompts is required'); }
                    const dry = args.dryRun === undefined ? true : !!args.dryRun;
                    const plan = await parallelPlanFor(agent, prompts);
                    if (dry) { return { dryRun: true, ...plan, dropped, launched: [], failed: [] }; }
                    if (!plan.gitRepo) { throw new Error(agent.name + ' is not a git repository'); }
                    const done = await runParallelFor(agent, prompts);
                    return { dryRun: false, ...plan, dropped, ...done };
                }
            });
            ok('B-17: parallel.run appears in the catalog', reg.catalog().some(c => c.op === 'parallel.run'));
            // the input-box grammar and the array form are one parser
            const pp = P.parallelPrompts(' fix the login form ; ; add dark mode;');
            ok('B-17: prompts split on `;`, trimmed, empties dropped',
                pp.prompts.length === 2 && pp.prompts[0] === 'fix the login form' && pp.prompts[1] === 'add dark mode' && pp.dropped.length === 0);
            const eight = P.parallelPrompts(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']);
            ok('B-17: an array is accepted and the cap drops the rest BY NAME',
                eight.prompts.length === P.PARALLEL_MAX && eight.dropped.join(',') === 'p7,p8');
            // dryRun is the default: a plan, nothing created
            const dry = await reg.dispatch('parallel.run', { agent: 'gitty', prompts: 'fix the login form; add dark mode' });
            ok('B-17: dryRun by default answers the plan and launches nothing',
                dry.ok && dry.result.dryRun === true && dry.result.gitRepo === true && dry.result.runs.length === 2
                && dry.result.launched.length === 0 && launches.length === 0
                && !fs.existsSync(W.worktreeBase(repo)));
            ok('B-17: …each run is named by its prompt, on an af/ branch, beside the repo',
                dry.result.runs[0].worktree === 'fix-the-login-form' && dry.result.runs[0].branch.startsWith('af/fix-the-login-form')
                && dry.result.worktreeBase === W.worktreeBase(repo) && dry.result.repo === repo);
            ok('B-17: …and says the runs would be serial when maxConcurrentPerAgent is below their count',
                dry.result.serial === true && dry.result.maxConcurrentPerAgent === 1);
            maxConc = 0;
            const unl = await reg.dispatch('parallel.run', { agent: 'gitty', prompts: ['a', 'b', 'c'] });
            ok('B-17: …unlimited concurrency (0) is not serial', unl.ok && unl.result.serial === false);
            maxConc = 1;
            // a folder that is not a git repo: the plan says so, the launch refuses
            const noGit = await reg.dispatch('parallel.run', { agent: 'plain', prompts: 'x' });
            ok('B-17: a non-git agent folder is a plan with gitRepo:false', noGit.ok && noGit.result.gitRepo === false);
            const noGitLaunch = await reg.dispatch('parallel.run', { agent: 'plain', prompts: 'x', dryRun: false });
            ok('B-17: …and its launch is refused, not attempted', noGitLaunch.ok === false && /not a git repository/.test(noGitLaunch.error) && launches.length === 0);
            const empty = await reg.dispatch('parallel.run', { agent: 'gitty', prompts: ' ; ' });
            ok('B-17: no prompts is refused', empty.ok === false);
            const nobody = await reg.dispatch('parallel.run', { agent: 'ghost', prompts: 'x' });
            ok('B-17: an unknown agent is refused', nobody.ok === false);
            // dryRun:false: real worktrees, one task each, in the worktree
            const live = await reg.dispatch('parallel.run', { agent: 'gitty', prompts: 'fix the login form; add dark mode', dryRun: false });
            const wts = await W.listAfWorktrees(repo);
            ok('B-17: dryRun:false creates one git worktree per prompt on an af/ branch',
                live.ok && live.result.dryRun === false && live.result.launched.length === 2 && live.result.failed.length === 0
                && wts.length === 2 && wts.every(w => w.branch.startsWith('af/') && fs.existsSync(path.join(w.path, 'a.txt'))));
            ok('B-17: …and starts one headless task in each worktree, titled ⑂ <name>, the prompt asking for a commit',
                launches.length === 2 && launches.every((l, i) => l.who === 'gitty' && l.title === '⑂ ' + live.result.launched[i].worktree
                    && l.workDir === live.result.launched[i].path && l.prompt.endsWith(P.PARALLEL_COMMIT_NOTE)));
            ok('B-17: …the answer names task id, worktree, branch and path per run',
                live.result.launched.every(l => l.taskId && l.worktree && l.branch.startsWith('af/') && l.path.startsWith(W.worktreeBase(repo))));
            // the two doors share the core
            const pblock = src.slice(src.indexOf("op: 'parallel.run'"), src.indexOf("op: 'parallel.run'") + 3000);
            ok('B-17: extension.ts registers parallel.run through the shared plan and launch closures, dryRun defaulting to true',
                /await parallelPlanFor\(agent, prompts\)/.test(pblock) && /await runParallelFor\(agent, prompts\)/.test(pblock)
                && /optBool\(args, 'dryRun', true\)/.test(pblock) && /args: agent \(name\|id\), prompts/.test(pblock));
            const pcmd = src.slice(src.indexOf("registerCommand('agentfarm.runParallel'"), src.indexOf("registerCommand('agentfarm.runParallel'") + 1800);
            ok('B-17: …and the command palette door uses the same closures — no second worktree loop, no direct addTask',
                /parallelPlanFor\(agent/.test(pcmd) && /runParallelFor\(agent, prompts\)/.test(pcmd)
                && !/createWorktree\(/.test(pcmd) && !/taskManager\.addTask\(/.test(pcmd));
            ok('B-17: …the closures hand the core the config and the task manager, nothing else',
                /planParallel\(\s*\{ maxConcurrent: \(\) => cfg\(\)\.get<number>\('maxConcurrentPerAgent', 1\) \}/.test(src)
                && /taskManager\.addTask\(who, title, prompt, 'headless', \{ workDir \}\)/.test(src));
            const man = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'parity.manifest.json'), 'utf8'));
            const cap = man.entries.find(e => e.capability === 'runParallel');
            ok('B-17: the parity manifest names the op and no longer a gap, and the budget came down',
                cap && Array.isArray(cap.ops) && cap.ops.includes('parallel.run') && !cap.gap && man.gapBudget <= 29);
            try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* tmp */ }
        }
        // ---------- B-19: four services, each with two doors ----------
        // schedules.forecast · web.enable · packs.gallery · search.index.build
        // — the command palette and the op reach each through ONE closure
        // (forecastNow · enableWebView/webViewUrl · galleryPacks ·
        // buildSemanticNow). The forecast and the gallery run the real core;
        // the web server and the embeddings provider are stood in.
        {
            const FC = require(path.join(__dirname, '..', 'out', 'core', 'forecast.js'));
            const PG = require(path.join(__dirname, '..', 'out', 'core', 'packgallery.js'));
            const AP = require(path.join(__dirname, '..', 'out', 'core', 'agentpack.js'));
            const need = (c, m) => { if (!c) { throw new Error(m); } };
            // --- schedules.forecast: the real forecast over a fixture schedule
            const FROM = new Date(2026, 6, 11, 8, 0, 0, 0).getTime();
            const schedules = [{ id: 'x', agentId: 'a1', agentName: 'yazar', title: 'Rapor', prompt: 'p', mode: 'headless', kind: 'daily', hour: 9, minute: 0, enabled: true }];
            const tasksHere = [{ title: 'Elde iş', agentName: 'yazar', status: 'queued', deferredReason: 'agent busy' }];
            let forecastDays = 7;
            const forecastNow = (days) => FC.buildForecast(schedules, tasksHere, [], FROM, days ?? forecastDays);
            reg.register({
                op: 'schedules.forecast',
                describe: 'B-19 — the forecast as data. args: days?, markdown?',
                handler: (args) => {
                    const days = Number(args.days || 0);
                    need(days >= 0 && days <= 365, 'days must be between 1 and 365.');
                    const forecast = forecastNow(days > 0 ? days : undefined);
                    return args.markdown === true ? { ...forecast, markdown: FC.renderForecastMarkdown(forecast) } : forecast;
                }
            });
            const f7 = await reg.dispatch('schedules.forecast', {});
            ok('B-19: schedules.forecast answers the page\'s own forecast — window, upcoming firings, the board',
                f7.ok && f7.result.days === 7 && f7.result.upcoming.length >= 7 && f7.result.upcoming.length <= 8
                && f7.result.upcoming.every(u => u.title === 'Rapor' && u.agentName === 'yazar' && u.kind === 'daily')
                && f7.result.queued.length === 1 && f7.result.queued[0].deferredReason === 'agent busy'
                && f7.result.totalScheduledRuns === f7.result.upcoming.length && !('markdown' in f7.result));
            const f2 = await reg.dispatch('schedules.forecast', { days: 2, markdown: true });
            ok('B-19: …days narrows the window and markdown:true adds the rendered page',
                f2.ok && f2.result.days === 2 && f2.result.upcoming.length <= 3
                && typeof f2.result.markdown === 'string' && /Rapor/.test(f2.result.markdown));
            const fbad = await reg.dispatch('schedules.forecast', { days: 400 });
            ok('B-19: …a window past a year is refused', fbad.ok === false);
            // --- web.enable: confirm-shaped, a port is opened
            let webState = { enabled: false, port: 8378, bind: 'local', token: '' };
            const writes = [];
            const webCfg = () => ({ ...webState });
            const enableWebView = async (bind) => {
                const token = webCfg().token || 'tok-' + Math.random().toString(36).slice(2, 8);
                writes.push(['web.token', token], ['web.bind', bind], ['web.enabled', true]);
                webState = { ...webState, token, bind, enabled: true };
                return webCfg();
            };
            let snapshots = 0;
            const webViewUrl = () => {
                snapshots++;
                const w = webCfg();
                const host = w.bind === 'lan' ? '192.168.1.20' : '127.0.0.1';
                return { ...w, host, url: `http://${host}:${w.port}/?t=${w.token}` };
            };
            reg.register({
                op: 'web.enable',
                describe: 'B-19 — turn on the read-only web view. args: bind?, confirm (true — required)',
                handler: async (args) => {
                    need(args.confirm === true, 'This opens a port on the machine — pass confirm:true if that is meant.');
                    const bind = String(args.bind || 'local');
                    need(bind === 'local' || bind === 'lan', 'bind must be local or lan.');
                    const before = webCfg();
                    const alreadyOn = before.enabled && !!before.token;
                    if (!alreadyOn) { await enableWebView(bind); }
                    const w = webViewUrl();
                    return { enabled: w.enabled, bind: w.bind, port: w.port, host: w.host, url: w.url, alreadyOn };
                }
            });
            const noConfirm = await reg.dispatch('web.enable', { bind: 'lan' });
            ok('B-19: web.enable without confirm:true is refused and writes nothing',
                noConfirm.ok === false && /confirm:true/.test(noConfirm.error) && writes.length === 0 && !webState.enabled);
            const badBind = await reg.dispatch('web.enable', { bind: 'world', confirm: true });
            ok('B-19: …a binding that is not local|lan is refused', badBind.ok === false && writes.length === 0);
            const on = await reg.dispatch('web.enable', { bind: 'lan', confirm: true });
            ok('B-19: …confirmed: mints the token, records the binding, switches on, answers the phone link',
                on.ok && on.result.enabled === true && on.result.bind === 'lan' && on.result.alreadyOn === false
                && on.result.host === '192.168.1.20' && on.result.url === `http://192.168.1.20:8378/?t=${webState.token}`
                && writes.map(w => w[0]).join(',') === 'web.token,web.bind,web.enabled' && snapshots === 1);
            const again = await reg.dispatch('web.enable', { bind: 'local', confirm: true });
            ok('B-19: …already on: nothing is rewritten, bind is ignored, the current link is answered with alreadyOn',
                again.ok && again.result.alreadyOn === true && again.result.bind === 'lan' && writes.length === 3
                && again.result.url === on.result.url && snapshots === 2);
            // --- U-85: the other four web doors, against the REAL core, so the
            // verdict the op answers is the verdict the card draws.
            //
            // ‼️ web.enable above CANNOT move the binding — it answers
            // `alreadyOn` and changes nothing — and the binding is the switch
            // that decides whether a phone can reach the farm at all. That gap
            // is what web.bind exists to close, and it is asserted here.
            const WC = require(path.join(__dirname, '..', 'out', 'core', 'webCockpit.js'));
            const QR = require(path.join(__dirname, '..', 'out', 'core', 'qr.js'));
            let serving = true;
            const lan = '192.168.1.20';
            const applyWebServer = () => { serving = webState.enabled && !!webState.token; };
            const disableWebView = async () => {
                writes.push(['web.enabled', false]);
                webState = { ...webState, enabled: false };
                applyWebServer();
                return webCfg();
            };
            const setWebBind = async (bind) => {
                writes.push(['web.bind', bind]);
                webState = { ...webState, bind };
                applyWebServer();
                return webCfg();
            };
            const newWebToken = async () => {
                writes.push(['web.token', 'tok-fresh']);
                webState = { ...webState, token: 'tok-fresh' };
                applyWebServer();
                return webCfg();
            };
            reg.register({
                op: 'web.status',
                describe: 'U-85 — can a phone read this farm right now, and if not why. args: qr?',
                handler: (args) => {
                    const w = webCfg();
                    const status = WC.webStatus({
                        enabled: w.enabled, port: w.port, bind: w.bind,
                        hasToken: !!w.token, serving, lanAddress: lan
                    });
                    const url = w.token ? WC.webUrl({ ...w, lanAddress: lan }) : '';
                    return {
                        enabled: w.enabled, serving, bind: w.bind, port: w.port,
                        hasToken: !!w.token, lanAddress: lan, host: status.host, url, status,
                        ...(args.qr === true && status.phoneReachable && url
                            ? { qr: QR.qrSvg(QR.qrEncode(url), { scale: 4 }) } : {})
                    };
                }
            });
            reg.register({
                op: 'web.stop',
                describe: 'U-85 — switch the web view off. args: none',
                handler: async () => {
                    const wasServing = serving;
                    const w = await disableWebView();
                    return { enabled: w.enabled, wasServing, port: w.port };
                }
            });
            reg.register({
                op: 'web.bind',
                describe: 'U-85 — move the binding while the view is on. args: bind, confirm (required for lan)',
                handler: async (args) => {
                    const bind = String(args.bind || '');
                    need(bind === 'local' || bind === 'lan', 'bind must be local or lan.');
                    need(bind === 'local' || args.confirm === true,
                        'bind:lan makes the dashboard readable by anyone on this network — pass confirm:true.');
                    await setWebBind(bind);
                    return (await reg.dispatch('web.status', {})).result;
                }
            });
            reg.register({
                op: 'web.token.new',
                describe: 'U-85 — mint a fresh token and put it in force. args: confirm (required)',
                handler: async (args) => {
                    need(args.confirm === true, 'A new token kills every existing link — pass confirm:true.');
                    await newWebToken();
                    return (await reg.dispatch('web.status', {})).result;
                }
            });

            // The state left by web.enable above: on, bound to lan, serving.
            const st1 = await reg.dispatch('web.status', {});
            ok('U-85: web.status answers the card\'s own verdict, reachable on a lan bind',
                st1.ok && st1.result.status.state === 'lan' && st1.result.status.phoneReachable === true
                && st1.result.host === lan && st1.result.url === `http://${lan}:8378/?t=${webState.token}`);
            ok('U-85: …and no code unless one is asked for', st1.result.qr === undefined);
            const st1q = await reg.dispatch('web.status', { qr: true });
            ok('U-85: …qr:true encodes the real link', /^<svg /.test(String(st1q.result.qr || '')));

            // ‼️ THE GREEN LIE, ON THE BRIDGE TOO.
            const toLocalNoConfirm = await reg.dispatch('web.bind', { bind: 'local' });
            ok('U-85: web.bind to local needs no confirmation — the port never leaves this machine',
                toLocalNoConfirm.ok && toLocalNoConfirm.result.bind === 'local');
            ok('U-85: ‼️ …and the answer says the phone can no longer reach it, though nothing "failed"',
                toLocalNoConfirm.result.enabled === true && toLocalNoConfirm.result.serving === true
                && toLocalNoConfirm.result.status.state === 'local'
                && toLocalNoConfirm.result.status.phoneReachable === false);
            const wroteBefore = writes.length;
            const toLanNoConfirm = await reg.dispatch('web.bind', { bind: 'lan' });
            ok('U-85: …bind:lan without confirm:true is refused and writes nothing',
                toLanNoConfirm.ok === false && /confirm:true/.test(toLanNoConfirm.error)
                && writes.length === wroteBefore);
            const badBind2 = await reg.dispatch('web.bind', { bind: 'world', confirm: true });
            ok('U-85: …and a binding that is neither is refused rather than defaulted',
                badBind2.ok === false && writes.length === wroteBefore);
            const toLan = await reg.dispatch('web.bind', { bind: 'lan', confirm: true });
            ok('U-85: …confirmed, the binding really moves and the link names the machine',
                toLan.ok && toLan.result.status.phoneReachable === true && toLan.result.host === lan);

            // ‼️ THE REVOKE.
            const urlBefore = toLan.result.url;
            const tokNoConfirm = await reg.dispatch('web.token.new', {});
            ok('U-85: web.token.new without confirm:true is refused — it kills every existing link',
                tokNoConfirm.ok === false && webState.token !== 'tok-fresh');
            const tok = await reg.dispatch('web.token.new', { confirm: true });
            ok('U-85: …confirmed, the link really changes, which is the whole point',
                tok.ok && tok.result.url !== urlBefore && /t=tok-fresh$/.test(tok.result.url));

            const webOff = await reg.dispatch("web.stop", {});
            ok('U-85: web.stop closes the port and says whether anything was really serving',
                webOff.ok && webOff.result.enabled === false && webOff.result.wasServing === true);
            const stOff = await reg.dispatch('web.status', {});
            ok('U-85: …and the view then reports off, with the token KEPT for web.enable',
                stOff.result.status.state === 'off' && stOff.result.serving === false
                && stOff.result.hasToken === true);

            // --- packs.gallery: the real collector over a local folder source
            const groot = fs.mkdtempSync(path.join(os.tmpdir(), 'af-b19-'));
            const gsrc = path.join(groot, 'gallery'); fs.mkdirSync(path.join(gsrc, 'nested'), { recursive: true });
            const pack = { format: AP.PACK_FORMAT, version: AP.PACK_VERSION, name: 'sesli', exportedAt: FROM, files: [{ path: 'CLAUDE.md', content: '# sesli' }], workflows: [{ title: 'w' }], triggers: [], schedules: [] };
            fs.writeFileSync(path.join(gsrc, 'sesli.agentpack'), JSON.stringify(pack));
            fs.writeFileSync(path.join(gsrc, 'nested', 'broken.agentpack'), '{not json');
            let sources = [];
            const galleryPacks = () => PG.collectGalleryPacks(sources, path.join(groot, 'cache')).then(r => ({ sources, ...r }));
            reg.register({
                op: 'packs.gallery',
                describe: 'B-19 — the packs on offer in the configured galleries. args: none',
                handler: async () => {
                    const r = await galleryPacks();
                    need(r.sources.length, 'No gallery sources are configured — set agentFarm.packGalleryRepos first.');
                    return r;
                }
            });
            const noSrc = await reg.dispatch('packs.gallery', {});
            ok('B-19: packs.gallery with no sources configured is refused by name', noSrc.ok === false && /packGalleryRepos/.test(noSrc.error));
            sources = [gsrc, path.join(groot, 'missing')];
            const gal = await reg.dispatch('packs.gallery', {});
            ok('B-19: …lists every pack under a source (nested too), names the file to import, and the source that failed',
                gal.ok && gal.result.sources.length === 2 && gal.result.packs.length === 1
                && gal.result.packs[0].packName === 'sesli' && gal.result.packs[0].file === path.join(gsrc, 'sesli.agentpack')
                && gal.result.packs[0].fileCount === 1 && gal.result.packs[0].workflowCount === 1 && gal.result.packs[0].source === gsrc
                && gal.result.errors.some(e => /missing/.test(e)));
            try { fs.rmSync(groot, { recursive: true, force: true }); } catch { /* tmp */ }
            // --- search.index.build: provider gate, busy is said, maxSessions passes through
            let provider = 'off';
            let semBusy = false;
            const calls = [];
            const stats = { sessions: 12, chunks: 340 };
            const updateSemanticIndex = async (maxSessions) => {
                if (provider === 'off') { return { indexed: 0, remaining: 0, error: 'embeddings provider is off' }; }
                if (semBusy) { return { indexed: 0, remaining: 0, busy: true }; }
                calls.push(maxSessions);
                return { indexed: maxSessions ? Math.min(maxSessions, 5) : 5, remaining: maxSessions ? 5 - Math.min(maxSessions, 5) : 0 };
            };
            const buildSemanticNow = async (maxSessions) => ({ provider, ...(await updateSemanticIndex(maxSessions)), ...stats });
            reg.register({
                op: 'search.index.build',
                describe: 'B-19 — build the transcript meaning index. args: maxSessions?',
                handler: async (args) => {
                    need(provider !== 'off', 'Set agentFarm.embeddingsProvider first.');
                    const max = Number(args.maxSessions || 0);
                    need(max >= 0, 'maxSessions must be 0 or more.');
                    return buildSemanticNow(max > 0 ? max : undefined);
                }
            });
            const off = await reg.dispatch('search.index.build', {});
            ok('B-19: search.index.build with the provider off is refused, not run', off.ok === false && /embeddingsProvider/.test(off.error) && calls.length === 0);
            provider = 'gemini';
            const all = await reg.dispatch('search.index.build', {});
            ok('B-19: …builds everything pending and answers provider, counts and the index size',
                all.ok && all.result.provider === 'gemini' && all.result.indexed === 5 && all.result.remaining === 0
                && all.result.sessions === 12 && all.result.chunks === 340 && calls[0] === undefined);
            const two = await reg.dispatch('search.index.build', { maxSessions: 2 });
            ok('B-19: …maxSessions caps one call and says what is left', two.ok && two.result.indexed === 2 && two.result.remaining === 3 && calls[1] === 2);
            semBusy = true;
            const busy = await reg.dispatch('search.index.build', {});
            ok('B-19: …a build already running answers busy:true instead of a silent zero', busy.ok && busy.result.busy === true && busy.result.indexed === 0);
            // --- the two doors share the closures, in the source
            const opBlock = (name) => src.slice(src.indexOf(`op: '${name}'`), src.indexOf(`op: '${name}'`) + 2600);
            const cmdBlock = (name, n) => src.slice(src.indexOf(`registerCommand('${name}'`), src.indexOf(`registerCommand('${name}'`) + n);
            ok('B-19: extension.ts registers schedules.forecast through forecastNow, and the command renders the same call',
                /forecastNow\(days > 0 \? days : undefined\)/.test(opBlock('schedules.forecast')) && /renderForecastMarkdown\(forecast\)/.test(opBlock('schedules.forecast'))
                && /renderForecastMarkdown\(forecastNow\(\)\)/.test(cmdBlock('agentfarm.openForecast', 400)) && !/buildForecast\(/.test(cmdBlock('agentfarm.openForecast', 400)));
            ok('B-19: …web.enable requires confirm:true and goes through enableWebView + webViewUrl, as the command does — no second settings write',
                /args\.confirm === true/.test(opBlock('web.enable')) && /await enableWebView\(bind/.test(opBlock('web.enable')) && /webViewUrl\(\)/.test(opBlock('web.enable'))
                && /await enableWebView\(bindPick\.bind\)/.test(cmdBlock('agentfarm.openWebView', 1800)) && /webViewUrl\(\)/.test(cmdBlock('agentfarm.openWebView', 1800))
                && !/cfg\(\)\.update\('web\./.test(cmdBlock('agentfarm.openWebView', 1800)));
            ok('B-19: …packs.gallery and the command both read the galleries through galleryPacks, and the manifest pairs it with agents.pack.import',
                /await galleryPacks\(\)/.test(opBlock('packs.gallery')) && /galleryPacks\(\)/.test(cmdBlock('agentfarm.browsePackGallery', 900))
                && !/collectGalleryPacks\(/.test(cmdBlock('agentfarm.browsePackGallery', 900)));
            ok('B-19: …search.index.build and the command both build through buildSemanticNow, behind the same provider gate',
                /buildSemanticNow\(max > 0 \? max : undefined\)/.test(opBlock('search.index.build')) && /embeddingsCfg\(\)\.provider !== 'off'/.test(opBlock('search.index.build'))
                && /await buildSemanticNow\(undefined, m => progress\.report/.test(cmdBlock('agentfarm.buildSemanticIndex', 1400))
                && !/updateSemanticIndex\(/.test(cmdBlock('agentfarm.buildSemanticIndex', 1400)));
            ok('B-19: …a build already running is SAID by updateSemanticIndex (busy:true), not folded into "up to date"',
                /if \(semBusy\) \{ return \{ indexed: 0, remaining: 0, busy: true \}; \}/.test(src));
            const man19 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'parity.manifest.json'), 'utf8'));
            const caps = ['openForecast:schedules.forecast', 'openWebView:web.enable', 'browsePackGallery:packs.gallery', 'buildSemanticIndex:search.index.build']
                .map(s => s.split(':')).map(([c, o]) => man19.entries.find(e => e.capability === c)).map((e, i) => e && Array.isArray(e.ops) && !e.gap
                    && e.ops.includes(['schedules.forecast', 'web.enable', 'packs.gallery', 'search.index.build'][i]));
            ok('B-19: the parity manifest names all four ops and no longer four gaps, and the budget came down to 25',
                caps.every(Boolean) && man19.entries.find(e => e.capability === 'browsePackGallery').ops.includes('agents.pack.import') && man19.gapBudget <= 25);
        }
        // ‼️ `force` from an AGENT is not a person clicking ⟳: it may skip the
        // cache, never a backoff, or a looping agent becomes a request storm
        ok('…and an agent\'s force takes the edge path, not the human one',
            /await planUsage\.readOnEdge\(\)/.test(block)
            && !/planUsage\.get\(true\)/.test(block));
    }

    // ---------- usage.window — the 5h window in BOTH units ----------
    // ‼️ The op exists because one unit was never enough. `tokens` is what the
    // transcripts add up to; `wTokens` is what the plan limit charges for it,
    // and the two are not proportional (measured 0.80x-3.86x over 32 days). An
    // agent asked "have I got room for this?" off the raw figure alone was
    // reading a number that moves with context size, not with the wall.
    {
        const reg = new BridgeRegistry();
        const win = { tokens: 121_400_000, wTokens: 72_100_000, cost: 180.5, msgs: 412, windowStart: Date.parse('2026-08-03T01:54:35Z') };
        reg.register({
            op: 'usage.window',
            describe: 'The rolling 5-hour window in both units: tokens (raw) and wTokens (weighted). args: none',
            handler: () => ({
                windowStart: new Date(win.windowStart).toISOString(),
                tokens: win.tokens, wTokens: win.wTokens,
                cost: win.cost, msgs: win.msgs,
                ratio: win.wTokens > 0 ? Math.round(100 * win.tokens / win.wTokens) / 100 : null,
                limit: null, weightedLimit: null, pct: null, lap: null
            })
        });
        ok('usage.window appears in the catalog', reg.catalog().some(c => c.op === 'usage.window'));
        const r = await reg.dispatch('usage.window', {});
        ok('dispatch returns BOTH figures, never one',
            r.ok && r.result.tokens === 121_400_000 && r.result.wTokens === 72_100_000);
        ok('…and the ratio between them, so the gap is readable without arithmetic',
            r.result.ratio === 1.68);
        ok('…with no ceiling configured it says so rather than inventing a percent',
            r.result.pct === null && r.result.limit === null && r.result.weightedLimit === null);

        // the real registration must carry the same contract (this mirror can drift)
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        const block = src.slice(src.indexOf("op: 'usage.window'"), src.indexOf("op: 'usage.window'") + 2600);
        ok('extension.ts registers usage.window off the index\'s own window',
            /index\.windowUsage\(\)/.test(block) && /wTokens: win\.wTokens/.test(block));
        ok('…and reads the percent through the shared brake, not its own arithmetic',
            /windowPct\(\)/.test(block));
        ok('…and its describe warns the two units are not interchangeable',
            /NOT INTERCHANGEABLE/.test(block));
    }

    // ---------- session ops (§19.C): start · pin · tag · shelf · interrupt ----------
    // Interaction and control reach the bridge with the feature, not after it:
    // an agent asked "start me a planning session on the dev agent" or "what am
    // I keeping on my shelf?" answers through the same code the UI clicks.
    {
        const reg = new BridgeRegistry();
        const { buildLaunchCommand, launchToRemember, withDefaults, validateLaunch } =
            require(path.join(__dirname, '..', 'out', 'core', 'launch.js'));
        const { togglePin, setTags, parseTags, isPinned, tagsOf, normalizeMarks } =
            require(path.join(__dirname, '..', 'out', 'core', 'sessionmarks.js'));
        const { resolveInterrupt } = require(path.join(__dirname, '..', 'out', 'core', 'interrupt.js'));

        // stand-ins for the extension's live state
        const remembered = {};
        let marks = {};
        const titles = {};
        const launched = [];
        const opened = [];
        const agents = [{ name: 'dev' }];
        const defaults = { model: 'sonnet' };
        const sessions = [
            { sessionId: 'sid1', title: 'zen release', agentName: 'dev', cwd: 'D:/a/dev', lastTs: 5, cost: 1.234 },
            { sessionId: 'sid2', title: 'other', agentName: 'dev', cwd: 'D:/a/dev', lastTs: 9, cost: 0 }
        ];
        const terminals = ['claude: dev #1'];

        reg.register([
            {
                op: 'sessions.start',
                describe: 'Start an INTERACTIVE claude session. args: agent, model?, effort?, permissionMode?, name?, prompt?, resume?, continue?',
                handler: (args) => {
                    const o = {
                        model: optStr(args, 'model'), effort: optStr(args, 'effort'),
                        permissionMode: optStr(args, 'permissionMode'), name: optStr(args, 'name'),
                        prompt: optStr(args, 'prompt'), resume: optStr(args, 'resume'),
                        continueLast: args.continue === true
                    };
                    const errors = validateLaunch(withDefaults(o, defaults));
                    need(!errors.length, errors.join(' · '));
                    const command = buildLaunchCommand('claude', withDefaults(o, defaults));
                    launched.push(command);
                    // ‼️ S-34 — a launch that happens is a launch that is
                    // RECORDED, on the bridge exactly as in the UI: the record
                    // means "what this agent was last run with", and a headless
                    // start that skipped the write would leave the ▶ offering a
                    // setup that has since been overtaken. What is kept is
                    // `launchToRemember`'s call, so it cannot differ per door.
                    remembered[argStr(args, 'agent')] = launchToRemember(o, 'terminal');
                    return { agent: argStr(args, 'agent'), command };
                }
            },
            {
                op: 'sessions.lastLaunch',
                describe: 'What an agent was last started with. args: agent?',
                handler: (args) => {
                    const who = optStr(args, 'agent');
                    return who
                        ? { agent: who, last: remembered[who] ?? null }
                        : { agents: Object.keys(remembered).map(a => ({ agent: a, last: remembered[a] })) };
                }
            },
            {
                op: 'sessions.pin',
                describe: 'Put a session on the shelf. args: sessionId, pinned?',
                handler: (args) => {
                    const id = argStr(args, 'sessionId');
                    marks = togglePin(normalizeMarks(marks), id,
                        typeof args.pinned === 'boolean' ? args.pinned : undefined);
                    return { sessionId: id, pinned: isPinned(marks, id) };
                }
            },
            {
                op: 'sessions.rename',
                describe: 'Give a session the user\'s own name. args: sessionId, name',
                handler: (args) => {
                    const id = argStr(args, 'sessionId');
                    const name = optStr(args, 'name').trim();
                    if (name) { titles[id] = name; } else { delete titles[id]; }
                    return { sessionId: id, title: titles[id] || null };
                }
            },
            {
                op: 'sessions.tag',
                describe: 'Set the labels on a session. args: sessionId, tags',
                handler: (args) => {
                    const id = argStr(args, 'sessionId');
                    const raw = Array.isArray(args.tags) ? args.tags.join(', ') : optStr(args, 'tags');
                    marks = setTags(normalizeMarks(marks), id, parseTags(raw));
                    return { sessionId: id, tags: tagsOf(marks, id) };
                }
            },
            {
                op: 'sessions.shelf',
                describe: 'The pinned sessions with their labels. args: none',
                handler: () => sessions.filter(s => isPinned(marks, s.sessionId))
                    .map(s => ({ sessionId: s.sessionId, title: s.title, tags: tagsOf(marks, s.sessionId) }))
            },
            {
                // S-7: the sessions table's own page. Navigational, but it is on
                // the bridge because it takes a SCOPE — "show me what ran on this
                // project" is a request, not a theme, and an agent asked it must
                // not have to answer "open the page and then filter it".
                op: 'sessions.page',
                describe: 'Open the SESSIONS page, optionally already scoped. args: project?, agent?',
                handler: (args) => {
                    const project = optStr(args, 'project');
                    const agentName = optStr(args, 'agent');
                    if (agentName) {
                        need(agents.some(a => a.name === agentName), `no agent called "${agentName}"`);
                    }
                    opened.push({ project: project || null, agent: agentName || null });
                    return { opened: 'sessions', project: project || null, agent: agentName || null };
                }
            },
            {
                op: 'sessions.interrupt',
                describe: 'Type Esc into a live session\'s terminal. args: sessionId',
                handler: (args) => {
                    const sessionId = argStr(args, 'sessionId');
                    // like the real handler: the agent is looked up, not assumed
                    const agentName = sessions.find(s => s.sessionId === sessionId)?.agentName;
                    const target = resolveInterrupt({
                        sessionId, agentName,
                        bindings: [{ title: 'claude: dev #1', sessionId: 'sid1', hasTerminal: true, terminalIndex: 0 }],
                        terminalNames: terminals
                    });
                    return target.kind === 'integrated'
                        ? { sessionId, interrupted: true, terminal: terminals[target.terminalIndex] }
                        : { sessionId, interrupted: false, reason: target.how };
                }
            }
        ]);

        const cat = reg.catalog().map(c => c.op);
        ok('every session op is in the catalog',
            ['sessions.start', 'sessions.lastLaunch', 'sessions.pin', 'sessions.rename',
                'sessions.tag', 'sessions.shelf', 'sessions.page',
                'sessions.interrupt'].every(op => cat.includes(op)));

        // S-7: the page, and the scope that is the reason it is on the bridge.
        const page = await reg.dispatch('sessions.page', {});
        ok('sessions.page opens the fleet-wide list when nothing is asked for',
            page.ok && page.result.project === null && page.result.agent === null);
        const scoped = await reg.dispatch('sessions.page', { project: 'AgentFarm' });
        ok('…and opens already scoped when a project is named',
            scoped.ok && scoped.result.project === 'AgentFarm'
            && opened[opened.length - 1].project === 'AgentFarm');
        const noSuch = await reg.dispatch('sessions.page', { agent: 'nobody' });
        ok('an agent that does not exist is refused rather than opening an empty page',
            !noSuch.ok && /no agent called "nobody"/.test(noSuch.error));

        const start = await reg.dispatch('sessions.start',
            { agent: 'dev', effort: 'high', name: 'plan', prompt: 'read the report first' });
        ok('sessions.start builds the launch through the shared builder',
            start.ok && start.result.command
            === 'claude --model sonnet --effort high -n "plan" "read the report first"');
        const bad = await reg.dispatch('sessions.start', { agent: 'dev', effort: 'turbo' });
        ok('an invalid effort is refused with a readable error',
            !bad.ok && /effort "turbo"/.test(bad.error) && launched.length === 1);

        // ‼️ S-34 — THE RECORD IS READABLE, AND IT IS WHAT ACTUALLY RAN.
        // Every UI door now opens on this; an agent asked "how does this one
        // normally run" gets the same answer the ▶ is about to offer.
        const mem = await reg.dispatch('sessions.lastLaunch', { agent: 'dev' });
        ok('sessions.lastLaunch reports what the launch above actually used',
            mem.ok && mem.result.last.effort === 'high' && mem.result.last.surface === 'terminal');
        // …and NOT the per-launch half of it: re-applying a name would give the
        // next session the same one, and re-applying a prompt would send the
        // same opening message on the user's behalf.
        ok('…without the name or the first prompt, which are per-launch by nature',
            mem.result.last.name === undefined && mem.result.last.prompt === undefined);
        const noMem = await reg.dispatch('sessions.lastLaunch', { agent: 'ops' });
        ok('an agent that has never been started answers null rather than a guess',
            noMem.ok && noMem.result.last === null);
        const allMem = await reg.dispatch('sessions.lastLaunch', {});
        ok('…and asking for none of them lists only the agents that have a record',
            allMem.ok && allMem.result.agents.length === 1 && allMem.result.agents[0].agent === 'dev');

        const pin = await reg.dispatch('sessions.pin', { sessionId: 'sid1' });
        ok('sessions.pin toggles on and reports the new state', pin.ok && pin.result.pinned === true);
        await reg.dispatch('sessions.tag', { sessionId: 'sid1', tags: ['zen', 'zen', 'release'] });
        const shelf = await reg.dispatch('sessions.shelf', {});
        ok('sessions.shelf lists the pinned session with de-duped labels',
            shelf.ok && shelf.result.length === 1 && shelf.result[0].sessionId === 'sid1'
            && shelf.result[0].tags.join('|') === 'zen|release');
        const tagStr = await reg.dispatch('sessions.tag', { sessionId: 'sid1', tags: 'a, b' });
        ok('tags accept a comma-separated string too', tagStr.ok && tagStr.result.tags.join('|') === 'a|b');
        const off = await reg.dispatch('sessions.pin', { sessionId: 'sid1', pinned: false });
        ok('an explicit pinned:false takes it off the shelf', off.ok && off.result.pinned === false);
        ok('…and the shelf is empty again', (await reg.dispatch('sessions.shelf', {})).result.length === 0);

        const named = await reg.dispatch('sessions.rename', { sessionId: 'sid1', name: '  Kalan eksikler  ' });
        ok('sessions.rename stores the trimmed name and reports it back',
            named.ok && named.result.title === 'Kalan eksikler');
        const unnamed = await reg.dispatch('sessions.rename', { sessionId: 'sid1', name: '' });
        ok('…and an empty name restores the automatic title',
            unnamed.ok && unnamed.result.title === null);

        const int = await reg.dispatch('sessions.interrupt', { sessionId: 'sid1' });
        ok('sessions.interrupt reports the terminal it typed Esc into',
            int.ok && int.result.interrupted === true && int.result.terminal === 'claude: dev #1');
        const noInt = await reg.dispatch('sessions.interrupt', { sessionId: 'nope' });
        ok('a session with no terminal is reported honestly, not silently "done"',
            noInt.ok && noInt.result.interrupted === false && noInt.result.reason);

        // the real registrations must exist and carry the same contracts
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        for (const op of ['sessions.start', 'sessions.pin', 'sessions.rename', 'sessions.tag',
            'sessions.shelf', 'sessions.interrupt']) {
            ok(`extension.ts registers ${op}`, src.includes(`op: '${op}'`));
        }
        // To the NEXT op, not a fixed window: the description grew again when
        // the engine axis arrived, and a window that stops inside the prose
        // tests the prose rather than the handler.
        const startBlock = src.slice(src.indexOf("op: 'sessions.start'"),
            src.indexOf("op: 'sessions.lastLaunch'"));
        ok('sessions.start calls the shared launcher, not its own command builder',
            /startClaudeSession\(agent, o[,)]/.test(startBlock) && /validateLaunch/.test(startBlock));
        ok('sessions.start says it is interactive and points at tasks.add for headless work',
            /INTERACTIVE/.test(startBlock) && /tasks\.add/.test(startBlock));
        // an agent can reach BOTH places a session can live — and the same
        // shared starters the UI uses, not a second implementation
        ok('sessions.start can also start it in the Console',
            /startConsoleSession\(agent, o[,)]/.test(startBlock) && /surface/.test(startBlock));
        // ‼️ The project is a dimension of a launch on EVERY surface. The UI
        // grew the row (see test_run_surface.js); an agent gets the same choice
        // as an argument, or the two offers drift apart again.
        ok('sessions.start takes the project the session is filed under',
            /project\? \(id or name/.test(startBlock)
            && /resolveLaunchProject\(args\.project\)/.test(startBlock));
        // ‼️ THE WINDOW IS WIDENED WHEN THE OP GROWS, NEVER THE GUARANTEE.
        // 3000 → 5000 → 9000 → 13000: this op's own DESCRIPTION grows every time
        // a dimension is added to it (the engine axis, then the route), and a
        // window that no longer reaches the handler stops measuring the handler
        // while every assertion above it still passes. Two checks below fell off
        // the end when X-105 added the route paragraph — the failure looked like
        // a missing return field and was a short slice.
        // 15000: the S-59 held-id gate sits between the engine refusal and the reply
        const consoleStart = src.slice(src.indexOf("op: 'console.start'"), src.indexOf("op: 'console.continueFromHandover'"));
        ok('console.start takes it too, in the same words',
            /project\? \(id or name/.test(consoleStart)
            && /resolveLaunchProject\(args\.project\)/.test(consoleStart));
        // ‼️ THE ENGINE IS A DIMENSION OF A CONSOLE SESSION, AND IT CHANGES WHAT
        // TALKING TO ONE MEANS — a message said mid-turn steers a Claude turn
        // and is HELD by a Codex one, whose process is the turn. An agent that
        // learns that by watching its message disappear has been told a lie by
        // omission, so the contract says it on the way in.
        ok('console.start takes an engine', /engine\?/.test(consoleStart));
        // ‼️ X-105 — AND THE ROUTE, in the same commit as the composer's box.
        //
        // `_REF/agentfarm-dev.md` names this exact failure: a session dimension
        // added to one surface and forgotten on the others is a structural
        // failure, and the bridge is the surface an agent has. A person could
        // point a card at Kimi in one click while an agent could only start one
        // on whatever this window happened to be carrying.
        ok('console.start takes the route the session is served by',
            /providerId\?/.test(consoleStart) && /tier\?/.test(consoleStart));
        // ‼️ REFUSED, NOT DROPPED, and narrowed by the ENGINE'S OWN adapter
        // rather than by a list written here — the same `prunedPick` the
        // launcher and the composer use. A caller who asked for an endpoint and
        // silently got this window's own cannot tell, which is the whole thing
        // X-101 exists to make impossible.
        ok('…and a route this engine cannot be pointed at is refused, not quietly ignored',
            /prunedPick\(engine, \{ providerId: wantRoute/.test(consoleStart)
            && /need\(!wantRoute \|\| !!route\.providerId,/.test(consoleStart));
        // …and the answer says what it really got, through the SAME resolver the
        // card and console.sessions use — one statement, three readers.
        ok('…and what it was actually pointed at comes back on the reply',
            /route: consoleRouteOf\(engine, routeUsed\.providerId, routeUsed\.tier\) \?\? null/.test(consoleStart));
        // ‼️ X-109 — AND WHICH ROUTE A RESUME REALLY RUNS ON IS THE GATE'S, said
        // on the reply: `routeUsed` is the gate's pin or switch, else the
        // argument, and `resumeRoute` carries the verdict so a caller can see a
        // pin without a second call.
        ok('…and a resume\'s route is the gate\'s answer, reported on the reply',
            /const routeUsed[^=]*=\s*gatedRoute\(gate\)/.test(consoleStart)
            && /resumeRoute: gate \? \{ act: gate\.act, binding: gate\.binding, why: gate\.why \} : null/.test(consoleStart));
        // ‼️ B-12 — AND IT SAYS IT PER ENGINE, DERIVED. The sentence used to be
        // one per SHAPE, written when there were two: "Claude is one long-lived
        // process; every other engine here is ONE PROCESS PER TURN." A
        // shared-ACP engine is neither — its message is held like a per-turn
        // engine's and its controls reach a LIVE connection like a persistent
        // one's — so a caller driving it off that sentence believed it was
        // talking to a process that dies every turn. `engineNote` and
        // `engineModeNote` are the same words the Console panel prints beside
        // the picker, so the contract and the surface cannot disagree.
        ok('…and says what changes about talking to it, in each engine\'s own words',
            /engineNote\(e\.id\)/.test(consoleStart) && /engineModeNote\(e\.id, ''\)/.test(consoleStart));
        // ‼️ …and the price sentence is derived too. "Only Claude Code states a
        // per-turn price" was true until a second engine published one, and a
        // caller reading it would have treated a real figure as a derived guess.
        ok('…and which engines state a price is read off the registry, not asserted',
            /filter\(e => e\.reportsCost\)/.test(consoleStart)
            && !/Only Claude Code states a per-turn price/.test(consoleStart));
        ok('‼️ …and REFUSES one this machine cannot run, with the one thing to do '
            + 'about it — a session started on a missing CLI dies on its first turn '
            + 'with a shell error, which is a worse answer than "it is not installed"',
            /engineMatrix\(\)\.find/.test(consoleStart) && /is not ready on this machine/.test(consoleStart));
        ok('…and it answers with the shape of the session it just opened, so the '
            + 'caller does not have to discover it on the second message',
            /turnShape/.test(consoleStart) && /steerable/.test(consoleStart) && /reportsCost/.test(consoleStart));
        // ‼️ …and it files ONE session rather than moving the window's active
        // project: a background agent must not change what the person sitting
        // in front of the window is working on.
        ok('…and neither writes the window\'s active project',
            !/af\.activeProject/.test(startBlock) && !/af\.activeProject/.test(consoleStart));
        ok('the three answers stay distinct: absent inherits, "" is none, a name is that one',
            /const resolveLaunchProject = \(raw: unknown\): string \| undefined =>/.test(src)
            && /if \(raw === undefined\) \{ return undefined; \}/.test(src)
            && /if \(!key\) \{ return ''; \}/.test(src));
        // ---------- X-18/X-19: the engine reaches UNATTENDED work too ----------
        //
        // ‼️ THIS IS WHERE IT MATTERS MOST, AND WHERE IT WAS MISSING LONGEST.
        // Nobody sits in front of a task or a mission: an engine that cannot run
        // writes a shell error into an archived file that is read hours later,
        // and a plan-billed delegate reports no dollars at all — so a mission's
        // USD ceiling, the only limit with teeth, could never be reached by it.
        {
            const addBlock = src.slice(src.indexOf("op: 'tasks.add'"), src.indexOf("op: 'tasks.cancel'"));
            // ‼️ THE LIST IS DERIVED, SO THE TEST CHECKS THE DERIVATION (X-35).
            // This used to assert the literal words "claude — the default — or
            // codex", which is exactly how the contract came to say Codex and
            // Antigravity while Gemini had been a first-class engine for weeks:
            // a hand-typed list and a hand-typed test agree with each other and
            // with nothing else. Now the describe is built from `ENGINES`, and
            // what is asserted is that it is built from `ENGINES`.
            ok('tasks.add takes an engine, named from the registry rather than typed out',
                /engine\? \('/.test(addBlock)
                && /Object\.values\(ENGINES\)\.map\(e => `\$\{e\.id\} = \$\{e\.label\}`\)/.test(addBlock));
            ok('…and refuses one this machine cannot run BEFORE anything spawns',
                /engineRefusal\(engineMatrix\(\), engine\)/.test(addBlock));
            ok('‼️ …and refuses `engine` together with `cli`, rather than silently '
                + 'ranking two executors and making one argument a no-op',
                /needOneExecutor\(engine, cli\)/.test(addBlock));
            // ‼️ AND IT NAMES ALL THREE MECHANISMS, NOT ONE OF THEM THREE TIMES.
            // The old contract said "a SANDBOX" for every per-turn engine, which
            // told a caller that Antigravity and Gemini have a Codex sandbox.
            // They do not: Gemini has an approval mode and Antigravity's real
            // restraint is its own app's setting.
            // ‼️ B-12 — NAMED BY THE ENGINE, NOT LISTED IN THE SENTENCE. This
            // used to assert the literal words "Codex SANDBOX", "Gemini APPROVAL
            // MODE" and so on: a list that was complete when it was typed and
            // silently short of the fifth engine ever after. The contract now
            // asks each engine what its own mode means (`engineModeNote`), which
            // is the same answer the Tasks form and the task archive print — so
            // an engine added tomorrow describes itself here without anybody
            // remembering to come back.
            ok('…it names what changes per engine by ASKING the engine, not by listing them',
                /engineModeNote\(e\.id, ''\)/.test(addBlock)
                && /filter\(e => e\.id !== 'claude'\)/.test(addBlock)
                && /has such a channel|has no such channel|none of these engines has such a channel/.test(addBlock)
                && /and no dollar figure/.test(addBlock.replace(/\s+/g, ' ')));
            // ‼️ …and the OPPOSITE problem gets its own paragraph: an engine that
            // CAN stop and ask has nobody to ask, unattended, so its request comes
            // back refused rather than waiting. That is the one fact an agent
            // queueing OpenCode work has to know before it queues it.
            ok('‼️ …and says what an engine that CAN ask does when nobody is there',
                /comes back\\n?\s*\+? ?.?REFUSED|REFUSED/.test(addBlock)
                && /--auto/.test(addBlock)
                && /opencode run --format json/.test(addBlock));
            ok('‼️ …and that an engine with no effort refuses one, rather than accepting and dropping it',
                /enginesWithoutEffort\(\)/.test(addBlock)
                && /refused rather than/.test(addBlock.replace(/'\s*\+\s*'/g, '')));
            ok('…and answers with the engine and whether it reports a price at all',
                /engine: task\.engine \?\? 'claude'/.test(addBlock)
                && /reportsCost: engineOf\(task\.engine\)\.reportsCost/.test(addBlock));

            const listBlock = src.slice(src.indexOf("op: 'tasks.list'"), src.indexOf("op: 'tasks.add'"));
            ok('‼️ tasks.list says a costUSD of 0 may mean "no price", not "cheap"',
                /is not a cheap\s*'?\s*\+?\s*'?run/.test(listBlock.replace(/\s+/g, ' '))
                && /reportsCost/.test(listBlock));

            // ‼️ X-60 — THE ORDER IS THE ITEM. createMission normalised the
            // request into a valid spec and then validated its own output, so a
            // misspelled mode, an unknown autonomy, a duplicate criterion id,
            // an unresolvable pool and an unknown engine were all gone before
            // anything looked for them. The raw check must run FIRST or there
            // is nothing left to catch.
            {
                // The window only has to reach past the pool/lead block that the
                // order is being asserted about; it grows as that block does.
                // ‼️ U-103 — the block being asserted about is the SHARED
                // resolution, not the four-line `createMission` wrapper that now
                // calls it. Pointing at the wrapper would pass this test by
                // finding nothing to complain about.
                // ‼️ BOUNDED BY THE NEXT FUNCTION, not by a character count. A
                // fixed window silently stops covering the tail of the function
                // the day it grows — measured on X-107, which pushed
                // `normalizeObjective` past 18,000 characters and turned this
                // into a test that found nothing and said nothing.
                const create = src.slice(src.indexOf('const resolveMissionInput = '),
                    src.indexOf('const createMission = '));
                const rawAt = create.indexOf('validateMissionInput(');
                const normAt = create.indexOf('normalizeObjective(');
                const goalAt = create.indexOf("String(input.goal");
                ok('‼️ createMission judges the RAW request', rawAt > 0);
                ok('…before it normalises anything', rawAt < normAt);
                ok('…before it reads a single field out of it', rawAt < goalAt);
                ok('…against this window\'s real fleet and engines',
                    /agentIds: agents\.map\(a => a\.id\)/.test(create)
                    && /engines: Object\.keys\(ENGINES\)/.test(create));

                // ‼️ U-102 — AND AN EMPTY POOL IS TWO DIFFERENT ANSWERS. `fleet`
                // takes the whole fleet whatever the rows carry; `selected` with
                // nobody ticked is refused rather than silently expanded to
                // every agent on the machine; the field omitted is the old
                // contract, which every caller written before this relies on.
                ok('‼️ createMission refuses "selected" with nobody in it',
                    /poolScope === 'selected' && !poolIn\.length/.test(create)
                    && /nobody ticked is nobody, not the whole fleet/.test(create));
                ok('…takes the whole fleet when the scope says fleet, rows or no rows',
                    /poolScope === 'fleet' \? agents : \(poolIn\.length \? poolIn : agents\)/.test(create));

                // and the same faults, through a handler shaped like the real one
                const MM = require(path.join(__dirname, "..", "out", "core", "missions.js"));
                const startReg = new BridgeRegistry();
                startReg.register([{
                    op: 'missions.start',
                    describe: 'Start a mission. args: goal, mode?, pool?, team?, successCriteria?, autonomy?',
                    handler: (args) => {
                        const bad = MM.validateMissionInput(args, {
                            agentIds: ['a1', 'a2'], engines: ['claude', 'codex']
                        });
                        need(!bad.length, 'This mission cannot start — ' + bad.join('; ') + '.');
                        return { id: 'm1', mode: String(args.mode ?? '') === 'adaptive' ? 'adaptive' : 'classic' };
                    }
                }]);
                const typo = await startReg.dispatch('missions.start', { goal: 'g', mode: 'adptive' });
                ok('‼️ the bridge refuses a misspelled mode instead of starting a CLASSIC run',
                    !typo.ok && /unknown mode "adptive"/.test(typo.error));
                const ghost = await startReg.dispatch('missions.start', { goal: 'g', mode: 'adaptive', pool: [{ agentId: 'ghost' }] });
                ok('…a pool that resolves to nobody, instead of expanding to the whole fleet',
                    !ghost.ok && /no agent in this fleet is "ghost"/.test(ghost.error));
                const dupe = await startReg.dispatch('missions.start', { goal: 'g', mode: 'adaptive', successCriteria: [{ id: 'c1', text: 'a' }, { id: 'c1', text: 'b' }] });
                ok('…two criteria under one id, instead of renumbering one of them',
                    !dupe.ok && /given the id "c1"/.test(dupe.error));
                const eng = await startReg.dispatch('missions.start', { goal: 'g', mode: 'adaptive', pool: [{ agentId: 'a1', engine: 'nope' }] });
                ok('…an unknown engine, instead of dropping it to the default',
                    !eng.ok && /unknown engine "nope"/.test(eng.error));
                const shape = await startReg.dispatch('missions.start', { goal: 'g', mode: 'adaptive', pool: 'a1' });
                ok('…and a list sent as a string, instead of reading it as empty',
                    !shape.ok && /"pool" must be a list/.test(shape.error));
                const fine = await startReg.dispatch('missions.start', { goal: 'g' });
                ok('‼️ while a classic start that names no mode at all still works',
                    fine.ok && fine.result.mode === 'classic');
            }

            const misBlock = src.slice(src.indexOf("op: 'missions.start'"), src.indexOf("op: 'missions.preview'"));
            ok('missions.start takes an engine for its DELEGATIONS', /engine\? \(which engine the DELEGATIONS/.test(misBlock));
            ok('…per team member as well', /\{agent, role\?, model\?, engine\?, /.test(misBlock));
            // ‼️ M-14 — the member's PERMISSION mode is on that same line, and the
            // describe has to say why it matters unattended: a delegation is a
            // headless run, so a mode the engine would stop and ask about has
            // nobody to ask — and a refused call still exits 0 (measured), which
            // is the part a caller cannot discover for itself.
            ok('‼️ …and the permission mode a delegation spends UP FRONT',
                /permissionMode\?, account\?\}\]/.test(misBlock)
                && /nobody in it to ask/.test(misBlock.replace(/'\s*\+\s*'/g, ''))
                && /exits 0/.test(misBlock.replace(/'\s*\+\s*'/g, '')));
            ok('…and both list ops read it back, so a caller can tell a default from a value that never arrived',
                (src.match(/permissionMode: m\.permissionMode \?\? null/g) || []).length >= 2);
            // ‼️ X-107 — MEASURED AT THE ENQUEUE NOW. The dimensions used to be
            // written onto the row `addTask` had already returned; they are what
            // the row is MADE with, and since X-106 a dimension arriving one line
            // later is also one the enqueue's route seal never saw. `runExtras`
            // is the shape, so this no longer names a field at all.
            ok('…and the delegation actually carries it onto the task, by the shape',
                /taskManager\.addTask\([\s\S]{0,200}\.\.\.runExtras\(\{[\s\S]{0,160}dims/.test(src)
                && !/task\.permissionMode = dims\.permissionMode/.test(src));
            // ‼️ M-18 — the op now takes the FOURTH dimension and says what
            // happens to a field the caller leaves out, which before this was
            // "nothing, silently".
            ok('‼️ …and the effort, with the ladder that resolves what is left blank',
                /effort\?, permissionMode\?, account\?\}\]/.test(misBlock)
                && /agentFarm\.agentEngineDefaults/.test(misBlock.replace(/'\s*\+\s*'/g, ''))
                && /agentFarm\.launchDefaults/.test(misBlock.replace(/'\s*\+\s*'/g, '')));
            ok('…and a POOL member takes the same six, which it never could before',
                /findAgent\(String\(p\.agent \?\? p\.agentId \?\? ''\)\)\.id/.test(src));
            /**
             * ‼️ X-225 — AND THE SIXTH: WHOSE PLAN PAYS. Two axes, because they
             * are two questions — the delegations' sign-in (overridable per
             * member, exactly as `engine` is) and the ORCHESTRATOR's own, which
             * is one headless claude carrying the run from round to round. The
             * describe has to say what omitting them means, because "nothing
             * stated" is the state every mission ever written is in.
             */
            ok('‼️ X-225 — …and whose plan pays, mission-wide and for the planner',
                /account\? \(X-225 — WHOSE PLAN EVERY DELEGATION IS BILLED TO/.test(misBlock)
                && /plannerAccount\? \(X-225/.test(misBlock)
                && /is refused before/.test(misBlock.replace(/'\s*\+\s*'/g, '')));
            ok('…and the delegation actually carries the sign-in onto the task, by the same shape',
                /taskManager\.addTask\([\s\S]{0,200}\.\.\.runExtras\(\{[\s\S]{0,160}dims/.test(src)
                && !/task\.account = dims\.account/.test(src));
            // ‼️ X-107 — AND THE SEVENTH: WHICH ENDPOINT SERVES IT. Two axes
            // again, for the same reason the sign-in has two: the delegations'
            // route (overridable per member) and the orchestrator's own, which
            // is the longest-lived call a mission makes.
            ok('‼️ X-107 — …and which route serves them, mission-wide and for the planner',
                /providerId\?\/tier\? \(X-107/.test(misBlock)
                && /plannerProviderId\?\/plannerTier\? \(X-107/.test(misBlock)
                && /a tier alone is/.test(misBlock.replace(/'\s*\+\s*'/g, '')));
            ok('‼️ …and says out loud that the PLANNER stays on Claude Code, with why',
                /THE PLANNER ALWAYS RUNS ON CLAUDE CODE/.test(misBlock)
                && /--disallowedTools/.test(misBlock));
            // ‼️ B-12 — WHICH ENGINES THOSE ARE IS NOW READ OFF THE REGISTRY.
            // The sentence said "a subscription engine", which was a synonym for
            // "not Claude" until an engine arrived that runs on an account AND
            // states its own price; a caller reading it would have concluded
            // maxCostUSD was useless on OpenCode, where it is the working brake.
            ok('‼️ …and offers the ceiling that still binds when the engine states no price',
                /maxTokens\?/.test(misBlock)
                && /can never reach maxCostUSD/.test(misBlock.replace(/\s+/g, ' '))
                && /filter\(e => !e\.reportsCost\)/.test(misBlock));
            ok('…and missions.status reports the tokens beside the dollars',
                /tokens: r\.totalTokens \?\? 0/.test(src));
            // ‼️ X-119 — and the op SAYS that a preview refusal is a start
            // refusal. A caller that reads the two describes and concludes the
            // preview is advisory is the mistake this sentence removes.
            ok('‼️ …and missions.start says that what the preview refuses, it refuses',
                /WHAT missions\.preview REFUSES, THIS REFUSES/.test(misBlock)
                && /one refusal set/.test(misBlock.replace(/'\s*\+\s*'/g, '')));

            // ‼️ U-103 — ONE RESOLVER. The Missions form worked the effective
            // engine out for itself (`member || mission || 'claude'`) while the
            // run climbed a five-rung ladder, so the two disagreed the moment a
            // fleet default existed. What is asserted here is not that a preview
            // exists but that it CANNOT drift from the start: same argument
            // translation, same resolution, one code path.
            {
                const prevBlock = src.slice(src.indexOf("op: 'missions.preview'"),
                    src.indexOf("op: 'missions.status'"));
                ok('‼️ missions.preview answers what a start would launch, and starts nothing',
                    /WITHOUT LAUNCHING IT/.test(prevBlock) && /starts nothing/.test(prevBlock));
                ok('…and takes the EXACT arguments missions.start takes, through one translator',
                    /previewMission\(bridgeMissionInput\(args\)\)/.test(src)
                    && /createMission\(bridgeMissionInput\(args\)\)/.test(src));
                ok('‼️ …and start and preview run ONE resolution rather than two copies of it',
                    (src.match(/resolveMissionInput\(input\)/g) || []).length === 1
                    && /const planMissionLaunch = [^]{0,600}resolveMissionInput\(input\)/.test(src)
                    && /const createMission = [^]{0,900}planMissionLaunch\(input\)/.test(src)
                    && /const previewMission = [^]{0,400}planMissionLaunch\(input\)/.test(src));
                ok('…and the refusal a preview reports is the sentence a start would have used',
                    /return \{ ok: false, error: plan, mode, title, goal, workers: \[\], problems: \[plan\] \}/.test(src));
                // ‼️ X-119 — AND THE SHARED ANSWER INCLUDES THE REFUSALS, not
                // just the resolution. The per-participant checks lived inside
                // `previewMission` alone, so the very draft the form drew "This
                // draft would be refused" for went on to create a spec, a run
                // and its tasks through Start and through `missions.start`, and
                // the refusal arrived one layer down after planner turns were
                // already spent.
                ok('‼️ X-119 — a draft the preview REFUSES cannot be started, with the same sentence',
                    /const createMission = [^]{0,900}if \(plan\.preview\.problems\.length\) \{[^]{0,200}This mission cannot start — \$\{plan\.preview\.problems\.join\('; '\)\}/.test(src));
                ok('…and nothing is written to a store before that gate',
                    /if \(plan\.preview\.problems\.length\) \{[^]{0,220}\}\s*startMission\(/.test(src));
                ok('‼️ …resolved by the SAME ladder a delegation climbs, with the same two stores',
                    /const dims = resolveDelegateRun\(member, spec, \{/.test(src)
                    && /const planMissionLaunch = [^]{0,3000}storedDefault\(agentDefaults, agent\.dir, engine as EngineId\)/.test(src));
                ok('…and every refusal at once — an engine this machine cannot run AND an effort it has no flag for',
                    /engineRefusal\(engines, dims\.engine\),\s*headlessEffortRefusal\(dims\.engine, dims\.effort, undefined, \{\s*transport: 'run', model: dims\.model/.test(src)
                    && /EVERY refusal at once/.test(prevBlock));
                // ‼️ X-120 — AND THE PAIR AGAINST THE ENGINE IT REALLY LANDS ON.
                // `engineRefusal` answers "can this machine run it at all" and
                // said nothing about a model kept from the engine the row used
                // to be on, or an effort left behind by the model it was chosen
                // for: the narrow strip asked the user, "Keep as they are"
                // promised the draft's refusal list would say so, and the list
                // never looked.
                ok('‼️ X-120 — a model or effort the RESOLVED engine does not offer is refused before Start',
                    /const models = engineModelMatrix\(\);/.test(src)
                    && /capabilityRefusal\(\s*models\[dims\.engine as EngineId\], dims\.engine, dims\.model, dims\.effort\s*\)/.test(src));
                ok('‼️ X-122 — and the PLANNER\'s model+effort pair goes through the same gate',
                    /capabilityRefusal\(models\.claude, 'claude', plannerModel, plannerEffort\)/.test(src));
                ok('…and the op says so, including that an alias-guess catalogue refuses nothing',
                    /a model the engine it LANDS on does not offer/.test(prevBlock.replace(/'\s*\+\s*'/g, ''))
                    && /ignorance is not evidence/.test(prevBlock.replace(/'\s*\+\s*'/g, '')));
                ok('‼️ …and the PLANNER is not described as a worker: no engine choice, no permission mode, the LEAD\'s folder',
                    /THE PLANNER IS NOT A WORKER/.test(prevBlock)
                    && /LEAD AGENT.{0,3}s folder rather than the mission workdir/.test(prevBlock.replace(/'\s*\+\s*'/g, ''))
                    && /takes no permission mode at all/.test(prevBlock.replace(/'\s*\+\s*'/g, ''))
                    && /permissionMode: 'cli'/.test(src));

                // …and the ladder itself, run for real: these are the two rungs
                // the page had no way to see, which is why its guess was wrong.
                const MM2 = require(path.join(__dirname, '..', 'out', 'core', 'missions.js'));
                const fleet = MM2.resolveDelegateRun(undefined, {}, {
                    launch: { engine: 'gemini', model: 'gemini-2.5-pro' }
                });
                ok('‼️ …a fleet default decides the engine, which `member || mission || claude` never saw',
                    fleet.engine === 'gemini' && fleet.origin.engine === 'fleet'
                    && fleet.model === 'gemini-2.5-pro' && fleet.origin.model === 'fleet');
                const own = MM2.resolveDelegateRun({ engine: 'codex' }, { engine: 'gemini' }, {
                    farm: (e) => (e === 'codex' ? { model: 'gpt-5', effort: 'high' } : undefined),
                    launch: { model: 'sonnet' }
                });
                ok('…the member outranks the mission, and the agent\'s own per-engine default outranks the fleet',
                    own.engine === 'codex' && own.origin.engine === 'member'
                    && own.model === 'gpt-5' && own.origin.model === 'agent'
                    && own.effort === 'high' && own.origin.effort === 'agent');
                const bare = MM2.resolveDelegateRun(undefined, {}, {});
                ok('‼️ …and a field NOBODY set stays absent rather than being filled in with something plausible',
                    bare.engine === 'claude' && bare.model === undefined
                    && bare.origin.model === 'cli' && bare.origin.effort === 'cli');
            }

            // ‼️ U-100 — THE ORCHESTRATOR'S OWN PROFILE. The mission could say
            // which model plans and had no way to say how hard it thinks, so a
            // lead meant to reason through a hard fork ran at whatever the CLI
            // calls normal while a delegate on the same machine could be put on
            // xhigh from a picker. One axis settable, the other not, for no
            // reason anybody chose.
            {
                ok('‼️ missions.start takes the planner\'s EFFORT, not only its model',
                    /plannerEffort\? \(U-100/.test(misBlock)
                    && /HOW HARD THE ORCHESTRATOR THINKS/.test(misBlock));
                ok('…and says that leaving it out is exactly today\'s behaviour, not a new default',
                    /no\s*.\s*\+\s*.\s*--effort reaches that command line at all/.test(misBlock)
                    || /--effort reaches that command line at all/.test(misBlock.replace(/'\s*\+\s*'/g, '')));
                // ‼️ X-121 — the command line moved into `core/plannerLaunch.ts`,
                // where BOTH the launch and the preview now read it. The claim
                // is unchanged and in fact stronger: the effort still reaches a
                // real `--effort`, still behind the same bare-word guard the
                // model has, and now it can only get there from the MISSION —
                // an effort that came off a settings file must not be handed
                // back to the CLI as a flag.
                {
                    const pl = require('fs').readFileSync(
                        require('path').join(__dirname, '..', 'src', 'core', 'plannerLaunch.ts'), 'utf8');
                    ok('‼️ …and it reaches the real planner command line, guarded like the model is',
                        /const BARE = \/\^\[\\w\.:-\]\+\$\//.test(pl)
                        && /BARE\.test\(mission\)/.test(pl)
                        && /--effort \$\{launch\.effort\.value\}/.test(pl)
                        && /`claude \$\{extra \? extra \+ ' ' : ''\}\$\{model\}\$\{effort\}\$\{ctx\}`/.test(pl));
                    ok('‼️ …only when the MISSION said it — a file\'s own value is never echoed back as a flag',
                        /launch\.effort\.origin === 'mission' && launch\.effort\.value/.test(pl)
                        && /launch\.model\.origin === 'mission' && launch\.model\.value/.test(pl));
                }
                ok('…refused on a typo rather than dropped, by the validator a member\'s effort uses',
                    /validateLaunch\(\{ effort: plannerEffort \}\)/.test(src)
                    && /return `Planner: \$\{bad\}`/.test(src));
                ok('‼️ …inherited by a CHILD mission, so a sub-objective is not quietly demoted mid-run',
                    /\.\.\.\(parent\.plannerEffort \? \{ plannerEffort: parent\.plannerEffort \} : \{\}\)/.test(src));
                ok('…and readable back off the run, which the planner\'s dimensions never were',
                    /planner: \{[^]{0,240}effort: sp\?\.plannerEffort \?\? null/.test(src)
                    && /WHAT THE ORCHESTRATOR ITSELF IS RUNNING ON/.test(src));
                // ‼️ X-122 — FRESH AND RESUME ARE THE SAME COMMAND on this pair.
                // The model and the effort are built before `resumeSessionId` is
                // read at all, so round 7 thinks with what round 1 was given —
                // and the pair the capability gate approved is the pair every
                // round rides on.
                //
                // ‼️ X-267 — AND THE BRIEF IS NO LONGER THE EXCEPTION. It used to
                // be first-call-only, on the belief that a `--resume` already had
                // it in the conversation; it does not (an appended system prompt
                // is not a message), so every round after the first ran with no
                // project — and dropping the block changed the system prompt just
                // as much as rewriting it, re-billing the whole thread. Every
                // round now carries the conversation's PINNED copy: same bytes,
                // brief intact, cache intact.
                ok('‼️ X-122 — the pair rides every round, and X-267 — so does the brief',
                    /const ctxFile = systemPromptFileFor\(\s*spec\.projectId, 'mission', false, resumeSessionId\)/.test(src)
                    && !/const model = [^\n]*resumeSessionId/.test(src)
                    && !/const effort = [^\n]*resumeSessionId/.test(src));
            }

            // ‼️ X-95 — A MISSION'S SESSIONS, AS A SET AND AS A PAGE.
            //
            // A mission is many conversations — the planner's own lane and one
            // per delegation — and they were readable only one at a time, off
            // `planner.sessionId` or a step's record. "Show me what this mission
            // has been saying" is the question both a person and an agent ask,
            // and neither had an answer. Both routes are here because they must
            // not be able to disagree: the read gathers on the same stamp the
            // page filters on.
            {
                const stBlock = src.slice(src.indexOf("op: 'missions.status'"),
                    src.indexOf("op: 'missions.conversation'"));
                ok('‼️ X-95 — missions.status hands back every session the run opened',
                    /sessions: index\.allWithExternal\(\)/.test(stBlock)
                    && /sessionMission\(s\)\?\.id === r\.id/.test(stBlock));
                ok('…each saying which lane it is, so the planner is not lost among the delegates',
                    /role: s\.sessionId === r\.plannerSessionId \? 'planner' : 'delegate'/.test(stBlock));
                ok('…and the describe points at the op that puts the same set on screen',
                    /sessions\.page \{ mission/.test(stBlock.replace(/'\s*\+\s*'/g, '')));

                const pgBlock = src.slice(src.indexOf("op: 'sessions.page'"),
                    src.indexOf("op: 'sessions.interrupt'"));
                ok('‼️ sessions.page takes a mission run id and opens the page on it',
                    /mission\? \(run id\)/.test(pgBlock.replace(/'\s*\+\s*'/g, ''))
                    && /missionId \? \{ missionId \} : \{\}/.test(pgBlock));
                ok('…and says out loud that this scope ADDS rows rather than narrowing, and why',
                    /excluded from this page by default/.test(pgBlock.replace(/'\s*\+\s*'/g, '')));
                ok('‼️ …and refuses a run id that does not exist, rather than opening an empty page',
                    /need\(!!missionStore\.run\(missionId\), `no mission run/.test(pgBlock));

                // ‼️ The stamp itself: without it every one of the above is a
                // filter over a field nothing writes.
                ok('‼️ …and the launcher map really carries the mission id, for the planner too',
                    /stamp\(run\.plannerSessionId, `\$\{title\} — planner`\)/.test(src)
                    && /missionId: t\.missionId, missionTitle: missionTitleOf\(t\.missionId\)/.test(src));
                ok('…and is republished when a MISSION moves, not only when a task does',
                    /missionEmitter\.event\(\(\) => publishLaunchers\(\)\)/.test(src));

                // ‼️ X-125 — AND THE STAMP OUTLIVES BOTH STORES IT CAME FROM.
                //
                // It was re-derived on every refresh out of the task rows and
                // `missionStore.runs`, and both forget: retention files and then
                // removes a task, and a run can be deleted from the page. When
                // the last of them let go, a months-old planner or delegation
                // session lost its 🎯, reappeared in the pool a person's own
                // dialogs live in, and changed what the table shows by default.
                ok('‼️ X-125 — the stamp is written down, in its own persisted store',
                    /const MISSION_SESSIONS_KEY = 'agentfarm\.missionSessions'/.test(src)
                    && /context\.globalState\.update\(MISSION_SESSIONS_KEY, had\)/.test(src));
                ok('…laid down as the FLOOR before either store speaks',
                    /for \(const \[id, s\] of Object\.entries\(readMissionStamps\(\)\)\) \{[^]{0,220}map\[id\] = \{ kind: 'mission'/.test(src)
                    && src.indexOf('readMissionStamps())') < src.indexOf('const missionMark = t.missionId'));
                ok('‼️ …and a fresher launcher may not UNSTAMP a session that has one',
                    /map\[id\] = \(had\?\.missionId && !entry\.missionId\)\s*\?\s*\{ \.\.\.entry, kind: 'mission', missionId: had\.missionId, missionTitle: had\.missionTitle \}/.test(src));
                ok('…whatever the stores can still see is persisted on the way out — which is also the migration',
                    /rememberMissionStamps\(seen\);\s*index\.setLaunchers\(map\);/.test(src));
                ok('…and the store is capped, so a year of missions is not an unbounded map in globalState',
                    /MISSION_SESSIONS_MAX = \d+/.test(src)
                    && /ids\.length > MISSION_SESSIONS_MAX/.test(src));
                // The read is a cache with one entry point, and the guard at the
                // top of it is only true if some path below actually fills it —
                // an early `return out` that skips the assignment turns the whole
                // thing back into a globalState read on every task event, and
                // worse: `rememberMissionStamps` then mutates a throwaway object.
                ok('…the stamp store is read ONCE, and the cache is filled on every path out of the read',
                    /if \(missionStampCache\) \{ return missionStampCache; \}/.test(src)
                    && /missionStampCache = out;\s*return out;\s*\};/.test(src)
                    && !/const out: Record<string, MissionSessionStamp> = \{\};[^]{0,160}\breturn out;\s*\}\s*\n/.test(src));
                // The other half of the same item: the binding itself carries
                // the run's name, and it is read at a moment when the mission
                // store does not exist yet — so the lookup is late-bound rather
                // than reached for during activation.
                ok('‼️ X-125 — a mission BINDING carries the run\'s name, without touching a store too early',
                    /let missionRunTitle: \(\(runId: string\) => string\) \| undefined;/.test(src)
                    && /origin\.missionId && missionRunTitle\s*\?\s*\{ launcherTitle: missionRunTitle\(origin\.missionId\) \}/.test(src)
                    && /missionRunTitle = missionTitleOf;/.test(src));
            }

            // ‼️ U-104 — REQUESTED, RESOLVED AND APPLIED ARE THREE FACTS.
            //
            // `ran` is one line for a narrow place and is lossy by construction:
            // it drops every dimension the CLI chose and the default engine, so
            // the commonest delegation of all — one that took every default —
            // was recorded as nothing at all. And what the ENGINE says it served
            // was on no surface and in no op: a model override that was refused
            // read exactly like one that was honoured.
            {
                const stBlock = src.slice(src.indexOf("op: 'missions.status'"),
                    src.indexOf("op: 'missions.conversation'"));
                // ‼️ X-124 — the reading itself moved into a pure module; the
                // rule that a silence is a value moved with it and is measured
                // where it now lives, not loosened.
                const appliedSrc = fs.readFileSync(
                    path.join(__dirname, '..', 'src', 'core', 'appliedTurn.ts'), 'utf8');
                ok('‼️ U-104 — the lossy line is UNTOUCHED, so no caller reading it breaks',
                    /\.\.\.\(s\.runNote \? \{ ran: s\.runNote \} : \{\}\)/.test(stBlock));
                ok('‼️ …and the same answer whole rides beside it, `cli` origins included',
                    /dimensions: \{/.test(stBlock)
                    && /origin: s\.ran\.origin/.test(stBlock)
                    && /workDir: s\.ran\.workDir \?\? null/.test(stBlock));
                // ‼️ X-124 — and it is per step AND bound to the stretch that
                // step occupied. The lane's aggregate holds every model it ever
                // served, so an unbound reading answered "was my model among
                // them?" out of somebody else's round.
                ok('‼️ …with what the ENGINE says it actually served, per step and over its own window',
                    /applied: appliedDimensions\(\s*bySid\.get\(s\.runSessionId\),\s*stepWindow\(/.test(stBlock));
                ok('…and for the orchestrator, over the RUN\'s window, which it had no profile for at all',
                    /applied: r\.plannerSessionId\s*\?\s*appliedDimensions\(bySid\.get\(r\.plannerSessionId\), plannerWindow\(r\)\)/
                        .test(stBlock));
                ok('‼️ silence is a VALUE — a field the transcript does not state is null, never the request echoed back',
                    /effort: null/.test(appliedSrc)
                    && /SILENCE IS A VALUE HERE/.test(appliedSrc));
                ok('‼️ …and the index is walked ONCE per call, not once per step',
                    /const bySid = new Map\(index\.allWithExternal\(\)\.map\(x => \[x\.sessionId, x\]\)\);/.test(stBlock));
                ok('‼️ the resolver\'s answer is KEPT at the spawn, or none of the above has a source',
                    /step\.ran = dims;/.test(src));
            }

            // ‼️ X-45 — the real op exists, and its describe carries the two
            // things a caller cannot work out for itself: what `health` can say
            // and that `resume` may REFUSE. An agent that reads "resume: refuse"
            // without knowing it is a value will treat it as a run it may retry.
            const trBlock = src.slice(src.indexOf("op: 'missions.trace'"));
            ok('‼️ X-45 — the journal has a bridge op, in the same commit as the feature',
                trBlock.startsWith("op: 'missions.trace'"));

            // ‼️ U-88 — the page can ask for a memory-only scope, so the bridge
            // must be able to ask for it too. `[]` means NONE here, the way it
            // already does on `agents?`; collapsing it to the default left an
            // agent unable to express a scope a person could point at.
            const stBlock = src.slice(src.indexOf("op: 'search.transcripts'"), src.indexOf("op: 'search.transcripts'") + 4000);
            ok('search.transcripts says what an EMPTY roles array means',
                /\[\] = NONE/.test(stBlock.replace(/'\s*\+\s*'/g, '')));
            ok('…and the handler really passes it through rather than defaulting it away',
                /roles\?\.length \? roles : undefined/.test(src) === false
                && /present-but-empty is an ANSWER/.test(src));
            ok('…whose describe names every health value',
                ['ok', 'missing', 'truncated', 'damaged', 'future']
                    .every(h => new RegExp('[/ ]' + h + '[ /]').test(trBlock.slice(0, 1600))));
            ok('…and says a run can be refused a resume outright',
                /cannot be safely resumed/.test(trBlock.slice(0, 1600).replace(/'\s*\+\s*'/g, '')));
            ok('…and that it is the AUDIT record, not the engine state missions.status reports',
                /AUDIT record/.test(trBlock.slice(0, 1600).replace(/'\s*\+\s*'/g, '')));
        }

        // The window has to cover the whole op — the hosted-session branch and
        // its contract sentence both grew with X-35, and a fixed 1600 characters
        // silently stopped reaching the terminal path it is checking.
        const intBlock = src.slice(src.indexOf("op: 'sessions.interrupt'"), src.indexOf("op: 'live.versions'"));
        ok('sessions.interrupt sends the Esc key with no newline',
            /sendText\(INTERRUPT_KEY, false\)/.test(intBlock));
        ok('…and states the external-terminal limit in its contract',
            /external/i.test(intBlock));
        // ‼️ X-35: a terminal is one of TWO routes, and it is not the one a
        // hosted conversation takes. An op whose only implementation types Esc
        // into a terminal cannot interrupt a Codex or Antigravity session at all —
        // there is no terminal, and between turns there is no process either.
        ok('‼️ …and stops a hosted conversation through the Console, on any engine',
            /consoleHost\.list\(\)\.find\(h => h\.sessionId === sessionId\)/.test(intBlock)
            && /consoleHost\.interrupt\(hosted\.id\)/.test(intBlock));
    }

    // ---------- live sessions: read, end, clear ----------
    // What the Live Timeline can do, an agent can do: see what is running,
    // stop one for real, and clear a card left behind by a claude that died
    // without a SessionEnd hook.
    {
        const reg = new BridgeRegistry();
        const N = Date.now();
        let tracked = [
            { sessionId: 'A', agentName: 'dev', status: 'tool', currentTool: 'Bash', startedAt: N - 3600e3, lastEventTs: N - 1000, prompts: 4, toolCalls: 9, compactions: 1, subagentStops: 0, cwd: 'D:/a/dev' },
            { sessionId: 'B', agentName: 'ops', status: 'waiting-input', startedAt: N - 7200e3, lastEventTs: N - 600e3, prompts: 1, toolCalls: 0, compactions: 0, subagentStops: 0 },
            { sessionId: 'C', source: 'gemini', agentName: 'dev', status: 'idle', startedAt: N - 7200e3, lastEventTs: N - 60e3, prompts: 0, toolCalls: 0, compactions: 0, subagentStops: 0 }
        ];
        // Only A still has a process: B is the ghost this feature exists for.
        const owners = [{ sessionId: 'A', pid: 4242, entrypoint: 'cli' }];
        const rows = new Map([['A', { title: 'the job', cost: 1.234, userTurns: 4, usage: {} }]]);
        const cleared = [];
        const liveStub = {
            sessions: () => tracked,
            labelOf: (s) => s.agentName,
            dismiss: (id) => {
                if (!tracked.some(s => s.sessionId === id)) { return false; }
                tracked = tracked.filter(s => s.sessionId !== id);
                cleared.push(id);
                return true;
            }
        };
        const registryReadable = () => true;
        reg.register([
            {
                op: 'sessions.live',
                describe: 'The sessions the live monitor is tracking right now — alive: false = over, null = unknowable. args: none',
                handler: () => liveStub.sessions().map(s => {
                    const row = rows.get(s.sessionId);
                    const owner = owners.find(o => o.sessionId === s.sessionId);
                    return {
                        sessionId: s.sessionId, label: liveStub.labelOf(s), status: s.status,
                        tool: s.currentTool ?? null, prompts: s.prompts, toolCalls: s.toolCalls,
                        title: row ? row.title : null, cost: row ? Math.round(row.cost * 100) / 100 : 0,
                        turns: row ? row.userTurns : 0,
                        alive: s.source ? null : (registryReadable() ? !!owner : null),
                        pid: owner ? owner.pid : null
                    };
                })
            },
            {
                op: 'sessions.dismiss',
                describe: 'Take a session off the Live Timeline without touching the session. args: sessionId | gone:true',
                handler: (args) => {
                    if (args.gone === true) {
                        if (!registryReadable()) { return { cleared: 0, reason: 'registry unreadable' }; }
                        const owned = new Set(owners.map(o => o.sessionId));
                        const dead = liveStub.sessions().filter(s => !s.source && !owned.has(s.sessionId) &&
                            Date.now() - s.startedAt > 60000);
                        for (const s of dead) { liveStub.dismiss(s.sessionId); }
                        return { cleared: dead.length, sessions: dead.map(s => s.sessionId) };
                    }
                    const sessionId = argStr(args, 'sessionId');
                    return { sessionId, cleared: liveStub.dismiss(sessionId) };
                }
            }
        ]);

        const listed = await reg.dispatch('sessions.live', {});
        ok('sessions.live reports every tracked session', listed.ok && listed.result.length === 3);
        const a = listed.result.find(r => r.sessionId === 'A');
        ok('…with its live state and the transcript\'s figures',
            a.status === 'tool' && a.tool === 'Bash' && a.cost === 1.23 && a.turns === 4);
        ok('…a session the OS still runs is alive, with its pid', a.alive === true && a.pid === 4242);
        ok('…one it does not is NOT alive', listed.result.find(r => r.sessionId === 'B').alive === false);
        ok('…and an external CLI is never judged (no registry of its own)',
            listed.result.find(r => r.sessionId === 'C').alive === null);

        const swept = await reg.dispatch('sessions.dismiss', { gone: true });
        ok('sessions.dismiss gone:true clears exactly the ghost',
            swept.ok && swept.result.cleared === 1 && swept.result.sessions[0] === 'B');
        ok('…and leaves the running one and the external CLI alone',
            tracked.map(s => s.sessionId).join(',') === 'A,C');
        const one = await reg.dispatch('sessions.dismiss', { sessionId: 'A' });
        ok('sessions.dismiss clears a named session', one.ok && one.result.cleared === true);
        const gone = await reg.dispatch('sessions.dismiss', { sessionId: 'A' });
        ok('…and says so plainly when there was nothing to clear', gone.ok && gone.result.cleared === false);

        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        for (const op of ['sessions.live', 'sessions.end', 'sessions.dismiss']) {
            ok(`extension.ts registers ${op}`, src.includes(`op: '${op}'`));
        }
        const endBlock = src.slice(src.indexOf("op: 'sessions.end'"), src.indexOf("op: 'sessions.end'") + 1200);
        ok('sessions.end goes through the same confirm-and-stop path the panel uses',
            /endLiveSession\(sessionId\)/.test(endBlock));
        ok('…and its contract points at sessions.interrupt for the lesser action',
            /sessions\.interrupt/.test(endBlock));
    }

    // ---------- the project document ops (Faz 4) ----------
    // The WRITE side of the project axis: what lets an agent finish a piece of
    // work by recording it, so the next session's brief is built out of what
    // happened rather than out of what somebody remembered to type. The pure
    // logic is proved in test_project_docs.js and test_project_plan.js; what is
    // checked here is that the ops dispatch, that they refuse the things they
    // promise to refuse, and that extension.ts actually registers all of them.
    {
        const {
            addDecision, addDeliverableRow, createSkeleton, insertLogEntry, readProjectDoc,
            scanProjectFolder, writeProjectDoc
        } = require(path.join(__dirname, '..', 'out', 'core', 'projectDocs.js'));
        const { addPlanItem, checkPlanItem, planSummary } =
            require(path.join(__dirname, '..', 'out', 'core', 'projectPlan.js'));
        const {
            addBacklogItem, archiveBacklogDone, BACKLOG_CODE, gatherFamilies, joinParent, moveInQueue,
            moveBacklogState,
            nextBacklog, parseBacklog, placeInQueue, queueOrder, setBacklogFields, setBacklogHold,
            setBacklogQueue, setBacklogState, tidyBacklogFile
        } = require(path.join(__dirname, '..', 'out', 'core', 'projectBacklog.js'));
        const { appendTrack, closingStamp, readTrackFile, summarizeCode, trackedCodes, TRACK_EVENTS } =
            require(path.join(__dirname, '..', 'out', 'core', 'backlogTrack.js'));

        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-bridge-docs-'));
        const project = {
            id: 'prj_docs0001', name: 'Agent Farm', status: 'active',
            folder: dir, createdAt: 1, updatedAt: 1
        };
        createSkeleton(dir, project);
        const roles = () => scanProjectFolder(dir).roles;
        fs.writeFileSync(roles().plan, '---\naf-role: plan\n---\n\n# Plan\n\n## Milestones\n'
            + '- [ ] Faz 4 — belgeler 🆔 afprj-04\n- [ ] Faz 5 — iş\n');

        // The same handler shapes extension.ts registers, over the same pure
        // functions — a second implementation here would prove nothing.
        const rel = f => path.relative(dir, f).replace(/\\/g, '/');
        const edit = (file, change) => {
            const read = readProjectDoc(dir, rel(file));
            need(read.ok, read.error || 'unreadable');
            const next = change(read.text || '');
            need(next.ok, next.error || 'nothing to write');
            const w = writeProjectDoc(dir, rel(file), next.text, read.mtimeMs);
            need(w.ok, w.error || 'write failed');
            return next;
        };
        const reg = new BridgeRegistry();
        reg.register([
            {
                op: 'projects.doc.read', describe: 'read one. args: project, path',
                handler: a => {
                    const r = readProjectDoc(dir, argStr(a, 'path'));
                    need(r.ok, r.error || 'could not read that document');
                    return { text: r.text, mtimeMs: r.mtimeMs };
                }
            },
            {
                op: 'projects.doc.write', describe: 'write one. args: project, path, content, expectMtime?, append?',
                handler: a => {
                    const p = argStr(a, 'path');
                    const existing = readProjectDoc(dir, p);
                    // ‼️ Everything below reads a failed read as "nothing to
                    // lose". That is only true when the file is genuinely NOT
                    // THERE — a file that exists but could not be read would
                    // otherwise take the create path and be replaced.
                    need(existing.ok || existing.missing === true,
                        `${p} is there but could not be read — refusing to write over it`);
                    need(!existing.ok || typeof a.expectMtime === 'number',
                        `${p} already exists — read it first and pass expectMtime, or use append:true`);
                    const w = writeProjectDoc(dir, p, String(a.content || ''),
                        typeof a.expectMtime === 'number' ? a.expectMtime : undefined);
                    need(w.ok, w.error || 'the write failed');
                    return { path: p, created: !existing.ok };
                }
            },
            {
                op: 'projects.log', describe: 'add a worklog line. args: project, entry',
                handler: a => {
                    const entry = argStr(a, 'entry').trim();
                    need(entry, 'an entry needs some text');
                    const line = /^-?\s*\d{4}-\d{2}-\d{2}/.test(entry) || entry.startsWith('-')
                        ? (entry.startsWith('-') ? entry : `- ${entry}`)
                        : `- 2026-08-03 — ${entry}`;
                    const r = insertLogEntry(roles().log, line);
                    need(r.ok, r.error || 'the worklog could not be written');
                    return { line };
                }
            },
            {
                op: 'projects.plan', describe: 'the plan as items. args: project, open?',
                handler: a => {
                    const sum = planSummary(readProjectDoc(dir, rel(roles().plan)).text || '');
                    return {
                        open: sum.open, done: sum.done,
                        items: (a.open === true ? sum.items.filter(i => !i.done) : sum.items)
                            .map(i => ({ line: i.line + 1, text: i.text, done: i.done, id: i.id || null }))
                    };
                }
            },
            {
                op: 'projects.plan.add', describe: 'add an item. args: project, item, section?',
                handler: a => {
                    edit(roles().plan, t => addPlanItem(t, argStr(a, 'item'),
                        optStr(a, 'section') ? { section: optStr(a, 'section') } : {}));
                    return { added: argStr(a, 'item') };
                }
            },
            {
                op: 'projects.plan.check', describe: 'tick one item. args: project, item?/id?/line?, done?',
                handler: a => {
                    const target = {
                        ...(optStr(a, 'id') ? { id: optStr(a, 'id') } : {}),
                        ...(typeof a.line === 'number' ? { line: a.line - 1 } : {}),
                        ...(optStr(a, 'item') ? { text: optStr(a, 'item') } : {})
                    };
                    need(target.id || target.line !== undefined || target.text,
                        'say which item: id, line or item (text)');
                    const out = edit(roles().plan, t => checkPlanItem(t, target, a.done !== false));
                    return { item: out.item.text, done: a.done !== false, note: out.note || null };
                }
            },
            {
                op: 'projects.decision.add', describe: 'record a decision. args: project, title, body?',
                handler: a => {
                    const r = addDecision(dir, { title: argStr(a, 'title'), body: optStr(a, 'body') });
                    need(r.ok, r.error || 'the decision could not be written');
                    return { file: rel(r.file), title: r.decision.title };
                }
            },
            {
                op: 'projects.deliver', describe: 'record a deliverable. args: project, what, version?, date?, where?',
                handler: a => {
                    const what = argStr(a, 'what').trim();
                    need(what, 'a deliverable needs a name');
                    edit(roles().deliverables, t => addDeliverableRow(t, {
                        what, version: optStr(a, 'version'),
                        date: optStr(a, 'date'), where: optStr(a, 'where')
                    }));
                    return { what };
                }
            }
        ]);

        const planBefore = await reg.dispatch('projects.plan', { project: 'Agent Farm' });
        ok('projects.plan returns the document\'s own checkboxes',
            planBefore.ok && planBefore.result.open === 2 && planBefore.result.items[0].id === 'afprj-04');

        const ticked = await reg.dispatch('projects.plan.check', { project: 'Agent Farm', id: 'afprj-04' });
        ok('projects.plan.check ticks the item it was pointed at',
            ticked.ok && ticked.result.item === 'Faz 4 — belgeler');
        ok('‼️ …and the line keeps its Tasks metadata, with no ✅ invented',
            fs.readFileSync(roles().plan, 'utf8').includes('- [x] Faz 4 — belgeler 🆔 afprj-04'));
        const ambiguous = await reg.dispatch('projects.plan.check',
            { project: 'Agent Farm', item: 'Faz' });
        ok('‼️ an ambiguous item is refused rather than guessed at',
            !ambiguous.ok && /be more specific/.test(ambiguous.error));
        const noTarget = await reg.dispatch('projects.plan.check', { project: 'Agent Farm' });
        ok('…and so is a check with nothing to aim at', !noTarget.ok && /which item/.test(noTarget.error));

        const added = await reg.dispatch('projects.plan.add',
            { project: 'Agent Farm', item: 'Faz 6 — zekâ', section: 'Milestones' });
        ok('projects.plan.add joins the section it names', added.ok
            && fs.readFileSync(roles().plan, 'utf8').includes('- [ ] Faz 6 — zekâ'));

        const logged = await reg.dispatch('projects.log',
            { project: 'Agent Farm', entry: 'Faz 4 shipped.' });
        ok('projects.log dates the entry and puts it at the anchor',
            logged.ok && /^- 2026-08-03 — Faz 4 shipped\.$/.test(logged.result.line));
        const logBody = fs.readFileSync(roles().log, 'utf8');
        ok('…newest first, directly below the anchor the user can move',
            logBody.indexOf('Faz 4 shipped') > logBody.indexOf('af:log-top'));
        ok('an empty entry is refused',
            !(await reg.dispatch('projects.log', { project: 'Agent Farm', entry: '  ' })).ok);

        const decided = await reg.dispatch('projects.decision.add',
            { project: 'Agent Farm', title: 'Ticking writes one character', body: 'And nothing else.' });
        ok('projects.decision.add writes its own file, found by frontmatter',
            decided.ok && /20_Decisions\//.test(decided.result.file)
            && /af-role: decision/.test(fs.readFileSync(path.join(dir, decided.result.file), 'utf8')));
        ok('a decision with no title is refused',
            !(await reg.dispatch('projects.decision.add', { project: 'Agent Farm', title: '' })).ok);

        const delivered = await reg.dispatch('projects.deliver',
            { project: 'Agent Farm', what: 'VSIX', version: '3.57.0', date: '2026-08-03', where: 'local' });
        ok('projects.deliver adds a row to the user\'s own table',
            delivered.ok && /\| VSIX \| 3\.57\.0 \| 2026-08-03 \| local \|/
                .test(fs.readFileSync(roles().deliverables, 'utf8')));

        // ‼️ the boundary, from the outside
        const escaped = await reg.dispatch('projects.doc.read',
            { project: 'Agent Farm', path: '../../anything' });
        ok('‼️ a path climbing out of the project folder is refused', !escaped.ok);
        const blind = await reg.dispatch('projects.doc.write',
            { project: 'Agent Farm', path: 'Plan.md', content: 'wiped' });
        ok('‼️ overwriting an existing document without expectMtime is refused — read it first',
            !blind.ok && /read it first/.test(blind.error));
        const read = await reg.dispatch('projects.doc.read', { project: 'Agent Farm', path: 'Plan.md' });
        const guarded = await reg.dispatch('projects.doc.write', {
            project: 'Agent Farm', path: 'Plan.md',
            content: read.result.text, expectMtime: read.result.mtimeMs
        });
        ok('…and it goes through once the caller has actually read it', guarded.ok);
        const created = await reg.dispatch('projects.doc.write',
            { project: 'Agent Farm', path: '10_Notes/new.md', content: '# new\n' });
        ok('a file that is not there yet needs no guard — nothing can be lost', created.ok);

        // ‼️ "not there" and "there but unreadable" are two answers, and the
        // guard above only holds for the first. A file that EXISTS but could
        // not be read used to look identical to one that is absent, so the
        // create path replaced it — the blind overwrite this op exists to make
        // impossible. A folder standing where a file is asked for is the same
        // failure and the one a test can produce anywhere.
        fs.mkdirSync(path.join(dir, '10_Notes', 'held.md'));
        const held = await reg.dispatch('projects.doc.write',
            { project: 'Agent Farm', path: '10_Notes/held.md', content: 'wiped' });
        ok('‼️ a document that is there but unreadable is NOT treated as absent', !held.ok);
        ok('…and the refusal says so rather than reporting a create',
            /could not be read/.test(held.error || ''));
        ok('…and what was there is still there',
            fs.statSync(path.join(dir, '10_Notes', 'held.md')).isDirectory());

        // ---- the backlog family, dispatched the same way ----
        // The ops themselves live in extension.ts (they need the project store);
        // what is exercised here is the CONTRACT an agent depends on — that the
        // handler shape works through the registry, and that a refusal comes
        // back as a refusal rather than a silent success.
        {
            const backlogFile = path.join(dir, 'Backlog.md');
            fs.writeFileSync(backlogFile, [
                '---', 'af-role: backlog', '---', '', '# Agent Farm — Backlog', '',
                '## 📥 Inbox', '', '- [ ] something I noticed', '',
                '## P — Projects', '',
                '- [ ] P-1 first thing #bug ⏫ [efor:: S]',
                '- [ ] P-2 second thing [efor:: XL]', ''
            ].join('\n'));
            const readBacklog = () => fs.readFileSync(backlogFile, 'utf8');
            const editBacklog = change => {
                const r = change(readBacklog());
                need(r.ok, r.error || 'nothing to write');
                fs.writeFileSync(backlogFile, r.text);
                return r;
            };
            reg.register([
                {
                    op: 'projects.backlog', describe: 'the backlog as items. args: project, open?',
                    handler: () => {
                        const s = parseBacklog(readBacklog());
                        return {
                            counts: { open: s.open, unclassified: s.unclassified },
                            areas: s.areas.map(a => a.code),
                            items: s.items.map(i => ({ code: i.code || null, text: i.text, state: i.state }))
                        };
                    }
                },
                {
                    op: 'projects.backlog.next',
                    describe: 'what to work on. args: project, limit?, maxEffort?',
                    handler: a => {
                        const r = nextBacklog(readBacklog(), {
                            ...(typeof a.limit === 'number' ? { limit: a.limit } : {}),
                            ...(optStr(a, 'maxEffort') ? { maxEffort: optStr(a, 'maxEffort') } : {})
                        });
                        return { items: r.items.map(i => i.code || null) };
                    }
                },
                {
                    op: 'projects.backlog.add', describe: 'add an item. args: project, text, area?, at?',
                    handler: a => {
                        const body = argStr(a, 'text').trim();
                        need(body, 'an item needs some text');
                        // S-12: the add and the placement are ONE write — the
                        // same chaining the real handler does, for the same
                        // reason (a failure between two writes would leave an
                        // item the user asked to put first sitting last).
                        // ‼️ B-25 — THE STAND-IN READS THE ARG THE WAY THE REAL
                        // HANDLER DOES, or it certifies a bug it cannot have.
                        // This one read `a.at` straight, so it was green on a
                        // number while the shipped op — reading it through
                        // `Number(optStr(…))` — threw every number away.
                        const atGiven = a.at !== undefined && a.at !== null && String(a.at).trim() !== '';
                        const at = Math.floor(optNum(a, 'at', 0)) || 0;
                        let note = null;
                        const r = editBacklog(t => {
                            const res = addBacklogItem(t, {
                                text: body,
                                ...(optStr(a, 'area') ? { area: optStr(a, 'area') } : {})
                            });
                            if (!res.ok) { return res; }
                            if (!at) {
                                if (atGiven) {
                                    note = `at="${String(a.at)}" is not a queue position (1 is the top),`
                                        + ' so the item queued where a new one normally would';
                                }
                                return res;
                            }
                            if (!res.code) {
                                note = 'it went to the inbox without a code, so it could not be queued';
                                return res;
                            }
                            const q = placeInQueue(res.text, res.code, at);
                            if (!q.ok) { note = q.error; return res; }
                            note = `queued at ${at}`;
                            return { ok: true, text: q.text, code: res.code };
                        });
                        return { code: r.code || null, note };
                    }
                },
                {
                    op: 'projects.backlog.move',
                    describe: 'move an item through the queue. args: project, code, dir?, by?, to?',
                    handler: a => {
                        const code = argStr(a, 'code').toUpperCase();
                        const r = editBacklog(t => (typeof a.to === 'number'
                            ? placeInQueue(t, code, a.to)
                            : moveInQueue(t, code, optStr(a, 'dir') || 'up',
                                typeof a.by === 'number' ? a.by : undefined)));
                        return { code, queue: r.queue };
                    }
                },
                {
                    op: 'projects.backlog.queue',
                    describe: 'read or replace the whole order. args: project, codes?',
                    handler: a => {
                        if (!Object.prototype.hasOwnProperty.call(a, 'codes')) {
                            return { queue: nextBacklog(readBacklog(), { limit: 50, maxEffort: 'XL' }).queue };
                        }
                        const codes = (Array.isArray(a.codes) ? a.codes : String(a.codes).split(','))
                            .map(c => String(c).trim().toUpperCase()).filter(Boolean);
                        const r = editBacklog(t => setBacklogQueue(t, codes));
                        return { queue: r.queue };
                    }
                },
                {
                    op: 'projects.backlog.tidy',
                    describe: 'put each area back in code order. args: project',
                    handler: () => {
                        const r = editBacklog(t => tidyBacklogFile(t));
                        return { moved: r.moved };
                    }
                },
                {
                    op: 'projects.backlog.gather',
                    describe: 'pull every part under its whole IN THE QUEUE. args: project, code?',
                    handler: a => {
                        const r = editBacklog(t => gatherFamilies(t, optStr(a, 'code') || undefined));
                        return { queue: r.queue, note: r.note ?? null };
                    }
                },
                {
                    op: 'projects.backlog.under',
                    describe: 'send ONE part under its whole in the queue. args: project, code',
                    handler: a => {
                        const code = String(a.code || '').trim().toUpperCase();
                        need(!!code, 'which item should be sent under its parent? pass `code`');
                        const r = editBacklog(t => joinParent(t, code));
                        return { queue: r.queue, note: r.note ?? null };
                    }
                },
                {
                    op: 'projects.backlog.archive',
                    describe: 'archive every closed item, or only old ones. args: project, olderThanDays?',
                    handler: a => {
                        const aimed = ['code', 'item', 'line', 'note'].filter(k => a[k] !== undefined);
                        need(aimed.length === 0,
                            'projects.backlog.archive sweeps the CLOSED items of a whole file; it takes no '
                            + 'aim at one, so ' + aimed.join(', ') + ' would have been IGNORED. Use '
                            + 'projects.backlog.check.');
                        const days = a.olderThanDays === undefined ? undefined : Number(a.olderThanDays);
                        need(days === undefined || (Number.isInteger(days) && days >= 0),
                            'olderThanDays must be a whole number');
                        const now = Date.parse('2026-08-11T12:00:00Z');
                        const r = editBacklog(t => archiveBacklogDone(t, {
                            ...(days === undefined ? {} : { olderThanDays: days, now }),
                            closedAt: i => i.code === 'P-1' ? now - 10 * 86400000 : null
                        }));
                        return { moved: r.moved, olderThanDays: days ?? null, undated: r.undated ?? 0 };
                    }
                },
                {
                    op: 'projects.backlog.check', describe: 'change state. args: project, code?, state?',
                    handler: a => {
                        const target = {
                            ...(optStr(a, 'code') ? { code: optStr(a, 'code') } : {}),
                            ...(optStr(a, 'item') ? { text: optStr(a, 'item') } : {})
                        };
                        need(target.code || target.text, 'say which item: code, line or item (text)');
                        const r = editBacklog(t => moveBacklogState(t, target, optStr(a, 'state') || 'done'));
                        return { code: r.item.code || null, state: r.item.state, note: r.note ?? null };
                    }
                },
                {
                    op: 'projects.backlog.hold',
                    describe: 'park it, or take it off the parking. args: project, code?, on?',
                    handler: a => {
                        const target = {
                            ...(optStr(a, 'code') ? { code: optStr(a, 'code') } : {}),
                            ...(optStr(a, 'item') ? { text: optStr(a, 'item') } : {})
                        };
                        need(target.code || target.text, 'say which item: code, line or item (text)');
                        const on = a.on === undefined ? true : a.on === true;
                        const r = editBacklog(t => setBacklogHold(t, target, on));
                        return { code: r.item.code || null, onHold: !!r.item.onHold, note: r.note ?? null };
                    }
                }
            ]);

            const listed = await reg.dispatch('projects.backlog', { project: 'Agent Farm' });
            ok('projects.backlog reads the file\'s own lines',
                listed.ok && listed.result.counts.open === 3
                && listed.result.counts.unclassified === 1
                && listed.result.areas.join() === 'P');

            const up = await reg.dispatch('projects.backlog.next', { project: 'Agent Farm', limit: 5 });
            ok('‼️ projects.backlog.next keeps the user\'s XL item in top N by default',
                up.ok && up.result.items.indexOf('P-2') >= 0 && up.result.items.indexOf('P-1') >= 0);

            const narrow = await reg.dispatch('projects.backlog.next',
                { project: 'Agent Farm', limit: 5, maxEffort: 'M' });
            ok('…and filters it only when the caller explicitly asks for a ceiling',
                narrow.ok && narrow.result.items.indexOf('P-2') < 0);

            const capture = await reg.dispatch('projects.backlog.add',
                { project: 'Agent Farm', text: 'a passing thought' });
            ok('projects.backlog.add with no area captures without a code — friction-free',
                capture.ok && capture.result.code === null
                && /- \[ \] a passing thought/.test(readBacklog()));
            const filed = await reg.dispatch('projects.backlog.add',
                { project: 'Agent Farm', text: 'a real item', area: 'P' });
            ok('…and with an area it is given the next free code', filed.ok && filed.result.code === 'P-3');

            // ---- S-12: `at` — write it down AND say where it goes, in one move ----
            const jumped = await reg.dispatch('projects.backlog.add',
                { project: 'Agent Farm', text: 'do this one first', area: 'P', at: 1 });
            ok('projects.backlog.add can put the new item at a queue position',
                jumped.ok && jumped.result.code === 'P-4' && /queued at 1/.test(jumped.result.note));
            const head = await reg.dispatch('projects.backlog.next',
                { project: 'Agent Farm', limit: 5, maxEffort: 'XL' });
            ok('…and it really is the next thing up', head.ok && head.result.items[0] === 'P-4');
            ok('‼️ …written in ONE pass — the item line and the 🎯 block, one file',
                /- \[ \] P-4 do this one first/.test(readBacklog()) && /1\. P-4/.test(readBacklog()));
            const unplaceable = await reg.dispatch('projects.backlog.add',
                { project: 'Agent Farm', text: 'a thought with nowhere to sit', at: 1 });
            ok('‼️ a position asked for on an uncoded capture is REPORTED, not swallowed',
                unplaceable.ok && unplaceable.result.code === null
                && /could not be queued/.test(unplaceable.result.note));

            // ---- B-25: `at` counts whether it arrives as 1 or as "1" ----
            // Both forms are real: a JSON request carries the number, the CLI's
            // `at=1` shorthand coerces to one too, and a hand-written arg is
            // text. The op read it through `Number(optStr(…))`, which answers ''
            // for anything that is not a string — so the number, the commonest
            // form, was thrown away under an ok response and four items the user
            // asked for the top of the queue landed at the bottom.
            const asText = await reg.dispatch('projects.backlog.add',
                { project: 'Agent Farm', text: 'typed at the CLI', area: 'P', at: '1' });
            ok('‼️ B-25 — `at` given as TEXT queues at the top, same as the number',
                asText.ok && asText.result.code === 'P-5' && /queued at 1/.test(asText.result.note));
            const headText = await reg.dispatch('projects.backlog.next',
                { project: 'Agent Farm', limit: 5, maxEffort: 'XL' });
            ok('…and it really is the next thing up', headText.ok && headText.result.items[0] === 'P-5');
            const junk = await reg.dispatch('projects.backlog.add',
                { project: 'Agent Farm', text: 'a position nobody can use', area: 'P', at: 'top' });
            ok('‼️ …and an `at` that is not a position is SAID, not swallowed',
                junk.ok && junk.result.code === 'P-6' && /not a queue position/.test(junk.result.note));
            const quiet = await reg.dispatch('projects.backlog.add',
                { project: 'Agent Farm', text: 'no position asked for', area: 'P' });
            ok('…while asking for none says nothing — the note answers a request that missed',
                quiet.ok && quiet.result.code === 'P-7' && !quiet.result.note);

            // ‼️ The queue is the ONE order, and it crosses areas. The file is
            // grouped by heading, so line order can never put a K item ahead of
            // a P one; the 🎯 block can, and it does it without moving a line.
            const moved = await reg.dispatch('projects.backlog.move',
                { project: 'Agent Farm', code: 'P-2', dir: 'top' });
            ok('projects.backlog.move writes the queue block, not the item',
                moved.ok && moved.result.queue[0] === 'P-2'
                && /## 🎯 Queue/.test(readBacklog())
                && /- \[ \] P-2 second thing \[efor:: XL\]/.test(readBacklog()));
            ok('‼️ …and it writes the WHOLE order, not a head with a tail',
                moved.result.queue.length > 1);
            const afterMove = await reg.dispatch('projects.backlog.next',
                { project: 'Agent Farm', limit: 5, maxEffort: 'XL' });
            ok('…and next reads exactly that order', afterMove.ok && afterMove.result.items[0] === 'P-2');
            // ---- U-24: the parts come to the whole, over the bridge ----
            // P-3 is written as a part of P-1 on the file itself, so what the op
            // is asked to do is the real thing rather than a fixture's promise.
            editBacklog(t => setBacklogFields(t, { code: 'P-3' }, { parent: 'P-1' }));
            const gathered = await reg.dispatch('projects.backlog.gather', { project: 'Agent Farm' });
            ok('projects.backlog.gather answers with the order it wrote',
                gathered.ok && Array.isArray(gathered.result.queue) && gathered.result.queue.length > 1);
            ok('‼️ …and a part really does end up directly behind its whole',
                gathered.result.queue.indexOf('P-3') === gathered.result.queue.indexOf('P-1') + 1);
            ok('…and running it a second time says there was nothing to do',
                /already/.test(((await reg.dispatch('projects.backlog.gather',
                    { project: 'Agent Farm' })).result || {}).note || ''));

            // ---- U-56: ONE part, from the bridge as well as the row's menu ----
            // The gesture only exists because gather moves rows the user was not
            // asking about; the op has to prove it moves exactly one.
            await reg.dispatch('projects.backlog.reorder',
                { project: 'Agent Farm', code: 'P-3', dest: 'P-2', place: 'before' });
            const orderNow = () => {
                const s = parseBacklog(readBacklog());
                return queueOrder(s.items, s.queue);
            };
            const before = orderNow();
            const under = await reg.dispatch('projects.backlog.under',
                { project: 'Agent Farm', code: 'P-3' });
            ok('‼️ projects.backlog.under puts the part directly behind its whole',
                under.ok && under.result.queue.indexOf('P-3')
                === under.result.queue.indexOf('P-1') + 1);
            ok('…and moves NOTHING else — every other entry keeps its order',
                under.result.queue.filter(c => c !== 'P-3').join()
                === before.filter(c => c !== 'P-3').join());
            ok('…running it again says it is already there',
                /already under/.test(((await reg.dispatch('projects.backlog.under',
                    { project: 'Agent Farm', code: 'P-3' })).result || {}).note || ''));
            const noParent = await reg.dispatch('projects.backlog.under',
                { project: 'Agent Farm', code: 'P-2' });
            ok('‼️ an item that belongs to nothing is REFUSED, not moved to the top',
                !noParent.ok && /not part of anything/.test(noParent.error));
            const noCode = await reg.dispatch('projects.backlog.under', { project: 'Agent Farm' });
            ok('…and it will not guess which item you meant',
                !noCode.ok && /pass `code`/.test(noCode.error));

            // ---- U-60: parked by hand, over the bridge ----
            // The point of the op is what it takes OFF the table, so the test is
            // not "did the mark appear" but "did next stop offering it".
            {
                const held = await reg.dispatch('projects.backlog.hold',
                    { project: 'Agent Farm', code: 'P-2' });
                ok('‼️ projects.backlog.hold parks an item with a bare ⛔',
                    held.ok && held.result.onHold === true && /- \[ \] P-2 [^\n]*⛔/.test(readBacklog()));
                ok('…and the checkbox does not move — a held item is still open',
                    /- \[ \] P-2 second thing/.test(readBacklog()));
                const without = await reg.dispatch('projects.backlog.next',
                    { project: 'Agent Farm', limit: 9, maxEffort: 'XL' });
                ok('…and "what is next" stops offering it',
                    without.ok && without.result.items.indexOf('P-2') < 0);
                const off = await reg.dispatch('projects.backlog.hold',
                    { project: 'Agent Farm', code: 'P-2', on: false });
                ok('…pressing it again takes the hold off and leaves the line otherwise alone',
                    off.ok && off.result.onHold === false
                    && /- \[ \] P-2 second thing \[efor:: XL\]\s*$/m.test(readBacklog()));
                const back = await reg.dispatch('projects.backlog.next',
                    { project: 'Agent Farm', limit: 9, maxEffort: 'XL' });
                ok('…and it is back in the queue where it was',
                    back.ok && back.result.items.indexOf('P-2') >= 0);
                // Starting it is a decision, so it ends the hold in the same write.
                await reg.dispatch('projects.backlog.hold', { project: 'Agent Farm', code: 'P-2' });
                const started = await reg.dispatch('projects.backlog.check',
                    { project: 'Agent Farm', code: 'P-2', state: 'doing' });
                ok('‼️ starting a parked item takes the hold off with it',
                    started.ok && started.result.state === 'doing'
                    && !/⛔/.test(readBacklog()) && /the ⛔ hold came off/.test(started.result.note || ''));
                await reg.dispatch('projects.backlog.check', { project: 'Agent Farm', code: 'P-2', state: 'open' });
                const noAimHold = await reg.dispatch('projects.backlog.hold', { project: 'Agent Farm' });
                ok('…and a hold with nothing to aim at is refused',
                    !noAimHold.ok && /which item/.test(noAimHold.error));
            }

            const emptied = await reg.dispatch('projects.backlog.queue',
                { project: 'Agent Farm', codes: [] });
            ok('emptying the queue leaves no heading behind',
                emptied.ok && !emptied.result.queue.length && !/🎯/.test(readBacklog()));

            const closed = await reg.dispatch('projects.backlog.check',
                { project: 'Agent Farm', code: 'P-1' });
            ok('projects.backlog.check closes the item it was pointed at',
                closed.ok && closed.result.state === 'done');
            ok('‼️ …and the line keeps its code, its tag, its icon and its field',
                /- \[x\] P-1 first thing #bug ⏫ \[efor:: S\]/.test(readBacklog()));
            const noAim = await reg.dispatch('projects.backlog.check', { project: 'Agent Farm' });
            ok('…and a check with nothing to aim at is refused',
                !noAim.ok && /which item/.test(noAim.error));

            const archived = await reg.dispatch('projects.backlog.archive',
                { project: 'Agent Farm', olderThanDays: 7 });
            ok('M-4: projects.backlog.archive dispatches an age threshold and moves only eligible work',
                archived.ok && archived.result.moved === 1 && archived.result.olderThanDays === 7
                && /## 🗄 Archive[\s\S]*P-1/.test(readBacklog()));
            const badAge = await reg.dispatch('projects.backlog.archive',
                { project: 'Agent Farm', olderThanDays: -1 });
            ok('…and the bridge refuses an invalid threshold instead of changing the file',
                !badAge.ok && /whole number/.test(badAge.error));

            // ‼️ AND IT REFUSES TO BE AIMED AT ONE ITEM, RATHER THAN IGNORING THE AIM.
            // Measured in the audit (A-25): a session cancelled X-179 by calling this
            // op with `{ code, note }`, got `ok: true` back because both arguments were
            // silently dropped, and reported the cancellation in its closing summary and
            // its handover note. The item was still open. The next session paid for it.
            // An op that answers ok to work it did not do is the failure this whole
            // suite exists to catch, so the refusal is pinned here and in the source.
            const beforeAimed = readBacklog();
            const aimed = await reg.dispatch('projects.backlog.archive',
                { project: 'Agent Farm', code: 'P-2', note: 'cancelled because…' });
            ok('‼️ archive REFUSES a single-item aim instead of dropping it and answering ok',
                !aimed.ok && /takes no aim at one/.test(aimed.error));
            ok('…and it names the arguments it would have ignored, so the caller can see the trap',
                !aimed.ok && /code/.test(aimed.error) && /note/.test(aimed.error));
            ok('…and it names the op that DOES do that job, because the caller still needs it done',
                !aimed.ok && aimed.error.includes('projects.backlog.check'));
            ok('…and the file is untouched by the refusal', readBacklog() === beforeAimed);

            {
                const extSrc = fs.readFileSync(
                    path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
                const at = extSrc.indexOf("op: 'projects.backlog.archive',");
                ok('…and the REAL op carries the same guard, not just this harness',
                    at > 0 && extSrc.slice(at, at + 4000)
                        .includes("const aimed = ['code', 'item', 'line', 'note']"));
                ok('…and its contract SAYS it refuses, so nobody has to run it to find out',
                    /takes no aim at one item/i.test(extSrc.slice(at, at + 4000)));
            }

            // ---- the track: a code joined to the turns it was worked in ----
            // Same reasoning as above — the real ops need the project store and
            // the live monitor. What is exercised here is the contract shape an
            // agent codes against, on the pure module underneath it.
            const ledger = path.join(dir, '90_Archive', '_tracks', 'backlog-track.jsonl');
            reg.register([
                {
                    op: 'projects.track',
                    describe: 'record work on a code. args: project, code, event?, note?',
                    handler: a => {
                        const code = argStr(a, 'code').toUpperCase();
                        need(BACKLOG_CODE.test(code), `"${code}" is not a backlog code`);
                        const event = optStr(a, 'event') || 'touch';
                        need(TRACK_EVENTS.includes(event), 'unknown event');
                        const rec = {
                            code, event, ts: Date.now(), by: 'agent',
                            session: '9c4d1f2a-bbbb-cccc', turn: 3, agent: 'developer',
                            ...(optStr(a, 'note') ? { note: optStr(a, 'note') } : {})
                        };
                        appendTrack(ledger, rec);
                        return { code, event, turn: rec.turn, uncertain: null };
                    }
                },
                {
                    op: 'projects.tracks',
                    describe: 'a code\'s whole track. args: project, code?',
                    handler: a => {
                        const records = readTrackFile(ledger);
                        const codes = optStr(a, 'code')
                            ? [optStr(a, 'code').toUpperCase()] : trackedCodes(records);
                        return {
                            events: records.length,
                            items: codes.map(c => {
                                const s = summarizeCode(c, records);
                                return {
                                    code: c, turns: s.turns, stamp: closingStamp(s) || null,
                                    sessions: s.runs.map(r => ({ session: r.session, turns: r.turns }))
                                };
                            })
                        };
                    }
                }
            ]);

            const touched = await reg.dispatch('projects.track',
                { project: 'Agent Farm', code: 'P-2', event: 'touch', note: 'root cause not found' });
            ok('projects.track records a turn that did NOT finish the item',
                touched.ok && touched.result.event === 'touch');
            await reg.dispatch('projects.track', { project: 'Agent Farm', code: 'P-2', event: 'done' });
            const track = await reg.dispatch('projects.tracks', { project: 'Agent Farm', code: 'P-2' });
            ok('projects.tracks gives the session and the turns back, not a summary',
                track.ok && track.result.items[0].sessions[0].turns.join() === '3');
            ok('…and the closing stamp, which is what goes on the backlog line',
                track.result.items[0].stamp === '9c4d1f2a#3');
            const notACode = await reg.dispatch('projects.track',
                { project: 'Agent Farm', code: 'something I noticed' });
            ok('‼️ an uncoded capture is refused rather than tracked under a made-up handle',
                !notACode.ok && /not a backlog code/.test(notACode.error));

            // ---- X-36 (V2): the correction op, on the same pure module ----
            //
            // The shape an agent codes against: point at a round, hand over the
            // words, and the ledger gains a RECORD rather than losing one.
            const reopenTs = Date.now() - 60_000;
            appendTrack(ledger, {
                code: 'P-2', event: 'reopen', ts: reopenTs, by: 'panel',
                prevText: 'ilk turda istenen buydu ve cümle burada…', prevCut: true
            });
            reg.register([{
                op: 'projects.track.restore',
                describe: 'give a round back the wording the old ceiling cut. args: project, code, round?/ts?, text?, fromBacklog?',
                handler: a => {
                    const code = argStr(a, 'code').toUpperCase();
                    const sum = summarizeCode(code, readTrackFile(ledger));
                    need(sum.rounds.length, `${code} has no recorded round to restore`);
                    const target = typeof a.ts === 'number'
                        ? sum.rounds.find(r => r.ts === a.ts)
                        : sum.rounds[(typeof a.round === 'number' ? a.round : sum.rounds.length) - 1];
                    need(target, 'no such round');
                    need(!target.prevRestored, 'that round has already been restored');
                    const text = String(a.text ?? '').replace(/\s+/g, ' ').trim();
                    need(text, 'pass the words as `text`');
                    appendTrack(ledger, {
                        code, event: 'touch', ts: Date.now(), by: 'agent',
                        restoresTs: target.ts, prevText: text,
                        note: `restored the wording of round ${sum.rounds.indexOf(target) + 1}`
                    });
                    return { code, round: sum.rounds.indexOf(target) + 1, was: (target.prevText || '').length, now: text.length };
                }
            }]);
            const whole = 'ilk turda istenen buydu ve cümle burada bitiyordu, hepsi bu.';
            const fixed = await reg.dispatch('projects.track.restore',
                { project: 'Agent Farm', code: 'P-2', round: 1, text: whole });
            ok('projects.track.restore completes the round it points at',
                fixed.ok && fixed.result.round === 1 && fixed.result.now > fixed.result.was);
            const after = summarizeCode('P-2', readTrackFile(ledger));
            ok('‼️ …by ADDING a record — every reader sees the whole wording',
                after.rounds[0].prevText === whole && after.rounds[0].prevRestored === true);
            ok('‼️ …and the reopen line itself was never rewritten: the ledger is append-only',
                readTrackFile(ledger).filter(r => r.event === 'reopen' && r.ts === reopenTs)[0].prevCut === true);
            const twice = await reg.dispatch('projects.track.restore',
                { project: 'Agent Farm', code: 'P-2', round: 1, text: whole + ' (yine)' });
            ok('…and it refuses to do it twice rather than piling corrections up',
                !twice.ok && /already been restored/.test(twice.error));

            // ---- P-14 (V3): the same repair, for a CLOSING NOTE -------------
            //
            // The other text the ledger used to cut. A note written under the
            // old 300-character ceiling ends mid-sentence, and it is the one
            // line in this record a person reads three months later.
            const closeTs = Date.now() - 30_000;
            appendTrack(ledger, {
                code: 'P-3', event: 'done', ts: closeTs, by: 'agent', session: '9c4d1f2a',
                note: 'düzeltildi: arama artık büyük/küçük harfe takılmıyor ve'
            });
            const wholeNote = 'düzeltildi: arama artık büyük/küçük harfe takılmıyor ve '
                + 'aynı normalizasyon filtrelerde de kullanılıyor; ileride yeni bir arama '
                + 'yüzeyi eklenirse aynı yardımcıdan geçmesi gerekir.';
            appendTrack(ledger, {
                code: 'P-3', event: 'touch', ts: Date.now(), by: 'agent',
                restoresTs: closeTs, restoresNote: true, note: wholeNote
            });
            const p3 = summarizeCode('P-3', readTrackFile(ledger));
            ok('‼️ P-14: a closing note cut by the old ceiling is completed by a record beside it',
                p3.closed.note === wholeNote && p3.closed.noteRestored === true);
            ok('‼️ …and the closing record itself was never rewritten',
                /^düzeltildi: arama artık büyük\/küçük harfe takılmıyor ve$/.test(
                    readTrackFile(ledger).filter(r => r.event === 'done' && r.ts === closeTs)[0].note));
            ok('…the session row reads the repaired note too, so the two cannot disagree',
                p3.runs[0].events.some(e => e.note === wholeNote));
        }

        // ---- and extension.ts really registers every one of them ----
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        for (const op of ['projects.doc.list', 'projects.doc.read', 'projects.doc.write',
            'projects.log', 'projects.plan', 'projects.plan.add', 'projects.plan.check',
            'projects.decision.add', 'projects.deliver', 'projects.people.set',
            'projects.backlog', 'projects.backlog.next', 'projects.backlog.add',
            'projects.backlog.check', 'projects.backlog.set', 'projects.backlog.code',
            'projects.backlog.move', 'projects.backlog.reorder', 'projects.backlog.archive',
            'projects.backlog.promote', 'projects.backlog.open',
            'projects.backlog.queue', 'projects.backlog.tidy', 'projects.backlog.gather',
            // U-56 — the child-side twin of gather.
            'projects.backlog.under',
            'projects.track', 'projects.tracks', 'projects.tracks.backfill',
            // X-36 (V2) — a round whose wording the old ceiling cut can be given
            // it back, as a correction record and never as an edit.
            'projects.track.restore',
            // P-14 (V3) — and the twin of it, for a closing note the old
            // 300-character ceiling cut off mid-sentence.
            'projects.track.note.restore',
            // P-5 — the Track tab's ↻ button, and therefore an agent's too.
            'projects.backloglog',
            // B-2 — the fleet page can MAKE an agent, so the bridge can too.
            'agents.create', 'agents.roots', 'agents.pack.import']) {
            ok(`extension.ts registers ${op}`, src.includes(`op: '${op}'`));
        }
        // ‼️ B-2 — THE THREE PAGES THAT COULD WRITE AND WHOSE BRIDGE COULD ONLY
        // READ. Each op is registered in its own module (so a fixture registry
        // can dispatch it), and each module is wired into extension.ts.
        for (const [mod, ops] of [
            ['toolboxBridge', ['toolbox.install', 'toolbox.copy', 'toolbox.remove', 'toolbox.enable']],
            ['studioBridge', ['studio.productions', 'studio.assets', 'studio.production.new',
                'studio.scene.status', 'studio.assign', 'studio.triage', 'studio.rerun', 'studio.export']]
        ]) {
            const text = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', `${mod}.ts`), 'utf8');
            for (const op of ops) { ok(`${mod} registers ${op}`, text.includes(`op: '${op}'`)); }
        }
        ok('…and extension.ts wires the Studio ops in', src.includes('registerStudioOps(bridge'));
        const nextBlock = src.slice(src.indexOf("op: 'projects.backlog.next'"),
            src.indexOf("op: 'projects.backlog.next'") + 2600);
        ok('‼️ backlog.next\'s contract defines top N as the user\'s queue with no hidden effort filter',
            /Top N/.test(nextBlock) && /no silent effort filter/.test(nextBlock)
            && /no ceiling when omitted/.test(nextBlock));
        const blCheckBlock = src.slice(src.indexOf("op: 'projects.backlog.check'"),
            src.indexOf("op: 'projects.backlog.check'") + 2900);
        ok('‼️ backlog.check\'s contract states the one-character promise',
            /EXACTLY ONE CHARACTER/.test(blCheckBlock));
        // 4000, not 2600: the op grew a guard and a comment that says WHY it
        // refuses a single-item aim, and the window has to still reach the
        // evidence at the bottom of the handler. The next op begins at +4034,
        // so this reads the archive op and nothing else — measured, not padded.
        const blArchiveBlock = src.slice(src.indexOf("op: 'projects.backlog.archive'"),
            src.indexOf("op: 'projects.backlog.archive'") + 4000);
        ok('M-4: the real archive op catalogues and uses the age threshold',
            /olderThanDays/.test(blArchiveBlock) && /backlogClosedAt/.test(blArchiveBlock));
        ok('…and tells the caller that closing an item is also RECORDED, with a note it can write',
            /track ledger/.test(blCheckBlock) && /note\?/.test(blCheckBlock));
        const trackBlock = src.slice(src.indexOf("op: 'projects.track'"),
            src.indexOf("op: 'projects.track'") + 2600);
        ok('‼️ track\'s contract admits the session is INFERRED and names every doubt code',
            /INFERRED/.test(trackBlock)
            && ['multi', 'stale', 'turn'].every(d => trackBlock.includes(d)));
        ok('…and says why `touch` exists, since a log of endings is the obvious wrong design',
            /not finished/.test(trackBlock));
        const logBlock = src.slice(src.indexOf("op: 'projects.backloglog'"),
            src.indexOf("op: 'projects.backloglog'") + 2200);
        ok('‼️ backloglog\'s contract promises the human\'s own lines survive the rebuild',
            /HUMAN/.test(logBlock) && /untouched/.test(logBlock));
        ok('…and says it notices a box ticked outside Agent Farm rather than leaving a silent gap',
            /outside/.test(logBlock) && /silent gaps/.test(logBlock));
        const blOpenBlock = src.slice(src.indexOf("op: 'projects.backlog.open'"),
            src.indexOf("op: 'projects.backlog.open'") + 2600);
        ok('‼️ backlog.open promises the line is resolved from the CODE at call time',
            /resolved from the CODE at call time/.test(blOpenBlock));
        ok('…and says which modes can honour a line and which cannot',
            /Advanced URI/.test(blOpenBlock) && /\{line\}/.test(blOpenBlock));
        const moveBlock = src.slice(src.indexOf("op: 'projects.backlog.move'"),
            src.indexOf("op: 'projects.backlog.move'") + 2600);
        ok('‼️ backlog.move\'s contract promises the code does not change',
            /THE CODE DOES NOT CHANGE/.test(moveBlock));
        ok('…and says it moves the QUEUE and not the file, which is the whole design',
            /NOT IN THE FILE/.test(moveBlock));
        ok('…and offers both ends and a distance, not just the two steps',
            /up\|down\|top\|bottom/.test(moveBlock) && /by\?/.test(moveBlock));
        const reorderBlock = src.slice(src.indexOf("op: 'projects.backlog.reorder'"),
            src.indexOf("op: 'projects.backlog.reorder'") + 2600);
        ok('‼️ backlog.reorder says it has NO area rule, since that was the old surprise',
            /no area rule/.test(reorderBlock) && /never a line/.test(reorderBlock));
        const gatherBlock = src.slice(src.indexOf("op: 'projects.backlog.gather'"),
            src.indexOf("op: 'projects.backlog.gather'") + 2600);
        ok('‼️ backlog.gather says the heads do not move, which is the promise that makes it repeatable',
            /heads do not move/.test(gatherBlock));
        ok('…and names the one it is most confused with — this one moves no line',
            /moves no line/.test(gatherBlock) && /backlog\.tidy/.test(gatherBlock));
        ok('…and offers the whole queue or one family', /code\? \(one family/.test(gatherBlock));
        const tidyBlock = src.slice(src.indexOf("op: 'projects.backlog.tidy'"),
            src.indexOf("op: 'projects.backlog.tidy'") + 2600);
        ok('‼️ backlog.tidy promises the queue survives it, which is why it is safe',
            /a code does not care which line it is on/.test(tidyBlock));
        ok('…and admits the one thing it refuses to touch',
            /PROSE between its items/.test(tidyBlock));
        const checkBlock = src.slice(src.indexOf("op: 'projects.plan.check'"),
            src.indexOf("op: 'projects.plan.check'") + 2600);
        ok('‼️ plan.check\'s contract states the one-character promise and the ✅ it will not write',
            /EXACTLY ONE CHARACTER/.test(checkBlock) && /done-date/.test(checkBlock));
        const writeBlock = src.slice(src.indexOf("op: 'projects.doc.write'"),
            src.indexOf("op: 'projects.doc.write'") + 2600);
        ok('…and doc.write\'s contract says how to replace a file safely',
            /expectMtime/.test(writeBlock) && /append/.test(writeBlock));
        ok('‼️ …and the real op tells an unreadable document apart from an absent one',
            /existing\.missing === true/.test(writeBlock));
        ok('‼️ plan.check\'s contract says a line and a text together are a CHECK',
            /goes stale/.test(checkBlock));
        ok('the ops call the shared guarded path rather than writing files themselves',
            /editProjectDoc\(folder,/.test(src) && !/fs\.writeFileSync\(.*roles\.plan/.test(src));

        // ---- S-12: the capture box's position picker reaches the bridge too ----
        // ‼️ To the NEXT op, not a fixed number of characters: a window that has
        // to be widened every time a contract gains a sentence is a test that
        // fails for the wrong reason, and this one already did.
        const addAt = src.indexOf("op: 'projects.backlog.add'");
        const addBlock = src.slice(addAt, src.indexOf("op: 'projects.backlog.check'", addAt));
        ok('‼️ backlog.add takes a queue position, and its contract says an area is needed',
            /at\? \(1-based queue position/.test(addBlock) && /uncoded capture has none/.test(addBlock));
        ok('…and it places inside the SAME guarded write, not a second one',
            /placeInQueue\(res\.text as string, res\.code, at\)/.test(addBlock));

        // ---- B-25: a numeric arg is read with `optNum`, and the shape that
        // silently ate one is banned from the source so it cannot come back.
        //
        // `optStr` answers '' for anything that is not a string, so
        // `Number(optStr(args, 'at'))` is 0 for every number a caller sends —
        // and 0 means "no position asked for". The op answered ok and queued
        // the item at the bottom. Nothing errored; there was nothing to read.
        // Five sites carried the shape (`at`, two `limit`s, `fps`,
        // `clipSeconds`), which is why this is a pattern rather than a fix.
        ok('‼️ backlog.add reads `at` with optNum — a number and its text both count',
            /optNum\(args, 'at', 0\)/.test(addBlock) && !/Number\(optStr\(args, 'at'/.test(addBlock));
        ok('…and an `at` it cannot honour comes back said out loud, not dropped',
            /atGiven/.test(addBlock) && /is not a queue position/.test(addBlock));
        const srcFiles = (function walk(dir) {
            return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
                const p = path.join(dir, e.name);
                return e.isDirectory() ? walk(p) : (e.name.endsWith('.ts') ? [p] : []);
            });
        })(path.join(__dirname, '..', 'src'));
        const launders = [];
        for (const f of srcFiles) {
            fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((ln, i) => {
                const t = ln.trim();
                // Comments are prose about the trap — the guard is about code.
                if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) { return; }
                if (/(Number|parseInt|parseFloat)\s*\(\s*(opt|arg)Str\s*\(/.test(ln)) {
                    launders.push(path.basename(f) + ':' + (i + 1));
                }
            });
        }
        ok('‼️ …and NO source line launders a number through optStr — it would eat every one'
            + (launders.length ? ' (' + launders.join(', ') + ')' : ''),
            launders.length === 0);

        // ---- K-8: an item an agent wrote says so, and says whose idea it was --
        //
        // ‼️ The failure this stops is silent and permanent: an agent's own
        // suggestion filed as if the user had decided it. So the stamp is not
        // opt-in, and the contract has to state the default out loud — an agent
        // that forgets `origin` must at least be wrong in the direction that
        // under-claims agreement rather than over-claiming it.
        ok('‼️ backlog.add stamps WHO wrote the line, both ways',
            /BACKLOG_ORIGIN_TAGS\[/.test(addBlock)
            && /optStr\(args, 'origin'\) === 'user' \? 'user' : 'agent'/.test(addBlock));
        ok('…and its contract says which tag is which, and that the default is byAI',
            /#byAI/.test(addBlock) && /#byREQ/.test(addBlock)
            && /origin\? \(agent\|user, default agent\)/.test(addBlock));

        // ---- X-287: the caller's tags are read, and a set says what took ----
        //
        // ‼️ `tags` is the word on the line and the word a caller reaches for;
        // it was not read, so `backlog.add` dropped the caller's tags and kept
        // only the stamp, and `backlog.set tags=…` answered ok having written
        // nothing. A silent success is the failure Principle 1 names.
        ok('‼️ backlog.add reads tags under either name, beside the stamp',
            /listArg\(args, 'kinds', 'kind', 'tags', 'tag'\)\s*\.concat\(BACKLOG_ORIGIN_TAGS/.test(addBlock)
            && /kinds\?\/tags\?/.test(addBlock));
        const bsetAt = src.indexOf("op: 'projects.backlog.set'");
        const bsetBlock = src.slice(bsetAt, src.indexOf("op: 'projects.backlog.code'", bsetAt));
        ok('‼️ backlog.set reads tags under either name',
            /\['kinds', 'kind', 'tags', 'tag'\]\.some\(has\)/.test(bsetBlock));
        ok('‼️ …answers with the axes asked and the axes that really changed',
            /backlogAxesChanged\(before, after\)/.test(bsetBlock)
            && /asked, updated,/.test(bsetBlock) && /asked.*updated/.test(bsetBlock.slice(0, bsetBlock.indexOf('handler:'))));
        ok('‼️ …refuses a call that names no axis, and an unknown priority or effort',
            /need\(asked\.length > 0, `nothing to set/.test(bsetBlock)
            && /need\(BACKLOG_PRIORITIES\.includes\(p\)/.test(bsetBlock)
            && /need\(BACKLOG_EFFORTS\.includes\(e\)/.test(bsetBlock));
        ok('…and says so when nothing changed rather than answering a bare ok',
            /nothing changed — the item already had these values/.test(bsetBlock));
        ok('…and that an item the user typed themselves carries neither',
            /carry neither/.test(addBlock));

        // ---- X-7: which build was watching, and the comparison that needs ----
        //
        // ‼️ A STAMP WITH NO OP TO READ IT IS NOT A MEASUREMENT. The point of
        // this pair is that "the extension went deaf in version N" stops being
        // an argument and becomes a query, so the op has to exist AND its
        // contract has to name the number that settles it — a rate per hour of
        // ACTIVITY. Compared per calendar hour, a version installed over a quiet
        // weekend looks broken, which is the wrong answer arrived at confidently.
        const verAt = src.indexOf("op: 'live.versions'");
        ok('live.versions is registered on the bridge', verAt > 0);
        const verBlock = src.slice(verAt, src.indexOf("op: 'sessions.live'", verAt));
        ok('…and its contract points at the rate, not at the totals',
            /perActiveHour/.test(verBlock) && /not per calendar hour/.test(verBlock));
        ok('…and says an unstamped line is UNKNOWN rather than attributed',
            /empty `version`/.test(verBlock) && /rather than attributed/.test(verBlock));
        ok('…and it CALLS the monitor rather than re-reading the log itself',
            /live\.versionSpans\(\)/.test(verBlock));
        ok('‼️ and sessions.live carries the builds that watched each session',
            /afVersions: s\.afVersions \?\? \[\]/.test(src));

        // ---- S-11: the saved prompts are readable by an agent, not only by hand ----
        const promptsAt = src.indexOf("op: 'prompts.list'");
        ok('prompts.list is registered on the bridge', promptsAt > 0);
        const promptsBlock = src.slice(promptsAt, promptsAt + 1800);
        ok('…and its describe states the one rule of the file',
            /``` fences/.test(promptsBlock) && /never returned/.test(promptsBlock));
        ok('…and it CALLS the shared reader rather than parsing the file again',
            /readPromptSnippets\(\)/.test(promptsBlock));
        // ‼️ THE READER MUST NEVER WRITE THE SETTING. It used to put '' into
        // settings.json the first time the file was missing, and an explicit ''
        // outranks every default for good — one disconnected drive killed the
        // feature permanently. Which file it is now comes from resolvePromptFile.
        const readerAt = src.indexOf('const readPromptSnippets =');
        const readerBlock = src.slice(readerAt, src.indexOf('const setPromptSnippetsFile', readerAt));
        ok('‼️ the reader settles the file through resolvePromptFile, not the manifest default',
            /resolvePromptFile\(/.test(readerBlock));
        ok('‼️ …and never writes the setting behind the user\'s back',
            !/cfg\(\)\.update\('promptSnippetsFile'/.test(readerBlock));
        ok('a path that has gone is reported as still-yours, not thrown away',
            /nothing has been thrown away/.test(readerBlock));
        ok('prompts.setFile is on the bridge, so choosing the file is not mouse-only',
            /op: 'prompts\.setFile'/.test(src));
        const setAt = src.indexOf("op: 'prompts.setFile'");
        const setBlock = src.slice(setAt, setAt + 1400);
        ok('…it refuses a path that is not there', /need\(!file \|\| fs\.existsSync\(file\)/.test(setBlock));
        ok('…and an empty argument REMOVES the setting (undefined, never \'\')',
            /clean \|\| undefined/.test(src));
        // ‼️ Both doors to "which file?" open the SAME thing: the machine's own
        // picker. Sending somebody to VS Code's settings editor is the
        // extension talking about itself instead of doing the job.
        // M-24 — the picker's three messages are answered in ONE place now
        // (promptSnippetMessage in src/panels/base.ts), because the Tasks form
        // opens the same window and a second copy of the dialog's rules would
        // be a second set of rules.
        const base = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'base.ts'), 'utf8');
        ok('the prompts file is picked with a file dialog',
            /case 'pickPromptSnippets'/.test(base) && /showOpenDialog\(\{/.test(base));
        ok('…and never sends anybody to the settings editor for it',
            !/workbench\.action\.openSettings/.test(base));
        // …and both surfaces that offer the picker really route into it, rather
        // than growing a case of their own again.
        for (const panel of ['consolePanel.ts', 'tasksPanel.ts']) {
            const src2 = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', panel), 'utf8');
            ok(`${panel} answers the picker through the shared handler`,
                /promptSnippetMessage\(/.test(src2) && !/case 'pickPromptSnippets'/.test(src2));
        }

        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }

    // ---------- U-9: an automation takes the same dimensions a task does ----------
    // A schedule is a task that has not happened yet. It could state only its
    // model, so "run the nightly batch on low effort, in the worktree, filed
    // under this project" was sayable for a task and not for the schedule that
    // produces one — on the page AND on the bridge. The rule in
    // `_REF/agentfarm-dev.md` is that the two surfaces move together.
    {
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        // ‼️ TO THE NEXT OP, NEVER A CHARACTER COUNT — the same repair the
        // `tasks.rerun` block above already carries, arrived at the same way.
        // This window was 9k, then 12k, then 20k, then 26k, and each time it was
        // widened because `tasks.add`'s contract had grown past it: a window
        // that stops short does not fail loudly, it silently stops seeing the
        // handler, and every assertion about the handler starts passing by not
        // looking. A number that has to be raised whenever the thing it measures
        // gains a sentence is not a measurement.
        const at = (op) => {
            const start = src.indexOf(`op: '${op}'`);
            if (start < 0) { return ''; }
            const next = src.indexOf("\n            op: '", start + 1);
            return src.slice(start, next < 0 ? src.length : next);
        };

        // ---------- S-31: which run produced which transcript ----------
        // The op exists so a person (or an agent) who knows a run happened and
        // cannot find its session has somewhere to ask. A diagnostic that is
        // only reachable by reading the code is not one.
        const bind = at('sessions.bindings');
        ok('‼️ sessions.bindings is on the bridge, and its contract names the three proofs',
            /declared/.test(bind) && /reported/.test(bind) && /matched/.test(bind));
        ok('…and says what an unattributed transcript means rather than hiding it',
            /doubts/.test(bind) && /guess files a real transcript under the wrong run/.test(bind));
        ok('…and it READS the index rather than re-deriving the matching',
            /index\.launchBindingReport\(\)/.test(bind));
        ok('…filterable to one run and to the ones that have claimed nothing',
            /b\.taskId === want/.test(bind) && /args\.unresolved !== true/.test(bind));
        // ‼️ THE CHAIN, WHICH IS WHAT SIX ORPHANED RETRIES WERE ABOUT. A retry
        // does not carry `fromSchedule`, so read on its own it looks like
        // something a person typed — and the six limit-retries of one scheduled
        // run each came out as an unrelated row with no schedule name on it.
        // S-37: the walk is over the live list AND the archive (`pool`), because
        // a chain whose origin has already been filed still leads to the
        // schedule that owns it — the live list alone forgets it.
        ok('‼️ a retry inherits the launcher of the run it is a retry OF',
            /for \(let hop = 0; hop < 20 && origin\.retryOf; hop\+\+\)/.test(src)
            && /pool\.find\(x => x\.id === origin\.retryOf\)/.test(src));
        ok('…and the pool a binding is built from includes the archive, not just the live list',
            /taskManager\.archivedTasks\(\)\.filter\(t => !live\.has\(t\.id\)\)/.test(src));
        ok('…and the walk cannot loop on a hand-edited store',
            /if \(!up \|\| up\.id === origin\.id\) \{ break; \}/.test(src));

        // ---------- M-12 + M-10: what a run managed, and what a retry IS ------
        // Both belong on the wire because both change what a CALLER should do
        // next: an agent polling `tasks.list` and seeing `failed` used to have
        // no way to tell "it never started" from "it was cut off half-way", and
        // resending the work is right for one and destructive for the other.
        // ‼️ B-21 — the row is built ONCE (`taskRows`) and read twice: tasks.list
        // answers with it and tasks.export writes it as a document. So what is
        // pinned is the ROW, not whichever op happens to return it.
        const list = (() => {
            const start = src.indexOf('const taskRows = (): Record<string, unknown>[] =>');
            const end = src.indexOf('\n    }));', start);
            return start < 0 ? '' : src.slice(start, end < 0 ? src.length : end);
        })();
        ok('‼️ tasks.list separates a run that never started from one that was cut off',
            /failurePhase: t\.failurePhase \?\? null/.test(list)
            && /didWork: t\.failurePhase === 'interrupted'/.test(list));
        ok('…and gives the conversation the run PRODUCED, not only the one it continued',
            /runSession: t\.runSessionId \?\? null/.test(list)
            && /continuationOf: t\.continuationOf \?\? null/.test(list));
        ok('…and tasks.list is still the op that hands that row over',
            /handler: \(\) => taskRows\(\)/.test(at('tasks.list')));
        const get2 = at('tasks.get');
        ok('‼️ tasks.get carries the evidence, not only the verdict',
            /progress: task\.progress \?\? null/.test(get2)
            && /failureSummary: task\.status === 'failed'/.test(get2));
        ok('…and its contract says "unknown" is not "nothing happened"',
            /never to be\s*\/\/\s*read as "nothing happened"/.test(get2)
            || /is never to be read as "nothing happened"/.test(get2.replace(/\s+/g, ' ')));
        const addC = at('tasks.add');
        ok('‼️ tasks.add\'s contract states the two behaviours and what decides between them',
            /"simple" \(the default/.test(addC) && /"smart" = a retry after/.test(addC)
            && /M-12\\'s `failurePhase`/.test(addC));
        ok('…and that an unbound transcript is HELD rather than repeated',
            /unknownProgressFallback/.test(addC) && /visibly HELD until the evidence lands/.test(addC));
        ok('…and that a schedule\'s next ordinary firing never inherits a conversation',
            /never inherits a conversation/.test(addC));

        const sched = at('schedules.add');
        // X-106 - the reader is now reached through `runDims`, the ONE place the
        // route resolver is attached to it (whether a route EXISTS is an adapter
        // question core/bridge.ts cannot answer, so it arrives as a callback).
        // Same guarantee, one hop: what is measured is that the door does not
        // read its own dimensions.
        ok('schedules.add takes the run dimensions', /runDims\(args\)/.test(sched));
        ok('…and its contract names them', /effort\?/.test(sched) && /permissionMode\?/.test(sched)
            && /workDir\?/.test(sched) && /priority\?/.test(sched) && /project\?/.test(sched));
        ok('…and says why a project has to be DECLARED on an automation',
            /nobody looking/.test(sched));
        // ‼️ X-264 — a `once` schedule IS its moment. The parser took a number
        // only, so the documented "YYYY-MM-DD HH:MM" arrived, was dropped, and
        // what was kept was a schedule that is enabled, listed and can never be
        // due. The guard belongs on the door, where the caller can still fix it.
        ok('‼️ schedules.add refuses a once schedule with no readable moment',
            /A once schedule needs onceAt/.test(sched));
        ok('…and its contract states the form it accepts',
            /onceAt\? \("YYYY-MM-DD HH:MM" or epoch ms/.test(sched));

        // The page can make a trigger and a template now, so an agent can too —
        // in the same commit, which is the whole rule.
        ok('‼️ triggers.add exists', /op: 'triggers\.add'/.test(src));
        const trig = at('triggers.add');
        // ‼️ `runDims(args, { mode })` — a trigger states the mode its run will
        // take, so it hands the reader one more thing than a task does. The
        // exact call, because the looser pattern this line used to carry was
        // being satisfied by a NEIGHBOURING op's text while the window was a
        // character count: the assertion held without ever reaching this block.
        ok('…and takes the same dimensions, through the one reader',
            /\brunDims\(args, \{ mode \}\)/.test(trig));
        ok('…refuses a watch trigger with nothing to watch',
            /A watch trigger needs watch/.test(trig));
        // ‼️ …and a path that is not there, which used to install happily and
        // then never fire.
        ok('…and refuses a watch path that does not exist',
            /Watch path does not exist/.test(trig));
        ok('…and mints a webhook token rather than saving a URL nobody can call',
            /newId\(\) \+ newId\(\)/.test(trig));
        ok('templates.add and templates.list exist',
            /op: 'templates\.add'/.test(src) && /op: 'templates\.list'/.test(src));

        // The dimensions are read ONE way, or the form and the bridge drift.
        const bridge = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'bridge.ts'), 'utf8');
        ok('there is one reader for the run dimensions',
            /export function bridgeRunDimensions/.test(bridge));
        ok('…"project" on the wire is "projectId" in the store',
            /out\.projectId = project/.test(bridge));
        ok('…and an absent field is left out, never written as an empty flag',
            /if \(v\) \{ out\[k\] = v; \}/.test(bridge));

        // ---------- M-7: the one ceiling a run may be told to walk past ----------
        // The page offers "run it even when the daily budget is spent" on a
        // task, a schedule and a trigger. An agent asked to set the morning
        // report up so the budget cannot stop it has to be able to say the same
        // word, and to READ IT BACK — a round trip that dropped it would quietly
        // undo a waiver the user set on purpose, and the run would not happen.
        ok('‼️ the budget waiver is a dimension like the rest, read in the one reader',
            /if \(args\.ignoreBudget === true\) \{ out\.ignoreBudget = true; \}/.test(bridge));
        ok('…and it survives the way back out, so a round trip cannot drop it',
            /ignoreBudget: !!o\.ignoreBudget/.test(bridge));
        const add = at('tasks.add');
        ok('…tasks.add takes it too', /args\.ignoreBudget === true \? \{ ignoreBudget: true \}/.test(add));
        ok('‼️ …and its contract says what it does NOT lift',
            /does NOT lift the 5-hour quota guard/.test(add));
        ok('‼️ …and the caller is told whether the run actually STARTED, not just what it is called',
            /const started = args\.start !== false \? taskManager\.startTask\(task\)/.test(add)
            && /heldBy: started \? null : \(task\.deferredReason/.test(add));

        // ---------- M-3: what happens if it FAILS, on the bridge too ----------
        // The page can set it on a task, a schedule and a trigger, so the same
        // words have to work here or the two surfaces disagree about a run that
        // then does not happen. Same reader, same clamp, same three states.
        ok('‼️ the retry policy is a dimension like the rest, read in the one reader',
            /const retry = normalizeRetry\(args\.retry\);/.test(bridge));
        ok('…and it survives the way back out, so a round trip cannot drop it',
            /retry: o\.retry \?\? null/.test(bridge));
        ok('‼️ …and an ABSENT policy reads back as the default rather than as an object — '
            + 'writing it back resolved would freeze a setting the user can still change',
            /the user\\'s default \(agentFarm\.taskRetry\)/.test(bridge));
        ok('tasks.add takes it, clamped by the same function the form uses',
            /normalizeRetry\(args\.retry\)/.test(add));
        // "the session/usage limit", not "the Claude session limit": M-10 taught
        // `isLimitFailure` the other three engines' words, so a policy of
        // when:"limit" is no longer a statement about Claude alone.
        ok('‼️ …and its contract says which failures it is about, and that omitting it '
            + 'is not the same as switching it off',
            /only when the session\/usage limit was hit/.test(add)
            && /is a different statement from/.test(add));
        ok('…and the answer says what the policy resolved to today',
            /retryPolicy: describeRetry\(task\.retry/.test(add));

        // ---------- M-8: what happened to a run, and where a deleted one went ----
        const get = at('tasks.get');
        ok('‼️ tasks.get returns the run\'s own record, not only its last reason',
            /events: task\.events \?\? \[\]/.test(get) && /Read `events` before concluding/.test(get));
        const del = at('tasks.delete');
        ok('‼️ a deleted row is FILED, and the op says so rather than promising "permanently"',
            /filedIn: taskManager\.historyDir/.test(del) && !/permanently/.test(del));
        const hist = at('tasks.history');
        ok('‼️ …and the archive can be READ, which is what "where do I look at a deleted task" needs',
            /const month = optStr\(args, 'month'\)/.test(hist)
            && /prompt: t\.prompt, events: t\.events \?\? \[\]/.test(hist));
        // ‼️ M-8 (reopened) — and it reads it through the ONE reader. It parsed
        // the file itself, so an id the archive holds twice (delete → Undo →
        // delete) came back twice here and once everywhere else.
        ok('‼️ …through the same reader the page and the statistics use, so an id filed twice is one run',
            /taskManager\.archivedTasks\(\[month\]\)/.test(hist)
            && !/JSON\.parse\(line\)/.test(hist));
        const histOpen = at('tasks.historyOpen');
        ok('‼️ M-9 — and the archive has a SURFACE an agent can open, not just JSON',
            /TasksPanel\.showArchive\(tasksDeps, month\)/.test(histOpen)
            && /taskManager\.archivedMonths/.test(histOpen));
        ok('…and it refuses a month nothing was filed in, saying which ones exist',
            /months\.includes\(month\)/.test(histOpen) && /months held/.test(histOpen));

        // ‼️ And the commands that used to ask in boxes now open the form.
        for (const cmd of ['addSchedule', 'editSchedule', 'addTrigger', 'editTrigger', 'renameWorkflow']) {
            const i = src.indexOf(`registerCommand('agentfarm.${cmd}'`);
            const body = src.slice(i, src.indexOf('vscode.commands.registerCommand(', i + 30));
            ok(`agentfarm.${cmd} opens the page form, not a dialog chain`,
                /TasksPanel\.composePlan\(/.test(body)
                && !/showInputBox/.test(body) && !/showQuickPick/.test(body));
        }
    }

    // ---------- ‼️ memory: the store an agent is meant to keep ITSELF ----------
    //
    // The memory page learned to make a file in 3.91.0 and the bridge was not
    // told, so `memory.*` did not exist AT ALL — not even a read. The two ops
    // call the very functions the page calls, which is what keeps the index
    // written the same way from either door: a memory file that MEMORY.md does
    // not point at is a file the agent will never open.
    {
        const { addMemoryFile, readMemoryFrontmatter } =
            require(path.join(__dirname, '..', 'out', 'core', 'memusage.js'));
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-bridge-mem-'));
        const agent = { id: 'a1', name: 'dev', dir };
        const reg = new BridgeRegistry();
        reg.register([
            {
                op: 'memory.list',
                describe: 'An agent\'s memory files. args: agent',
                handler: () => {
                    const memDir = path.join(agent.dir, 'memory');
                    const index = path.join(memDir, 'MEMORY.md');
                    const indexText = fs.existsSync(index) ? fs.readFileSync(index, 'utf8') : '';
                    const files = fs.existsSync(memDir)
                        ? fs.readdirSync(memDir).filter(f => /\.md$/i.test(f) && f !== 'MEMORY.md') : [];
                    return {
                        agent: agent.name, dir: memDir, indexed: fs.existsSync(index),
                        files: files.map(f => {
                            const meta = readMemoryFrontmatter(path.join(memDir, f));
                            return {
                                name: f.replace(/\.md$/i, ''), file: path.join(memDir, f),
                                type: meta.type || null, description: meta.description || null,
                                inIndex: indexText.includes(f)
                            };
                        })
                    };
                }
            },
            {
                op: 'memory.add',
                describe: 'Make one memory file. args: agent, name, description, type?',
                handler: (args) => {
                    const name = argStr(args, 'name');
                    need(/^[a-z0-9][a-z0-9_-]*$/.test(name),
                        'name: lowercase letters, digits, - and _ only — it becomes a file name and an index target');
                    const description = argStr(args, 'description');
                    need(!!description, 'description is required — it is the line the index carries');
                    const type = optStr(args, 'type') || 'project';
                    need(['user', 'feedback', 'project', 'reference'].indexOf(type) >= 0,
                        'type must be one of: user, feedback, project, reference');
                    return { agent: agent.name, name, type, file: addMemoryFile(agent.dir, name, type, description) };
                }
            }
        ]);
        const empty = await reg.dispatch('memory.list', { agent: 'dev' });
        ok('memory.list answers for an agent with no memory yet',
            empty.ok === true && empty.result.files.length === 0 && empty.result.indexed === false);

        const made = await reg.dispatch('memory.add', {
            agent: 'dev', name: 'feedback-permission-refusals',
            description: 'why a refused mode switch must be said out loud', type: 'feedback'
        });
        ok('memory.add writes the file', made.ok === true && fs.existsSync(made.result.file));

        const after = await reg.dispatch('memory.list', { agent: 'dev' });
        const row = after.result.files[0];
        // ‼️ The point of the op, and the reason it calls the page's own writer:
        // an unindexed memory file is invisible to the agent that owns it.
        ok('…and MEMORY.md points at it in the same write',
            after.result.indexed === true && row.inIndex === true);
        ok('…carrying the type and the description the index line is made of',
            row.type === 'feedback' && /refused mode switch/.test(row.description));

        const dupe = await reg.dispatch('memory.add', {
            agent: 'dev', name: 'feedback-permission-refusals', description: 'again'
        });
        ok('a second file with the same name is refused, not silently merged',
            dupe.ok === false && /already exists/.test(dupe.error));

        for (const [bad, why] of [
            [{ agent: 'dev', name: 'Not Kebab', description: 'x' }, 'a name that cannot be a file name'],
            [{ agent: 'dev', name: 'ok-name', description: '' }, 'a missing description'],
            [{ agent: 'dev', name: 'ok-name', description: 'x', type: 'whatever' }, 'a type outside the convention']
        ]) {
            ok(`memory.add refuses ${why}`, (await reg.dispatch('memory.add', bad)).ok === false);
        }
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }

    // ---------- ‼️ living checks: readable is not the same as writable ----------
    {
        let stored = [{ label: 'kept', when: { kind: 'noSessionsFor', hours: 24 }, level: 'warn' }];
        const reg = new BridgeRegistry();
        reg.register([
            {
                op: 'living.checks',
                describe: 'The user-defined living checks.',
                handler: () => stored.map(c => ({ label: c.label, level: c.level || 'warn', when: c.when }))
            },
            {
                op: 'living.check.add',
                describe: 'Add (or replace, by label) one living check. args: label, when, level?, hint?',
                handler: (args) => {
                    const label = argStr(args, 'label');
                    const when = args.when;
                    need(!!when && typeof when === 'object' && !Array.isArray(when),
                        'when must be the precondition object — see living.checks for installed examples');
                    const level = optStr(args, 'level') || 'warn';
                    need(['info', 'warn', 'alert'].indexOf(level) >= 0, 'level must be info, warn or alert');
                    const before = stored.length;
                    stored = stored.filter(c => c.label !== label).concat([{ label, when, level }]);
                    return { label, level, checks: stored.length, replaced: before === stored.length };
                }
            },
            {
                op: 'living.check.remove',
                describe: 'Remove one living check by its label. args: label',
                handler: (args) => {
                    const label = argStr(args, 'label');
                    const before = stored.length;
                    stored = stored.filter(c => c.label !== label);
                    need(stored.length !== before, `no living check called "${label}" — living.checks lists them`);
                    return { label, removed: true, checks: stored.length };
                }
            }
        ]);
        const added = await reg.dispatch('living.check.add',
            { label: 'stale brief', when: { kind: 'noSessionsFor', hours: 72 }, level: 'alert' });
        ok('living.check.add installs one', added.ok === true && added.result.checks === 2
            && added.result.replaced === false);
        // ‼️ By LABEL, so calling it twice tunes a check instead of growing a
        // pile of near-identical ones nobody can tell apart on the page.
        const again = await reg.dispatch('living.check.add',
            { label: 'stale brief', when: { kind: 'noSessionsFor', hours: 12 }, level: 'info' });
        ok('…and adding the same label again replaces it rather than duplicating',
            again.ok === true && again.result.checks === 2 && again.result.replaced === true);
        ok('…the replacement is the one that is stored',
            (await reg.dispatch('living.checks', {}))
                .result.find(c => c.label === 'stale brief').level === 'info');
        ok('a check with no precondition object is refused',
            (await reg.dispatch('living.check.add', { label: 'x' })).ok === false);
        ok('an unknown level is refused',
            (await reg.dispatch('living.check.add',
                { label: 'x', when: { kind: 'a' }, level: 'loud' })).ok === false);
        ok('living.check.remove takes one out',
            (await reg.dispatch('living.check.remove', { label: 'stale brief' })).result.checks === 1);
        ok('…and says so when the label is not there, instead of reporting a no-op as success',
            (await reg.dispatch('living.check.remove', { label: 'never' })).ok === false);
    }

    // ---------- Faz 7: templates, the handover, the archive ----------
    // The same handler shapes extension.ts registers, over the same pure
    // functions. What is being measured is the DISPATCH contract — what an
    // agent gets back, and what it is refused — not the arranging, which its
    // own suites cover.
    {
        const {
            coerceTemplates, describeTemplate, findTemplate, removeTemplate,
            templateFromProject, upsertTemplate
        } = require(path.join(__dirname, '..', 'out', 'core', 'projectTemplates.js'));
        const { archiveRootFor, planArchive, moveProjectFolder } =
            require(path.join(__dirname, '..', 'out', 'core', 'projectArchive.js'));
        const { buildHandover, mergeHandoverNotes, HANDOVER_NOTES_ANCHOR } =
            require(path.join(__dirname, '..', 'out', 'core', 'projectHandover.js'));

        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-bridge-faz7-'));
        const live = path.join(root, '10_PROJECTS');
        const folder = path.join(live, 'Thing');
        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(path.join(folder, 'Charter.md'), '---\naf-role: charter\n---\n\n# Thing\n', 'utf8');
        const project = {
            id: 'prj_faz70001', name: 'Thing', status: 'active', kind: 'product',
            folder, repos: [root], createdAt: 1, updatedAt: 1
        };
        let stored = [];                      // stands in for the setting
        let current = { ...project };

        const reg = new BridgeRegistry();
        reg.register([
            {
                op: 'projects.templates', describe: 'the saved shapes. args: none',
                handler: () => coerceTemplates(stored).map(t => ({ name: t.name, carries: describeTemplate(t) }))
            },
            {
                op: 'projects.template.save',
                describe: 'save a project as a template. args: project, name, identity?, repos?',
                handler: a => {
                    // optStr, not argStr: the refusal should say what a template
                    // name IS, not "missing required string arg"
                    const name = optStr(a, 'name').trim();
                    need(name, 'a template needs a name of its own — name it for the SHAPE');
                    const made = templateFromProject(current, name, {
                        identity: a.identity === true, repos: a.repos === true
                    });
                    need(!made.error, made.error || '');
                    stored = upsertTemplate(coerceTemplates(stored), made.template);
                    return { name: made.template.name, carries: describeTemplate(made.template) };
                }
            },
            {
                op: 'projects.template.delete', describe: 'forget one. args: name',
                handler: a => {
                    const name = argStr(a, 'name').trim();
                    const before = coerceTemplates(stored);
                    need(!!findTemplate(before, name), `no template called "${name}"`);
                    stored = removeTemplate(before, name);
                    return { name, remaining: stored.length };
                }
            },
            {
                op: 'projects.archive',
                describe: 'move the folder to its counterpart. args: project, apply?',
                handler: a => {
                    const arch = archiveRootFor(live);
                    const plan = planArchive(current.folder, arch);
                    if (a.apply !== true) {
                        return {
                            from: plan.from, to: plan.to, moved: false,
                            ...(plan.error ? { error: plan.error } : {})
                        };
                    }
                    const res = moveProjectFolder(plan);
                    need(res.ok, res.error || 'could not move');
                    current = { ...current, folder: res.path };
                    return { from: plan.from, to: res.path, moved: true };
                }
            },
            {
                op: 'projects.handover', describe: 'the cold-start letter. args: project, write?',
                handler: a => {
                    const input = { project: { name: current.name, status: current.status }, now: 1786000000000 };
                    if (a.write !== true) { return { markdown: buildHandover(input) }; }
                    const file = path.join(current.folder, 'Handover.md');
                    const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
                    const merged = mergeHandoverNotes(prev, input);
                    need(!merged.error, merged.error || '');
                    fs.writeFileSync(file, merged.text, 'utf8');
                    return { file, markdown: merged.text };
                }
            }
        ]);

        ok('projects.templates starts empty — nothing is shipped',
            (await reg.dispatch('projects.templates', {})).result.length === 0);
        ok('a template needs a name of its own, and the refusal says so',
            /needs a name/.test((await reg.dispatch('projects.template.save',
                { project: 'Thing', name: '  ' })).error));

        const saved = await reg.dispatch('projects.template.save',
            { project: 'Thing', name: 'Product', identity: true, repos: true });
        ok('projects.template.save answers with what the template actually carries',
            saved.ok && saved.result.name === 'Product' && /product/.test(saved.result.carries));
        ok('…and it is then in the list',
            (await reg.dispatch('projects.templates', {})).result.length === 1);
        ok('saving the same name again edits it rather than adding a second',
            (await reg.dispatch('projects.template.save', { project: 'Thing', name: 'Product' })).ok
            && (await reg.dispatch('projects.templates', {})).result.length === 1);
        ok('deleting a template nobody has is refused by name',
            /no template called/.test((await reg.dispatch('projects.template.delete', { name: 'Nope' })).error));
        ok('projects.template.delete takes it out',
            (await reg.dispatch('projects.template.delete', { name: 'Product' })).result.remaining === 0);

        // ‼️ the two-step: a destructive move describes itself before it happens
        const dry = await reg.dispatch('projects.archive', { project: 'Thing' });
        ok('‼️ projects.archive without apply MOVES NOTHING and prints both paths',
            dry.ok && dry.result.moved === false && fs.existsSync(folder)
            && dry.result.to === path.join(root, '99_ARCHIVE', '10_PROJECTS_ARCHIVE', 'Thing'));
        const applied = await reg.dispatch('projects.archive', { project: 'Thing', apply: true });
        ok('…and with apply it really moves, reporting where the folder is now',
            applied.ok && applied.result.moved === true && !fs.existsSync(folder)
            && fs.existsSync(path.join(applied.result.to, 'Charter.md')));

        const letter = await reg.dispatch('projects.handover', { project: 'Thing' });
        ok('projects.handover hands back markdown without writing anything',
            letter.ok && /^# Thing — handover/.test(letter.result.markdown)
            && !fs.existsSync(path.join(current.folder, 'Handover.md')));
        const written = await reg.dispatch('projects.handover', { project: 'Thing', write: true });
        ok('…and with write it lands in the project folder',
            written.ok && fs.existsSync(written.result.file));

        fs.writeFileSync(written.result.file,
            fs.readFileSync(written.result.file, 'utf8').replace(
                '- _the trap: what breaks if you do the obvious thing_', '- MY OWN TRAP NOTE'), 'utf8');
        const again = await reg.dispatch('projects.handover', { project: 'Thing', write: true });
        ok('‼️ writing it a SECOND time keeps the human half — that is why write can be the default',
            again.ok && fs.readFileSync(written.result.file, 'utf8').includes('MY OWN TRAP NOTE'));

        fs.writeFileSync(written.result.file, '# Handover\n\nI deleted the marker.\n', 'utf8');
        const refused = await reg.dispatch('projects.handover', { project: 'Thing', write: true });
        ok('‼️ …and a document with no marker is REFUSED rather than overwritten',
            !refused.ok && /marker/.test(refused.error)
            && fs.readFileSync(written.result.file, 'utf8').includes('I deleted the marker'));
        ok('the anchor the whole rule hangs on is one constant',
            HANDOVER_NOTES_ANCHOR === '<!-- af:handover-notes -->');

        try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
    }

    // ================= M-22 — ONE EXECUTOR, ON EVERY SURFACE =================
    //
    // A CLI profile does not add flags to an engine's command line, it REPLACES
    // it (`tasks.ts` — `const command = profile ? …`, headless and terminal
    // alike). So a run carrying both does not blend them: the profile runs and
    // the engine is dropped without a word. `tasks.add` had refused the pair
    // since M-14; nine other surfaces accepted it and stored it, and the one
    // that hurts is a schedule — set to OpenCode, still carrying last month's
    // profile, firing at 3 a.m. with nobody to notice which binary ran.
    //
    // ‼️ AND THE PAIR IS USUALLY NOT TYPED IN ONE CALL. Half these ops lay an
    // override over something that already exists, so the contradiction is made
    // by ONE argument against a stored value. Checking the args is therefore not
    // the same test as checking the run; both are below.
    {
        const { twoExecutors, ONE_EXECUTOR } =
            require(path.join(__dirname, '..', 'out', 'core', 'launch.js'));
        const { bridgeRunDimensions, needOneExecutor } =
            require(path.join(__dirname, '..', 'out', 'core', 'bridge.js'));

        // ---- the predicate itself ----
        ok('both stated is a conflict',
            twoExecutors('my-profile', 'opencode') === true);
        ok('either alone is not', !twoExecutors('my-profile', '') && !twoExecutors('', 'opencode'));
        ok('‼️ `claude` is NOT a conflict — an absent engine already means claude, '
            + 'so naming it beside a profile states nothing the profile does not override',
            twoExecutors('my-profile', 'claude') === false
            && twoExecutors('my-profile', ' CLAUDE ') === false);
        ok('whitespace and non-strings are not an executor',
            !twoExecutors('   ', 'opencode') && !twoExecutors(undefined, 'opencode')
            && !twoExecutors('p', null));

        // ---- real dispatch, through a registry, on the shared reader ----
        const reg = new BridgeRegistry();
        reg.register([
            { op: 'm22.dims', describe: 'reads run dimensions', handler: a => bridgeRunDimensions(a) },
            {
                op: 'm22.merged', describe: 'lays an override over a stored run',
                handler: a => {
                    const stored = { engine: 'opencode', cli: '' };
                    const over = bridgeRunDimensions(a);
                    const run = { ...stored, ...over };
                    needOneExecutor(run.engine, run.cli);
                    return run;
                }
            }
        ]);
        const both = await reg.dispatch('m22.dims', { engine: 'opencode', cli: 'my-profile' });
        ok('a call naming both executors is refused, not stored',
            !both.ok && /ONE executor/.test(both.error));
        ok('…and the refusal says WHICH one silently wins, so the reader knows what '
            + 'would have happened rather than only that it was rejected',
            /profile runs and the engine is silently ignored/.test(both.error)
            && both.error === ONE_EXECUTOR);
        const onlyEngine = await reg.dispatch('m22.dims', { engine: 'opencode' });
        ok('one executor still passes', onlyEngine.ok && onlyEngine.result.engine === 'opencode');
        // U-151 — a supervisor with no engine inherits Farm Settings' one, as the task form does.
        reg.register([{ op: 'u151.dims', describe: 'reads run dimensions with a Farm Settings supervisor',
            handler: a => bridgeRunDimensions(a, { supervisor: () => ({ engine: 'claude', maxCalls: 4 }) }) }]);
        const noEngine = { retry: { max: 1, behavior: 'supervisor', supervisor: { minConfidence: 0.7 } } };
        const inherits = await reg.dispatch('u151.dims', noEngine);
        ok('U-151: an empty supervisor engine is accepted when Farm Settings names one, and stored as said',
            inherits.ok && inherits.result.retry.behavior === 'supervisor'
            && inherits.result.retry.supervisor.engine === undefined && inherits.result.retry.supervisor.minConfidence === 0.7);
        const orphan = await reg.dispatch('m22.dims', noEngine);
        ok('U-151: and refused, naming both places, when nothing names one',
            !orphan.ok && /Farm Settings/.test(orphan.error));
        // ‼️ S-82 — the relay is read here in tasks.add's words, so a schedule
        // and a trigger can say it; the ceiling is clamped once, on the way in.
        const relay = await reg.dispatch('m22.dims', { baton: true, maxHops: '4' });
        ok('‼️ S-82 — baton:true and maxHops reach an automation as baton + batonMaxHops',
            relay.ok && relay.result.baton === true && relay.result.batonMaxHops === 4);
        const capOnly = await reg.dispatch('m22.dims', { maxHops: 0 });
        ok('…a ceiling alone implies the relay, and 0 (= none) survives as 0',
            capOnly.ok && capOnly.result.baton === true && capOnly.result.batonMaxHops === 0);
        const noRelay = await reg.dispatch('m22.dims', { engine: 'opencode' });
        ok('…and an automation that never asked carries neither key',
            noRelay.ok && !('baton' in noRelay.result) && !('batonMaxHops' in noRelay.result));
        const badCap = await reg.dispatch('m22.dims', { baton: true, maxHops: -2 });
        ok('…a ceiling below zero is refused, not stored', !badCap.ok && /maxHops must be a whole number/.test(badCap.error));
        const badFlag = await reg.dispatch('m22.dims', { baton: 'yes' });
        ok('…and a relay flag that is not a boolean is refused', !badFlag.ok && /baton is true or false/.test(badFlag.error));
        // S-60 — a permission mode the ENGINE cannot keep is refused where it is
        // written (a schedule, a trigger, a task), with the engine's sentence.
        const agyAsk = await reg.dispatch('m22.dims', { engine: 'agy', permissionMode: 'manual' });
        ok('‼️ S-60: `agy` + `manual` is refused at the door — Antigravity cannot ask',
            !agyAsk.ok && /cannot be kept on Antigravity/.test(agyAsk.error));
        const agyPlan = await reg.dispatch('m22.dims', { engine: 'agy', permissionMode: 'plan' });
        ok('…while a mode it can keep passes', agyPlan.ok && agyPlan.result.permissionMode === 'plan');
        const claudeAsk = await reg.dispatch('m22.dims', { engine: 'claude', permissionMode: 'manual' });
        ok('…and the same word on Claude passes — the rule is the engine\'s',
            claudeAsk.ok && claudeAsk.result.permissionMode === 'manual');
        const onlyCli = await reg.dispatch('m22.dims', { cli: 'my-profile' });
        ok('…and so does a profile on its own', onlyCli.ok && onlyCli.result.cli === 'my-profile');
        const withClaude = await reg.dispatch('m22.dims', { engine: 'claude', cli: 'my-profile' });
        ok('claude + a profile is accepted, because it is not a contradiction',
            withClaude.ok && withClaude.result.cli === 'my-profile');

        // ‼️ THE CASE THE ARGS ALONE CANNOT CATCH: one field named, two set.
        const sneak = await reg.dispatch('m22.merged', { cli: 'my-profile' });
        ok('‼️ a `cli` laid over a run already set to an engine is refused too — '
            + 'the call names one executor and the RUN ends up with two',
            !sneak.ok && sneak.error === ONE_EXECUTOR);

        // ---- every surface that resolves a run goes through the gate ----
        const extSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        const blockOf = (op) => {
            const at = extSrc.indexOf(`op: '${op}'`);
            if (at < 0) { return ''; }
            const next = extSrc.indexOf("\n            op: '", at + 1);
            return extSrc.slice(at, next < 0 ? extSrc.length : next);
        };
        // The seven M-22 named, plus the two `edit` ops that resolve a run the
        // same way and were found while measuring. `schedules.add`,
        // `templates.add`, `workflows.add` and `workflows.step.add` reach it
        // through `bridgeRunDimensions`, which is checked by dispatch above.
        for (const op of ['tasks.add', 'tasks.rerun', 'templates.run', 'triggers.add',
            'schedules.edit', 'triggers.edit']) {
            ok(`${op} refuses two executors before it starts or stores anything`,
                /needOneExecutor\(/.test(blockOf(op)));
        }
        for (const op of ['schedules.add', 'templates.add', 'workflows.add', 'workflows.step.add']) {
            const b = blockOf(op);
            ok(`${op} reads its dimensions through the checked reader`,
                /runDims\(|bridgeStep\b/.test(b));
        }

        // ---- three-state `cli`, so the refusal is not a dead end ----
        // ‼️ Refusing "retry it on OpenCode" for every task that carries a
        // profile would trade a silent bug for an unsayable request, and this
        // op's own contract calls a different engine the commonest reason to
        // retry at all. `""` clears it, the same three states `project` uses.
        for (const op of ['tasks.rerun', 'templates.run']) {
            const b = blockOf(op);
            ok(`${op} lets a caller CLEAR the inherited profile with an empty cli`,
                /args\.cli !== undefined/.test(b) && /cliStated/.test(b));
            ok(`…and ${op} says so in its contract, where the caller reads it`,
                /three-state/.test(b) && /"" to CLEAR it|"" = clear it/.test(b));
        }
    }

    // ---------- the real catalogue carries the new ops ----------
    {
        // ‼️ The registrations do not all live in extension.ts any more — an
        // area with more than a handful of ops moves out to its own
        // `core/*Bridge.ts` (B-6 took the memory ones). Reading one file and
        // calling it "the catalogue" is how this check would start passing on
        // a build that lost half of it.
        const srcDir = path.join(__dirname, '..', 'src');
        const coreDir = path.join(srcDir, 'core');
        const src = [path.join(srcDir, 'extension.ts')]
            .concat(fs.readdirSync(coreDir).filter(f => f.endsWith('.ts')).map(f => path.join(coreDir, f)))
            .map(f => fs.readFileSync(f, 'utf8'))
            .join('\n');
        for (const op of [
            'memory.list', 'memory.add', 'living.check.add', 'living.check.remove',
            // Faz 7 — every user-triggerable function reaches the bridge in the
            // same commit (_REF/agentfarm-dev.md), and this is what proves it
            'projects.handover', 'projects.templates', 'projects.template.save',
            'projects.template.delete', 'projects.archive', 'projects.archived'
        ]) {
            ok(`${op} is registered in the extension's own catalogue`,
                src.includes(`op: '${op}'`));
        }
        ok('‼️ projects.create takes a template — the page picker and an agent use one path',
            /projects\.create[\s\S]{0,4000}?findTemplate\(projectTemplates\(\)/.test(src));
    }

    // ---------- stageBridgeCli & af.js CLI Helper ----------
    {
        const tmpStorage = path.join(os.tmpdir(), `af-test-bridge-${Date.now()}`);
        fs.mkdirSync(tmpStorage, { recursive: true });
        const extPath = path.join(__dirname, '..');

        // 1. Test staging
        const r1 = stageBridgeCli(extPath, tmpStorage, '1.0.0');
        ok('stageBridgeCli copies af.js into bridge/af.js',
            r1.staged && fs.existsSync(r1.path) && r1.path === stagedBridgeCliPath(tmpStorage));
        const r2 = stageBridgeCli(extPath, tmpStorage, '1.0.0');
        ok('stageBridgeCli is idempotent when version matches', !r2.staged && fs.existsSync(r2.path));

        // 2. Test af.js module
        const { parseCliArgs, resolvePayload, parsePayloadText, decodeBase64Stdin,
            executeBridgeRequest, writeResponseFile } =
            require(path.join(extPath, 'out', 'service', 'af.js'));

        // parseCliArgs
        const c1 = parseCliArgs(['node', 'af.js', 'tasks.list']);
        ok('af.js parses single op', c1.op === 'tasks.list' && !c1.rawArgs && !c1.argsFile);

        const c2 = parseCliArgs(['node', 'af.js', 'notices.list', '{"handled":false}', '--raw']);
        ok('af.js parses inline JSON and flags', c2.op === 'notices.list' && c2.rawArgs === '{"handled":false}' && c2.rawOutput);

        const c3 = parseCliArgs(['node', 'af.js', 'notices.post', '@some/file.json', '--timeout', '5000']);
        ok('af.js parses @file argument and timeout', c3.op === 'notices.post' && c3.argsFile === 'some/file.json' && c3.timeoutMs === 5000);

        const cKeyValue = parseCliArgs([
            'node', 'af.js', 'notices.list',
            'agent=developer', 'handled=false', 'limit=5', 'query=two words'
        ]);
        ok('af.js parses shell-safe key=value arguments',
            cKeyValue.op === 'notices.list'
            && cKeyValue.keyValueArgs.length === 4
            && !cKeyValue.rawArgs);

        // resolvePayload
        const p1 = resolvePayload(c1);
        ok('resolvePayload defaults to empty object', typeof p1 === 'object' && Object.keys(p1).length === 0);

        const p2 = resolvePayload(c2);
        ok('resolvePayload parses inline JSON string', p2.handled === false);

        const pKeyValue = resolvePayload(cKeyValue);
        ok('resolvePayload coerces shell-safe scalar values',
            pKeyValue.agent === 'developer'
            && pKeyValue.handled === false
            && pKeyValue.limit === 5
            && pKeyValue.query === 'two words');

        let duplicateKeyRejected = false;
        try {
            resolvePayload(parseCliArgs(['node', 'af.js', 'notices.list', 'agent=a', 'agent=b']));
        } catch {
            duplicateKeyRejected = true;
        }
        ok('resolvePayload rejects duplicate key=value arguments', duplicateKeyRejected);

        const sampleArgFile = path.join(tmpStorage, 'sample-args.json');
        fs.writeFileSync(sampleArgFile, JSON.stringify({ title: 'Test Notice', priority: 1 }), 'utf8');
        const p3 = resolvePayload({ argsFile: sampleArgFile, timeoutMs: 1000, rawOutput: false, help: false });
        ok('resolvePayload reads from JSON file', p3.title === 'Test Notice' && p3.priority === 1);
        // A Windows path typed into an args file: \z is an escape, and a bare "Bad escaped character at 837" named no cure
        const winPathFile = path.join(tmpStorage, 'winpath-args.json');
        fs.writeFileSync(winPathFile, '{ "note": "repo D:\\zone\\dev" }', 'utf8');
        let winPathMsg = '';
        try { resolvePayload({ argsFile: winPathFile, timeoutMs: 1000, rawOutput: false, help: false }); } catch (e) { winPathMsg = String(e.message); }
        ok('an args file with a raw Windows path is refused WITH the cure, naming the file',
            /^Args file .*winpath-args\.json is not valid JSON: /.test(winPathMsg) && /write a Windows path as D:\\\\zone\\\\dev or D:\/zone\/dev\.$/.test(winPathMsg));
        let arrMsg = '';
        try { parsePayloadText('[1]', 'stdin'); } catch (e) { arrMsg = String(e.message); }
        ok('…and a JSON array is still refused as not an object', arrMsg === 'stdin must contain a JSON object.');

        // --out: the answer to `node af.js <op> > file`, which hands the bytes to a shell
        // that re-encodes them. A catalog dump taken that way arrived with a BOM and broke
        // the repo's own encoding repair pass, so the gateway writes the file itself.
        const c4 = parseCliArgs(['node', 'af.js', 'farm.ops', '--out', 'catalog.json']);
        ok('af.js parses --out', c4.op === 'farm.ops' && c4.outFile === 'catalog.json');
        const c5 = parseCliArgs(['node', 'af.js', 'farm.ops', '-o', 'catalog.json', '-r']);
        ok('af.js parses -o with --raw', c5.outFile === 'catalog.json' && c5.rawOutput);
        const c6 = parseCliArgs(['node', 'af.js', 'farm.ops', '--out=deep/catalog.json']);
        ok('af.js parses --out= form', c6.outFile === 'deep/catalog.json');
        const c7 = parseCliArgs(['node', 'af.js', 'notices.post', '--stdin-base64']);
        ok('af.js parses the PowerShell-safe Base64 stdin form',
            c7.op === 'notices.post' && c7.fromStdin && c7.stdinBase64);
        const unicodePayload = { text: 'Türkçe denetim — ölçü ✓', icon: '🎯' };
        const unicodeJson = JSON.stringify(unicodePayload);
        const encodedPayload = Buffer.from(unicodeJson, 'utf8').toString('base64');
        const decodedPayload = parsePayloadText(decodeBase64Stdin(encodedPayload), 'stdin');
        ok('Base64 stdin round-trips non-ASCII JSON without the PowerShell codepage touching it',
            decodedPayload.text === unicodePayload.text && decodedPayload.icon === unicodePayload.icon);
        ok('Base64 stdin preserves a literal replacement glyph already present in valid UTF-8',
            decodeBase64Stdin(Buffer.from('{"text":"�"}', 'utf8').toString('base64')).includes('�'));
        let badBase64Rejected = false;
        try { decodeBase64Stdin('not base64 ?'); } catch { badBase64Rejected = true; }
        ok('Base64 stdin refuses malformed transport instead of dispatching corrupted text',
            badBase64Rejected);
        let invalidUtf8Rejected = false;
        try { decodeBase64Stdin(Buffer.from([0xC3, 0x28]).toString('base64')); } catch { invalidUtf8Rejected = true; }
        ok('Base64 stdin refuses invalid UTF-8 bytes instead of inserting replacement glyphs',
            invalidUtf8Rejected);
        // A path that looks like an args file must not be mistaken for one: --out consumes
        // its value, so the positional slot stays empty and the op runs with no args.
        ok('--out value is not read as args', !c4.argsFile && !c4.rawArgs);

        const outTarget = path.join(tmpStorage, 'nested', 'response.json');
        const written = writeResponseFile(outTarget, JSON.stringify({ ok: true, result: { note: 'ünïcødé — ✓' } }, null, 2));
        const outBytes = fs.readFileSync(outTarget);
        ok('writeResponseFile creates missing directories', fs.existsSync(outTarget) && written.path === outTarget);
        ok('writeResponseFile writes UTF-8 without a BOM',
            !(outBytes[0] === 0xEF && outBytes[1] === 0xBB && outBytes[2] === 0xBF)
            && JSON.parse(outBytes.toString('utf8')).result.note === 'ünïcødé — ✓');
        ok('writeResponseFile ends the file with one newline',
            outBytes.toString('utf8').endsWith('}\n') && written.bytes === outBytes.length);
        const written2 = writeResponseFile(outTarget, '{"ok":true}\n');
        ok('writeResponseFile does not double the trailing newline',
            fs.readFileSync(outTarget, 'utf8') === '{"ok":true}\n' && written2.bytes === 12);

        // 3. Test executeBridgeRequest with mock receiver
        const bridgeDir = path.join(tmpStorage, 'bridge');
        const testReg = new BridgeRegistry();
        testReg.register({
            op: 'test.greet',
            describe: 'test op',
            handler: (a) => ({ greeting: `Hello, ${a.name}!` })
        });

        // Background worker simulating extension.ts processBridge
        const workerInterval = setInterval(() => {
            if (!fs.existsSync(bridgeDir)) { return; }
            for (const f of fs.readdirSync(bridgeDir)) {
                if (f.endsWith('.request.json')) {
                    const reqPath = path.join(bridgeDir, f);
                    const resPath = path.join(bridgeDir, f.replace(/\.request\.json$/, '.response.json'));
                    try {
                        const parsed = parseBridgeRequest(fs.readFileSync(reqPath, 'utf8'));
                        if ('error' in parsed) {
                            fs.writeFileSync(resPath, JSON.stringify({ ok: false, error: parsed.error }), 'utf8');
                        } else {
                            testReg.dispatch(parsed.op, parsed.args).then(res => {
                                fs.writeFileSync(resPath, JSON.stringify(res), 'utf8');
                            });
                        }
                        fs.unlinkSync(reqPath);
                    } catch { /* ignore */ }
                }
            }
        }, 15);

        const execRes = await executeBridgeRequest('test.greet', { name: 'World' }, bridgeDir, 5000);
        ok('executeBridgeRequest round-trip succeeds via request/response files',
            execRes.ok && execRes.result && execRes.result.greeting === 'Hello, World!');

        clearInterval(workerInterval);

        // ---------- ‼️ X-268 — a timeout says WHICH of two things happened ----------
        //
        // Measured 2026-09-09: an op waiting on a confirmation dialog held the
        // whole serial queue; the client gave up at 20 s with "ensure the
        // extension is active" while the runner still ran the op afterwards —
        // one `projects.log` reached the worklog under a "failure", one
        // `console.start` became two conversations once the caller repeated it.
        {
            // (1) nobody listening: withdrawn, nothing ran, and it says so
            const t0 = Date.now();
            const none = await executeBridgeRequest('test.greet', { name: 'x' }, bridgeDir, 120);
            ok('‼️ X-268: an unclaimed timeout names the cause and says nothing ran',
                none.ok === false && /not picked up/.test(none.error) && /nothing ran/i.test(none.error)
                && none.detail && none.detail.state === 'unclaimed');
            ok('…and the request is withdrawn from the disk',
                !fs.readdirSync(bridgeDir).some(f => f.endsWith('.request.json')));
            ok('…within the timeout given', Date.now() - t0 < 2000);
        }
        {
            // (2) taken and still running: the runner claimed it and left its marker
            let pendingSeen = '';
            const claimer = setInterval(() => {
                for (const f of fs.readdirSync(bridgeDir)) {
                    if (!f.endsWith('.request.json')) { continue; }
                    const id = f.slice(0, -'.request.json'.length);
                    const parsed = parseBridgeRequest(fs.readFileSync(path.join(bridgeDir, f), 'utf8'));
                    fs.unlinkSync(path.join(bridgeDir, f));
                    pendingSeen = path.join(bridgeDir, `${id}.pending.json`);
                    fs.writeFileSync(pendingSeen, JSON.stringify({ op: parsed.op, takenAt: 1789000000000, bootId: 'b1' }), 'utf8');
                    // …and never answers: a dialog nobody has clicked yet
                }
            }, 15);
            const taken = await executeBridgeRequest('sessions.end', { id: 'cs1' }, bridgeDir, 200);
            clearInterval(claimer);
            ok('‼️ X-268: a taken timeout is NOT reported as a failure of the extension',
                taken.ok === false && /took "sessions\.end"/.test(taken.error)
                && /NOT a failure/.test(taken.error) && !/Ensure VS Code/.test(taken.error));
            ok('‼️ …it tells the caller not to repeat a mutating op, and where the answer will land',
                /Do NOT repeat/.test(taken.error) && taken.detail && taken.detail.state === 'running'
                && typeof taken.detail.response === 'string' && taken.detail.response.endsWith('.response.json'));
            ok('…it carries when the runner took it', taken.detail.takenAt === 1789000000000
                && /2026-09-/.test(taken.error));
            ok('…and the runner\'s marker is left alone — it is the runner\'s to remove when it finishes',
                pendingSeen && fs.existsSync(pendingSeen));
            try { fs.unlinkSync(pendingSeen); } catch { /* ignore */ }
        }
        // ---------- ‼️ X-310 — THE REQUEST SAYS WHO WROTE IT ----------
        //
        // `farm.restart*` has to tell the turn that ASKED to be restarted from
        // the turns that merely happen to be running: the first consented to
        // dying, the others did not, and with no name for the asker the op can
        // only kill everyone or wait for everyone. Both were shipped and the
        // first cost a session its work mid file-write (2026-09-15).
        //
        // The name is free — every CLI this runs under publishes its session id
        // to its own children, so a tool call the agent makes inherits it — but
        // it only exists on the other side if af.js really writes it into the
        // envelope. A-02.10 is this repo's own lesson about a rule that is green
        // in the planner and dead in the product, so this is measured by READING
        // THE FILE af.js WROTE rather than by grepping for the line that writes it.
        {
            const envRun = async (env, dir) => {
                const bridgeDir = path.join(tmpStorage, dir);
                const keys = ['CLAUDE_CODE_SESSION_ID', 'AGENT_FARM_SESSION'];
                const was = {};
                for (const k of keys) {
                    was[k] = process.env[k];
                    if (env[k] === undefined) { delete process.env[k]; } else { process.env[k] = env[k]; }
                }
                const flight = executeBridgeRequest('farm.health', { a: 1 }, bridgeDir, 500);
                let sent = null;
                for (let i = 0; i < 200 && !sent; i++) {
                    const f = (fs.existsSync(bridgeDir) ? fs.readdirSync(bridgeDir) : [])
                        .find(n => n.endsWith('.request.json'));
                    if (f) {
                        try { sent = JSON.parse(fs.readFileSync(path.join(bridgeDir, f), 'utf8')); }
                        catch { /* still being written — look again */ }
                    }
                    if (!sent) { await new Promise(r => setTimeout(r, 5)); }
                }
                await flight;
                for (const k of keys) {
                    if (was[k] === undefined) { delete process.env[k]; } else { process.env[k] = was[k]; }
                }
                return sent;
            };

            const claude = await envRun({ CLAUDE_CODE_SESSION_ID: 'sess-from-the-env' }, 'env-claude');
            ok('‼️ X-310: af.js writes the caller the CLI published into the envelope',
                !!claude && !!claude.from && claude.from.sessionId === 'sess-from-the-env');
            ok('… and it rides on the ENVELOPE, never inside the op\'s own args',
                !!claude && claude.args && claude.args.a === 1 && !('from' in claude.args)
                && !('sessionId' in claude.args));

            const farmTerm = await envRun({ AGENT_FARM_SESSION: 'sess-from-a-terminal' }, 'env-term');
            ok('… and the terminals Agent Farm opens itself are named the same way',
                !!farmTerm && !!farmTerm.from && farmTerm.from.sessionId === 'sess-from-a-terminal');

            const nameless = await envRun({}, 'env-none');
            // S-68 — it still says WHERE it runs (its parent pid, which the host
            // can walk to a registered CLI), but never an empty session.
            ok('‼️ … while a caller whose engine publishes nothing STATES no session — an unknown '
                + 'asker must look unknown, not empty-but-present',
                !!nameless && !!nameless.from && !('sessionId' in nameless.from)
                && nameless.from.ppid === process.ppid);
        }

        // ---------- ‼️ X-310 — … AND THE RUNNER READS IT BACK ----------
        {
            const round = parseBridgeRequest(JSON.stringify(
                { op: 'farm.health', args: { a: 1 }, from: { sessionId: ' sess-1 ' } }));
            ok('‼️ X-310: the envelope\'s caller survives the parse, trimmed',
                !('error' in round) && round.from && round.from.sessionId === 'sess-1');
            const bare = parseBridgeRequest(JSON.stringify({ op: 'farm.health', args: {} }));
            ok('… and a request that names nobody produces no caller at all',
                !('error' in bare) && !('from' in bare));
            // ‼️ THE ONE CONFUSION THIS MUST NEVER MAKE. Ops carry a `sessionId`
            // arg of their own all over this catalogue; it names a session they
            // are ABOUT, and reading one as the caller would let any request
            // claim to be any turn.
            const spoof = parseBridgeRequest(JSON.stringify(
                { op: 'sessions.open', args: { sessionId: 'somebody-else' } }));
            ok('‼️ … and an op\'s own sessionId arg is never read as the caller',
                !('error' in spoof) && !('from' in spoof) && spoof.args.sessionId === 'somebody-else');

            const reg = new BridgeRegistry();
            let seen = 'not called';
            reg.register([{ op: 'x.echo', describe: 'test', handler: (_a, f) => { seen = f; return 1; } }]);
            await reg.dispatch('x.echo', {}, { sessionId: 'sess-9' });
            ok('‼️ … and dispatch hands it to the handler, or no op could ever use it',
                !!seen && seen.sessionId === 'sess-9');
            await reg.dispatch('x.echo', {});
            ok('… while an internal call — a panel click, a command — hands over nothing',
                seen === undefined);
        }

        // (3) the runner in extension.ts: claim first, never wait, remember answers
        {
            const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
            const at = ext.indexOf('const processBridge = (): void => {');
            ok('‼️ X-268: the bridge scan is synchronous — nothing behind a handler waits for it', at > 0);
            const body = ext.slice(at, ext.indexOf('closeStalePendingRequests();', at));
            ok('…and it really contains no await', !/\bawait\b/.test(body));
            const claimAt = body.indexOf('try { fs.unlinkSync(reqFile); } catch { continue; }');
            const markAt = body.indexOf('bridgePendingFile(id)');
            const dispatchAt = body.indexOf('bridge.dispatch(parsed.op, parsed.args, parsed.from)');
            ok('‼️ X-268: the request is taken off the disk BEFORE it is dispatched (at most once)',
                claimAt > 0 && dispatchAt > claimAt);
            ok('‼️ …and the pending marker is written between the claim and the dispatch',
                markAt > claimAt && markAt < dispatchAt);
            ok('…a request in flight is skipped by the next scan', /if \(bridgeInFlight\.has\(id\)\) \{ continue; \}/.test(body));
            ok('…a request id already answered is answered from memory, never run again',
                /const known = bridgeAnswered\.get\(id\);[\s\S]{0,200}answer\(known\)/.test(body));
            ok('…the dispatch is not awaited',
                /bridge\.dispatch\(parsed\.op, parsed\.args, parsed\.from\)\.then\(finish/.test(body));
            // a request waiting at boot must not run mid-activate: an op reading a service declared
            // further down answered "Cannot access 'consoleHost' before initialization"
            const boot = ext.slice(ext.indexOf('closeStalePendingRequests();', at), ext.indexOf('closeStalePendingRequests();', at) + 1200);
            ok('‼️ the first scan waits for activate() to finish', /setTimeout\(\(\) => void processBridge\(\), 0\)/.test(boot)
                && !/\n    void processBridge\(\);/.test(boot));
            // ‼️ X-310 — AND IT CARRIES WHO WROTE THE REQUEST. The restart ops exempt the
            // asker's own turn from blocking and speak into its seat alone on the other
            // side; a runner that dropped the envelope's caller would leave them with
            // nothing to tell one live turn from another, which is the whole defect.
            ok('‼️ X-310: …and it carries the caller the envelope named',
                /parsed\.from/.test(body));
            ok('…the marker is removed when the answer is written', /answer\(outcome\);\s*try \{ fs\.unlinkSync\(bridgePendingFile\(id\)\); \}/.test(body));
            ok('‼️ X-268: a marker from a previous boot is CLOSED with an honest answer on activation, never re-run',
                /const closeStalePendingRequests = \(\): void => \{[\s\S]*?mark\.bootId === bootId[\s\S]*?restarted while/.test(ext)
                && /\n    closeStalePendingRequests\(\);/.test(ext));
            ok('…and the serial busy flag is gone', !/bridgeBusy/.test(ext));
        }

        // Cleanup tmpStorage
        try { fs.rmSync(tmpStorage, { recursive: true, force: true }); } catch { /* ignore */ }
    }

    // ---------- X-230: the farm can load its own new build ----------
    // The rule lives in core/selfRestart.ts (test_self_restart.js). What is
    // pinned HERE is the wiring: that the two ops go through that one plan, that
    // the command is fired from exactly one place, and — the trap that would
    // otherwise cost a boot loop — that the cooldown stamp reaches the disk
    // BEFORE the timer that kills the process is set.
    {
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        for (const op of ['farm.health', 'farm.restartExtensionHost', 'farm.reloadWindow']) {
            ok(`extension.ts registers ${op}`, src.includes(`op: '${op}'`));
        }
        ok('…through the shared core rather than its own copy of the rule',
            /from '\.\/core\/selfRestart'/.test(src));

        const win = (from, to) => {
            const a = src.indexOf(from);
            const b = to ? src.indexOf(to, a) : src.length;
            return a < 0 ? '' : src.slice(a, b > a ? b : src.length);
        };
        const health = win("op: 'farm.health'", "op: 'farm.restartExtensionHost'");
        const restart = win("op: 'farm.restartExtensionHost'", "op: 'farm.reloadWindow'");
        const reload = win("op: 'farm.reloadWindow'", "op: 'farm.waits'");

        ok('‼️ farm.health answers "is the new build actually running" — version AND a per-activation id',
            /version: extVersion/.test(health) && /bootId/.test(health));
        ok('…and it is the place an armed restart is watched from',
            /restartArmed/.test(health) && /lastRestart/.test(health));
        ok('…and it says what the restart would cost right now',
            /sessions/.test(health) && /terminals/.test(health));

        ok('the restart op asks for the host', /askRestart\('extensionHost'/.test(restart));
        ok('the reload op asks for the window', /askRestart\('window'/.test(reload));
        ok('‼️ neither op runs the VS Code command itself — one firing site or the delay rule is optional',
            !/executeCommand\(/.test(restart) && !/executeCommand\(/.test(reload));
        ok('both take the arguments the plan understands',
            /when\?/.test(restart) && /force\?/.test(restart) && /delayMs\?/.test(restart));
        ok('…and the contract tells the caller how to wait and how to verify',
            /farm\.health/.test(restart) && /idle/.test(restart) && /force/.test(restart));
        ok('…and the reload contract says it takes the terminals too',
            /terminal/i.test(reload));

        const fire = win('const fireRestart', 'const askRestart');
        ok('the command is fired from the shared plan\'s own name, not a literal',
            /RESTART_COMMANDS\[/.test(fire));
        ok('‼️ …and the cooldown stamp is on disk BEFORE the timer that kills this process',
            fire.indexOf('writeRestartStamp') > -1
            && fire.indexOf('writeRestartStamp') < fire.indexOf('setTimeout'));
        ok('‼️ …and the kill is deferred, so the bridge response is written first',
            /setTimeout\(/.test(fire) && /delayMs/.test(fire));

        // ---- X-232: the sessions that survive the restart ----
        ok('the restart op takes the promise to bring the sessions back',
            /resume\?/.test(restart) && /askRestart\('extensionHost'/.test(restart));
        ok('‼️ …and the snapshot is written by the SHARED plan, not a second field list',
            /planRevive\(/.test(fire));
        ok('‼️ …into the stamp that already survives the death, before the timer',
            fire.indexOf('planRevive') < fire.indexOf('setTimeout'));

        const revive = win('const reviveAfterRestart', 'ConsolePanel');
        ok('the other side takes them up through the same shared core',
            /reviveInit\(/.test(revive) && /consoleHost\.start\(/.test(revive));
        ok('‼️ …and the plan is CONSUMED before it is acted on — a plan left in the stamp '
            + 'spawns the same sessions again on the next activation, and twice is worse than none',
            revive.indexOf('clearRestartRevive') > -1
            && revive.indexOf('clearRestartRevive') < revive.indexOf('consoleHost.start'));
        ok('‼️ …the reader is told what happened rather than finding a session mysteriously alive',
            /role: 'system'/.test(revive) && /midTurn/.test(revive));
        ok('…and the transcript and the spend come from the index, which the core refuses to invent',
            /consoleHistory\(/.test(revive) && /carriedTotals\(/.test(revive));

        const ask = win('const askRestart', "op: 'farm.health'");
        ok('the decision is the core\'s, not the wiring\'s', /planRestart\(/.test(ask));
        ok('a refusal reaches the caller as an error rather than a cheerful ok',
            /'refused'/.test(ask) && /throw new Error/.test(ask));
        ok('an armed plan is remembered and watched', /armedReady|armTimer|armedRestart/.test(ask));
    }

    // ---------- X-231: the fleet's waits, as one reading ----------
    // The rule is in core/waits.ts and its two gates read the sources
    // (test_waits.js). What is pinned HERE is the wiring: that the op exists,
    // that it TRANSLATES the state each manager already holds rather than
    // deciding anything itself, and — the condition the item put on it — that
    // the op which MAKES a caller wait answers with the same object the
    // reading op returns. Two dialects for one wait is the failure this whole
    // item exists to prevent, and the producing op is where it would start.
    {
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        const cut = (from, to) => {
            const a = src.indexOf(from);
            const b = to ? src.indexOf(to, a) : src.length;
            return a < 0 ? '' : src.slice(a, b > a ? b : src.length);
        };
        ok('extension.ts registers farm.waits', src.includes("op: 'farm.waits'"));
        ok('…through the shared shape rather than its own copy of it',
            /from '\.\/core\/waits'/.test(src));

        const op = cut("op: 'farm.waits'", 'const fleetWaitsNow');
        ok('‼️ the op TRANSLATES and decides nothing — no kind, no rule, no verdict of its own',
            /fleetWaitsNow\(\)/.test(op) && !/clearedBy: '/.test(op) && !/kind: 'task-/.test(op));
        ok('…and it answers the one figure before the list: will anything change by itself',
            /clearedBy: \{/.test(op) && /waiting: waits\.length/.test(op));

        // ‼️ X-231 (d) — ONE GATHERING, TWO READERS. The item asks for the agent's
        // answer AND the person's; two call sites assembling the same list from the
        // same managers is how they would come to disagree by one wait.
        const gather = cut('const fleetWaitsNow', '\n    const bridgeDir');
        ok('every source the item names reaches the one gathering',
            /taskManager\.tasks/.test(gather) && /missionStore\.runs/.test(gather)
            && /taskManager\.sentry/.test(gather) && /armedRestart/.test(gather));
        ok('‼️ …carrying the sentence each source ALREADY wrote, never a new one',
            /deferredReason/.test(gather) && /lastWhy/.test(gather) && /now\?\.what/.test(gather));
        ok('…and whether a sentry round is on the board is DERIVED here too, as sentry.status derives it',
            /sentryBusy\(\)/.test(gather));
        ok('…while a parked row\'s age comes from the event that parked it, not from now()',
            /'parked'/.test(gather));
        ok('‼️ …and the Dashboard is handed THAT result rather than gathering its own',
            /waits: \(\) => fleetWaitsNow\(\)/.test(src));
        ok('…which is the only place the fleet\'s waits are assembled',
            (src.match(/fleetWaits\(\{/g) || []).length === 1);

        // ‼️ CONDITION (c) — THE OP THAT MAKES YOU WAIT SPEAKS THE SAME DIALECT
        // AS THE OP YOU ASK AFTERWARDS. X-230's `decision:"armed"` was the
        // first example of this shape; it must not become a second version of
        // it, so the armed answer is BUILT by the same function.
        const ask = cut('const askRestart', "op: 'farm.health'");
        ok('‼️ X-231: the armed answer carries the wait object the reading op returns',
            /armedRestartWait\(/.test(ask));
        ok('…and the sentence is kept ON the record, so nobody has to write it twice',
            /reason: plan\.reason/.test(ask));
        // ---------- X-219: renewing a dead sign-in reaches the bridge too ----------
        // The rule is in core/accountStore.ts (test_engine_accounts.js). Pinned here:
        // that the op exists, that it DECIDES nothing, and that a refusal reaches the
        // caller as a refusal rather than as a plan with an empty command in it.
        ok('extension.ts registers accounts.reauth', src.includes("op: 'accounts.reauth'"));
        const re = cut("op: 'accounts.reauth'", "op: 'accounts.forget'");
        ok('‼️ the op asks the core and adds no rule of its own',
            /planReauth\(/.test(re) && !/MACHINE_ACCOUNT/.test(re) && !/canIsolate/.test(re));
        ok('‼️ …a refusal is an error, not a plan with nothing in it',
            /need\(!plan\.refusal/.test(re));
        ok('…and it says out loud that it signs nobody in',
            /signs nobody in/.test(re) && /statusArgs/.test(re));

        // ---------- X-305: the rules that choose a sign-in are on the bridge ----------
        // An agent can already PASS `@emptiest` anywhere an account is taken; what it
        // could not do is find out the rules exist, see what one comes to, or write
        // one. Three ops, and the shape rule they all obey: the CORE decides and the
        // op adds nothing of its own (the same doctrine `accounts.reauth` follows).
        for (const op of ['policies.list', 'policies.save', 'policies.delete']) {
            ok('extension.ts registers ' + op, src.includes("op: '" + op + "'"));
        }
        // ‼️ X-239/X-241 — the background quota beat's switch, read or flipped
        ok('extension.ts registers accounts.autoRefresh', src.includes("op: 'accounts.autoRefresh'"));
        const ar = cut("op: 'accounts.autoRefresh'", "op: 'accounts.reauth'");
        ok('‼️ accounts.autoRefresh without `on` READS (the state function), with it WRITES through the function the Engines page\'s button calls',
            /if \(want === undefined\) \{ return accountsAutoRefreshState\(\); \}/.test(ar)
            && /return setAccountsAutoRefresh\(want === true\);/.test(ar) && /need\(typeof want === 'boolean'/.test(ar));
        ok('…the describe says each sign-in has its own beat, that reads are never all at once, and what off still allows',
            /each sign-in on ITS OWN beat \(X-240\)/.test(ar) && /Never all at /.test(ar) && /turn-boundary read still work/.test(ar));
        ok('…and accounts.list carries the same state', /autoRefresh: accountsAutoRefreshState\(\)/.test(cut("op: 'accounts.list'", "op: 'accounts.autoRefresh'")));
        const pl = cut("op: 'policies.list'", "op: 'policies.save'");
        ok('‼️ policies.list answers from the ONE reader, never a list of its own',
            /policyRowsFor\(engine/.test(pl) && /BUILT_IN_POLICIES/.test(pl));
        ok('…and it takes the model, because a rule may have model-filtered steps',
            /optStr\(args, 'model'\)/.test(pl));
        ok('‼️ …and it says that a refusal now is not a refusal at launch',
            /right now" is not "at launch"/.test(pl));

        // ‼️ X-305 step 4 — the two writes live in ONE function each, and the op
        // and the Engines page's form both call it. The op body is a call and
        // a `need`; everything pinned below is pinned on the shared function.
        const ps = cut("op: 'policies.save'", "op: 'policies.delete'");
        ok('‼️ policies.save is a call to the function the Engines page calls',
            /await savePolicy\(rule\)/.test(ps) && /need\(!refusal, refusal\)/.test(ps));
        // X-324 — the strategy travels as typed and the describe teaches both words
        ok('X-324 — policies.save takes `strategy` and hands it to the core as typed (lower-cased), never judged in the op',
            /optStr\(args, 'strategy'\)\.toLowerCase\(\)/.test(ps) && !/'emptiest'\s*\?/.test(ps));
        ok('…and the describe says what each strategy does, that emptiest needs account steps, and lists the arg',
            /`chain` \(the default\) walks them top/.test(ps) && /`emptiest` treats the listed accounts as a pool/.test(ps)
            && /in `emptiest` mode every step must be an account/.test(ps) && /strategy\? \("chain" \| "emptiest"; default chain\)/.test(ps));
        ok('…and policies.list\'s rows describe an emptiest rule by what it compares, not "in order"',
            /the emptiest of \$\{p\.chain\.length\} listed sign-in/.test(src));
        const sp = cut('const savePolicy = async', 'const deletePolicy = async');
        ok('‼️ savePolicy refuses a rule the CORE says could never choose',
            /policyShapeRefusal\(rule, others\)/.test(sp) && /if \(bad\)/.test(sp));
        // ‼️ The shape check must NOT be handed the rule it is replacing, or a
        // rule can never be rewritten to stop pointing where it used to.
        ok('‼️ …checked against the OTHER rules, so one can be rewritten',
            /const others = all\.filter/.test(sp));
        ok('…and the answer says what the rule comes to right now',
            /now: policyRowsFor\(/.test(sp));
        ok('…and an open Engines page is redrawn, so the form sees its own write',
            /EnginesPanel\.refreshIfOpen\(\)/.test(sp));

        const pd = cut("op: 'policies.delete'", "op: 'accounts.repairs'");
        ok('‼️ policies.delete is a call to the function the Engines page calls',
            /await deletePolicy\(/.test(pd) && /need\(!refusal, refusal\)/.test(pd));
        const dp = cut('const deletePolicy = async', 'const policyPageData = ');
        ok('‼️ deletePolicy refuses while another rule steps through it',
            /const users = all\.filter/.test(dp) && /if \(users\.length\)/.test(dp));
        // ‼️ The honest half: deleting the rule does not unpick it anywhere, and
        // those launches are then REFUSED rather than quietly taking the main
        // sign-in — which is the one promise this whole family makes.
        ok('‼️ …and says so: what still names it is refused, not downgraded',
            /rather than falling back to the main sign-in/.test(dp));
        ok('…the built-in four are not stored, so they cannot be deleted',
            /are not stored /.test(dp));
        // The page's deps are the same two functions — not copies of them.
        const ed = cut('const enginesPanelDeps', 'const toolboxDeps');
        ok('‼️ the Engines page is handed savePolicy / deletePolicy themselves',
            /savePolicy: async \(rule: AccountPolicy\)[^\n]*savePolicy\(rule\)/.test(ed)
            && /deletePolicy: async \(name: string\)[^\n]*deletePolicy\(name\)/.test(ed));
        ok('…and reads the rules through policyPageData, the one reader',
            /policies: \(\) => policyPageData\(\)/.test(ed));

        // ---------- X-271: a slot is an identity, not a place to keep anything ----------
        // The junctions that keep ONE pool of transcripts are made at capture and
        // never looked at again; a move, a clone or a new machine leaves a real
        // folder in the slot and the engine writes the transcript inside it. The
        // invariant pinned here is the user's, and it is stronger than "repair the
        // link": a session record is NEVER left living under an account, because an
        // account is a quota that can be closed tomorrow while the transcript is the
        // record of the work. So a real folder is emptied into the pool rather than
        // reported and left. What the repair still may not do is invent the pool it
        // links into — that is also what keeps a suite (whose config reads the real
        // settings.json) from pointing the machine's real slots at a temp directory.
        ok('extension.ts registers accounts.repairLinks', src.includes("op: 'accounts.repairLinks'"));
        const rl = cut('const repairSharedLinks', '/** One slot as every surface may see it');
        ok('‼️ X-271: a real folder in the slot is DRAINED into the pool, not left there',
            /drain\(to, from, slot\.id\)/.test(rl));
        ok('…and nothing is overwritten: same size and mtime is the same transcript',
            /mine\.size === theirs\.size && mine\.mtimeMs === theirs\.mtimeMs/.test(rl));
        ok('…and any other collision lands under a second name carrying the slot id',
            /\$\{p\.name\}--\$\{slotId\}\$\{p\.ext\}/.test(rl));
        ok('…and a file the engine still holds open stays put and is reported',
            /catch \{[\s\S]{0,200}stranded\.push\(f\);[\s\S]{0,80}whole = false;/.test(rl));
        ok('…and a dry run names what WOULD move without moving it',
            /if \(dry\) \{ moved\.push\(t\); continue; \}/.test(rl));
        ok('…and a junction is told apart from a folder rather than guessed at',
            /isSymbolicLink\(\)/.test(rl));
        ok('‼️ …and it refuses to create the pool it would link into',
            /existsSync\(path\.join\(home, a\.liveDir\)\)/.test(rl));
        // ‼️ THREE MOMENTS, and the middle one is the only PREVENTIVE one: once the
        // engine has been handed an unlinked slot it has already written inside it.
        ok('…and the window never waits on the repair',
            /setTimeout\(\(\) => runContractGate\('start'\), 0\);/.test(src));
        // ‼️ X-284 — THE MOMENT, NOT THE LIST. This used to pin two named
        // repairs in a fixed order at the launch gate, and it had already broken
        // once on proximity when the second one was added. The list is no longer
        // the gate's to keep: it is the contract's (`slotClauses`, pinned in
        // test_slot_completeness.js), and what must hold HERE is only the
        // moment — every repair runs BEFORE the engine is handed the directory.
        // Once CLAUDE_CONFIG_DIR points at an incomplete slot the transcript is
        // already being written inside it and the system-prompt variable has
        // already been read, so nothing can be put right afterwards.
        ok('‼️ X-271/X-269/X-284: the whole contract is asked BEFORE a launch is handed the slot',
            /runContractGate\('launch', slot\.id\);[\s\S]{0,400}return accountEnv\(slot\);/.test(src));
        // ‼️ X-301 — the promise moved INTO the wrapper rather than being
        // dropped: it still cannot fail a launch, and the reason a pass threw
        // is now a journal row instead of nothing at all.
        ok('…and a launch is never failed by it, and no longer fails in silence',
            /if \(slot\) \{ runContractGate\('launch', slot\.id\); \}/.test(src)
            && /was: 'the gate threw before any clause was repaired',/.test(src)
            && /catch \{ \/\* a journal never fails a gate either \*\/ \}/.test(src));
        // ‼️ AND THE OTHER TWO GATES ASK THE SAME ONE THING, or the eleventh
        // clause is carried by one door and forgotten by the other two.
        ok('‼️ X-284: capture asks the contract once the row exists',
            /await writeAccounts\(addSlot\(list, slot\)\);[\s\S]{0,700}runContractGate\('capture', slot\.id\);/.test(src));
        ok('…and the capture executor copies the IDENTITY and stops',
            !/for \(const l of plan\.links\)/.test(src)
            && !/reproduceSlotSettings\(fs, \{\r?\n\s+home: os\.homedir\(\), dir: plan\.slot\.dir/.test(src));
        ok('‼️ X-284: and activation no longer repairs slots beside the contract',
            !/for \(const slot of storedAccounts\(\)\) \{\r?\n\s+try \{ reproduceSlotSettings/.test(src));
        const afterEnd = cut('const sweptAfterEnd', 'context.subscriptions.push(consoleHost.onChange(id => {\n        // The first change');
        ok('‼️ X-271: and again once a session has ended and let go of its file',
            /s\.status !== 'ended' && s\.status !== 'error'/.test(afterEnd)
            && /repairSharedLinks\(\)/.test(afterEnd));
        ok('…and that sweep fires once per session, debounced, never on every change',
            /sweptAfterEnd\.has\(id\)/.test(afterEnd) && /clearTimeout\(sweepTimer\)/.test(afterEnd));

        const sr = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'selfRestart.ts'), 'utf8');
        const armed = sr.slice(sr.indexOf('export interface ArmedRestart'),
            sr.indexOf('export interface RestartWorld'));
        ok('…which is why ArmedRestart carries a reason at all', /reason\?: string;/.test(armed));
    }

    // ---------- audit A-02.11: A REFUSAL IS AN ANSWER, AND AN ANSWER HAS FIELDS ----------
    //
    // Measured on the running 3.442.0: `farm.restartExtensionHost when=now` over
    // a real pending build answered `{ok:false, error:"…"}` and NOTHING else —
    // no `kind` (already escalated to a window reload), no `build.escalatedFrom`,
    // no `retryInMs` — though the op's own catalogue entry promises the first two
    // by name. And the sentence itself stopped at character 500, mid-word, on
    // "Pass loadBuil", which is where it was naming the way out.
    {
        const reg = new BridgeRegistry();
        const long = 'x'.repeat(900);
        reg.register({
            op: 'test.refuse', describe: 'refuses on purpose',
            handler: () => { throw new BridgeRefusal('no, because ' + long, { kind: 'window', retryInMs: 4000 }); }
        });
        reg.register({
            op: 'test.blowUp', describe: 'throws something nobody composed',
            handler: () => { throw new Error(long); }
        });

        const refused = await reg.dispatch('test.refuse', {});
        ok('a deliberate refusal is still ok:false — nothing happened and no caller changes its mind',
            refused.ok === false);
        ok('‼️ …and it carries its DECISION, not only a sentence about it',
            refused.detail && refused.detail.kind === 'window' && refused.detail.retryInMs === 4000);
        ok('‼️ …and the sentence we composed is not cut — that is where the way out is named',
            refused.error.length === ('no, because ' + long).length && refused.error.endsWith('x'));

        const blown = await reg.dispatch('test.blowUp', {});
        ok('…while an exception nobody composed is still capped, because it has no bound',
            blown.ok === false && blown.error.length === 500);
        ok('…and carries no detail it never had', blown.detail === undefined);

        // And the restart op is the caller this was found on: pin that it throws
        // the refusal WITH the plan, or the fields go back to being unreachable.
        const extTs = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        const at = extTs.indexOf("if (plan.decision === 'refused')");
        const site = at < 0 ? '' : extTs.slice(at, at + 500);
        ok('‼️ farm.restartExtensionHost refuses with BridgeRefusal, not a bare Error',
            /throw new BridgeRefusal\(plan\.reason/.test(site));
        ok('‼️ …and hands over the escalated kind and the build reading it just worked out',
            /kind: plan\.kind/.test(site) && /build: plan\.build/.test(site)
            && /retryInMs: plan\.retryInMs/.test(site) && /note: plan\.note/.test(site));
    }

    // ---------- X-334: an arg the describe marks `name?` is never read with argStr ----------
    // ‼️ THE CONTRACT AND THE READER DISAGREED, AND THE READER WON. `telegram.inbox`
    // promised `id? (omitted, every conversation with something waiting)` and read
    // it with argStr, so the one form the promise was about threw "Missing required
    // string arg". `console.answer` promised `response?` and did the same — answering
    // a question by option label alone never reached the session. Measured live on
    // 3.593.0. So every op in the catalogue is read here: each `name?` after `args:`
    // in a describe must not meet `argStr(args, 'name')` in its handler. The twelve
    // named below read the arg with argStr INSIDE a branch the describe names
    // ("required for scope session", "required unless stop") — a conditional
    // requirement, stated. The list may shrink; it never grows.
    {
        const conditional = new Set([
            'insights.restore:key', 'insights.delegate:key', 'triggers.add:title', 'templates.run:agent',
            'live.alerts.set:action', 'alerts.mute:sessionId', 'alerts.read:sessionId', 'alerts.voice.set:sessionId',
            'console.queue:text', 'telegram.focus:session', 'docopen.set:defaultMode', 'toolbox.enable:agent'
        ]);
        const root = path.join(__dirname, '..');
        const files = ['src/extension.ts', ...fs.readdirSync(path.join(root, 'src', 'core'))
            .filter(f => /\.ts$/.test(f)).map(f => 'src/core/' + f)];
        const bad = [];
        const seen = new Set();
        let scanned = 0;
        for (const f of files) {
            const src = fs.readFileSync(path.join(root, f), 'utf8');
            const starts = [];
            const re = /op: '([a-zA-Z0-9_.]+)'/g;
            let m;
            while ((m = re.exec(src))) { starts.push({ op: m[1], at: m.index }); }
            for (let i = 0; i < starts.length; i++) {
                const block = src.slice(starts[i].at, i + 1 < starts.length ? starts[i + 1].at : starts[i].at + 8000);
                const h = block.indexOf('handler:');
                if (h < 0) { continue; }
                scanned++;
                const describe = block.slice(0, h);
                const handler = block.slice(h);
                const argsAt = describe.lastIndexOf('args:');
                if (argsAt < 0) { continue; }
                const tre = /\b([a-zA-Z_][a-zA-Z0-9_]*)\?/g;
                let t;
                const optional = new Set();
                while ((t = tre.exec(describe.slice(argsAt)))) { optional.add(t[1]); }
                for (const name of optional) {
                    if (!new RegExp(`argStr\\(args, '${name}'\\)`).test(handler)) { continue; }
                    const key = `${starts[i].op}:${name}`;
                    if (conditional.has(key)) { seen.add(key); } else { bad.push(key); }
                }
            }
        }
        ok(`‼️ every optional arg is read with optStr — ${scanned} ops scanned` + (bad.length ? ` — ${bad.join(', ')}` : ''),
            bad.length === 0);
        ok('…and the conditional list names only cases that still exist (shrink it when one goes)',
            [...conditional].every(k => seen.has(k)));
        ok('…telegram.inbox and console.answer read their optional args as optional now',
            !bad.includes('telegram.inbox:id') && !bad.includes('console.answer:response'));
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
