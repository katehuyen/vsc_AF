// Agent Farm — Farm Status (activation surface, wave Z1/Z8).
// Honest per-subsystem "is this actually being used?" rows for the dashboard:
// which parts of the factory are live, which are configured-but-idle, which
// have never been switched on — each with ONE action that wakes it up.
// Pure node (no vscode import): the host gathers the inputs, this ranks them.

import { ENGINES } from './consoleEngine';

/**
 * ‼️ U-59 — HOW MANY ENGINES THERE ARE, AND WHAT THEY ARE CALLED, ASKED RATHER
 * THAN TYPED.
 *
 * This file said `4` twice and named three engines in a sentence; a fifth
 * shipped end to end and every one of those was still describing the farm as it
 * was two engines ago — "0/4 engines ready" on a machine with five, and a
 * dormant row that recommended installing a list OpenCode was not on. The
 * registry is one import away and is the only place that ever knew.
 */
const BUILTIN_ENGINES = Object.values(ENGINES);
/** The non-default engines, spelt as people say them: `A, B and C`. */
function engineRollCall(): string {
    const names = BUILTIN_ENGINES.filter(e => e.id !== 'claude').map(e => e.label);
    if (names.length < 2) { return names.join(''); }
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

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
    /**
     * ‼️ THE FIRST-CLASS ENGINES — A DIFFERENT AXIS FROM `cliProfiles` (X-35).
     *
     * `agentFarm.cliProfiles` is a list of arbitrary command templates the user
     * wrote. Claude, Codex, Gemini and Antigravity are BUILT IN: the extension
     * knows their flags, their sandboxes, their billing and whether they are on
     * this machine. Two independent facts — and the status row hung both on the
     * profile count, so with no profiles configured it announced "sessions and
     * tasks are Claude-only" on a machine with 39 Codex sessions on disk and an
     * engine picker in every launcher.
     *
     * Ids of the built-in engines that are installed and signed in.
     */
    enginesReady: string[];
    /** …and how many are built in at all, so "1 of 4" can be said. */
    engineCount: number;
    ingestFolderCount: number;
    registeredAssetCount: number;
    oversightLoopsOn: number;       // enabled sampling loops (quality/suggest/weekly)
    qualitySamples: number;
    secretCount: number;
    /** C1: the read-only web view — is it serving, and to whom? */
    web?: { enabled: boolean; serving: boolean; bind: 'local' | 'lan'; port: number };
    /** C3: the inbound chat channel — connected, and how many chats may use it. */
    chat?: { enabled: boolean; hasToken: boolean; allowedChats: number };
    /** B1: how many projects the fleet is grouped into. */
    projectCount?: number;
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

    // ‼️ TWO ROWS, BECAUSE THERE ARE TWO INDEPENDENT FACTS (X-35).
    //
    // The built-in ENGINES are what a session, a task, a schedule, a trigger and
    // a mission can be run on. Custom CLI PROFILES are command templates for
    // binaries this extension knows nothing about. One row used to answer both
    // by looking at the profile count alone, so a machine with no profiles was
    // told "sessions and tasks are Claude-only" while 39 Codex sessions and an
    // Antigravity one sat in its own index — the status page contradicting the
    // sessions page, and pointing the user at a setting that would not have
    // helped.
    const extTotal = Object.values(i.externalSessions).reduce((a, b) => a + b, 0);
    // Defensive on purpose: this input is assembled at a boundary, and a status
    // page that throws takes the whole card down rather than showing one honest
    // "unknown" row.
    const readyAll = i.enginesReady ?? [];
    const ready = readyAll.filter(e => e !== 'claude');
    const engineDetail = `${readyAll.length}/${i.engineCount || BUILTIN_ENGINES.length} engines ready`
        + (ready.length ? ` (${ready.join(', ')} beside Claude)` : '')
        + (extTotal
            ? ` · ${Object.entries(i.externalSessions).map(([s, n]) => `${s} ×${n}`).join(' · ')} session(s) on disk`
            : '');
    /**
     * ‼️ X-203 — THE DOOR IS ON THE ROW IN EVERY STATE, and it used to vanish
     * exactly when the page became worth opening.
     *
     * The action lived on the `dormant` branch alone, so the moment a second
     * engine was ready — or any session existed on disk — the button
     * disappeared. That is backwards twice over: a row's action is a way to the
     * SUBJECT of the row, not a fix-it prompt for a subsystem nobody switched
     * on, and the Engines page is most useful on the machine that has engines.
     * The user reported it as "you said there is a button at the end of the
     * Engines row, but there isn't".
     */
    const enginesDoor = {
        label: 'Engines', kind: 'command', value: 'agentfarm.openEngines'
    } as const;
    rows.push(ready.length || extTotal
        ? {
            id: 'engines', label: 'Engines',
            // History counts: an engine that ran here is active even if its CLI
            // has since been uninstalled, and vice versa.
            state: extTotal ? 'active' : 'ready',
            detail: engineDetail,
            action: { ...enginesDoor }
        }
        : {
            id: 'engines', label: 'Engines', state: 'dormant',
            detail: `only Claude Code is ready here — ${engineRollCall()} are supported but not installed or not signed in`,
            action: { ...enginesDoor }
        });
    if (i.cliProfileCount === 0) {
        rows.push({
            id: 'cli', label: 'Custom CLI profiles', state: 'dormant',
            detail: `none configured — this is for a binary Agent Farm has no built-in support for; the ${BUILTIN_ENGINES.length} engines above do not need one`,
            action: { label: 'Configure profiles', kind: 'settings', value: 'agentFarm.cliProfiles' }
        });
    } else {
        rows.push({
            id: 'cli', label: 'Custom CLI profiles', state: 'ready',
            detail: `${i.cliProfileCount} profile(s) — a profile's output is archived and that is all; it is not monitored the way an engine is`,
            action: { label: 'Multi-CLI guide', kind: 'guide', value: 'coklu-cli-yurutucu' }
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

    // B1 — the project axis. Without it every cost figure is per agent only.
    if (i.projectCount !== undefined) {
        rows.push(i.projectCount > 0
            ? {
                id: 'projects', label: 'Projects', state: 'active',
                detail: `${i.projectCount} project(s) — cost, sessions and the portfolio can be read per customer`
            }
            : {
                id: 'projects', label: 'Projects', state: 'dormant',
                detail: 'no projects — agents are one flat list, so "what did this customer cost" cannot be asked',
                action: { label: 'Set up projects', kind: 'command', value: 'agentfarm.manageProjects' }
            });
    }

    // C1 — the web view. "Enabled but not serving" is its own state: the port
    // is usually held by the headless service, and saying so beats a green dot.
    if (i.web) {
        rows.push(!i.web.enabled
            ? {
                id: 'web', label: 'Web view', state: 'dormant',
                detail: 'off — the farm is only readable inside this VS Code window',
                action: { label: 'Turn it on', kind: 'command', value: 'agentfarm.openWebView' }
            }
            : i.web.serving
                ? {
                    id: 'web', label: 'Web view', state: 'active',
                    detail: `serving on :${i.web.port} · ${i.web.bind === 'lan'
                        ? 'reachable from your network (token required)' : 'this machine only'}`,
                    action: { label: 'Open', kind: 'command', value: 'agentfarm.openWebView' }
                }
                : {
                    id: 'web', label: 'Web view', state: 'ready',
                    detail: `enabled but not serving on :${i.web.port} — the headless service may still hold the port`,
                    action: { label: 'Details', kind: 'command', value: 'agentfarm.openWebView' }
                });
    }

    // C3 — the inbound chat channel. A token with no allowlist is a half setup
    // that answers every message with a refusal, so it gets its own row.
    if (i.chat) {
        rows.push(!i.chat.enabled || !i.chat.hasToken
            ? {
                id: 'chat', label: 'Chat channel', state: 'dormant',
                detail: 'off — no way to message an agent from your phone',
                action: { label: 'Connect Telegram', kind: 'command', value: 'agentfarm.connectTelegram' }
            }
            : i.chat.allowedChats === 0
                ? {
                    id: 'chat', label: 'Chat channel', state: 'ready',
                    detail: 'connected, but no chat is allowed yet — message the bot and add the id it reports',
                    action: { label: 'Allowlist', kind: 'settings', value: 'agentFarm.telegram.allowedChats' }
                }
                : {
                    id: 'chat', label: 'Chat channel', state: 'active',
                    detail: `${i.chat.allowedChats} chat(s) can run work on your agents`
                });
    }

    return rows;
}
