import * as cp from 'child_process';
import * as fs from 'fs';
import { parsePlannerEnvelope } from './missions';
import { estimateTokens, extractJson, sanitizePrompt } from './util';

/**
 * I3 — Memory distillation. A cheap model condenses a bloated or stale
 * memory file into a draft: merged duplicates, compressed prose, contradictions
 * flagged — never applied without explicit approval, always with a .afbak
 * backup. The semi-automatic version of the manual "context diet".
 */

/** What one cheap-model call answered, and what it cost. */
export interface JudgeRun {
    text: string;
    costUSD?: number;
    tokens?: number;
    error?: string;
}

/**
 * ‼️ A MODEL CALL THAT CANNOT SAY WHAT IT COST IS A BILL WITH NO LINE (B-6).
 *
 * Both cheap-model paths in this file used to run bare `claude -p` and read
 * stdout as prose — which works, and reports nothing. `--output-format json`
 * wraps the same answer in the envelope `total_cost_usd` and `usage` ride in,
 * so a caller told "tidy this memory file" can be told back what the tidying
 * cost. It is added only when `judgeArgs` has not already chosen a format
 * (a user-set `agentFarm.judgeArgs` wins, and two `--output-format` flags
 * would just make the CLI refuse), and an answer that is not an envelope is
 * still read as prose — so nothing that worked before stops working.
 */
function runJudge(cwd: string, judgeArgs: string, prompt: string): Promise<JudgeRun> {
    const extra = /--output-format/.test(judgeArgs) ? '' : ' --output-format json';
    return new Promise(resolve => {
        cp.exec(`claude ${judgeArgs.trim()}${extra} -p "${prompt}"`,
            { cwd, timeout: 240_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
            (err, stdout) => {
                const out = String(stdout ?? '').trim();
                if (!out) {
                    resolve({ text: '', error: 'no output' + (err ? ` (${String(err.message).slice(0, 80)})` : '') });
                    return;
                }
                const envelope = parsePlannerEnvelope(out);
                if (!envelope) { resolve({ text: out }); return; }
                resolve({
                    text: envelope.result.trim(),
                    costUSD: envelope.costUSD,
                    tokens: envelope.tokens,
                    error: envelope.isError ? `the model reported an error (${envelope.subtype ?? 'unknown'})` : undefined
                });
            });
    });
}

/** The CLI's own refusals must never be mistaken for an answer. */
const MODEL_UNAVAILABLE = /session limit|usage limit|rate limit|overloaded|api error/i;

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
    /** What the cheap-model call itself cost, when the CLI reported it. */
    costUSD?: number;
    /** Tokens the CALL spent — not the same figure as tokensBefore/After. */
    callTokens?: number;
}

/** Ask the cheap model for a condensed draft of one memory file. */
export async function distillFile(
    cwd: string,
    judgeArgs: string,
    filePath: string
): Promise<DistillResult> {
    let content: string;
    try { content = fs.readFileSync(filePath, 'utf8'); }
    catch (e) { return { error: 'unreadable: ' + String(e), tokensBefore: 0 }; }
    const tokensBefore = estimateTokens(content);
    const prompt = sanitizePrompt(`${DISTILL_PROMPT} --- DOSYA İÇERİĞİ: ${content.slice(0, 24_000)}`);
    const run = await runJudge(cwd, judgeArgs, prompt);
    // The cost is reported even when the answer is refused: the call happened.
    const spent = { costUSD: run.costUSD, callTokens: run.tokens };
    if (run.error && !run.text) { return { error: run.error, tokensBefore, ...spent }; }
    // Strip a possible markdown fence around the whole answer.
    const fenced = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/.exec(run.text);
    const draft = (fenced ? fenced[1] : run.text).trim() + '\n';
    if (draft.length < 40) {
        return { error: 'draft suspiciously short — discarded', tokensBefore, ...spent };
    }
    // CLI error/limit messages must never masquerade as a draft.
    if (MODEL_UNAVAILABLE.test(draft.slice(0, 200))) {
        return { error: 'model unavailable: ' + draft.slice(0, 120), tokensBefore, ...spent };
    }
    // If the original carried frontmatter, a draft without it lost data.
    if (content.trimStart().startsWith('---') && !draft.trimStart().startsWith('---')) {
        return { error: 'draft dropped the frontmatter — discarded', tokensBefore, ...spent };
    }
    return { draft, tokensBefore, tokensAfter: estimateTokens(draft), ...spent };
}

/** Apply a draft over the original with a timestamped backup. Returns the backup path. */
export function applyDistilled(filePath: string, draft: string): string {
    const backup = `${filePath}.${Date.now()}.afbak`;
    fs.copyFileSync(filePath, backup);
    fs.writeFileSync(filePath, draft, 'utf8');
    return backup;
}

// ---------- D2 — cross-file contradiction scan ----------

export interface Contradiction {
    files: string[];
    claimA: string;
    claimB: string;
    note?: string;
}

export interface ContradictionResult {
    contradictions?: Contradiction[];
    error?: string;
    /** files actually included (budget may truncate the corpus) */
    scanned: string[];
    truncated: boolean;
    /** What the cheap-model sweep cost, when the CLI reported it. */
    costUSD?: number;
    callTokens?: number;
}

const CONTRADICTION_PROMPT =
    'Sen bir hafıza denetçisisin. Aşağıda bir yapay zekâ ajanının hafıza dosyaları var ' +
    '(=== DOSYA: ad === satırlarıyla ayrılmış). Görevin: dosyalar ARASINDA veya içinde ' +
    'birbiriyle ÇELİŞEN ifadeleri bulmak. Tarih/güncellik farkı tek başına çelişki değildir ' +
    '(yeni bilgi eskisini güncelleyebilir); yalnızca hangisinin geçerli olduğu belirsiz kalan ' +
    'gerçek uyuşmazlıkları listele. YALNIZCA şu JSON ile yanıt ver, başka hiçbir şey yazma: ' +
    '{"contradictions":[{"files":["a.md","b.md"],"claimA":"...","claimB":"...","note":"kısa değerlendirme"}]} ' +
    '— çelişki yoksa boş dizi döndür.';

const SCAN_BUDGET_CHARS = 24_000;

/** Cheap-model sweep over an agent's memory corpus for contradicting claims. */
export async function scanContradictions(
    cwd: string,
    judgeArgs: string,
    files: { name: string; path: string }[]
): Promise<ContradictionResult> {
    let corpus = '';
    const scanned: string[] = [];
    let truncated = false;
    for (const f of files) {
        let content = '';
        try { content = fs.readFileSync(f.path, 'utf8'); } catch { continue; }
        const block = `\n=== DOSYA: ${f.name} ===\n${content.trim()}\n`;
        if (corpus.length + block.length > SCAN_BUDGET_CHARS) { truncated = true; break; }
        corpus += block;
        scanned.push(f.name);
    }
    if (!scanned.length) {
        return { error: 'no readable memory files', scanned, truncated };
    }
    const prompt = sanitizePrompt(`${CONTRADICTION_PROMPT} ${corpus}`);
    const run = await runJudge(cwd, judgeArgs, prompt);
    const spent = { costUSD: run.costUSD, callTokens: run.tokens };
    if (run.error && !run.text) { return { error: run.error, scanned, truncated, ...spent }; }
    if (MODEL_UNAVAILABLE.test(run.text.slice(0, 200))) {
        return { error: 'model unavailable: ' + run.text.slice(0, 120), scanned, truncated, ...spent };
    }
    const json = extractJson(run.text) as { contradictions?: Contradiction[] } | undefined;
    if (!json || !Array.isArray(json.contradictions)) {
        return { error: 'unparseable model output: ' + run.text.slice(0, 120), scanned, truncated, ...spent };
    }
    const clean = json.contradictions.filter(c =>
        c && Array.isArray(c.files) && typeof c.claimA === 'string' && typeof c.claimB === 'string');
    return { contradictions: clean, scanned, truncated, ...spent };
}
