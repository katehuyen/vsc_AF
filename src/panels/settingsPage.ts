import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { sanitizeValue, pathPreviews, SettingsCategory } from '../core/settingsops';
import { flexSettingsState } from '../core/flexActions';
import { settingValueSources } from '../core/settingSources';
import { buildClaudeModel, validateRawClaudeSettings } from '../core/claudesettings';
import { EngineId, ENGINE_IDS } from '../core/engines';
import {
    AgentEngineDefaults, resolveDefault, storedAccount, storedDefault, withAgentDefault
} from '../core/agentDefaults';
import { accountResolution } from '../core/accountStore';
import { telegramCardData } from './base';
import { type PanelHost } from './panelHost';
import { lockedNote, PHONE_LOCKED_SETTINGS, phoneLocked } from './settingsPhone';
import type { FarmSettingsDeps } from './settingsDeps';

/** Farm Settings' host side under its panel: what the page is drawn from, and every write it makes (U-225). */
export class SettingsPage {
    /** Which engine the per-agent default boxes are editing. Page state, so
     *  it lives here rather than in a setting: it is a view, not a preference,
     *  and it has to survive the refresh that follows every write. */
    defaultsEngine: EngineId = 'claude';

    constructor(readonly host: PanelHost, readonly deps: FarmSettingsDeps) { }

    /**
     * ‼️ U-29/U-33 — EVERY AGENT'S DEFAULTS, PER ENGINE, WITH WHAT "Default"
     * RESOLVES TO ALREADY WORKED OUT.
     *
     * The webview must not do this: the resolution walks three layers (the
     * agent's own Claude settings file, Agent Farm's per-engine store, the
     * fleet-wide launchDefaults) and only the host can read two of them. It is
     * computed here, once per draw, by the pure module that also decides what
     * the launcher does — so the sentence the box prints and the value the
     * session gets can never disagree.
     */
    private foldersWithDefaults(): unknown {
        const rep = this.deps.agentFolders?.();
        if (!rep) { return null; }
        const store = vscode.workspace.getConfiguration()
            .get<AgentEngineDefaults>('agentFarm.agentEngineDefaults', {}) ?? {};
        const launch = vscode.workspace.getConfiguration()
            .get<{ model?: string; effort?: string }>('agentFarm.launchDefaults', {}) ?? {};
        const engines = (this.deps.engines?.() ?? []).map(e => ({ id: e.id, label: e.label }));
        // The live matrix when there is one; otherwise every engine there IS
        // (U-59). The fallback used to be a hand-typed list — complete on the
        // day it was written and silently short of OpenCode ever after, which is
        // a per-agent default box the user simply never got offered.
        const ids: EngineId[] = engines.length
            ? engines.map(e => e.id as EngineId)
            : ENGINE_IDS;
        const choices = this.deps.accountChoices?.() ?? { slots: [], standing: {} };
        const slots = choices.slots;
        const standing = choices.standing;
        const slotName = (id: string): string => slots.find(s => s.id === id)?.label || id;
        const asleep = (id: string): boolean => slots.some(s => s.id === id && s.disabled);
        return {
            ...rep,
            reports: rep.reports.map(r => ({
                ...r,
                candidates: r.candidates.map(c => {
                    const per: Record<string, unknown> = {};
                    for (const id of ids) {
                        const label = engines.find(e => e.id === id)?.label ?? id;
                        const own = storedDefault(store, c.dir, id);
                        const mine = storedAccount(store, c.dir, id);
                        const agentFile = id === 'claude' ? this.agentFileModel(c.dir) : '';
                        per[id] = {
                            model: id === 'claude' ? (agentFile || own.model || '') : (own.model || ''),
                            effort: own.effort || '',
                            resolved: resolveDefault(id, 'model', {
                                agentFile, farm: own.model, launch: launch.model, engineLabel: label
                            }),
                            resolvedEffort: resolveDefault(id, 'effort', {
                                farm: own.effort, launch: launch.effort, engineLabel: label
                            }),
                            /**
                             * ‼️ WHAT THE **Default** ROW REALLY MEANS — the same
                             * resolver with THIS AGENT'S OWN LAYERS LEFT OUT.
                             *
                             * The two above walk every layer including the value
                             * the box itself holds, which is right for the box's
                             * hover ("what applies now") and wrong for its zero
                             * row: that row means "clear my choice", so the value
                             * beside it has to be what would apply AFTER the
                             * clearing. Measured on the `engines` fixture before
                             * this existed: an agent set to `sonnet` drew
                             * `model → sonnet` on the row that removes `sonnet`.
                             *
                             * The agent file goes out with the farm value because
                             * it is this agent's answer too — on Claude it is the
                             * very file this page writes.
                             */
                            resolvedZero: resolveDefault(id, 'model', {
                                launch: launch.model, engineLabel: label
                            }),
                            resolvedEffortZero: resolveDefault(id, 'effort', {
                                launch: launch.effort, engineLabel: label
                            }),
                            /**
                             * ‼️ X-255 — AND WHICH SIGN-IN THIS AGENT STANDS ON.
                             *
                             * Resolved by `accountStore.accountResolution` — the
                             * one order the spawn itself uses — rather than by a
                             * second rule here, so the sentence this box prints
                             * and the plan the session really spends cannot part
                             * company. The zero row leaves this agent's own
                             * answer out for the same reason the model's does:
                             * it means "clear my choice", so it has to name what
                             * would apply AFTER the clearing.
                             */
                            account: mine,
                            resolvedAccount: accountResolution(
                                '', id, standing, mine, slotName, asleep),
                            resolvedAccountZero: accountResolution(
                                '', id, standing, '', slotName, asleep),
                            accounts: slots.filter(s => s.engine === id && (!s.disabled || s.id === mine))
                                .map(s => ({ id: s.id, label: s.disabled ? `${s.label} (disabled)` : s.label }))
                        };
                    }
                    return { ...c, engines: per };
                })
            }))
        };
    }

    /**
     * One agent's default for one NON-Claude engine.
     *
     * ‼️ THIS IS A SETTING AND NOT A FILE, AND THE DIFFERENCE IS STATED RATHER
     * THAN HIDDEN: Codex, Gemini and Antigravity have no per-folder settings
     * file, so there is nowhere on disk that a session started outside Agent
     * Farm would read. Agent Farm keeps the value and passes it as a flag when
     * IT starts the session — which is what the box's own hover says.
     */
    async writeFarmDefault(
        dir: string, engine: unknown, patch: { model?: string; effort?: string; account?: string }
    ): Promise<void> {
        const id = String(engine ?? '').trim().toLowerCase();
        const ids = (this.deps.engines?.() ?? []).map(e => String(e.id));
        if (!id || (ids.length && !ids.includes(id))) { return; }
        const cfg = vscode.workspace.getConfiguration();
        const store = cfg.get<AgentEngineDefaults>('agentFarm.agentEngineDefaults', {}) ?? {};
        await cfg.update('agentFarm.agentEngineDefaults',
            withAgentDefault(store, dir, id as EngineId, patch),
            vscode.ConfigurationTarget.Global);
    }

    /** What `<agent>/.claude/settings.local.json` says — Claude's own layer,
     *  and the only one that works for a session started in a terminal. */
    private agentFileModel(dir: string): string {
        for (const name of ['settings.local.json', 'settings.json']) {
            try {
                const raw = fs.readFileSync(path.join(dir, '.claude', name), 'utf8');
                const v = validateRawClaudeSettings(raw);
                if (v.ok && typeof v.json.model === 'string') { return v.json.model.trim(); }
            } catch { /* not there, or not ours to read */ }
        }
        return '';
    }

    categories(): SettingsCategory[] {
        return this.deps.categories();
    }

    /** Read Claude Code's settings.json — missing file is a valid empty state. */
    readClaude(): { json: Record<string, unknown>; raw: string; parseError: string } {
        const file = this.deps.claudeSettingsFile();
        let raw = '';
        try { raw = fs.readFileSync(file, 'utf8'); } catch { /* not created yet */ }
        if (!raw.trim()) { return { json: {}, raw: '{}', parseError: '' }; }
        const v = validateRawClaudeSettings(raw);
        return v.ok
            ? { json: v.json, raw, parseError: '' }
            : { json: {}, raw, parseError: v.error };
    }

    /** Write it back — pretty JSON, with a one-time .agentfarm-backup of the
     *  original next to it (live product: an edit must always be undoable). */
    writeClaude(json: Record<string, unknown>): string {
        const file = this.deps.claudeSettingsFile();
        try {
            const backup = file + '.agentfarm-backup';
            if (fs.existsSync(file) && !fs.existsSync(backup)) {
                fs.copyFileSync(file, backup);
            }
            fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf8');
            return '';
        } catch (e) {
            return String((e as Error).message).slice(0, 200);
        }
    }

    protected buildData(): Record<string, unknown> {
        const cc = this.readClaude();
        // Built once: the path previews are derived from these same items, and
        // rebuilding the model to ask it a second question would be two answers
        // to one draw.
        const cats = this.categories();
        return {
            // the user's model-name knowledge base — feeds every model picker
            modelAliases: vscode.workspace.getConfiguration()
                .get<string[]>('agentFarm.modelAliases', ['haiku', 'sonnet', 'opus', 'fable']),
            // ‼️ U-29 — WHAT EACH ENGINE ACTUALLY OFFERS. The per-agent model box
            // used to draw the alias list whatever engine it was for, which is
            // the same expiry-dated constant core/models.ts exists to end.
            engineModels: this.deps.engineModels?.() ?? null,
            // …and which engine the boxes are currently editing (page state,
            // held on the host so it survives the refresh after every write).
            agentDefaultsEngine: this.defaultsEngine,
            folders: this.foldersWithDefaults(),
            categories: cats,
            // ‼️ X-193 — read on every draw, like the folders above: `${today}`
            // changes at midnight under an open page, and a vault the user just
            // configured is exactly the change they came back here to confirm.
            pathVars: this.deps.pathVarValues?.() ?? null,
            pathPreview: this.deps.previewPaths
                ? pathPreviews(cats, this.deps.previewPaths.bind(this.deps)) : null,
            profiles: this.deps.getProfiles().map(p => ({
                name: p.name, savedAt: p.savedAt, count: Object.keys(p.values).length
            })),
            // X-456 — the whole file never reaches a phone: its env block can hold a key.
            claude: {
                file: this.deps.claudeSettingsFile(),
                items: buildClaudeModel(cc.json),
                raw: this.host.remote ? '' : cc.raw,
                parseError: cc.parseError
            },
            phoneLocked: this.host.remote ? PHONE_LOCKED_SETTINGS : [],
            docOpen: this.deps.docOpen?.() ?? null,
            prompts: this.deps.promptSnippets?.() ?? null,
            // X-57 — read on every draw, like the engines below: the folder is
            // one somebody edits in Obsidian while this page is open, and a
            // cached "index.md is missing" would be a lie thirty seconds later.
            wiki: this.deps.wikiHealth?.() ?? null,
            // X-136 — read on every draw for the wiki's reason above: the
            // skills folder is one somebody edits by hand, and an agent added
            // to a root five minutes ago belongs in the matrix.
            superpowers: this.deps.superpowers?.() ?? null,
            // A-21 — read on every draw for the two folders' reason above: a
            // sound file the user moved or deleted in Explorer is exactly the
            // change this card exists to make visible, and a cached "playable"
            // would be a lie the next time the alert fires.
            alerts: this.deps.alerts?.() ?? null,
            // X-3 — which agent CLIs this machine can run and how each is paid
            // for. Read on every build rather than cached: a sign-in that
            // happened in the terminal thirty seconds ago is exactly the change
            // somebody comes back to this page to confirm.
            engines: this.deps.engines?.() ?? null,
            kapici: this.deps.kapici?.() ?? null,
            // U-84 — read on every draw for the same reason the four above are:
            // a token connected in another window, a poll that has just failed
            // and today's spend are all facts that change under an open page.
            // Composed by `telegramCardData`, so this page and the Toolbox draw
            // one card rather than two that agree until one of them is touched.
            telegram: telegramCardData(this.deps.telegram) ?? null,
            // ‼️ U-84 (d) — the live values a picker setting offers, keyed by the
            // source its schema names (`x-af-values`). A hand-written list of
            // keys on the page would go stale the first time a setting is added;
            // a source declared in the manifest travels with the setting.
            valueSources: settingValueSources(this.deps),
            // U-152 — derived from the flex registry on every draw: a new point gains its row here.
            flex: this.deps.flex ? flexSettingsState(this.deps.flex) : null
        };
    }

    refresh(): void {
        void this.host.webview.postMessage({ type: 'data', data: this.buildData() });
    }


    async setValue(key: string, value: unknown): Promise<string> {
        const spec = this.deps.schema()[key];
        if (!spec) { return 'unknown setting'; }
        if (this.host.remote && phoneLocked(key)) { return lockedNote([key]); }
        if (value === undefined) { // reset to default
            await vscode.workspace.getConfiguration().update(key, undefined, vscode.ConfigurationTarget.Global);
            return '';
        }
        const s = sanitizeValue(
            {
                type: Array.isArray(spec.type) ? String(spec.type[0]) : String(spec.type ?? 'string'), enum: Array.isArray(spec.enum) ? spec.enum.map(String) : undefined,
                ...(typeof spec.minimum === 'number' ? { minimum: spec.minimum } : {}), ...(typeof spec.maximum === 'number' ? { maximum: spec.maximum } : {})
            },
            value);
        if (!s.ok) { return s.error; }
        await vscode.workspace.getConfiguration().update(key, s.value, vscode.ConfigurationTarget.Global);
        return '';
    }
}
