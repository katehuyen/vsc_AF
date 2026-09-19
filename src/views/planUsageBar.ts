import * as vscode from 'vscode';
import { PlanUsageSnapshot, PlanUsageService, remainingText, untilText } from '../core/planusage';
import { EngineUsage, canRecheck, engineBarText, enginePeak, usageSummary } from '../core/engineUsage';
import { OPEN_DASHBOARD_AT_TOP } from './statusBar';
import { clockUtc as afClockUtc } from '../core/aftime';

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
    /**
     * ‼️ U-27 — EVERY ENGINE'S ANSWER, AND WHICH ONE IS ON SHOW.
     *
     * The item used to print Claude's percentages with nothing on it saying
     * they were Claude's. On a machine running four engines that is not a
     * missing label, it is a wrong answer: the reader attributes the figure
     * to whatever they are working in. So the bar has an axis now — the
     * chosen engine is what it prints, and the hover lists all four with a
     * link each, because a picker you have to find in Settings is a picker
     * for a choice you make once and this is one you make per task.
     */
    engines?(): EngineUsage[];
    /** the engine currently on show ('claude' when nothing was chosen) */
    engine?(): string;
    /**
     * ‼️ X-212 — WHOSE PLAN THESE PERCENTAGES ARE.
     *
     * U-27 put the engine's name on the panel because a figure with no owner is
     * attributed to whatever the reader is working in. The same argument
     * finishes here: on a machine with two Claude sign-ins, "Claude Code — plan
     * usage" is still not an owner, and the reader has no way to tell the
     * account that is about to run out from the one that is not. So the heading
     * names the sign-in, and the machine's own has a name too
     * (`MACHINE_GLOBAL`) rather than being a gap.
     *
     * Empty string = this engine cannot hold a second sign-in at all, and then
     * nothing is added: a parenthetical would imply a choice that does not
     * exist on it.
     */
    accountLabel?(engine: string): string;
    /**
     * ‼️ X-243 — THE SIGN-IN THE READER IS ACTUALLY WATCHING, when it is not
     * the standing one.
     *
     * The strip answers "how much is left before the next long turn stops".
     * `activeAccounts` decides who the NEXT session runs as — but the
     * conversation on screen may already be running as somebody else, and then
     * the standing account's percentages are the wrong answer to the question
     * the reader is asking. So the bar follows the conversation while one is in
     * front of them, and falls back the moment it is not.
     *
     * undefined = nothing is being watched, or what is being watched is the
     * standing account anyway; the caller decides that, because only it knows
     * what standing means.
     */
    watched?(): WatchedUsage | undefined;
}

/** X-243 — one sign-in's figures, and why the bar left the standing one. */
export interface WatchedUsage {
    /** the account's reading, shaped like any other engine row */
    usage: EngineUsage;
    /** whose sign-in it is, in the shortest form that identifies it */
    label: string;
    /** one line for the panel: what the bar is following and why */
    why: string;
}

export class PlanUsageBar implements vscode.Disposable {
    private item: vscode.StatusBarItem;
    private timer?: NodeJS.Timeout;
    /** last known side of the idle/active line, so only the EDGE acts */
    private lastActive: boolean;
    /** X-243 — the sign-in this paint is describing, or undefined */
    private watching?: WatchedUsage;

    constructor(private opts: PlanUsageBarOptions) {
        // Left, just after the farm item and the notices bell, so the three
        // Agent Farm indicators read as one cluster.
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 88);
        // …at the TOP of it, where the plan usage card is — see the contract in
        // statusBar.ts, which both indicators share.
        this.item.command = OPEN_DASHBOARD_AT_TOP;
        this.lastActive = opts.active();
        this.paint();
        void this.tick();
    }

    /**
     * Ask the service (it serves from cache until its TTL is up) and repaint.
     *
     * `why` is handed to the service rather than a boolean, because "the timer
     * woke up" and "a turn just ended" are allowed to skip different things and
     * neither of them is allowed to skip what a PERSON can skip.
     */
    private async tick(why: 'beat' | 'edge' = 'beat'): Promise<void> {
        // 0 = the user turned the beat off; then this bar only ever shows what
        // something else (the Dashboard card's ⟳, an agent's usage.plan) read.
        if (this.opts.enabled() && this.opts.beatMs() > 0) {
            try {
                await (why === 'edge' ? this.opts.service.readOnEdge() : this.opts.service.get());
            } catch { /* the snapshot says why */ }
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
     * ‼️ ONLY THE FALLING EDGE EARNS A READ, and this used to be both.
     *
     * A turn **ending** is the moment the figures settle at what it cost — that
     * is news, and worth pulling a read forward for. A turn **starting** is not:
     * nothing has been spent yet at the instant a turn begins, so the answer is
     * necessarily the one the last read already gave. It was costing a request
     * to learn nothing, and doubling the traffic on the busiest events in the
     * system to do it (see readOnEdge — this fires a couple of hundred times an
     * hour on a working fleet, in bursts).
     *
     * `lastActive` still tracks BOTH directions: a rising edge that is not
     * recorded turns the next fall into a no-op, and then the one edge that
     * matters is the one that never fires.
     */
    fleetChanged(): void {
        const active = this.opts.active();
        if (active === this.lastActive) { return; }
        this.lastActive = active;
        // going idle = a turn just finished; going active = nothing spent yet
        if (!active) { void this.tick('edge'); }
    }

    /** Settings changed — re-read them now rather than at the next wake. */
    refresh(): void { void this.tick(); }

    /** The engine on show, with its figures — or undefined when nothing can
     *  be drawn at all (no engine list yet, or the chosen id is gone). */
    private shown(): EngineUsage | undefined {
        // X-243 — a watched conversation outranks the engine axis: the reader
        // chose the engine once, and is looking at this session now.
        if (this.watching) { return this.watching.usage; }
        const list = this.opts.engines?.() ?? [];
        if (!list.length) { return undefined; }
        const want = (this.opts.engine?.() ?? 'claude').trim().toLowerCase();
        return list.find(e => e.id === want) ?? list[0];
    }

    paint(): void {
        // Read ONCE per paint: the text, the colour and the panel must all
        // describe the same sign-in, and a session can end between two reads.
        this.watching = this.opts.watched?.();
        const shown = this.shown();
        const text = this.opts.enabled()
            ? engineBarText(shown, at => remainingText(at) || '', this.watching?.label)
            : undefined;
        if (!text) { this.item.hide(); return; }
        this.item.text = text;
        // ‼️ THE COLOUR FOLLOWS THE ENGINE ON SHOW, and an engine with no
        // figures is never coloured: `enginePeak` returns 0 for a state that
        // is not `ok`, which is the difference between "nothing used" and
        // "nothing known" that the rest of this feature turns on.
        const peak = enginePeak(shown);
        this.item.backgroundColor = peak >= this.opts.dangerAt()
            ? new vscode.ThemeColor('statusBarItem.errorBackground')
            : peak >= this.opts.warnAt()
                ? new vscode.ThemeColor('statusBarItem.warningBackground')
                : undefined;
        this.item.tooltip = this.tooltip(this.opts.service.current());
        this.item.show();
    }

    /**
     * ‼️ X-212 — `Claude Code (murat@…)` / `Claude Code (Machine Global)`.
     *
     * The engine and the account read as one owner, in one line, because they
     * ARE one: the percentages belong to that sign-in of that engine and to
     * nothing else. An engine that cannot isolate a sign-in gets the bare name
     * it always had — see `accountLabel`.
     */
    private heading(shown: EngineUsage | undefined): string {
        const name = shown ? shown.label : 'Claude Code';
        // X-243 — while the bar follows a conversation, the owner is that
        // conversation's sign-in, not the one the next session would use.
        const who = (this.watching?.label
            ?? this.opts.accountLabel?.(shown ? shown.id : 'claude') ?? '').trim();
        return who ? `${name} (${who})` : name;
    }

    /** Which beat is running, in words — a refresh rate you cannot see is a
     *  refresh rate you cannot trust (and "why did it not move?" has an answer).
     *  A backoff outranks the beat here, because while one is running the beat is
     *  NOT what is happening and the figures are deliberately going stale. */
    private beatLine(): string {
        const until = this.opts.service.rateLimitedUntil();
        if (until > Date.now()) {
            return `_Rate limited — backing off, next automatic read ${untilText(until)}._`;
        }
        const beat = this.opts.beatMs();
        if (beat <= 0) { return '_Automatic refresh is off._'; }
        return this.opts.active()
            ? `_Live: an agent is working — re-read every ${Math.max(1, Math.round(beat / 1000))}s._`
            : `_Idle: re-read every ${Math.max(1, Math.round(beat / 60000))} min._`;
    }

    /**
     * ‼️ THE ENGINE PICKER LIVES IN THE HOVER, AND EVERY ROW IS A LINK.
     *
     * The row for each engine says what it currently reads, so the choice is
     * made with the four answers in front of you rather than by switching
     * and looking. The one on show is marked; the others are `command:` links
     * that switch and repaint. A trusted MarkdownString is what makes those
     * links clickable at all.
     */
    private engineLines(): string[] {
        const list = this.opts.engines?.() ?? [];
        if (list.length < 2) { return []; }
        const cur = (this.opts.engine?.() ?? 'claude').trim().toLowerCase();
        const out = ['', '**Show instead**', ''];
        for (const e of list) {
            const args = encodeURIComponent(JSON.stringify([e.id]));
            const figure = usageSummary(e);
            out.push(e.id === cur
                ? `- **${e.label}** — ${figure}`
                : `- [${e.label}](command:agentfarm.setUsageEngine?${args}) — ${figure}`);
        }
        return out;
    }

    /**
     * ‼️ ONE PANEL, THE SAME SHAPE FOR EVERY ENGINE (U-40).
     *
     * This used to be two bodies with an early return between them: Claude got
     * a heading, its bars, the plan, when it was checked, which beat is running
     * and a Check-now link — and every other engine got a heading, its bars and
     * a paragraph, with no beat line, no footer, and a `isTrusted: true` that
     * quietly allowed every command in the editor instead of the two this panel
     * uses. So the hover changed shape depending on which engine was selected,
     * which is the whole of "it looks unfinished": the reader learns where to
     * look and then the layout moves under them.
     *
     * Now there is one body. What differs between engines is the CONTENT of the
     * source line — Claude reads an endpoint on a beat and can be re-read on
     * demand, Codex reads its own rollout file, Antigravity publishes nothing —
     * and that difference is stated in one sentence where the reader is already
     * looking, rather than by giving them a different panel.
     */
    private tooltip(snap: PlanUsageSnapshot | undefined): vscode.MarkdownString {
        const shown = this.shown();
        // ‼️ X-243 — A WATCHED SIGN-IN IS NEVER READ OFF `snap`. The snapshot
        // belongs to the machine's own credentials, so drawing it under the
        // watched account's name would put somebody else's percentages beside
        // the right owner — the one mistake this whole item exists to stop.
        const isClaude = !this.watching && (!shown || shown.id === 'claude');
        // The heading names WHOSE limits these are — the whole point of U-27,
        // and the reason nothing on the strip itself has to repeat it (U-40).
        // ‼️ X-212 — and WHICH SIGN-IN of it, because on this machine the engine
        // is no longer the owner of the figure; the account is.
        const lines = [`**${this.heading(shown)} — plan usage**`, ''];
        // X-243 — and why these are the figures on show, said before them: a
        // reader who does not know the bar has moved reads the right number
        // about the wrong account.
        if (this.watching) { lines.push(`_${this.watching.why}_`, ''); }

        // ---- the figures ----
        if (isClaude) {
            if (!snap) {
                lines.push('_Not checked yet._');
            } else if (snap.state !== 'ok') {
                lines.push(snap.note ?? 'The usage endpoint could not be read.');
            } else {
                // every bar the endpoint reports, not just the two on the strip
                for (const b of snap.bars) {
                    const until = untilText(b.resetsAt);
                    lines.push(`- ${b.title}: **${b.percent}%**${until ? ` — resets ${until}` : ''}`);
                }
                if (snap.plan) { lines.push('', `Plan: ${snap.plan}`); }
                lines.push(`_Checked ${afClockUtc(snap.fetchedAt)}_`);
            }
        } else if (shown && shown.state === 'ok' && shown.bars.length) {
            for (const b of shown.bars) {
                lines.push(`- ${b.title}: **${b.percent}%**`
                    + (b.resetsAt ? ` — resets ${untilText(b.resetsAt)}` : ''));
            }
            if (shown.plan) { lines.push('', `Plan: ${shown.plan}`); }
            // Every clock in this repo goes through AFTime — a second date
            // format in the one panel that shows four engines side by side is
            // exactly the inconsistency this rule exists for.
            if (shown.fetchedAt) { lines.push(`_Read ${afClockUtc(shown.fetchedAt)}_`); }
        } else {
            lines.push(shown ? `_${usageSummary(shown)}_` : '_Not read yet._');
        }

        // ---- where the figures come from, and how often ----
        lines.push('');
        lines.push(isClaude ? this.beatLine() : `_${shown?.note ?? ''}_`);

        // ---- what you can do from here ----
        //
        // ‼️ U-96 — THE ACTION LINE WAS THE LAST PLACE THIS PANEL STILL CHANGED
        // SHAPE. Check now appeared on Claude and simply was not there on the
        // others, so the reader could not tell an engine that CANNOT be
        // re-read from one nobody had got round to wiring — which is exactly
        // the question that was asked about it.
        //
        // Both halves are now stated. An engine with a source can be re-read on
        // demand, and Codex has one: its figures come off the newest rollout
        // file, so a re-read is a disk read and cheaper than Claude's, which
        // spends a request. An engine with no source says so where the link
        // would have been, rather than leaving a gap for the reader to
        // interpret: `no-plan` is billed per token and has no percentage to
        // refresh, `not-published` writes its quota nowhere this machine can
        // read. Neither is an omission, and now neither looks like one.
        lines.push('');
        // ‼️ X-243 — A WATCHED SIGN-IN IS RE-READ WHERE IT LIVES. `Check now`
        // spends a request against the MACHINE's credentials, so offering it
        // under somebody else's name would refresh a figure that is not on
        // screen; and the engine picker below would switch an axis this paint
        // is not using. Both are replaced by the one door that can act on this
        // account, and by the sentence that says how the bar comes back.
        if (this.watching) {
            lines.push('[Open Accounts](command:agentfarm.openAccounts)'
                + ' · _the bar follows the conversation on screen; leave the Console'
                + ' or select a session on the standing account and it goes back_');
            const md = new vscode.MarkdownString(lines.join('\n'));
            md.isTrusted = { enabledCommands: ['agentfarm.openAccounts'] };
            md.supportHtml = false;
            return md;
        }
        lines.push(!shown || canRecheck(shown)
            ? '[Check now](command:agentfarm.planUsageRefresh) · _click the bar for the Dashboard card_'
            : `_Nothing to check — ${shown.state === 'no-plan'
                ? 'billed per token, so there is no plan to be a percentage of'
                : 'this engine publishes no quota this machine can read'}._`
                + ' · _click the bar for the Dashboard card_');

        const md = new vscode.MarkdownString([...lines, ...this.engineLines()].join('\n'));
        // ‼️ BOTH commands, or the engine rows render as dead text. A trusted
        // MarkdownString with an allow-list silently drops every link that is
        // not on it — which is exactly the failure that looks like a CSS bug.
        // The allow-list is the whole point: `isTrusted: true` hands a hover
        // panel every command in the editor to run.
        md.isTrusted = { enabledCommands: ['agentfarm.planUsageRefresh', 'agentfarm.setUsageEngine'] };
        md.supportHtml = false;
        return md;
    }

    dispose(): void {
        if (this.timer) { clearTimeout(this.timer); }
        this.item.dispose();
    }
}
