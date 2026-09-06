import { sanitizePrompt } from './util';
import { execOneShot } from './oneShot';

/**
 * D3 — Weekly health digest. Instead of ten separate alerts, one cheap-model
 * sentence-level summary of the fleet's week: cost trend, problems worth
 * attention (budget / errors / duties / quality) and a single recommendation.
 */

/** ISO week key, e.g. 2026-W28 (also used by the auto-report scheduler). */
export function isoWeek(d: Date): string {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export interface WeeklyAgentFacts {
    name: string;
    costWeek: number;
    costPrevWeek: number;
    sessions: number;
    errors: number;
    toolCalls: number;
    qualityAvg?: number;
    qualityCount: number;
}

export interface WeeklyFacts {
    agents: WeeklyAgentFacts[];
    totalWeek: number;
    totalPrevWeek: number;
    insights: { severity: string; agentName: string; category: string; message: string }[];
}

/** Compact fact sheet the summarizer model reads (plain data in, text out — testable). */
export function buildWeeklyFactsText(f: WeeklyFacts): string {
    const lines: string[] = [];
    lines.push(`FILO: bu hafta $${f.totalWeek.toFixed(2)}, önceki hafta $${f.totalPrevWeek.toFixed(2)}.`);
    for (const a of f.agents) {
        if (!a.sessions && !a.costWeek) { continue; }
        const errPct = a.toolCalls ? Math.round(100 * a.errors / a.toolCalls) : 0;
        lines.push(
            `AJAN ${a.name}: maliyet $${a.costWeek.toFixed(2)} (önceki $${a.costPrevWeek.toFixed(2)}), ` +
            `${a.sessions} oturum, hata %${errPct}` +
            (a.qualityAvg !== undefined ? `, kalite ${a.qualityAvg.toFixed(1)}/5 (${a.qualityCount} örnek)` : '') + '.');
    }
    const important = f.insights.filter(i => i.severity !== 'info').slice(0, 12);
    for (const i of important) {
        lines.push(`SORUN [${i.severity}] ${i.agentName} (${i.category}): ${i.message}`);
    }
    if (!important.length) { lines.push('SORUN: yok — sağlık bulgusu temiz.'); }
    return lines.join('\n').slice(0, 4000);
}

/** Cheap-model call: three human sentences out of the fact sheet. */
export function generateWeeklySummary(
    cwd: string, judgeArgs: string, factsText: string
): Promise<string> {
    return new Promise(resolve => {
        const p = sanitizePrompt(
            `Sen yerel bir yapay zekâ ajan filosunun asistanısın. Aşağıda filonun haftalık verileri var. ` +
            `Türkçe, EN FAZLA ÜÇ CÜMLELİK, insan diliyle bir durum özeti yaz: (1) maliyet gidişatı, ` +
            `(2) dikkat gerektiren sorunlar (bütçe/hata/nöbet/kalite — yoksa söyleme), (3) tek somut öneri. ` +
            `Rakam yığma; yalnızca önemli olanı söyle. Başlık, madde işareti, selamlama kullanma. ` +
            `VERİLER: ${factsText}`);
        // X-260 — through the seam.
        void execOneShot({ cwd, args: judgeArgs, prompt: p, timeoutMs: 180_000 }).then(r => {
            if (r.error && !r.out) { resolve(''); return; }
            resolve(r.out.replace(/\s+/g, ' ').trim().slice(0, 600));
        });
    });
}
