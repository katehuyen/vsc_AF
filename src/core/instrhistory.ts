import * as fs from 'fs';
import * as path from 'path';
import { estimateTokens, hashString } from './util';

/**
 * I1 — Instruction versioning + scorecard correlation. Every observed change
 * of an agent's CLAUDE.md is snapshotted into a per-agent JSONL history.
 * Quality scores and daily costs are then segmented by version boundaries so
 * a rule change becomes measurable: "after this version quality went +0.6".
 */

export interface InstrVersion {
    ts: number;
    hash: number;
    size: number;
    tokens: number;
    /** full file content — CLAUDE.md files are small and diffs need it */
    content: string;
}

export class InstructionHistory {
    constructor(private dir: string) {
        try { fs.mkdirSync(dir, { recursive: true }); } catch { /* exists */ }
    }

    private fileFor(agentId: string): string {
        const safe = agentId.replace(/[^a-z0-9]+/gi, '-').slice(-80);
        return path.join(this.dir, `${safe}.jsonl`);
    }

    versions(agentId: string): InstrVersion[] {
        try {
            return fs.readFileSync(this.fileFor(agentId), 'utf8')
                .trim().split('\n')
                .map(l => { try { return JSON.parse(l) as InstrVersion; } catch { return undefined; } })
                .filter((v): v is InstrVersion => !!v)
                .sort((a, b) => a.ts - b.ts);
        } catch { return []; }
    }

    latest(agentId: string): InstrVersion | undefined {
        const all = this.versions(agentId);
        return all[all.length - 1];
    }

    /**
     * Record the current CLAUDE.md if it differs from the last snapshot.
     * Returns the new version, or undefined when nothing changed.
     */
    record(agentId: string, content: string, now = Date.now()): InstrVersion | undefined {
        const hash = hashString(content);
        const last = this.latest(agentId);
        if (last && last.hash === hash) { return undefined; }
        const version: InstrVersion = {
            ts: now, hash, size: content.length,
            tokens: estimateTokens(content), content
        };
        try {
            fs.appendFileSync(this.fileFor(agentId), JSON.stringify(version) + '\n', 'utf8');
        } catch { /* best-effort */ }
        return version;
    }
}

export interface VersionImpact {
    version: InstrVersion;
    /** end of this version's reign (next version ts, or now) */
    until: number;
    days: number;
    qualityAvg?: number;
    qualityCount: number;
    costPerDay?: number;
    sessions: number;
}

/**
 * Segment quality scores and session costs by version boundaries.
 * `dailyCosts` maps YYYY-MM-DD → cost for the agent.
 */
export function correlateVersions(
    versions: InstrVersion[],
    qualityScores: { sessionTs: number; score: number }[],
    sessions: { lastTs: number; cost: number }[],
    now = Date.now()
): VersionImpact[] {
    const impacts: VersionImpact[] = [];
    for (let i = 0; i < versions.length; i++) {
        const from = versions[i].ts;
        const until = i + 1 < versions.length ? versions[i + 1].ts : now;
        const days = Math.max((until - from) / 86400000, 1 / 24);
        const scores = qualityScores.filter(q => q.sessionTs >= from && q.sessionTs < until);
        const span = sessions.filter(s => s.lastTs >= from && s.lastTs < until);
        const cost = span.reduce((a, s) => a + s.cost, 0);
        impacts.push({
            version: versions[i],
            until,
            days,
            qualityAvg: scores.length
                ? scores.reduce((a, q) => a + q.score, 0) / scores.length
                : undefined,
            qualityCount: scores.length,
            costPerDay: span.length ? cost / days : undefined,
            sessions: span.length
        });
    }
    return impacts;
}

/** One-line diff summary between consecutive versions (size/token delta). */
export function describeVersionDelta(prev: InstrVersion | undefined, cur: InstrVersion): string {
    if (!prev) { return `first snapshot (~${cur.tokens} tok)`; }
    const d = cur.tokens - prev.tokens;
    return d === 0 ? 'same size (content changed)' : `${d > 0 ? '+' : ''}${d} tok`;
}

export function buildImpactReport(agentName: string, impacts: VersionImpact[]): string {
    const lines: string[] = [];
    lines.push(`# Instruction history — ${agentName}`);
    lines.push('');
    if (!impacts.length) {
        lines.push('No versions recorded yet — the history starts with the first observed CLAUDE.md change.');
        return lines.join('\n');
    }
    lines.push('| # | From | Size | Δ | Days | Sessions | Quality avg | Cost/day |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (let i = 0; i < impacts.length; i++) {
        const it = impacts[i];
        const prev = i > 0 ? impacts[i - 1] : undefined;
        const qual = it.qualityAvg !== undefined
            ? it.qualityAvg.toFixed(1) + `/5 (${it.qualityCount})` +
              (prev?.qualityAvg !== undefined
                  ? ` ${it.qualityAvg - prev.qualityAvg >= 0 ? '▲' : '▼'}${Math.abs(it.qualityAvg - prev.qualityAvg).toFixed(1)}`
                  : '')
            : '—';
        lines.push(`| v${i + 1} | ${new Date(it.version.ts).toLocaleString()} | ~${it.version.tokens} tok | ` +
            `${describeVersionDelta(prev?.version, it.version)} | ${it.days.toFixed(1)} | ${it.sessions} | ` +
            `${qual} | ${it.costPerDay !== undefined ? '$' + it.costPerDay.toFixed(2) : '—'} |`);
    }
    lines.push('');
    lines.push('_Quality = cheap-judge scores of sessions that ran under that version; ' +
        'cost/day = agent session cost across the version\'s reign._');
    return lines.join('\n');
}
