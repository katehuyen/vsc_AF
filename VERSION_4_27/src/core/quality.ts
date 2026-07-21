import * as cp from 'child_process';
import * as fs from 'fs';
import { sanitizePrompt } from './util';

/**
 * D1 — Quality scorecard. A cheap-model judge periodically samples recent
 * session outputs per agent and scores them 1-5. Scores feed the dashboard
 * table, the fleet report and the health insights (decline trend).
 */

export interface QualityScore {
    id: string;
    agentId: string;
    agentName: string;
    sessionFile: string;
    sessionId: string;
    /** last activity of the scored session (trend math uses this, not scoredAt). */
    sessionTs: number;
    scoredAt: number;
    /** 1-5, judge-assigned. */
    score: number;
    reason: string;
    promptSnippet: string;
}

const MAX_SCORES = 1000;

export class QualityStore {
    scores: QualityScore[] = [];
    lastSampleAt = 0;

    constructor(private file: string) {
        this.load();
    }

    private load(): void {
        try {
            const json = JSON.parse(fs.readFileSync(this.file, 'utf8')) as {
                scores?: QualityScore[]; lastSampleAt?: number;
            };
            this.scores = Array.isArray(json.scores) ? json.scores : [];
            this.lastSampleAt = json.lastSampleAt ?? 0;
        } catch { /* first run */ }
    }

    save(): void {
        try {
            if (this.scores.length > MAX_SCORES) {
                this.scores = this.scores.slice(-MAX_SCORES);
            }
            fs.writeFileSync(this.file, JSON.stringify({
                scores: this.scores, lastSampleAt: this.lastSampleAt
            }, null, 2), 'utf8');
        } catch { /* storage is best-effort */ }
    }

    hasSession(sessionId: string): boolean {
        return this.scores.some(s => s.sessionId === sessionId);
    }

    add(score: QualityScore): void {
        this.scores.push(score);
        this.save();
    }

    /** Average score for an agent whose sessions fall in [from, to). */
    avgBetween(agentId: string, from: number, to: number): { avg?: number; count: number } {
        const list = this.scores.filter(s =>
            s.agentId === agentId && s.sessionTs >= from && s.sessionTs < to);
        if (!list.length) { return { count: 0 }; }
        return {
            avg: list.reduce((a, s) => a + s.score, 0) / list.length,
            count: list.length
        };
    }

    avgSince(agentId: string, sinceMs: number, now = Date.now()): { avg?: number; count: number } {
        return this.avgBetween(agentId, now - sinceMs, now + 24 * 3600 * 1000);
    }
}

/**
 * Pull a scoreable sample out of a transcript: the first real user request
 * and the agent's final text answer.
 */
export function extractQualitySample(file: string): { prompt: string; answer: string } | undefined {
    let raw: string;
    try { raw = fs.readFileSync(file, 'utf8'); } catch { return undefined; }
    let prompt = '';
    let answer = '';
    for (const lineText of raw.split('\n')) {
        if (!lineText.trim()) { continue; }
        let line: {
            type?: string; isMeta?: boolean;
            message?: { role?: string; content?: unknown };
        };
        try { line = JSON.parse(lineText); } catch { continue; }
        if (line.type === 'user' && !line.isMeta && typeof line.message?.content === 'string') {
            const text = line.message.content;
            if (!prompt && !text.startsWith('<')) { prompt = text; }
        }
        if (line.type === 'assistant' && Array.isArray(line.message?.content)) {
            const text = (line.message!.content as { type?: string; text?: string }[])
                .filter(b => b?.type === 'text' && b.text)
                .map(b => b.text)
                .join('\n')
                .trim();
            if (text) { answer = text; }
        }
    }
    if (!prompt || !answer) { return undefined; }
    return { prompt: prompt.slice(0, 700), answer: answer.slice(0, 3000) };
}

/** Cheap-model judge call: returns a 1-5 score for how well the answer served the request. */
export function scoreOutput(
    cwd: string, judgeArgs: string, prompt: string, answer: string
): Promise<{ score?: number; reason: string }> {
    return new Promise(resolve => {
        const p = sanitizePrompt(
            `Sen bir kalite denetçisisin. Aşağıda bir kullanıcı isteği ve bir yapay zekâ ajanının ` +
            `son cevabı var. Cevabın isteği ne kadar iyi karşıladığını 1-5 arası puanla ` +
            `(5=mükemmel, 3=idare eder, 1=kötü/alakasız). ` +
            `İSTEK: ${prompt} --- CEVAP: ${answer} --- ` +
            `Yalnızca tek satır cevap ver ve şu biçimi kullan: SCORE: <sayı> - kısa gerekçe.`);
        cp.exec(`claude ${judgeArgs.trim()} -p "${p}"`,
            { cwd, timeout: 180_000, windowsHide: true },
            (err, stdout) => {
                const out = String(stdout ?? '').trim();
                if (err && !out) {
                    resolve({ reason: 'judge unavailable (' + String(err.message).slice(0, 80) + ')' });
                    return;
                }
                const line = out.split('\n').find(l => /SCORE/i.test(l)) ??
                    out.split('\n').find(l => l.trim()) ?? '';
                const m = /SCORE[:\s]*([1-5])/i.exec(line) ?? /\b([1-5])\b/.exec(line);
                resolve({
                    score: m ? Number(m[1]) : undefined,
                    reason: line.slice(0, 200) || '(no verdict)'
                });
            });
    });
}

/** What sampleQuality needs to know about a session (plain data — testable without vscode). */
export interface SessionSampleRef {
    file: string;
    sessionId: string;
    agentId: string;
    agentName: string;
    agentDir: string;
    lastTs: number;
    isSidechain: boolean;
    userTurns: number;
}

/**
 * Score up to `perAgent` recent, not-yet-scored sessions per agent.
 * Judge calls run sequentially to avoid a burst of parallel claude processes.
 */
export async function sampleQuality(
    sessions: SessionSampleRef[],
    store: QualityStore,
    judgeArgs: string,
    opts: { perAgent?: number; sinceMs?: number; now?: number; log?: (m: string) => void } = {}
): Promise<{ scored: QualityScore[]; skipped: number }> {
    const now = opts.now ?? Date.now();
    const sinceMs = opts.sinceMs ?? 7 * 24 * 3600 * 1000;
    const perAgent = opts.perAgent ?? 2;
    const log = opts.log ?? (() => { /* silent */ });

    const byAgent = new Map<string, SessionSampleRef[]>();
    for (const s of sessions) {
        if (s.isSidechain || s.userTurns < 1) { continue; }
        if (s.lastTs < now - sinceMs || store.hasSession(s.sessionId)) { continue; }
        const list = byAgent.get(s.agentId) ?? [];
        list.push(s);
        byAgent.set(s.agentId, list);
    }

    const scored: QualityScore[] = [];
    let skipped = 0;
    for (const list of byAgent.values()) {
        list.sort((a, b) => b.lastTs - a.lastTs);
        for (const s of list.slice(0, perAgent)) {
            const sample = extractQualitySample(s.file);
            if (!sample) { skipped++; continue; }
            log(`scoring ${s.agentName} — ${s.sessionId.slice(0, 8)}…`);
            const { score, reason } = await scoreOutput(s.agentDir, judgeArgs, sample.prompt, sample.answer);
            if (score === undefined) { skipped++; continue; }
            const entry: QualityScore = {
                id: s.sessionId,
                agentId: s.agentId,
                agentName: s.agentName,
                sessionFile: s.file,
                sessionId: s.sessionId,
                sessionTs: s.lastTs,
                scoredAt: now,
                score,
                reason,
                promptSnippet: sample.prompt.slice(0, 120)
            };
            store.add(entry);
            scored.push(entry);
        }
    }
    store.lastSampleAt = now;
    store.save();
    return { scored, skipped };
}
