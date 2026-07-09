import * as fs from 'fs';
import * as vscode from 'vscode';
import { readMediaMetas } from '../core/media';
import { TaskManager } from '../core/tasks';
import { htmlShell } from './base';

export interface GalleryDeps {
    extensionUri: vscode.Uri;
    tasks: TaskManager;
}

function buildData(deps: GalleryDeps, webview: vscode.Webview): Record<string, unknown> {
    const metas = readMediaMetas(deps.tasks.outputsDir).slice(0, 200);
    return {
        totalCost: metas.reduce((a, m) => a + (m.estCost || 0), 0),
        items: metas.map(m => {
            const asset = m.assetFiles.find(f => fs.existsSync(f));
            const ext = asset ? asset.split('.').pop()!.toLowerCase() : '';
            return {
                taskId: m.taskId,
                title: m.title,
                model: m.model,
                input: m.input,
                estCost: m.estCost,
                ts: m.ts,
                workflowTitle: m.workflowTitle,
                assetPath: asset,
                assetUri: asset ? webview.asWebviewUri(vscode.Uri.file(asset)).toString() : undefined,
                kind: ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) ? 'image'
                    : ['mp4', 'webm', 'mov'].includes(ext) ? 'video'
                        : ['mp3', 'wav', 'ogg'].includes(ext) ? 'audio' : 'file'
            };
        })
    };
}

export class GalleryPanel {
    private static current: GalleryPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    static show(deps: GalleryDeps): void {
        if (GalleryPanel.current) {
            GalleryPanel.current.panel.reveal();
            GalleryPanel.current.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.gallery',
            'Agent Farm — Media Gallery',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(deps.extensionUri, 'media'),
                    vscode.Uri.file(deps.tasks.outputsDir)
                ]
            }
        );
        GalleryPanel.current = new GalleryPanel(panel, deps);
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: GalleryDeps) {
        this.render();
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => this.onMessage(msg), null, this.disposables);
        this.deps.tasks.onDidChange(() => this.refresh(), null, this.disposables);
    }

    private render(): void {
        this.panel.webview.html = htmlShell(
            this.panel.webview,
            this.deps.extensionUri,
            'Media Gallery',
            buildData(this.deps, this.panel.webview),
            'gallery.js'
        );
    }

    refresh(): void {
        this.panel.webview.postMessage({ type: 'data', data: buildData(this.deps, this.panel.webview) });
    }

    private onMessage(msg: { type: string; [k: string]: unknown }): void {
        switch (msg.type) {
            case 'openAsset':
                if (typeof msg.path === 'string' && msg.path) {
                    void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(msg.path));
                }
                break;
            case 'rerun':
                void vscode.commands.executeCommand('agentfarm.rerunMedia', msg.taskId, false);
                break;
            case 'vary':
                void vscode.commands.executeCommand('agentfarm.rerunMedia', msg.taskId, true);
                break;
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', msg.anchor);
                break;
        }
    }

    private dispose(): void {
        GalleryPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
