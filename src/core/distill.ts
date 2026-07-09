import * as cp from 'child_process';
import * as fs from 'fs';
import { estimateTokens, sanitizePrompt } from './util';

/**
 * I3 — Memory distillation. A cheap model condenses a bloated or stale
 * memory file into a draft: merged duplicates, compressed prose, contradictions
 * flagged — never applied without explicit approval, always with a .afbak
 * backup. The semi-automatic version of the manual "context diet".
 */

export interface DistillCandidate {
    path: string;
    name: string;
    tokens: number;
    staleDays: number;
    reason: string;
}

/** Which memory files are worth distilling: oversized or stale (MEMORY.md index excluded). */
export function distillCandidates(
    files: { path: string; name: string; size: number; mtime: number; tokens: number }[],
    opts: { minTokens?: number; staleDays?: number; now?: number } = {}
): DistillCandidate[] {
    const now = opts.now ?? Date.now();
    const minTokens = opts.minTokens ?? 2000;
    const staleDays = opts.staleDays ?? 45;
    const out: DistillCandidate[] = [];
    for (const f of files) {
        if (f.name.toLowerCase() === 'memory.md') { continue; } // the index is curated by hand
        const stale = Math.floor((now - f.mtime) / 86400000);
        const reasons: string[] = [];
        if (f.tokens >= minTokens) { reasons.push(`~${f.tokens} tok`); }
        if (stale >= staleDays) { reasons.push(`${stale}d untouched`); }
        if (reasons.length) {
            out.push({ path: f.path, name: f.name, tokens: f.tokens, staleDays: stale, reason: reasons.join(' • ') });
        }
    }
    return out.sort((a, b) => b.tokens - a.tokens);
}

const DISTILL_PROMPT =
    'Sen bir hafıza bakımcısısın. Aşağıda bir yapay zekâ ajanının hafıza dosyası var. ' +
    'Görevin: bilgiyi KAYBETMEDEN yoğunlaştır — tekrarları birleştir, gevşek anlatımı sıkılaştır, ' +
    'bayat/bağlamsız satırları "## Arşiv adayı" bölümüne taşı, birbiriyle çelişen ifadeleri ' +
    '"⚠ ÇELİŞKİ:" önekiyle işaretle (silme). Dosyanın frontmatter\'ını (--- arasındaki kısım) ' +
    'AYNEN koru. Markdown yapısını koru. Yorum yazma, YALNIZCA dosyanın yeni içeriğini döndür.';

export interface DistillResult {
    draft?: string;
    error?: string;
    tokensBefore: number;
    tokensAfter?: number;
}

/** Ask the cheap model for a condensed draft of one memory file. */
export function distillFile(
    cwd: string,
    judgeArgs: string,
    filePath: string
): Promise<DistillResult> {
    return new Promise(resolve => {
        let content: string;
        try { content = fs.readFileSync(filePath, 'utf8'); }
        catch (e) { resolve({ error: 'unreadable: ' + String(e), tokensBefore: 0 }); return; }
        const tokensBefore = estimateTokens(content);
        const prompt = sanitizePrompt(`${DISTILL_PROMPT} --- DOSYA İÇERİĞİ: ${content.slice(0, 24_000)}`);
        cp.exec(`claude ${judgeArgs.trim()} -p "${prompt}"`,
            { cwd, timeout: 240_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
            (err, stdout) => {
                const out = String(stdout ?? '').trim();
                if (!out) {
                    resolve({ error: 'no output' + (err ? ` (${String(err.message).slice(0, 80)})` : ''), tokensBefore });
                    return;
                }
                // Strip a possible markdown fence around the whole answer.
                const fenced = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/.exec(out);
                const draft = (fenced ? fenced[1] : out).trim() + '\n';
                if (draft.length < 40) {
                    resolve({ error: 'draft suspiciously short — discarded', tokensBefore });
                    return;
                }
                // CLI error/limit messages must never masquerade as a draft.
                if (/session limit|usage limit|rate limit|overloaded|api error/i.test(draft.slice(0, 200))) {
                    resolve({ error: 'model unavailable: ' + draft.slice(0, 120), tokensBefore });
                    return;
                }
                // If the original carried frontmatter, a draft without it lost data.
                if (content.trimStart().startsWith('---') && !draft.trimStart().startsWith('---')) {
                    resolve({ error: 'draft dropped the frontmatter — discarded', tokensBefore });
                    return;
                }
                resolve({ draft, tokensBefore, tokensAfter: estimateTokens(draft) });
            });
    });
}

/** Apply a draft over the original with a timestamped backup. Returns the backup path. */
export function applyDistilled(filePath: string, draft: string): string {
    const backup = `${filePath}.${Date.now()}.afbak`;
    fs.copyFileSync(filePath, backup);
    fs.writeFileSync(filePath, draft, 'utf8');
    return backup;
}
