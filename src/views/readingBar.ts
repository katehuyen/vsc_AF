/**
 * U-206 — THE STATUS BAR ITEM THAT EXISTS ONLY WHILE A READING LASTS.
 *
 * Shown from the moment a reading starts to the moment it ends, so it never sits idle on the
 * bar (A-22). A click pauses or resumes; the hover carries the reading's four controls — the
 * same commands as the Ctrl+Alt+H chord and the command palette, so the bar holds no act of its own.
 */
import * as vscode from 'vscode';
import type { ReadingBadge } from '../core/readingBadge';

export const READING_BAR_COMMANDS = [
    'agentfarm.pauseReading', 'agentfarm.previousParagraph', 'agentfarm.nextParagraph', 'agentfarm.stopReading'
] as const;

export class ReadingStatusBar implements vscode.Disposable {
    private readonly item: vscode.StatusBarItem;

    constructor(private readonly deps: { view: () => ReadingBadge | null }) {
        // 85: just right of the 🔇 (86) — the reading is the other half of "what is this machine saying"
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 85);
        this.item.command = 'agentfarm.pauseReading';
        this.update();
    }

    update(): void {
        const b = this.deps.view();
        if (!b) { this.item.hide(); return; }
        this.item.text = b.text;
        const md = new vscode.MarkdownString('', true);
        md.isTrusted = { enabledCommands: [...READING_BAR_COMMANDS] };
        b.lines.forEach((line, i) => { md.appendText(line); md.appendMarkdown(i < b.lines.length - 1 ? '  \n' : '\n\n'); });
        const [pause, prev, next, stop] = READING_BAR_COMMANDS;
        md.appendMarkdown([
            `[${b.paused ? '$(debug-start) Resume' : '$(debug-pause) Pause'}](command:${pause})`,
            `[$(debug-step-back) Previous](command:${prev})`,
            `[$(debug-step-over) Next](command:${next})`,
            `[$(debug-stop) Stop](command:${stop})`
        ].join(' · '));
        this.item.tooltip = md;
        this.item.show();
    }

    dispose(): void { this.item.dispose(); }
}

/** Sound: Reading Speed… from the palette — the speed of the reading now, the current one picked. */
export async function pickReadingRate(current: number): Promise<number | undefined> {
    const items = Array.from({ length: 21 }, (_, i) => i - 10).map(r => ({
        label: r === current ? `$(check) ${r}` : String(r),
        description: r === 0 ? 'the voice\'s own normal speed' : r < 0 ? 'slower' : 'faster',
        rate: r
    }));
    const pick = await vscode.window.showQuickPick(items, {
        title: 'Reading speed — this reading only; the setting is on the Sound page',
        placeHolder: `Now ${current}. −10 slow to 10 fast`
    });
    return pick ? pick.rate : undefined;
}
