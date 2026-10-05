import * as path from 'path';
import * as vscode from 'vscode';
import { selectionRefusal, type OpenSelection, type SelectionWaits } from '../core/selectionWaits';
import { htmlShell } from './base';
import { desktopHost, type PanelHost } from './panelHost';

/**
 * Wave B — visual selection picker: a webview where the user keeps a subset of
 * candidate assets (min..max). Its Keep / Cancel settle the step's entry in
 * `waits` — the same entry workflows.select settles. The PC's tab closes as soon
 * as that entry is answered on any door, and closing it unanswered cancels.
 * X-456 — a phone's view is told the answer instead, and leaving it cancels nothing.
 */
export class SelectionPanel {
    static pick(extensionUri: vscode.Uri, req: OpenSelection, waits: SelectionWaits, answered: Promise<unknown>): void {
        const roots = new Set<string>();
        for (const c of req.candidates) { if (c.file) { roots.add(path.dirname(c.file)); } }
        const host = desktopHost({
            viewType: 'agentfarm.selection',
            title: `Pick — ${req.title}`.slice(0, 50),
            options: {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                    ...[...roots].map(d => vscode.Uri.file(d))
                ]
            }
        });
        SelectionPanel.draw(host, extensionUri, req, waits, answered);
    }

    /** X-456 — an open selection on a phone: `id`, or the one asked first; false when none is open. */
    static openOn(host: PanelHost, extensionUri: vscode.Uri, waits: SelectionWaits, id?: string): boolean {
        const req = id ? waits.get(id) : waits.list()[0];
        const answered = req && waits.whenAnswered(req.id);
        if (!req || !answered) { return false; }
        SelectionPanel.draw(host, extensionUri, req, waits, answered);
        return true;
    }

    private static draw(host: PanelHost, extensionUri: vscode.Uri, req: OpenSelection, waits: SelectionWaits, answered: Promise<unknown>): void {
        const data = {
            title: req.title,
            message: req.message,
            min: req.min,
            max: req.max ?? 0,
            candidates: req.candidates.map(c => ({
                url: c.url,
                title: c.title,
                kind: c.kind,
                // Prefer the local preview (a phone's view gives it a token of its own); fall back to the remote URL.
                src: c.file
                    ? host.webview.asWebviewUri(vscode.Uri.file(c.file)).toString()
                    : c.url
            }))
        };
        host.webview.html = htmlShell(host.webview, extensionUri, 'Select assets', data, 'selection.js');

        let open = true;
        host.webview.onDidReceiveMessage((msg: { type: string; urls?: unknown[] }) => {
            if (msg.type === 'confirm' && Array.isArray(msg.urls)) {
                const urls = msg.urls.map(String);
                // the step's own rule, as workflows.select holds it — a phone's message comes over the network
                const refused = selectionRefusal(req, urls);
                if (refused) { void host.webview.postMessage({ type: 'refused', text: refused }); return; }
                waits.settle(req.id, urls);
            } else if (msg.type === 'cancel') {
                waits.settle(req.id, null);
            }
        });
        host.onDidDispose(() => { open = false; if (!host.remote) { waits.settle(req.id, null); } });
        void answered.then(() => {
            if (!open) { return; }
            if (host.remote) { void host.webview.postMessage({ type: 'answered' }); } else { host.dispose(); }
        });
    }
}
