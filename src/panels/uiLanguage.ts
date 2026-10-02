/**
 * `agentFarm.language`, read live (U-189): the page shell asks on every page it
 * draws, so a changed setting reaches the next page drawn, and the extension
 * host is kept in the same language for what it draws itself.
 */
import * as vscode from 'vscode';
import { afConfig } from '../core/settingsDoor';
import { applyUiLanguage, resolveUiLanguage, UiLanguage } from '../core/i18n';

export function currentUiLanguage(): UiLanguage {
    const ui = resolveUiLanguage(afConfig().get<string>('language', 'auto'), (vscode.env && vscode.env.language) || 'en');
    applyUiLanguage(ui);
    return ui;
}

export function installUiLanguage(context: vscode.ExtensionContext): void {
    currentUiLanguage();
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('agentFarm.language')) { currentUiLanguage(); }
    }));
}
