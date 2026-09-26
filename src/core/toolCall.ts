/**
 * M-49 — one tool call read off loose arguments (the bridge's tools.run, a
 * workflow's tool step): the recipe, a preset's parameters under the given
 * ones, the output folder and the overwrite policy with their flex defaults.
 * Pure.
 */
import * as path from 'path';
import { resolveFlex } from './flexResolve';
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
    if (r.input && !input) { return { error: `${r.id} needs an input file` }; }
    const overwrite = String(args.overwrite ?? dflt.overwrite ?? 'never') as Overwrite;
    if (!OVERWRITES.includes(overwrite)) { return { error: `overwrite is ${OVERWRITES.join(' | ')}, not "${overwrite}"` }; }
    const files = Array.isArray(given.files) ? given.files.map(String) : [];
    const beside = input ?? files[0];
    const outDir = String(args.outDir ?? '').trim() || dflt.outDir.trim() || (beside ? path.join(path.dirname(beside), 'af-tool') : '');
    if (!outDir) { return { error: 'name an outDir — there is no input to put the output beside' }; }
    return { recipe: r.id, ...(input ? { input } : {}), params: { ...(preset?.params ?? {}), ...given }, outDir, overwrite };
}

/** M-49 — a workflow's tool step: the recipe, its input and parameters (templates allowed), and where it writes. */
export interface ToolStepSpec {
    recipe?: string;
    input?: string;
    params?: Record<string, unknown>;
    preset?: string;
    outDir?: string;
    overwrite?: string;
}

/** Checked at save time: the recipe (or preset) exists and every parameter NAME is its own. Values may be templates. */
export function toolStepRefusal(raw: unknown): string {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return 'tool is an object: {recipe, input?, params?, preset?, outDir?, overwrite?}'; }
    const t = raw as ToolStepSpec;
    const preset = t.preset ? RECIPE_PRESETS.find(p => p.name.toLowerCase() === String(t.preset).toLowerCase()) : undefined;
    if (t.preset && !preset) { return `there is no recipe preset "${t.preset}"`; }
    const r = recipe(String(t.recipe ?? preset?.recipe ?? ''));
    if (!r) { return `there is no recipe "${t.recipe ?? ''}" — tools.recipes lists them`; }
    const bad = Object.keys(t.params ?? {}).filter(k => !r.params.some(p => p.name === k));
    if (bad.length) { return `${r.id} has no parameter ${bad.map(k => `"${k}"`).join(', ')} (it takes ${r.params.map(p => p.name).join(', ')})`; }
    if (t.overwrite && !(OVERWRITES as readonly string[]).includes(t.overwrite)) { return `overwrite is ${OVERWRITES.join(' | ')}`; }
    if (r.input && !String(t.input ?? '').trim()) { return `${r.id} needs an input — a path or a template such as {input.clip}`; }
    return '';
}

/** The step form's Recipe box (JSON) → the step's tool block. */
export function toolStepFromJson(text: string): { tool: ToolStepSpec } | { error: string } {
    let v: unknown;
    try { v = JSON.parse(text || '{}'); } catch { return { error: 'the recipe is not valid JSON' }; }
    const no = toolStepRefusal(v);
    return no ? { error: no } : { tool: v as ToolStepSpec };
}

/** The spec with its templates filled ({input.x}, {prev_json.outputs.0}, {steps.<id>.json.outputs}…). */
export function fillTool(t: ToolStepSpec, sub: (s: string) => string): Record<string, unknown> {
    const fill = (v: unknown): unknown => (typeof v === 'string' ? sub(v)
        : Array.isArray(v) ? v.flatMap(x => { const f = fill(x); return typeof f === 'string' && /^\s*\[/.test(f) ? parseList(f) : [f]; }) : v);
    return {
        ...(t.recipe ? { recipe: t.recipe } : {}), ...(t.preset ? { preset: t.preset } : {}),
        ...(t.input ? { input: sub(t.input) } : {}), ...(t.outDir ? { outDir: sub(t.outDir) } : {}),
        ...(t.overwrite ? { overwrite: t.overwrite } : {}),
        params: Object.fromEntries(Object.entries(t.params ?? {}).map(([k, v]) => [k, k === 'files' && typeof v === 'string' ? listOf(sub(v)) : fill(v)]))
    };
}

/**
 * What a tool step runs with where it leaves a box blank, and why: `settings` is the
 * Farm Settings layer as the USER wrote it (undefined = untouched). One line per
 * value in the flex chain's own words, for the step's output.
 */
export function toolResolved(t: ToolStepSpec, settings: { outDir?: unknown; overwrite?: unknown }): { defaults: { outDir: string; overwrite: string }; why: string[] } {
    const outDir = resolveFlex('tool.outDir', { settings: settings.outDir });
    const overwrite = resolveFlex('tool.overwrite', { settings: settings.overwrite });
    const preset = t.preset ? RECIPE_PRESETS.find(p => p.name.toLowerCase() === String(t.preset).toLowerCase()) : undefined;
    const r = recipe(String(t.recipe ?? preset?.recipe ?? ''));
    const why = (r?.params ?? []).map(q => {
        const own = t.params?.[q.name];
        const fromPreset = preset && preset.recipe === r!.id ? preset.params[q.name] : undefined;
        const mine = own !== undefined && own !== '';
        const res = resolveFlex(`tool.${r!.id}.${q.name}`, { step: mine ? own : fromPreset }, !mine && fromPreset !== undefined ? { step: preset!.name } : {});
        return `${q.name}: ${res.sentence}`;
    });
    why.push(`outDir: ${resolveFlex('tool.outDir', { settings: settings.outDir, step: t.outDir }).sentence}`);
    why.push(`overwrite: ${resolveFlex('tool.overwrite', { settings: settings.overwrite, step: t.overwrite }).sentence}`);
    return { defaults: { outDir: String(outDir.value ?? ''), overwrite: String(overwrite.value ?? 'never') }, why };
}

/** A template that became a JSON list (a split's outputs) is that list; anything else, one line a file. */
const parseList = (s: string): unknown[] => { try { const a = JSON.parse(s); return Array.isArray(a) ? a.map(String) : [s]; } catch { return [s]; } };
const listOf = (s: string): unknown[] => (/^\s*\[/.test(s) ? parseList(s) : s.split(/\r?\n/).map(x => x.trim()).filter(Boolean));
