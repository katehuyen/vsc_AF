/**
 * M-49 — one tool call read off loose arguments (the bridge's tools.run, a
 * workflow's tool step): the recipe, a preset's parameters under the given
 * ones, the output folder and the overwrite policy with their flex defaults.
 * Pure.
 */
import * as path from 'path';
import { Overwrite, OVERWRITES, RECIPE_PRESETS, recipe, RecipeCall } from './mediaRecipes';

export function toolCall(args: Record<string, unknown>, dflt: { outDir: string; overwrite: string }): RecipeCall | { error: string } {
    const presetName = typeof args.preset === 'string' ? args.preset.trim() : '';
    const preset = presetName ? RECIPE_PRESETS.find(p => p.name.toLowerCase() === presetName.toLowerCase()) : undefined;
    if (presetName && !preset) { return { error: `there is no recipe preset "${presetName}" — ${RECIPE_PRESETS.map(p => `"${p.name}"`).join(', ')}` }; }
    const id = String(args.recipe ?? preset?.recipe ?? '').trim();
    const r = recipe(id);
    if (!r) { return { error: id ? `there is no recipe "${id}" — tools.recipes lists them` : 'name a recipe (tools.recipes lists them)' }; }
    if (preset && preset.recipe !== r.id) { return { error: `the preset "${preset.name}" is for ${preset.recipe}, not ${r.id}` }; }
    const given = args.params && typeof args.params === 'object' && !Array.isArray(args.params) ? args.params as Record<string, unknown> : {};
    const input = typeof args.input === 'string' && args.input.trim() ? args.input.trim() : undefined;
    const overwrite = String(args.overwrite ?? dflt.overwrite ?? 'never') as Overwrite;
    if (!OVERWRITES.includes(overwrite)) { return { error: `overwrite is ${OVERWRITES.join(' | ')}, not "${overwrite}"` }; }
    const files = Array.isArray(given.files) ? given.files.map(String) : [];
    const beside = input ?? files[0];
    const outDir = String(args.outDir ?? '').trim() || dflt.outDir.trim() || (beside ? path.join(path.dirname(beside), 'af-tool') : '');
    if (!outDir) { return { error: 'name an outDir — there is no input to put the output beside' }; }
    return { recipe: r.id, ...(input ? { input } : {}), params: { ...(preset?.params ?? {}), ...given }, outDir, overwrite };
}
