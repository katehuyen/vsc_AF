/**
 * X-371 — ONE CONDITION ENGINE, ANY NUMBER OF DICTIONARIES.
 *
 * The sentry's conditions (X-190) were the first place a person wrote "wake
 * the thinking model when THIS happens". A supervised workflow needs the same
 * thing about a different subject, so the operators, the AND groups, the
 * evaluation and the honesty rules live here, and what a field IS — its name,
 * its type, how it is read off the facts — is a dictionary handed in. The
 * sentry's dictionary is in sentryPolicy.ts, the workflow's in
 * workflowPolicy.ts; a new field is one line in one of them.
 *
 * ‼️ AN UNKNOWN FIELD FAILS WITH ITS EYES OPEN: it does not fire, and it comes
 * back in `problems` by name — never swallowed.
 * Pure: no `fs`, no `vscode`, no model, no clock.
 */

export type FieldType = 'enum' | 'number' | 'boolean' | 'text';

export interface FieldSpec {
    field: string;
    type: FieldType;
    describe: string;
    /** the closed set of answers, where there is one */
    values?: string[];
}

export interface OperatorSpec {
    id: string;
    label: string;
    /** which field types it may be offered for */
    types: FieldType[];
    /** does it take a value at all */
    takesValue: boolean;
}

export const OPERATORS: OperatorSpec[] = [
    { id: 'eq', label: 'is', types: ['enum', 'number', 'text'], takesValue: true },
    { id: 'ne', label: 'is not', types: ['enum', 'number', 'text'], takesValue: true },
    { id: 'gt', label: 'is more than', types: ['number'], takesValue: true },
    { id: 'gte', label: 'is at least', types: ['number'], takesValue: true },
    { id: 'lt', label: 'is less than', types: ['number'], takesValue: true },
    { id: 'lte', label: 'is at most', types: ['number'], takesValue: true },
    { id: 'isTrue', label: 'is true', types: ['boolean'], takesValue: false },
    { id: 'isFalse', label: 'is false', types: ['boolean'], takesValue: false },
    { id: 'contains', label: 'contains', types: ['text', 'enum'], takesValue: true },
    { id: 'matches', label: 'matches', types: ['text', 'enum'], takesValue: true }
];

export interface Condition {
    /** the user's own handle for it — what the verdict names when it fires */
    id: string;
    field?: string;
    /** ‼️ `operator`, never `op`. In this codebase `op:` means a BRIDGE
     *  operation — the parity gate scans every source file for that exact key
     *  and would read a condition row as an unregistered bridge op. */
    operator?: string;
    value?: unknown;
    /** an AND group: every part must hold. Conditions themselves are ORed. */
    all?: Condition[];
}

/** What a subject's conditions can read, and how each field is read off its facts. */
export interface PolicyDictionary<F> {
    /** what the problems call the reader: "a field this <noun> knows" */
    noun: string;
    /** what an unmeasured field was not measured in: "which nothing measured <when>" */
    when: string;
    fields: FieldSpec[];
    /** `undefined` = this field could not be read AT ALL — a problem, not a false */
    read(field: string, facts: F): unknown;
}

/**
 * How much of a text field a READING carries — a row beside a `<select>` cannot
 * hold a whole output tail. The evaluator keeps the untouched facts.
 */
export const SNAPSHOT_TEXT_MAX = 200;

/** What every field of the dictionary reads right now, by the evaluator's own reader. */
export function snapshotFacts<F>(dict: PolicyDictionary<F>, facts: F): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const spec of dict.fields) {
        const v = dict.read(spec.field, facts);
        out[spec.field] = typeof v === 'string' && v.length > SNAPSHOT_TEXT_MAX
            ? '…' + v.slice(-(SNAPSHOT_TEXT_MAX - 1))
            : v;
    }
    return out;
}

const num = (v: unknown): number => {
    const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
    return Number.isFinite(n) ? n : NaN;
};

/** One leaf, or a problem describing why it could not be judged. */
function judge<F>(dict: PolicyDictionary<F>, c: Condition, f: F): { hit: boolean } | { problem: string } {
    const field = String(c.field ?? '').trim();
    if (!field) { return { problem: `condition "${c.id}" names no field` }; }
    if (!dict.fields.some(s => s.field === field)) {
        return { problem: `condition "${c.id}" reads "${field}", which is not a field this ${dict.noun} knows` };
    }
    const actual = dict.read(field, f);
    if (actual === undefined) {
        return { problem: `condition "${c.id}" reads "${field}", which nothing measured ${dict.when}` };
    }
    const operator = String(c.operator ?? '').trim();
    if (!OPERATORS.some(o => o.id === operator)) {
        return { problem: `condition "${c.id}" uses "${operator || '(none)'}", which is not an operator` };
    }
    switch (operator) {
        case 'isTrue': return { hit: actual === true };
        case 'isFalse': return { hit: actual === false };
        case 'eq': return { hit: String(actual) === String(c.value ?? '') };
        case 'ne': return { hit: String(actual) !== String(c.value ?? '') };
        case 'gt': case 'gte': case 'lt': case 'lte': {
            const a = num(actual), b = num(c.value);
            if (!Number.isFinite(a) || !Number.isFinite(b)) {
                return { problem: `condition "${c.id}" compares "${field}" with something that is not a number` };
            }
            return { hit: operator === 'gt' ? a > b : operator === 'gte' ? a >= b : operator === 'lt' ? a < b : a <= b };
        }
        case 'contains':
            return { hit: String(actual).includes(String(c.value ?? '')) };
        case 'matches': {
            try {
                return { hit: new RegExp(String(c.value ?? '')).test(String(actual)) };
            } catch (e) {
                // ‼️ a mistyped pattern must neither fire (it spends) nor vanish (it hides a dead rule)
                return {
                    problem: `condition "${c.id}" has a pattern that will not compile — `
                        + String((e as Error)?.message ?? e).slice(0, 80)
                };
            }
        }
        default:
            return { problem: `condition "${c.id}" uses "${operator}", which is not an operator` };
    }
}

/** A leaf, or an AND group of leaves. An empty group is NOT "always". */
function evaluateOne<F>(dict: PolicyDictionary<F>, c: Condition, f: F, problems: string[]): boolean {
    if (Array.isArray(c.all)) {
        if (!c.all.length) {
            problems.push(`group "${c.id}" is empty, so it can never say anything`);
            return false;
        }
        let all = true;
        for (const part of c.all) {
            const r = judge(dict, part, f);
            if ('problem' in r) { problems.push(r.problem); return false; }
            if (!r.hit) { all = false; }
        }
        return all;
    }
    const r = judge(dict, c, f);
    if ('problem' in r) { problems.push(r.problem); return false; }
    return r.hit;
}

/**
 * Conditions are ORed: the ids that fired, in the order written, and every
 * condition that could not be judged. A broken row never disarms the others.
 */
export function evaluateConditions<F>(dict: PolicyDictionary<F>, conditions: readonly Condition[] | undefined, facts: F): { fired: string[]; problems: string[] } {
    const problems: string[] = [];
    const fired: string[] = [];
    for (const c of conditions ?? []) {
        if (evaluateOne(dict, c, facts, problems)) { fired.push(String(c.id ?? '')); }
    }
    return { fired, problems };
}

/** Per condition, in the order given — a row is marked by its POSITION, and two rows may share a handle. */
export const conditionHits = <F>(dict: PolicyDictionary<F>, conditions: readonly Condition[], facts: F): boolean[] =>
    conditions.map(c => evaluateConditions(dict, [c], facts).fired.length > 0);
