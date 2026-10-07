/**
 * 'Agent Farm: Find Setting…' (U-224) — every Agent Farm setting by the name its key implies,
 * with its section beside it and its key below; the choice opens the Settings page on that row.
 */
import * as vscode from 'vscode';
import { SettingsCategory } from './core/settingsops';
import { settingName } from './core/settingSearch';

export interface SettingPick extends vscode.QuickPickItem { key: string }

/** The palette's rows: name, section (and whether it is changed), key — in the page's own order. */
export function settingPicks(categories: SettingsCategory[]): SettingPick[] {
    return categories.flatMap(c => c.items.map(it => ({
        label: settingName(it.key),
        description: c.label + (it.modified ? ' · changed' : ''),
        detail: it.key,
        key: it.key
    })));
}

/** The command's whole act; registered in extension.ts, where the parity gate reads every command. */
export async function findSetting(categories: () => SettingsCategory[]): Promise<void> {
    const chosen = await vscode.window.showQuickPick(settingPicks(categories()), {
        title: 'Find Setting',
        placeHolder: 'A setting\'s name, its section or its key',
        matchOnDescription: true,
        matchOnDetail: true
    });
    if (chosen) { await vscode.commands.executeCommand('agentfarm.openFarmSettings', { focus: chosen.key }); }
}
