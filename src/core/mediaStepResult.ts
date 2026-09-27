/**
 * What a media step's result is: what it costs and what it hands on.
 * A per-second model whose answer names no duration (fal's video edit hands
 * back only the file) is billed on the length of the files it produced,
 * measured — a guessed 5 s under-counts a 10 s clip by half, and a run's soft
 * and hard spend ceilings then never trip. And the next step is handed the
 * LOCAL files it made as `outputs` (a tool step's own key) — the provider's
 * URL alone left a join after a for-each with nothing on this computer to join.
 */
import { assetKind, estimateMediaCost, MediaPriceRule, priceRuleFor } from './media';
import { candidateAnswers } from './mediaCandidates';

export type MeasureSeconds = (file: string) => Promise<number | undefined>;

function reportedSeconds(response: unknown): number | undefined {
    const r = response as { video?: { duration?: unknown }; duration?: unknown } | undefined;
    const v = Number(r?.video?.duration ?? r?.duration);
    return Number.isFinite(v) && v > 0 ? v : undefined;
}

/** The measured length of the timed files among `files` (video, audio), summed; undefined when none could be read. */
export async function measuredSeconds(files: string[], measure: MeasureSeconds): Promise<number | undefined> {
    let total = 0;
    let read = false;
    for (const f of files) {
        const kind = assetKind(f);
        if (kind !== 'video' && kind !== 'audio') { continue; }
        const s = await measure(f).catch(() => undefined);
        if (s !== undefined && Number.isFinite(s) && s > 0) { total += s; read = true; }
    }
    return read ? total : undefined;
}

export async function billMedia(
    model: string, response: unknown, rules: MediaPriceRule[], files: string[], measure: MeasureSeconds
): Promise<number> {
    // A-27 — N candidates are N calls: each billed on its own answer and its own file (src/core/mediaCandidates.ts)
    const each = candidateAnswers(response);
    if (each) {
        let sum = 0;
        for (const [i, r] of each.entries()) { sum += await billMedia(model, r, rules, files[i] ? [files[i]] : [], measure); }
        return sum;
    }
    const rule = priceRuleFor(model, rules);
    const seconds = rule?.per === 'second' && reportedSeconds(response) === undefined
        ? await measuredSeconds(files, measure) : undefined;
    return estimateMediaCost(model, response, rules, seconds);
}

/** What a step spent — an agent's tokens (costUSD) or a media call's estimate (mediaCost), and its checks (judgeUSD, A-27); every run total and the hard cap read this. */
export const stepSpend = (t: { costUSD?: number; mediaCost?: number; judgeUSD?: number }): number | undefined => {
    const own = t.costUSD ?? t.mediaCost;
    return own === undefined && !t.judgeUSD ? undefined : (own ?? 0) + (t.judgeUSD ?? 0);
};

export function withOutputs(response: unknown, files: string[]): Record<string, unknown> {
    return response && typeof response === 'object' && !Array.isArray(response)
        ? { ...(response as Record<string, unknown>), outputs: files }
        : { response, outputs: files };
}
