import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import { ConsoleHost } from '../core/consolehost';
import { carriedTotals, ConsoleMessage, PERMISSION_GRANTS } from '../core/consoleproto';
import {
    filterResumable, isResumeFiltered, RESUME_DEFAULT_N, RESUME_MAX, ResumeQuery
} from '../core/consoleresume';
import { EFFORT_CHOICES, modelChoices, PERMISSION_CHOICES } from '../core/launch';
import { totalTokens, Usage } from '../core/pricing';
import { SessionInfo, SessionIndex, sessionOrigin } from '../core/sessions';
import { handleAfNav, htmlShell } from './base';

/**
 * DALGA 1 — the Console: the panel stops being a window onto the terminal and
 * becomes a place you can talk in.
 *
 * Left: the sessions this window is hosting, plus your shelf and the recent
 * transcripts (a click resumes one *into* the Console). Right: the
 * conversation and a composer whose controls are the launcher's own vocabulary
 * — agent · model · effort · permission mode — except that here the permission
 * mode is live: when a tool is refused, the same control grants it and the
 * agent retries. Nothing about this is a mock: every row comes from a real
 * `claude` process this window owns.
 */

export interface ConsoleDeps {
    extensionUri: vscode.Uri;
    host: ConsoleHost;
    getAgents(): AgentInfo[];
    index: SessionIndex;
    modelAliases(): string[];
    launchDefaults(): { model?: string; effort?: string; permissionMode?: string };
    /**
     * Which sessions a live process already owns (the CLI's own registry).
     *
     * This is what stops the Console from telling a lie: `claude --resume <id>`
     * on a session that is already open in a terminal starts a SECOND process
     * on the same transcript. Both write to it, neither sees the other's
     * turns, and Agent Farm would show the interleaved result as one
     * conversation that no participant actually had.
     */
    liveOwners(): { sessionId: string; pid: number; entrypoint?: string; status?: string; cwd?: string }[];
    /** the conversation a session already had, off its transcript — display
     *  only, so a resume opens where you left off instead of on a blank page */
    history(sessionId: string): ConsoleMessage[];
    /**
     * The sessions the PREVIOUS window was hosting when it went away.
     *
     * A hosted process belongs to its window: when VS Code closes (or crashes,
     * or the extension reloads) the conversation ends — leaving it running
     * orphaned is the leak 3.29.1 was about. What must not end with it is
     * knowing where you were: these rows put the sessions you were actually in
     * back on top of the Console, one click from continuing.
     */
    lastWindow(): { sessionId: string; agentName: string; title: string; cwd: string; endedAt: number }[];
    /** take a row off that shelf (resumed, or not wanted) */
    forgetLastWindow(sessionId: string): void;
    /**
     * Is this session held by a `claude` OUR Console started and nobody is
     * reading any more — an extension reload's leftover? See the extension's
     * `leftoverOwner`: it is the one owner a resume can honestly offer to end.
     */
    leftoverOwner(sessionId: string): { pid: number } | undefined;
    /** end that leftover, resolving once the session is really free */
    endLeftover(sessionId: string, pid: number): Promise<boolean>;
    /**
     * What the tokens a running turn has spent are worth, at the rates the rest
     * of the extension prices everything else with.
     *
     * The CLI only says what a turn cost once the turn has ENDED, so without
     * this the live strip could show the time and the tokens and then go silent
     * on the one number the user actually asks ("was that worth it?"). It is an
     * estimate and is marked as one; the line that closes the turn carries the
     * CLI's own figure, and every session total on this page is the CLI's.
     */
    estimateCost(model: string, usage: Usage): number;
}

export class ConsolePanel {
    private static current?: ConsolePanel;
    private disposables: vscode.Disposable[] = [];
    private selected?: string;
    /** agent to preselect in the composer (opened from an agent row) */
    private presetAgent?: string;
    /**
     * Is the resume list open, and what is it being asked for?
     *
     * Both live here rather than in the page because the ANSWER is built here:
     * the page can only filter what it was sent, and the whole point of the
     * filter is to reach a session that is not in the newest fifteen. When the
     * section is closed nothing is computed at all — this snapshot is rebuilt
     * on every event of every hosted session.
     */
    private resumeOpen = false;
    private resumeQuery: ResumeQuery = {};

    static show(deps: ConsoleDeps, opts?: { sessionId?: string; agentId?: string }): void {
        if (ConsolePanel.current) {
            ConsolePanel.current.panel.reveal();
            if (opts?.sessionId) { ConsolePanel.current.selected = opts.sessionId; }
            if (opts?.agentId) {
                // "talk to THIS agent": composer mode, nothing spawned yet
                ConsolePanel.current.presetAgent = opts.agentId;
                ConsolePanel.current.selected = '';
            }
            ConsolePanel.current.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.console', 'Console', vscode.ViewColumn.Active,
            { enableScripts: true, retainContextWhenHidden: true });
        ConsolePanel.current = new ConsolePanel(panel, deps);
        if (opts?.sessionId) { ConsolePanel.current.selected = opts.sessionId; }
        if (opts?.agentId) {
            ConsolePanel.current.presetAgent = opts.agentId;
            ConsolePanel.current.selected = '';
        }
        ConsolePanel.current.refresh();
    }

    /** Live update while the panel is open (the host fires on every event). */
    static refreshIfOpen(): void {
        ConsolePanel.current?.refresh();
    }

    /**
     * Is the user looking at THIS conversation right now?
     *
     * The turn-finished notice exists for turns you are not watching; firing it
     * for the one on your screen would be the extension telling you what you
     * can already see, which is how a useful notice becomes noise.
     */
    static isWatching(hostId: string): boolean {
        const c = ConsolePanel.current;
        return !!c && c.panel.visible && c.selected === hostId;
    }

    private constructor(private panel: vscode.WebviewPanel, private deps: ConsoleDeps) {
        panel.webview.html = htmlShell(panel.webview, deps.extensionUri,
            'Console', this.data(), 'console.js');
        panel.webview.onDidReceiveMessage(m => void this.onMessage(m), null, this.disposables);
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.disposables.push(deps.host.onChange(() => this.refresh()));
    }

    private data(): Record<string, unknown> {
        const hosted = this.deps.host.list();
        if (this.selected && !hosted.some(s => s.id === this.selected)) { this.selected = undefined; }
        // An explicit "new session" (selected === '') is respected; only an
        // unset selection falls back to the newest hosted session.
        if (this.selected === undefined && hosted.length) { this.selected = hosted[0].id; }
        const d = this.deps.launchDefaults();
        const preset = this.presetAgent;
        this.presetAgent = undefined;   // one-shot: it seeds the picker once
        return {
            generatedAt: Date.now(),
            selected: this.selected ?? '',
            presetAgent: preset ?? '',
            // the conversation of the selected session in full; the others as headers
            sessions: hosted.map(s => ({
                id: s.id, agentId: s.agentId, agentName: s.agentName,
                sessionId: s.sessionId ?? '', cwd: s.cwd,
                // the session's own title — the same one the side panel and the
                // viewer show, so a rename anywhere is a rename everywhere
                title: (s.sessionId
                    ? this.deps.index.all().find(x => x.sessionId === s.sessionId)?.title
                    : undefined) ?? '',
                status: s.status, cost: s.costUSD, turns: s.turns,
                // the texts themselves, not a count: a message that is waiting
                // is not in the conversation yet, so the composer has to show it
                queued: s.queued,
                tokens: s.tokens, model: s.model ?? '', effort: s.effort ?? '',
                permissionMode: s.permissionMode,
                contextTokens: s.contextTokens ?? 0, lastTs: s.lastTs,
                // the working strip counts from here
                turnStartedAt: s.turnStartedAt ?? 0,
                // …and says what THIS TURN has spent, while it is still running:
                // the session's totals belong under the composer, a turn is the
                // unit you are watching. The money is an estimate — see
                // ConsoleDeps.estimateCost.
                turnTokens: s.turnTokensAt !== undefined ? Math.max(0, s.tokens - s.turnTokensAt) : 0,
                turnCost: s.turnUsage ? this.deps.estimateCost(s.model ?? '', s.turnUsage) : 0,
                // …and what it is thinking WITH. Not `model`/`effort` above: a
                // switch applies from the next turn, so the pickers and the
                // running turn can legitimately disagree (see turnModel).
                turnModel: s.turnModel ?? '', turnEffort: s.turnEffort ?? '',
                // …and once it is over, the same strip keeps saying what it cost
                // until your next prompt starts a new turn (see lastTurn)
                lastTurn: s.lastTurn ?? null,
                pendingPermission: s.pendingPermission ?? null,
                // the question the turn is parked on — the card and the composer
                // both need it, and it outranks everything else on the page
                pendingAsk: s.pendingAsk ?? null,
                exitReason: s.exitReason ?? '',
                messages: s.id === this.selected ? s.messages.slice(-400) : []
            })),
            agents: this.deps.getAgents().map(a => ({ id: a.id, name: a.name, dir: a.dir })),
            models: modelChoices(this.deps.modelAliases()),
            efforts: EFFORT_CHOICES,
            permissions: PERMISSION_CHOICES,
            grants: PERMISSION_GRANTS,
            defaults: { model: d.model ?? '', effort: d.effort ?? '', permissionMode: d.permissionMode ?? '' },
            // sessions a live process owns right now — the resume list marks
            // them instead of offering a second process on the same transcript
            owned: this.deps.liveOwners().map(o => o.sessionId),
            // where you were when the last window went away (see lastWindow) —
            // minus anything already running here again
            lastWindow: this.deps.lastWindow()
                .filter(r => !hosted.some(h => h.sessionId === r.sessionId
                    && h.status !== 'ended' && h.status !== 'error')),
            // the shelf + the transcripts the query asks for (see resumeList)
            ...this.resumeList()
        };
    }

    /**
     * The resume list: what it shows, how much of it there is, and who is in it.
     *
     * Closed, this costs nothing — and closed is the normal state, so the
     * snapshot a streaming turn rebuilds ten times a second stays small. Open,
     * it is one pass over the index with the page's own query applied
     * (`core/consoleresume.ts`), which is the same work the unfiltered version
     * always did.
     */
    private resumeList(): Record<string, unknown> {
        if (!this.resumeOpen) {
            return {
                resumable: [], resumeTotal: 0, resumeAgents: [], resumeMax: RESUME_MAX,
                resumeDefaultN: RESUME_DEFAULT_N, resumeFiltered: isResumeFiltered(this.resumeQuery)
            };
        }
        const pool = this.deps.index.all()
            .filter(s => !s.isSidechain && !s.machine && s.cwd)
            .map(s => ({
                s, title: s.title, agentName: s.agentName ?? '', tags: s.tags ?? [],
                pinned: !!s.pinned, sessionId: s.sessionId,
                ts: s.lastTs || s.mtime, origin: sessionOrigin(s)
            }));
        // Every agent that has a session to resume — including agents no longer
        // in the fleet, which is exactly when you go looking for an old session.
        const agents = [...new Set(pool.map(r => r.agentName).filter(Boolean))].sort();
        const hit = filterResumable(pool, this.resumeQuery, Date.now());
        return {
            resumable: hit.rows.map(r => this.resumeRow(r.s)),
            resumeTotal: hit.total,
            resumeAgents: agents,
            resumeMax: RESUME_MAX,
            resumeDefaultN: RESUME_DEFAULT_N,
            resumeFiltered: isResumeFiltered(this.resumeQuery)
        };
    }

    private resumeRow(s: SessionInfo): Record<string, unknown> {
        return {
            sessionId: s.sessionId, title: s.title, agentName: s.agentName ?? '',
            cwd: s.cwd ?? '', pinned: !!s.pinned, ts: s.lastTs || s.mtime, cost: s.cost,
            // what the session spent — the figure the card leads with, because
            // "$0.03" alone does not say whether that was haiku or opus
            tokens: totalTokens(s.usage),
            // "Ctx now" — the same figure the sessions tables show, so a row
            // says what resuming it would cost you in window before you do
            contextTokens: s.lastCtxTokens ?? 0
        };
    }

    refresh(): void {
        const data = this.data();
        // The tab says how many conversations are waiting for you, so the nudge
        // reaches you with the Console in the background — the one place a
        // count is useful and can never be in the way.
        const waiting = (data.sessions as { status: string; turns: number; queued: string[] }[])
            .filter(s => s.status === 'idle' && s.turns > 0 && !s.queued.length).length;
        const title = waiting ? `Console (${waiting})` : 'Console';
        if (this.panel.title !== title) { this.panel.title = title; }
        void this.panel.webview.postMessage({ type: 'data', data });
    }

    private agentById(id: string): AgentInfo | undefined {
        return this.deps.getAgents().find(a => a.id === id);
    }

    private async onMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
        const host = this.deps.host;
        const str = (k: string) => (typeof msg[k] === 'string' ? msg[k] as string : '');
        const idx = (k: string) => (typeof msg[k] === 'number' ? Math.floor(msg[k] as number) : -1);
        switch (msg.type) {
            case 'refresh': this.refresh(); break;
            case 'select':
                this.selected = str('id');
                this.refresh();
                break;
            case 'start': {
                const agent = this.agentById(str('agentId'));
                if (!agent) {
                    void vscode.window.showWarningMessage('Agent Farm: pick an agent first.');
                    return;
                }
                const d = this.deps.launchDefaults();
                this.selected = host.start({
                    agentId: agent.id, agentName: agent.name, cwd: agent.dir,
                    model: str('model') || d.model,
                    effort: str('effort') || d.effort,
                    permissionMode: str('permissionMode') || d.permissionMode,
                    firstPrompt: str('text') || undefined
                });
                this.refresh();
                break;
            }
            case 'resume': {
                const sessionId = str('sessionId');
                const row = this.deps.index.all().find(s => s.sessionId === sessionId);
                if (!row?.cwd) { return; }
                // ‼️ First: is the thing holding it OUR OWN leftover?
                //
                // An extension reload leaves the hosted `claude` running with
                // nobody on the other end of the pipe. Everything downstream
                // then behaves correctly and traps you: the timeline draws it
                // as running (it is), the resume is refused (it must be), and
                // the shelf keeps offering "continue" on a conversation that
                // can never be continued. The way out is to end that leftover
                // — asked for explicitly, because it stops a real process.
                const leftover = this.deps.leftoverOwner(sessionId);
                if (leftover) {
                    const go = await vscode.window.showWarningMessage(
                        `"${row.title}" is still running from an earlier window of Agent Farm (pid ${leftover.pid}) — nothing is reading it.`,
                        {
                            modal: true,
                            detail: 'Claude Code cannot join a running session, so this conversation cannot be picked up while that process holds it.\n\n'
                                + 'Agent Farm can end the leftover and continue here: the transcript stays on disk and everything that was said comes back with it. Only whatever it was doing this second is lost.'
                        },
                        'End it and continue here');
                    if (go !== 'End it and continue here') { return; }
                    if (!await this.deps.endLeftover(sessionId, leftover.pid)) {
                        void vscode.window.showWarningMessage(
                            `Agent Farm: pid ${leftover.pid} is still holding that session — nothing was resumed. Stop it by hand and try again.`);
                        return;
                    }
                }
                // The guard that makes "same session" true instead of a story:
                // if a process already owns this session id, resuming would
                // start a second one on the same transcript.
                const owner = this.deps.liveOwners().find(o => o.sessionId === sessionId);
                if (owner) {
                    const where = owner.entrypoint === 'sdk-cli'
                        ? 'a program (a Console session or a headless run)'
                        : 'a terminal';
                    const choice = await vscode.window.showWarningMessage(
                        `That session is open right now in ${where} (pid ${owner.pid}).\n\n` +
                        'Claude Code cannot join a running session: resuming it here would start a SECOND process on the same transcript. ' +
                        'Both would write to it and neither would see the other\'s turns — it would look like one conversation that nobody actually had.',
                        { modal: true },
                        'Jump to that terminal', 'New session in the same folder');
                    if (choice === 'Jump to that terminal') {
                        void vscode.commands.executeCommand('agentfarm.focusSessionTerminal',
                            { sessionId, agentName: row.agentName, cwd: row.cwd });
                        return;
                    }
                    if (choice !== 'New session in the same folder') { return; }
                    const agentForNew = this.deps.getAgents().find(a => a.name === row.agentName);
                    const dn = this.deps.launchDefaults();
                    this.selected = host.start({
                        agentId: agentForNew?.id ?? '', agentName: row.agentName ?? 'session',
                        cwd: row.cwd,
                        model: str('model') || dn.model,
                        effort: str('effort') || dn.effort,
                        permissionMode: str('permissionMode') || dn.permissionMode
                    });
                    this.refresh();
                    return;
                }
                const agent = this.deps.getAgents().find(a => a.name === row.agentName);
                const d = this.deps.launchDefaults();
                this.selected = host.start({
                    agentId: agent?.id ?? '', agentName: row.agentName ?? 'session',
                    cwd: row.cwd, resume: sessionId,
                    model: str('model') || d.model,
                    effort: str('effort') || d.effort,
                    permissionMode: str('permissionMode') || d.permissionMode,
                    // resume means CONTINUE: what was said comes back with it
                    history: this.deps.history(sessionId),
                    // …and so does what it cost, or the composer's line would
                    // describe this window's process instead of the session
                    carried: carriedTotals(row)
                });
                // it is running again — it is no longer somewhere you "were"
                this.deps.forgetLastWindow(sessionId);
                this.refresh();
                break;
            }
            case 'forgetLastWindow':
                this.deps.forgetLastWindow(str('sessionId'));
                this.refresh();
                break;
            // The page owns the controls, the host owns the answer: it can see
            // every session, the page only what it was sent.
            case 'resumeQuery': {
                const q = (msg.query ?? {}) as ResumeQuery;
                this.resumeOpen = msg.open === true;
                this.resumeQuery = {
                    text: typeof q.text === 'string' ? q.text : '',
                    agent: typeof q.agent === 'string' ? q.agent : '',
                    when: typeof q.when === 'string' ? q.when : '',
                    from: typeof q.from === 'string' ? q.from : '',
                    to: typeof q.to === 'string' ? q.to : '',
                    pinnedOnly: q.pinnedOnly === true,
                    userOnly: q.userOnly === true,
                    limit: typeof q.limit === 'number' ? q.limit : undefined
                };
                this.refresh();
                break;
            }
            case 'send': {
                // `hold` is the composer's Hold button: park it instead of
                // saying it into the running turn (see acceptUserText).
                const r = host.send(str('id'), str('text'), msg.hold === true);
                if (!r) {
                    void vscode.window.showWarningMessage(
                        'Agent Farm: that session has ended — start a new one to keep talking.');
                }
                break;
            }
            // A held message can still be changed, dropped or said now — the
            // page already has its text, so pulling it back into the composer
            // is a take here and a paste there.
            case 'queueTake':
                host.takeQueued(str('id'), idx('index'));
                break;
            case 'queueSend':
                host.releaseQueued(str('id'), idx('index'));
                break;
            case 'interrupt':
                host.interrupt(str('id'));
                break;
            case 'setModel':
                // mid-session model switch — the CLI's own `/model`
                if (!host.setModel(str('id'), str('model'))) {
                    void vscode.window.showWarningMessage(
                        'Agent Farm: that session cannot take a model change right now.');
                }
                break;
            case 'setEffort':
                // mid-session effort switch — the CLI's own `/effort`
                if (!host.setEffort(str('id'), str('effort'))) {
                    void vscode.window.showWarningMessage(
                        'Agent Farm: that session cannot take an effort change right now.');
                }
                break;
            // The answer to a parked question (see ConsoleAsk). The page sends
            // what you picked; deciding what is answerable is the host's job.
            case 'askAnswer': {
                const kind = str('kind');
                // The page is trusted, but this ends up inside a tool's input:
                // only strings and lists of strings, keyed by question text.
                const raw = (msg.answers && typeof msg.answers === 'object' && !Array.isArray(msg.answers))
                    ? msg.answers as Record<string, unknown> : {};
                const answers: Record<string, string | string[]> = {};
                for (const [q, v] of Object.entries(raw)) {
                    if (typeof v === 'string' && v) { answers[q] = v; }
                    else if (Array.isArray(v)) {
                        const list = v.filter(x => typeof x === 'string' && x) as string[];
                        if (list.length) { answers[q] = list; }
                    }
                }
                const done = host.answer(str('id'),
                    kind === 'deny' ? { kind: 'deny', message: str('message') }
                        : kind === 'allow' ? { kind: 'allow' }
                            : { kind: 'answer', answers, response: str('response') });
                if (!done) {
                    // A stale click: the CLI already took the question back, or
                    // it was answered from somewhere else. Say so — silence here
                    // reads as a dead button on a session that looks stuck.
                    void vscode.window.showInformationMessage(
                        'Agent Farm: that question is no longer waiting for an answer.');
                }
                break;
            }
            case 'permissionMode':
                // The standing RULE — how much may happen without stopping to
                // ask at all. One specific request is settled by 'askAnswer'.
                if (host.setPermissionMode(str('id'), str('mode')) && msg.retry === true) {
                    host.send(str('id'), 'Permission granted — please retry the action you were refused.');
                }
                break;
            case 'clearQueue':
                host.clearQueue(str('id'));
                break;
            case 'close':
                host.close(str('id'));
                break;
            case 'forget':
                host.forget(str('id'));
                break;
            case 'openFile':
                void vscode.commands.executeCommand('agentfarm.openEditedFile',
                    { file: str('file'), diff: msg.diff === true });
                break;
            // Renaming a Console row goes through VS Code's own right-click menu
            // (`webview/context` → agentfarm.renameSession), which is why there
            // is no 'rename' message here: the row carries its identity in
            // `data-vscode-context` and the command does the rest.
            case 'openTranscript': {
                const row = this.deps.index.all().find(s => s.sessionId === str('sessionId'));
                if (row) { void vscode.commands.executeCommand('agentfarm.openSession', row.file); }
                break;
            }
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', msg.anchor);
                break;
            case 'afnav': handleAfNav(msg.to); break;
        }
    }

    private dispose(): void {
        ConsolePanel.current = undefined;
        // The sessions deliberately OUTLIVE the panel: closing a tab must not
        // kill a conversation. They end with the window, or when you close them.
        this.disposables.forEach(d => d.dispose());
        this.panel.dispose();
    }
}
