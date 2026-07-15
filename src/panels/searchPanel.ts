import * as vscode from 'vscode';
import {
    searchTranscripts, searchMemory, searchLiveEvents,
    SearchResult, SearchRole
} from '../core/search';
import { SessionIndex } from '../core/sessions';
import { htmlShell } from './base';

export interface SearchDeps {
    extensionUri: vscode.Uri;
    index: SessionIndex;
    getAgentNames(): string[];
    /** S5: the agents' memory/*.md notes, for the memory source. */
    getMemoryFiles(): { file: string; agentName: string }[];
    /** S5: persisted live-event store path, for the events source. */
    liveEventsFile(): string;
    /** D4 semantic layer — undefined when embeddings are off. */
    semanticSearch(query: string, agentName?: string): Promise<SearchResult>;
    semanticStatus(): { provider: string; sessions: number; chunks: number };
}

/** Pre-scoping passed by the surface that opened the panel (viewer → this
 *  session, agent page → this agent, dashboard → fleet). */
export interface SearchPreset {
    agentName?: string;
    file?: string;
    title?: string;
}

/** D4 — full-fleet transcript search panel ("which agent did I discuss this with?"). */
export class SearchPanel {
    private static current: SearchPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    static show(deps: SearchDeps, preset?: SearchPreset): void {
        if (SearchPanel.current) {
            SearchPanel.current.panel.reveal();
            if (preset) {
                void SearchPanel.current.panel.webview.postMessage({ type: 'preset', preset });
            }
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.search',
            'Agent Farm — Search',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        SearchPanel.current = new SearchPanel(panel, deps, preset);
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: SearchDeps, preset?: SearchPreset) {
        this.panel.webview.html = htmlShell(
            this.panel.webview,
            this.deps.extensionUri,
            'Search',
            {
                agents: this.deps.getAgentNames(),
                semantic: this.deps.semanticStatus(),
                preset: preset ?? null
            },
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
                const file = typeof msg.file === 'string' && msg.file ? msg.file : undefined;
                const roles = Array.isArray(msg.roles) && msg.roles.length
                    ? msg.roles.filter((r): r is SearchRole =>
                        r === 'user' || r === 'assistant' || r === 'tool' || r === 'toolResult')
                    : undefined;
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
                    const opts = {
                        regex: !!msg.regex,
                        caseSensitive: !!msg.caseSensitive,
                        agentName,
                        roles,
                        files: file ? [file] : undefined,
                        // a single session can take many more hits than a fleet scan
                        maxHits: file ? 400 : 150,
                        maxPerFile: file ? 400 : 3
                    };
                    result = searchTranscripts(sessions, query, opts);
                    // S5 sources ride along unless the scope is a single session
                    // (that session's content is fully covered by the scan above).
                    if (!file && msg.memory !== false) {
                        result.hits.push(...searchMemory(this.deps.getMemoryFiles(), query, opts));
                    }
                    if (!file && msg.events !== false) {
                        result.hits.push(...searchLiveEvents(this.deps.liveEventsFile(), query, opts));
                    }
                }
                void this.panel.webview.postMessage({
                    type: 'results', result, query: msg.query,
                    semanticStatus: this.deps.semanticStatus()
                });
                break;
            }
            case 'openSession':
                // ts = matched message time — the viewer scrolls right to it.
                void vscode.commands.executeCommand('agentfarm.openSession', msg.file,
                    typeof msg.ts === 'number' && msg.ts > 0 ? msg.ts : undefined);
                break;
            case 'openFile':
                if (typeof msg.file === 'string' && msg.file) {
                    void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(msg.file));
                }
                break;
            case 'openTimeline':
                void vscode.commands.executeCommand('agentfarm.openTimeline');
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
