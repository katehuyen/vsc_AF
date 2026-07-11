import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import { assetKind, readMediaMetas, updateMediaMeta } from '../core/media';
import { discoverProductions, SCENE_STATUSES, sceneMatrix, SceneStatus, setSceneStatus, writeProduction } from '../core/production';
import { TaskManager } from '../core/tasks';
import { htmlShell } from './base';

export interface GalleryDeps {
    extensionUri: vscode.Uri;
    tasks: TaskManager;
    /** Wave A: productions are discovered from the agents' folders. */
    getAgents(): AgentInfo[];
}

function buildData(deps: GalleryDeps, webview: vscode.Webview): Record<string, unknown> {
    const metas = readMediaMetas(deps.tasks.outputsDir).slice(0, 200);
    const productions = discoverProductions(deps.getAgents());
    return {
        totalCost: metas.reduce((a, m) => a + (m.estCost || 0), 0),
        productions: productions.map(p => ({
            id: p.production.id,
            title: p.production.title,
            agentName: p.agentName,
            scenes: p.production.scenes.map(s => ({ id: s.id, title: s.title, status: s.status })),
            matrix: sceneMatrix(p.production, metas)
        })),
        items: metas.map(m => {
            const asset = m.assetFiles.find(f => fs.existsSync(f));
            return {
                taskId: m.taskId,
                title: m.title,
                model: m.model,
                input: m.input,
                estCost: m.estCost,
                ts: m.ts,
                workflowTitle: m.workflowTitle,
                projectId: m.projectId,
                sceneId: m.sceneId,
                source: m.source ?? (m.model === 'external' ? 'external' : 'fal'),
                selectedCount: m.selectedUrls?.length ?? 0,
                rejectedCount: m.rejectedUrls?.length ?? 0,
                assetPath: asset,
                assetUri: asset ? webview.asWebviewUri(vscode.Uri.file(asset)).toString() : undefined,
                kind: asset ? assetKind(asset) : 'file'
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
        // External (ingested) assets are referenced in place, outside the outputs
        // dir — the webview may only load from listed roots, so allow every
        // directory that currently holds a gallery asset.
        const assetDirs = new Set<string>([deps.tasks.outputsDir]);
        for (const m of readMediaMetas(deps.tasks.outputsDir)) {
            for (const f of m.assetFiles) { assetDirs.add(path.dirname(f)); }
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
                    ...[...assetDirs].map(d => vscode.Uri.file(d))
                ]
            }
        );
        GalleryPanel.current = new GalleryPanel(panel, deps);
    }

    static refreshIfOpen(): void {
        GalleryPanel.current?.refresh();
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: GalleryDeps) {
        this.render();
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables);
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

    /** QuickPick a production scene; returns the assignment or null when cleared. */
    private async pickScene(): Promise<{ projectId: string; sceneId?: string } | null | undefined> {
        const productions = discoverProductions(this.deps.getAgents());
        if (!productions.length) {
            void vscode.window.showInformationMessage(
                'Agent Farm: no production.json found in any agent folder — create one with "Agent Farm: New Production".');
            return undefined;
        }
        interface Pick extends vscode.QuickPickItem { projectId?: string; sceneId?: string; clear?: boolean }
        const items: Pick[] = [];
        for (const p of productions) {
            items.push({ label: `$(project) ${p.production.title}`, description: `${p.agentName} — project only`, projectId: p.production.id });
            for (const s of p.production.scenes) {
                items.push({ label: `    $(circle-small) ${s.title}`, description: `${p.production.title} · ${s.status}`, projectId: p.production.id, sceneId: s.id });
            }
        }
        items.push({ label: '$(clear-all) Clear assignment', description: 'detach from any production/scene', clear: true });
        const pick = await vscode.window.showQuickPick(items, {
            placeHolder: 'Assign asset to a production scene', ignoreFocusOut: true
        });
        if (!pick) { return undefined; }
        return pick.clear ? null : { projectId: pick.projectId!, sceneId: pick.sceneId };
    }

    private async onMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
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
            case 'assign': {
                if (typeof msg.taskId !== 'string') { break; }
                const target = await this.pickScene();
                if (target === undefined) { break; }
                updateMediaMeta(this.deps.tasks.outputsDir, msg.taskId,
                    target === null
                        ? { projectId: undefined, sceneId: undefined }
                        : { projectId: target.projectId, sceneId: target.sceneId });
                this.refresh();
                break;
            }
            case 'setSceneStatus': {
                if (typeof msg.projectId !== 'string' || typeof msg.sceneId !== 'string') { break; }
                const found = discoverProductions(this.deps.getAgents())
                    .find(p => p.production.id === msg.projectId);
                if (!found) { break; }
                const status = await vscode.window.showQuickPick(SCENE_STATUSES as readonly string[] as string[], {
                    placeHolder: `New status for the scene`, ignoreFocusOut: true
                });
                if (!status) { break; }
                if (setSceneStatus(found.production, msg.sceneId, status as SceneStatus)) {
                    writeProduction(found.file, found.production);
                    this.refresh();
                }
                break;
            }
            case 'newProduction':
                void vscode.commands.executeCommand('agentfarm.newProduction');
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
