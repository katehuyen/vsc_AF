import type { PanelHost } from './panelHost';
import type { RemotePage } from './remoteViews';
import { morePages, SOUND_PC, type MorePageMakers } from './remotePagesMore';

/**
 * X-441 — WHICH PAGES A PHONE MAY OPEN, and what each lets a device do (the
 * order a message is judged in: RemotePage in ./remoteViews). A page missing
 * here is answered "unavailable" on the phone. `pcOnly` lists what would open
 * a dialog, an editor or another tab on the PC; its phone form comes later
 * (X-443 navigation, X-447 pickers).
 *
 * X-443 — a page's own "open this file" stays `pcOnly` here: on the phone
 * media/afRemote.js turns the press into the `file` page before it is sent
 * (src/core/shownFile.ts finds the file in what that page shows), so the raw
 * message only ever arrives from a client that is not ours, and is refused.
 */

export interface RemotePageMakers extends MorePageMakers {
    needs(host: PanelHost): void;
    console(host: PanelHost): void;
    now(host: PanelHost): void;
    /** `args` narrows the page the way the openSessions command's argument does. */
    sessions(host: PanelHost, args?: Record<string, unknown>): void;
    tasks(host: PanelHost): void;
    /** The Tasks page on its Run tab. */
    board(host: PanelHost): void;
    /** False when `args` names no transcript the farm knows: the phone is told "unavailable". */
    session(host: PanelHost, args?: Record<string, unknown>): boolean;
    notices(host: PanelHost): void;
    dashboard(host: PanelHost): void;
    missions(host: PanelHost): void;
    /** X-551 — `args.session` names a session whose draft the capture box opens with. */
    queue(host: PanelHost, args?: Record<string, unknown>): void;
    /** S-125 — `args.chain` names the chain a ⑂ link opened it on. */
    chains(host: PanelHost, args?: Record<string, unknown>): void;
    turns(host: PanelHost): void;
    projects(host: PanelHost): void;
    /** False when `args.agentId` names no agent the farm knows: the phone is told "unavailable". */
    agent(host: PanelHost, args?: Record<string, unknown>): boolean;
    search(host: PanelHost): void;
    timeline(host: PanelHost): void;
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
    const pages: Record<string, RemotePage> = {
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
                'openFile', 'openTranscript', 'openProject', 'openGuide', 'afnav', ...SOUND_PC],
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
        // a file, an editor, a browser, another tab or a save dialog on the PC stays there; the links to
        // the Analytics and the Needs pages open those pages on the phone instead (media/afRemote.js).
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
        // export and the PC clipboard stay on the PC (a phone's 🔊 is the phone's own voice, READ_PC
        // in remoteViews.ts). The chain arrows reach the phone as afnav.
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
            pcOnly: ['openAgent', 'openSession', 'startSession', 'newAgent', 'openGuide',
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
            make: (host, args) => make.queue(host, args)
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
        },
        // X-456 — every turn of the farm. The table, a turn folded open and the wiki tagger's question
        // are looks; keeping a turn for the wiki is manage. A transcript tab, a terminal, the guide and
        // the export's save dialog belong to the PC (a row's transcript reaches the phone as afnav).
        turns: {
            open: 'read', act: 'manage',
            looks: ['refresh', 'turnDetail', 'wikiAsk'],
            answers: [],
            pcOnly: ['openSession', 'focusTerminal', 'openGuide', 'exportChoose', 'afnav'],
            make: host => make.turns(host)
        },
        // X-456 — the projects. The list, a project's tab, a document, the sessions table and the
        // backfill screen are looks; creating, editing, removing (its question asked on the phone),
        // the plan, the backlog, the track, the people, filing sessions, a task's retry and a
        // session's pin or stop are manage. Every folder picker, the rescan's and archive's and
        // template's questions, an editor, a handover file, a new session, a Tasks form and another
        // page's row belong to the PC (a timeline row's transcript reaches the phone as afnav).
        projects: {
            open: 'read', act: 'manage',
            looks: ['refresh', 'view', 'setTableN', 'sessionTurns', 'selectDoc', 'suggestFolder'],
            answers: [],
            pcOnly: ['openLink', 'openSession', 'focusTerminal', 'browseFolder', 'pickFolder', 'revealFolder',
                'openSessions', 'rescan', 'handover', 'archive', 'saveTemplate', 'openDoc', 'backlogOpenItem',
                'queueAdd', 'startSession', 'newTask', 'newSchedule', 'newTrigger', 'openWorkRow', 'afnav'],
            make: host => make.projects(host)
        },
        // X-456 — an agent's page. The page, its sessions table and a row's turns are looks; a duty's
        // form and its pause, order and delete, the model rates and a session's pin or stop are manage
        // (as the farm's own duties.* and pricing.set ops are), the delete's and the CLAUDE.md offer's
        // questions asked on the phone. The watch path's picker, a file, a new or continued session, the
        // sidebar, the memory graph and its cards, another page's tab and the guide belong to the PC (a
        // session row's transcript reaches the phone as afnav).
        agent: {
            open: 'read', act: 'manage',
            looks: ['refresh', 'setTableN', 'sessionTurns'],
            answers: [],
            pcOnly: ['af-browse', 'openFile', 'openSession', 'focusTerminal', 'startSession', 'launchSession',
                'consoleSession', 'continueSession', 'reveal', 'openMemoryGraph', 'memCard', 'openDashboard',
                'openTimeline', 'openGuide', 'afnav'],
            make: (host, args) => make.agent(host, args)
        },
        // X-456 — searching every transcript is a look. A hit's transcript reaches the phone as afnav; a
        // file, the Timeline's tab, the id picker, building the semantic index, the settings and the guide
        // belong to the PC.
        search: {
            open: 'read', act: 'manage',
            looks: ['search'],
            answers: [],
            pcOnly: ['openSession', 'openFile', 'openTimeline', 'findSession', 'buildIndex', 'openFarmSettings',
                'openGuide', 'afnav'],
            make: host => make.search(host)
        },
        // X-456 — the Live Timeline. The page and a long range's history are looks; interrupting and
        // clearing a session, renaming it, its turn alerts, their test and its sound panel are manage
        // (the Console's sound panel is judged the same). End and Force kill ask a modal on the PC, the
        // hooks install a pick and a modal; they, a terminal, a folder, a workflow's live settings, the
        // Dashboard's tab, the guide and the sound controls' file picker and folder (SOUND_PC, refused on
    // the Console too) belong to the PC (a transcript reaches the phone as afnav).
        timeline: {
            open: 'read', act: 'manage',
            looks: ['refresh', 'history'],
            answers: [],
            pcOnly: ['openSession', 'focusTerminal', 'endSession', 'forceKillSession', 'installHooks', 'workflowLive',
                'revealFolder', 'openDashboard', 'openGuide', 'afnav', ...SOUND_PC],
            make: host => make.timeline(host)
        },
        ...morePages(make)
    };
    // X-456 — the board is the Tasks page on its Run tab (TasksPanel.toTab), under the Tasks' own rule.
    pages.board = { ...pages.tasks, make: host => make.board(host) };
    return pages;
}
