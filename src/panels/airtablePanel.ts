import * as vscode from 'vscode';
import {
    addStoreFolder, airtablePageData, loadStore, probeAirtableInstances, registerMcp, removeStoreFolder,
    sameFolder, saveStore, stageMcpServer, StoreFolderKey, unregisterMcp, validateDatabaseRoot
} from '../core/airtable';
import { startNamedInstance } from '../core/airtableStart';
import { loadProbeCache, probeMcpServer, saveProbeCache } from '../core/mcpProbe';
import { probeCacheKey, resolveServerConfig } from '../core/toolboxBridge';
import { handleAfNav, htmlShell } from './base';
import { revealPath } from '../core/reveal';

/**
 * Airtable Engine page — the module's own control room (it outgrew being a
 * card squatting on the Toolbox): live instances up top (the thing the user
 * actually cares about), then folders, defaults/connection, and what the
 * agents can do. Every mutation edits the module's store file directly and
 * REPORTS failures — a change either lands or the user sees exactly why not.
 */

export interface AirtablePanelDeps {
    extensionUri: vscode.Uri;
    storageDir: string;
    extVersion: string;
    /** disk cache for MCP probe results (shared with the Toolbox page) */
    cacheFile: string;
    home?: string;
}

function buildData(deps: AirtablePanelDeps): Record<string, unknown> {
    return {
        generatedAt: Date.now(),
        ...airtablePageData(deps.storageDir, deps.extVersion, deps.home),
        probe: loadProbeCache(deps.cacheFile)[probeCacheKey('user', undefined, 'airtable')]
    };
}

export class AirtablePanel {
    private static current: AirtablePanel | undefined;
    private disposables: vscode.Disposable[] = [];

    static show(deps: AirtablePanelDeps): void {
        if (AirtablePanel.current) {
            AirtablePanel.current.panel.reveal();
            AirtablePanel.current.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.airtable',
            'Agent Farm — Airtable Engine',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        AirtablePanel.current = new AirtablePanel(panel, deps);
    }

    static refreshIfOpen(): void {
        AirtablePanel.current?.refresh();
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: AirtablePanelDeps) {
        panel.webview.html = htmlShell(
            panel.webview, deps.extensionUri, 'Airtable Engine', buildData(deps), 'airtablePage.js');
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables);
        void this.probeInstances();
    }

    refresh(): void {
        void this.panel.webview.postMessage({ type: 'data', data: buildData(this.deps) });
        void this.probeInstances();
    }

    private async probeInstances(): Promise<void> {
        try {
            const rows = await probeAirtableInstances(this.deps.storageDir);
            void this.panel.webview.postMessage({ type: 'instances', rows });
        } catch (e) {
            void this.panel.webview.postMessage({ type: 'instances', rows: [], error: String((e as Error).message ?? e) });
        }
    }

    private fail(what: string, e: unknown): void {
        void vscode.window.showErrorMessage(`Agent Farm — Airtable Engine: ${what} failed — ${(e as Error)?.message ?? e}`);
    }

    /** Store mutation with mandatory error surfacing. */
    private mutate(what: string, write: () => unknown): void {
        try {
            write();
            this.refresh();
        } catch (e) {
            this.fail(what, e);
        }
    }

    private async onMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
        switch (msg.type) {
            case 'refresh':
                this.refresh();
                break;
            case 'afnav':
                handleAfNav(msg.to);
                break;
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', 'airtable-engine');
                break;

            case 'add-root':
                await this.addFolder('databaseRoots');
                break;
            case 'add-media':
                await this.addFolder('mediaRoots');
                break;
            case 'remove-root':
                this.removeFolder('databaseRoots', String(msg.value ?? ''));
                break;
            case 'remove-media':
                this.removeFolder('mediaRoots', String(msg.value ?? ''));
                break;
            case 'set': {
                const key = String(msg.key ?? '');
                if (!['defaultInstance', 'defaultLang', 'requestTimeoutMs'].includes(key)) { return; }
                const value = key === 'requestTimeoutMs'
                    ? Math.max(1000, Number(msg.value) || 8000)
                    : String(msg.value ?? '').trim();
                this.mutate(`saving ${key}`, () => saveStore(this.deps.storageDir, { [key]: value }));
                break;
            }

            case 'register':
                try {
                    stageMcpServer(this.deps.extensionUri.fsPath, this.deps.storageDir, this.deps.extVersion);
                    if (!registerMcp(this.deps.storageDir, this.deps.home)) {
                        throw new Error('could not write ~/.claude.json');
                    }
                    void vscode.window.showInformationMessage(
                        'Agent Farm: Airtable Engine MCP registered — every NEW claude session (any agent) '
                        + 'now sees the airtable_* tools. Running sessions pick it up on restart.');
                    this.refresh();
                } catch (e) {
                    this.fail('register', e);
                }
                break;
            case 'unregister': {
                const sure = await vscode.window.showWarningMessage(
                    'Unregister the Airtable Engine MCP from ~/.claude.json? '
                    + 'New claude sessions will no longer see the airtable_* tools (folders and data are untouched).',
                    { modal: true }, 'Unregister');
                if (sure !== 'Unregister') { return; }
                try {
                    if (!unregisterMcp(this.deps.home)) { throw new Error('no registration found or file not writable'); }
                    this.refresh();
                } catch (e) {
                    this.fail('unregister', e);
                }
                break;
            }

            case 'probe-tools':
                await this.probeTools();
                break;

            case 'start': {
                const name = String(msg.name ?? '');
                const r = await startNamedInstance(this.deps.storageDir, name);
                if (r.ok) {
                    void vscode.window.showInformationMessage(`Agent Farm — Airtable Engine: ${r.instance} ${r.alreadyRunning ? 'was already running' : `is running on port ${r.port} (${Math.round(r.ms / 100) / 10} s)`}.`);
                } else {
                    this.fail(`starting ${name}`, new Error(r.error));
                }
                this.refresh();
                break;
            }

            case 'open-ui': {
                const url = String(msg.url ?? '');
                if (/^https?:\/\//.test(url)) { void vscode.env.openExternal(vscode.Uri.parse(url)); }
                break;
            }
            case 'reveal':
                if (typeof msg.path === 'string' && msg.path) {
                    void revealPath(msg.path);
                }
                break;
            case 'open-config':
                void vscode.window.showTextDocument(vscode.Uri.file(String(msg.path ?? '')));
                break;
        }
    }

    private async addFolder(key: StoreFolderKey): Promise<void> {
        const picked = await vscode.window.showOpenDialog({
            canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
            openLabel: key === 'databaseRoots' ? 'Add engine folder' : 'Add media folder',
            title: key === 'databaseRoots'
                ? 'Engine folder — either the parent that holds your instances, or an instance folder itself'
                : 'Media library folder (records reference files here by absolute path)'
        });
        const folder = picked?.[0]?.fsPath;
        if (!folder) { return; }
        if (loadStore(this.deps.storageDir)[key].some(r => sameFolder(r, folder))) {
            void vscode.window.showWarningMessage('Agent Farm: that folder is already listed.');
            return;
        }
        if (key === 'databaseRoots') {
            // A folder that IS an instance counts too (discovery handles both),
            // so either …\db or …\db\stem just works — no wrong answer.
            const found = validateDatabaseRoot(folder).instances;
            if (!found.length) {
                const anyway = await vscode.window.showWarningMessage(
                    `No engine instance found in "${folder}" — expected a config.json in it or in a direct subfolder. Add it anyway?`,
                    { modal: true }, 'Add anyway');
                if (anyway !== 'Add anyway') { return; }
            } else {
                void vscode.window.showInformationMessage(
                    `Agent Farm: ${found.length} engine instance(s) found: ${found.map(i => i.name).join(', ')}.`);
            }
        }
        this.mutate('adding the folder', () => addStoreFolder(this.deps.storageDir, key, folder));
    }

    private removeFolder(key: StoreFolderKey, value: string): void {
        if (!value) { return; }
        this.mutate('removing the folder', () => removeStoreFolder(this.deps.storageDir, key, value));
    }

    private async probeTools(): Promise<void> {
        const cfg = resolveServerConfig('airtable', undefined, this.deps.home);
        if (!cfg) {
            void vscode.window.showWarningMessage(
                'Agent Farm: the airtable MCP is not registered yet — register it first, then probe.');
            return;
        }
        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Airtable Engine: asking the MCP server for its tool list…' },
            async () => {
                const result = await probeMcpServer(cfg);
                const cache = loadProbeCache(this.deps.cacheFile);
                cache[probeCacheKey('user', undefined, 'airtable')] = result;
                saveProbeCache(this.deps.cacheFile, cache);
                if (!result.ok) {
                    void vscode.window.showWarningMessage(`Agent Farm: probe failed — ${result.error}`);
                }
            });
        this.refresh();
    }

    private dispose(): void {
        AirtablePanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
