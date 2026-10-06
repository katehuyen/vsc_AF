import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { PricingEngine } from '../core/pricing';
import { SessionIndex, SessionInfo } from '../core/sessions';
import { buildTurnRows } from '../core/turns';
import { chainIndexNow } from '../core/chainMembership';
import { LaunchManifest } from '../core/launchManifest';
import type { RouteNames } from '../core/routeName';
import { askExportOptions, handleAfNav, htmlShell, wikiMarkMessage } from './base';
import { afConfig } from '../core/settingsDoor';
import { desktopHost, type PanelHost } from './panelHost';
import { buildTurnsMarkdown, identityOf, turnMessages } from './turnsExport';

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
    /** X-111 — the launch manifests, so a turn can say which route its session ran on. */
    launchManifests?(): readonly LaunchManifest[];
    /** S-137 — every route profile's one name (core/routeName.ts). */
    routeNames?(): RouteNames;
    /** U-191 — the session's project, by the Sessions table's own resolver. */
    projectOf?(s: SessionInfo): string | undefined;
    /** Export MD remembers the last folder saved to (shared with the viewer). */
    lastExportDir?(): string | undefined;
    setLastExportDir?(dir: string): void;
}

/** Default row count of the Turns table (the Show box seeds this). A turn is a
 *  much finer unit than a session, so the page opens deep by default. */
export const TURNS_TABLE_N = 200;

function buildData(deps: TurnsDeps): Record<string, unknown> {
    const now = Date.now();
    return {
        generatedAt: now,
        // ‼️ BOTH LISTS (X-35). The Turns page is the farm unrolled one row per
        // turn — a LOG, which is what `allWithExternal` is for. It read the
        // claude-only list, so no Codex turn had ever appeared on it; now that
        // the Codex parse builds real turn rollups (cliTranscripts.ts) there is
        // something on the other side of the widening.
        rows: buildTurnRows(deps.index.allWithExternal(), s => deps.index.isSessionActive(s, now),
            afConfig().get<number>('contextWindowTokens', 0), identityOf(deps.launchManifests?.(), deps.routeNames?.()), chainIndexNow(), deps.projectOf),
        tableN: TURNS_TABLE_N
    };
}

export class TurnsPanel {
    private static current: TurnsPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    /** Follows the index — see AgentDetailPanel.refreshIfOpen. */
    static refreshIfOpen(): void { TurnsPanel.current?.refresh(); }

    static show(deps: TurnsDeps): void {
        if (TurnsPanel.current) {
            TurnsPanel.current.host.reveal();
            TurnsPanel.current.refresh();
            return;
        }
        TurnsPanel.current = new TurnsPanel(desktopHost({ viewType: 'agentfarm.turns', title: 'Agent Farm — Turns' }), deps);
    }

    /** X-456 — a phone's view of the same page; never the desktop's tab. */
    static openOn(host: PanelHost, deps: TurnsDeps): TurnsPanel {
        return new TurnsPanel(host, deps);
    }

    private constructor(readonly host: PanelHost, private deps: TurnsDeps) {
        host.webview.html = htmlShell(
            host.webview,
            deps.extensionUri,
            'Agent Farm Turns',
            buildData(deps),
            'turns.js'
        );
        host.onDidDispose(() => this.dispose(), null, this.disposables);
        host.webview.onDidReceiveMessage(msg => this.onMessage(msg), null, this.disposables);
        this.deps.index.onDidUpdate(() => this.refresh(), null, this.disposables);
        // The speaker-label config lives in the HTML shell (window.__AFUI__), so a
        // settings change needs a re-render, not just a data refresh.
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('agentFarm.speakerLabelTemplate')
                || e.affectsConfiguration('agentFarm.speakerLabelCase')
                || e.affectsConfiguration('agentFarm.speakerLabelFallback')) {
                this.host.webview.html = htmlShell(
                    this.host.webview, this.deps.extensionUri, 'Agent Farm Turns',
                    buildData(this.deps), 'turns.js');
            }
        }, null, this.disposables);
    }

    refresh(): void {
        void this.host.webview.postMessage({ type: 'data', data: buildData(this.deps) });
    }

    private onMessage(msg: { type: string; [k: string]: unknown }): void {
        // The wiki tagger answers for itself, on every page that opens it (K-26).
        if (wikiMarkMessage(this.host.webview, msg)) { return; }
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
                // here — the webview must not point us at arbitrary paths. The
                // pool is the table's own (X-35): gated on the claude-only list,
                // a Codex row that the page shows simply refused to open.
                const file = typeof msg.file === 'string' ? msg.file : '';
                const n = typeof msg.n === 'number' ? Math.floor(msg.n) : 0;
                if (!file || !(n > 0) || !this.deps.index.allWithExternal().some(s => s.file === file)) { break; }
                let msgs: unknown[] = [];
                try { msgs = turnMessages(file, n, this.deps); } catch { /* fail-soft: empty panel */ }
                void this.host.webview.postMessage({ type: 'turnDetail', file, n, msgs });
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
        // Both lists (X-35) — and never the empty path an engine with no
        // readable transcript carries, which would wave through a blank `file`.
        const known = new Set(this.deps.index.allWithExternal().map(s => s.file).filter(Boolean));
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
        const firstCwd = this.deps.index.allWithExternal().find(s => s.file === shown[0].file)?.cwd;
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
        if (TurnsPanel.current === this) { TurnsPanel.current = undefined; }
        for (const d of this.disposables) { d.dispose(); }
    }
}
