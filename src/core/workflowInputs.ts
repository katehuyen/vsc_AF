/**
 * M-38 — WHAT A WORKFLOW IS GIVEN WHEN IT STARTS.
 *
 * A workflow used to take nothing: a trigger that fired because a file landed
 * in a folder could not say WHICH file, and a person running a chain by hand
 * had to edit its first prompt. A workflow now declares its inputs; each step
 * reads them as `{input.<name>}`; a run is given values (by hand, by the bridge,
 * by a trigger's mapping) and a run missing a required one does not start —
 * it says which one and why. Pure: no vscode, no fs.
 */
import { resolveFlex } from './flexResolve';
import { ensureStepIds, unknownStepRefs } from './runContext';
import { kapiciStepRefusal } from './kapiciStep';
import { ForEachSpec, forEachRefusal } from './forEachStep';
import { CheckpointSpec, checkpointRefusal } from './checkpointStep';
import { AirtableQuery, cleanQuery, queryRefusal } from './airtableInput';

export type InputType = 'file' | 'folder' | 'text' | 'choice' | 'number' | 'url' | 'airtable';
export const INPUT_TYPES: readonly InputType[] = ['file', 'folder', 'text', 'choice', 'number', 'url', 'airtable'];

export interface WorkflowInput {
    name: string;
    type: InputType;
    /** the workflow's own default — the flex point workflow.input at the workflow level */
    default?: string;
    required?: boolean;
    description?: string;
    /** the values a `choice` input offers */
    choices?: string[];
    /** X-420 — an `airtable` input's search; before the first step its records become the value (src/core/airtableInput.ts) */
    airtable?: AirtableQuery;
}

/** Where a run's value for one input came from. */
export type InputOrigin = 'run' | 'trigger' | 'workflow';

export interface InputsVerdict {
    ok: boolean;
    values: Record<string, string>;
    origin: Record<string, InputOrigin>;
    /** each reason the run cannot start, in words; empty when ok */
    problems: string[];
}

const NAME = /^[A-Za-z_][\w-]*$/;
const REF = /\{input\.([\w-]+)\}/g;

const str = (v: unknown): string =>
    v === undefined || v === null ? '' : typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v);

/** A declared schema, checked. `errors` refuses the save; `inputs` is what is kept. */
export function normalizeInputs(raw: unknown): { inputs: WorkflowInput[]; errors: string[] } {
    const errors: string[] = [];
    const inputs: WorkflowInput[] = [];
    if (raw === undefined || raw === null) { return { inputs, errors }; }
    if (!Array.isArray(raw)) { return { inputs, errors: ['inputs must be a list of {name, type, default?, required?, description?, choices?}'] }; }
    const seen = new Set<string>();
    raw.forEach((r, i) => {
        const o = r && typeof r === 'object' ? r as Record<string, unknown> : {};
        const name = str(o.name).trim();
        const at = `input ${i + 1}${name ? ` ("${name}")` : ''}`;
        if (!NAME.test(name)) { errors.push(`${at}: a name is letters, digits, _ or - and starts with a letter — it is what {input.<name>} says`); return; }
        if (seen.has(name)) { errors.push(`${at}: the name is used twice`); return; }
        seen.add(name);
        const type = (str(o.type).trim() || 'text') as InputType;
        if (!INPUT_TYPES.includes(type)) { errors.push(`${at}: type is one of ${INPUT_TYPES.join(', ')}`); return; }
        const choices = Array.isArray(o.choices) ? o.choices.map(c => str(c).trim()).filter(Boolean) : [];
        if (type === 'choice' && !choices.length) { errors.push(`${at}: a choice input needs its choices`); return; }
        const aq = type === 'airtable' ? queryRefusal(o.airtable) : '';
        if (aq) { errors.push(`${at}: ${aq}`); return; }
        const search = type === 'airtable' ? cleanQuery(o.airtable as AirtableQuery | undefined) : undefined;
        const dflt = str(o.default);
        const bad = dflt ? valueProblem({ name, type, choices }, dflt) : '';
        if (bad) { errors.push(`${at}: the default ${bad}`); return; }
        inputs.push({
            name, type,
            ...(dflt ? { default: dflt } : {}),
            ...(o.required === true ? { required: true } : {}),
            ...(str(o.description).trim() ? { description: str(o.description).trim() } : {}),
            ...(type === 'choice' ? { choices } : {}),
            ...(search ? { airtable: search } : {})
        });
    });
    return { inputs, errors };
}

/** '' when the value fits the input's type; else what is wrong, in words. */
export function valueProblem(input: Pick<WorkflowInput, 'name' | 'type' | 'choices'>, value: string): string {
    if (input.type === 'number' && !Number.isFinite(Number(value))) { return `"${value}" is not a number`; }
    if (input.type === 'choice' && !(input.choices ?? []).includes(value)) {
        return `"${value}" is not one of ${(input.choices ?? []).join(', ')}`;
    }
    if (input.type === 'url' && !/^https?:\/\/\S+$/i.test(value)) { return `"${value}" is not an http(s) URL`; }
    return '';
}

/**
 * The values a run starts with: what the run was given beats the workflow's
 * default. A name the workflow does not declare is refused rather than dropped
 * — a typo in a bridge call must not start a run that silently lacks the value.
 */
export function resolveInputs(
    schema: readonly WorkflowInput[] | undefined, given: Record<string, unknown> | undefined,
    source: 'run' | 'trigger' = 'run'
): InputsVerdict {
    const values: Record<string, string> = {};
    const origin: Record<string, InputOrigin> = {};
    const problems: string[] = [];
    const declared = schema ?? [];
    for (const name of Object.keys(given ?? {})) {
        if (!declared.some(i => i.name === name)) {
            problems.push(declared.length
                ? `the workflow has no input "${name}" — it takes ${declared.map(i => i.name).join(', ')}`
                : `the workflow takes no inputs, but "${name}" was given`);
        }
    }
    for (const input of declared) {
        const r = resolveFlex('workflow.input', { workflow: input.default, run: str(given?.[input.name]) });
        const value = str(r.value);
        if (value === '') {
            // X-420 — an airtable input's own search is its value, looked up before the first step
            if (input.required && input.type !== 'airtable') { problems.push(`input "${input.name}" is required${input.description ? ` — ${input.description}` : ''}`); }
            continue;
        }
        const bad = valueProblem(input, value);
        if (bad) { problems.push(`input "${input.name}": ${bad}`); continue; }
        values[input.name] = value;
        origin[input.name] = r.from === 'run' ? source : 'workflow';
    }
    return { ok: problems.length === 0, values, origin, problems };
}

/** `{input.x}` → the run's value; an input with no value is empty. */
export function fillInputs(text: string, values: Record<string, string> | undefined): string {
    if (!text || text.indexOf('{input.') < 0) { return text; }
    return text.replace(REF, (_m, name: string) => values?.[name] ?? '');
}

/** Every `{input.x}` in these texts that the schema does not declare — refused at save. */
export function undeclaredInputRefs(texts: readonly unknown[], schema: readonly WorkflowInput[] | undefined): string[] {
    const names = new Set((schema ?? []).map(i => i.name));
    const out = new Set<string>();
    const walk = (v: unknown): void => {
        if (typeof v === 'string') { for (const m of v.matchAll(REF)) { if (!names.has(m[1])) { out.add(m[1]); } } }
        else if (Array.isArray(v)) { v.forEach(walk); }
        else if (v && typeof v === 'object') { Object.values(v as Record<string, unknown>).forEach(walk); }
    };
    texts.forEach(walk);
    return [...out];
}

/**
 * A workflow about to be saved, checked against what its steps read: the kept
 * inputs, and one sentence that refuses the save ('' = fine) — an undeclared
 * `{input.x}`, or (M-39) a `{steps.<id>…}` naming a step the chain lacks. Gives
 * every step its stable id on the way.
 */
export function checkWorkflowInputs(raw: unknown, steps: { id?: string; forEach?: ForEachSpec; parallel?: boolean; checkpoint?: CheckpointSpec; kapici?: unknown }[]): { inputs: WorkflowInput[]; error: string } {
    const n = normalizeInputs(raw);
    if (n.errors.length) { return { inputs: n.inputs, error: n.errors.join('; ') }; }
    const loose = undeclaredInputRefs(steps, n.inputs);
    if (loose.length) {
        return { inputs: n.inputs, error: `a step reads ${loose.map(x => `{input.${x}}`).join(', ')}, but the workflow declares no such input` };
    }
    ensureStepIds(steps);
    const lost = unknownStepRefs(steps, steps.map(s => s.id as string));
    if (lost.length) {
        return { inputs: n.inputs, error: `a step reads ${lost.map(x => `{steps.${x}…}`).join(', ')}, but the workflow has no step with that id — it has ${steps.map(s => s.id).join(', ')}` };
    }
    const fe = steps.map((s, i) => [i, forEachRefusal(s, steps.slice(0, i).map(x => x.id as string)) || checkpointRefusal(s) || (s.kapici ? kapiciStepRefusal(s.kapici, s) : '')] as const).find(([, r]) => r);
    return { inputs: n.inputs, error: fe ? `step ${fe[0] + 1}: ${fe[1]}` : '' };
}

/** A trigger's input mapping checked against the workflow it runs; undefined = none stated (the default mapping applies). */
export function checkTriggerMapping(schema: readonly WorkflowInput[] | undefined, raw: unknown): { mapping?: Record<string, string>; error: string } {
    if (raw === undefined || raw === null) { return { error: '' }; }
    if (typeof raw !== 'object' || Array.isArray(raw)) { return { error: 'inputs is an object: {"<input name>": "<template with {file} {watch} {payload} {payload.x}>"}' }; }
    const mapping: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (!(schema ?? []).some(i => i.name === k)) {
            return { error: `the workflow has no input "${k}"${(schema ?? []).length ? ` — it takes ${(schema ?? []).map(i => i.name).join(', ')}` : ' — it takes none'}` };
        }
        if (str(v).trim()) { mapping[k] = str(v).trim(); }
    }
    return { ...(Object.keys(mapping).length ? { mapping } : {}), error: '' };
}

/** What a trigger knows when it fires. */
export interface TriggerFire { watch?: string; file?: string; payload?: unknown }

/**
 * The mapping a trigger uses when it states none: the dropped file goes to the
 * first file input, the watched folder to the first folder input. Anything
 * else is the user's to map on the trigger form.
 */
export function defaultTriggerMapping(schema: readonly WorkflowInput[] | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    const file = (schema ?? []).find(i => i.type === 'file');
    const folder = (schema ?? []).find(i => i.type === 'folder');
    if (file) { out[file.name] = '{file}'; }
    if (folder) { out[folder.name] = '{watch}'; }
    return out;
}

/** A trigger's mapping filled from its firing: `{watch}` `{file}` `{payload}` `{payload.a.b}`. */
export function triggerInputs(
    schema: readonly WorkflowInput[] | undefined, mapping: Record<string, string> | undefined, fire: TriggerFire
): Record<string, string> {
    const map = mapping && Object.keys(mapping).length ? mapping : defaultTriggerMapping(schema);
    const out: Record<string, string> = {};
    for (const [name, tpl] of Object.entries(map)) {
        const v = String(tpl ?? '')
            .split('{watch}').join(fire.watch ?? '')
            .split('{file}').join(fire.file ?? '')
            .replace(/\{payload\.([\w.]+)\}/g, (_m, p: string) => str(pick(fire.payload, p)))
            .split('{payload}').join(str(fire.payload));
        if (v !== '') { out[name] = v; }
    }
    return out;
}

function pick(obj: unknown, dotted: string): unknown {
    let cur = obj;
    for (const k of dotted.split('.')) {
        if (cur && typeof cur === 'object' && k in (cur as Record<string, unknown>)) { cur = (cur as Record<string, unknown>)[k]; }
        else { return undefined; }
    }
    return cur;
}
