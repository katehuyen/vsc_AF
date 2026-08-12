import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { PricingEngine } from '../core/pricing';
import { SessionIndex } from '../core/sessions';
import { buildTurnRows, TurnRow } from '../core/turns';
import { normalizeSpeakerConfig, renderSpeaker } from '../core/speaker';
import { fmtDuration, fmtStepPair } from '../core/util';
import { askExportOptions, handleAfNav, htmlShell } from './base';
import { buildData as buildViewerData } from './sessionViewer';
import { full as afFull } from '../core/aftime';

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
    /** Export MD remembers the last folder saved to (shared with the viewer). */
    lastExportDir?(): string | undefined;
    setLastExportDir?(dir: string): void;
}

/** Default row count of the Turns table (the Show box seeds this). A turn is a
 *  much finer unit than a session, so the page opens deep by default. */
export const TURNS_TABLE_N = 200;

interface TurnMsg {
    role: string; text: string; tool: string; input: string;
    isError: boolean; sidechain: boolean; model: string;
}

function buildData(deps: TurnsDeps): Record<string, unknown> {
    const now = Date.now();
    return {
        generatedAt: now,
        // ‼️ BOTH LISTS (X-35). The Turns page is the farm unrolled one row per
        // turn — a LOG, which is what `allWithExternal` is for. It read the
        // claude-only list, so no Codex turn had ever appeared on it; now that
        // the Codex parse builds real turn rollups (cliTranscripts.ts) there is
        // something on the other side of the widening.
        rows: buildTurnRows(deps.index.allWithExternal(), s => deps.index.isSessionActive(s, now)),
        tableN: TURNS_TABLE_N
    };
}

/** One turn's messages. clip/cap keep the on-screen fold light; export passes
 *  generous limits so the Markdown is complete. */
function turnMessages(file: string, n: number, deps: TurnsDeps, clip = 1500, cap = 150): TurnMsg[] {
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
    const out: TurnMsg[] = msgs.slice(0, cap).map(m => ({
        role: m.role,
        text: (m.text ?? '').slice(0, clip),
        tool: m.tool ?? '',
        input: (m.input ?? '').slice(0, clip),
        isError: !!m.isError,
        sidechain: !!m.sidechain,
        model: m.model ?? ''
    }));
    if (msgs.length > cap) {
        out.push({
            role: 'system', text: `… ${msgs.length - cap} more messages — open the transcript for the rest`,
            tool: '', input: '', isError: false, sidechain: false, model: ''
        });
    }
    return out;
}

/** The webview's content-Show chips, mirrored so export honors the same filter. */
function msgMatchesRoles(m: TurnMsg, roles: string[]): boolean {
    if (m.role === 'system') { return true; }      // our own "… N more" note
    if (!roles.length) { return true; }            // empty = show everything
    return roles.some(r =>
        r === 'error' ? m.isError
            : r === 'user' ? m.role === 'user'
                : r === 'assistant' ? m.role === 'assistant'
                    : r === 'tool' ? m.role === 'tool'
                        : r === 'toolResult' ? m.role === 'toolResult'
                            : false);
}

const mdFence = (s: string) => s.includes('```') ? '````' : '```';

/**
 * Build the Turns-page Markdown. `shown` is the exact ordered list the webview
 * lists (post filter/sort/Show), `open` the unfolded ones, `roles` the content
 * Show selection. view=false exports every listed turn's full content; view=true
 * exports open turns' content (roles-filtered) and, per foldedTitles, either a
 * header-only line for folded turns or nothing.
 */
export function buildTurnsMarkdown(
    deps: TurnsDeps,
    shown: { file: string; n: number }[],
    openKeys: Set<string>,
    roles: string[],
    opts: { view: boolean; foldedTitles: boolean }
): string {
    const rowByKey = new Map<string, TurnRow>();
    const now = Date.now();
    for (const r of buildTurnRows(deps.index.all(), s => deps.index.isSessionActive(s, now))) {
        rowByKey.set(r.file + '#' + r.n, r);
    }
    const sc = vscode.workspace.getConfiguration('agentFarm');
    const speakerCfg = normalizeSpeakerConfig({
        template: sc.get('speakerLabelTemplate'),
        casing: sc.get('speakerLabelCase'),
        fallback: sc.get('speakerLabelFallback')
    });
    const lines: string[] = ['# Agent Farm — Turns export', ''];
    lines.push(`- Generated: ${afFull(Date.now())}`);
    lines.push(opts.view
        ? `- Export: current view · ${shown.length} listed turn(s) · open turns' content shown${roles.length ? ` (show: ${roles.join(', ')})` : ''} · folded turns ${opts.foldedTitles ? 'as titles only' : 'omitted'}`
        : `- Export: everything · ${shown.length} listed turn(s), each with its full content`);
    lines.push('', '---');

    let emitted = 0;
    for (const ref of shown) {
        const key = ref.file + '#' + ref.n;
        const r = rowByKey.get(key);
        if (!r) { continue; }
        const isOpen = openKeys.has(key);
        // In view mode, a folded turn is either a title line or skipped.
        if (opts.view && !isOpen && !opts.foldedTitles) { continue; }
        emitted++;

        // The same figures the table shows, in the same words — an export that
        // describes a turn differently from the row it came from is a second,
        // quieter answer to the same question.
        const meta = [
            r.models.map(m => m.replace(/^claude-/, '')).join(', '),
            r.steps || r.apiCalls ? fmtStepPair(r.apiCalls, r.steps) : '',
            r.ms ? `took ${fmtDuration(r.ms)}` : '',
            r.tokens ? `${r.tokens} tok` : '',
            r.endCtx ? `ctx ${r.endCtx}` : '',
            r.cost ? `$${r.cost.toFixed(r.cost >= 1 ? 2 : 4)}` : '',
            r.tools ? `${r.tools} tools` : '',
            r.errors ? `${r.errors} err` : '',
            r.ts ? afFull(r.ts) : ''
        ].filter(Boolean).join(' · ');
        lines.push('', `## ${r.agentName || '?'} · turn ${r.n}/${r.of} — ${r.label || '(no prompt)'}`);
        lines.push(`*session: ${r.session}${meta ? ' · ' + meta : ''}*`);

        const wantContent = opts.view ? isOpen : true;
        if (!wantContent) { continue; }
        const msgs = turnMessages(ref.file, ref.n, deps, 4000, 400)
            .filter(m => opts.view ? msgMatchesRoles(m, roles) : true);
        for (const m of msgs) {
            const bits = [m.model ? m.model.replace(/^claude-/, '') : '', m.sidechain ? 'subagent' : '', m.isError ? '⚠ ERROR' : ''].filter(Boolean).join(' · ');
            if (m.role === 'tool') {
                const f = mdFence(m.input || '');
                lines.push('', `**TOOL CALL — ${m.tool || '?'}**${bits ? ' (' + bits + ')' : ''}`, '', f + 'json', m.input || '', f);
            } else if (m.role === 'toolResult') {
                const f = mdFence(m.text || '');
                lines.push('', `**TOOL RESULT**${bits ? ' (' + bits + ')' : ''}`, '', f, m.text || '(empty result)', f);
            } else {
                const roleLabel = m.role === 'assistant'
                    ? renderSpeaker(m.model, true, speakerCfg)
                    : ({ user: 'USER', system: 'NOTE' } as Record<string, string>)[m.role] || m.role.toUpperCase();
                lines.push('', `**${roleLabel}**${bits ? ' (' + bits + ')' : ''}`, '', m.text || '');
            }
        }
    }
    if (!emitted) { lines.push('', '_No turns matched the export selection._'); }
    lines.push('');
    return lines.join('\n');
}

export class TurnsPanel {
    private static current: TurnsPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    /** Follows the index — see AgentDetailPanel.refreshIfOpen. */
    static refreshIfOpen(): void { TurnsPanel.current?.refresh(); }

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
        // The speaker-label config lives in the HTML shell (window.__AFUI__), so a
        // settings change needs a re-render, not just a data refresh.
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('agentFarm.speakerLabelTemplate')
                || e.affectsConfiguration('agentFarm.speakerLabelCase')
                || e.affectsConfiguration('agentFarm.speakerLabelFallback')) {
                this.panel.webview.html = htmlShell(
                    this.panel.webview, this.deps.extensionUri, 'Agent Farm Turns',
                    buildData(this.deps), 'turns.js');
            }
        }, null, this.disposables);
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
                try { msgs = turnMessages(file, n, this.deps); } catch { /* fail-soft: empty panel */ }
                void this.panel.webview.postMessage({ type: 'turnDetail', file, n, msgs });
                break;
            }
            case 'exportChoose':
                // Ask the two Export-MD questions, then build the markdown host-side
                // (the host has every transcript — the webview needn't cache them).
                void this.exportMd(msg);
                break;
        }
    }

    /** Export-MD prompt → build → save dialog. `msg` carries the webview's shown
     *  turn list, the open (unfolded) keys and the content-Show selection. */
    private async exportMd(msg: { type: string; [k: string]: unknown }): Promise<void> {
        const rawShown = Array.isArray(msg.shown) ? msg.shown : [];
        const known = new Set(this.deps.index.all().map(s => s.file));
        const shown = rawShown
            .map(x => x as { file?: unknown; n?: unknown })
            .filter(x => typeof x.file === 'string' && known.has(x.file) && typeof x.n === 'number' && x.n > 0)
            .map(x => ({ file: x.file as string, n: Math.floor(x.n as number) }));
        if (!shown.length) {
            void vscode.window.showInformationMessage('Agent Farm: no turns to export.');
            return;
        }
        const openKeys = new Set(Array.isArray(msg.open) ? msg.open.filter(k => typeof k === 'string') as string[] : []);
        const roles = Array.isArray(msg.roles) ? msg.roles.filter(r => typeof r === 'string') as string[] : [];
        const hasFolded = shown.some(r => !openKeys.has(r.file + '#' + r.n));
        const opts = await askExportOptions('folded turns', hasFolded);
        if (!opts) { return; }

        let md = '';
        try { md = buildTurnsMarkdown(this.deps, shown, openKeys, roles, opts); }
        catch (e) { void vscode.window.showErrorMessage(`Agent Farm: export failed — ${String(e)}`); return; }

        const remembered = this.deps.lastExportDir?.();
        const firstCwd = this.deps.index.all().find(s => s.file === shown[0].file)?.cwd;
        const dir = remembered && fs.existsSync(remembered) ? remembered
            : firstCwd && fs.existsSync(firstCwd) ? firstCwd
                : os.homedir();
        const d = new Date();
        const p2 = (n: number) => String(n).padStart(2, '0');
        const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(dir, `turns-${stamp}.md`)),
            filters: { Markdown: ['md'] }
        });
        if (!uri) { return; }
        try {
            fs.writeFileSync(uri.fsPath, md, 'utf8');
            this.deps.setLastExportDir?.(path.dirname(uri.fsPath));
            void vscode.window.showTextDocument(uri);
        } catch (e) {
            void vscode.window.showErrorMessage(`Agent Farm: export failed — ${String(e)}`);
        }
    }

    private dispose(): void {
        TurnsPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
