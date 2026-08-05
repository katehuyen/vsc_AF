import * as cp from 'child_process';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { buildCustomArgv, DocOpenConfig, DocOpenMode, obsidianLineUri, obsidianUri } from '../core/docopen';

/**
 * openReportDoc — the ONE helper every panel uses to open a .md document,
 * honouring the user's chosen mode: report/answer links on Notices and the Work
 * Queue, and the project documents on the Projects page. The path is always
 * supplied by the host (from the notice/item/project folder, never from the
 * webview), so this can only open a file the host itself resolved.
 *
 * Modes (see core/docopen.ts): 'vscode' raw editor · 'preview' rendered VS Code
 * Markdown preview · 'obsidian' rendered in the vault via the obsidian:// URI ·
 * 'custom' a user-configured external app ({file} → the absolute path).
 *
 * `line` (1-based) asks to land ON a line — one backlog item rather than the file
 * it lives in. What each mode can honour differs and the differences are
 * deliberate, not incidental; see the switch.
 */
export async function openReportDoc(
    filePath: string, mode: DocOpenMode, cfg: DocOpenConfig, line?: number
): Promise<void> {
    if (!filePath) { return; }
    const at = Number.isFinite(line) && (line as number) >= 1 ? Math.floor(line as number) : undefined;
    // Obsidian and a custom app are the only modes that could conceivably open a
    // path VS Code can't see, but every one of these files is a local vault file
    // — so an existence check up front gives a clean message instead of a silent
    // no-op or a confusing external-app error.
    if (!fs.existsSync(filePath)) {
        void vscode.window.showWarningMessage(`Agent Farm: file not found — ${filePath}`);
        return;
    }
    const uri = vscode.Uri.file(filePath);
    try {
        switch (mode) {
            case 'preview':
                // ‼️ A LINE BEATS THE RENDERING. A line number means nothing in a
                // rendered preview — there is nowhere to put a cursor — and asking
                // for one item is asking to look at, and probably edit, that line.
                // So a line request falls through to the raw editor; without one
                // this stays the rendered preview it was chosen to be.
                if (at) { await openRaw(uri, at); break; }
                // markdown.showPreview accepts the resource directly — no need to
                // open the raw editor first.
                await vscode.commands.executeCommand('markdown.showPreview', uri);
                break;
            case 'obsidian': {
                // The line jump needs the Advanced URI plugin; without it there is
                // no way to reach a line in Obsidian at all, so the file opens and
                // that is honestly all that happened.
                const deep = at ? obsidianLineUri(filePath, at) : undefined;
                await vscode.env.openExternal(vscode.Uri.parse(deep ?? obsidianUri(filePath)));
                break;
            }
            case 'custom': {
                if (!cfg.customCommand.trim()) {
                    void vscode.window.showWarningMessage(
                        'Agent Farm: no custom app is configured — set one via the "Open with ▾" menu → Configure. Opening in VS Code instead.');
                    await openRaw(uri, at);
                    break;
                }
                const argv = buildCustomArgv(cfg.customArgs, filePath, at);
                const child = cp.spawn(cfg.customCommand, argv, { detached: true, stdio: 'ignore' });
                child.on('error', e => void vscode.window.showErrorMessage(
                    `Agent Farm: custom app failed to launch — ${String((e as Error)?.message ?? e)}`));
                child.unref();
                break;
            }
            case 'vscode':
            default:
                await openRaw(uri, at);
        }
    } catch (e) {
        void vscode.window.showErrorMessage(`Agent Farm: could not open document — ${String(e)}`);
    }
}

/** The raw editor, optionally with the cursor put on a 1-based line. The line is
 *  clamped to the document rather than trusted: it was resolved a moment ago from
 *  a file Obsidian may be holding open, and an out-of-range selection throws. */
async function openRaw(uri: vscode.Uri, line?: number): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(uri);
    if (!line) {
        await vscode.window.showTextDocument(doc, { preview: true });
        return;
    }
    const n = Math.max(0, Math.min(doc.lineCount - 1, line - 1));
    const at = new vscode.Range(n, 0, n, 0);
    await vscode.window.showTextDocument(doc, { preview: true, selection: at });
}
