/**
 * The Work Queue board — the user→agent channel, with the lanes and the route.
 *
 * ‼️ THE SHAPE IS THE POINT. Two things about this page only break on real
 * content: the row is a flex line that now carries a target, an ENGINE BADGE
 * with a model and an effort beside it, a project mark, tags and a time — so
 * the items here carry all of that at the length people really write, and one
 * carries none of it, because "unclaimed" has to cost no width at all (X-49).
 * The capture box's three route selects are sized by their widest option, so
 * the model names below are the real ones, not `m1`.
 */
const T = Date.parse('2026-08-19T20:10:00Z');
const M = 60000;

const projects = [
    {
        id: 'p1', name: 'PRS.MuratVural_DEV_VSC.AgentFarm', icon: '◧', color: '#7c3aed',
        status: 'active', kind: 'product',
        summary: 'Claude Code başta olmak üzere yapay zeka ajanlarını yönetmek için kurulmuş bir VSCode eklentisi',
        folder: 'D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\10_PROJECTS\\PRS.MuratVural_DEV_VSC.AgentFarm',
        repos: ['D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm'], tags: ['ajan']
    },
    {
        id: 'p2', name: 'PRS.MuratVural_DEV_TalkScribe.ZEN', icon: '🎙', color: '#d18616',
        status: 'active', kind: 'product', summary: 'Sesli dikte eklentisi',
        folder: 'D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\10_PROJECTS\\PRS.TalkScribe',
        repos: [], tags: []
    }
];

/** The engine vocabulary, in the shape htmlShell ships as `launch`. */
const launch = {
    engines: [
        { id: 'claude', label: 'Claude', takesEffort: true },
        { id: 'codex', label: 'Codex', takesEffort: true },
        { id: 'gemini', label: 'Gemini', takesEffort: false },
        { id: 'agy', label: 'Antigravity', takesEffort: true },
        { id: 'opencode', label: 'OpenCode', takesEffort: false }
    ],
    efforts: [{ id: '', label: '— default' }, { id: 'low', label: 'low' }, { id: 'medium', label: 'medium' }, { id: 'high', label: 'high' }],
    engineModels: {
        claude: {
            models: [{ id: '', label: '— default' }, { id: 'opus-5', label: 'opus-5' }, { id: 'claude-sonnet-5', label: 'claude-sonnet-5' }],
            efforts: { '': [{ id: '', label: '— default' }, { id: 'low', label: 'low' }, { id: 'high', label: 'high' }] },
            defaultEffort: {}, source: 'catalog'
        },
        codex: {
            models: [{ id: '', label: '— default' }, { id: 'GPT-5.6-Terra', label: 'GPT-5.6-Terra' }, { id: 'gpt-5.6-codex', label: 'gpt-5.6-codex' }],
            efforts: {
                '': [{ id: '', label: '— default' }, { id: 'low', label: 'low' }, { id: 'medium', label: 'medium' }, { id: 'high', label: 'high' }],
                'GPT-5.6-Terra': [{ id: 'low', label: 'low' }, { id: 'high', label: 'high' }]
            },
            defaultEffort: { 'GPT-5.6-Terra': 'low' }, source: 'catalog'
        },
        gemini: { models: [{ id: '', label: '— default' }, { id: 'gemini-3.1-pro', label: 'gemini-3.1-pro' }], efforts: {}, defaultEffort: {}, source: 'catalog' },
        agy: { models: [{ id: '', label: '— default' }, { id: 'gemini-3.1-pro-high', label: 'gemini-3.1-pro-high' }], efforts: {}, defaultEffort: {}, source: 'catalog' },
        opencode: { models: [{ id: '', label: '— default' }, { id: 'opencode/big-pickle', label: 'opencode/big-pickle' }], efforts: {}, defaultEffort: {}, source: 'catalog' }
    },
    // X-254 - the sign-ins each engine has, in the shape engineAccountMatrix
    // hands over. Deliberately uneven: claude holds three (one of them fallen
    // over, one unread), codex holds one, and the other three hold NONE - so
    // the looking glass shows the box appearing and disappearing with the
    // engine beside it rather than only the happy row.
    accounts: {
        claude: [
            { id: 'claude-aicozums', label: 'aicozums', health: 'ready', active: true, percent: 52, resetsAt: T + 118 * M },
            { id: 'claude-murvietnam-2', label: 'murvietnam-2', health: 'ready', active: false, percent: 91, resetsAt: T + 24 * M },
            { id: 'claude-eski', label: 'eski hesap', health: 'stale', active: false, percent: -1, resetsAt: 0 }
        ],
        codex: [
            { id: 'codex-is', label: 'is hesabi', health: 'ready', active: true, percent: 8, resetsAt: T + 240 * M }
        ]
    }
};

const items = [
    {
        id: 'q1', ts: T - 6 * M, author: 'user', status: 'captured', urgency: 'urgent',
        text: 'Konsol kutusunun yüksekliği ayarlandıktan sonra bir yere tıklayınca geri dönüyor — her seferinde değil ama sık.',
        target: 'vsc_AgentFarm', engine: 'codex', account: 'codex-is', model: 'GPT-5.6-Terra', effort: 'low',
        projectId: 'p1', tags: ['bug'], pinned: true
    },
    {
        id: 'q2', ts: T - 40 * M, author: 'user', status: 'captured', urgency: 'normal',
        text: 'Bunu kim alırsa alsın — sadece bir yazım hatası, ZEN mağaza açıklamasında.',
        target: 'muvu_talkScribe', projectId: 'p2', tags: []
    },
    {
        id: 'q3', ts: T - 95 * M, author: 'manager', status: 'grouped', urgency: 'soon',
        text: 'Kuyruk hedefi çoklu motor öncesinden kalma; hangi motorun alacağı yazmıyor.',
        engine: 'claude', account: 'claude-murvietnam-2', model: 'opus-5', groupId: 'g1', projectId: 'p1', tags: ['debt']
    },
    {
        id: 'q4', ts: T - 260 * M, author: 'manager', status: 'delegated', urgency: 'normal',
        text: 'Antigravity oturumu açılırken terminal penceresi çakıyor.',
        engine: 'agy', account: '@machine', taskId: 't9', projectId: 'p1', tags: []
    },
    {
        id: 'q5', ts: T - 900 * M, author: 'user', status: 'blocked', urgency: 'normal',
        text: 'Rozet rengi kırmızı mı olsun? Hata rengiyle aynı aileden olması rahatsız edici.',
        // X-254 - a sign-in the machine no longer holds. The row must NAME it
        // and mark it rather than printing it as though it were fine.
        engine: 'claude', account: 'claude-silinmis', projectId: 'p1', tags: ['ux']
    },
    {
        id: 'q6', ts: T - 1500 * M, author: 'developer', status: 'done', urgency: 'normal',
        text: 'Turns sayfası bütün motorların turlarını göstersin.',
        engine: 'claude', model: 'opus-5', effort: 'high', projectId: 'p1',
        stamp: '-DONE- v10.48', resolution: 'Turns artık beş motorun turlarını da okuyor.',
        handledAt: T - 1400 * M, tags: []
    }
];

const data = over => Object.assign({
    generatedAt: T,
    items,
    blocked: 1,
    active: 5,
    targets: ['vsc_AgentFarm', 'muvu_talkScribe'],
    agents: ['developer', 'manager', 'psikolog'],
    launch,
    projects,
    activeProjectId: 'p1',
    live: { q4: { kind: 'task', status: 'running', title: 'x-47 spawn penceresi' } },
    docOpen: { mode: 'obsidian', hasCustom: true },
    focusItem: null
}, over || {});

module.exports = {
    script: 'queue.js',
    data,
    variants: () => [
        { id: 'lanes', label: 'Work Queue — lanes, and what each item asks for', data: data() },
        // ‼️ The other end of the range: a build that knows no engines at all
        // must draw NO route boxes rather than an empty picker, and every row
        // must look exactly as it did before the route existed.
        {
            id: 'noengines', label: 'Work Queue — no engines known: no route anywhere',
            data: data({
                launch: { engines: [], efforts: [], engineModels: null, accounts: null },
                items: items.map(n => ({ ...n, engine: undefined, account: undefined, model: undefined, effort: undefined }))
            })
        }
    ]
};
