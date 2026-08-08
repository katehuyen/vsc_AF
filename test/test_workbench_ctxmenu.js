// The four workbench pages' right-click contract: the Toolbox, the Capability
// Matrix, Farm Settings and the Secrets vault.
//
// Two things are pinned here that would otherwise rot silently:
//   · the Toolbox publishes ONE section for eight kinds of row, with `afKind`
//     carrying the difference — the alternative is eight copies of
//     open/reveal/copy/remove drifting apart one kind at a time;
//   · the vault offers NO way to copy a value, and never will. That is not a
//     missing feature to be filled in later, it is the reason the page exists.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const NOW = Date.now();

// ============================================================ TOOLBOX
{
    const p = runPage('toolbox.js', {
        generatedAt: NOW,
        agents: [{ id: 'a1', name: 'dev' }],
        counts: {
            skill: { user: 1, agent: 1 }, subagent: { user: 0, agent: 0 },
            command: { user: 0, agent: 0 }, mcp: { user: 0, agent: 1 },
            hook: { user: 0, agent: 0 }, plugin: { user: 1, agent: 0 },
            style: { user: 0, agent: 0 }, settings: { user: 1, agent: 0 }
        },
        probeCache: {},
        paths: { userClaudeDir: 'C:/u/.claude', userConfigJson: 'C:/u/.claude.json' },
        items: [
            {
                kind: 'skill', scope: 'agent', agentId: 'a1', agentName: 'dev',
                name: 'account-signup', description: 'sign an account up',
                source: 'D:/a/.claude/skills/account-signup/SKILL.md',
                dir: 'D:/a/.claude/skills/account-signup', detail: {}
            },
            {
                kind: 'skill', scope: 'user', name: 'dataviz', description: 'charts',
                source: 'C:/u/.claude/skills/dataviz/SKILL.md',
                dir: 'C:/u/.claude/skills/dataviz', detail: {}
            },
            {
                kind: 'mcp', scope: 'agent', agentId: 'a1', agentName: 'dev',
                name: 'obsidian', description: 'node bridge.js',
                source: 'D:/a/.mcp.json', detail: { transport: 'stdio', disabled: false }
            },
            {
                kind: 'plugin', scope: 'user', name: 'p1', description: 'a plugin',
                source: 'C:/u/.claude/plugins/p1.json',
                detail: { plugin: 'p1', marketplace: 'm1', enabled: false, homepage: 'https://example.test' }
            },
            {
                kind: 'settings', scope: 'user', name: 'settings.json', description: '',
                source: 'C:/u/.claude/settings.json', detail: { keys: ['hooks'], sizeBytes: 900 }
            }
        ]
    });

    const tab = (id) => { const b = p.query(`[data-tab="${id}"]`)[0]; if (b) { b.click(); } };

    tab('skill');
    ok('the Toolbox lists its skills', p.html().includes('account-signup'));
    const ctxs = p.contexts();
    const agentSkill = ctxs.find(c => c.toolIndex === 0);
    const userSkill = ctxs.find(c => c.toolIndex === 1);
    ok('‼️ every Toolbox row publishes ONE section, whatever its kind',
        !!agentSkill && agentSkill.webviewSection === 'afToolRow');
    ok('…and says which kind and scope it is',
        !!agentSkill && agentSkill.afKind === 'skill' && agentSkill.afScope === 'agent');
    ok('…and whether this page can take it away',
        !!agentSkill && agentSkill.afRemovable === true);
    ok('a user-scope row says so, so "copy to another agent" is not drawn on it',
        !!userSkill && userSkill.afScope === 'user');

    // The menu against the row's own buttons.
    const openBtn = p.query('[data-act="open"]').find(e => e.dataset.i === '0');
    p.posted.length = 0;
    if (openBtn) { openBtn.click(); }
    const byButton = p.last();
    ok('the row has an open button to compare against', !!byButton);
    p.send({ type: 'afctx', act: 'tbOpen', ctx: agentSkill });
    ok('‼️ Open from the menu is the button\'s message, to the character',
        JSON.stringify(p.last()) === JSON.stringify(byButton));

    const removeBtn = p.query('[data-act="remove"]').find(e => e.dataset.i === '0');
    if (removeBtn) { removeBtn.click(); }
    const removeByButton = p.last();
    p.send({ type: 'afctx', act: 'tbRemove', ctx: agentSkill });
    ok('…and so is removing it', JSON.stringify(p.last()) === JSON.stringify(removeByButton));

    // Acts that existed only on the sidebar tree until now. Copying opens the
    // page's own card (U-14) rather than a quickpick of agent names, so what it
    // "reaches" is the form — the target is chosen with the list still visible.
    p.send({ type: 'afctx', act: 'tbCopyAgent', ctx: agentSkill });
    ok('copying a skill to another agent opens the copy card on the page',
        p.html().indexOf('id="toolform"') >= 0 && p.html().indexOf('data-af="target"') >= 0);
    ok('the copy card names what is being copied',
        p.html().indexOf('account-signup') >= 0);
    p.query('[data-afact="cancel"]')[0].click();
    p.send({ type: 'afctx', act: 'tbScope', ctx: agentSkill });
    ok('moving it between scopes names the agent it is leaving',
        p.last().type === 'skillScope' && p.last().agentId === 'a1');

    tab('mcp');
    const mcp = p.contexts().find(c => c.afKind === 'mcp');
    ok('an MCP row says whether it has been probed and whether it is disabled',
        !!mcp && mcp.afProbed === false && mcp.afDisabled === false);
    p.send({ type: 'afctx', act: 'tbProbe', ctx: mcp });
    ok('probing asks the server named by the ROW',
        p.last().type === 'probe' && p.last().server === 'obsidian' && p.last().scope === 'agent');
    p.send({ type: 'afctx', act: 'tbMcp:off', ctx: mcp });
    ok('disabling it for this agent is one gesture',
        p.last().type === 'toggleMcp' && p.last().disabled === true && p.last().agentId === 'a1');
    // Editing is a form now, and the form needs the server's real definition —
    // the inventory row only carries a summary of it.
    p.send({ type: 'afctx', act: 'tbMcpEdit', ctx: mcp });
    ok('editing asks the host for the whole definition',
        p.last().type === 'mcp-def' && p.last().name === 'obsidian' && p.last().agentId === 'a1');
    ok('the edit card is already on screen while it is read',
        p.html().indexOf('id="toolform"') >= 0);
    p.send({ type: 'mcp-def', name: 'obsidian', def: { transport: 'stdio', command: 'npx', args: '-y\nsomething', env: '', url: '', headers: '' } });
    ok('the definition fills the card', p.html().indexOf('value="npx"') >= 0);
    ok('arguments are one per line, not one string',
        p.html().indexOf('data-af="args"') >= 0);
    p.query('[data-afact="cancel"]')[0].click();

    tab('plugin');
    const plug = p.contexts().find(c => c.afKind === 'plugin');
    ok('a plugin row says whether it is on, and whether it has a homepage',
        !!plug && plug.afOn === false && plug.afHome === true);
    ok('‼️ a plugin is not removable from here — it is enabled or disabled',
        plug.afRemovable === false);
    p.send({ type: 'afctx', act: 'tbPlug:1', ctx: plug });
    ok('enabling it writes the marketplace-qualified key',
        p.last().type === 'togglePlugin' && p.last().key === 'p1@m1' && p.last().on === true);
    p.send({ type: 'afctx', act: 'tbHome', ctx: plug });
    ok('its homepage opens externally', p.last().type === 'openExternal' && p.last().url === 'https://example.test');

    tab('settings');
    const cfg = p.contexts().find(c => c.afKind === 'settings');
    ok('‼️ a config file is not removable from here either', !!cfg && cfg.afRemovable === false);
}

// ============================================================ CAPABILITY MATRIX
{
    const p = runPage('capabilities.js', {
        generatedAt: NOW,
        agents: [{ id: 'a1', name: 'dev' }, { id: 'a2', name: 'ops' }],
        skills: [{
            name: 'signup', scope: 'agent', description: 'sign up',
            cells: { a1: { present: true, calls: 3, lastTs: NOW, source: 'D:/a/skills/signup/SKILL.md' } }
        }],
        mcp: [{
            name: 'shared', scope: 'user', transport: 'stdio', commandOrUrl: 'node x',
            cells: { a1: { present: true, calls: 0, source: 'C:/u/.claude.json' } }
        }],
        memory: [],
        duties: [{ title: 'watch the inbox', cells: { a1: { cadence: 'daily', source: 'D:/a/DUTIES.md' } } }],
        tasks: [{
            title: 'nightly backup', source: 'schedule', runsTotal: 4, alwaysFails: false,
            cells: { a1: { runs: 4, done: 4, failed: 0, lastTs: NOW } }
        }]
    });

    ok('the matrix renders its rows', p.html().includes('signup') && p.html().includes('watch the inbox'));

    const ctxs = p.contexts();
    const filled = ctxs.find(c => c.webviewSection === 'afCapCell' && c.capKind === 'skill' && c.capTo === 'a1');
    const hole = ctxs.find(c => c.webviewSection === 'afCapCell' && c.capKind === 'skill' && c.capTo === 'a2');
    ok('a filled cell publishes what is behind it',
        !!filled && filled.afPresent === true && filled.capSource === 'D:/a/skills/signup/SKILL.md');
    ok('an empty cell publishes that it can be filled',
        !!hole && hole.afPresent === false && hole.afCopyable === true);

    // ‼️ The menu must send exactly what the ＋ sends — with NO donor named,
    // because choosing the source is the host's job and the whole point of it.
    const plus = p.query('.copyhere').find(e => e.dataset.to === 'a2');
    p.posted.length = 0;
    if (plus) { plus.click(); }
    const byPlus = p.last();
    ok('the empty cell still has its ＋', !!byPlus);
    p.send({ type: 'afctx', act: 'capCopy', ctx: hole });
    ok('‼️ "copy it here" from the menu is the ＋\'s message, to the character',
        JSON.stringify(p.last()) === JSON.stringify(byPlus));
    ok('…and neither of them names a donor — the host picks',
        byPlus && byPlus.from === undefined);

    p.send({ type: 'afctx', act: 'capOpen', ctx: filled });
    ok('the file behind a cell opens by the path the CELL carries',
        p.last().type === 'open' && p.last().path === 'D:/a/skills/signup/SKILL.md');

    const shared = ctxs.find(c => c.webviewSection === 'afCapCell' && c.capKind === 'mcp' && c.capTo === 'a2');
    ok('‼️ a user-scope row is shared by everyone, so its holes are NOT copyable',
        !!shared && shared.afPresent === false && shared.afCopyable === false);

    const dutyHole = ctxs.find(c => c.webviewSection === 'afCapCell' && c.capKind === 'duty' && c.capTo === 'a2');
    ok('a duty behaves the same way — one cell contract for four kinds',
        !!dutyHole && dutyHole.afCopyable === true);
    p.send({ type: 'afctx', act: 'capCopy', ctx: dutyHole });
    ok('…and copying one routes to the duty message', p.last().type === 'copyDuty');

    const taskCell = ctxs.find(c => c.capKind === 'task' && c.capTo === 'a1');
    ok('a task cell says it is a task', !!taskCell);
    p.send({ type: 'afctx', act: 'capTasks', ctx: taskCell });
    ok('…and opens the full task history', p.last().type === 'openTaskHistory');

    const rowName = ctxs.find(c => c.webviewSection === 'afCapRow' && c.capName === 'signup');
    ok('the row name publishes itself too', !!rowName && rowName.capSource === 'D:/a/skills/signup/SKILL.md');
}

// ============================================================ FARM SETTINGS
{
    const p = runPage('settings.js', {
        focus: '',
        profiles: [],
        categories: [{
            id: 'live', label: 'Live', items: [
                { key: 'agentFarm.livePort', type: 'number', default: 0, description: 'listener port', value: 9000, modified: true },
                { key: 'agentFarm.liveMonitor', type: 'boolean', default: true, description: 'enable', value: true, modified: false }
            ]
        }],
        folders: {
            excludes: [],
            reports: [{
                root: 'D:/zone/agent/ajanlar', kind: 'nest', duplicate: false,
                candidates: [{ name: 'dev', dir: 'D:/zone/agent/ajanlar/dev', excluded: false, model: '' }]
            }]
        }
    });

    const ctxs = p.contexts();
    const changed = ctxs.find(c => c.setKey === 'agentFarm.livePort');
    const untouched = ctxs.find(c => c.setKey === 'agentFarm.liveMonitor');
    ok('a setting publishes its key', !!changed && changed.webviewSection === 'afSettingRow');
    ok('‼️ …and whether it has been changed, so "reset" is only ever drawn on one that has',
        !!changed && changed.afModified === true && !!untouched && untouched.afModified === false);

    p.posted.length = 0;
    p.send({ type: 'afctx', act: 'stReset', ctx: changed });
    ok('reset from the menu is the ↺ button\'s message',
        p.last().type === 'reset' && p.last().key === 'agentFarm.livePort');
    p.send({ type: 'afctx', act: 'stOpenUi', ctx: changed });
    ok('the same key opens in VS Code\'s own settings editor',
        p.last().type === 'openSettingsUi' && p.last().key === 'agentFarm.livePort');

    const root = ctxs.find(c => c.webviewSection === 'afAgentRoot');
    ok('an agent root publishes its path', !!root && root.rootPath === 'D:/zone/agent/ajanlar');
    p.send({ type: 'afctx', act: 'rtReveal', ctx: root });
    ok('revealing it is the Reveal button\'s message',
        p.last().type === 'rootReveal' && p.last().root === 'D:/zone/agent/ajanlar');
    p.send({ type: 'afctx', act: 'rtRemove', ctx: root });
    ok('…and removing it is the Remove button\'s',
        p.last().type === 'rootRemove' && p.last().root === 'D:/zone/agent/ajanlar');
}

// ============================================================ THE VAULT
{
    const p = runPage('secrets.js', {
        agentCount: 2,
        secrets: [
            { name: 'FAL_KEY', description: 'fal.ai', allAgents: true, agents: [], updatedAt: NOW },
            { name: 'TG_TOKEN', description: '', allAgents: false, agents: [{ id: 'a1', name: 'dev' }], updatedAt: NOW }
        ]
    });

    ok('the vault lists its secrets', p.html().includes('FAL_KEY') && p.html().includes('TG_TOKEN'));
    const s = p.contexts().find(c => c.secret === 'FAL_KEY');
    ok('a secret publishes its NAME and nothing else',
        !!s && s.webviewSection === 'afSecretRow' && s.value === undefined && s.description === undefined);

    p.posted.length = 0;
    const replaceBtn = p.query('[data-act="setValue"]').find(e => e.dataset.name === 'FAL_KEY');
    if (replaceBtn) { replaceBtn.click(); }
    const byButton = p.last();
    p.send({ type: 'afctx', act: 'scAct:setValue', ctx: s });
    ok('‼️ replacing a value from the menu is the row button\'s message, to the character',
        JSON.stringify(p.last()) === JSON.stringify(byButton));

    p.send({ type: 'afctx', act: 'scAct:editScope', ctx: s });
    ok('scoping it to agents is reachable from the row',
        p.last().type === 'editScope' && p.last().name === 'FAL_KEY');
}

// ---- ‼️ the vault exception, checked against the catalogue itself ----
{
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
    const web = pkg.contributes.menus['webview/context'];
    const onSecret = web.filter(e => String(e.when || '').includes('afSecretRow'));
    const titles = new Map((pkg.contributes.commands || []).map(c => [c.command, c.title]));
    const words = onSecret.map(e => String(titles.get(e.command) || '').toLowerCase());
    ok('the vault rows do have a menu', onSecret.length > 0);
    ok('‼️ NOTHING on a secret\'s menu copies its value — the value never leaves the keychain',
        !words.some(t => t.includes('value') && t.includes('copy')));
    ok('…and what it does copy is the name and the {secret:NAME} reference a prompt uses',
        words.some(t => t.includes('copy its name')) && words.some(t => t.includes('{secret:name}')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
