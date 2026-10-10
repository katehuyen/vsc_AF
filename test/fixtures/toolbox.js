/**
 * U-84 — the Toolbox Services tab, in the five states the Telegram bridge can
 * actually be in.
 *
 * ‼️ THE SHAPE HERE IS THE SHAPE `buildServices()` RETURNS, field for field.
 * A fixture that invents a convenient object photographs a page nobody will
 * ever see: `status` and `budget` arrive ALREADY DECIDED from
 * `core/telegramCockpit.ts`, so they are computed here by the same functions
 * rather than typed out by hand — a hand-typed badge would go on looking right
 * long after the rule behind it changed.
 */
const path = require('path');
const { telegramCard } =
    require(path.join(__dirname, '..', '..', 'out', 'core', 'telegramCockpit.js'));
const { hooksStatus } =
    require(path.join(__dirname, '..', '..', 'out', 'core', 'hooksCockpit.js'));

/**
 * U-86 — one hooks block, built the way `buildHooks()` builds it: the status is
 * ASKED FOR, never typed out. A hand-written badge goes on looking right long
 * after the rule behind it changed.
 */
const HOOK_FILES = (userOn, agentsOn) => ([
    { scope: 'user', file: 'C:\\Users\\rotam\\.claude\\settings.json', installed: userOn },
    { scope: 'agent', agent: 'developer', file: 'D:\\zone\\agent\\ajanlar\\developer\\.claude\\settings.local.json', installed: agentsOn },
    { scope: 'agent', agent: 'asistan', file: 'D:\\zone\\agent\\ajanlar\\asistan\\.claude\\settings.local.json', installed: agentsOn }
]);

const hooks = (o) => {
    const opt = o || {};
    const port = opt.port === undefined ? 8377 : opt.port;
    const listener = opt.listener || 'listening';
    const targets = opt.targets || HOOK_FILES(
        opt.userOn !== false, opt.agentsOn !== false);
    const holder = opt.holder;
    return {
        port, listener, targets,
        command: 'curl -s -X POST http://127.0.0.1:' + port + '/event -H "content-type: application/json" -d @-',
        ...(holder ? { holder } : {}),
        status: hooksStatus({ listener, port, targets, ...(holder ? { holder } : {}) })
    };
};

const DAY = '2026-08-30';

/** One telegram block, built by the function the panels build it with —
 *  `telegramCard` is the single composer both surfaces go through. */
const tg = (o) => telegramCard({
    enabled: o.enabled !== false,
    hasToken: o.hasToken !== false,
    ...(o.botUsername ? { botUsername: o.botUsername } : {}),
    allowedChats: o.allowedChats === undefined ? [-1001234567890, 88112233] : o.allowedChats,
    maxDailyUSD: o.maxDailyUSD === undefined ? 1 : o.maxDailyUSD,
    defaultAgent: o.defaultAgent === undefined ? 'developer' : o.defaultAgent,
    ledger: o.ledger || { day: DAY, usd: 0.3812 },
    day: DAY,
    ...(o.lastError ? { lastError: o.lastError } : {})
});

const counts = () => ({
    skill: { user: 12, agent: 5 },
    subagent: { user: 3, agent: 2 },
    command: { user: 9, agent: 0 },
    mcp: { user: 4, agent: 1 },
    hook: { user: 6, agent: 0 },
    plugin: { user: 2, agent: 0 },
    style: { user: 1, agent: 0 },
    settings: { user: 3, agent: 4 }
});

const base = (services) => ({
    tab: 'service',
    generatedAt: Date.parse('2026-08-30T09:00:00Z'),
    agents: [
        { id: 'developer', name: 'developer' },
        { id: 'manager', name: 'manager' },
        { id: 'psikolog', name: 'psikolog' }
    ],
    counts: counts(),
    items: [],
    probeCache: {},
    paths: {
        userClaudeDir: 'C:\\Users\\x\\.claude',
        userConfigJson: 'C:\\Users\\x\\.claude.json'
    },
    services
});

const data = () => base({ telegram: tg({ botUsername: 'muvu_farm_bot' }), hooks: hooks() });

/** X-456 — a few tools of each table kind, so the inventory tabs draw rows (on a phone: cards). */
const TOOLS = () => ([
    { kind: 'skill', name: 'account-signup', scope: 'user', description: 'Sign one Google account up to a list of web services via Continue with Google.', source: 'C:\\Users\\x\\.claude\\skills\\account-signup\\SKILL.md', dir: 'C:\\Users\\x\\.claude\\skills\\account-signup', detail: { usage30d: 4 } },
    { kind: 'skill', name: 'superpowers-brainstorming', scope: 'agent', agentId: 'developer', agentName: 'developer', description: 'Turn a rough idea into a design before any code is written.', source: 'D:\\zone\\agent\\ajanlar\\developer\\.claude\\skills\\brainstorming\\SKILL.md', detail: { usage30d: 0 } },
    { kind: 'mcp', name: 'obsidian', scope: 'agent', agentId: 'developer', agentName: 'developer', description: 'npx -y obsidian-mcp-server --vault D:\\zone\\know\\note\\obsidian', source: 'D:\\zone\\agent\\ajanlar\\developer\\.mcp.json', detail: { transport: 'stdio', disabled: false } },
    { kind: 'mcp', name: 'playwright', scope: 'user', description: 'npx @playwright/mcp@latest', source: 'C:\\Users\\x\\.claude.json', detail: { transport: 'stdio' } },
    { kind: 'plugin', name: 'claude-plugins-official', scope: 'user', description: 'The official marketplace', source: 'C:\\Users\\x\\.claude\\plugins\\marketplaces\\official\\marketplace.json', detail: { isMarketplace: true, pluginCount: 2, lastUpdated: '2026-08-28' } },
    { kind: 'plugin', name: 'code-review', scope: 'user', description: 'Review the current diff for correctness bugs.', source: 'x', detail: { plugin: 'code-review', marketplace: 'claude-plugins-official', enabled: true, category: 'development', author: 'Anthropic', homepage: 'https://example.com/code-review' } },
    { kind: 'plugin', name: 'security-review', scope: 'user', description: 'Complete a security review of the pending changes on the current branch.', source: 'x', detail: { plugin: 'security-review', marketplace: 'claude-plugins-official', enabled: false, category: 'security', author: 'Anthropic' } }
]);
const PROBES = () => ({ 'agent:developer:obsidian': { ok: true, probedAt: Date.parse('2026-08-30T08:00:00Z'), ms: 840, tools: [{ name: 'vault_read', params: ['path'], description: 'Read a note' }, { name: 'vault_append', params: ['path', 'content'], description: 'Append to a note' }] } });

/** U-155 — the shipped rules as kapici.rules answers them (src/core/kapici/builtinRules.ts). */
const KAPICI_RULES = () => ([
    { id: 'dispatch.route', version: 1, description: 'Which agent should take this request? The candidates arrive with the call.', layer: 'builtin', providers: ['jev', 'llm'], questions: { agent: 'choice' }, minConfidence: 0.7, onLowConfidence: 'mechanical', onFailure: 'fallback', golden: 5 },
    { id: 'retry.next-action', version: 1, description: 'What should a run that hit its limit after doing work do next?', layer: 'builtin', providers: ['jev', 'llm'], questions: { action: 'choice' }, minConfidence: 0.75, onLowConfidence: 'mechanical', onFailure: 'fallback', golden: 5 },
    { id: 'trigger.has-work', version: 1, description: 'Does this firing carry real work for the agent it would wake?', layer: 'builtin', providers: ['jev', 'llm'], questions: { work: 'noul' }, minConfidence: 0.6, onLowConfidence: 'mechanical', onFailure: 'open', golden: 5 }
]);

/**
 * ‼️ FIVE PICTURES, BECAUSE THE BADGE IS THE WHOLE FEATURE. Each state sends a
 * person somewhere different, and the only way to know the four colours are
 * distinguishable — in both themes — is to see them beside each other.
 */
const variants = () => ([
    {
        id: 'toolbox', label: 'Toolbox — Services: the bridge is connected',
        data: base({ telegram: tg({ botUsername: 'muvu_farm_bot' }) })
    },
    {
        id: 'toolbox-notoken', label: 'Toolbox — Services: no bot token in the vault',
        data: base({ telegram: tg({ hasToken: false, allowedChats: [] }) })
    },
    {
        id: 'toolbox-nochats', label: 'Toolbox — Services: polling, but the allowlist is empty',
        data: base({ telegram: tg({ botUsername: 'muvu_farm_bot', allowedChats: [] }) })
    },
    {
        id: 'toolbox-error', label: 'Toolbox — Services: the last poll failed',
        data: base({
            telegram: tg({
                botUsername: 'muvu_farm_bot',
                lastError: 'getaddrinfo ENOTFOUND api.telegram.org'
            })
        })
    },
    {
        // The ceiling reached, which is the one state where a figure and a
        // colour have to agree: a full red bar beside a spend over its cap.
        id: 'toolbox-capped', label: 'Toolbox — Services: switched off, and today’s ceiling already spent',
        data: base({
            telegram: tg({
                enabled: false, botUsername: 'muvu_farm_bot',
                ledger: { day: DAY, usd: 1.4102 }
            })
        })
    },
    {
        id: 'toolbox-overview', label: 'Toolbox — the overview, where Services shows a state and not a count',
        data: { ...base({ telegram: tg({ botUsername: 'muvu_farm_bot' }) }), tab: 'overview' }
    }
    ,
    // X-456 — the inventory tabs, so a phone's view of a tool table can be looked at
    { id: 'toolbox-skills', label: 'Toolbox — Skills: the inventory table', data: { ...base({ telegram: tg({ botUsername: 'muvu_farm_bot' }) }), items: TOOLS(), tab: 'skill' } },
    { id: 'toolbox-mcp', label: 'Toolbox — MCP: the servers table', data: { ...base({ telegram: tg({ botUsername: 'muvu_farm_bot' }) }), items: TOOLS(), probeCache: PROBES(), tab: 'mcp' } },
    { id: 'toolbox-plugins', label: 'Toolbox — Plugins: the plugins table', data: { ...base({ telegram: tg({ botUsername: 'muvu_farm_bot' }) }), items: TOOLS(), tab: 'plugin' } },
    {
        id: 'toolbox-hooks', label: 'Toolbox — Services: the live hooks are in and the listener is up',
        data: base({ telegram: tg({ botUsername: 'muvu_farm_bot' }), hooks: hooks() })
    },
    {
        id: 'toolbox-hooks-blind',
        label: 'Toolbox — Services: ‼️ no file carries the hooks, so the farm is BLIND',
        data: base({ telegram: tg({ botUsername: 'muvu_farm_bot' }), hooks: hooks({ userOn: false, agentsOn: false }) })
    },
    {
        id: 'toolbox-hooks-partial',
        label: 'Toolbox — Services: agent files only, so sessions outside them vanish',
        data: base({ telegram: tg({ botUsername: 'muvu_farm_bot' }), hooks: hooks({ userOn: false }) })
    },
    {
        id: 'toolbox-hooks-port',
        label: 'Toolbox — Services: ‼️ a stranger holds the port, and stopping it IS offered',
        data: base({
            telegram: tg({ botUsername: 'muvu_farm_bot' }),
            hooks: hooks({
                listener: 'port-in-use',
                holder: {
                    kind: 'stranger', pid: 9184, name: 'node.exe', canStop: true,
                    detail: 'node.exe (pid 9184) holds port 8377, so the live listener could not bind. Stopping it frees the port.'
                }
            })
        })
    },
    {
        id: 'toolbox-hooks-otherwindow',
        label: 'Toolbox — Services: another VS Code has the port, and killing it is NOT offered',
        data: base({
            telegram: tg({ botUsername: 'muvu_farm_bot' }),
            hooks: hooks({
                listener: 'port-in-use',
                holder: {
                    kind: 'other-window', pid: 387884, name: 'Code.exe', canStop: false,
                    detail: 'Another VS Code window (pid 387884) holds port 8377, so the hooks are reporting to that one. Close it, or give this window its own `agentFarm.livePort`.'
                }
            })
        })
    },
    // U-155 — the Kapıcı tab: the three rules that ship (as kapici.rules answers them today), then a user
    // file replacing one, a rule of the user's own, and a file that failed to load — its row's panel open
    {
        id: 'toolbox-kapici',
        label: 'Toolbox — Gatekeeper: the rules that ship with Agent Farm (U-155)',
        data: Object.assign(base({ telegram: tg({ botUsername: 'muvu_farm_bot' }) }), { tab: 'kapici', kapici: { rules: KAPICI_RULES(), problems: [] } })
    },
    {
        id: 'toolbox-kapici-own',
        label: 'Toolbox — Gatekeeper: a file replacing a shipped rule, one of the user\'s own, one that broke (U-155)',
        data: kapiciOwn()
    },
    {
        id: 'toolbox-kapici-own-tip', tip: 'tip-kpc-rule:2',
        label: 'Toolbox — Gatekeeper: the replaced rule\'s panel, open (U-155)',
        data: kapiciOwn()
    }
]);

function kapiciOwn() {
    return Object.assign(base({ telegram: tg({ botUsername: 'muvu_farm_bot' }) }), { tab: 'kapici', kapici: {
            rules: KAPICI_RULES().map(r => r.id !== 'retry.next-action' ? r : Object.assign({}, r, {
                version: 2, layer: 'system', file: 'D:\\zone\\agent\\ajanlar\\_KAPICI\\retry.next-action.json', overrides: ['builtin'],
                minConfidence: 0.75, onLowConfidence: 'mechanical', onFailure: 'mechanical', golden: 8 })).concat([{
                id: 'metin.tek-satir', version: 1, description: 'Is this text a single line a title can use?', layer: 'project',
                file: 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm\\.kapici\\metin.tek-satir.json', providers: ['heuristic'],
                questions: { line: 'noul (local check)' }, minConfidence: 0.9, onLowConfidence: 'closed', onFailure: 'closed', golden: 3 }]),
            problems: [{ layer: 'system', file: 'D:\\zone\\agent\\ajanlar\\_KAPICI\\medya.tur.json', error: 'questions.kind: needs a type' }]
        } });
}

module.exports = { script: 'toolbox.js', data, variants, tg, base, hooks };
