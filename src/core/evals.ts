import * as fs from 'fs';
import { sanitizePrompt } from './util';
import { execOneShot } from './oneShot';

/**
 * G3 — Eval sets: the trace→dataset loop. Bad production traces (low-scored
 * sessions, FAIL-verified steps) become regression cases with one click.
 * The set replays on demand with a cheap model and a cheap judge, producing
 * a pass/fail scorecard compared against the previous run.
 */

export interface EvalCase {
    id: string;
    agentId: string;
    agentName: string;
    title: string;
    /** the prompt replayed against the agent */
    input: string;
    /** what a good answer must satisfy (judge criteria, plain language) */
    expectation: string;
    source?: { kind: 'quality' | 'verify' | 'manual'; sessionId?: string; taskId?: string; note?: string };
    createdAt: number;
    disabled?: boolean;
}

export interface EvalResult {
    caseId: string;
    title: string;
    pass: boolean;
    reason: string;
    outputSnippet: string;
    durationMs: number;
}

export interface EvalRun {
    id: string;
    agentId: string;
    agentName: string;
    ts: number;
    passed: number;
    failed: number;
    results: EvalResult[];
}

const MAX_RUNS = 60;

export class EvalStore {
    cases: EvalCase[] = [];
    runs: EvalRun[] = [];

    constructor(private file: string) {
        this.load();
    }

    private load(): void {
        try {
            const json = JSON.parse(fs.readFileSync(this.file, 'utf8')) as {
                cases?: EvalCase[]; runs?: EvalRun[];
            };
            this.cases = Array.isArray(json.cases) ? json.cases : [];
            this.runs = Array.isArray(json.runs) ? json.runs : [];
        } catch { /* first run */ }
    }

    save(): void {
        try {
            if (this.runs.length > MAX_RUNS) { this.runs = this.runs.slice(-MAX_RUNS); }
            fs.writeFileSync(this.file, JSON.stringify({
                cases: this.cases, runs: this.runs
            }, null, 2), 'utf8');
        } catch { /* storage is best-effort */ }
    }

    addCase(c: Omit<EvalCase, 'id' | 'createdAt'>): EvalCase {
        const entry: EvalCase = {
            ...c,
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            createdAt: Date.now()
        };
        this.cases.push(entry);
        this.save();
        return entry;
    }

    deleteCase(id: string): void {
        this.cases = this.cases.filter(c => c.id !== id);
        this.save();
    }

    casesFor(agentId: string): EvalCase[] {
        return this.cases.filter(c => c.agentId === agentId && !c.disabled);
    }

    hasSource(sessionId?: string, taskId?: string): boolean {
        return this.cases.some(c =>
            (sessionId && c.source?.sessionId === sessionId) ||
            (taskId && c.source?.taskId === taskId));
    }

    lastRun(agentId: string): EvalRun | undefined {
        for (let i = this.runs.length - 1; i >= 0; i--) {
            if (this.runs[i].agentId === agentId) { return this.runs[i]; }
        }
        return undefined;
    }

    addRun(run: EvalRun): void {
        this.runs.push(run);
        this.save();
    }
}

function execClaude(cwd: string, args: string, prompt: string, timeoutMs: number): Promise<string> {
    // X-260 — through the seam (account, and the engine as a stated axis).
    return execOneShot({ cwd, args, prompt: sanitizePrompt(prompt), timeoutMs })
        .then(r => r.out);
}

/** Replay one case: run the agent with the case input, judge the output against the expectation. */
export async function runEvalCase(
    agentDir: string,
    runArgs: string,
    judgeArgs: string,
    c: EvalCase
): Promise<EvalResult> {
    const started = Date.now();
    const output = await execClaude(agentDir, runArgs, c.input, 240_000);
    if (!output) {
        return {
            caseId: c.id, title: c.title, pass: false,
            reason: 'no output (claude CLI failed or timed out)',
            outputSnippet: '', durationMs: Date.now() - started
        };
    }
    const verdictLine = await execClaude(agentDir, judgeArgs,
        `Sen bir kalite denetçisisin. Aşağıdaki ÇIKTI şu BEKLENTİYİ karşılıyor mu? ` +
        `BEKLENTİ: ${c.expectation} --- ÇIKTI: ${output.slice(0, 4000)} --- ` +
        `Yalnızca tek satır cevap ver: ilk kelime PASS veya FAIL olsun, ardından kısa gerekçe yaz.`,
        180_000);
    const line = verdictLine.split('\n').find(l => l.trim()) ?? '';
    const pass = !/^\s*FAIL\b/i.test(line) && /PASS/i.test(line);
    return {
        caseId: c.id,
        title: c.title,
        pass,
        reason: line.slice(0, 200) || '(no verdict)',
        outputSnippet: output.slice(0, 400),
        durationMs: Date.now() - started
    };
}

/** Sequential replay of an agent's whole set (no parallel claude bursts). */
export async function runEvalSet(
    agentDir: string,
    runArgs: string,
    judgeArgs: string,
    cases: EvalCase[],
    log?: (msg: string) => void
): Promise<EvalResult[]> {
    const results: EvalResult[] = [];
    for (const [i, c] of cases.entries()) {
        log?.(`${i + 1}/${cases.length}: ${c.title}`);
        results.push(await runEvalCase(agentDir, runArgs, judgeArgs, c));
    }
    return results;
}

export interface RunComparison {
    regressed: string[];
    improved: string[];
    newlyFailed: string[];
}

/** Which cases flipped between two runs (matched by caseId). */
export function compareRuns(prev: EvalRun | undefined, results: EvalResult[]): RunComparison {
    const cmp: RunComparison = { regressed: [], improved: [], newlyFailed: [] };
    const prevById = new Map((prev?.results ?? []).map(r => [r.caseId, r]));
    for (const r of results) {
        const p = prevById.get(r.caseId);
        if (!p) {
            if (!r.pass) { cmp.newlyFailed.push(r.title); }
            continue;
        }
        if (p.pass && !r.pass) { cmp.regressed.push(r.title); }
        if (!p.pass && r.pass) { cmp.improved.push(r.title); }
    }
    return cmp;
}

/** Human-readable scorecard, e.g. "12/14 passed, 2 regressed". */
export function summarizeRun(results: EvalResult[], cmp: RunComparison): string {
    const passed = results.filter(r => r.pass).length;
    const parts = [`${passed}/${results.length} passed`];
    if (cmp.regressed.length) { parts.push(`${cmp.regressed.length} regressed`); }
    if (cmp.improved.length) { parts.push(`${cmp.improved.length} improved`); }
    return parts.join(', ');
}

export function buildEvalReport(
    agentName: string,
    results: EvalResult[],
    cmp: RunComparison,
    prev?: EvalRun
): string {
    const lines: string[] = [];
    lines.push(`# Eval run — ${agentName}`);
    lines.push('');
    lines.push(`- When: ${new Date().toLocaleString()}`);
    lines.push(`- Result: **${summarizeRun(results, cmp)}**` +
        (prev ? ` (previous: ${prev.passed}/${prev.passed + prev.failed} on ${new Date(prev.ts).toLocaleString()})` : ' (first run)'));
    if (cmp.regressed.length) { lines.push(`- ⚠ Regressed: ${cmp.regressed.join(', ')}`); }
    if (cmp.improved.length) { lines.push(`- ✓ Improved: ${cmp.improved.join(', ')}`); }
    lines.push('');
    for (const r of results) {
        lines.push(`## ${r.pass ? '✅' : '❌'} ${r.title}`);
        lines.push('');
        lines.push(`- Verdict: ${r.reason}`);
        lines.push(`- Duration: ${Math.round(r.durationMs / 1000)}s`);
        if (r.outputSnippet) {
            lines.push('');
            lines.push('```');
            lines.push(r.outputSnippet);
            lines.push('```');
        }
        lines.push('');
    }
    return lines.join('\n');
}
