import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import {
    assetKind, injectMediaFeedback, mediaCandidates, MediaMeta, readMediaMetas, updateMediaMeta
} from '../core/media';
import {
    discoverProductions, newProduction, PRODUCTION_FILENAME, sceneMatrix, SCENE_STATUSES,
    SceneStatus, setSceneStatus, writeProduction
} from '../core/production';
import { pickSequenceAssets } from '../core/premiere';
import { defaultSequenceFile, writeSequence } from '../core/sequenceExport';
import { revealPath } from '../core/reveal';
import { buildStudio, pipelineSummary, SCENE_TARGET_SEP } from '../core/studio';
import { wallItems } from '../core/studioLibrary';
import { TaskManager } from '../core/tasks';
import { handleAfNav, htmlShell } from './base';
import { desktopHost, type PanelHost } from './panelHost';
import { StudioLibraryView, studioRoots, WallReader } from './studioLibraryView';
import { LibraryActDeps, libraryEditFromPage, libraryPromoteFromPage, type LibrarySay } from './studioLibraryActions';
import { studioBrandData, studioBrandMessage } from './studioBrand';
import { FlexDeps } from '../core/flexActions';

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
    /** X-424 — the wall read from the library (the studio.library op's own function); absent = sidecars only */
    libraryWall?: WallReader;
    /** X-425 — the wall's decisions written back (studio.library.edit / media.restage's own writers) */
    libraryAct?: LibraryActDeps;
    /** M-50 — the preset library's store, where brand kits are kept as presets */
    flex?: FlexDeps;
}

export class StudioPanel {
    private static current?: StudioPanel;
    /** X-456 — the views phones have open: one instance each, never the desktop's one tab. */
    private static phones = new Set<StudioPanel>();
    private disposables: vscode.Disposable[] = [];
    private tab = 'pipeline';
    private project = '';

    static show(deps: StudioDeps, opts?: { tab?: string; projectId?: string }): void {
        if (StudioPanel.current) {
            StudioPanel.current.host.reveal();
            if (opts?.tab) { StudioPanel.current.tab = opts.tab; }
            if (opts?.projectId) { StudioPanel.current.project = opts.projectId; }
            StudioPanel.current.refresh();
            return;
        }
        // Ingested assets live outside the outputs folder and a webview may only
        // load from listed roots — allow every directory that currently holds one.
        StudioPanel.current = new StudioPanel(desktopHost({
            viewType: 'agentfarm.studio', title: 'Studio',
            options: {
                enableScripts: true, retainContextWhenHidden: true,
                localResourceRoots: studioRoots(deps.extensionUri, deps.tasks.outputsDir, readMediaMetas(deps.tasks.outputsDir), [])
            }
        }), deps);
        if (opts?.tab) { StudioPanel.current.tab = opts.tab; }
        if (opts?.projectId) { StudioPanel.current.project = opts.projectId; }
        StudioPanel.current.refresh();
    }

    /** X-456 — the Studio on a phone's view; its pictures and clips go by the view's own tokens (remoteFiles.ts). */
    static openOn(host: PanelHost, deps: StudioDeps): void {
        const p = new StudioPanel(host, deps);
        StudioPanel.phones.add(p);
        p.refresh();
    }

    /** Media runs finish in the background — keep an open page current. */
    static refreshIfOpen(): void {
        StudioPanel.current?.refresh();
        for (const p of StudioPanel.phones) { p.refresh(); }
    }

    /** The ONE door to a production, a variation, an assignment or an export —
     *  U-14, surface 6. */
    static compose(deps: StudioDeps, seed: Record<string, unknown>): void {
        StudioPanel.show(deps, seed.kind === 'export' ? { tab: 'assemble' } : undefined);
        void StudioPanel.current?.host.webview.postMessage({ type: 'studio-compose', seed });
    }

    private lib: StudioLibraryView;

    private constructor(private host: PanelHost, private deps: StudioDeps) {
        this.lib = new StudioLibraryView(deps.libraryWall, newDirs => this.onWall(newDirs));
        host.webview.html = htmlShell(host.webview, deps.extensionUri, 'Studio', this.data(), 'studio.js');
        host.webview.onDidReceiveMessage(m => void this.onMessage(m), null, this.disposables);
        host.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    /** The desktop tab's own webview, whose roots grow with the wall; a phone's view has no roots. */
    private get desk(): vscode.Webview | undefined {
        return this.host.remote ? undefined : this.host.webview as vscode.Webview;
    }

    private metas(): MediaMeta[] {
        return readMediaMetas(this.deps.tasks.outputsDir).slice(0, 400);
    }

    private uriOf(file?: string): string | undefined {
        if (!file || !fs.existsSync(file)) { return undefined; }
        return this.host.webview.asWebviewUri(vscode.Uri.file(file)).toString();
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

        // Assets tab: the library's records (X-424), each joined to the sidecar of its file.
        const sidecar = metas.map(m => {
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
        const items = wallItems(sidecar, this.lib.current()).map(i => ({ ...i, assetUri: this.uriOf(i.assetPath) }));

        return {
            generatedAt: Date.now(),
            tab: this.tab,
            project: this.project,
            // ‼️ WHO A PRODUCTION CAN BELONG TO (U-14, surface 6). `newProduction`
            // resolved the agent with a picker of its own before it asked the
            // first of its two boxes; the card asks it as one field among the
            // others, so the answer is visible while the rest is decided.
            agents: this.deps.getAgents().map(a => ({ id: a.id, name: a.name })),
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
            library: this.lib.state(),
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
                !(m.selectedUrls?.length) && !(m.rejectedUrls?.length))).length,
            // M-50 — Sources: every production's brand kit and the kits kept as presets
            ...studioBrandData(found, this.deps.flex)
        };
    }

    refresh(): void {
        void this.host.webview.postMessage({ type: 'data', data: this.data() });
        void this.lib.load(this.metas(), (this.desk?.options.localResourceRoots ?? []).map(u => u.fsPath));
    }

    /** A newer wall arrived. A preview folder the webview may not load from yet means new roots — and new roots only take with a fresh page. */
    private onWall(newDirs: boolean): void {
        const desk = this.desk;
        if (newDirs && desk) {
            desk.options = {
                ...desk.options,
                localResourceRoots: studioRoots(this.deps.extensionUri, this.deps.tasks.outputsDir, this.metas(), this.lib.dirs())
            };
            desk.html = htmlShell(desk, this.deps.extensionUri, 'Studio', this.data(), 'studio.js');
            return;
        }
        void this.host.webview.postMessage({ type: 'data', data: this.data() });
    }

    private async onMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
        const str = (k: string) => (typeof msg[k] === 'string' ? msg[k] as string : '');
        const said = await studioBrandMessage(msg, this.deps.getAgents(), this.deps.flex);
        if (said !== undefined) {
            if (said) { void this.host.ask.warn(`Agent Farm: ${said}`); }
            this.refresh();
            return;
        }
        switch (msg.type) {
            case 'refresh': this.refresh(); break;
            case 'libraryView': this.lib.setView(msg.view); this.refresh(); break;
            case 'libEdit':
                if (this.deps.libraryAct) { await libraryEditFromPage(msg, this.deps.libraryAct, { metas: () => this.metas(), outputsDir: this.deps.tasks.outputsDir }, this.libSay()); this.refresh(); }
                break;
            case 'libPromote':
                if (this.deps.libraryAct) { await libraryPromoteFromPage(msg, this.deps.libraryAct, this.libSay()); this.refresh(); }
                break;
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
                // a phone's ↻ runs the card's own path and is told on the phone, not in a PC toast
                if (this.host.remote) { await this.saveForm({ kind: 'rerun', taskId: str('taskId') }); break; }
                void vscode.commands.executeCommand('agentfarm.rerunMedia', str('taskId'), false);
                break;
            case 'vary':
                void vscode.commands.executeCommand('agentfarm.rerunMedia', str('taskId'), true);
                break;
            case 'feedback':
                void vscode.commands.executeCommand('agentfarm.rerunMedia', str('taskId'), false, true);
                break;
            case 'studio-save': {
                const form = (msg.form ?? {}) as Record<string, unknown>;
                if (form.kind === 'export') { await this.exportSequence(form); } else { await this.saveForm(form); }
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
                    : await this.host.ask.pick(
                        SCENE_STATUSES as readonly string[] as string[],
                        { placeHolder: `New status for "${found.production.scenes.find(s => s.id === sceneId)?.title ?? sceneId}"`, ignoreFocusOut: true });
                if (!status) { break; }
                if (setSceneStatus(found.production, sceneId, status as SceneStatus)) {
                    writeProduction(found.file, found.production);
                    this.refresh();
                }
                break;
            }
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

    /** A refusal the FORM shows, in the form. */
    private say(text: string, ok = false): void {
        void this.host.webview.postMessage({ type: 'studio-msg', text, ok });
    }

    /** Where the wall's ✓ ✗ ✎ ↑ are asked and told: a quiet success on the PC's status bar, on a phone in its own sheet. */
    private libSay(): LibrarySay {
        const ask = this.host.ask;
        return { ask, quiet: this.host.remote ? t => void ask.info(t) : (t, ms) => void vscode.window.setStatusBarMessage(t, ms) };
    }

    /**
     * The four writes the Studio's cards make.
     *
     * Every one of them used to be a dialog chain; the one worth naming is
     * `vary`, which asked for a whole JSON input in a ONE-LINE input box. The
     * file chooser at the end of an export stays native — there is no webview
     * equivalent — and so does the modal in front of overwriting a manifest.
     */
    private async saveForm(raw: Record<string, unknown>): Promise<void> {
        const s = (k: string) => String(raw[k] ?? '').trim();
        const kind = s('kind');

        if (kind === 'production') {
            const agent = this.deps.getAgents().find(a => a.id === s('agentId'));
            if (!agent) { return this.say('Pick the agent whose folder holds the production.'); }
            const title = s('title');
            if (!title) { return this.say('A production needs a title.'); }
            // ‼️ ONE PER LINE, not comma separated. The old box split on commas,
            // so a scene called "Opening, wide" became two scenes silently.
            const scenes = s('scenes').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
            const file = path.join(agent.dir, PRODUCTION_FILENAME);
            if (fs.existsSync(file)) {
                const over = await this.host.ask.warn(
                    `${agent.name} already has a ${PRODUCTION_FILENAME}. Overwrite it?`,
                    { modal: true }, 'Overwrite');
                if (over !== 'Overwrite') { return this.say('Left as it was — nothing was written.'); }
            }
            writeProduction(file, newProduction(title, scenes));
            this.project = '';
            this.refresh();
            return this.say(`"${title}" created with ${scenes.length} scene(s) in ${agent.name}.`, true);
        }

        if (kind === 'assign') {
            const taskId = s('taskId');
            if (!taskId) { return; }
            const target = s('target');
            if (!target) {
                updateMediaMeta(this.deps.tasks.outputsDir, taskId,
                    { projectId: undefined, sceneId: undefined });
                this.refresh();
                return this.say('Detached — it belongs to no production now.', true);
            }
            // ‼️ THE TWO SIDES OF THIS STRING HAVE TO AGREE, AND THEY DID NOT.
            // The picker joins a production to a scene with SCENE_TARGET_SEP
            // (media/studio.js) and this line used to split on a SPACE, so
            // assigning an output to a scene filed it under a project id that
            // was really "<projectId><sep><sceneId>" with no scene at all —
            // silently, because every id involved is machine-generated and
            // nothing downstream could tell the difference. A space was never
            // safe either: production and scene ids come out of a JSON file the
            // user edits by hand, so one of them may well contain one. Split at
            // the FIRST separator: a production alone carries none, and detach
            // is the empty string handled above.
            const cut = target.indexOf(SCENE_TARGET_SEP);
            const projectId = cut < 0 ? target : target.slice(0, cut);
            const sceneId = cut < 0 ? '' : target.slice(cut + SCENE_TARGET_SEP.length);
            updateMediaMeta(this.deps.tasks.outputsDir, taskId, { projectId, sceneId: sceneId || undefined });
            this.refresh();
            return this.say('Assigned.', true);
        }

        if (kind === 'vary' || kind === 'feedback' || kind === 'rerun') {
            const meta = this.metas().find(m => m.taskId === s('taskId'));
            if (!meta) { return this.say('That generation is no longer in the outputs folder — refresh the page.'); }
            let input = meta.input;
            let suffix = ' (re-run)';
            if (kind === 'vary') {
                const edited = String(raw.input ?? '');
                if (!edited.trim()) { return this.say('The input cannot be empty — that is what the provider receives.'); }
                input = edited;
                suffix = ' (vary)';
            } else if (kind === 'feedback') {
                const fb = s('feedback');
                if (!fb) { return this.say('Say what should change — the critique is what makes this different from a plain re-run.'); }
                input = injectMediaFeedback(meta.input, fb);
                suffix = ' (feedback)';
            }
            this.deps.tasks.runMediaAdhoc(meta.title + suffix, meta.model, input,
                { projectId: meta.projectId, sceneId: meta.sceneId });
            this.refresh();
            return this.say(`Started — ${meta.model}. It lands on this page when it finishes.`, true);
        }
    }

    private async exportSequence(raw: Record<string, unknown>): Promise<void> {
        const found = discoverProductions(this.deps.getAgents())
            .find(p => p.production.id === String(raw.projectId ?? '').trim());
        if (!found) { return this.say('Pick a production to export.'); }
        if (this.host.remote) { return this.say('The sequence is written to a file you pick on the PC — export it there.'); }
        // Asked before the save dialog, so nobody picks a file to be told there was nothing to put in it.
        if (!pickSequenceAssets(found.production, this.metas()).length) {
            return this.say(`"${found.production.title}" has no scene assets to place — assign assets to scenes first (the Assets tab's "assign" on each one).`);
        }
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(defaultSequenceFile(found.file, found.production.id)),
            filters: { 'FCP7 XML': ['xml'] }, saveLabel: 'Export sequence'
        });
        if (!uri) { return this.say('Nothing was written.'); }
        const { clips } = writeSequence(found.production, this.metas(), uri.fsPath, {
            format: 'both', fps: Number(raw.fps), clipSeconds: Number(raw.clipSeconds)
        });
        this.say(`${clips} clip(s) exported → ${path.basename(uri.fsPath)} (+ .edl). In Premiere: File → Import.`, true);
        const choice = await vscode.window.showInformationMessage(
            `Agent Farm: exported ${clips} clip(s) → ${path.basename(uri.fsPath)} (+ .edl).`,
            'Reveal', 'Open XML');
        if (choice === 'Reveal') { void revealPath(uri.fsPath); }
        if (choice === 'Open XML') { void vscode.window.showTextDocument(uri); }
    }

    private dispose(): void {
        // A phone's view closing leaves the desktop's tab alone.
        if (StudioPanel.current === this) { StudioPanel.current = undefined; }
        StudioPanel.phones.delete(this);
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
