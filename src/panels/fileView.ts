import * as path from 'path';
import * as vscode from 'vscode';
import type { EditedFileView } from '../core/editedFile';
import { htmlShell } from './base';
import type { PanelHost } from './panelHost';

export interface FileViewDeps {
    extensionUri: vscode.Uri;
    /** console.file.read's own body: the file on disk now, and its diff against HEAD when asked */
    readEdited(file: string, diff: boolean): Promise<EditedFileView>;
}

/**
 * X-443 — A FILE AN AGENT WROTE, READ-ONLY, ON THE PHONE. The phone's answer to a Console card's
 * ✎ open and vs HEAD chips, which open the editor on the PC (agentfarm.openEditedFile). The target
 * was already checked against the files the cards name (editedFileTarget); the page can only switch
 * between the file and its diff and read it again — it never names another path.
 */
export class FileViewPanel {
    static openOn(host: PanelHost, target: { file: string; diff: boolean }, deps: FileViewDeps): void {
        let diff = target.diff;
        const name = path.basename(target.file);
        host.title = name;
        host.webview.html = htmlShell(host.webview, deps.extensionUri, name, { file: target.file, name, diff }, 'fileView.js');
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
                    diff = m.diff === true;
                    show(diff, deps.readEdited(target.file, diff));
                    break;
            }
        });
    }
}
