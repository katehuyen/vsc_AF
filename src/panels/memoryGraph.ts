import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import { buildMemoryGraph } from '../core/memgraph';
import { memoryUsage } from '../core/memusage';
import { SessionIndex } from '../core/sessions';
import { handleAfNav, htmlShell } from './base';

/**
 * Memory Graph: makes the [[wikilink]] structure of each agent's memory
 * visible — links, hubs, islands, broken targets — with recall coloring.
 * Scans file contents on open/refresh only (not on every index tick).
 */

export interface MemoryGraphDeps {
    extensionUri: vscode.Uri;
    getAgents(): AgentInfo[];
    index: SessionIndex;
}

const WINDOW_MS = 30 * 24 * 3600 * 1000;

function buildData(deps: MemoryGraphDeps): Record<string, unknown> {
    const agents = deps.getAgents().filter(a => a.memoryFiles.length > 0);
    return {
        generatedAt: Date.now(),
        agents: agents.map(a => ({
            id: a.id,
            name: a.name,
            graph: buildMemoryGraph(a, memoryUsage(deps.index, a.id, WINDOW_MS))
        }))
    };
}

export class MemoryGraphPanel {
    private static current: MemoryGraphPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    static show(deps: MemoryGraphDeps, agentId?: string): void {
        if (MemoryGraphPanel.current) {
            MemoryGraphPanel.current.panel.reveal();
            MemoryGraphPanel.current.refresh(agentId);
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.memoryGraph',
            'Agent Farm — Memory Graph',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        MemoryGraphPanel.current = new MemoryGraphPanel(panel, deps, agentId);
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: MemoryGraphDeps, agentId?: string) {
        panel.webview.html = htmlShell(
            panel.webview,
            deps.extensionUri,
            'Memory Graph',
            { ...buildData(deps), selectAgentId: agentId },
            'memgraph.js'
        );
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => this.onMessage(msg), null, this.disposables);
    }

    refresh(agentId?: string): void {
        void this.panel.webview.postMessage({
            type: 'data',
            data: { ...buildData(this.deps), selectAgentId: agentId }
        });
    }

    private onMessage(msg: { type: string; [k: string]: unknown }): void {
        switch (msg.type) {
            case 'refresh':
                this.refresh();
                break;
            case 'open':
                if (typeof msg.path === 'string' && msg.path) {
                    void vscode.window.showTextDocument(vscode.Uri.file(msg.path));
                }
                break;
            case 'fixIndex':
                void vscode.commands.executeCommand('agentfarm.fixMemoryIndex', { agentId: msg.agentId })
                    .then(() => this.refresh(typeof msg.agentId === 'string' ? msg.agentId : undefined));
                break;
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', 'hafiza-grafigi');
                break;
            case 'afnav':
                handleAfNav(msg.to);
                break;
        }
    }

    private dispose(): void {
        MemoryGraphPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
