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

/**
 * ‼️ n minutes ago, BUT NEVER BEFORE THIS LOCAL MIDNIGHT.
 *
 * A fixture pins a relative time; the 🏁 today figure asks an absolute question
 * ("since midnight") — and the two agree only after a certain hour of the day.
 * A run pinned at 320 minutes ago fell into yesterday for anyone running the
 * suite before 05:20, the derived list emptied, the panel became a one-liner
 * and two assertions failed on the clock rather than on the code. Any row whose
 * TODAY-ness a test relies on is anchored with this, not with `min`.
 */
const todayMin = n => Math.max(min(n), new Date(NOW).setHours(0, 0, 0, 0) + 60000);

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
        // X-106 - the route moved between the queue and the spawn. It sits right
        // after the start because that is where the runner writes it, and a
        // scheduled run is the scene it exists for: nobody was at a window when
        // the profile behind the route was edited.
        ...(r.routeDrift ? [{ ts: r.when - (r.durMin || 1) * 60000 + 1, kind: 'route-drift', note: r.routeDrift }] : []),
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
        prompt: 'devir notundaki kalan maddeleri sırayla kapat ve testleri çalıştır',
        // X-110 — WHICH PROVIDER served the session this run bound to, as the
        // host's one reader answers it. Drawn beside the engine badge; the
        // rows below with no route wear no chip.
        identity: {
            engine: 'claude', providerId: 'kimi', providerLabel: 'Kimi (work)',
            origin: 'agent-farm-profile', scope: 'session',
            providerProfileId: 'kimi-work', providerProfileRevision: 3,
            requestedModelRef: 'kimi-k2-thinking',
            reportedProviderIds: ['kimi'], reportedModels: ['kimi-k2-thinking'],
            proof: 'matched', multiProvider: false, turnScope: false,
            agreement: 'matched', binding: 'declared'
        }
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
        prompt: 'codex rollout dosyasındaki last_token_usage alanını oku ve tur satırlarını kur',
        // X-110 — a run that changed provider between turns: the chip COUNTS
        // ("2 providers"), the widest text the mark carries, beside the widest
        // engine badge but one — the cell that fails first if the column is
        // ever trimmed.
        identity: {
            engine: 'codex', providerId: 'openai', providerLabel: '',
            origin: 'engine-native', scope: 'turn',
            providerProfileId: '', providerProfileRevision: null,
            requestedModelRef: 'gpt-5-codex',
            reportedProviderIds: ['openai', 'anthropic'], reportedModels: ['gpt-5-codex', 'claude-sonnet-5'],
            proof: 'matched', multiProvider: true, turnScope: true,
            agreement: 'matched', binding: 'declared'
        }
    },
    {
        id: 'r3', title: 'AGENT_AREA dosyalama turu', agentName: 'manager',
        mode: 'headless', status: 'done', source: 'AGENT_AREA batch', sourceKind: 'schedule',
        when: min(95), durMin: 3, detail: '', costUSD: 0.42,
        engine: 'claude', reportsCost: true, tokens: 512_000,
        hasOutput: true, outputFile: 'D:\\out\\r3.md',
        sessionFile: 'C:\\Users\\x\\.claude\\projects\\ajanlar\\9c22ab41.jsonl',
        prompt: '00_INPUT klasöründeki her dosyayı dosyala',
        routeDrift: 'profile revision 3 → 4 · model claude-opus-5 → kimi-k2-thinking'
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
        when: todayMin(320), durMin: 2, detail: '', costUSD: 0,
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
    },
    {
        // ‼️ M-9 — A RUN THAT HAS LEFT THE BOARD, read out of the monthly
        // archive. It is in the fixture because the whole question about it is
        // visual: it has to be separable from the live rows at a glance and
        // still be a real row, and its Actions cell is deliberately empty —
        // which is exactly the kind of thing a string test cannot see.
        id: 'r7', title: 'eski kuyruk temizliği', agentName: 'manager',
        mode: 'headless', status: 'done', source: 'you', sourceKind: 'manual',
        when: min(4200), durMin: 6, detail: '', costUSD: 0.18,
        engine: 'claude', reportsCost: true, tokens: 240_000,
        hasOutput: false, archived: true,
        sessionFile: 'C:\\Users\\x\\.claude\\projects\\ajanlar\\11b4922a.jsonl',
        prompt: 'kuyrukta kalan eski girdileri temizle ve raporla'
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
    // ‼️ M-9 — the archive is ON in this picture, because the month picker and
    // the "✕ archive" way back only exist once it is, and a toolbar that has
    // gained two controls is the thing to look at.
    archive: { on: true, month: '', months: ['2026-06', '2026-07', '2026-08'] },
    undoable: 0,
    agents: ['developer', 'manager', 'basit', 'psikolog'],
    perAgentLimit: 1,
    workflows: [],
    // M-45 — what the wake editor builds itself from, as the host sends it
    wakeDict: require('../../out/core/workflowWake.js').wakeDictionary(),
    scenes: [],
    launch: {
        models: [{ id: '', label: 'Default', detail: 'the agent\'s own model setting' }],
        efforts: [{ id: '', label: 'Default', detail: 'no --effort flag' }],
        permissions: [{ id: '', label: 'Default', detail: 'asks before acting' }],
        defaults: { model: '', effort: '', permissionMode: '' },
        engineModels: {},
        // X-106 - the routes the form may point a run at, and the tiers that
        // belong to each. Drawn only where there is something to pick, so a
        // still page without this photographs the one state the boxes are not
        // in - which is every state except the one they exist for.
        routes: {
            claude: {
                noun: 'Route',
                providers: [
                    {
                        id: 'kimi-work', label: 'Kimi (work)', detail: 'https://api.moonshot.ai/anthropic',
                        tiers: [
                            { id: 'opus', label: 'opus', detail: 'kimi-k2-thinking' },
                            { id: 'sonnet', label: 'sonnet', detail: 'kimi-k2' }
                        ]
                    },
                    { id: 'minimax-lab', label: 'MiniMax (lab)', detail: 'https://api.minimax.io/anthropic', tiers: [{ id: 'opus', label: 'opus', detail: 'MiniMax-M2' }] }
                ]
            }
        },
        // ‼️ X-169 - the sign-ins the form may bill a run to. Here for the same
        // reason the routes are: the box is drawn only where there is something
        // to pick, so a fixture without them photographs the one state the row
        // is not in. One slot is deliberately not `ready` - a fallen token has
        // to be visible as a warning before somebody schedules a night on it.
        accounts: {
            claude: [
                { id: 'work-1', label: 'work@studio', health: 'ready', active: true },
                { id: 'personal', label: 'personal@gmail', health: 'ready', active: false },
                { id: 'spare', label: 'spare@gmail', health: 'needs-signin', active: false }
            ]
        },
        // ‼️ X-226 (round 2) - the RULES beside those sign-ins, for exactly the
        // reason the sign-ins are here. "At a limit, carry on with" offers three
        // kinds of answer (stay, a rule, one named account) and a fixture with
        // accounts alone photographs a two-group picker as a flat list - the one
        // arity the row was built to show. One rule is deliberately refusing, so
        // the state a reader has to be able to tell apart is drawn too.
        policies: {
            claude: [
                {
                    id: '@emptiest', label: '@emptiest', picks: 'personal@gmail', note: '', refusal: '',
                    detail: 'The sign-in of this engine with the most of its five-hour window left at the moment the session starts.'
                },
                {
                    id: '@round-robin', label: '@round-robin', picks: 'work@studio', note: '', refusal: '',
                    detail: 'The usable sign-ins of this engine in turn, one after another across launches.'
                },
                {
                    id: '@gece', label: '@gece', picks: '', note: '',
                    refusal: 'every sign-in it lists is past its ceiling right now',
                    detail: '2 steps, in order.'
                }
            ]
        },
        engines: [
            { id: 'claude', label: 'Claude Code', ready: true, next: 'Ready, on a plan.' },
            { id: 'codex', label: 'Codex', ready: true, next: 'Ready, on a plan.' }
        ],
        clis: [],
        // ‼️ A-24 — what the "Sound on finish" row offers, in the three shapes it
        // really comes in: say nothing, the tones this machine can play (one of
        // them the user's own), and quiet. The `.ogg` is here on purpose — a
        // sound whose format Windows has no handler for is DRAWN and refused
        // rather than dropped, and a fixture without one would photograph a
        // list that cannot show that.
        finishSounds: [
            { id: '', label: 'Default' },
            { id: 'chime-soft', label: 'Chime, soft' },
            { id: 'bell-far', label: 'Bell, distant' },
            { id: 'tick-dry', label: 'Tick, dry' },
            { id: 'u-my-gong', label: 'My gong - no player here', off: true },
            { id: 'silent', label: 'Silent - no sound at all' }
        ],
        // ‼️ M-30 — what the "⚡ Superpowers" row offers. The empty one is FIRST
        // and is not "off": it hands the decision back to the agent's own
        // setting, which is what every run made before this row existed did.
        superpowersChoices: [
            { id: '', label: 'Agent default' },
            { id: 'on', label: 'On - this job works to the discipline' },
            { id: 'off', label: 'Off - not on this job' }
        ],
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
        when: 'every day 09:00', nextAt: NOW + 22 * 3600e3, agentName: 'developer',
        // ‼️ M-21 — THE ROW THAT LIED. `haiku` is a Claude model name; the
        // engine underneath it is Antigravity, so this pair cannot run — and
        // with only the model drawn, the row was indistinguishable from an
        // ordinary Claude schedule. That is how a user reverted an engine, read
        // "haiku" here, and believed it.
        model: 'haiku', engine: 'Antigravity',
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
        when: 'every day 05:00', nextAt: NOW + 14 * 3600e3, agentName: 'manager',
        model: 'opus', engine: '',
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
        when: 'on change · …/02_MEDIALASTIR', agentName: 'manager', model: '', engine: '',
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
    },
    {
        // A template is the object whose whole point is "that again", so the
        // launch it will do it WITH belongs on its row (M-21).
        id: 'tp1', kind: 'template', title: 'Sürüm notu taslağı',
        when: 'when you run it', agentName: 'developer',
        model: 'gpt-5.6-sol', engine: 'Codex',
        guard: '', hasGuard: false, switchable: false, enabled: true,
        cost7d: 0, runs7d: 0, skipped7d: 0, skipRate: 0,
        lastNote: '', issues: [], overdue: '',
        detail: {
            prompt: 'CHANGELOG üstündeki sürümü oku ve mağaza notunu yaz',
            target: 'runs on developer · headless', timing: '', steps: [], missed: '',
            setup: [
                { label: 'Agent', value: 'developer · headless' },
                { label: 'Engine', value: 'Codex' },
                { label: 'Model', value: 'gpt-5.6-sol' }
            ]
        }
    }
]);

/** M-38 — a workflow row that takes inputs, and what its last run was given. */
const wfWithInputs = () => ({
    id: 'w9', kind: 'workflow', title: 'Klip kes',
    when: 'when you run it (or a trigger does)', agentName: '', model: '', engine: '',
    guard: '', hasGuard: false, switchable: false, enabled: true,
    cost7d: 0, runs7d: 1, skipped7d: 0, skipRate: 0, lastRunAt: NOW - 7200e3,
    lastNote: '1 step(s)', issues: [], overdue: '',
    inputs: [
        { name: 'clip', type: 'file', required: true, description: 'the clip to cut' },
        { name: 'size', type: 'choice', choices: ['short', 'long'], default: 'short' }
    ],
    lastInputs: { clip: 'D:/in/2026-09-24_tanitim.mp4' },
    detail: { prompt: '', target: '', timing: '', steps: [], missed: '', setup: [] }
});

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

/**
 * ‼️ THE COMPOSER IS READ OFF THE PAGE ON EVERY CHANGE, AND THE SHIM PARSES ONLY
 * OPENING TAGS. A `<select>` that has just been redrawn therefore reports no
 * value (the choice lives on its `<option selected>`, which the shim does not
 * read) and a second change would blank everything the first one set. So the
 * whole draft is re-applied to the FRESH elements before each event: the page
 * reads the state we mean, redraws from it, and the picture is of a form a
 * person could actually have filled in.
 */
const drive = (r, draft, fireId) => {
    const el = (id) => r.query('#' + id)[0];
    Object.keys(draft).forEach(id => {
        const e = el(id);
        if (!e) { return; }
        if (typeof draft[id] === 'boolean') { e.checked = draft[id]; } else { e.value = draft[id]; }
    });
    const target = el(fireId);
    if (target) { target.fire('change'); }
};

const variants = () => ([
    { id: 'tasks', label: 'Tasks → Runs — four engines, and a cost column that tells the truth', data: data() },
    // U-153 — ONE checkpoint visit on the Runs table: the decision badge under the title, its figures on the title's hover
    { id: 'tasks-run-checkpoint', label: 'Tasks → Runs — a workflow checkpoint visit: the supervisor decision on the row (U-153)', data: Object.assign(data(), { runs: [{
        id: 'rcp', title: 'Klip hattı 3/5: checkpoint', agentName: 'checkpoint', mode: 'headless', status: 'done',
        source: 'Klip hattı', sourceKind: 'workflow', when: min(4), durMin: 0.3, detail: '', costUSD: 0.0187,
        engine: 'claude', reportsCost: true, hasOutput: true, outputFile: 'D:\\out\\rcp.md', prompt: 'Başlık kısa mı?',
        supervisor: { taskId: 'rcp', step: 3, title: 'Klip hattı 3/5: checkpoint', trigger: 'checkpoint', badge: '↻', decision: 'retry', target: 's2',
            word: 'retry s2', why: 'Başlık 90 karakteri aşıyor; daha kısa bir başlıkla yeniden çalıştır.', confidence: 0.81, costUSD: 0.0187,
            model: 'claude-haiku-4-5', limitsOrigin: 'allowed: the step · the rest: built-in', supervisorOrigin: 'model: the workflow · the rest: built-in', at: Date.now() - 240000 }
    }] }) },
    // A-27 — what a check decided beyond its verdict, under the status badge: one decision, then a climb upheld and the retries stopped
    { id: 'tasks-run-judge', label: 'Tasks → Runs — a check that climbed the judge ladder, and one whose retries were stopped (A-27)', data: Object.assign(data(), { runs: [{
        id: 'rj1', title: 'Klip hattı 2/5: Başlık yaz', agentName: 'senarist', mode: 'headless', status: 'done', verified: 'pass',
        source: 'Klip hattı', sourceKind: 'workflow', when: min(6), durMin: 1.2, detail: '', costUSD: 0.0412,
        engine: 'claude', reportsCost: true, hasOutput: true, outputFile: 'D:\\out\\rj1.md', prompt: 'Videoya kısa bir başlık yaz.',
        judge: { cell: 'overturned ~$0.04', short: '1 climb · 1 overturned · ~$0.04 saved', lines: ['Escalated: haiku said FAIL (FAIL başlık 60 karakteri aşıyor) → sonnet says PASS — overturned, no retry paid: PASS 58 karakter, kurala uyuyor'] }
    }, {
        id: 'rj2', title: 'Klip hattı 4/5: Kapak görseli (retry 1)', agentName: 'kurgu', mode: 'headless', status: 'failed', verified: 'fail',
        source: 'Klip hattı', sourceKind: 'workflow', when: min(9), durMin: 2.4, detail: '', costUSD: 0.1830,
        engine: 'claude', reportsCost: true, hasOutput: true, outputFile: 'D:\\out\\rj2.md', prompt: 'Kapak görselini üret.',
        judge: { cell: 'stopped ~$0.37', short: '1 climb · 1 stopped · ~$0.37 saved', lines: [
            'Escalated: haiku said FAIL (FAIL yazı okunmuyor) → sonnet says FAIL — upheld: FAIL başlık yazısı hâlâ okunmuyor',
            'Stopped: attempt 2 failed for the same reason as attempt 1 — 2 retries not paid for; the run\'s wake is mechanical, so no supervisor is asked'] }
    }] }) },
    { id: 'tasks-plan', label: 'Tasks → Plan — a schedule whose time passed, in a window that cannot fire', data: planData() },
    // ‼️ M-33 — THE BULK BAR EXISTS IN NO OTHER STATE. It is hidden until
    // something is ticked, so a picture of the Plan tab at rest shows none of
    // the change: not the delete button beside the two switches, and not what
    // the bar says when the selection holds rows that HAVE no switch (a
    // workflow, a template) — which is the whole reason every row can be
    // ticked now.
    {
        id: 'tasks-plan-selected',
        label: 'Tasks → Plan — every kind ticked, and the bar that says what each button can reach',
        data: planData(),
        act: (r) => {
            r.query('.rowsel').forEach(b => { b.checked = true; b.fire('change'); });
            // Ticking a box deliberately does NOT repaint the page (M-33: the
            // bar is kept true in place, so a host push cannot arrive between
            // two ticks and throw the reader's work away). The picture needs
            // the drawn state, so one push is asked for here — which is also
            // the state a person is in a second after ticking anything.
            r.send({ type: 'data', data: planData() });
        }
    },
    // ‼️ M-3 — the form with the retry block OPEN, which is the only state the
    // four numbers exist in. A picture of it shut would say nothing about the
    // row it adds, and the row is the change.
    // ‼️ M-27 — the form with a CHAIN in it, which is the only state the new
    // block exists in. Shut, the form shows one line of prose and a button; the
    // change is the rows, their round labels and the wait beside each one, and
    // none of that is drawn until somebody presses the button twice.
    {
        id: 'tasks-rounds',
        label: 'Tasks → the New-task form, with three rounds of one conversation',
        data: data(),
        act: (r) => {
            r.query('#nt-open')[0].click();
            drive(r, { 'nt-prompt': 'X-130 ölçümünü tekrarla ve sayıları yaz.' }, 'nt-prompt');
            r.query('#nt-roundadd')[0].click();
            r.query('#nt-roundadd')[0].click();
            // ‼️ Fired on `nt-start`, not on a round box. A textarea shows its
            // CHILD TEXT, not its `.value`, so driving the boxes alone paints a
            // picture of three placeholders. `nt-start` is the one control that
            // re-reads the whole form and repaints it, which is what puts the
            // typed words into the markup the camera sees.
            drive(r, {
                'nt-round-0': 'Şimdi testleri koş ve düşen varsa kök nedeni söyle.',
                'nt-roundw-0': '0',
                'nt-round-1': 'Temizse paketle, kur ve extensions.json sürümünü doğrula.',
                'nt-roundw-1': '15'
            }, 'nt-start');
        }
    },
    // ‼️ M-27 (V2) — THE SAME BLOCK ON A SCHEDULE, which is the case the
    // item was actually written about and the one it did not reach: the editor
    // was drawn here, what was typed into it was sent, and the save path threw
    // it away — so a schedule set up with three prompts fired a one-prompt run
    // every morning and looked exactly like one that had never been given any.
    // The picture is of the state a person would have been looking at while
    // that happened, and of the line that now names the kind ("Every firing
    // sends this one prompt and stops").
    {
        id: 'tasks-rounds-schedule',
        label: 'Tasks → a SCHEDULE set up to go three rounds of one conversation',
        data: data(),
        act: (r) => {
            r.query('#nt-open')[0].click();
            // The kind picker is the door: the composer opens on a task and this is
            // the control that moves it, which is exactly the gesture a person makes.
            drive(r, { 'nt-kind': 'schedule' }, 'nt-kind');
            drive(r, { 'nt-prompt': 'Sabah raporunu topla ve özetini yaz.' }, 'nt-prompt');
            r.query('#nt-roundadd')[0].click();
            r.query('#nt-roundadd')[0].click();
            // Fired on `nt-title`, not on a round box: a textarea shows its CHILD
            // TEXT and not its `.value`, so the form has to be re-read and
            // repainted before the camera sees the typed words (see tasks-rounds).
            // ‼️ Fired on `nt-mode`, which is one of the two controls a schedule
            // form has that re-read the whole draft and repaint it. A textarea
            // shows its CHILD TEXT and not its `.value`, so without a repaint the
            // picture is of three placeholders (see tasks-rounds). `nt-start` does
            // this on a task and does not exist here.
            drive(r, {
                'nt-title': 'sabah raporu',
                'nt-mode': 'headless',
                'nt-round-0': 'Geçen haftayla karşılaştır ve farkı söyle.',
                'nt-roundw-0': '0',
                'nt-round-1': 'Özeti not defterine yaz ve linkini döndür.',
                'nt-roundw-1': '30'
            }, 'nt-mode');
        }
    },
    {
        id: 'tasks-retry', label: 'Tasks → the New-task form, with a retry policy set',
        data: data(),
        act: (r) => {
            r.query('#nt-open')[0].click();
            // ‼️ M-10 — the boxes that exist ONLY in this state: the three named
            // waits, the strategy for 4+, the formula it opens, and the reset
            // buffer behind the tick. A picture of the block shut would show
            // none of the controls the item is about.
            const draft = {
                'nt-prompt': 'gece taraması — dosyaları filele',
                'nt-retrymode': 'custom', 'nt-retrymax': '6', 'nt-retrydelay': '30'
            };
            drive(r, draft, 'nt-retrymode');
            Object.assign(draft, {
                'nt-retrydelay2': '45', 'nt-retrydelay3': '90', 'nt-retrybackoff': 'formula'
            });
            drive(r, draft, 'nt-retrybackoff');
            Object.assign(draft, {
                'nt-retryformula': 'min(prev * 1.5, 120)', 'nt-retrycap': '240',
                'nt-retryresetaware': true, 'nt-retrysafety': '3'
            });
            drive(r, draft, 'nt-retryresetaware');
            // ‼️ M-10 (second half) — WHAT a retry is, as opposed to WHEN. The
            // continuation prompt and the "if it cannot tell" picker are drawn
            // by this state and by nothing else, so a picture of the block in
            // `simple` shows neither of the controls the item is about.
            Object.assign(draft, {
                'nt-retrybehavior': 'smart',
                'nt-continuationprompt': 'Kaldığın yerden devam et — {progressSummary}',
                'nt-unknownfallback': 'park'
            });
            drive(r, draft, 'nt-retrybehavior');
        }
    },
    // M-13 — the supervisor's boxes exist only under behavior "supervisor".
    {
        id: 'tasks-retry-supervisor', label: 'Tasks → the New-task form, a retry a supervisor decides (M-13)',
        data: data(),
        act: (r) => {
            r.query('#nt-open')[0].click();
            const draft = { 'nt-prompt': 'gece taraması — dosyaları filele', 'nt-retrymode': 'custom', 'nt-retrymax': '3' };
            drive(r, draft, 'nt-retrymode');
            Object.assign(draft, { 'nt-retrybehavior': 'supervisor' });
            drive(r, draft, 'nt-retrybehavior');
            Object.assign(draft, {
                'nt-supengine': 'claude', 'nt-supmodel': 'haiku', 'nt-supcalls': '2',
                'nt-supbudget': '0.5', 'nt-supconf': '0.7', 'nt-supfallback': 'park'
            });
            // the behavior box reads AND redraws; the supervisor boxes only read
            drive(r, draft, 'nt-retrybehavior');
        }
    },
    // U-151 — Farm Settings names the supervisor and the task says nothing: every
    // box is empty and shows the inherited value faint (the smallest arity).
    {
        id: 'tasks-retry-supervisor-inherits', label: 'Tasks → the supervisor boxes empty, inheriting Farm Settings (U-151)',
        data: (() => { const d = data(); d.launch.supervisor = { engine: 'claude', model: 'haiku', maxCalls: 4, minConfidence: 0.7 }; return d; })(),
        act: (r) => {
            r.query('#nt-open')[0].click();
            const draft = { 'nt-prompt': 'gece taraması — dosyaları filele', 'nt-retrymode': 'custom', 'nt-retrymax': '3' };
            drive(r, draft, 'nt-retrymode');
            Object.assign(draft, { 'nt-retrybehavior': 'supervisor' });
            drive(r, draft, 'nt-retrybehavior');
        }
    },
    // U-151 — the agent and the project say something too: each empty box names
    // the level it inherits from (the longest origins the row has to hold).
    {
        id: 'tasks-retry-supervisor-layers', label: 'Tasks → the supervisor boxes inheriting from the agent and the project (U-151)',
        data: (() => {
            const d = data();
            d.launch.supervisor = { engine: 'claude', model: 'haiku', maxCalls: 4 };
            d.launch.supervisorOverrides = { agent: { developer: { maxCalls: 3, minConfidence: 0.8 } }, project: { prj_1: { engine: 'codex', lowConfidence: 'park' } } };
            return d;
        })(),
        act: (r) => {
            r.query('#nt-open')[0].click();
            const draft = { 'nt-prompt': 'gece taraması — dosyaları filele', 'nt-agent': 'developer', 'nt-project': 'prj_1', 'nt-retrymode': 'custom', 'nt-retrymax': '3' };
            drive(r, draft, 'nt-retrymode');
            Object.assign(draft, { 'nt-retrybehavior': 'supervisor' });
            drive(r, draft, 'nt-retrybehavior');
        }
    },
    // U-151 — one box holds this task's own value: ↑ beside it, pressed, opens the
    // strip that moves it up the chain (this project · this agent · everywhere) or drops it.
    {
        id: 'tasks-retry-supervisor-promote', label: 'Tasks → a supervisor box with its own value, ↑ pressed: make it the default for this project · this agent · everywhere, or ↺ back (U-151)',
        data: (() => {
            const d = data();
            d.launch.supervisor = { engine: 'claude', model: 'haiku', maxCalls: 4 };
            d.launch.supervisorOverrides = { agent: { developer: { maxCalls: 3 } } };
            return d;
        })(),
        act: (r) => {
            r.query('#nt-open')[0].click();
            const draft = { 'nt-prompt': 'gece taraması — dosyaları filele', 'nt-agent': 'developer', 'nt-project': 'prj_1', 'nt-retrymode': 'custom', 'nt-retrymax': '3' };
            drive(r, draft, 'nt-retrymode');
            Object.assign(draft, { 'nt-retrybehavior': 'supervisor' });
            drive(r, draft, 'nt-retrybehavior');
            Object.assign(draft, { 'nt-supmodel': 'sonnet' });
            drive(r, draft, 'nt-supmodel');
            const up = r.query('[data-flexup]').find(e => e.dataset.flexup === 'retry.supervisor.model');
            if (!up) { throw new Error('no ↑ beside the model box'); }
            up.click();
        }
    },
    /**
     * ‼️ S-82 — THE RELAY BLOCK, IN THE STATE THAT HAS TO EXPLAIN ITSELF.
     *
     * The two boxes under the tick exist only while it is on, so the smallest
     * scene is the tick alone (every other form scene photographs that). This
     * is the next arity, and the one the pool row was written for: an Account
     * that names a SINGLE SLOT, which a chain cannot run on — the row must say
     * so on its first line rather than draw a rule nobody chose.
     */
    {
        id: 'tasks-baton', label: 'Tasks → the New-task form opening a relay, Account on a single slot (S-82)',
        data: data(),
        act: (r) => {
            r.query('#nt-open')[0].click();
            drive(r, { 'nt-prompt': 'gece taraması — kaldığın yerden devam et', 'nt-account': 'personal' }, 'nt-account');
            drive(r, { 'nt-baton': true }, 'nt-baton');
        }
    },
    /** …and the same block with a rule chosen as the pool and a ceiling of its own. */
    {
        id: 'tasks-baton-pool', label: 'Tasks → a relay on the @gece pool, four legs at most (S-82)',
        data: data(),
        act: (r) => {
            r.query('#nt-open')[0].click();
            drive(r, { 'nt-prompt': 'gece taraması — kaldığın yerden devam et', 'nt-baton': true }, 'nt-baton');
            drive(r, { 'nt-batonpool': '@gece' }, 'nt-batonpool');
            drive(r, { 'nt-batonmaxhops': '4' }, 'nt-baton');
        }
    },
    /**
     * ‼ X-106 — THE FORM WITH A ROUTE ON IT, WHICH IS THE ONE STATE THE TWO
     * BOXES EXIST FOR.
     *
     * They are drawn only where the chosen engine has a provider axis with
     * something set up, and the TIER box only once a route has been picked —
     * so a picture of the form untouched photographs neither. What has to be
     * read here is that they sit with the other launch dimensions rather than
     * beside the prompt, and that the tier row appears UNDER the route it
     * belongs to.
     */
    {
        id: 'tasks-route',
        label: 'Tasks → the New-task form, pointed at a route (X-106)',
        data: data(),
        act: (r) => {
            r.query('#nt-open')[0].click();
            const draft = {
                'nt-prompt': 'gece taraması — Kimi rotasında',
                'nt-route': 'kimi-work'
            };
            drive(r, draft, 'nt-route');
            Object.assign(draft, { 'nt-tier': 'opus' });
            drive(r, draft, 'nt-tier');
        }
    },
    /**
     * ‼ X-169 — AND WHOSE PLAN PAYS FOR IT, which is the box a machine rotating
     * three sign-ins needs most on THIS form: a task fires with nobody watching,
     * so an account not named when the task is written is never named at all.
     *
     * What has to be read here is that it sits with the other launch dimensions
     * rather than beside the prompt, that the empty row says what leaving it
     * empty MEANS, and that a slot whose token has fallen over is marked before
     * anybody schedules a night on it.
     */
    {
        id: 'tasks-account',
        label: 'Tasks → the New-task form, billed to a named sign-in (X-169)',
        data: data(),
        act: (r) => {
            r.query('#nt-open')[0].click();
            const draft = {
                'nt-prompt': 'gece taraması — ikinci hesapta',
                'nt-account': 'personal'
            };
            drive(r, draft, 'nt-account');
        }
    },
    /**
     * ‼️ X-224 — AND THE SAME QUESTION ON A LINK OF A CHAIN, which is where it
     * bites hardest: every step of a workflow is headless, so three steps on one
     * sign-in eat one plan and the chain hits the wall in the middle with nobody
     * in front of it. The step card is only drawn while a step is being edited,
     * so a picture of the chain shut photographs the one state this row is not
     * in — the card is opened here on the step that names an account.
     */
    {
        id: 'tasks-step-account',
        label: 'Tasks → a workflow step, billed to its own sign-in (X-224)',
        data: data(),
        act: (r) => {
            r.send({
                type: 'plan-compose', kind: 'workflow',
                seed: {
                    mode2: 'edit', id: 'w1', title: 'gece zinciri', stepIdx: 1,
                    steps: [
                        {
                            stype: 'agent', title: 'Topla', agent: 'developer',
                            prompt: 'rakamları topla', smode: 'headless'
                        },
                        {
                            stype: 'agent', title: 'Yaz', agent: 'manager',
                            prompt: 'raporu yaz', smode: 'headless', saccount: 'personal'
                        }
                    ]
                }
            });
        }
    },
    /**
     * ‼️ X-228 — THE STEP CARD AT ITS SMALLEST ARITY: ONE NEW STEP, EVERY
     * LAUNCH BOX AT DEFAULT.
     *
     * `tasks-step-account` photographs the card with a chain already in it and
     * an account picked — the state the X-224 row exists for. That is the LARGE
     * arity, and it is not the one X-228 is about: what X-228 added is the six
     * launch boxes themselves (engine · model · effort · permissions · route ·
     * tier), and the state every one of them is first seen in is the state
     * nobody had drawn — a step just added, nothing chosen, every box reading
     * `Default`. That is where a box that says nothing about what empty MEANS,
     * or a row that falls out of the grid because it has no value to hold, is
     * visible; a card already filled in hides both (U-133 shipped twice for
     * exactly this reason).
     *
     * It is reached the way a person reaches it — open the composer, move the
     * kind picker to `workflow`, press `+ Add a step` — rather than by seeding
     * a draft, so the picture is of a card the page itself built.
     */
    {
        id: 'tasks-step-launch',
        label: 'Tasks → a brand-new workflow step, every launch box at Default (X-228)',
        data: data(),
        act: (r) => {
            r.query('#nt-open')[0].click();
            // The kind picker is the door into the chain form, exactly as in
            // `tasks-rounds-schedule`: the composer opens on a task.
            drive(r, { 'nt-kind': 'workflow' }, 'nt-kind');
            r.query('#nt-stadd')[0].click();
        }
    },
    // M-38 — a workflow's Inputs block on its form: one file input (required), one choice with a default.
    {
        id: 'tasks-wf-inputs',
        label: 'Tasks → a workflow form with its Inputs block — a required file, a choice with a default (M-38)',
        data: data(),
        act: (r) => {
            r.send({
                type: 'plan-compose', kind: 'workflow',
                seed: {
                    mode2: 'edit', id: 'w9', title: 'Klip kes', stepIdx: null,
                    steps: [{ stype: 'agent', title: 'Kes', agent: 'developer', prompt: 'Şu klibi kes: {input.clip} ({input.size})', smode: 'headless' }],
                    inputs: [
                        { name: 'clip', type: 'file', required: true, description: 'the clip to cut' },
                        { name: 'size', type: 'choice', choices: ['short', 'long'], default: 'short' }
                    ]
                }
            });
        }
    },
    // X-420 — ONE airtable input (the smallest arity): its search line under its row.
    {
        id: 'tasks-wf-airtable-input',
        label: 'Tasks → a workflow form with one airtable input — its search line: "kedi", final stage, images, newest (X-420)',
        data: data(),
        act: (r) => {
            r.send({
                type: 'plan-compose', kind: 'workflow',
                seed: {
                    mode2: 'edit', id: 'w9', title: 'Kedileri anlat', stepIdx: null,
                    steps: [{ stype: 'agent', title: 'Anlat', agent: 'developer', prompt: 'Bu kayıtları anlat: {input.refs}', smode: 'headless' }],
                    inputs: [{ name: 'refs', type: 'airtable', description: 'the cat pictures', airtable: { query: 'kedi', stages: 'final', kind: 'image', sort: 'newest' } }]
                }
            });
        }
    },
    // M-39 — three steps, each with its id chip; the second chip's panel open (a step read two steps back).
    {
        id: 'tasks-wf-stepids',
        label: 'Tasks → a workflow form: every step shows its id chip, the second one\'s panel open (M-39)',
        tip: 'wfsidw:2',
        data: data(),
        act: (r) => {
            r.send({
                type: 'plan-compose', kind: 'workflow',
                seed: {
                    mode2: 'edit', id: 'w10', title: 'Rapor zinciri', stepIdx: null,
                    steps: [
                        { sid: 's1', stype: 'agent', title: 'Veriyi topla', agent: 'developer', prompt: 'JSON ver', smode: 'headless' },
                        { sid: 's2', stype: 'agent', title: 'Özetle', agent: 'developer', prompt: '{prev_text}', smode: 'headless' },
                        { sid: 's3', stype: 'agent', title: 'Yayınla', agent: 'developer', prompt: '{steps.s1.json.title}: {steps.s2.text}', smode: 'headless' }
                    ]
                }
            });
        }
    },
    // M-40 — a step's For each row: the list typed, the six policy boxes it grows (blank = the default).
    {
        id: 'tasks-step-foreach',
        label: 'Tasks → a workflow step run once per element of a list, and its policy boxes (M-40)',
        data: data(),
        act: (r) => {
            r.query('#nt-open')[0].click();
            drive(r, { 'nt-kind': 'workflow' }, 'nt-kind');
            r.query('#nt-stadd')[0].click();
            drive(r, { 'nt-st-title': 'Parçayı işle', 'nt-st-prompt': 'parça {index}: {item}', 'nt-st-feList': '{steps.s1.json.parts}' }, 'nt-st-feList');
        }
    },
    // M-43 — a checkpoint step's card: its message, the six decisions ticked (the default), and the limits they grow.
    {
        id: 'tasks-step-checkpoint',
        label: 'Tasks → a workflow checkpoint step: what the supervisor may decide here, and its limits (M-43)',
        data: data(),
        act: (r) => {
            r.query('#nt-open')[0].click();
            drive(r, { 'nt-kind': 'workflow' }, 'nt-kind');
            r.query('#nt-stadd')[0].click();
            drive(r, { 'nt-st-title': 'Kontrol', 'nt-st-stype': 'checkpoint' }, 'nt-st-stype');
        }
    },
    // M-49 — a tool step just switched to: the recipe picker alone (the smallest card).
    {
        id: 'tasks-step-tool-empty',
        label: 'Tasks → a workflow tool step before a recipe is picked (M-49)',
        data: data(),
        act: (r) => {
            r.query('#nt-open')[0].click();
            drive(r, { 'nt-kind': 'workflow' }, 'nt-kind');
            r.query('#nt-stadd')[0].click();
            drive(r, { 'nt-st-title': 'Parçala', 'nt-st-stype': 'tool' }, 'nt-st-stype');
        }
    },
    // M-49 — a split with its preset: blank boxes show the preset's values, one box overridden.
    {
        id: 'tasks-step-tool',
        label: 'Tasks → a workflow tool step: split, the Omni Flash preset, one parameter overridden (M-49)',
        data: data(),
        act: (r) => {
            r.query('#nt-open')[0].click();
            drive(r, { 'nt-kind': 'workflow' }, 'nt-kind');
            r.query('#nt-stadd')[0].click();
            drive(r, { 'nt-st-title': 'Parçala', 'nt-st-stype': 'tool' }, 'nt-st-stype');
            drive(r, { 'nt-st-tRecipe': 'split' }, 'nt-st-tRecipe');
            drive(r, { 'nt-st-tPreset': 'Omni Flash parts' }, 'nt-st-tPreset');
            // typed boxes are read on `input`; a change on the overwrite picker reads them all and redraws
            drive(r, { 'nt-st-tInput': '{input.clip}', 'nt-st-tp-overlapSec': '1' }, 'nt-st-tOverwrite');
        }
    },
    // M-53 — the short recipe inside a for-each: every box a template off the picked moment.
    {
        id: 'tasks-step-tool-short',
        label: 'Tasks → a workflow tool step: cut a short — start, end and SRT off each picked moment (M-53)',
        data: data(),
        act: (r) => {
            r.query('#nt-open')[0].click();
            drive(r, { 'nt-kind': 'workflow' }, 'nt-kind');
            r.query('#nt-stadd')[0].click();
            drive(r, { 'nt-st-title': 'Kısaları kes', 'nt-st-stype': 'tool' }, 'nt-st-stype');
            drive(r, { 'nt-st-tRecipe': 'short' }, 'nt-st-tRecipe');
            drive(r, { 'nt-st-tInput': '{input.video}', 'nt-st-tp-start': '{item.start}', 'nt-st-tp-end': '{item.end}', 'nt-st-tp-srt': '{item.srt}' }, 'nt-st-tOverwrite');
        }
    },
    // X-418 — a tool step that files its parts into another database, as assets: the step's Library row set.
    {
        id: 'tasks-step-tool-library',
        label: 'Tasks → a workflow tool step whose files go to TEST as assets: its Library row (X-418)',
        data: data(),
        act: (r) => {
            r.query('#nt-open')[0].click();
            drive(r, { 'nt-kind': 'workflow' }, 'nt-kind');
            r.query('#nt-stadd')[0].click();
            drive(r, { 'nt-st-title': 'Anahtar kare', 'nt-st-stype': 'tool' }, 'nt-st-stype');
            drive(r, { 'nt-st-tRecipe': 'split' }, 'nt-st-tRecipe');
            // the Library boxes are read on change without a redraw; the overwrite picker reads every box and redraws
            drive(r, { 'nt-st-libBase': 'TEST', 'nt-st-libRecord': 'passed', 'nt-st-libStage': 'asset' }, 'nt-st-libStage');
            drive(r, {}, 'nt-st-tOverwrite');
        }
    },
    // X-418 — the workflow form's Library block: another database, ask before starting its engine.
    {
        id: 'tasks-wf-library',
        label: 'Tasks → a workflow form: its Library block — stem-draft, every file recorded, ask before starting the engine (X-418), its stage folders: FAIL → semi, last output → asset (X-417), records filled as each file is ready — three sections, $0.05 a record (X-419)',
        data: data(),
        act: (r) => {
            r.send({
                type: 'plan-compose', kind: 'workflow',
                seed: {
                    mode2: 'edit', id: 'w12', title: '34 sn dilim', stepIdx: null, libBase: 'stem-draft', libLang: '', libStart: 'ask', libRecord: 'all', libTemplate: '',
                    libMapInput: '', libMapIntermediate: '', libMapFailed: 'semi', libMapRejected: '', libMapFinal: 'asset',
                    libEnWhen: 'record', libEnScope: '', libEnModel: '', libEnVideo: '', libEnEffort: '', libEnSections: 'identity, seo, tags', libEnCap: '0.05',
                    steps: [{ sid: 's1', stype: 'tool', title: 'Böl', toolJson: '{"recipe":"split","input":"{input.clip}"}' }]
                }
            });
        }
    },
    // U-151 — the workflow form's enrich boxes: the empty ones show the Farm Settings value faint, the
    // one this workflow sets carries ↑, pressed — the only level above a workflow here is everywhere.
    {
        id: 'tasks-wf-library-promote',
        label: 'Tasks → a workflow form\'s "Fill the records" boxes: Farm Settings values faint, ↑ pressed on the model this workflow sets — make it the default everywhere, or ↺ back (U-151)',
        data: (() => { const d = data(); d.launch.flexSettings = { 'library.enrich.effort': 'medium', 'library.enrich.when': 'end', 'library.enrich.cap': 0.1 }; return d; })(),
        act: (r) => {
            r.send({
                type: 'plan-compose', kind: 'workflow',
                seed: {
                    mode2: 'edit', id: 'w12', title: '34 sn dilim', stepIdx: null, libBase: '', libLang: '', libStart: '', libRecord: '', libTemplate: '',
                    libMapInput: '', libMapIntermediate: '', libMapFailed: '', libMapRejected: '', libMapFinal: '',
                    libEnWhen: '', libEnScope: '', libEnModel: 'opus', libEnVideo: '', libEnEffort: '', libEnSections: '', libEnCap: '',
                    steps: [{ sid: 's1', stype: 'tool', title: 'Böl', toolJson: '{"recipe":"split","input":"{input.clip}"}' }]
                }
            });
            const up = r.query('[data-flexup]').find(e => e.dataset.flexup === 'library.enrich.model');
            if (!up) { throw new Error('no ↑ beside the enrich model box'); }
            up.click();
        }
    },
    // U-151 — the step card: a tool step with its own output folder, database, records and wake set;
    // ↑ pressed on the database — the only level above a step here is this flow (a move inside the form).
    {
        id: 'tasks-wf-step-promote',
        label: 'Tasks → a workflow\'s step card: ↑ beside the tool\'s output folder, the Library database and records, and Wake after it — pressed on the database: make it this flow\'s, or ↺ back; the empty boxes show what they inherit faint — language and template from the workflow, "file already there" from Farm Settings (U-151)',
        data: (() => { const d = data(); d.launch.flexSettings = { 'tool.overwrite': 'suffix' }; return d; })(),
        act: (r) => {
            r.send({
                type: 'plan-compose', kind: 'workflow',
                seed: {
                    mode2: 'edit', id: 'w12', title: '34 sn dilim', stepIdx: 0, libBase: '', libLang: 'EN', libStart: '', libRecord: '', libTemplate: 'Video-Raw',
                    steps: [{
                        sid: 's1', stype: 'tool', title: 'Böl', libBase: 'TEST', libRecord: 'passed', libStage: 'asset',
                        toolJson: '{"recipe":"split","input":"{input.clip}","outDir":"D:/out"}',
                        wake: [{ id: 'step-failed', field: 'step.status', operator: 'eq', value: 'failed' }]
                    }]
                }
            });
            const up = r.query('[data-flexup]').find(e => e.dataset.flexup === 'library.base');
            if (!up) { throw new Error('no ↑ beside the step\'s database box'); }
            up.click();
        }
    },
    // M-43 — a chain with one checkpoint on its list, and the workflow's goal + success criteria the supervisor reads.
    {
        id: 'tasks-wf-goal',
        label: 'Tasks → a workflow form: a checkpoint on the step list, the goal and one success criterion (M-43)',
        data: data(),
        act: (r) => {
            r.send({
                type: 'plan-compose', kind: 'workflow',
                seed: {
                    mode2: 'edit', id: 'w11', title: 'Klip', stepIdx: null, goal: '34 saniyelik dikey klip, paylaşmaya hazır', criteria: '35 saniyenin altında',
                    steps: [
                        { sid: 's1', stype: 'agent', title: 'Senaryo', agent: 'developer', prompt: 'yaz', smode: 'headless' },
                        { sid: 's2', stype: 'checkpoint', title: 'Kontrol', cpMsg: 'Senaryo kısa ve markaya uygun mu?' }
                    ]
                }
            });
        }
    },
    // M-53 — two steps name roles: senarist is this workflow's (developer), kurgu is left to the showrunner; the first step's card is open.
    {
        id: 'tasks-wf-roles',
        label: 'Tasks → a workflow whose steps name roles: senarist given to developer, kurgu left to the showrunner youtuber; the senarist step open (M-53)',
        data: Object.assign(data(), { showrunner: 'youtuber' }),
        act: (r) => {
            r.send({
                type: 'plan-compose', kind: 'workflow',
                seed: {
                    mode2: 'edit', id: 'w17', title: 'Kısa video', stepIdx: 0, goal: '', criteria: '', roles: { senarist: 'developer' },
                    steps: [
                        { sid: 's1', stype: 'agent', title: 'Senaryo', agent: 'developer', role: 'senarist', prompt: 'Konu için 30 sn senaryo yaz', smode: 'headless' },
                        { sid: 's2', stype: 'agent', title: 'Kurgu notu', agent: 'developer', role: 'kurgu', prompt: 'Senaryoyu kurgu notuna çevir', smode: 'headless' }
                    ]
                }
            });
        }
    },
    // M-50 — the workflow names the production whose brand kit its steps read as {brand.*}.
    {
        id: 'tasks-wf-brand',
        label: 'Tasks → a workflow form reading its brand kit from the production Kanal A (M-50)',
        data: Object.assign(data(), { scenes: [
            { id: 'kanal-a', label: 'Kanal A — the whole production' }, { id: 'kanal-a/s01', label: 'Kanal A · Açılış' },
            { id: 'kanal-b', label: 'Kanal B — the whole production' }] }),
        act: (r) => {
            r.send({
                type: 'plan-compose', kind: 'workflow',
                seed: {
                    mode2: 'edit', id: 'w15', title: 'Klip', stepIdx: null, goal: '', criteria: '', production: 'kanal-a',
                    steps: [{ sid: 's1', stype: 'agent', title: 'Senaryo', agent: 'developer', prompt: '{brand.character.ana.name} için yaz — {brand.style}', smode: 'headless' }]
                }
            });
        }
    },
    // M-50 — a step card reading Kanal A's kit: one character, the empty boxes faint with the kit's values, the step's own style typed.
    {
        id: 'tasks-wf-brand-step',
        label: 'Tasks → a workflow step reading Kanal A\'s brand kit: the empty boxes show the kit faint, its own style "noir" typed, one character (M-50)',
        data: Object.assign(data(), {
            scenes: [{ id: 'kanal-a', label: 'Kanal A — the whole production' }],
            brandKits: { 'kanal-a': { style: 'sıcak pastel, 35mm', negative: 'metin, filigran', voice: 'tr-TR-Ahmet', aspect: '9:16', logo: 'keep',
                character: { ana: { name: 'Ada', ref: 'D:/brand/ada.png', desc: 'kızıl saçlı, sarı yağmurluk' } } } }
        }),
        act: (r) => {
            r.send({
                type: 'plan-compose', kind: 'workflow',
                seed: {
                    mode2: 'edit', id: 'w16', title: 'Klip', stepIdx: 0, goal: '', criteria: '', production: 'kanal-a',
                    steps: [{ sid: 's1', stype: 'agent', title: 'Görsel istemi', agent: 'developer', smode: 'headless',
                        prompt: '{brand.character.ana.name}: {brand.character.ana.desc} — {brand.style}', brand: { style: 'noir' } }]
                }
            });
        }
    },
    // M-50 — the Run card of a workflow whose steps read the brand: this run reads Kanal B instead of the workflow's Kanal A.
    // M-53 — Run with… on a workflow with two roles: this run gives kurgu to developer; senarist stays the workflow's.
    {
        id: 'tasks-wf-roles-runcard',
        label: 'Tasks → Plan → with… on a workflow with roles: senarist stays the workflow\'s yazar, this run gives kurgu to developer instead of the showrunner (M-53)',
        data: Object.assign(data(), {
            tab: 'plan', plan: [Object.assign(wfWithInputs(), { inputs: [], lastInputs: {},
                roleSlots: [{ role: 'senarist', agent: 'yazar', from: 'workflow' }, { role: 'kurgu', agent: 'youtuber', from: 'showrunner' }] })],
            workflows: [{ id: 'w9', title: 'Klip kes', steps: 2, inputs: [] }]
        }),
        act: (r) => {
            r.query('[data-plan="runwith"][data-kind="workflow"]')[0].click();
            const el = r.query('[data-af]').find(e => e.dataset.af === 'wi-roles.kurgu');
            if (!el) { throw new Error('no kurgu box on the Run card'); }
            el.value = 'developer'; el.fire('change');
        }
    },
    // A-27 — Run with…'s Cost preset: Economy picked, its $5 cap and haiku ladder shown faint in the two boxes it fills
    {
        id: 'tasks-wf-cost-preset',
        label: 'Tasks → Plan → with… on a workflow, the Economy cost preset picked: the Run cap and Judge ladder boxes show its values faint (A-27)',
        data: (() => {
            const d = Object.assign(data(), {
                tab: 'plan', plan: [Object.assign(wfWithInputs(), { inputs: [], lastInputs: {} })],
                workflows: [{ id: 'w9', title: 'Klip kes', steps: 2, inputs: [] }]
            });
            d.launch = Object.assign({}, d.launch, { workflowPresets: [
                { name: 'Economy', describe: 'cheap judge, low ceilings', run: { judgeLadder: 'haiku', spendCap: 5 } },
                { name: 'Quality', describe: 'strong judges, no cap', run: { judgeLadder: 'sonnet,opus', spendCap: 0 } }] });
            return d;
        })(),
        act: (r) => {
            r.query('[data-plan="runwith"][data-kind="workflow"]')[0].click();
            const el = r.query('[data-af]').find(e => e.dataset.af === 'wi-preset');
            if (!el) { throw new Error('no Cost preset picker on the Run card'); }
            el.value = 'Economy'; el.fire('change');
        }
    },
    {
        id: 'tasks-wf-brand-runcard',
        label: 'Tasks → Plan → with… on a workflow whose steps read {brand.*}: this run takes Kanal B\'s kit instead of the workflow\'s Kanal A (M-50)',
        data: Object.assign(data(), {
            tab: 'plan', plan: [Object.assign(wfWithInputs(), { inputs: [], lastInputs: {}, production: 'kanal-a', usesBrand: true })],
            workflows: [{ id: 'w9', title: 'Klip kes', steps: 1, inputs: [] }],
            scenes: [{ id: 'kanal-a', label: 'Kanal A — the whole production' }, { id: 'kanal-b', label: 'Kanal B — the whole production' }]
        }),
        act: (r) => {
            r.query('[data-plan="runwith"][data-kind="workflow"]')[0].click();
            const el = r.query('[data-af]').find(e => e.dataset.af === 'wi-production');
            if (!el) { throw new Error('no Brand kit box on the Run card'); }
            el.value = 'kanal-b'; el.fire('change');
        }
    },
    // M-45 — the workflow form's Wake block: ONE condition of the user's own (the smallest arity), then the hybrid preset's three.
    {
        id: 'tasks-wf-wake-one',
        label: 'Tasks → a workflow form waking its supervisor on one condition of its own (M-45)',
        data: data(),
        act: (r) => {
            r.send({
                type: 'plan-compose', kind: 'workflow',
                seed: {
                    mode2: 'edit', id: 'w12', title: 'Klip', stepIdx: null, goal: '', criteria: '',
                    steps: [{ sid: 's1', stype: 'agent', title: 'Senaryo', agent: 'developer', prompt: 'yaz', smode: 'headless' }],
                    wake: [{ id: 'pahali', field: 'cost.step', operator: 'gt', value: 0.5 }]
                }
            });
        }
    },
    {
        id: 'tasks-wf-wake-hybrid',
        label: 'Tasks → a workflow form on the Hybrid preset: a failed check, a failed step, the run past $2 (M-45)',
        data: data(),
        act: (r) => {
            r.send({
                type: 'plan-compose', kind: 'workflow',
                seed: {
                    mode2: 'edit', id: 'w13', title: 'Klip', stepIdx: null, goal: '', criteria: '',
                    steps: [{ sid: 's1', stype: 'agent', title: 'Senaryo', agent: 'developer', prompt: 'yaz', smode: 'headless' }],
                    wake: require('../../out/core/workflowWake.js').wakePresetConditions('hybrid')
                }
            });
        }
    },
    // M-45 — a step's own override on its card: its own condition instead of the workflow's hybrid.
    {
        id: 'tasks-step-wake',
        label: 'Tasks → a workflow step overriding the wake conditions after it (M-45)',
        data: data(),
        act: (r) => {
            const own = [{ id: 'bos', field: 'asset.count', operator: 'eq', value: 0 }];
            const step = { sid: 's1', stype: 'media', title: 'Görsel', mModel: 'fal-ai/flux/schnell', mInput: '{}', wake: own };
            r.send({
                type: 'plan-compose', kind: 'workflow',
                seed: {
                    mode2: 'edit', id: 'w14', title: 'Klip', stepIdx: 0, goal: '', criteria: '',
                    wake: require('../../out/core/workflowWake.js').wakePresetConditions('hybrid'),
                    steps: [step], step: JSON.parse(JSON.stringify(step))
                }
            });
        }
    },
    // M-38 — run pressed on a workflow that takes inputs: its Run card, prefilled from the last run.
    {
        id: 'tasks-wf-runcard',
        label: 'Tasks → Plan → run on a workflow with inputs opens its Run card, prefilled from the last run (M-38)',
        data: Object.assign(data(), {
            tab: 'plan', plan: [wfWithInputs()],
            workflows: [{ id: 'w9', title: 'Klip kes', steps: 1, inputs: wfWithInputs().inputs }]
        }),
        act: (r) => { r.query('[data-plan="run"][data-kind="workflow"]')[0].click(); }
    },
    // U-151 — the Run card: this run's size differs from the workflow's default and it wakes on Hybrid;
    // ↑ pressed on size — the level above a run here is the workflow itself.
    {
        id: 'tasks-wf-runcard-promote',
        label: 'Tasks → Plan → a workflow\'s Run card: ↑ beside the inputs that differ from its default and beside Wake — pressed on size: make it this flow\'s default, or ↺ back (U-151)',
        data: Object.assign(data(), {
            tab: 'plan', plan: [wfWithInputs()],
            workflows: [{ id: 'w9', title: 'Klip kes', steps: 1, inputs: wfWithInputs().inputs }]
        }),
        act: (r) => {
            r.query('[data-plan="run"][data-kind="workflow"]')[0].click();
            // the card is the page form: its boxes are named by their key, not an id
            const pick = (key, v) => { const el = r.query('[data-af]').find(e => e.dataset.af === key); el.value = v; el.fire('change'); };
            pick('wi-run.size', 'long');
            pick('wi-wake', 'hybrid');
            const up =r.query('[data-flexup]').find(e => e.dataset.flexup === 'workflow.input#size');
            if (!up) { throw new Error('no ↑ beside the size box'); }
            up.click();
        }
    },
    // U-151 — a schedule whose retry is supervised: 'with…' runs it now with this run's own supervisor
    // values; the Economy preset picked, so every empty box says what it would use and from where.
    {
        id: 'tasks-schedule-runwith',
        label: 'Tasks → Plan → with… on a supervised schedule: this run\'s own supervisor values, the Economy preset picked — the empty boxes show the preset\'s and the schedule\'s values faint (U-151)',
        data: (() => {
            const d = Object.assign(data(), { tab: 'plan', plan: [Object.assign(wfWithInputs(), {
                id: 's7', kind: 'schedule', title: 'Gece özeti', when: 'every day at 03:00', agentName: 'developer',
                inputs: undefined, lastInputs: undefined, supervised: true, supervisor: { engine: 'claude', model: 'haiku', maxCalls: 2 }
            })] });
            d.launch.runPresets = [
                { name: 'Economy', describe: 'The cheapest judge, one supervisor call with a $0.50 cap.', supervisor: { maxCalls: 1, budgetUsd: 0.5 } },
                { name: 'Quality', describe: 'A stronger judge, three supervisor calls.', supervisor: { maxCalls: 3, budgetUsd: 0 } }
            ];
            return d;
        })(),
        act: (r) => {
            r.query('[data-plan="runwith"][data-kind="schedule"]')[0].click();
            const el = r.query('[data-af]').find(e => e.dataset.af === 'rs-preset');
            el.value = 'Economy';
            el.fire('change');
        }
    },
    // M-38 — a trigger that runs that workflow: what it hands each input when it fires.
    {
        id: 'tasks-wf-triggermap',
        label: 'Tasks → a trigger running a workflow with inputs, and the mapping rows it grows (M-38)',
        data: Object.assign(data(), {
            tab: 'plan', plan: [wfWithInputs()],
            workflows: [{ id: 'w9', title: 'Klip kes', steps: 1, inputs: wfWithInputs().inputs }]
        }),
        act: (r) => {
            r.query('#nt-open')[0].click();
            drive(r, { 'nt-kind': 'trigger' }, 'nt-kind');
            drive(r, { 'nt-act': 'workflow' }, 'nt-act');
            drive(r, { 'nt-workflowId': 'w9' }, 'nt-workflowId');
        }
    },
    // M-42 (2) — a step with a quality check grows its own judge row: engine (one with no judge turn is dead, said why) and model.
    {
        id: 'tasks-step-judge',
        label: 'Tasks → a workflow step with a verify check, and its own judge engine + model (M-42)',
        data: data(),
        act: (r) => {
            r.query('#nt-open')[0].click();
            drive(r, { 'nt-kind': 'workflow' }, 'nt-kind');
            r.query('#nt-stadd')[0].click();
            drive(r, { 'nt-st-title': 'Planı yaz', 'nt-st-verifyCriteria': 'en az 3 madde' }, 'nt-st-verifyCriteria');
        }
    },
    /**
     * ‼️ X-228 — …AND THE ONE BOX OF THE SIX THAT IS NOT DRAWN UNTIL SOMETHING
     * IS PICKED: THE TIER.
     *
     * `ntRouteRows` draws the Route box wherever the engine has a provider
     * axis, but the Tier box ONLY once a route is chosen — a tier belongs to a
     * route and there is nothing to offer before one is named. So the two
     * default scenes photograph the step card WITHOUT the tier, and the half
     * of X-228 that says the tier reached the step card is invisible in them.
     * This is that half: the route is moved on the card itself, so the picture
     * is of the row the page grew in response to the gesture rather than of a
     * draft handed to it already containing one.
     */
    {
        id: 'tasks-step-route',
        label: 'Tasks → a workflow step pointed at a route, and the Tier row it grows (X-228)',
        data: data(),
        act: (r) => {
            r.query('#nt-open')[0].click();
            drive(r, { 'nt-kind': 'workflow' }, 'nt-kind');
            r.query('#nt-stadd')[0].click();
            // Picking the route is what makes the Tier box exist, so it goes
            // first and on its own: before this fires there is no tier box in
            // the page to drive.
            const draft = { 'nt-st-title': 'Kimi rotasında koş', 'nt-st-sproviderId': 'kimi-work' };
            drive(r, draft, 'nt-st-sproviderId');
            // ‼️ AND THE CHOSEN TIER HAS TO BE REPAINTED TO BE PHOTOGRAPHED.
            // `nt-st-stier` reads back into the draft and deliberately does NOT
            // redraw (nothing on the card depends on it — a repaint under the
            // pointer is what the redraw list is for), and a <select> shows the
            // option marked `selected` in the MARKUP, not its live `.value`. So
            // driving it alone paints the default and the picture would lie
            // about a control that works — the same trap `tasks-rounds`
            // documents for textareas. `nt-st-stype` is fired last because it
            // re-reads the whole card and redraws it, and it is left on `agent`.
            Object.assign(draft, { 'nt-st-stier': 'opus' });
            drive(r, draft, 'nt-st-stier');
            Object.assign(draft, { 'nt-st-stype': 'agent' });
            drive(r, draft, 'nt-st-stype');
        }
    },
    // ‼️ S-19 — the form when the run continues a conversation instead of
    // opening one. The picker, its search box, the count line and the held-row
    // warning are all drawn by this state and by nothing else.
    {
        id: 'tasks-resume',
        label: 'Tasks → the New-task form, continuing an existing conversation',
        data: Object.assign(data(), {
            launch: {
                resumable: [
                    {
                        sessionId: '190e5baf-e937-4bc9-a83f-8a26d7248c89', title: 'gece görevi — M-10/M-11/S-19',
                        agent: 'developer', agentId: 'developer', engine: 'claude',
                        project: 'Agent Farm', ts: Date.now() - 41 * 60000, busy: '',
                        cwd: 'D:/zone/dev/git/miropharm/vsc_AgentFarm'
                    },
                    {
                        sessionId: '9c22ab41-0f2d-4a11-9a3e-71c0d5b2e004', title: 'AGENT_AREA dosyalama turu',
                        agent: 'manager', agentId: 'manager', engine: 'claude',
                        project: '', ts: Date.now() - 3 * 3600000,
                        busy: 'the Console has this conversation open', cwd: ''
                    },
                    {
                        sessionId: '019ff43f-77c1-4d90-8a55-2b6631c0a7de', title: 'rollout ayrıştırıcısını yeniden yaz',
                        agent: 'developer', agentId: 'developer', engine: 'codex',
                        project: 'Agent Farm', ts: Date.now() - 26 * 3600000, busy: '', cwd: ''
                    }
                ]
            }
        }),
        act: (r) => {
            r.query('#nt-open')[0].click();
            const draft = {
                'nt-prompt': 'kaldığın yerden devam et — yapılmış işi tekrarlama',
                'nt-conversation': 'resume'
            };
            drive(r, draft, 'nt-conversation');
            // The held row on purpose: the ●, the warning line under the picker
            // and the tip that says the task will PARK rather than open a second
            // writer are the whole safety half of the item.
            draft['nt-resumeid'] = '9c22ab41-0f2d-4a11-9a3e-71c0d5b2e004';
            drive(r, draft, 'nt-resumeid');
        }
    },
    // ‼️ M-22 — THE REFUSAL, AS THE PERSON ACTUALLY MEETS IT. The one-executor
    // sentence is now shared with the bridge, where the reader is an agent
    // parsing an error string; on this page the very same text is escaped into
    // the composer's message strip, so anything written for the other reader
    // (backticks, arg syntax) would sit there as literal punctuation, and a
    // sentence that grew for the bridge would silently become a wall of grey in
    // the form. Neither is visible from a string test — this is the only place
    // the shared text is looked at.
    {
        id: 'tasks-oneexecutor',
        label: 'Tasks → the New-task form refusing an engine AND a CLI profile',
        // ‼️ THE CLI ROW IS ONLY DRAWN WHEN THERE IS A PROFILE TO PICK
        // (`L.clis` empty = no row at all), so a fixture with the default launch
        // payload cannot reach this state — it would draw a refusal about a
        // control that is not on the form. Found by looking at the first
        // picture, which is what the picture is for.
        data: (() => {
            const d = data();
            // `{name, detail}`, the shape the panel really sends (tasksPanel.ts
            // — `clis:`). A list of bare strings drew two options reading
            // "undefined", which is what the first picture showed.
            d.launch.clis = [
                { name: 'gece-tarayici', detail: 'my-cli --headless "{prompt}"' },
                { name: 'eski-toplu-is', detail: 'batch.exe --run "{prompt}"' }
            ];
            d.launch.engines = d.launch.engines.concat([
                { id: 'opencode', label: 'OpenCode', ready: true, next: 'Ready, on a plan.' }
            ]);
            return d;
        })(),
        act: (r) => {
            r.query('#nt-open')[0].click();
            const draft = { 'nt-prompt': 'gece taraması — dosyaları filele', 'nt-engine': 'opencode' };
            drive(r, draft, 'nt-engine');
            // The CLI row is only on the form after the engine change has been
            // taken, so the profile is picked in a second pass — the same two
            // presses the person makes.
            draft['nt-cli'] = 'eski-toplu-is';
            drive(r, draft, 'nt-cli');
            // The host answers a submit with this; the page draws whatever it is
            // handed, so the picture is of the real constant rather than of a
            // sentence retyped in the fixture.
            r.send({
                type: 'task-error',
                text: require('../../out/core/launch.js').ONE_EXECUTOR
            });
        }
    },
    // X-330 — an OpenCode task takes its MODEL's own variants as the effort, so
    // the two arities are two pictures: a model that publishes five levels
    // (the box lists exactly those) and one that publishes none (no box at all).
    ...[['tasks-oc-variants', 'opencode/muse-spark', 'publishes five variants: the Effort box lists exactly those'],
        ['tasks-oc-novariant', 'opencode/big-pickle', 'publishes no variants: there is no Effort box']].map(([id, model, what]) => ({
        id,
        label: `Tasks → New task on OpenCode, a model that ${what}`,
        data: (() => {
            const d = data();
            d.launch.engines = d.launch.engines.concat([
                { id: 'opencode', label: 'OpenCode', ready: true, next: 'Ready, on a plan.', takesEffort: true }
            ]);
            d.launch.engineModels = Object.assign({}, d.launch.engineModels, {
                opencode: require('../../out/core/models.js').readEngineModels({ readHome: () => undefined }, ['sonnet'], undefined, {
                    models: [{ id: 'opencode/muse-spark', label: 'Muse Spark' }, { id: 'opencode/big-pickle', label: 'Big Pickle' }],
                    via: 'cli', fetchedAt: NOW,
                    variants: { 'opencode/muse-spark': ['minimal', 'low', 'medium', 'high', 'xhigh'], 'opencode/big-pickle': [] }
                }).opencode
            });
            return d;
        })(),
        act: (r) => {
            r.query('#nt-open')[0].click();
            const draft = { 'nt-prompt': 'gece taraması', 'nt-engine': 'opencode' };
            drive(r, draft, 'nt-engine');
            draft['nt-model'] = model;
            drive(r, draft, 'nt-model');
        }
    })),
    // ‼️ M-24 — the saved prompts, over the form that writes prompts. The
    // window is the whole change and it exists in no other state, so a picture
    // of the form with it shut would show none of it. It is drawn LAST because
    // it hangs off the body: an `#app` repaint after this would take it away.
    {
        id: 'tasks-prompts',
        label: 'Tasks → the saved prompts, right-clicked out of a prompt box',
        data: data(),
        act: (r) => {
            r.query('#nt-open')[0].click();
            drive(r, { 'nt-prompt': 'gece taraması — ' }, 'nt-prompt');
            r.query('#nt-prompt')[0].fire('contextmenu');
            r.send({
                type: 'promptSnippets',
                file: 'D:/zone/know/note/obsidian/00_AGENT_AREA/00_INPUT/10_DATA/50_Prompts/Agent Farm Prompts.md',
                source: 'setting',
                items: [
                    {
                        label: 'Devir notu', group: 'Oturum',
                        text: 'Kaldığın yeri, açık kalemleri ve sonraki ajanın ilk beş dakikasını yaz.'
                    },
                    {
                        label: 'Kök nedeni bul', group: 'Geliştirme',
                        text: 'Yamayı yazmadan önce akışı oku ve kök nedeni söyle; belirsizsen sor.'
                    },
                    {
                        label: 'Türkçe cevap ver', group: 'Geliştirme',
                        text: 'Bana Türkçe cevap ver; kod ve tanımlayıcılar kendi hâlinde kalsın.'
                    }
                ]
            });
        }
    }
]);

/**
 * ‼️ X-226 — THE RUN THAT CHANGED PLANS AT A WALL, with its row open.
 *
 * Two things are being looked at and neither of them is drawn in any other
 * state. The setup grid is the only place a run says whose sign-in it spends —
 * a line this list did not have at all until this item — and it only exists
 * with the expander pressed. And the row above it is the pair: the run that met
 * the limit, and the retry that carries the SAME work on another account a
 * minute later. A picture of one without the other says nothing about a
 * handover; the two together are the whole feature.
 */
const handoverData = () => {
    const d = data();
    const walled = {
        id: 'h1', title: 'gece devir turu (retry 1)', agentName: 'developer',
        mode: 'headless', status: 'queued', source: 'you', sourceKind: 'manual',
        when: min(1), detail: 'waiting until 03:04:12 — retry 1 (account handover · '
            + 'work@studio is walled until 07:50:00, and personal@gmail has room (8%) — '
            + 'the work carries on there rather than sleeping)',
        costUSD: 0, engine: 'claude', reportsCost: true, tokens: 0,
        hasOutput: false, sessionFile: '',
        setup: [
            { label: 'Agent', value: 'developer · headless' },
            { label: 'Started by', value: 'you' },
            { label: 'Engine', value: 'Claude Code' },
            { label: 'Model', value: 'opus' },
            {
                label: 'Account',
                value: 'personal@gmail — handed over from work@studio at a usage limit'
            },
            { label: 'If it fails', value: '6 attempts, 40 min apart, on a usage limit' },
            { label: 'Attempt', value: 'retry 1 after a failure' }
        ],
        prompt: 'devir notundaki kalan maddeleri sırayla kapat ve testleri çalıştır'
    };
    const met = {
        id: 'h0', title: 'gece devir turu', agentName: 'developer',
        mode: 'headless', status: 'failed', source: 'you', sourceKind: 'manual',
        when: min(2), durMin: 51, detail: '', costUSD: 4.02,
        engine: 'claude', reportsCost: true, tokens: 3_120_000,
        hasOutput: true, outputFile: 'D:\\out\\h0.md',
        sessionFile: 'C:\\Users\\x\\.claude\\projects\\vsc_AgentFarm\\5a1c0e77.jsonl',
        setup: [
            { label: 'Agent', value: 'developer · headless' },
            { label: 'Started by', value: 'you' },
            { label: 'Engine', value: 'Claude Code' },
            { label: 'Account', value: 'work@studio' }
        ],
        prompt: 'devir notundaki kalan maddeleri sırayla kapat ve testleri çalıştır'
    };
    d.runs = [dress(walled), dress(met), ...d.runs.slice(1)];
    return d;
};

const handoverVariant = {
    id: 'tasks-account-handover',
    label: 'Tasks → Runs — the retry that was handed to another sign-in at a wall',
    data: handoverData(),
    // ‼️ BY `[data-expand]`, NOT BY THE CLASS. The shim's `html()` concatenates
    // every element it has ever handed out, so `.expand`[0] can be a cell from
    // an earlier paint whose click toggles nothing that is still on the page —
    // measured here: the picture came back with every row shut.
    act: (r) => {
        (r.query('[data-expand]').find(e => e.dataset.expand === 'run:h1')
            || r.query('[data-expand]')[0]).click();
    }
};
module.exports = {
    script: 'tasksPage.js', data, runs,
    variants: () => [...variants(), handoverVariant]
};
