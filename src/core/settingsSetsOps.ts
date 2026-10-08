import * as fs from 'fs';
import * as path from 'path';
import { argStr, BridgeOpSpec, need, optStr } from './bridge';
import type { SettingsBridgeDeps } from './settingsBridge';
import { needsReload, parseImportedProfiles, SettingsCategory, SettingsProfile } from './settingsops';

/** The saved setting sets over the bridge — list, save, apply, delete, export, import (B-7). Split out of
 *  settingsBridge.ts as they were: the page's Setting sets section and these ops are the two doors to one list. */
export function settingsSetsOps(o: {
    deps: Pick<SettingsBridgeDeps, 'getProfiles' | 'setProfiles' | 'applyPlan' | 'writeSetting'>;
    allItems: () => SettingsCategory['items'];
    maskIfSensitive: (key: string, value: unknown) => unknown;
}): BridgeOpSpec[] {
    const { deps, allItems, maskIfSensitive } = o;
    return [
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
    ];
}
