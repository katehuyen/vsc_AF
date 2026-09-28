import * as path from 'path';
import * as vscode from 'vscode';
import type { OpenSelection, SelectionWaits } from '../core/selectionWaits';
import { htmlShell } from './base';

/**
 * Wave B — visual selection picker: a webview where the user keeps a subset of
 * candidate assets (min..max). Its Keep / Cancel settle the step's entry in
 * `waits` — the same entry workflows.select settles — and it closes as soon as
 * that entry is answered on either door. Closing it unanswered cancels.
 */
export class SelectionPanel {
    static pick(extensionUri: vscode.Uri, req: OpenSelection, waits: SelectionWaits, answered: Promise<unknown>): void {
        const roots = new Set<string>();
        for (const c of req.candidates) { if (c.file) { roots.add(path.dirname(c.file)); } }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.selection',
            `Pick — ${req.title}`.slice(0, 50),
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

        let open = true;
        panel.webview.onDidReceiveMessage((msg: { type: string; urls?: string[] }) => {
            if (msg.type === 'confirm' && Array.isArray(msg.urls)) { waits.settle(req.id, msg.urls); }
            else if (msg.type === 'cancel') { waits.settle(req.id, null); }
        });
        panel.onDidDispose(() => { open = false; waits.settle(req.id, null); });
        void answered.then(() => { if (open) { panel.dispose(); } });
    }
}
