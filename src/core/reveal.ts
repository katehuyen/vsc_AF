/**
 * "Show me this in the file manager" — one behaviour for the whole extension.
 *
 * VS Code's `revealFileInOS` always reveals a path *inside its parent*: hand it
 * a **folder** and Explorer opens the folder ABOVE it with that folder merely
 * selected. For a file that is exactly right; for "Reveal folder" on an agent
 * it is wrong — you asked for that agent's folder and got the agents root, the
 * same result for every agent, which makes picking one pointless.
 *
 * So the target's kind decides: a directory is OPENED, a file is REVEALED.
 */

import * as cp from 'child_process';
import * as fs from 'fs';
import * as vscode from 'vscode';

export type RevealAction = 'open-dir' | 'reveal-file' | 'missing';

/** Pure decision, so the rule is testable without a file manager. */
export function revealActionFor(p: string, isDirectory: (p: string) => boolean | undefined): RevealAction {
    if (!p) { return 'missing'; }
    const dir = isDirectory(p);
    if (dir === undefined) { return 'missing'; }
    return dir ? 'open-dir' : 'reveal-file';
}

function statKind(p: string): boolean | undefined {
    try { return fs.statSync(p).isDirectory(); } catch { return undefined; }
}

/**
 * Open a folder (its contents) or reveal a file inside its folder.
 * On Windows the folder is handed to Explorer directly — deterministic, and it
 * shows what is *in* the folder; elsewhere the OS handler opens it. Anything
 * unexpected falls back to VS Code's own reveal rather than doing nothing.
 */
export async function revealPath(p: string): Promise<void> {
    const action = revealActionFor(p, statKind);
    if (action === 'missing') {
        void vscode.window.showWarningMessage(`Agent Farm: path not found — ${p}`);
        return;
    }
    if (action === 'reveal-file') {
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(p));
        return;
    }
    if (process.platform === 'win32') {
        // explorer.exe exits with code 1 even when it succeeded — the exit code
        // is deliberately not read; a spawn error is what matters.
        const child = cp.spawn('explorer.exe', [p.replace(/\//g, '\\')], { detached: true, stdio: 'ignore' });
        child.on('error', () => {
            void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(p));
        });
        child.unref();
        return;
    }
    const opened = await vscode.env.openExternal(vscode.Uri.file(p));
    if (!opened) {
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(p));
    }
}
