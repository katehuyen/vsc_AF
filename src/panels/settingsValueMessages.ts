import * as fs from 'fs';
import * as vscode from 'vscode';
import {
    snapshotProfile, profileApplyPlan, parseImportedProfiles, SettingsProfile
} from '../core/settingsops';
import { lockedNote, phoneLocked } from './settingsPhone';
import type { SettingsPage } from './settingsPage';

/** Farm Settings: a setting's value (set, reset, Browse…, VS Code's own editor and file) and the named setting sets.
 *  Answers one message when it is theirs; `false` lets the panel's next handler take it. */
export async function handleSettingsValueMessage(msg: { type: string; [k: string]: unknown }, s: SettingsPage): Promise<boolean> {
    switch (msg.type) {
        case 'set':
        case 'reset': {
            const key = String(msg.key ?? '');
            const error = await s.setValue(key, msg.type === 'set' ? msg.value : undefined);
            if (error) {
                void s.host.webview.postMessage({ type: 'error', key, error });
            }
            // success refreshes via onDidChangeConfiguration
            break;
        }
        /**
         * Browse… on a path setting (schema `format: file-path` /
         * `folder-path`). The dialog opens where the setting already points
         * — picking a new prompts file means going back to the folder the
         * old one was in, and starting at the last-used directory instead
         * would cost that walk every time.
         */
        /**
         * ‼️ U-108 — THE SAME DIALOG FOR ONE ROW OF A LIST, and the
         * answer goes BACK TO THE PAGE instead of into the setting.
         *
         * `browse` above writes what was picked straight through, because
         * on a scalar path setting the picked path IS the whole value. A
         * row is not: the list around it is still being edited, and
         * saving here would commit every other row at the same moment —
         * including the ones the user was in the middle of removing.
         *
         * The dialog opens where THAT ROW already points, so replacing
         * one root does not start the walk from the top again.
         */
        case 'browseRow': {
            const key = String(msg.key ?? '');
            const index = Number(msg.index);
            const folders = String(msg.kind ?? 'folder') === 'folder';
            const current = (() => {
                const v = vscode.workspace.getConfiguration().get(key);
                const row = Array.isArray(v) ? v[index] : undefined;
                return String(row ?? '').trim();
            })();
            const picked = await s.host.ask.open({
                canSelectFolders: folders, canSelectFiles: !folders, canSelectMany: false,
                openLabel: folders ? 'Use this folder' : 'Use this file',
                ...(current ? { defaultUri: vscode.Uri.file(current) } : {})
            });
            const file = picked?.[0]?.fsPath;
            if (!file) { break; }
            void s.host.webview.postMessage({
                type: 'browsedRow', key, index, path: file
            });
            break;
        }
        case 'browse': {
            const key = String(msg.key ?? '');
            const folders = String(msg.kind ?? 'file') === 'folder';
            const current = String(vscode.workspace.getConfiguration().get(key) ?? '').trim();
            const picked = await s.host.ask.open({
                canSelectFolders: folders, canSelectFiles: !folders, canSelectMany: false,
                openLabel: folders ? 'Use this folder' : 'Use this file',
                ...(current ? { defaultUri: vscode.Uri.file(current) } : {})
            });
            const file = picked?.[0]?.fsPath;
            if (!file) { break; }
            const error = await s.setValue(key, file);
            if (error) { void s.host.webview.postMessage({ type: 'error', key, error }); }
            break;
        }
        // From a setting's right-click menu: the same key, in VS Code's own
        // settings editor — where its raw JSON, its scope and its history
        // live. This page is a curated view, not a replacement for that.
        case 'openSettingsUi':
            if (typeof msg.key === 'string' && msg.key) {
                void vscode.commands.executeCommand('workbench.action.openSettings', msg.key);
            }
            break;
        // U-139 — the FILE this whole page is a view of. Every box writes
        // into it and the ↺ buttons remove keys from it, so a reader who
        // wants to read it, paste a block in, or repair a value the schema
        // refuses should not have to know the command palette.
        case 'openSettingsJson':
            void vscode.commands.executeCommand('workbench.action.openSettingsJson');
            break;
        case 'saveProfile': {
            const name = String(msg.name ?? '').trim();
            if (!name) { break; }
            const profile = snapshotProfile(name, s.categories());
            const list = s.deps.getProfiles().filter(p => p.name !== profile.name);
            list.push(profile);
            list.sort((a, b) => a.name.localeCompare(b.name));
            await s.deps.setProfiles(list);
            s.refresh();
            void s.host.ask.info(
                `Agent Farm: setting set "${profile.name}" saved (${Object.keys(profile.values).length} non-default value(s)).`);
            break;
        }
        case 'applyProfile': {
            const profile = s.deps.getProfiles().find(p => p.name === msg.name);
            if (!profile) { break; }
            const plan = profileApplyPlan(profile, s.categories());
            const resets = plan.filter(p => p.value === undefined).length;
            const pick = await s.host.ask.warn(
                `Apply setting set "${profile.name}"? ${plan.length - resets} value(s) will be set` +
                (resets ? `, ${resets} other modified setting(s) reset to default` : '') + '.',
                { modal: true }, 'Apply');
            if (pick !== 'Apply') { break; }
            const locked: string[] = [];
            for (const step of plan) {
                const error = await s.setValue(step.key, step.value === undefined ? undefined : step.value);
                if (error && phoneLocked(step.key)) { locked.push(step.key); }
            }
            if (locked.length) { void s.host.ask.info('Agent Farm: ' + lockedNote(locked)); }
            s.refresh();
            break;
        }
        case 'deleteProfile': {
            await s.deps.setProfiles(s.deps.getProfiles().filter(p => p.name !== msg.name));
            s.refresh();
            break;
        }
        case 'exportProfiles': {
            const list = s.deps.getProfiles();
            if (!list.length) { break; }
            const uri = await vscode.window.showSaveDialog({
                saveLabel: 'Export setting sets',
                filters: { JSON: ['json'] },
                defaultUri: vscode.Uri.file('agent-farm-setting-sets.json')
            });
            if (!uri) { break; }
            try {
                fs.writeFileSync(uri.fsPath, JSON.stringify(list, null, 2), 'utf8');
                void s.host.ask.info(`Agent Farm: ${list.length} setting set(s) exported.`);
            } catch (e) {
                void s.host.ask.error('Agent Farm: export failed — ' + String((e as Error).message));
            }
            break;
        }
        case 'importProfiles': {
            const uris = await s.host.ask.open({
                openLabel: 'Import setting sets', filters: { JSON: ['json'] }, canSelectMany: false
            });
            if (!uris?.length) { break; }
            let imported: SettingsProfile[] = [];
            try { imported = parseImportedProfiles(fs.readFileSync(uris[0].fsPath, 'utf8')); } catch { /* unreadable */ }
            if (!imported.length) {
                void s.host.ask.warn('Agent Farm: no valid setting sets in that file.');
                break;
            }
            const list = s.deps.getProfiles().filter(p => !imported.some(i => i.name === p.name));
            list.push(...imported);
            list.sort((a, b) => a.name.localeCompare(b.name));
            await s.deps.setProfiles(list);
            s.refresh();
            void s.host.ask.info(`Agent Farm: imported ${imported.length} setting set(s).`);
            break;
        }
        default:
            return false;
    }
    return true;
}
