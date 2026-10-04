/**
 * U-84 (the Farm Settings half) — Settings ▸ Access & Remote, where four rows
 * configure the Telegram bridge and none of them can say whether it is up.
 *
 * ‼️ THE CARD DATA IS THE TOOLBOX FIXTURE'S OWN `tg()`, on purpose. The whole
 * claim of this half is that the two surfaces draw ONE card; a fixture that
 * built its own object here could photograph two pages agreeing while the code
 * behind them had diverged. It is `telegramCard()` in both places or the shot
 * proves nothing.
 *
 * ‼️ AND THE ROWS BELOW THE CARD ARE THE REAL ONES. `allowedChats` carries the
 * shape the manifest gives it (U-108's list editor, `kind: 'list'`), and
 * `defaultAgent` carries `values: 'agent'` — the picker U-84 (d) asks for. A
 * fixture that dropped either would show a page nobody gets.
 */
const { tg } = require('./toolbox');

const AGENTS = ['asistan', 'developer', 'psikolog', 'yazar'];

const ITEMS = (o) => ([
    {
        key: 'agentFarm.telegram.enabled', type: 'boolean', default: false,
        value: o.enabled !== false, modified: o.enabled !== false,
        description: 'Let a Telegram chat talk to your agents: send a message, the agent the chat is bound to runs it headlessly, and the answer comes back in the same thread.'
    },
    {
        key: 'agentFarm.telegram.allowedChats', type: 'array', default: [],
        value: o.allowedChats === undefined ? [-1001234567890, 88112233] : o.allowedChats,
        modified: true,
        shape: {
            kind: 'list', itemType: 'number', fields: [], example: [0],
            summary: 'A plain list of numbers — one per entry. There is no structure to get right here; it is the list itself.'
        },
        description: 'Telegram chat ids allowed to drive the farm. EMPTY = nobody can (the bridge answers every message with a refusal and its own chat id).'
    },
    {
        key: 'agentFarm.telegram.maxDailyUSD', type: 'number', default: 1,
        value: o.maxDailyUSD === undefined ? 1 : o.maxDailyUSD, modified: false,
        description: 'Ceiling on what remote work may cost per day (API-equivalent), shared by Telegram and the Agent Farm phone app: one total, whichever spent it. Past it a new run from chat is refused and a message into a live conversation asks for a yes first. 0 = every remote message asks and no run starts from chat; commands like /status keep working.'
    },
    {
        key: 'agentFarm.telegram.defaultAgent', type: 'string', default: '',
        value: o.defaultAgent === undefined ? 'developer' : o.defaultAgent,
        modified: true, values: 'agent',
        description: 'Agent a new chat talks to before it picks one with /agent. Empty = a chat must bind an agent first.'
    },
    {
        key: 'agentFarm.web.enabled', type: 'boolean', default: false, value: false, modified: false,
        description: 'Serve a read-only view of the farm over HTTP so a phone on the same Wi-Fi can watch it.'
    },
    {
        key: 'agentFarm.web.port', type: 'number', default: 8378, value: 8378, modified: false,
        description: 'Port the read-only web view listens on.'
    }
]);

const base = (o) => ({
    focus: '', profiles: [], prompts: null, docOpen: null, folders: null,
    claude: null, engines: null, engineModels: null, wiki: null, superpowers: null,
    alerts: null,
    modelAliases: ['haiku', 'sonnet', 'opus', 'fable'],
    categories: [{ id: 'access', label: 'Access & Remote', items: ITEMS(o) }],
    telegram: tg(o),
    valueSources: { agent: AGENTS }
});

const data = () => base({ botUsername: 'muvu_farm_bot' });

const variants = () => ([
    {
        id: 'tgsettings',
        label: 'Settings ▸ Access — the bridge is up, and the rows below own the controls',
        data: base({ botUsername: 'muvu_farm_bot' })
    },
    {
        id: 'tgsettings-notoken',
        label: 'Settings ▸ Access — ‼️ switched on, no token: the failure a settings row cannot show',
        data: base({ hasToken: false, allowedChats: [] })
    },
    {
        id: 'tgsettings-nochats',
        label: 'Settings ▸ Access — polling, and refusing every message it gets',
        data: base({ botUsername: 'muvu_farm_bot', allowedChats: [] })
    },
    {
        id: 'tgsettings-over',
        label: 'Settings ▸ Access — the day’s ceiling is reached',
        data: base({
            botUsername: 'muvu_farm_bot', maxDailyUSD: 0.25,
            ledger: { day: '2026-08-30', usd: 0.4102 }
        })
    },
    {
        id: 'tgsettings-stranger',
        label: 'Settings ▸ Access — ‼️ the default agent is a name this machine does not have',
        data: base({ botUsername: 'muvu_farm_bot', defaultAgent: 'arastirmaci' })
    }
]);

module.exports = { script: 'settings.js', data, variants, ITEMS, base };
