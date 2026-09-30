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
        }
    };
}
