/**
 * M-42 — WHICH JUDGE CAN LOOK AT AN ASSET, and what happens when none can.
 *
 * The vision judge used to hand every asset to Claude's Read tool. Claude
 * cannot open a video or an audio file, and a judge that could not run was
 * "passed through" — so a quality gate on a video step produced PASS without
 * anything having been looked at. Now the asset's modality is checked against
 * what the judging engine can open FIRST (`media/afFlexForms.js` ENGINE_INPUT —
 * only a stated "cannot" refuses), and a verdict that could not be reached is
 * `unjudged`, never PASS. What an unjudged step does is the user's flex point
 * `judge.unjudged`: ask me (default) · pass it through · stop.
 */
import * as path from 'path';
import { deadReason } from './flexForms';
import { flexPoint } from './flexPoints';
import { resolveFlex } from './flexResolve';
import { oneShotEngines, oneShotEnvelope } from './oneShot';

export type Modality = 'image' | 'video' | 'audio' | 'pdf' | 'text';
export type UnjudgedBehavior = 'ask' | 'pass' | 'stop';
export const UNJUDGED_BEHAVIORS: readonly UnjudgedBehavior[] = ['ask', 'pass', 'stop'];

const EXT: Record<string, Modality> = {
    '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image', '.gif': 'image', '.bmp': 'image',
    '.mp4': 'video', '.mov': 'video', '.webm': 'video', '.mkv': 'video', '.avi': 'video', '.m4v': 'video',
    '.mp3': 'audio', '.wav': 'audio', '.m4a': 'audio', '.ogg': 'audio', '.flac': 'audio', '.aac': 'audio',
    '.pdf': 'pdf'
};

export const assetModality = (file: string): Modality => EXT[path.extname(file).toLowerCase()] ?? 'text';

export const judgeEngine = (engine?: string): string => (engine || 'claude').trim().toLowerCase() || 'claude';

/** A step's own judge: `verify.engine` / `verify.model` (flex points judge.engine · judge.model). */
export interface StepJudge { engine?: string; model?: string }

export interface JudgeWant { engine: string; model?: string; args: string; origin: string }

const MODEL_FLAG = /--model(?:=|\s+)\S+/g;

/**
 * The judge a step gets and where each half came from. `settingArgs` is the
 * judge.args value in force; the shipped default counts as built-in. Those args
 * are Claude CLI flags, so they ride only on a claude judge, and a step's own
 * model replaces the one they carry instead of stacking a second --model.
 */
export function judgeWant(step: StepJudge | undefined, settingArgs: string | undefined): JudgeWant {
    const e = resolveFlex('judge.engine', { step: step?.engine });
    const engine = judgeEngine(String(e.value));
    const m = resolveFlex('judge.model', { step: step?.model });
    const shipped = flexPoint('judge.args')?.default;
    const a = resolveFlex('judge.args', { settings: settingArgs === shipped ? undefined : settingArgs });
    const model = String(m.value || '').trim() || undefined;
    let args = engine === 'claude' ? String(a.value || '').trim() : '';
    if (model) { args = args.replace(MODEL_FLAG, '').replace(/\s+/g, ' ').trim(); }
    const tail = model ? `model ${m.sentence}` : args ? `args ${a.sentence}` : '';
    return { engine, ...(model ? { model } : {}), args, origin: `judge ${e.sentence}${tail ? ` · ${tail}` : ''}` };
}

/** Why a step's judge engine is refused at save time — '' when it can judge. */
export function judgeEngineRefusal(engine: unknown): string {
    if (engine === undefined || engine === null || String(engine).trim() === '') { return ''; }
    const e = judgeEngine(String(engine));
    const can = oneShotEngines();
    return can.includes(e) ? '' : `"${e}" has no one-shot judge turn yet — a judge can run on: ${can.join(', ')}`;
}

/** Can this engine judge this asset? The refusal says why, in words. */
export function visionRoute(file: string, engine?: string):
    { ok: true; modality: Modality; engine: string } | { ok: false; modality: Modality; engine: string; why: string } {
    const modality = assetModality(file);
    const e = judgeEngine(engine);
    const why = deadReason(e, [modality]);
    return why ? { ok: false, modality, engine: e, why } : { ok: true, modality, engine: e };
}

/**
 * The judge for an input the built-in engine cannot open, when the step named no
 * engine of its own. Measured 2026-09-26: agy on gemini-3.8-flash-low saw a 12 s
 * clip's frames (colours and the cut, ~36k tokens) and a PNG; it got no sound.
 */
export const VISION_DEFAULT: Partial<Record<Modality, { engine: string; model: string }>> = {
    video: { engine: 'agy', model: 'gemini-3.8-flash-low' }
};

/** judgeWant, with the measured default for a video when the step left the engine blank. */
export function visionJudgeWant(file: string, step: StepJudge | undefined, settingArgs: string | undefined): JudgeWant {
    const want = judgeWant(step, settingArgs);
    const modality = assetModality(file);
    const d = VISION_DEFAULT[modality];
    if (String(step?.engine ?? '').trim() || !d || visionRoute(file, want.engine).ok) { return want; }
    const own = String(step?.model ?? '').trim();
    const model = /^gemini/i.test(own) ? own : d.model;
    return {
        engine: d.engine, model, args: '',
        origin: `judge ${d.engine} — built-in default for ${modality} (${want.engine} cannot open one) · model ${model} — ${model === own ? 'from this step' : `built-in default for ${modality}`}`
    };
}

export const normalizeUnjudged = (v: unknown): UnjudgedBehavior =>
    UNJUDGED_BEHAVIORS.includes(v as UnjudgedBehavior) ? v as UnjudgedBehavior : 'ask';

/** A-27 — a judge call asks claude for its envelope, so the check's spend reaches the run; other engines answer in plain text. */
export const judgeJson = (engine: string): { json?: true } => (engine === 'claude' ? { json: true } : {});

/** The judge's reply text and what the call cost, read out of the envelope when there is one; an error envelope is no verdict. */
export function judgeReply(engine: string, out: string): { text: string; costUSD?: number; error?: string } {
    const env = engine === 'claude' ? oneShotEnvelope('claude', out) : null;
    if (!env) { return { text: out }; }
    return {
        text: env.isError ? '' : env.result, ...(env.costUSD ? { costUSD: env.costUSD } : {}),
        ...(env.isError ? { error: `the turn ended in ${env.subtype ?? 'an error'}` } : {})
    };
}

/**
 * What an unjudged step does. `answer` is the user's word when the behaviour is
 * `ask` — undefined when nobody could be asked, which is NOT a yes.
 */
export function unjudgedOutcome(behavior: UnjudgedBehavior, why: string, answer?: boolean): { pass: boolean; line: string } {
    if (behavior === 'pass') { return { pass: true, line: `NOT JUDGED — ${why}; passed through by your setting (judge.unjudged = pass)` }; }
    if (behavior === 'stop') { return { pass: false, line: `NOT JUDGED — ${why}; stopped by your setting (judge.unjudged = stop)` }; }
    if (answer === undefined) { return { pass: false, line: `NOT JUDGED — ${why}; nobody could be asked here, so it did not pass` }; }
    return answer
        ? { pass: true, line: `NOT JUDGED — ${why}; you let it continue` }
        : { pass: false, line: `NOT JUDGED — ${why}; you stopped it` };
}
