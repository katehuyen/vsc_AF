import * as vscode from 'vscode';
import { fmtGap, QuietVerdict, Silence } from '../core/alertGate';

/**
 * A-22 — 🔇, ONE CLICK, THE WHOLE FARM.
 *
 * The alert sounds are configured in a Settings card and armed per session in a
 * Timeline row, which is right for setting them up and useless for the moment
 * they actually go wrong: somebody walks into the room, eight agents are
 * finishing turns, and the answer has to be one gesture from wherever the eye
 * already is. That is the status bar, and nothing else in this extension is.
 *
 * ‼️ IT APPEARS WHEN THERE IS SOMETHING TO SILENCE. The whole alert family
 * ships off; an icon that sits there for months on a fleet that has never made
 * a noise is clutter, and clutter is what makes a status bar unreadable at the
 * moment it matters. It shows up the first time anything is armed — and stays
 * up while the farm is muted, because a control that hides itself once pressed
 * is a control nobody can undo.
 */
export interface MuteBarDeps {
    /** `agentFarm.alerts.muted` right now. */
    muted: () => boolean;
    /** The schedule's verdict for this instant. */
    quiet: () => QuietVerdict;
    /** Which fleet-wide events are armed (`agentFarm.alerts.on`). */
    armedEvents: () => string[];
    /** How many live sessions armed a sound on their own. */
    armedSessions: () => number;
    /** How many live sessions are muted on their own. */
    mutedSessions: () => number;
    /** The gate's own answer, so the bar and the alert cannot disagree. */
    silence: () => Silence;
    /** U-179 — told on every repaint, so the page headers' 🔊 follows the bar. */
    changed?: () => void;
}

export class MuteStatusBar implements vscode.Disposable {
    private item: vscode.StatusBarItem;
    private timer: NodeJS.Timeout;

    constructor(private deps: MuteBarDeps) {
        // 86: to the right of the plan-usage (88) and project (87) indicators —
        // the alert state is the least numeric thing on that side of the bar and
        // reads best at the end of the run.
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 86);
        this.item.command = 'agentfarm.toggleMute';
        this.update();
        // ‼️ THE CLOCK MOVES THE ANSWER. Quiet hours start and end without
        // anybody touching a setting, so a bar that only refreshed on config
        // changes would go on claiming "sounds on" through the whole night.
        this.timer = setInterval(() => this.update(), 60_000);
    }

    update(): void {
        this.deps.changed?.();
        const muted = this.deps.muted();
        const quiet = this.deps.quiet();
        const armed = this.deps.armedEvents();
        const armedSessions = this.deps.armedSessions();
        const mutedSessions = this.deps.mutedSessions();
        const inUse = armed.length > 0 || armedSessions > 0 || mutedSessions > 0
            || muted || quiet.configured || !!quiet.error;
        if (!inUse) { this.item.hide(); return; }

        const gate = this.deps.silence();
        this.item.text = gate.silent ? '$(mute)' : '$(unmute)';
        // The warning colour is for the state the USER put it in and has to be
        // able to notice: quiet hours end by themselves, a mute does not.
        this.item.backgroundColor = muted
            ? new vscode.ThemeColor('statusBarItem.warningBackground')
            : undefined;

        // MIRROR — what it is doing right now, on the first line.
        const md = new vscode.MarkdownString(undefined, true);
        md.supportThemeIcons = true;
        md.appendMarkdown(gate.silent
            ? `**Sound: silent** — ${gate.detail}\n\n`
            : '**Sound: on**\n\n');
        if (quiet.error) {
            md.appendMarkdown(`⚠ Quiet hours: ${quiet.error}\n\n`);
        } else if (quiet.configured) {
            md.appendMarkdown(quiet.inside
                ? `Quiet hours ${quiet.from}–${quiet.to} — silent for another ${fmtGap(quiet.inMinutes)}.\n\n`
                : `Quiet hours ${quiet.from}–${quiet.to} — next in ${fmtGap(quiet.inMinutes)}.\n\n`);
        }
        md.appendMarkdown(armed.length
            ? `Rings for every session on: ${armed.join(' · ')}.\n\n`
            : 'No event rings fleet-wide.\n\n');
        if (armedSessions) {
            md.appendMarkdown(`${armedSessions} live session${armedSessions === 1 ? '' : 's'} set to Always.\n\n`);
        }
        if (mutedSessions) {
            md.appendMarkdown(`${mutedSessions} session${mutedSessions === 1 ? '' : 's'} set to Silent — those stay quiet whatever this button says.\n\n`);
        }
        md.appendMarkdown(muted
            ? '**Click to turn Mute all off.** Nothing else is changed — every event and tone is exactly where you left it.'
            : '**Click to Mute all.** Sounds only: the notifications, pop-ups and focus jumps are a different switch and keep working.');
        this.item.tooltip = md;
        this.item.show();
    }

    dispose(): void {
        clearInterval(this.timer);
        this.item.dispose();
    }
}
