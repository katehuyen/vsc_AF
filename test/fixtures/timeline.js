/**
 * The Live Timeline with EVERY ENGINE on it (X-35, U-59).
 *
 * ‼️ THIS FIXTURE IS THE REPORTED BUG, DRAWN. Until X-35 this page could only
 * ever show Claude: it is fed by the hook stream, Claude Code is the only engine
 * that fires hooks, and a conversation Agent Farm hosted on Codex or Antigravity
 * therefore ran to completion with nothing on the page at all. The rows below
 * are one of each — a Claude session with its own hooks, two hosted per-turn
 * engines mirrored in by the extension, and a Gemini CLI in a plain terminal
 * where open-and-close really is all there is to see.
 *
 * What the picture is for: four distinct badge colours (never one "not Claude"
 * purple), the engine segment with its counts, and the lifecycle-only wording on
 * the ONE row it is still true of.
 */
/**
 * ‼️ THIS ONE FIXTURE IS RELATIVE TO THE REAL CLOCK, AND HAS TO BE.
 *
 * Every other fixture here pins a date so the picture is reproducible. This page
 * cannot: the swim lanes are drawn from `Date.now()` back over the selected
 * window, and `relTime` counts against it too — so a pinned stamp puts every
 * event outside the window and produces an empty chart with "last event -13317s
 * ago" underneath it. Measured while writing this file; the blank lanes were the
 * fixture, not the page.
 */
const NOW = Date.now();

// ‼️ X-112 — THE FIXTURE ASKS THE PRODUCT, IT DOES NOT RETELL IT. A hand-written
// billing block is a second wording of the one rule, and the scene then
// photographs a page nobody ships.
const { billingOf } = require(require('path').join(__dirname, '..', '..', 'out', 'core', 'billing.js'));
const billing = v => billingOf(Object.assign({ engine: 'claude', binding: 'declared' }, v));
const min = n => NOW - n * 60000;

const sessions = () => ([
    {
        sessionId: '407c78cb-2f1a-4d55-9e10-1b2c3d4e5f60',
        agentName: 'developer', resolved: true, label: 'developer',
        source: undefined,                 // a Claude transcript states no engine
        // ‼️ X-251 — WHOSE PLAN THIS CARD IS SPENDING. Drawn on ONE of the
        // cards on purpose: the panel must be readable both when a sign-in was
        // recorded and when nothing was, and the second case is the ordinary
        // one for every session started before the manifest carried it.
        account: 'wmmuratvural@gmail.com',
        // X-110 — and WHICH PROVIDER served it, as the host's one reader
        // answers it: a declared Kimi route the engine confirmed. Drawn on the
        // card beside the engine badge; the codex card below has no route and
        // wears no chip, which is the other case worth picturing.
        identity: {
            engine: 'claude', providerId: 'kimi', providerLabel: 'Kimi (work)',
            origin: 'agent-farm-profile', scope: 'session',
            providerProfileId: 'kimi-work', providerProfileRevision: 3,
            requestedModelRef: 'kimi-k2-thinking',
            reportedProviderIds: ['kimi'], reportedModels: ['kimi-k2-thinking'],
            proof: 'matched', multiProvider: false, turnScope: false,
            agreement: 'matched', binding: 'declared',
            // X-112 — and therefore whose window and whose bill. Asked of the
            // product so the scene cannot photograph a wording nobody ships.
            billing: billing({
                providerId: 'kimi', providerLabel: 'Kimi (work)',
                route: { baseUrl: 'https://api.moonshot.ai/anthropic', authKind: 'api-key' }
            })
        },
        status: 'tool', currentTool: 'Edit',
        lastPrompt: 'X-35 multi motor adaptasyonu — Live Timeline',
        // ‼️ U-81 — AND THE LAST PROMPT HAS TWO LENGTHS TOO. `lastPrompt` is the
        // 90 characters a row can hold; `lastPromptFull` is what the hover panel
        // exists to show. The fixture only ever carried the cut one, so a panel
        // handing back that same cut line passed every test there was.
        lastPromptFull: 'X-35 multi motor adaptasyonu — Live Timeline sayfasındaki '
            + 'kartların hepsi tek tek gözden geçirilsin: hangi satır hangi olguyu '
            + 'söylüyor, hangisi bir başkasının konusunu tekrar ediyor. Kartın adı '
            + 'ile son sorulan şey birbirine benzemesin, ikisi de kırpılmadan '
            + 'panelde okunabilsin ve panel kaydırılabilir olsun.',
        // ‼️ U-81 — A SESSION HAS TWO PROMPTS AND THE FIXTURE ONLY EVER HAD ONE,
        // which is exactly why nobody noticed that the card drew the LAST one
        // and its panel opened the FIRST. The opening prompt is also the long
        // text on this page, so it is what a picture of the panel has to show.
        firstPrompt: 'Live Timeline sayfasını bütün motorlar için aç: hook akışı yalnızca '
            + 'Claude\'dan geliyor, ama Console\'un barındırdığı her konuşma — Codex, '
            + 'Gemini, Antigravity — aynı kartı ve aynı şeridi hak ediyor. Rozetin rengi '
            + 'motorun kendi rengi olsun, ve "lifecycle only" ifadesi yalnızca gerçekten '
            + 'kendi terminalinde açılıp kapanan CLI için yazılsın.',
        startedAt: min(96), lastEventTs: min(0.4),
        prompts: 14, toolCalls: 213, compactions: 1, subagentStops: 3, errors: 2,
        cwd: 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm',
        transcriptPath: 'C:\\Users\\x\\.claude\\projects\\vsc_AgentFarm\\407c78cb.jsonl',
        title: 'X-35 multi motor adaptasyonu artık tam olsun',
        cost: 4.81, tokens: 3_180_000, wTokens: 1_240_000, ctxTokens: 186_400,
        turns: 14, model: 'claude-opus-5', filesEdited: 9,
        owner: { pid: 24188, entrypoint: 'sdk-cli', status: 'idle' }
    },
    {
        // ‼️ A HOSTED CODEX THREAD. Its id is a plain UUID minted by the engine,
        // so nothing in it can be parsed for a name — the engine is stated on the
        // event (LiveEvent.engine) and that is the only reason this badge is
        // right. Full detail, because Agent Farm hosts it and mirrors the turns.
        sessionId: '019ff43f-ff3d-7790-9431-63799a45b1b2',
        agentName: 'developer', resolved: true, label: 'developer #2',
        source: 'codex',
        account: 'murposta2@gmail.com',
        status: 'working', currentTool: undefined,
        lastPrompt: 'rewrite the rollout parser and run the suite',
        startedAt: min(41), lastEventTs: min(0.2),
        prompts: 6, toolCalls: 58, compactions: 0, subagentStops: 0, errors: 1,
        cwd: 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm',
        transcriptPath: '',
        title: 'rewrite the rollout parser and run the suite',
        // The ctx figure the user saw as 38M, now the window it actually held.
        cost: 0, tokens: 32_800_358, wTokens: 0, ctxTokens: 93_625,
        turns: 6, model: 'gpt-5.6-sol', filesEdited: 4,
        owner: null
    },
    {
        // ‼️ THE THIRD `developer` ROW — the fixture U-66 exists for. Three
        // concurrent sessions of ONE agent, each with its own YOUR TURN
        // selection: sound here, focus+modal above, toast below. Until the
        // controls were keyed by session this picture was impossible to draw,
        // because all three rows showed the agent's single setting.
        sessionId: '5b31d907-84ac-4e21-a7d0-9f5512ab3300',
        agentName: 'developer', resolved: true, label: 'developer #3',
        source: undefined,
        status: 'waiting-input',
        lastPrompt: 'U-66 kabul matrisi — üç eşzamanlı oturum, üç ayrı uyarı',
        startedAt: min(63), lastEventTs: min(1),
        prompts: 9, toolCalls: 74, compactions: 0, subagentStops: 1, errors: 0,
        cwd: 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm',
        transcriptPath: 'C:\\Users\\x\\.claude\\projects\\vsc_AgentFarm\\5b31d907.jsonl',
        title: 'U-66 — YOUR TURN uyarıları oturum-kimlikli olsun',
        cost: 2.14, tokens: 1_402_000, wTokens: 690_000, ctxTokens: 121_300,
        turns: 9, model: 'claude-opus-5', filesEdited: 5,
        owner: { pid: 30112, entrypoint: 'sdk-cli', status: 'idle' }
    },
    {
        // A hosted Antigravity conversation: Agent Farm keeps its transcript too.
        sessionId: 'agy-9d21c4e7-55ab-4f01-8c33-77e0a1b2c3d4',
        agentName: 'basit', resolved: true, label: 'basit',
        source: 'agy',
        status: 'waiting-input',
        lastPrompt: 'summarise the backlog block I pasted',
        startedAt: min(18), lastEventTs: min(2),
        prompts: 3, toolCalls: 7, compactions: 0, subagentStops: 0, errors: 0,
        cwd: 'D:\\zone\\agent\\ajanlar\\basit',
        transcriptPath: '',
        title: 'summarise the backlog block I pasted',
        cost: 0, tokens: 41_902, wTokens: 0, ctxTokens: 25_595,
        turns: 3, model: 'gemini-3.1-pro', filesEdited: 0,
        owner: null
    },
    {
        // ‼️ THE ONE ROW "lifecycle only" IS STILL TRUE OF: a foreign CLI in its
        // own terminal. Agent Farm opened the window and will see it close, and
        // that is the whole of it — no prompts, no tools, no figures.
        sessionId: 'cli:gemini:psikolog:1786000000000',
        agentName: 'psikolog', resolved: true, label: 'psikolog',
        source: 'gemini',
        status: 'idle',
        lastPrompt: '',
        startedAt: min(7), lastEventTs: min(7),
        prompts: 0, toolCalls: 0, compactions: 0, subagentStops: 0, errors: 0,
        cwd: 'D:\\zone\\agent\\ajanlar\\psikolog',
        transcriptPath: '',
        title: '', cost: 0, tokens: 0, wTokens: 0, ctxTokens: 0,
        turns: 0, model: '', filesEdited: 0,
        owner: null
    },
    {
        // ‼️ U-59 — THE FIFTH ENGINE, ON THE ONE PAGE WHERE FIVE BADGES SHARE A
        // ROW OF SEGMENTS. The engine filter is drawn from what is on screen, so
        // an engine that never appears in this fixture is an engine whose badge,
        // colour and segment nobody has ever looked at. It is also the one row
        // besides Claude that carries a REAL price — a `$` beside a
        // `provider/model` id is the width case this page has never had.
        sessionId: 'ses_7f2c1a90d4e8b6',
        agentName: 'manager', resolved: true, label: 'manager',
        source: 'opencode',
        // X-110 — an OpenCode run that changed provider at a turn boundary: the
        // chip COUNTS ("2 providers"), it does not name — and that is the widest
        // text the mark ever carries, so it is the one to measure.
        identity: {
            engine: 'opencode', providerId: 'anthropic', providerLabel: '',
            origin: 'engine-native', scope: 'turn',
            providerProfileId: '', providerProfileRevision: null,
            requestedModelRef: 'anthropic/claude-sonnet-5',
            reportedProviderIds: ['anthropic', 'openai'], reportedModels: ['claude-sonnet-5', 'gpt-5.6'],
            proof: 'matched', multiProvider: true, turnScope: true,
            agreement: 'matched', binding: 'declared',
            billing: billing({ engine: 'opencode', providerId: 'anthropic' })
        },
        status: 'working',
        lastPrompt: 'go through the queue and tell me what is blocked',
        startedAt: min(11), lastEventTs: min(1),
        prompts: 2, toolCalls: 3, compactions: 0, subagentStops: 0, errors: 0,
        cwd: 'D:\\zone\\agent\\ajanlar\\manager',
        transcriptPath: '',
        title: 'queue triage',
        cost: 0.0184, tokens: 63_411, wTokens: 0, ctxTokens: 31_004,
        turns: 2, model: 'opencode/big-pickle', filesEdited: 0,
        owner: null
    }
]);

/** A believable event stream: every row's engine is on its own events, which is
 *  what lets the engine segment filter the swim lanes and not just the cards. */
const events = () => {
    const out = [];
    const push = (sessionId, agentName, engine, kind, atMin, extra) =>
        out.push(Object.assign({
            ts: min(atMin), sessionId, agentName, kind
        }, engine ? { engine } : {}, extra || {}));

    // Claude — hooks, so no `engine` field at all on the older lines.
    push('407c78cb-2f1a-4d55-9e10-1b2c3d4e5f60', 'developer', '', 'start', 96);
    for (let i = 0; i < 9; i++) {
        push('407c78cb-2f1a-4d55-9e10-1b2c3d4e5f60', 'developer', '', 'prompt', 90 - i * 10,
            { detail: 'turn ' + (i + 1) });
        push('407c78cb-2f1a-4d55-9e10-1b2c3d4e5f60', 'developer', '', 'toolStart', 89 - i * 10,
            { tool: i % 3 === 0 ? 'Edit' : i % 3 === 1 ? 'Bash' : 'Read', detail: 'src/core/live.ts' });
        push('407c78cb-2f1a-4d55-9e10-1b2c3d4e5f60', 'developer', '', 'toolEnd', 88 - i * 10,
            { tool: i % 3 === 0 ? 'Edit' : i % 3 === 1 ? 'Bash' : 'Read' });
    }
    push('407c78cb-2f1a-4d55-9e10-1b2c3d4e5f60', 'developer', '', 'compact', 44, { detail: 'auto' });
    push('407c78cb-2f1a-4d55-9e10-1b2c3d4e5f60', 'developer', '', 'permission', 12,
        { detail: 'Bash wants to run npm run package' });
    push('407c78cb-2f1a-4d55-9e10-1b2c3d4e5f60', 'developer', '', 'toolStart', 0.4,
        { tool: 'Edit', detail: 'media/timeline.js' });

    // Codex — mirrored in, so every line names its engine.
    push('019ff43f-ff3d-7790-9431-63799a45b1b2', 'developer', 'codex', 'start', 41);
    for (let i = 0; i < 5; i++) {
        push('019ff43f-ff3d-7790-9431-63799a45b1b2', 'developer', 'codex', 'prompt', 38 - i * 7,
            { detail: 'codex turn ' + (i + 1) });
        push('019ff43f-ff3d-7790-9431-63799a45b1b2', 'developer', 'codex', 'toolStart', 37 - i * 7,
            { tool: 'Bash', detail: 'cargo test --all' });
        push('019ff43f-ff3d-7790-9431-63799a45b1b2', 'developer', 'codex', 'toolEnd', 35 - i * 7,
            { tool: 'Bash' });
    }
    push('019ff43f-ff3d-7790-9431-63799a45b1b2', 'developer', 'codex', 'prompt', 0.2,
        { detail: 'now run the whole suite' });

    // The third developer session — its own row, its own alert selection.
    push('5b31d907-84ac-4e21-a7d0-9f5512ab3300', 'developer', '', 'start', 63);
    for (let i = 0; i < 6; i++) {
        push('5b31d907-84ac-4e21-a7d0-9f5512ab3300', 'developer', '', 'prompt', 60 - i * 9,
            { detail: 'u-66 turn ' + (i + 1) });
        push('5b31d907-84ac-4e21-a7d0-9f5512ab3300', 'developer', '', 'toolStart', 59 - i * 9,
            { tool: i % 2 ? 'Edit' : 'Read', detail: 'src/core/turnAlerts.ts' });
        push('5b31d907-84ac-4e21-a7d0-9f5512ab3300', 'developer', '', 'toolEnd', 57 - i * 9,
            { tool: i % 2 ? 'Edit' : 'Read' });
    }
    push('5b31d907-84ac-4e21-a7d0-9f5512ab3300', 'developer', '', 'stop', 1);

    // Antigravity — hosted too.
    push('agy-9d21c4e7-55ab-4f01-8c33-77e0a1b2c3d4', 'basit', 'agy', 'start', 18);
    push('agy-9d21c4e7-55ab-4f01-8c33-77e0a1b2c3d4', 'basit', 'agy', 'prompt', 17,
        { detail: 'summarise the backlog block I pasted' });
    push('agy-9d21c4e7-55ab-4f01-8c33-77e0a1b2c3d4', 'basit', 'agy', 'toolStart', 16,
        { tool: 'Read', detail: 'Backlog.md' });
    push('agy-9d21c4e7-55ab-4f01-8c33-77e0a1b2c3d4', 'basit', 'agy', 'toolEnd', 14, { tool: 'Read' });
    // U-78: the other half of the conversation. A hosted session's replies are
    // mirrored in as they arrive, and the turn's last one rides on its `stop`.
    push('agy-9d21c4e7-55ab-4f01-8c33-77e0a1b2c3d4', 'basit', 'agy', 'say', 10,
        { detail: 'There are 31 open items. The top of the queue is U-74, U-78 and U-76 — all three are interface work.' });
    push('agy-9d21c4e7-55ab-4f01-8c33-77e0a1b2c3d4', 'basit', 'agy', 'stop', 2,
        { detail: 'There are 31 open items. The top of the queue is U-74, U-78 and U-76 — all three are interface work.' });

    // Gemini in a terminal — the window opening, and nothing else.
    push('cli:gemini:psikolog:1786000000000', 'psikolog', 'gemini', 'start', 7);

    // OpenCode — hosted on the shared ACP process, and still running.
    push('ses_7f2c1a90d4e8b6', 'manager', 'opencode', 'start', 11);
    push('ses_7f2c1a90d4e8b6', 'manager', 'opencode', 'prompt', 10,
        { detail: 'go through the queue and tell me what is blocked' });
    push('ses_7f2c1a90d4e8b6', 'manager', 'opencode', 'toolStart', 9,
        { tool: 'Read', detail: 'Backlog.md' });
    push('ses_7f2c1a90d4e8b6', 'manager', 'opencode', 'toolEnd', 8, { tool: 'Read' });
    push('ses_7f2c1a90d4e8b6', 'manager', 'opencode', 'prompt', 2,
        { detail: 'now write the three that are blocked into the queue' });
    push('ses_7f2c1a90d4e8b6', 'manager', 'opencode', 'toolStart', 1,
        { tool: 'Edit', detail: 'Backlog.md' });

    return out.sort((a, b) => a.ts - b.ts);
};

const base = () => ({
    now: NOW,
    stuckMs: 10 * 60000,
    ownersKnown: true,
    listener: { state: 'listening', port: 8123 },
    sessions: sessions(),
    events: events(),
    workflowRuns: [],
    // ‼️ THREE ROWS OF ONE AGENT, THREE DIFFERENT ANSWERS (U-66). This is the
    // picture to check: `developer #1` alerts on sound, `#2` on focus+modal,
    // `#3` on toast, and `basit` on nothing at all — four rows that used to be
    // incapable of disagreeing.
    sessionAlerts: {
        '407c78cb-2f1a-4d55-9e10-1b2c3d4e5f60': ['sound'],
        '019ff43f-ff3d-7790-9431-63799a45b1b2': ['focus', 'modal'],
        '5b31d907-84ac-4e21-a7d0-9f5512ab3300': ['toast']
    },
    alertActions: ['sound', 'focus', 'modal', 'toast'],
    // ‼️ A-23 — WHAT EACH ROW WOULD ACTUALLY PLAY, resolved by the host. The
    // picture to check here is that the three rows DISAGREE about it and each
    // says which step of the chain decided: `#1` chose a tone for itself, `#2`
    // inherits the user's fleet-wide setting, `#3` has never been near the
    // question and gets the built-in default. A page that drew "♪" four times
    // and nothing else could not show any of that.
    sessionVoices: {
        '407c78cb-2f1a-4d55-9e10-1b2c3d4e5f60': {
            'turn-ready': {
                voice: 'bell-far', label: 'Bell, distant', origin: 'session',
                originLabel: 'this session\'s own choice', playable: true,
                chosen: 'bell-far', skipped: []
            },
            question: {
                voice: 'ask-rise', label: 'Ask — rising', origin: 'session',
                originLabel: 'this session\'s own choice', playable: true,
                chosen: 'ask-rise', skipped: []
            }
        },
        '019ff43f-ff3d-7790-9431-63799a45b1b2': {
            'turn-ready': {
                voice: 'chime-bright', label: 'Chime, bright', origin: 'settings',
                originLabel: 'your setting for everybody', playable: true,
                chosen: '', skipped: []
            },
            question: {
                voice: 'ask-double', label: 'Ask — two knocks', origin: 'default',
                originLabel: 'the built-in default', playable: true,
                chosen: '',
                // A step that had an answer and could not be honoured is named
                // with the reason — the commonest way this feature breaks.
                skipped: [{
                    origin: 'settings', voice: 'u-my-gong',
                    why: 'the file is gone: D:\\sounds\\gong.mp3'
                }]
            }
        },
        '5b31d907-84ac-4e21-a7d0-9f5512ab3300': {
            'turn-ready': {
                voice: 'chime-soft', label: 'Chime, soft', origin: 'default',
                originLabel: 'the built-in default', playable: true, chosen: '', skipped: []
            },
            question: {
                voice: 'ask-double', label: 'Ask — two knocks', origin: 'default',
                originLabel: 'the built-in default', playable: true, chosen: '', skipped: []
            }
        }
    },
    alertEvents: [
        { event: 'turn-ready', label: 'Turn finished' },
        { event: 'question', label: 'Asking you' },
        { event: 'stalled', label: 'Stalled' },
        { event: 'ended', label: 'Session ended' },
        { event: 'error', label: 'Error' }
    ],
    sessionAlertEvents: ['turn-ready', 'question'],
    /**
     * ‼️ A-22 — AND WHETHER ANY OF IT IS HEARD. Two of the three authorities
     * are shut here on purpose: the farm is muted AND `developer #2` silenced
     * itself. Every ♪ panel on the page must open by saying so — a panel that
     * names a tone on a muted farm is the one surface actively misleading the
     * reader who came to it asking why they heard nothing.
     */
    alertGate: {
        muted: true,
        quiet: { configured: true, inside: false, from: '23:00', to: '08:00' },
        mutedSessions: ['019ff43f-ff3d-7790-9431-63799a45b1b2']
    }
});

const data = base;

/** ‼️ TWO PICTURES, because the point of the change is the SECOND one: the same
 *  page with one engine selected. A filter that only narrows the cards and
 *  leaves the other engines' swim lanes above them is the bug, not the fix — so
 *  the lanes have to be in the picture as well. */
const variants = () => ([
    /**
     * ‼️ THE SMALLEST FIRST (audit B-01.2). Six rows and a filtered six were the
     * only two pictures this page had, and a six-row montage is the arity that
     * makes any layout look considered: the lane gutter is full, the card grid
     * wraps, the legend has something to stand under. NONE is what a reader
     * actually opens the page to on a quiet morning, and ONE is what they get
     * the moment they start a session — those are separate layouts wherever a
     * grid, a wrap or a legend is involved, and neither had ever been drawn.
     */
    { id: 'timeline-empty', label: 'Live Timeline — nothing running yet', data: Object.assign(base(), { sessions: [], events: [] }) },
    {
        id: 'timeline-one',
        label: 'Live Timeline — one session, one lane',
        data: Object.assign(base(), {
            sessions: sessions().slice(0, 1),
            events: events().filter(e => e.sessionId === sessions()[0].sessionId)
        })
    },
    { id: 'timeline', label: 'Live Timeline — every engine at once', data: base() },
    {
        id: 'timeline-one-engine',
        label: 'Live Timeline — Claude only (lifecycle-only wording, single badge)',
        data: Object.assign(base(), {
            sessions: sessions().filter(s => !s.source),
            events: events().filter(e => !e.engine)
        })
    }
]);

module.exports = { script: 'timeline.js', data, variants, sessions, events };
