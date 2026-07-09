import * as vscode from 'vscode';
import { searchTranscripts, SearchResult } from '../core/search';
import { SessionIndex } from '../core/sessions';
import { htmlShell } from './base';

export interface SearchDeps {
    extensionUri: vscode.Uri;
    index: SessionIndex;
    getAgentNames(): string[];
    /** D4 semantic layer — undefined when embeddings are off. */
    semanticSearch(query: string, agentName?: string): Promise<SearchResult>;
    semanticStatus(): { provider: string; sessions: number; chunks: number };
}

/** D4 — full-fleet transcript search panel ("which agent did I discuss this with?"). */
export class SearchPanel {
    private static current: SearchPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    static show(deps: SearchDeps): void {
        if (SearchPanel.current) {
            SearchPanel.current.panel.reveal();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.search',
            'Agent Farm — Transcript Search',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        SearchPanel.current = new SearchPanel(panel, deps);
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: SearchDeps) {
        this.panel.webview.html = htmlShell(
            this.panel.webview,
            this.deps.extensionUri,
            'Transcript Search',
            { agents: this.deps.getAgentNames(), semantic: this.deps.semanticStatus() },
            'search.js'
        );
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables);
    }

    private async onMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
        switch (msg.type) {
            case 'search': {
                const query = String(msg.query ?? '');
                const agentName = typeof msg.agent === 'string' && msg.agent ? msg.agent : undefined;
                let result: SearchResult;
                if (msg.semantic) {
                    result = await this.deps.semanticSearch(query, agentName);
                } else {
                    const sessions = this.deps.index.all().map(s => ({
                        file: s.file,
                        agentName: s.agentName,
                        title: s.title,
                        mtime: s.mtime
                    }));
                    result = searchTranscripts(sessions, query, {
                        regex: !!msg.regex,
                        caseSensitive: !!msg.caseSensitive,
                        agentName
                    });
                }
                void this.panel.webview.postMessage({
                    type: 'results', result, query: msg.query,
                    semanticStatus: this.deps.semanticStatus()
                });
                break;
            }
            case 'openSession':
                void vscode.commands.executeCommand('agentfarm.openSession', msg.file);
                break;
            case 'buildIndex':
                void vscode.commands.executeCommand('agentfarm.buildSemanticIndex');
                break;
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', msg.anchor);
                break;
        }
    }

    private dispose(): void {
        SearchPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
