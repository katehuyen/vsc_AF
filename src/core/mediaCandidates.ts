/**
 * A-27 — PARALLEL-CHEAP: a media step makes N candidates at once (`media.candidates`,
 * 1–4) and its vision check picks one — the candidates are judged in order and the
 * first PASS is handed on, so a cheap model gets N tries for one wait. The archive
 * then names the picked candidate alone, exactly as a one-candidate step would.
 * Without a check the first candidate is handed on. A reload mid-render reattaches
 * the first candidate's job only. Pure.
 */
import { resolveFlex } from './flexResolve';
import type { MediaResult } from './media';

export const MAX_CANDIDATES = 4;

/** How many candidates a step makes: its own number (1–4), else the built-in 1. */
export function candidatesOf(v: unknown): number {
    const r = resolveFlex('media.candidates', { step: v === undefined || v === null || v === '' ? undefined : Number(v) });
    const n = Math.floor(Number(r.value));
    return Number.isFinite(n) ? Math.min(MAX_CANDIDATES, Math.max(1, n)) : 1;
}

/** Why a step's candidates are refused, or ''. */
export function candidatesRefusal(v: unknown): string {
    if (v === undefined || v === null || v === '') { return ''; }
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= MAX_CANDIDATES ? '' : `media.candidates is a whole number from 1 to ${MAX_CANDIDATES}, not ${JSON.stringify(v)}`;
}

/** N answers as one: the first asset of each good one, their answers kept side by side. */
export function mergeCandidates(results: MediaResult[]): MediaResult {
    const good = results.filter(r => r.ok && r.assetUrls.length);
    if (!good.length) {
        const why = results.map(r => r.error).filter(Boolean)[0] ?? 'no candidate produced an asset';
        return { ok: false, error: `${results.length} candidate(s), none made anything — ${why}`, assetUrls: [] };
    }
    return {
        ok: true, assetUrls: good.map(r => r.assetUrls[0]),
        response: { candidates: good.map(r => r.response ?? {}), candidateUrls: good.map(r => r.assetUrls[0]) }
    };
}

interface Candidates { candidates: unknown[]; candidateUrls: string[] }
const isCandidates = (v: unknown): v is Candidates =>
    !!v && typeof v === 'object' && Array.isArray((v as Candidates).candidates) && Array.isArray((v as Candidates).candidateUrls);

/** The answers of the candidates whose asset was actually downloaded, in the downloads' order. */
export function alignCandidates(response: unknown, keptUrls: string[]): unknown {
    if (!isCandidates(response)) { return response; }
    const keep = keptUrls.map(u => response.candidateUrls.indexOf(u)).filter(i => i >= 0);
    return { candidates: keep.map(i => response.candidates[i]), candidateUrls: keep.map(i => response.candidateUrls[i]) };
}

/** Each candidate's own answer, when the response holds several; else undefined. */
export function candidateAnswers(response: unknown): unknown[] | undefined {
    return isCandidates(response) ? response.candidates : undefined;
}

/** The archive with its body replaced — the header and the Finished footer, and anything after it, kept. */
export function withArchiveBody(content: string, body: string): string {
    const start = content.indexOf('\n---\n');
    const foot = content.lastIndexOf('\n---\nFinished:');
    if (start < 0 || foot <= start) { return content; }
    return `${content.slice(0, start + 5)}\n${body}\n${content.slice(foot)}`;
}

/** What a picked candidate hands on: its own answer and its own file, as if it had been the only one. */
export function pickedBody(body: unknown, i: number, of: number): Record<string, unknown> {
    const b = (body && typeof body === 'object' ? body : {}) as { candidates?: unknown[]; outputs?: unknown[] };
    const answer = Array.isArray(b.candidates) ? b.candidates[i] : undefined;
    const own = answer && typeof answer === 'object' && !Array.isArray(answer) ? answer as Record<string, unknown> : { response: answer ?? null };
    const file = Array.isArray(b.outputs) ? b.outputs[i] : undefined;
    return { ...own, outputs: file === undefined ? [] : [file], picked: { candidate: i + 1, of } };
}

/** The line a pick writes. */
export function pickLine(i: number, of: number, reason: string): string {
    return `Picked candidate ${i + 1} of ${of}: ${reason}`;
}
