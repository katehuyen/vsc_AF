/**
 * The Tasks page, on the RUNS tab, with four engines' runs on it (X-35).
 *
 * ‼️ WHAT THIS FIXTURE IS THE PROOF OF. A table of executions across four
 * engines never said which one ran a row — the same fault the Turns page had —
 * and the Cost column beside it was worse than silent: only Claude Code states
 * a price, so every other engine's matched transcript priced at exactly $0.00,
 * which `fmtUSD` draws as "—" — the very glyph this column uses for "nothing
 * measured yet". A fully measured Codex run and an unmeasured one were the same
 * cell.
 *
 * So the picture is for: the new Engine column with its four distinct badge
 * colours, the Engines filter in the toolbar, and a Cost column that shows
 * tokens where the engine bills a plan.
 *
 * ‼️ …AND FOR M-7/M-8, WHICH ADDED A COLUMN AND A WARNING NOBODY HAD DRAWN. The
 * Session column has to fit an id without shoving Cost off the edge, the Undo
 * button has to sit in a toolbar that already had three, and the overdue row
 * and the "this window does not fire schedules" banner are the two loudest
 * things on the page — both of which are only ever seen in a picture. The
 * second variant is the Plan tab, which is where they live.
 *
 * ‼️ THE CLOCK IS THE REAL ONE, like the Turns and Timeline fixtures and for the
 * same reason: the When column counts against `Date.now()`, so a pinned stamp
 * would draw every row as "-13317s ago" and the picture would be of a bug that
 * is not there.
 */
const NOW = Date.now();
const min = n => NOW - n * 60000;

/** The panel derives this from the transcript's file name; the fixture says it
 *  the same way rather than inventing a second spelling. */
const sid = f => (f || '').split(/[\\/]/).pop().replace(/\.jsonl$/, '');

/**
 * ‼️ M-8 — WHAT THE PANEL NOW SENDS WITH EVERY ROW: which conversation the run
 * was, what it was set up with, and what happened to it in order. Derived from
 * the row rather than typed out six times, so the picture cannot drift from the
 * shape the panel builds.
 */
const dress = r => Object.assign({
    sessionId: sid(r.sessionFile),
    setup: [
        { label: 'Agent', value: `${r.agentName} · ${r.mode}` },
        {
            label: 'Started by',
            value: r.sourceKind === 'manual' ? 'you' : `${r.sourceKind} "${r.source}"`
        },
        ...(r.engine && r.engine !== 'claude' ? [{ label: 'Engine', value: r.engine }] : []),
        ...(r.status === 'queued' ? [{ label: 'Priority', value: '3' }] : [])
    ],
    events: [
        {
            ts: r.when - (r.durMin || 1) * 60000 - 60000, kind: 'created',
            note: r.sourceKind === 'manual' ? 'by you' : `by a ${r.sourceKind}`
        },
        ...(r.detail ? [{ ts: r.when - 30000, kind: 'parked', note: r.detail }] : []),
        ...(r.durMin !== undefined
            ? [{ ts: r.when - r.durMin * 60000, kind: 'started', note: `${r.engine || 'claude'} · ${r.mode}` }]
            : []),
        ...(r.status === 'done' || r.status === 'failed'
            ? [{ ts: r.when, kind: 'finished', note: `${r.status} after ${r.durMin} min` }]
            : [])
    ],
    seed: {
        agent: r.agentName, prompt: r.prompt, mode: r.mode,
        engine: r.engine === 'claude' ? '' : (r.engine || ''), project: 'prj_1'
    }
}, r);

const runs = () => ([
    {
        id: 'r1', title: 'X-35 kalan denetim listesini kapat', agentName: 'developer',
        mode: 'headless', status: 'running', source: 'you', sourceKind: 'manual',
        when: min(4), durMin: 4, detail: '', costUSD: 2.14,
        engine: 'claude', reportsCost: true, tokens: 1_840_000,
        hasOutput: false, sessionFile: 'C:\\Users\\x\\.claude\\projects\\vsc_AgentFarm\\407c78cb.jsonl',
        prompt: 'devir notundaki kalan maddeleri sırayla kapat ve testleri çalıştır'
    },
    {
        // ‼️ A CODEX RUN. Its transcript IS matched now (the matcher used to
        // refuse every session with a `source`), so it carries a token count and
        // a transcript link — and NO dollar, because the engine states none.
        id: 'r2', title: 'rollout ayrıştırıcısını yeniden yaz', agentName: 'developer',
        mode: 'headless', status: 'done', source: 'you', sourceKind: 'manual',
        when: min(38), durMin: 12, detail: '', costUSD: 0,
        engine: 'codex', reportsCost: false, tokens: 93_625,
        hasOutput: true, outputFile: 'D:\\out\\r2.md',
        sessionFile: 'C:\\Users\\x\\.codex\\sessions\\2026\\08\\12\\rollout-019ff43f.jsonl',
        prompt: 'codex rollout dosyasındaki last_token_usage alanını oku ve tur satırlarını kur'
    },
    {
        id: 'r3', title: 'AGENT_AREA dosyalama turu', agentName: 'manager',
        mode: 'headless', status: 'done', source: 'AGENT_AREA batch', sourceKind: 'schedule',
        when: min(95), durMin: 3, detail: '', costUSD: 0.42,
        engine: 'claude', reportsCost: true, tokens: 512_000,
        hasOutput: true, outputFile: 'D:\\out\\r3.md',
        sessionFile: 'C:\\Users\\x\\.claude\\projects\\ajanlar\\9c22ab41.jsonl',
        prompt: '00_INPUT klasöründeki her dosyayı dosyala'
    },
    {
        // The engine whose conversations cannot be read back at all: no
        // transcript, no tokens, no price — and the row says nothing it cannot.
        id: 'r4', title: 'yapıştırdığım backlog bloğunu özetle', agentName: 'basit',
        mode: 'headless', status: 'done', source: 'you', sourceKind: 'manual',
        when: min(180), durMin: 1, detail: '', costUSD: 0,
        engine: 'agy', reportsCost: false, tokens: 0,
        hasOutput: true, outputFile: 'D:\\out\\r4.md',
        prompt: 'aşağıdaki backlog bloğunu üç maddede özetle'
    },
    {
        id: 'r5', title: 'günün notlarını topla', agentName: 'psikolog',
        mode: 'headless', status: 'failed', source: 'Günlük tarama', sourceKind: 'trigger',
        when: min(320), durMin: 2, detail: '', costUSD: 0,
        engine: 'gemini', reportsCost: false, tokens: 18_204,
        hasOutput: true, outputFile: 'D:\\out\\r5.md',
        prompt: 'bugünün notlarını topla ve tek paragrafta özetle'
    },
    {
        // Queued: nothing has run, so there is nothing to price. This is the row
        // whose "—" genuinely means "not measured yet", and it must stay
        // distinguishable from r2's and r4's.
        id: 'r6', title: 'Türkçe harf bozulmasını akış okuyucusunda doğrula',
        agentName: 'developer', mode: 'headless', status: 'queued',
        source: 'you', sourceKind: 'manual', when: min(2),
        detail: 'agent busy (developer)', engine: 'claude', reportsCost: true,
        hasOutput: false, prompt: 'akış okuyucusunu UTF-8 sınırında böl ve doğrula'
    }
].map(dress));

const data = () => ({
    generatedAt: NOW,
    tab: 'run',
    gate: {
        paused: false, pausedUntil: undefined, pauseReason: '',
        quietFrom: '23:30', quietTo: '04:30', blocked: false, blockReason: '',
        runsQueue: true
    },
    summary: {
        running: 1, runLimit: 2, queued: 1, needsYou: 0,
        plansOn: 2, plansSwitchable: 3, doneToday: 3, failedToday: 1,
        cost7d: 18.4, savedWakeups7d: 23, issues: 1
    },
    plan: [],
    runs: runs(),
    undoable: 0,
    agents: ['developer', 'manager', 'basit', 'psikolog'],
    perAgentLimit: 1,
    workflows: [],
    scenes: [],
    launch: {
        models: [{ id: '', label: 'Default', detail: 'the agent\'s own model setting' }],
        efforts: [{ id: '', label: 'Default', detail: 'no --effort flag' }],
        permissions: [{ id: '', label: 'Default', detail: 'asks before acting' }],
        defaults: { model: '', effort: '', permissionMode: '' },
        engineModels: {},
        engines: [
            { id: 'claude', label: 'Claude Code', ready: true, next: 'Ready, on a plan.' },
            { id: 'codex', label: 'Codex', ready: true, next: 'Ready, on a plan.' }
        ],
        clis: [],
        projects: [{ id: 'prj_1', name: 'AgentFarm', icon: '◧' }],
        activeProjectId: 'prj_1'
    }
});

/**
 * ‼️ M-7 — THE PLAN TAB, ON THE DAY THE ITEM WAS WRITTEN ABOUT. 09:00 came and
 * went, the schedule did not run, and every surface went on drawing a healthy
 * row with tomorrow's date on it. Two things are new here and BOTH are only
 * ever seen in a picture: the loud line under an overdue row, and the banner a
 * window that does not hold the queue lease puts above everything else.
 */
const plan = () => ([
    {
        id: 's1', kind: 'schedule', title: 'sabah13',
        when: 'every day 09:00', nextAt: NOW + 22 * 3600e3, agentName: 'developer', model: '',
        guard: '', hasGuard: false, switchable: true, enabled: true,
        cost7d: 0, runs7d: 0, skipped7d: 0, skipRate: 0,
        lastNote: '', issues: ['no-guard', 'overdue'],
        // …and it is the not-runner branch, because that is what this variant's
        // gate says. The row states the fact; the banner carries the paragraph.
        overdue: 'its time has passed — and schedules do not fire from this window (see above).',
        detail: {
            prompt: 'sabah raporunu yaz ve worklog\'a bir satır düş',
            target: 'runs on developer · headless',
            timing: 'every day 09:00 · missed → skip', steps: [], missed: 'skip',
            setup: [
                { label: 'Fires', value: 'every day 09:00' },
                { label: 'If it is missed', value: 'skip it — that occurrence is lost' },
                { label: 'Agent', value: 'developer · headless' },
                { label: 'Budget', value: 'runs even when the daily budget is spent' }
            ]
        }
    },
    {
        id: 's2', kind: 'schedule', title: 'AGENT_AREA dosyalama turu',
        when: 'every day 05:00', nextAt: NOW + 14 * 3600e3, agentName: 'manager', model: 'opus',
        guard: 'files in …/00_INPUT (skip _LOG_.md)', hasGuard: true,
        switchable: true, enabled: true,
        cost7d: 12.3, runs7d: 3, skipped7d: 4, skipRate: 57,
        lastRunAt: NOW - 7200e3, lastNote: '2 files waiting', issues: [], overdue: '',
        detail: {
            prompt: '00_INPUT klasöründeki her dosyayı dosyala',
            target: 'runs on manager · headless',
            timing: 'every day 05:00 · missed → run', steps: [], missed: 'run',
            setup: [
                { label: 'Fires', value: 'every day 05:00' },
                { label: 'If it is missed', value: 'run it at the first opportunity' },
                { label: 'Agent', value: 'manager · headless' },
                { label: 'Guard', value: 'files in …/00_INPUT (skip _LOG_.md)' },
                { label: 'Model', value: 'opus' }
            ]
        }
    },
    {
        id: 't1', kind: 'trigger', title: 'Medya izleyicisi',
        when: 'on change · …/02_MEDIALASTIR', agentName: 'manager', model: '',
        guard: '', hasGuard: false, switchable: true, enabled: true,
        cost7d: 70.9, runs7d: 23, skipped7d: 0, skipRate: 0,
        lastRunAt: NOW - 3600e3, lastNote: 'no files waiting',
        issues: ['no-guard'], overdue: '',
        detail: {
            prompt: 'medyayı dosyala', target: 'runs on manager',
            timing: 'debounce 60s · cooldown 300s · max 6/h', steps: [], missed: '',
            setup: [
                { label: 'Fires', value: 'on change · …/02_MEDIALASTIR' },
                { label: 'Armed', value: 'yes — the path exists and is being watched' },
                { label: 'Brakes', value: 'debounce 60s · cooldown 300s · max 6/h' }
            ]
        }
    }
]);

const planData = () => {
    const d = data();
    return Object.assign(d, {
        tab: 'plan',
        plan: plan(),
        // the gate in front of every other gate — this window cannot fire
        gate: Object.assign({}, d.gate, { runsQueue: false }),
        summary: Object.assign({}, d.summary, { issues: 2 }),
        undoable: 2
    });
};

const variants = () => ([
    { id: 'tasks', label: 'Tasks → Runs — four engines, and a cost column that tells the truth', data: data() },
    { id: 'tasks-plan', label: 'Tasks → Plan — a schedule whose time passed, in a window that cannot fire', data: planData() }
]);

module.exports = { script: 'tasksPage.js', data, variants, runs };
