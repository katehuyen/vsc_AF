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
    ingestFolderCount: 0, registeredAssetCount: 0,
    oversightLoopsOn: 0, qualitySamples: 0,
    secretCount: 0
};

{
    const rows = buildFarmStatus(dormantFarm);
    const by = Object.fromEntries(rows.map(r => [r.id, r]));
    ok('9 subsystem rows', rows.length === 9);
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
    ok('cli active lists per-source counts', by.cli.state === 'active' && /gemini ×3/.test(by.cli.detail) && /codex ×1/.test(by.cli.detail));
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
    ok('cli profiles without sessions -> ready + drift honesty', by.cli.state === 'ready'
        && /fail-soft/.test(by.cli.detail) && by.cli.action.value === 'coklu-cli-yurutucu');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
