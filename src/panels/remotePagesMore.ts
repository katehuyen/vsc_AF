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
}

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
        }
    };
}
