import { AuditEntry } from './audit';

export interface Agreement {
    compared: number; agreed: number; rate: number;
    /** Kapici's confidence over the compared decisions. */
    confidence: { min: number; median: number; max: number };
    /** The newest few where the two differed. */
    disagreements: { at: string; kapici: string; actual: string; confidence: number }[];
}

/** Per consumer: how often Kapici's decision matched what today's mechanism did (entries newest first). */
export function shadowAgreement(entries: AuditEntry[]): Record<string, Agreement> {
    const by: Record<string, AuditEntry[]> = {};
    for (const e of entries) { if (e.actual !== undefined) { (by[e.consumer] = by[e.consumer] ?? []).push(e); } }
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    return Object.fromEntries(Object.entries(by).map(([c, list]) => {
        const agreed = list.filter(e => e.agreed).length;
        const conf = list.map(e => e.confidence ?? 0).sort((a, b) => a - b);
        return [c, {
            compared: list.length, agreed, rate: r3(agreed / list.length),
            confidence: { min: r3(conf[0]), median: r3(conf[Math.floor((conf.length - 1) / 2)]), max: r3(conf[conf.length - 1]) },
            disagreements: list.filter(e => !e.agreed).slice(0, 5).map(e => ({ at: e.at, kapici: e.decision, actual: e.actual as string, confidence: e.confidence }))
        }];
    }));
}
