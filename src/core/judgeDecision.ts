/**
 * A-27 — WHAT A FAILED CHECK DOES NEXT, and what a run's checks saved. A retry
 * is bought only while it can still help: a FAIL repeating the previous
 * attempt's reason made no progress, and a FAIL-METHOD verdict says the same
 * instructions cannot meet the criteria. Either way the retries left are not
 * paid for — the run's supervisor is woken to replan when its wake is not
 * mechanical, else the step stops failed. Savings are estimates: an unpaid
 * retry is priced at what the attempt it follows cost. Pure.
 */

export type JudgeDecisionKind = 'overturned' | 'upheld' | 'stopped' | 'replan' | 'picked';

export interface JudgeDecision {
    kind: JudgeDecisionKind;
    /** the decision in words, as the output, the row and the run say it */
    line: string;
    /** retries not paid for × this attempt's cost — an estimate */
    savedUSD?: number;
}

export interface RunEconomy {
    climbs: number; overturned: number; stopped: number; replans: number;
    /** media steps whose check picked one of several candidates (src/core/mediaCandidates.ts) */
    picked: number;
    savedUSD: number;
    lines: string[];
}

/** The judge's line says the METHOD is wrong, not only this output. */
export function methodFail(line: string): boolean {
    return /^\s*FAIL[-_ ]?(METHOD|YÖNTEM|YONTEM)\b/i.test(line);
}

const words = (s: string): Set<string> =>
    new Set(s.replace(/^\s*\S+/, '').toLocaleLowerCase('tr').match(/[\p{L}\p{N}]{3,}/gu) ?? []);

/** Two FAIL reasons name the same defect: half or more of their words are shared. */
export function sameFailure(a: string, b: string): boolean {
    const x = words(a), y = words(b);
    if (!x.size || !y.size) { return false; }
    const both = [...x].filter(w => y.has(w)).length;
    return both / new Set([...x, ...y]).size >= 0.5;
}

const usd = (n: number): number => Math.round(Math.max(0, n) * 10000) / 10000;
const retriesWord = (n: number): string => `${n} retr${n === 1 ? 'y' : 'ies'}`;

/** A climbed check's decision: an upper PASS saves the retry a lower FAIL would have bought. */
export function climbDecision(pass: boolean, line: string, retryLeft: boolean, attemptUSD: number): JudgeDecision {
    return pass
        ? { kind: 'overturned', line, ...(retryLeft ? { savedUSD: usd(attemptUSD) } : {}) }
        : { kind: 'upheld', line };
}

export interface FailFacts {
    attempt: number;
    retries: number;
    reason: string;
    /** the previous attempt's FAIL reason, when this attempt is a retry */
    prior?: string;
    /** the run can wake its supervisor here: its wake is not mechanical */
    canWake: boolean;
    /** what this attempt cost — the price of one more */
    attemptUSD: number;
}

/** After a FAIL: retry, or not — and when the retries left are withheld, the decision that says why. */
export function afterFail(f: FailFacts): { go: 'retry' | 'fail'; decision?: JudgeDecision } {
    const left = Math.max(0, f.retries - f.attempt);
    if (!left) { return { go: 'fail' }; }
    const method = methodFail(f.reason);
    const stuck = !method && !!f.prior && sameFailure(f.prior, f.reason);
    if (!method && !stuck) { return { go: 'retry' }; }
    const why = method ? 'the judge says the method is wrong' : `attempt ${f.attempt + 1} failed for the same reason as attempt ${f.attempt}`;
    const savedUSD = usd(left * f.attemptUSD);
    return f.canWake
        ? { go: 'fail', decision: { kind: 'replan', savedUSD, line: `Replan: ${why} — the supervisor is woken to change the plan instead of ${retriesWord(left)} more of the same` } }
        : { go: 'fail', decision: { kind: 'stopped', savedUSD, line: `Stopped: ${why} — ${retriesWord(left)} not paid for; the run's wake is mechanical, so no supervisor is asked` } };
}

/** The run's checks added up; none when nothing was decided. */
export function runEconomy(rows: { judgeDecisions?: JudgeDecision[] }[]): RunEconomy | undefined {
    const all = rows.flatMap(r => r.judgeDecisions ?? []);
    if (!all.length) { return undefined; }
    const n = (k: JudgeDecisionKind) => all.filter(d => d.kind === k).length;
    return {
        climbs: n('overturned') + n('upheld'), overturned: n('overturned'), stopped: n('stopped'), replans: n('replan'), picked: n('picked'),
        savedUSD: usd(all.reduce((a, d) => a + (d.savedUSD ?? 0), 0)),
        lines: all.map(d => d.line).slice(-20)
    };
}

/** The narrowest form, for a status cell: the decision that mattered most, and what it saved. */
export function economyCell(e: RunEconomy): string {
    const word = e.replans ? 'replan' : e.stopped ? 'stopped' : e.picked ? 'picked' : e.overturned ? 'overturned' : 'upheld';
    return `${word}${e.savedUSD > 0 ? ` ~$${e.savedUSD.toFixed(2)}` : ''}`;
}

/** One row's or one run's decisions, short: "1 climb · 1 overturned · ~$0.04 saved". */
export function economyShort(e: RunEconomy): string {
    const saved = e.overturned + e.stopped + e.replans;
    return [
        e.climbs ? `${e.climbs} climb${e.climbs === 1 ? '' : 's'}` : '',
        e.overturned ? `${e.overturned} overturned` : '',
        e.stopped ? `${e.stopped} stopped` : '',
        e.replans ? `${e.replans} replan${e.replans === 1 ? '' : 's'}` : '',
        e.picked ? `${e.picked} picked` : '',
        saved && e.savedUSD > 0 ? `~$${e.savedUSD.toFixed(2)} saved` : ''
    ].filter(Boolean).join(' · ');
}
