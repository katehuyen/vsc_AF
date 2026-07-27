/**
 * Quick Menu — one key for a 170-command extension.
 *
 * Everything Agent Farm does was reachable in exactly two ways: a panel button
 * somewhere, or the command palette with the right words typed into it. This
 * is the third: **ctrl+alt+f** opens a grouped, type-to-filter list of the
 * things a person actually reaches for during the day, each row printing its
 * own shortcut — so the menu teaches the direct keys instead of replacing
 * them.
 *
 * The list is data, on purpose: a test walks it against `package.json` and
 * fails if an entry names a command that does not exist or prints a shortcut
 * that is not the one really bound. A menu that lies is worse than no menu.
 */

export interface QuickMenuEntry {
    /** group heading it appears under, in this file's order */
    group: 'Sessions' | 'Pages' | 'Work' | 'System';
    label: string;
    detail: string;
    command: string;
    /** the keybinding package.json really declares for this command (Windows/Linux form) */
    key?: string;
}

export const QUICK_MENU: QuickMenuEntry[] = [
    // ---- Sessions: the things you do WITH an agent ----
    {
        group: 'Sessions', label: '$(comment-discussion) Console', key: 'ctrl+alt+c',
        detail: 'talk to an agent inside the panel — hosted session, live permissions, interrupt',
        command: 'agentfarm.openConsole'
    },
    {
        group: 'Sessions', label: '$(rocket) Start session…', key: 'ctrl+alt+s',
        detail: 'pick agent · model · effort · permission mode · name · first prompt, then launch',
        command: 'agentfarm.launchSession'
    },
    {
        group: 'Sessions', label: '$(pinned) Session shelf…', key: 'ctrl+alt+p',
        detail: 'your pinned sessions first, then the recent ones — resume, open or unpin',
        command: 'agentfarm.sessionShelf'
    },
    {
        group: 'Sessions', label: '$(debug-pause) Interrupt a session', key: 'ctrl+alt+i',
        detail: 'send Esc to a running session — stops the turn, keeps the session',
        command: 'agentfarm.interruptSession'
    },
    {
        group: 'Sessions', label: '$(debug-continue-small) Continue latest session',
        detail: 'claude --continue in the agent’s folder',
        command: 'agentfarm.continueSession'
    },
    {
        group: 'Sessions', label: '$(terminal) Focus a session terminal',
        detail: 'bring the terminal window of a running session to the front',
        command: 'agentfarm.focusSessionTerminal'
    },

    // ---- Pages: where you look ----
    {
        group: 'Pages', label: '$(dashboard) Dashboard', key: 'ctrl+alt+d',
        detail: 'cost, tokens, plan usage, agents, sessions',
        command: 'agentfarm.openDashboard'
    },
    {
        group: 'Pages', label: '$(bell) Needs You', key: 'ctrl+alt+n',
        detail: 'everything blocked on you, most urgent first',
        command: 'agentfarm.openNeeds'
    },
    {
        group: 'Pages', label: '$(pulse) Live Timeline', key: 'ctrl+alt+l',
        detail: 'what every session is doing right now',
        command: 'agentfarm.openTimeline'
    },
    {
        group: 'Pages', label: '$(organization) Agents (portfolio)',
        detail: 'the whole fleet on one screen: who works, who is dormant, who costs what',
        command: 'agentfarm.openPortfolio'
    },
    {
        group: 'Pages', label: '$(checklist) Tasks',
        detail: 'plan · runs · automations · reusables · analytics',
        command: 'agentfarm.openTasks'
    },
    {
        group: 'Pages', label: '$(organization) Missions',
        detail: 'multi-agent runs: plan, delegate, approve',
        command: 'agentfarm.openMissions'
    },
    {
        group: 'Pages', label: '$(tools) Toolbox',
        detail: 'skills · subagents · commands · MCP · hooks · plugins · settings',
        command: 'agentfarm.openToolbox'
    },
    {
        group: 'Pages', label: '$(heart) Living',
        detail: 'system health: duties, drift, instruction quality',
        command: 'agentfarm.openLiving'
    },
    {
        group: 'Pages', label: '$(mail) Notices',
        detail: 'what the agents reported back to you',
        command: 'agentfarm.openNotices'
    },
    {
        group: 'Pages', label: '$(search) Search transcripts',
        detail: 'full-text and semantic search over every session',
        command: 'agentfarm.searchTranscripts'
    },

    // ---- Work: what you hand over ----
    {
        group: 'Work', label: '$(inbox) Add to work queue', key: 'ctrl+alt+q',
        detail: 'capture something for an agent to pick up later',
        command: 'agentfarm.queueAdd'
    },
    {
        group: 'Work', label: '$(list-flat) Work Queue',
        detail: 'the board of what you handed over',
        command: 'agentfarm.openQueue'
    },
    {
        group: 'Work', label: '$(play) New task',
        detail: 'one prompt for one agent, interactive or headless',
        command: 'agentfarm.addTask'
    },
    {
        group: 'Work', label: '$(rocket) New mission',
        detail: 'a goal for a team of agents',
        command: 'agentfarm.newMission'
    },
    {
        group: 'Work', label: '$(comment-discussion) Command bar…',
        detail: 'say what you want in one sentence; approve the plan it proposes',
        command: 'agentfarm.commandBar'
    },

    // ---- System ----
    {
        group: 'System', label: '$(project) Manage projects…',
        detail: 'group agents by customer / product, so every cost figure can be read per project',
        command: 'agentfarm.manageProjects'
    },
    {
        group: 'System', label: '$(radio-tower) Web view…',
        detail: 'read-only board for your phone — off by default, token required',
        command: 'agentfarm.openWebView'
    },
    {
        group: 'System', label: '$(comment-discussion) Connect Telegram…',
        detail: 'message an agent from a chat; the answer comes back in the same thread',
        command: 'agentfarm.connectTelegram'
    },
    {
        group: 'System', label: '$(gear) Farm Settings',
        detail: 'every Agent Farm setting, explained, in one page',
        command: 'agentfarm.openFarmSettings'
    },
    {
        group: 'System', label: '$(book) Guide',
        detail: 'the built-in manual',
        command: 'agentfarm.openGuide'
    },
    {
        group: 'System', label: '$(refresh) Refresh farm',
        detail: 're-scan agents, sessions and insights',
        command: 'agentfarm.refresh'
    }
];

/** Group order for rendering — separators are drawn between these. */
export const QUICK_MENU_GROUPS: QuickMenuEntry['group'][] = ['Sessions', 'Pages', 'Work', 'System'];
