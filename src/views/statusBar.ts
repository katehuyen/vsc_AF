import * as vscode from 'vscode';
import { LiveMonitor } from '../core/live';
import { SessionIndex } from '../core/sessions';
import { dayKey, fmtTokens, fmtUSD } from '../core/util';

/**
 * What a click on an Agent Farm status-bar indicator means: open the Dashboard
 * **at the top**.
 *
 * ‼️ THE PAGE IS RETAINED WHEN HIDDEN, SO REVEALING IT IS NOT THE SAME AS
 * OPENING IT. It comes back exactly where you last left it — and where you last
 * left it is usually deep in the sessions table, with the KPI row and the plan
 * usage card several screens above. Every one of these indicators shows a
 * number from the TOP of that page (cost today, the plan percentages), so a
 * click on one is a question the top of the page answers; landing anywhere else
 * makes the click look broken and costs a scroll to undo.
 *
 * Shared by both indicators on purpose: two neighbours in the same cluster that
 * answer the same gesture differently is itself the bug.
 */
export const OPEN_DASHBOARD_AT_TOP: vscode.Command = {
    command: 'agentfarm.openDashboard',
    title: 'Open the Dashboard at the top',
    arguments: [{ scrollTo: 'top' }]
};

export interface StatusBarExtras {
    /** G1: count of items that block work (permission / browser approval / stalled). */
    blocking?: () => number;
    /** extra refresh trigger (needs-queue changes). */
    onExtra?: vscode.Event<void>;
    /** Lap counter (trip meter): usage since the user-set mark; undefined = no lap running. */
    lap?: () => { sinceTs: number; tokens: number; cost: number; msgs: number } | undefined;
}

export class FarmStatusBar implements vscode.Disposable {
    private item: vscode.StatusBarItem;
    private timer: NodeJS.Timeout;

    constructor(private index: SessionIndex, private live?: LiveMonitor,
        private extras?: StatusBarExtras) {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
        this.item.command = OPEN_DASHBOARD_AT_TOP;
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
        const liveWorking = this.live?.workingAgentIds().size ?? 0;
        const active = Math.max(liveWorking, this.index.activeAgentIds().size);
        const waiting = this.extras?.blocking?.() ?? this.live?.waitingCount() ?? 0;
        const win = this.index.windowUsage();

        const lap = this.extras?.lap?.();
        let text = `$(hubot) ${active} active • ${fmtUSD(cost)} today`;
        if (lap) { text += ` • $(watch) ${fmtTokens(lap.tokens)}`; }
        if (waiting > 0) {
            text += ` • $(bell) ${waiting} need you`;
            this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            this.item.command = 'agentfarm.openNeeds';
        } else {
            this.item.backgroundColor = undefined;
            this.item.command = OPEN_DASHBOARD_AT_TOP;
        }
        this.item.text = text;

        const liveLine = this.live
            ? (this.live.listenerState === 'listening'
                ? `Live listener: ● port ${this.live.activePort}`
                : `Live listener: ${this.live.listenerState}`)
            : 'Live listener: off';
        const lapAge = lap ? Date.now() - lap.sinceTs : 0;
        const lapLine = lap
            ? `⏱ Lap since ${new Date(lap.sinceTs).toLocaleTimeString()}: ${fmtTokens(lap.tokens)} tokens • ` +
              `${fmtUSD(lap.cost)} • ${lap.msgs} msgs` +
              (lapAge > 48 * 3600 * 1000 ? ' _(lap older than 48h — only the last 48h are counted)_' : '') +
              `\n\n[Reset lap](command:agentfarm.lapReset) · [Clear lap](command:agentfarm.lapClear)\n\n`
            : `[Start token lap](command:agentfarm.lapReset) — trip meter that counts tokens from now\n\n`;
        const tooltip = new vscode.MarkdownString(
            `**Agent Farm**\n\n` +
            `Active agents: ${active}${waiting ? ` • ⚠ ${waiting} waiting/stalled` : ''}\n\n` +
            `Today's cost (API-equivalent): ${fmtUSD(cost)}\n\n` +
            `Trailing 5h window: ${fmtTokens(win.tokens)} tokens • ${win.msgs} msgs\n\n` +
            lapLine +
            `${liveLine}\n\n` +
            `_Click to open the dashboard_`
        );
        tooltip.isTrusted = { enabledCommands: ['agentfarm.lapReset', 'agentfarm.lapClear'] };
        this.item.tooltip = tooltip;
    }

    dispose(): void {
        clearInterval(this.timer);
        this.item.dispose();
    }
}
