// Z1: Farm Status card — per-subsystem activation rows (pure core module).
'use strict';
const path = require('path');
const { buildFarmStatus } = require(path.join(__dirname, '..', 'out/core/farmstatus.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// The user's real machine today: live monitoring active, everything else untouched.
const dormantFarm = {
    listenerState: 'listening', eventsLast24h: 4200,
    taskCount: 0, tasksDone7d: 0, scheduleCount: 0,
    triggerCount: 0, triggersFired7d: 0,
    workflowCount: 0, workflowRuns7d: 0,
    hasMediaKey: false, mediaAssetCount: 0, mediaCostMonth: 0,
    cliProfileCount: 0, externalSessions: {},
    // ‼️ The BUILT-IN engines are their own axis (X-35): this machine has only
    // Claude ready and no custom profiles, which is the one case that really is
    // "Claude-only" — and the one the old single row said about every machine.
    enginesReady: ['claude'], engineCount: 4,
    ingestFolderCount: 0, registeredAssetCount: 0,
    oversightLoopsOn: 0, qualitySamples: 0,
    secretCount: 0
};

{
    const rows = buildFarmStatus(dormantFarm);
    const by = Object.fromEntries(rows.map(r => [r.id, r]));
    // ‼️ TEN: the ENGINES row split off from the custom-CLI one (X-35) — two
    // independent facts that used to share a row and contradict the rest of the app.
    ok('10 subsystem rows', rows.length === 10);
    ok('live is active with event count', by.live.state === 'active' && by.live.detail.includes('4200'));
    ok('tasks dormant -> setupExample action', by.tasks.state === 'dormant'
        && by.tasks.action.kind === 'command' && by.tasks.action.value === 'agentfarm.setupExample');
    ok('triggers dormant -> setupExample', by.triggers.state === 'dormant' && by.triggers.action.value === 'agentfarm.setupExample');
    ok('workflows dormant -> setupExample', by.workflows.state === 'dormant' && by.workflows.action.value === 'agentfarm.setupExample');
    ok('media dormant -> add key', by.media.state === 'dormant' && by.media.action.value === 'agentfarm.setSecret');
    ok('cli dormant -> settings action', by.cli.state === 'dormant'
        && by.cli.action.kind === 'settings' && by.cli.action.value === 'agentFarm.cliProfiles');
    ok('ingest dormant -> settings', by.ingest.state === 'dormant' && by.ingest.action.kind === 'settings');
    ok('oversight dormant, honest about cost', by.oversight.state === 'dormant' && /opt-in/.test(by.oversight.detail));
    ok('secrets dormant -> setSecret', by.secrets.state === 'dormant' && by.secrets.action.value === 'agentfarm.setSecret');
}

{
    // Listener up but silent -> ready + install hooks nudge.
    const rows = buildFarmStatus({ ...dormantFarm, eventsLast24h: 0 });
    const live = rows.find(r => r.id === 'live');
    ok('quiet listener -> ready + install hooks', live.state === 'ready' && live.action.value === 'agentfarm.installHooks');
}
{
    // Listener down -> dormant + guide.
    const rows = buildFarmStatus({ ...dormantFarm, eventsLast24h: 0, listenerState: 'disabled' });
    const live = rows.find(r => r.id === 'live');
    ok('disabled listener -> dormant + guide', live.state === 'dormant'
        && live.action.kind === 'guide' && live.action.value === 'canli-gozlem');
}

{
    // A working factory: everything lights up, no actions needed on active rows.
    const rows = buildFarmStatus({
        listenerState: 'listening', eventsLast24h: 100,
        taskCount: 12, tasksDone7d: 5, scheduleCount: 2,
        triggerCount: 3, triggersFired7d: 7,
        workflowCount: 2, workflowRuns7d: 4,
        hasMediaKey: true, mediaAssetCount: 31, mediaCostMonth: 4.267,
        cliProfileCount: 2, externalSessions: { gemini: 3, codex: 1 },
        enginesReady: ['claude', 'codex', 'gemini'], engineCount: 4,
        ingestFolderCount: 1, registeredAssetCount: 9,
        oversightLoopsOn: 2, qualitySamples: 40,
        secretCount: 3
    });
    const by = Object.fromEntries(rows.map(r => [r.id, r]));
    ok('busy farm: tasks/triggers/workflows active', by.tasks.state === 'active'
        && by.triggers.state === 'active' && by.workflows.state === 'active');
    ok('active rows carry no action button', !by.tasks.action && !by.triggers.action && !by.workflows.action);
    ok('media active shows count + monthly cost', by.media.state === 'active'
        && by.media.detail.includes('31') && by.media.detail.includes('$4.27'));
    ok('the ENGINES row lists per-source session counts, not the profile row',
        by.engines.state === 'active' && /gemini ×3/.test(by.engines.detail) && /codex ×1/.test(by.engines.detail));
    ok('ingest active', by.ingest.state === 'active' && by.ingest.detail.includes('9'));
    ok('oversight active with sample count', by.oversight.state === 'active' && by.oversight.detail.includes('40'));
}

{
    // Configured-but-idle shades: ready states.
    const rows = buildFarmStatus({
        ...dormantFarm,
        taskCount: 2, scheduleCount: 1, tasksDone7d: 0,
        triggerCount: 1, triggersFired7d: 0,
        workflowCount: 1, workflowRuns7d: 0,
        hasMediaKey: true, mediaAssetCount: 0,
        cliProfileCount: 1, externalSessions: {},
        ingestFolderCount: 2, registeredAssetCount: 0,
        oversightLoopsOn: 1, qualitySamples: 0,
        secretCount: 1
    });
    const by = Object.fromEntries(rows.map(r => [r.id, r]));
    ok('defined-but-idle rows read as ready', by.tasks.state === 'ready' && by.triggers.state === 'ready'
        && by.workflows.state === 'ready' && by.ingest.state === 'ready' && by.oversight.state === 'ready');
    ok('media key without output -> ready + media guide', by.media.state === 'ready'
        && by.media.action.kind === 'guide' && by.media.action.value === 'medya-uretim-hatti');
    ok('cli profiles configured -> ready, and said to be a different thing from an engine',
        by.cli.state === 'ready' && /not monitored the way an engine is/.test(by.cli.detail)
        && by.cli.action.value === 'coklu-cli-yurutucu');
}

// ---------- X-35: engines and custom CLI profiles are INDEPENDENT ----------
//
// ‼️ THE CASE THAT WAS MISSING, AND THE BUG IT LET THROUGH. One row used to
// answer both questions off `cliProfileCount`, so a machine with no custom
// profiles was told "sessions and tasks are Claude-only" — on a farm with 39
// Codex sessions and one Antigravity session in its own index, an engine picker
// in every launcher, and an engine column on the Tasks page. The status card
// contradicted the sessions page and sent the user to a setting that would not
// have helped. `cliProfileCount: 0 + externalSessions > 0` was never tested.
{
    const by = Object.fromEntries(buildFarmStatus({
        ...dormantFarm,
        cliProfileCount: 0,
        externalSessions: { codex: 39, agy: 1 },
        enginesReady: ['claude', 'codex', 'agy'], engineCount: 4
    }).map(r => [r.id, r]));
    ok('‼️ no custom CLI profiles does NOT make a four-engine farm "Claude-only"',
        by.engines.state === 'active' && !/Claude-only/.test(by.engines.detail));
    ok('…the engines row names which are ready and what has actually run',
        /3\/4 engines ready/.test(by.engines.detail)
        && /codex, agy/.test(by.engines.detail)
        && /codex ×39/.test(by.engines.detail));
    ok('…and the custom-profile row is its own, dormant, row',
        by.cli.state === 'dormant' && by.cli.action.value === 'agentFarm.cliProfiles');

    // …and the genuinely Claude-only machine still says so, on the right axis.
    const only = Object.fromEntries(buildFarmStatus(dormantFarm).map(r => [r.id, r]));
    ok('a machine where only Claude is installed reads as dormant on the ENGINES row',
        only.engines.state === 'dormant' && /only Claude Code is ready/.test(only.engines.detail));
    ok('…and history alone is enough to make the row active, with no engine installed now',
        buildFarmStatus({ ...dormantFarm, externalSessions: { codex: 4 } })
            .find(r => r.id === 'engines').state === 'active');
}

// ---------- projects · web view · chat channel (3.25/3.26) ----------
// These three are the ones a user is most likely not to know exist, so the
// status card is where they have to announce themselves — including the two
// half-configured states that would otherwise look like failures.
{
    const base = {
        listenerState: 'disabled', eventsLast24h: 0,
        taskCount: 0, scheduleCount: 0, tasksDone7d: 0,
        triggerCount: 0, triggersFired7d: 0, workflowCount: 0, workflowRuns7d: 0,
        hasMediaKey: false, mediaAssetCount: 0, mediaCostMonth: 0,
        cliProfileCount: 0, externalSessions: {}, ingestFolderCount: 0,
        registeredAssetCount: 0, oversightLoopsOn: 0, qualitySamples: 0, secretCount: 0
    };
    const rowsOf = extra => Object.fromEntries(
        buildFarmStatus({ ...base, ...extra }).map(r => [r.id, r]));

    // the rows only appear when the host reports them (older callers unaffected)
    ok('no project/web/chat data = no rows',
        !rowsOf({}).projects && !rowsOf({}).web && !rowsOf({}).chat);

    const none = rowsOf({
        projectCount: 0,
        web: { enabled: false, serving: false, bind: 'local', port: 8378 },
        chat: { enabled: false, hasToken: false, allowedChats: 0 }
    });
    ok('no projects = dormant with a one-click setup',
        none.projects.state === 'dormant' && none.projects.action.value === 'agentfarm.manageProjects');
    ok('…and it says what cannot be asked without them', /customer cost/.test(none.projects.detail));
    ok('web off = dormant, one click to turn on',
        none.web.state === 'dormant' && none.web.action.value === 'agentfarm.openWebView');
    ok('chat off = dormant, one click to connect',
        none.chat.state === 'dormant' && none.chat.action.value === 'agentfarm.connectTelegram');

    const live = rowsOf({
        projectCount: 3,
        web: { enabled: true, serving: true, bind: 'lan', port: 8378 },
        chat: { enabled: true, hasToken: true, allowedChats: 2 }
    });
    ok('projects in use = active', live.projects.state === 'active' && /3 project/.test(live.projects.detail));
    ok('serving on the LAN says so, token and all',
        live.web.state === 'active' && /network/.test(live.web.detail) && /8378/.test(live.web.detail));
    ok('an allowed chat channel is active', live.chat.state === 'active' && /2 chat/.test(live.chat.detail));

    // the two half-states that are NOT failures
    const half = rowsOf({
        web: { enabled: true, serving: false, bind: 'local', port: 8378 },
        chat: { enabled: true, hasToken: true, allowedChats: 0 }
    });
    ok('enabled-but-not-serving is "ready", and names the likely reason',
        half.web.state === 'ready' && /headless service/.test(half.web.detail));
    ok('connected with an empty allowlist is "ready", not active',
        half.chat.state === 'ready' && /no chat is allowed/.test(half.chat.detail));
    ok('…and points at the allowlist setting',
        half.chat.action.kind === 'settings' && half.chat.action.value === 'agentFarm.telegram.allowedChats');
}

// ---------- X-203: the Engines row keeps its door in EVERY state -----------
/*
 * ‼️ THE DOOR DISAPPEARED EXACTLY WHEN THE PAGE BECAME WORTH OPENING.
 *
 * The user's report: "Dashboard/Engines satırı sonunda buton var demiştin ama
 * yok." Measured — the action was on the `dormant` branch only, so a machine
 * with a second engine ready, or with sessions on disk, drew no button at all.
 * A row's action is a way to the SUBJECT of the row, not a fix-it prompt for a
 * subsystem nobody has switched on; every other row that has a page behind it
 * offers it whatever its state.
 */
{
    const withDoor = (over) => {
        const rows = buildFarmStatus(Object.assign({}, dormantFarm, over));
        return Object.fromEntries(rows.map(r => [r.id, r])).engines;
    };
    const opens = (r) => !!r.action && r.action.kind === 'command'
        && r.action.value === 'agentfarm.openEngines';

    ok('‼️ X-203: a dormant Engines row opens the page (it always did)',
        opens(withDoor({})) && withDoor({}).state === 'dormant');
    ok('‼️ X-203: …and so does a READY one, which is where the button vanished',
        opens(withDoor({ enginesReady: ['claude', 'codex'] }))
        && withDoor({ enginesReady: ['claude', 'codex'] }).state === 'ready');
    ok('‼️ X-203: …and an ACTIVE one, the state a working machine is actually in',
        opens(withDoor({ enginesReady: ['claude', 'codex'], externalSessions: { codex: 12 } }))
        && withDoor({ enginesReady: ['claude', 'codex'], externalSessions: { codex: 12 } })
            .state === 'active');
    // The label is the page's own name in every state: a button that reads
    // "Engines" on one machine and something else on another is two controls.
    ok('…under one label, because it is one door',
        withDoor({}).action.label === 'Engines'
        && withDoor({ enginesReady: ['claude', 'codex'] }).action.label === 'Engines');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
