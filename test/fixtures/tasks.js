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
    { id: 'tasks-plan', label: 'Tasks → Plan — a schedule whose time passed, in a window that cannot fire', data: planData() },
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

module.exports = { script: 'tasksPage.js', data, variants, runs };
