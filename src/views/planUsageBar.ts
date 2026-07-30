import * as vscode from 'vscode';
import { barText, peakPercent, PlanUsageSnapshot, PlanUsageService, untilText } from '../core/planusage';

/**
 * Your plan's two percentages, permanently in view.
 *
 * ‼️ THE ONE NUMBER YOU WANT WITHOUT LOOKING FOR IT. "How much of my session
 * window and of my week have I burned?" is the question that decides whether to
 * start the next long turn — and the only place that answered it was a card on
 * the Dashboard, i.e. behind a page you had to open, which means you check it
 * after you have already spent the tokens rather than before.
 *
 * The status bar is the honest home for it: it is the only surface in VS Code
 * that is visible while you work, in every window, without opening anything. It
 * is deliberately NOT a second panel, a tree row or a webview — all three fail
 * the requirement by definition (you have to open them).
 *
 *   $(dashboard) 5h 42% / wk 67%
 *
 * The two labels cost four characters and remove the one thing an unlabelled
 * "42% / 67%" cannot tell you: which is which. Everything else — every bar the
 * endpoint reports, the reset times, the plan tier, when it was last checked —
 * is in the tooltip, one hover away, and a click opens the Dashboard card.
 *
 * Cost: it shares `PlanUsageService`'s cache with the Dashboard card and the
 * `usage.plan` bridge op, so an open dashboard and this bar together still make
 * ONE request per `planUsageRefreshMinutes`. The bar is what keeps that beat
 * running when no page is open; `agentFarm.planUsageStatusBar` turns it off.
 */
export interface PlanUsageBarOptions {
    /** the shared cache — never a second one, or the beat doubles */
    service: PlanUsageService;
    /** live-read so a settings change is picked up without a reload */
    enabled(): boolean;
    /** minutes between refreshes; 0 = only when something else asks */
    refreshMinutes(): number;
    /** percent at which the bar turns yellow / red */
    warnAt(): number;
    dangerAt(): number;
}

export class PlanUsageBar implements vscode.Disposable {
    private item: vscode.StatusBarItem;
    private timer: NodeJS.Timeout;

    constructor(private opts: PlanUsageBarOptions) {
        // Left, just after the farm item and the notices bell, so the three
        // Agent Farm indicators read as one cluster.
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 88);
        this.item.command = 'agentfarm.openDashboard';
        this.paint();
        void this.tick();
        // One minute is the heartbeat, not the request rate: the service's TTL
        // decides when a tick actually reaches the network, and the countdown in
        // the tooltip has to keep moving in between.
        this.timer = setInterval(() => void this.tick(), 60_000);
    }

    /** Ask the service (it serves from cache until its TTL is up) and repaint. */
    private async tick(): Promise<void> {
        if (!this.opts.enabled()) { this.paint(); return; }
        // 0 = the user turned the beat off; then this bar only ever shows what
        // something else (the Dashboard card, an agent's usage.plan) fetched.
        if (this.opts.refreshMinutes() > 0) {
            try { await this.opts.service.get(false); } catch { /* the snapshot says why */ }
        }
        this.paint();
    }

    /** Settings changed — re-read them now rather than at the next minute. */
    refresh(): void { void this.tick(); }

    paint(): void {
        const snap = this.opts.service.current();
        const text = this.opts.enabled() ? barText(snap) : undefined;
        if (!text) { this.item.hide(); return; }
        this.item.text = text;
        const peak = peakPercent(snap);
        this.item.backgroundColor = peak >= this.opts.dangerAt()
            ? new vscode.ThemeColor('statusBarItem.errorBackground')
            : peak >= this.opts.warnAt()
                ? new vscode.ThemeColor('statusBarItem.warningBackground')
                : undefined;
        this.item.tooltip = this.tooltip(snap);
        this.item.show();
    }

    private tooltip(snap: PlanUsageSnapshot | undefined): vscode.MarkdownString {
        const lines = ['**Claude plan usage**', ''];
        if (!snap) {
            lines.push('_Not checked yet._');
        } else if (snap.state !== 'ok') {
            lines.push(snap.note ?? 'The usage endpoint could not be read.');
        } else {
            // every bar the endpoint reports, not just the two on the bar
            for (const b of snap.bars) {
                const until = untilText(b.resetsAt);
                lines.push(`${b.title}: **${b.percent}%**${until ? ` — resets ${until}` : ''}`);
                lines.push('');
            }
            if (snap.plan) { lines.push(`Plan: ${snap.plan}`, ''); }
            lines.push(`_Checked ${new Date(snap.fetchedAt).toLocaleTimeString()}_`, '');
        }
        lines.push('[Check now](command:agentfarm.planUsageRefresh) · _click the bar for the Dashboard card_');
        const md = new vscode.MarkdownString(lines.join('\n'));
        md.isTrusted = { enabledCommands: ['agentfarm.planUsageRefresh'] };
        return md;
    }

    dispose(): void {
        clearInterval(this.timer);
        this.item.dispose();
    }
}
