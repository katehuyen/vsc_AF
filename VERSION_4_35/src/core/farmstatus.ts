// Agent Farm — Farm Status (activation surface, wave Z1/Z8).
// Honest per-subsystem "is this actually being used?" rows for the dashboard:
// which parts of the factory are live, which are configured-but-idle, which
// have never been switched on — each with ONE action that wakes it up.
// Pure node (no vscode import): the host gathers the inputs, this ranks them.

export type SubsystemState = 'active' | 'ready' | 'dormant';

export interface StatusAction {
    label: string;
    /** command = run a whitelisted Agent Farm command; guide = open the guide
     *  at an anchor; settings = open the settings UI filtered to a query. */
    kind: 'command' | 'guide' | 'settings';
    value: string;
}

export interface SubsystemStatus {
    id: string;
    label: string;
    state: SubsystemState;
    detail: string;
    action?: StatusAction;
}

export interface FarmStatusInput {
    listenerState: string;          // 'listening' | 'disabled' | 'port-in-use' | 'error'
    eventsLast24h: number;
    taskCount: number;
    tasksDone7d: number;
    scheduleCount: number;
    triggerCount: number;
    triggersFired7d: number;
    workflowCount: number;
    workflowRuns7d: number;
    hasMediaKey: boolean;           // fal or replicate auth present in the vault
    mediaAssetCount: number;
    mediaCostMonth: number;
    cliProfileCount: number;
    externalSessions: Record<string, number>; // source -> session count
    ingestFolderCount: number;
    registeredAssetCount: number;
    oversightLoopsOn: number;       // enabled sampling loops (quality/suggest/weekly)
    qualitySamples: number;
    secretCount: number;
}

const fmtUSD = (n: number) => '$' + (Math.round(n * 100) / 100).toFixed(2);

export function buildFarmStatus(i: FarmStatusInput): SubsystemStatus[] {
    const rows: SubsystemStatus[] = [];

    // Live monitoring — the pulse everything else builds on.
    if (i.eventsLast24h > 0) {
        rows.push({
            id: 'live', label: 'Live monitoring', state: 'active',
            detail: `${i.eventsLast24h} events in the last 24h`
        });
    } else if (i.listenerState === 'listening') {
        rows.push({
            id: 'live', label: 'Live monitoring', state: 'ready',
            detail: 'listening, but no events in 24h — hooks installed? (running sessions must be restarted after installing)',
            action: { label: 'Install Live Hooks', kind: 'command', value: 'agentfarm.installHooks' }
        });
    } else {
        rows.push({
            id: 'live', label: 'Live monitoring', state: 'dormant',
            detail: `listener ${i.listenerState} — no live picture of your agents`,
            action: { label: 'How it works', kind: 'guide', value: 'canli-gozlem' }
        });
    }

    // Tasks & schedules — the queue.
    if (i.taskCount === 0 && i.scheduleCount === 0) {
        rows.push({
            id: 'tasks', label: 'Tasks & schedules', state: 'dormant',
            detail: 'never used — queue agent work, schedule recurring runs',
            action: { label: 'Set up an example', kind: 'command', value: 'agentfarm.setupExample' }
        });
    } else {
        rows.push({
            id: 'tasks', label: 'Tasks & schedules', state: i.tasksDone7d > 0 ? 'active' : 'ready',
            detail: `${i.taskCount} tasks · ${i.scheduleCount} schedules · ${i.tasksDone7d} finished in 7d`
        });
    }

    // Triggers — event-driven automation.
    if (i.triggerCount === 0) {
        rows.push({
            id: 'triggers', label: 'Triggers', state: 'dormant',
            detail: 'no triggers — work only starts when you start it',
            action: { label: 'Set up an example', kind: 'command', value: 'agentfarm.setupExample' }
        });
    } else {
        rows.push({
            id: 'triggers', label: 'Triggers', state: i.triggersFired7d > 0 ? 'active' : 'ready',
            detail: `${i.triggerCount} defined · ${i.triggersFired7d} fired in 7d`
        });
    }

    // Workflows — multi-step chains.
    if (i.workflowCount === 0) {
        rows.push({
            id: 'workflows', label: 'Workflows', state: 'dormant',
            detail: 'no chains — hand work from agent to agent automatically',
            action: { label: 'Set up an example', kind: 'command', value: 'agentfarm.setupExample' }
        });
    } else {
        rows.push({
            id: 'workflows', label: 'Workflows', state: i.workflowRuns7d > 0 ? 'active' : 'ready',
            detail: `${i.workflowCount} defined · ${i.workflowRuns7d} runs in 7d`
        });
    }

    // Media pipeline.
    if (!i.hasMediaKey) {
        rows.push({
            id: 'media', label: 'Media pipeline', state: 'dormant',
            detail: 'no API key in the vault (FAL_KEY / REPLICATE_API_TOKEN)',
            action: { label: 'Add API key', kind: 'command', value: 'agentfarm.setSecret' }
        });
    } else if (i.mediaAssetCount === 0) {
        rows.push({
            id: 'media', label: 'Media pipeline', state: 'ready',
            detail: 'key present — nothing produced yet',
            action: { label: 'Media guide', kind: 'guide', value: 'medya-uretim-hatti' }
        });
    } else {
        rows.push({
            id: 'media', label: 'Media pipeline', state: 'active',
            detail: `${i.mediaAssetCount} assets · ${fmtUSD(i.mediaCostMonth)} this month`
        });
    }

    // External CLIs (multi-CLI sessions + transcript adapters).
    const extTotal = Object.values(i.externalSessions).reduce((a, b) => a + b, 0);
    if (i.cliProfileCount === 0) {
        rows.push({
            id: 'cli', label: 'External CLIs', state: 'dormant',
            detail: 'no cliProfiles — sessions and tasks are Claude-only',
            action: { label: 'Configure profiles', kind: 'settings', value: 'agentFarm.cliProfiles' }
        });
    } else if (extTotal === 0) {
        rows.push({
            id: 'cli', label: 'External CLIs', state: 'ready',
            detail: `${i.cliProfileCount} profile(s) — no external sessions seen yet (adapters are fail-soft: a session that never appears may mean a format drift)`,
            action: { label: 'Multi-CLI guide', kind: 'guide', value: 'coklu-cli-yurutucu' }
        });
    } else {
        const per = Object.entries(i.externalSessions).map(([s, n]) => `${s} ×${n}`).join(' · ');
        rows.push({
            id: 'cli', label: 'External CLIs', state: 'active',
            detail: `${per} session(s) tracked`
        });
    }

    // Asset ingest (external files entering the gallery).
    if (i.ingestFolderCount === 0) {
        rows.push({
            id: 'ingest', label: 'Asset ingest', state: 'dormant',
            detail: 'no watched folders — downloads/exports stay invisible to the gallery',
            action: { label: 'Configure folders', kind: 'settings', value: 'agentFarm.ingestFolders' }
        });
    } else {
        rows.push({
            id: 'ingest', label: 'Asset ingest', state: i.registeredAssetCount > 0 ? 'active' : 'ready',
            detail: `${i.ingestFolderCount} folder(s) watched · ${i.registeredAssetCount} assets registered`
        });
    }

    // Smart oversight (paid sampling loops — honest about being opt-in).
    if (i.oversightLoopsOn === 0) {
        rows.push({
            id: 'oversight', label: 'Smart oversight', state: 'dormant',
            detail: 'quality/suggestion/weekly loops off (they spend cheap-model calls; opt-in)',
            action: { label: 'Enable loops', kind: 'settings', value: 'agentFarm.qualitySample' }
        });
    } else {
        rows.push({
            id: 'oversight', label: 'Smart oversight', state: i.qualitySamples > 0 ? 'active' : 'ready',
            detail: `${i.oversightLoopsOn} loop(s) on · ${i.qualitySamples} quality samples so far`
        });
    }

    // Secret vault.
    if (i.secretCount === 0) {
        rows.push({
            id: 'secrets', label: 'Secret vault', state: 'dormant',
            detail: 'empty — webhook/media steps that need keys cannot run',
            action: { label: 'Add a secret', kind: 'command', value: 'agentfarm.setSecret' }
        });
    } else {
        rows.push({
            id: 'secrets', label: 'Secret vault', state: 'ready',
            detail: `${i.secretCount} secret(s) stored`
        });
    }

    return rows;
}
