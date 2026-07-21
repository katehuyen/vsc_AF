import * as fs from 'fs';
import * as path from 'path';
import { downloadAsset, extFromUrl, findAssetUrls, runFalJob } from './media';

/**
 * J6 — Spoken briefing. The daily digest text goes through a fal.ai TTS
 * model and lands as an mp3 in a folder of the user's choice (vault /
 * phone-synced folder) — the return half of the NoteScribe voice loop.
 */

export interface BriefingResult {
    ok: boolean;
    file?: string;
    error?: string;
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
