import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { sanitizePrompt } from './util';
import { execOneShot } from './oneShot';

/**
 * I2 — A/B instruction experiments. Two CLAUDE.md variants answer the same
 * prompt set in isolated sandbox copies of the agent (CLAUDE.md + memory);
 * a cheap judge picks the better answer per prompt with the variant order
 * randomized (position-bias guard). The winner can be applied with a backup.
 */

export interface AbPromptResult {
    prompt: string;
    winner: 'A' | 'B' | 'tie';
    reason: string;
    snippetA: string;
    snippetB: string;
}

export interface AbSummary {
    winsA: number;
    winsB: number;
    ties: number;
    results: AbPromptResult[];
}

/** Sandbox: temp dir with the variant CLAUDE.md + a copy of memory/*.md. */
export function prepareVariantDir(agentDir: string, claudeMd: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-ab-'));
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), claudeMd, 'utf8');
    const memSrc = path.join(agentDir, 'memory');
    if (fs.existsSync(memSrc)) {
        const memDst = path.join(dir, 'memory');
        fs.mkdirSync(memDst);
        try {
            for (const f of fs.readdirSync(memSrc)) {
                if (f.toLowerCase().endsWith('.md')) {
                    fs.copyFileSync(path.join(memSrc, f), path.join(memDst, f));
                }
            }
        } catch { /* partial copy is fine for an experiment */ }
    }
    return dir;
}

function execClaude(cwd: string, args: string, prompt: string): Promise<string> {
    // X-260 — through the seam, so this turn runs as the sign-in the resolver
    // names rather than whichever one the machine happens to hold.
    return execOneShot({ cwd, args, prompt: sanitizePrompt(prompt), timeoutMs: 240_000 })
        .then(r => r.out);
}

/** Judge two answers with randomized presentation order. */
export async function judgePair(
    cwd: string, judgeArgs: string, prompt: string, outA: string, outB: string,
    rand: () => number = Math.random
): Promise<{ winner: 'A' | 'B' | 'tie'; reason: string }> {
    const swap = rand() < 0.5;
    const first = swap ? outB : outA;
    const second = swap ? outA : outB;
    const verdict = await execClaude(cwd, judgeArgs,
        `Sen bir kalite hakemisin. Aynı İSTEME iki farklı cevap verildi. ` +
        `İSTEM: ${prompt.slice(0, 500)} --- CEVAP-1: ${first.slice(0, 2000)} --- ` +
        `CEVAP-2: ${second.slice(0, 2000)} --- ` +
        `Hangisi isteği daha iyi karşılıyor? Yalnızca tek satır: ilk kelime 1, 2 veya EŞİT olsun, ardından kısa gerekçe.`);
    const line = verdict.split('\n').find(l => l.trim()) ?? '';
    let winner: 'A' | 'B' | 'tie' = 'tie';
    if (/^\s*1\b/.test(line)) { winner = swap ? 'B' : 'A'; }
    else if (/^\s*2\b/.test(line)) { winner = swap ? 'A' : 'B'; }
    return { winner, reason: line.slice(0, 200) || '(no verdict)' };
}

export async function runAbTest(
    agentDir: string,
    variantA: string,
    variantB: string,
    prompts: string[],
    runArgs: string,
    judgeArgs: string,
    log?: (m: string) => void
): Promise<AbSummary> {
    const dirA = prepareVariantDir(agentDir, variantA);
    const dirB = prepareVariantDir(agentDir, variantB);
    const results: AbPromptResult[] = [];
    try {
        for (const [i, prompt] of prompts.entries()) {
            log?.(`${i + 1}/${prompts.length}: running A…`);
            const outA = await execClaude(dirA, runArgs, prompt);
            log?.(`${i + 1}/${prompts.length}: running B…`);
            const outB = await execClaude(dirB, runArgs, prompt);
            log?.(`${i + 1}/${prompts.length}: hakem…`);
            const { winner, reason } = (!outA && !outB)
                ? { winner: 'tie' as const, reason: 'iki varyant da çıktı veremedi' }
                : !outA ? { winner: 'B' as const, reason: 'A çıktı veremedi' }
                : !outB ? { winner: 'A' as const, reason: 'B çıktı veremedi' }
                : await judgePair(agentDir, judgeArgs, prompt, outA, outB);
            results.push({
                prompt, winner, reason,
                snippetA: outA.slice(0, 300), snippetB: outB.slice(0, 300)
            });
        }
    } finally {
        for (const d of [dirA, dirB]) {
            try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* temp cleanup */ }
        }
    }
    return {
        winsA: results.filter(r => r.winner === 'A').length,
        winsB: results.filter(r => r.winner === 'B').length,
        ties: results.filter(r => r.winner === 'tie').length,
        results
    };
}

export function buildAbReport(agentName: string, sum: AbSummary): string {
    const lines: string[] = [];
    lines.push(`# A/B instruction experiment — ${agentName}`);
    lines.push('');
    lines.push(`**A (current): ${sum.winsA} · B (variant): ${sum.winsB} · tie: ${sum.ties}**`);
    lines.push('');
    for (const [i, r] of sum.results.entries()) {
        lines.push(`## ${i + 1}. ${r.winner === 'tie' ? '🤝 EŞİT' : r.winner === 'A' ? '🅰 A kazandı' : '🅱 B kazandı'}`);
        lines.push('');
        lines.push(`- Prompt: ${r.prompt.slice(0, 160)}`);
        lines.push(`- Verdict: ${r.reason}`);
        lines.push('');
        lines.push(`**A:**\n\n\`\`\`\n${r.snippetA}\n\`\`\``);
        lines.push('');
        lines.push(`**B:**\n\n\`\`\`\n${r.snippetB}\n\`\`\``);
        lines.push('');
    }
    return lines.join('\n');
}
