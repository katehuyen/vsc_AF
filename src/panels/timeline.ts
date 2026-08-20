import * as vscode from 'vscode';
import { LiveMonitor } from '../core/live';
import { totalTokens } from '../core/pricing';
import { SessionIndex } from '../core/sessions';
import { TaskManager } from '../core/tasks';
import {
    SessionAlertPrefs, TurnAlertAction, TurnAlertBranch, TURN_ALERT_ACTIONS
} from '../core/turnAlerts';
import { handleAfNav, htmlShell } from './base';

export interface TimelineDeps {
    extensionUri: vscode.Uri;
    live: LiveMonitor;
    tasks: TaskManager;
    /** Transcripts on disk — the money/token/turn figures a hook event cannot carry. */
    index: SessionIndex;
    /** Sessions a live CLI process owns right now (the CLI's own registry). */
    liveOwners: () => { sessionId: string; pid: number; entrypoint?: string; status?: string }[];
    /** Is that registry readable at all? Without it, "no process" means nothing. */
    ownersKnown: () => boolean;
    /**
     * Session ids the Console is hosting right now, on ANY engine.
     *
     * ‼️ `liveOwners` cannot answer this: it reads Claude's own session registry,
     * so a hosted Codex or Antigravity conversation has no pid and never will.
     * The End and Interrupt actions both work on a hosted session — the host
     * closes it per engine — and this is what lets the card offer them.
     */
    hostedIds: () => string[];
    /** agentFarm.stuckThresholdMinutes in ms — the page marks silence with it. */
    stuckMs: () => number;
    /**
     * ‼️ YOUR TURN alerts, keyed by SESSION and by nothing else (U-66). The page
     * never sends the whole map back: a click is `{sessionId, action, enabled}`
     * and the host is the authority, so a stale webview cannot overwrite a
     * choice made in another window.
     */
    getSessionAlerts: () => Record<string, SessionAlertPrefs>;
    setSessionAlert: (sessionId: string, action: string, enabled: boolean)
        => { ok: boolean; error?: string; prefs?: SessionAlertPrefs };
    /** Run one session's selected alerts on purpose, after a countdown. */
    testSessionAlert: (sessionId: string, delayMs: number) => Promise<{
        ok: boolean; error?: string; sessionId: string; label?: string;
        actions?: TurnAlertAction[]; at?: number; branches?: TurnAlertBranch[];
    }>;
}

// Detail ranges (≤24h — the monitor keeps 24h in memory) render from this
// window; 3d+ density ranges are bucketed on demand from the persistent
// store (see the 'history' message).
const DATA_WINDOW_MS = 24 * 3600 * 1000;

function buildData(deps: TimelineDeps): Record<string, unknown> {
    // The hook stream knows what a session DOES; the transcript knows what it
    // cost. Joining them here is what lets a card carry the same figures as the
    // Console's own rows instead of an event count.
    //
    // ‼️ AND THE JOIN READS BOTH LISTS (X-35). `index.all()` is deliberately
    // claude-only — the side list exists so analytics never average a foreign
    // session in — but a live CARD is a log row, not an analytic, and this page
    // is the one place a person watches work happen. Joined against the narrow
    // list, every Codex, Gemini and Antigravity card on the timeline carried no
    // title, no cost, no tokens, no ctx and no model: five empty cells beside a
    // session that was plainly running. Same call the Sessions tables make.
    const rows = new Map(deps.index.allWithExternal().map(r => [r.sessionId, r]));
    const owners = deps.liveOwners();
    const ownersKnown = deps.ownersKnown();
    const hosted = new Set(deps.hostedIds());
    return {
        now: Date.now(),
        stuckMs: deps.stuckMs(),
        // Told once, on the page: "no live process" is only a claim we may make
        // when the CLI's registry is actually readable.
        ownersKnown,
        listener: {
            state: deps.live.listenerState,
            port: deps.live.activePort
        },
        sessions: deps.live.sessions().map(s => {
            const row = rows.get(s.sessionId);
            const owner = owners.find(o => o.sessionId === s.sessionId);
            return {
                sessionId: s.sessionId,
                // The turn-action maps are keyed by this exact string, so the
                // fallback stays the raw 8 hex chars; `resolved` tells the page
                // it is a session id and not somebody's agent.
                agentName: s.agentName ?? s.sessionId.slice(0, 8),
                resolved: !!s.agentName,
                // "name #k" when the agent runs several sessions at once.
                label: deps.live.labelOf(s),
                source: s.source,
                status: s.status,
                currentTool: s.currentTool,
                lastPrompt: s.lastPrompt,
                startedAt: s.startedAt,
                lastEventTs: s.lastEventTs,
                prompts: s.prompts,
                toolCalls: s.toolCalls,
                compactions: s.compactions,
                subagentStops: s.subagentStops,
                errors: s.errors,
                cwd: s.cwd ?? '',
                /**
                 * ‼️ X-41 — AND THE PATH COMES FROM THE RECORD WHEN THE HOOK
                 * COULD NOT CARRY ONE.
                 *
                 * `LiveSession.transcriptPath` is `transcript_path` off a Claude
                 * hook payload, and only Claude sends one. Every other engine
                 * reaches this page through the Console mirror
                 * (`mirrorConsoleToLive`), which has a thread id and a cwd and
                 * no file — so the lane, its tool bars and its marks were all
                 * drawn with an empty `data-file` and clicking any of them did
                 * nothing, on a page where the Claude lane beside it opened the
                 * transcript at the exact line. Not a structural limit: the
                 * record has known where a foreign conversation lives on disk
                 * since the external pool existed, and this join already reads
                 * it for the title, the cost and the tokens (X-35). It was one
                 * field short.
                 *
                 * The hook's own answer still wins where there is one — it is
                 * first-hand and it is current. Where there is no record yet
                 * (a Codex thread whose rollout file the scan has not seen)
                 * this is empty, exactly as it was, and the page draws no link
                 * rather than a dead one.
                 */
                transcriptPath: s.transcriptPath || row?.file || undefined,
                // From the transcript (absent until the session's first turn lands).
                title: row?.title ?? '',
                firstPrompt: s.firstPrompt || row?.firstPrompt || '',
                projectId: row?.projectId ?? '',
                cost: row?.cost ?? 0,
                tokens: row ? totalTokens(row.usage) : 0,
                wTokens: row ? Math.round(row.wTokens) : 0,
                ctxTokens: row?.lastCtxTokens ?? 0,
                turns: row?.userTurns ?? 0,
                model: row?.models?.length ? row.models[row.models.length - 1] : '',
                filesEdited: row ? Object.keys(row.filesEdited ?? {}).length : 0,
                // The honest answer to "is this thing still running?" — a pid the
                // OS confirms, or nothing.
                owner: owner
                    ? { pid: owner.pid, entrypoint: owner.entrypoint ?? '', status: owner.status ?? '' }
                    : null,
                // Agent Farm's Console owns this conversation, so it can be ended
                // and interrupted whatever engine it runs on — see hostedIds.
                hosted: hosted.has(s.sessionId)
            };
        }),
        events: deps.live.events(DATA_WINDOW_MS),
        workflowRuns: deps.tasks.workflowRuns(DATA_WINDOW_MS),
        // sessionId → the actions THAT session alerts with. A row with no entry
        // alerts on nothing; there is no agent-level default underneath it.
        sessionAlerts: Object.fromEntries(
            Object.entries(deps.getSessionAlerts()).map(([id, p]) => [id, p.actions])),
        alertActions: [...TURN_ALERT_ACTIONS]
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

    /** Redraw if the page is open — for facts that change somewhere else (a
     *  session pinned or labelled from another surface). Never opens it. */
    static refreshIfOpen(): void {
        TimelinePanel.current?.refresh();
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
        // ‼️ AND THE INDEX, BECAUSE HALF OF WHAT A CARD SAYS COMES FROM IT
        // (X-35). The hook stream drove the only refresh, so a rename — the one
        // thing this page offers a button for — showed nothing until some
        // unrelated event happened to arrive, and on an engine that emits no
        // hook events it showed nothing at all. Title, cost, tokens, ctx and
        // model are all read off the transcript row below; the page follows the
        // index for the same reason every other page does.
        this.deps.index.onDidUpdate(throttledRefresh, null, this.disposables);
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
                    // ts = clicked mark/segment time — the viewer scrolls right there.
                    void vscode.commands.executeCommand('agentfarm.openSession', msg.file,
                        typeof msg.ts === 'number' && msg.ts > 0 ? msg.ts : undefined);
                }
                break;
            case 'focusTerminal':
                void vscode.commands.executeCommand('agentfarm.focusSessionTerminal', {
                    sessionId: typeof msg.sessionId === 'string' && msg.sessionId ? msg.sessionId : undefined,
                    agentName: typeof msg.agentName === 'string' ? msg.agentName : undefined
                });
                break;
            case 'interruptSession':
                void vscode.commands.executeCommand('agentfarm.interruptSession', {
                    sessionId: typeof msg.sessionId === 'string' && msg.sessionId ? msg.sessionId : undefined,
                    agentName: typeof msg.agentName === 'string' ? msg.agentName : undefined
                });
                break;
            case 'endSession':
                void vscode.commands.executeCommand('agentfarm.endSession', {
                    sessionId: typeof msg.sessionId === 'string' ? msg.sessionId : '',
                    agentName: typeof msg.agentName === 'string' ? msg.agentName : undefined
                });
                break;
            case 'dismissSession':
                void vscode.commands.executeCommand('agentfarm.dismissSession', {
                    sessionId: typeof msg.sessionId === 'string' ? msg.sessionId : '',
                    agentName: typeof msg.agentName === 'string' ? msg.agentName : undefined
                });
                break;
            case 'clearGone':
                void vscode.commands.executeCommand('agentfarm.dismissSession', { gone: true });
                break;
            case 'renameSession':
                void vscode.commands.executeCommand('agentfarm.renameSession', {
                    sessionId: typeof msg.sessionId === 'string' ? msg.sessionId : '',
                    title: typeof msg.title === 'string' ? msg.title : ''
                });
                break;
            case 'revealFolder':
                if (typeof msg.cwd === 'string' && msg.cwd) {
                    void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(msg.cwd));
                }
                break;
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', msg.anchor);
                break;
            case 'openDashboard':
                void vscode.commands.executeCommand('agentfarm.openDashboard');
                break;
            case 'afnav':
                handleAfNav(msg.to);
                break;
            case 'refresh':
                this.refresh();
                break;
            case 'setTurnAlert': {
                // ‼️ ONE SESSION, ONE ACTION, ONE BOOLEAN — never the map. The
                // host validates the action against its own allowlist and that
                // the session is really being watched; a webview that has been
                // sitting behind another tab cannot write back a whole stale
                // world on the strength of one click.
                const sessionId = typeof msg.sessionId === 'string' ? msg.sessionId : '';
                const action = typeof msg.action === 'string' ? msg.action : '';
                const r = this.deps.setSessionAlert(sessionId, action, !!msg.enabled);
                if (!r.ok) {
                    void vscode.window.showWarningMessage(
                        `Agent Farm: that alert change was refused — ${r.error ?? 'unknown reason'}.`);
                }
                this.refresh();
                break;
            }
            case 'testTurnAlert': {
                const sessionId = typeof msg.sessionId === 'string' ? msg.sessionId : '';
                const delayMs = typeof msg.delayMs === 'number' ? msg.delayMs : 3000;
                // The countdown runs in the HOST, so the user can leave this
                // window entirely and still see whether focus really came back.
                void this.deps.testSessionAlert(sessionId, delayMs).then(result => {
                    void this.panel.webview.postMessage({ type: 'alertTest', result });
                });
                break;
            }
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
