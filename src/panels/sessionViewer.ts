import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { PricingEngine, totalTokens, Usage } from '../core/pricing';
import { htmlShell } from './base';

export interface ViewerDeps {
    extensionUri: vscode.Uri;
    getPricing(): PricingEngine;
    maxMessages(): number;
    /** Context-window size for the "Context now" gauge, resolved from the session's
     *  current model (agentFarm.contextWindowTokens > 0 overrides). 0 = unknown model —
     *  the gauge then shows the raw token count without a percent or color. */
    contextLimitFor(model: string): number;
    /** User-set session name (rename feature); wins over the transcript-derived title. */
    titleFor?(sessionId: string): string | undefined;
    /** Export MD remembers the last folder saved to; falls back to session cwd / home. */
    lastExportDir?(): string | undefined;
    setLastExportDir?(dir: string): void;
    /** Resume honors agentFarm.externalTerminal when provided by the extension host. */
    launchTerminal?(name: string, cwd: string | undefined, command: string): void;
}

interface ViewMessage {
    role: 'user' | 'assistant' | 'tool' | 'toolResult' | 'system';
    ts: number;
    text?: string;
    tool?: string;
    input?: string;
    isError?: boolean;
    sidechain?: boolean;
    model?: string;
    tokens?: number;
    cost?: number;
    /** 1-based turn number (a turn starts at each top-level user prompt). */
    turn?: number;
    /** True on the message that opens a turn — the viewer draws the turn divider here. */
    turnStart?: boolean;
}

const TEXT_LIMIT = 4000;

function clip(s: string): string {
    return s.length > TEXT_LIMIT ? s.slice(0, TEXT_LIMIT) + `\n… [truncated, ${s.length} chars total]` : s;
}

/** Human-readable prompt snippet: slash commands show as their name, harness XML is skipped. */
function promptLabel(text: string): string {
    const t = text.replace(/\s+/g, ' ').trim();
    const cmd = /<command-name>([^<]+)<\/command-name>/.exec(t);
    if (cmd) { return cmd[1].trim(); }
    return t.slice(0, 90);
}

/** Title candidate from a user prompt — command/harness noise never names a session. */
function titleCandidate(text: string): string {
    const t = text.replace(/\s+/g, ' ').trim();
    if (!t || t.startsWith('<') || t.startsWith('/') || t.startsWith('!')) { return ''; }
    return t.slice(0, 80);
}

function contentToText(content: unknown): string {
    if (typeof content === 'string') { return content; }
    if (Array.isArray(content)) {
        const parts: string[] = [];
        for (const b of content as { type?: string; text?: string; content?: unknown }[]) {
            if (b?.type === 'text' && b.text) { parts.push(b.text); }
        }
        return parts.join('\n');
    }
    return '';
}

export function buildData(file: string, deps: ViewerDeps): Record<string, unknown> {
    let raw = '';
    try { raw = fs.readFileSync(file, 'utf8'); } catch { /* gone */ }

    const messages: ViewMessage[] = [];
    const usage: Usage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
    const models = new Set<string>();
    const seen = new Set<string>();
    let cost = 0, errors = 0, toolCalls = 0, firstTs = 0, lastTs = 0;
    let ctxTokens = 0, ctxTs = 0;
    let ctxModel = '';
    let title = '';
    let cwd = '';
    let permissionMode = '';
    // Turn accounting runs inside the parse loop: usage on assistant lines whose content
    // never renders (e.g. thinking-only stream lines) must still bill to the open turn.
    let inTurn = 0;
    const turnTotals: Record<number, { tokens: number; cost: number }> = {};

    for (const lineText of raw.split('\n')) {
        if (!lineText.trim()) { continue; }
        let line: {
            type?: string; summary?: string; isMeta?: boolean; isSidechain?: boolean;
            timestamp?: string; cwd?: string; permissionMode?: string; requestId?: string;
            costUSD?: number; toolUseResult?: unknown;
            message?: {
                id?: string; model?: string; content?: unknown;
                usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
            };
        };
        try { line = JSON.parse(lineText); } catch { continue; }

        const ts = line.timestamp ? Date.parse(line.timestamp) : 0;
        if (ts) {
            if (!firstTs) { firstTs = ts; }
            lastTs = Math.max(lastTs, ts);
        }
        if (line.cwd && !cwd) { cwd = line.cwd; }
        if (line.type === 'summary' && line.summary && !title) { title = line.summary; continue; }
        if (line.type === 'permission-mode' && line.permissionMode) { permissionMode = line.permissionMode; continue; }

        if (line.type === 'user' && line.message) {
            const content = line.message.content;
            if (typeof content === 'string') {
                if (!line.isMeta) {
                    messages.push({ role: 'user', ts, text: clip(content), sidechain: line.isSidechain });
                    if (!line.isSidechain) { inTurn++; }
                    if (!title) { title = titleCandidate(content); }
                }
            } else if (Array.isArray(content)) {
                for (const b of content as { type?: string; is_error?: boolean; content?: unknown; text?: string }[]) {
                    if (b?.type === 'tool_result') {
                        if (b.is_error) { errors++; }
                        messages.push({
                            role: 'toolResult', ts,
                            text: clip(contentToText(b.content) || String(b.text ?? '')),
                            isError: !!b.is_error,
                            sidechain: line.isSidechain
                        });
                    } else if (b?.type === 'text' && b.text) {
                        messages.push({ role: 'user', ts, text: clip(b.text), sidechain: line.isSidechain });
                        if (!line.isSidechain) { inTurn++; }
                        if (!title) { title = titleCandidate(b.text); }
                    }
                }
            }
            continue;
        }

        if (line.type === 'assistant' && line.message) {
            const msg = line.message;
            if (msg.model && msg.model !== '<synthetic>') { models.add(msg.model); }
            if (msg.usage) {
                ctxTokens = (msg.usage.input_tokens ?? 0) + (msg.usage.cache_read_input_tokens ?? 0) +
                    (msg.usage.cache_creation_input_tokens ?? 0) + (msg.usage.output_tokens ?? 0);
                ctxTs = ts || ctxTs;
                if (msg.model && msg.model !== '<synthetic>') { ctxModel = msg.model; }
            }
            let msgTokens = 0, msgCost = 0;
            const key = `${msg.id ?? ''}:${line.requestId ?? ''}`;
            if (msg.usage && (key === ':' || !seen.has(key))) {
                if (key !== ':') { seen.add(key); }
                const u: Usage = {
                    input: msg.usage.input_tokens ?? 0,
                    output: msg.usage.output_tokens ?? 0,
                    cacheWrite: msg.usage.cache_creation_input_tokens ?? 0,
                    cacheRead: msg.usage.cache_read_input_tokens ?? 0
                };
                usage.input += u.input;
                usage.output += u.output;
                usage.cacheWrite += u.cacheWrite;
                usage.cacheRead += u.cacheRead;
                msgTokens = totalTokens(u);
                msgCost = typeof line.costUSD === 'number'
                    ? line.costUSD
                    : deps.getPricing().costFor(msg.model ?? '', u, ts);
                cost += msgCost;
                if (inTurn > 0 && (msgTokens || msgCost)) {
                    const t = turnTotals[inTurn] ?? (turnTotals[inTurn] = { tokens: 0, cost: 0 });
                    t.tokens += msgTokens;
                    t.cost += msgCost;
                }
            }
            if (Array.isArray(msg.content)) {
                for (const b of msg.content as { type?: string; text?: string; name?: string; input?: unknown }[]) {
                    if (b?.type === 'text' && b.text?.trim()) {
                        messages.push({
                            role: 'assistant', ts, text: clip(b.text),
                            model: msg.model, tokens: msgTokens, cost: msgCost,
                            sidechain: line.isSidechain
                        });
                        msgTokens = 0; msgCost = 0; // attribute once
                    } else if (b?.type === 'tool_use' && b.name) {
                        toolCalls++;
                        // Tool-only assistant turns still cost tokens — attribute them to the first tool block.
                        messages.push({
                            role: 'tool', ts, tool: b.name,
                            input: clip(JSON.stringify(b.input ?? {}, null, 2)),
                            model: msgTokens ? msg.model : undefined,
                            tokens: msgTokens || undefined, cost: msgCost || undefined,
                            sidechain: line.isSidechain
                        });
                        msgTokens = 0; msgCost = 0;
                    }
                }
            }
        }
    }

    // Second pass tags each message with its turn (totals were billed in the parse loop,
    // where usage from non-rendering assistant lines is still visible).
    let turnNo = 0;
    const turnLabels: Record<number, string> = {};
    for (const m of messages) {
        if (m.role === 'user' && !m.sidechain) {
            turnNo++;
            m.turnStart = true;
            turnLabels[turnNo] = promptLabel(m.text ?? '');
        }
        if (turnNo > 0) { m.turn = turnNo; }
    }
    // Flat per-turn table for the "Turn breakdown" box.
    const turns: { n: number; label: string; tokens: number; cost: number }[] = [];
    for (let n = 1; n <= turnNo; n++) {
        turns.push({
            n, label: turnLabels[n] ?? '',
            tokens: turnTotals[n]?.tokens ?? 0,
            cost: turnTotals[n]?.cost ?? 0
        });
    }

    const max = deps.maxMessages();
    const truncatedCount = Math.max(0, messages.length - max);

    const sessionId = path.basename(file, '.jsonl');
    return {
        file,
        sessionId,
        title: deps.titleFor?.(sessionId) || title || '(untitled session)',
        cwd,
        permissionMode,
        firstTs,
        lastTs,
        models: [...models],
        usage,
        totalTokens: totalTokens(usage),
        cost,
        errors,
        toolCalls,
        context: { tokens: ctxTokens, ts: ctxTs, limit: deps.contextLimitFor(ctxModel), model: ctxModel },
        turnCount: turnNo,
        turnTotals,
        turns,
        messageCount: messages.length,
        truncatedCount,
        messages: messages.slice(-max)
    };
}

export class SessionViewerPanel {
    private static open = new Map<string, SessionViewerPanel>();
    private disposables: vscode.Disposable[] = [];
    private watcher?: fs.FSWatcher;
    private pushTimer?: NodeJS.Timeout;

    /** focusTs: scroll to (and flash) the message nearest this timestamp — the
     *  timeline passes the clicked mark's time so the viewer opens right there. */
    static show(file: string, deps: ViewerDeps, focusTs?: number): void {
        const existing = SessionViewerPanel.open.get(file);
        if (existing) {
            existing.panel.reveal();
            if (focusTs) { void existing.panel.webview.postMessage({ type: 'focus', ts: focusTs }); }
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.session',
            `Session: ${path.basename(file, '.jsonl').slice(0, 8)}`,
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        SessionViewerPanel.open.set(file, new SessionViewerPanel(panel, file, deps, focusTs));
    }

    private constructor(
        readonly panel: vscode.WebviewPanel,
        private file: string,
        private deps: ViewerDeps,
        focusTs?: number
    ) {
        const data = buildData(file, deps);
        if (focusTs) { data.focusTs = focusTs; }
        panel.webview.html = htmlShell(
            panel.webview,
            deps.extensionUri,
            'Session Viewer',
            data,
            'sessionViewer.js'
        );
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => this.onMessage(msg), null, this.disposables);
        this.watchFile();
    }

    /** Live refresh: push fresh data (KPIs, context gauge, new messages) while the session is still running. */
    private watchFile(): void {
        try {
            const base = path.basename(this.file);
            this.watcher = fs.watch(path.dirname(this.file), (_event, filename) => {
                if (filename && filename.toString() !== base) { return; }
                if (this.pushTimer) { clearTimeout(this.pushTimer); }
                this.pushTimer = setTimeout(() => {
                    this.pushTimer = undefined;
                    if (!fs.existsSync(this.file)) { return; }
                    void this.panel.webview.postMessage(
                        { type: 'data', data: buildData(this.file, this.deps), auto: true });
                }, 800);
            });
        } catch { /* watch unavailable — Refresh stays manual */ }
    }

    private onMessage(msg: { type: string; [k: string]: unknown }): void {
        switch (msg.type) {
            case 'openRaw':
                vscode.commands.executeCommand('vscode.open', vscode.Uri.file(this.file));
                break;
            case 'resume': {
                const sessionId = path.basename(this.file, '.jsonl');
                const cwd = typeof msg.cwd === 'string' && msg.cwd && fs.existsSync(msg.cwd)
                    ? msg.cwd : undefined;
                const name = `claude: ${sessionId.slice(0, 8)}`;
                const command = `claude --resume ${sessionId}`;
                if (this.deps.launchTerminal) {
                    this.deps.launchTerminal(name, cwd, command);
                    break;
                }
                const terminal = vscode.window.createTerminal({ name, cwd });
                terminal.show();
                terminal.sendText(command, true);
                break;
            }
            case 'refresh':
                this.panel.webview.postMessage({ type: 'data', data: buildData(this.file, this.deps) });
                break;
            case 'exportMd': {
                if (typeof msg.md !== 'string' || !msg.md) { break; }
                const md = msg.md;
                const remembered = this.deps.lastExportDir?.();
                const dir = remembered && fs.existsSync(remembered) ? remembered
                    : typeof msg.cwd === 'string' && msg.cwd && fs.existsSync(msg.cwd) ? msg.cwd
                        : os.homedir();
                const d = new Date();
                const p2 = (n: number) => String(n).padStart(2, '0');
                const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
                const name = `session-${path.basename(this.file, '.jsonl').slice(0, 8)}-${stamp}.md`;
                void vscode.window.showSaveDialog({
                    defaultUri: vscode.Uri.file(path.join(dir, name)),
                    filters: { Markdown: ['md'] }
                }).then(uri => {
                    if (!uri) { return; }
                    try {
                        fs.writeFileSync(uri.fsPath, md, 'utf8');
                        this.deps.setLastExportDir?.(path.dirname(uri.fsPath));
                        void vscode.window.showTextDocument(uri);
                    } catch (e) {
                        void vscode.window.showErrorMessage(`Agent Farm: export failed — ${String(e)}`);
                    }
                });
                break;
            }
            // Quick cross-navigation between the three main surfaces.
            case 'openDashboard':
                vscode.commands.executeCommand('agentfarm.openDashboard');
                break;
            case 'openTimeline':
                vscode.commands.executeCommand('agentfarm.openTimeline');
                break;
            case 'openGuide':
                vscode.commands.executeCommand('agentfarm.openGuide', msg.anchor);
                break;
        }
    }

    private dispose(): void {
        SessionViewerPanel.open.delete(this.file);
        try { this.watcher?.close(); } catch { /* already closed */ }
        if (this.pushTimer) { clearTimeout(this.pushTimer); }
        for (const d of this.disposables) { d.dispose(); }
    }
}
