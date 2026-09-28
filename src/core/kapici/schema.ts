/**
 * X-410 — a rule file checked before it is ever used: '' when it holds, else
 * one sentence naming what is wrong and what it should be. And the call-time
 * options folded into the rule's questions.
 */
import {
    CallOptions, FAILURE_PATHS, HEURISTIC_OPS, KapiciCond, KapiciQuestion, KapiciRule,
    LOW_CONFIDENCE_PATHS, PROVIDERS, QUESTION_TYPES
} from './types';

const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const MAX_CHOICES = 255;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const in01 = (v: unknown) => isNum(v) && v >= 0 && v <= 1;

function optionsRefusal(where: string, type: string, c: Record<string, unknown>): string {
    const keys = Object.keys(c);
    const [lo, hi] = type === 'score' ? [2, 10] : [1, MAX_CHOICES];
    if (keys.length < lo || keys.length > hi) { return `${where}: a ${type} takes ${lo}–${hi} ${type === 'score' ? 'levels' : 'options'}, not ${keys.length}`; }
    const bad = keys.find(k => !k.trim() || typeof c[k] !== 'string');
    return bad !== undefined ? `${where}: option "${bad}" needs a name and a text description` : '';
}

export function questionRefusal(id: string, raw: unknown): string {
    const where = `question "${id}"`;
    if (!isObj(raw)) { return `${where} is an object: {type, instructions, criteria?, check?}`; }
    const q = raw as unknown as KapiciQuestion;
    if (!QUESTION_TYPES.includes(q.type)) { return `${where}: type is ${QUESTION_TYPES.join(' | ')}, not "${String(q.type)}"`; }
    if (typeof q.instructions !== 'string' || !q.instructions.trim()) { return `${where} needs instructions — the question asked in plain English`; }
    const c = q.criteria as unknown;
    if (q.type === 'noul') {
        if (c !== undefined && typeof c !== 'string') { return `${where}: a noul's criteria is optional text, not a list of options`; }
    } else if (c !== '$call') {
        if (!isObj(c)) { return `${where}: a ${q.type} needs criteria — {"option": "when it applies"} or "$call" for options given at call time`; }
        const no = optionsRefusal(where, q.type, c);
        if (no) { return no; }
    }
    if (q.check !== undefined) { return checkRefusal(where, q); }
    return '';
}

function checkRefusal(where: string, q: KapiciQuestion): string {
    const k = q.check as unknown;
    if (q.type !== 'noul') { return `${where}: a heuristic check answers a noul only (true/false), not a ${q.type}`; }
    if (!isObj(k) || !(HEURISTIC_OPS as readonly string[]).includes(String(k.op))) { return `${where}: check.op is ${HEURISTIC_OPS.join(' | ')}`; }
    if (k.op === 'regex') {
        try { new RegExp(String(k.pattern ?? ''), typeof k.flags === 'string' ? k.flags : ''); } catch (e) { return `${where}: check.pattern does not compile — ${(e as Error).message}`; }
        if (typeof k.pattern !== 'string' || !k.pattern) { return `${where}: a regex check needs a pattern`; }
    }
    if (k.op === 'date') {
        const bad = (['before', 'after'] as const).find(f => k[f] !== undefined && Number.isNaN(Date.parse(String(k[f]))));
        if (bad) { return `${where}: check.${bad} is not a date`; }
        if (k.before === undefined && k.after === undefined) { return `${where}: a date check needs before or after`; }
    }
    if (k.op === 'num' || k.op === 'lines' || k.op === 'chars') {
        const bad = (['lt', 'gt'] as const).find(f => k[f] !== undefined && !isNum(k[f]));
        if (bad) { return `${where}: check.${bad} is a number`; }
        if (k.lt === undefined && k.gt === undefined) { return `${where}: a ${String(k.op)} check needs lt or gt`; }
    }
    return '';
}

function condRefusal(name: string, raw: unknown, qs: Record<string, KapiciQuestion>): string {
    if (!isObj(raw)) { return `decide.${name} is {q, noulGt? | noulLt? | choiceIs?}`; }
    const c = raw as unknown as KapiciCond;
    const q = qs[String(c.q)];
    if (!q) { return `decide.${name}.q names no question — the rule asks ${Object.keys(qs).join(', ')}`; }
    const tests = (['noulGt', 'noulLt', 'choiceIs'] as const).filter(f => c[f] !== undefined);
    if (tests.length !== 1) { return `decide.${name} tests exactly one of noulGt, noulLt, choiceIs`; }
    if (tests[0] === 'choiceIs') {
        if (q.type !== 'choice') { return `decide.${name}.choiceIs needs a choice question, "${c.q}" is a ${q.type}`; }
        if (isObj(q.criteria) && !(String(c.choiceIs) in q.criteria)) { return `decide.${name}.choiceIs "${c.choiceIs}" is not one of "${c.q}"'s options`; }
    } else {
        if (q.type !== 'noul') { return `decide.${name}.${tests[0]} needs a noul question, "${c.q}" is a ${q.type}`; }
        if (!in01(c[tests[0]])) { return `decide.${name}.${tests[0]} is a probability between 0 and 1`; }
    }
    return '';
}

/** '' when the rule holds; else the first thing wrong with it, in one sentence. */
export function ruleRefusal(raw: unknown): string {
    if (!isObj(raw)) { return 'a rule is a JSON object: {id, version, description, questions, decide, minConfidence, onLowConfidence, onFailure, golden}'; }
    const r = raw as unknown as KapiciRule;
    if (typeof r.id !== 'string' || !ID.test(r.id)) { return `id is lower-case letters, digits and . _ - (like "retry.next-action"), not ${JSON.stringify(r.id)}`; }
    if (!Number.isInteger(r.version) || r.version < 1) { return `${r.id}: version is a whole number from 1 — the audit records which version decided`; }
    if (typeof r.description !== 'string' || !r.description.trim()) { return `${r.id}: needs a description — the decision it makes, in one line`; }
    if (r.providers !== undefined && (!Array.isArray(r.providers) || !r.providers.length || r.providers.some(p => !PROVIDERS.includes(p)))) {
        return `${r.id}: providers is a non-empty list of ${PROVIDERS.join(' | ')}`;
    }
    if (r.sensitive && r.providers?.includes('jev')) { return `${r.id}: a sensitive rule never leaves the machine — drop "jev" from its providers`; }
    if (!isObj(r.questions) || !Object.keys(r.questions).length) { return `${r.id}: questions is an object of named questions, at least one`; }
    for (const [id, q] of Object.entries(r.questions)) {
        const no = questionRefusal(id, q);
        if (no) { return `${r.id}: ${no}`; }
    }
    const d = r.decide as unknown;
    if (!isObj(d) || !['actionFrom', 'passIf', 'rejectIf', 'scoreMin'].some(k => d[k] !== undefined)) {
        return `${r.id}: decide says how answers become a decision — actionFrom, passIf, rejectIf or scoreMin`;
    }
    if (r.decide.actionFrom !== undefined && r.questions[r.decide.actionFrom]?.type !== 'choice') {
        return `${r.id}: decide.actionFrom names a choice question, and "${r.decide.actionFrom}" is not one`;
    }
    for (const k of ['passIf', 'rejectIf'] as const) {
        const no = r.decide[k] !== undefined ? condRefusal(k, r.decide[k], r.questions) : '';
        if (no) { return `${r.id}: ${no}`; }
    }
    if (r.decide.scoreMin !== undefined && (r.questions[r.decide.scoreMin.q]?.type !== 'score' || !isNum(r.decide.scoreMin.min))) {
        return `${r.id}: decide.scoreMin is {q: <a score question>, min: <number>}`;
    }
    if (!in01(r.minConfidence)) { return `${r.id}: minConfidence is between 0 and 1 — below it an answer is not acted on`; }
    if (!LOW_CONFIDENCE_PATHS.includes(r.onLowConfidence)) { return `${r.id}: onLowConfidence is ${LOW_CONFIDENCE_PATHS.join(' | ')}`; }
    if (!FAILURE_PATHS.includes(r.onFailure)) { return `${r.id}: onFailure is ${FAILURE_PATHS.join(' | ')} (fallback = the caller's own path)`; }
    for (const k of ['inputBudgetChars', 'timeoutMs'] as const) {
        if (r[k] !== undefined && (!Number.isInteger(r[k]) || (r[k] as number) <= 0)) { return `${r.id}: ${k} is a positive whole number`; }
    }
    return goldenRefusal(r);
}

function goldenRefusal(r: KapiciRule): string {
    if (!Array.isArray(r.golden) || !r.golden.length) { return `${r.id}: golden is required — 5–10 examples {state, expect} that kapici.rule.check runs`; }
    for (const [i, g] of r.golden.entries()) {
        if (!isObj(g) || (typeof g.state !== 'string' && !isObj(g.state))) { return `${r.id}: golden[${i}] is {state: text or object, expect, options?}`; }
        if (!isObj(g.expect) || !Object.keys(g.expect).length) { return `${r.id}: golden[${i}].expect names the answer expected per question`; }
        const stray = Object.keys(g.expect).find(k => !r.questions[k]);
        if (stray) { return `${r.id}: golden[${i}].expect names "${stray}", which is not a question of this rule`; }
        const want = { choice: 'string', noul: 'boolean', score: 'number' } as const;
        const wrong = Object.entries(g.expect).find(([k, v]) => typeof v !== want[r.questions[k].type]);
        if (wrong) { return `${r.id}: golden[${i}].expect.${wrong[0]} is a ${want[r.questions[wrong[0]].type]} for a ${r.questions[wrong[0]].type}`; }
        const res = resolveQuestions(r, g.options);
        if ('error' in res) { return `${r.id}: golden[${i}] — ${res.error}`; }
    }
    return '';
}

/** The rule's questions with call-time options folded in: a "$call" question takes the call's set, a fixed one may be narrowed to a subset. */
export function resolveQuestions(rule: KapiciRule, call?: CallOptions): { questions: Record<string, KapiciQuestion> } | { error: string } {
    const given = call ?? {};
    const stray = Object.keys(given).find(k => !rule.questions[k]);
    if (stray) { return { error: `options were given for "${stray}", which is not a question of ${rule.id}` }; }
    const out: Record<string, KapiciQuestion> = {};
    for (const [id, q] of Object.entries(rule.questions)) {
        const g = given[id];
        if (q.criteria === '$call') {
            if (!g) { return { error: `"${id}" takes its options at call time and none were given` }; }
            const set = Array.isArray(g) ? Object.fromEntries(g.map(k => [String(k), String(k)])) : g;
            const no = optionsRefusal(`"${id}"`, q.type, set);
            if (no) { return { error: no }; }
            out[id] = { ...q, criteria: set };
        } else if (g !== undefined) {
            const own = q.criteria as Record<string, string> | undefined;
            if (!own || typeof own !== 'object') { return { error: `"${id}" is a ${q.type} and takes no options` }; }
            const keys = Array.isArray(g) ? g.map(String) : Object.keys(g);
            const unknown = keys.find(k => !(k in own));
            if (unknown) { return { error: `"${id}" can only be narrowed to its own options — "${unknown}" is not one (${Object.keys(own).join(', ')})` }; }
            const set = Object.fromEntries(keys.map(k => [k, own[k]]));
            const no = optionsRefusal(`"${id}"`, q.type, set);
            if (no) { return { error: no }; }
            out[id] = { ...q, criteria: set };
        } else {
            out[id] = q;
        }
    }
    return { questions: out };
}

/** A rule file's text → the rule, or why not. */
export function parseRule(text: string): { rule: KapiciRule } | { error: string } {
    let v: unknown;
    try { v = JSON.parse(text); } catch (e) { return { error: `not valid JSON — ${(e as Error).message}` }; }
    const no = ruleRefusal(v);
    return no ? { error: no } : { rule: v as KapiciRule };
}
