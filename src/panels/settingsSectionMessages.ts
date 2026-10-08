import * as vscode from 'vscode';
import { revealPath } from '../core/reveal';
import { handleAfNav } from './base';
import type { SettingsPage } from './settingsPage';

/** Farm Settings: the sections' gestures — saved prompts, engines, Open with, the wiki, Superpowers — and the page's links.
 *  Answers one message when it is theirs; `false` lets the panel's next handler take it. */
export async function handleSettingsSectionMessage(msg: { type: string; [k: string]: unknown }, s: SettingsPage): Promise<boolean> {
    switch (msg.type) {
        /**
         * Saved prompts — the same three gestures the Console picker has,
         * so the two doors behave alike (that promise is in consolePanel's
         * `pickPromptSnippets` comment, and this is the other half of it).
         *
         * `promptsUseDefault` REMOVES the key rather than writing '': an
         * explicit empty string is a value, and a value outranks the
         * built-in path for good. Removing it is the only thing that
         * actually means "I have chosen nothing".
         */
        case 'promptsPick': {
            const current = s.deps.promptSnippets?.().file ?? '';
            const picked = await s.host.ask.open({
                canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
                openLabel: 'Use this file',
                filters: { 'Markdown / text': ['md', 'markdown', 'txt'], 'All files': ['*'] },
                ...(current ? { defaultUri: vscode.Uri.file(current) } : {})
            });
            const file = picked?.[0]?.fsPath;
            if (file) { await s.deps.setPromptSnippetsFile?.(file); }
            s.refresh();
            break;
        }
        case 'promptsUseDefault':
            await s.deps.setPromptSnippetsFile?.('');
            s.refresh();
            break;
        case 'promptsOpen': {
            const file = s.deps.promptSnippets?.().file ?? '';
            if (file) { void vscode.window.showTextDocument(vscode.Uri.file(file)); }
            break;
        }
        // Re-read the file without changing anything — the list is a view of
        // a document somebody edits in Obsidian while this page is open.
        case 'promptsReload':
            s.refresh();
            break;
        // ---- X-3: the engine rows ------------------------------------
        // ‼️ The page asks; the host acts. A credential is never decided
        // here and never travels through the webview: the sign-in is the
        // CLI's own command in a real terminal, and the key route is the
        // vault's own form.
        case 'engineCommand':
            if (typeof msg.command === 'string' && msg.command) {
                s.deps.engineCommand?.(msg.command);
            }
            break;
        case 'openEngines':
            s.deps.openEngines?.();
            break;
        case 'openAccounts':
            s.deps.openAccounts?.();
            break;
        case 'openSecrets':
            s.deps.openSecrets?.();
            break;
        // U-229 — the web token row's Generate is the revoke, so it is asked first, as web.token.new asks for confirm
        case 'webTokenNew': {
            const go = 'New token';
            const pick = await s.host.ask.warn(
                'A new web view token ends every link made with the old one, a phone bookmark too.', { modal: true }, go);
            if (pick === go) { await s.deps.newWebToken?.(); }
            break;
        }
        case 'kapiciMcp':
            if (typeof msg.on === 'boolean') {
                s.deps.kapiciMcp?.(msg.on);
                s.refresh();
            }
            break;
        case 'engineKey':
            if (typeof msg.name === 'string' && msg.name) {
                s.deps.engineKey?.(msg.name);
            }
            break;
        case 'engineDocs':
            if (typeof msg.url === 'string' && /^https:\/\//.test(msg.url)) {
                void vscode.env.openExternal(vscode.Uri.parse(msg.url));
            }
            break;
        case 'docOpenSet': {
            const field = String(msg.field ?? '');
            if (field === 'defaultMode' || field === 'customCommand' || field === 'customArgs') {
                s.deps.setDocOpen?.({ [field]: String(msg.value ?? '') });
                s.refresh();
            }
            break;
        }
        /**
         * X-57 — the four gestures of the Wiki section. Three of them do
         * nothing this page decides: the scaffold, the reveal and the
         * cockpit all belong to code that already exists, and the page's
         * job is to put them next to the sentence that says why you would
         * press them.
         */
        case 'wikiInit': {
            const r = s.deps.wikiInit?.();
            if (r && !r.ok) {
                void s.host.webview.postMessage({
                    type: 'error', key: 'agentFarm.wikiRoot', error: r.error ?? 'could not create it'
                });
            } else if (r) {
                void s.host.ask.info(
                    r.created?.length
                        ? `Agent Farm: wiki started — ${r.created.join(', ')} created.`
                        : 'Agent Farm: the wiki already holds all three files; nothing was written.');
            }
            s.refresh();
            break;
        }
        // Read the folder again without changing anything. It is a folder
        // somebody edits in Obsidian while this page is open, so "nothing
        // changed" is a real and useful answer.
        case 'wikiRescan':
            s.refresh();
            break;
        case 'wikiReveal': {
            const root = s.deps.wikiHealth?.().root ?? '';
            if (root) { void revealPath(root); }
            break;
        }
        case 'wikiOpen':
            s.deps.openWiki?.();
            break;
        /**
         * X-136 — the three gestures of the Superpowers section. The path
         * itself is the ordinary text box and the ordinary Browse…, and
         * [Reset to default] is the ordinary reset — the only thing this
         * section had to add is the per-agent answer, which had no surface
         * at all before, plus the re-read and the reveal a folder edited by
         * hand needs.
         */
        case 'spDefault': {
            const agent = String(msg.agent ?? '').trim();
            if (!agent) { break; }
            await s.deps.superpowersSet?.(agent, msg.on !== false);
            s.refresh();
            break;
        }
        case 'spRescan':
            s.refresh();
            break;
        case 'spReveal': {
            const root = s.deps.superpowers?.()?.root ?? '';
            if (root) { void revealPath(root); }
            break;
        }
        case 'openAgent':
            if (typeof msg.agentId === 'string' && msg.agentId) {
                void vscode.commands.executeCommand('agentfarm.openAgentDetail', { agentId: msg.agentId });
            }
            break;
        case 'openGuide':
            void vscode.commands.executeCommand('agentfarm.openGuide', msg.anchor);
            break;
        case 'afnav':
            handleAfNav(msg.to);
            break;
        case 'refresh':
            s.refresh();
            break;
        default:
            return false;
    }
    return true;
}
