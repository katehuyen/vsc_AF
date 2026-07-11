import * as vscode from 'vscode';
import { LiveMonitor } from '../core/live';
import { TaskManager } from '../core/tasks';
import { htmlShell } from './base';

export interface TimelineDeps {
    extensionUri: vscode.Uri;
    live: LiveMonitor;
    tasks: TaskManager;
    /** Per-agent turn-ready notification actions (agentName → action ids). */
    getTurnActions: () => Record<string, string[]>;
    setTurnActions: (map: Record<string, string[]>) => void;
}

// Detail ranges (≤8h) render from this in-memory window; 24h+ density ranges
// are bucketed on demand from the persistent store (see the 'history' message).
const DATA_WINDOW_MS = 8 * 3600 * 1000;

function buildData(deps: TimelineDeps): Record<string, unknown> {
    return {
        now: Date.now(),
        listener: {
            state: deps.live.listenerState,
            port: deps.live.activePort
        },
        sessions: deps.live.sessions().map(s => ({
            sessionId: s.sessionId,
            agentName: s.agentName ?? s.sessionId.slice(0, 8),
            status: s.status,
            currentTool: s.currentTool,
            lastPrompt: s.lastPrompt,
            startedAt: s.startedAt,
            lastEventTs: s.lastEventTs,
            prompts: s.prompts,
            toolCalls: s.toolCalls,
            compactions: s.compactions,
            subagentStops: s.subagentStops,
            transcriptPath: s.transcriptPath
        })),
        events: deps.live.events(DATA_WINDOW_MS),
        workflowRuns: deps.tasks.workflowRuns(DATA_WINDOW_MS),
        turnActions: deps.getTurnActions()
    };
}

export class TimelinePanel {
    private static current: TimelinePanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private throttle?: NodeJS.Timeout;

    static show(deps: TimelineDeps): void {
        if (TimelinePanel.current) {
            TimelinePanel.current.panel.reveal();
            TimelinePanel.current.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.timeline',
            'Agent Farm — Live Timeline',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        TimelinePanel.current = new TimelinePanel(panel, deps);
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: TimelineDeps) {
        panel.webview.html = htmlShell(
            panel.webview,
            deps.extensionUri,
            'Live Timeline',
            buildData(deps),
            'timeline.js'
        );
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => this.onMessage(msg), null, this.disposables);
        const throttledRefresh = () => {
            // Throttle bursts (a busy agent can emit several events per second).
            if (this.throttle) { return; }
            this.throttle = setTimeout(() => {
                this.throttle = undefined;
                this.refresh();
            }, 700);
        };
        this.deps.live.onDidUpdate(throttledRefresh, null, this.disposables);
        this.deps.tasks.onDidChange(throttledRefresh, null, this.disposables);
    }

    refresh(): void {
        this.panel.webview.postMessage({ type: 'data', data: buildData(this.deps) });
    }

    private onMessage(msg: { type: string; [k: string]: unknown }): void {
        switch (msg.type) {
            case 'installHooks':
                void vscode.commands.executeCommand('agentfarm.installHooks');
                break;
            case 'openSession':
                if (typeof msg.file === 'string' && msg.file) {
                    void vscode.commands.executeCommand('agentfarm.openSession', msg.file);
                }
                break;
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', msg.anchor);
                break;
            case 'refresh':
                this.refresh();
                break;
            case 'setTurnActions':
                if (msg.map && typeof msg.map === 'object') {
                    this.deps.setTurnActions(msg.map as Record<string, string[]>);
                }
                break;
            case 'history': {
                // Long ranges: per-lane density buckets from the persistent event store.
                const hours = typeof msg.hours === 'number' && msg.hours > 0 ? msg.hours : 24;
                const windowMs = Math.min(hours, 31 * 24) * 3600 * 1000;
                void this.panel.webview.postMessage({
                    type: 'history',
                    hours,
                    density: this.deps.live.density(windowMs),
                    workflowRuns: this.deps.tasks.workflowRuns(windowMs)
                });
                break;
            }
        }
    }

    private dispose(): void {
        if (this.throttle) { clearTimeout(this.throttle); }
        TimelinePanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
