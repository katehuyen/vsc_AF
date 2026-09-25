/**
 * M-46 — A PERSON'S HAND ON A RUNNING WORKFLOW.
 *
 * Two things reach a run while it runs. A WORD (steer · veto · constraint, the
 * A2A humanDirective language) waits for the run's next supervisor turn and
 * goes at the top of that brief as the highest rule; the turn that carried it
 * says where it landed. A LIVE SETTING (the wake conditions, the supervisor's
 * model / budget / calls, "ask me too at the next decision", a checkpoint added
 * after the running step, a pause at the next step boundary) applies from the
 * next boundary on — the running step is never cut. Pure.
 */
import { FLEX_LEVEL_LABELS } from './flexPoints';
import { WakeSpec, wakeFromArg } from './workflowWake';

export type WordKind = 'steer' | 'veto' | 'constraint';
export const WORD_KINDS: readonly WordKind[] = ['steer', 'veto', 'constraint'];
export type WordSource = 'vscode' | 'telegram' | 'bridge';

export interface HumanWord {
    kind: WordKind;
    text: string;
    at: number;
    by: WordSource;
    /** where it reached the supervisor: "step 3 (checkpoint)" — unset = still waiting */
    landed?: string;
}

export interface LiveSupervisor { model?: string; budgetUSD?: number; maxCalls?: number }

/** What a person set on a running run; persisted on its record. */
export interface RunLive {
    wake?: WakeSpec;
    supervisor?: LiveSupervisor;
    /** ask the person to confirm the next supervisor decision before it is applied */
    callMe?: boolean;
    /** hold the run at the next step boundary */
    pause?: boolean;
    words?: HumanWord[];
    /** the person's own decision for the next boundary, applied instead of asking the supervisor */
    decision?: Record<string, unknown>;
}

const HUMAN_DECISIONS = ['proceed', 'retry', 'jump', 'insert', 'stop'];

/** A decision a person makes by hand — the supervisor's contract, minus asking a person. */
export function decisionFromArg(raw: unknown): { decision?: Record<string, unknown>; error?: string } {
    const d: Record<string, unknown> = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw as Record<string, unknown> } : { decision: raw };
    if (!HUMAN_DECISIONS.includes(String(d.decision))) { return { error: `decision is one of ${HUMAN_DECISIONS.join(', ')}` }; }
    return { decision: { ...d, confidence: 1, why: String(d.why ?? 'your decision') } };
}

export const pendingWords = (l: RunLive | undefined): HumanWord[] => (l?.words ?? []).filter(w => !w.landed);

/** A word, checked. The text is the person's own — only its size is bounded. */
export function wordFromArg(kind: unknown, text: unknown, by: WordSource, now: number): HumanWord | { error: string } {
    const k = String(kind ?? 'steer').trim().toLowerCase();
    if (!WORD_KINDS.includes(k as WordKind)) { return { error: `kind "${k}" is not steer, veto or constraint` }; }
    const t = String(text ?? '').trim();
    if (!t) { return { error: 'the word is empty — say what the run should do' }; }
    if (t.length > 2000) { return { error: 'the word is longer than 2000 characters' }; }
    return { kind: k as WordKind, text: t, at: now, by };
}

const WORD_LEAD: Record<WordKind, string> = {
    steer: 'do it this way', veto: 'not this — decide something else', constraint: 'stay within this'
};

/** The lines a brief opens with — above the goal, above the checkpoint's own message. */
export function wordsForBrief(words: readonly HumanWord[]): string[] {
    return words.map(w => `THE USER'S WORD (${w.kind} — ${WORD_LEAD[w.kind]}; from ${w.by === 'telegram' ? 'the phone' : w.by === 'vscode' ? 'VS Code' : 'the bridge'}), the highest rule of this decision: ${w.text}`);
}

/** Every waiting word marked as landed at `where`. */
export function landWords(l: RunLive, where: string): RunLive {
    return { ...l, words: (l.words ?? []).map(w => w.landed ? w : { ...w, landed: where }) };
}

/** A live change, checked field by field; unknown keys are refused by name. */
export function livePatch(args: Record<string, unknown>): { patch?: Partial<RunLive> & { addCheckpoint?: string }; error?: string } {
    const patch: Partial<RunLive> & { addCheckpoint?: string } = {};
    if (args.wake !== undefined) {
        const w = wakeFromArg(args.wake === null ? 'mechanical' : args.wake);
        if (w.error) { return { error: w.error }; }
        patch.wake = w.wake ?? [];
    }
    const sup: LiveSupervisor = {};
    if (args.model !== undefined) {
        const m = String(args.model ?? '').trim();
        if (m && !/^[\w.:@\-[\]]{1,80}$/.test(m)) { return { error: `model "${m.slice(0, 40)}" is not a plain name` }; }
        sup.model = m;
    }
    for (const [k, max] of [['budgetUSD', 1000], ['maxCalls', 50]] as const) {
        if (args[k] === undefined) { continue; }
        const n = Number(args[k]);
        if (!Number.isFinite(n) || n < 0 || n > max) { return { error: `${k} must be a number from 0 to ${max}` }; }
        sup[k] = n;
    }
    if (Object.keys(sup).length) { patch.supervisor = sup; }
    for (const k of ['callMe', 'pause'] as const) {
        if (args[k] === undefined) { continue; }
        if (typeof args[k] !== 'boolean') { return { error: `${k} is true or false` }; }
        patch[k] = args[k] as boolean;
    }
    if (args.addCheckpoint !== undefined) {
        const m = args.addCheckpoint === true ? '' : String(args.addCheckpoint ?? '').trim();
        patch.addCheckpoint = m.slice(0, 500);
    }
    return Object.keys(patch).length || args.addCheckpoint !== undefined ? { patch }
        : { error: 'nothing to change — wake, model, budgetUSD, maxCalls, callMe, pause or addCheckpoint' };
}

/** Merge a patch; a blank model / zero-less-than-set drops back to what the workflow says. */
export function applyLive(l: RunLive | undefined, p: Partial<RunLive>): RunLive {
    const out: RunLive = { ...l };
    if (p.wake !== undefined) { out.wake = p.wake; }
    if (p.supervisor) {
        const s = { ...out.supervisor, ...p.supervisor };
        if (s.model === '') { delete s.model; }
        out.supervisor = s;
    }
    if (p.callMe !== undefined) { out.callMe = p.callMe; }
    if (p.pause !== undefined) { out.pause = p.pause; }
    return out;
}

/** One line per live setting, each saying it is live — what the run page and the bridge answer with. */
export function liveLines(l: RunLive | undefined): string[] {
    if (!l) { return []; }
    const live = FLEX_LEVEL_LABELS.live;
    const out: string[] = [];
    if (l.wake) { out.push(`wake: ${l.wake.length ? `${l.wake.length} condition(s)` : 'mechanical'} — ${live}`); }
    for (const [k, v] of Object.entries(l.supervisor ?? {})) { out.push(`supervisor ${k}: ${String(v)} — ${live}`); }
    if (l.callMe) { out.push(`the next supervisor decision is put to you first — ${live}`); }
    if (l.pause) { out.push(`pausing at the next step boundary — ${live}`); }
    for (const w of pendingWords(l)) { out.push(`your ${w.kind} waits for the next decision: ${w.text.slice(0, 80)}`); }
    return out;
}

/** The flex points a run takes live, and the workflows.live argument each one is. */
export const LIVE_POINT_ARGS: Readonly<Record<string, string>> = {
    'workflow.wake': 'wake', 'workflow.supervisor.model': 'model',
    'workflow.supervisor.budgetUsd': 'budgetUSD', 'workflow.supervisor.maxCalls': 'maxCalls'
};

/** flex.set level=live: the point as a workflows.live argument; a cleared value drops back to the workflow's. */
export function liveArgOfPoint(point: string, value: unknown): Record<string, unknown> | { error: string } {
    const key = LIVE_POINT_ARGS[point];
    if (!key) { return { error: `${point} cannot be set live — these can: ${Object.keys(LIVE_POINT_ARGS).join(', ')}` }; }
    if (value === undefined && key !== 'model') { return { error: `${point}: give a value (a live value is cleared by setting another)` }; }
    return { [key]: value === undefined ? '' : value };
}

export const phoneRunList = (runs: readonly { title: string; where: string }[]): string =>
    runs.length ? runs.map((r, i) => `${i + 1}. ${r.title} — ${r.where}`).join('\n') : 'No workflow is running.';

/** `/steer [n] text` on the phone: the run's number in the list is optional when only one runs. */
export function phoneWord(arg: string): { index?: number; text: string } {
    const m = /^(\d{1,2})\s+([\s\S]+)$/.exec(arg.trim());
    return m ? { index: Number(m[1]), text: m[2].trim() } : { text: arg.trim() };
}
