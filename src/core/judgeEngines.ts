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

/** The engine the judge args run. The judge is a `claude` one-shot today; a named engine is the seam for M-42 (2). */
export const judgeEngine = (engine?: string): string => (engine || 'claude').toLowerCase();

/** Can this engine judge this asset? The refusal says why, in words. */
export function visionRoute(file: string, engine?: string):
    { ok: true; modality: Modality; engine: string } | { ok: false; modality: Modality; engine: string; why: string } {
    const modality = assetModality(file);
    const e = judgeEngine(engine);
    const why = deadReason(e, [modality]);
    return why ? { ok: false, modality, engine: e, why } : { ok: true, modality, engine: e };
}

export const normalizeUnjudged = (v: unknown): UnjudgedBehavior =>
    UNJUDGED_BEHAVIORS.includes(v as UnjudgedBehavior) ? v as UnjudgedBehavior : 'ask';

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
