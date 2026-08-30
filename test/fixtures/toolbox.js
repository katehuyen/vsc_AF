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
const { bridgeStatus, budgetReading } =
    require(path.join(__dirname, '..', '..', 'out', 'core', 'telegramCockpit.js'));

const DAY = '2026-08-30';

/** One telegram block, built the way the panel builds it. */
const tg = (o) => {
    const allowedChats = o.allowedChats === undefined ? [-1001234567890, 88112233] : o.allowedChats;
    const maxDailyUSD = o.maxDailyUSD === undefined ? 1 : o.maxDailyUSD;
    const ledger = o.ledger || { day: DAY, usd: 0.3812 };
    return {
        enabled: o.enabled !== false,
        hasToken: o.hasToken !== false,
        ...(o.botUsername ? { botUsername: o.botUsername } : {}),
        allowedChats,
        maxDailyUSD,
        defaultAgent: o.defaultAgent === undefined ? 'developer' : o.defaultAgent,
        status: bridgeStatus({
            enabled: o.enabled !== false,
            hasToken: o.hasToken !== false,
            allowCount: allowedChats.length,
            ...(o.lastError ? { lastError: o.lastError } : {})
        }),
        budget: budgetReading(ledger, maxDailyUSD, DAY)
    };
};

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

const data = () => base({ telegram: tg({ botUsername: 'muvu_farm_bot' }) });

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
]);

module.exports = { script: 'toolbox.js', data, variants, tg, base };
