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
const { webStatus, webUrl } =
    require(path.join(__dirname, '..', '..', 'out', 'core', 'webCockpit.js'));
const { qrEncode, qrSvg } =
    require(path.join(__dirname, '..', '..', 'out', 'core', 'qr.js'));
const { remoteCardData } =
    require(path.join(__dirname, '..', '..', 'out', 'core', 'remoteCard.js'));
const { firewallVerdict } =
    require(path.join(__dirname, '..', '..', 'out', 'core', 'firewallVerdict.js'));

/** X-444 — the Agent Farm app card, composed by the same function the panel calls. */
const RNOW = Date.parse('2026-08-30T09:00:00Z');
const phone = (id, name, scope, daysAgo, revoked) =>
    ({ id, name, scope, pairedAt: RNOW - daysAgo * 864e5, revoked: !!revoked });
const remote = (o) => remoteCardData(Object.assign({
    mode: 'lan', port: 7443, runner: true,
    status: {
        listening: true, farm: { id: 'farm_7c1d9a', name: 'MURAT-PC' }, port: 7443,
        addresses: ['192.168.1.40:7443'], fingerprint: '3fa4'.repeat(16), sockets: 1
    },
    devices: [phone('d1', 'Pixel 8', 'answer', 3)]
}, o || {}), RNOW);

/**
 * U-85 — one web block, built the way `webCardData()` builds it: the verdict,
 * the link AND the code are asked for rather than typed, because all three are
 * the thing under test. ‼️ A hand-drawn QR in a fixture is a picture of a code
 * that was never encoded — and the one property that matters (does a scanner
 * read it) is exactly what a hand-drawn one cannot have.
 */
const web = (o) => {
    const s = Object.assign({
        enabled: true, port: 8378, bind: 'lan',
        token: '9f2c1a4e77b0d3568ae1cc02f4b9d716',
        serving: true, lanAddress: '192.168.1.40'
    }, o || {});
    const status = webStatus({
        enabled: s.enabled, port: s.port, bind: s.bind,
        hasToken: !!s.token, serving: s.serving, lanAddress: s.lanAddress
    });
    const url = s.token
        ? webUrl({ bind: s.bind, port: s.port, token: s.token, lanAddress: s.lanAddress }) : '';
    return Object.assign({
        enabled: s.enabled, port: s.port, bind: s.bind, hasToken: !!s.token,
        serving: s.serving, lanAddress: s.lanAddress, url, status
    }, status.phoneReachable && url
        ? { qr: qrSvg(qrEncode(url), { scale: 4, title: 'Open Agent Farm on your phone' }) }
        : {});
};

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
    /**
     * ‼️ U-85 — FOUR PICTURES, SMALLEST FIRST, because the card changes SHAPE
     * between them and not just colour: the off state has two buttons and no
     * code block, and the working one grows a 200px square beside a link that
     * has to wrap. The middle one is the scene this card exists for — every
     * switch correct, and the phone still cannot open anything.
     */
    {
        id: 'toolbox-web-off',
        label: 'Toolbox — Services: the web view is off (the smallest the card gets)',
        data: base({ telegram: tg({ botUsername: 'muvu_farm_bot' }), web: web({ enabled: false, serving: false }) })
    },
    {
        id: 'toolbox-web-notoken',
        label: 'Toolbox — Services: on, but no token, so the server refuses to start',
        data: base({ telegram: tg({ botUsername: 'muvu_farm_bot' }), web: web({ token: '', serving: false }) })
    },
    {
        id: 'toolbox-web-local',
        label: 'Toolbox — Services: ‼️ every switch right, bound to local, and NO phone can open it',
        data: base({ telegram: tg({ botUsername: 'muvu_farm_bot' }), web: web({ bind: 'local' }) })
    },
    {
        id: 'toolbox-web-lan',
        label: 'Toolbox — Services: reachable from the network, with the code that opens it',
        data: base({ telegram: tg({ botUsername: 'muvu_farm_bot' }), web: web() })
    },
    // X-444 — the Agent Farm app card, smallest first: off with no phone, one phone
    // listening, a fresh pairing code beside many phones, and a mode that could not listen
    {
        id: 'toolbox-remote-off',
        label: 'Toolbox — Services: the Agent Farm app is off and no phone is paired',
        data: base({ telegram: tg({ botUsername: 'muvu_farm_bot' }), web: web({ enabled: false, serving: false }),
            remote: remote({ mode: 'off', devices: [],
                status: { listening: false, farm: { id: 'farm_7c1d9a', name: 'MURAT-PC' }, addresses: [], sockets: 0,
                    reason: 'agentFarm.remote.listen is off' } }) })
    },
    {
        id: 'toolbox-remote-one',
        label: 'Toolbox — Services: listening on the Wi-Fi, one phone paired and none connected, so the firewall hint shows',
        data: base({ telegram: tg({ botUsername: 'muvu_farm_bot' }), web: web({ enabled: false, serving: false }),
            remote: remote({ status: { listening: true, farm: { id: 'farm_7c1d9a', name: 'MURAT-PC' }, port: 7443,
                addresses: ['192.168.1.40:7443'], fingerprint: '3fa4'.repeat(16), sockets: 0 } }) })
    },
    {
        id: 'toolbox-remote-firewall',
        label: 'Toolbox — Services: listening on a Public Wi-Fi where Windows Firewall stops phones, with the one-click fix',
        data: base({ telegram: tg({ botUsername: 'muvu_farm_bot' }), web: web({ enabled: false, serving: false }),
            remote: remote({ status: { listening: true, farm: { id: 'farm_7c1d9a', name: 'MURAT-PC' }, port: 7443,
                addresses: ['192.168.1.42:7443'], fingerprint: '3fa4'.repeat(16), sockets: 0 },
                firewall: firewallVerdict({ active: ['Public'], enabled: ['Domain', 'Private', 'Public'], shields: [], allow: ['Private'],
                    block: [], ourPorts: [], ourProfiles: [] }, 7443) }) })
    },
    {
        id: 'toolbox-remote-pair',
        label: 'Toolbox — Services: a fresh pairing code beside four phones, one revoked',
        data: base({ telegram: tg({ botUsername: 'muvu_farm_bot' }), web: web({ enabled: false, serving: false }),
            remote: remote({
                mode: 'tailscale',
                status: { listening: true, farm: { id: 'farm_7c1d9a', name: 'MURAT-PC' }, port: 7443,
                    addresses: ['100.101.12.7:7443'], fingerprint: '3fa4'.repeat(16), sockets: 2 },
                devices: [phone('d1', 'Pixel 8', 'answer', 3), phone('d2', 'Samsung Galaxy Tab S9 Ultra (salon)', 'manage', 40),
                    phone('d3', 'Eski telefon', 'read', 120, true), phone('d4', 'İş telefonu', 'admin', 1)],
                pair: { link: 'agentfarm://pair?v=1&farm=farm_7c1d9a&name=MURAT-PC&code=483920&fp=' + '3fa4'.repeat(16)
                    + '&a=100.101.12.7:7443', addresses: ['100.101.12.7:7443'], until: RNOW + 9 * 60e3 }
            }) })
    },
    {
        id: 'toolbox-remote-failed',
        label: 'Toolbox — Services: Tailscale chosen, but this machine has no tailnet address',
        data: base({ telegram: tg({ botUsername: 'muvu_farm_bot' }), web: web({ enabled: false, serving: false }),
            remote: remote({ mode: 'tailscale',
                status: { listening: false, farm: { id: 'farm_7c1d9a', name: 'MURAT-PC' }, addresses: [], sockets: 0,
                    reason: 'no Tailscale address on this machine (100.64.0.0/10) - is Tailscale running?' } }) })
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

module.exports = { script: 'toolbox.js', data, variants, tg, base, hooks, web };
