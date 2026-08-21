/**
 * The Wiki cockpit (U-70) — the candidate pool and the vault, side by side.
 *
 * ‼️ THE SHAPE IS THE POINT. Four things only break on real content: a mark
 * carrying five topics against one carrying none-but-the-minimum, a prompt at
 * the length people really type (the row is one line tall and everything longer
 * is an AFTip), a compiled row's page breadcrumb with a real category in front
 * of it, and a row a run is out for — which is PENDING but must not read as
 * offerable. So all four are here, at real lengths, plus the case that decides
 * whether the page is honest at all: a wiki whose law is missing, which makes
 * every compile button refuse.
 */
const T = Date.parse('2026-08-21T09:40:00Z');
const M = 60000;

const candidates = [
    {
        id: 'wc-1', session: 'ff54aa29', sessionId: 'ff54aa29-1c02-4f38-9a71-0c4e9b2d6a11',
        turns: '12-14', fromTurn: 12, toTurn: 14,
        topics: ['Agent Farm', 'Wiki Derleme', 'Parity Kapısı'],
        label: 'bir derleme koşusu bir işareti kilitler ama yalnızca yaşadığı sürece — bunu nasıl kurmalıyız',
        note: 'M-23 kararının çıktığı tur', agent: 'developer', engine: 'claude',
        state: 'pending', addedAt: T - 8 * M, addedBy: 'you',
        compiledAt: null, pages: null, compileTaskId: null, compileStartedAt: null,
        compiling: false
    },
    {
        // A run is OUT for this one. Still pending — nothing is compiled until
        // the run reports back — and it must not be offered a second time.
        id: 'wc-2', session: 'ff54aa29', sessionId: 'ff54aa29-1c02-4f38-9a71-0c4e9b2d6a11',
        turns: '7', fromTurn: 7, toTurn: 7,
        topics: ['Wiki Derleme'],
        label: 'wiki.compile neden sadece brief döndürüyor',
        note: '', agent: 'developer', engine: 'claude',
        state: 'pending', addedAt: T - 26 * M, addedBy: 'you',
        compiledAt: null, pages: null,
        compileTaskId: 'task-9f21', compileStartedAt: T - 4 * M,
        compiling: true
    },
    {
        id: 'wc-3', session: 'bb16dc64', sessionId: 'bb16dc64-ea30-4747-bf91-a6a3dcc1ad44',
        turns: 'whole session', fromTurn: 0, toTurn: 0,
        topics: ['LLM Wiki', 'Fikir Olgunlaştırma'],
        label: 'obsidian IDE ise, LLM programcı ise, wiki de kod tabanıdır — bu fikri açalım',
        note: 'X-50 ailesinin çıkış oturumu', agent: 'manager', engine: 'claude',
        state: 'compiled', addedAt: T - 3 * 24 * 60 * M, addedBy: 'you',
        compiledAt: T - 2 * 24 * 60 * M,
        pages: ['D:\\zone\\know\\note\\obsidian\\00_WIKI\\Sistem\\LLM_Wiki.md',
            'D:\\zone\\know\\note\\obsidian\\00_WIKI\\Sistem\\Aday_Havuzu.md'],
        compileTaskId: null, compileStartedAt: null, compiling: false
    },
    {
        id: 'wc-4', session: 'e2036103', sessionId: 'e2036103-77aa-4b19-8c30-5d2f1ab9c704',
        turns: '3-9', fromTurn: 3, toTurn: 9,
        topics: ['Claude Code', 'Süreç Yönetimi', 'Daemon', 'Yedek Oturum', 'Kota'],
        label: 'spare oturum döngüsü ve kökten süreç sonlandırma — force kill process tree gerçekten gerekli mi',
        note: '', agent: 'developer', engine: 'claude',
        state: 'pending', addedAt: T - 90 * M, addedBy: 'agent',
        compiledAt: null, pages: null, compileTaskId: null, compileStartedAt: null,
        compiling: false
    },
    {
        id: 'wc-5', session: '7d10ba55', sessionId: '7d10ba55-3e64-42aa-9b18-11c0f7de2380',
        turns: '2', fromTurn: 2, toTurn: 2,
        topics: ['Airtable Motoru'],
        label: 'bunu bir daha konuşmayalım', note: 'yanlış işaretlenmişti',
        agent: 'manager', engine: 'codex',
        state: 'dropped', addedAt: T - 5 * 24 * 60 * M, addedBy: 'you',
        compiledAt: null, pages: null, compileTaskId: null, compileStartedAt: null,
        compiling: false
    }
];

const status = (over) => Object.assign({
    pool: {
        pending: 3, compiled: 1, dropped: 1, total: 5, compiling: 1,
        topics: [
            { topic: 'Wiki Derleme', pending: 2, total: 2, lastAt: T - 8 * M },
            { topic: 'Agent Farm', pending: 1, total: 1, lastAt: T - 8 * M },
            { topic: 'Parity Kapısı', pending: 1, total: 1, lastAt: T - 8 * M },
            { topic: 'Claude Code', pending: 1, total: 1, lastAt: T - 90 * M },
            { topic: 'Süreç Yönetimi', pending: 1, total: 1, lastAt: T - 90 * M },
            { topic: 'LLM Wiki', pending: 0, total: 1, lastAt: T - 3 * 24 * 60 * M },
            { topic: 'Airtable Motoru', pending: 0, total: 1, lastAt: T - 5 * 24 * 60 * M }
        ]
    },
    wiki: {
        root: 'D:\\zone\\know\\note\\obsidian\\00_WIKI',
        exists: true,
        rules: 'D:\\zone\\know\\note\\obsidian\\00_WIKI\\_KURALLAR_\\-WIKI-ANAYASA-.md',
        rulesFound: true,
        procedure: '_REF/wiki.md',
        index: 'D:\\zone\\know\\note\\obsidian\\00_WIKI\\index.md', indexFound: true,
        log: 'D:\\zone\\know\\note\\obsidian\\00_WIKI\\log.md', logFound: true,
        pages: 14, categories: ['Ajanlar', 'Sistem', 'Ürünler'], misplaced: []
    }
}, over || {});

const data = (over) => Object.assign({
    generatedAt: T,
    candidates,
    status: status(),
    agent: 'developer',
    docOpen: { mode: 'obsidian', hasCustom: true },
    focus: null
}, over || {});

module.exports = {
    script: 'wiki.js',
    data,
    variants: () => [
        { id: 'pool', label: 'Wiki — the pool, a run in flight, and what a compile wrote', data: data() },
        // ‼️ THE OTHER END. No law, no root: every compile button must be dead
        // and SAY WHY, rather than refusing after it is pressed.
        {
            id: 'nolaw', label: 'Wiki — no -WIKI-ANAYASA-.md: every compile refused, and said so',
            data: data({
                status: status({
                    wiki: {
                        root: 'D:\\zone\\know\\note\\obsidian\\00_WIKI',
                        exists: true,
                        rules: 'D:\\zone\\know\\note\\obsidian\\00_WIKI\\_KURALLAR_\\-WIKI-ANAYASA-.md',
                        rulesFound: false,
                        procedure: '_REF/wiki.md',
                        index: 'D:\\zone\\know\\note\\obsidian\\00_WIKI\\index.md', indexFound: true,
                        log: 'D:\\zone\\know\\note\\obsidian\\00_WIKI\\log.md', logFound: false,
                        pages: 0, categories: [], misplaced: []
                    }
                })
            })
        },
        // An empty pool is the first thing a new user sees, and it has to say
        // where marks come from rather than just "nothing here".
        {
            id: 'empty', label: 'Wiki — the pool is empty: where a mark comes from',
            data: data({
                candidates: [],
                status: status({
                    pool: { pending: 0, compiled: 0, dropped: 0, total: 0, compiling: 0, topics: [] }
                })
            })
        }
    ]
};
