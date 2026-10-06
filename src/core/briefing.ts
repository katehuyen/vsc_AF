import * as fs from 'fs';
import * as path from 'path';
import { downloadAsset, extFromUrl, findAssetUrls, runFalJob } from './media';

/**
 * J6 — Spoken briefing. With a fal.ai TTS model the daily digest text lands
 * as an mp3 in a folder of the user's choice (vault / phone-synced folder) —
 * the return half of the NoteScribe voice loop; without one it is read aloud here.
 */

export interface BriefingResult {
    ok: boolean;
    file?: string;
    error?: string;
}

/**
 * U-216 — HOW THE BRIEFING IS SAID. A fal.ai model chosen (`agentFarm.digestTtsModel`): an audio
 * file from fal, as before. None: this computer reads it aloud through the one reading channel
 * (U-197) — the voice of the text's language (U-203), the player's pause and skip (U-198), free.
 */
export type BriefingRoute = 'fal' | 'local';
export function briefingRoute(model: string): BriefingRoute { return String(model || '').trim() ? 'fal' : 'local'; }

export interface BriefingDeps {
    model(): string;
    text(): string;
    /** the fal way: the text as an audio file */
    toFile(text: string, model: string): Promise<BriefingResult>;
    /** this computer's reading of the text; rejects when it cannot be read */
    readAloud(text: string): Promise<unknown>;
}

export async function speakBriefing(deps: BriefingDeps): Promise<BriefingResult & { route: BriefingRoute }> {
    const model = deps.model();
    const text = deps.text();
    if (briefingRoute(model) === 'fal') { return { ...(await deps.toFile(text, model)), route: 'fal' }; }
    try {
        await deps.readAloud(text);
        return { ok: true, route: 'local' };
    } catch (e) {
        return { ok: false, error: String((e as Error)?.message ?? e), route: 'local' };
    }
}

/** Digest text → speech file in targetFolder (AgentFarm-Briefing-<date>.<ext>). */
export async function speakText(
    text: string,
    model: string,
    auth: string,
    targetFolder: string,
    opts: { baseUrl?: string; fileStem?: string } = {}
): Promise<BriefingResult> {
    if (!model.trim()) { return { ok: false, error: 'no TTS model configured (agentFarm.digestTtsModel)' }; }
    if (!auth) { return { ok: false, error: 'FAL key missing — store it via "Set Secret…" (FAL_KEY)' }; }
    if (!fs.existsSync(targetFolder)) { return { ok: false, error: `target folder not found: ${targetFolder}` }; }

    const input = JSON.stringify({ text: text.slice(0, 4000) });
    const result = await runFalJob(model, input, auth, { baseUrl: opts.baseUrl, timeoutMs: 5 * 60_000 });
    if (!result.ok) { return { ok: false, error: result.error ?? 'TTS job failed' }; }

    const audioUrl = result.assetUrls.find(u => /\.(mp3|wav|ogg|m4a)(\?|$)/i.test(u)) ??
        findAssetUrls(result.response).find(u => /audio/i.test(u)) ??
        result.assetUrls[0];
    if (!audioUrl) { return { ok: false, error: 'TTS response contained no audio URL' }; }

    const stem = opts.fileStem ?? `AgentFarm-Briefing-${new Date().toISOString().slice(0, 10)}`;
    const file = path.join(targetFolder, `${stem}.${extFromUrl(audioUrl)}`);
    if (!(await downloadAsset(audioUrl, file))) {
        return { ok: false, error: 'audio download failed' };
    }
    return { ok: true, file };
}
