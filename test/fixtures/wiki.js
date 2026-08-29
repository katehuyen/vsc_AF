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
        id: 'wc-1', sessionTurns: 16, session: 'ff54aa29', sessionId: 'ff54aa29-1c02-4f38-9a71-0c4e9b2d6a11',
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
        id: 'wc-2', sessionTurns: 9, session: 'ff54aa29', sessionId: 'ff54aa29-1c02-4f38-9a71-0c4e9b2d6a11',
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
        id: 'wc-3', sessionTurns: 22, session: 'bb16dc64', sessionId: 'bb16dc64-ea30-4747-bf91-a6a3dcc1ad44',
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
        id: 'wc-4', sessionTurns: 12, session: 'e2036103', sessionId: 'e2036103-77aa-4b19-8c30-5d2f1ab9c704',
        turns: '3-9', fromTurn: 3, toTurn: 9,
        topics: ['Claude Code', 'Süreç Yönetimi', 'Daemon', 'Yedek Oturum', 'Kota'],
        label: 'spare oturum döngüsü ve kökten süreç sonlandırma — force kill process tree gerçekten gerekli mi',
        note: '', agent: 'developer', engine: 'claude',
        state: 'pending', addedAt: T - 90 * M, addedBy: 'agent',
        compiledAt: null, pages: null, compileTaskId: null, compileStartedAt: null,
        compiling: false
    },
    // ‼️ X-58 — STILL WAITING, AND SOMEBODY ALREADY TRIED IT. The claim was
    // released when the run died, so the row is compilable again; what it must
    // NOT look like is a mark nobody has reached. Also the excluded-turns case:
    // the whole session minus the two that were about something else.
    {
        id: 'wc-6', sessionTurns: 14, session: '4c81aa02', sessionId: '4c81aa02-9e77-41d3-8b52-6f0aa1d3e991',
        turns: 'whole session (except 13, 14)', fromTurn: 0, toTurn: 0,
        excludeTurns: [13, 14],
        topics: ['Kota', 'Oturum Ekonomisi'],
        label: '5 saatlik pencerede ne kadar iş sığdırılabilir',
        note: 'son iki tur commit ve iyi geceler', agent: 'developer', engine: 'claude',
        state: 'pending', addedAt: T - 3 * 60 * M, addedBy: 'you',
        compiledAt: null, pages: null, compileTaskId: null, compileStartedAt: null,
        lastError: 'The run ended as "failed" — the model ran out of quota before the first page. Nothing was compiled for this mark.',
        lastErrorAt: T - 41 * M,
        compiling: false
    },
    /**
     * ‼️ U-117 — THE STAGE A DROPPED FILE ARRIVES IN. No topic, because nothing
     * guesses one for it; the row's whole job is to say that and to be the door
     * to fixing it. It is `pending` like everything else and it is the one row
     * that must NOT offer a tick box.
     */
    {
        id: 'wc-7', sessionTurns: 0, session: 'raw:clau', sessionId: 'raw:claude-web-kota-mimarisi.md',
        raw: true, rawFile: 'claude-web-kota-mimarisi.md', rawDone: false,
        sessionFile: 'D:\\zone\\know\\note\\obsidian\\00_WIKI\\_RAW_\\claude-web-kota-mimarisi.md',
        turns: 'whole file', fromTurn: 0, toTurn: 0,
        topics: [],
        label: 'Kota mimarisi — 5 saatlik pencere ile 7 günlük kotanın birbirine karıştırılması',
        note: '', agent: '', engine: 'raw-file',
        state: 'pending', addedAt: T - 12 * M, addedBy: 'auto-raw',
        compiledAt: null, pages: null, compileTaskId: null, compileStartedAt: null,
        compiling: false
    },
    /**
     * …and the SAME kind of row one category later: a file the reader has filed,
     * which is now compilable like any other mark. The fixture only proves the
     * distinction if both stages are in it, next to each other.
     */
    {
        id: 'wc-8', sessionTurns: 0, session: 'raw:gemi', sessionId: 'raw:gemini-obsidian-vault-tasarimi.md',
        raw: true, rawFile: 'gemini-obsidian-vault-tasarimi.md', rawDone: false,
        sessionFile: 'D:\\zone\\know\\note\\obsidian\\00_WIKI\\_RAW_\\gemini-obsidian-vault-tasarimi.md',
        turns: 'whole file', fromTurn: 0, toTurn: 0,
        topics: ['Obsidian', 'Bilgi Yönetimi'],
        label: 'Vault klasör mimarisi — 00_ ile başlayan alan klasörleri neden ayrı',
        note: 'sadece klasör isimlendirme bölümünü al, gerisi bizde zaten var',
        agent: '', engine: 'raw-file',
        state: 'pending', addedAt: T - 55 * M, addedBy: 'you',
        compiledAt: null, pages: null, compileTaskId: null, compileStartedAt: null,
        compiling: false
    },
    /** The third stage: compiled, and the agent has archived the file under
     *  `_RAW_/_DONE_` — which is a fact about the PATH, not a flag (X-140). */
    {
        id: 'wc-9', sessionTurns: 0, session: 'raw:chat', sessionId: 'raw:chatgpt-prompt-katmanlari.md',
        raw: true, rawFile: 'chatgpt-prompt-katmanlari.md', rawDone: true,
        sessionFile: 'D:\\zone\\know\\note\\obsidian\\00_WIKI\\_RAW_\\_DONE_\\chatgpt-prompt-katmanlari.md',
        turns: 'whole file', fromTurn: 0, toTurn: 0,
        topics: ['Prompt'],
        label: 'sistem promptu, geliştirici promptu ve kullanıcı promptu arasındaki gerçek fark',
        note: '', agent: '', engine: 'raw-file',
        state: 'compiled', addedAt: T - 4 * 24 * 60 * M, addedBy: 'you',
        compiledAt: T - 3 * 24 * 60 * M,
        pages: ['D:\\zone\\know\\note\\obsidian\\00_WIKI\\Prompt\\Prompt_Katmanlari.md'],
        compileTaskId: null, compileStartedAt: null, compiling: false
    },
    {
        id: 'wc-5', sessionTurns: 5, session: '7d10ba55', sessionId: '7d10ba55-3e64-42aa-9b18-11c0f7de2380',
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
        // X-58 — `failed` is a slice OF pending, not a sixth state: the mark is
        // still waiting, and somebody has already tried it once.
        // U-117 — `raw` is every mark that came from a dropped file whatever
        // became of it; `untriaged` is the slice of pending that still has no
        // topic, which is the only one that is a thing to go and do.
        pending: 6, compiled: 2, dropped: 1, total: 9, compiling: 1, failed: 1,
        raw: 3, untriaged: 1,
        topics: [
            { topic: 'Wiki Derleme', pending: 2, total: 2, lastAt: T - 8 * M },
            { topic: 'Obsidian', pending: 1, total: 1, lastAt: T - 55 * M },
            { topic: 'Bilgi Yönetimi', pending: 1, total: 1, lastAt: T - 55 * M },
            { topic: 'Prompt', pending: 0, total: 1, lastAt: T - 4 * 24 * 60 * M },
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
        // U-122 — the strip's own objects. `_RAW_` is a door with a count on
        // it, `_REF/wiki.md` resolves to a real file, and every named file
        // carries the four figures its hover states.
        procedureFile: 'D:\\zone\\agent\\ajanlar\\_REF\\wiki.md',
        raw: 'D:\\zone\\know\\note\\obsidian\\00_WIKI\\_RAW_', rawReady: true,
        done: 'D:\\zone\\know\\note\\obsidian\\00_WIKI\\_RAW_\\_DONE_',
        rawFiles: 2, doneFiles: 1,
        facts: {
            rules: { found: true, bytes: 8140, lines: 121, mtime: T - 6 * 24 * 60 * M },
            index: { found: true, bytes: 3072, lines: 58, mtime: T - 40 * M },
            log: { found: true, bytes: 21504, lines: 306, mtime: T - 40 * M },
            procedure: { found: true, bytes: 6300, lines: 94, mtime: T - 2 * 24 * 60 * M }
        },
        pages: 14, categories: ['Ajanlar', 'Sistem', 'Ürünler'], misplaced: []
    }
}, over || {});

/**
 * ‼️ U-92/U-91 — the wiki's own folders, which are NOT the pool's topics. A
 * category exists the moment its folder does, so `Felsefe` is offered by the
 * filter and the row editor although nothing has been marked under it yet, and
 * `Wiki Derleme` is a topic the pool uses that has no folder. The union is what
 * both surfaces draw, and the fixture only proves it if the two lists differ.
 */
const folders = () => ([
    { name: 'Agent Farm', pages: 6 },
    { name: 'Ajanlar', pages: 9 },
    { name: 'Bilgi Yönetimi', pages: 4 },
    { name: 'Donanım', pages: 1 },
    { name: 'Felsefe', pages: 2 },
    { name: 'Güvenlik', pages: 3 },
    { name: 'LLM Wiki', pages: 3 },
    { name: 'Maliyet', pages: 2 },
    { name: 'Mimari', pages: 11 },
    { name: 'Obsidian', pages: 5 },
    { name: 'Otomasyon', pages: 2 },
    { name: 'Prompt', pages: 7 },
    { name: 'Sistem', pages: 8 },
    { name: 'Teknoloji - Tarım', pages: 0 },
    { name: 'Ürünler', pages: 4 },
    { name: 'Yazılım Geliştirme', pages: 6 }
]);

/** Press a row's ✎ — the only way the editor is ever reached. */
const openEditor = (r, id) => r.query('[data-act]')
    .filter(e => e.dataset.act === 'topics' && e.dataset.id === id)[0].fire('click');

const data = (over) => Object.assign({
    generatedAt: T,
    candidates,
    folders: folders(),
    status: status(),
    agent: 'developer',
    /**
     * U-95 — what a compile will actually run with. `effort` is deliberately
     * UNSET: three of the four settings answered and one silent is the real
     * shape of this page, and the strip has to read as "the engine's own
     * default" rather than as a choice somebody made.
     */
    compileWith: { agent: 'developer', engine: 'claude', model: 'sonnet', effort: '' },
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
                        // U-122 — the other end of the strip too: the drop box
                        // is not there, and no agent root holds the procedure,
                        // so neither may be drawn as something to press.
                        procedureFile: '', raw: '', rawReady: false, done: '',
                        rawFiles: 0, doneFiles: 0,
                        facts: {
                            rules: { found: false, bytes: 0, lines: null, mtime: 0 },
                            index: { found: true, bytes: 512, lines: 12, mtime: T - 3 * 24 * 60 * M },
                            log: { found: false, bytes: 0, lines: null, mtime: 0 },
                            procedure: { found: false, bytes: 0, lines: null, mtime: 0 }
                        },
                        pages: 0, categories: [], misplaced: []
                    }
                })
            })
        },
        /**
         * ‼️ U-92 — THE ROW EDITOR, WHICH IS ONLY EVER REACHED BY PRESSING ✎.
         * A picture of this page with every editor closed cannot answer the one
         * question the item was about: is the thing that replaced the
         * comma-separated box readable? So the variant presses, exactly as a
         * reader does — the mark chosen is the whole-session one with turns
         * already left out, because that is the case with all three fields in
         * it (the picker, the turn strip, the note).
         */
        {
            id: 'editor', label: 'Wiki — the row editor: the picker, the turns left out, the note',
            data: data(),
            act: r => openEditor(r, 'wc-6')
        },
        /**
         * ‼️ U-117 — THE SAME EDITOR OVER A DROPPED FILE, which is the case the
         * turn strip cannot serve: there are no turns to leave out, so the line
         * that would draw them says what replaces it, and the note stops being
         * "why it is worth keeping" and becomes the directive the compiling
         * agent is handed. Opened on the UNTRIAGED row, because that is the
         * press the row's whole design is asking for.
         */
        {
            id: 'rawedit', label: 'Wiki — a dropped file being filed: no turns, a directive instead of a note',
            data: data(),
            act: r => openEditor(r, 'wc-7')
        },
        /** …and the pool narrowed to the drop box alone, which is the one press
         *  that answers "what did I put in there and what still needs filing". */
        {
            id: 'rawonly', label: 'Wiki — the 📄 Files filter: the drop box on its own, all three stages',
            data: data({ status: status() }),
            act: r => {
                r.query('[data-state]').filter(e => e.dataset.state === 'all')[0].fire('click');
                r.query('#wk-raw')[0].fire('click');
            }
        },
        // …and the same editor with the category list DOWN. Two pictures because
        // the list is drawn over what is under it: with it open the turn strip
        // and the note cannot be read, and with it closed the picker cannot.
        {
            id: 'editorpick', label: 'Wiki — the row editor with the category picker open',
            data: data(),
            act: r => { openEditor(r, 'wc-6'); r.query('[data-afc-box]')[0].fire('mousedown'); }
        },
        /**
         * ‼️ U-92 — AND THE TOPIC FILTER, which is where the badge stack used to
         * be. Twenty-odd categories is what the wiki actually grows to, and at
         * that length the menu has to draw its own find box.
         *
         * The menu is not opened by an `act`: the page shim does not wire the
         * filter component at all (its stub menus have no `querySelectorAll`),
         * so pressing the trigger here does nothing. The picture is taken with
         *   node test/render_page.js wiki --only topics --menu wk-topic
         * which takes off the one attribute that hides it.
         */
        { id: 'topics', label: 'Wiki — the topic filter: one searchable menu instead of a stack of badges', data: data() },
        /**
         * ‼️ U-95 — WHAT TICKING ROWS BRINGS, AND WHAT A COMPILE SAYS BEFORE IT
         * SPENDS ANYTHING. Both only exist after a press, and both are about
         * cost: the bulk group is there so five marks are dropped once rather
         * than five times, and the strip is there because a compile is a real
         * model over real transcripts and the four settings that decide how
         * expensive that is are invisible from this page.
         */
        {
            id: 'ops', label: 'Wiki — the ticked rows, and what a compile is about to run with',
            data: data(),
            act: r => {
                for (const id of ['wc-1', 'wc-4']) {
                    // Re-queried each time: the page rebuilds itself on every tick.
                    const cb = r.query('[data-cb]').filter(e => e.dataset.cb === id)[0];
                    cb.checked = true; cb.fire('change');
                }
                r.query('#wk-csel')[0].fire('click');
            }
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
