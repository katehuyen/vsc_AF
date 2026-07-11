import * as path from 'path';
import * as vscode from 'vscode';
import { htmlShell } from './base';

export interface SelectionCandidate {
    taskId: string;
    title: string;
    url: string;
    file?: string;
    kind: string;
}

export interface SelectionRequest {
    title: string;
    message: string;
    min: number;
    max?: number;
    candidates: SelectionCandidate[];
}

/**
 * Wave B — visual selection picker: a blocking webview where the user keeps a
 * subset of candidate assets (min..max). Resolves with the chosen asset URLs,
 * or null if cancelled / the panel is closed. One panel per call (selection
 * steps run one at a time).
 */
export class SelectionPanel {
    static pick(extensionUri: vscode.Uri, req: SelectionRequest): Promise<string[] | null> {
        return new Promise(resolve => {
            const roots = new Set<string>();
            for (const c of req.candidates) { if (c.file) { roots.add(path.dirname(c.file)); } }
            const panel = vscode.window.createWebviewPanel(
                'agentfarm.selection',
                `Seç — ${req.title}`.slice(0, 50),
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [
                        vscode.Uri.joinPath(extensionUri, 'media'),
                        ...[...roots].map(d => vscode.Uri.file(d))
                    ]
                }
            );

            let settled = false;
            const finish = (result: string[] | null) => {
                if (settled) { return; }
                settled = true;
                resolve(result);
                panel.dispose();
            };

            const data = {
                title: req.title,
                message: req.message,
                min: req.min,
                max: req.max ?? 0,
                candidates: req.candidates.map(c => ({
                    url: c.url,
                    title: c.title,
                    kind: c.kind,
                    // Prefer the local preview; fall back to the remote URL.
                    src: c.file
                        ? panel.webview.asWebviewUri(vscode.Uri.file(c.file)).toString()
                        : c.url
                }))
            };
            panel.webview.html = htmlShell(panel.webview, extensionUri, 'Select assets', data, 'selection.js');

            panel.webview.onDidReceiveMessage((msg: { type: string; urls?: string[] }) => {
                if (msg.type === 'confirm' && Array.isArray(msg.urls)) { finish(msg.urls); }
                else if (msg.type === 'cancel') { finish(null); }
            });
            panel.onDidDispose(() => finish(null));
        });
    }
}
