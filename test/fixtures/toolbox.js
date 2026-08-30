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
    }
]);

module.exports = { script: 'toolbox.js', data, variants, tg, base, hooks };
