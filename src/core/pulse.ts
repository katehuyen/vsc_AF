import * as cp from 'child_process';
import * as fs from 'fs';
import { sanitizePrompt } from './util';

/**
 * H3 — Synthetic pulse (smoke) checks. A fixed, cheap prompt runs against
 * each agent; a cheap judge confirms the answer is coherent with the agent's
 * CLAUDE.md identity. Broken MCP servers, corrupted instructions and dead
 * CLI setups surface on the pulse — not in the middle of real work.
 */

export interface PulseResult {
    agentId: string;
    agentName: string;
    ts: number;
    ok: boolean;
    latencyMs: number;
    reason: string;
}

const MAX_RESULTS = 400;

export class PulseStore {
    results: PulseResult[] = [];
    lastRunAt = 0;

    constructor(private file: string) {
        this.load();
    }

    private load(): void {
        try {
            const json = JSON.parse(fs.readFileSync(this.file, 'utf8')) as {
                results?: PulseResult[]; lastRunAt?: number;
            };
            this.results = Array.isArray(json.results) ? json.results : [];
            this.lastRunAt = json.lastRunAt ?? 0;
        } catch { /* first run */ }
    }

    save(): void {
        try {
            if (this.results.length > MAX_RESULTS) {
                this.results = this.results.slice(-MAX_RESULTS);
            }
            fs.writeFileSync(this.file, JSON.stringify({
                results: this.results, lastRunAt: this.lastRunAt
            }, null, 2), 'utf8');
        } catch { /* best-effort */ }
    }

    add(r: PulseResult): void {
        this.results.push(r);
        this.save();
    }

    latestFor(agentId: string): PulseResult | undefined {
        for (let i = this.results.length - 1; i >= 0; i--) {
            if (this.results[i].agentId === agentId) { return this.results[i]; }
        }
        return undefined;
    }
}

export const PULSE_PROMPT =
    'Nabız kontrolü: kim olduğunu ve asıl görevini TEK cümlede söyle. Araç kullanma, dosya açma — sadece cevapla.';

function execClaude(cwd: string, args: string, prompt: string, timeoutMs: number): Promise<{ out: string; err?: string }> {
    return new Promise(resolve => {
        cp.exec(`claude ${args.trim()} -p "${sanitizePrompt(prompt)}"`,
            { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
            (error, stdout) => resolve({
                out: String(stdout ?? '').trim(),
                err: error ? String(error.message).slice(0, 160) : undefined
            }));
    });
}

/**
 * One pulse: run the fixed prompt in the agent's folder (cheap model), then
 * judge coherence against the head of its CLAUDE.md.
 */
export async function runPulse(
    agent: { id: string; name: string; dir: string },
    pulseArgs: string,
    judgeArgs: string,
    claudeMdHead: string
): Promise<PulseResult> {
    const started = Date.now();
    const { out, err } = await execClaude(agent.dir, pulseArgs, PULSE_PROMPT, 180_000);
    if (!out) {
        return {
            agentId: agent.id, agentName: agent.name, ts: started, ok: false,
            latencyMs: Date.now() - started,
            reason: 'no output — claude CLI failed' + (err ? ` (${err})` : '')
        };
    }
    const verdict = await execClaude(agent.dir, judgeArgs,
        `Sen bir tutarlılık denetçisisin. Bir ajanın kimlik tanımının başı şu: "${claudeMdHead.slice(0, 300)}". ` +
        `Ajan az önce kendini şöyle tanıttı: "${out.slice(0, 400)}". ` +
        `Tanıtım kimlikle tutarlı ve anlamlı mı? Yalnızca tek satır: ilk kelime PASS veya FAIL, ardından kısa gerekçe.`,
        120_000);
    const line = verdict.out.split('\n').find(l => l.trim()) ?? '';
    const ok = !/^\s*FAIL\b/i.test(line) && /PASS/i.test(line);
    return {
        agentId: agent.id, agentName: agent.name, ts: started, ok,
        latencyMs: Date.now() - started,
        reason: (line || '(no verdict)').slice(0, 200)
    };
}

/** Run pulses sequentially for the given agents (no parallel claude bursts). */
export async function runPulseSweep(
    agents: { id: string; name: string; dir: string; claudeMdHead: string }[],
    pulseArgs: string,
    judgeArgs: string,
    store: PulseStore,
    log?: (m: string) => void
): Promise<PulseResult[]> {
    const results: PulseResult[] = [];
    for (const [i, a] of agents.entries()) {
        log?.(`${i + 1}/${agents.length}: ${a.name}`);
        const r = await runPulse(a, pulseArgs, judgeArgs, a.claudeMdHead);
        store.add(r);
        results.push(r);
    }
    store.lastRunAt = Date.now();
    store.save();
    return results;
}
