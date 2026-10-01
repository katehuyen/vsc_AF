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
        }
    };
}
