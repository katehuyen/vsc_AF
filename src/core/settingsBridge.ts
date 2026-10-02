import * as fs from 'fs';
import * as path from 'path';
import { AgentInfo } from './agents';
import { AgentEngineDefault } from './agentDefaults';
import { argStr, BridgeRegistry, need, optStr } from './bridge';
import { CCItem } from './claudesettings';
import { ENGINE_ENUM } from './consoleEngine';
import { PreviewedPath } from './pathVars';
import {
    parseImportedProfiles, pathPreviews, sanitizeValue, SettingsCategory, SettingsProfile
} from './settingsops';

/**
 * Fleet and settings management over the bridge (B-7).
 *
 * ‼️ THE SETTINGS PAGE WAS THE LAST PLACE WHERE "SET IT UP" MEANT "SIT IN FRONT
 * OF IT". Every value on it is one a person changes and an agent could
 * reasonably be told to change — "point the farm at this folder", "put this
 * agent on gemini", "restore my old setting set" — and none of it could be
 * reached by instruction.
 *
 * Three rules run through the file:
 *
 *  - **The SCHEMA is the allowlist.** A key the manifest does not declare is
 *    refused, and every value goes through the same `sanitizeValue` the page
 *    uses. There is no arbitrary settings.json overwrite here, and none in the
 *    Claude Code half either — that side writes only the catalogued lines.
 *  - **A sensitive value is never read back.** A key whose name ends in Key /
 *    Token / Password comes back masked with `masked:true` beside it. The
 *    Secrets vault stays off the bridge entirely (the deliberate exception).
 *  - **What changes is said before it changes** — `dryRun` on everything that
 *    writes more than one value, and every answer carries the scope it wrote to
 *    and whether a reload is needed for it to take effect.
 */

/** Keys whose VALUE is a credential — reported masked, never in full. */
const SENSITIVE = /(apikey|api_key|key|token|password)$/i;

export function isSensitiveKey(key: string): boolean {
    return SENSITIVE.test(key.replace(/^agentFarm\./, ''));
}

export function maskIfSensitive(key: string, value: unknown): unknown {
    if (!isSensitiveKey(key) || value === undefined || value === null || value === '') { return value; }
    return typeof value === 'string' ? '••••••••' : value;
}

/**
 * Does this setting need a window reload? Derived from the setting's OWN
 * description rather than a hand-kept list — a list of keys goes stale the
 * first time somebody adds a setting and forgets it, and the description is
 * where the fact already lives.
 */
export function needsReload(description: string): boolean {
    return /\b(restart|reload)\b/i.test(description ?? '');
}

export interface SettingsBridgeDeps {
    getAgents(): AgentInfo[];
    /** the schema-driven model the page draws — categories with live values */
    categories(): SettingsCategory[];
    /** write one key at global scope; undefined resets it to the default */
    writeSetting(key: string, value: unknown): Promise<void>;
    /** read one Agent Farm config value */
    readSetting<T>(key: string, fallback: T): T;
    /**
     * ‼️ X-193 — the path variables and what each is on THIS machine, plus the
     * resolver for a list of templates. The settings page shows this in every
     * path row; an agent asked to fix an overnight campaign that "found no
     * handover note" needs the same answer, and deriving it a second way over
     * the bridge is how the two come to disagree.
     */
    pathVarValues?(): { name: string; describe: string; value: string }[];
    previewPaths?(templates: string[]): PreviewedPath[];
    /** saved setting sets */
    getProfiles(): SettingsProfile[];
    setProfiles(list: SettingsProfile[]): Promise<void>;
    /** what applying a profile would do, from the page's own planner */
    applyPlan(profile: SettingsProfile): { key: string; value: unknown }[];
    /** Claude Code's own settings.json — the catalogued lines only */
    claudeCatalog(): CCItem[];
    claudeSettingsFile(): string;
    readClaude(): { json: unknown; parseError?: string };
    writeClaude(json: unknown): string | undefined;
    claudePatch(json: unknown, path: string[], value: unknown): unknown;
    claudeCoerce(item: CCItem, value: unknown): { ok: true; value: unknown } | { ok: false; error: string };
    claudeRead(json: unknown, path: string[]): unknown;
    /** folders scanned for agents, and what was found in each */
    agentFolders(): { root: string; candidates: { dir: string; name: string; excluded: boolean }[] }[];
    /** engine ids this build knows */
    engineIds(): string[];
    /** per-agent engine defaults store, and the write the page makes */
    writeAgentDefault(dir: string, engine: string, patch: Partial<AgentEngineDefault>): Promise<void>;
    /**
     * X-255 — the sign-ins this machine holds, so an account written onto an
     * agent can be REFUSED rather than stored. A slot id nobody holds would
     * refuse every later launch of that agent, and an agent whose every launch
     * is refused by a setting it cannot see is a worse outcome than the write
     * failing here with a sentence.
     */
    accountChoices(): {
        slots: { id: string; engine: string; label: string }[];
        standing: Record<string, string>;
    };
    /** build an agent pack and write it out */
    exportPack(agent: AgentInfo, file: string): { warnings: string[]; files: number };
    normPath(p: string): string;
}

export function registerSettingsOps(bridge: BridgeRegistry, deps: SettingsBridgeDeps): void {
    const allItems = (): SettingsCategory['items'] =>
        deps.categories().flatMap(c => c.items);

    const specOf = (key: string): SettingsCategory['items'][number] => {
        const full = key.startsWith('agentFarm.') ? key : `agentFarm.${key}`;
        const it = allItems().find(x => x.key === full);
        need(it, `"${key}" is not an Agent Farm setting — settings.list shows every key this build declares.`);
        return it as SettingsCategory['items'][number];
    };

    const itemOut = (it: SettingsCategory['items'][number]): Record<string, unknown> => ({
        key: it.key, type: it.type, enum: it.enum ?? null,
        value: maskIfSensitive(it.key, it.value),
        default: maskIfSensitive(it.key, it.default),
        modified: it.modified,
        masked: isSensitiveKey(it.key),
        reloadRequired: needsReload(it.description),
        description: it.description,
        // X-470 — the row's notes reach the bridge as they reach the page: a refusal or an in-force figure said on one surface only is a second opinion
        ...(it.refusal ? { refusal: it.refusal } : {}),
        ...(it.inForce ? { inForce: it.inForce } : {})
    });

    const findAgent = (ref: string): AgentInfo => {
        const a = deps.getAgents().find(x =>
            x.id === ref || x.name.toLowerCase() === ref.toLowerCase());
        need(a, `Agent "${ref}" not found — agents.list shows the current farm.`);
        return a as AgentInfo;
    };

    bridge.register([
        {
            op: 'settings.list',
            describe: 'Every Agent Farm setting this build declares, by category, with its type, its current value, whether it differs from the default and whether changing it needs a window reload. ‼️ A credential-shaped key comes back MASKED with `masked:true` — the value is never read out over the bridge, and the Secrets vault is not here at all. `modified:true` narrows it to what somebody has actually changed, which is the useful read when comparing two machines. args: category?, q? (substring of the key or its description), modified?',
            handler: (args) => {
                const cat = optStr(args, 'category').toLowerCase();
                const q = optStr(args, 'q').toLowerCase();
                const cats = deps.categories()
                    .filter(c => !cat || c.id === cat || c.label.toLowerCase() === cat)
                    .map(c => ({
                        id: c.id, label: c.label,
                        items: c.items
                            .filter(it => args.modified !== true || it.modified)
                            .filter(it => !q || it.key.toLowerCase().includes(q)
                                || (it.description ?? '').toLowerCase().includes(q))
                            .map(itemOut)
                    }))
                    .filter(c => c.items.length);
                return {
                    categories: cats,
                    total: cats.reduce((n, c) => n + c.items.length, 0)
                };
            }
        },
        {
            op: 'settings.get',
            describe: 'One setting in full — its schema type, its allowed values if it has an enum, its default, what it is now and whether a reload is needed. The `agentFarm.` prefix is optional. args: key',
            handler: (args) => itemOut(specOf(argStr(args, 'key')))
        },
        {
            op: 'settings.paths',
            describe: '‼️ WHERE A PATH SETTING ACTUALLY POINTS ON THIS MACHINE (X-193). A path '
                + 'setting is written open-ended — `${vault}/00_AGENT_AREA/…`, `${projectNotes}`, '
                + '`${today}` — so the value in the box is not the folder, and the difference is '
                + 'where an unattended campaign silently reads the wrong place. This resolves them '
                + 'with the SAME resolver the settings page and the campaign use, so all three '
                + 'agree. ‼️ AN UNRESOLVED VARIABLE CANCELS THE PATH rather than becoming an empty '
                + 'string: `ok:false` with the reason, and no path at all — a half-built path looks '
                + 'usable and points somewhere nobody meant. Which settings are path settings is '
                + 'derived from their own schema (`x-af-browse`), never from a list. With no args '
                + 'it answers for every path setting this build has, plus `vars`: each variable and '
                + 'what it is here (empty = this machine has no such thing, so every path using it '
                + 'is skipped). args: key? (one setting), templates? (resolve these instead, to see '
                + 'what a value WOULD open before writing it)',
            handler: (args) => {
                need(!!deps.previewPaths, 'this build cannot resolve path variables');
                const resolve = deps.previewPaths as (t: string[]) => PreviewedPath[];
                const vars = deps.pathVarValues?.() ?? [];
                const given = Array.isArray(args.templates) ? args.templates : undefined;
                if (given) { return { vars, templates: resolve(given.map(v => String(v ?? ''))) }; }
                const key = optStr(args, 'key');
                const cats = key
                    ? [{
                        id: '', label: '',
                        items: [specOf(key)]
                    } as SettingsCategory]
                    : deps.categories();
                const found = pathPreviews(cats, resolve);
                if (key) {
                    const full = specOf(key).key;
                    need(!!found[full], `${full} is not a path setting — its schema names nothing `
                        + 'to browse for, so there is nothing to resolve');
                    return { vars, key: full, rows: found[full] };
                }
                return {
                    vars,
                    settings: Object.keys(found).map(k => ({ key: k, rows: found[k] })),
                    note: 'Only settings that HOLD something are listed — an empty box has no path '
                        + 'to resolve.'
                };
            }
        },
        {
            op: 'settings.set',
            describe: '‼️ WRITE ONE AGENT FARM SETTING, at user (global) scope. The SCHEMA is the allowlist: an undeclared key is refused, and the value goes through the same validation the page does — a number that is not a number, a string outside an enum, malformed JSON for an array or object are all refused with the reason rather than written. `dryRun:true` returns the value it WOULD write. args: key, value, dryRun?',
            handler: async (args) => {
                const it = specOf(argStr(args, 'key'));
                need('value' in args, 'Pass a `value` — settings.reset is how you clear one.');
                const s = sanitizeValue({ type: it.type, enum: it.enum }, args.value);
                need(s.ok, `${it.key}: ${(s as { ok: false; error: string }).error}`);
                const value = (s as { ok: true; value: unknown }).value;
                if (args.dryRun === true) {
                    return {
                        dryRun: true, key: it.key,
                        from: maskIfSensitive(it.key, it.value), to: maskIfSensitive(it.key, value),
                        scope: 'user', reloadRequired: needsReload(it.description),
                        note: 'Nothing was written.'
                    };
                }
                await deps.writeSetting(it.key, value);
                return {
                    key: it.key, value: maskIfSensitive(it.key, value),
                    was: maskIfSensitive(it.key, it.value), scope: 'user',
                    masked: isSensitiveKey(it.key),
                    reloadRequired: needsReload(it.description),
                    note: needsReload(it.description)
                        ? 'Written — it takes effect after a window reload.'
                        : 'Written.'
                };
            }
        },
        {
            op: 'settings.reset',
            describe: 'Put one setting back to the value the schema declares. A setting that was already at its default is reported as unchanged rather than written again. args: key',
            handler: async (args) => {
                const it = specOf(argStr(args, 'key'));
                if (!it.modified) {
                    return { key: it.key, changed: false, note: 'It was already at its default.' };
                }
                await deps.writeSetting(it.key, undefined);
                return {
                    key: it.key, changed: true,
                    was: maskIfSensitive(it.key, it.value),
                    now: maskIfSensitive(it.key, it.default),
                    reloadRequired: needsReload(it.description),
                    note: 'Reset to the default.'
                };
            }
        },
        {
            op: 'settings.sets',
            describe: 'The saved SETTING SETS — named snapshots of everything you have changed away from its defaults, so "my laptop setup" and "the demo machine" are two things you can switch between. Each lists how many values it carries and when it was taken. args: none',
            handler: () => ({
                sets: deps.getProfiles().map(p => ({
                    name: p.name, savedAt: p.savedAt, values: Object.keys(p.values ?? {}).length,
                    keys: Object.keys(p.values ?? {})
                }))
            })
        },
        {
            op: 'settings.sets.save',
            describe: 'Snapshot everything currently non-default as a named setting set. A set with the same name is REPLACED, which is how you update one. Only the values that differ from the schema default are kept, so a set stays small and travels between machines. args: name',
            handler: async (args) => {
                const name = argStr(args, 'name').trim().slice(0, 60);
                need(name, 'A setting set needs a name.');
                const values: Record<string, unknown> = {};
                for (const it of allItems()) { if (it.modified) { values[it.key] = it.value; } }
                const profile: SettingsProfile = { name, savedAt: Date.now(), values };
                const list = deps.getProfiles().filter(p => p.name !== name);
                list.push(profile);
                list.sort((a, b) => a.name.localeCompare(b.name));
                await deps.setProfiles(list);
                return {
                    name, values: Object.keys(values).length, replaced: list.length === deps.getProfiles().length,
                    note: `"${name}" saved with ${Object.keys(values).length} non-default value(s).`
                };
            }
        },
        {
            op: 'settings.sets.apply',
            describe: '‼️ A SETTING SET IS A COMPLETE STATE, NOT AN OVERLAY. Applying one sets every value it carries AND resets to default every currently-modified setting it does not mention — otherwise switching sets would leave the last one\'s stragglers behind. Call it with `dryRun:true` first: the plan names every key, what it becomes and which ones are resets. args: name, dryRun?',
            handler: async (args) => {
                const name = argStr(args, 'name');
                const profile = deps.getProfiles().find(p => p.name === name);
                need(profile, `No setting set "${name}" — settings.sets lists them.`);
                const plan = deps.applyPlan(profile as SettingsProfile);
                const resets = plan.filter(p => p.value === undefined);
                const steps = plan.map(p => ({
                    key: p.key,
                    action: p.value === undefined ? 'reset' : 'set',
                    value: p.value === undefined ? null : maskIfSensitive(p.key, p.value)
                }));
                if (args.dryRun === true) {
                    return {
                        dryRun: true, name, sets: plan.length - resets.length, resets: resets.length,
                        plan: steps, note: 'Nothing was written.'
                    };
                }
                for (const step of plan) { await deps.writeSetting(step.key, step.value); }
                return {
                    name, sets: plan.length - resets.length, resets: resets.length, plan: steps,
                    reloadRequired: plan.some(p => {
                        const it = allItems().find(x => x.key === p.key);
                        return !!it && needsReload(it.description);
                    }),
                    note: `"${name}" applied — ${plan.length - resets.length} set, ${resets.length} reset to default.`
                };
            }
        },
        {
            op: 'settings.sets.delete',
            describe: 'Forget a saved setting set. Nothing about the current settings changes — the set is only a snapshot. args: name',
            handler: async (args) => {
                const name = argStr(args, 'name');
                const list = deps.getProfiles();
                need(list.some(p => p.name === name), `No setting set "${name}" — settings.sets lists them.`);
                await deps.setProfiles(list.filter(p => p.name !== name));
                return { name, remaining: list.length - 1, note: `"${name}" deleted; your current settings are untouched.` };
            }
        },
        {
            op: 'settings.sets.export',
            describe: 'Write the saved setting sets out as JSON — the file you carry to another machine. With no `file` the JSON comes back instead, so this is also how you read them in full. args: file?',
            handler: (args) => {
                const list = deps.getProfiles();
                need(list.length, 'There are no setting sets to export.');
                const text = JSON.stringify(list, null, 2);
                const file = optStr(args, 'file');
                if (!file) { return { sets: list.length, content: text, file: null }; }
                const out = path.resolve(file);
                fs.mkdirSync(path.dirname(out), { recursive: true });
                fs.writeFileSync(out, text, 'utf8');
                return { sets: list.length, file: out, note: `${list.length} setting set(s) written to ${out}.` };
            }
        },
        {
            op: 'settings.sets.import',
            describe: 'Read setting sets in — from a `file` or from `json` text. A set whose name already exists is REPLACED; malformed entries are skipped rather than failing the whole import, and the answer says how many were kept. Importing changes no current setting: applying one does. args: file? · json?, dryRun?',
            handler: async (args) => {
                const file = optStr(args, 'file');
                const json = optStr(args, 'json');
                need(file || json, 'Pass a `file` to read, or the `json` itself.');
                let text = json;
                if (file) {
                    const abs = path.resolve(file);
                    need(fs.existsSync(abs), `No file at ${abs}.`);
                    text = fs.readFileSync(abs, 'utf8');
                }
                const imported = parseImportedProfiles(text);
                need(imported.length, 'No valid setting sets in that input — every entry was malformed.');
                if (args.dryRun === true) {
                    return {
                        dryRun: true, would: imported.map(p => p.name),
                        note: `${imported.length} set(s) would be imported; nothing has changed.`
                    };
                }
                const list = deps.getProfiles().filter(p => !imported.some(i => i.name === p.name));
                list.push(...imported);
                list.sort((a, b) => a.name.localeCompare(b.name));
                await deps.setProfiles(list);
                return {
                    imported: imported.length, names: imported.map(p => p.name), total: list.length,
                    note: `${imported.length} setting set(s) imported — settings.sets.apply is what puts one into effect.`
                };
            }
        },
        {
            op: 'claude.settings',
            describe: 'Claude Code\'s OWN settings.json as this extension reads it — the catalogued lines only (model, permission defaults, the hooks switch and so on), each with what it is set to and what it means. ‼️ This is a different file from Agent Farm\'s settings: it is what the CLI itself obeys, which is why a session can behave in a way no Agent Farm setting explains. If the file is not valid JSON that is said, and nothing here will write over it. args: none',
            handler: () => {
                const cc = deps.readClaude();
                const file = deps.claudeSettingsFile();
                if (cc.parseError) {
                    return {
                        file, parseError: cc.parseError, items: [],
                        note: 'settings.json is not valid JSON — fix it by hand first; nothing here will overwrite it.'
                    };
                }
                return {
                    file, parseError: null,
                    items: deps.claudeCatalog().map(i => ({
                        id: i.id, label: i.label, path: i.path, kind: i.kind,
                        enum: i.enum ?? null,
                        value: deps.claudeRead(cc.json, i.path) ?? null,
                        description: i.description ?? ''
                    }))
                };
            }
        },
        {
            op: 'claude.settings.set',
            describe: '‼️ WRITE ONE CATALOGUED LINE of Claude Code\'s settings.json. The catalogue is the allowlist — there is deliberately NO raw-overwrite op, because handing an agent a whole settings file to rewrite is how the CLI\'s own permission and model rules get lost. The value is coerced and validated against the line\'s declared type. A file that is not valid JSON is refused outright rather than clobbered. args: id (from claude.settings), value, dryRun?',
            handler: (args) => {
                const id = argStr(args, 'id');
                const item = deps.claudeCatalog().find(i => i.id === id);
                need(item, `No settings line "${id}" — claude.settings lists what can be written.`);
                const cc = deps.readClaude();
                need(!cc.parseError,
                    `settings.json is not valid JSON (${cc.parseError}) — fix it by hand; nothing was written.`);
                const coerced = deps.claudeCoerce(item as CCItem, args.value);
                need(coerced.ok, `${id}: ${(coerced as { ok: false; error: string }).error}`);
                const value = (coerced as { ok: true; value: unknown }).value;
                const was = deps.claudeRead(cc.json, (item as CCItem).path) ?? null;
                if (args.dryRun === true) {
                    return { dryRun: true, id, from: was, to: value, file: deps.claudeSettingsFile(), note: 'Nothing was written.' };
                }
                const err = deps.writeClaude(deps.claudePatch(cc.json, (item as CCItem).path, value));
                need(!err, `settings.json could not be written — ${err}`);
                return {
                    id, value, was, file: deps.claudeSettingsFile(),
                    note: 'Written — a running claude session must be restarted to pick it up.'
                };
            }
        },
        {
            op: 'claude.settings.clear',
            describe: 'Remove one catalogued line from Claude Code\'s settings.json, so the CLI falls back to its own default. A line that is not there is reported as already absent. args: id',
            handler: (args) => {
                const id = argStr(args, 'id');
                const item = deps.claudeCatalog().find(i => i.id === id);
                need(item, `No settings line "${id}" — claude.settings lists what can be written.`);
                const cc = deps.readClaude();
                need(!cc.parseError,
                    `settings.json is not valid JSON (${cc.parseError}) — fix it by hand; nothing was written.`);
                const was = deps.claudeRead(cc.json, (item as CCItem).path);
                if (was === undefined) {
                    return { id, cleared: false, note: 'That line was not set — nothing changed.' };
                }
                const err = deps.writeClaude(deps.claudePatch(cc.json, (item as CCItem).path, undefined));
                need(!err, `settings.json could not be written — ${err}`);
                return { id, cleared: true, was, file: deps.claudeSettingsFile(), note: 'Cleared — the CLI default applies again.' };
            }
        },
        {
            op: 'agents.roots.add',
            describe: 'Add a folder the farm scans for agents. The path is checked for existence first — a root that is not there discovers nothing and looks exactly like a discovery bug. A path already in the list (in any spelling) is reported rather than added twice. args: path',
            handler: async (args) => {
                const raw = argStr(args, 'path');
                const abs = path.resolve(raw).replace(/\\/g, '/');
                need(fs.existsSync(abs), `No folder at ${abs} — a root that is not there would discover nothing.`);
                need(fs.statSync(abs).isDirectory(), `${abs} is a file, not a folder.`);
                const roots = deps.readSetting<string[]>('agentFarm.agentRoots', []);
                if (roots.some(r => deps.normPath(r) === deps.normPath(abs))) {
                    return { path: abs, added: false, roots: roots.length, note: 'That root is already in the list.' };
                }
                await deps.writeSetting('agentFarm.agentRoots', [...roots, abs]);
                return { path: abs, added: true, roots: roots.length + 1, note: `${abs} will be scanned for agents.` };
            }
        },
        {
            op: 'agents.roots.remove',
            describe: 'Stop scanning a folder. ‼️ THE FOLDER ITSELF IS NOT TOUCHED — what leaves is the farm\'s view of the agents in it, and the answer says how many that is, because "my agents disappeared" is the surprise this prevents. args: path',
            handler: async (args) => {
                const raw = argStr(args, 'path');
                const roots = deps.readSetting<string[]>('agentFarm.agentRoots', []);
                const hit = roots.find(r => deps.normPath(r) === deps.normPath(path.resolve(raw)));
                need(hit, `"${raw}" is not an agent root — agents.roots lists them.`);
                const folders = deps.agentFolders().find(f => f.root === hit);
                const losing = folders ? folders.candidates.filter(c => !c.excluded).length : 0;
                await deps.writeSetting('agentFarm.agentRoots',
                    roots.filter(r => r !== hit));
                return {
                    path: hit, removed: true, agentsLeaving: losing, roots: roots.length - 1,
                    note: `${hit} is no longer scanned${losing ? ` — ${losing} agent(s) leave the farm views` : ''}. The folder itself is untouched.`
                };
            }
        },
        {
            op: 'agents.roots.clean',
            describe: 'Drop duplicate root entries — two spellings of one folder (slashes, case) make it get scanned twice and every agent in it appear twice. Reports what it removed; nothing to clean is a real answer, not an error. args: dryRun?',
            handler: async (args) => {
                const roots = deps.readSetting<string[]>('agentFarm.agentRoots', []);
                const seen = new Set<string>();
                const clean: string[] = [];
                const dupes: string[] = [];
                for (const r of roots) {
                    const k = deps.normPath(r);
                    if (seen.has(k)) { dupes.push(r); } else { seen.add(k); clean.push(r); }
                }
                if (!dupes.length) { return { removed: 0, roots: roots.length, note: 'No duplicate roots.' }; }
                if (args.dryRun === true) {
                    return { dryRun: true, would: dupes, note: `${dupes.length} duplicate(s) would go; nothing has changed.` };
                }
                await deps.writeSetting('agentFarm.agentRoots', clean);
                return { removed: dupes.length, duplicates: dupes, roots: clean.length, note: `${dupes.length} duplicate root entry(ies) removed.` };
            }
        },
        {
            op: 'agents.exclude',
            describe: 'Hide one discovered agent folder from the farm without removing its whole root — the answer to a scanned folder that is not really an agent. The folder is untouched; only the farm stops listing it. args: dir (the agent folder)',
            handler: async (args) => {
                const dir = path.resolve(argStr(args, 'dir'));
                const known = deps.agentFolders().some(f =>
                    f.candidates.some(c => deps.normPath(c.dir) === deps.normPath(dir)));
                need(known, `"${dir}" is not a discovered agent folder — agents.roots shows what is scanned.`);
                const list = deps.readSetting<string[]>('agentFarm.excludeAgentDirs', []);
                if (list.some(x => deps.normPath(x) === deps.normPath(dir))) {
                    return { dir, excluded: false, note: 'It is already excluded.' };
                }
                await deps.writeSetting('agentFarm.excludeAgentDirs', [...list, dir]);
                return { dir, excluded: true, note: 'Hidden from the farm — the folder itself is untouched.' };
            }
        },
        {
            op: 'agents.include',
            describe: 'Bring an excluded agent folder back into the farm. A folder that was never excluded is reported rather than failing. args: dir',
            handler: async (args) => {
                const dir = path.resolve(argStr(args, 'dir'));
                const list = deps.readSetting<string[]>('agentFarm.excludeAgentDirs', []);
                const next = list.filter(x => deps.normPath(x) !== deps.normPath(dir));
                if (next.length === list.length) {
                    return { dir, included: false, note: 'It was not excluded — nothing changed.' };
                }
                await deps.writeSetting('agentFarm.excludeAgentDirs', next);
                return { dir, included: true, note: 'Back in the farm.' };
            }
        },
        {
            op: 'agents.defaults.set',
            describe: '‼️ WHAT THIS AGENT RUNS ON BY DEFAULT, per engine — the model, the effort and (X-255) the SIGN-IN a new session or task gets when nobody says otherwise. `agents.defaults` READS the resolution; this is the write it had no counterpart for. The engine must be one this build knows, and at least one of `model` / `effort` / `account` must be given. Passing an empty string clears that half back to the layer underneath. ‼️ `account` IS NOT LIKE THE OTHER TWO: it is a slot id from accounts.list and it OUTRANKS the machine-wide standing choice (agentFarm.activeAccounts, the Engines page\'s "use this next") for this agent — that is the whole point of it, and it means pressing that button no longer moves this agent until the box is cleared. An id naming no stored slot of that engine is REFUSED rather than stored, because it would otherwise refuse every later launch of the agent from a setting nobody can see. args: agent (name|id), engine (' + ENGINE_ENUM + '), model?, effort?, account?',
            handler: async (args) => {
                const agent = findAgent(argStr(args, 'agent'));
                const engine = argStr(args, 'engine').trim().toLowerCase();
                const ids = deps.engineIds();
                need(ids.includes(engine), `engine is one of: ${ids.join(', ')} — not "${engine}"`);
                const hasModel = 'model' in args;
                const hasEffort = 'effort' in args;
                const hasAccount = 'account' in args;
                need(hasModel || hasEffort || hasAccount,
                    'Pass a `model`, an `effort`, an `account`, or any combination.');
                const account = String(args.account ?? '').trim();
                if (hasAccount && account) {
                    const slots = deps.accountChoices().slots;
                    const slot = slots.find(s => s.id === account);
                    need(!!slot, `No account "${account}" is stored on this machine — accounts.list `
                        + 'names the ones there are, and "" clears the box.');
                    need(slot!.engine === engine, `"${account}" is a ${slot!.engine} sign-in and this `
                        + `row is ${engine}'s — an account belongs to one engine.`);
                }
                const patch: Partial<AgentEngineDefault> = {
                    ...(hasModel ? { model: String(args.model ?? '').trim() } : {}),
                    ...(hasEffort ? { effort: String(args.effort ?? '').trim() } : {}),
                    ...(hasAccount ? { account } : {})
                };
                await deps.writeAgentDefault(agent.dir, engine, patch);
                return {
                    agent: agent.name, engine, ...patch,
                    note: `${agent.name}'s ${engine} default updated — agents.defaults shows what it resolves to now.`
                };
            }
        },
        {
            op: 'agents.pack.export',
            describe: 'Write an agent out as a PACK — its instructions, duties, memory index, skills and workflow definitions in one portable file, the thing agents.pack.import reads on the other side. The answer carries the pack\'s warnings verbatim: a file too large to travel, a path that could not be made portable. args: agent (name|id), file (where to write it)',
            handler: (args) => {
                const agent = findAgent(argStr(args, 'agent'));
                const out = path.resolve(argStr(args, 'file'));
                fs.mkdirSync(path.dirname(out), { recursive: true });
                const { warnings, files } = deps.exportPack(agent, out);
                return {
                    agent: agent.name, file: out, files, warnings,
                    note: `${agent.name} exported${warnings.length ? ` with ${warnings.length} warning(s)` : ''} — agents.pack.import reads it on the other machine.`
                };
            }
        }
    ]);
}
