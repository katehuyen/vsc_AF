import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    CC_CATALOG, coerceClaudeValue, patchClaudeSettings, validateRawClaudeSettings
} from '../core/claudesettings';
import { EngineId } from '../core/engines';
import { normPath } from '../core/util';
import { revealPath } from '../core/reveal';
import type { SettingsPage } from './settingsPage';

/** Farm Settings: Claude Code's settings.json, the agent roots, and each agent's per-engine defaults.
 *  Answers one message when it is theirs; `false` lets the panel's next handler take it. */
export async function handleSettingsAgentMessage(msg: { type: string; [k: string]: unknown }, s: SettingsPage): Promise<boolean> {
    switch (msg.type) {
        case 'ccSet': {
            const item = CC_CATALOG.find(i => i.id === msg.id);
            if (!item) { break; }
            const cc = s.readClaude();
            if (cc.parseError) {
                void s.host.webview.postMessage({ type: 'ccError', id: item.id, error: 'settings.json is not valid JSON — fix it in the raw editor first' });
                break;
            }
            const coerced = coerceClaudeValue(item, msg.value);
            if (!coerced.ok) {
                void s.host.webview.postMessage({ type: 'ccError', id: item.id, error: coerced.error });
                break;
            }
            const err = s.writeClaude(patchClaudeSettings(cc.json, item.path, coerced.value));
            if (err) { void s.host.ask.error('Agent Farm: could not write settings.json — ' + err); }
            s.refresh();
            break;
        }
        case 'ccClear': {
            const item = CC_CATALOG.find(i => i.id === msg.id);
            if (!item) { break; }
            const cc = s.readClaude();
            if (!cc.parseError) {
                s.writeClaude(patchClaudeSettings(cc.json, item.path, undefined));
            }
            s.refresh();
            break;
        }
        case 'ccRaw': {
            const v = validateRawClaudeSettings(String(msg.text ?? ''));
            if (!v.ok) {
                void s.host.webview.postMessage({ type: 'ccError', id: '__raw__', error: v.error });
                break;
            }
            const err = s.writeClaude(v.json);
            if (err) { void s.host.ask.error('Agent Farm: could not write settings.json — ' + err); }
            s.refresh();
            break;
        }
        case 'ccOpenFile':
            void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(s.deps.claudeSettingsFile()));
            break;
        // ---- Agent folders section ----
        // Every write below lands in settings.json; onDidChangeConfiguration
        // then re-scans and refreshes this page (and every other surface).
        case 'rootAdd':
            await vscode.commands.executeCommand('agentfarm.addAgentRoot');
            break;
        case 'rootRemove': {
            const root = String(msg.root ?? '');
            if (!root) { break; }
            const rep = s.deps.agentFolders?.().reports.find(r => r.root === root);
            const n = rep ? rep.candidates.filter(c => !c.excluded).length : 0;
            const pick = await s.host.ask.warn(
                `Remove agent root "${root}"?` +
                (n ? ` Its ${n} agent(s) leave the farm views.` : '') +
                ' The folder itself is not touched.',
                { modal: true }, 'Remove');
            if (pick !== 'Remove') { break; }
            const cfg = vscode.workspace.getConfiguration();
            await cfg.update('agentFarm.agentRoots',
                cfg.get<string[]>('agentFarm.agentRoots', []).filter(r => r !== root),
                vscode.ConfigurationTarget.Global);
            break;
        }
        case 'rootReveal':
            if (typeof msg.root === 'string' && msg.root) {
                void revealPath(msg.root);
            }
            break;
        case 'rootCleanDupes': {
            const cfg = vscode.workspace.getConfiguration();
            const roots = cfg.get<string[]>('agentFarm.agentRoots', []);
            const seen = new Set<string>();
            const clean = roots.filter(r => {
                if (seen.has(normPath(r))) { return false; }
                seen.add(normPath(r));
                return true;
            });
            if (clean.length !== roots.length) {
                await cfg.update('agentFarm.agentRoots', clean, vscode.ConfigurationTarget.Global);
                void s.host.ask.info(
                    `Agent Farm: ${roots.length - clean.length} duplicate root entry(ies) removed.`);
            }
            break;
        }
        case 'agentExclude': {
            const dir = String(msg.dir ?? '');
            if (!dir) { break; }
            const cfg = vscode.workspace.getConfiguration();
            const list = cfg.get<string[]>('agentFarm.excludeAgentDirs', []);
            if (!list.some(x => normPath(x) === normPath(dir))) {
                await cfg.update('agentFarm.excludeAgentDirs', [...list, dir], vscode.ConfigurationTarget.Global);
            }
            break;
        }
        case 'agentInclude': {
            const dir = String(msg.dir ?? '');
            if (!dir) { break; }
            const cfg = vscode.workspace.getConfiguration();
            const next = cfg.get<string[]>('agentFarm.excludeAgentDirs', [])
                .filter(x => normPath(x) !== normPath(dir));
            await cfg.update('agentFarm.excludeAgentDirs', next, vscode.ConfigurationTarget.Global);
            break;
        }
        // ‼️ U-29 — WHICH ENGINE THESE DEFAULTS ARE FOR is now part of the
        // message, and it decides WHERE the value goes: Claude's into the
        // file its own CLI reads, every other engine's into Agent Farm's
        // store (they have no per-folder settings file — see
        // core/agentDefaults.ts).
        case 'agentDefaultsEngine': {
            const want = String(msg.engine ?? '').trim().toLowerCase();
            const ids = (s.deps.engines?.() ?? []).map(e => String(e.id));
            if (ids.length && !ids.includes(want)) { break; }
            s.defaultsEngine = (want || 'claude') as EngineId;
            s.refresh();
            break;
        }
        case 'agentEffort': {
            const dir = String(msg.dir ?? '');
            const known = s.deps.agentFolders?.().reports
                .some(r => r.candidates.some(c => c.dir === dir));
            if (!dir || !known) { break; }
            await s.writeFarmDefault(dir, msg.engine, { effort: String(msg.effort ?? '').trim() });
            s.refresh();
            break;
        }
        /**
         * ‼️ X-255 — THIS AGENT'S STANDING SIGN-IN, and it goes into Agent
         * Farm's store on EVERY engine including Claude.
         *
         * The model above is Claude's own file's because its CLI reads that
         * file itself. An account is not that kind of answer: it is a
         * directory handed to the process in its environment at spawn, and
         * Claude Code has no settings key for one. Writing it into the
         * agent's `.claude/settings.local.json` would be inventing a key
         * nothing reads — the U-29 bug exactly, arriving one axis over.
         *
         * ‼️ AND AN ID NOBODY HOLDS IS NOT STORED. A webview that could
         * write an arbitrary string here would be a webview that can refuse
         * every future launch of this agent (`launchAccountRefusal`), which
         * is a worse failure than the box not working.
         */
        case 'agentAccount': {
            const dir = String(msg.dir ?? '');
            const known = s.deps.agentFolders?.().reports
                .some(r => r.candidates.some(c => c.dir === dir));
            if (!dir || !known) { break; }
            const engine = String(msg.engine ?? 'claude').trim().toLowerCase();
            const account = String(msg.account ?? '').trim();
            const slots = s.deps.accountChoices?.().slots ?? [];
            if (account && !slots.some(s => s.id === account && s.engine === engine && !s.disabled)) { break; }
            await s.writeFarmDefault(dir, engine, { account });
            s.refresh();
            break;
        }
        case 'agentModel': {
            // Per-agent default model. Only scanned agent folders are
            // writable from here — the webview must not be able to point us
            // at arbitrary paths.
            const dir = String(msg.dir ?? '');
            const model = String(msg.model ?? '').trim();
            const known = s.deps.agentFolders?.().reports
                .some(r => r.candidates.some(c => c.dir === dir));
            if (!dir || !known) { break; }
            const engine = String(msg.engine ?? 'claude').trim().toLowerCase();
            if (engine && engine !== 'claude') {
                await s.writeFarmDefault(dir, engine, { model });
                s.refresh();
                break;
            }
            // …and Claude's still goes in the file, because that is what
            // makes it apply to a session started in a terminal too.
            ('' as string);
            const file = path.join(dir, '.claude', 'settings.local.json');
            let json: Record<string, unknown> = {};
            try {
                const v = validateRawClaudeSettings(fs.readFileSync(file, 'utf8'));
                if (!v.ok) {
                    void s.host.ask.error(
                        `Agent Farm: ${file} is not valid JSON — fix the file first.`);
                    break;
                }
                json = v.json;
            } catch { /* not created yet — start empty */ }
            try {
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file,
                    JSON.stringify(patchClaudeSettings(json, ['model'], model || undefined), null, 2) + '\n',
                    'utf8');
            } catch (e) {
                void s.host.ask.error(
                    'Agent Farm: could not write ' + file + ' — ' + String((e as Error).message));
            }
            s.refresh();
            break;
        }
        default:
            return false;
    }
    return true;
}
