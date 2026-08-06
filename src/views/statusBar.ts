import * as vscode from 'vscode';
import { LiveMonitor } from '../core/live';
import { SessionIndex } from '../core/sessions';
import { dayKey, fmtTokens, fmtUSD } from '../core/util';

/**
 * What a click on the plan-usage status-bar indicator means: open the
 * Dashboard **at the top**.
 *
 * ‼️ THE PAGE IS RETAINED WHEN HIDDEN, SO REVEALING IT IS NOT THE SAME AS
 * OPENING IT. It comes back exactly where you last left it — and where you last
 * left it is usually deep in the sessions table, with the KPI row and the plan
 * usage card several screens above. The plan-usage indicator shows a number
 * from the TOP of that page (the plan percentages), so a click on it is a
 * question the top of the page answers; landing anywhere else makes the click
 * look broken and costs a scroll to undo.
 */
export const OPEN_DASHBOARD_AT_TOP: vscode.Command = {
    command: 'agentfarm.openDashboard',
    title: 'Open the Dashboard at the top',
    arguments: [{ scrollTo: 'top' }]
};

/** What a click on the "N active • $X today" indicator means when nothing is
 *  waiting on you: open Live Timeline — the running-now view that indicator's
 *  own numbers (active agents, cost) feed into. */
export const OPEN_LIVE_TIMELINE: vscode.Command = {
    command: 'agentfarm.openTimeline',
    title: 'Open Live Timeline'
};

export interface StatusBarExtras {
    /** G1: count of items that block work (permission / browser approval / stalled). */
    blocking?: () => number;
    /** extra refresh trigger (needs-queue changes). */
    onExtra?: vscode.Event<void>;
    /** Lap counter (trip meter): usage since the user-set mark; undefined = no lap running. */
    lap?: () => { sinceTs: number; tokens: number; wTokens: number; cost: number; msgs: number } | undefined;
}

export class FarmStatusBar implements vscode.Disposable {
    private item: vscode.StatusBarItem;
    private timer: NodeJS.Timeout;

    constructor(private index: SessionIndex, private live?: LiveMonitor,
        private extras?: StatusBarExtras) {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
        this.item.command = OPEN_LIVE_TIMELINE;
        this.item.show();
        this.update();
        this.timer = setInterval(() => this.update(), 30_000);
        index.onDidUpdate(() => this.update());
        live?.onDidUpdate(() => this.update());
        extras?.onExtra?.(() => this.update());
    }

    update(): void {
        const today = dayKey(Date.now());
        let cost = 0;
        for (const s of this.index.all()) {
            cost += s.daily[today]?.cost ?? 0;
        }
        // ‼️ SESSIONS, NOT AGENTS. Two Console tabs on the same agent are two
        // turns and two costs; counting agents folded them into "1 active" and
        // the indicator was blind to everything but the first. `activeTurns()`
        // is the live monitor's own session count (its `workingAgentIds()` is
        // the agent-shaped one) and `activeSessions()` is the index's.
        const liveWorking = this.live?.activeTurns() ?? 0;
        const active = Math.max(liveWorking, this.index.activeSessions().length);
        // Kept for the tooltip only: "3 sessions across 2 agents" is the line
        // that makes the number above it unambiguous.
        const activeAgents = this.index.activeAgentIds().size;
        const waiting = this.extras?.blocking?.() ?? this.live?.waitingCount() ?? 0;
        const win = this.index.windowUsage();

        const lap = this.extras?.lap?.();
        let text = `$(hubot) ${active} active • ${fmtUSD(cost)} today`;
        // The lap chip carries BOTH: raw first (what moved), weighted after the
        // scale glyph (what it charged the limit). One number alone is the very
        // thing that made a counter look wrong — see QUOTA_WEIGHTS.
        if (lap) { text += ` • $(watch) ${fmtTokens(lap.tokens)} ⚖${fmtTokens(lap.wTokens)}`; }
        if (waiting > 0) {
            text += ` • $(bell) ${waiting} need you`;
            this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            this.item.command = 'agentfarm.openNeeds';
        } else {
            this.item.backgroundColor = undefined;
            this.item.command = OPEN_LIVE_TIMELINE;
        }
        this.item.text = text;

        const liveLine = this.live
            ? (this.live.listenerState === 'listening'
                ? `Live listener: ● port ${this.live.activePort}`
                : `Live listener: ${this.live.listenerState}`)
            : 'Live listener: off';
        const lapAge = lap ? Date.now() - lap.sinceTs : 0;
        const lapLine = lap
            ? `⏱ Lap since ${new Date(lap.sinceTs).toLocaleTimeString()}: ${fmtTokens(lap.tokens)} tokens ` +
              `(⚖ ${fmtTokens(lap.wTokens)} against the limit) • ` +
              `${fmtUSD(lap.cost)} • ${lap.msgs} msgs` +
              (lapAge > 48 * 3600 * 1000 ? ' _(lap older than 48h — only the last 48h are counted)_' : '') +
              `\n\n[Reset lap](command:agentfarm.lapReset) · [Clear lap](command:agentfarm.lapClear)\n\n`
            : `[Start token lap](command:agentfarm.lapReset) — trip meter that counts tokens from now\n\n`;
        const tooltip = new vscode.MarkdownString(
            `**Agent Farm**\n\n` +
            `Active sessions: ${active}` +
            (activeAgents ? ` across ${activeAgents} agent${activeAgents === 1 ? '' : 's'}` : '') +
            `${waiting ? ` • ⚠ ${waiting} waiting/stalled` : ''}\n\n` +
            `Today's cost (API-equivalent): ${fmtUSD(cost)}\n\n` +
            // ‼️ The 5h window is the plan's own reset span, so this is the one
            // line where the weighted figure matters most: the raw total of a
            // full window spans 111M-175M across days whose WEIGHTED totals sit
            // within ±13% of each other — i.e. days that hit the SAME wall.
            `Trailing 5h window: ${fmtTokens(win.tokens)} tokens • ⚖ ${fmtTokens(win.wTokens)} against the limit • ${win.msgs} msgs\n\n` +
            lapLine +
            `${liveLine}\n\n` +
            (waiting > 0 ? `_Click to open Needs You_` : `_Click to open Live Timeline_`)
        );
        tooltip.isTrusted = { enabledCommands: ['agentfarm.lapReset', 'agentfarm.lapClear'] };
        this.item.tooltip = tooltip;
    }

    dispose(): void {
        clearInterval(this.timer);
        this.item.dispose();
    }
}
