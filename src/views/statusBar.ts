import * as vscode from 'vscode';
import { LiveMonitor } from '../core/live';
import { SessionIndex } from '../core/sessions';
import { dayKey, fmtTokens, fmtUSD } from '../core/util';

export class FarmStatusBar implements vscode.Disposable {
    private item: vscode.StatusBarItem;
    private timer: NodeJS.Timeout;

    constructor(private index: SessionIndex, private live?: LiveMonitor) {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
        this.item.command = 'agentfarm.openDashboard';
        this.item.show();
        this.update();
        this.timer = setInterval(() => this.update(), 30_000);
        index.onDidUpdate(() => this.update());
        live?.onDidUpdate(() => this.update());
    }

    update(): void {
        const today = dayKey(Date.now());
        let cost = 0;
        for (const s of this.index.all()) {
            cost += s.daily[today]?.cost ?? 0;
        }
        const liveWorking = this.live?.workingAgentIds().size ?? 0;
        const active = Math.max(liveWorking, this.index.activeAgentIds().size);
        const waiting = this.live?.waitingCount() ?? 0;
        const win = this.index.windowUsage();

        let text = `$(hubot) ${active} active • ${fmtUSD(cost)} today`;
        if (waiting > 0) {
            text += ` • $(bell) ${waiting} waiting`;
            this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            this.item.backgroundColor = undefined;
        }
        this.item.text = text;

        const liveLine = this.live
            ? (this.live.listenerState === 'listening'
                ? `Live listener: ● port ${this.live.activePort}`
                : `Live listener: ${this.live.listenerState}`)
            : 'Live listener: off';
        this.item.tooltip = new vscode.MarkdownString(
            `**Agent Farm**\n\n` +
            `Active agents: ${active}${waiting ? ` • ⚠ ${waiting} waiting/stalled` : ''}\n\n` +
            `Today's cost (API-equivalent): ${fmtUSD(cost)}\n\n` +
            `Trailing 5h window: ${fmtTokens(win.tokens)} tokens • ${win.msgs} msgs\n\n` +
            `${liveLine}\n\n` +
            `_Click to open the dashboard_`
        );
    }

    dispose(): void {
        clearInterval(this.timer);
        this.item.dispose();
    }
}
