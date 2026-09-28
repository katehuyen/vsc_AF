import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import { PricingEngine } from '../core/pricing';
import { SessionIndex, SessionInfo } from '../core/sessions';
import { chainIndexNow } from '../core/chainMembership';
import { LaunchManifest } from '../core/launchManifest';
import { handleAfNav, htmlShell } from './base';
import { sessionRowPool } from './dashboard';
import { buildData as buildViewerData } from './sessionViewer';

/**
 * SESSIONS — the log of every conversation, on a page of its own.
 *
 * ‼️ WHY IT EXISTS. The sessions table was embedded in two pages and owned by
 * neither. On the Dashboard it is the last block of a board about the whole
 * farm, capped at twenty rows because everything above it also wants the
 * screen; on an agent's page it is that agent's fifty. Neither is "show me my
 * sessions" — the question the tables are most often opened for — and the only
 * way to ask it was to press All on a board that then had to ship every session
 * it had, under a chart, in a scroll position nothing remembers.
 *
 * So: the same component, the same columns, the same filters, the same
 * right-click contract — with the whole page to itself and a default of 200
 * rows, which is a few weeks of real work rather than a glance. Nothing here
 * re-implements the table; if it grows a feature, this page has it.
 */
export const SESSIONS_PAGE_TABLE_N = 200;

export interface SessionsPageDeps {
    extensionUri: vscode.Uri;
    getAgents(): AgentInfo[];
    index: SessionIndex;
    getPricing(): PricingEngine;
    /** Project name per agent name — the Project column's source, exactly as
     *  the Dashboard resolves it (see sessionRowPool). */
    agentProjects?(): Record<string, string>;
    /** A project's own colour and icon, by name. */
    projectStyle?(name: string): { icon?: string; color?: string } | undefined;
    /**
     * X-102 - the launch manifests, so a session row can say what its run was
     * SET UP to be. Optional like `projectStyle`: a page can be built before the
     * store exists, and a missing manifest degrades to a row that says nothing
     * rather than to one that guesses.
     */
    launchManifests?(): readonly LaunchManifest[];
    /**
     * ‼️ X-251 (3/n) — what the recorded sign-in is CALLED. The manifest
     * holds a slot id; the viewer and the timeline already put the label on
     * the page, so the table asks the same host for the same words rather
     * than printing a directory name.
     */
    accountLabel?(stated: string): string;
}

/** What the page opens scoped to. Everything is optional: with nothing set the
 *  page is the whole fleet, which is what the sidebar icon means. */
export interface SessionsPageScope {
    /** Pre-set the table's text filter (a project name, an agent, a phrase). */
    project?: string;
    agentName?: string;
    /**
     * ‼️ X-95 — OPEN ON ONE MISSION'S SESSIONS AND NOTHING ELSE.
     *
     * Not the same gesture as `project`, which NARROWS a list the reader is
     * already looking at. A mission's sessions are kept OUT of this page by
     * default, so opening scoped to one is the only way most of them are ever
     * seen — and "the sessions of this mission" has to mean exactly that: no
     * dialogs of your own left mixed in, or the button is a filter somebody
     * still has to finish by hand.
     */
    missionId?: string;
    /** That mission's title, for the page's own subtitle — the rows carry it too. */
    missionTitle?: string;
    /** X-111 — open with the Providers filter set to this route id (`(none)` = no route). */
    provider?: string;
    /** U-166 — open on one baton relay chain: its legs are always in the pool, its id in the text filter. */
    chain?: string;
}

/**
 * U-166 — a chain's legs are on the page however far down the top-N cut they
 * fall: the pool is built as always, then any leg it left out is added.
 */
function withChainLegs(sessions: SessionInfo[], chain: string | undefined, pool: (list: SessionInfo[]) => unknown[]): unknown[] {
    const rows = pool(sessions);
    const legs = chain ? chainIndexNow().byChain.get(chain)?.legs ?? [] : [];
    if (!legs.length) { return rows; }
    const shipped = new Set(rows.map(r => (r as { sessionId?: string }).sessionId));
    const want = new Set(legs.map(l => l.sessionId).filter(sid => !shipped.has(sid)));
    const missing = sessions.filter(s => want.has(s.sessionId));
    return missing.length ? [...rows, ...pool(missing)] : rows;
}

function buildData(
    deps: SessionsPageDeps, tableN: number, scope?: SessionsPageScope
): Record<string, unknown> {
    const now = Date.now();
    // ‼️ EVERY ENGINE (X-27). This page is the log of conversations, not a
    // measurement, and `index.all()` is claude-only by design — so the page
    // whose entire subject is "which sessions have I had" was showing one CLI's
    // and saying nothing about the rest. See SessionIndex.allWithExternal.
    const all = deps.index.allWithExternal();
    const projectByAgent = deps.agentProjects?.() ?? {};
    const sessions = scope?.agentName
        ? all.filter(s => s.agentName === scope.agentName)
        : all;
    return {
        generatedAt: now,
        agents: deps.getAgents().map(a => a.name),
        // The whole fleet's counts, so the page can say what it is showing a
        // slice OF — a table capped at 200 that does not say how many exist is
        // a table you cannot trust.
        totals: {
            sessions: sessions.length,
            active: sessions.filter(s => deps.index.isSessionActive(s, now)).length
        },
        scope: {
            project: scope?.project ?? '', agentName: scope?.agentName ?? '',
            missionId: scope?.missionId ?? '', missionTitle: scope?.missionTitle ?? '',
            provider: scope?.provider ?? '', chain: scope?.chain ?? ''
        },
        sessions: withChainLegs(sessions, scope?.chain, list => sessionRowPool(list, s => deps.index.isSessionActive(s, now), tableN,
            s => (s.agentName ? projectByAgent[s.agentName] : undefined),
            name => deps.projectStyle?.(name), deps.launchManifests?.(),
            stated => deps.accountLabel?.(stated) ?? stated)),
        sessionTableN: tableN
    };
}

export class SessionsPanel {
    private static current: SessionsPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    /** Row count chosen in the webview's Show box (0 = all). */
    private tableN = SESSIONS_PAGE_TABLE_N;
    private scope: SessionsPageScope | undefined;

    static show(deps: SessionsPageDeps, scope?: SessionsPageScope): void {
        if (SessionsPanel.current) {
            SessionsPanel.current.scope = scope ?? SessionsPanel.current.scope;
            SessionsPanel.current.panel.reveal();
            SessionsPanel.current.render();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.sessions',
            'Agent Farm — Sessions',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        SessionsPanel.current = new SessionsPanel(panel, deps, scope);
    }

    static refreshIfOpen(): void {
        SessionsPanel.current?.refresh();
    }

    private constructor(
        readonly panel: vscode.WebviewPanel,
        private deps: SessionsPageDeps,
        scope?: SessionsPageScope
    ) {
        this.scope = scope;
        this.render();
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => this.onMessage(msg), null, this.disposables);
        this.deps.index.onDidUpdate(() => this.refresh(), null, this.disposables);
    }

    private render(): void {
        this.panel.webview.html = htmlShell(
            this.panel.webview, this.deps.extensionUri, 'Agent Farm Sessions',
            buildData(this.deps, this.tableN, this.scope), 'sessionsPage.js');
    }

    refresh(): void {
        void this.panel.webview.postMessage({
            type: 'data', data: buildData(this.deps, this.tableN, this.scope)
        });
    }

    private onMessage(msg: { type: string; [k: string]: unknown }): void {
        switch (msg.type) {
            case 'openSession':
                void vscode.commands.executeCommand('agentfarm.openSession', msg.file,
                    typeof msg.ts === 'number' && msg.ts > 0 ? msg.ts : undefined);
                break;
            case 'setTableN': {
                // The pool is rebuilt host-side so the requested top-N is
                // genuine, not a re-slice of the pool that is already here.
                const n = typeof msg.n === 'number' && isFinite(msg.n) ? Math.floor(msg.n) : -1;
                if (n < 0) { break; }
                this.tableN = n;
                this.refresh();
                break;
            }
            case 'sessionTurns': {
                // On-demand per-turn breakdown for an expanded row. Only files
                // the index actually knows are readable from here — the webview
                // must not be able to point the host at an arbitrary path.
                const file = typeof msg.file === 'string' ? msg.file : '';
                if (!file || !this.deps.index.allWithExternal().some(s => s.file === file)) { break; }
                let turns: unknown = [];
                try {
                    turns = buildViewerData(file, {
                        extensionUri: this.deps.extensionUri,
                        getPricing: () => this.deps.getPricing(),
                        maxMessages: () => 1,
                        contextLimitFor: () => 0
                    }).turns;
                } catch { /* fail-soft: an unreadable file shows an empty turn list */ }
                void this.panel.webview.postMessage({ type: 'sessionTurns', file, turns });
                break;
            }
            case 'focusTerminal':
                void vscode.commands.executeCommand('agentfarm.focusSessionTerminal', {
                    sessionId: typeof msg.sessionId === 'string' && msg.sessionId ? msg.sessionId : undefined,
                    agentName: typeof msg.agentName === 'string' ? msg.agentName : undefined,
                    cwd: typeof msg.cwd === 'string' && msg.cwd ? msg.cwd : undefined
                });
                break;
            case 'pinSession':
                void vscode.commands.executeCommand('agentfarm.pinSession', {
                    sessionId: typeof msg.sessionId === 'string' ? msg.sessionId : '',
                    wantPinned: msg.pinned === true
                });
                break;
            case 'interruptSession':
                void vscode.commands.executeCommand('agentfarm.interruptSession', {
                    sessionId: typeof msg.sessionId === 'string' && msg.sessionId ? msg.sessionId : undefined,
                    agentName: typeof msg.agentName === 'string' ? msg.agentName : undefined
                });
                break;
            case 'afnav':
                handleAfNav(msg.to);
                break;
            case 'refresh':
                this.refresh();
                break;
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', msg.anchor);
                break;
        }
    }

    private dispose(): void {
        SessionsPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
