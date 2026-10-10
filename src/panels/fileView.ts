import * as path from 'path';
import * as vscode from 'vscode';
import type { EditedFileView } from '../core/editedFile';
import { readsAsProse } from '../core/shownFile';
import { htmlShell } from './base';
import type { PanelHost } from './panelHost';

export interface FileViewDeps {
    extensionUri: vscode.Uri;
    /** console.file.read's own body: the file on disk now, and its diff against HEAD when asked */
    readEdited(file: string, diff: boolean): Promise<EditedFileView>;
}

/**
 * X-443 — A FILE THE FARM SHOWS, READ-ONLY, ON THE PHONE. The phone's answer to every "open this
 * file" that opens the editor on the PC: a Console card's ✎ open and vs HEAD chips, a report, a
 * step's or a task's output, a note's file, a memory file. The target was already found in what the
 * page it came from shows (shownFileTarget); this page only reads it again and — for a file an
 * agent's write tools named (`edits`) — switches between the file and its diff. It never names
 * another path.
 */
export class FileViewPanel {
    static openOn(host: PanelHost, target: { file: string; diff: boolean; edits?: boolean }, deps: FileViewDeps): void {
        const edits = target.edits !== false;
        let diff = edits && target.diff;
        const name = path.basename(target.file);
        host.title = name;
        host.webview.html = htmlShell(host.webview, deps.extensionUri, name,
            { file: target.file, name, diff, edits, prose: readsAsProse(target.file) }, 'fileView.js');
        // an answer for a mode the page has already left is dropped
        const show = (asked: boolean, view: Promise<EditedFileView>): void => {
            void view.then(v => { if (asked === diff) { void host.webview.postMessage({ type: 'view', diff: asked, view: v }); } });
        };
        host.webview.onDidReceiveMessage((m: { type?: string; diff?: unknown }) => {
            switch (m?.type) {
                case 'refresh':
                    show(diff, deps.readEdited(target.file, diff));
                    break;
                case 'mode':
                    diff = edits && m.diff === true;
                    show(diff, deps.readEdited(target.file, diff));
                    break;
            }
        });
    }
}
