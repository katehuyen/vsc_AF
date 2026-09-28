import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { assetModality } from './judgeEngines';

/** `agentFarm.judgeCompare` — auto: an edit is judged against its source; never: the result alone. */
export type JudgeCompare = 'auto' | 'never';
export const normalizeJudgeCompare = (v: unknown): JudgeCompare => v === 'never' ? 'never' : 'auto';

/**
 * ‼️ M-62 — WHAT AN EDIT STARTED FROM. A judge shown only the result took the
 * test card's own colour bars for an unwanted layer and failed a correct edit.
 * The source is a local file the step uploaded, or an earlier step's asset
 * whose URL the step's input names — and only what a vision judge can put side
 * by side (image, video). None found = the judge sees the result alone, as before.
 */
export function judgeSources(
    input: string,
    uploads: { path: string }[] | undefined,
    metas: { taskId: string; assetFiles: string[]; assetUrls?: string[] }[],
    selfTaskId: string,
    exists: (f: string) => boolean = fs.existsSync
): string[] {
    const urls = new Set(String(input ?? '').match(/https?:\/\/[^\s"'\\<>]+/g) ?? []);
    const out: string[] = [];
    const add = (f?: string) => {
        if (f && !out.includes(f) && ['image', 'video'].includes(assetModality(f)) && exists(f)) { out.push(f); }
    };
    for (const u of uploads ?? []) { add(u.path); }
    for (const m of metas) {
        if (m.taskId === selfTaskId) { continue; }
        (m.assetUrls ?? []).forEach((u, i) => { if (urls.has(u)) { add(m.assetFiles[i]); } });
    }
    return out.slice(0, 2);
}

/**
 * The folder a comparing judge runs in: the result and its source copied side
 * by side as after / before, so one working directory reaches both and the
 * user's own folders are never written to. `cleanup` removes it.
 */
export function stageComparison(assetFile: string, sources: string[]): { dir: string; after: string; before: string[]; cleanup: () => void } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-judge-'));
    const after = 'after' + path.extname(assetFile).toLowerCase();
    fs.copyFileSync(assetFile, path.join(dir, after));
    const before = sources.map((s, i) => {
        const name = `before${sources.length > 1 ? '-' + (i + 1) : ''}${path.extname(s).toLowerCase()}`;
        fs.copyFileSync(s, path.join(dir, name));
        return name;
    });
    return { dir, after, before, cleanup: () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp dir */ } } };
}

/** The judge's question when it has the source too: did ONLY what was asked change? */
export function compareJudgePrompt(after: string, before: string[], criteria: string, viaRead: boolean): string {
    return `Sen bir görsel kalite denetçisisin. Bu bir DÜZENLEME: kaynak ${before.map(b => `"${b}"`).join(', ')} (ÖNCE) ve sonuç "${after}" (SONRA). ` +
        `İkisini de ${viaRead ? 'Read aracıyla ' : ''}aç ve karşılaştır; kabuk komutu çalıştırma. ` +
        `Kaynakta zaten bulunan şeyleri (renk çubukları, yazılar, logolar, arka plan) değişiklik sayma; yalnız istenen değişikliğin yapılıp yapılmadığına ve istenmeyen yeni bir şey eklenip eklenmediğine bak. ` +
        `ÖLÇÜT: ${criteria}. ` +
        `Yalnızca tek satır cevap ver: ilk kelime PASS, FAIL ya da FAIL-METHOD olsun (FAIL-METHOD: yaklaşımın kendisi yanlış, aynı talimatla yeniden denemek düzeltmez), ardından kısa gerekçe yaz.`;
}
