import type { PanelHost } from './panelHost';
import type { RemotePage } from './remoteViews';

/**
 * X-441 — WHICH PAGES A PHONE MAY OPEN, and what each lets a device do (the
 * order a message is judged in: RemotePage in ./remoteViews). A page missing
 * here is answered "unavailable" on the phone. `pcOnly` lists what would open
 * a dialog, an editor or another tab on the PC; its phone form comes later
 * (X-443 navigation, X-447 pickers).
 */

export interface RemotePageMakers {
    needs(host: PanelHost): void;
    console(host: PanelHost): void;
    now(host: PanelHost): void;
    /** `args` narrows the page the way the openSessions command's argument does. */
    sessions(host: PanelHost, args?: Record<string, unknown>): void;
    tasks(host: PanelHost): void;
    /** False when `args` names no transcript the farm knows: the phone is told "unavailable". */
    session(host: PanelHost, args?: Record<string, unknown>): boolean;
    notices(host: PanelHost): void;
    dashboard(host: PanelHost): void;
    missions(host: PanelHost): void;
    queue(host: PanelHost): void;
    /** S-125 — `args.chain` names the chain a ⑂ link opened it on. */
    chains(host: PanelHost, args?: Record<string, unknown>): void;
}

/** X-456 — the transcript a phone asked to read and where to open it. */
export interface SessionPageTarget { file: string; focusTs?: number; roles?: string[] }

/**
 * The transcript a phone's `afnav` names (media/afRemote.js): by session id or by path, and only
 * one the index already knows — a phone never points the host at a file of its own choosing.
 */
export function sessionPageTarget(
    args: Record<string, unknown> | undefined,
    known: readonly { sessionId?: string; file?: string }[]
): SessionPageTarget | undefined {
    const sid = typeof args?.sessionId === 'string' ? args.sessionId : '';
    const file = typeof args?.file === 'string' ? args.file : '';
    const row = (sid ? known.find(s => s.sessionId === sid && !!s.file) : undefined)
        ?? (file ? known.find(s => s.file === file) : undefined);
    if (!row?.file) { return undefined; }
    const ts = typeof args?.ts === 'number' && args.ts > 0 ? args.ts : 0;
    const roles = Array.isArray(args?.roles) ? args.roles.filter((r): r is string => typeof r === 'string') : [];
    return { file: row.file, ...(ts ? { focusTs: ts } : {}), ...(roles.length ? { roles } : {}) };
}

export function remotePages(make: RemotePageMakers): Record<string, RemotePage> {
    return {
        now: {
            open: 'read', act: 'manage',
            looks: ['refresh'],
            answers: [],
            pcOnly: ['afnav'],
            make: host => make.now(host)
        },
        needs: {
            open: 'read', act: 'answer',
            looks: ['refresh'],
            answers: [],
            pcOnly: ['afnav', 'openGuide', 'openAgent'],
            make: host => make.needs(host)
        },
        console: {
            open: 'read', act: 'manage',
            looks: ['refresh', 'getAccounts', 'slashCommands', 'select', 'loadOlder', 'resumeQuery', 'batonLegs'],
            answers: ['askAnswer', 'askHold', 'askPicks'],
            pcOnly: ['attachPick', 'attachUris', 'attachDrop', 'attachTooMany', 'attachNothing',
                'openFile', 'openTranscript', 'openProject', 'openGuide', 'afnav'],
            make: host => make.console(host)
        },
        // X-456 — opening a transcript, a terminal or the guide happens on the PC, so a phone never
        // asks for them; pinning and stopping a session are the page's manage actions.
        sessions: {
            open: 'read', act: 'manage',
            looks: ['refresh', 'setTableN', 'sessionTurns'],
            answers: [],
            pcOnly: ['openSession', 'focusTerminal', 'openGuide', 'afnav'],
            make: (host, args) => make.sessions(host, args)
        },
        // X-456 — making, running and switching work is manage; a permission is answered. What opens
        // a file, an editor, a browser, another tab or a save dialog on the PC stays there.
        tasks: {
            open: 'read', act: 'manage',
            looks: ['refresh', 'promptSnippets', 'runs-archive', 'chooser-pick'],
            answers: ['approve'],
            pcOnly: ['browserLogin', 'open-output', 'open-transcript', 'open-needs', 'open-analytics',
                'open-history', 'export-md', 'command', 'openPromptSnippets', 'pickPromptSnippets',
                'openGuide', 'afnav'],
            make: host => make.tasks(host)
        },
        // X-456 — reading a transcript. Renaming, pinning, resuming in the Console, capturing the
        // context and keeping turns for the wiki are manage; files, the raw JSONL, the terminal, the
        // export and the PC clipboard stay on the PC. The chain arrows reach the phone as afnav.
        session: {
            open: 'read', act: 'manage',
            looks: ['refresh', 'sessionFileEdits', 'wikiAsk'],
            answers: [],
            pcOnly: ['openRaw', 'copyStep', 'openEditedFile', 'revealFile', 'exportChoose', 'resume',
                'focusTerminal', 'openAgent', 'openDashboard', 'openTimeline', 'chainGo', 'openGuide', 'afnav'],
            make: (host, args) => make.session(host, args)
        },
        // X-456 — the notice board. Answering or declining a question and marking what was read are
        // answers; pinning, starring, filing, editing, queueing and deleting manage the board. An
        // export, a report, a link, a terminal hand-off and another page's tab open on the PC.
        notices: {
            open: 'read', act: 'manage',
            looks: ['refresh'],
            answers: ['answer', 'decline', 'markRead', 'markReadMany', 'markAllRead'],
            pcOnly: ['exportChoose', 'exportOne', 'openReport', 'configureDocOpen', 'openExternal',
                'handoffNotice', 'openQueueItem', 'openProject', 'afnav'],
            make: host => make.notices(host)
        },
        // X-456 — the farm's board. Ranges, the table's size, a turn breakdown, the agent comparison
        // and the plan usage are looks; pinning and stopping a session are manage. An agent's page, a
        // new session or agent, the guide, settings, the Farm Status doors, a terminal and the status
        // bar's engine choice belong to the PC (the phone switches its usage tab on its own).
        dashboard: {
            open: 'read', act: 'manage',
            looks: ['refresh', 'planUsage', 'setTableN', 'sessionTurns', 'compareWindow'],
            answers: [],
            pcOnly: ['openAgent', 'headerAction', 'openSession', 'startSession', 'newAgent', 'openGuide',
                'openTimeline', 'openSearch', 'openFarmSettings', 'afnav', 'focusTerminal', 'manageProjects',
                'setUsageEngine', 'statusAction'],
            make: host => make.dashboard(host)
        },
        // X-466 — the missions. The runs, a draft's resolved launch, a sentry draft's probe and a
        // step's output tail are looks; a question, an approval and a rejection are answers; starting,
        // steering, pausing, cancelling, running again and deleting a mission and the sentry's switch
        // are manage, their confirmations asked on the phone. The folder picker, a file, a run's
        // sessions page, an agent's page or Console, the guide and a link belong to the PC (a
        // transcript reaches the phone as afnav).
        missions: {
            open: 'read', act: 'manage',
            looks: ['refresh', 'preview', 'sentryProbe', 'tail'],
            answers: ['answer', 'approve', 'reject'],
            pcOnly: ['pickFolder', 'openFile', 'missionSessions', 'openSession', 'openAgent', 'consoleAgent',
                'openGuide', 'afnav'],
            make: host => make.missions(host)
        },
        // X-466 — the work queue. Answering a blocked item is an answer; capturing, editing, routing,
        // filing, the urgency, dropping and deleting are manage. A source notice, a report or answer
        // file and its open-with setting, a project's page, a link and the terminal hand-off belong
        // to the PC (a mission or task mark reaches the phone's own page as afnav).
        queue: {
            open: 'read', act: 'manage',
            looks: ['refresh'],
            answers: ['answer'],
            pcOnly: ['openNotice', 'openFile', 'configureDocOpen', 'openProject', 'openExternal', 'handoff', 'afnav'],
            make: host => make.queue(host)
        },
        // S-125 — the relay chains. The board and a chain's legs are looks; stop, start now, the last-leg
        // brake, the leg ceiling, continue and end are manage, and the ceiling's menu and end's question
        // are asked on the phone. A leg's transcript opens as the phone's own session page (afRemote.js).
        chains: {
            open: 'read', act: 'manage',
            looks: ['refresh', 'legs'],
            answers: [],
            pcOnly: ['openSession', 'afnav'],
            make: (host, args) => make.chains(host, args)
        }
    };
}
