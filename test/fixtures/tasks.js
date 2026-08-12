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
 * ‼️ THE CLOCK IS THE REAL ONE, like the Turns and Timeline fixtures and for the
 * same reason: the When column counts against `Date.now()`, so a pinned stamp
 * would draw every row as "-13317s ago" and the picture would be of a bug that
 * is not there.
 */
const NOW = Date.now();
const min = n => NOW - n * 60000;

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
]);

const data = () => ({
    generatedAt: NOW,
    tab: 'run',
    gate: {
        paused: false, pausedUntil: undefined, pauseReason: '',
        quietFrom: '23:30', quietTo: '04:30', blocked: false, blockReason: ''
    },
    summary: {
        running: 1, runLimit: 2, queued: 1, needsYou: 0,
        plansOn: 2, plansSwitchable: 3, doneToday: 3, failedToday: 1,
        cost7d: 18.4, savedWakeups7d: 23, issues: 1
    },
    plan: [],
    runs: runs(),
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

const variants = () => ([
    { id: 'tasks', label: 'Tasks → Runs — four engines, and a cost column that tells the truth', data: data() }
]);

module.exports = { script: 'tasksPage.js', data, variants, runs };
