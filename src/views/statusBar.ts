import * as vscode from 'vscode';
import { SessionIndex } from '../core/sessions';
import { dayKey, fmtTokens, fmtUSD } from '../core/util';

export class FarmStatusBar implements vscode.Disposable {
    private item: vscode.StatusBarItem;
    private timer: NodeJS.Timeout;

    constructor(private index: SessionIndex) {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
        this.item.command = 'agentfarm.openDashboard';
        this.item.show();
        this.update();
        this.timer = setInterval(() => this.update(), 30_000);
        index.onDidUpdate(() => this.update());
    }

    update(): void {
        const today = dayKey(Date.now());
        let cost = 0;
        for (const s of this.index.all()) {
            cost += s.daily[today]?.cost ?? 0;
        }
        const active = this.index.activeAgentIds().size;
        const win = this.index.windowUsage();
        this.item.text = `$(hubot) ${active} active • ${fmtUSD(cost)} today`;
        this.item.tooltip = new vscode.MarkdownString(
            `**Agent Farm**\n\n` +
            `Active agents: ${active}\n\n` +
            `Today's cost (API-equivalent): ${fmtUSD(cost)}\n\n` +
            `Trailing 5h window: ${fmtTokens(win.tokens)} tokens • ${win.msgs} msgs\n\n` +
            `_Click to open the dashboard_`
        );
    }

    dispose(): void {
        clearInterval(this.timer);
        this.item.dispose();
    }
}
