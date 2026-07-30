import * as vscode from 'vscode';
import { barText, peakPercent, PlanUsageSnapshot, PlanUsageService, untilText } from '../core/planusage';

/**
 * Your plan's session countdown and two percentages, permanently in view.
 *
 * ‼️ THE ONE NUMBER YOU WANT WITHOUT LOOKING FOR IT. "How much of my session
 * window and of my week have I burned — and how long until the window comes
 * back?" is the question that decides whether to start the next long turn, and
 * the only place that answered it was a card on the Dashboard, i.e. behind a
 * page you had to open, which means you check it after you have already spent
 * the tokens rather than before.
 *
 * The status bar is the honest home for it: it is the only surface in VS Code
 * that is visible while you work, in every window, without opening anything. It
 * is deliberately NOT a second panel, a tree row or a webview — all three fail
 * the requirement by definition (you have to open them).
 *
 *   $(dashboard) 3h 49m - 86% / wk 41%
 *
 * Everything else — every bar the endpoint reports, the reset times, the plan
 * tier, which beat it is running on and when it was last checked — is in the
 * tooltip, one hover away, and a click opens the Dashboard card.
 *
 * ‼️ ONE BEAT, TWO WINDOWS (see `refreshMs`). This bar owns that beat: it wakes
 * on the fast interval while an agent is mid-turn and on the slow one when the
 * fleet is only waiting for prompts, refetches through the shared
 * `PlanUsageService` cache, and hands the result to `onRefresh` so the
 * Dashboard card follows the same beat instead of running its own. An open
 * dashboard, this bar and an agent's `usage.plan` together still make ONE
 * request per beat. `agentFarm.planUsageStatusBar` turns the indicator off.
 */

/** The bar repaints at least this often even when nothing is fetched: the
 *  countdown it prints has to keep moving between reads. */
const PAINT_INTERVAL_MS = 60_000;

export interface PlanUsageBarOptions {
    /** the shared cache — never a second one, or the beat doubles */
    service: PlanUsageService;
    /** live-read so a settings change is picked up without a reload */
    enabled(): boolean;
    /** ms between automatic reads in the CURRENT window; 0 = manual only */
    beatMs(): number;
    /** true while at least one session is mid-turn — the fast window */
    active(): boolean;
    /** percent at which the bar turns yellow / red */
    warnAt(): number;
    dangerAt(): number;
    /** called after every refresh, so other surfaces ride the same beat */
    onRefresh?(snap: PlanUsageSnapshot | undefined): void;
}

export class PlanUsageBar implements vscode.Disposable {
    private item: vscode.StatusBarItem;
    private timer?: NodeJS.Timeout;
    /** last known side of the idle/active line, so only the EDGE acts */
    private lastActive: boolean;

    constructor(private opts: PlanUsageBarOptions) {
        // Left, just after the farm item and the notices bell, so the three
        // Agent Farm indicators read as one cluster.
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 88);
        this.item.command = 'agentfarm.openDashboard';
        this.lastActive = opts.active();
        this.paint();
        void this.tick();
    }

    /** Ask the service (it serves from cache until its TTL is up) and repaint. */
    private async tick(force = false): Promise<void> {
        // 0 = the user turned the beat off; then this bar only ever shows what
        // something else (the Dashboard card's ⟳, an agent's usage.plan) read.
        if (this.opts.enabled() && this.opts.beatMs() > 0) {
            try { await this.opts.service.get(force); } catch { /* the snapshot says why */ }
            this.opts.onRefresh?.(this.opts.service.current());
        }
        this.paint();
        this.schedule();
    }

    /**
     * Arm the next wake-up. In the fast window that is the beat itself; in the
     * slow one the beat is minutes, so we still wake every minute to move the
     * countdown — the service's TTL decides which of those wakes costs a
     * request. Re-armed after every tick, so a window change takes effect at
     * the next wake at the latest, and immediately on the edge below.
     */
    private schedule(): void {
        if (this.timer) { clearTimeout(this.timer); }
        const beat = this.opts.beatMs();
        const wait = beat > 0 ? Math.min(beat, PAINT_INTERVAL_MS) : PAINT_INTERVAL_MS;
        this.timer = setTimeout(() => void this.tick(), wait);
    }

    /**
     * A live hook event landed — did the fleet just cross the idle/active line?
     *
     * Both edges are worth one immediate read: a turn STARTING is the moment
     * the figures begin to move, and a turn ENDING is the moment they settle at
     * what it cost. In between, the fast beat carries it. Only the edge acts
     * (this runs on every live event), and the service's 5-second floor keeps a
     * burst of agents starting at once from becoming a burst of requests.
     */
    fleetChanged(): void {
        const active = this.opts.active();
        if (active === this.lastActive) { return; }
        this.lastActive = active;
        void this.tick(true);
    }

    /** Settings changed — re-read them now rather than at the next wake. */
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

    /** Which beat is running, in words — a refresh rate you cannot see is a
     *  refresh rate you cannot trust (and "why did it not move?" has an answer). */
    private beatLine(): string {
        const beat = this.opts.beatMs();
        if (beat <= 0) { return '_Automatic refresh is off._'; }
        return this.opts.active()
            ? `_Live: an agent is working — re-read every ${Math.max(1, Math.round(beat / 1000))}s._`
            : `_Idle: re-read every ${Math.max(1, Math.round(beat / 60000))} min._`;
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
        lines.push(this.beatLine(), '');
        lines.push('[Check now](command:agentfarm.planUsageRefresh) · _click the bar for the Dashboard card_');
        const md = new vscode.MarkdownString(lines.join('\n'));
        md.isTrusted = { enabledCommands: ['agentfarm.planUsageRefresh'] };
        return md;
    }

    dispose(): void {
        if (this.timer) { clearTimeout(this.timer); }
        this.item.dispose();
    }
}
