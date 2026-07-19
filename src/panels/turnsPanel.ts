import * as vscode from 'vscode';
import { PricingEngine } from '../core/pricing';
import { SessionIndex } from '../core/sessions';
import { buildTurnRows } from '../core/turns';
import { handleAfNav, htmlShell } from './base';
import { buildData as buildViewerData } from './sessionViewer';

/**
 * Turns page: the whole farm unrolled to one row per user turn — the Sessions
 * table's controls (sort / Show / fold / single-open / filters), adapted to
 * turns. A row folds open into the turn's actual content (prompt, replies,
 * tool calls), fetched on demand; clicking a row opens the transcript at that
 * turn. Turn rollups come from the session index, so rendering is cheap.
 */

export interface TurnsDeps {
    extensionUri: vscode.Uri;
    index: SessionIndex;
    getPricing(): PricingEngine;
}

/** Default row count of the Turns table (the Show box seeds this). A turn is a
 *  much finer unit than a session, so the page opens deep by default. */
export const TURNS_TABLE_N = 200;

function buildData(deps: TurnsDeps): Record<string, unknown> {
    const now = Date.now();
    return {
        generatedAt: now,
        rows: buildTurnRows(deps.index.all(), s => deps.index.isSessionActive(s, now)),
        tableN: TURNS_TABLE_N
    };
}

/** One turn's content for the fold-open panel: the messages of turn n only. */
function turnContent(file: string, n: number, deps: TurnsDeps): unknown[] {
    const CLIP = 1500, CAP = 150;
    const data = buildViewerData(file, {
        extensionUri: deps.extensionUri,
        getPricing: () => deps.getPricing(),
        maxMessages: () => Number.MAX_SAFE_INTEGER,
        contextLimitFor: () => 0
    });
    const msgs = (data.messages as {
        role: string; text?: string; tool?: string; input?: string;
        isError?: boolean; sidechain?: boolean; model?: string; turn?: number;
    }[]).filter(m => m.turn === n);
    const out = msgs.slice(0, CAP).map(m => ({
        role: m.role,
        text: (m.text ?? '').slice(0, CLIP),
        tool: m.tool ?? '',
        input: (m.input ?? '').slice(0, 300),
        isError: !!m.isError,
        sidechain: !!m.sidechain,
        model: m.model ?? ''
    }));
    if (msgs.length > CAP) {
        out.push({
            role: 'system', text: `… ${msgs.length - CAP} more messages — open the transcript for the rest`,
            tool: '', input: '', isError: false, sidechain: false, model: ''
        });
    }
    return out;
}

export class TurnsPanel {
    private static current: TurnsPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    static show(deps: TurnsDeps): void {
        if (TurnsPanel.current) {
            TurnsPanel.current.panel.reveal();
            TurnsPanel.current.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.turns',
            'Agent Farm — Turns',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        TurnsPanel.current = new TurnsPanel(panel, deps);
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: TurnsDeps) {
        panel.webview.html = htmlShell(
            panel.webview,
            deps.extensionUri,
            'Agent Farm Turns',
            buildData(deps),
            'turns.js'
        );
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => this.onMessage(msg), null, this.disposables);
        this.deps.index.onDidUpdate(() => this.refresh(), null, this.disposables);
    }

    refresh(): void {
        void this.panel.webview.postMessage({ type: 'data', data: buildData(this.deps) });
    }

    private onMessage(msg: { type: string; [k: string]: unknown }): void {
        switch (msg.type) {
            case 'refresh':
                this.refresh();
                break;
            case 'afnav':
                handleAfNav(msg.to);
                break;
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', msg.anchor);
                break;
            case 'openSession':
                void vscode.commands.executeCommand('agentfarm.openSession', msg.file,
                    typeof msg.ts === 'number' && msg.ts > 0 ? msg.ts : undefined);
                break;
            case 'focusTerminal':
                void vscode.commands.executeCommand('agentfarm.focusSessionTerminal', {
                    sessionId: typeof msg.sessionId === 'string' && msg.sessionId ? msg.sessionId : undefined,
                    agentName: typeof msg.agentName === 'string' ? msg.agentName : undefined,
                    cwd: typeof msg.cwd === 'string' && msg.cwd ? msg.cwd : undefined
                });
                break;
            case 'turnDetail': {
                // Fold-open content. Only files the index lists are readable from
                // here — the webview must not point us at arbitrary paths.
                const file = typeof msg.file === 'string' ? msg.file : '';
                const n = typeof msg.n === 'number' ? Math.floor(msg.n) : 0;
                if (!file || !(n > 0) || !this.deps.index.all().some(s => s.file === file)) { break; }
                let msgs: unknown[] = [];
                try { msgs = turnContent(file, n, this.deps); } catch { /* fail-soft: empty panel */ }
                void this.panel.webview.postMessage({ type: 'turnDetail', file, n, msgs });
                break;
            }
        }
    }

    private dispose(): void {
        TurnsPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
