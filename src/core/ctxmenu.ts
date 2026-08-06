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

/** Where a session's own menu is shown — one section per surface family. */
const SESSION_ROW = "webviewSection == 'afSessionRow'";
const CONSOLE_ANY = 'webviewSection =~ /^afConsole(Session|Resumable)$/';
const CONSOLE_RESUMABLE = "webviewSection == 'afConsoleResumable'";
const CONSOLE_LIVE = "webviewSection == 'afConsoleSession'";
const TIMELINE_SESSION = "webviewSection == 'afTimelineSession'";

/** The Projects page's own objects. */
const BACKLOG_ROW = "webviewSection == 'afBacklogRow'";
const PLAN_ITEM = "webviewSection == 'afPlanItem'";
const DOC_ROW = "webviewSection == 'afDocRow'";
const PROJECT_ROW = "webviewSection == 'afProjectRow'";
const FEED_EVENT = "webviewSection == 'afFeedEvent'";

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
    { id: CTX_PREFIX + 'planOpenWith', label: 'Open the plan with', group: '1_open@2', when: PLAN_ITEM },
    { id: CTX_PREFIX + 'docOpenWith', label: 'Open with', group: '1_open@2', when: DOC_ROW },
    { id: CTX_PREFIX + 'projCopy', label: 'Copy', group: '5_copy@1', when: PROJECT_ROW }
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
    { command: 'agentfarm.dismissSession', when: SESSION_ROW, group: '3_stop@3' },
    { command: 'agentfarm.assignSessionProject', when: SESSION_ROW, group: '4_project@1' },
    { command: 'agentfarm.projectFromSession', when: SESSION_ROW, group: '4_project@2' },
    { command: 'agentfarm.addSessionFolderToProject', when: SESSION_ROW, group: '4_project@3' },

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
    { command: 'agentfarm.focusSessionTerminal', when: CONSOLE_RESUMABLE, group: '1_session@8' },
    { command: 'agentfarm.consoleInterruptTurn', when: CONSOLE_LIVE, group: '2_run@1' },
    { command: 'agentfarm.consoleEndSession', when: CONSOLE_LIVE, group: '2_run@2' },
    { command: 'agentfarm.consoleForgetSession', when: CONSOLE_LIVE, group: '2_run@3' },

    // ---------------------------------------------------------------------
    // The Live Timeline's lanes and cards.
    // ---------------------------------------------------------------------
    { command: 'agentfarm.renameSession', when: TIMELINE_SESSION, group: '1_session@1' },
    { command: 'agentfarm.openSession', when: TIMELINE_SESSION, group: '1_session@2' },
    { command: 'agentfarm.focusSessionTerminal', when: TIMELINE_SESSION, group: '1_session@3' },
    { command: 'agentfarm.pinSession', when: TIMELINE_SESSION, group: '1_session@4' },
    { command: 'agentfarm.tagSession', when: TIMELINE_SESSION, group: '1_session@5' },
    { command: 'agentfarm.copySessionId', when: TIMELINE_SESSION, group: '1_session@6' },
    { command: 'agentfarm.resumeInConsole', when: TIMELINE_SESSION, group: '1_session@7' },
    { command: 'agentfarm.resumeSession', when: TIMELINE_SESSION, group: '1_session@8' },
    { command: 'agentfarm.interruptSession', when: TIMELINE_SESSION, group: '2_stop@1' },
    { command: 'agentfarm.endSession', when: TIMELINE_SESSION, group: '2_stop@2' },
    { command: 'agentfarm.dismissSession', when: TIMELINE_SESSION, group: '2_stop@3' },

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
    ...picker(CTX_PREFIX + 'blCopy', BACKLOG_ROW, 'blCopy', [
        ['code', 'The code — quote it at an agent'],
        ['text', 'The words'],
        ['both', 'Code and words']
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
    }
];

/** The command a catalogue item invokes. */
export function ctxCommandId(item: CtxItem): string {
    return item.command || (item.id ? CTX_PREFIX + item.id : '');
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
