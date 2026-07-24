import * as cp from 'child_process';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { buildCustomArgv, DocOpenConfig, DocOpenMode, obsidianUri } from '../core/docopen';

/**
 * openReportDoc — the ONE helper both the Notices and Work-Queue panels use to
 * open a report/answer .md link, honouring the user's chosen mode. The path is
 * always supplied by the host (from the notice/item, never from the webview), so
 * this can only open a file an agent actually attached.
 *
 * Modes (see core/docopen.ts): 'vscode' raw editor · 'preview' rendered VS Code
 * Markdown preview · 'obsidian' rendered in the vault via the obsidian:// URI ·
 * 'custom' a user-configured external app ({file} → the absolute path).
 */
export async function openReportDoc(filePath: string, mode: DocOpenMode, cfg: DocOpenConfig): Promise<void> {
    if (!filePath) { return; }
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
                // markdown.showPreview accepts the resource directly — no need to
                // open the raw editor first.
                await vscode.commands.executeCommand('markdown.showPreview', uri);
                break;
            case 'obsidian':
                await vscode.env.openExternal(vscode.Uri.parse(obsidianUri(filePath)));
                break;
            case 'custom': {
                if (!cfg.customCommand.trim()) {
                    void vscode.window.showWarningMessage(
                        'Agent Farm: no custom app is configured — set one via the "Open with ▾" menu → Configure. Opening in VS Code instead.');
                    await openRaw(uri);
                    break;
                }
                const argv = buildCustomArgv(cfg.customArgs, filePath);
                const child = cp.spawn(cfg.customCommand, argv, { detached: true, stdio: 'ignore' });
                child.on('error', e => void vscode.window.showErrorMessage(
                    `Agent Farm: custom app failed to launch — ${String((e as Error)?.message ?? e)}`));
                child.unref();
                break;
            }
            case 'vscode':
            default:
                await openRaw(uri);
        }
    } catch (e) {
        void vscode.window.showErrorMessage(`Agent Farm: could not open document — ${String(e)}`);
    }
}

async function openRaw(uri: vscode.Uri): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: true });
}
