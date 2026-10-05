import type { PanelHost } from './panelHost';
import type { RemotePage } from './remoteViews';

/** X-456 — the phone's pages past the first screenful of rules; remotePages() spreads these in. */
export interface MorePageMakers {
    engines(host: PanelHost): void;
    accounts(host: PanelHost): void;
    /** `args.focusId` opens one note / task, as the desktop's focus does. */
    a2anotes(host: PanelHost, args?: Record<string, unknown>): void;
    a2atasks(host: PanelHost, args?: Record<string, unknown>): void;
    portfolio(host: PanelHost): void;
    /** `args.doc` names a help document by its key and `args.anchor` a heading; false for any other document. */
    guide(host: PanelHost, args?: Record<string, unknown>): boolean;
    /** `args.focus` opens one mark, as the desktop's focus does. */
    wiki(host: PanelHost, args?: Record<string, unknown>): void;
    toolbox(host: PanelHost): void;
    sound(host: PanelHost): void;
    settings(host: PanelHost): void;
    living(host: PanelHost): void;
    studio(host: PanelHost): void;
    evals(host: PanelHost): void;
    capabilities(host: PanelHost): void;
    airtable(host: PanelHost): void;
    analytics(host: PanelHost): void;
    /** `args.agentId` opens on that agent's memory, as the desktop's show does. */
    memgraph(host: PanelHost, args?: Record<string, unknown>): void;
    /** `args.id` opens that open selection, none the one asked first; false when none is open. */
    selection(host: PanelHost, args?: Record<string, unknown>): boolean;
}

/**
 * X-456 — the sound controls' presses that open the PC's file picker (a new sound) or its folder,
 * refused on every page whose host answers alert messages (src/panels/alertMessages.ts).
 */
export const SOUND_PC = ['alertVoiceAdd', 'alertFolder'];

/**
 * X-456 — the sign-ins section and its rules, the same on the Engines and the Accounts page
 * (media/afAccounts.js, afPolicies.js). A quota reading is the page's look; a sign-in renewed in a
 * PC terminal stays there, and a card's last session reaches the phone as afnav (afRemote.js).
 */
const ACCOUNT_LOOKS = ['refresh', 'accountRefresh'];
const ACCOUNT_PC = ['accountReauth', 'accountOpenSession', 'afnav'];

export function morePages(make: MorePageMakers): Record<string, RemotePage> {
    return {
        // X-456 — the engines, their routes and the sign-ins. accounts, providers, engines and policies
        // are admin namespaces even to look (src/remote/scopes.ts: their reads carry configuration), so
        // the pages ask what their ops ask. A test turn, a route's save, copy and removal, a capture, a
        // switch, the repairs, the forget (asked on the phone) and the rules are the acts. A CLI's
        // terminal, a key typed into the PC's password box or the Secrets page and a docs link stay on
        // the PC.
        engines: {
            open: 'admin', act: 'admin',
            looks: ACCOUNT_LOOKS,
            answers: [],
            pcOnly: ['engineCommand', 'engineKey', 'providerKey', 'engineDocs', ...ACCOUNT_PC],
            make: host => make.engines(host)
        },
        accounts: {
            open: 'admin', act: 'admin',
            looks: ACCOUNT_LOOKS,
            answers: [],
            pcOnly: ACCOUNT_PC,
            make: host => make.accounts(host)
        },
        // X-456 — the A2A boards. Resolving, pinning, deleting, clearing, promoting, the supervisor's word,
        // cancelling, rerouting and Run now are manage; a note's file, a link, a queue item and the other
        // board's tab belong to the PC (on a phone the other board opens there as afnav).
        a2anotes: {
            open: 'read', act: 'manage', looks: ['refresh'], answers: [],
            pcOnly: ['openTask', 'openFile', 'openExternal', 'afnav'],
            make: (host, args) => make.a2anotes(host, args)
        },
        a2atasks: {
            open: 'read', act: 'manage', looks: ['refresh'], answers: [],
            pcOnly: ['openNote', 'openQueueItem', 'openExternal', 'afnav'],
            make: (host, args) => make.a2atasks(host, args)
        },
        // X-456 — the Agents page reads; a session, a project pick, the folder, a new agent (its CLAUDE.md
        // opens in the PC's editor) and the guide are the PC's (an agent's row opens its phone page).
        portfolio: {
            open: 'read', act: 'manage', looks: ['refresh'], answers: [],
            pcOnly: ['openAgent', 'startSession', 'assignProject', 'manageProjects', 'reveal', 'openGuide', 'agent-new', 'afnav'],
            make: host => make.portfolio(host)
        },
        // X-456 — the help. Reading it and switching its language are looks (on a phone the switch
        // redraws that view and leaves the PC's guideLanguage alone); a link is copied to the phone.
        guide: {
            open: 'read', act: 'manage', looks: ['setLang'], answers: [],
            pcOnly: ['openExternal', 'afnav'],
            make: (host, args) => make.guide(host, args)
        },
        // X-456 — the wiki's marks. Compiling, editing, dropping, a new or renamed category (its
        // questions asked on the phone), starting the wiki and the shape check are manage, as their
        // wiki.* ops are. A page, the wiki's own files and folders, a dropped document, the settings
        // and the guide belong to the PC (a mark's transcript reaches the phone as afnav).
        wiki: {
            open: 'read', act: 'manage', looks: ['refresh'], answers: [],
            pcOnly: ['openSession', 'openPage', 'openWikiFile', 'revealWikiPath', 'openSettings', 'openGuide', 'afnav'],
            make: (host, args) => make.wiki(host, args)
        },
        // X-456 — the Toolbox carries the farm's configuration (MCP definitions, the Telegram, web and
        // phone-app services, the hooks), so it asks admin even to look, as those namespaces do. A file
        // or folder on the PC, a link, a skill's scope and the constitution sync (their dialogs), the
        // Telegram token (a secret), the phone app's reach (changing it cuts the phone off) and its
        // firewall prompt, and the PC clipboard stay on the PC.
        toolbox: {
            open: 'admin', act: 'admin', looks: ['refresh', 'mcp-def'], answers: [],
            pcOnly: ['open', 'reveal', 'openExternal', 'skillScope', 'headerAction', 'svc-connect', 'remote-listen',
                'remote-firewall-allow', 'remote-copy-link', 'web-copy', 'openGuide', 'afnav'],
            make: host => make.toolbox(host)
        },
        // X-456 — the alerts. Reading the page, the machine's voices (asked on opening) and a session's
        // sound panel are looks; every switch, tone, voice, rename, removal, ▶ and rehearsal is manage,
        // as the alerts.* ops are, and plays on the PC whose alerts they are. A new sound's file picker,
        // the sounds folder and a channel's setting belong to the PC (another page opens as afnav).
        sound: {
            open: 'read', act: 'manage', looks: ['refresh', 'alertSpeakVoices', 'alertSessionOpen'], answers: [],
            pcOnly: [...SOUND_PC, 'openSettings', 'afnav'],
            make: host => make.sound(host)
        },
        // X-456 — every agentFarm.* setting, Claude Code's own settings and the agent folders: the
        // settings namespace is admin even to look (src/remote/scopes.ts), so the page asks the same.
        // A row, its reset, a setting set (asked on the phone), the Flow & Content card, the Telegram
        // card, the sounds, Kapıcı's tools, the wiki's start, the per-agent defaults and the roots are
        // the acts; the phone's own reach and port are refused there (settingsPhone.ts). Every file and
        // folder picker, an editor, a terminal, the key vault, VS Code's settings, the raw settings.json
        // (it can hold a key and is never sent), the export and import, a folder, another page and a
        // link belong to the PC, with the Telegram token and the sound controls' picker and folder.
        settings: {
            open: 'admin', act: 'admin',
            looks: ['refresh', 'promptsReload', 'wikiRescan', 'spRescan', 'agentDefaultsEngine', 'alertSpeakVoices'],
            answers: [],
            pcOnly: ['browse', 'browseRow', 'promptsPick', 'promptsOpen', 'openSettingsUi', 'openSettingsJson',
                'engineCommand', 'engineKey', 'engineDocs', 'openEngines', 'openAccounts', 'openSecrets',
                'exportProfiles', 'importProfiles', 'ccRaw', 'ccOpenFile', 'rootAdd', 'rootReveal', 'wikiReveal',
                'wikiOpen', 'spReveal', 'openAgent', 'openGuide', 'afnav', 'svc-connect', ...SOUND_PC],
            make: host => make.settings(host)
        },
        // X-456 — "is the system alive today?". Its bridge ops (living.pulse, living.checks,
        // living.check.add / .remove) ask manage, so the page asks the same to look and to save the
        // checks. A signal's arrow is the header's own page link, so on a phone it opens that page
        // there; the file picker, settings.json, the guide's tab and another page belong to the PC.
        living: {
            open: 'manage', act: 'manage', looks: ['refresh'], answers: [],
            pcOnly: ['af-browse', 'openSettingsJson', 'openGuide', 'afnav'],
            make: host => make.living(host)
        },
        // X-456 — the content production page. Its bridge ops (studio.productions, studio.assets,
        // studio.library, studio.rerun …) ask manage, so the page asks the same to look and to act;
        // a tab, a production and the wall's filter only change what this view shows. Its pictures
        // and clips reach the phone by the view's own tokens (remoteFiles.ts); an export is written
        // to a file picked on the PC (told on the phone). Opening a file, a new recipe, registering a
        // file, the vary / feedback commands (they open the PC's Studio), a setting, the guide's tab
        // and another page belong to the PC.
        studio: {
            open: 'manage', act: 'manage', looks: ['refresh', 'tab', 'project', 'libraryView'], answers: [],
            pcOnly: ['openAsset', 'openFile', 'generate', 'registerAsset', 'vary', 'feedback', 'openSettings', 'openGuide', 'afnav'],
            make: host => make.studio(host)
        },
        // X-456 — an agent's regression cases and its runs. The runs it shows ask manage over the
        // bridge (evals.runs), as a new case and a delete do (evals.add, evals.delete), so the page
        // asks the same to look and to act; switching the agent only changes what this view shows.
        // A run is confirmed and told on the phone (evalsRun.ts). The A/B ends in the PC's report and
        // may rewrite the agent's CLAUDE.md, so it stays on the PC with the file picker, the guide's
        // tab and another page.
        evals: {
            open: 'manage', act: 'manage', looks: ['refresh', 'ev-agent'], answers: [],
            pcOnly: ['ev-ab', 'af-browse', 'openGuide', 'afnav'],
            make: host => make.evals(host)
        },
        // X-456 — who has which skill, MCP server, memory file and duty, and what is used. The same
        // inventory reads at read over the bridge (toolbox.list), so the page opens there; a copy onto
        // an agent (its source picked and confirmed on the phone) is manage, as toolbox.copy,
        // toolbox.enable, memory.copy and duties.add are. A file in the PC's editor, the task history,
        // the guide's tab and another page belong to the PC.
        capabilities: {
            open: 'read', act: 'manage', looks: ['refresh'], answers: [],
            pcOnly: ['open', 'openTaskHistory', 'openGuide', 'afnav'],
            make: host => make.capabilities(host)
        },
        // X-456 — the Airtable Engine module. Opening it probes the live instances, which asks manage
        // over the bridge (airtable.instances), so the page asks the same to look and to act: a
        // folder's removal, a default, the MCP registration (its questions asked on the phone), a
        // tools probe and an instance's start, as the airtable.* ops are. A folder is added with the
        // PC's folder picker; the engine's own web panel, a folder, the config file, the guide's tab
        // and another page belong to the PC.
        airtable: {
            open: 'manage', act: 'manage', looks: ['refresh'], answers: [],
            pcOnly: ['add-root', 'add-media', 'open-ui', 'reveal', 'open-config', 'openGuide', 'afnav'],
            make: host => make.airtable(host)
        },
        // X-456 — 30 days of task throughput, scorecards, families and the forecast. The forecast asks
        // manage over the bridge (schedules.forecast), so the page asks the same to look; it has no act
        // of its own on a phone. The spend by sign-in is the Accounts' data (admin on a phone), so a
        // phone's view is built without it. The task history, the full forecast, the Tasks page (the
        // header's own link reaches it on a phone), a Markdown export, the guide and another page
        // belong to the PC.
        analytics: {
            open: 'manage', act: 'manage', looks: ['refresh'], answers: [],
            pcOnly: ['open-history', 'open-forecast', 'open-tasks', 'export-md', 'openGuide', 'afnav'],
            make: host => make.analytics(host)
        },
        // X-456 — every agent's memory as a graph. What it draws includes the index repair plan and the
        // shared files, which ask manage over the bridge (memory.index.plan, memory.duplicates), so the
        // page asks the same to look and to act: a new memory, a copy, an index repair, a fleet question
        // and a sync (its overwrite asked on the phone), as the memory.* ops are. A file in the PC's
        // editor, a distillation (it ends in the PC's diff editor, so a phone's view is built without
        // it), a comparison and a merge draft (refused in the panel), the guide and another page belong
        // to the PC.
        memgraph: {
            open: 'manage', act: 'manage', looks: ['refresh'], answers: [],
            pcOnly: ['open', 'mem-distill', 'openGuide', 'afnav'],
            make: (host, args) => make.memgraph(host, args)
        },
        // X-456 — a workflow's select step: keep some of the candidate assets, or cancel the step. Both
        // settle the same wait workflows.select settles, which asks manage over the bridge, so the page
        // asks the same to look (its pictures and clips reach the phone by the view's own tokens) and to
        // act. A phone's choice meets the step's own rule there; leaving the view cancels nothing, and
        // an answer from another door is told on the phone.
        selection: {
            open: 'manage', act: 'manage', looks: [], answers: [], pcOnly: [],
            make: (host, args) => make.selection(host, args)
        }
    };
}
