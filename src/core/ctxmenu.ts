/**
 * The right-click catalogue — every menu item every webview row can offer.
 *
 * ‼️ WHY ONE FILE. A menu item lives in three places at once: a `commands`
 * entry (its title), a `menus` entry (where it is drawn and when), and a
 * handler. Kept by hand in three places they drift, and the drift is SILENT —
 * the item simply stops appearing, or appears and does nothing. So the
 * catalogue below is the single source of truth: `test/test_ctxmenu.js` fails
 * if package.json does not match it, and `--fix` rewrites package.json from it.
 *
 * TWO KINDS OF ITEM.
 *   · `command` — an existing host command (agentfarm.pinSession). Preferred:
 *     it already works from the palette and the trees, it is already on the
 *     bridge, and nothing about the page is involved.
 *   · `id` + `title` + `act` — a PAGE action. A command `agentfarm.ctx.<id>` is
 *     minted, hidden from the palette, and relays { act, ctx } to the page that
 *     drew the row (see postCtx in src/panels/base.ts and media/afCtx.js). The
 *     page runs the same function its own button runs, so the menu and the
 *     button cannot drift apart.
 *
 * This module is PURE — no vscode import — because the test requires the
 * compiled file directly (same contract as core/bridge.ts). The registration
 * loop lives in extension.ts and reads ctxRelays().
 *
 * The design, the inventory and the phase list: docs/SAG-TIK-MENULERI.tr.md.
 */

export interface CtxItem {
    /** Which menu it is drawn in — undefined for the webview context menu
     *  itself, otherwise the id of a submenu declared in CTX_SUBMENUS. */
    menu?: string;
    /** Sort key: `<group>@<order>`, and the group order is the section order —
     *  1_open · 2_edit · 3_move · 4_link · 5_copy · 9_danger, the same
     *  everywhere so the muscle memory carries from menu to menu. */
    group: string;
    /** The full when clause, written out rather than derived: some rows match a
     *  family of sections by regex and a "section" shorthand would hide that. */
    when: string;
    /** An existing host command. */
    command?: string;
    /** A page action: the command suffix (agentfarm.ctx.<id>). */
    id?: string;
    /** What the menu says. Required for a page action; a host command already
     *  has its title in `contributes.commands`. */
    title?: string;
    /** What the page is asked to do — the name its own handler switches on. */
    act?: string;
}

export interface CtxSubmenu {
    /** Always prefixed agentfarm.ctx. so the sync can tell ours from anyone's. */
    id: string;
    /** What the arrow says — "Priority", "Copy", "Open with". */
    label: string;
    /** Where the arrow sits in the parent menu, same shape as an item's group. */
    group: string;
    /** Which rows show the arrow at all. A submenu with no when would be an
     *  empty arrow on every row on the page. */
    when: string;
}

/** Every generated command and submenu starts with this. */
export const CTX_PREFIX = 'agentfarm.ctx.';

/**
 * Where a session's own menu is shown — one section per surface family.
 *
 * ‼️ A ROW CAN BE TWO THINGS AT ONCE. A Needs row is a blocker with its own
 * actions AND, when it names a transcript, a session. One element carries one
 * `data-vscode-context`, so the section name is what says which: a needs row
 * that knows a transcript calls itself `afNeedSession` and appears in BOTH
 * families, and one that does not stays `afNeedRow` and is offered nothing it
 * cannot do.
 */
const SESSION_ROW =
    'webviewSection =~ /^(afSessionRow|afNeedSession|afTurnRow|afSearchHit|afTimelineAgent)$/';
const CONSOLE_ANY = 'webviewSection =~ /^afConsole(Session|Resumable)$/';
const CONSOLE_RESUMABLE = "webviewSection == 'afConsoleResumable'";
const CONSOLE_LIVE = "webviewSection == 'afConsoleSession'";
const TIMELINE_SESSION = "webviewSection == 'afTimelineSession'";

/**
 * ‼️ A-23 — WHERE A **LIVE** SESSION IS THE SUBJECT, which is a smaller family
 * than `SESSION_ROW`.
 *
 * An alert sound is keyed by session and travels with that session's own
 * lifetime — its rekey, its TTL, its forget. Offered on a search hit or a Turns
 * row it would be an item that refuses on nearly every click, because those
 * surfaces list conversations that are mostly over. So it is drawn only where
 * the row IS something still running: a Timeline lane, a Timeline card, the
 * Console's live card.
 */
const LIVE_SESSION_ROW =
    'webviewSection =~ /^(afTimelineAgent|afTimelineSession|afConsoleSession)$/';

/** The Projects page's own objects. */
const BACKLOG_ROW = "webviewSection == 'afBacklogRow'";
/** A row on the Track tab: an item's history, not the item. What it can offer
 *  is deliberately narrower than the backlog row's — editing an item belongs to
 *  the tab that owns it, and two surfaces writing the same field differently is
 *  the defect the projects system already paid for once. */
const TRACK_ROW = "webviewSection == 'afTrackRow'";
const PLAN_ITEM = "webviewSection == 'afPlanItem'";
const DOC_ROW = "webviewSection == 'afDocRow'";
const PROJECT_ROW = "webviewSection == 'afProjectRow'";
const FEED_EVENT = "webviewSection == 'afFeedEvent'";

/** The Tasks page: what defines work, one step of a workflow, one execution. */
const PLAN_ROW = "webviewSection == 'afPlanRow'";
const WF_STEP = "webviewSection == 'afWorkflowStep'";
const TASK_RUN = "webviewSection == 'afTaskRun'";

/**
 * AN AGENT, wherever an agent is listed.
 *
 * ‼️ Six surfaces list one — the Dashboard's cards and its comparison table,
 * Portfolio, the Timeline's lanes, the agent's own detail header, the memory
 * graph's picker — and each had a different two or three buttons. The whole
 * menu below is HOST COMMANDS, because `resolveAgent` needs exactly one key
 * (`agentId`): a page publishes the row and gets the full set without writing
 * a handler. A Timeline lane is an agent AND a lane, so it is in the family.
 */
const AGENT_ROW = 'webviewSection =~ /^(afAgentRow|afTimelineAgent)$/';

/** The Dashboard's own furniture, and the Living page's signals. */
const STAT_TILE = "webviewSection == 'afStatTile'";
const PLAN_USAGE = "webviewSection == 'afPlanUsage'";
const INSIGHT_ROW = "webviewSection == 'afInsightRow'";
const LIVING_SIGNAL = "webviewSection == 'afLivingSignal'";

/** The production surfaces: a scene, an asset, a provider, an instance. */
const SCENE_ROW = "webviewSection == 'afSceneRow'";
const ASSET_CARD = "webviewSection == 'afAssetCard'";
const PROVIDER_ROW = "webviewSection == 'afProviderRow'";
const AIRTABLE_INSTANCE = "webviewSection == 'afAirtableInstance'";
const ANALYTICS_TABLE = "webviewSection == 'afAnalyticsTable'";

/** A memory file and a standing duty, on the pages that list them. */
const MEMORY_ROW = "webviewSection == 'afMemoryRow'";
const DUTY_ROW = "webviewSection == 'afDutyRow'";

/** The reading surfaces: a turn, a step, a changed file, a search hit. */
const TURN_ROW = "webviewSection == 'afTurnRow'";
const VIEWER_TURN = "webviewSection == 'afViewerTurn'";
const VIEWER_STEP = "webviewSection == 'afViewerStep'";
const VIEWER_FILE = "webviewSection == 'afViewerFile'";
const DIFF_HUNK = "webviewSection == 'afDiffHunk'";
const SEARCH_HIT = "webviewSection == 'afSearchHit'";
const SCOPE_CHIP = "webviewSection == 'afScopeChip'";

/** The Console's two waiting states — a held message, and a live request. */
const CONSOLE_QUEUED = "webviewSection == 'afConsoleQueued'";
const CONSOLE_ASK = "webviewSection == 'afConsoleAsk'";

/** The two message boards and the blocker queue between them. */
const NOTICE_ROW = "webviewSection == 'afNoticeRow'";
const QUEUE_ROW = "webviewSection == 'afQueueRow'";
const QUEUE_LANE = "webviewSection == 'afQueueLane'";
const NEED_ROW = 'webviewSection =~ /^afNeed(Row|Session)$/';

/**
 * The Toolbox's rows — skills, subagents, commands, MCP servers, hooks,
 * plugins, styles, config files.
 *
 * ‼️ ONE SECTION, NOT EIGHT. Every row on that page is the same object: an
 * entry in one inventory, with a kind, a scope and a source file. Eight section
 * names would be eight copies of "open · reveal · copy · remove" that could
 * drift apart; `afKind` carries the difference, and only the items that really
 * are kind-specific (probe an MCP server, enable a plugin) name it.
 */
const TOOL_ROW = "webviewSection == 'afToolRow'";

/** An eval case — the page the sweep had to build, so its rows start with the
 *  menu rather than growing one later (U-14). */
const EVAL_CASE = "webviewSection == 'afEvalCase'";

/** The capability matrix: one cell, and the row's name. */
const CAP_CELL = "webviewSection == 'afCapCell'";
const CAP_ROW = "webviewSection == 'afCapRow'";

/** Farm Settings, and the vault. */
const SETTING_ROW = "webviewSection == 'afSettingRow'";
const AGENT_ROOT = "webviewSection == 'afAgentRoot'";
const SECRET_ROW = "webviewSection == 'afSecretRow'";

/** Missions: the run, one delegation, one planner round, one team member. */
const MISSION_ROW = "webviewSection == 'afMissionRow'";
const MISSION_STEP = "webviewSection == 'afMissionStep'";
const MISSION_ROUND = "webviewSection == 'afMissionRound'";
const MISSION_TEAM = "webviewSection == 'afMissionTeam'";

/** The four ways a document can be opened — src/core/docopen.ts owns the list. */
const OPEN_MODES: [string, string][] = [
    ['vscode', 'Editor'], ['preview', 'Preview'], ['obsidian', 'Obsidian'], ['custom', 'Your app']
];

export const CTX_SUBMENUS: CtxSubmenu[] = [
    { id: CTX_PREFIX + 'blOpenWith', label: 'Open at this line with', group: '1_open@2', when: BACKLOG_ROW },
    { id: CTX_PREFIX + 'blState', label: 'State', group: '2_edit@1', when: BACKLOG_ROW },
    { id: CTX_PREFIX + 'blPrio', label: 'Priority', group: '2_edit@2', when: BACKLOG_ROW },
    { id: CTX_PREFIX + 'blEffort', label: 'Size', group: '2_edit@3', when: BACKLOG_ROW },
    { id: CTX_PREFIX + 'blType', label: 'Type', group: '2_edit@4', when: BACKLOG_ROW },
    // Only a coded, open item has a place in the queue to move.
    { id: CTX_PREFIX + 'blMove', label: 'Move in the queue', group: '3_move@1', when: `${BACKLOG_ROW} && afQueued` },
    { id: CTX_PREFIX + 'blCopy', label: 'Copy', group: '5_copy@1', when: BACKLOG_ROW },
    { id: CTX_PREFIX + 'trkCopy', label: 'Copy', group: '5_copy@1', when: TRACK_ROW },
    { id: CTX_PREFIX + 'planOpenWith', label: 'Open the plan with', group: '1_open@2', when: PLAN_ITEM },
    { id: CTX_PREFIX + 'docOpenWith', label: 'Open with', group: '1_open@2', when: DOC_ROW },
    { id: CTX_PREFIX + 'projCopy', label: 'Copy', group: '5_copy@1', when: PROJECT_ROW },
    { id: CTX_PREFIX + 'plCopy', label: 'Copy', group: '5_copy@1', when: PLAN_ROW },
    { id: CTX_PREFIX + 'tkCopy', label: 'Copy', group: '5_copy@1', when: TASK_RUN },
    { id: CTX_PREFIX + 'msCopy', label: 'Copy', group: '5_copy@1', when: MISSION_ROW },
    { id: CTX_PREFIX + 'mstCopy', label: 'Copy', group: '5_copy@1', when: MISSION_STEP },
    { id: CTX_PREFIX + 'ntStars', label: 'Stars', group: '2_edit@3', when: NOTICE_ROW },
    { id: CTX_PREFIX + 'ntOnly', label: 'Show only', group: '4_link@4', when: NOTICE_ROW },
    { id: CTX_PREFIX + 'ntCopy', label: 'Copy', group: '5_copy@1', when: NOTICE_ROW },
    // Urgency is a live item's field; a dropped or finished one has no more of it.
    { id: CTX_PREFIX + 'qUrg', label: 'Urgency', group: '2_edit@3', when: `${QUEUE_ROW} && !afTerminal` },
    { id: CTX_PREFIX + 'qCopy', label: 'Copy', group: '5_copy@1', when: QUEUE_ROW },
    { id: CTX_PREFIX + 'tbCopy', label: 'Copy', group: '5_copy@1', when: TOOL_ROW },
    // ‼️ On a turn and a search hit the session's own Copy items sit at
    // 5_copy@1–2, so these arrows take @3 — two menu entries in one seat are
    // drawn in an undefined order, which is how an item goes missing.
    { id: CTX_PREFIX + 'tnCopy', label: 'Copy this turn', group: '5_copy@3', when: TURN_ROW },
    { id: CTX_PREFIX + 'vtCopy', label: 'Copy', group: '5_copy@1', when: VIEWER_TURN },
    { id: CTX_PREFIX + 'vsCopy', label: 'Copy', group: '5_copy@1', when: VIEWER_STEP },
    { id: CTX_PREFIX + 'shCopy', label: 'Copy the match', group: '5_copy@3', when: SEARCH_HIT },
    { id: CTX_PREFIX + 'scStatus', label: 'Status', group: '2_edit@1', when: SCENE_ROW },
    { id: CTX_PREFIX + 'asCopy', label: 'Copy', group: '5_copy@1', when: ASSET_CARD }
];

/**
 * One submenu's rows, from a list — the picker vocabularies (priority, size,
 * type, the open modes) are already lists in the page, and writing them out
 * twice by hand is how the two stop agreeing.
 *
 * The value rides ON the act (`blPrio:high`), so one handler in the page answers
 * a whole picker instead of one per row.
 */
function picker(
    menu: string, when: string, verb: string, rows: [string, string][]
): CtxItem[] {
    return rows.map(([value, title], n) => ({
        menu, when, group: `1_pick@${n + 1}`,
        id: verb + value.charAt(0).toUpperCase() + value.slice(1),
        title, act: `${verb}:${value}`
    }));
}

export const CTX_ITEMS: CtxItem[] = [
    // ---------------------------------------------------------------------
    // A session, wherever a session is listed: the tables, Turns, search hits,
    // the mission feeds, the project pages. media/afSessionCtx.js draws it.
    // ---------------------------------------------------------------------
    { command: 'agentfarm.openSession', when: SESSION_ROW, group: '1_open@1' },
    { command: 'agentfarm.resumeSession', when: SESSION_ROW, group: '1_open@2' },
    { command: 'agentfarm.resumeInConsole', when: SESSION_ROW, group: '1_open@3' },
    { command: 'agentfarm.focusSessionTerminal', when: SESSION_ROW, group: '1_open@4' },
    { command: 'agentfarm.renameSession', when: SESSION_ROW, group: '2_mark@1' },
    { command: 'agentfarm.pinSession', when: SESSION_ROW, group: '2_mark@2' },
    { command: 'agentfarm.tagSession', when: SESSION_ROW, group: '2_mark@3' },
    { command: 'agentfarm.copySessionId', when: SESSION_ROW, group: '2_mark@4' },
    { command: 'agentfarm.interruptSession', when: SESSION_ROW, group: '3_stop@1' },
    { command: 'agentfarm.endSession', when: SESSION_ROW, group: '3_stop@2' },
    // ‼️ S-43 — beside End, never instead of it: End stops this conversation,
    // Force Kill stops the daemon that keeps re-making it.
    { command: 'agentfarm.forceKillSession', when: SESSION_ROW, group: '3_stop@3' },
    { command: 'agentfarm.dismissSession', when: SESSION_ROW, group: '3_stop@4' },
    { command: 'agentfarm.assignSessionProject', when: SESSION_ROW, group: '4_project@1' },
    { command: 'agentfarm.projectFromSession', when: SESSION_ROW, group: '4_project@2' },
    { command: 'agentfarm.addSessionFolderToProject', when: SESSION_ROW, group: '4_project@3' },
    // The things you reach FOR from a session row and had to leave the row to
    // get. `cwd` is only known once the session reports it, so the two folder
    // items are drawn only where there is a folder to act on.
    { command: 'agentfarm.openSessionAgent', when: SESSION_ROW, group: '1_open@5' },
    { command: 'agentfarm.revealSessionFolder', when: `${SESSION_ROW} && cwd`, group: '1_open@6' },
    { command: 'agentfarm.sessionToQueue', when: SESSION_ROW, group: '4_project@4' },
    // ‼️ S-38 (X-50) — MARKING A CONVERSATION FOR THE WIKI IS A MARK, so it sits
    // with the other marks. It writes nothing to the vault and nothing that
    // happens next is automatic; it is the same weight of gesture as labelling.
    { command: 'agentfarm.sessionToWiki', when: SESSION_ROW, group: '2_mark@5' },
    { command: 'agentfarm.copySessionPath', when: SESSION_ROW, group: '5_copy@1' },
    { command: 'agentfarm.copySessionCwd', when: `${SESSION_ROW} && cwd`, group: '5_copy@2' },
    // ‼️ A-23 — the `session` step of the sound chain, from the row it belongs
    // to. It sits with the MARKS because that is what it is: a property put on
    // one conversation, not something done to it.
    { command: 'agentfarm.setSessionAlertVoice', when: LIVE_SESSION_ROW, group: '2_mark@6' },

    // ---------------------------------------------------------------------
    // The Console's cards. A resumable row can be joined; a live card can be
    // interrupted and ended — the two states share everything in between.
    // ---------------------------------------------------------------------
    { command: 'agentfarm.resumeInConsole', when: CONSOLE_RESUMABLE, group: '1_session@1' },
    { command: 'agentfarm.resumeSession', when: CONSOLE_ANY, group: '1_session@2' },
    { command: 'agentfarm.renameSession', when: CONSOLE_ANY, group: '1_session@3' },
    { command: 'agentfarm.openSession', when: CONSOLE_ANY, group: '1_session@4' },
    { command: 'agentfarm.pinSession', when: CONSOLE_ANY, group: '1_session@5' },
    { command: 'agentfarm.tagSession', when: CONSOLE_ANY, group: '1_session@6' },
    { command: 'agentfarm.copySessionId', when: CONSOLE_ANY, group: '1_session@7' },
    // ‼️ S-38 — the same mark on the Console's own cards. The conversation you
    // are having is the one most likely to be worth keeping, and it is the one
    // surface where you are reading the answer as it arrives.
    { command: 'agentfarm.sessionToWiki', when: CONSOLE_ANY, group: '1_session@9' },
    { command: 'agentfarm.focusSessionTerminal', when: CONSOLE_RESUMABLE, group: '1_session@8' },
    // ‼️ S-29 — FIRST, BECAUSE IT IS THE ONE THING YOU DO TO A CARD THAT HAS
    // ENDED. The card is kept after a session ends for two reasons: so the
    // conversation can still be read, and so it is under your hand when you
    // want it back. Only the reading half was reachable from the card —
    // continuing meant finding the same session again in the resumable list
    // below, which is the trip the card exists to save. Everything else in this
    // group applies to a LIVE card, so the two never compete for the eye.
    { command: 'agentfarm.consoleResumeSession', when: CONSOLE_LIVE, group: '2_run@0' },
    { command: 'agentfarm.consoleInterruptTurn', when: CONSOLE_LIVE, group: '2_run@1' },
    { command: 'agentfarm.consoleEndSession', when: CONSOLE_LIVE, group: '2_run@2' },
    // ‼️ …and the pair of them in one click. End leaves the card on the shelf
    // (deliberately — the conversation is still readable), so tidying a panel
    // of eight finished sessions meant right-clicking every one of them TWICE,
    // with a repaint in between that moves the card you were pointing at.
    { command: 'agentfarm.consoleEndAndRemove', when: CONSOLE_LIVE, group: '2_run@3' },
    { command: 'agentfarm.consoleForgetSession', when: CONSOLE_LIVE, group: '2_run@4' },

    // ---------------------------------------------------------------------
    // The Live Timeline's lanes and cards.
    // ---------------------------------------------------------------------
    // ‼️ U-76 — FIRST, because on a dot or a bar the pointer is on a MOMENT, not
    // on the row's session. `afCorpus` is set only where the point knows which
    // transcript and which instant it stands for, so the entry is absent on a
    // lane with no file behind it rather than present and unable to answer.
    { command: 'agentfarm.copyCorpus', when: `${TIMELINE_SESSION} && afCorpus`, group: '0_corpus@1' },
    { command: 'agentfarm.renameSession', when: TIMELINE_SESSION, group: '1_session@1' },
    { command: 'agentfarm.openSession', when: TIMELINE_SESSION, group: '1_session@2' },
    { command: 'agentfarm.focusSessionTerminal', when: TIMELINE_SESSION, group: '1_session@3' },
    { command: 'agentfarm.pinSession', when: TIMELINE_SESSION, group: '1_session@4' },
    { command: 'agentfarm.tagSession', when: TIMELINE_SESSION, group: '1_session@5' },
    { command: 'agentfarm.copySessionId', when: TIMELINE_SESSION, group: '1_session@6' },
    { command: 'agentfarm.sessionToWiki', when: TIMELINE_SESSION, group: '1_session@9' },
    { command: 'agentfarm.resumeInConsole', when: TIMELINE_SESSION, group: '1_session@7' },
    { command: 'agentfarm.resumeSession', when: TIMELINE_SESSION, group: '1_session@8' },
    { command: 'agentfarm.interruptSession', when: TIMELINE_SESSION, group: '2_stop@1' },
    { command: 'agentfarm.endSession', when: TIMELINE_SESSION, group: '2_stop@2' },
    { command: 'agentfarm.forceKillSession', when: TIMELINE_SESSION, group: '2_stop@3' },
    { command: 'agentfarm.dismissSession', when: TIMELINE_SESSION, group: '2_stop@4' },

    // =====================================================================
    // PROJECTS — the page where the user actually works. Everything below is
    // a page action: the row's own button and the menu item run one function.
    // =====================================================================

    // ---- a backlog item ------------------------------------------------
    {
        id: 'backlogGo', title: 'Open at this line', act: 'blGo',
        when: BACKLOG_ROW, group: '1_open@1'
    },
    {
        id: 'backlogTrack', title: 'Where has this been worked?', act: 'blTrack',
        when: BACKLOG_ROW, group: '1_open@3'
    },
    {
        id: 'backlogEdit', title: 'Edit the words…', act: 'blEdit',
        when: BACKLOG_ROW, group: '2_edit@5'
    },
    // Filing is the one thing only an UNCODED capture needs, and the areas are
    // this project's own, so the item opens the row's picker rather than
    // pretending a static menu could list them.
    {
        id: 'backlogFile', title: 'File it under an area…', act: 'blFile',
        when: `${BACKLOG_ROW} && !afCoded`, group: '2_edit@6'
    },
    {
        id: 'backlogQueue', title: 'Put it in the work queue…', act: 'blQueue',
        when: BACKLOG_ROW, group: '4_link@1'
    },
    // ‼️ ONLY ON A ROW THAT HAS PARTS. It reads as an offer about THIS item, so
    // on an item with nothing under it the entry would be a menu line that does
    // nothing — and the page already knows which rows those are (`afParts`).
    {
        id: 'backlogGather', title: 'Gather its parts under it', act: 'blGather',
        when: `${BACKLOG_ROW} && afParts`, group: '3_move@2'
    },
    // ‼️ U-56 — THE SAME GESTURE FROM THE OTHER END, and only on a row that HAS
    // a whole. "Gather" is pressed on the parent and moves everything that
    // belongs to it; this is pressed on ONE part that has drifted and moves
    // only that row. On an item that belongs to nothing the line would have no
    // destination, so the page says which rows those are (`afPartOf`).
    {
        id: 'backlogJoinParent', title: 'Send it under its parent', act: 'blJoin',
        when: `${BACKLOG_ROW} && afPartOf`, group: '3_move@3'
    },
    ...picker(CTX_PREFIX + 'blOpenWith', BACKLOG_ROW, 'blGo', OPEN_MODES),
    ...picker(CTX_PREFIX + 'blState', BACKLOG_ROW, 'blState', [
        ['open', 'Open — not started'],
        ['doing', 'Started ▶'],
        ['done', 'Done'],
        ['cancelled', 'Cancelled']
    ]),
    ...picker(CTX_PREFIX + 'blPrio', BACKLOG_ROW, 'blPrio', [
        ['highest', '🔺 highest'],
        ['high', '⏫ high'],
        ['medium', '🔼 medium'],
        ['normal', 'normal — no icon on the line'],
        ['low', '🔽 low'],
        ['lowest', '⏬ lowest']
    ]),
    ...picker(CTX_PREFIX + 'blEffort', BACKLOG_ROW, 'blEffort', [
        ['none', 'not sized'],
        ['XS', 'XS — five minutes'],
        ['S', 'S — half an hour'],
        ['M', 'M — half a day'],
        ['L', 'L — a day'],
        ['XL', 'XL — split it before anybody starts']
    ]),
    ...picker(CTX_PREFIX + 'blType', BACKLOG_ROW, 'blType', [
        ['none', 'no type — your own tags stay'],
        ['bug', '#bug — bug fix'],
        ['research', '#research — research / measure'],
        ['feat', '#feat — development'],
        ['ux', '#ux — UI / UX'],
        ['chore', '#chore — chore'],
        ['debt', '#debt — tech debt'],
        ['doc', '#doc — docs'],
        ['idea', '#idea — idea']
    ]),
    ...picker(CTX_PREFIX + 'blMove', `${BACKLOG_ROW} && afQueued`, 'blMove', [
        ['top', 'To the front of the queue'],
        ['up5', 'Up 5'],
        ['up1', 'Up 1'],
        ['down1', 'Down 1'],
        ['down5', 'Down 5'],
        ['bottom', 'To the back of the queue']
    ]),
    // ‼️ U-82 — EVERY LINE HERE ONLY COPIES. The first one used to end "quote it
    // at an agent", which reads as a second thing it does, and left a reader
    // unsure whether the extension had a plain "copy the code" at all. Quoting
    // an item AT something is what the two lines above do (the work queue, the
    // agent) and they say so; these three put text on the clipboard, nothing
    // else, and the words are now what is copied rather than what it is for.
    ...picker(CTX_PREFIX + 'blCopy', BACKLOG_ROW, 'blCopy', [
        ['code', 'The code, on its own'],
        ['text', 'The words'],
        ['both', 'Code and words']
    ]),

    // ---- a track row: an item's HISTORY --------------------------------
    // ‼️ Every entry here either opens something or narrows the view. Nothing
    // edits the item — that is the Backlog tab's job, and since U-71 the CODE
    // ITSELF carries a reader there on an ordinary left click, so the menu no
    // longer needs a line for it. What the menu keeps is the expensive door the
    // click gave up: leaving for the document, in the slot that line used to
    // hold, because a link OUT of the extension belongs with the other links.
    {
        id: 'trackOnly', title: 'Show only this item\'s history', act: 'trkOnly',
        when: TRACK_ROW, group: '1_open@2'
    },
    {
        id: 'trackOpen', title: 'Open the backlog document at this item\'s line', act: 'trkGo',
        when: TRACK_ROW, group: '4_link@1'
    },
    {
        id: 'trackRecord', title: 'Record an event against it…', act: 'trkRecord',
        when: TRACK_ROW, group: '2_edit@1'
    },
    {
        id: 'trackFillOne', title: 'Reconstruct its history…', act: 'trkFillOne',
        when: TRACK_ROW, group: '2_edit@2'
    },
    ...picker(CTX_PREFIX + 'trkCopy', TRACK_ROW, 'trkCopy', [
        ['code', 'The code'],
        ['stamp', 'Where it was closed — session#turn'],
        ['sessions', 'Every session id that worked it'],
        ['report', 'The whole history, as text']
    ]),

    // ---- a plan item ----------------------------------------------------
    {
        id: 'planTick', title: 'Tick it — mark it done', act: 'planCheck:1',
        when: `${PLAN_ITEM} && !afDone`, group: '2_edit@1'
    },
    {
        id: 'planUntick', title: 'Untick it — put it back to open', act: 'planCheck:0',
        when: `${PLAN_ITEM} && afDone`, group: '2_edit@1'
    },
    {
        id: 'planOpen', title: 'Open the plan document', act: 'planOpen',
        when: PLAN_ITEM, group: '1_open@1'
    },
    ...picker(CTX_PREFIX + 'planOpenWith', PLAN_ITEM, 'planOpen', OPEN_MODES),
    {
        id: 'planCopyText', title: 'Copy the words', act: 'planCopy:text',
        when: PLAN_ITEM, group: '5_copy@1'
    },
    {
        id: 'planCopyId', title: 'Copy its 🆔 id', act: 'planCopy:id',
        when: `${PLAN_ITEM} && afPlanId`, group: '5_copy@2'
    },

    // ---- a document in the project folder --------------------------------
    {
        id: 'docOpen', title: 'Open', act: 'docOpen',
        when: DOC_ROW, group: '1_open@1'
    },
    ...picker(CTX_PREFIX + 'docOpenWith', DOC_ROW, 'docOpen', OPEN_MODES),
    {
        id: 'docShow', title: 'Show it in the pane', act: 'docShow',
        when: DOC_ROW, group: '1_open@3'
    },
    {
        id: 'docCopyPath', title: 'Copy its path', act: 'docCopy:path',
        when: DOC_ROW, group: '5_copy@1'
    },
    {
        id: 'docCopyFull', title: 'Copy its full path', act: 'docCopy:full',
        when: DOC_ROW, group: '5_copy@2'
    },

    // ---- a project in the list -------------------------------------------
    {
        id: 'projOpen', title: 'Open this project', act: 'projOpen',
        when: PROJECT_ROW, group: '1_open@1'
    },
    {
        id: 'projSessions', title: 'Show its sessions', act: 'projSessions',
        when: PROJECT_ROW, group: '1_open@2'
    },
    {
        id: 'projBacklog', title: 'Open its backlog', act: 'projTab:backlog',
        when: PROJECT_ROW, group: '1_open@3'
    },
    {
        id: 'projActive', title: 'Make it the active project', act: 'projActive',
        when: `${PROJECT_ROW} && !afActive`, group: '2_edit@1'
    },
    {
        id: 'projInactive', title: 'It is the active project — clear that', act: 'projInactive',
        when: `${PROJECT_ROW} && afActive`, group: '2_edit@1'
    },
    {
        id: 'projSettings', title: 'Edit it…', act: 'projTab:settings',
        when: PROJECT_ROW, group: '2_edit@2'
    },
    {
        id: 'projReveal', title: 'Reveal its folder', act: 'projReveal',
        when: PROJECT_ROW, group: '2_edit@3'
    },
    ...picker(CTX_PREFIX + 'projCopy', PROJECT_ROW, 'projCopy', [
        ['name', 'Its name'],
        ['id', 'Its id — what an agent quotes'],
        ['folder', 'Its folder path']
    ]),

    // ---- a line in the project's timeline ---------------------------------
    {
        id: 'feedOpen', title: 'Open what this points at', act: 'evOpen',
        when: `${FEED_EVENT} && afLinked`, group: '1_open@1'
    },
    {
        id: 'feedOnly', title: 'Show only this kind of line', act: 'evOnly',
        when: FEED_EVENT, group: '2_edit@1'
    },
    {
        id: 'feedHide', title: 'Hide this kind of line', act: 'evHide',
        when: FEED_EVENT, group: '2_edit@2'
    },
    {
        id: 'feedCopy', title: 'Copy the line', act: 'evCopy',
        when: FEED_EVENT, group: '5_copy@1'
    },

    // =====================================================================
    // TASKS — the Plan side defines work, the Runs side is what it did. Both
    // relay to media/tasksPage.js, which sends the same message its own
    // buttons send; the panel turns that into the very command the tree menus
    // use, so three surfaces share one implementation.
    // =====================================================================

    // ---- a plan row: a schedule, a trigger, a workflow or a template ------
    {
        id: 'planRun', title: 'Run it now', act: 'plRun',
        when: PLAN_ROW, group: '1_open@1'
    },
    {
        id: 'planRuns', title: 'Show what it has run', act: 'plRuns',
        when: PLAN_ROW, group: '1_open@2'
    },
    {
        id: 'planDetail', title: 'Show its prompt and timing here', act: 'plDetail',
        when: PLAN_ROW, group: '1_open@3'
    },
    // Switching is one act and two words; the row states which it is so the
    // menu never offers "switch on" on something already on.
    {
        id: 'planOn', title: 'Switch it on', act: 'plToggle',
        when: `${PLAN_ROW} && afSwitchable && !afOn`, group: '2_edit@1'
    },
    {
        id: 'planOff', title: 'Switch it off', act: 'plToggle',
        when: `${PLAN_ROW} && afSwitchable && afOn`, group: '2_edit@2'
    },
    // ‼️ ONE ENTRY FOR ALL FOUR KINDS. A workflow used to get two of its own —
    // "Add a step…" (because Edit could only append one) and "Rename it…"
    // (because that was the only part of a workflow a form could reach). Both
    // are the same act now: Edit opens the chain, name and steps together.
    {
        id: 'planEdit', title: 'Edit it…', act: 'plEdit',
        when: PLAN_ROW, group: '2_edit@3'
    },
    {
        id: 'planExport', title: 'Export as a Windows Scheduled Task…', act: 'plExport',
        when: `${PLAN_ROW} && afKind == 'schedule'`, group: '4_link@1'
    },
    {
        id: 'planHistory', title: 'Open the task history', act: 'plHistory',
        when: PLAN_ROW, group: '4_link@2'
    },
    ...picker(CTX_PREFIX + 'plCopy', PLAN_ROW, 'plCopy', [
        ['title', 'Its name'],
        ['prompt', 'The prompt it runs'],
        ['when', 'When it runs'],
        ['id', 'Its id — what an agent quotes']
    ]),
    {
        id: 'planDelete', title: 'Delete it…', act: 'plDelete',
        when: PLAN_ROW, group: '9_danger@1'
    },

    // ---- one step of a workflow, in the row's own detail ------------------
    {
        id: 'wfStepEdit', title: 'Edit this step…', act: 'wfEdit',
        when: WF_STEP, group: '2_edit@1'
    },
    {
        id: 'wfStepUp', title: 'Move it up', act: 'wfMove:up',
        when: WF_STEP, group: '3_move@1'
    },
    {
        id: 'wfStepDown', title: 'Move it down', act: 'wfMove:down',
        when: WF_STEP, group: '3_move@2'
    },
    {
        id: 'wfStepCopy', title: 'Copy the step', act: 'wfCopy',
        when: WF_STEP, group: '5_copy@1'
    },
    {
        id: 'wfStepDelete', title: 'Delete this step…', act: 'wfDelete',
        when: WF_STEP, group: '9_danger@1'
    },

    // ---- one execution ----------------------------------------------------
    {
        id: 'runOutput', title: 'Open its output', act: 'tkOutput',
        when: `${TASK_RUN} && afOutput`, group: '1_open@1'
    },
    {
        id: 'runTranscript', title: 'Open the transcript', act: 'tkTranscript',
        when: `${TASK_RUN} && afSession`, group: '1_open@2'
    },
    {
        id: 'runTerminal', title: 'Reveal its terminal', act: 'tkTerminal',
        when: `${TASK_RUN} && afStatus == 'running'`, group: '1_open@3'
    },
    {
        id: 'runDetail', title: 'Show the prompt and where it came from', act: 'tkDetail',
        when: TASK_RUN, group: '1_open@4'
    },
    {
        id: 'runSource', title: 'Show what started it', act: 'tkSource',
        when: `${TASK_RUN} && afFrom != 'manual'`, group: '1_open@5'
    },
    {
        id: 'runStart', title: 'Start it now', act: 'tkStart',
        when: `${TASK_RUN} && afStatus == 'queued'`, group: '2_edit@1'
    },
    {
        id: 'runUnpark', title: 'Try to start it again', act: 'tkUnpark',
        when: `${TASK_RUN} && afStatus == 'parked'`, group: '2_edit@2'
    },
    {
        id: 'runAgain', title: 'Run it again', act: 'tkRerun',
        when: `${TASK_RUN} && !afLive`, group: '2_edit@3'
    },
    {
        id: 'runRetryEdit', title: 'Run it again, with changes…', act: 'tkRetryEdit',
        when: `${TASK_RUN} && !afLive`, group: '2_edit@4'
    },
    {
        // ‼️ Not the same as the line above it, though both now open the same
        // form. A RETRY is this run once more — it keeps the lineage, counts up
        // the attempt, is named "… (retry N)" and resumes a workflow step in
        // place. A CLONE is a new, unrelated task that merely starts from the
        // same words. Available on a live run too: "another one like this,
        // but…" is a normal thing to want while the first is still going.
        id: 'runClone', title: 'New task like this one…', act: 'tkClone',
        when: TASK_RUN, group: '2_edit@5'
    },
    {
        id: 'runResumeWf', title: 'Resume the workflow from this step', act: 'tkResume',
        when: `${TASK_RUN} && afFrom == 'workflow' && !afLive`, group: '2_edit@6'
    },
    {
        id: 'runNext', title: 'To the front of the queue', act: 'tkNext',
        when: `${TASK_RUN} && afStatus == 'queued'`, group: '3_move@1'
    },
    {
        id: 'runUp', title: 'Up one', act: 'tkMove:up',
        when: `${TASK_RUN} && afStatus == 'queued'`, group: '3_move@2'
    },
    {
        id: 'runDown', title: 'Down one', act: 'tkMove:down',
        when: `${TASK_RUN} && afStatus == 'queued'`, group: '3_move@3'
    },
    {
        id: 'runTemplate', title: 'Save the prompt as a template…', act: 'tkTemplate',
        when: TASK_RUN, group: '4_link@1'
    },
    ...picker(CTX_PREFIX + 'tkCopy', TASK_RUN, 'tkCopy', [
        ['prompt', 'The prompt it ran'],
        ['title', 'Its name'],
        ['id', 'Its id'],
        ['output', 'The output file path']
    ]),
    {
        id: 'runCancel', title: 'Cancel it', act: 'tkCancel',
        when: `${TASK_RUN} && afLive`, group: '9_danger@1'
    },
    {
        id: 'runDelete', title: 'Delete this run', act: 'tkDelete',
        when: `${TASK_RUN} && !afLive`, group: '9_danger@2'
    },

    // =====================================================================
    // MISSIONS — a run is the only object on the page you can steer, and
    // every one of its controls was inside the expanded detail. The menu
    // reaches them from the plain row, which is where the list is read.
    // =====================================================================
    {
        id: 'msnOpen', title: 'Open this run', act: 'msOpen',
        when: `${MISSION_ROW} && !afOpen`, group: '1_open@1'
    },
    {
        id: 'msnFold', title: 'Fold it back to a row', act: 'msFold',
        when: `${MISSION_ROW} && afOpen`, group: '1_open@1'
    },
    {
        id: 'msnPlanner', title: "Open the lead's planner transcript", act: 'msPlanner',
        when: `${MISSION_ROW} && afPlanner`, group: '1_open@2'
    },
    {
        id: 'msnApprove', title: 'Approve this round', act: 'msApprove',
        when: `${MISSION_ROW} && afApproval`, group: '2_edit@1'
    },
    {
        id: 'msnReject', title: 'Reject this round', act: 'msReject',
        when: `${MISSION_ROW} && afApproval`, group: '2_edit@2'
    },
    {
        id: 'msnAnswer', title: 'Answer its question…', act: 'msAnswer',
        when: `${MISSION_ROW} && afQuestion`, group: '2_edit@3'
    },
    {
        id: 'msnPause', title: 'Pause it', act: 'msCtl:pause',
        when: `${MISSION_ROW} && afActive && afStatus != 'paused' && !afPausing`, group: '2_edit@4'
    },
    {
        id: 'msnUnpause', title: 'Withdraw the pause — keep it running', act: 'msCtl:unpause',
        when: `${MISSION_ROW} && afPausing`, group: '2_edit@4'
    },
    {
        id: 'msnResume', title: 'Resume it', act: 'msCtl:resume',
        when: `${MISSION_ROW} && afStatus == 'paused'`, group: '2_edit@5'
    },
    {
        id: 'msnRerun', title: 'Run this mission again…', act: 'msRerun',
        when: MISSION_ROW, group: '4_link@1'
    },
    ...picker(CTX_PREFIX + 'msCopy', MISSION_ROW, 'msCopy', [
        ['goal', 'The goal it was given'],
        ['verdict', 'The verdict and its summary'],
        ['ledger', 'The ledger — one line per round'],
        ['id', 'The run id']
    ]),
    {
        id: 'msnCancel', title: 'Cancel the mission…', act: 'msCtl:cancel',
        when: `${MISSION_ROW} && afActive`, group: '9_danger@1'
    },
    {
        id: 'msnDelete', title: 'Delete this run from the history…', act: 'msDelete',
        when: `${MISSION_ROW} && !afActive`, group: '9_danger@2'
    },

    // ---- one delegation inside a round ------------------------------------
    {
        id: 'msStepOpen', title: 'Show its prompt and output here', act: 'mstOpen',
        when: MISSION_STEP, group: '1_open@1'
    },
    {
        id: 'msStepOut', title: 'Open the delegation output', act: 'mstOut',
        when: `${MISSION_STEP} && afOutput`, group: '1_open@2'
    },
    // ‼️ X-96 — the OTHER half of what a delegation leaves behind. The output is
    // what it wrote; the session is what it did. The row has both links now and
    // the menu offers the same two, gated the same way — a step with no session
    // recorded (queued, never launched) does not offer one.
    {
        id: 'msStepSession', title: 'Open the session it ran in', act: 'mstSession',
        when: `${MISSION_STEP} && afSession`, group: '1_open@3'
    },
    {
        id: 'msStepAgent', title: 'Open the agent that ran it', act: 'mstAgent',
        when: MISSION_STEP, group: '1_open@4'
    },
    ...picker(CTX_PREFIX + 'mstCopy', MISSION_STEP, 'mstCopy', [
        ['prompt', 'The prompt it was given'],
        ['title', 'The task title'],
        ['output', 'The output file path']
    ]),

    // ---- one planner round -------------------------------------------------
    {
        id: 'msRoundOpen', title: 'Expand this round', act: 'msrFold:0',
        when: `${MISSION_ROUND} && afClosed`, group: '1_open@1'
    },
    {
        id: 'msRoundClose', title: 'Fold this round', act: 'msrFold:1',
        when: `${MISSION_ROUND} && !afClosed`, group: '1_open@1'
    },
    {
        id: 'msRoundOnly', title: 'Only this round open', act: 'msrOnly',
        when: MISSION_ROUND, group: '1_open@2'
    },
    {
        id: 'msRoundCopy', title: "Copy the round — the planner's thought and its steps", act: 'msrCopy',
        when: MISSION_ROUND, group: '5_copy@1'
    },

    // ---- a member of the team ----------------------------------------------
    {
        id: 'msTeamOpen', title: 'Open this agent', act: 'mtOpen',
        when: MISSION_TEAM, group: '1_open@1'
    },
    {
        id: 'msTeamTalk', title: 'Talk to it in the Console…', act: 'mtTalk',
        when: MISSION_TEAM, group: '1_open@2'
    },
    {
        id: 'msTeamCopy', title: 'Copy its name, role and model', act: 'mtCopy',
        when: MISSION_TEAM, group: '5_copy@1'
    },

    // =====================================================================
    // NOTICES — the agent→you board. Everything a notice can do was behind
    // its expanded body, so acting on one meant opening it first, which
    // marks it read: reading the list and triaging it were the same gesture.
    // =====================================================================
    {
        id: 'ntOpen', title: 'Open it here', act: 'ntOpen',
        when: `${NOTICE_ROW} && !afOpen`, group: '1_open@1'
    },
    {
        id: 'ntFold', title: 'Fold it back to a line', act: 'ntFold',
        when: `${NOTICE_ROW} && afOpen`, group: '1_open@1'
    },
    {
        id: 'ntReport', title: 'Open the full report', act: 'ntReport',
        when: `${NOTICE_ROW} && afReport`, group: '1_open@2'
    },
    {
        id: 'ntOrig', title: 'Show what it said before it was edited', act: 'ntOrig',
        when: `${NOTICE_ROW} && afEdited`, group: '1_open@3'
    },
    {
        id: 'ntRead', title: 'Mark it read', act: 'ntRead:1',
        when: `${NOTICE_ROW} && !afRead`, group: '2_edit@1'
    },
    {
        id: 'ntUnread', title: 'Mark it unread', act: 'ntRead:0',
        when: `${NOTICE_ROW} && afRead`, group: '2_edit@1'
    },
    {
        id: 'ntPin', title: 'Pin it to the top', act: 'ntPin:1',
        when: `${NOTICE_ROW} && !afPinned`, group: '2_edit@2'
    },
    {
        id: 'ntUnpin', title: 'Unpin it', act: 'ntPin:0',
        when: `${NOTICE_ROW} && afPinned`, group: '2_edit@2'
    },
    ...picker(CTX_PREFIX + 'ntStars', NOTICE_ROW, 'ntStars', [
        ['0', 'none'], ['1', '★'], ['2', '★★'], ['3', '★★★']
    ]),
    {
        id: 'ntEdit', title: 'Edit it…', act: 'ntEdit',
        when: NOTICE_ROW, group: '2_edit@5'
    },
    // Only an open question can still be answered or passed over.
    {
        id: 'ntAnswer', title: 'Answer it…', act: 'ntAnswer',
        when: `${NOTICE_ROW} && afQuestion && afStatus == 'open'`, group: '2_edit@6'
    },
    {
        id: 'ntDecline', title: 'Pass it over without answering', act: 'ntDecline',
        when: `${NOTICE_ROW} && afQuestion && afStatus == 'open'`, group: '2_edit@7'
    },
    {
        id: 'ntHand', title: 'Hand it to its agent', act: 'ntHand',
        when: NOTICE_ROW, group: '4_link@1'
    },
    {
        id: 'ntQueue', title: 'Add it to the work queue…', act: 'ntQueue',
        when: `${NOTICE_ROW} && !afQuestion`, group: '4_link@2'
    },
    {
        id: 'ntExport', title: 'Export it as Markdown', act: 'ntExport',
        when: NOTICE_ROW, group: '4_link@3'
    },
    ...picker(CTX_PREFIX + 'ntOnly', NOTICE_ROW, 'ntOnly', [
        ['agent', 'What this agent has said'],
        ['type', 'This kind of message'],
        ['level', 'This level and nothing else']
    ]),
    ...picker(CTX_PREFIX + 'ntCopy', NOTICE_ROW, 'ntCopy', [
        ['title', 'Its title'],
        ['body', 'Its whole text'],
        ['id', 'Its id — what an agent quotes']
    ]),
    {
        id: 'ntDismiss', title: 'Dismiss it', act: 'ntDismiss',
        when: `${NOTICE_ROW} && !afQuestion`, group: '9_danger@1'
    },
    {
        id: 'ntDelete', title: 'Delete this question', act: 'ntDismiss',
        when: `${NOTICE_ROW} && afQuestion`, group: '9_danger@1'
    },

    // =====================================================================
    // THE WORK QUEUE — the mirror of the board above, you→agent.
    // =====================================================================
    {
        id: 'qOpen', title: 'Open it here', act: 'qOpen',
        when: `${QUEUE_ROW} && !afOpen`, group: '1_open@1'
    },
    {
        id: 'qFold', title: 'Fold it back to a line', act: 'qFold',
        when: `${QUEUE_ROW} && afOpen`, group: '1_open@1'
    },
    {
        id: 'qNotice', title: 'Open the notice it came from', act: 'qNotice',
        when: `${QUEUE_ROW} && afSource`, group: '1_open@2'
    },
    {
        id: 'qReport', title: 'Open the report it produced', act: 'qFile:report',
        when: `${QUEUE_ROW} && afReport`, group: '1_open@3'
    },
    {
        id: 'qAnswerFile', title: 'Open the answer that was written', act: 'qFile:answer',
        when: `${QUEUE_ROW} && afAnswer`, group: '1_open@4'
    },
    {
        id: 'qAnswer', title: 'Answer it — it is waiting on you…', act: 'qAnswer',
        when: `${QUEUE_ROW} && afBlocked`, group: '2_edit@1'
    },
    {
        id: 'qEdit', title: 'Edit it…', act: 'qEdit',
        when: `${QUEUE_ROW} && !afTerminal`, group: '2_edit@2'
    },
    ...picker(CTX_PREFIX + 'qUrg', `${QUEUE_ROW} && !afTerminal`, 'qUrg', [
        ['normal', 'normal'],
        ['soon', '🔼 soon'],
        ['urgent', '⏫ urgent']
    ]),
    {
        id: 'qHand', title: 'Hand it to an agent', act: 'qHand',
        when: QUEUE_ROW, group: '4_link@1'
    },
    ...picker(CTX_PREFIX + 'qCopy', QUEUE_ROW, 'qCopy', [
        ['text', 'What it says'],
        ['id', 'Its id']
    ]),
    // Dropping is how an unwanted capture is HANDLED; only a handled item can
    // then be deleted, and the two are never offered together.
    {
        id: 'qDrop', title: 'Drop it — void this capture', act: 'qDrop',
        when: `${QUEUE_ROW} && !afTerminal`, group: '9_danger@1'
    },
    {
        id: 'qRemove', title: 'Delete it permanently', act: 'qRemove',
        when: `${QUEUE_ROW} && afTerminal`, group: '9_danger@2'
    },

    // ---- a lane heading ---------------------------------------------------
    {
        id: 'qlDropShow', title: 'Show the dropped lane', act: 'qlDropped:1',
        when: `${QUEUE_LANE} && !afDropShown`, group: '2_edit@1'
    },
    {
        id: 'qlDropHide', title: 'Hide the dropped lane', act: 'qlDropped:0',
        when: `${QUEUE_LANE} && afDropShown`, group: '2_edit@1'
    },
    {
        id: 'qlCopy', title: 'Copy this lane as Markdown', act: 'qlCopy',
        when: QUEUE_LANE, group: '5_copy@1'
    },

    // =====================================================================
    // NEEDS YOU — what the farm is stuck on. The row's own buttons are built
    // from the blocker (Approve, Reject, Resume…) and cannot be a static
    // menu; what the menu adds is everything AROUND the blocker — the agent,
    // the session behind it (see SESSION_ROW above), and getting it out of
    // the way once judged.
    // =====================================================================
    {
        id: 'ndAgent', title: 'Open the agent that is stuck', act: 'ndAgent',
        when: `${NEED_ROW} && afAgentId`, group: '1_open@1'
    },
    {
        id: 'ndClear', title: 'Clear this row — it comes back if it happens again', act: 'ndClear',
        when: `${NEED_ROW} && afClearable`, group: '2_edit@1'
    },
    {
        id: 'ndCopy', title: 'Copy the row', act: 'ndCopy',
        when: NEED_ROW, group: '5_copy@1'
    },

    // =====================================================================
    // THE TOOLBOX — everything that extends claude, at both scopes. The rows
    // carried three buttons (open · folder · remove) and the rest of what an
    // entry can do was on the sidebar tree, where you cannot see the
    // inventory you are deciding about.
    // =====================================================================
    {
        id: 'tbOpen', title: 'Open its file', act: 'tbOpen',
        when: TOOL_ROW, group: '1_open@1'
    },
    {
        id: 'tbReveal', title: 'Reveal it in the file explorer', act: 'tbReveal',
        when: TOOL_ROW, group: '1_open@2'
    },
    {
        id: 'tbHome', title: 'Open its homepage', act: 'tbHome',
        when: `${TOOL_ROW} && afHome`, group: '1_open@3'
    },
    {
        id: 'tbProbe', title: 'Ask it for its tool list', act: 'tbProbe',
        when: `${TOOL_ROW} && afKind == 'mcp'`, group: '2_edit@1'
    },
    {
        id: 'tbTools', title: 'Show the tools it answered with', act: 'tbTools',
        when: `${TOOL_ROW} && afKind == 'mcp' && afProbed`, group: '2_edit@2'
    },
    {
        id: 'tbMcpOff', title: 'Disable it for this agent', act: 'tbMcp:off',
        when: `${TOOL_ROW} && afKind == 'mcp' && afScope == 'agent' && !afDisabled`, group: '2_edit@3'
    },
    {
        id: 'tbMcpOn', title: 'Enable it for this agent', act: 'tbMcp:on',
        when: `${TOOL_ROW} && afKind == 'mcp' && afScope == 'agent' && afDisabled`, group: '2_edit@3'
    },
    {
        id: 'tbMcpEdit', title: 'Edit its definition…', act: 'tbMcpEdit',
        when: `${TOOL_ROW} && afKind == 'mcp' && afScope == 'agent'`, group: '2_edit@4'
    },
    {
        id: 'tbPlugOn', title: 'Enable it — for every new claude session', act: 'tbPlug:1',
        when: `${TOOL_ROW} && afKind == 'plugin' && !afOn`, group: '2_edit@5'
    },
    {
        id: 'tbPlugOff', title: 'Disable it', act: 'tbPlug:0',
        when: `${TOOL_ROW} && afKind == 'plugin' && afOn`, group: '2_edit@5'
    },
    {
        id: 'tbCopyAgent', title: 'Copy it to another agent…', act: 'tbCopyAgent',
        when: `${TOOL_ROW} && afScope == 'agent' && afKind =~ /^(skill|mcp)$/`, group: '4_link@1'
    },
    {
        id: 'tbScope', title: 'Move it between user and agent scope…', act: 'tbScope',
        when: `${TOOL_ROW} && afKind == 'skill'`, group: '4_link@2'
    },
    ...picker(CTX_PREFIX + 'tbCopy', TOOL_ROW, 'tbCopy', [
        ['name', 'Its name'],
        ['path', 'Its file path']
    ]),
    // Only the two kinds you TYPE have an invocation to copy.
    {
        menu: CTX_PREFIX + 'tbCopy', id: 'tbCopyInvoke', act: 'tbCopy:invoke',
        title: 'How you invoke it — /name',
        when: `${TOOL_ROW} && afKind =~ /^(skill|command)$/`, group: '1_pick@3'
    },
    {
        id: 'tbRemove', title: 'Remove it — a backup is kept beside it', act: 'tbRemove',
        when: `${TOOL_ROW} && afRemovable`, group: '9_danger@1'
    },

    // =====================================================================
    // THE CAPABILITY MATRIX — a cell is "this agent has (or lacks) this
    // thing". Both halves of that are actions, and neither had a menu.
    // =====================================================================
    {
        id: 'capOpen', title: 'Open the file behind it', act: 'capOpen',
        when: `${CAP_CELL} && afPresent && capSource`, group: '1_open@1'
    },
    {
        id: 'capTasks', title: 'Open the full task history', act: 'capTasks',
        when: `${CAP_CELL} && capKind == 'task'`, group: '1_open@1'
    },
    // The ＋ that was the only way to fill a hole: now it is a menu item too,
    // and it runs the very same message — the host still picks the donor.
    {
        id: 'capCopy', title: 'Copy it to this agent…', act: 'capCopy',
        when: `${CAP_CELL} && !afPresent && afCopyable`, group: '2_edit@1'
    },
    {
        id: 'capPath', title: 'Copy its path', act: 'capPath',
        when: `${CAP_CELL} && capSource`, group: '5_copy@1'
    },
    {
        id: 'capRowOpen', title: 'Open the file that defines it', act: 'capOpen',
        when: `${CAP_ROW} && capSource`, group: '1_open@1'
    },
    {
        id: 'capRowTasks', title: 'Open the full task history', act: 'capTasks',
        when: `${CAP_ROW} && capKind == 'task'`, group: '1_open@1'
    },
    {
        id: 'capRowName', title: 'Copy its name', act: 'capName',
        when: CAP_ROW, group: '5_copy@1'
    },

    // =====================================================================
    // FARM SETTINGS — one setting, and one agent root.
    // =====================================================================
    {
        id: 'stOpenUi', title: "Open it in VS Code's settings editor", act: 'stOpenUi',
        when: SETTING_ROW, group: '1_open@1'
    },
    {
        id: 'stReset', title: 'Reset it to its default', act: 'stReset',
        when: `${SETTING_ROW} && afModified`, group: '2_edit@1'
    },
    {
        id: 'stCopyKey', title: 'Copy its setting key', act: 'stCopy:key',
        when: SETTING_ROW, group: '5_copy@1'
    },
    {
        id: 'stCopyValue', title: 'Copy what it is set to', act: 'stCopy:value',
        when: SETTING_ROW, group: '5_copy@2'
    },
    {
        id: 'rtReveal', title: 'Show the folder', act: 'rtReveal',
        when: `${AGENT_ROOT} && !afMissing`, group: '1_open@1'
    },
    {
        id: 'rtAdd', title: 'Add another root…', act: 'rtAdd',
        when: AGENT_ROOT, group: '4_link@1'
    },
    {
        id: 'rtCopy', title: 'Copy its path', act: 'rtCopy',
        when: AGENT_ROOT, group: '5_copy@1'
    },
    {
        id: 'rtRemove', title: 'Stop scanning this root', act: 'rtRemove',
        when: AGENT_ROOT, group: '9_danger@1'
    },

    // =====================================================================
    // THE VAULT — ‼️ THERE IS NO "COPY THE VALUE" ITEM, AND THERE WILL NOT
    // BE ONE. A secret that can reach the clipboard from a menu is a secret
    // that reaches the clipboard by accident; the value never leaves the OS
    // keychain, which is the whole reason this page exists (_REF/bridge.md
    // makes the same exception for the same reason).
    // =====================================================================
    {
        id: 'scValue', title: 'Replace its value…', act: 'scAct:setValue',
        when: SECRET_ROW, group: '2_edit@1'
    },
    {
        id: 'scDesc', title: 'Edit its description…', act: 'scAct:editDescription',
        when: SECRET_ROW, group: '2_edit@2'
    },
    {
        id: 'scScope', title: 'Choose which agents may use it…', act: 'scAct:editScope',
        when: SECRET_ROW, group: '2_edit@3'
    },
    {
        id: 'scCopyName', title: 'Copy its name', act: 'scCopyName',
        when: SECRET_ROW, group: '5_copy@1'
    },
    {
        id: 'scCopyRef', title: 'Copy how a prompt refers to it — {secret:NAME}', act: 'scCopyRef',
        when: SECRET_ROW, group: '5_copy@2'
    },
    {
        id: 'scDelete', title: 'Delete it from the keychain…', act: 'scAct:delete',
        when: SECRET_ROW, group: '9_danger@1'
    },

    // =====================================================================
    // READING SURFACES. A turn row and a search hit are SESSIONS (they are in
    // the SESSION_ROW family above) — what follows is what they are as well
    // as that: a turn, a match, a step, a changed file, a hunk.
    // =====================================================================
    {
        id: 'tnOpen', title: 'Open the transcript at this turn', act: 'tnOpen',
        when: TURN_ROW, group: '1_open@0'
    },
    {
        id: 'tnFold', title: "Show this turn's content here", act: 'tnFold',
        when: TURN_ROW, group: '2_turn@1'
    },
    // ‼️ K-26 — the badge is the gesture, this is where somebody LOOKS for it.
    // The Turns page is the one surface that reads every turn of every session
    // against each other, which is exactly the reading that ends in "that one
    // is worth keeping" — and a feature only reachable by noticing a 🔖 that
    // fades in on hover is a feature half the fleet never finds.
    {
        id: 'tnWiki', title: 'Keep this turn for the wiki…', act: 'tnWiki',
        when: TURN_ROW, group: '2_turn@2'
    },
    ...picker(CTX_PREFIX + 'tnCopy', TURN_ROW, 'tnCopy', [
        ['prompt', 'What was asked'],
        ['answer', 'What came back'],
        ['all', 'The whole turn'],
        ['where', 'Where it is — session id and turn number']
    ]),

    // ---- a hit in the search results -------------------------------------
    {
        id: 'shOpen', title: 'Open the transcript at this moment', act: 'shOpen',
        when: SEARCH_HIT, group: '1_open@0'
    },
    {
        id: 'shOnlySession', title: 'Search only this session', act: 'shOnly:session',
        when: SEARCH_HIT, group: '2_search@1'
    },
    {
        id: 'shOnlyAgent', title: 'Search only this agent', act: 'shOnly:agent',
        when: `${SEARCH_HIT} && agentName`, group: '2_search@2'
    },
    ...picker(CTX_PREFIX + 'shCopy', SEARCH_HIT, 'shCopy', [
        ['line', 'The matching line'],
        ['context', 'The line with what is around it']
    ]),

    // ---- a scope chip on the Search page ---------------------------------
    // ‼️ U-88 — THE GESTURE EXISTED AND NOBODY COULD FIND IT. Ctrl-click has
    // meant "only this" since the chips became toggles, which is discoverable
    // only by reading the hint beside them; the menu is the door somebody
    // looking for it will actually try. Both run the same page function.
    //
    // Hidden on the chip that is already alone: a menu item that cannot change
    // anything teaches the reader nothing when they click it.
    {
        id: 'scOnly', title: 'Choose only this', act: 'scOnly',
        when: `${SCOPE_CHIP} && !scopeAlone`, group: '1_scope@0'
    },

    // ---- a turn band in the session viewer --------------------------------
    {
        id: 'vtFold', title: 'Fold this turn', act: 'vtFold:1',
        when: `${VIEWER_TURN} && !afClosed`, group: '1_open@1'
    },
    {
        id: 'vtUnfold', title: 'Unfold this turn', act: 'vtFold:0',
        when: `${VIEWER_TURN} && afClosed`, group: '1_open@1'
    },
    {
        id: 'vtOnly', title: 'Only this turn open', act: 'vtOnly',
        when: VIEWER_TURN, group: '1_open@2'
    },
    {
        id: 'vtJump', title: 'Jump to it', act: 'vtJump',
        when: VIEWER_TURN, group: '1_open@3'
    },
    // K-26 — the same mark the band's 🔖 makes, in the menu the hand already
    // opens on this row. Its own group: it is the only item here that leaves
    // something behind after the page is closed.
    {
        id: 'vtWiki', title: 'Keep this turn for the wiki…', act: 'vtWiki',
        when: VIEWER_TURN, group: '3_mark@1'
    },
    // Export-MD selection: the checkboxes are on the bands and in the
    // breakdown table, and "only this one" was a button in one of the two.
    {
        id: 'vtExportOn', title: 'Include it in Export MD', act: 'vtExport:1',
        when: `${VIEWER_TURN} && !afExport`, group: '2_edit@1'
    },
    {
        id: 'vtExportOff', title: 'Leave it out of Export MD', act: 'vtExport:0',
        when: `${VIEWER_TURN} && afExport`, group: '2_edit@1'
    },
    {
        id: 'vtExportOnly', title: 'Export only this turn', act: 'vtExport:only',
        when: VIEWER_TURN, group: '2_edit@2'
    },
    ...picker(CTX_PREFIX + 'vtCopy', VIEWER_TURN, 'vtCopy', [
        ['prompt', 'What was asked'],
        ['answer', 'What came back'],
        ['all', 'The whole turn']
    ]),

    // ---- one step inside a turn -------------------------------------------
    {
        id: 'vsFile', title: 'Open the file it touched', act: 'vsFile',
        when: `${VIEWER_STEP} && stepFile`, group: '1_open@1'
    },
    {
        id: 'vsOnlyKind', title: 'Show only this kind of step', act: 'vsOnly',
        when: VIEWER_STEP, group: '2_mark@1'
    },
    ...picker(CTX_PREFIX + 'vsCopy', VIEWER_STEP, 'vsCopy', [
        ['text', 'What it says'],
        ['tool', 'What was sent to the tool'],
        ['result', 'What came back']
    ]),

    // ---- a file this session changed, and one hunk of it -------------------
    {
        id: 'vfOpen', title: 'Open the file', act: 'vfOpen',
        when: VIEWER_FILE, group: '1_open@1'
    },
    {
        id: 'vfDiff', title: 'Diff it against git HEAD', act: 'vfDiff',
        when: VIEWER_FILE, group: '1_open@2'
    },
    {
        id: 'vfHunks', title: 'Show what this session changed in it', act: 'vfHunks',
        when: VIEWER_FILE, group: '1_open@3'
    },
    {
        id: 'vfReveal', title: 'Reveal it in the file explorer', act: 'vfReveal',
        when: VIEWER_FILE, group: '1_open@4'
    },
    {
        id: 'vfCopy', title: 'Copy its path', act: 'vfCopy',
        when: VIEWER_FILE, group: '5_copy@1'
    },
    {
        id: 'dhCopyNew', title: 'Copy what it became', act: 'dhCopy:new',
        when: DIFF_HUNK, group: '5_copy@1'
    },
    {
        id: 'dhCopyOld', title: 'Copy what it replaced', act: 'dhCopy:old',
        when: DIFF_HUNK, group: '5_copy@2'
    },
    {
        id: 'dhOpen', title: 'Open the file at this change', act: 'dhOpen',
        when: DIFF_HUNK, group: '1_open@1'
    },

    // =====================================================================
    // THE CONSOLE'S TWO WAITING STATES.
    // =====================================================================
    {
        id: 'cqNow', title: 'Say it now, into the running turn', act: 'cqNow',
        when: CONSOLE_QUEUED, group: '1_open@1'
    },
    {
        id: 'cqEdit', title: 'Bring it back into the box to change it', act: 'cqEdit',
        when: CONSOLE_QUEUED, group: '2_edit@1'
    },
    {
        id: 'cqCopy', title: 'Copy what it says', act: 'cqCopy',
        when: CONSOLE_QUEUED, group: '5_copy@1'
    },
    {
        id: 'cqDrop', title: 'Drop it — it is never said', act: 'cqDrop',
        when: CONSOLE_QUEUED, group: '9_danger@1'
    },
    // A permission request: the two answers, plus the standing one. "Always"
    // is the permission MODE, which is what the box's own retry control sets.
    {
        id: 'caAllow', title: 'Allow it, once', act: 'caAllow',
        when: `${CONSOLE_ASK} && !afQuestion`, group: '1_open@1'
    },
    {
        id: 'caDeny', title: 'Deny it', act: 'caDeny',
        when: `${CONSOLE_ASK} && !afQuestion`, group: '1_open@2'
    },
    {
        id: 'caSkip', title: 'Skip the question — the turn carries on', act: 'caDeny',
        when: `${CONSOLE_ASK} && afQuestion`, group: '1_open@2'
    },
    {
        id: 'caCopy', title: 'Copy what it is asking', act: 'caCopy',
        when: CONSOLE_ASK, group: '5_copy@1'
    },

    // =====================================================================
    // AN AGENT — all host commands, so every surface that publishes an agent
    // row gets the whole set for free. See AGENT_ROW above.
    // =====================================================================
    { command: 'agentfarm.openAgentDetail', when: AGENT_ROW, group: '1_open@1' },
    { command: 'agentfarm.openAgentInNewWindow', when: AGENT_ROW, group: '1_open@2' },
    { command: 'agentfarm.launchSession', when: AGENT_ROW, group: '1_open@3' },
    { command: 'agentfarm.consoleForAgent', when: AGENT_ROW, group: '1_open@4' },
    { command: 'agentfarm.continueSession', when: AGENT_ROW, group: '1_open@5' },
    { command: 'agentfarm.revealAgent', when: AGENT_ROW, group: '1_open@6' },
    { command: 'agentfarm.openDuties', when: AGENT_ROW, group: '2_edit@1' },
    { command: 'agentfarm.addDuty', when: AGENT_ROW, group: '2_edit@2' },
    { command: 'agentfarm.addMemory', when: AGENT_ROW, group: '2_edit@3' },
    { command: 'agentfarm.openMemoryGraph', when: AGENT_ROW, group: '2_edit@4' },
    { command: 'agentfarm.assignProject', when: AGENT_ROW, group: '4_link@1' },
    { command: 'agentfarm.distillMemory', when: AGENT_ROW, group: '4_link@2' },
    { command: 'agentfarm.exportAgentPack', when: AGENT_ROW, group: '4_link@3' },
    { command: 'agentfarm.syncAntigravity', when: AGENT_ROW, group: '4_link@4' },
    { command: 'agentfarm.copyAgentName', when: AGENT_ROW, group: '5_copy@1' },
    { command: 'agentfarm.copyAgentFolder', when: AGENT_ROW, group: '5_copy@2' },

    // ‼️ A Timeline lane gets the agent menu and NOTHING ELSE, on purpose. The
    // plan called for "show only this lane" and a menu on the event dots; the
    // page has no lane filter to drive, and the dots already sit inside the
    // row's session context and open at their own moment on a left-click.
    // Inventing a filter behind a menu item would be a feature nobody could
    // find, and a second menu on the dots would take the session's away.

    // =====================================================================
    // THE DASHBOARD'S OWN FURNITURE. A number you cannot act on is a poster;
    // these three were exactly that.
    // =====================================================================
    {
        id: 'stOpen', title: 'Open the page behind this number', act: 'tileOpen',
        when: `${STAT_TILE} && tileNav`, group: '1_open@1'
    },
    {
        id: 'stCopyVal', title: 'Copy the figure', act: 'tileCopy',
        when: STAT_TILE, group: '5_copy@1'
    },
    { command: 'agentfarm.planUsageRefresh', when: PLAN_USAGE, group: '1_open@1' },
    { command: 'agentfarm.lapReset', when: PLAN_USAGE, group: '2_edit@1' },
    { command: 'agentfarm.lapClear', when: PLAN_USAGE, group: '2_edit@2' },
    {
        id: 'puCopy', title: 'Copy the figures', act: 'puCopy',
        when: PLAN_USAGE, group: '5_copy@1'
    },
    // ‼️ NO Fix / Delegate / Dismiss here, and that is deliberate. Those three
    // commands take a whole `Insight` object — the finding, its rule, its
    // evidence — and a webview row carries a rendered line, not that object. A
    // menu item that handed them a lookalike would act on the wrong finding, or
    // on none, and say nothing either way. They stay on the palette and the
    // tree, where the real object is in hand. What the row CAN honestly do is
    // below.
    {
        id: 'insOpen', title: 'Open the file it is about', act: 'insOpen',
        when: `${INSIGHT_ROW} && insFile`, group: '1_open@1'
    },
    {
        id: 'insGuide', title: 'What is this? — the guide entry', act: 'insGuide',
        when: `${INSIGHT_ROW} && insAnchor`, group: '1_open@2'
    },
    { command: 'agentfarm.insightHistory', when: INSIGHT_ROW, group: '4_link@1' },
    { command: 'agentfarm.restoreInsights', when: INSIGHT_ROW, group: '4_link@2' },
    {
        id: 'insCopy', title: 'Copy what it says', act: 'insCopy',
        when: INSIGHT_ROW, group: '5_copy@1'
    },

    // ---- a signal on the Living page --------------------------------------
    {
        id: 'lvGo', title: 'Go to what it is about', act: 'lvGo',
        when: `${LIVING_SIGNAL} && sigGoto`, group: '1_open@1'
    },
    { command: 'agentfarm.configureLivingChecks', when: LIVING_SIGNAL, group: '2_edit@1' },
    {
        id: 'lvCopy', title: 'Copy the signal line', act: 'lvCopy',
        when: LIVING_SIGNAL, group: '5_copy@1'
    },

    // ---- a memory file, and a standing duty --------------------------------
    {
        id: 'memOpen', title: 'Open it', act: 'memOpen',
        when: MEMORY_ROW, group: '1_open@1'
    },
    {
        id: 'memGraph', title: 'Show it in the memory graph', act: 'memGraph',
        when: MEMORY_ROW, group: '1_open@2'
    },
    // U-14: the two acts a memory row could not offer while making one meant a
    // chain of boxes. Both open a card on the memory graph.
    {
        id: 'memCopyTo', title: 'Copy it to another agent…', act: 'memCopyTo',
        when: MEMORY_ROW, group: '2_act@1'
    },
    {
        id: 'memDistil', title: 'Distil it — shorter, with a diff first', act: 'memDistil',
        when: MEMORY_ROW, group: '2_act@2'
    },
    {
        id: 'memCopyPath', title: 'Copy its path', act: 'memCopy',
        when: MEMORY_ROW, group: '5_copy@1'
    },
    // ---- an eval case ------------------------------------------------------
    {
        id: 'evCopyInput', title: 'Copy its input — the prompt that is replayed', act: 'evCopyInput',
        when: EVAL_CASE, group: '5_copy@1'
    },
    {
        id: 'evCopyTitle', title: 'Copy its title', act: 'evCopyTitle',
        when: EVAL_CASE, group: '5_copy@2'
    },
    {
        id: 'evDelete', title: 'Delete this case', act: 'evDelete',
        when: EVAL_CASE, group: '9_danger@1'
    },

    {
        id: 'dutyOpen', title: 'Open DUTIES.md', act: 'dutyOpen',
        when: DUTY_ROW, group: '1_open@1'
    },
    // ‼️ The menu reaches everything the row's own buttons reach (U-14). It used
    // to offer "open the file" and "copy the text" over a row whose object
    // could only be edited, paused, reordered or deleted from the sidebar tree.
    {
        id: 'dutyEdit', title: 'Edit it — title, cadence, watch, what to do', act: 'dutyEdit',
        when: DUTY_ROW, group: '2_act@1'
    },
    {
        id: 'dutyTo', title: 'Copy it to another agent…', act: 'dutyTo',
        when: DUTY_ROW, group: '2_act@2'
    },
    {
        id: 'dutyPause', title: 'Pause / resume it', act: 'dutyPause',
        when: DUTY_ROW, group: '2_act@3'
    },
    {
        id: 'dutyDel', title: 'Delete it from DUTIES.md', act: 'dutyDel',
        when: DUTY_ROW, group: '9_danger@1'
    },
    {
        id: 'dutyCopy', title: 'Copy the duty — watch, and what to do', act: 'dutyCopy',
        when: DUTY_ROW, group: '5_copy@1'
    },

    // =====================================================================
    // THE STUDIO — a scene and an asset. Both rows carried their actions as
    // small buttons that come and go with the state; the menu says which of
    // them apply and offers the rest.
    // =====================================================================
    {
        id: 'scAssets', title: 'Show its assets', act: 'scAssets',
        when: SCENE_ROW, group: '1_open@1'
    },
    // ‼️ The row's button is LABELLED with the next step (Generate · Triage ·
    // Set status · In sequence) because it changes with the scene. A menu title
    // cannot change, so it names the idea rather than pretending to know which
    // one it is — and runs exactly what the button runs.
    {
        id: 'scNext', title: 'Do the next thing this scene is waiting for', act: 'scNext',
        when: SCENE_ROW, group: '1_open@2'
    },
    ...picker(CTX_PREFIX + 'scStatus', SCENE_ROW, 'scStatus', [
        ['draft', 'draft'],
        ['generating', 'generating'],
        ['review', 'review'],
        ['approved', 'approved — goes into the export']
    ]),
    {
        id: 'scCopyId', title: 'Copy its scene id', act: 'scCopy',
        when: SCENE_ROW, group: '5_copy@1'
    },
    {
        id: 'asOpen', title: 'Open the file', act: 'asOpen',
        when: `${ASSET_CARD} && asPath`, group: '1_open@1'
    },
    // An asset registered from a watched folder was never generated here, so
    // there is nothing to re-run, vary or give feedback on.
    {
        id: 'asRerun', title: 'Make it again', act: 'asRerun',
        when: `${ASSET_CARD} && !asExternal`, group: '2_edit@1'
    },
    {
        id: 'asVary', title: 'Make a variation…', act: 'asVary',
        when: `${ASSET_CARD} && !asExternal`, group: '2_edit@2'
    },
    {
        id: 'asFeedback', title: 'Say what was wrong, and make it again…', act: 'asFeedback',
        when: `${ASSET_CARD} && !asExternal`, group: '2_edit@3'
    },
    {
        id: 'asKeep', title: 'Keep it', act: 'asTriage:1',
        when: ASSET_CARD, group: '3_move@1'
    },
    {
        id: 'asDrop', title: 'Drop it', act: 'asTriage:0',
        when: ASSET_CARD, group: '3_move@2'
    },
    {
        id: 'asAssign', title: 'Assign it to a scene…', act: 'asAssign',
        when: ASSET_CARD, group: '4_link@1'
    },
    ...picker(CTX_PREFIX + 'asCopy', ASSET_CARD, 'asCopy', [
        ['path', 'Its file path'],
        ['input', 'What it was asked for'],
        ['model', 'The model that made it']
    ]),

    // ---- who generates, and what it costs ---------------------------------
    {
        id: 'pvSetting', title: 'Open its setting', act: 'pvSetting',
        when: `${PROVIDER_ROW} && pvSetting`, group: '1_open@1'
    },
    {
        id: 'pvVault', title: 'Open the key vault', act: 'pvVault',
        when: PROVIDER_ROW, group: '1_open@2'
    },
    {
        id: 'pvCopy', title: 'Copy its name', act: 'pvCopy',
        when: PROVIDER_ROW, group: '5_copy@1'
    },

    // ---- an Airtable instance ---------------------------------------------
    {
        id: 'atDefault', title: 'Use this one when a tool call names none', act: 'atDefault',
        when: `${AIRTABLE_INSTANCE} && !afDefault`, group: '2_edit@1'
    },
    {
        id: 'atReveal', title: 'Reveal its folder', act: 'atReveal',
        when: AIRTABLE_INSTANCE, group: '1_open@1'
    },
    {
        id: 'atCopyName', title: 'Copy its name', act: 'atCopy:name',
        when: AIRTABLE_INSTANCE, group: '5_copy@1'
    },
    {
        id: 'atCopyDir', title: 'Copy its folder path', act: 'atCopy:dir',
        when: AIRTABLE_INSTANCE, group: '5_copy@2'
    },

    // ---- an analytics table ------------------------------------------------
    // ‼️ The TABLE, not the row. These rows are aggregates — a task family, an
    // agent scorecard — and carry no id anything else could act on; a row menu
    // would have to invent one. What the table itself can do is real.
    {
        id: 'anExport', title: 'Export the rows you can see as Markdown', act: 'anExport',
        when: ANALYTICS_TABLE, group: '4_link@1'
    },
    {
        id: 'anReset', title: 'Clear its search, filters and sort', act: 'anReset',
        when: ANALYTICS_TABLE, group: '2_edit@1'
    },
    { command: 'agentfarm.openTaskHistory', when: ANALYTICS_TABLE, group: '1_open@1' }
];

/** The command a catalogue item invokes. */
export function ctxCommandId(item: CtxItem): string {
    return item.command || (item.id ? CTX_PREFIX + item.id : '');
}

/** Does this `when` clause draw on that section? Handles both spellings the
 *  catalogue uses — an equality, and a regex over a family of sections. */
export function ctxDrawsOn(when: string, section: string): boolean {
    const s = String(when || '');
    if (s.includes(`webviewSection == '${section}'`)) { return true; }
    const m = /webviewSection =~ \/([^/]+)\//.exec(s);
    if (!m) { return false; }
    try { return new RegExp(m[1]).test(section); } catch { return false; }
}

/**
 * Every kind of row the catalogue draws a menu on.
 *
 * The regex spellings are expanded rather than split on `|`: a family is
 * written either as `^(a|b)$` or as `^afConsole(Session|Resumable)$`, and
 * splitting the second one yields "Session", which is not a section at all.
 */
export function ctxSections(): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (name: string) => { if (!seen.has(name)) { seen.add(name); out.push(name); } };
    for (const item of CTX_ITEMS) {
        const eq = /webviewSection == '([^']+)'/.exec(item.when);
        if (eq) { add(eq[1]); continue; }
        const re = /webviewSection =~ \/([^/]+)\//.exec(item.when);
        if (re) { expandPattern(re[1]).forEach(add); }
    }
    return out.sort();
}

/** `^afConsole(Session|Resumable)$` → the two names it really matches. */
function expandPattern(pattern: string): string[] {
    let out = [''];
    const part = /\(([^)]*)\)|([^(]+)/g;
    let m;
    while ((m = part.exec(pattern))) {
        const alts = m[1] !== undefined ? m[1].split('|') : [m[2]];
        const grown: string[] = [];
        for (const head of out) { for (const alt of alts) { grown.push(head + alt); } }
        out = grown;
    }
    return out.map(s => s.replace(/[\^$]/g, '')).filter(s => /^af\w+$/.test(s));
}

/**
 * What a right-click offers on one kind of row.
 *
 * ‼️ THIS IS THE ANSWER TO "WHAT CAN BE DONE TO THIS THING". The catalogue is
 * the only place that knows, and an agent asked to work a page has exactly the
 * same question a person right-clicking does. `titleOf` supplies the words for
 * a host command — those live in `contributes.commands`, not here.
 */
export function ctxForSection(
    section: string, titleOf: (command: string) => string
): { title: string; command: string; when: string; group: string; menu?: string }[] {
    const subLabel = new Map(CTX_SUBMENUS.map(s => [s.id, s.label]));
    return CTX_ITEMS
        .filter(i => ctxDrawsOn(i.when, section))
        .map(i => ({
            title: i.title || titleOf(i.command || '') || i.command || '',
            command: ctxCommandId(i),
            when: i.when,
            group: i.group,
            ...(i.menu ? { menu: subLabel.get(i.menu) || i.menu } : {})
        }))
        .sort((a, b) => a.group.localeCompare(b.group));
}

/** Every page action, as the host needs to register it. */
export function ctxRelays(): { command: string; act: string; title: string }[] {
    const seen = new Set<string>();
    const out: { command: string; act: string; title: string }[] = [];
    for (const item of CTX_ITEMS) {
        if (!item.id || !item.act) { continue; }
        const command = CTX_PREFIX + item.id;
        if (seen.has(command)) { continue; }
        seen.add(command);
        out.push({ command, act: item.act, title: item.title || item.id });
    }
    return out;
}

/** The `contributes.commands` entries the catalogue owns. */
export function ctxCommandContributions(): { command: string; title: string; category: string }[] {
    return ctxRelays().map(r => ({ command: r.command, title: r.title, category: 'Agent Farm' }));
}

/** The `contributes.submenus` entries the catalogue owns. */
export function ctxSubmenuContributions(): { id: string; label: string }[] {
    return CTX_SUBMENUS.map(s => ({ id: s.id, label: s.label }));
}

interface MenuEntry { command?: string; submenu?: string; when?: string; group: string }

/**
 * Every `contributes.menus` list the catalogue owns, keyed by menu id: the
 * webview context menu itself, plus one list per submenu. A submenu's arrow is
 * an entry in the parent menu — that is what `CTX_SUBMENUS` carries a `group`
 * and a `when` for.
 */
export function ctxMenuContributions(): Record<string, MenuEntry[]> {
    const out: Record<string, MenuEntry[]> = { 'webview/context': [] };
    for (const s of CTX_SUBMENUS) {
        out[s.id] = [];
        out['webview/context'].push({ submenu: s.id, when: s.when, group: s.group });
    }
    for (const item of CTX_ITEMS) {
        const command = ctxCommandId(item);
        if (!command) { continue; }
        const menu = item.menu || 'webview/context';
        (out[menu] = out[menu] || []).push({ command, when: item.when, group: item.group });
    }
    return out;
}

/** Commands the catalogue mints must never reach the command palette. */
export function ctxPaletteHiding(): MenuEntry[] {
    return ctxRelays().map(r => ({ command: r.command, when: 'false', group: 'ctx' }));
}

/**
 * What is wrong with the catalogue itself — checked by the test, so a bad entry
 * fails at build time instead of drawing a menu item that does nothing.
 */
export function ctxProblems(): string[] {
    const problems: string[] = [];
    const ids = new Set<string>();
    const seats = new Set<string>();
    const subIds = new Set(CTX_SUBMENUS.map(s => s.id));
    for (const s of CTX_SUBMENUS) {
        if (!s.id.startsWith(CTX_PREFIX)) { problems.push(`submenu id must start with ${CTX_PREFIX}: ${s.id}`); }
        if (!s.label) { problems.push(`submenu has no label: ${s.id}`); }
        if (!s.when) { problems.push(`submenu ${s.id}: no when clause — an empty arrow on every row`); }
        if (!/^\d_[a-z]+@\d+$/.test(s.group)) { problems.push(`submenu ${s.id}: group must look like 5_copy@9, got ${s.group}`); }
        if (subIds.has(s.id) && CTX_SUBMENUS.filter(x => x.id === s.id).length > 1) {
            problems.push(`duplicate submenu id: ${s.id}`);
        }
        const seat = `webview/context|${s.when}|${s.group}`;
        if (seats.has(seat)) { problems.push(`submenu ${s.id}: two items share ${s.group} on the same rows`); }
        seats.add(seat);
        if (!CTX_ITEMS.some(i => i.menu === s.id)) { problems.push(`submenu ${s.id} has no items`); }
    }
    for (const item of CTX_ITEMS) {
        const where = item.command || item.id || '(nameless)';
        if (!item.command && !item.id) { problems.push('item has neither command nor id'); continue; }
        if (item.command && item.id) { problems.push(`${where}: a host command cannot also be a page action`); }
        if (item.id) {
            if (!item.title) { problems.push(`${where}: a page action needs a title`); }
            if (!item.act) { problems.push(`${where}: a page action needs an act`); }
            if (ids.has(item.id)) { problems.push(`${where}: duplicate page-action id`); }
            ids.add(item.id);
        }
        if (!item.when) { problems.push(`${where}: no when clause — it would show on every row`); }
        if (!/^\d_[a-z]+@\d+$/.test(item.group)) { problems.push(`${where}: group must look like 2_edit@3, got ${item.group}`); }
        if (item.menu && !subIds.has(item.menu)) { problems.push(`${where}: unknown submenu ${item.menu}`); }
        // Two items in one seat is how an item goes missing without anyone
        // noticing: VS Code draws them in an undefined order.
        const seat = `${item.menu || 'webview/context'}|${item.when}|${item.group}`;
        if (seats.has(seat)) { problems.push(`${where}: two items share ${item.group} on the same rows`); }
        seats.add(seat);
    }
    return problems;
}
