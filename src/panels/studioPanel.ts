import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import { assetKind, mediaCandidates, MediaMeta, readMediaMetas, updateMediaMeta } from '../core/media';
import {
    discoverProductions, sceneMatrix, SCENE_STATUSES, SceneStatus, setSceneStatus, writeProduction
} from '../core/production';
import { pickSequenceAssets } from '../core/premiere';
import { buildStudio, pipelineSummary } from '../core/studio';
import { TaskManager } from '../core/tasks';
import { handleAfNav, htmlShell } from './base';

/**
 * Studio — the content production page.
 *
 * One surface for what used to be four: the scene manifest (production), the
 * asset wall (gallery), the sequence export (premiere) and the machinery that
 * makes and ingests assets (providers, watched folders, budget). The page is
 * organised as the pipeline itself, not as the modules underneath it:
 *
 *   Pipeline · Assets · Triage · Assemble · Sources
 *
 * The host stays thin: every action here is an existing command, so this page
 * adds a place to stand, not a second implementation of anything.
 */

export interface StudioDeps {
    extensionUri: vscode.Uri;
    tasks: TaskManager;
    getAgents(): AgentInfo[];
    /** watched ingest folders (agentFarm.ingestFolders) */
    ingestFolders(): { path?: string; agent?: string }[];
    /** monthly media budget, 0 = none */
    mediaBudget(): number;
    /** which provider keys are present in the vault (never the keys themselves) */
    providerKeys(): { fal: boolean; replicate: boolean };
}

export class StudioPanel {
    private static current?: StudioPanel;
    private disposables: vscode.Disposable[] = [];
    private tab = 'pipeline';
    private project = '';

    static show(deps: StudioDeps, opts?: { tab?: string; projectId?: string }): void {
        if (StudioPanel.current) {
            StudioPanel.current.panel.reveal();
            if (opts?.tab) { StudioPanel.current.tab = opts.tab; }
            if (opts?.projectId) { StudioPanel.current.project = opts.projectId; }
            StudioPanel.current.refresh();
            return;
        }
        // Ingested assets live outside the outputs folder and a webview may only
        // load from listed roots — allow every directory that currently holds one.
        const assetDirs = new Set<string>([deps.tasks.outputsDir]);
        for (const m of readMediaMetas(deps.tasks.outputsDir)) {
            for (const f of m.assetFiles) { assetDirs.add(path.dirname(f)); }
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.studio', 'Studio', vscode.ViewColumn.One,
            {
                enableScripts: true, retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(deps.extensionUri, 'media'),
                    ...[...assetDirs].map(d => vscode.Uri.file(d))
                ]
            });
        StudioPanel.current = new StudioPanel(panel, deps);
        if (opts?.tab) { StudioPanel.current.tab = opts.tab; }
        if (opts?.projectId) { StudioPanel.current.project = opts.projectId; }
        StudioPanel.current.refresh();
    }

    /** Media runs finish in the background — keep an open page current. */
    static refreshIfOpen(): void {
        StudioPanel.current?.refresh();
    }

    private constructor(private panel: vscode.WebviewPanel, private deps: StudioDeps) {
        panel.webview.html = htmlShell(panel.webview, deps.extensionUri, 'Studio', this.data(), 'studio.js');
        panel.webview.onDidReceiveMessage(m => void this.onMessage(m), null, this.disposables);
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    private metas(): MediaMeta[] {
        return readMediaMetas(this.deps.tasks.outputsDir).slice(0, 400);
    }

    private uriOf(file?: string): string | undefined {
        if (!file || !fs.existsSync(file)) { return undefined; }
        return this.panel.webview.asWebviewUri(vscode.Uri.file(file)).toString();
    }

    private data(): Record<string, unknown> {
        const metas = this.metas();
        const found = discoverProductions(this.deps.getAgents());
        const state = buildStudio({
            productions: found.map(p => ({ agentName: p.agentName, file: p.file, production: p.production })),
            metas,
            now: Date.now(),
            budgetMonth: this.deps.mediaBudget()
        });
        if (this.project && !state.productions.some(p => p.id === this.project)) { this.project = ''; }
        if (!this.project && state.productions.length) { this.project = state.productions[0].id; }
        const current = state.productions.find(p => p.id === this.project);
        const currentDef = found.find(p => p.production.id === this.project);

        const withUri = <T extends { file?: string }>(a: T) =>
            ({ ...a, uri: this.uriOf(a.file) });

        // Assets tab: every meta, as the wall used to show them.
        const items = metas.map(m => {
            const asset = m.assetFiles.find(f => fs.existsSync(f));
            return {
                taskId: m.taskId, title: m.title, model: m.model, input: m.input,
                estCost: m.estCost, ts: m.ts, workflowTitle: m.workflowTitle,
                projectId: m.projectId, sceneId: m.sceneId,
                source: m.source ?? (m.model === 'external' ? 'external' : 'fal'),
                selectedCount: m.selectedUrls?.length ?? 0,
                rejectedCount: m.rejectedUrls?.length ?? 0,
                assetPath: asset, assetUri: this.uriOf(asset),
                kind: asset ? assetKind(asset) : 'file'
            };
        });

        return {
            generatedAt: Date.now(),
            tab: this.tab,
            project: this.project,
            productions: state.productions.map(p => ({
                ...p,
                summary: pipelineSummary(p),
                scenes: p.scenes.map(s => ({ ...s, thumbs: s.thumbs.map(withUri) })),
                unassigned: p.unassigned.map(withUri),
                // the matrix the old gallery drew, kept for the counts row
                matrix: currentDef && currentDef.production.id === p.id
                    ? sceneMatrix(currentDef.production, metas) : []
            })),
            loose: state.loose.map(withUri),
            untriaged: state.untriaged.map(withUri),
            cost: state.cost,
            items,
            // Assemble: exactly the clips the export would use, in order.
            sequence: currentDef
                ? pickSequenceAssets(currentDef.production, metas).map(c => ({
                    name: c.name, sceneTitle: c.sceneTitle, kind: c.kind,
                    uri: this.uriOf(c.file), file: c.file
                }))
                : [],
            // Sources: who can generate, what is watched, what it costs.
            providers: this.deps.providerKeys(),
            ingestFolders: this.deps.ingestFolders().map(f => ({
                path: f.path ?? '', agent: f.agent ?? '',
                exists: !!f.path && fs.existsSync(f.path)
            })),
            candidates: mediaCandidates(metas.filter(m =>
                !(m.selectedUrls?.length) && !(m.rejectedUrls?.length))).length
        };
    }

    refresh(): void {
        void this.panel.webview.postMessage({ type: 'data', data: this.data() });
    }

    /** QuickPick a production scene; null clears the assignment, undefined cancels. */
    private async pickScene(preferScene?: string): Promise<{ projectId: string; sceneId?: string } | null | undefined> {
        const productions = discoverProductions(this.deps.getAgents());
        if (!productions.length) {
            void vscode.window.showInformationMessage(
                'Agent Farm: no production.json found in any agent folder — create one with "New Production" on the Pipeline tab.');
            return undefined;
        }
        interface Pick extends vscode.QuickPickItem { projectId?: string; sceneId?: string; clear?: boolean }
        const items: Pick[] = [];
        for (const p of productions) {
            items.push({
                label: `$(project) ${p.production.title}`,
                description: `${p.agentName} — project only`, projectId: p.production.id
            });
            for (const s of p.production.scenes) {
                items.push({
                    label: `    ${s.id === preferScene ? '$(check)' : '$(circle-small)'} ${s.title}`,
                    description: `${p.production.title} · ${s.status}`,
                    projectId: p.production.id, sceneId: s.id
                });
            }
        }
        items.push({ label: '$(clear-all) Clear assignment', description: 'detach from any production/scene', clear: true });
        const pick = await vscode.window.showQuickPick(items, {
            placeHolder: 'Assign this asset to a production scene', ignoreFocusOut: true
        });
        if (!pick) { return undefined; }
        return pick.clear ? null : { projectId: pick.projectId!, sceneId: pick.sceneId };
    }

    private async onMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
        const str = (k: string) => (typeof msg[k] === 'string' ? msg[k] as string : '');
        switch (msg.type) {
            case 'refresh': this.refresh(); break;
            case 'tab':
                this.tab = str('tab') || 'pipeline';
                this.refresh();
                break;
            case 'project':
                this.project = str('project');
                this.refresh();
                break;
            case 'openAsset':
                if (str('path')) {
                    void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(str('path')));
                }
                break;
            // The three regeneration paths keep the gallery's own argument
            // shape (taskId, vary, feedback) — same command, same behaviour.
            case 'rerun':
                void vscode.commands.executeCommand('agentfarm.rerunMedia', str('taskId'), false);
                break;
            case 'vary':
                void vscode.commands.executeCommand('agentfarm.rerunMedia', str('taskId'), true);
                break;
            case 'feedback':
                void vscode.commands.executeCommand('agentfarm.rerunMedia', str('taskId'), false, true);
                break;
            case 'assign': {
                const taskId = str('taskId');
                if (!taskId) { break; }
                const target = await this.pickScene(str('sceneId'));
                if (target === undefined) { break; }
                updateMediaMeta(this.deps.tasks.outputsDir, taskId,
                    target === null
                        ? { projectId: undefined, sceneId: undefined }
                        : { projectId: target.projectId, sceneId: target.sceneId });
                this.refresh();
                break;
            }
            case 'setSceneStatus': {
                const projectId = str('projectId');
                const sceneId = str('sceneId');
                if (!projectId || !sceneId) { break; }
                const found = discoverProductions(this.deps.getAgents())
                    .find(p => p.production.id === projectId);
                if (!found) { break; }
                // The row's badge opens the picker; the right-click menu names
                // the status outright (it drew the list itself). One handler
                // either way, so the write and the refresh cannot differ.
                const asked = str('status');
                const status = (SCENE_STATUSES as readonly string[]).includes(asked)
                    ? asked
                    : await vscode.window.showQuickPick(
                        SCENE_STATUSES as readonly string[] as string[],
                        { placeHolder: `New status for "${found.production.scenes.find(s => s.id === sceneId)?.title ?? sceneId}"`, ignoreFocusOut: true });
                if (!status) { break; }
                if (setSceneStatus(found.production, sceneId, status as SceneStatus)) {
                    writeProduction(found.file, found.production);
                    this.refresh();
                }
                break;
            }
            case 'newProduction':
                await vscode.commands.executeCommand('agentfarm.newProduction');
                this.refresh();
                break;
            case 'generate':
                // Honest wiring: making NEW media is a recipe/workflow, and that
                // is the command that exists — no invented one-click generator.
                await vscode.commands.executeCommand('agentfarm.addRecipe');
                this.refresh();
                break;
            // Triage: judging assets existed only INSIDE a workflow's selection
            // step, so anything generated outside one could never be judged at
            // all. The decision is written to the same fields that step writes,
            // so the gallery badges and the sequence picker honour it.
            case 'triageDecision': {
                const taskId = str('taskId');
                if (!taskId) { break; }
                const meta = this.metas().find(m => m.taskId === taskId);
                if (!meta) { break; }
                const urls = (meta.assetUrls?.length ? meta.assetUrls : meta.assetFiles) ?? [];
                const keep = msg.keep === true;
                updateMediaMeta(this.deps.tasks.outputsDir, taskId, {
                    selectedUrls: keep ? urls : [],
                    rejectedUrls: keep ? [] : urls
                });
                this.refresh();
                break;
            }
            case 'exportSequence':
                await vscode.commands.executeCommand('agentfarm.exportSequence', { projectId: this.project });
                break;
            case 'registerAsset':
                await vscode.commands.executeCommand('agentfarm.registerAsset');
                this.refresh();
                break;
            case 'openSettings':
                void vscode.commands.executeCommand('agentfarm.openFarmSettings', { focus: str('focus') });
                break;
            case 'openFile':
                if (str('path')) {
                    void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(str('path')));
                }
                break;
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', msg.anchor);
                break;
            case 'afnav': handleAfNav(msg.to); break;
        }
    }

    private dispose(): void {
        StudioPanel.current = undefined;
        this.disposables.forEach(d => d.dispose());
        this.panel.dispose();
    }
}
